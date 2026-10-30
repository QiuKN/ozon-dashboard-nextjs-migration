import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A cookie is only a routing hint here; pages and APIs validate the session against Neon.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const pathname = request.nextUrl.pathname;
  // Product capture is browser-local and has no account or server data to protect.
  // The local capture page and its static extension package must remain downloadable before login.
  if (pathname === "/login" || pathname === "/product-capture" || pathname.startsWith("/product-capture/") || pathname.startsWith("/downloads/") || pathname.startsWith("/api/auth/") || pathname.startsWith("/api/")) {
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
