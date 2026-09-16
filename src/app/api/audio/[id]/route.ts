import { NextResponse } from "next/server";
import { requireUser, AppError } from "@/lib/security";
import { audioArtifact } from "@/lib/audio-service.server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireUser();
    return NextResponse.json(
      { ok: true, data: await audioArtifact((await params).id, actor) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof AppError ? e.message : "Не удалось открыть обработку.",
      },
      { status: e instanceof AppError ? e.status : 500 },
    );
  }
}
