import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { runCheck } from "@/lib/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by the scheduled job (Bearer CRON_SECRET) or the "Check now" button.
export async function POST(req: Request) {
  if (!isAuthorized(req, { allowCron: true })) return unauthorized();
  try {
    const summary = await runCheck();
    return NextResponse.json(summary, { status: summary.telegramError ? 502 : 200 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
