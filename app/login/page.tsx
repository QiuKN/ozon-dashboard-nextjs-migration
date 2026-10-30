"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

const REMEMBERED_LOGIN_KEY = "ozon-remembered-login-v1";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Restore the optional local-only login values without involving the server.
    try {
      const raw = window.localStorage.getItem(REMEMBERED_LOGIN_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { username?: unknown; password?: unknown };
      if (typeof saved.username !== "string" || typeof saved.password !== "string") throw new Error("invalid saved login");
      setUsername(saved.username);
      setPassword(saved.password);
      setRememberLogin(true);
    } catch {
      try {
        window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
      } catch {
        // Ignore unavailable browser storage and leave the form empty.
      }
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "请求失败。");
      // Save only after a successful login so failed attempts never replace valid values.
      try {
        if (rememberLogin && !register) {
          window.localStorage.setItem(REMEMBERED_LOGIN_KEY, JSON.stringify({ username, password }));
        } else {
          window.localStorage.removeItem(REMEMBERED_LOGIN_KEY);
        }
      } catch {
        // Storage may be blocked by the browser; login itself should still succeed.
      }
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "请求失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <h1>Ozon 商家数据台</h1>
        <p>{register ? "创建一个独立帐号，每个帐号只能看到自己的店铺。" : "登录后进入你的店铺数据。"}</p>
        <label>用户名<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required /></label>
        <label>密码<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={register ? "new-password" : "current-password"} minLength={8} required /></label>
        {!register && <label className={styles.remember}><input type="checkbox" checked={rememberLogin} onChange={event => setRememberLogin(event.target.checked)} />记住账号密码（仅此浏览器）</label>}
        {error && <div className={styles.error}>{error}</div>}
        <button disabled={busy}>{busy ? "处理中…" : register ? "注册并进入" : "登录"}</button>
        <button type="button" className={styles.link} onClick={() => { setRegister(value => !value); setError(""); }}>
          {register ? "已有帐号，返回登录" : "创建新帐号"}
        </button>
      </form>
    </main>
  );
}
