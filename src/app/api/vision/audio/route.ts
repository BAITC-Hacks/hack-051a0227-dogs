import { after, NextResponse } from "next/server";
import { actor, checkOrigin, AppError, rateLimit } from "@/lib/security";
import {
  enqueueVisionAudio,
  processVisionAudio,
  synthesizeVision,
  visionAudioCommand,
  visionAudioStatus,
  latestVisionDictation,
} from "@/lib/vision-audio.server";
import { visionError } from "@/lib/vision-service.server";
import { accessFor } from "@/lib/access.server";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await actor();
    if (!user) throw new AppError("Сессия закончилась.", 401);
    if (await accessFor(user) !== "FULL") throw new AppError("Голосовой учебный разбор откроется после подачи заявки.", 403);
    if (Number(req.headers.get("content-length")) > 9 * 1024 * 1024)
      throw new AppError("Файл слишком большой.", 413);
    let data: {
      id?: string;
      jobId?: string | null;
      status?: string;
      text?: string;
      error?: string | null;
      attempts?: number;
      cached?: boolean;
    };
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      await rateLimit("vision-audio:" + user.id, 20);
      const form = await req.formData(),
        file = form.get("file");
      if (!(file instanceof File)) throw new AppError("Выбери аудиофайл.");
      data = await enqueueVisionAudio(
        user,
        JSON.parse(String(form.get("scope"))),
        file,
        String(form.get("requestKey")),
      );
      after(() => processVisionAudio(data.jobId!));
    } else {
      const raw = await req.text();
      if (raw.length > 12000)
        throw new AppError("Запрос слишком большой.", 413);
      const b = JSON.parse(raw);
      await rateLimit(
        (b.command === "status" ? "vision-audio-status:" : "vision-audio:") +
          user.id,
        b.command === "status" ? 120 : 20,
      );
      if (b.command === "latest") {
        data = await latestVisionDictation(user, b.scope);
      } else if (b.command === "status") {
        data = await visionAudioStatus(user, String(b.id));
        if (["QUEUED", "TRANSCRIBING"].includes(data.status ?? ""))
          after(() => processVisionAudio(data.jobId!));
      } else if (["cancel", "retry"].includes(b.command)) {
        data = await visionAudioCommand(user, String(b.id), b.command);
        if (b.command === "retry") after(() => processVisionAudio(data.jobId!));
      } else
        data = await synthesizeVision(
          user,
          b,
          AbortSignal.any([req.signal, AbortSignal.timeout(60000)]),
        );
    }
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } },
    );
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
