import { databasePool, ensureAuthSchema, userFromRequest } from "@/lib/auth";
import { resetRequestCaches } from "../../../../legacy-api/server.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delete only the signed-in user's saved dashboard state while preserving their account and session.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const requestOrigin = host ? `${protocol}://${host}` : new URL(request.url).origin;
  if (origin && origin !== requestOrigin) return Response.json({ error: "拒绝跨站请求。" }, { status: 403 });

  try {
    const user = await userFromRequest(request);
    if (!user) return Response.json({ error: "登录状态已失效，请重新登录。" }, { status: 401 });
    const pool = databasePool();
    if (!pool) return Response.json({ error: "数据库尚未连接。" }, { status: 503 });

    await ensureAuthSchema();
    const client = await pool.connect();
    try {
      // Match the dashboard API lock so a concurrent request cannot restore data during cleanup.
      await client.query("SELECT pg_advisory_lock(591034270)");
      await client.query("BEGIN");
      const result = await client.query("DELETE FROM ozon_app_state WHERE owner_id = $1", [user.id]);
      await client.query("COMMIT");
      resetRequestCaches();
      return Response.json({ ok: true, deleted: result.rowCount || 0 });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock(591034270)").catch(() => undefined);
      client.release();
    }
  } catch (error) {
    console.error("清理账号数据失败：", error);
    return Response.json({ error: "清理失败，请稍后重试。" }, { status: 500 });
  }
}
