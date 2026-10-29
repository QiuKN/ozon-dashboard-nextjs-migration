import { createSession, registerUser, sessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (process.env.AUTH_ALLOW_SIGNUP === "false") return Response.json({ error: "注册功能已关闭。" }, { status: 403 });
  try {
    const body = await request.json();
    const user = await registerUser(body.username, body.password);
    const token = await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "注册失败。" }, { status: 400 });
  }
}
