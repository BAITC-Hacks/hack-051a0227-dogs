import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { domains } from "./catalog";
import {
  domainReviewSchema,
  planSchema,
  resultSchema,
  feedbackSchema,
  feedbackBody,
  reviewActions,
} from "./review-contract";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const id = z.string().min(1).max(100);
const note = z.string().trim().min(15).max(4000);
type Tx = Prisma.TransactionClient;

/** A version of the actual materials, independent of progress/status and file counts. */
export async function materialContext(tx: Tx, applicationId: string) {
  const [version, sources, language, interviews, episodes, messages] =
    await Promise.all([
      tx.applicationVersion.findFirst({
        where: { applicationId, kind: "SUBMITTED" },
        orderBy: { revision: "desc" },
        select: { id: true, revision: true },
      }),
      tx.source.findMany({
        where: { applicationId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          materialId: true,
          corrections: { orderBy: { id: "asc" }, select: { id: true } },
        },
      }),
      tx.languageCheck.findUnique({
        where: { applicationId },
        select: { revision: true },
      }),
      tx.interview.findMany({
        where: { applicationId, status: "COMPLETED" },
        orderBy: { id: "asc" },
        select: { id: true, result: true, performedAt: true },
      }),
      tx.episode.findMany({
        where: { applicationId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          mergedIntoId: true,
          annotations: { orderBy: { id: "asc" }, select: { id: true } },
        },
      }),
      tx.message.findMany({
        where: { applicationId, author: { role: "CANDIDATE" } },
        orderBy: { id: "asc" },
        select: { id: true },
      }),
    ]);
  const snapshot = {
    version,
    sources,
    language,
    interviews,
    episodes,
    messages,
  };
  return {
    version: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    snapshot,
  };
}
async function locked(tx: Tx, applicationId: string, u: User) {
  await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${applicationId} FOR UPDATE`;
  const a = await tx.application.findUnique({ where: { id: applicationId } });
  if (!a?.submittedAt || u.role !== "STAFF")
    throw new AppError("Заявка недоступна.", 404);
  return a;
}
function current(expected: unknown, actual: string) {
  if (expected !== actual)
    throw new AppError(
      "Материалы изменились. Обновите страницу и сверьте новые сведения. Введённый текст сохранён в форме.",
      409,
    );
}
async function validSources(
  tx: Tx,
  applicationId: string,
  sourceIds: string[],
) {
  const values = [...new Set(sourceIds)];
  if (
    (await tx.source.count({
      where: { applicationId, id: { in: values } },
    })) !== values.length
  )
    throw new AppError("Выберите источники этой заявки.", 404);
  return values;
}
async function rubricVersion(tx: Tx) {
  const setting = await tx.setting.findUnique({ where: { key: "rubric" } });
  const v = setting?.value as { version?: number; guidance?: string } | null;
  if (!v?.version || !v.guidance)
    throw new AppError(
      "Действующие критерии не настроены. Сохраните наблюдение в карте проверки без оценки.",
    );
  return v.version;
}
async function scoringReference(tx: Tx, applicationId: string, runId: unknown) {
  if (!runId) return {};
  const { requireCurrentScoring } = await import("./scoring-service.server");
  const scoring = await requireCurrentScoring(
    tx,
    applicationId,
    id.parse(runId),
  );
  if (!scoring.run.reviews.length)
    throw new AppError("Сначала сохраните человеческую проверку AI-скоринга.");
  return {
    scoringRunId: scoring.run.id,
    scoringReviewId: scoring.run.reviews[0].id,
  };
}
export async function reviewAction(
  type: string,
  b: Record<string, unknown>,
  u: User,
  transaction?: Tx,
): Promise<unknown> {
  if (u.role !== "STAFF")
    throw new AppError("Это действие доступно сотруднику комиссии.", 403);
  let appId = b.applicationId;
  if (type.startsWith("interview.")) {
    const interview = await db.interview.findUnique({
      where: { id: id.parse(b.id) },
    });
    if (!interview) throw new AppError("Интервью недоступно.", 404);
    appId = interview.applicationId;
  }
  const applicationId = id.parse(appId);
  await assertApplication(applicationId, u);
  const execute = async (tx: Tx) => {
    const app = await locked(tx, applicationId, u);
    const context = await materialContext(tx, applicationId);
    if (type === "review.profile")
      return { materialVersion: context.version, snapshot: context.snapshot };
    current(b.materialVersion, context.version);
    const scoringRef = await scoringReference(
      tx,
      applicationId,
      b.scoringRunId,
    );
    if (type === "review.source") {
      const sourceId = id.parse(b.sourceId);
      await validSources(tx, applicationId, [sourceId]);
      const corrections = await tx.correction.findMany({
        where: { sourceId },
        select: { id: true },
      });
      return tx.sourceView.create({
        data: {
          sourceId,
          authorId: u.id,
          correctionIds: corrections.map((c) => c.id),
        },
      });
    }
    if (type === "review.domain") {
      const v = domainReviewSchema.parse(b);
      v.sourceIds = await validSources(tx, applicationId, v.sourceIds);
      if (v.sufficiency === "Достаточно" && !v.sourceIds.length)
        throw new AppError(
          "Укажите основания достаточности. Число файлов не определяет её.",
        );
      if (
        (v.gap !== "NONE" || v.consistency === "Есть противоречие") &&
        !v.question.trim()
      )
        throw new AppError("Добавьте конкретный вопрос для проверки.");
      return tx.domainReview.create({
        data: {
          ...v,
          applicationId,
          authorId: u.id,
          materialVersion: context.version,
          reviewedSnapshot: json(context.snapshot),
        },
      });
    }
    if (type === "review.episode") {
      const sourceId = id.parse(b.sourceId);
      await validSources(tx, applicationId, [sourceId]);
      const source = await tx.source.findUniqueOrThrow({
        where: { id: sourceId },
      });
      const quote = z.string().trim().min(10).max(2000).parse(b.quote);
      if (source.materialId || !source.content.includes(quote))
        throw new AppError(
          "Выберите точный фрагмент текстового источника. Содержание документа не извлечено.",
        );
      const personalAction = note.parse(b.personalAction);
      let episodeId = typeof b.episodeId === "string" ? b.episodeId : "";
      if (episodeId) {
        const ep = await tx.episode.findFirst({
          where: { id: episodeId, applicationId, mergedIntoId: null },
        });
        if (!ep) throw new AppError("Эпизод недоступен.", 404);
      } else {
        const ep = await tx.episode.create({
          data: {
            applicationId,
            title: z.string().trim().min(3).max(160).parse(b.title),
            personalRole: personalAction,
          },
        });
        episodeId = ep.id;
      }
      return tx.episodeAnnotation.create({
        data: { episodeId, sourceId, quote, personalAction, authorId: u.id },
      });
    }
    if (type === "review.merge") {
      const from = id.parse(b.fromId),
        into = id.parse(b.intoId);
      if (from === into) throw new AppError("Выберите два разных эпизода.");
      const episodes = await tx.episode.findMany({
        where: { applicationId, id: { in: [from, into] }, mergedIntoId: null },
      });
      if (episodes.length !== 2)
        throw new AppError("Эпизоды недоступны или уже объединены.", 409);
      const children = await tx.episode.count({
        where: { mergedIntoId: from },
      });
      if (children)
        throw new AppError(
          "Объединяйте дополнительные сведения в уже выбранный основной эпизод.",
        );
      return tx.episode.update({
        where: { id: from },
        data: {
          mergedIntoId: into,
          mergedAt: new Date(),
          mergedBy: u.id,
          mergeReason: note.parse(b.reason),
        },
      });
    }
    if (type === "assessment") {
      const v = z
        .object({
          domain: z.enum(domains),
          level: z.enum([
            "Не рассмотрено",
            "Есть проявление",
            "Устойчивое проявление",
            "Нужно уточнение",
          ]),
          sufficiency: z.enum(["Недостаточно", "Частично", "Достаточно"]),
          contradiction: z.string().max(2000),
          interpretation: note,
          sourceIds: z.array(id).min(1).max(30),
        })
        .parse(b);
      v.sourceIds = await validSources(tx, applicationId, v.sourceIds);
      return tx.assessment.create({
        data: {
          ...v,
          applicationId,
          authorId: u.id,
          rubricVersion: await rubricVersion(tx),
          materialVersion: context.version,
          reviewedSnapshot: json(context.snapshot),
        },
      });
    }
    if (type === "decision") {
      const action = z
        .enum(
          Object.keys(reviewActions) as [
            keyof typeof reviewActions,
            ...(keyof typeof reviewActions)[],
          ],
        )
        .parse(b.action);
      const reason = note.parse(b.reason);
      if (app.revision !== b.revision)
        throw new AppError("Рассмотрение изменилось. Обновите страницу.", 409);
      if (app.stage === "DECIDED" && action !== "REOPEN")
        throw new AppError("Сначала возобновите рассмотрение.");
      if (app.stage !== "DECIDED" && action === "REOPEN")
        throw new AppError("Рассмотрение уже открыто.");
      const toStage = {
        CLARIFICATION: "CLARIFICATION",
        CHECK: "CHECK",
        LANGUAGE: "LANGUAGE",
        INTERVIEW: "INTERVIEW",
        CONTINUE: "REVIEW",
        FINAL_REVIEW: "FINAL_REVIEW",
        REOPEN: "REVIEW",
      }[action];
      if (
        action === "INTERVIEW" &&
        (await tx.interview.findFirst({
          where: { applicationId, status: { not: "COMPLETED" } },
        }))
      )
        throw new AppError(
          "Интервью уже назначено. Откройте актуальную встречу и подготовку.",
          409,
        );
      const scheduledAt =
        action === "INTERVIEW" ? z.coerce.date().parse(b.scheduledAt) : null;
      if (scheduledAt && scheduledAt.getTime() < Date.now() - 60000)
        throw new AppError("Выберите будущее время интервью.");
      const decision = await tx.decision.create({
        data: {
          applicationId,
          authorId: u.id,
          action,
          reason,
          fromStage: app.stage,
          toStage,
          materialVersion: context.version,
          reviewedSnapshot: json({
            ...context.snapshot,
            ...scoringRef,
          }),
        },
      });
      await tx.application.update({
        where: { id: applicationId },
        data: { stage: toStage, revision: { increment: 1 } },
      });
      if (scheduledAt)
        await tx.interview.create({
          data: {
            applicationId,
            scheduledAt,
            notes: json({}),
            plan: json({ questions: [], notes: "" }),
            materialVersion: context.version,
          },
        });
      // Internal reasons are never copied to a public message.
      return decision;
    }
    if (
      type === "interview.plan" ||
      type === "interview.save" ||
      type === "interview.complete"
    ) {
      const interview = await tx.interview.findUniqueOrThrow({
        where: { id: id.parse(b.id) },
      });
      if (interview.revision !== b.revision)
        throw new AppError(
          "Интервью изменено. Обновите страницу; введённое остаётся в форме.",
          409,
        );
      if (type === "interview.save" && b.finish)
        throw new AppError(
          "Отдельно подтвердите состоявшуюся встречу и заполните результаты.",
        );
      const revision = interview.revision + 1;
      if (type === "interview.complete") {
        if (b.confirm !== true)
          throw new AppError(
            "Подтвердите, что встреча действительно состоялась.",
          );
        const result = resultSchema.parse(b.result);
        if (Object.values(result.answers).some((v) => v.length < 3))
          throw new AppError(
            "Зафиксируйте ответ или отметьте, что вопрос не обсуждался, в каждой секции.",
          );
        const performedAt = z.coerce.date().parse(b.performedAt);
        if (
          performedAt.getTime() > Date.now() ||
          performedAt.getTime() < app.submittedAt!.getTime()
        )
          throw new AppError(
            "Дата встречи должна быть после подачи заявки и не в будущем.",
          );
        await tx.interview.update({
          where: { id: interview.id },
          data: {
            status: "COMPLETED",
            result: json(result),
            performedAt,
            completedBy: u.id,
            revision,
            materialVersion: context.version,
          },
        });
        await tx.interviewVersion.create({
          data: {
            interviewId: interview.id,
            revision,
            authorId: u.id,
            kind: "RESULT",
            materialVersion: context.version,
            notes: json({ result, performedAt }),
          },
        });
      } else {
        const plan =
          type === "interview.save"
            ? { questions: [], notes: JSON.stringify(b.notes) }
            : planSchema.parse(b.plan);
        await validSources(
          tx,
          applicationId,
          plan.questions.map((q) => q.sourceId).filter(Boolean),
        );
        for (const q of plan.questions)
          if (q.reviewId) {
            const review = await tx.domainReview.findFirst({
              where: { id: q.reviewId, applicationId },
            });
            if (!review || !review.sourceIds.includes(q.sourceId))
              throw new AppError(
                "Вопрос должен ссылаться на источник отмеченного пробела.",
              );
          }
        for (const q of plan.questions)
          if (q.scoringRunId) {
            const { requireCurrentScoring } =
              await import("./scoring-service.server");
            const scoring = await requireCurrentScoring(
              tx,
              applicationId,
              q.scoringRunId,
            );
            if (
              !scoring.result.questions.some(
                (p) =>
                  p.id === q.scoringQuestionId && p.sourceId === q.sourceId,
              )
            )
              throw new AppError(
                "Вопрос должен сохранять связь с основанием AI-скоринга.",
              );
          }
        await tx.interview.update({
          where: { id: interview.id },
          data: {
            plan: json(plan),
            revision,
            materialVersion: context.version,
          },
        });
        await tx.interviewVersion.create({
          data: {
            interviewId: interview.id,
            revision,
            authorId: u.id,
            kind: "PLAN",
            materialVersion: context.version,
            notes: json(plan),
          },
        });
      }
      return { revision };
    }
    if (type === "feedback.save") {
      const v = feedbackSchema.parse(b);
      v.sourceIds = await validSources(tx, applicationId, v.sourceIds);
      const decision = await tx.decision.findFirst({
        where: { applicationId },
        orderBy: { createdAt: "desc" },
      });
      if (
        decision?.id !== v.decisionId ||
        decision.materialVersion !== context.version
      )
        throw new AppError(
          "Сохраните актуальное решение по этим материалам перед подготовкой сообщения.",
          409,
        );
      return tx.feedbackPublication.create({
        data: {
          ...v,
          applicationId,
          authorId: u.id,
          materialVersion: context.version,
          reviewedSnapshot: json({
            ...context.snapshot,
            ...(await scoringReference(
              tx,
              applicationId,
              b.scoringRunId ??
                (decision.reviewedSnapshot as Record<string, unknown> | null)
                  ?.scoringRunId,
            )),
          }),
        },
      });
    }
    if (type === "feedback.preview" || type === "feedback.publish") {
      const feedback = await tx.feedbackPublication.findFirst({
        where: { id: id.parse(b.id), applicationId },
        include: { decision: true },
      });
      if (!feedback) throw new AppError("Сообщение недоступно.", 404);
      if (feedback.publishedAt) return { published: true, id: feedback.id };
      current(feedback.materialVersion, context.version);
      const savedRef = (feedback.reviewedSnapshot ?? {}) as Record<
        string,
        unknown
      >;
      const currentRef = await scoringReference(
        tx,
        applicationId,
        savedRef.scoringRunId,
      );
      if (
        savedRef.scoringRunId &&
        currentRef.scoringReviewId !== savedRef.scoringReviewId
      )
        throw new AppError(
          "Человеческая интерпретация изменена. Подготовьте и проверьте новое сообщение.",
          409,
        );
      const latest = await tx.decision.findFirst({
        where: { applicationId },
        orderBy: { createdAt: "desc" },
      });
      if (latest?.id !== feedback.decisionId)
        throw new AppError(
          "Решение изменилось. Подготовьте сообщение заново.",
          409,
        );
      const body = feedbackBody(feedback);
      if (type === "feedback.preview") {
        await tx.feedbackPublication.update({
          where: { id: feedback.id },
          data: { previewedBy: u.id, previewedAt: new Date() },
        });
        const sources = await tx.source.findMany({
          where: { id: { in: feedback.sourceIds }, applicationId },
          select: { id: true, title: true, kind: true },
        });
        return { id: feedback.id, body, sources };
      }
      if (
        b.confirm !== true ||
        feedback.previewedBy !== u.id ||
        !feedback.previewedAt
      )
        throw new AppError(
          "Откройте предпросмотр и отдельно подтвердите публикацию.",
        );
      const message = await tx.message.create({
        data: { applicationId, authorId: u.id, kind: "FEEDBACK", body },
      });
      await tx.feedbackPublication.update({
        where: { id: feedback.id },
        data: {
          publishedBy: u.id,
          publishedAt: new Date(),
          messageId: message.id,
        },
      });
      return { published: true, id: feedback.id };
    }
    throw new AppError("Действие не найдено.", 404);
  };
  return transaction ? execute(transaction) : db.$transaction(execute);
}
