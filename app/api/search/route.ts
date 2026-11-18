import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { searchIndianStocks } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchIndianStocks(q.slice(0, 60)) });
  } catch (e) {
    return NextResponse.json(
      { results: [], error: `Search failed: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    );
  }
}
