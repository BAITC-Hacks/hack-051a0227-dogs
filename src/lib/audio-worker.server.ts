import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { AudioJob, Prisma } from "@prisma/client";
import { db } from "./db";
import {
  activeAudioStatuses,
  audioConsentVersion,
  audioInstructionVersion,
  languageTask,
  validateAudioSummary,
  type TranscriptInput,
} from "./audio-contract";
import { decodeAudio, AudioError } from "./audio-media.server";
import {
  OpenAIAudioProvider,
  audioProviderAvailable,
  type AudioProvider,
  type ProviderResult,
} from "./audio-provider.server";
import { asJson, currentAudioJob } from "./audio-service.server";
import type { LanguageState } from "./types";

const leaseMs = 90000;
async function eligible(tx: Prisma.TransactionClient, job: AudioJob) {
  const [consent, check, app] = await Promise.all([
    tx.audioConsent.findUnique({ where: { applicationId: job.applicationId } }),
    tx.languageCheck.findUnique({ where: { id: job.checkId } }),
    tx.application.findUnique({
      where: { id: job.applicationId },
      include: { user: { select: { role: true } } },
    }),
  ]);
  if (
    !consent?.granted ||
    consent.version !== audioConsentVersion ||
    consent.revision !== job.consentRevision
  )
    throw new AudioError("CONSENT_REVOKED");
  if (
    !app ||
    app.user.role !== "CANDIDATE" ||
    !check ||
    !currentAudioJob(job, check.state as unknown as LanguageState) ||
    job.instructionVersion !== audioInstructionVersion
  )
    throw new AudioError("SUPERSEDED");
  return app;
}
async function fenced<T>(
  job: AudioJob,
  fn: (tx: Prisma.TransactionClient, fresh: AudioJob) => Promise<T>,
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Application" WHERE id=${job.applicationId} FOR UPDATE`;
    const fresh = await tx.audioJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    if (
      fresh.leaseToken !== job.leaseToken ||
      !fresh.leaseUntil ||
      fresh.leaseUntil.getTime() <= Date.now() ||
      !activeAudioStatuses.includes(fresh.status)
    )
      throw new AudioError("LEASE_LOST");
    await eligible(tx, fresh);
    return fn(tx, fresh);
  });
}
export async function claimAudioJob(
  mode: "LIVE" | "TEST" | "LIVE_CHECK" = "LIVE",
  onlyId?: string,
): Promise<AudioJob | null> {
  const now = new Date();
  const token = randomUUID();
  // Exhausted crashed attempts reach a terminal state even if no worker owns them now.
  await db.audioJob.updateMany({
    where: {
      mode,
      ...(onlyId ? { id: onlyId } : {}),
      attempts: { gte: 3 },
      status: { in: activeAudioStatuses },
      OR: [{ leaseUntil: { lt: now } }, { leaseUntil: null }],
    },
    data: {
      status: "FAILED",
      errorCode: "RETRY_EXHAUSTED",
      leaseToken: null,
      leaseUntil: null,
    },
  });
  const rows = await db.$queryRaw<AudioJob[]>`
    UPDATE "AudioJob" SET "leaseToken"=${token}, "leaseUntil"=${new Date(Date.now() + leaseMs)}, attempts=attempts+1, status='TRANSCRIBING', "updatedAt"=NOW()
    WHERE id=(SELECT id FROM "AudioJob" WHERE mode=${mode} AND (${onlyId ?? null}::text IS NULL OR id=${onlyId ?? null})
      AND attempts<3 AND ((status IN ('QUEUED','RETRY_WAIT') AND "nextRunAt"<=NOW() AND "leaseToken" IS NULL)
      OR (status IN ('TRANSCRIBING','SUMMARIZING') AND "leaseUntil"<NOW()))
      ORDER BY "nextRunAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
  return rows[0] ?? null;
}
async function reserveCall(job: AudioJob, step: string, model: string) {
  return fenced(job, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(117211, 3001)`;
    const limit = Math.min(
      100,
      Math.max(1, Number(process.env.AUDIO_DAILY_REQUEST_LIMIT) || 30),
    );
    const count = await tx.audioProviderCall.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 86400000) },
        job: { mode: job.mode },
      },
    });
    if (count >= limit) throw new AudioError("DAILY_BUDGET");
    return tx.audioProviderCall.create({
      data: { jobId: job.id, step, model },
    });
  });
}
function metadata(result: ProviderResult) {
  return {
    requestId: result.requestId,
    responseId: result.responseId,
    ...(result.usage !== undefined ? { usage: asJson(result.usage) } : {}),
    finishedAt: new Date(),
  };
}
export async function processClaimedAudio(
  job: AudioJob,
  provider: AudioProvider = new OpenAIAudioProvider(),
) {
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void fenced(job, async (tx) => {
      await tx.audioJob.update({
        where: { id: job.id },
        data: { leaseUntil: new Date(Date.now() + leaseMs) },
      });
    }).catch(() => controller.abort());
  }, 10000);
  heartbeat.unref();
  let activeCall: string | null = null;
  try {
    await fenced(job, async () => undefined);
    await db.audioProviderCall.updateMany({
      where: { jobId: job.id, status: "STARTED" },
      data: {
        status: "INTERRUPTED",
        errorCode: "WORKER_RESTART",
        finishedAt: new Date(),
      },
    });
    for (const kind of ["oral", "followup"] as const) {
      if (
        await db.audioTranscript.findUnique({
          where: { jobId_kind: { jobId: job.id, kind } },
        })
      )
        continue;
      const materialId = kind === "oral" ? job.oralId : job.followupId;
      const material = await fenced(job, async (tx) => {
        const app = await tx.application.findUniqueOrThrow({
          where: { id: job.applicationId },
        });
        const file = await tx.material.findFirst({
          where: {
            id: materialId,
            applicationId: app.id,
            userId: app.userId,
            kind,
          },
        });
        if (
          !file ||
          createHash("sha256").update(file.bytes).digest("hex") !==
            (kind === "oral" ? job.oralHash : job.followupHash)
        )
          throw new AudioError("SOURCE_CHANGED");
        return file;
      });
      const decoded = await decodeAudio(
        Buffer.from(material.bytes),
        material.mime,
      );
      const call = await reserveCall(
        job,
        "transcribe:" + kind,
        job.transcriptionModel,
      );
      activeCall = call.id;
      // Recheck permission immediately before dispatch; a sent request cannot be unsent by revocation.
      await fenced(job, async () => undefined);
      const result = await provider.transcribe({
        wav: decoded.wav,
        model: job.transcriptionModel,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(60000),
        ]),
      });
      await db.audioProviderCall.update({
        where: { id: call.id },
        data: metadata(result),
      });
      if (
        typeof result.value !== "string" ||
        !result.value.trim() ||
        result.value.length > 16000
      )
        throw new AudioError("EMPTY_TRANSCRIPT");
      await fenced(job, async (tx) => {
        await tx.audioTranscript.create({
          data: {
            jobId: job.id,
            materialId,
            kind,
            text: result.value as string,
          },
        });
        await tx.audioProviderCall.update({
          where: { id: call.id },
          data: { ...metadata(result), status: "SUCCEEDED" },
        });
      });
      activeCall = null;
    }
    await fenced(job, async (tx) => {
      await tx.audioJob.update({
        where: { id: job.id },
        data: { status: "SUMMARIZING" },
      });
    });
    const sources: TranscriptInput[] = await db.audioTranscript.findMany({
      where: { jobId: job.id },
      select: { id: true, kind: true, text: true, version: true },
    });
    const task = job.taskSnapshot as unknown as typeof languageTask;
    const call = await reserveCall(job, "summary", job.textModel);
    activeCall = call.id;
    await fenced(job, async () => undefined);
    const result = await provider.summarize({
      task,
      sources,
      model: job.textModel,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    });
    await db.audioProviderCall.update({
      where: { id: call.id },
      data: metadata(result),
    });
    let summary;
    try {
      summary = validateAudioSummary(result.value, sources, task);
    } catch {
      throw new AudioError("INVALID_EVIDENCE");
    }
    await fenced(job, async (tx) => {
      await tx.audioJob.update({
        where: { id: job.id },
        data: {
          summary: asJson(summary),
          status: "COMPLETED",
          completedAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
          errorCode: null,
        },
      });
      await tx.audioProviderCall.update({
        where: { id: call.id },
        data: { ...metadata(result), status: "SUCCEEDED" },
      });
    });
    activeCall = null;
  } catch (error) {
    const e =
      error instanceof AudioError
        ? error
        : new AudioError("PROCESSING_ERROR", true);
    if (activeCall)
      await db.audioProviderCall.updateMany({
        where: { id: activeCall, status: "STARTED" },
        data: {
          ...(e.metadata ? metadata({ value: null, ...e.metadata }) : {}),
          status: "FAILED",
          errorCode: e.code,
          finishedAt: new Date(),
        },
      });
    const retry = e.retryable && job.attempts < 3;
    const status =
      e.code === "CONSENT_REVOKED"
        ? "CANCELLED"
        : e.code === "SUPERSEDED" || e.code === "SOURCE_CHANGED"
          ? "SUPERSEDED"
          : e.code === "PROVIDER_UNAVAILABLE"
            ? "UNAVAILABLE"
            : retry
              ? "RETRY_WAIT"
              : "FAILED";
    await db.audioJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status,
        errorCode: e.code,
        nextRunAt: new Date(Date.now() + job.attempts * 15000),
        leaseToken: null,
        leaseUntil: null,
      },
    });
  } finally {
    clearInterval(heartbeat);
    controller.abort();
  }
}
export async function runAudioWorkerOnce(
  options: {
    mode?: "LIVE" | "TEST" | "LIVE_CHECK";
    onlyId?: string;
    provider?: AudioProvider;
  } = {},
) {
  if (!options.provider && !audioProviderAvailable()) {
    await db.audioJob.updateMany({
      where: {
        mode: options.mode ?? "LIVE",
        ...(options.onlyId ? { id: options.onlyId } : {}),
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
    return false;
  }
  const job = await claimAudioJob(options.mode ?? "LIVE", options.onlyId);
  if (!job) return false;
  await processClaimedAudio(job, options.provider);
  return true;
}
export function startAudioWorker() {
  if (process.env.AUDIO_WORKER_ENABLED === "false") return;
  const scope = globalThis as typeof globalThis & {
    leaderAudioWorker?: ReturnType<typeof setInterval>;
  };
  if (scope.leaderAudioWorker) return;
  let busy = false;
  scope.leaderAudioWorker = setInterval(() => {
    if (busy) return;
    busy = true;
    void runAudioWorkerOnce()
      .catch(() => {
        console.error("audio_worker_unavailable");
      })
      .finally(() => {
        busy = false;
      });
  }, 3000);
  scope.leaderAudioWorker.unref();
}
