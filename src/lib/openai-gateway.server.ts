import "server-only";
import { Prisma, type OpenAIConnection } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { localSecrets, type LocalSecretStore } from "./local-secret.server";
import {
  lockConnection,
  localConnectionOrigin,
} from "./openai-settings.server";
import { pricingVersion, rates, type OpenAITask } from "./openai-policy";

import { consumeResponsesStream } from "./openai-stream.server";
import { visionTool, visionVoices } from "./vision-contract";

export class OpenAIError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export type OpenAIPermission = {
  purpose:
    | "CONNECTION_TEST"
    | "LANGUAGE_CONTENT"
    | "DESK_FACTS"
    | "VISION_LEARNING"
    | "VISION_VOICE"
    | "MISSION_SCENE";
  authorize: () => Promise<void>;
};
export const selectedModel = (c: OpenAIConnection, task: OpenAITask) =>
  ({
    text: c.textModel,
    complex: c.complexModel,
    transcription: c.transcriptionModel,
    speech: c.speechModel,
  })[task];
export function estimatedCost(
  task: OpenAITask,
  model: string,
  bytes: number,
  output = 0,
  seconds = 0,
) {
  if (task === "speech")
    return Math.max(100000, Math.ceil(bytes / 300) * 100000); // Conservative reservation scales with UTF-8 input, no invented usage.
  const rate = rates[model];
  if (!rate) throw new OpenAIError("MODEL");
  if (task === "transcription")
    return Math.ceil(seconds * 100 * rate.input + 2000 * rate.output);
  // UTF-8 byte bound plus protocol allowance is deliberately conservative.
  return Math.ceil(
    (bytes + 1024) * (rate.cacheWrite ?? rate.input) + output * rate.output,
  );
}
export async function reserveOpenAICall(input: {
  task: OpenAITask;
  model: string;
  requestKey: string;
  estimatedMicros: number;
  purpose: string;
  revision?: number;
}) {
  return db.$transaction(async (tx) => {
    const row = await lockConnection(tx);
    if (!row.secretCipher || !row.ownerId)
      throw new OpenAIError("DISCONNECTED");
    if (input.revision !== undefined && row.revision !== input.revision)
      throw new OpenAIError("CHANGED");
    if (selectedModel(row, input.task) !== input.model)
      throw new OpenAIError("CHANGED");
    if (
      ["VISION_LEARNING", "VISION_VOICE", "MISSION_SCENE"].includes(
        input.purpose,
      ) &&
      !row.visionEnabled
    )
      throw new OpenAIError("DISCONNECTED");
    if (input.purpose === "DESK_FACTS" && !row.deskEnabled)
      throw new OpenAIError("DISCONNECTED");
    if (input.purpose === "LANGUAGE_CONTENT" && !row.audioEnabled)
      throw new OpenAIError("DISCONNECTED");
    if (
      await tx.openAICall.findUnique({
        where: { requestKey: input.requestKey },
      })
    )
      throw new OpenAIError("DUPLICATE");
    // A crash never refunds an uncertain request. It frees only its concurrency slot.
    await tx.openAICall.updateMany({
      where: {
        status: "RESERVED",
        createdAt: { lt: new Date(Date.now() - 120000) },
      },
      data: {
        status: "UNKNOWN",
        costBasis: "ESTIMATE",
        errorCode: "INTERRUPTED",
        finishedAt: new Date(),
      },
    });
    if (
      (await tx.openAICall.count({ where: { status: "RESERVED" } })) >=
      row.parallelLimit
    )
      throw new OpenAIError("PARALLEL");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const total = await tx.openAICall.aggregate({
      _sum: { chargedMicros: true },
    });
    // Yesterday's unfinished requests still reserve today's capacity across midnight.
    const day = await tx.openAICall.aggregate({
      where: { OR: [{ createdAt: { gte: today } }, { status: "RESERVED" }] },
      _sum: { chargedMicros: true },
    });
    const cost = input.estimatedMicros;
    if (
      !Number.isSafeInteger(cost) ||
      cost <= 0 ||
      (total._sum.chargedMicros ?? 0) + cost >
        Math.min(row.limitMicros, row.startingMicros - row.reserveMicros) ||
      (day._sum.chargedMicros ?? 0) + cost > row.dailyMicros
    )
      throw new OpenAIError("BUDGET");
    return tx.openAICall.create({
      data: {
        task: input.task,
        model: input.model,
        requestKey: input.requestKey,
        purpose: input.purpose,
        connectionRevision: row.revision,
        pricingVersion,
        reservedMicros: cost,
        chargedMicros: cost,
      },
    });
  });
}

