import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export type StockRow = {
  id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  last_price: number | null;
  low_3m: number | null;
  low_3m_date: string | null;
  high_3m: number | null;
  low_52w: number | null;
  avg_52w: number | null;
  status: "at_low" | "near_low" | "ok" | "error" | null;
  distance_pct: number | null;
  last_checked_at: string | null;
  last_error: string | null;
  last_alert_date: string | null;
  last_alert_status: string | null;
  created_at: string;
};

export type AlertRow = {
  id: number;
  stock_id: string | null;
  symbol: string;
  kind: "at_low" | "near_low";
  price: number;
  low_3m: number;
  created_at: string;
};
