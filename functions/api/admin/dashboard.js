/**
 * GET /api/admin/dashboard — the numbers the fleet desk needs at a glance.
 *
 * Every section is an independent, self-contained query and degrades to an
 * empty list if its table is missing, so an un-migrated database still answers
 * {ok:true} rather than 500. All reads; nothing here mutates.
 *
 * Caps modelled here (canon, PA-2):
 *   service events : 2 per calendar quarter + 1 extra per 4 devices on the plan
 *   paid events    : hard limit of 4 per device per rolling 12 months
 *   call-outs      : first 2 per rolling 12 months free, then $19 within 20 km
 *   election       : return / renew only — no buyout on either plan
 */

import { json } from "./_lib.js";

async function many(db, sql, params = []) {
  if (!db || typeof db.prepare !== "function") return [];
  try {
    const res = await db.prepare(sql).bind(...params).all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}
async function one(db, sql, params = []) {
  const rows = await many(db, sql, params);
  return rows[0] || null;
}

/** First day of the current calendar quarter, in Melbourne terms (UTC is close enough for a cap counter). */
function quarterStart() {
  const now = new Date();
  const m = now.getUTCMonth();               // 0-11
  const startMonth = m - (m % 3);            // 0,3,6,9
  const d = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  return d.toISOString().slice(0, 10);
}

export async function onRequestGet({ env }) {
  const db = env && (env.DB_REPEATER || env.DB);

  const activeLeases = await many(db,
    "SELECT payment_plan, COUNT(*) AS leases, COALESCE(SUM(recurring_fee),0) AS weekly_fees " +
    "FROM leases WHERE election_status = 'active' GROUP BY payment_plan");
  const devicesInField = await one(db,
    "SELECT COUNT(*) AS n FROM devices WHERE status IN ('leased','on_plan')");
  const quarterlyEvents = await many(db,
    "SELECT d.company_id, c.name AS company, " +
    "  (SELECT COUNT(*) FROM leases l WHERE l.company_id = d.company_id AND l.plan = 'device_care' AND l.election_status = 'active') AS devices_on_plan, " +
    "  COUNT(*) AS used " +
    "FROM service_events e JOIN devices d ON d.id = e.device_id LEFT JOIN companies c ON c.id = d.company_id " +
    "WHERE date(e.opened_at) >= ? " +
    "GROUP BY d.company_id ORDER BY used DESC", [quarterStart()]);
  for (const row of quarterlyEvents) {
    row.cap = 2 + Math.floor((Number(row.devices_on_plan) || 0) / 4);
  }
  const approachingLimit = await many(db,
    "SELECT e.device_id, d.model, d.company_id, c.name AS company, COUNT(*) AS paid_events " +
    "FROM service_events e JOIN devices d ON d.id = e.device_id LEFT JOIN companies c ON c.id = d.company_id " +
    "WHERE e.fee_charged > 0 AND e.opened_at >= datetime('now','-12 months') " +
    "GROUP BY e.device_id HAVING COUNT(*) >= 3 ORDER BY paid_events DESC");
  const freeCallouts = await many(db,
    "SELECT o.company_id, c.name AS company, COUNT(*) AS free_used " +
    "FROM callouts o LEFT JOIN companies c ON c.id = o.company_id " +
    "WHERE o.fee_charged <= 0 AND o.visit_date >= date('now','-12 months') " +
    "GROUP BY o.company_id ORDER BY free_used DESC");
  const ppsrExpiring = await many(db,
    "SELECT l.id AS lease_id, l.ppsr_registration_number, l.ppsr_expiry, c.name AS company, d.model " +
    "FROM leases l JOIN companies c ON c.id = l.company_id JOIN devices d ON d.id = l.device_id " +
    "WHERE l.ppsr_expiry IS NOT NULL AND l.ppsr_expiry <= date('now','+90 days') ORDER BY l.ppsr_expiry");
  const electionsDue = await many(db,
    "SELECT l.id AS lease_id, l.election_status, l.start_date, l.term_months, c.name AS company, d.model " +
    "FROM leases l JOIN companies c ON c.id = l.company_id JOIN devices d ON d.id = l.device_id " +
    "WHERE l.election_status = 'active' AND l.start_date IS NOT NULL " +
    "  AND date(l.start_date, '+' || l.term_months || ' months') <= date('now','+60 days') " +
    "ORDER BY l.start_date");
  const billingRun = await many(db,
    "SELECT strftime('%w', COALESCE(start_date, date('now'))) AS charge_day, COUNT(*) AS leases, " +
    "  COALESCE(SUM(recurring_fee),0) AS weekly_fees " +
    "FROM leases WHERE payment_plan = 'weekly' AND election_status = 'active' GROUP BY charge_day ORDER BY charge_day");

  return json({
    ok: true,
    active_leases: activeLeases,
    devices_in_field: devicesInField ? Number(devicesInField.n) : 0,
    quarterly_events: quarterlyEvents,
    approaching_paid_limit: approachingLimit,
    free_callouts: freeCallouts,
    ppsr_expiring: ppsrExpiring,
    elections_due: electionsDue,
    billing_run: billingRun,
  });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405, { allow: "GET" });
}