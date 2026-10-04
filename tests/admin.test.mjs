/**
 * Admin panel — auth, the fleet schema, and the CRUD surface.
 *
 * Run with: node tests/admin.test.mjs (also picked up by `npm test`).
 *
 * The schema is exercised for real: migrations/004_fleet_admin.sql is applied to
 * an in-memory node:sqlite database and the CHECK constraints are fired, so a
 * status typo fails here rather than at 3am in production. The auth paths run
 * against the real handlers with a D1-shaped adapter, including the exact case
 * the deploy probe relies on — an unauthenticated /api/admin/* request answers
 * 401, never 500.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO, d1, jsonReq, getReq, J, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("admin");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const at = (rel) => pathToFileURL(join(REPO, rel)).href;

const lib = await import(at("functions/api/admin/_lib.js"));
const users = await import(at("functions/api/admin/_users.js"));
const mw = await import(at("functions/api/admin/_middleware.js"));
const login = await import(at("functions/api/admin/login.js"));
const logout = await import(at("functions/api/admin/logout.js"));
const meMod = await import(at("functions/api/admin/me.js"));
const totp = await import(at("functions/api/admin/totp.js"));
const resource = await import(at("functions/api/admin/[resource].js"));
const dashboard = await import(at("functions/api/admin/dashboard.js"));
const reports = await import(at("functions/api/admin/reports.js"));
const billing = await import(at("functions/api/admin/billing.js"));

const FLEET_TABLES = [
  "companies", "employees", "devices", "leases", "service_events",
  "callouts", "call_requests", "rep_admin_users", "rep_admin_sessions",
];

/* ================= schema ================= */

console.log("\n--- migration 004 ---");
const db = new DatabaseSync(":memory:");
db.exec(read("migrations/004_fleet_admin.sql"));
const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
for (const t of FLEET_TABLES) check(`table ${t} exists`, names.includes(t));

check("devices rejects an unknown status",
  (() => {
    try { db.prepare("INSERT INTO devices (model, status) VALUES ('X','lost')").run(); return false; }
    catch { return true; }
  })());
check("devices rejects an unknown ownership",
  (() => {
    try { db.prepare("INSERT INTO devices (model, ownership) VALUES ('X','theirs')").run(); return false; }
    catch { return true; }
  })());
check("leases rejects an unknown plan",
  (() => {
    try { db.prepare("INSERT INTO leases (device_id, company_id, plan) VALUES (1,1,'rental')").run(); return false; }
    catch { return true; }
  })());
check("call_requests rejects an unknown status",
  (() => {
    try { db.prepare("INSERT INTO call_requests (mobile, status) VALUES ('0400','ringing')").run(); return false; }
    catch { return true; }
  })());
check("leases.term_months defaults to 24",
  (() => {
    db.exec("INSERT INTO companies (name) VALUES ('Acme')");
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("INSERT INTO devices (model) VALUES ('iPhone')");
    db.prepare("INSERT INTO leases (device_id, company_id, plan) VALUES (1,1,'device_care')").run();
    return db.prepare("SELECT term_months FROM leases WHERE id=1").get().term_months === 24;
  })());
check("re-running the migration is a no-op (idempotent)",
  (() => { try { db.exec(read("migrations/004_fleet_admin.sql")); return true; } catch { return false; } })());

// The fresh-install schema.sql and the migration must define the same names.
const schemaTables = new Set(
  [...read("schema.sql").matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/gi)].map((m) => m[1])
);
const missingInSchema = FLEET_TABLES.filter((t) => !schemaTables.has(t));
check("schema.sql (fresh install) defines every fleet table too" +
  (missingInSchema.length ? " -> missing " + missingInSchema.join(", ") : ""), missingInSchema.length === 0);

/* ================= password + session helpers ================= */

console.log("\n--- WebCrypto password hashing ---");
const hash = await lib.hashPassword("correct horse battery staple");
check("hash uses the pbkdf2$ format", /^pbkdf2\$\d+\$[\w-]+\$[\w-]+$/.test(hash));
check("the correct password verifies", await lib.verifyPasswordHash(hash, "correct horse battery staple"));
check("the wrong password fails", !(await lib.verifyPasswordHash(hash, "battery horse staple correct")));
check("a malformed hash fails closed", !(await lib.verifyPasswordHash("garbage", "x")));
check("randomToken() returns a 43-char base64url string", /^[\w-]{43}$/.test(lib.randomToken()));

/* ================= the middleware gate ================= */

console.log("\n--- the /api/admin/* gate ---");
function ctx(request, env, next) {
  return { request, env, next, data: {} };
}

let r = await J(mw.onRequest(ctx(getReq("https://repeater.com.au/api/admin/me"), { DB_REPEATER: d1(new DatabaseSync(":memory:")) }, () => new Response("next"))));
check("an unauthenticated /api/admin/* request -> 401 (never 500)", r.status === 401 && r.body.error === "Unauthorized");

