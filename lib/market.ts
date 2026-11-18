import YahooFinance from "yahoo-finance2";

// Unofficial Yahoo Finance data. Good for personal use; switch to a broker API
// (Upstox, Angel One, Dhan, Kite) if you turn this into a product.
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type LowStatus = "at_low" | "near_low" | "ok";

export type LowCheck = {
  symbol: string;
  price: number;
  todayLow: number;
  low3m: number;      // lowest low of the previous ~3 months, excluding today
  low3mDate: string;  // YYYY-MM-DD
  high3m: number;
  distancePct: number; // how far price is above low3m, in %
  status: LowStatus;
  low52w?: number;     // lowest low of the last 52 weeks, including today
  avg52w?: number;     // average daily close over the last 52 weeks
};

export type CheckRules = {
  basis: "close" | "intraday";
  nearPct: number;
};

export function rulesFromEnv(): CheckRules {
  const basis = process.env.ALERT_BASIS === "intraday" ? "intraday" : "close";
  const near = Number(process.env.NEAR_LOW_PCT ?? "0");
  return { basis, nearPct: Number.isFinite(near) && near > 0 ? near : 0 };
}

type Bar = { date: Date; low: number; high: number; close: number };

/** Pure logic: is the latest price at (or near) the lowest low of the earlier bars? */
export function evaluateBars(symbol: string, bars: Bar[], livePrice: number | undefined, rules: CheckRules): LowCheck {
  if (bars.length < 20) {
    throw new Error(`Not enough price history for ${symbol} (${bars.length} days)`);
  }
  const today = bars[bars.length - 1];
  const prior = bars.slice(0, -1);

  let lowBar = prior[0];
  for (const b of prior) if (b.low < lowBar.low) lowBar = b;
  const high3m = Math.max(...bars.map((b) => b.high));

  const price = livePrice ?? today.close;
  const todayLow = Math.min(today.low, price);
  const compareTo = rules.basis === "intraday" ? todayLow : price;
  const low3m = lowBar.low;
  const distancePct = ((price - low3m) / low3m) * 100;

  let status: LowStatus = "ok";
  if (compareTo <= low3m) status = "at_low";
  else if (rules.nearPct > 0 && distancePct <= rules.nearPct) status = "near_low";

  return {
    symbol,
    price,
    todayLow,
    low3m,
    low3mDate: lowBar.date.toISOString().slice(0, 10),
    high3m,
    distancePct,
    status,
  };
}

export async function checkStock(symbol: string, rules: CheckRules): Promise<LowCheck> {
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const result = await yf.chart(symbol, { period1: yearAgo, interval: "1d" });
  const yearBars = result.quotes.filter(
    (q) => q.low != null && q.high != null && q.close != null,
  ) as Bar[];
  const livePrice = result.meta.regularMarketPrice;

  const check = evaluateBars(
    symbol,
    yearBars.filter((b) => b.date >= threeMonthsAgo),
    livePrice,
    rules,
  );

  let low52w = Math.min(...yearBars.map((b) => b.low));
  if (livePrice != null) low52w = Math.min(low52w, livePrice);
  const avg52w = yearBars.reduce((sum, b) => sum + b.close, 0) / yearBars.length;

  return { ...check, low52w, avg52w };
}

export type SearchHit = { symbol: string; name: string; exchange: "NSE" | "BSE" };

export type Exchange = "NSE" | "BSE";

/** Exchanges enabled by STOCK_EXCHANGE in .env: "NSE", "BSE" or "BOTH" (default). */
export function exchangesFromEnv(): Exchange[] {
  const v = (process.env.STOCK_EXCHANGE ?? "BOTH").trim().toUpperCase();
  if (v === "NSE") return ["NSE"];
  if (v === "BSE") return ["BSE"];
  return ["NSE", "BSE"];
}

export function exchangeOf(symbol: string): Exchange | null {
  return symbol.endsWith(".NS") ? "NSE" : symbol.endsWith(".BO") ? "BSE" : null;
}

export async function searchIndianStocks(query: string): Promise<SearchHit[]> {
  const res = await yf.search(query, { quotesCount: 15, newsCount: 0 });
  const allowed = exchangesFromEnv();
  const hits: SearchHit[] = [];
  for (const q of res.quotes) {
    if (!("isYahooFinance" in q) || !q.isYahooFinance) continue;
    if (q.quoteType !== "EQUITY") continue;
    const exchange = exchangeOf(q.symbol);
    if (!exchange || !allowed.includes(exchange)) continue;
    hits.push({ symbol: q.symbol, name: q.longname ?? q.shortname ?? q.symbol, exchange });
  }
  return hits;
}
