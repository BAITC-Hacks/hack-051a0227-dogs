import "server-only";
import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, rateLimit } from "./security";
import {
  visionConsentSchema,
  visionRequestSchema,
  visionVersion,
} from "./vision-contract";
import { visionContext } from "./vision-context.server";
import { runVision } from "./vision-provider.server";
import { digest } from "./scoring-input.server";
import { json } from "./learning-resources.server";
import { profileAnswerSchema, profileScopeSchema } from "./profile-contract";
import { OpenAIError } from "./openai-gateway.server";
import { openaiMessages } from "./openai-policy";
export const visionError = (e: unknown) =>
  e instanceof OpenAIError &&
  ["DISCONNECTED", "DISABLED", "ACCESS", "STORAGE"].includes(e.code)
    ? "Диалог сейчас недоступен. Попробуй позже; введённый вопрос остаётся в поле."
    : e instanceof OpenAIError
      ? (openaiMessages[e.code] ?? "Не удалось получить ответ. Повтори запрос.")
      : e instanceof AppError
        ? e.message
        : "Не удалось завершить операцию. Можно повторить.";
export async function visionAsk(
  user: User,
  raw: unknown,
  signal: AbortSignal,
  emit: (type: string, value: unknown) => Promise<void>,
  run = runVision,
  assertSession?: () => Promise<void>,
) {
  const v = visionRequestSchema.parse(raw);
  const c = await visionContext(user, v.scope);
  await rateLimit("vision:" + user.id, 25);
  const prior = v.previousId
    ? await db.profileAnswer.findFirst({
        where: {
          id: v.previousId,
          userId: user.id,
          scopeKey: c.c.scopeKey,
          status: "COMPLETED",
          audience: "CANDIDATE",
        },
      })
    : null;
  let previous: unknown;
  if (prior) {
    const a = profileAnswerSchema.safeParse(prior.answer);
    if (
      a.success &&
      a.data.dependencies.every((d) =>
        c.sources.some((s) => s.key === d.key && s.version === d.version),
      )
    )
      previous = {
        question: (prior.request as { question: string }).question,
        answer: a.data.text,
        claims: a.data.claims,
      };
  }
  const existing = await db.profileAnswer.findUnique({
    where: { requestKey: v.requestKey },
  });
  if (existing) {
    if (existing.userId !== user.id || digest(existing.request) !== digest(v))
      throw new AppError("Запрос недоступен.", 409);
    if (existing.status === "COMPLETED" && existing.inputHash === c.c.hash) {
      await emit("done", { id: existing.id });
      return existing;
    }
    throw new AppError(
      "Этот запрос уже был начат. Для повторной попытки используй новый запрос.",
      409,
    );
  }
  let row;
  try {
    row = await db.profileAnswer.create({
      data: {
        userId: user.id,
        audience: "CANDIDATE",
        scopeKey: c.c.scopeKey,
        requestKey: v.requestKey,
        request: json(v),
        answer: {},
        inputHash: c.c.hash,
        provider: "openai-vision",
        instructionVersion: visionVersion,
        status: "RUNNING",
        metadata: json({
          scope: v.scope,
          contextHash: c.hash,
          consentRevision: c.consentRevision,
        }),
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new AppError("Запрос уже обрабатывается.", 409);
    throw e;
  }
  const authorize = async () => {
    signal.throwIfAborted();
    await assertSession?.();
    const fresh = await visionContext(user, v.scope);
    if (fresh.hash !== c.hash)
      throw new AppError(
        "Работа или разрешение изменились. Повтори вопрос по актуальной версии.",
        409,
      );
  };
  try {
    const result = await run({
      context: c,
      question: v.question,
      previous,
      operation: v.operation,
      requestKey: v.requestKey,
      signal,
      authorize,
      emit,
    });
    await authorize();
    const r = result.proposal;
    const proposal = r
      ? {
          key: r.key,
          title: r.title,
          basis: r.basis,
          completion: r.completion,
          expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
          digest: digest({
            user: user.id,
            answer: row.id,
            context: c.hash,
            key: r.key,
          }),
          applied: false,
        }
      : null;
    const saved = await db.profileAnswer.update({
      where: { id: row.id },
      data: {
        answer: json(result.answer),
        status: "COMPLETED",
        metadata: json({
          scope: v.scope,
          contextHash: c.hash,
          consentRevision: c.consentRevision,
          model: result.model,
          operations: result.operations,
          proposal,
        }),
      },
    });
    await emit("done", { id: saved.id });
    return saved;
  } catch (e) {
    await db.profileAnswer.update({
      where: { id: row.id },
      data: {
        status: signal.aborted ? "CANCELLED" : "FAILED",
        metadata: json({
          scope: v.scope,
          contextHash: c.hash,
          consentRevision: c.consentRevision,
          error: visionError(e),
        }),
      },
    });
    throw e;
  }
}
export async function visionAction(
  type: string,
  b: Record<string, unknown>,
  user: User,
) {
  if (!["CANDIDATE", "GUEST"].includes(user.role))
    throw new AppError("Это личное действие кандидата.", 403);
  if (type === "vision.consent") {
    const granted = z.boolean().parse(b.granted),
      revision = z.number().int().nonnegative().parse(b.revision);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const u = await tx.user.findUniqueOrThrow({ where: { id: user.id } }),
        old = visionConsentSchema.safeParse(u.visionConsent);
      if ((old.success ? old.data.revision : 0) !== revision)
        throw new AppError("Разрешение изменилось. Обнови панель.", 409);
      const consent = {
        granted,
        revision: revision + 1,
        at: new Date().toISOString(),
      };
      await tx.user.update({
        where: { id: user.id },
        data: { visionConsent: json(consent) },
      });
      return consent;
    });
  }
  if (type === "vision.confirmPlan") {
    const row = await db.profileAnswer.findFirst({
      where: {
        id: z.string().parse(b.answerId),
        userId: user.id,
        audience: "CANDIDATE",
        provider: "openai-vision",
        status: "COMPLETED",
      },
    });
    if (!row) throw new AppError("Предложение недоступно.", 404);
    const meta = row.metadata as {
      scope: unknown;
      contextHash: string;
      proposal?: {
        key: string;
        digest: string;
        expiresAt: string;
        applied: boolean;
      };
    };
    const p = meta.proposal;
    if (!p || b.confirm !== true || p.digest !== b.digest || p.key !== b.key)
      throw new AppError("Подтверди точное предложение.", 409);
    const scope = profileScopeSchema.parse(meta.scope),
      c = await visionContext(user, scope);
    if (p.applied) return { saved: true };
    if (meta.contextHash !== c.hash || Date.parse(p.expiresAt) < Date.now())
      throw new AppError(
        "Предложение устарело. Запроси актуальный следующий шаг.",
        409,
      );
    const r = c.recommendations.find((r) => r.key === p.key);
    if (!r) throw new AppError("Рекомендация недоступна.", 404);
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
      const stored = await tx.profileAnswer.findUniqueOrThrow({
        where: { id: row.id },
      });
      if ((stored.metadata as typeof meta).proposal?.applied)
        return { saved: true };
      const fresh = await visionContext(user, scope);
      if (fresh.hash !== c.hash)
        throw new AppError("Материалы изменились.", 409);
      const step = await tx.developmentStep.upsert({
        where: { userId_key: { userId: user.id, key: r.key } },
        update: {},
        create: { userId: user.id, key: r.key, recommendation: json(r) },
      });
      await tx.profileAnswer.update({
        where: { id: row.id },
        data: {
          metadata: json({ ...meta, proposal: { ...p, applied: true } }),
        },
      });
      return { saved: true, id: step.id };
    });
  }
  throw new AppError("Действие Vision недоступно.", 404);
}
