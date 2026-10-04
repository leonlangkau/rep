/**
 * GET /api/owner/fleet-stats — read-only aggregates for the Aphileon owner
 * control centre. Guarded by the OWNER_TOKEN env (bearer header).
 *
 * ── EXACT RESPONSE SHAPE (keep this and the consumer in step) ──────────────
 * {
 *   "ok": true,
 *   "generated_at": "<ISO-8601>",
 *   "fleet": {
 *     "active_leases":   { "weekly": <int>, "prepaid": <int>, "total": <int> },
 *     "devices_in_field":{ "leased": <int>, "on_plan": <int>, "loaner_pool": <int>,
 *                          "in_repair": <int>, "total": <int> },
 *     "care_plan_devices": <int>,
 *     "service_events_this_quarter": { "used": <int>, "cap": <int> }
 *   },
 *   "mrr": {
 *     "weekly_fees_monthly": <number>,   // active weekly fees × 52/12
 *     "prepaid_monthly":     <number>,   // prepaid_total amortised over months left
 *     "total_monthly":       <number>,
 *     "currency": "AUD"
 *   },
 *   "watchlists": {
 *     "devices_at_paid_limit": [ { "device_id", "model", "company", "paid_events" } ],
 *     "ppsr_expiring":         [ { "lease_id", "company", "model", "ppsr_expiry" } ],
 *     "elections_due":         [ { "lease_id", "company", "model", "start_date", "term_months" } ],
 *     "call_requests":         { "new": <int>, "dialled": <int>, "done": <int>, "total": <int> }
 *   }
 * }
 *
 * With OWNER_TOKEN unset: { "ok": false, "skip": true, "reason": "not_configured" }.
 * With a missing/wrong bearer: 401 { "error": "Unauthorized" }.
 *
 * Aggregates only; the only name that appears is a company name inside a
 * watchlist row. No writes.
 */

import { json, ownerConfigured, notConfigured, bearerMatches } from "./_auth.js";
import { buildFleetStats } from "./_stats.js";

export async function onRequestGet({ request, env }) {
  if (!ownerConfigured(env)) return notConfigured();
  if (!(await bearerMatches(request, env.OWNER_TOKEN))) return json({ error: "Unauthorized" }, 401);
  return json(await buildFleetStats(env));
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405);
}