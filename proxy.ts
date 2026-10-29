import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A cookie is only a routing hint here; pages and APIs validate the session against Neon.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  if (pathname === "/login" || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  if (!request.cookies.has("ozon_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
