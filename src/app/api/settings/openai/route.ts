import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  actor,
  AppError,
  rateLimit,
  requireStaff,
  setSession,
} from "@/lib/security";
import {
  assertConnectionOwner,
  beginOwnerSetup,
  checkConnectionRequest,
  completeOwnerSetup,
  connectionView,
  disconnectConnection,
  saveConnectionKey,
  saveConnectionSettings,
} from "@/lib/openai-settings.server";
import {
  checkOpenAIModels,
  OpenAIError,
  requestOpenAI,
  selectedModel,
} from "@/lib/openai-gateway.server";
import { openaiMessages } from "@/lib/openai-policy";
import { decodeAudio, pcmWav } from "@/lib/audio-media.server";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers },
    );
  if (error instanceof OpenAIError)
    return NextResponse.json(
      {
        error:
          openaiMessages[error.code] ??
          (error.code === "DUPLICATE"
            ? "Этот запрос уже учтён. Обновите расходы перед новым запуском."
            : "Не удалось выполнить проверку."),
        code: error.code,
      },
      { status: 409, headers },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error:
          error.issues.find((issue) => issue.code === "custom")?.message ??
          "Проверьте поля: ключ, модели и ограничения должны соответствовать указанным условиям.",
      },
      { status: 400, headers },
    );
  // No raw error, request body, upstream payload, storage path or secret is logged/returned.
  return NextResponse.json(
    {
      error:
        "Не удалось завершить действие. Сохранённые настройки доступны после обновления.",
    },
    { status: 503, headers },
  );
}
export async function GET(req: Request) {
  try {
    checkConnectionRequest(req.headers);
    return NextResponse.json(await connectionView(await actor()), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    checkConnectionRequest(req.headers, true);
    const user = await requireStaff();
    await rateLimit("openai-settings:" + user.id, 30);
    if (
      !req.headers.get("content-type")?.startsWith("application/json") ||
      Number(req.headers.get("content-length")) > 8000
    )
      throw new AppError("Недопустимый запрос.", 413);
    const raw = await req.text();
    if (raw.length > 8000) throw new AppError("Слишком большой запрос.", 413);
    const b = JSON.parse(raw);
    if (b.action === "setup.begin") {
      await rateLimit("openai-setup", 3, 600000);
      await beginOwnerSetup(user, b.email);
      return NextResponse.json({ ok: true }, { headers });
    }
    if (b.action === "setup.complete") {
      await rateLimit("openai-setup-attempt", 5, 180000);
      const owner = await completeOwnerSetup(user, b.owner);
      await setSession(owner.id);
      return NextResponse.json({ ok: true }, { headers });
    }
    const config = await assertConnectionOwner(user);
    const revision = z.number().int().nonnegative().parse(b.revision);
    if (b.action === "key.save") await saveConnectionKey(user, b.key, revision);
    else if (b.action === "disconnect")
      await disconnectConnection(user, revision);
    else if (b.action === "settings.save")
      await saveConnectionSettings(user, { ...b.settings, revision });
    else {
      const permission = {
        purpose: "CONNECTION_TEST" as const,
        authorize: async () => {
          const current = await assertConnectionOwner(await actor());
          if (current.revision !== revision) throw new OpenAIError("CHANGED");
        },
      };
      if (b.action === "check") await checkOpenAIModels(permission, revision);
      else if (b.action === "probe") {
        const task = z
          .enum(["text", "complex", "transcription", "speech"])
          .parse(b.task);
        const requestKey = z.uuid().parse(b.requestKey);
        if (b.confirmPaid !== true)
          throw new AppError("Подтвердите платную проверку.");
        const model = selectedModel(config, task);
        let body: string | FormData;
        if (task === "transcription") {
          const sample = await decodeAudio(
            await readFile(
              join(process.cwd(), "public/audio/connection-check.wav"),
            ),
            "audio/wav",
          );
          body = new FormData();
          body.set("model", model);
          body.set("response_format", "json");
          body.set(
            "file",
            new File([new Uint8Array(sample.wav)], "connection-check.wav", {
              type: "audio/wav",
            }),
          );
        } else if (task === "speech")
          body = JSON.stringify({
            model,
            input:
              "Проверка подключения. Звук создан искусственным интеллектом.",
            voice: "alloy",
            response_format: "pcm",
          });
        else
          body = JSON.stringify({
            model,
            store: false,
            service_tier: "default",
            reasoning: { effort: "none" },
            max_output_tokens: 64,
            input:
              "Ответь одной короткой фразой на русском: соединение работает. Это техническая проверка без персональных данных.",
          });
        const result = await requestOpenAI({
          task,
          model,
          body,
          signal: req.signal,
          permission,
          revision,
          requestKey,
        });
        if (task === "speech")
          return new Response(
            new Uint8Array(pcmWav(result.value as Buffer, 24000)),
            { headers: { ...headers, "Content-Type": "audio/wav" } },
          );
        const value = result.value as {
          text?: string;
          status?: string;
          output?: { content?: { type?: string; text?: string }[] }[];
        };
        const text =
          task === "transcription"
            ? value.text
            : value.status === "completed"
              ? value.output
                  ?.flatMap((o) => o.content ?? [])
                  .filter((c) => c.type === "output_text")
                  .map((c) => c.text)
                  .join("")
              : undefined;
        if (!text?.trim()) throw new OpenAIError("RESPONSE");
        return NextResponse.json(
          { ok: true, text: text.slice(0, 2000) },
          { headers },
        );
      } else throw new AppError("Неизвестное действие.");
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    return failure(error);
  }
}
