/**
 * Storage plumbing for the Repair Shop OS payment rail.
 *
 * Two databases are in play and they must not be confused:
 *   env.DB_REPEATER  the `repeater` database — OUR tables. The shadow rows live
 *                    in the shared `orders` table (processor_order_id matches
 *                    the Revolut order), plus `revolut_plan_cache`. This repo
 *                    writes only the two neutral processor columns on `orders`.
 *   env.DB_APHELION  aphelion's database — `saas_customers` /
 *                    `saas_subscriptions` only. See the contract in CLAUDE.md:
 *                    these two tables are the only DB_APHELION writes this repo
 *                    is allowed beyond the `leads` insert and rate limiter, and
 *                    NOTHING here may ever touch a `stripe_*` column.
 *
 * Everything here is best-effort toward the customer: Revolut is the source of
 * truth for whether money moved, so a database hiccup must degrade, not throw
 * a 500 into the middle of a checkout.
 */

import { alertOwner } from "../_alert.js";

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export function str(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

export function safeParse(v, fallback) {
  if (v == null || v === "") return fallback;
  try {
    const p = JSON.parse(v);
    return p == null ? fallback : p;
  } catch {
    return fallback;
  }
}

/** A D1 error from a database that hasn't had migration 003 applied yet. */
export function noColumn(e) {
  return /no such column|has no column named|no such table/i.test(String(e && e.message));
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ---------------- shadow rows on `orders` (DB_REPEATER) ---------------- */

/**
 * Write the correlation row for a Revolut order. `processorOrderId` is the
 * Revolut order id (for a subscription, its setup order id); `reference` is
 * ours. Never throws — a failed shadow write must not stop a payment.
 */
export async function insertShadowOrder(env, { reference, processorOrderId, items, total, channel }) {
  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return false;
  const now = new Date().toISOString();
  try {
    await db
      .prepare(
        "INSERT INTO orders (reference, items, total, status, processor_order_id, channel, created_at, updated_at) " +
          "VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)"
      )
      .bind(reference, JSON.stringify(items || []), Number(total) || 0, processorOrderId, channel || "shop-os", now, now)
      .run();
    return true;
  } catch (e) {
    console.error("shop-os: shadow order insert failed", e && e.message);
    return false;
  }
}

/**
 * Insert the correlation row, or refresh the existing one for the same
 * reference (the retry path re-points it at a fresh Revolut order rather than
 * leaving an orphan). Never throws.
 */
export async function upsertShadowOrder(env, { reference, processorOrderId, items, total, channel }) {
  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return false;
  const existing = await findByReference(env, reference);
  if (!existing) return insertShadowOrder(env, { reference, processorOrderId, items, total, channel });
  try {
    await db
      .prepare("UPDATE orders SET processor_order_id = ?, items = ?, total = ?, status = 'pending', updated_at = ? WHERE id = ?")
      .bind(processorOrderId, JSON.stringify(items || []), Number(total) || 0, new Date().toISOString(), existing.id)
      .run();
    return true;
  } catch (e) {
    console.error("shop-os: shadow order refresh failed", e && e.message);
    return false;
  }
}

/** The shadow row whose processor_order_id matches, or null. */
export async function findByProcessorOrder(env, processorOrderId) {
  const db = env && env.DB_REPEATER;
  if (!db || !processorOrderId) return null;
  try {
    return await db.prepare("SELECT * FROM orders WHERE processor_order_id = ?").bind(processorOrderId).first();
  } catch (e) {
    if (noColumn(e)) return null; // migration 003 not applied yet
    throw e;
  }
}

/** The shadow row for our own reference (the retry path), or null. */
export async function findByReference(env, reference) {
  const db = env && env.DB_REPEATER;
  if (!db || !reference) return null;
  try {
    return await db.prepare("SELECT * FROM orders WHERE reference = ?").bind(reference).first();
  } catch (e) {
    if (noColumn(e)) return null;
    throw e;
  }
}

/**
 * Mark a shadow order paid. Returns the order row ONLY when this call was the
 * one that flipped it, so a duplicate webhook delivery (or two concurrent
 * isolates) can never settle twice.
 *
 * Idempotency keys on `processor_payment_id`, not on status: status is
 * operator-writable and would let a manual edit suppress the flip.
 *
 * The guard tests for '' as well as NULL, because the column is added
 * `NOT NULL DEFAULT ''` (migration 003) so "unset" is the empty string, not
 * NULL — a plain `IS NULL` would match nothing and the row would never settle.
 */
export async function markOrderPaid(env, processorOrderId, paymentId) {
  const order = await findByProcessorOrder(env, processorOrderId);
  if (!order) return null;
  if (order.processor_payment_id) return null;
  const now = new Date().toISOString();
  const stored = paymentId || "rv:" + processorOrderId;
  const flip = await env.DB_REPEATER
    .prepare(
      "UPDATE orders SET status = 'paid', processor_payment_id = ?, updated_at = ? " +
        "WHERE id = ? AND (processor_payment_id = '' OR processor_payment_id IS NULL)"
    )
    .bind(stored, now, order.id)
    .run();
  if (flip && flip.meta && typeof flip.meta.changes === "number" && flip.meta.changes === 0) return null;
  return { ...order, status: "paid", processor_payment_id: stored, updated_at: now };
}

/* ---------------- subscription marker ---------------- */

/**
 * If this shadow row was a subscription setup, its marker
 * `{ kind:"subscription", tier, subscription_id, email, business_name, customer_id }`;
 * otherwise null.
 */
export function subscriptionMarker(order) {
  const items = safeParse(order && order.items, []);
  if (!Array.isArray(items)) return null;
  const marker = items.find((it) => it && it.kind === "subscription");
  return marker || null;
}

/* ---------------- who ordered ---------------- */

/** Name/email/phone from a Revolut order's `customer`. Never throws. */
export function revolutCustomerDetails(order) {
  const found = { name: "", email: "", phone: "" };
  if (!order || typeof order !== "object") return found;
  const c = order.customer;
  if (c && typeof c === "object") {
    found.name = str(c.full_name, 160);
    found.email = str(c.email, 200).toLowerCase();
    found.phone = str(c.phone, 40);
  }
  return found;
}

/** Best-effort customer detail fill on a shadow row. Never throws. */
export async function fillOrderCustomer(env, order, found) {
  const merged = {
    customer_name: order.customer_name || found.name || "",
    customer_email: order.customer_email || found.email || "",
    customer_phone: order.customer_phone || found.phone || "",
  };
  const changed = Object.keys(merged).some((k) => (merged[k] || "") !== (order[k] || ""));
  if (!changed) return merged;
  try {
    await env.DB_REPEATER
      .prepare("UPDATE orders SET customer_name = ?, customer_email = ?, customer_phone = ?, updated_at = ? WHERE id = ?")
      .bind(merged.customer_name, merged.customer_email, merged.customer_phone, new Date().toISOString(), order.id)
      .run();
  } catch (e) {
    console.error("shop-os: customer fill failed", e && e.message);
  }
  return merged;
}

/* ---------------- owner alert ---------------- */

/**
 * A one-line-ish alert for the owner. `origin` makes the link land on the OS
 * checkout page, which is the only view of this rail there is.
 */
export function paymentAlertPayload({ title, lines, origin }) {
  return {
    title,
    message: lines.filter(Boolean).join("\n"),
    url: (origin || "https://repeater.com.au") + "/shop-os/checkout",
    urlTitle: "Open checkout",
  };
}

/** Never rejects: Revolut's 200 must not depend on the alert. */
export async function alertPaid(env, payload) {
  try {
    await alertOwner(env, payload);
  } catch (e) {
    console.error("shop-os: owner alert failed", e && e.message);
  }
}