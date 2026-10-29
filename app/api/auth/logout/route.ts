import { clearSessionCookie, deleteSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await deleteSession(request);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
}
