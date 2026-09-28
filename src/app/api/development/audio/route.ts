import { checkOrigin, AppError } from "@/lib/security";
import { requireFullCandidate } from "@/lib/access.server";
import { skillNode } from "@/lib/skill-tree-catalog";
import { decodeAudio } from "@/lib/audio-media.server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireFullCandidate();
    if (Number(req.headers.get("content-length")) > 8 * 1024 * 1024) throw new AppError("Запись слишком велика.", 413);
    const form = await req.formData();
    const nodeId = String(form.get("nodeId") ?? "");
    const node = skillNode(nodeId);
    if (node?.type !== "AUDIO_RESPONSE") throw new AppError("Устное задание недоступно.", 404);
    const prerequisites = await db.learningCompletion.count({ where: { userId: user.id, nodeId: { in: node.prerequisites } } });
    if (prerequisites !== node.prerequisites.length) throw new AppError("Сначала открой предыдущие узлы ветви.", 409);
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 128 || file.size > 8 * 1024 * 1024 || !["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"].includes(file.type)) throw new AppError("Выбери запись до 8 МБ.", 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    await decodeAudio(bytes, file.type);
    const media = await db.learningMedia.create({ data: { userId: user.id, nodeId, mime: file.type, bytes, size: file.size } });
    return Response.json({ ok: true, data: { id: media.id } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof AppError ? error.message : "Запись не удалось сохранить." }, { status: error instanceof AppError ? error.status : 400 });
  }
}
