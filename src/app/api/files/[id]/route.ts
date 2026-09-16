import { db } from "@/lib/db";
import { actor } from "@/lib/security";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await actor();
  if (!u) return new Response("Войдите в аккаунт.", { status: 401 });
  const { id } = await params;
  const m = await db.material.findUnique({
    where: { id },
    include: { application: { select: { submittedAt: true } } },
  });
  if (
    !m ||
    !(m.userId === u.id || (u.role === "STAFF" && m.application?.submittedAt))
  )
    return new Response("Файл недоступен.", { status: 404 });
  const headers = {
    "Content-Type": m.mime,
    "Content-Disposition": `${m.mime.startsWith("audio/") || m.mime.startsWith("video/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(m.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = req.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416 });
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : m.size - 1, m.size - 1);
    if (start > end || start >= m.size)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${m.size}` },
      });
    return new Response(m.bytes.slice(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${m.size}`,
      },
    });
  }
  return new Response(m.bytes, {
    headers: { ...headers, "Content-Length": String(m.size) },
  });
}
