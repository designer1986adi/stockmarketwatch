import { createHmac, timingSafeEqual } from "node:crypto";

// Single-user protection: a signed session cookie for people (set by the
// login page), a bearer token (CRON_SECRET) for the scheduled job.

export const SESSION_COOKIE = "asm_session";
export const SESSION_DAYS = 30;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// Signing key. Tied to the password, so changing APP_PASSWORD signs everyone out.
function signingKey(): string | null {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return null;
  return `${process.env.SESSION_SECRET ?? ""}|${user}|${pass}`;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function checkLogin(username: string, password: string): boolean {
  const user = process.env.APP_USERNAME;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return false;
  // Check both so timing doesn't reveal which one was wrong.
  const okUser = safeEqual(username, user);
  const okPass = safeEqual(password, pass);
  return okUser && okPass;
}

/** Creates a session cookie value: "<expiry ms>.<signature>". */
export function createSession(): { value: string; maxAge: number } {
  const key = signingKey();
  if (!key) throw new Error("APP_USERNAME and APP_PASSWORD must be set");
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  const exp = String(Date.now() + maxAge * 1000);
  return { value: `${exp}.${sign(exp, key)}`, maxAge };
}

export function isSessionValid(value: string | undefined | null): boolean {
  const key = signingKey();
  if (!key || !value) return false;
  const dot = value.indexOf(".");
  if (dot < 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp, key));
}

export function isCronAuthValid(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  return safeEqual(header.slice(7), secret);
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function isAuthorized(req: Request, { allowCron = false } = {}): boolean {
  if (isSessionValid(readCookie(req, SESSION_COOKIE))) return true;
  return allowCron && isCronAuthValid(req.headers.get("authorization"));
}

export function unauthorized(): Response {
  return Response.json({ error: "Please sign in again." }, { status: 401 });
}
