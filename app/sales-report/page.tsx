import { readFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AccountDataControls from "../account-data-controls";
import { databasePool, sessionCookieName, userFromToken } from "@/lib/auth";
import LegacyDashboard from "./LegacyDashboard";

export const dynamic = "force-dynamic";

async function reportMarkup() {
  const root = path.join(process.cwd(), "public", "sales-report");
  const [markup, stylesheet] = await Promise.all([
    readFile(path.join(root, "body.html"), "utf8"),
    readFile(path.join(root, "dashboard.css"), "utf8")
  ]);
  return { markup, stylesheet };
}

export default async function SalesReportPage() {
  const assets = await reportMarkup();
  if (databasePool()) {
    const token = (await cookies()).get(sessionCookieName())?.value || "";
    const user = await userFromToken(token);
    if (!user) redirect("/login");
    return <SalesReportShell {...assets} userId={user.id} username={user.username} />;
  }
  return <SalesReportShell {...assets} userId="guest" username="本地模式" />;
}

function SalesReportShell({ markup, stylesheet, userId, username }: { markup: string; stylesheet: string; userId: string; username: string }) {
  return (
    <main className="sales-report-shell">
      <header className="account-bar"><AccountDataControls username={username} userId={userId} /></header>
      <section className="sales-report-content"><LegacyDashboard markup={markup} stylesheet={stylesheet} accountId={userId} /></section>
    </main>
  );
}
