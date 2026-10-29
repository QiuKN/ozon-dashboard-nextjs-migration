"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Keep account-level cleanup separate from ordinary dashboard controls because it is irreversible.
export default function AccountDataControls({ username }: { username: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function clearData() {
    if (confirmation !== "清空我的数据") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/clear-data", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "清理失败，请重试。");

      const frame = document.querySelector<HTMLIFrameElement>("#dashboard");
      try {
        const storage = frame?.contentWindow?.localStorage;
        storage?.removeItem("ozon-dashboard-shop-id");
        storage?.removeItem("ozon-dashboard-auto-refresh-v2");
        storage?.removeItem("ozon-dashboard-auto-refresh");
        frame?.contentWindow?.sessionStorage.removeItem("ozon-dashboard-return-view");
        for (let index = storage ? storage.length - 1 : -1; index >= 0; index -= 1) {
          const key = storage?.key(index);
          if (key?.startsWith("ozon-balance-alerted-v1:")) storage?.removeItem(key);
        }
      } catch {
        // Server data is already removed; browser preferences are best-effort when storage is blocked.
      }
      if (frame) frame.src = "/legacy/index.html";
      setOpen(false);
      setConfirmation("");
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
        <button type="button" onClick={() => { setOpen(true); setError(""); }}>清理我的数据</button>
        <button type="button" onClick={logout}>退出登录</button>
      </div>
      {open && (
        <div className="cleanup-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <section className="cleanup-dialog" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
            <h1 id="cleanup-title">清理 {username} 的数据</h1>
            <p>此操作会删除此帐号保存的全部店铺与 API 密钥、店铺设置、缓存数据、到货提醒记录和限流记录，并清除此浏览器记住的店铺与刷新偏好。</p>
            <p>帐号和登录状态会保留。不会删除 Ozon 上的商品、订单或其他平台数据。</p>
            <label>
              输入 <strong>清空我的数据</strong> 确认
              <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            {error && <p className="cleanup-error" role="alert">{error}</p>}
            <div className="cleanup-buttons">
              <button type="button" disabled={busy} onClick={() => setOpen(false)}>取消</button>
              <button type="button" className="cleanup-danger" disabled={busy || confirmation !== "清空我的数据"} onClick={clearData}>{busy ? "正在清理…" : "永久清理"}</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
