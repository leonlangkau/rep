/**
 * Revolut Merchant webhook — the only thing that settles a Repair Shop OS
 * payment.
 *   POST /api/shop-os/webhook
 *
 * Register this URL in the Revolut Merchant dashboard and paste its signing
 * secret into REVOLUT_WEBHOOK_SECRET. Every request is verified first with
 * HMAC-SHA256 over `v1.{timestamp}.{raw body}` (see ../_revolut.js); anything
 * unverified is rejected **401**, never silently accepted, so nobody can spoof
 * "paid" events.
 *
 * Events acted on (verified against the 2026-08-17 Merchant API):
 *   ORDER_COMPLETED          the money (or the payment method, for a
 *                            subscription setup order) is in. We read the full
 *                            order back and match its id to a shadow row on
 *                            `orders`. A one-off is simply marked paid; a
 *                            subscription setup also flips the tenant active.
 *   SUBSCRIPTION_CANCELLED   mark that subscription cancelled.
 *   SUBSCRIPTION_INITIATED / SUBSCRIPTION_FINISHED / SUBSCRIPTION_OVERDUE and
 *   everything else          acknowledged 200 and ignored.
 *
 * There is NO activation event for a subscription (the API has none), so the
 * setup order completing is what {trial, pending} → active keys off, and the
 * subscription is read back to confirm its live state and trial end.
 *
 * Idempotent throughout: settlement keys on the stored payment id / a
 * conditional UPDATE from the pre-active state, so a duplicate delivery or two
 * concurrent isolates settle exactly once.
 *
 * Config: REVOLUT_WEBHOOK_SECRET (secret), plus REVOLUT_SECRET_KEY /
 * REVOLUT_ENV / REVOLUT_API_VERSION to read orders and subscriptions back.
 */

import {
  revolutConfig, getRevolutOrder, getRevolutSubscription, verifyRevolutWebhook,
} from "../_revolut.js";
import {
  markOrderPaid, subscriptionMarker, revolutCustomerDetails, fillOrderCustomer,
  paymentAlertPayload, alertPaid, safeParse, str, noColumn,
} from "./_store.js";

function originOf(raw) {
  const s = str(raw, 255);
  return /^https?:\/\//i.test(s) ? s : "https://repeater.com.au";
}

/** The completed/captured payment on a Revolut order, or the first one. */
function pickPayment(order) {
  const pays = order && Array.isArray(order.payments) ? order.payments : [];
  const paid = pays.find((p) => p && (p.state === "completed" || p.state === "captured")) || pays[0];
  return paid && paid.id ? paid.id : null;
}

/** What to write on the alert: the shadow row's own name + the customer. */
function orderLines(order, details) {
  const items = safeParse(order.items, []);
  const names = Array.isArray(items) ? items.map((it) => str(it && it.name, 120)).filter(Boolean) : [];
  const who = [details.customer_name, details.customer_email].filter(Boolean).join(" · ");
  return [order.reference, names.join("; "), who];
}

/* ---------------- subscription settlement ---------------- */

/**
 * Setup order completed: the customer's payment method is saved, so the trial
 * starts. Flip `saas_subscriptions` {pending→active} and `saas_customers`
 * {trial→active}, each guarded so only the first delivery changes anything.
 * The subscription is read back for its live state and trial end (there is no
 * activation webhook). Never throws.
 */
async function settleSubscription(env, marker) {
  const db = env && env.DB_APHELION;
  const result = { ok: false, settled: false, state: null };
  if (!db || typeof db.prepare !== "function" || !marker.subscription_id) return result;

  const now = new Date().toISOString();
  let trialEnd = null;
  const cfg = revolutConfig(env);
  if (cfg) {
    try {
      const got = await getRevolutSubscription(cfg, marker.subscription_id);
      if (got.ok) {
        result.state = got.subscription.state || null;
        trialEnd = got.subscription.trial_end_date || null;
      }
    } catch (e) {
      console.error("shop-os/webhook: subscription read-back failed", e && e.message);
    }
  }

  let subChanged = 0;
  try {
    const flip = await db
      .prepare(
        "UPDATE saas_subscriptions SET status = 'active', current_period_start = ?, current_period_end = ? " +
          "WHERE revolut_subscription_id = ? AND status = 'pending'"
      )
      .bind(now, trialEnd, marker.subscription_id)
      .run();
    subChanged = flip && flip.meta ? Number(flip.meta.changes) : 0;
  } catch (e) {
    if (!noColumn(e)) console.error("shop-os/webhook: subscription flip failed", e && e.message);
  }

  let custChanged = 0;
  if (marker.customer_id) {
    try {
      const flip = await db
        .prepare("UPDATE saas_customers SET status = 'active' WHERE id = ? AND status = 'trial'")
        .bind(marker.customer_id)
        .run();
      custChanged = flip && flip.meta ? Number(flip.meta.changes) : 0;
    } catch (e) {
      if (!noColumn(e)) console.error("shop-os/webhook: customer flip failed", e && e.message);
    }
  }

  result.ok = true;
  result.settled = subChanged === 1 || custChanged === 1;
  return result;
}

