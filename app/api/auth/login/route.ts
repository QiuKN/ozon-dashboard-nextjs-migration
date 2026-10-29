import { createSession, loginUser, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await loginUser(body.username, body.password);
    const token = await createSession(user.id);
    return Response.json({ user }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "登录失败。" }, { status: 401 });
  }
}
