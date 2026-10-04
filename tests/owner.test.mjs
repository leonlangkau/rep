/**
 * Owner endpoints (/api/owner/*) — auth, shape, and the aggregate queries.
 *
 * Run with: node tests/owner.test.mjs (also picked up by `npm test`).
 *
 * The aggregates run against a real in-memory schema (migration 004) seeded
 * with a company, two devices and two leases, so the counts, the MRR and the
 * watchlists are checked against actual data rather than assumed.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO, d1, getReq, J, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("owner");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const at = (rel) => pathToFileURL(join(REPO, rel)).href;

const fleetStats = await import(at("functions/api/owner/fleet-stats.js"));
const digestData = await import(at("functions/api/owner/digest-data.js"));

const authReq = (token) => getReq("https://repeater.com.au/api/owner/fleet-stats",
  token ? { Authorization: "Bearer " + token } : {});

/* ================= the guard ================= */

console.log("\n--- OWNER_TOKEN guard ---");
let r = await J(fleetStats.onRequestGet({ request: authReq(null), env: {} }));
check("no OWNER_TOKEN -> not_configured (200, not an error)", r.status === 200 && r.body.ok === false && r.body.skip === true && r.body.reason === "not_configured");

r = await J(fleetStats.onRequestGet({ request: authReq("wrong"), env: { OWNER_TOKEN: "s3cret" } }));
check("a missing/incorrect bearer -> 401", r.status === 401 && r.body.error === "Unauthorized");

r = await J(fleetStats.onRequestGet({ request: authReq("s3cret"), env: { OWNER_TOKEN: "s3cret" } }));
check("the correct bearer passes the gate", r.status === 200 && r.body.ok === true);

r = await J(digestData.onRequestGet({ request: authReq(null), env: {} }));
check("digest-data is guarded the same way", r.status === 200 && r.body.reason === "not_configured");

/* ================= shape + aggregates ================= */

console.log("\n--- shape + aggregates against real data ---");
const db = new DatabaseSync(":memory:");
db.exec(read("migrations/004_fleet_admin.sql"));
db.exec("INSERT INTO companies (id, name) VALUES (1, 'Acme Electrical')");
db.exec("INSERT INTO devices (id, model, status, ownership, company_id) VALUES (1, 'iPhone 15', 'leased', 'repeater', 1)");
db.exec("INSERT INTO devices (id, model, status) VALUES (2, 'iPhone 14', 'in_repair')");
db.exec("INSERT INTO leases (device_id, company_id, plan, recurring_fee, payment_plan, start_date, term_months, ppsr_expiry, election_status) " +
  "VALUES (1, 1, 'device_care', 5.60, 'weekly', '2026-01-01', 24, date('now','+30 days'), 'active')");
db.exec("INSERT INTO leases (device_id, company_id, plan, recurring_fee, payment_plan, start_date, term_months, election_status) " +
  "VALUES (2, 1, 'device_care', 4.70, 'weekly', date('now','-24 months'), 24, 'active')");
db.exec("INSERT INTO service_events (device_id, event_type, fee_charged, opened_at) VALUES (1,'screen',60,date('now')),(1,'battery',60,date('now')),(1,'port',60,date('now')),(1,'camera',0,date('now'))");
db.exec("INSERT INTO call_requests (mobile, status) VALUES ('0400000000','new')");

const env = { OWNER_TOKEN: "s3cret", DB_REPEATER: d1(db) };
r = await J(fleetStats.onRequestGet({ request: authReq("s3cret"), env }));
const body = r.body;
check("ok:true with generated_at", body.ok === true && typeof body.generated_at === "string");
check("fleet + mrr + watchlists keys all present",
  body.fleet && body.mrr && body.watchlists);
check("active leases counted by payment plan (2 weekly)",
  body.fleet.active_leases.weekly === 2 && body.fleet.active_leases.prepaid === 0 && body.fleet.active_leases.total === 2);
check("devices in field by status (leased 1, in_repair 1, total 2)",
  body.fleet.devices_in_field.leased === 1 && body.fleet.devices_in_field.in_repair === 1 && body.fleet.devices_in_field.total === 2);
check("care-plan device count is 2", body.fleet.care_plan_devices === 2);
check("service events this quarter vs cap (4 used, cap 2 + floor(2/4) = 2)",
  body.fleet.service_events_this_quarter.used === 4 && body.fleet.service_events_this_quarter.cap === 2);
check("MRR weekly fees = (5.60 + 4.70) x 52 / 12 = $44.63",
  body.mrr.weekly_fees_monthly === 44.63 && body.mrr.total_monthly === 44.63 && body.mrr.currency === "AUD");
check("devices at 3+ paid events appear in the watchlist",
  body.watchlists.devices_at_paid_limit.length === 1 && Number(body.watchlists.devices_at_paid_limit[0].paid_events) === 3);
check("a PPSR registration expiring in 30 days is listed", body.watchlists.ppsr_expiring.length === 1);
check("a lease at term end is listed as an election due", body.watchlists.elections_due.length >= 1);
check("call_requests queue counted by status", body.watchlists.call_requests.new === 1 && body.watchlists.call_requests.total === 1);
check("no raw mobile numbers leak into the payload", !JSON.stringify(body).includes("0400000000"));

/* ================= digest extras ================= */

console.log("\n--- digest-data ---");
r = await J(digestData.onRequestGet({ request: authReq("s3cret"), env }));
check("digest carries the fleet payload plus failed_payment_accounts",
  r.body.ok === true && Array.isArray(r.body.failed_payment_accounts) && r.body.mrr && r.body.watchlists);

// With a DB_APHELION that lacks the saas_* tables, it must degrade to [].
r = await J(digestData.onRequestGet({ request: authReq("s3cret"), env: { OWNER_TOKEN: "s3cret", DB_REPEATER: d1(db), DB_APHELION: d1(new DatabaseSync(":memory:")) } }));
check("billing metadata degrades to an empty list when absent", Array.isArray(r.body.failed_payment_accounts) && r.body.failed_payment_accounts.length === 0);

done();