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
test("provider sends only finished audio or task plus source texts, with strict Responses output and no storage", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "isolated-test-key";
  const calls: { url: string; body: BodyInit | null | undefined }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(init.redirect, "error");
    calls.push({ url, body: init.body });
    return new Response(
      JSON.stringify(
        url.endsWith("transcriptions")
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
      ),
      { headers: { "x-request-id": "fixture-request" } },
    );
  });
  try {
    const provider = new OpenAIAudioProvider();
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
    assert.equal(body.text.format.strict, true);
    assert.equal(body.max_output_tokens, 2400);
    assert.deepEqual(JSON.parse(body.input[0].content), {
      task: languageTask,
      sources,
    });
    assert.equal(body.instructions, summaryInstructions);
    assert.ok(summaryInstructions.includes("untrusted data"));
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
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
test("provider handles rate limits, timeout and refusal with bounded retry information", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "isolated-test-key";
  let mode = "rate";
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      if (mode === "timeout") {
        assert.ok(init.signal?.aborted);
        throw new Error("aborted");
      }
      if (mode === "rate")
        return new Response("", {
          status: 429,
          headers: { "x-request-id": "rate-limit-request" },
        });
      return new Response(
        JSON.stringify({
          id: "refusal-response",
          status: "completed",
          usage: { total_tokens: 4 },
          output: [{ type: "message", content: [{ type: "refusal" }] }],
        }),
        { headers: { "x-request-id": "refusal-request" } },
      );
    },
  );
  try {
    const provider = new OpenAIAudioProvider();
    await assert.rejects(
      provider.transcribe({
        wav: Buffer.from("fixture"),
        model: "fixture",
        signal: new AbortController().signal,
      }),
      (e: unknown) => {
        const error = e as {
          code: string;
          retryable: boolean;
          metadata: { requestId: string };
        };
        return (
          error.code === "PROVIDER_RATE_LIMIT" &&
          error.retryable &&
          error.metadata.requestId === "rate-limit-request"
        );
      },
    );
    mode = "timeout";
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      provider.transcribe({
        wav: Buffer.from("fixture"),
        model: "fixture",
        signal: controller.signal,
      }),
      /PROVIDER_TIMEOUT/,
    );
    mode = "refusal";
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
