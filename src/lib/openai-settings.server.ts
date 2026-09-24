import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { Prisma, User } from "@prisma/client";
import { db } from "./db";
import { AppError, hashPassword, tokenHash } from "./security";
import { connectionSettingsSchema, keySchema } from "./openai-policy";
import { localSecrets, type LocalSecretStore } from "./local-secret.server";
import { z } from "zod";

export function localConnectionOrigin() {
  const origin = new URL(process.env.APP_ORIGIN ?? "http://localhost:3000");
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/"
  )
    throw new AppError("Настройки доступны только в локальной установке.", 403);
  return origin;
}
export function checkConnectionRequest(headers: Headers, mutation = false) {
  const origin = localConnectionOrigin();
  if (
    headers.get("host") !== origin.host ||
    (headers.get("x-forwarded-host") &&
      headers.get("x-forwarded-host") !== origin.host)
  )
    throw new AppError("Адрес установки не прошёл проверку.", 403);
  if (
    headers.get("sec-fetch-site") === "cross-site" ||
    (mutation && headers.get("origin") !== origin.origin)
  )
    throw new AppError("Источник запроса не прошёл проверку.", 403);
}
export async function connection() {
  return db.openAIConnection.upsert({
    where: { id: "local" },
    create: {},
    update: {},
  });
}
export async function assertConnectionOwner(
  user: Pick<User, "id" | "role"> | null,
) {
  if (!user) throw new AppError("Войдите в аккаунт владельца.", 401);
  const row = await connection();
  if (user.role !== "STAFF" || row.ownerId !== user.id)
    throw new AppError("Подключением управляет только его владелец.", 403);
  return row;
}
export async function lockConnection(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM "OpenAIConnection" WHERE id='local' FOR UPDATE`;
  return tx.openAIConnection.findUniqueOrThrow({ where: { id: "local" } });
}
export function requireRevision(actual: number, expected: number) {
  if (actual !== expected)
    throw new AppError(
      "Настройки изменились. Обновите страницу перед сохранением.",
      409,
    );
}
export async function connectionView(user: Pick<User, "id" | "role"> | null) {
  const row = await assertConnectionOwner(user);
  const calls = await db.openAICall.findMany({
    where: { connectionId: row.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      task: true,
      model: true,
      status: true,
      chargedMicros: true,
      costBasis: true,
      errorCode: true,
      createdAt: true,
    },
  });
  const totals = await db.openAICall.aggregate({
    _sum: { chargedMicros: true, reservedMicros: true },
  });
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const daily = await db.openAICall.aggregate({
    where: { createdAt: { gte: since } },
    _sum: { chargedMicros: true },
  });
  const held = await db.openAICall.aggregate({
    where: { status: "RESERVED" },
    _sum: { chargedMicros: true },
  });
  return {
    connected: Boolean(row.secretCipher),
    suffix: row.keySuffix,
    revision: row.revision,
    textModel: row.textModel,
    complexModel: row.complexModel,
    transcriptionModel: row.transcriptionModel,
    speechModel: row.speechModel,
    audioEnabled: row.audioEnabled,
    startingMicros: row.startingMicros,
    limitMicros: row.limitMicros,
    reserveMicros: row.reserveMicros,
    dailyMicros: row.dailyMicros,
    parallelLimit: row.parallelLimit,
    catalog: row.catalog as string[] | null,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    checkCode: row.checkCode,
    spentMicros: totals._sum.chargedMicros ?? 0,
    heldMicros: held._sum.chargedMicros ?? 0,
    todayMicros: daily._sum.chargedMicros ?? 0,
    calls: calls.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
  };
}
export type ConnectionView = Awaited<ReturnType<typeof connectionView>>;

export async function saveConnectionSettings(user: User, input: unknown) {
  await assertConnectionOwner(user);
  const { revision, ...data } = connectionSettingsSchema.parse(input);
  await db.$transaction(async (tx) => {
    const row = await lockConnection(tx);
    if (row.ownerId !== user.id) throw new AppError("Нет доступа.", 403);
    requireRevision(row.revision, revision);
    await tx.openAIConnection.update({
      where: { id: row.id },
      data: { ...data, revision: { increment: 1 } },
    });
  });
}
export async function saveConnectionKey(
  user: User,
  raw: unknown,
  revision: number,
  secrets: LocalSecretStore = localSecrets,
) {
  const previous = await assertConnectionOwner(user);
  requireRevision(previous.revision, revision);
  const key = keySchema.parse(raw),
    vaultId = randomUUID();
  let storage: string | undefined;
  try {
    storage = await secrets.create(vaultId);
    const cipher = await secrets.encrypt(vaultId, storage, key);
    await db.$transaction(async (tx) => {
      const row = await lockConnection(tx);
      requireRevision(row.revision, revision);
      if (row.ownerId !== user.id) throw new AppError("Нет доступа.", 403);
      await tx.openAIConnection.update({
        where: { id: row.id },
        data: {
          vaultId,
          secretCipher: cipher,
          secretStorage: storage,
          keySuffix: key.slice(-4),
          catalog: PrismaJsonNull,
          checkCode: null,
          checkedAt: null,
          revision: { increment: 1 },
        },
      });
    });
  } catch (error) {
    if (storage) await secrets.remove(vaultId, storage).catch(() => {});
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Не удалось сохранить ключ в защищённом хранилище.",
      503,
    );
  }
  if (previous.secretStorage)
    await secrets
      .remove(previous.vaultId, previous.secretStorage)
      .catch(() => {});
}
// No key is read during disconnect; deleting ciphertext takes effect even if the OS store is locked.
export async function disconnectConnection(
  user: User,
  revision: number,
  secrets: LocalSecretStore = localSecrets,
) {
  await assertConnectionOwner(user);
  const old = await db.$transaction(async (tx) => {
    const row = await lockConnection(tx);
    requireRevision(row.revision, revision);
    if (row.ownerId !== user.id) throw new AppError("Нет доступа.", 403);
    await tx.openAIConnection.update({
      where: { id: row.id },
      data: {
        secretCipher: null,
        secretStorage: null,
        keySuffix: null,
        catalog: PrismaJsonNull,
        checkCode: null,
        checkedAt: null,
        audioEnabled: false,
        revision: { increment: 1 },
      },
    });
    return row;
  });
  if (old.secretStorage)
    await secrets.remove(old.vaultId, old.secretStorage).catch(() => {});
}

import { Prisma as PrismaRuntime } from "@prisma/client";
const PrismaJsonNull = PrismaRuntime.DbNull;
const bootstrapSchema = z.object({
  email: z
    .email()
    .max(150)
    .transform((s) => s.toLowerCase()),
  name: z.string().trim().min(2).max(80),
  password: z.string().min(12).max(128),
  code: z.string().regex(/^[A-F0-9]{12}$/),
});

export async function deliverOwnerCode(code: string, email: string) {
  if (process.platform !== "darwin")
    throw new AppError(
      "Назначение владельца требует локального окна macOS на компьютере установки.",
      503,
    );
  const text = `AI Leader ID\nНазначение владельца подключения\n${localConnectionOrigin().origin}\nНовый аккаунт: ${email}\n\nКод: ${code}\n\nВведите его только в открытой вами форме. Если вы не начинали настройку, закройте окно. Код действует 3 минуты.`;
  // Native local proof, NOT sent in an HTTP response or written to disk/logs.
  const script = `set confirmation to display dialog ${JSON.stringify(text)} with title "inVision U: владелец подключения" buttons {"Закрыть"} default button "Закрыть" giving up after 180\nif gave up of confirmation then error "expired"`;
  await new Promise<void>((ok, fail) => {
    const child = spawn("/usr/bin/osascript", ["-"], {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const timer = setTimeout(() => {
      child.kill();
      fail(
        new AppError(
          "Время локального подтверждения истекло. Запросите новый код.",
          408,
        ),
      );
    }, 185000);
    child.on("error", () => {
      clearTimeout(timer);
      fail(new AppError("Локальное окно недоступно.", 503));
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (status === 0) ok();
      else
        fail(
          new AppError(
            "Локальное подтверждение не завершено. Проверьте окно на компьютере и запросите новый код.",
            503,
          ),
        );
    });
    child.stdin.on("error", () => {});
    child.stdin.end(script);
  });
}
export async function beginOwnerSetup(
  user: User,
  rawEmail: unknown,
  deliver = deliverOwnerCode,
) {
  localConnectionOrigin();
  if (user.role !== "STAFF")
    throw new AppError("Войдите в раздел сотрудника.", 403);
  const email = z.email().max(150).parse(rawEmail).toLowerCase();
  if (await db.user.findUnique({ where: { email } }))
    throw new AppError(
      "Для владельца нужен новый личный аккаунт, не общий аккаунт комиссии.",
    );
  await connection();
  const code = randomBytes(6).toString("hex").toUpperCase();
  await db.$transaction(async (tx) => {
    const row = await lockConnection(tx);
    if (row.ownerId) throw new AppError("Владелец уже назначен.", 409);
    if (row.pairingUntil && row.pairingUntil > new Date())
      throw new AppError(
        "Код уже открыт на компьютере. Дождитесь истечения трёх минут для нового запроса.",
        429,
      );
    await tx.openAIConnection.update({
      where: { id: row.id },
      data: {
        pairingHash: tokenHash(code),
        pairingActor: user.id,
        pairingEmail: email,
        pairingUntil: new Date(Date.now() + 180000),
        pairingAttempts: 0,
      },
    });
  });
  try {
    await deliver(code, email);
  } catch (e) {
    await db.openAIConnection.updateMany({
      where: { id: "local", pairingHash: tokenHash(code) },
      data: { pairingHash: null, pairingUntil: null },
    });
    throw e;
  }
}
export async function completeOwnerSetup(user: User, input: unknown) {
  const b = bootstrapSchema.parse(input);
  const passwordHash = await hashPassword(b.password);
  const result = await db.$transaction(async (tx) => {
    const row = await lockConnection(tx);
    if (row.ownerId || user.role !== "STAFF") return null;
    await tx.openAIConnection.update({
      where: { id: row.id },
      data: { pairingAttempts: { increment: 1 } },
    });
    if (
      row.pairingActor !== user.id ||
      row.pairingEmail !== b.email ||
      !row.pairingUntil ||
      row.pairingUntil < new Date() ||
      row.pairingAttempts >= 5 ||
      row.pairingHash !== tokenHash(b.code)
    )
      return null;
    if (await tx.user.findUnique({ where: { email: b.email } })) return null;
    const owner = await tx.user.create({
      data: {
        email: b.email,
        name: b.name,
        passwordHash,
        role: "STAFF",
        origin: "CONNECTION_OWNER",
      },
    });
    await tx.openAIConnection.update({
      where: { id: row.id },
      data: {
        ownerId: owner.id,
        pairingHash: null,
        pairingUntil: null,
        pairingActor: null,
        pairingEmail: null,
        revision: { increment: 1 },
      },
    });
    return owner;
  });
  if (!result)
    throw new AppError(
      "Код недействителен, истёк или относится к другому запросу.",
      403,
    );
  return result;
}
