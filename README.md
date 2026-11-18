# Aditya Share Market

A small web app that watches the NSE/BSE shares you pick and sends you a
Telegram message when one falls to its **3-month low**.

- **Watchlist page**: search and add stocks, see where each price sits in its 3-month range.
- **Scheduled check**: runs every 30 minutes in market hours (GitHub Actions).
- **Telegram alerts**: one message per run, at most one alert per stock per day
  (plus one more if it goes from "near low" to "at low" the same day).

Stack: Next.js 16, Supabase (Postgres), Yahoo Finance via `yahoo-finance2`, Telegram Bot API.

## How "3-month low" is decided

The app loads ~3 months of daily candles. The **3-month low** is the lowest daily
low *before today*. Then:

| Setting | Alert when |
| --- | --- |
| `ALERT_BASIS=close` (default) | current price (or close) ≤ 3-month low |
| `ALERT_BASIS=intraday` | today's intraday low ≤ 3-month low |
| `NEAR_LOW_PCT=2` | also a "near low" alert when price is within 2% above it (`0` turns this off) |

The logic lives in `lib/market.ts` → `evaluateBars()`.

### Choosing NSE, BSE or both

Set `STOCK_EXCHANGE` in `.env` to `NSE`, `BSE` or `BOTH` (default). Search results,
adding stocks, the watchlist and the scheduled check all follow it. Stocks already
on your list from the other exchange are kept in the database, just hidden and not
checked until you switch back.

## Setup (about 20 minutes)

### 1. Supabase
1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste `supabase/schema.sql`, and run it.
3. From **Project Settings → API**, copy the Project URL and the `service_role` key.

### 2. Telegram bot
1. In Telegram, message **@BotFather** → `/newbot` → copy the bot token.
2. Send any message to your new bot.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy
   `message.chat.id`. That's your `TELEGRAM_CHAT_ID`.
   (For a group: add the bot to the group, post a message, and use the group's negative id.)

### 3. Run locally
```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev
```
Open http://stock-analysis.localhost:3000 (plain http://localhost:3000 works too), sign in with `APP_USERNAME` / `APP_PASSWORD`,
press **Send test alert**, add a few stocks, then **Check prices now**.

Node.js 22 or newer is required.

### 4. Deploy (Render)
1. Push this folder to a GitHub repo.
2. In Render: **New → Blueprint**, pick the repo. It reads `render.yaml`.
3. Fill in the secret values it asks for (same as your `.env`), then **Apply**.
4. Note your URL (e.g. `https://low-watch.onrender.com`) for step 5.

The free plan sleeps after 15 minutes idle; the first request then takes ~1 minute.
The scheduled check waits up to 3 minutes and retries, so it wakes the app on its own.

### 4b. Deploy (Vercel, alternative)
1. Push this folder to a GitHub repo.
2. Import it in Vercel and add every variable from `.env.example` under
   **Settings → Environment Variables**.
3. Deploy, and note your URL (e.g. `https://low-watch.vercel.app`).

### 5. Schedule the check (GitHub Actions)
In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**:
- `APP_URL` = your deployed URL
- `CRON_SECRET` = same value as in Vercel

The workflow in `.github/workflows/check-lows.yml` then runs on its own.
Use **Actions → Check 3-month lows → Run workflow** to trigger it by hand.
GitHub can delay scheduled runs by several minutes at busy times; if you need
exact timing, use an external cron service (cron-job.org, Upstash QStash) or
Vercel Cron to `POST /api/check` with the same bearer header.

Manual call:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/check
```

## Security
- Every page and API route needs the login (sign-in page at `/login`, 30-day session cookie). `/api/check` also
  accepts `Authorization: Bearer <CRON_SECRET>`.
- Supabase tables have row-level security on with no public policies, so only the
  server (service role key) can read or write them. Never expose that key to the browser.

## Notes and limits
- **Data source**: Yahoo Finance is unofficial, may lag by ~15 minutes, and can
  break or rate-limit without notice. Fine for personal use. For a product,
  replace `checkStock()` and `searchIndianStocks()` in `lib/market.ts` with a
  broker API (Upstox, Angel One SmartAPI, Dhan, Zerodha Kite Connect).
- Market holidays need no special handling: no new candle means no new alert.
- Not investment advice.

## Project layout
```
app/page.tsx                 watchlist UI
app/api/stocks/              list / add / remove stocks
app/api/search/              stock search (NSE/BSE only)
app/api/check/               the scheduled check
app/api/telegram-test/       sends a test message
lib/market.ts                price data + 3-month-low logic
lib/check.ts                 runs the check, de-duplicates, sends alerts
lib/telegram.ts              Telegram sender
lib/auth.ts, proxy.ts        login protection
supabase/schema.sql          database tables
.github/workflows/           schedule
```
