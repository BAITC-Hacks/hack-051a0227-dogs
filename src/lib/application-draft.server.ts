import "server-only";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./security";
import { fieldsSchema } from "./validation";
import { programFor } from "./catalog";
import { intakeRules, validateIntakeMaterials } from "./intake.server";
import { preflight, ruleSchema } from "./intake-contract";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function saveApplicationDraft(
  u: User,
  b: Record<string, unknown>,
) {
  if (u.role !== "CANDIDATE")
    throw new AppError("Заявку заполняет кандидат.", 403);
  const fields = fieldsSchema.parse(b.fields),
    slug = z.string().parse(b.programSlug),
    revision = z.number().int().min(0).default(0).parse(b.revision);
  const section = z.number().int().min(0).max(5).default(0).parse(b.section),
    field = z.string().max(100).default("").parse(b.field);
  if (!programFor(slug)) throw new AppError("Выберите программу.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`;
    const app = await tx.application.findUnique({ where: { userId: u.id } });
    if (app?.submittedAt)
      throw new AppError(
        "Отправленная версия зафиксирована. Уточнения отправьте в переписке.",
        409,
      );
    // A retry after a lost response acknowledges exactly the already persisted content.
    if (app && app.revision !== revision) {
      if (
        app.revision === revision + 1 &&
        JSON.stringify(app.fields) === JSON.stringify(json(fields)) &&
        app.programSlug === slug
      )
        return { id: app.id, revision: app.revision };
      // JSONB key order is not stable; compare JSON structurally through the database.
      const same = await tx.application.findFirst({
        where: {
          id: app.id,
          revision: revision + 1,
          programSlug: slug,
          fields: { equals: json(fields) },
        },
      });
      if (same) return { id: app.id, revision: app.revision };
      throw new AppError(
        "Заявка изменена в другой вкладке. Текст в этой форме сохранён. Скопируй нужные изменения перед загрузкой новой версии.",
        409,
      );
    }
    if (fields.intake)
      await validateIntakeMaterials(tx, app?.id ?? "", fields.intake);
    const rules = fields.intake ? await intakeRules(tx) : undefined;
    const data = {
      fields: json(fields),
      programSlug: slug,
      revision: revision + 1,
      formSection: section,
      formField: field,
      ...(rules ? { intakeRules: json(rules) } : {}),
    };
    const saved = app
      ? await tx.application.update({ where: { id: app.id }, data })
      : await tx.application.create({ data: { ...data, userId: u.id } });
    await tx.applicationVersion.create({
      data: {
        applicationId: saved.id,
        revision: saved.revision,
        kind: "DRAFT",
        snapshot: json({
          fields,
          programSlug: slug,
          intakeRules: rules,
          essayAnswerVersion: saved.revision,
        }),
      },
    });
    return { id: saved.id, revision: saved.revision };
  });
}
export async function applicationPreflight(u: User) {
  const app = await db.application.findUnique({
    where: { userId: u.id },
    include: {
      materials: {
        select: { id: true, kind: true, purpose: true, name: true },
      },
      language: { select: { status: true } },
    },
  });
  if (!app) throw new AppError("Сначала сохраните заявку.");
  const frozen = ruleSchema.safeParse(app.intakeRules);
  const rules =
    app.submittedAt && frozen.success ? frozen.data : await intakeRules();
  return {
    revision: app.revision,
    rules,
    issues:
      app.submittedAt && !frozen.success
        ? []
        : preflight(
            fieldsSchema.parse(app.fields),
            app.materials,
            rules,
            app.programSlug,
            app.language?.status,
          ),
  };
}
