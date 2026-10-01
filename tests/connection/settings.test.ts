import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../../src/lib/db";
import { LocalSecretStore } from "../../src/lib/local-secret.server";
import {
  assertConnectionOwner,
  beginOwnerSetup,
  checkConnectionRequest,
  completeOwnerSetup,
  connection,
  connectionView,
  disconnectConnection,
  saveConnectionKey,
  saveConnectionSettings,
} from "../../src/lib/openai-settings.server";
import {
  checkOpenAIModels,
  requestOpenAI,
  reserveOpenAICall,
} from "../../src/lib/openai-gateway.server";
import {
  audioConfig,
  audioProviderAvailable,
  OpenAIAudioProvider,
} from "../../src/lib/audio-provider.server";
import { configuredAssessmentProvider } from "../../src/lib/scoring-provider.server";
import { pcmWav } from "../../src/lib/audio-media.server";
import { tokenHash } from "../../src/lib/security";
import { visionTool } from "../../src/lib/vision-contract";
import { request as httpRequest } from "node:http";

test("local OpenAI connection: ownership, encrypted persistence, dispatch and atomic budgets (no external network)", async (t) => {
  assert.ok(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const existing = await db.openAIConnection.findUnique({
    where: { id: "local" },
  });
  assert.ok(
    !existing?.ownerId && !existing?.secretCipher,
    "Use an isolated database without an installed connection; never overwrite an owner's settings.",
  );
  const directory = await mkdtemp(join(tmpdir(), "leader-secret-test-"));
  const secrets = new LocalSecretStore(directory, false);
  const ordinary = await db.user.create({
    data: {
      email: `connection-staff-${randomUUID()}@qa.local`,
      role: "STAFF",
      origin: "QA",
    },
  });
  const candidate = await db.user.create({
    data: { role: "CANDIDATE", origin: "QA" },
  });
  let ownerId: string | undefined;
  let fetches = 0,
    mode = "success";
  const requests: {
    model?: string;
    authorization: string | null;
    url: string;
  }[] = [];
  const fakeKey = "sk-isolated-connection-test-only-not-valid",
    secondKey = "sk-isolated-replacement-test-only-not-valid";
  const originalOrigin = process.env.APP_ORIGIN;
  process.env.APP_ORIGIN = "http://localhost:3100";
  const localFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init?: RequestInit) => {
      fetches++;
      assert.ok(url.startsWith("https://api.openai.com/v1/"));
      assert.equal(init?.redirect, "error");
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (body?.model?.startsWith("gpt-6-"))
        assert.deepEqual(body.prompt_cache_options, { mode: "explicit" });
      requests.push({
        model: body?.model,
        authorization: new Headers(init?.headers).get("authorization"),
        url,
      });
      if (mode === "invalid")
        return new Response("never reflect upstream secrets", { status: 401 });
      if (mode === "unavailable")
        return new Response("unknown model", { status: 404 });
      if (mode === "rate") return new Response("rate", { status: 429 });
      if (mode === "network") throw new Error("do not expose transport or key");
      if (url.endsWith("models"))
        return Response.json({
          data: [
            { id: "gpt-6-luna" },
            { id: "gpt-4o-mini-transcribe" },
            { id: "not-a-supported-task" },
          ],
        });
      if (url.endsWith("speech")) return new Response(new Uint8Array(3200));
      if (url.endsWith("transcriptions"))
        return Response.json({
          text: "The library opens at nine.",
          usage: { type: "duration", seconds: 1 },
        });
      if (body?.stream) {
        return new Response(
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Ответ" })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [], usage: { input_tokens: 50, output_tokens: 10 } } })}\n\n`,
          {
            headers: {
              "Content-Type": "text/event-stream",
              "x-request-id": "controlled-stream-test",
            },
          },
        );
      }
      return Response.json(
        {
          id: "test-response",
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "Ответ получен." }],
            },
          ],
          ...(mode === "no-usage"
            ? {}
            : {
                usage: {
                  input_tokens: 50,
                  output_tokens: 10,
                  ...(mode === "cache-writes"
                    ? {
                        input_tokens_details: {
                          cached_tokens: 20,
                          cache_write_tokens: 20,
                        },
                      }
                    : {}),
                },
              }),
        },
        { headers: { "x-request-id": "controlled-test-request" } },
      );
    },
  );
  try {
    await t.test(
      "strict Host/Origin and seed staff cannot claim owner without local proof",
      async () => {
        const h = new Headers({
          host: "localhost:3100",
          origin: "http://localhost:3100",
        });
        checkConnectionRequest(h, true);
        for (const bad of [
          new Headers({
            host: "attacker.test:3100",
            origin: "http://localhost:3100",
          }),
          new Headers({
            host: "localhost:3100",
            origin: "https://attacker.test",
          }),
          new Headers({ host: "localhost:3100" }),
          new Headers({
            host: "localhost:3100",
            origin: "http://localhost:3100",
            "x-forwarded-host": "attacker.test",
          }),
        ])
          assert.throws(() => checkConnectionRequest(bad, true));
        process.env.APP_ORIGIN = "https://dogs.govtech-kz.com";
        checkConnectionRequest(new Headers({
          host: "dogs.govtech-kz.com",
          origin: "https://dogs.govtech-kz.com",
        }), true);
        assert.throws(() => checkConnectionRequest(new Headers({
          host: "dogs.govtech-kz.com",
          origin: "https://other.example",
        }), true));
        await assert.rejects(beginOwnerSetup(ordinary, "new-owner@qa.local", async () => {}));
        process.env.APP_ORIGIN = "http://localhost:3100";
        await connection();
        await assert.rejects(assertConnectionOwner(ordinary));
        await assert.rejects(assertConnectionOwner(candidate));
        await assert.rejects(
          beginOwnerSetup(candidate, "owner@qa.local", async () => {}),
        );
        await assert.rejects(
          beginOwnerSetup(ordinary, ordinary.email!, async () => {}),
        );
        const email = `connection-owner-${randomUUID()}@qa.local`;
        await assert.rejects(
          beginOwnerSetup(ordinary, email, async () => {
            throw new Error("controlled unavailable local window");
          }),
        );
        assert.equal((await connection()).pairingHash, null);
        let code = "";
        await beginOwnerSetup(ordinary, email, async (c) => {
          code = c;
        });
        const props = {
          email,
          name: "Владелец проверки",
          password: "ConnectionOwnerCheck2026!",
          code: "000000000000",
        };
        await assert.rejects(completeOwnerSetup(ordinary, props));
        assert.equal((await connection()).pairingAttempts, 1);
        const result = await completeOwnerSetup(ordinary, { ...props, code });
        ownerId = result.id;
        assert.notEqual(ownerId, ordinary.id);
        assert.notEqual(result.passwordHash, props.password);
        await assert.rejects(completeOwnerSetup(ordinary, { ...props, code }));
      },
    );
    const owner = await db.user.findUniqueOrThrow({ where: { id: ownerId } });
    const permission = {
      purpose: "CONNECTION_TEST" as const,
      authorize: async () => {
        await assertConnectionOwner(owner);
      },
    };
    const body = (model = "gpt-5.4-mini") =>
      JSON.stringify({
        model,
        store: false,
        service_tier: "default",
        max_output_tokens: 64,
        input: "Connection check",
      });
    const request = (more = {}) =>
      requestOpenAI({
        task: "text",
        model: "gpt-5.4-mini",
        body: body(),
        signal: new AbortController().signal,
        permission,
        secrets,
        ...more,
      });
    await t.test(
      "secret survives a new store instance, is encrypted and absent from safe responses; replacement is immediate",
      async () => {
        await assert.rejects(
          saveConnectionKey(
            ordinary,
            fakeKey,
            (await connection()).revision,
            secrets,
          ),
        );
        await saveConnectionKey(
          owner,
          fakeKey,
          (await connection()).revision,
          secrets,
        );
        const saved = await connection();
        assert.ok(!JSON.stringify(saved).includes(fakeKey));
        const master = await readFile(
          join(directory, saved.vaultId + ".key"),
          "utf8",
        );
        assert.ok(!master.includes(fakeKey));
        assert.equal(
          (await stat(join(directory, saved.vaultId + ".key"))).mode & 0o777,
          0o600,
        );
        const restarted = new LocalSecretStore(directory, false);
        assert.equal(
          await restarted.decrypt(
            saved.vaultId,
            saved.secretStorage!,
            saved.secretCipher!,
          ),
          fakeKey,
        );
        await assert.rejects(
          restarted.decrypt(
            saved.vaultId,
            saved.secretStorage!,
            saved.secretCipher!.slice(0, -5) + "AAAAA",
          ),
        );
        const view = await connectionView(owner);
        assert.equal(view.suffix, fakeKey.slice(-4));
        assert.ok(!JSON.stringify(view).includes(fakeKey));
        for (const field of [
          "secretCipher",
          "secretStorage",
          "vaultId",
          "pairingHash",
        ])
          assert.ok(!(field in view));
        await request();
        assert.equal(requests.at(-1)?.authorization, `Bearer ${fakeKey}`);
        await saveConnectionKey(owner, secondKey, saved.revision, secrets);
        await request();
        assert.equal(requests.at(-1)?.authorization, `Bearer ${secondKey}`);
        await assert.rejects(readFile(join(directory, saved.vaultId + ".key")));
        await assert.rejects(
          saveConnectionKey(owner, fakeKey, saved.revision, secrets),
        );
        await assert.rejects(connectionView(ordinary));
        await assert.rejects(connectionView(candidate));
      },
    );
    await t.test(
      "HTTP endpoint denies other roles, hostile origins and hosts; owner receives only redacted metadata",
      async () => {
        const base = process.env.TEST_ORIGIN ?? "http://localhost:3100";
        assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
        for (const user of [ordinary, candidate, owner]) {
          const token = randomUUID();
          await db.session.create({
            data: {
              userId: user.id,
              tokenHash: tokenHash(token),
              expiresAt: new Date(Date.now() + 60000),
            },
          });
          const cookie = `leader_session=${token}`;
          const r = await localFetch(base + "/api/settings/openai", {
            headers: { cookie },
          });
          assert.equal(r.status, user.id === owner.id ? 200 : 403);
          assert.match(r.headers.get("cache-control") ?? "", /no-store/);
          const raw = await r.text();
          assert.ok(
            !raw.includes(fakeKey) &&
              !raw.includes(secondKey) &&
              !raw.includes("secretCipher"),
          );
          if (user.id !== owner.id)
            assert.equal(
              (
                await localFetch(base + "/api/settings/openai", {
                  method: "POST",
                  headers: {
                    cookie,
                    origin: base,
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ action: "check", revision: 0 }),
                })
              ).status,
              403,
            );
        }
        for (const headers of [
          { origin: "http://attacker.test" },
          {},
        ] as Record<string, string>[]) {
          const r = await localFetch(base + "/api/settings/openai", {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: "{}",
          });
          assert.equal(r.status, 403);
        }
        const hostileHost = await new Promise<number>((resolve, reject) => {
          const req = httpRequest(
            base + "/api/settings/openai",
            {
              method: "POST",
              headers: {
                host: "attacker.test:3100",
                origin: base,
                "content-type": "application/json",
              },
            },
            (r) => {
              r.resume();
              resolve(r.statusCode!);
            },
          );
          req.on("error", reject);
          req.end("{}");
        });
        assert.equal(hostileHost, 403);
      },
    );
    await t.test(
      "catalog is separate from paid operation; unsupported model and invalid key are visible without fallback",
      async () => {
        const count = await db.openAICall.count();
        await checkOpenAIModels(
          permission,
          (await connection()).revision,
          secrets,
        );
        assert.equal(await db.openAICall.count(), count);
        assert.deepEqual((await connectionView(owner)).catalog, [
          "gpt-6-luna",
          "gpt-4o-mini-transcribe",
        ]);
        assert.equal((await audioConfig()).textModel, "gpt-5.4-mini");
        mode = "invalid";
        await assert.rejects(request(), /ACCESS/);
        await assert.rejects(
          checkOpenAIModels(permission, (await connection()).revision, secrets),
          /ACCESS/,
        );
        mode = "unavailable";
        await assert.rejects(request(), /MODEL/);
        mode = "rate";
        await assert.rejects(request(), /RATE/);
        mode = "success";
        assert.equal((await connection()).textModel, "gpt-5.4-mini");
        assert.ok(
          requests
            .filter((r) => r.url.endsWith("responses"))
            .every((r) => r.model === "gpt-5.4-mini"),
        );
      },
    );
    await t.test(
      "real usage, uncertain outcomes and absent usage have distinct cost basis",
      async () => {
        const key = randomUUID();
        await request({ requestKey: key });
        const call = await db.openAICall.findUniqueOrThrow({
          where: { requestKey: key },
        });
        assert.equal(call.costBasis, "USAGE");
        assert.equal(call.chargedMicros, Math.ceil(50 * 0.75 + 10 * 4.5));
        const count = fetches;
        await assert.rejects(request({ requestKey: key }), /DUPLICATE/);
        assert.equal(fetches, count);
        mode = "no-usage";
        const missing = randomUUID();
        await request({ requestKey: missing });
        const estimate = await db.openAICall.findUniqueOrThrow({
          where: { requestKey: missing },
        });
        assert.equal(estimate.costBasis, "ESTIMATE");
        assert.equal(estimate.usage, null);
        assert.equal(estimate.chargedMicros, estimate.reservedMicros);
        mode = "network";
        const network = randomUUID();
        await assert.rejects(request({ requestKey: network }), /NETWORK/);
        const uncertain = await db.openAICall.findUniqueOrThrow({
          where: { requestKey: network },
        });
        assert.equal(uncertain.status, "UNKNOWN");
        assert.ok(uncertain.chargedMicros > 0);
        mode = "success";
      },
    );
    await t.test(
      "parallel reservations and retries cannot exceed budget; expired leases retain their cost",
      async () => {
        const reserve = () =>
          reserveOpenAICall({
            task: "text",
            model: "gpt-5.4-mini",
            requestKey: randomUUID(),
            estimatedMicros: 10000,
            purpose: "CONNECTION_TEST",
          });
        const results = await Promise.allSettled([
          reserve(),
          reserve(),
          reserve(),
          reserve(),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
        const held = await db.openAICall.findMany({
          where: { status: "RESERVED" },
        });
        await db.openAICall.updateMany({
          where: { id: { in: held.map((c) => c.id) } },
          data: { createdAt: new Date(Date.now() - 180000) },
        });
        const next = await reserve();
        assert.ok(
          (
            await db.openAICall.findMany({
              where: { id: { in: held.map((c) => c.id) } },
            })
          ).every((c) => c.status === "UNKNOWN" && c.chargedMicros === 10000),
        );
        await db.openAICall.update({
          where: { id: next.id },
          data: { status: "UNKNOWN", costBasis: "ESTIMATE" },
        });
        const spent = (await connectionView(owner)).spentMicros;
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { limitMicros: spent + 15000, dailyMicros: spent + 15000 },
        });
        const before = await db.openAICall.count();
        const limited = await Promise.allSettled([
          reserve(),
          reserve(),
          reserve(),
        ]);
        assert.equal(limited.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(await db.openAICall.count(), before + 1);
        const sent = fetches;
        await assert.rejects(
          request({
            body: body().replace(
              '"max_output_tokens":64',
              '"max_output_tokens":2400',
            ),
          }),
          /BUDGET/,
        );
        assert.equal(fetches, sent);
        await db.openAICall.updateMany({
          where: { status: "RESERVED" },
          data: { status: "UNKNOWN", costBasis: "ESTIMATE" },
        });
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { limitMicros: 45000000, dailyMicros: 5000000 },
        });
      },
    );
    await t.test(
      "permissions are checked again after reservation; key/model changes do not dispatch stale jobs",
      async () => {
        let checks = 0;
        const before = fetches;
        await assert.rejects(
          request({
            permission: {
              purpose: "CONNECTION_TEST",
              authorize: async () => {
                if (++checks === 2) throw new Error("revoked");
              },
            },
          }),
        );
        assert.equal(fetches, before);
        assert.equal(await audioProviderAvailable(), false);
        await assert.rejects(
          request({
            permission: {
              purpose: "LANGUAGE_CONTENT",
              authorize: async () => {},
            },
          }),
          /DISCONNECTED/,
        );
        const current = await connection();
        await saveConnectionSettings(owner, {
          revision: current.revision,
          textModel: "gpt-6-luna",
          complexModel: current.complexModel,
          transcriptionModel: current.transcriptionModel,
          speechModel: current.speechModel,
          audioEnabled: false,
          startingMicros: 50000000,
          limitMicros: 45000000,
          reserveMicros: 5000000,
          dailyMicros: 5000000,
          parallelLimit: 2,
        });
        await assert.rejects(request(), /CHANGED/);
        await request({ model: "gpt-6-luna", body: body("gpt-6-luna") });
        assert.equal(requests.at(-1)?.model, "gpt-6-luna");
        assert.equal((await audioConfig()).textModel, "gpt-6-luna");
        mode = "cache-writes";
        const cacheKey = randomUUID();
        await request({
          model: "gpt-6-luna",
          body: body("gpt-6-luna"),
          requestKey: cacheKey,
        });
        assert.equal(
          (
            await db.openAICall.findUniqueOrThrow({
              where: { requestKey: cacheKey },
            })
          ).chargedMicros,
          9,
        );
        mode = "success";
        assert.equal(configuredAssessmentProvider(), "local");
      },
    );
    await t.test(
      "bounded transcription and speech run through the same budget without invented tokens",
      async () => {
        const form = new FormData();
        form.set("model", "gpt-4o-mini-transcribe");
        form.set(
          "file",
          new File([new Uint8Array(pcmWav(Buffer.alloc(32000)))], "test.wav"),
        );
        const trans = await requestOpenAI({
          task: "transcription",
          model: "gpt-4o-mini-transcribe",
          body: form,
          signal: new AbortController().signal,
          permission,
          secrets,
        });
        assert.equal(
          (trans.value as { text: string }).text,
          "The library opens at nine.",
        );
        const speech = await requestOpenAI({
          task: "speech",
          model: "gpt-4o-mini-tts",
          body: JSON.stringify({
            model: "gpt-4o-mini-tts",
            input: "Test",
            response_format: "pcm",
          }),
          signal: new AbortController().signal,
          permission,
          secrets,
        });
        assert.ok(Buffer.isBuffer(speech.value));
        const count = fetches;
        await assert.rejects(
          request({
            model: "gpt-6-luna",
            body: body("gpt-6-luna").replace(
              "Connection check",
              "x".repeat(130000),
            ),
          }),
          /INPUT_LIMIT/,
        );
        assert.equal(fetches, count);
        await assert.rejects(
          new OpenAIAudioProvider().transcribe({
            wav: pcmWav(Buffer.alloc(32000)),
            model: "gpt-4o-mini-transcribe",
            signal: new AbortController().signal,
          }),
          /PROVIDER_UNAVAILABLE/,
        );
      },
    );
    await t.test(
      "Vision gate, streaming usage, approved tools and budget are shared with Desk",
      async () => {
        const current = await connection();
        let deltas = "";
        const key = randomUUID();
        const opts = {
          task: "text" as const,
          model: current.textModel,
          requestKey: key,
          body: JSON.stringify({
            ...JSON.parse(body(current.textModel)),
            stream: true,
            tools: [visionTool],
            parallel_tool_calls: false,
          }),
          signal: new AbortController().signal,
          permission: {
            purpose: "VISION_LEARNING" as const,
            authorize: async () => {},
          },
          secrets,
          onDelta: async (text: string) => {
            deltas += text;
          },
        };
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { visionEnabled: false },
        });
        const sent = fetches;
        await assert.rejects(requestOpenAI(opts), /DISCONNECTED/);
        assert.equal(fetches, sent);
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { visionEnabled: true },
        });
        await requestOpenAI(opts);
        assert.equal(deltas, "Ответ");
        const saved = await db.openAICall.findUniqueOrThrow({
          where: { requestKey: key },
        });
        assert.equal(saved.status, "SUCCEEDED");
        assert.equal(saved.costBasis, "USAGE");
        assert.equal(saved.purpose, "VISION_LEARNING");
        await assert.rejects(
          requestOpenAI({
            ...opts,
            requestKey: randomUUID(),
            permission: { purpose: "DESK_FACTS", authorize: async () => {} },
          }),
          /INPUT_LIMIT/,
        );
        await assert.rejects(
          requestOpenAI({
            ...opts,
            requestKey: randomUUID(),
            body: JSON.stringify({
              ...JSON.parse(body(current.textModel)),
              tools: [{ type: "function", name: "shell" }],
            }),
          }),
          /INPUT_LIMIT/,
        );
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { dailyMicros: 0 },
        });
        const count = fetches;
        await assert.rejects(
          requestOpenAI({ ...opts, requestKey: randomUUID() }),
          /BUDGET/,
        );
        assert.equal(fetches, count);
        await db.openAIConnection.update({
          where: { id: "local" },
          data: { dailyMicros: current.dailyMicros },
        });
      },
    );
    await t.test(
      "disconnect removes secret, preserves spending and denies further dispatch",
      async () => {
        const saved = await connection(),
          count = await db.openAICall.count();
        await disconnectConnection(owner, saved.revision, secrets);
        const view = await connectionView(owner);
        assert.equal(view.connected, false);
        assert.equal(view.suffix, null);
        assert.equal(view.audioEnabled, false);
        await assert.rejects(readFile(join(directory, saved.vaultId + ".key")));
        assert.equal(await db.openAICall.count(), count);
        const sent = fetches;
        await assert.rejects(
          request({ model: "gpt-6-luna", body: body("gpt-6-luna") }),
          /DISCONNECTED/,
        );
        assert.equal(fetches, sent);
      },
    );
  } finally {
    // Only this suite's empty installation and fictional owner are removed.
    if (ownerId && (await connection()).ownerId === ownerId) {
      await db.openAICall.deleteMany({ where: { connectionId: "local" } });
      await db.openAIConnection.delete({ where: { id: "local" } });
    }
    await db.user.deleteMany({
      where: {
        id: { in: [ordinary.id, candidate.id, ...(ownerId ? [ownerId] : [])] },
      },
    });
    await rm(directory, { recursive: true, force: true });
    if (originalOrigin === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = originalOrigin;
    await db.$disconnect();
  }
});
