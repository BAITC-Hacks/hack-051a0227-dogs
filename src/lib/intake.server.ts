import "server-only";
import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./security";
import {
  defaultIntakeRules,
  ruleSchema,
  type IntakeRules,
  type IntakeFields,
  privatePurposes,
} from "./intake-contract";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function intakeRules(
  tx: Prisma.TransactionClient = db,
): Promise<IntakeRules> {
  const s = await tx.setting.findUnique({ where: { key: "admissions-rules" } });
  return s ? ruleSchema.parse(s.value) : defaultIntakeRules;
}
export async function saveIntakeRules(
  user: User,
  raw: unknown,
  expected: string,
) {
  if (user.role !== "STAFF") throw new AppError("Доступно комиссии.", 403);
  const value = ruleSchema.parse(raw);
  if (
    !value.routes.some(
      (r) => r.entryType === "BACHELOR" && !r.programs.length,
    ) ||
    !value.routes.some(
      (r) => r.entryType === "FOUNDATION" && !r.programs.length,
    )
  )
    throw new AppError(
      "Нужны отдельные базовые правила Foundation и бакалавриата.",
    );
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(278419)`;
    const current = await intakeRules(tx);
    if (current.version !== expected || value.version === current.version)
      throw new AppError(
        "Укажи новую версию правил; текущие правила могли измениться.",
        409,
      );
    await tx.setting.create({
      data: {
        key: "admissions-history:" + value.version,
        value: json({ rules: value, authorId: user.id, at: new Date() }),
      },
    });
    await tx.setting.upsert({
      where: { key: "admissions-rules" },
      create: { key: "admissions-rules", value: json(value) },
      update: { value: json(value) },
    });
    return value;
  });
}
export async function validateIntakeMaterials(
  tx: Prisma.TransactionClient,
  appId: string,
  v: IntakeFields,
) {
  const ids = [
    v.education.materialId,
    v.gpa.materialId,
    v.essay.materialId,
    v.english.certificate.materialId,
    ...v.exams.map((e) => e.materialId),
  ].filter(Boolean);
  const materials = await tx.material.findMany({
    where: { applicationId: appId, id: { in: ids } },
  });
  if (
    ids.some(
      (id) =>
        !materials.some(
          (m) => m.id === id && !privatePurposes.includes(m.purpose),
        ),
    )
  )
    throw new AppError("Выберите разрешённый материал своей заявки.", 403);
}
