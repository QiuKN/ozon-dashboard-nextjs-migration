import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutButton from "./logout-button";
import { databasePool, sessionCookieName, userFromToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function Home() {
  return <Dashboard />;
}

async function Dashboard() {
  if (databasePool()) {
    const token = (await cookies()).get(sessionCookieName())?.value || "";
    const user = await userFromToken(token);
    if (!user) redirect("/login");
    return (
      <main className="workspace">
        <header className="account-bar">
          <span>当前帐号：{user.username}</span>
          <LogoutButton />
        </header>
        <iframe className="dashboard" title="Ozon 商家数据台" src="/legacy/index.html" allow="clipboard-read; clipboard-write" />
      </main>
    );
  }
  return (
    <main className="workspace">
      <iframe
        className="dashboard"
        title="Ozon 商家数据台"
        src="/legacy/index.html"
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
