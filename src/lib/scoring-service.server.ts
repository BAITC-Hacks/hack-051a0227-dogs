import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { scoringInput, scoringCriteria, digest } from "./scoring-input.server";
import { collectProfile } from "./profile-context.server";
import {
  validateScoringResult,
  scoringResultSchema,
  type ScoringInput,
  type ScoringView,
} from "./scoring-contract";
import {
  configuredAssessmentProvider,
  assertPreparedScope,
  isolatedAssessmentEnvironment,
  LocalAssessmentProvider,
  ExternalAssessmentProvider,
  factualAssessment,
} from "./scoring-provider.server";
import { connection } from "./openai-settings.server";
import { deskConsentSchema } from "./vision-desk-contract";
import { deskInput } from "./vision-desk-context.server";
import { prepareDesk } from "./vision-desk-provider.server";
import { domains } from "./catalog";

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
      assertPreparedScope(origin, scenario);
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
  const availableSources = new Map(input.sources.map((s) => [s.id, s.version]));
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
        if (digest(ownInput) !== r.inputHash)
          throw new Error("INPUT_HASH_MISMATCH");
        const results = [
          ...(r.result ? [validateScoringResult(r.result, ownInput)] : []),
          ...r.reviews.map((review) =>
            validateScoringResult(review.result, ownInput, true),
          ),
        ];
        if (
          results.some(
            (result) =>
              result.evidence.some(
                (e) => availableSources.get(e.sourceId) !== e.sourceVersion,
              ) ||
              result.recommendation.sourceIds.some(
                (sourceId) => !availableSources.has(sourceId),
              ),
          )
        )
          throw new Error("SOURCE_UNAVAILABLE_OR_CHANGED");
      } catch {
        allowed = false;
      }
      return {
        id: r.id,
        status: allowed ? r.status : "UNAVAILABLE",
        current: allowed && hash === r.inputHash,
        provider: r.provider,
        scenarioVersion: r.scenarioVersion,
        materialVersion: r.materialVersion,
        applicationVersion:
          (r.input as unknown as ScoringInput).applicationVersion,
        sources: allowed
          ? (r.input as unknown as ScoringInput).sources.map((s) => ({
              id: s.id,
              version: s.version,
              title: s.title,
              text: s.text,
              assessable: s.assessable,
              episodeId: s.episodeId,
            }))
          : [],
        criteriaVersion: r.criteriaVersion,
        criteria: (r.input as unknown as ScoringInput).criteria,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        result:
          allowed && r.result ? scoringResultSchema.parse(r.result) : null,
        showcaseScore:
          allowed &&
          hash === r.inputHash &&
          r.status === "COMPLETED" &&
          r.scenarioVersion === "showcase-scoring-v1" &&
          isolatedAssessmentEnvironment() &&
          ["SEED", "QA", "INTAKE_EXAMPLES_20260927", "INTAKE_BROWSER_20260927"].includes(app.origin) &&
          r.showcaseScore !== null &&
          r.showcaseScore >= 0 &&
          r.showcaseScore <= 100 &&
          r.showcaseScoreBasis &&
          r.showcaseScoreEvidenceIds.length > 0 &&
          r.showcaseScoreEvidenceIds.every((id) =>
            (
              r.result as unknown as { evidence?: { id: string }[] }
            )?.evidence?.some((e) => e.id === id),
          )
            ? {
                value: r.showcaseScore,
                maximum: 100 as const,
                basis: r.showcaseScoreBasis,
                evidenceIds: r.showcaseScoreEvidenceIds,
              }
            : null,
        showcaseEnglishScore:
          allowed && hash === r.inputHash && r.status === "COMPLETED" &&
          r.scenarioVersion === "showcase-scoring-v1" && isolatedAssessmentEnvironment() &&
          ["SEED", "QA", "INTAKE_EXAMPLES_20260927", "INTAKE_BROWSER_20260927"].includes(app.origin) &&
          r.showcaseEnglishScore !== null && r.showcaseEnglishScore >= 0 && r.showcaseEnglishScore <= 100
            ? { value: r.showcaseEnglishScore, maximum: 100 as const }
            : null,
        showcaseAxis:
          allowed && hash === r.inputHash && r.status === "COMPLETED" &&
          r.scenarioVersion === "showcase-scoring-v1" && isolatedAssessmentEnvironment() &&
          ["SEED", "QA", "INTAKE_EXAMPLES_20260927", "INTAKE_BROWSER_20260927"].includes(app.origin) && Array.isArray(r.showcaseAxis) &&
          r.showcaseAxis.length === domains.length &&
          r.showcaseAxis.every((entry, index) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
            const point = entry as Record<string, unknown>;
            return point.criterionId === domains[index] &&
              (point.value === 1 || point.value === 2) &&
              point.scaleVersion === "prepared-axis-v1" &&
              typeof point.basis === "string" && point.basis.length > 0 &&
              Array.isArray(point.evidenceIds) &&
              point.evidenceIds.every((id) => typeof id === "string" &&
                (r.result as unknown as { evidence?: { id: string }[] })?.evidence?.some((e) => e.id === id));
          })
            ? r.showcaseAxis as ScoringView["runs"][number]["showcaseAxis"]
            : null,
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
      context: { in: ["OFFICIAL", "AUDIT"] },
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
    if (run.provider === "external" && configuredAssessmentProvider() !== "external")
      throw new Error("PROVIDER_CHANGED");
    const input = run.input as unknown as ScoringInput;
    if (digest(input) !== run.inputHash) throw new Error("INPUT_HASH_MISMATCH");
    scope(run.application.origin, run.scenarioVersion, run.provider);
    let prepared: {
      inputHash: string;
      scenarioVersion: string;
      result: unknown;
    } | null =
      run.context === "AUDIT" ||
      run.provider !== "local" ||
      run.scenarioVersion === "structured-fields-v1"
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
    } else if (run.auditId || run.variant)
      throw new Error("INVALID_RUN_CONTEXT");
    if (
      run.provider === "local" &&
      run.scenarioVersion !== "structured-fields-v1" &&
      !prepared
    )
      throw new Error("PREPARED_RESULT_MISSING");
    const provider =
      run.provider === "local"
        ? new LocalAssessmentProvider(run.application.origin, prepared)
        : new ExternalAssessmentProvider((input, context) =>
            externalFactualAssessment(input, context, run.requestedBy),
          );
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

