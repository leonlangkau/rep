/**
 * Aggregate queries for the owner endpoints. Read-only. No writes, no PII
 * beyond company names.
 *
 * Every query is independent and degrades to an empty result, so an
 * un-migrated or unbound database still produces a well-formed payload.
 *
 * Not routed (underscore prefix).
 */

const FIELD_STATUSES = ["leased", "on_plan", "loaner_pool", "in_repair"];

async function many(db, sql, params = []) {
  if (!db || typeof db.prepare !== "function") return [];
  try {
    const res = await db.prepare(sql).bind(...params).all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** First day of the current calendar quarter (UTC is close enough for a counter). */
function quarterStart() {
  const now = new Date();
  const m = now.getUTCMonth();
  const d = new Date(Date.UTC(now.getUTCFullYear(), m - (m % 3), 1));
  return d.toISOString().slice(0, 10);
}

function monthsRemaining(startDate, termMonths) {
  const term = Number(termMonths) || 24;
  if (!startDate) return term;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return term;
  const now = new Date();
  const elapsed = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  return Math.max(1, term - Math.max(0, elapsed));
}

export async function buildFleetStats(env) {
  const db = env && (env.DB_REPEATER || env.DB);
  const generatedAt = new Date().toISOString();

  const leases = await many(db,
    "SELECT id, plan, payment_plan, recurring_fee, prepaid_total, start_date, term_months FROM leases WHERE election_status = 'active'");

  const activeLeases = { weekly: 0, prepaid: 0, total: leases.length };
  for (const l of leases) {
    if (String(l.payment_plan) === "prepaid") activeLeases.prepaid++;
    else activeLeases.weekly++;
  }

  const statusRows = await many(db,
    "SELECT status, COUNT(*) AS n FROM devices WHERE status IN ('leased','on_plan','loaner_pool','in_repair') GROUP BY status");
  const devicesInField = { leased: 0, on_plan: 0, loaner_pool: 0, in_repair: 0, total: 0 };
  for (const r of statusRows) {
    if (FIELD_STATUSES.includes(r.status)) { devicesInField[r.status] = Number(r.n) || 0; devicesInField.total += Number(r.n) || 0; }
  }

  const careRow = await many(db,
    "SELECT COUNT(*) AS n FROM leases WHERE plan = 'device_care' AND election_status = 'active'");
  const carePlanDevices = careRow.length ? Number(careRow[0].n) || 0 : 0;

  const quarter = await many(db,
    "SELECT d.company_id, " +
    "  (SELECT COUNT(*) FROM leases l WHERE l.company_id = d.company_id AND l.plan = 'device_care' AND l.election_status = 'active') AS devices_on_plan, " +
    "  COUNT(*) AS used " +
    "FROM service_events e JOIN devices d ON d.id = e.device_id " +
    "WHERE date(e.opened_at) >= ? GROUP BY d.company_id", [quarterStart()]);
  let eventsUsed = 0, eventsCap = 0;
  for (const r of quarter) {
    eventsUsed += Number(r.used) || 0;
    eventsCap += 2 + Math.floor((Number(r.devices_on_plan) || 0) / 4);
  }

  const paidLimit = await many(db,
    "SELECT e.device_id, d.model, COALESCE(c.name, '') AS company, COUNT(*) AS paid_events " +
    "FROM service_events e JOIN devices d ON d.id = e.device_id LEFT JOIN companies c ON c.id = d.company_id " +
    "WHERE e.fee_charged > 0 AND e.opened_at >= datetime('now','-12 months') " +
    "GROUP BY e.device_id HAVING COUNT(*) >= 3 ORDER BY paid_events DESC LIMIT 100");

  const ppsr = await many(db,
    "SELECT l.id AS lease_id, COALESCE(c.name,'') AS company, d.model, l.ppsr_expiry " +
    "FROM leases l JOIN companies c ON c.id = l.company_id JOIN devices d ON d.id = l.device_id " +
    "WHERE l.ppsr_expiry IS NOT NULL AND l.ppsr_expiry <= date('now','+90 days') ORDER BY l.ppsr_expiry LIMIT 100");

  const elections = await many(db,
    "SELECT l.id AS lease_id, COALESCE(c.name,'') AS company, d.model, l.start_date, l.term_months " +
    "FROM leases l JOIN companies c ON c.id = l.company_id JOIN devices d ON d.id = l.device_id " +
    "WHERE l.election_status = 'active' AND l.start_date IS NOT NULL " +
    "  AND date(l.start_date, '+' || l.term_months || ' months') <= date('now','+60 days') " +
    "ORDER BY l.start_date LIMIT 100");

  const reqRows = await many(db,
    "SELECT status, COUNT(*) AS n FROM call_requests GROUP BY status");
  const callRequests = { new: 0, dialled: 0, done: 0, total: 0 };
  for (const r of reqRows) {
    if (r.status in callRequests) callRequests[r.status] = Number(r.n) || 0;
    callRequests.total += Number(r.n) || 0;
  }

  // MRR: active weekly fees annualised to a month, plus prepaid amortised over
  // the months left in its term.
  let weeklyFees = 0, prepaidAmortised = 0;
  for (const l of leases) {
    if (String(l.payment_plan) === "prepaid") {
      const total = Number(l.prepaid_total) || 0;
      if (total > 0) prepaidAmortised += total / monthsRemaining(l.start_date, l.term_months);
    } else {
      weeklyFees += Number(l.recurring_fee) || 0;
    }
  }
  const weeklyMonthly = weeklyFees * 52 / 12;

  return {
    ok: true,
    generated_at: generatedAt,
    fleet: {
      active_leases: activeLeases,
      devices_in_field: devicesInField,
      care_plan_devices: carePlanDevices,
      service_events_this_quarter: { used: eventsUsed, cap: eventsCap },
    },
    mrr: {
      weekly_fees_monthly: round2(weeklyMonthly),
      prepaid_monthly: round2(prepaidAmortised),
      total_monthly: round2(weeklyMonthly + prepaidAmortised),
      currency: "AUD",
    },
    watchlists: {
      devices_at_paid_limit: paidLimit,
      ppsr_expiring: ppsr,
      elections_due: elections,
      call_requests: callRequests,
    },
  };
}

/**
 * Accounts that look failed-payment-prone, from billing metadata where present
 * (DB_APHELION's saas_subscriptions). READ-ONLY; names only. Empty when the
 * database or the tables are not there.
 */
export async function failedPaymentAccounts(env) {
  const db = env && env.DB_APHELION;
  if (!db || typeof db.prepare !== "function") return [];
  return many(db,
    "SELECT s.customer_id, s.plan, s.status, s.current_period_end, COALESCE(c.business_name,'') AS company " +
    "FROM saas_subscriptions s LEFT JOIN saas_customers c ON c.id = s.customer_id " +
    "WHERE s.status IN ('past_due','unpaid','failed','pending','cancelled') " +
    "ORDER BY s.current_period_end LIMIT 100");
}