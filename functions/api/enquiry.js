/**
 * Public enquiry API — the contact form and the trade-account application.
 *
 * POST /api/enquiry
 *   body: { name, email?, phone?, business?, abn?, headcount?, interest?, message?, source?, business_slug? }
 *   -> 200 { ok: true, stored: boolean }
 *
 * Ported from aphelion/functions/api/enquiry.js — keep in sync.
 * tests/contract.test.mjs asserts this behaves identically to aphelion's.
 *
 * A lead is written to DB_APHELION.leads (aphelion migration 027) AND raises an
 * owner alert immediately, so an application is never only sitting in a table
 * nobody has opened yet.
 *
 * Degrades gracefully, matching the rest of the backend: if migration 027 has
 * not been applied, or the database isn't bound, the alert still fires and the
 * form still succeeds. Only when BOTH the insert and the alert fail does it
 * return 503 asking the visitor to email us, rather than pretending the enquiry
 * was received.
 *
 * Privacy: the raw IP is never stored. `ip_hash` is a one-way SHA-256 of
 * ip + user-agent + day, kept only to spot a flood of identical submissions —
 * which is exactly what /privacy promises. The honeypot field `company`
 * silently absorbs bot submissions.
 *
 * NOTE ON `interest`. This site only ever sends "wholesale": it is a B2B
 * wholesale counter with no retail or software funnel. The other values are
 * still accepted because aphelion's Leads tab owns that vocabulary. The trade
 * application and the contact form are the same endpoint with a different
 * `source`, which is why /apply sends source "apply:trade".
 *
 * A trade account is NOT created here. This writes a lead. Setting a credit
 * limit or terms is an owner action in aphelion's Wholesale tab — a website
 * form must never be able to set its own credit limit.
 */
import { rateLimit, clientIp } from "./_ratelimit.js";
import { alertOwner } from "./_alert.js";
import { melbourneDay } from "./_time.js";

const LIMIT = 5;
const WINDOW_SECONDS = 600;
const CONTACT_FALLBACK = "orders@repeater.com.au";
const INTERESTS = new Set(["fleet", "wholesale", "software", "other"]);
const MAX = { name: 80, email: 160, phone: 40, business: 120, headcount: 40, message: 2000, source: 60, slug: 40 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** One-way per-visitor-day hash. The raw IP is never persisted. */
async function ipHash(request) {
  const ip = clientIp(request);
  const ua = String(request.headers.get("user-agent") || "");
  try {
    const data = `${ip}|${ua}|${melbourneDay(new Date())}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(digest).slice(0, 8), (x) => x.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/**
 * Read the body as JSON, or as a plain HTML form post (urlencoded/multipart),
 * so the form still captures the enquiry if JavaScript is unavailable. Returns
 * null for a body that is neither.
 */
async function readBody(request) {
  const ct = String(request.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) return await request.json();
    if (ct.includes("form-urlencoded") || ct.includes("multipart/form-data")) {
      const out = {};
      for (const [k, v] of (await request.formData()).entries()) if (typeof v === "string") out[k] = v;
      return out;
    }
    const text = await request.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return Object.fromEntries(new URLSearchParams(text)); }
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  const rl = await rateLimit(env, "enquiry:" + clientIp(request), LIMIT, WINDOW_SECONDS);
  if (rl.limited) {
    return json(
      { ok: false, error: "Too many enquiries from this connection. Please wait a few minutes, or email " + CONTACT_FALLBACK + "." },
      429,
      { "retry-after": String(rl.retryAfter) }
    );
  }

  const body = await readBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length) {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot: a real person never fills a hidden "company" field. Answer 200 so
  // the bot believes it succeeded, but store and alert nothing.
  if (clean(body.company, 80)) return json({ ok: true, stored: false });

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email);
  const phone = clean(body.phone, MAX.phone);
  if (!name) return json({ ok: false, error: "Please tell us your name." }, 400);
  if (!email && !phone) return json({ ok: false, error: "Please leave an email address or a phone number." }, 400);
  if (email && !EMAIL_RE.test(email)) return json({ ok: false, error: "That email address doesn't look right." }, 400);

  const interestRaw = clean(body.interest, 20).toLowerCase();
  const lead = {
    name,
    email,
    phone,
    business_name: clean(body.business, MAX.business),
    interest: INTERESTS.has(interestRaw) ? interestRaw : "wholesale",
    headcount: clean(body.headcount, MAX.headcount),
    message: clean(body.message, MAX.message),
    source: clean(body.source, MAX.source) || "site",
    business_slug: /^[a-z0-9_-]{0,40}$/i.test(clean(body.business_slug, MAX.slug)) ? clean(body.business_slug, MAX.slug).toLowerCase() : "",
    ip_hash: await ipHash(request),
  };

  // The ABN is a trade-application field, not a leads column. It is folded into
  // the message so it reaches the owner without this repo altering aphelion's
  // platform schema — the rule is that business/wholesale schema is owned
  // elsewhere, and `leads` is aphelion's table, not ours.
  const abn = clean(body.abn, 20);
  if (abn && !/abn/i.test(lead.message)) {
    lead.message = clean((abn ? "ABN: " + abn + "\n" : "") + lead.message, MAX.message);
  }

  let stored = false;
  const db = env && env.DB_APHELION;
  if (db && typeof db.prepare === "function") {
    try {
      await db
        .prepare(
          "INSERT INTO leads (name, email, phone, business_name, interest, headcount, message, source, business_slug, status, ip_hash) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)"
        )
        .bind(
          lead.name, lead.email, lead.phone, lead.business_name, lead.interest,
          lead.headcount, lead.message, lead.source, lead.business_slug, lead.ip_hash
        )
        .run();
      stored = true;
    } catch { /* table not migrated yet, or a DB hiccup — the alert still fires */ }
  }

  const who = [lead.name, lead.business_name].filter(Boolean).join(" · ");
  const lines = [
    who,
    lead.email ? "Email: " + lead.email : "",
    lead.phone ? "Phone: " + lead.phone : "",
    lead.headcount ? "Volume: " + lead.headcount : "",
    lead.message ? "— " + lead.message : "",
    lead.source ? "(" + lead.source + ")" : "",
  ].filter(Boolean);
  const notified = await alertOwner(env, {
    title: "New " + lead.interest + " enquiry",
    message: lines.join("\n"),
  });

  // Nothing captured and nobody told: say so plainly instead of a false "thanks".
  if (!stored && !notified.ok) {
    return json({ ok: false, error: "We couldn't send your enquiry. Please email " + CONTACT_FALLBACK + "." }, 503);
  }
  return json({ ok: true, stored });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "POST" } });
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "POST" });
}