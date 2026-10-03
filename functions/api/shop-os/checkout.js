/**
 * /api/shop-os/checkout — the payment config probe (GET) and the one-off
 * purchase (POST).
 *
 * GET  tells the checkout page whether the Revolut rail is live. It NEVER
 *      assumes it can take a card: the page asks this first and only renders a
 *      payment action when the answer is configured. When REVOLUT_SECRET_KEY is
 *      absent it answers { ok:false, skip:true, reason:"not_configured" } — the
 *      shape the page has handled since before the rail existed — and when the
 *      rail's own table is missing it answers reason:"schema_pending". No secret
 *      is ever read or echoed: this reports capability, never a key.
 *
 * POST buys ONE month of a Repair Shop OS tier as a single Revolut order. The
 * recurring product is /api/shop-os/subscribe; this is the one-off path (a
 * prepaid month, or a customer who does not want a stored card). The price is
 * resolved from the server-side tier table, never from the client, and a shadow
 * row is written to `orders` with its processor_order_id so the webhook can
 * settle it. Never throws; creation failure leaves nothing orphaned.
 *
 * Config (Cloudflare env): REVOLUT_SECRET_KEY (secret), REVOLUT_ENV (default
 * production), REVOLUT_API_VERSION (optional).
 */

import { revolutConfig, createRevolutOrder, cancelRevolutOrder, getRevolutOrder } from "../_revolut.js";
import { tierOf, newReference } from "./_tiers.js";
import { json, str, EMAIL_RE, upsertShadowOrder, findByReference } from "./_store.js";

/* ---------------- GET: the probe ---------------- */

const NOT_CONFIGURED = { ok: false, skip: true, reason: "not_configured" };
const SCHEMA_PENDING = { ok: false, skip: true, reason: "schema_pending" };

/** Is the rail's own table there? (migration 003) */
async function planCacheReady(env) {
  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return false;
  try {
    await db.prepare("SELECT tier FROM revolut_plan_cache LIMIT 1").first();
    return true;
  } catch {
    return false;
  }
}

export async function onRequestGet(context) {
  const env = context && context.env;
  const cfg = revolutConfig(env);
  if (!cfg) return json(NOT_CONFIGURED);
  if (!(await planCacheReady(env))) return json(SCHEMA_PENDING);
  return json({
    ok: true,
    configured: true,
    env: env.REVOLUT_ENV === "sandbox" ? "sandbox" : "production",
    // The public key is NOT returned: this rail redirects to Revolut's hosted
    // page, so no embedded widget and no key of any kind reaches the browser.
  });
}

/* ---------------- POST: one month, one order ---------------- */

/** Where the customer lands. `ref` lets the page resume, `status` names the return. */
function returnUrl(origin, reference) {
  return origin + "/shop-os/checkout?status=return&ref=" + encodeURIComponent(reference);
}

/**
 * Decide what to do with an earlier attempt at the same reference, so a second
 * click cannot create a parallel order:
 *   { paid:true }   already settled — refuse
 *   { url }         the old Revolut order is still payable — reuse it
 *   { fresh:true }  the old order is dead/unknown — cancel it and mint a new one
 * The shadow row is reused either way (same reference), so nothing is orphaned.
 */
async function priorAttempt(env, cfg, reference) {
  const row = await findByReference(env, reference);
  if (!row) return { none: true };
  if (row.status === "paid") return { paid: true };
  const processorId = row.processor_order_id;
  if (processorId) {
    const got = await getRevolutOrder(cfg, processorId);
    const state = got.ok ? String(got.order.state || "").toLowerCase() : "";
    if (got.ok && state !== "completed" && state !== "cancelled" && got.order.checkout_url) {
      return { url: got.order.checkout_url };
    }
    await cancelRevolutOrder(cfg, processorId); // best-effort; never throws
  }
  return { fresh: true };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    return await handle(request, env);
  } catch (e) {
    console.error("shop-os/checkout failed:", e && e.stack ? e.stack : String(e));
    return json({ ok: false, error: "Checkout error: " + str(e && e.message, 200) }, 400);
  }
}

async function handle(request, env) {
  const cfg = revolutConfig(env);
  if (!cfg) return json(NOT_CONFIGURED);
  if (!(await planCacheReady(env))) return json(SCHEMA_PENDING);

  let d;
  try {
    d = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const tier = tierOf(d.tier);
  const name = str(d.name, 160);
  const email = str(d.email, 200).toLowerCase();
  const business = str(d.business, 160);
  if (!name) return json({ ok: false, error: "Please tell us your name." }, 400);
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "Please give a valid email address." }, 400);

  const origin = new URL(request.url).origin;

  // Retry path. A click that carries a reference we already know either reuses
  // the pending Revolut order or (if that order is dead) cancels it and makes a
  // fresh one against the same shadow row.
  const asked = str(d.ref, 60);
  const reference = asked || newReference();
  if (asked) {
    const prior = await priorAttempt(env, cfg, asked);
    if (prior.paid) return json({ ok: false, error: "That order is already paid." }, 409);
    if (prior.url) return json({ ok: true, url: prior.url, reference: asked, reused: true });
  }
  const made = await createRevolutOrder(cfg, {
    amountCents: tier.cents,
    currency: "AUD",
    description: "Repair Shop OS — " + tier.name + " · one month (" + reference + ")",
    reference,
    origin,
    redirectUrl: returnUrl(origin, reference),
    customer: { email, full_name: name },
    metadata: {
      reference,
      tier: tier.key,
      planning: "one-off-month",
      business: business || "",
    },
  });

  // A payment-provider failure is a 400, not a 502: Cloudflare replaces the body
  // of a 5xx from a Pages Function with its own error page, so a 502 would reach
  // the page as an opaque failure instead of this message.
  if (!made.ok) return json({ ok: false, error: made.error, revolut_status: made.status }, 400);

  await upsertShadowOrder(env, {
    reference,
    processorOrderId: made.id,
    items: [
      {
        name: tier.name + " — one month (Repair Shop OS)",
        qty: 1,
        tier: tier.key,
        planning: "one-off-month",
      },
    ],
    total: tier.cents / 100,
    channel: "shop-os",
  });

  return json({ ok: true, url: made.checkout_url, publicId: made.publicId || null, reference });
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === "GET" || method === "HEAD") return onRequestGet(context);
  if (method === "POST") return onRequestPost(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET, POST" });
}