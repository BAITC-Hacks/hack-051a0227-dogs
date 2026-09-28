import { actor } from "@/lib/security";
import { accessFor } from "@/lib/access.server";
import { db } from "@/lib/db";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await actor();
  if (!user) return new Response(null, { status: 401 });
  if (await accessFor(user) !== "FULL") return new Response(null, { status: 403 });
  const media = await db.learningMedia.findFirst({ where: { id: (await params).id, userId: user.id } });
  if (!media) return new Response(null, { status: 404 });
  return new Response(media.bytes, { headers: { "Content-Type": media.mime, "Content-Length": String(media.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
