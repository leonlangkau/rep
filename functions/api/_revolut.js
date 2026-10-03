/**
 * Revolut Merchant API client — the one place this repo talks to Revolut.
 *
 * Ported verbatim from ../fivestarrepairs/functions/api/_revolut.js (fsr is the
 * source of truth for this rail). The public surface and env names are kept
 * identical on purpose so the two adapters can be diffed:
 *
 *   revolutConfig(env)           -> { token, base, version } | null
 *   revolutBase(env)             -> sandbox or production host
 *   rv(cfg, path, method, body)  -> never throws; { ok, status, j, detail, code }
 *   createRevolutOrder(cfg, o)   -> { ok, id, checkout_url, state } | { ok:false, error }
 *   createRevolutCustomer(cfg,c) -> { ok, id, raw } | { ok:false, error }
 *   createRevolutSubscription(cfg, s) -> { ok, id, state, setup_order_id } | { ok:false, error }
 *   getRevolutSubscription(cfg,id)    -> { ok, subscription } | { ok:false, error }
 *   getRevolutOrder(cfg, id)     -> { ok, order } | { ok:false, error }
 *   cancelRevolutOrder(cfg, id)  -> cancels a pending order
 *   verifyRevolutWebhook(secret, headers, rawBody) -> boolean
 *
 * Server-side only. Every call authenticates with the secret key
 * (`Authorization: Bearer sk_…`) and pins a version with the
 * `Revolut-Api-Version` header. Nothing here is ever imported into public/:
 * the secret key must never reach a browser.
 *
 * Config (Cloudflare env on the `repeater` Pages project):
 *   REVOLUT_SECRET_KEY      (secret) the Merchant API secret key, sk_…
 *   REVOLUT_ENV             "sandbox" to test in sandbox (default production)
 *   REVOLUT_API_VERSION     optional; defaults to DEFAULT_REVOLUT_VERSION
 *   REVOLUT_WEBHOOK_SECRET  (secret) the webhook signing secret, wsk_…
 *
 * Money is in the currency's lowest denomination (cents). Capture is automatic:
 * create an order, send the customer to checkout_url, and Revolut fires
 * ORDER_COMPLETED when the money is taken. Nothing here decides a price —
 * callers pass the cents.
 */

const enc = new TextEncoder();

export function revolutBase(env) {
  // Production is the DEFAULT. This is a live business, and a missing
  // REVOLUT_ENV must not silently send production keys to the sandbox (which
  // rejects them — "Authentication failed"). Set REVOLUT_ENV=sandbox
  // explicitly to test against the sandbox.
  return env.REVOLUT_ENV === "sandbox"
    ? "https://sandbox-merchant.revolut.com"
    : "https://merchant.revolut.com";
}

// Revolut ships dated API versions and requires the header on orders endpoints.
// The default is a currently-published version; pin REVOLUT_API_VERSION to move
// it forward or back without a code change. Versions are retired over time, so
// if a call comes back 400 naming the version, bump this.
export const DEFAULT_REVOLUT_VERSION = "2026-08-17";

export function revolutConfig(env) {
  const token = env && env.REVOLUT_SECRET_KEY;
  if (!token) return null;
  return {
    token,
    base: revolutBase(env),
    version: (env && env.REVOLUT_API_VERSION) || DEFAULT_REVOLUT_VERSION,
  };
}

/**
 * One Revolut request. Never rejects: a DNS/TLS/socket failure comes back as
 * { ok:false, status:0, code:"NETWORK" }, the same shape as a refusal, because
 * every caller already tests `ok` and several promise their own callers they
 * never throw.
 */
