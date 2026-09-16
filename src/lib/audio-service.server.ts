import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./security";
import {
  activeAudioStatuses,
  audioConsentText,
  audioConsentVersion,
  audioInstructionVersion,
  audioSummarySchema,
  languageTask,
} from "./audio-contract";
import { audioConfig, audioProviderAvailable } from "./audio-provider.server";
import type { LanguageState } from "./types";

type Actor = { id: string; role: string };
export const asJson = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function audioApplication(applicationId: string, actor: Actor) {
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (
    !app ||
    !(app.userId === actor.id || (actor.role === "STAFF" && app.submittedAt))
  )
    throw new AppError("Ответ недоступен.", 404);
  return app;
}
export async function changeAudioConsent(
  applicationId: string,
  actor: Actor,
  granted: boolean,
  revision: number,
) {
  const app = await audioApplication(applicationId, actor);
  if (actor.role !== "CANDIDATE" || app.userId !== actor.id)
    throw new AppError("Согласие изменяет кандидат.", 403);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
    const current = await tx.audioConsent.findUnique({
      where: { applicationId },
    });
    if ((current?.revision ?? 0) !== revision)
      throw new AppError("Согласие изменилось. Обновите страницу.", 409);
    const next = revision + 1;
    await tx.audioConsent.upsert({
      where: { applicationId },
      create: {
        applicationId,
        version: audioConsentVersion,
        revision: next,
        granted,
      },
      update: { version: audioConsentVersion, revision: next, granted },
    });
    await tx.audioConsentEvent.create({
      data: {
        applicationId,
        actorId: actor.id,
        version: audioConsentVersion,
        revision: next,
        granted,
        text: granted
          ? audioConsentText
          : "Отзываю согласие на будущую внешнюю обработку устных ответов.",
      },
    });
    if (!granted)
      await tx.audioJob.updateMany({
        where: {
          applicationId,
          status: { in: [...activeAudioStatuses, "UNAVAILABLE"] },
        },
        data: {
          status: "CANCELLED",
          leaseToken: null,
          leaseUntil: null,
          errorCode: "CONSENT_REVOKED",
        },
      });
    return { revision: next, granted, version: audioConsentVersion };
  });
}
export async function enqueueAudio(
  applicationId: string,
  actor: Actor,
  revision: number,
  options: { mode?: "LIVE" | "TEST" | "LIVE_CHECK"; available?: boolean } = {},
) {
  const app = await audioApplication(applicationId, actor);
  if (actor.role !== "CANDIDATE" || app.userId !== actor.id)
    throw new AppError("Обработку своих ответов запускает кандидат.", 403);
  const config = audioConfig();
  const mode = options.mode ?? "LIVE";
  const available =
    options.available ??
    (audioProviderAvailable() && process.env.AUDIO_WORKER_ENABLED !== "false");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${app.id} FOR UPDATE`;
    const consent = await tx.audioConsent.findUnique({
      where: { applicationId },
    });
    if (!consent?.granted || consent.version !== audioConsentVersion)
      throw new AppError(
        "Подтвердите отдельное согласие на обработку этих ответов в OpenAI.",
        403,
      );
    const check = await tx.languageCheck.findUnique({
      where: { applicationId },
    });
    if (!check || check.revision !== revision)
      throw new AppError(
        "Ответ изменился. Обновите страницу перед обработкой.",
        409,
      );
    const state = check.state as unknown as LanguageState;
    if (!state.oralId || !state.followupId)
      throw new AppError("Сначала отправьте основной ответ и уточнение.");
    const materials = await tx.material.findMany({
      where: {
        id: { in: [state.oralId, state.followupId] },
        applicationId,
        userId: actor.id,
      },
    });
    const oral = materials.find(
      (m) => m.id === state.oralId && m.kind === "oral",
    );
    const followup = materials.find(
      (m) => m.id === state.followupId && m.kind === "followup",
    );
    if (!oral || !followup) throw new AppError("Запись недоступна.", 404);
    const oralHash = createHash("sha256").update(oral.bytes).digest("hex");
    const followupHash = createHash("sha256")
      .update(followup.bytes)
      .digest("hex");
    const identity = createHash("sha256")
      .update(
        JSON.stringify({
          check: check.id,
          oral: [oral.id, oralHash],
          followup: [followup.id, followupHash],
          task: languageTask.version,
          instruction: audioInstructionVersion,
          ...config,
          mode,
        }),
      )
      .digest("hex");
    const existing = await tx.audioJob.findUnique({ where: { identity } });
    if (existing) {
      if (
        existing.status === "COMPLETED" ||
        activeAudioStatuses.includes(existing.status)
      )
        return existing;
      if (existing.attempts >= 3)
        throw new AppError(
          "Лимит повторов этой обработки исчерпан. Оригиналы доступны сотруднику.",
          409,
        );
      return tx.audioJob.update({
        where: { id: existing.id },
        data: {
          status: available ? "QUEUED" : "UNAVAILABLE",
          consentRevision: consent.revision,
          nextRunAt: new Date(),
          errorCode: available ? null : "PROVIDER_UNAVAILABLE",
          leaseToken: null,
          leaseUntil: null,
        },
      });
    }
    const daily = await tx.audioJob.count({
      where: {
        applicationId,
        createdAt: { gte: new Date(Date.now() - 86400000) },
        mode,
      },
    });
    if (daily >= 5)
      throw new AppError(
        "На сегодня достигнут предел обработок. Ответы остаются доступны сотруднику.",
        429,
      );
    return tx.audioJob.create({
      data: {
        applicationId,
        checkId: check.id,
        identity,
        mode,
        oralId: oral.id,
        followupId: followup.id,
        oralHash,
        followupHash,
        taskVersion: languageTask.version,
        taskSnapshot: asJson(languageTask),
        instructionVersion: audioInstructionVersion,
        consentRevision: consent.revision,
        ...config,
        status: available ? "QUEUED" : "UNAVAILABLE",
        errorCode: available ? null : "PROVIDER_UNAVAILABLE",
      },
    });
  });
}
export const audioJobInclude = {
  transcripts: {
    include: { corrections: { orderBy: { version: "desc" as const } } },
  },
  reviews: { orderBy: { createdAt: "desc" as const } },
  calls: {
    select: {
      step: true,
      status: true,
      model: true,
      requestId: true,
      responseId: true,
      usage: true,
      errorCode: true,
      createdAt: true,
      finishedAt: true,
    },
  },
} as const;
export function currentAudioJob(
  job: {
    oralId: string;
    followupId: string;
    taskVersion: string;
    instructionVersion: string;
  },
  state: LanguageState,
) {
  return (
    job.oralId === state.oralId &&
    job.followupId === state.followupId &&
    job.taskVersion === languageTask.version &&
    job.instructionVersion === audioInstructionVersion
  );
}
export async function audioStatus(applicationId: string, actor: Actor) {
  await audioApplication(applicationId, actor);
  const available =
    audioProviderAvailable() && process.env.AUDIO_WORKER_ENABLED !== "false";
  if (!available)
    await db.audioJob.updateMany({
      where: {
        applicationId,
        mode: "LIVE",
        status: { in: activeAudioStatuses },
        OR: [{ leaseToken: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        status: "UNAVAILABLE",
        errorCode: "PROVIDER_UNAVAILABLE",
        leaseToken: null,
        leaseUntil: null,
      },
    });
  const [consent, check, jobs] = await Promise.all([
    db.audioConsent.findUnique({ where: { applicationId } }),
    db.languageCheck.findUnique({ where: { applicationId } }),
    db.audioJob.findMany({
      where: { applicationId, mode: "LIVE" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);
  const state = check?.state as unknown as LanguageState | undefined;
  const current = state
    ? jobs.find((j) => currentAudioJob(j, state))
    : undefined;
  const job = current
    ? await db.audioJob.findUnique({
        where: { id: current.id },
        include: audioJobInclude,
      })
    : null;
  return {
    available,
    consent,
    checkRevision: check?.revision ?? 0,
    job: job
      ? { ...job, reviews: actor.role === "STAFF" ? job.reviews : [] }
      : null,
    history: jobs
      .filter((j) => j.id !== current?.id)
      .map((j) => ({
        id: j.id,
        status: j.status,
        createdAt: j.createdAt,
        current: false,
      })),
  };
}
export async function audioArtifact(id: string, actor: Actor) {
  const job = await db.audioJob.findUnique({
    where: { id },
    include: audioJobInclude,
  });
  if (!job || job.mode !== "LIVE")
    throw new AppError("Обработка недоступна.", 404);
  await audioApplication(job.applicationId, actor);
  const check = await db.languageCheck.findUniqueOrThrow({
    where: { id: job.checkId },
  });
  return {
    ...job,
    reviews: actor.role === "STAFF" ? job.reviews : [],
    current: currentAudioJob(job, check.state as unknown as LanguageState),
  };
}
export async function correctAudio(actor: Actor, raw: unknown) {
  if (actor.role !== "STAFF")
    throw new AppError("Расшифровку уточняет сотрудник.", 403);
  const input = z
    .object({
      transcriptId: z.string(),
      version: z.number().int().min(0),
      text: z.string().trim().min(1).max(16000),
      reason: z.string().trim().min(5).max(2000),
    })
    .parse(raw);
  const transcript = await db.audioTranscript.findUnique({
    where: { id: input.transcriptId },
    include: { job: true },
  });
  if (!transcript) throw new AppError("Расшифровка недоступна.", 404);
  await audioApplication(transcript.job.applicationId, actor);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${transcript.job.applicationId} FOR UPDATE`;
    const check = await tx.languageCheck.findUniqueOrThrow({
      where: { id: transcript.job.checkId },
    });
    if (
      !currentAudioJob(transcript.job, check.state as unknown as LanguageState)
    )
      throw new AppError(
        "Кандидат заменил ответ. Откройте актуальную запись.",
        409,
      );
    const latest = await tx.audioTranscriptCorrection.findFirst({
      where: { transcriptId: transcript.id },
      orderBy: { version: "desc" },
    });
    if ((latest?.version ?? 0) !== input.version)
      throw new AppError("Расшифровка изменилась. Обновите страницу.", 409);
    const correction = await tx.audioTranscriptCorrection.create({
      data: {
        ...input,
        transcriptId: transcript.id,
        authorId: actor.id,
        version: input.version + 1,
      },
    });
    await tx.languageCheck.update({
      where: { id: check.id },
      data: {
        revision: { increment: 1 },
        status: "PENDING_REVIEW",
        result: "Расшифровка уточнена. Требуется заключение сотрудника.",
        reviewerId: null,
        reviewedAt: null,
      },
    });
    await tx.languageVersion.create({
      data: {
        checkId: check.id,
        revision: check.revision + 1,
        authorId: actor.id,
        state: asJson({ response: check.state, correctionId: correction.id }),
      },
    });
    return correction;
  });
}
export async function recordAudioReview(
  tx: Prisma.TransactionClient,
  applicationId: string,
  actorId: string,
  languageRevision: number,
  conclusion: string,
  raw: unknown,
) {
  const input = z
    .object({
      jobId: z.string(),
      rejectedIds: z.array(z.string()).max(20),
      note: z.string().max(3000),
      transcriptVersions: z.record(z.string(), z.number().int().min(0)),
    })
    .parse(raw);
  const job = await tx.audioJob.findFirst({
    where: { id: input.jobId, applicationId, mode: "LIVE" },
    include: {
      transcripts: {
        include: { corrections: { orderBy: { version: "desc" }, take: 1 } },
      },
    },
  });
  const check = await tx.languageCheck.findUniqueOrThrow({
    where: { applicationId },
  });
  if (!job || !currentAudioJob(job, check.state as unknown as LanguageState))
    throw new AppError("Откройте обработку актуальных ответов.", 409);
  if (
    job.transcripts.some(
      (t) =>
        input.transcriptVersions[t.id] !== (t.corrections[0]?.version ?? 0),
    )
  )
    throw new AppError("Расшифровка изменена. Сверьте новую версию.", 409);
  const summary = job.summary ? audioSummarySchema.parse(job.summary) : null;
  const allowed = summary
    ? [
        ...summary.answerSummary.map((p) => p.id),
        ...summary.taskChecks.map((p) => p.requirementId),
        ...summary.pointsForHumanReview.map((p) => p.id),
      ]
    : [];
  if (
    input.rejectedIds.some((id) => !allowed.includes(id)) ||
    (input.rejectedIds.length && input.note.trim().length < 5)
  )
    throw new AppError("Укажите пояснение к отклонённому замечанию.");
  await tx.audioReview.create({
    data: {
      jobId: job.id,
      authorId: actorId,
      languageRevision,
      conclusion,
      note: input.note,
      rejectedIds: [...new Set(input.rejectedIds)],
      transcriptVersions: asJson(input.transcriptVersions),
    },
  });
}
