import { actor, AppError } from "@/lib/security";
import { readAvatar } from "@/lib/avatar.server";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await actor();
    if (!u) throw new AppError("Войди в аккаунт.", 401);
    const url = new URL(req.url);
    const bytes = await readAvatar(
      u,
      (await params).id,
      Number(url.searchParams.get("v")),
      url.searchParams.get("size") === "large",
    );
    return new Response(bytes, {
      headers: { ...headers, "Content-Type": "image/webp" },
    });
  } catch (e) {
    return new Response(
      e instanceof AppError ? e.message : "Фото недоступно.",
      { status: e instanceof AppError ? e.status : 404, headers },
    );
  }
}
