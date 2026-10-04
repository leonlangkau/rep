/**
 * GET /api/admin/billing — READ-ONLY view over the Repair Shop OS subscription
 * rows this site already owns (`saas_customers` / `saas_subscriptions` in
 * DB_APHELION, written by functions/api/shop-os/{subscribe,webhook}.js).
 *
 * It builds no payment flow and never touches a payment-processor column — the
 * Revolut Merchant integration is PROMPT-4's work. When DB_APHELION is not
 * bound, or the tables are not there yet, it degrades to an empty state.
 */

import { json } from "./_lib.js";

export async function onRequestGet({ env }) {
  const db = env && env.DB_APHELION;
  if (!db || typeof db.prepare !== "function") {
    return json({ ok: true, configured: false, rows: [] });
  }
  try {
    const res = await db.prepare(
      "SELECT s.customer_id, s.plan, s.amount_cents, s.interval, s.status, s.current_period_end, " +
      "  c.business_name, c.contact_email " +
      "FROM saas_subscriptions s LEFT JOIN saas_customers c ON c.id = s.customer_id " +
      "ORDER BY s.current_period_end DESC LIMIT 200"
    ).all();
    return json({ ok: true, configured: true, rows: (res && res.results) || [] });
  } catch {
    return json({ ok: true, configured: false, rows: [] });
  }
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405, { allow: "GET" });
}