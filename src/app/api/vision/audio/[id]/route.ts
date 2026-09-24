import { actor, AppError } from "@/lib/security";
import { accessibleMedia } from "@/lib/vision-audio.server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await actor();
    if (!user) throw new AppError("Сессия закончилась.", 401);
    const media = await accessibleMedia(user, (await params).id);
    return new Response(new Uint8Array(media.bytes), {
      headers: {
        "Content-Type": media.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof AppError ? e.message : "Запись недоступна." },
      {
        status: e instanceof AppError ? e.status : 404,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
