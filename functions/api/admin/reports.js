/**
 * GET /api/admin/reports — plain tables, no charts.
 *
 *   events per month · parts cost per event (the $80 tripwire average) ·
 *   fleet composition · return vs renew ratio (there is no buyout on either
 *   plan, so the only end-of-term outcomes are return and renew).
 *
 * Each query degrades to an empty list if its table is absent.
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

export async function onRequestGet({ env }) {
  const db = env && (env.DB_REPEATER || env.DB);

  const eventsPerMonth = await many(db,
    "SELECT strftime('%Y-%m', opened_at) AS month, COUNT(*) AS events, " +
    "  SUM(CASE WHEN fee_charged > 0 THEN 1 ELSE 0 END) AS paid_events, " +
    "  COALESCE(SUM(fee_charged),0) AS fee_total, COALESCE(SUM(parts_cost),0) AS parts_total " +
    "FROM service_events GROUP BY month ORDER BY month DESC LIMIT 24");

  const partsPerEvent = await many(db,
    "SELECT strftime('%Y-%m', opened_at) AS month, COUNT(*) AS events, " +
    "  ROUND(AVG(parts_cost),2) AS avg_parts_cost, MAX(parts_cost) AS max_parts_cost " +
    "FROM service_events WHERE status = 'done' GROUP BY month ORDER BY month DESC LIMIT 24");
  for (const row of partsPerEvent) row.tripwire = Number(row.avg_parts_cost) > 80 ? "above" : "within";

  const fleetComposition = await many(db,
    "SELECT ownership, status, COUNT(*) AS devices FROM devices GROUP BY ownership, status ORDER BY ownership, status");

  const electionRatio = await many(db,
    "SELECT election_status, COUNT(*) AS n FROM leases GROUP BY election_status ORDER BY n DESC");

  return json({
    ok: true,
    events_per_month: eventsPerMonth,
    parts_per_event: partsPerEvent,
    fleet_composition: fleetComposition,
    return_vs_renew: electionRatio,
  });
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405, { allow: "GET" });
}