/**
 * SUBSCRIPTION_CANCELLED: mark the subscription, and its tenant, cancelled.
 * Matched by the Revolut subscription id; guarded so it is a no-op when already
 * cancelled. Never throws.
 */
async function cancelSubscription(env, subscriptionId) {
  const db = env && env.DB_APHELION;
  const result = { ok: false, cancelled: false };
  if (!db || typeof db.prepare !== "function" || !subscriptionId) return result;
  let customerId = null;
  try {
    const row = await db
      .prepare("SELECT id, customer_id FROM saas_subscriptions WHERE revolut_subscription_id = ?")
      .bind(subscriptionId)
      .first();
    if (!row) return { ok: true, cancelled: false };
    customerId = row.customer_id;
    const flip = await db
      .prepare("UPDATE saas_subscriptions SET status = 'cancelled' WHERE id = ? AND status <> 'cancelled'")
      .bind(row.id)
      .run();
    result.cancelled = !!(flip && flip.meta && Number(flip.meta.changes) === 1);
  } catch (e) {
    if (!noColumn(e)) console.error("shop-os/webhook: cancel failed", e && e.message);
    return result;
  }
  if (customerId) {
    try {
      await db.prepare("UPDATE saas_customers SET status = 'cancelled' WHERE id = ?").bind(customerId).run();
    } catch (e) {
      if (!noColumn(e)) console.error("shop-os/webhook: cancel customer failed", e && e.message);
    }
  }
  result.ok = true;
  return result;
}

/* ---------------- the endpoint ---------------- */

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text();

  const ok = await verifyRevolutWebhook(env.REVOLUT_WEBHOOK_SECRET, request.headers, rawBody);
  if (!ok) {
    // Two different problems look identical from outside: no signing secret, or
    // the wrong one / a tampered body. Say which, without logging the secret.
    console.error("shop-os/webhook: signature rejected", JSON.stringify({
      has_key: !!env.REVOLUT_WEBHOOK_SECRET,
      has_signature: !!request.headers.get("revolut-signature"),
      has_timestamp: !!request.headers.get("revolut-request-timestamp"),
    }));
    return new Response("Unauthorized", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const type = event && event.event;
  const orderId = event && (event.order_id || (event.merchant_order_data && event.merchant_order_data.order_id));
  const origin = originOf(event && event.merchant_order_data && event.merchant_order_data.url);

  if (type === "ORDER_COMPLETED" && orderId) {
    try {
      const cfg = revolutConfig(env);
      let revolutOrder = null;
      let paymentId = null;
      if (cfg) {
        const got = await getRevolutOrder(cfg, orderId);
        if (got.ok) {
          revolutOrder = got.order;
          paymentId = pickPayment(got.order);
        }
      }

      let paidOrder = null;
      try {
        paidOrder = await markOrderPaid(env, orderId, paymentId);
      } catch (e) {
        console.error("shop-os/webhook: order settle failed", e && e.message);
      }

      if (paidOrder) {
        const marker = subscriptionMarker(paidOrder);
        const details = { ...paidOrder };
        try {
          Object.assign(details, await fillOrderCustomer(env, paidOrder, revolutCustomerDetails(revolutOrder)));
        } catch (e) {
          console.error("shop-os/webhook: customer fill failed", e && e.message);
        }

        let sub = null;
        if (marker) {
          try {
            sub = await settleSubscription(env, marker);
          } catch (e) {
            console.error("shop-os/webhook: subscription settle failed", e && e.message);
          }
        }

        const payload = paymentAlertPayload({
          title: (marker ? "OS subscription " : "OS order ") + paidOrder.reference +
            (marker ? " · " + marker.tier : " · $" + (Number(paidOrder.total) || 0).toFixed(2)),
          lines: [
            ...orderLines(details, details),
            marker ? "Tier: " + marker.tier + (sub && sub.state ? " (" + sub.state + ")" : "") : "",
          ],
          origin,
        });
        const extras = alertPaid(env, payload);
        if (typeof context.waitUntil === "function") context.waitUntil(extras);
        else await extras;
      }
    } catch (e) {
      console.error("shop-os/webhook: completed handling failed", e && e.message);
    }
  } else if (type === "SUBSCRIPTION_CANCELLED") {
    try {
      const subId = event && event.subscription_id;
      const res = await cancelSubscription(env, subId);
      if (res.cancelled) {
        const payload = paymentAlertPayload({
          title: "OS subscription cancelled" + (event.external_reference ? " · " + str(event.external_reference, 60) : ""),
          lines: [str(subId, 60), event.external_reference ? "Ref: " + str(event.external_reference, 60) : ""],
          origin,
        });
        const extras = alertPaid(env, payload);
        if (typeof context.waitUntil === "function") context.waitUntil(extras);
        else await extras;
      }
    } catch (e) {
      console.error("shop-os/webhook: cancelled handling failed", e && e.message);
    }
  }

  // Always 200 so Revolut doesn't retry indefinitely for events we don't act on.
  return new Response("ok", { status: 200 });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}