/** External work remains factual. A domain value is never inferred from prose by this adapter. */
async function externalFactualAssessment(
  input: ScoringInput,
  context: { inputHash: string; scenarioVersion: string },
  requestedBy: string,
) {
  const staff = await db.user.findUnique({ where: { id: requestedBy } });
  if (staff?.role !== "STAFF") throw new Error("STAFF_ACCESS_CHANGED");
  const packet = await deskInput(staff, input.applicationId, "openai");
  if (!packet.sources.length) throw new Error("NO_PERMITTED_SOURCES");
  const authorize = async () => {
    const latestStaff = await db.user.findUnique({ where: { id: requestedBy } });
    if (latestStaff?.role !== "STAFF") throw new Error("STAFF_ACCESS_CHANGED");
    const latest = await scoringInput(db, input.applicationId);
    if (digest(latest) !== context.inputHash)
      throw new Error("SOURCE_VERSION_CHANGED");
    const permitted = await deskInput(latestStaff, input.applicationId, "openai");
    if (permitted.hash !== packet.hash)
      throw new Error("PERMISSION_OR_SOURCE_CHANGED");
  };
  await authorize();
  const prepared = await prepareDesk(packet, authorize, randomUUID());
  await authorize();
  const result = factualAssessment(input);
  const grounds = prepared.grounds.map((ground, index) => {
    const source = input.sources.find(
      (candidate) => candidate.id === ground.sourceId && candidate.text.includes(ground.quote),
    );
    if (!source) throw new Error("UNBOUND_QUOTE");
    return {
      id: `desk-ground-${index}`,
      sourceId: source.id,
      sourceVersion: source.version,
      quote: ground.quote,
      explanation: "Точная цитата из разрешённого источника; смысловое основание проверяет сотрудник.",
    };
  });
  result.summary = prepared.summary;
  result.evidence = grounds;
  result.questions = prepared.questions.slice(0, 5).map((question, index) => ({
    id: `desk-question-${index}`,
    section: question.section,
    sourceId: question.sourceId,
    domain: question.section === "thinking" ? domains[6] : domains[5],
    gap: "Нужен предметный ответ по указанному фрагменту.",
    text: question.text,
  }));
  result.recommendation = {
    action: "CLARIFICATION",
    reason: "Проверьте приведённые фрагменты и при необходимости задайте конкретный вопрос кандидату.",
    sourceIds: grounds.map((ground) => ground.sourceId),
  };
  result.feedback = {
    ...prepared.feedback,
    sourceIds: grounds.map((ground) => ground.sourceId),
  };
  return result;
}

