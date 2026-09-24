import { NextResponse } from "next/server";
import { actor, checkOrigin, AppError } from "@/lib/security";
import { visionAsk, visionError } from "@/lib/vision-service.server";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await actor();
    if (!user) throw new AppError("Сессия закончилась. Войди снова.", 401);
    const raw = await req.text();
    if (raw.length > 12000) throw new AppError("Слишком большой вопрос.", 413);
    const input = JSON.parse(raw),
      controller = new AbortController(),
      signal = AbortSignal.any([
        req.signal,
        controller.signal,
        AbortSignal.timeout(90000),
      ]);
    const stream = new ReadableStream({
      async start(out) {
        const send = async (type: string, value: unknown) => {
          signal.throwIfAborted();
          out.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type, value })}\n\n`,
            ),
          );
        };
        try {
          await visionAsk(user, input, signal, send, undefined, async () => {
            if ((await actor())?.id !== user.id)
              throw new AppError("Сессия закончилась. Войди снова.", 401);
          });
        } catch (e) {
          try {
            out.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "error", value: visionError(e) })}\n\n`,
              ),
            );
          } catch {}
        } finally {
          try {
            out.close();
          } catch {}
        }
      },
      cancel() {
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: visionError(e) },
      {
        status: e instanceof AppError ? e.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
