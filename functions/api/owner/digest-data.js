/**
 * GET /api/owner/digest-data — the fleet-stats payload plus the accounts that
 * look failed-payment-prone, for the weekly owner digest.
 *
 * Same guard as /api/owner/fleet-stats (OWNER_TOKEN bearer). The response is
 * exactly the fleet-stats shape with one extra key:
 *
 *   "failed_payment_accounts": [
 *     { "customer_id", "plan", "status", "current_period_end", "company" }
 *   ]
 *
 * (empty array when DB_APHELION or the saas_* tables are not present). It is
 * READ-ONLY billing metadata — no payment flows, no processor columns.
 *
 * With OWNER_TOKEN unset: { "ok": false, "skip": true, "reason": "not_configured" }.
 * With a missing/wrong bearer: 401 { "error": "Unauthorized" }.
 */

import { json, ownerConfigured, notConfigured, bearerMatches } from "./_auth.js";
import { buildFleetStats, failedPaymentAccounts } from "./_stats.js";

export async function onRequestGet({ request, env }) {
  if (!ownerConfigured(env)) return notConfigured();
  if (!(await bearerMatches(request, env.OWNER_TOKEN))) return json({ error: "Unauthorized" }, 401);
  const stats = await buildFleetStats(env);
  stats.failed_payment_accounts = await failedPaymentAccounts(env);
  return json(stats);
}

export function onRequest() {
  return json({ error: "Method not allowed" }, 405);
}