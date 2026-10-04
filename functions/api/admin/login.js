/**
 * POST /api/admin/login
 *
 * Verifies a named admin account (rep_admin_users) or the bootstrap owner
 * (env.ADMIN_PASSWORD, username env.ADMIN_USER or "admin"), then mints a
 * stateful session row and sets the HttpOnly cookie.
 *
 * Throttled per IP to slow online brute-forcing. The failure message is
 * deliberately generic so the response never reveals which usernames exist.
 *
 * Responds JSON to a fetch() caller, and a 303 back to /admin to a plain form
 * post (so the panel works with JavaScript off).
 */

import {
  json, clean, readBody, wantsHtml, setCookie, hashPassword, verifyPasswordHash,
  verifyBootstrapPassword, rateLimit429, SESSION_COOKIE, SESSION_TTL_SECONDS,
} from "./_lib.js";
import { clientIp } from "../_ratelimit.js";
import { findUserByUsername, ensureBootstrapOwner, createSession, countUsers, touchLastLogin, dbOf } from "./_users.js";

const LOGIN_LIMIT = 8;               // attempts ...
const LOGIN_WINDOW_SECONDS = 900;    // ... per 15 minutes, per IP

function done(request, token) {
  const headers = { "Set-Cookie": setCookie(SESSION_COOKIE, token, SESSION_TTL_SECONDS) };
  if (wantsHtml(request)) {
    return new Response(null, { status: 303, headers: { ...headers, location: "/admin" } });
  }
  return json({ ok: true }, 200, headers);
}

export async function onRequestPost({ request, env }) {
  if (!dbOf(env)) return json({ error: "Admin database not configured." }, 503);

  const limited = await rateLimit429(env, "rep-admin-login:" + clientIp(request), LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (limited) return limited;

  const body = await readBody(request);
  const username = clean(body.username || body.email, 120).toLowerCase();
  const password = String(body.password == null ? "" : body.password);

  /* ---- named account path (rep_admin_users) ---- */
  if (username) {
    const userLimit = await rateLimit429(env, "rep-admin-login:u:" + username, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
    if (userLimit) return userLimit;

    const user = await findUserByUsername(env, username);
    if (user && user.active && (await verifyPasswordHash(user.password_hash, password))) {
      const token = await createSession(env, Number(user.id));
      if (!token) return json({ error: "Could not start a session." }, 503);
      touchLastLogin(env, Number(user.id));
      return done(request, token);
    }

    /* Bootstrap owner: the env password, if ADMIN_PASSWORD is set. */
    const bootName = String(env.ADMIN_USER || "admin").trim().toLowerCase() || "admin";
    if (username === bootName && (await verifyBootstrapPassword(env, password))) {
      const hash = await hashPassword(password);
      const id = await ensureBootstrapOwner(env, bootName, hash);
      if (!id) return json({ error: "Could not create the owner account." }, 503);
      const token = await createSession(env, id);
      if (!token) return json({ error: "Could not start a session." }, 503);
      touchLastLogin(env, id);
      return done(request, token);
    }

    return json({ error: "Incorrect username or password." }, 401);
  }

  /* ---- no username: allow the bootstrap owner to log in with just a password ---- */
  if ((await verifyBootstrapPassword(env, password)) && (await countUsers(env)) === 0) {
    const bootName = String(env.ADMIN_USER || "admin").trim().toLowerCase() || "admin";
    const hash = await hashPassword(password);
    const id = await ensureBootstrapOwner(env, bootName, hash);
    if (!id) return json({ error: "Could not create the owner account." }, 503);
    const token = await createSession(env, id);
    return done(request, token);
  }

  return json({ error: "Incorrect username or password." }, 401);
}

export function onRequest({ request }) {
  return json({ error: "Method not allowed" }, 405, { allow: "POST" });
}