/** A durable watermark skips pre-existing records and schedules only new submit/reply events. */
export async function runScoringQueueOnce() {
  const config = await connection();
  const events = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Application"
    WHERE "submittedAt" IS NOT NULL
      AND "preparationEvent" > "scoringPreparedEvent"
    ORDER BY "updatedAt" ASC LIMIT 2`;
  for (const event of events) {
    await db.$transaction(async (tx) => {
      const app = await lock(tx, event.id);
      if (app.preparationEvent <= app.scoringPreparedEvent) return;
      const consent = deskConsentSchema.safeParse(app.deskConsent);
      const external =
        configuredAssessmentProvider() === "external" &&
        !!config.secretCipher &&
        !!config.deskEnabled &&
        !!config.ownerId &&
        consent.success && consent.data.granted &&
        consent.data.purpose === "INTAKE_FACTS_V1";
      const provider = external ? "external" : "local";
      const input = await scoringInput(tx, app.id);
      const inputHash = digest(input);
      const prior = await tx.scoringRun.findFirst({
        where: { applicationId: app.id, context: "OFFICIAL", status: "COMPLETED", result: { not: Prisma.DbNull } },
        orderBy: { createdAt: "desc" },
        select: { id: true, result: true, inputHash: true },
      });
      if (prior && prior.inputHash !== inputHash) {
        const old = scoringResultSchema.safeParse(prior.result);
        const versions = new Map(input.sources.map((source) => [source.id, source.version]));
        const changed = old.success ? old.data.evidence
          .filter((item) => versions.get(item.sourceId) !== item.sourceVersion)
          .map((item) => item.sourceId) : [];
        if (changed.length) {
          await tx.reReviewCase.upsert({
            where: { basisKey: `unavailable:${prior.id}:${inputHash}` },
            update: {},
            create: {
              applicationId: app.id,
              basisKey: `unavailable:${prior.id}:${inputHash}`,
              kind: "UNAVAILABLE_EVIDENCE",
              reason: "Источник или его версия изменились после анализа. Проверьте основание перед дальнейшим решением.",
              sourceIds: [...new Set(changed)],
              materialVersion: input.materialVersion,
              openedBy: app.userId,
            },
          });
        }
      }
      const scenarioVersion = external
        ? "external-factual-v1"
        : "structured-fields-v1";
      const identity = digest({ applicationId: app.id, inputHash, provider, scenarioVersion });
      await tx.scoringRun.upsert({
        where: { identity },
        update: {},
        create: {
          applicationId: app.id,
          identity,
          inputHash,
          materialVersion: input.materialVersion,
          criteriaVersion: input.criteria.version,
          provider,
          scenarioVersion,
          input: json(input),
          requestedBy: external ? config.ownerId! : app.userId,
        },
      });
      await tx.application.update({
        where: { id: app.id },
        data: { scoringPreparedEvent: app.preparationEvent },
      });
    });
  }
  const queued = await db.scoringRun.findFirst({
    where: {
      context: "OFFICIAL",
      attempts: { lt: 2 },
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseUntil: { lt: new Date() } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (queued) await processScoringRun(queued.id);
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
  if (type === "scoring.evidence") {
    const view = await scoringView(applicationId);
    const run = view.runs.find((r) => r.id === id.parse(b.runId));
    const result = run?.reviews[0]?.result ?? run?.result;
    const evidence = result?.evidence.find(
      (e) => e.id === id.parse(b.evidenceId),
    );
    if (!evidence) throw new AppError("Основание недоступно.", 404);
    const context = await collectProfile(user, { applicationId });
    if (!context.sources.some((s) => s.key === `source:${evidence.sourceId}`))
      throw new AppError("Источник удалён или больше недоступен.", 404);
    return evidence;
  }
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
            "Проверьте основания. Для оценки нужен допустимый источник, для противоречия нужны два фрагмента. Без оснований оставьте оценку не установленной.",
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
