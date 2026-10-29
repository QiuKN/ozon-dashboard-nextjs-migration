import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep the dashboard and credential-management APIs private until user authentication is implemented.
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;
  if (!username || !password) {
    return new Response("Set DASHBOARD_USERNAME and DASHBOARD_PASSWORD in the deployment environment.", { status: 503 });
  }

  const expected = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);
  const provided = Buffer.from(request.headers.get("authorization") || "");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response("Authentication required.", {
      status: 401,
      headers: { "www-authenticate": 'Basic realm="Ozon Dashboard", charset="UTF-8"' }
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"]
};
