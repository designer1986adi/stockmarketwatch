import { NextResponse } from "next/server";
import { isAuthorized, unauthorized } from "@/lib/auth";
import { db, type StockRow } from "@/lib/supabase";
import { refreshStock } from "@/lib/check";
import { exchangeOf, exchangesFromEnv } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYMBOL_RE = /^[A-Z0-9&\-]{1,25}\.(NS|BO)$/;

export async function GET(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const [stocks, alerts] = await Promise.all([
    db().from("stocks").select("*").in("exchange", exchangesFromEnv()).order("symbol"),
    db().from("alerts").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  if (stocks.error) return NextResponse.json({ error: stocks.error.message }, { status: 500 });
  if (alerts.error) return NextResponse.json({ error: alerts.error.message }, { status: 500 });
  return NextResponse.json({ stocks: stocks.data, alerts: alerts.data, exchanges: exchangesFromEnv() });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { symbol?: string; name?: string };
  const symbol = (body.symbol ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json(
      { error: "Use a Yahoo symbol ending in .NS (NSE) or .BO (BSE), for example RELIANCE.NS" },
      { status: 400 },
    );
  }

  const exchange = exchangeOf(symbol)!;
  const allowed = exchangesFromEnv();
  if (!allowed.includes(exchange)) {
    return NextResponse.json(
      { error: `This app is set to ${allowed.join(" and ")} only (STOCK_EXCHANGE in .env).` },
      { status: 400 },
    );
  }

  const { data, error } = await db()
    .from("stocks")
    .insert({
      symbol,
      name: (body.name ?? "").slice(0, 120) || null,
      exchange,
    })
    .select()
    .single();

  if (error) {
    const msg = error.code === "23505" ? `${symbol} is already on your watchlist` : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "23505" ? 409 : 500 });
  }

  // Fill in price and 3-month range right away (no alert is sent here).
  await refreshStock(data as StockRow);
  return NextResponse.json({ ok: true }, { status: 201 });
}
