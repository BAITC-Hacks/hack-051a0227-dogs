import "server-only";
import { randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError, assertApplication } from "./security";
import { digest } from "./scoring-input.server";
import { json } from "./learning-resources.server";
import { deskInput } from "./vision-desk-context.server";
import { prepareDesk, validDeskResult } from "./vision-desk-provider.server";
import {
  deskVersion,
  deskSettingsSchema,
  deskDraftSchema,
  deskConsentSchema,
  type DeskSettings,
  type DeskInput,
  type DeskResult,
} from "./vision-desk-contract";
import { connection } from "./openai-settings.server";
import { estimatedCost, OpenAIError } from "./openai-gateway.server";
import { reviewAction } from "./review-service.server";
import { planSchema } from "./review-contract";
import { saveApplicationMessage } from "./application-messages.server";
const key = "vision-desk-auto-v1";
const id = z.string().min(1).max(100);
export async function deskSettings(): Promise<DeskSettings> {
  const r = await db.setting.findUnique({ where: { key } });
  return r
    ? (r.value as unknown as DeskSettings)
    : {
        provider: "local",
        submitted: false,
        clarification: false,
        interview: false,
        enabledAt: new Date(0).toISOString(),
        staffId: "",
        revision: 0,
      };
}
function staff(user: User) {
  if (user.role !== "STAFF")
    throw new AppError("Vision Desk доступен сотруднику.", 403);
}
async function cost(provider: "local" | "openai") {
  if (provider === "local") return { perOperation: 0, model: null };
  const c = await connection();
  if (!c.secretCipher || !c.deskEnabled)
    throw new AppError(
      "Владелец подключения должен разрешить внешнюю подготовку Vision Desk.",
      403,
    );
  return {
    perOperation: estimatedCost("text", c.textModel, 128000, 500),
    model: c.textModel,
  };
}
export async function enqueueDesk(
  user: User,
  applicationId: string,
  provider: "local" | "openai",
) {
  staff(user);
  await cost(provider);
  const input = await deskInput(user, applicationId, provider);
  if (!input.sources.length)
    throw new AppError("Нет разрешённых фрагментов для подготовки.", 409);
  const identity = digest({
    applicationId,
    hash: input.hash,
    provider,
    version: deskVersion,
    context: "DESK",
  });
  return db.scoringRun.upsert({
    where: { identity },
    update: {},
    create: {
      applicationId,
      context: "DESK",
      identity,
      inputHash: input.hash,
      materialVersion: input.materialVersion,
      criteriaVersion: "not-scoring",
      provider,
      scenarioVersion: deskVersion,
      input: json(input),
      requestedBy: user.id,
    },
  });
}
export async function queueDeskEvent(
  applicationId: string,
  event: "submitted" | "clarification" | "interview",
) {
  const settings = await deskSettings();
  if (!settings[event]) return null;
  const user = await db.user.findUnique({ where: { id: settings.staffId } });
  if (user?.role !== "STAFF") return null;
  // Called only by new committed events, never a scan of old applications.
  try {
    return await enqueueDesk(user, applicationId, settings.provider);
  } catch (error) {
    if (error instanceof AppError || error instanceof OpenAIError) return null;
    throw error;
  }
}
export async function processDesk(runId: string) {
  const token = randomUUID(),
    now = new Date();
  const claimed = await db.scoringRun.updateMany({
    where: {
      id: runId,
      context: "DESK",
      attempts: { lt: 2 },
      OR: [
        { status: "QUEUED" },
        { status: "RUNNING", leaseUntil: { lt: now } },
      ],
    },
    data: {
      status: "RUNNING",
      leaseToken: token,
      leaseUntil: new Date(Date.now() + 90000),
      attempts: { increment: 1 },
      errorCode: null,
    },
  });
  if (!claimed.count) return;
  const run = await db.scoringRun.findUniqueOrThrow({ where: { id: runId } });
  try {
    const user = await db.user.findUnique({ where: { id: run.requestedBy } });
    if (!user || user.role !== "STAFF")
      throw new AppError("Право подготовки отозвано.", 403);
    const input = run.input as unknown as DeskInput;
    const authorize = async () => {
      const currentUser = await db.user.findUnique({ where: { id: user.id } });
      if (currentUser?.role !== "STAFF")
        throw new AppError("Право подготовки отозвано.", 403);
      const current = await deskInput(
        currentUser,
        run.applicationId,
        input.provider,
      );
      if (current.hash !== run.inputHash)
        throw new AppError("Материалы или разрешение изменились.", 409);
      const lease = await db.scoringRun.findUniqueOrThrow({
        where: { id: runId },
      });
      if (lease.leaseToken !== token || lease.status !== "RUNNING")
        throw new AppError("Обработка уже завершена.", 409);
    };
    await authorize();
    const result = validDeskResult(
      await prepareDesk(input, authorize, randomUUID()),
      input,
    );
    await authorize();
    const previous = await db.scoringRun.findFirst({
      where: {
        applicationId: run.applicationId,
        context: "DESK",
        status: "COMPLETED",
        id: { not: run.id },
      },
      orderBy: { createdAt: "desc" },
    });
    if (previous) {
      const old = previous.input as unknown as DeskInput;
      result.changes = input.sources
        .filter(
          (s) =>
            !old.sources.some(
              (p) => p.key === s.key && p.version === s.version,
            ),
        )
        .map((s) => `Новое или изменённое основание: ${s.title}.`);
      if (!result.changes.length)
        result.changes = [
          "Новых текстовых источников нет; обновилось рабочее состояние рассмотрения.",
        ];
    }
    await db.scoringRun.updateMany({
      where: { id: runId, leaseToken: token, status: "RUNNING" },
      data: {
        status: "COMPLETED",
        result: json(result),
        completedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
      },
    });
  } catch (error) {
    await db.scoringRun.updateMany({
      where: { id: runId, leaseToken: token },
      data: {
        status: "FAILED",
        errorCode:
          error instanceof OpenAIError
            ? error.code
            : error instanceof AppError && error.status === 409
              ? "STALE"
              : error instanceof AppError && error.status === 403
                ? "ACCESS"
                : "PREPARATION",
        leaseToken: null,
        leaseUntil: null,
      },
    });
  }
}
async function currentRun(user: User, runId: string) {
  staff(user);
  const run = await db.scoringRun.findFirst({
    where: { id: runId, context: "DESK" },
  });
  if (!run) throw new AppError("Подготовка недоступна.", 404);
  const input = await deskInput(
    user,
    run.applicationId,
    (run.input as unknown as DeskInput).provider,
  );
  if (input.hash !== run.inputHash || run.status !== "COMPLETED" || !run.result)
    throw new AppError(
      "Подготовка устарела или не завершена. Подготовьте актуальную версию.",
      409,
    );
  return {
    run,
    input,
    result: validDeskResult(run.result as unknown as DeskResult, input),
  };
}
export async function deskView(user: User, applicationId: string) {
  staff(user);
  await assertApplication(applicationId, user);
  const runs = await db.scoringRun.findMany({
    where: { applicationId, context: "DESK" },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const result = [];
  for (const run of runs) {
    let current = false,
      visible: DeskResult | null = null;
    try {
      const input = await deskInput(
        user,
        applicationId,
        (run.input as unknown as DeskInput).provider,
      );
      current = input.hash === run.inputHash;
      if (run.result)
        visible = validDeskResult(run.result as unknown as DeskResult, input);
    } catch {
      /* Revoked or deleted sources remove derived content, including historical drafts. */
    }
    result.push({
      id: run.id,
      status: run.status,
      current,
      result: visible,
      createdAt: run.createdAt.toISOString(),
      errorCode: run.errorCode,
      attempts: run.attempts,
    });
  }
  return { runs: result };
}
export type DeskView = Awaited<ReturnType<typeof deskView>>;
export async function deskQueue(user: User) {
  staff(user);
  const config = await deskSettings();
  const c = await connection();
  const runs = await db.scoringRun.findMany({
    where: { context: "DESK" },
    distinct: ["applicationId"],
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      applicationId: true,
      status: true,
      createdAt: true,
      application: { select: { user: { select: { name: true } } } },
    },
  });
  return {
    config,
    externalAllowed: !!c.secretCipher && c.deskEnabled,
    limitMicros: c.limitMicros,
    dailyMicros: c.dailyMicros,
    runs: runs.map((r) => ({
      id: r.id,
      applicationId: r.applicationId,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      name: r.application.user.name,
    })),
  };
}
export async function deskConsent(user: User, b: Record<string, unknown>) {
  const app = await assertApplication(id.parse(b.applicationId), user);
  if (user.role !== "CANDIDATE" || app.userId !== user.id)
    throw new AppError("Разрешение даёт владелец заявки.", 403);
  const granted = z.boolean().parse(b.granted),
    sourceIds = z.array(id).max(30).parse(b.sourceIds),
    revision = z.number().int().nonnegative().parse(b.revision);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
    const current = await tx.application.findUniqueOrThrow({
        where: { id: app.id },
      }),
      old = deskConsentSchema.safeParse(current.deskConsent);
    if ((old.success ? old.data.revision : 0) !== revision)
      throw new AppError("Разрешение изменилось. Обновите страницу.", 409);
    if (
      granted &&
      (!sourceIds.length ||
        (await tx.source.count({
          where: { applicationId: app.id, id: { in: sourceIds } },
        })) !== new Set(sourceIds).size)
    )
      throw new AppError("Выберите доступные источники своей заявки.", 404);
    const value = {
      granted,
      sourceIds: granted ? [...new Set(sourceIds)] : [],
      revision: revision + 1,
      at: new Date().toISOString(),
    };
    await tx.application.update({
      where: { id: app.id },
      data: { deskConsent: json(value), revision: { increment: 1 } },
    });
    await tx.applicationVersion.create({
      data: {
        applicationId: app.id,
        revision: current.revision + 1,
        kind: "DESK_CONSENT",
        snapshot: json({
          purpose:
            "Фактическая сводка и подготовка предметных вопросов OpenAI, без оценок личности",
          ...value,
        }),
      },
    });
    return value;
  });
}
export async function deskAction(
  type: string,
  b: Record<string, unknown>,
  user: User,
) {
  staff(user);
  if (type === "desk.queue") return deskQueue(user);
  if (type === "desk.settings") {
    const cfg = deskSettingsSchema.parse(b.settings);
    await cost(cfg.provider);
    if (b.confirm !== true)
      throw new AppError("Подтвердите операции автоподготовки и общий бюджет.");
    return db.$transaction(async (tx) => {
      await tx.setting.upsert({
        where: { key },
        create: { key, value: json(await deskSettings()) },
        update: {},
      });
      await tx.$queryRaw`SELECT key FROM "Setting" WHERE key=${key} FOR UPDATE`;
      const current = (await tx.setting.findUniqueOrThrow({ where: { key } }))
        .value as unknown as DeskSettings;
      if (current.revision !== b.revision)
        throw new AppError("Настройки изменились. Обновите очередь.", 409);
      const value = {
        ...cfg,
        enabledAt: new Date().toISOString(),
        staffId: user.id,
        revision: current.revision + 1,
      };
      await tx.setting.update({ where: { key }, data: { value: json(value) } });
      return value;
    });
  }
  if (type === "desk.batchPreview" || type === "desk.batch") {
    const ids = [...new Set(z.array(id).min(1).max(5).parse(b.applicationIds))];
    const provider = z.enum(["local", "openai"]).parse(b.provider),
      budget = await cost(provider);
    const inputs = await Promise.all(
      ids.map((applicationId) => deskInput(user, applicationId, provider)),
    );
    const content = {
      ids,
      provider,
      hashes: inputs.map((i) => i.hash),
      model: budget.model,
      estimatedMicros: budget.perOperation * ids.length,
    };
    const signature = digest(content);
    if (type === "desk.batchPreview")
      return { ...content, signature, operations: ids.length };
    if (b.confirm !== true || b.signature !== signature)
      throw new AppError(
        "Состав или версии изменились. Повторите предпросмотр запуска.",
        409,
      );
    return {
      runs: await Promise.all(
        ids.map((applicationId) => enqueueDesk(user, applicationId, provider)),
      ).then((r) => r.map((x) => x.id)),
    };
  }
  if (type === "desk.view") return deskView(user, id.parse(b.applicationId));
  if (type === "desk.prepare")
    return {
      id: (
        await enqueueDesk(
          user,
          id.parse(b.applicationId),
          z.enum(["local", "openai"]).parse(b.provider),
        )
      ).id,
    };
  if (type === "desk.retry") {
    const run = await db.scoringRun.findFirst({
      where: { id: id.parse(b.runId), context: "DESK" },
    });
    if (!run) throw new AppError("Подготовка недоступна.", 404);
    const input = await deskInput(
      user,
      run.applicationId,
      (run.input as unknown as DeskInput).provider,
    );
    if (input.hash !== run.inputHash || run.attempts >= 2)
      throw new AppError(
        "Повтор недоступен: изменились материалы или исчерпаны две попытки.",
        409,
      );
    await db.scoringRun.updateMany({
      where: { id: run.id, status: "FAILED" },
      data: { status: "QUEUED", requestedBy: user.id },
    });
    return { id: run.id };
  }
  if (type === "desk.feedback")
    return (await currentRun(user, id.parse(b.runId))).result.feedback;
  if (type === "desk.preview") {
    const { run, input } = await currentRun(user, id.parse(b.runId));
    const content = deskDraftSchema.parse(b.content);
    const sourceIds =
      content.kind === "QUESTION"
        ? content.sourceIds
        : content.questions.map((q) => q.sourceId);
    if (sourceIds.some((id) => !input.sources.some((s) => s.sourceId === id)))
      throw new AppError("Источник вне разрешённой заявки.", 404);
    if (content.kind === "QUESTION" && input.pending)
      throw new AppError(
        "Сначала дождитесь ответа на опубликованный вопрос.",
        409,
      );
    const hash = digest({
      content,
      recipient: run.applicationId,
      author: user.id,
      input: input.hash,
    });
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ScoringRun" WHERE id=${run.id} FOR UPDATE`;
      await tx.deskAction.updateMany({
        where: { runId: run.id, authorId: user.id, executedAt: null },
        data: { revokedAt: new Date() },
      });
      const proposal = await tx.deskAction.create({
        data: {
          runId: run.id,
          authorId: user.id,
          kind: content.kind,
          content: json(content),
          inputHash: input.hash,
          digest: hash,
          expiresAt: new Date(Date.now() + 5 * 60000),
        },
      });
      return {
        id: proposal.id,
        digest: hash,
        content,
        recipient: input.candidateName,
        expiresAt: proposal.expiresAt.toISOString(),
      };
    });
  }
  if (type === "desk.confirm") {
    const proposal = await db.deskAction.findUnique({
      where: { id: id.parse(b.id) },
    });
    if (!proposal || proposal.authorId !== user.id)
      throw new AppError("Подтверждение недоступно.", 404);
    if (
      b.confirm !== true ||
      proposal.digest !== b.digest ||
      digest(deskDraftSchema.parse(b.content)) !== digest(proposal.content)
    )
      throw new AppError("Изменённый текст требует нового предпросмотра.", 409);
    if (proposal.executedAt) {
      const ownerRun = await db.scoringRun.findUniqueOrThrow({
        where: { id: proposal.runId },
      });
      await assertApplication(ownerRun.applicationId, user);
      return { executed: true };
    }
    const { run, input } = await currentRun(user, proposal.runId);
    if (proposal.inputHash !== input.hash)
      throw new AppError("Версия материалов изменилась.", 409);
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${run.applicationId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "DeskAction" WHERE id=${proposal.id} FOR UPDATE`;
        const p = await tx.deskAction.findUniqueOrThrow({
          where: { id: proposal.id },
        });
        if (p.executedAt) return { executed: true };
        if (p.revokedAt || p.expiresAt < new Date())
          throw new AppError(
            "Подтверждение истекло. Откройте новый предпросмотр.",
            409,
          );
        const freshUser = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        staff(freshUser);
        const fresh = await deskInput(
          freshUser,
          run.applicationId,
          input.provider,
        );
        if (fresh.hash !== p.inputHash)
          throw new AppError("Материалы изменились после предпросмотра.", 409);
        const draft = deskDraftSchema.parse(p.content);
        let result: unknown;
        if (draft.kind === "QUESTION") {
          if (
            fresh.pending ||
            (await tx.message.findFirst({
              where: {
                applicationId: run.applicationId,
                author: { role: "STAFF" },
                body: draft.body,
              },
            }))
          )
            throw new AppError(
              "Вопрос уже опубликован или ожидает ответа.",
              409,
            );
          const message = await saveApplicationMessage(
            tx,
            freshUser,
            run.applicationId,
            draft.body,
          );
          result = { messageId: message.id, executed: true };
        } else {
          const interview = await tx.interview.findFirst({
            where: { applicationId: run.applicationId, status: "SCHEDULED" },
            orderBy: { scheduledAt: "desc" },
          });
          if (!interview)
            throw new AppError(
              "Сначала назначьте встречу через существующий процесс решения.",
              409,
            );
          const plan = planSchema.parse(interview.plan);
          for (const q of draft.questions)
            if (
              !plan.questions.some(
                (p) => p.text === q.text && p.sourceId === q.sourceId,
              )
            )
              plan.questions.push({
                ...q,
                id: `desk-${digest({ text: q.text, source: q.sourceId, section: q.section }).slice(0, 24)}`,
              });
          await reviewAction(
            "interview.plan",
            {
              id: interview.id,
              applicationId: run.applicationId,
              materialVersion: input.materialVersion,
              revision: interview.revision,
              plan,
            },
            freshUser,
            tx,
          );
          result = { href: `/admissions/interviews/${interview.id}` };
        }
        await tx.deskAction.update({
          where: { id: p.id },
          data: { executedAt: new Date(), result: json(result) },
        });
        return result;
      },
      { timeout: 15000 },
    );
  }
  throw new AppError("Инструмент не разрешён.", 404);
}
