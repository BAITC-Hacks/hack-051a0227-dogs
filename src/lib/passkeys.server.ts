import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { db } from "./db";
import {
  AppError,
  rateLimit,
  setSession,
  tokenHash,
  verifyPassword,
} from "./security";
import { accessFor, permittedReturnTo } from "./access.server";

const cookieName = "leader_webauthn";
function rp() {
  const configured = process.env.APP_ORIGIN ?? "http://localhost:3000";
  const url = new URL(configured);
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new AppError(
      "Настройка адреса для входа с устройства недоступна.",
      503,
    );
  return { origin: url.origin, id: url.hostname };
}
async function challengeCookie(id: string) {
  (await cookies()).set(cookieName, id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 300,
  });
}
async function takeChallenge(purpose: "REGISTER" | "LOGIN", userId?: string) {
  const jar = await cookies();
  const id = jar.get(cookieName)?.value;
  jar.delete(cookieName);
  if (!id) throw new AppError("Время входа истекло. Повторите действие.", 409);
  const row = await db.webAuthnChallenge.findUnique({ where: { id } });
  if (
    !row ||
    row.purpose !== purpose ||
    row.expiresAt <= new Date() ||
    row.userId !== (userId ?? null)
  )
    throw new AppError("Время входа истекло. Повторите действие.", 409);
  if (purpose === "REGISTER") {
    const session = jar.get("leader_session")?.value;
    if (!session || row.sessionHash !== tokenHash(session))
      throw new AppError("Сессия изменилась. Повторите действие.", 409);
  }
  const consumed = await db.webAuthnChallenge.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (!consumed.count) throw new AppError("Этот запрос уже использован.", 409);
  return row.challenge;
}

export async function passkeyAction(
  type: string,
  body: Record<string, unknown>,
  user: User | null,
) {
  if (type === "passkey.register.begin") {
    if (!user || user.role === "GUEST")
      throw new AppError("Войдите в аккаунт.", 401);
    const password = z.string().min(1).max(128).parse(body.password);
    if (
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    )
      throw new AppError("Пароль не совпадает.", 401);
    await rateLimit(`passkey:register:${user.id}`, 8, 300000);
    const { id } = rp();
    const existing = await db.passkey.findMany({ where: { userId: user.id } });
    const options = await generateRegistrationOptions({
      rpName: "inVision U",
      rpID: id,
      userName: user.email ?? user.id,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existing.map((k) => ({
        id: k.credentialId,
        transports: k.transports,
      })),
    });
    const session = (await cookies()).get("leader_session")?.value;
    if (!session) throw new AppError("Сессия закончилась.", 401);
    const challengeId = randomUUID();
    await db.webAuthnChallenge.create({
      data: {
        id: challengeId,
        challenge: options.challenge,
        purpose: "REGISTER",
        userId: user.id,
        sessionHash: tokenHash(session),
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    await challengeCookie(challengeId);
    return options;
  }
  if (type === "passkey.register.finish") {
    if (!user || user.role === "GUEST")
      throw new AppError("Войдите в аккаунт.", 401);
    const challenge = await takeChallenge("REGISTER", user.id);
    const name = z.string().trim().min(2).max(80).parse(body.name);
    const response = body.response as RegistrationResponseJSON;
    if (!response || typeof response.id !== "string")
      throw new AppError("Не удалось проверить ключ.", 400);
    const { origin, id } = rp();
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: id,
        requireUserVerification: true,
      });
    } catch {
      throw new AppError("Не удалось проверить ключ. Попробуйте снова.", 400);
    }
    if (!verified.verified)
      throw new AppError("Не удалось проверить ключ.", 400);
    const { credential, credentialDeviceType, credentialBackedUp } =
      verified.registrationInfo;
    try {
      await db.passkey.create({
        data: {
          credentialId: credential.id,
          userId: user.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transports: response.response.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new AppError("Этот ключ уже добавлен.", 409);
      throw e;
    }
    return { added: true };
  }
  if (type === "passkey.login.begin") {
    await rateLimit("passkey:login", 45, 300000);
    const { id } = rp();
    const options = await generateAuthenticationOptions({
      rpID: id,
      userVerification: "required",
      timeout: 60000,
    });
    const challengeId = randomUUID();
    await db.webAuthnChallenge.create({
      data: {
        id: challengeId,
        challenge: options.challenge,
        purpose: "LOGIN",
        expiresAt: new Date(Date.now() + 300000),
      },
    });
    await challengeCookie(challengeId);
    return options;
  }
  if (type === "passkey.login.finish") {
    const challenge = await takeChallenge("LOGIN");
    const response = body.response as AuthenticationResponseJSON;
    const passkey = response?.id
      ? await db.passkey.findUnique({
          where: { credentialId: response.id },
          include: { user: true },
        })
      : null;
    if (!passkey || passkey.user.role === "GUEST")
      throw new AppError("Не удалось войти с устройства.", 401);
    const { origin, id } = rp();
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: id,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports,
        },
      });
    } catch {
      throw new AppError("Не удалось войти с устройства.", 401);
    }
    if (!verified.verified)
      throw new AppError("Не удалось войти с устройства.", 401);
    const changed = await db.passkey.updateMany({
      where: { credentialId: passkey.credentialId, counter: passkey.counter },
      data: {
        counter: verified.authenticationInfo.newCounter,
        usedAt: new Date(),
        backedUp: verified.authenticationInfo.credentialBackedUp,
      },
    });
    if (!changed.count)
      throw new AppError("Ключ изменился. Повторите вход.", 409);
    await setSession(passkey.userId);
    const space = await accessFor(passkey.user);
    return {
      destination: permittedReturnTo(body.returnTo, space),
      role: passkey.user.role,
    };
  }
  if (!user || user.role === "GUEST")
    throw new AppError("Войдите в аккаунт.", 401);
  if (type === "passkey.list")
    return db.passkey.findMany({
      where: { userId: user.id },
      select: {
        credentialId: true,
        name: true,
        createdAt: true,
        usedAt: true,
        backedUp: true,
      },
      orderBy: { createdAt: "desc" },
    });
  if (type === "passkey.remove") {
    const credentialId = z.string().min(1).max(1024).parse(body.credentialId);
    const own = await db.passkey.findFirst({
      where: { credentialId, userId: user.id },
    });
    if (!own) throw new AppError("Способ входа не найден.", 404);
    const count = await db.passkey.count({ where: { userId: user.id } });
    if (count === 1 && !user.passwordHash)
      throw new AppError("Сначала добавьте другой способ входа.", 409);
    await db.passkey.delete({ where: { credentialId } });
    return { removed: true };
  }
  throw new AppError("Действие не найдено.", 404);
}
