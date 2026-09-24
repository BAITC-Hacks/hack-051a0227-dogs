import { z } from "zod";
import { AppError, checkOrigin, rateLimit, requireUser } from "@/lib/security";
import {
  avatarLimit,
  cropSchema,
  prepareAvatar,
  saveAvatar,
} from "@/lib/avatar.server";
const headers = { "Cache-Control": "private, no-store" };
async function change(req: Request) {
  try {
    checkOrigin(req);
    const u = await requireUser();
    await rateLimit(`avatar:${u.id}`, 12);
    if (Number(req.headers.get("content-length")) > avatarLimit + 16384)
      throw new AppError("Фото должно быть не больше 5 МБ.", 413);
    // Bound streamed requests too; Content-Length alone is not an upload limit.
    const reader = req.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > avatarLimit + 16384) {
          await reader.cancel();
          throw new AppError("Фото должно быть не больше 5 МБ.", 413);
        }
        chunks.push(value);
      }
    const raw = Buffer.concat(chunks);
    const copy = new Request(req.url, {
      method: req.method,
      headers: req.headers,
      body: raw,
    });
    if (req.method === "DELETE") {
      const b = await copy.json();
      return Response.json(
        await saveAvatar(
          u,
          z.number().int().nonnegative().parse(b.revision),
          null,
        ),
        { headers },
      );
    }
    const form = await copy.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new AppError("Выбери фото.");
    const revision = z.coerce
      .number()
      .int()
      .nonnegative()
      .parse(form.get("revision"));
    const crop = cropSchema.parse(JSON.parse(String(form.get("crop"))));
    const image = await prepareAvatar(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      crop,
    );
    return Response.json(await saveAvatar(u, revision, image), { headers });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "Не удалось сохранить фото. Проверь файл и повтори.",
      },
      { status: e instanceof AppError ? e.status : 400, headers },
    );
  }
}
export const POST = change;
export const DELETE = change;
