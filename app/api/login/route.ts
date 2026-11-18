import { NextResponse } from "next/server";
import { SESSION_COOKIE, checkLogin, createSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!process.env.APP_USERNAME || !process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Login isn't set up: add APP_USERNAME and APP_PASSWORD to .env" }, { status: 500 });
  }
  if (!checkLogin(username, password)) {
    // Small delay slows down password guessing.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const { value, maxAge } = createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  return res;
}
