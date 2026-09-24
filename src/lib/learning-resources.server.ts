import "server-only";
import { db } from "./db";
import { AppError } from "./security";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  initialCatalog,
  resourceSchema,
  type ResourceCatalog,
} from "./learning-resources";
export const catalogKey = "learning-resources-v1";
export const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function resourceCatalog(): Promise<ResourceCatalog> {
  const row = await db.setting.findUnique({ where: { key: catalogKey } });
  return row
    ? (row.value as unknown as ResourceCatalog)
    : structuredClone(initialCatalog);
}
export async function saveResource(user: User, b: Record<string, unknown>) {
  if (user.role !== "STAFF")
    throw new AppError("Каталог редактирует уполномоченный сотрудник.", 403);
  const revision = z.number().int().positive().parse(b.revision);
  const value = resourceSchema.parse(b.resource);
  if (value.published && b.verified !== true)
    throw new AppError(
      "Перед публикацией подтвердите проверку источника и описания.",
    );
  if (value.embedding === "YOUTUBE" && b.embedVerified !== true)
    throw new AppError("Подтвердите доступность разрешённого встраивания.");
  await db.setting.upsert({
    where: { key: catalogKey },
    create: { key: catalogKey, value: json(initialCatalog) },
    update: {},
  });
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "Setting" WHERE key=${catalogKey} FOR UPDATE`;
    const c = (
      await tx.setting.findUniqueOrThrow({ where: { key: catalogKey } })
    ).value as unknown as ResourceCatalog;
    if (c.revision !== revision)
      throw new AppError(
        "Каталог изменён. Обновите страницу; введённые поля остаются в форме.",
        409,
      );
    const id =
      b.id === undefined
        ? randomUUID()
        : z.string().min(1).max(100).parse(b.id);
    let record = c.records.find((r) => r.id === id);
    if (b.id && !record) throw new AppError("Материал недоступен.", 404);
    if (!record) {
      if (c.records.length >= 40)
        throw new AppError("В небольшом каталоге уже 40 материалов.");
      record = { id, versions: [] };
      c.records.push(record);
    }
    record.versions.push({
      ...value,
      version: record.versions.length + 1,
      authorId: user.id,
      publishedAt: new Date().toISOString(),
    });
    c.revision++;
    await tx.setting.update({
      where: { key: catalogKey },
      data: { value: json(c) },
    });
    return { id, revision: c.revision };
  });
}
