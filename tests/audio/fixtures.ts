import { readFile } from "node:fs/promises";
import manifest from "../fixtures/audio/manifest.json";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { emptyFields } from "../../src/lib/validation";
import { decodeAudio } from "../../src/lib/audio-media.server";
import {
  asJson,
  changeAudioConsent,
  enqueueAudio,
} from "../../src/lib/audio-service.server";
import {
  languageTask,
  type TranscriptInput,
  type AudioSummary,
} from "../../src/lib/audio-contract";
import type { AudioProvider } from "../../src/lib/audio-provider.server";
export const expected = {
  oral: "The workshop now starts at four p.m., not two. The library hall is available later. It is still in the same place. You can join for free, and you do not need any experience.",
  followup:
    "I am sorry that four p.m. does not work for you. I will ask the team whether there is another session or a recording. I cannot promise an alternative before I check.",
};
export function fixtureSummary(sources: TranscriptInput[]): AudioSummary {
  const evidence = sources.map((s) => ({
    id: s.kind + "-quote",
    transcriptId: s.id,
    kind: s.kind as "oral" | "followup",
    version: 0 as const,
    quote: s.text,
  }));
  return {
    answerSummary: [
      {
        id: "main-summary",
        text: "Сообщает новое время и условия участия.",
        evidenceIds: ["oral-quote"],
      },
      {
        id: "followup-summary",
        text: "Предлагает уточнить альтернативу у команды.",
        evidenceIds: ["followup-quote"],
      },
    ],
    evidence,
    taskChecks: languageTask.requirements.map((r) => ({
      requirementId: r.id,
      coverage: "covered" as const,
      explanation:
        "Содержание требования затронуто; требуется сверка с записью.",
      evidenceIds: [r.kind + "-quote"],
    })),
    limitations: [
      "Расшифровка требует сверки с оригиналом; совпадение цитаты не доказывает точность вывода.",
    ],
    pointsForHumanReview: [],
  };
}
export async function createFixture(
  label: string,
  mode: "TEST" | "LIVE" | "LIVE_CHECK" = "TEST",
  available = true,
) {
  if (
    !["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("Audio fixtures require a local database.");
  const inputs = await Promise.all(
    (["oral", "followup"] as const).map(async (kind) => {
      const bytes = await readFile(
        new URL(`../fixtures/audio/${kind}.wav`, import.meta.url),
      );
      if (createHash("sha256").update(bytes).digest("hex") !== manifest[kind])
        throw new Error(
          "Controlled audio fixture has changed; no transcript may be substituted.",
        );
      return { kind, bytes, decoded: await decodeAudio(bytes, "audio/wav") };
    }),
  );
  const program = await db.program.findFirstOrThrow();
  const email = `audio-${label}-${randomUUID()}@qa.local`;
  const user = await db.user.create({
    data: { email, name: "Проверка аудио", role: "CANDIDATE", origin: "QA" },
  });
  const app = await db.application.create({
    data: {
      userId: user.id,
      programSlug: program.slug,
      fields: asJson({ ...emptyFields, audioConsent: true }),
      origin: "QA",
    },
  });
  const ids: Record<string, string> = {};
  const hashes = new Map<string, string>();
  for (const { kind, bytes, decoded } of inputs) {
    const material = await db.material.create({
      data: {
        applicationId: app.id,
        userId: user.id,
        kind,
        name: kind + ".wav",
        mime: "audio/wav",
        size: bytes.length,
        bytes,
        durationMs: decoded.durationMs,
        sha256: decoded.sha256,
      },
    });
    ids[kind] = material.id;
    hashes.set(
      createHash("sha256").update(decoded.wav).digest("hex"),
      expected[kind],
    );
  }
  const state = {
    comprehension: "later",
    oralId: ids.oral,
    followupId: ids.followup,
    writtenNote: "",
  };
  const check = await db.languageCheck.create({
    data: {
      applicationId: app.id,
      state,
      revision: 1,
      status: "PENDING_REVIEW",
    },
  });
  await changeAudioConsent(app.id, user, true, 0);
  const job = await enqueueAudio(app.id, user, check.revision, {
    mode,
    available,
  });
  const calls: string[] = [];
  const provider: AudioProvider = {
    async transcribe({ wav }) {
      calls.push("transcribe");
      const value = hashes.get(createHash("sha256").update(wav).digest("hex"));
      if (!value) throw new Error("Unknown fixture file");
      return {
        value,
        requestId: "fixture-transcribe",
        usage: { fixture: true },
      };
    },
    async summarize({ sources }) {
      calls.push("summary");
      return {
        value: fixtureSummary(sources),
        requestId: "fixture-summary",
        responseId: "fixture-response",
        usage: { fixture: true },
      };
    },
  };
  return { email, user, app, check, job, state, provider, calls };
}
