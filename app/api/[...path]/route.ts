import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_ORIGIN = process.env.LEGACY_API_ORIGIN || "http://127.0.0.1:8788";
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

async function proxy(request: NextRequest) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return NextResponse.json({ error: "不支持的请求方法。" }, { status: 405 });
  }

  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("host");
  const requestProtocol = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  if (origin && (!requestHost || origin !== `${requestProtocol}://${requestHost}`)) {
    return NextResponse.json({ error: "拒绝跨站请求。" }, { status: 403 });
  }

  const upstreamUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, API_ORIGIN);
  const headers = new Headers({
    origin: API_ORIGIN,
    host: new URL(API_ORIGIN).host,
  });
  for (const name of ["content-type", "x-ozon-shop-id", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    const responseHeaders = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    responseHeaders.set("cache-control", "no-store");
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "本地业务服务暂不可用，请稍后重试。" }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
