import "server-only";
import {
  Prisma,
  type ProfileAnswer as StoredAnswer,
  type User,
} from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, rateLimit } from "./security";
import { collectProfile, type ProfileContext } from "./profile-context.server";
import {
  configuredProfileProvider,
  validateProfileAnswer,
} from "./profile-provider.server";
import {
  developmentRecommendations,
  developmentView,
  startDevelopment,
  availableRecommendation,
} from "./development.server";
import {
  profileVersion,
  profileTopics,
  candidateTopics,
  staffTopics,
  profileScopeSchema,
  profileAnswerSchema,
  resolveProfileTopic,
  type ProfileScope,
  type ProfileTurnView,
  type ProfileView,
  type DevelopmentRecommendation,
} from "./profile-contract";
import { digest } from "./scoring-input.server";
import { requireCurrentScoring } from "./scoring-service.server";
import { reviewAction, materialContext } from "./review-service.server";
import { journeyAction } from "./journey.server";
import { validateScoringResult } from "./scoring-contract";
import { planSchema } from "./review-contract";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(120);
function readable(row: StoredAnswer, c: ProfileContext) {
  const parsed = profileAnswerSchema.safeParse(row.answer);
  return (
    parsed.success &&
    row.audience === c.audience &&
    parsed.data.dependencies.every((d) =>
      c.sources.some((s) => s.key === d.key && s.version === d.version),
    )
  );
}
function turn(row: StoredAnswer, c: ProfileContext): ProfileTurnView {
  if (!readable(row, c))
    return {
      id: row.id,
      question: "Содержание недоступно",
      createdAt: row.createdAt.toISOString(),
      answer: null,
      stale: true,
      unavailable: true,
    };
  return {
    id: row.id,
    question: (row.request as { question: string }).question,
    createdAt: row.createdAt.toISOString(),
    answer: profileAnswerSchema.parse(row.answer),
    stale: row.inputHash !== c.hash,
    unavailable: false,
  };
}
async function ownAnswer(user: User, c: ProfileContext, answerId: string) {
  const row = await db.profileAnswer.findFirst({
    where: {
      id: answerId,
      userId: user.id,
      audience: c.audience,
      scopeKey: c.scopeKey,
    },
  });
  if (!row || !readable(row, c))
    throw new AppError("Ответ или его основания больше недоступны.", 404);
  return row;
}
export async function profileView(
  user: User,
  scope: ProfileScope,
  c?: ProfileContext,
): Promise<ProfileView> {
  c ??= await collectProfile(user, scope);
  const history = await db.profileAnswer.findMany({
    where: { userId: user.id, audience: c.audience, scopeKey: c.scopeKey },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const developmentContext =
    c.audience === "CANDIDATE" && (scope.attemptId || scope.feedbackId)
      ? await collectProfile(user, {})
      : c;
  const steps = (await developmentView(user, developmentContext)).filter(
    (s) =>
      (!scope.attemptId ||
        !s.recommendation ||
        s.recommendation.attemptId === scope.attemptId) &&
      (!scope.feedbackId ||
        !s.recommendation ||
        s.recommendation.source.key === `publication:${scope.feedbackId}`),
  );
  return {
    audience: c.audience,
    topics: c.audience === "STAFF" ? staffTopics : candidateTopics,
    works: c.works.map((w) => ({
      id: w.id,
      title: w.title,
      revision: w.revision,
    })),
    history: history.map((r) => turn(r, c)),
    recommendations: developmentRecommendations(c).filter(
      (r) =>
        !scope.feedbackId || r.source.key === `publication:${scope.feedbackId}`,
    ),
    steps,
  };
}
export async function profileAction(
  type: string,
  b: Record<string, unknown>,
  user: User,
) {
  const scope = profileScopeSchema.parse(b.scope ?? {});
  const c = await collectProfile(user, scope);
  if (type === "profile.load") return profileView(user, scope, c);
  if (type === "profile.ask") {
    await rateLimit(`profile:${user.id}`, 120);
    const v = z
      .object({
        question: z.string().trim().min(1).max(2000),
        topic: z
          .enum(
            Object.keys(profileTopics) as [
              keyof typeof profileTopics,
              ...(keyof typeof profileTopics)[],
            ],
          )
          .optional(),
        previousId: id.optional(),
        requestKey: z.uuid(),
      })
      .parse(b);
    const previous = v.previousId
      ? await ownAnswer(user, c, v.previousId)
      : null;
    const prior = previous
      ? profileAnswerSchema.parse(previous.answer)
      : undefined;
    const topics = c.audience === "STAFF" ? staffTopics : candidateTopics;
    if (v.topic && !topics.includes(v.topic))
      throw new AppError("Этот вопрос недоступен в вашем режиме.", 403);
    let topic = v.topic ?? resolveProfileTopic(v.question, prior?.topic);
    if (topic && !topics.includes(topic)) topic = null;
    const existing = await db.profileAnswer.findUnique({
      where: { requestKey: v.requestKey },
    });
    if (existing) {
      if (
        existing.userId !== user.id ||
        existing.scopeKey !== c.scopeKey ||
        digest(existing.request) !== digest(v)
      )
        throw new AppError("Ключ запроса уже использован.", 409);
      return turn(existing, c);
    }
    let answer;
    const provider = configuredProfileProvider();
    try {
      answer = validateProfileAnswer(
        await provider.answer(c, { topic, previous: prior }),
        c,
      );
    } catch {
      throw new AppError(
        "Ответ не удалось подтвердить по доступным источникам. Повторите запрос.",
        409,
      );
    }
    // Recheck after processing as well; a future asynchronous provider gets the same boundary.
    const fresh = await collectProfile(user, scope);
    if (fresh.hash !== c.hash)
      throw new AppError(
        "Материалы изменились во время ответа. Повторите вопрос.",
        409,
      );
    let row;
    try {
      row = await db.profileAnswer.create({
        data: {
          userId: user.id,
          applicationId: c.applicationId,
          audience: c.audience,
          scopeKey: c.scopeKey,
          requestKey: v.requestKey,
          request: json(v),
          answer: json(answer),
          inputHash: c.hash,
          provider: provider.id,
          instructionVersion: profileVersion,
        },
      });
    } catch (e) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== "P2002"
      )
        throw e;
      row = await db.profileAnswer.findUniqueOrThrow({
        where: { requestKey: v.requestKey },
      });
      if (
        row.userId !== user.id ||
        row.scopeKey !== c.scopeKey ||
        digest(row.request) !== digest(v)
      )
        throw new AppError("Ключ запроса уже использован.", 409);
    }
    return turn(row, fresh);
  }
  if (type === "profile.source") {
    const row = await ownAnswer(user, c, id.parse(b.answerId));
    const answer = profileAnswerSchema.parse(row.answer);
    const key = id.parse(b.sourceKey);
    if (!answer.dependencies.some((d) => d.key === key))
      throw new AppError("Источник не относится к ответу.", 404);
    const s = c.sources.find((s) => s.key === key);
    if (!s) throw new AppError("Источник недоступен.", 404);
    return s;
  }
  if (type === "profile.perform") {
    const row = await ownAnswer(user, c, id.parse(b.answerId));
    const a = profileAnswerSchema
      .parse(row.answer)
      .actions.find((a) => a.key === b.actionKey);
    if (!a) throw new AppError("Действие недоступно.", 404);
    if (a.kind === "LINK") return { href: a.href };
    if (user.role !== "STAFF" || !c.applicationId)
      throw new AppError("Действие доступно сотруднику.", 403);
    const scoring = await requireCurrentScoring(db, c.applicationId, a.runId!);
    if (a.kind === "FEEDBACK") {
      if (row.inputHash !== c.hash || !scoring.run.reviews.length)
        throw new AppError(
          "Интерпретация изменилась. Обновите объяснение.",
          409,
        );
      return {
        runId: a.runId,
        result: validateScoringResult(
          scoring.run.reviews[0].result,
          scoring.input,
          true,
        ),
      };
    }
    const effective = scoring.run.reviews[0]
      ? validateScoringResult(
          scoring.run.reviews[0].result,
          scoring.input,
          true,
        )
      : scoring.result;
    const q = effective.questions.find(
      (q) => q.id === a.questionId && q.sourceId === a.sourceId,
    );
    if (!q)
      throw new AppError(
        "Вопрос больше не относится к актуальной оценке.",
        409,
      );
    const interview = await db.interview.findFirst({
      where: { applicationId: c.applicationId, status: "SCHEDULED" },
      orderBy: { scheduledAt: "desc" },
    });
    if (!interview)
      throw new AppError(
        "Сначала назначьте интервью в существующем процессе рассмотрения.",
        409,
      );
    const plan = planSchema.safeParse(interview.plan).success
      ? planSchema.parse(interview.plan)
      : { questions: [], notes: "" };
    const href = `/admissions/interviews/${interview.id}`;
    if (
      plan.questions.some(
        (p) =>
          (p.scoringRunId === a.runId && p.scoringQuestionId === q.id) ||
          (p.sourceId === q.sourceId && p.text.trim() === q.text.trim()),
      )
    )
      return { href, alreadyAdded: true };
    if (row.inputHash !== c.hash)
      throw new AppError(
        "Интерпретация или план изменились. Обновите объяснение.",
        409,
      );
    plan.questions.push({
      id: `profile-${scoring.run.id}-${q.id}`,
      text: q.text,
      section: q.section,
      sourceId: q.sourceId,
      scoringRunId: scoring.run.id,
      scoringQuestionId: q.id,
    });
    await reviewAction(
      "interview.plan",
      {
        id: interview.id,
        applicationId: c.applicationId,
        revision: interview.revision,
        materialVersion: (await materialContext(db, c.applicationId)).version,
        plan,
      },
      user,
    );
    return { href, alreadyAdded: false };
  }
  if (type.startsWith("profile.step")) {
    if (user.role === "STAFF")
      throw new AppError("Личный план доступен только кандидату.", 403);
    const all = await collectProfile(user, {});
    if (type === "profile.stepStart") {
      const step = await startDevelopment(user, c, id.parse(b.key));
      return { id: step.id };
    }
    const step = await db.developmentStep.findFirst({
      where: { id: id.parse(b.id), userId: user.id },
    });
    if (!step) throw new AppError("Личный шаг недоступен.", 404);
    const r = step.recommendation as unknown as DevelopmentRecommendation;
    if (!availableRecommendation(r, all))
      throw new AppError("Основание личного шага больше недоступно.", 404);
    if (type === "profile.stepContinue") {
      if (r.kind === "CONTEXT") {
        const next = (await journeyAction("project.context", {
          versionId: r.versionId,
        })) as { id: string; slug: string };
        return { href: `/projects/${next.slug}?attempt=${next.id}` };
      }
      return { href: r.kind === "REVISE" ? r.href : undefined, id: step.id };
    }
    if (type === "profile.stepSave") {
      const v = z
        .object({
          note: z.string().trim().max(4000),
          revision: z.number().int().nonnegative(),
          complete: z.boolean(),
        })
        .parse(b);
      if (v.complete && (r.kind !== "EXPLAIN" || v.note.length < 20))
        throw new AppError(
          "Сохраните конкретное объяснение; выполнение упражнения определяется его результатом.",
        );
      const saved = await db.developmentStep.updateMany({
        where: { id: step.id, userId: user.id, revision: v.revision },
        data: {
          note: v.note,
          revision: { increment: 1 },
          selfCompletedAt: v.complete ? new Date() : null,
        },
      });
      if (!saved.count)
        throw new AppError(
          "Шаг изменён в другой вкладке. Обновите план; введённый текст остаётся в форме.",
          409,
        );
      return { revision: v.revision + 1 };
    }
  }
  throw new AppError("Действие профиля не найдено.", 404);
}
