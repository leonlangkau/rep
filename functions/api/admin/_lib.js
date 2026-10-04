/**
 * Shared helpers for Repeater's admin API (auth, cookies, JSON, hashing).
 *
 * Files prefixed with "_" are not routed by Cloudflare Pages, only imported.
 *
 * AUTH MODEL: stateful sessions in D1. The browser holds an opaque, random
 * session token in an HttpOnly cookie; the row in `rep_admin_sessions` is the
 * session. Logging out (or deleting the row) kills it immediately, and there is
 * no signing secret to rotate — unlike the HMAC-cookie pattern in
 * `../fivestarrepairs`. Repeater's admin auth therefore works with only a D1
 * binding and degrades to a plain 401 for an unauthenticated request, never a
 * 500.
 *
 * PASSWORDS: PBKDF2-SHA-256 via WebCrypto, stored as
 * "pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>". No dependencies.
 *
 * The bootstrap owner: with env ADMIN_PASSWORD (and optionally ADMIN_USER,
 * default "admin") set, the first login mints an owner row in rep_admin_users.
 * Without it, named accounts created directly in the table are the only way in.
 *
 * NEVER reuse fivestarrepairs' `admin_users` table: it already exists in this
 * shared database and belongs to FSR (it references staff.id).
 */

import { rateLimit } from "../_ratelimit.js";

export const SESSION_COOKIE = "rep_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

const enc = new TextEncoder();
const dec = new TextDecoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/* ---------------- base64url (Workers and Node both have btoa/atob) ---------------- */
export function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64urlToBytes(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(str || "").length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Constant-time byte comparison: the one copy every auth check shares. */
export function timingSafeEqualBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---------------- random session tokens ---------------- */
export function randomToken() {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
}

/* ---------------- password hashing (PBKDF2-SHA-256) ---------------- */
const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256
  );
  return "pbkdf2$" + PBKDF2_ITERATIONS + "$" + bytesToB64url(salt) + "$" + bytesToB64url(new Uint8Array(bits));
}
export async function verifyPasswordHash(stored, input) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 10000000) return false;
  let salt, expected;
  try { salt = b64urlToBytes(parts[2]); expected = b64urlToBytes(parts[3]); } catch { return false; }
  const key = await crypto.subtle.importKey("raw", enc.encode(String(input == null ? "" : input)), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, expected.length * 8
  ));
  return timingSafeEqualBytes(bits, expected);
}

/** Timing-safe compare of a password against env.ADMIN_PASSWORD. Fail closed. */
export async function verifyBootstrapPassword(env, input) {
  const expected = String((env && env.ADMIN_PASSWORD) || "");
  if (!expected) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode("rep-admin:" + expected), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const a = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(String(input || ""))));
  const b = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(expected)));
  return timingSafeEqualBytes(a, b);
}

/* ---------------- cookies ---------------- */
export function setCookie(name, value, maxAgeSeconds) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "Secure", "SameSite=Strict"];
  parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}
export function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

/* ---------------- login-endpoint helpers ---------------- */
/** Shared throttle for the login-family endpoints: 429 Response, or null. */
export async function rateLimit429(env, key, limit, windowSeconds) {
  const rl = await rateLimit(env, key, limit, windowSeconds);
  if (!rl.limited) return null;
  return json({ error: "Too many attempts. Please wait and try again." }, 429, { "retry-after": String(rl.retryAfter) });
}

/* ---------------- misc ---------------- */
export function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** Parse a JSON or form-encoded request body into a plain object. -> {} on failure. */
export async function readBody(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const v = await request.json();
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    }
    const form = await request.formData();
    const out = {};
    form.forEach((value, key) => { if (typeof value === "string") out[key] = value; });
    return out;
  } catch {
    return {};
  }
}

/** True when the caller is a browser form (so we can redirect instead of JSON). */
export function wantsHtml(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) return true;
  return String(request.headers.get("accept") || "").includes("text/html");
}