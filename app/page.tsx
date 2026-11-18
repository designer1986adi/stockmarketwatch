"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AlertRow, StockRow } from "@/lib/supabase";

type Hit = { symbol: string; name: string; exchange: "NSE" | "BSE" };
type Notice = { text: string; bad?: boolean } | null;

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

function ticker(symbol: string) {
  return symbol.replace(/\.(NS|BO)$/, "");
}

function statusText(s: StockRow): string {
  if (s.status === "error") return s.last_error ?? "Couldn't fetch price";
  if (s.status === "at_low") return "At 3-month low";
  if (s.distance_pct == null) return "Waiting for first check";
  const pct = `${Number(s.distance_pct).toFixed(1)}% above low`;
  return s.status === "near_low" ? `Near low, ${pct}` : pct;
}

function money(v: number | null): string {
  return v != null ? inr.format(v) : "—";
}

// If the session has expired, go back to the login page.
async function api(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    window.location.replace("/login");
    throw new Error("signed out");
  }
  return res;
}

export default function Home() {
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [exchanges, setExchanges] = useState<string[]>(["NSE", "BSE"]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "done" | "error">("idle");
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    const res = await api("/api/stocks", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setNotice({ text: data.error ?? "Couldn't load your watchlist", bad: true });
    } else {
      setStocks(data.stocks);
      setAlerts(data.alerts);
      if (data.exchanges) setExchanges(data.exchanges);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Search as you type (debounced)
  useEffect(() => {
    const q = query.trim();
    const seq = ++searchSeq.current;
    if (q.length < 2) {
      setHits([]);
      setSearchState("idle");
      return;
    }
    setSearchState("searching");
    const t = setTimeout(async () => {
      try {
        const res = await api(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        setHits(data.results ?? []);
        setSearchState(res.ok ? "done" : "error");
      } catch {
        if (seq === searchSeq.current) {
          setHits([]);
          setSearchState("error");
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function add(hit: Hit) {
    setBusy(`add:${hit.symbol}`);
    setHits([]);
    setQuery("");
    const res = await api("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: hit.symbol, name: hit.name }),
    });
    const data = await res.json();
    setNotice(res.ok ? { text: `Added ${ticker(hit.symbol)} to your watchlist.` } : { text: data.error, bad: true });
    await load();
    setBusy(null);
  }

  async function remove(s: StockRow) {
    if (!confirm(`Remove ${ticker(s.symbol)} from your watchlist?`)) return;
    setBusy(`del:${s.id}`);
    const res = await api(`/api/stocks/${s.id}`, { method: "DELETE" });
    if (!res.ok) setNotice({ text: `Couldn't remove ${ticker(s.symbol)}. Try again.`, bad: true });
    await load();
    setBusy(null);
  }

  async function checkNow() {
    setBusy("check");
    setNotice(null);
    const res = await api("/api/check", { method: "POST" });
    const data = await res.json();
    if (data.error) setNotice({ text: data.error, bad: true });
    else if (data.telegramError) setNotice({ text: `Prices updated, but the Telegram message failed: ${data.telegramError}`, bad: true });
    else {
      const n = data.alerts.length;
      setNotice({
        text: `Checked ${data.checked} stock${data.checked === 1 ? "" : "s"}. ${
          n ? `Sent ${n} alert${n === 1 ? "" : "s"} to Telegram.` : "No new alerts."
        }${data.failed ? ` ${data.failed} couldn't be fetched.` : ""}`,
      });
    }
    await load();
    setBusy(null);
  }

  async function signOut() {
    setBusy("out");
    await fetch("/api/logout", { method: "POST" });
    window.location.replace("/login");
  }

  async function testTelegram() {
    setBusy("tg");
    const res = await api("/api/telegram-test", { method: "POST" });
    const data = await res.json();
    setNotice(res.ok ? { text: "Test message sent. Check Telegram." } : { text: data.error, bad: true });
    setBusy(null);
  }

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Aditya Share Market</h1>
          <p>Telegram alerts when a stock on your list falls to its lowest price in 3 months.</p>
        </div>
        <div className="actions">
          <button onClick={testTelegram} disabled={busy !== null}>
            {busy === "tg" ? "Sending…" : "Send test alert"}
          </button>
          <button className="primary" onClick={checkNow} disabled={busy !== null || stocks.length === 0}>
            {busy === "check" ? "Checking…" : "Check prices now"}
          </button>
          <button onClick={signOut} disabled={busy !== null}>
            Sign out
          </button>
        </div>
      </header>

      {notice && (
        <p className={`notice${notice.bad ? " bad" : ""}`} role="status">
          {notice.text}
        </p>
      )}

      <div className="search">
        <label htmlFor="q">Add a stock</label>
        <input
          id="q"
          type="search"
          autoComplete="off"
          placeholder="Company name or symbol, e.g. Tata Motors"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setHits([])}
        />
        <div className={`hint${searchState === "error" ? " bad" : ""}`} role="status">
          {searchState === "searching"
            ? "Searching…"
            : searchState === "error"
              ? "Search isn't working right now. Make sure the app is running, then try again."
              : searchState === "done" && hits.length === 0
                ? `No ${exchanges.join(" or ")} shares match that.`
                : `${exchanges.join(" and ")} listed shares.`}
        </div>
        {hits.length > 0 && (
          <ul className="results">
            {hits.map((h) => (
              <li key={h.symbol}>
                <button className="hit" onClick={() => add(h)} disabled={busy !== null}>
                  <span>{h.name}</span>
                  <small>
                    {ticker(h.symbol)} {h.exchange}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section>
        <h2>Watchlist</h2>
        {!loaded && <div className="list empty">Loading your watchlist…</div>}
        {loaded && stocks.length === 0 && (
          <div className="list empty">
            <strong>No stocks yet.</strong>
            Search above to add your first one. You&apos;ll get a Telegram alert when it reaches its 3-month low.
          </div>
        )}
        {stocks.length > 0 && (
          <div className="list table-wrap">
            <table className="stocks">
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col" className="n">Current price</th>
                  <th scope="col" className="n">52-week low</th>
                  <th scope="col" className="n">52-week average</th>
                  <th scope="col">vs 3-month low</th>
                  <th scope="col"><span className="sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((s) => (
                  <tr key={s.id} className={s.status ?? ""}>
                    <th scope="row" className="who">
                      <strong>
                        {ticker(s.symbol)} <small>{s.exchange}</small>
                      </strong>
                      <span title={s.name ?? ""}>{s.name}</span>
                    </th>
                    <td className="n num strong">{money(s.last_price)}</td>
                    <td className="n num">{money(s.low_52w)}</td>
                    <td className="n num">{money(s.avg_52w)}</td>
                    <td>
                      <div className={`status ${s.status ?? ""}`}>{statusText(s)}</div>
                      {s.low_3m != null && <div className="sub num">3M low {inr.format(s.low_3m)}</div>}
                    </td>
                    <td className="n">
                      <button
                        className="remove"
                        onClick={() => remove(s)}
                        disabled={busy !== null}
                        aria-label={`Remove ${ticker(s.symbol)}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="alerts">
        <h2>Recent alerts</h2>
        {alerts.length === 0 ? (
          <p className="foot" style={{ marginTop: 0 }}>Alerts sent to Telegram will be listed here.</p>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{ticker(a.symbol)}</strong> {a.kind === "at_low" ? "hit its 3-month low" : "came near its 3-month low"} at{" "}
                  <span className="num">{inr.format(a.price)}</span>
                </span>
                <time dateTime={a.created_at}>{when.format(new Date(a.created_at))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="foot">
        Prices from Yahoo Finance, which can lag the exchange by up to 15 minutes. Not investment advice.
      </p>
    </main>
  );
}
