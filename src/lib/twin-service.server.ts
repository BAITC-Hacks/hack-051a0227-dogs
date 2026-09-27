import "server-only";
import {
  Prisma,
  type ScoringRun,
  type TwinAudit,
  type User,
} from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import {
  assertPreparedScope,
  configuredAssessmentProvider,
} from "./scoring-provider.server";
import { scoringInput, digest } from "./scoring-input.server";
import {
  prepareTwin,
  publicTwin,
  twinCases,
  type TwinCaseKey,
} from "./twin-cases.server";
import {
  compareTwin,
  twinRulesVersion,
  twinVerdicts,
  type PreparedTwin,
  type TwinAuditView,
  type TwinList,
} from "./twin-contract";
import { scoringResultSchema } from "./scoring-contract";
import { materialContext } from "./review-service.server";

const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(120);
async function access(applicationId: string, user: User) {
  if (user.role !== "STAFF")
    throw new AppError("Проверка доступна сотруднику комиссии.", 403);
  return assertApplication(applicationId, user);
}
function scope(origin: string) {
  try {
    assertPreparedScope(origin);
  } catch {
    throw new AppError(
      "Для этих материалов нет разрешённой контрольной пары.",
      403,
    );
  }
}
function readDefinition(audit: TwinAudit): PreparedTwin {
  if (digest(audit.definition) !== audit.definitionHash)
    throw new AppError("Версии контрольных материалов не подтверждены.", 409);
  return audit.definition as unknown as PreparedTwin;
}
export function preparedTwinResponse(
  run: ScoringRun & { audit: TwinAudit | null },
) {
  if (
    !run.audit ||
    run.audit.applicationId !== run.applicationId ||
    !["A", "B"].includes(run.variant ?? "")
  )
    throw new Error("AUDIT_CONTEXT");
  const pair = readDefinition(run.audit),
    side = run.variant as "A" | "B";
  const variant = pair.variants[side],
    prepared = pair.prepared[side];
  if (
    digest(variant.input) !== variant.inputHash ||
    run.inputHash !== variant.inputHash ||
    prepared.inputHash !== run.inputHash ||
    run.scenarioVersion !== variant.scenarioVersion ||
    run.provider !== variant.provider
  )
    throw new Error("AUDIT_INPUT_UNSUPPORTED");
  return {
    inputHash: prepared.inputHash,
    scenarioVersion: variant.scenarioVersion,
    result: prepared.result,
  };
}
export async function twinList(
  applicationId: string,
  user: User,
): Promise<TwinList> {
  const app = await access(applicationId, user);
  let available: TwinList["available"] = [],
    reason = "";
  try {
    scope(app.origin);
    prepareTwin(await scoringInput(db, applicationId), "style");
    available = twinCases.map(({ key, title, purpose }) => ({
      key,
      title,
      purpose,
    }));
  } catch {
    reason =
      "Для текущих материалов нет проверенной контрольной пары. Произвольное изменение ответа не считается пригодным сравнением.";
  }
  let history: TwinList["history"] = [];
  try {
    scope(app.origin);
    history = (
      await db.twinAudit.findMany({
        where: { applicationId },
        orderBy: { createdAt: "desc" },
      })
    ).map((a) => ({
      id: a.id,
      title: readDefinition(a).title,
      createdAt: a.createdAt.toISOString(),
    }));
  } catch {
    /* No prepared audit data leaves its authorized environment. */
  }
  return { available, reason, history };
}
const includeRuns = {
  runs: { orderBy: { variant: "asc" as const } },
  reviews: {
    orderBy: { createdAt: "desc" as const },
    include: { author: { select: { name: true } } },
  },
};
function compared(audit: TwinAudit & { runs: ScoringRun[] }) {
  const pair = readDefinition(audit);
  const convert = (side: string) => {
    const r = audit.runs.find((r) => r.variant === side);
    if (!r) return undefined;
    const variant = pair.variants[side as "A" | "B"];
    const metadataMatch =
      r.context === "AUDIT" &&
      r.provider === variant.provider &&
      r.criteriaVersion === variant.input.criteria.version &&
      r.scenarioVersion === variant.scenarioVersion &&
      audit.comparisonVersion === variant.rulesVersion;
    const parsed = scoringResultSchema.safeParse(r.result);
    return {
      status: r.status,
      inputHash:
        metadataMatch && digest(r.input) === r.inputHash
          ? r.inputHash
          : "invalid",
      result: parsed.success ? parsed.data : null,
    };
  };
  return compareTwin(pair, convert("A"), convert("B"));
}
export async function finalizeTwin(auditId: string) {
  const audit = await db.twinAudit.findUniqueOrThrow({
    where: { id: auditId },
    include: { runs: true },
  });
  if (
    audit.runs.length !== 2 ||
    audit.runs.some((r) => ["QUEUED", "RUNNING"].includes(r.status))
  )
    return;
  await db.twinAudit.update({
    where: { id: auditId },
    data: { comparison: json(compared(audit)) },
  });
}
export async function twinView(
  applicationId: string,
  auditId: string,
  user: User,
  reader: Prisma.TransactionClient | typeof db = db,
  verifiedOrigin?: string,
): Promise<TwinAuditView> {
  scope(verifiedOrigin ?? (await access(applicationId, user)).origin);
  const audit = await reader.twinAudit.findFirst({
    where: { id: auditId, applicationId },
    include: includeRuns,
  });
  if (!audit) throw new AppError("Проверка недоступна в этой заявке.", 404);
  const comparison = compared(audit),
    definition = publicTwin(readDefinition(audit));
  const runs = audit.runs.map((r) => ({
    id: r.id,
    variant: r.variant!,
    status: r.status,
    inputHash: r.inputHash,
    result: r.result ? scoringResultSchema.parse(r.result) : null,
  }));
  return {
    id: audit.id,
    createdAt: audit.createdAt.toISOString(),
    definition,
    comparison,
    version: digest({ definitionHash: audit.definitionHash, runs, comparison }),
    currentBase:
      digest(await scoringInput(reader, applicationId)) === audit.baseInputHash,
    runs,
    reviews: audit.reviews.map((r) => ({
      id: r.id,
      verdict: r.verdict as keyof typeof twinVerdicts,
      note: r.note,
      author: r.author.name,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
export async function twinAction(
  type: string,
  body: Record<string, unknown>,
  user: User,
) {
  const applicationId = id.parse(body.applicationId),
    app = await access(applicationId, user);
  if (type === "twin.list") return twinList(applicationId, user);
  scope(app.origin);
  if (type === "twin.status")
    return twinView(applicationId, id.parse(body.auditId), user);
  if (type === "twin.preview") {
    const key = z.enum(twinCases.map((c) => c.key)).parse(body.caseKey);
    let pair: PreparedTwin;
    try {
      pair = prepareTwin(await scoringInput(db, applicationId), key);
    } catch {
      throw new AppError(
        "Контрольная пара не соответствует текущим материалам.",
        409,
      );
    }
    return { definition: publicTwin(pair), previewHash: digest(pair) };
  }
  if (type === "twin.launch") {
    const v = z
      .object({
        caseKey: z.enum(twinCases.map((c) => c.key)),
        previewHash: id,
        requestKey: z.uuid(),
      })
      .parse(body);
    if (configuredAssessmentProvider() !== "local")
      throw new AppError(
        "Выбранные условия обработки не поддерживают эту контрольную пару.",
        409,
      );
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
        const existing = await tx.twinAudit.findUnique({
          where: { requestKey: v.requestKey },
        });
        if (existing) {
          if (
            existing.applicationId !== applicationId ||
            existing.requestedBy !== user.id ||
            existing.caseKey !== v.caseKey
          )
            throw new AppError("Ключ запуска уже использован.", 409);
          return { id: existing.id };
        }
        const input = await scoringInput(tx, applicationId);
        let pair: PreparedTwin;
        try {
          pair = prepareTwin(input, v.caseKey as TwinCaseKey);
        } catch {
          throw new AppError(
            "Контрольная пара не соответствует текущим материалам.",
            409,
          );
        }
        if (digest(pair) !== v.previewHash)
          throw new AppError(
            "Материалы изменились. Откройте предпросмотр заново.",
            409,
          );
        const active = await tx.twinAudit.findFirst({
          where: {
            applicationId,
            caseKey: v.caseKey,
            runs: { some: { status: { in: ["QUEUED", "RUNNING"] } } },
          },
        });
        if (active) return { id: active.id };
        const audit = await tx.twinAudit.create({
          data: {
            applicationId,
            caseKey: pair.key,
            caseVersion: pair.version,
            baseInputHash: digest(input),
            definition: json(pair),
            definitionHash: digest(pair),
            comparisonVersion: twinRulesVersion,
            requestKey: v.requestKey,
            requestedBy: user.id,
          },
        });
        for (const side of ["A", "B"] as const) {
          const variant = pair.variants[side];
          await tx.scoringRun.create({
            data: {
              applicationId,
              context: "AUDIT",
              auditId: audit.id,
              variant: side,
              identity: digest({ auditId: audit.id, side }),
              input: json(variant.input),
              inputHash: variant.inputHash,
              materialVersion: variant.input.materialVersion,
              criteriaVersion: variant.input.criteria.version,
              provider: variant.provider,
              scenarioVersion: variant.scenarioVersion,
              requestedBy: user.id,
            },
          });
        }
        return { id: audit.id };
      },
      { timeout: 15000 },
    );
  }
  if (type === "twin.review") {
    const v = z
      .object({
        auditId: id,
        version: id,
        requestKey: z.uuid(),
        baseReviewId: id.nullable(),
        verdict: z.enum(
          Object.keys(twinVerdicts) as [
            keyof typeof twinVerdicts,
            ...(keyof typeof twinVerdicts)[],
          ],
        ),
        note: z.string().trim().min(15).max(5000),
      })
      .parse(body);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TwinAudit" WHERE id=${v.auditId} AND "applicationId"=${applicationId} FOR UPDATE`;
      const view = await twinView(applicationId, v.auditId, user, tx, app.origin);
      const duplicate = await tx.twinReview.findUnique({
        where: { requestKey: v.requestKey },
      });
      if (duplicate) {
        if (duplicate.auditId !== v.auditId || duplicate.authorId !== user.id)
          throw new AppError("Ключ сохранения уже использован.", 409);
        return { id: duplicate.id };
      }
      if (
        view.version !== v.version ||
        (view.reviews[0]?.id ?? null) !== v.baseReviewId ||
        view.runs.some((r) => ["QUEUED", "RUNNING"].includes(r.status))
      )
        throw new AppError(
          "Проверка изменилась или ещё выполняется. Обновите результат; заметка остаётся в форме.",
          409,
        );
      const review = await tx.twinReview.create({
        data: {
          auditId: v.auditId,
          authorId: user.id,
          verdict: v.verdict,
          note: v.note,
          requestKey: v.requestKey,
          viewedVersions: json({
            version: view.version,
            runs: view.runs.map((r) => ({
              id: r.id,
              inputHash: r.inputHash,
              criteriaVersion:
                view.definition.variants[r.variant as "A" | "B"].input.criteria
                  .version,
            })),
            comparisonVersion: twinRulesVersion,
          }),
        },
      });
      if (v.verdict === "UNEXPLAINED") {
        const material = await materialContext(tx, applicationId);
        await tx.reReviewCase.create({ data: {
          applicationId,
          basisKey: `twin-review:${review.id}`,
          kind: "TWIN_QUESTION",
          reason: `В проверке устойчивости осталось необъяснённое расхождение: ${v.note}`,
          sourceIds: [],
          materialVersion: material.version,
          openedBy: user.id,
        } });
      }
      return { id: review.id };
    });
  }
  throw new AppError("Действие проверки не найдено.", 404);
}
