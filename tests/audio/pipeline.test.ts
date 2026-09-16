import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { db } from "../../src/lib/db";
import {
  audioApplication,
  audioArtifact,
  changeAudioConsent,
  correctAudio,
  enqueueAudio,
  recordAudioReview,
} from "../../src/lib/audio-service.server";
import {
  claimAudioJob,
  processClaimedAudio,
  runAudioWorkerOnce,
} from "../../src/lib/audio-worker.server";
import {
  AudioError,
  decodeAudio,
  pcmWav,
} from "../../src/lib/audio-media.server";
import { createFixture, expected } from "./fixtures";
import { cleanupRun } from "../cleanup";
process.env.AUDIO_DAILY_REQUEST_LIMIT = "100";

test("durable audio processing: ownership, concurrency, recovery, versions and human review", async (t) => {
  const emails: string[] = [];
  const fixture = async (
    label: string,
    mode: "TEST" | "LIVE" = "TEST",
    available = true,
  ) => {
    const f = await createFixture(label, mode, available);
    emails.push(f.email);
    return f;
  };
  try {
    await t.test(
      "same files produce one job; sources stay distinct; AI cannot finish the human review",
      async () => {
        const f = await fixture("success");
        const duplicates = await Promise.all([
          enqueueAudio(f.app.id, f.user, 1, { mode: "TEST", available: true }),
          enqueueAudio(f.app.id, f.user, 1, { mode: "TEST", available: true }),
        ]);
        assert.ok(duplicates.every((j) => j.id === f.job.id));
        const claims = await Promise.all([
          claimAudioJob("TEST", f.job.id),
          claimAudioJob("TEST", f.job.id),
        ]);
        assert.equal(claims.filter(Boolean).length, 1);
        await processClaimedAudio(claims.find(Boolean)!, f.provider);
        const result = await db.audioJob.findUniqueOrThrow({
          where: { id: f.job.id },
          include: { transcripts: true, calls: true },
        });
        assert.equal(result.status, "COMPLETED");
        assert.equal(result.transcripts.length, 2);
        assert.equal(result.calls.length, 3);
        for (const transcript of result.transcripts) {
          assert.equal(
            transcript.text,
            expected[transcript.kind as keyof typeof expected],
          );
          assert.equal(
            transcript.materialId,
            transcript.kind === "oral" ? f.state.oralId : f.state.followupId,
          );
        }
        assert.equal(
          (
            await db.languageCheck.findUniqueOrThrow({
              where: { id: f.check.id },
            })
          ).status,
          "PENDING_REVIEW",
        );
        assert.equal(
          (await db.application.findUniqueOrThrow({ where: { id: f.app.id } }))
            .stage,
          "DRAFT",
        );
        assert.equal(
          await db.assessment.count({ where: { applicationId: f.app.id } }),
          0,
        );
        assert.equal(
          (
            await enqueueAudio(f.app.id, f.user, 1, {
              mode: "TEST",
              available: true,
            })
          ).id,
          result.id,
        );
      },
    );
    await t.test(
      "summary retry reuses transcripts; an expired lease resumes after restart",
      async () => {
        const f = await fixture("retry");
        await runAudioWorkerOnce({
          mode: "TEST",
          onlyId: f.job.id,
          provider: {
            ...f.provider,
            async summarize() {
              throw new AudioError("PROVIDER_TIMEOUT", true);
            },
          },
        });
        assert.equal(
          await db.audioTranscript.count({ where: { jobId: f.job.id } }),
          2,
        );
        await db.audioJob.update({
          where: { id: f.job.id },
          data: {
            status: "SUMMARIZING",
            leaseToken: "crashed-worker",
            leaseUntil: new Date(0),
          },
        });
        const recovered = await claimAudioJob("TEST", f.job.id);
        assert.ok(recovered);
        assert.notEqual(recovered.leaseToken, "crashed-worker");
        await processClaimedAudio(recovered, f.provider);
        assert.equal(f.calls.filter((c) => c === "transcribe").length, 2);
        assert.equal(
          (await db.audioJob.findUniqueOrThrow({ where: { id: f.job.id } }))
            .status,
          "COMPLETED",
        );
        await db.audioJob.update({
          where: { id: f.job.id },
          data: {
            status: "SUMMARIZING",
            attempts: 3,
            leaseToken: "crashed",
            leaseUntil: new Date(0),
          },
        });
        assert.equal(await claimAudioJob("TEST", f.job.id), null);
        assert.equal(
          (await db.audioJob.findUniqueOrThrow({ where: { id: f.job.id } }))
            .status,
          "FAILED",
        );
      },
    );
    await t.test(
      "revocation during a call blocks subsequent requests and publication",
      async () => {
        const f = await fixture("revoke");
        let calls = 0;
        await runAudioWorkerOnce({
          mode: "TEST",
          onlyId: f.job.id,
          provider: {
            ...f.provider,
            async transcribe(input) {
              calls++;
              const result = await f.provider.transcribe(input);
              await changeAudioConsent(f.app.id, f.user, false, 1);
              return result;
            },
          },
        });
        assert.equal(calls, 1);
        assert.equal(
          await db.audioTranscript.count({ where: { jobId: f.job.id } }),
          0,
        );
        assert.equal(
          (await db.audioJob.findUniqueOrThrow({ where: { id: f.job.id } }))
            .status,
          "CANCELLED",
        );
        await assert.rejects(
          enqueueAudio(f.app.id, f.user, 1, { mode: "TEST", available: true }),
        );
      },
    );
    await t.test(
      "missing key is terminal, including expired processing; no provider fixture is substituted",
      async () => {
        const f = await fixture("unavailable", "TEST", false);
        assert.equal(f.job.status, "UNAVAILABLE");
        const originalKey = process.env.OPENAI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        try {
          await db.audioJob.update({
            where: { id: f.job.id },
            data: {
              status: "TRANSCRIBING",
              leaseToken: "expired",
              leaseUntil: new Date(0),
            },
          });
          await runAudioWorkerOnce({ mode: "TEST", onlyId: f.job.id });
          const result = await db.audioJob.findUniqueOrThrow({
            where: { id: f.job.id },
          });
          assert.equal(result.status, "UNAVAILABLE");
          assert.equal(result.summary, null);
          assert.equal(
            await db.audioProviderCall.count({ where: { jobId: f.job.id } }),
            0,
          );
        } finally {
          if (originalKey !== undefined)
            process.env.OPENAI_API_KEY = originalKey;
        }
      },
    );
    await t.test(
      "bad quote rejects summary; human correction preserves automatic original and review versions",
      async () => {
        const f = await fixture("versions");
        await runAudioWorkerOnce({
          mode: "TEST",
          onlyId: f.job.id,
          provider: {
            ...f.provider,
            async summarize(input) {
              const result = await f.provider.summarize(input);
              const value = result.value as { evidence: { quote: string }[] };
              value.evidence[0].quote =
                "This sentence is not in either answer.";
              return result;
            },
          },
        });
        const invalid = await db.audioJob.findUniqueOrThrow({
          where: { id: f.job.id },
        });
        assert.equal(invalid.errorCode, "INVALID_EVIDENCE");
        assert.equal(invalid.summary, null);
        const rejectedCall = await db.audioProviderCall.findFirstOrThrow({
          where: { jobId: f.job.id, step: "summary" },
        });
        assert.equal(rejectedCall.requestId, "fixture-summary");
        const staff = await db.user.findFirstOrThrow({
          where: { role: "STAFF" },
        });
        await assert.rejects(audioApplication(f.app.id, staff));
        await assert.rejects(
          audioApplication(f.app.id, { id: "someone-else", role: "CANDIDATE" }),
        );
        await db.application.update({
          where: { id: f.app.id },
          data: { submittedAt: new Date(), stage: "SUBMITTED" },
        });
        await enqueueAudio(f.app.id, f.user, 1, {
          mode: "TEST",
          available: true,
        });
        await runAudioWorkerOnce({
          mode: "TEST",
          onlyId: f.job.id,
          provider: f.provider,
        });
        const transcript = await db.audioTranscript.findFirstOrThrow({
          where: { jobId: f.job.id, kind: "oral" },
        });
        await assert.rejects(
          correctAudio(f.user, {
            transcriptId: transcript.id,
            version: 0,
            text: "changed",
            reason: "test reason",
          }),
        );
        await correctAudio(staff, {
          transcriptId: transcript.id,
          version: 0,
          text: transcript.text + " [Сверено с оригиналом]",
          reason: "Уточнена пунктуация после прослушивания.",
        });
        assert.equal(
          (
            await db.audioTranscript.findUniqueOrThrow({
              where: { id: transcript.id },
            })
          ).text,
          expected.oral,
        );
        await assert.rejects(
          correctAudio(staff, {
            transcriptId: transcript.id,
            version: 0,
            text: "stale",
            reason: "test reason",
          }),
        );
        await db.audioJob.update({
          where: { id: f.job.id },
          data: { mode: "LIVE" },
        });
        const artifact = await audioArtifact(f.job.id, staff);
        assert.equal(artifact.current, true);
        await assert.rejects(
          audioArtifact(f.job.id, { id: "other", role: "CANDIDATE" }),
        );
        const versions = Object.fromEntries(
          artifact.transcripts.map((t) => [
            t.id,
            t.corrections[0]?.version ?? 0,
          ]),
        );
        await assert.rejects(
          db.$transaction((tx) =>
            recordAudioReview(
              tx,
              f.app.id,
              staff.id,
              3,
              "Вывод сотрудника по оригиналу",
              {
                jobId: f.job.id,
                rejectedIds: [],
                note: "",
                transcriptVersions: {},
              },
            ),
          ),
        );
        await db.$transaction((tx) =>
          recordAudioReview(
            tx,
            f.app.id,
            staff.id,
            3,
            "Вывод сотрудника по оригиналу",
            {
              jobId: f.job.id,
              rejectedIds: ["main-summary"],
              note: "Формулировка требует уточнения.",
              transcriptVersions: versions,
            },
          ),
        );
        assert.equal(
          await db.audioReview.count({ where: { jobId: f.job.id } }),
          1,
        );
        await db.languageCheck.update({
          where: { id: f.check.id },
          data: { state: { ...f.state, oralId: "replacement-file" } },
        });
        assert.equal((await audioArtifact(f.job.id, staff)).current, false);
        await assert.rejects(
          correctAudio(staff, {
            transcriptId: transcript.id,
            version: 1,
            text: "outdated",
            reason: "test reason",
          }),
        );
      },
    );
    await t.test(
      "real decoding rejects corrupt, empty and too-long recordings without a language result",
      async () => {
        await assert.rejects(decodeAudio(Buffer.alloc(0), "audio/wav"));
        await assert.rejects(
          decodeAudio(Buffer.from("RIFF1234WAVEcorrupted"), "audio/wav"),
        );
        await assert.rejects(
          decodeAudio(pcmWav(Buffer.alloc(182 * 32000)), "audio/wav"),
          /INVALID_DURATION/,
        );
        const valid = await decodeAudio(
          pcmWav(Buffer.alloc(16000)),
          "audio/wav",
        );
        assert.equal(valid.durationMs, 500);
        for (const [extension, mime] of [
          ["m4a", "audio/mp4"],
          ["webm", "audio/webm"],
          ["ogg", "audio/ogg"],
        ]) {
          const decoded = await decodeAudio(
            await readFile(
              new URL(`../fixtures/audio/oral.${extension}`, import.meta.url),
            ),
            mime,
          );
          assert.ok(decoded.durationMs > 11000 && decoded.durationMs < 12000);
        }
      },
    );
  } finally {
    await cleanupRun(db, emails);
    await db.$disconnect();
  }
});
