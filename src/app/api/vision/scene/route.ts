import { NextResponse } from "next/server";
import { actor, AppError, checkOrigin } from "@/lib/security";
import { askScene } from "@/lib/vision-scene.server";
import { visionError } from "@/lib/vision-service.server";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await actor();
    if (!user) throw new AppError("Сессия закончилась.", 401);
    const raw = await req.text();
    if (raw.length > 6000) throw new AppError("Вопрос слишком длинный.", 413);
    const data = await askScene(
      user,
      JSON.parse(raw),
      AbortSignal.any([req.signal, AbortSignal.timeout(60000)]),
      undefined,
      async () => {
        if ((await actor())?.id !== user.id)
          throw new AppError("Сессия закончилась.", 401);
      },
    );
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: visionError(e) },
      {
        status: e instanceof AppError ? e.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
