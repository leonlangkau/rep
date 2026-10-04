/**
 * Bearer-token auth for the owner endpoints (/api/owner/*).
 *
 * Guarded by the OWNER_TOKEN env. FAILS CLOSED: with no OWNER_TOKEN the route
 * reports {ok:false, skip:true, reason:"not_configured"} rather than opening up,
 * and a missing/wrong bearer gets a 401. The comparison HMACs both sides first,
 * so it is over fixed-length digests whatever the input (no length oracle).
 *
 * Not routed (underscore prefix).
 */

const enc = new TextEncoder();

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function ownerConfigured(env) {
  return !!String((env && env.OWNER_TOKEN) || "").trim();
}

export function notConfigured() {
  return json({ ok: false, skip: true, reason: "not_configured" }, 200);
}

export async function bearerMatches(request, secret) {
  const want = String(secret == null ? "" : secret).trim();
  if (!want) return false;
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  const given = m ? m[1].trim() : "";
  if (!given) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode("rep-owner:" + want), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const a = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(given)));
  const b = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(want)));
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}