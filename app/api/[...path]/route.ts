import { Pool } from "@neondatabase/serverless";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const require = createRequire(import.meta.url);
const legacy = require("../../../legacy-api/server.js") as {
  route: (request: NodeJS.ReadableStream & Record<string, unknown>, response: LegacyResponse) => Promise<void>;
  withRequestDataRoot: <T>(root: string, handler: () => Promise<T>) => Promise<T>;
  resetRequestCaches: () => void;
};
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
let schemaPromise: Promise<void> | null = null;

type LegacyResponse = {
  writeHead: (status: number, headers: Record<string, string>) => void;
  end: (body?: string | Buffer) => void;
};

async function ensureSchema() {
  if (!pool) throw new Error("DATABASE_URL 未设置，数据库尚未连接。");
  schemaPromise ||= pool.query(`
    CREATE TABLE IF NOT EXISTS ozon_app_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).then(() => undefined).catch(error => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, fullPath));
    else if (entry.isFile()) files.push(path.relative(root, fullPath).replaceAll(path.sep, "/"));
  }
  return files;
}

async function withDatabaseState<T>(handler: () => Promise<T>) {
  if (!pool) throw new Error("Vercel 项目缺少 Neon 的 DATABASE_URL 环境变量。");
  await ensureSchema();
  const client = await pool.connect();
  const root = await mkdtemp(path.join(tmpdir(), "ozon-state-"));
  try {
    // Existing business logic uses synchronous file operations, so one database lock protects each request's read-modify-write cycle.
    await client.query("SELECT pg_advisory_lock(591034270)");
    const stored = await client.query<{ state_key: string; state_value: string }>(
      "SELECT state_key, state_value FROM ozon_app_state"
    );
    for (const row of stored.rows) {
      const target = path.resolve(root, row.state_key);
      if (!target.startsWith(`${root}${path.sep}`)) continue;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, row.state_value, { mode: 0o600 });
    }
    legacy.resetRequestCaches();
    return await legacy.withRequestDataRoot(root, async () => {
      const result = await handler();
      const files = await listFiles(root);
      const existing = new Set(files);
      await client.query("BEGIN");
      try {
        for (const key of files) {
          const value = await readFile(path.join(root, key), "utf8");
          await client.query(
            `INSERT INTO ozon_app_state (state_key, state_value, updated_at)
             VALUES ($1, $2, NOW()) ON CONFLICT (state_key)
             DO UPDATE SET state_value = EXCLUDED.state_value, updated_at = NOW()`,
            [key, value]
          );
        }
        for (const row of stored.rows) {
          if (!existing.has(row.state_key)) await client.query("DELETE FROM ozon_app_state WHERE state_key = $1", [row.state_key]);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      return result;
    });
  } finally {
    await client.query("SELECT pg_advisory_unlock(591034270)").catch(() => undefined);
    client.release();
    await rm(root, { recursive: true, force: true });
  }
}

async function handle(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
  if (!allowedMethods.has(request.method)) return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  if (origin && origin !== request.nextUrl.origin) return Response.json({ error: "拒绝跨站请求。" }, { status: 403 });

  if (!pool && process.env.NODE_ENV !== "production") {
    const upstream = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, process.env.LEGACY_API_ORIGIN || "http://127.0.0.1:8788");
    return fetch(upstream, {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store"
    });
  }
  if (!pool) return Response.json({ error: "Vercel 项目缺少 Neon 数据库连接，请检查 DATABASE_URL 环境变量。" }, { status: 503 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 1_500_000) return Response.json({ error: "请求内容过大" }, { status: 413 });
  const body = request.method === "GET" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  if (body.length > 1_500_000) return Response.json({ error: "请求内容过大" }, { status: 413 });
  return withDatabaseState(async () => new Promise<Response>((resolve, reject) => {
    const headers = Object.fromEntries(request.headers.entries());
    const internalOrigin = process.env.LEGACY_API_ORIGIN || "http://127.0.0.1:8788";
    headers.origin = internalOrigin;
    headers.host = new URL(internalOrigin).host;
    const nodeRequest = Readable.from(body.length ? [body] : []) as Readable & Record<string, unknown>;
    Object.assign(nodeRequest, { method: request.method, url: `${request.nextUrl.pathname}${request.nextUrl.search}`, headers });
    let status = 200;
    let responseHeaders: Record<string, string> = {};
    let completed = false;
    const nodeResponse: LegacyResponse = {
      writeHead(code, values) {
        status = code;
        responseHeaders = values;
      },
      end(value) {
        if (completed) return;
        completed = true;
        const responseBody = value == null ? null : typeof value === "string" ? value : new Uint8Array(value);
        resolve(new Response(responseBody, { status, headers: responseHeaders }));
      }
    };
    void legacy.route(nodeRequest, nodeResponse).catch(reject);
  }));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
