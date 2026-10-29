import { Pool } from "@neondatabase/serverless";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = "ozon_session";
const SESSION_DAYS = 30;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
let schemaPromise: Promise<void> | null = null;

export type AuthUser = { id: string; username: string };

export function databasePool() {
  return pool;
}

export async function ensureAuthSchema() {
  if (!pool) throw new Error("DATABASE_URL 未设置。");
  schemaPromise ||= pool.query(`
    CREATE TABLE IF NOT EXISTS ozon_users (
      id UUID PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ozon_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES ozon_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ozon_app_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ozon_app_state ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE ozon_app_state DROP CONSTRAINT IF EXISTS ozon_app_state_pkey;
    ALTER TABLE ozon_app_state ADD CONSTRAINT ozon_app_state_pkey PRIMARY KEY (owner_id, state_key);
  `).then(() => undefined).catch(error => {
    schemaPromise = null;
    throw error;
  });
  await schemaPromise;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [, salt, encoded] = stored.split("$");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function cleanUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validPassword(value: unknown) {
  const password = String(value || "");
  return password.length >= 8 && password.length <= 200;
}

export async function registerUser(usernameValue: unknown, passwordValue: unknown) {
  if (!pool) throw new Error("Vercel 项目缺少 DATABASE_URL。");
  const username = cleanUsername(usernameValue);
  const password = String(passwordValue || "");
  if (!/^[a-z0-9_.-]{3,80}$/.test(username)) throw new Error("用户名需要 3 到 80 个字符，只能使用字母、数字、点、下划线和短横线。");
  if (!validPassword(password)) throw new Error("密码至少需要 8 个字符。");
  await ensureAuthSchema();
  const user = { id: randomUUID(), username };
  try {
    await pool.query("INSERT INTO ozon_users (id, username, password_hash) VALUES ($1, $2, $3)", [user.id, username, await hashPassword(password)]);
  } catch (error: any) {
    if (error?.code === "23505") throw new Error("用户名已存在。");
    throw error;
  }
  // The first account owns data created by the old shared Basic Auth setup.
  const count = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM ozon_users");
  if (count.rows[0]?.count === "1") {
    await pool.query("UPDATE ozon_app_state SET owner_id = $1 WHERE owner_id = 'legacy'", [user.id]);
  }
  return user;
}

export async function loginUser(usernameValue: unknown, passwordValue: unknown) {
  if (!pool) throw new Error("Vercel 项目缺少 DATABASE_URL。");
  await ensureAuthSchema();
  const username = cleanUsername(usernameValue);
  const result = await pool.query<{ id: string; username: string; password_hash: string }>(
    "SELECT id, username, password_hash FROM ozon_users WHERE username = $1",
    [username]
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(String(passwordValue || ""), user.password_hash))) throw new Error("用户名或密码错误。");
  return { id: user.id, username: user.username };
}

export async function createSession(userId: string) {
  if (!pool) throw new Error("Vercel 项目缺少 DATABASE_URL。");
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO ozon_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    [hashToken(token), userId]
  );
  return token;
}

export function sessionCookie(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`;
}

function cookieValue(cookieHeader: string | null) {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] || "";
}

export async function userFromToken(token: string) {
  if (!pool || !token) return null;
  await ensureAuthSchema();
  const result = await pool.query<AuthUser>(
    `SELECT u.id, u.username FROM ozon_sessions s JOIN ozon_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );
  return result.rows[0] || null;
}

export async function userFromRequest(request: Request) {
  return userFromToken(cookieValue(request.headers.get("cookie")));
}

export async function deleteSession(request: Request) {
  if (!pool) return;
  const token = cookieValue(request.headers.get("cookie"));
  if (token) await pool.query("DELETE FROM ozon_sessions WHERE token_hash = $1", [hashToken(token)]);
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}
