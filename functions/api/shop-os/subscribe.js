/**
 * /api/shop-os/subscribe — start a Repair Shop OS subscription.
 *
 * POST  creates (or reuses) a Revolut subscription against the tier's plan
 *       variation, records the tenant in aphelion's `saas_customers`, and
 *       returns the hosted setup-checkout url the customer is sent to. The
 *       subscription starts `pending`; the customer's payment method is
 *       collected on the setup order, and /api/shop-os/webhook settles it.
 * GET   reports the backend state for a reference (?ref=…), for the return
 *       page. It returns a state word and nothing else — no names, no emails.
 *
 * This is NEW relative to ../fivestarrepairs (which only does one-off orders),
 * and the shapes are the verified Merchant API 2026-08-17 Subscriptions surface:
 *   POST /api/subscription-plans    { name, trial_duration, variations[].phases[] }
 *   POST /api/customers             { full_name, email }
 *   POST /api/subscriptions         { plan_variation_id, customer_id, external_reference }
 *   GET  /api/orders/{id}           the setup order → checkout_url
 * The plan + variation are created ONCE per tier and cached in
 * `revolut_plan_cache`, never recreated per signup.
 *
 * The trial: Revolut expresses a trial as a duration on the plan
 * (`trial_duration`, days only, e.g. "P14D"), NOT as a zero-amount phase —
 * confirmed in the spec — so TRIAL_DAYS in _tiers.js is rendered as that field.
 *
 * DB contract (see CLAUDE.md): this repo may write ONLY `saas_customers` and
 * `saas_subscriptions` in DB_APHELION, and ONLY the `revolut_*` columns on
 * them. `stripe_customer_id` / `stripe_subscription_id` are never read or
 * written here. If migration 029's columns are missing, this degrades with
 * { ok:false, skip:true, reason:"schema_pending" } rather than altering
 * aphelion's tables.
 */

import {
  revolutConfig,
  rv,
  createRevolutCustomer,
  createRevolutSubscription,
  getRevolutOrder,
  cancelRevolutOrder,
} from "../_revolut.js";
import { tierOf, newReference, TRIAL_DAYS, trialDuration } from "./_tiers.js";
import {
  json, str, EMAIL_RE, upsertShadowOrder, findByReference, subscriptionMarker,
} from "./_store.js";

const NOT_CONFIGURED = { ok: false, skip: true, reason: "not_configured" };
const SCHEMA_PENDING = { ok: false, skip: true, reason: "schema_pending" };

function planCacheDb(env) {
  const db = env && env.DB_REPEATER;
  return db && typeof db.prepare === "function" ? db : null;
}
function aphelionDb(env) {
  const db = env && env.DB_APHELION;
  return db && typeof db.prepare === "function" ? db : null;
}
function noColumn(e) {
  return /no such column|has no column named|no such table/i.test(String(e && e.message));
}

/** The saas_customers row for an email, or null. */
async function findCustomer(db, email) {
  try {
    return await db
      .prepare("SELECT id, status, revolut_customer_id FROM saas_customers WHERE contact_email = ?")
      .bind(email)
      .first();
  } catch (e) {
    if (noColumn(e)) return { schema_pending: true };
    throw e;
  }
}

/**
 * Get (creating once if needed) the plan variation for a tier. Cached in
 * `revolut_plan_cache`; the plan is created with its single monthly phase and
 * the trial duration. Never throws — returns { ok:false, error } on failure.
 */
