/**
 * GET /api/admin/me — the current session's identity.
 *
 * Reached only when the admin middleware has validated the cookie, so reaching
 * it at all is proof of an authenticated request. Also the route the deploy
 * probe hits unauthenticated to confirm the gate answers 401 rather than 500.
 */

import { json } from "./_lib.js";

export function onRequestGet({ data }) {
  const s = (data && data.session) || {};
  return json({
    ok: true,
    authenticated: true,
    user_id: s.user_id || null,
    username: s.username || "",
    name: s.name || "",
    role: s.role || "owner",
  });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405, { allow: "GET" });
}