function usageCost(model: string, raw: unknown) {
  if (!raw || typeof raw !== "object" || !rates[model]) return null;
  const usage = raw as Record<string, unknown>;
  const input = usage.input_tokens,
    output = usage.output_tokens;
  if (
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    Number(input) < 0 ||
    Number(output) < 0 ||
    Number(input) > 1000000 ||
    Number(output) > 150000
  )
    return null;
  const details = usage.input_tokens_details as
    { cached_tokens?: number; cache_write_tokens?: number } | undefined;
  const cached = details?.cached_tokens;
  const validCached =
    Number.isSafeInteger(cached) &&
    Number(cached) >= 0 &&
    Number(cached) <= Number(input)
      ? Number(cached)
      : 0;
  const written = details?.cache_write_tokens ?? 0;
  if (
    !Number.isSafeInteger(written) ||
    written < 0 ||
    validCached + written > Number(input)
  )
    return null;
  const rate = rates[model];
  return Math.ceil(
    (Number(input) - validCached - written) * rate.input +
      written * (rate.cacheWrite ?? rate.input) +
      validCached * (rate.cached ?? rate.input) +
      Number(output) * rate.output,
  );
}
async function boundedBody(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new OpenAIError("RESPONSE");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new OpenAIError("RESPONSE");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts);
}
export async function requestOpenAI(options: {
  task: OpenAITask;
  model: string;
  body: string | FormData;
  signal: AbortSignal;
  permission: OpenAIPermission;
  requestKey?: string;
  revision?: number;
  secrets?: LocalSecretStore;
  onDelta?: (text: string) => Promise<void>;
}) {
  localConnectionOrigin();
  const { task, model, permission } = options;
  let requestBody = options.body;
  let bytes = 0,
    output = 0,
    seconds = 0;
  if (typeof options.body === "string") {
    bytes = Buffer.byteLength(options.body);
    const body = JSON.parse(options.body);
    if ((task === "text" || task === "complex") && model.startsWith("gpt-6-")) {
      // Explicit mode without breakpoints prevents implicit cache writes.
      body.prompt_cache_options = { mode: "explicit" };
      requestBody = JSON.stringify(body);
    }
    if (
      body.model !== model ||
      bytes > 128000 ||
      (body.tools &&
        (permission.purpose !== "VISION_LEARNING" ||
          JSON.stringify(body.tools) !== JSON.stringify([visionTool]))) ||
      body.previous_response_id ||
      body.conversation ||
      body.background ||
      (body.service_tier !== "default" && task !== "speech")
    )
      throw new OpenAIError("INPUT_LIMIT");
    if (task === "speech") {
      if (
        typeof body.input !== "string" ||
        body.input.length >
          (permission.purpose === "VISION_VOICE" ? 2200 : 300) ||
        (body.response_format !== "pcm" &&
          !(
            permission.purpose === "VISION_VOICE" &&
            body.response_format === "mp3"
          )) ||
        (permission.purpose === "VISION_VOICE" &&
          !visionVoices.includes(body.voice))
      )
        throw new OpenAIError("INPUT_LIMIT");
    } else {
      output = body.max_output_tokens;
      if (
        !Number.isInteger(output) ||
        output < 1 ||
        output > 2400 ||
        body.store !== false
      )
        throw new OpenAIError("INPUT_LIMIT");
    }
  } else {
    const file = options.body.get("file");
    if (
      task !== "transcription" ||
      options.body.get("model") !== model ||
      !(file instanceof File) ||
      file.size < 44 ||
      file.size > 16000 * 2 * 240 + 44
    )
      throw new OpenAIError("INPUT_LIMIT");
    const wav = Buffer.from(await file.arrayBuffer());
    // Only our decoded 16 kHz mono PCM, not client-declared duration.
    if (
      wav.toString("ascii", 0, 4) !== "RIFF" ||
      wav.readUInt32LE(24) !== 16000 ||
      wav.readUInt16LE(22) !== 1 ||
      wav.readUInt16LE(34) !== 16
    )
      throw new OpenAIError("INPUT_LIMIT");
    seconds = (file.size - 44) / 32000;
  }
  options.signal.throwIfAborted();
  await permission.authorize();
  const call = await reserveOpenAICall({
    task,
    model,
    requestKey: options.requestKey ?? randomUUID(),
    estimatedMicros: estimatedCost(task, model, bytes, output, seconds),
    purpose: permission.purpose,
    revision: options.revision,
  });
  let sent = false,
    requestId: string | undefined;
  try {
    const config = await db.openAIConnection.findUniqueOrThrow({
      where: { id: "local" },
    });
    if (
      config.revision !== call.connectionRevision ||
      !config.secretCipher ||
      !config.secretStorage
    )
      throw new OpenAIError("CHANGED");
    let key: string;
    try {
      key = await (options.secrets ?? localSecrets).decrypt(
        config.vaultId,
        config.secretStorage,
        config.secretCipher,
      );
    } catch {
      throw new OpenAIError("STORAGE");
    }
    // Recheck consent/source ownership immediately before sending, after reservation/storage IO.
    await permission.authorize();
    const latest = await db.openAIConnection.findUniqueOrThrow({
      where: { id: "local" },
    });
    if (latest.revision !== call.connectionRevision || !latest.secretCipher)
      throw new OpenAIError("CHANGED");
    options.signal.throwIfAborted();
    sent = true;
    const path =
      task === "transcription"
        ? "audio/transcriptions"
        : task === "speech"
          ? "audio/speech"
          : "responses";
    const response = await fetch(`https://api.openai.com/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(typeof options.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body: requestBody,
      redirect: "error",
      signal: AbortSignal.any([options.signal, AbortSignal.timeout(60000)]),
    });
    key = "";
    requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) {
      await response.body?.cancel();
      const code =
        response.status === 401 || response.status === 403
          ? "ACCESS"
          : response.status === 404
            ? "MODEL"
            : response.status === 429
              ? "RATE"
              : "RESPONSE";
      // Definitive 4xx rejection has no inference output. Unknown server/network outcomes retain estimate.
      if ([400, 401, 403, 404, 429].includes(response.status)) sent = false;
      throw new OpenAIError(code);
    }
    let value: unknown, usage: unknown;
    if (
      typeof requestBody === "string" &&
      JSON.parse(requestBody).stream === true
    ) {
      value = await consumeResponsesStream(
        response,
        options.signal,
        options.onDelta,
      );
      usage = (value as { usage?: unknown }).usage;
    } else {
      const raw = await boundedBody(
        response,
        task === "speech" ? 24000 * 2 * 180 : 150000,
      );
      if (task === "speech") value = raw;
      else {
        value = JSON.parse(raw.toString("utf8"));
        usage = (value as { usage?: unknown })?.usage;
      }
    }
    const cost = usageCost(model, usage);
    // No fabricated token usage. Missing usage leaves the conservative reservation as an estimate.
    await db.openAICall.update({
      where: { id: call.id },
      data: {
        status: "SUCCEEDED",
        requestId,
        chargedMicros: cost ?? call.reservedMicros,
        costBasis: cost === null ? "ESTIMATE" : "USAGE",
        ...(usage !== undefined
          ? { usage: usage as Prisma.InputJsonValue }
          : {}),
        finishedAt: new Date(),
      },
    });
    return { value, usage, requestId };
  } catch (error) {
    const code = options.signal.aborted
      ? "CANCELLED"
      : error instanceof OpenAIError
        ? error.code
        : "NETWORK";
    await db.openAICall.update({
      where: { id: call.id },
      data: {
        status: sent ? "UNKNOWN" : "FAILED",
        chargedMicros: sent ? call.reservedMicros : 0,
        costBasis: sent ? "ESTIMATE" : "NOT_SENT_OR_REJECTED",
        errorCode: code,
        requestId,
        finishedAt: new Date(),
      },
    });
    throw new OpenAIError(code);
  }
}

export async function checkOpenAIModels(
  permission: OpenAIPermission,
  revision: number,
  secrets: LocalSecretStore = localSecrets,
) {
  localConnectionOrigin();
  await permission.authorize();
  const config = await db.openAIConnection.findUniqueOrThrow({
    where: { id: "local" },
  });
  if (config.revision !== revision) throw new OpenAIError("CHANGED");
  if (!config.secretCipher || !config.secretStorage)
    throw new OpenAIError("DISCONNECTED");
  let code = "OK",
    catalog: string[] | undefined;
  try {
    let key: string;
    try {
      key = await secrets.decrypt(
        config.vaultId,
        config.secretStorage,
        config.secretCipher,
      );
    } catch {
      throw new OpenAIError("STORAGE");
    }
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new OpenAIError(
        r.status === 401 || r.status === 403 ? "ACCESS" : "RESPONSE",
      );
    }
    const body = JSON.parse((await boundedBody(r, 500000)).toString("utf8"));
    if (!Array.isArray(body.data)) throw new OpenAIError("RESPONSE");
    const known = new Set([
      "gpt-5.4-mini",
      "gpt-6-sol",
      "gpt-6-luna",
      "gpt-4o-mini-transcribe",
      "gpt-4o-mini-transcribe-2025-12-15",
      "gpt-4o-mini-tts",
      "gpt-4o-mini-tts-2025-12-15",
    ]);
    catalog = body.data
      .map((m: { id?: string }) => m.id)
      .filter(
        (id: unknown): id is string => typeof id === "string" && known.has(id),
      );
  } catch (e) {
    code = e instanceof OpenAIError ? e.code : "NETWORK";
  }
  const saved = await db.openAIConnection.updateMany({
    where: { id: "local", revision },
    data: {
      checkCode: code,
      checkedAt: new Date(),
      catalog: catalog ?? Prisma.DbNull,
    },
  });
  if (!saved.count) throw new OpenAIError("CHANGED");
  if (code !== "OK") throw new OpenAIError(code);
}
