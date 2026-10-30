"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const cleanupOptions = [
  { id: "shops", title: "店铺与接口配置", detail: "已绑定店铺、Ozon API 密钥、货源与快递接口配置" },
  { id: "cache", title: "商品、订单、余额等缓存", detail: "保存的商品分析、订单、库存与余额快照；之后可重新同步" },
  { id: "reminders", title: "到货提醒记录与设置", detail: "已发送记录、提醒模板和自动提醒开关" },
  { id: "rateLimits", title: "接口限流记录", detail: "接口冷却与限流状态；清理后可能较快再次触发限流" },
  { id: "salesReports", title: "销售报告本地数据", detail: "销售、物流、FBS、佣金、支出和费率表的本地记录" },
  { id: "browser", title: "当前浏览器偏好", detail: "记住的店铺、自动刷新设置和余额提醒标记" }
] as const;

// Keep account-level cleanup separate from ordinary dashboard controls because it is irreversible.
export default function AccountDataControls({ username, userId }: { username: string; userId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function deleteSalesReportDatabases() {
    if (!window.indexedDB || !userId) return;
    const scope = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const names = [
      "sales-report-dashboard",
      "logistics-cost-dashboard",
      "fbs-shipping-dashboard",
      "standard-commission-dashboard",
      "manual-expense-dashboard",
      "ozon-commission-rates"
    ];
    await Promise.all(names.map(name => new Promise<void>(resolve => {
      const request = window.indexedDB.deleteDatabase(`${name}-${scope}`);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    })));
  }

  async function clearData() {
    if (confirmation !== "清理所选数据" || selectedGroups.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/clear-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groups: selectedGroups })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "清理失败，请重试。");

      const frame = document.querySelector<HTMLIFrameElement>("#dashboard");
      const browserWindow = frame?.contentWindow || window;
      if (selectedGroups.includes("browser")) {
        try {
          const storage = browserWindow.localStorage;
          storage?.removeItem("ozon-dashboard-shop-id");
          storage?.removeItem("ozon-dashboard-auto-refresh-v2");
          storage?.removeItem("ozon-dashboard-auto-refresh");
          browserWindow.sessionStorage.removeItem("ozon-dashboard-return-view");
          for (let index = storage ? storage.length - 1 : -1; index >= 0; index -= 1) {
            const key = storage?.key(index);
            if (key?.startsWith("ozon-balance-alerted-v1:")) storage?.removeItem(key);
          }
        } catch {
          // Server data is already removed; browser preferences are best-effort when storage is blocked.
        }
      }
      if (selectedGroups.includes("salesReports")) {
        try {
          await deleteSalesReportDatabases();
          window.localStorage.removeItem(`realFbsCnyRubRateV1-${userId?.replace(/[^a-zA-Z0-9_-]/g, "_") || "guest"}`);
        } catch {
          // The server cleanup still succeeds if IndexedDB is unavailable or locked by another tab.
        }
      }
      if (frame) frame.src = "/legacy/index.html";
      setOpen(false);
      setConfirmation("");
      setSelectedGroups([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "清理失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <div className="account-actions">
        <span>当前帐号：{username}</span>
        <nav className="account-nav" aria-label="页面导航"><a href="/">Ozon 工作台</a><a href="/sales-report">销售报告</a></nav>
        <button type="button" onClick={() => { setOpen(true); setError(""); setSelectedGroups([]); setConfirmation(""); }}>清理我的数据</button>
        <button type="button" onClick={logout}>退出登录</button>
      </div>
      {open && (
        <div className="cleanup-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <section className="cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
            <h1 id="cleanup-title">清理 {username} 的数据</h1>
            <p>勾选要清理的内容。未勾选的数据会保留；帐号和登录状态始终保留。</p>
            <div className="cleanup-options">
              {cleanupOptions.map(option => (
                <label className="cleanup-option" key={option.id}>
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(option.id)}
                    onChange={event => setSelectedGroups(current => event.target.checked ? [...current, option.id] : current.filter(group => group !== option.id))}
                  />
                  <span><strong>{option.title}</strong><small>{option.detail}</small></span>
                </label>
              ))}
            </div>
            <p>不会删除 Ozon 或其他平台上的商品、订单及业务数据。</p>
            <label>
              输入 <strong>清理所选数据</strong> 确认
              <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            {error && <p className="cleanup-error" role="alert">{error}</p>}
            <div className="cleanup-buttons">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
              <button type="button" className="cleanup-danger" disabled={busy || selectedGroups.length === 0 || confirmation !== "清理所选数据"} onClick={clearData}>{busy ? "正在清理…" : "清理所选内容"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
