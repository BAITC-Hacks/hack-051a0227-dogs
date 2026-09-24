import "server-only";
import type { User } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./security";
import { visionContext } from "./vision-context.server";
import { profileScopeSchema, profileAnswerSchema } from "./profile-contract";
import { visionVoices, voiceSamples } from "./vision-contract";
import { digest } from "./scoring-input.server";
import { json } from "./learning-resources.server";
import { decodeAudio } from "./audio-media.server";
import { claimAudioJob } from "./audio-worker.server";
import {
  OpenAIAudioProvider,
  type AudioProvider,
} from "./audio-provider.server";
import { requestOpenAI } from "./openai-gateway.server";
import { connection } from "./openai-settings.server";
import { visionError } from "./vision-service.server";
export async function accessibleMedia(user: User, id: string) {
  const media = await db.visionMedia.findFirst({
    where: { id, userId: user.id },
    include: { job: { include: { transcripts: true } } },
  });
  if (!media) throw new AppError("Запись недоступна.", 404);
  const c = await visionContext(user, profileScopeSchema.parse(media.scope));
  if (c.consentRevision !== media.consentRevision || c.hash !== media.inputHash)
    throw new AppError(
      "Материалы или разрешение изменились. Запись этого разговора недоступна.",
      409,
    );
  if (media.answerId) {
    const answer = await db.profileAnswer.findFirst({
      where: { id: media.answerId, userId: user.id, status: "COMPLETED" },
    });
    if (!answer) throw new AppError("Ответ недоступен.", 404);
    const parsed = profileAnswerSchema.safeParse(answer.answer);
    if (
      !parsed.success ||
      parsed.data.dependencies.some(
        (d) =>
          !c.c.sources.some((s) => s.key === d.key && s.version === d.version),
      )
    )
      throw new AppError("Основание ответа недоступно.", 404);
  }
  return media;
}
export async function enqueueVisionAudio(
  user: User,
  scope: unknown,
  file: File,
  requestKey: string,
) {
  const c = await visionContext(user, profileScopeSchema.parse(scope)),
    cfg = await connection();
  if (!cfg.visionEnabled)
    throw new AppError(
      "Голос Vision сейчас недоступен. Можно написать вопрос.",
      409,
    );
  if (file.size > 8 * 1024 * 1024)
    throw new AppError(
      "Для вопроса используй короткую запись до одной минуты.",
      413,
    );
  const decoded = await decodeAudio(
    Buffer.from(await file.arrayBuffer()),
    file.type.split(";")[0],
  );
  if (decoded.durationMs > 60000)
    throw new AppError("Для вопроса запиши до одной минуты.", 400);
  const identity = digest({
    user: user.id,
    request: z.uuid().parse(requestKey),
    hash: c.hash,
    audio: decoded.sha256,
  });
  const old = await db.visionMedia.findUnique({
    where: { cacheKey: identity },
  });
  if (old) return { id: old.id, jobId: old.jobId };
  return db.$transaction(async (tx) => {
    const job = await tx.audioJob.upsert({
      where: { identity },
      update: {},
      create: {
        identity,
        mode: "VISION",
        purpose: "VISION",
        oralId: identity,
        followupId: "",
        oralHash: decoded.sha256,
        followupHash: "",
        taskVersion: "vision-dictation-v1",
        taskSnapshot: json({ userId: user.id, scope, contextHash: c.hash }),
        instructionVersion: "transcribe-only-v1",
        consentRevision: c.consentRevision,
        transcriptionModel: cfg.transcriptionModel,
        textModel: cfg.textModel,
      },
    });
    const media = await tx.visionMedia.upsert({
      where: { cacheKey: identity },
      update: {},
      create: {
        cacheKey: identity,
        userId: user.id,
        kind: "DICTATION",
        scope: json(scope),
        inputHash: c.hash,
        consentRevision: c.consentRevision,
        dependencies: json(
          c.sources.map((s) => ({ key: s.key, version: s.version })),
        ),
        bytes: new Uint8Array(decoded.wav),
        mime: "audio/wav",
        model: cfg.transcriptionModel,
        jobId: job.id,
      },
    });
    return { id: media.id, jobId: job.id };
  });
}
export async function processVisionAudio(id: string, provider?: AudioProvider) {
  const job = await claimAudioJob("VISION", id, "VISION");
  if (!job) return;
  const media = await db.visionMedia.findUnique({ where: { jobId: job.id } });
  try {
    if (!media) throw new AppError("Запись недоступна.", 404);
    const user = await db.user.findUniqueOrThrow({
      where: { id: media.userId },
    });
    const authorize = async () => {
      await accessibleMedia(user, media.id);
      const fresh = await db.audioJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (
        fresh.leaseToken !== job.leaseToken ||
        fresh.status !== "TRANSCRIBING"
      )
        throw new AppError("Расшифровка остановлена.", 409);
    };
    await authorize();
    const p =
      provider ??
      new OpenAIAudioProvider({ purpose: "VISION_VOICE", authorize });
    const audit = await db.audioProviderCall.create({
      data: { jobId: job.id, step: "dictation", model: job.transcriptionModel },
    });
    const response = await p.transcribe({
      wav: Buffer.from(media.bytes),
      model: job.transcriptionModel,
      signal: AbortSignal.timeout(60000),
    });
    await db.audioProviderCall.update({
      where: { id: audit.id },
      data: {
        status: "SUCCEEDED",
        requestId: response.requestId,
        responseId: response.responseId,
        usage: response.usage ? json(response.usage) : undefined,
        finishedAt: new Date(),
      },
    });
    await authorize();
    const text = z.string().trim().min(1).max(2000).parse(response.value);
    await db.$transaction(async (tx) => {
      const changed = await tx.audioJob.updateMany({
        where: {
          id: job.id,
          leaseToken: job.leaseToken,
          status: "TRANSCRIBING",
        },
        data: {
          status: "COMPLETED",
          leaseToken: null,
          leaseUntil: null,
          completedAt: new Date(),
        },
      });
      if (!changed.count) throw new AppError("Обработка остановлена.", 409);
      await tx.audioTranscript.upsert({
        where: { jobId_kind: { jobId: job.id, kind: "dictation" } },
        update: {},
        create: {
          jobId: job.id,
          kind: "dictation",
          materialId: media.id,
          text,
        },
      });
      await tx.visionMedia.update({ where: { id: media.id }, data: { text } });
    });
  } catch (e) {
    await db.audioProviderCall.updateMany({
      where: { jobId: job.id, status: "STARTED" },
      data: {
        status: "FAILED",
        errorCode: visionError(e),
        finishedAt: new Date(),
      },
    });
    await db.audioJob.updateMany({
      where: { id: job.id, leaseToken: job.leaseToken },
      data: {
        status: "FAILED",
        errorCode: visionError(e),
        leaseUntil: null,
        leaseToken: null,
      },
    });
  }
}
export async function visionAudioStatus(user: User, id: string) {
  const m = await accessibleMedia(user, id);
  return {
    id: m.id,
    jobId: m.jobId,
    status: m.job?.status,
    text: m.text,
    error: m.job?.errorCode,
    attempts: m.job?.attempts ?? 0,
  };
}
export async function latestVisionDictation(user: User, rawScope: unknown) {
  const scope = profileScopeSchema.parse(rawScope),
    c = await visionContext(user, scope);
  const media = await db.visionMedia.findFirst({
    where: {
      userId: user.id,
      kind: "DICTATION",
      inputHash: c.hash,
      consentRevision: c.consentRevision,
    },
    orderBy: { createdAt: "desc" },
  });
  return media ? visionAudioStatus(user, media.id) : {};
}
export async function visionAudioCommand(
  user: User,
  id: string,
  command: "cancel" | "retry",
) {
  const m = await accessibleMedia(user, id);
  if (!m.job) throw new AppError("Запись недоступна.", 404);
  if (command === "cancel")
    await db.audioJob.updateMany({
      where: { id: m.job.id, status: { in: ["QUEUED", "TRANSCRIBING"] } },
      data: { status: "CANCELLED", leaseToken: null, leaseUntil: null },
    });
  else {
    if (m.job.attempts >= 3 || m.job.status !== "FAILED")
      throw new AppError(
        "Повторы завершены. Можно записать новый вопрос.",
        409,
      );
    await db.audioJob.update({
      where: { id: m.job.id },
      data: { status: "QUEUED", errorCode: null, nextRunAt: new Date() },
    });
  }
  return { jobId: m.job.id };
}
export async function synthesizeVision(
  user: User,
  b: Record<string, unknown>,
  signal: AbortSignal,
  dispatch = requestOpenAI,
) {
  const scope = profileScopeSchema.parse(b.scope ?? {}),
    c = await visionContext(user, scope),
    cfg = await connection();
  const voice = z.enum(visionVoices).parse(b.voice);
  let text: string, answerId: string | undefined;
  if (b.sample) {
    text = voiceSamples[z.enum(["ru", "kk", "en"]).parse(b.sample)];
  } else {
    answerId = z.string().parse(b.answerId);
    const row = await db.profileAnswer.findFirst({
      where: {
        id: answerId,
        userId: user.id,
        audience: "CANDIDATE",
        provider: "openai-vision",
        status: "COMPLETED",
        scopeKey: c.c.scopeKey,
      },
    });
    if (!row || row.inputHash !== c.c.hash)
      throw new AppError("Обнови ответ перед озвучиванием.", 409);
    const a = profileAnswerSchema.parse(row.answer);
    if (
      a.dependencies.some(
        (d) =>
          !c.c.sources.some((s) => s.key === d.key && s.version === d.version),
      )
    )
      throw new AppError("Источник недоступен.", 404);
    text = [a.text, ...a.claims.map((p) => p.text)].join("\n").slice(0, 2200);
  }
  const cacheKey = digest({
    user: user.id,
    scope,
    answerId,
    text,
    voice,
    model: cfg.speechModel,
    hash: c.hash,
  });
  const old = await db.visionMedia.findUnique({ where: { cacheKey } });
  if (old) {
    await accessibleMedia(user, old.id);
    return { id: old.id, cached: true };
  }
  const authorize = async () => {
    const fresh = await visionContext(user, scope);
    if (fresh.hash !== c.hash) throw new AppError("Материалы изменились.", 409);
  };
  const attempts = await db.openAICall.count({
    where: { requestKey: { startsWith: cacheKey } },
  });
  if (attempts >= 3)
    throw new AppError(
      "Повторы озвучивания завершены. Выбери другой голос или обнови ответ.",
      409,
    );
  const r = await dispatch({
    task: "speech",
    model: cfg.speechModel,
    requestKey: cacheKey + ":" + attempts,
    revision: cfg.revision,
    permission: { purpose: "VISION_VOICE", authorize },
    signal,
    body: JSON.stringify({
      model: cfg.speechModel,
      voice,
      input: text,
      response_format: "mp3",
      instructions:
        "Speak clearly in the language of the supplied text. Do not add words.",
    }),
  });
  await authorize();
  if (!Buffer.isBuffer(r.value) || r.value.length < 10)
    throw new AppError("Звук не получен.", 502);
  const media = await db.visionMedia.create({
    data: {
      userId: user.id,
      cacheKey,
      kind: "SPEECH",
      scope: json(scope),
      inputHash: c.hash,
      consentRevision: c.consentRevision,
      dependencies: json(
        c.sources.map((s) => ({ key: s.key, version: s.version })),
      ),
      answerId,
      bytes: new Uint8Array(r.value),
      mime: "audio/mpeg",
      text,
      voice,
      model: cfg.speechModel,
    },
  });
  return { id: media.id, cached: false };
}
