import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isCronAuthValid, isSessionValid, unauthorized } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/login", "/api/login"]);

// Sends signed-out visitors to the login page; API calls get a 401.
// The scheduled job may call /api/check with its bearer token instead.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (pathname === "/api/check" && isCronAuthValid(request.headers.get("authorization"))) {
    return NextResponse.next();
  }
  if (isSessionValid(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) return unauthorized();

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