export async function rv(cfg, path, method, body, extraHeaders) {
  let r;
  try {
    r = await fetch(cfg.base + path, {
      method,
      headers: {
        "authorization": "Bearer " + cfg.token,
        "content-type": "application/json",
        "revolut-api-version": cfg.version,
        ...(extraHeaders || {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, j: null, code: "NETWORK", detail: "Couldn't reach Revolut: " + String(e && e.message).slice(0, 160) };
  }
  const j = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, j, detail: revolutDetail(j, r.status), code: j && j.code };
}

// Revolut answers errors either as { message, code } or as an errors array.
// Pull whichever is there so an operator gets a sentence, not "HTTP 400".
function revolutDetail(j, status) {
  if (!j) return status ? "Revolut answered HTTP " + status + "." : "";
  if (typeof j.message === "string" && j.message) return j.message;
  const e = Array.isArray(j.errors) && j.errors[0];
  if (e) return e.message || e.detail || e.code || "";
  return status && !j.id ? "Revolut answered HTTP " + status + "." : "";
}

// The create-order endpoints have appeared under both /api/orders and the older
// /api/1.0/orders prefix depending on account age. A 404 on one is retried on
// the other once, so this works on either without a config flag.
async function rvOrders(cfg, path, method, body, extraHeaders) {
  let res = await rv(cfg, path, method, body, extraHeaders);
  if (!res.ok && res.status === 404 && path.startsWith("/api/orders")) {
    res = await rv(cfg, "/api/1.0" + path, method, body, extraHeaders);
  }
  return res;
}

/**
 * Create an order and get its hosted-checkout URL. Never throws:
 *   { ok:true, id, token, checkout_url, state }
 *   { ok:false, status, error }
 * `o`:
 *   amountCents    (required) the charge, in cents
 *   currency       default "AUD"
 *   description    shown on the checkout page
 *   reference      our own reference, echoed back on the order/webhook
 *   redirectUrl    where the customer lands after paying
 *   origin         our site, stored on merchant_order_data for the dashboard
 *   customer       { email?, phone?, full_name? } prefills the checkout
 *   lineItems      optional itemised lines; a retail account may require them
 *   metadata       any extra key/values to keep on the order
 */
export async function createRevolutOrder(cfg, o) {
  const body = {
    amount: Math.round(Number(o.amountCents) || 0),
    currency: o.currency || "AUD",
    capture_mode: "automatic",
  };
  if (o.description) body.description = String(o.description).slice(0, 255);
  if (o.redirectUrl) body.redirect_url = o.redirectUrl;

  const mod = {};
  if (o.reference) mod.reference = String(o.reference).slice(0, 255);
  if (o.origin) mod.url = String(o.origin).slice(0, 255);
  if (Object.keys(mod).length) body.merchant_order_data = mod;

  if (o.metadata && typeof o.metadata === "object") body.metadata = o.metadata;

  if (o.customer) {
    const c = {};
    if (o.customer.email) c.email = String(o.customer.email).slice(0, 200);
    if (o.customer.phone) c.phone = String(o.customer.phone).slice(0, 40);
    if (o.customer.full_name) c.full_name = String(o.customer.full_name).slice(0, 160);
    if (Object.keys(c).length) body.customer = c;
  }

  if (Array.isArray(o.lineItems) && o.lineItems.length) {
    body.line_items = o.lineItems.map((li) => ({
      name: String(li.name).slice(0, 255),
      type: li.type || "physical",
      quantity: Number(li.quantity) || 1,
      unit_price_amount: Math.round(Number(li.unit_price_amount) || 0),
      total_amount: Math.round(Number(li.total_amount) || 0),
    }));
  }
  if (o.shipping && typeof o.shipping === "object") body.shipping = o.shipping;

  const res = await rvOrders(cfg, "/api/orders", "POST", body);
  const ord = res.ok && res.j;
  if (!ord || !ord.checkout_url) {
    return { ok: false, status: res.status, error: res.detail || "Revolut wouldn't create the payment link (HTTP " + res.status + ")." };
  }
  // The web SDK keys off the order's PUBLIC id. Depending on the API version the
  // response carries it as `public_id`, or only inside the checkout URL
  // (`…/payment-link/<public_id>`), or — last resort — as `token`.
  const publicId = ord.public_id
    || (ord.checkout_url ? String(ord.checkout_url).split("/").filter(Boolean).pop() : null)
    || ord.token
    || null;
  return { ok: true, id: ord.id || null, token: ord.token || null, publicId, checkout_url: ord.checkout_url, state: ord.state || null, raw: ord };
}

/** Fetch an order (state, amount, payments[], customer). Never throws. */
export async function getRevolutOrder(cfg, orderId) {
  const res = await rvOrders(cfg, "/api/orders/" + encodeURIComponent(orderId), "GET");
  const ord = res.ok && res.j;
  if (!ord || !ord.id) {
    return { ok: false, status: res.status, error: res.detail || "Revolut couldn't tell us about that order (HTTP " + res.status + ")." };
  }
  return { ok: true, order: ord };
}

/** Cancel a pending order so its checkout URL stops working. Never throws. */
export async function cancelRevolutOrder(cfg, orderId) {
  const res = await rvOrders(cfg, "/api/orders/" + encodeURIComponent(orderId) + "/cancel", "POST");
  return { ok: res.ok || res.status === 404, status: res.status, order: res.ok && res.j ? res.j : null, error: res.detail };
}

/* ---------------- Subscriptions API ---------------- */

/**
 * Create a Revolut customer (required before a subscription can be created).
 * Verified against the 2026-08-17 Merchant API: POST /api/customers with
 * { full_name, email, phone?, date_of_birth? }; `email` is required.
 * Never throws.
 *   { ok:true, id, raw } | { ok:false, status, error }
 */
export async function createRevolutCustomer(cfg, c) {
  const body = {};
  if (c.email) body.email = String(c.email).slice(0, 200);
  if (c.fullName) body.full_name = String(c.fullName).slice(0, 160);
  if (c.phone) body.phone = String(c.phone).slice(0, 40);
  const res = await rv(cfg, "/api/customers", "POST", body);
  const cust = res.ok && res.j;
  if (!cust || !cust.id) {
    return { ok: false, status: res.status, error: res.detail || "Revolut wouldn't create the customer (HTTP " + res.status + ")." };
  }
  return { ok: true, id: cust.id, raw: cust };
}

/**
 * Create a subscription against a plan variation. Verified shape:
 *   POST /api/subscriptions
 *   { plan_variation_id, customer_id, external_reference?, setup_order_redirect_url? }
 * → { id, state:"pending", setup_order_id, ... }
 * The setup order's checkout_url is fetched separately with getRevolutOrder().
 * Never throws.
 */
export async function createRevolutSubscription(cfg, s) {
  const body = {
    plan_variation_id: s.planVariationId,
    customer_id: s.customerId,
  };
  if (s.externalReference) body.external_reference = String(s.externalReference).slice(0, 1024);
  if (s.redirectUrl) body.setup_order_redirect_url = String(s.redirectUrl).slice(0, 500);
  // Optional override of the plan's default trial. Only days are allowed.
  if (s.trialDuration) body.trial_duration = String(s.trialDuration);

  const res = await rv(cfg, "/api/subscriptions", "POST", body, s.idempotencyKey ? { "idempotency-key": s.idempotencyKey } : undefined);
  const sub = res.ok && res.j;
  if (!sub || !sub.id) {
    return { ok: false, status: res.status, error: res.detail || "Revolut wouldn't start the subscription (HTTP " + res.status + ")." };
  }
  return { ok: true, id: sub.id, state: sub.state || null, setup_order_id: sub.setup_order_id || null, raw: sub };
}

/** Retrieve a subscription by id (state, trial_end_date, current cycle). Never throws. */
export async function getRevolutSubscription(cfg, subscriptionId) {
  const res = await rv(cfg, "/api/subscriptions/" + encodeURIComponent(subscriptionId), "GET");
  const sub = res.ok && res.j;
  if (!sub || !sub.id) {
    return { ok: false, status: res.status, error: res.detail || "Revolut couldn't tell us about that subscription (HTTP " + res.status + ")." };
  }
  return { ok: true, subscription: sub };
}

/* ---------------- webhook signature ---------------- */

function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a Revolut webhook. Revolut signs the raw body as
 * `v1.{timestamp}.{rawBody}` with HMAC-SHA256 (hex), sending the digest in the
 * `Revolut-Signature` header (possibly several comma-separated `v1=` values
 * during a secret rotation) and the timestamp in
 * `Revolut-Request-Timestamp` (ms) — or inline as `t=`. The body must be the
 * exact bytes received; a re-serialised JSON will not verify.
 *
 * Returns true only when a signature matches AND, when a timestamp is present,
 * it is within five minutes. Without the signing secret, nothing verifies.
 */
export async function verifyRevolutWebhook(secret, headers, rawBody, toleranceMs = 5 * 60 * 1000) {
  if (!secret || !headers || !rawBody) return false;
  const sigHeader = headers.get("revolut-signature") || "";
  if (!sigHeader) return false;

  const sigs = [];
  let inlineTs = "";
  for (const part of sigHeader.split(",")) {
    const p = part.trim();
    const i = p.indexOf("=");
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k === "v1") sigs.push(v.toLowerCase());
    else if (k === "t") inlineTs = v;
  }
  if (!sigs.length) return false;

  const ts = headers.get("revolut-request-timestamp") || inlineTs || "";
  if (ts) {
    const n = Number(ts);
    if (Number.isFinite(n)) {
      const ms = n < 1e12 ? n * 1000 : n; // seconds or milliseconds
      if (Math.abs(Date.now() - ms) > toleranceMs) return false;
    }
  }

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("v1." + ts + "." + rawBody)));
  const hex = toHex(mac);
  return sigs.some((s) => timingSafeEqual(hex, s));
}