async function planVariationFor(env, cfg, tier) {
  const db = planCacheDb(env);
  if (db) {
    try {
      const row = await db
        .prepare("SELECT plan_id, variation_id FROM revolut_plan_cache WHERE tier = ?")
        .bind(tier.key)
        .first();
      if (row && row.plan_id && row.variation_id) {
        return { ok: true, planId: row.plan_id, variationId: row.variation_id, cached: true };
      }
    } catch (e) {
      if (!noColumn(e)) throw e;
    }
  }

  const res = await rv(cfg, "/api/subscription-plans", "POST", {
    name: "Repair Shop OS — " + tier.name,
    trial_duration: trialDuration(),
    variations: [
      {
        phases: [
          { ordinal: 1, cycle_duration: "P1M", amount: tier.cents, currency: "AUD" },
        ],
      },
    ],
  });
  const plan = res.ok && res.j;
  const variationId = plan && Array.isArray(plan.variations) && plan.variations[0] && plan.variations[0].id;
  if (!plan || !plan.id || !variationId) {
    return { ok: false, error: res.detail || "Revolut wouldn't create the subscription plan (HTTP " + res.status + ")." };
  }
  if (db) {
    try {
      await db
        .prepare(
          "INSERT INTO revolut_plan_cache (tier, plan_id, variation_id, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(tier) DO UPDATE SET plan_id = excluded.plan_id, variation_id = excluded.variation_id, updated_at = excluded.updated_at"
        )
        .bind(tier.key, plan.id, variationId, new Date().toISOString())
        .run();
    } catch (e) {
      console.error("shop-os/subscribe: plan cache write failed", e && e.message);
    }
  }
  return { ok: true, planId: plan.id, variationId, cached: false };
}

/* ---------------- GET: the return page's state read ---------------- */

export async function onRequestGet(context) {
  const env = context && context.env;
  const url = new URL(context.request.url);
  const ref = str(url.searchParams.get("ref"), 60);
  if (!ref) return json({ ok: false, error: "Missing reference." }, 400);

  const row = await findByReference(env, ref);
  if (!row) return json({ ok: true, kind: "none", state: "none" });

  const marker = subscriptionMarker(row);
  if (!marker) {
    // A one-off order: state is the shadow row's own status.
    return json({ ok: true, kind: "one-off", state: row.status === "paid" ? "active" : "pending" });
  }

  const db = aphelionDb(env);
  if (!db || !marker.subscription_id) return json({ ok: true, kind: "subscription", state: "pending" });
  try {
    const sub = await db
      .prepare("SELECT status FROM saas_subscriptions WHERE revolut_subscription_id = ?")
      .bind(marker.subscription_id)
      .first();
    const status = sub && sub.status ? String(sub.status) : "pending";
    return json({ ok: true, kind: "subscription", state: status });
  } catch (e) {
    if (noColumn(e)) return json(SCHEMA_PENDING);
    throw e;
  }
}

/* ---------------- POST: start a subscription ---------------- */

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    return await handle(request, env);
  } catch (e) {
    console.error("shop-os/subscribe failed:", e && e.stack ? e.stack : String(e));
    return json({ ok: false, error: "Subscribe error: " + str(e && e.message, 200) }, 400);
  }
}

