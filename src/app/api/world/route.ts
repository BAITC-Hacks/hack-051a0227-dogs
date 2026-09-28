import { NextResponse } from "next/server";
import { z } from "zod";
import { requireFullCandidate } from "@/lib/access.server";
import { AppError, checkOrigin } from "@/lib/security";
import { worldAction } from "@/lib/world/world.server";

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    if (Number(req.headers.get("content-length")) > 4000)
      throw new AppError("Слишком большой запрос.", 413);
    const body = await req.json();
    const data = await worldAction(body, await requireFullCandidate());
    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 500;
    return NextResponse.json(
      {
        ok: false,
        error:
          status === 500
            ? "Не удалось сохранить мир."
            : error instanceof Error
              ? error.message
              : "Действие недоступно.",
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
