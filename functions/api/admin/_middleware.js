/**
 * Auth gate for everything under /api/admin/*.
 *
 * FAILS CLOSED: with no session cookie, or a cookie whose D1 row is missing or
 * expired, the request is answered 401 — never a 500. The login and logout
 * endpoints are allowed through (you cannot be logged in to log in), and each
 * does its own validation and rate limiting.
 *
 * A request that passes carries `context.data.session`, so handlers never
 * re-verify the cookie.
 *
 * TOTP is deliberately NOT faked here: /api/admin/totp is a 501 stub. When a
 * real second factor lands, the same positive-discriminator pattern
 * fivestarrepairs uses (a session claim that is only set after the second step)
 * applies.
 */

import { json, SESSION_COOKIE, readCookie } from "./_lib.js";
import { findSession } from "./_users.js";

const OPEN_PATHS = ["/api/admin/login", "/api/admin/logout"];

/** The one definition of "a logged-in admin request". Returns the session or null. */
export async function adminSessionFrom(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return findSession(env, token);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;

  if (OPEN_PATHS.includes(path)) return next();

  const session = await adminSessionFrom(env, request);
  if (!session) return json({ error: "Unauthorized" }, 401);

  context.data = { ...(context.data || {}), session };
  return next();
}