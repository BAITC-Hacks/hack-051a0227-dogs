import { NextResponse } from "next/server";
import {
  completeGoogleOAuth,
  googleConfiguration,
} from "@/lib/google-calendar.server";
export async function GET(req: Request) {
  const url = new URL(req.url),
    target = new URL("/settings/calendar", googleConfiguration().redirectUri);
  try {
    await completeGoogleOAuth(
      url.searchParams.get("code") ?? "",
      url.searchParams.get("state") ?? "",
    );
    target.searchParams.set("connected", "1");
  } catch {
    target.searchParams.set("error", "connection");
  }
  return NextResponse.redirect(target, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
