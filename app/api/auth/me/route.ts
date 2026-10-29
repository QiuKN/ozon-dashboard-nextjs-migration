import { userFromRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await userFromRequest(request);
  return user ? Response.json({ user }) : Response.json({ error: "未登录。" }, { status: 401 });
}
