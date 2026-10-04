/**
 * POST /api/admin/logout — delete the session row and clear the cookie.
 * Kept open in the middleware so a stale cookie can always be dropped.
 */

import { json, readCookie, setCookie, SESSION_COOKIE, wantsHtml } from "./_lib.js";
import { deleteSession } from "./_users.js";

export async function onRequestPost({ request, env }) {
  await deleteSession(env, readCookie(request, SESSION_COOKIE));
  const headers = { "Set-Cookie": setCookie(SESSION_COOKIE, "", 0) };
  if (wantsHtml(request)) return new Response(null, { status: 303, headers: { ...headers, location: "/admin" } });
  return json({ ok: true }, 200, headers);
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405, { allow: "POST" });
}