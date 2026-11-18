import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { sendTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  try {
    await sendTelegram("✅ Aditya Share Market is connected. You'll get 3-month low alerts here.");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
