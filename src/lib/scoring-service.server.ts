import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { scoringInput, scoringCriteria, digest } from "./scoring-input.server";
import {
  validateScoringResult,
  scoringResultSchema,
  type ScoringInput,
  type ScoringView,
} from "./scoring-contract";
import {
  configuredAssessmentProvider,
  assertPreparedScope,
  LocalAssessmentProvider,
  ExternalAssessmentProvider,
} from "./scoring-provider.server";

const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(100);
type Tx = Prisma.TransactionClient;
async function lock(tx: Tx, applicationId: string) {
  await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
  const app = await tx.application.findUnique({ where: { id: applicationId } });
  if (!app?.submittedAt)
    throw new AppError("Отправленная заявка недоступна.", 404);
  return app;
}
function scope(origin: string, scenario: string, provider: string) {
  if (provider === "local" && scenario !== "structured-fields-v1") {
    try {
      assertPreparedScope(origin);
    } catch {
      throw new AppError(
        "Этот результат недоступен для текущего рассмотрения.",
        403,
      );
    }
  }
}
export async function requireCurrentScoring(
  tx: Tx,
  applicationId: string,
  runId: string,
) {
  const run = await tx.scoringRun.findFirst({
    where: { id: runId, applicationId, context: "OFFICIAL" },
    include: {
      application: { select: { origin: true } },
      reviews: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!run?.result || run.status !== "COMPLETED")
    throw new AppError("Анализ недоступен.", 404);
  scope(run.application.origin, run.scenarioVersion, run.provider);
  const input = await scoringInput(tx, applicationId);
  if (digest(input) !== run.inputHash)
    throw new AppError(
      "Материалы или критерии изменились. Запустите анализ заново и сверьте новые основания.",
      409,
    );
  return { run, input, result: validateScoringResult(run.result, input) };
}
export async function scoringView(applicationId: string): Promise<ScoringView> {
  const runs = await db.scoringRun.findMany({
    where: { applicationId, context: "OFFICIAL" },
    orderBy: { createdAt: "desc" },
    include: {
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!runs.length) return { criteria: await scoringCriteria(db), runs: [] };
  const input = await scoringInput(db, applicationId);
  const hash = digest(input);
  const app = await db.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { origin: true },
  });
  return {
    criteria: input.criteria,
    runs: runs.map((r) => {
      let allowed = true;
      try {
        scope(app.origin, r.scenarioVersion, r.provider);
        const ownInput = r.input as unknown as ScoringInput;
        if (digest(ownInput) !== r.inputHash) throw new Error("INPUT_HASH_MISMATCH");
        if (r.result) validateScoringResult(r.result, ownInput);
        for (const review of r.reviews) validateScoringResult(review.result, ownInput, true);
      } catch {
        allowed = false;
      }
      return {
        id: r.id,
        status: allowed ? r.status : "UNAVAILABLE",
        current: allowed && hash === r.inputHash,
        criteriaVersion: r.criteriaVersion,
        criteria: (r.input as unknown as ScoringInput).criteria,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        result:
          allowed && r.result ? scoringResultSchema.parse(r.result) : null,
        reviews: allowed
          ? r.reviews.map((v) => ({
              id: v.id,
              author: v.author.name,
              createdAt: v.createdAt.toISOString(),
              reason: v.reason,
              rejectedEvidenceIds: v.rejectedEvidenceIds,
              result: scoringResultSchema.parse(v.result),
            }))
          : [],
      };
    }),
  };
}

/** Persisted job with a bounded lease. after() starts it; status/retry recovers a lost process. */
export async function processScoringRun(runId: string) {
  const leaseToken = randomUUID();
  const now = new Date();
  const claimed = await db.scoringRun.updateMany({
    where: {
      id: runId,
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: "RUNNING",
      leaseToken,
      leaseUntil: new Date(Date.now() + 60000),
      attempts: { increment: 1 },
      errorCode: null,
    },
  });
  if (!claimed.count) return;
  const run = await db.scoringRun.findUniqueOrThrow({
    where: { id: runId },
    include: { application: { select: { origin: true } }, audit: true },
  });
  try {
    if (configuredAssessmentProvider() !== run.provider)
      throw new Error("PROVIDER_CHANGED");
    const input = run.input as unknown as ScoringInput;
    if (digest(input) !== run.inputHash) throw new Error("INPUT_HASH_MISMATCH");
    scope(run.application.origin, run.scenarioVersion, run.provider);
    let prepared: { inputHash: string; scenarioVersion: string; result: unknown } | null =
      run.context === "AUDIT" || run.provider !== "local" || run.scenarioVersion === "structured-fields-v1"
        ? null
        : await db.scoringFixture.findUnique({
            where: {
              applicationId_inputHash: {
                applicationId: run.applicationId,
                inputHash: run.inputHash,
              },
            },
          });
    if (run.context === "AUDIT") {
      const { preparedTwinResponse } = await import("./twin-service.server");
      prepared = preparedTwinResponse(run);
    } else if (run.auditId || run.variant) throw new Error("INVALID_RUN_CONTEXT");
    if (
      run.provider === "local" &&
      run.scenarioVersion !== "structured-fields-v1" &&
      !prepared
    )
      throw new Error("PREPARED_RESULT_MISSING");
    const provider =
      run.provider === "local"
        ? new LocalAssessmentProvider(run.application.origin, prepared)
        : new ExternalAssessmentProvider();
    const raw = await provider.assess(input, {
      inputHash: run.inputHash,
      scenarioVersion: run.scenarioVersion,
    });
    const result = validateScoringResult(raw, input);
    await db.scoringRun.updateMany({
      where: { id: runId, leaseToken },
      data: {
        status: "COMPLETED",
        result: json(result),
        completedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
      },
    });
  } catch (e) {
    await db.scoringRun.updateMany({
      where: { id: runId, leaseToken },
      data: {
        status: "FAILED",
        errorCode:
          e instanceof Error ? e.message.slice(0, 120) : "PROCESSING_FAILED",
        leaseToken: null,
        leaseUntil: null,
        completedAt: new Date(),
      },
    });
  }
  if (run.auditId) {
    const { finalizeTwin } = await import("./twin-service.server");
    await finalizeTwin(run.auditId);
  }
}
export async function scoringAction(
  type: string,
  b: Record<string, unknown>,
  user: User,
) {
  if (user.role !== "STAFF")
    throw new AppError("Это действие доступно сотруднику комиссии.", 403);
  const applicationId = id.parse(b.applicationId);
  await assertApplication(applicationId, user);
  if (type === "scoring.status") return scoringView(applicationId);
  return db.$transaction(
    async (tx) => {
      const app = await lock(tx, applicationId);
      if (type === "scoring.launch") {
        let provider: "local" | "external";
        try {
          provider = configuredAssessmentProvider();
        } catch {
          throw new AppError(
            "Анализ не удалось запустить. Проверьте настройки обработки.",
            503,
          );
        }
        const input = await scoringInput(tx, applicationId);
        const inputHash = digest(input);
        const prepared =
          provider === "local"
            ? await tx.scoringFixture.findUnique({
                where: {
                  applicationId_inputHash: { applicationId, inputHash },
                },
              })
            : null;
        const scenarioVersion =
          prepared?.scenarioVersion ??
          (provider === "local"
            ? "structured-fields-v1"
            : "external-contract-v1");
        scope(app.origin, scenarioVersion, provider);
        const identity = digest({
          applicationId,
          inputHash,
          provider,
          scenarioVersion,
        });
        const existing = await tx.scoringRun.findUnique({
          where: { identity },
        });
        if (existing) {
          if (existing.status === "FAILED")
            await tx.scoringRun.update({
              where: { id: existing.id },
              data: { status: "QUEUED", completedAt: null },
            });
          return { id: existing.id };
        }
        const run = await tx.scoringRun.create({
          data: {
            applicationId,
            identity,
            inputHash,
            materialVersion: input.materialVersion,
            criteriaVersion: input.criteria.version,
            provider,
            scenarioVersion,
            input: json(input),
            requestedBy: user.id,
          },
        });
        return { id: run.id };
      }
      if (type === "scoring.review") {
        const v = z
          .object({
            runId: id,
            requestKey: z.uuid(),
            baseReviewId: z.string().nullable(),
            reason: z.string().trim().min(15).max(4000),
            rejectedEvidenceIds: z.array(id).max(40),
            result: scoringResultSchema,
          })
          .parse(b);
        const { run, input } = await requireCurrentScoring(
          tx,
          applicationId,
          v.runId,
        );
        const duplicate = await tx.scoringReview.findUnique({
          where: { requestKey: v.requestKey },
        });
        if (duplicate) {
          if (duplicate.runId !== run.id || duplicate.authorId !== user.id)
            throw new AppError("Ключ сохранения уже использован.", 409);
          return { id: duplicate.id };
        }
        if ((run.reviews[0]?.id ?? null) !== v.baseReviewId)
          throw new AppError(
            "Человеческая проверка изменена. Обновите страницу и сверьте интерпретацию; введённое остаётся в форме.",
            409,
          );
        const original = scoringResultSchema.parse(run.result);
        if (
          v.rejectedEvidenceIds.some(
            (id) => !original.evidence.some((e) => e.id === id),
          )
        )
          throw new AppError("Основание не относится к этому анализу.");
        if (v.result.evidence.some((e) => v.rejectedEvidenceIds.includes(e.id)))
          throw new AppError("Отклонённое основание осталось в интерпретации.");
        let result;
        try {
          result = validateScoringResult(v.result, input, true);
          result.recommendation.reason = v.reason;
        } catch {
          throw new AppError(
            "Проверьте основания: оценка требует допустимого источника, а противоречие — двух фрагментов. Без оснований оставьте оценку не установленной.",
          );
        }
        const review = await tx.scoringReview.create({
          data: {
            runId: run.id,
            authorId: user.id,
            requestKey: v.requestKey,
            reason: v.reason,
            result: json(result),
            rejectedEvidenceIds: [...new Set(v.rejectedEvidenceIds)],
          },
        });
        // Existing human assessments remain the single model used by the review map.
        for (const d of result.domains)
          await tx.assessment.create({
            data: {
              applicationId,
              authorId: user.id,
              domain: d.domain,
              level: d.rating?.label ?? "Не рассмотрено",
              sufficiency: d.sufficiency,
              contradiction:
                d.consistency === "Есть противоречие"
                  ? result.contradictions
                      .filter((c) =>
                        c.evidenceIds.some((id) => d.evidenceIds.includes(id)),
                      )
                      .map((c) => c.text)
                      .join("\n")
                  : "",
              interpretation: d.interpretation,
              sourceIds: [
                ...new Set(
                  d.evidenceIds.map(
                    (id) => result.evidence.find((e) => e.id === id)!.sourceId,
                  ),
                ),
              ],
              rubricVersion: input.criteria.rubricVersion,
              materialVersion: input.materialVersion,
              reviewedSnapshot: json({
                applicationVersion: input.applicationVersion,
                scoringRunId: run.id,
                scoringReviewId: review.id,
                inputHash: run.inputHash,
              }),
            },
          });
        return { id: review.id };
      }
      throw new AppError("Действие анализа не найдено.", 404);
    },
    { timeout: 15000 },
  );
}
