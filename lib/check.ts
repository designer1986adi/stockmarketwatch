import { db, type StockRow } from "@/lib/supabase";
import { checkStock, exchangesFromEnv, rulesFromEnv, type LowCheck, type CheckRules } from "@/lib/market";
import { sendTelegram, escapeHtml } from "@/lib/telegram";

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

function checkToColumns(c: LowCheck) {
  return {
    last_price: c.price,
    low_3m: c.low3m,
    low_3m_date: c.low3mDate,
    high_3m: c.high3m,
    low_52w: c.low52w ?? null,
    avg_52w: c.avg52w != null ? Number(c.avg52w.toFixed(2)) : null,
    distance_pct: Number(c.distancePct.toFixed(2)),
    status: c.status,
    last_checked_at: new Date().toISOString(),
    last_error: null,
  };
}

/** Refreshes one stock's numbers without sending alerts (used right after adding it). */
export async function refreshStock(stock: Pick<StockRow, "id" | "symbol">, rules: CheckRules = rulesFromEnv()) {
  try {
    const c = await checkStock(stock.symbol, rules);
    const { error } = await db().from("stocks").update(checkToColumns(c)).eq("id", stock.id);
    if (error) throw new Error(`Couldn't save prices: ${error.message}`);
  } catch (e) {
    await db()
      .from("stocks")
      .update({ status: "error", last_error: String(e instanceof Error ? e.message : e), last_checked_at: new Date().toISOString() })
      .eq("id", stock.id);
  }
}

type Outcome = { stock: StockRow; check?: LowCheck; error?: string };

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type CheckSummary = {
  checked: number;
  failed: number;
  alerts: { symbol: string; kind: string; price: number }[];
  telegramError?: string;
};

/** Checks every stock in the watchlist and sends one Telegram message for new alerts. */
export async function runCheck(): Promise<CheckSummary> {
  const rules = rulesFromEnv();
  const today = todayIST();

  const { data, error } = await db().from("stocks").select("*").in("exchange", exchangesFromEnv()).order("symbol");
  if (error) throw new Error(error.message);
  const stocks = (data ?? []) as StockRow[];

  const outcomes: Outcome[] = await mapLimited(stocks, 4, async (stock) => {
    try {
      return { stock, check: await checkStock(stock.symbol, rules) };
    } catch (e) {
      return { stock, error: e instanceof Error ? e.message : String(e) };
    }
  });

  // Save fresh numbers for every stock.
  const saves = await Promise.all(
    outcomes.map(({ stock, check, error: err }) =>
      db()
        .from("stocks")
        .update(
          check
            ? checkToColumns(check)
            : { status: "error", last_error: err, last_checked_at: new Date().toISOString() },
        )
        .eq("id", stock.id),
    ),
  );
  const saveError = saves.find((r) => r.error)?.error;
  if (saveError) throw new Error(`Couldn't save prices: ${saveError.message}`);

  // Decide which stocks need a new alert: once per stock per day,
  // plus one more if it goes from "near low" to "at low" the same day.
  const toAlert = outcomes.filter(({ stock, check }) => {
    if (!check || check.status === "ok") return false;
    if (stock.last_alert_date !== today) return true;
    return stock.last_alert_status === "near_low" && check.status === "at_low";
  }) as Required<Pick<Outcome, "stock" | "check">>[];

  const summary: CheckSummary = {
    checked: outcomes.filter((o) => o.check).length,
    failed: outcomes.filter((o) => o.error).length,
    alerts: [],
  };
  if (toAlert.length === 0) return summary;

  const lines = toAlert.map(({ stock, check }) => {
    const label = escapeHtml(stock.symbol.replace(/\.(NS|BO)$/, ""));
    const exch = stock.exchange ?? "";
    const verdict =
      check.status === "at_low"
        ? `At 3-month low. Previous low ${inr.format(check.low3m)} on ${check.low3mDate}`
        : `${check.distancePct.toFixed(2)}% above 3-month low of ${inr.format(check.low3m)}`;
    return `<b>${label}</b> ${exch} ${inr.format(check.price)}\n${verdict}`;
  });
  const message = `📉 <b>3-month low alert</b>\n\n${lines.join("\n\n")}`;

  try {
    await sendTelegram(message);
  } catch (e) {
    // Don't mark as alerted, so the next run tries again.
    summary.telegramError = e instanceof Error ? e.message : String(e);
    return summary;
  }

  await db().from("alerts").insert(
    toAlert.map(({ stock, check }) => ({
      stock_id: stock.id,
      symbol: stock.symbol,
      kind: check.status,
      price: check.price,
      low_3m: check.low3m,
    })),
  );
  await Promise.all(
    toAlert.map(({ stock, check }) =>
      db().from("stocks").update({ last_alert_date: today, last_alert_status: check.status }).eq("id", stock.id),
    ),
  );

  summary.alerts = toAlert.map(({ stock, check }) => ({ symbol: stock.symbol, kind: check.status, price: check.price }));
  return summary;
}
