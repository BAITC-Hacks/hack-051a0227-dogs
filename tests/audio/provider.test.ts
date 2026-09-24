import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OpenAIAudioProvider,
  summaryInstructions,
} from "../../src/lib/audio-provider.server";
import {
  languageTask,
  validateAudioSummary,
} from "../../src/lib/audio-contract";
import { fixtureSummary, expected } from "./fixtures";
const sources = Object.entries(expected).map(([kind, text]) => ({
  id: kind + "-id",
  kind,
  text,
  version: 0,
}));
test("provider sends only finished audio or task plus source texts, with strict Responses output and no storage", async () => {
  const calls: { url: string; body: BodyInit }[] = [];
  const provider = new OpenAIAudioProvider(undefined, async (path, body) => {
    calls.push({ url: path, body });
    return {
      value: path.endsWith("transcriptions")
        ? { text: expected.oral, usage: { seconds: 10 } }
        : {
            id: "fixture-response",
            status: "completed",
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(fixtureSummary(sources)),
                  },
                ],
              },
            ],
            usage: { total_tokens: 20 },
          },
      requestId: "fixture-request",
    };
  });
  await provider.transcribe({
    wav: Buffer.from("fixture-bytes"),
    model: "test-model",
    signal: new AbortController().signal,
  });
  const summary = await provider.summarize({
    task: languageTask,
    sources,
    model: "test-model",
    signal: new AbortController().signal,
  });
  assert.equal(summary.requestId, "fixture-request");
  assert.equal(summary.responseId, "fixture-response");
  const form = calls[0].body as FormData;
  assert.deepEqual([...form.keys()].sort(), [
    "file",
    "model",
    "response_format",
  ]);
  assert.equal((form.get("file") as File).name, "answer.wav");
  const body = JSON.parse(calls[1].body as string);
  assert.equal(body.store, false);
  assert.equal(body.service_tier, "default");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.max_output_tokens, 2400);
  assert.deepEqual(JSON.parse(body.input[0].content), {
    task: languageTask,
    sources,
  });
  assert.equal(body.instructions, summaryInstructions);
  assert.ok(summaryInstructions.includes("untrusted data"));
});
test("source validation rejects another answer, unknown transcript, stale version and fabricated absence evidence", () => {
  validateAudioSummary(fixtureSummary(sources), sources);
  for (const mutate of [
    (s: ReturnType<typeof fixtureSummary>) => {
      s.evidence[0].quote = "invented words";
    },
    (s: ReturnType<typeof fixtureSummary>) => {
      s.evidence[0].transcriptId = "other-candidate";
    },
    (s: ReturnType<typeof fixtureSummary>) => {
      s.evidence[0].kind = "followup";
    },
    (s: ReturnType<typeof fixtureSummary>) => {
      s.taskChecks[0].coverage = "not_addressed";
    },
    (s: ReturnType<typeof fixtureSummary>) => {
      s.taskChecks[0].evidenceIds = ["followup-quote"];
    },
  ]) {
    const summary = fixtureSummary(sources);
    mutate(summary);
    assert.throws(() => validateAudioSummary(summary, sources));
  }
  assert.throws(() =>
    validateAudioSummary(
      fixtureSummary(sources),
      sources.map((s) => ({ ...s, version: 1 })),
    ),
  );
});
test("audio adapter never falls back to an environment key and preserves refusal", async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "must-not-be-used";
  try {
    await assert.rejects(
      new OpenAIAudioProvider().transcribe({
        wav: Buffer.from("fixture"),
        model: "fixture",
        signal: new AbortController().signal,
      }),
      /PROVIDER_UNAVAILABLE/,
    );
    const provider = new OpenAIAudioProvider(undefined, async () => ({
      value: {
        id: "refusal-response",
        status: "completed",
        usage: { total_tokens: 4 },
        output: [{ type: "message", content: [{ type: "refusal" }] }],
      },
      requestId: "refusal-request",
    }));
    await assert.rejects(
      provider.summarize({
        task: languageTask,
        sources,
        model: "fixture",
        signal: new AbortController().signal,
      }),
      /PROVIDER_REFUSAL/,
    );
    assert.throws(() =>
      validateAudioSummary(
        { ...fixtureSummary(sources), leadershipScore: 99 },
        sources,
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});