r = await J(mw.onRequest(ctx(getReq("https://repeater.com.au/api/admin/login"), {}, () => new Response("next"))));
check("the login path is allowed through the gate", r.status === 200);

{
  let called = false;
  const request = getReq("https://repeater.com.au/api/admin/me", { Cookie: lib.SESSION_COOKIE + "=nope" });
  const res = await mw.onRequest(ctx(request, { DB_REPEATER: d1(new DatabaseSync(":memory:")) }, () => { called = true; return new Response("next"); }));
  check("a bogus cookie -> 401 and next() is never called", res.status === 401 && called === false);
}

/* ================= login / session lifecycle ================= */

console.log("\n--- login, session, me, logout ---");
const authDb = new DatabaseSync(":memory:");
authDb.exec(read("migrations/004_fleet_admin.sql"));
const env = { DB_REPEATER: d1(authDb), ADMIN_PASSWORD: "hunter2", SESSION_SECRET: "unused-but-present" };

r = await J(login.onRequestPost({ request: jsonReq({ username: "admin", password: "wrong" }, "https://repeater.com.au/api/admin/login"), env }));
check("a wrong bootstrap password -> 401 with a generic message", r.status === 401 && /Incorrect/.test(r.body.error));

r = await J(login.onRequestPost({ request: jsonReq({ username: "admin", password: "hunter2" }, "https://repeater.com.au/api/admin/login"), env }));
const cookieHeader = r.headers.get("set-cookie") || "";
check("the bootstrap owner can sign in -> 200 {ok:true}", r.status === 200 && r.body.ok === true);
check("login sets the session cookie, HttpOnly", /rep_admin_session=/.test(cookieHeader) && /HttpOnly/.test(cookieHeader));
check("the bootstrap login minted exactly one owner row",
  authDb.prepare("SELECT COUNT(*) AS n FROM rep_admin_users").get().n === 1);
check("the owner row stores a PBKDF2 hash, never the password",
  /^pbkdf2\$/.test(authDb.prepare("SELECT password_hash FROM rep_admin_users").get().password_hash));
check("a session row was written", authDb.prepare("SELECT COUNT(*) AS n FROM rep_admin_sessions").get().n === 1);

const token = /rep_admin_session=([^;]+)/.exec(cookieHeader)[1];
const cookieReq = (url) => getReq(url, { Cookie: lib.SESSION_COOKIE + "=" + token });

{
  const order = [];
  const context = { request: cookieReq("https://repeater.com.au/api/admin/me"), env, data: {}, next: () => { order.push("next"); return new Response("next"); } };
  const res = await mw.onRequest(context);
  check("a valid cookie passes the gate and populates context.data.session",
    res.status === 200 && order.length === 1 && context.data.session && context.data.session.username === "admin");
}

r = await J(meMod.onRequestGet({ data: { session: { user_id: 1, username: "admin", name: "Owner", role: "owner" } } }));
check("me reports the authenticated identity", r.status === 200 && r.body.username === "admin" && r.body.role === "owner");

{
  const logoutReq = new Request("https://repeater.com.au/api/admin/logout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", Cookie: lib.SESSION_COOKIE + "=" + token },
    body: "",
  });
  r = await J(logout.onRequestPost({ request: logoutReq, env }));
  check("logout answers the form post with a 303", r.status === 303);
  check("logout cleared the session cookie", /rep_admin_session=;/.test(r.headers.get("set-cookie") || ""));
  check("logout deleted the session row", authDb.prepare("SELECT COUNT(*) AS n FROM rep_admin_sessions").get().n === 0);
}

// Named account path.
{
  const h = await lib.hashPassword("s3cret-pass");
  authDb.prepare("INSERT INTO rep_admin_users (username, name, password_hash, role) VALUES ('leo','Leo',?,'owner')").run(h);
  r = await J(login.onRequestPost({ request: jsonReq({ username: "leo", password: "s3cret-pass" }, "https://repeater.com.au/api/admin/login"), env }));
  check("a named account signs in -> 200", r.status === 200 && r.body.ok === true);
  r = await J(login.onRequestPost({ request: jsonReq({ username: "leo", password: "nope" }, "https://repeater.com.au/api/admin/login"), env }));
  check("a named account with a wrong password -> 401", r.status === 401);
}

// A misconfigured site (no DB) fails closed, not open.
r = await J(login.onRequestPost({ request: jsonReq({ username: "admin", password: "hunter2" }, "https://repeater.com.au/api/admin/login"), env: {} }));
check("login with no database -> 503, not a session", r.status === 503);

r = await J(totp.onRequest({}));
check("TOTP is an honest 501 stub, never a fake success", r.status === 501 && r.body.reason === "totp_followup");

/* ================= resource CRUD ================= */