async function handle(request, env) {
  const cfg = revolutConfig(env);
  if (!cfg) return json(NOT_CONFIGURED);
  const db = aphelionDb(env);
  if (!db) return json(SCHEMA_PENDING);

  let d;
  try {
    d = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const tier = tierOf(d.tier);
  const name = str(d.name, 160);
  const email = str(d.email, 200).toLowerCase();
  const business = str(d.business, 160) || name;
  if (!name) return json({ ok: false, error: "Please tell us your name." }, 400);
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "Please give a valid email address." }, 400);

  // The DB contract gate: if migration 029's columns are absent, say so and do
  // NOT call Revolut — never start a subscription we cannot record.
  const existing = await findCustomer(db, email);
  if (existing && existing.schema_pending) return json(SCHEMA_PENDING);

  const origin = new URL(request.url).origin;
  const asked = str(d.ref, 60);
  const reference = asked || newReference();

  // Retry path: reuse the pending setup order, or cancel a dead one and start
  // fresh against the same shadow row.
  if (asked) {
    const row = await findByReference(env, reference);
    if (row) {
      if (row.status === "paid") return json({ ok: false, error: "That subscription is already set up." }, 409);
      const setupId = row.processor_order_id;
      if (setupId) {
        const got = await getRevolutOrder(cfg, setupId);
        const state = got.ok ? String(got.order.state || "").toLowerCase() : "";
        if (got.ok && state !== "completed" && state !== "cancelled" && got.order.checkout_url) {
          return json({ ok: true, url: got.order.checkout_url, reference, reused: true });
        }
        await cancelRevolutOrder(cfg, setupId);
      }
    }
  }

  const plan = await planVariationFor(env, cfg, tier);
  if (!plan.ok) return json({ ok: false, error: plan.error }, 400);

  // The Revolut customer (created once per tenant, reused after).
  let customerId = existing && existing.revolut_customer_id;
  if (!customerId) {
    const made = await createRevolutCustomer(cfg, { email, fullName: name });
    if (!made.ok) return json({ ok: false, error: made.error, revolut_status: made.status }, 400);
    customerId = made.id;
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString();

  // Record the tenant BEFORE creating the subscription, so a Revolut failure
  // leaves nothing dangling and a duplicate email can't create two tenants.
  let customerRowId;
  if (existing) {
    customerRowId = existing.id;
    try {
      await db
        .prepare(
          "UPDATE saas_customers SET business_name = ?, plan = ?, revolut_customer_id = ?, trial_ends_at = ? WHERE id = ?"
        )
        .bind(business, tier.key, customerId, trialEndsAt, existing.id)
        .run();
    } catch (e) {
      if (noColumn(e)) return json(SCHEMA_PENDING);
      throw e;
    }
  } else {
    try {
      const ins = await db
        .prepare(
          "INSERT INTO saas_customers (business_name, contact_email, revolut_customer_id, plan, status, trial_ends_at) " +
            "VALUES (?, ?, ?, ?, 'trial', ?)"
        )
        .bind(business, email, customerId, tier.key, trialEndsAt)
        .run();
      customerRowId = ins && ins.meta ? ins.meta.last_row_id : null;
    } catch (e) {
      if (noColumn(e)) return json(SCHEMA_PENDING);
      throw e;
    }
  }

  const sub = await createRevolutSubscription(cfg, {
    planVariationId: plan.variationId,
    customerId,
    externalReference: reference,
    redirectUrl: origin + "/shop-os/checkout?status=return&ref=" + encodeURIComponent(reference),
  });
  if (!sub.ok) return json({ ok: false, error: sub.error, revolut_status: sub.status }, 400);
  if (!sub.setup_order_id) {
    return json({ ok: false, error: "Revolut didn't return a setup order to collect payment with." }, 400);
  }

  const setupOrder = await getRevolutOrder(cfg, sub.setup_order_id);
  if (!setupOrder.ok || !setupOrder.order.checkout_url) {
    return json(
      { ok: false, error: setupOrder.error || "Revolut didn't return a checkout page for the subscription." },
      400
    );
  }

  // The subscription row, `pending` until the setup order completes. Writing it
  // now (rather than only in the webhook) means a lifecycle event arriving
  // before setup finishes can still be matched to the tenant.
  try {
    await db
      .prepare(
        "INSERT INTO saas_subscriptions (customer_id, plan, amount_cents, interval, revolut_subscription_id, current_period_start, status) " +
          "VALUES (?, ?, ?, 'month', ?, ?, 'pending')"
      )
      .bind(customerRowId, tier.key, tier.cents, sub.id, new Date().toISOString())
      .run();
  } catch (e) {
    if (noColumn(e)) return json(SCHEMA_PENDING);
    // A missing customer id is not fatal to taking the payment, but it would
    // orphan the subscription — log it and keep going; the webhook's UPDATE
    // simply won't match, and the owner alert still fires.
    console.error("shop-os/subscribe: subscription row write failed", e && e.message);
  }

  // The shadow row keys the webhook's settlement: processor_order_id is the
  // SETUP order, and the marker names the subscription.
  await upsertShadowOrder(env, {
    reference,
    processorOrderId: sub.setup_order_id,
    items: [
      {
        name: "Repair Shop OS — " + tier.name + " (subscription setup)",
        qty: 1,
        kind: "subscription",
        tier: tier.key,
        subscription_id: sub.id,
        customer_id: customerRowId,
        email,
        business_name: business,
      },
    ],
    total: 0,
    channel: "shop-os",
  });

  return json({ ok: true, url: setupOrder.order.checkout_url, reference });
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === "GET" || method === "HEAD") return onRequestGet(context);
  if (method === "POST") return onRequestPost(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET, POST" });
}