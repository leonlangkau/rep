/**
 * D1 helpers for Repeater's admin accounts and sessions
 * (rep_admin_users / rep_admin_sessions — migration 004).
 *
 * Shared by login.js, me.js, the admin middleware and the /admin page so the
 * SQL lives in one place. Not routed (underscore prefix).
 *
 * Sessions are stateful: one row per live login. `findSession` joins the user
 * so a disabled account's sessions die immediately instead of living out their
 * 8-hour TTL. Expired rows are swept lazily, fire-and-forget.
 */

import { SESSION_TTL_SECONDS, randomToken } from "./_lib.js";

export function dbOf(env) {
  return env && env.DB_REPEATER ? env.DB_REPEATER : (env && env.DB ? env.DB : null);
}

/** The live session for a cookie token, or null. Never throws. */
export async function findSession(env, token) {
  const db = dbOf(env);
  if (!db || !token) return null;
  try {
    const row = await db.prepare(
      "SELECT s.token, s.expires_at, u.id AS user_id, u.username, u.name, u.role, u.active " +
      "FROM rep_admin_sessions s JOIN rep_admin_users u ON u.id = s.user_id WHERE s.token = ?"
    ).bind(String(token)).first();
    if (!row || !row.active) return null;
    if (!Number.isFinite(Number(row.expires_at)) || Number(row.expires_at) <= Date.now()) return null;
    return { user_id: Number(row.user_id), username: String(row.username || ""), name: String(row.name || ""), role: String(row.role || "owner") };
  } catch {
    return null;
  }
}

/** Mint a session row and return its opaque token. */
export async function createSession(env, userId) {
  const db = dbOf(env);
  if (!db) return null;
  const token = randomToken();
  const expires = Date.now() + SESSION_TTL_SECONDS * 1000;
  await db.prepare("INSERT INTO rep_admin_sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires).run();
  // One-off sweep; never blocks the login.
  db.prepare("DELETE FROM rep_admin_sessions WHERE expires_at <= ?")
    .bind(Date.now()).run().catch(() => {});
  return token;
}

export async function deleteSession(env, token) {
  const db = dbOf(env);
  if (!db || !token) return;
  try {
    await db.prepare("DELETE FROM rep_admin_sessions WHERE token = ?").bind(String(token)).run();
  } catch { /* logging out must not fail loudly */ }
}

export async function findUserByUsername(env, username) {
  const db = dbOf(env);
  const norm = String(username || "").trim().toLowerCase();
  if (!db || !norm) return null;
  try {
    return await db.prepare(
      "SELECT id, username, email, name, password_hash, role, active, last_login_at " +
      "FROM rep_admin_users WHERE lower(username) = ?"
    ).bind(norm).first();
  } catch {
    return null;
  }
}

export async function countUsers(env) {
  const db = dbOf(env);
  if (!db) return 0;
  try {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM rep_admin_users").first();
    return row ? Number(row.n) : 0;
  } catch {
    return 0;
  }
}

/**
 * Ensure the bootstrap owner row exists (idempotent), returning its id.
 * Only ever called after a password has been checked against env.ADMIN_PASSWORD.
 */
export async function ensureBootstrapOwner(env, username, passwordHash) {
  const db = dbOf(env);
  const norm = String(username || "admin").trim().toLowerCase() || "admin";
  if (!db) return null;
  const existing = await findUserByUsername(env, norm);
  if (existing) return Number(existing.id);
  const res = await db.prepare(
    "INSERT INTO rep_admin_users (username, name, password_hash, role, active) VALUES (?, ?, ?, 'owner', 1)"
  ).bind(norm, "Owner", passwordHash).run();
  return res && res.meta ? Number(res.meta.last_row_id) : null;
}

/** Fire-and-forget; a failed timestamp update must never block a login. */
export function touchLastLogin(env, id) {
  const db = dbOf(env);
  if (!db) return;
  db.prepare("UPDATE rep_admin_users SET last_login_at = datetime('now') WHERE id = ?")
    .bind(id).run().catch(() => {});
}