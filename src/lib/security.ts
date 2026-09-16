import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { db } from "./db";
import type { User } from "@prisma/client";
const scrypt = promisify(scryptCallback);
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const original = Buffer.from(hash, "hex");
  return original.length === key.length && timingSafeEqual(original, key);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function actor() {
  const token = (await cookies()).get("leader_session")?.value;
  if (!token) return null;
  const s = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  return s && s.expiresAt > new Date() ? s.user : null;
}
export async function setSession(userId: string) {
  const jar = await cookies();
  const old = jar.get("leader_session")?.value;
  if (old)
    await db.session.deleteMany({ where: { tokenHash: tokenHash(old) } });
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  jar.set("leader_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function guestActor() {
  const current = await actor();
  if (current) return current;
  const guest = await db.user.create({ data: {} });
  await setSession(guest.id);
  return guest;
}
export async function requireUser() {
  const u = await actor();
  if (!u || u.role === "GUEST")
    throw new AppError("Войдите в аккаунт, чтобы продолжить.", 401);
  return u;
}
export async function requireStaff() {
  const u = await requireUser();
  if (u.role !== "STAFF")
    throw new AppError("Это действие доступно сотруднику комиссии.", 403);
  return u;
}
export function isStaff(u: User | null) {
  return u?.role === "STAFF";
}
export async function assertApplication(id: string, u: User) {
  const app = await db.application.findUnique({ where: { id } });
  if (!app || (app.userId !== u.id && !(u.role === "STAFF" && app.submittedAt)))
    throw new AppError("Заявка недоступна.", 404);
  return app;
}
export async function rateLimit(key: string, max = 30, windowMs = 60000) {
  const now = new Date();
  await db.rateLimit.upsert({
    where: { key },
    create: { key, resetAt: new Date(Date.now() + windowMs) },
    update: { count: { increment: 1 } },
  });
  const entry = await db.rateLimit.findUniqueOrThrow({ where: { key } });
  if (entry.resetAt < now) {
    await db.rateLimit.update({
      where: { key },
      data: { count: 1, resetAt: new Date(Date.now() + windowMs) },
    });
    return;
  }
  if (entry.count > max)
    throw new AppError(
      "Слишком много попыток. Подождите минуту и повторите.",
      429,
    );
}
export function checkOrigin(req: Request) {
  const allowed = new Set([
    process.env.APP_ORIGIN ?? "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  if (!allowed.has(req.headers.get("origin") ?? ""))
    throw new AppError(
      "Не удалось проверить источник запроса. Обновите страницу.",
      403,
    );
}
