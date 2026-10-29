"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        {error && <div className={styles.error}>{error}</div>}
        <button disabled={busy}>{busy ? "处理中…" : register ? "注册并进入" : "登录"}</button>
        <button type="button" className={styles.link} onClick={() => { setRegister(value => !value); setError(""); }}>
          {register ? "已有帐号，返回登录" : "创建新帐号"}
        </button>
      </form>
    </main>
  );
}
