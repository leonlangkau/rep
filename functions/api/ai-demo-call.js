/**
 * POST /api/ai-demo-call — the /ai page numpad: a visitor types their number,
 * and Repeater's AI (Jarvis) rings them with the product walkthrough.
 *
 * Trigger path: this function POSTs to the voice stack on the VPS
 * (hermes-agi :8000/call, header X-Jarvis-Token). The VPS enforces its own
 * gates for external callers: the token, a fixed spoken script (TOUR_OPENING)
 * and AU-number validation — so even if this secret leaks, the worst case is
 * the approved walkthrough at an Australian number.
 *
 * Guards here (D1 fixed-window, fails open on DB error — but see below):
 *   - per number (hashed):  2 / 24h
 *   - per IP (cf-connecting-ip): 5 / 24h
 *   - global: 40 / 24h
 * The trigger itself costs money per call, so this endpoint fails CLOSED on
 * a missing JARVIS_CALL_TOKEN: without it there is nothing to call WITH, and
 * {ok:false, error:"not_configured"} beats a silent 500.
 *
 * Requests are logged to `call_requests` (migration 004 built it for exactly
 * this) so the owner can see who asked: mobile (E.164), status dialled/new,
 * notes carries the outcome text. Numbers are a business lead — the caller
 * asked to be rung — stored as-is; IPs are stored only as a hash.
 *
 * Progressively-enhanced: the /ai form posts form-encoded too (same checks),
 * so the enquiry still lands with JS off.
 */

import { clientIp, rateLimit } from "./_ratelimit.js";

const VPS_CALL_URL = "http://85.155.189.216:8000/call";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** Accept AU local (04..., 03...), +61 and 61 forms; return E.164 or "". */
export function normalizeAuNumber(raw) {
  const digits = String(raw || "").replace(/[^\d+]/g, "").trim();
  if (/^\+61[234578]\d{8}$/.test(digits)) return digits;
  if (/^61[234578]\d{8}$/.test(digits)) return "+" + digits;
  if (/^0[234578]\d{8}$/.test(digits)) return "+61" + digits.slice(1);
  return "";
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(request) {
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (type === "application/x-www-form-urlencoded") {
    const form = await request.formData();
    return Object.fromEntries(form);
  }
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  const body = await readBody(request);
  const e164 = normalizeAuNumber(body.number || body.mobile || "");
  if (!e164) {
    return json({ ok: false, error: "invalid_number" }, 400);
  }

  const ip = clientIp(request);
  const DAY = 86400;
  const numHash = (await sha256hex("aicall:num:" + e164)).slice(0, 16);
  const ipHash = (await sha256hex("aicall:ip:" + ip)).slice(0, 16);

  const perNumber = await rateLimit(env, "aicall:num:" + numHash, 2, DAY);
  if (perNumber.limited) {
    return json({ ok: false, error: "rate_limited", scope: "number", retryAfter: perNumber.retryAfter }, 429);
  }
  const perIp = await rateLimit(env, "aicall:ip:" + ipHash, 5, DAY);
  if (perIp.limited) {
    return json({ ok: false, error: "rate_limited", scope: "ip", retryAfter: perIp.retryAfter }, 429);
  }
  const global_ = await rateLimit(env, "aicall:global", 40, DAY);
  if (global_.limited) {
    return json({ ok: false, error: "rate_limited", scope: "global", retryAfter: global_.retryAfter }, 429);
  }

  const token = env.JARVIS_CALL_TOKEN || "";
  let status = "new";
  let note = "queued — trigger pending";

  if (!token) {
    // Nothing to dial with: log the request (a real lead), answer honestly.
    note = "trigger not configured";
  } else {
    try {
      const upstream = await fetch(VPS_CALL_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-jarvis-token": token,
        },
        body: JSON.stringify({ mobile: e164, mode: "tour" }),
        signal: AbortSignal.timeout(45000),
      });
      const detail = await upstream.json().catch(() => ({}));
      if (upstream.ok && detail.status === "answered") {
        status = "dialled";
        note = "answered";
      } else if (upstream.ok) {
        status = "new";
        note = "no answer / " + (detail.status || "unknown") + ": " + (detail.detail || "");
      } else if (upstream.status === 401 || upstream.status === 400) {
        return json({ ok: false, error: upstream.status === 401 ? "not_configured" : "invalid_number" }, upstream.status === 400 ? 400 : 503);
      } else {
        const text = await upstream.text().catch(() => "");
        const hdrs = ["server", "cf-ray", "content-type", "cf-mitigated"]
          .map((h) => h + "=" + (upstream.headers.get(h) || "-")).join(" ");
        note = "trigger failed: " + upstream.status + (text ? ": " + text.slice(0, 140) : "") + " [" + hdrs + "]";
      }
    } catch {
      note = "trigger unreachable";
    }
  }

  try {
    await (env.DB_REPEATER || env.DB)
      .prepare("INSERT INTO call_requests (mobile, status, notes) VALUES (?, ?, ?)")
      .bind(e164, status, note)
      .run();
  } catch {
    // the lead log must never break the caller-facing answer
  }

  if (status !== "dialled") {
    // The dial went out but nobody picked up — or the trigger itself failed.
    // Refund the per-number allowance: the phone never rang, so the caller
    // hasn't consumed anything. The IP and global caps keep their counts, so
    // an abuser still burns out after 5 requests per IP per day; only the
    // legitimate retry path is freed.
    try {
      await (env.DB_APHELION || env.DB)
        .prepare("DELETE FROM rate_limits WHERE key = ?")
        .bind("aicall:num:" + numHash)
        .run();
    } catch {
      // a failed refund only re-tightens the cap; never block the response
    }
    if (!token) {
      return json({ ok: false, error: "not_configured" }, 503);
    }
    return json({ ok: true, calling: true, answered: false, note: note });
  }
  return json({ ok: true, calling: true, answered: true });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method === "POST") return onRequestPost(context);
  return json({ ok: false, error: "method_not_allowed" }, 405);
}
