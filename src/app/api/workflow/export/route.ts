import { NextResponse } from "next/server";
import { requireStaff, AppError } from "@/lib/security";
import { workflowRows } from "@/lib/workflow-service.server";
import { workflowSummary } from "@/lib/workflow-contract";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const rows = await workflowRows(await requireStaff());
    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        timeDefinition:
          "Wall elapsed and elapsed minus explicit pauses; not attention.",
        summary: workflowSummary(rows),
        sessions: rows,
      },
      {
        headers: {
          ...headers,
          "Content-Disposition": 'attachment; filename="workflow-results.json"',
        },
      },
    );
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json(
        { error: e.message },
        { status: e.status, headers },
      );
    throw e;
  }
}