console.log("\n--- /api/admin/<resource> CRUD ---");
const crudDb = new DatabaseSync(":memory:");
crudDb.exec(read("migrations/004_fleet_admin.sql"));
const crudEnv = { DB_REPEATER: d1(crudDb) };
const resReq = (method, url, body) => new Request(url, method === "GET"
  ? { method, headers: { accept: "application/json" } }
  : { method, headers: { "content-type": "application/json", accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/companies", { name: "Sparky Pty Ltd", contact_name: "Jo", email: "jo@example.com" }), env: crudEnv }));
check("create a company -> ok:true with the new row", r.status === 200 && r.body.ok === true && r.body.row.name === "Sparky Pty Ltd");
const companyId = r.body.row.id;

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/devices", { model: "iPhone 15", status: "in_stock", company_id: companyId, mdm_enrolled: "1", landed_cost: 540 }), env: crudEnv }));
check("create a device -> ok:true, MDM and landed cost coerced",
  r.status === 200 && r.body.row.model === "iPhone 15" && r.body.row.mdm_enrolled === 1 && Number(r.body.row.landed_cost) === 540);
const deviceId = r.body.row.id;

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/leases", { device_id: deviceId, company_id: companyId, plan: "device_care", dayone_amount: 622, admin_fee_oneoff: 27.5, recurring_fee: 5.6, payment_plan: "weekly" }), env: crudEnv }));
check("create a device_care lease -> ok:true", r.status === 200 && r.body.row.plan === "device_care");
const leaseId = r.body.row.id;

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/service-events", { device_id: deviceId, lease_id: leaseId, event_type: "screen", fee_charged: 0, parts_cost: 95 }), env: crudEnv }));
check("create a service event -> ok:true", r.status === 200 && r.body.row.event_type === "screen");
const eventId = r.body.row.id;

r = await J(resource.onRequest({ request: resReq("PATCH", "https://repeater.com.au/api/admin/leases", { id: leaseId, election_status: "renew" }), env: crudEnv }));
check("update a lease's end-of-term election -> renewed", r.status === 200 && r.body.row.election_status === "renew");

r = await J(resource.onRequest({ request: resReq("GET", "https://repeater.com.au/api/admin/companies"), env: crudEnv }));
check("list companies -> one row", r.status === 200 && r.body.rows.length === 1);

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/devices", { model: "Galaxy S24", status: "leased", ownership: "client" }), env: crudEnv }));
check("a second device, leased and client-owned, is created", r.status === 200 && r.body.row.status === "leased");
r = await J(resource.onRequest({ request: resReq("GET", "https://repeater.com.au/api/admin/devices?status=in_stock"), env: crudEnv }));
check("devices filter by status", r.status === 200 && r.body.rows.length === 1 && r.body.rows[0].model === "iPhone 15");
r = await J(resource.onRequest({ request: resReq("GET", "https://repeater.com.au/api/admin/devices?ownership=client"), env: crudEnv }));
check("devices filter by ownership", r.status === 200 && r.body.rows.length === 1 && r.body.rows[0].model === "Galaxy S24");

r = await J(resource.onRequest({ request: resReq("DELETE", "https://repeater.com.au/api/admin/service-events?id=" + eventId), env: crudEnv }));
check("delete a service event -> ok:true", r.status === 200 && r.body.ok === true);

r = await J(resource.onRequest({ request: resReq("POST", "https://repeater.com.au/api/admin/companies", { contact_name: "no name" }), env: crudEnv }));
check("create without the required name -> 400", r.status === 400);

r = await J(resource.onRequest({ request: resReq("GET", "https://repeater.com.au/api/admin/nonsense"), env: crudEnv }));
check("an unknown resource -> 404", r.status === 404);

r = await J(resource.onRequest({ request: resReq("GET", "https://repeater.com.au/api/admin/companies"), env: {} }));
check("with no DB bound the resource endpoint degrades with schema_pending",
  r.status === 200 && r.body.ok === false && r.body.skip === true);

/* ================= read-only views degrade ================= */

console.log("\n--- dashboard / reports / billing degrade ---");
r = await J(dashboard.onRequestGet({ env: {} }));
check("dashboard with no DB -> ok:true with empty lists", r.status === 200 && r.body.ok === true && Array.isArray(r.body.active_leases));

r = await J(dashboard.onRequestGet({ env: crudEnv }));
check("dashboard against a real (empty-ish) schema -> ok:true", r.status === 200 && r.body.ok === true && typeof r.body.devices_in_field === "number");

r = await J(reports.onRequestGet({ env: crudEnv }));
check("reports -> ok:true with the four tables", r.status === 200 && r.body.ok === true &&
  Array.isArray(r.body.events_per_month) && Array.isArray(r.body.fleet_composition) &&
  Array.isArray(r.body.parts_per_event) && Array.isArray(r.body.return_vs_renew));

r = await J(billing.onRequestGet({ env: {} }));
check("billing with no DB_APHELION -> configured:false, empty", r.status === 200 && r.body.configured === false && r.body.rows.length === 0);

done();