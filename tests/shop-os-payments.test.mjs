/**
 * Repair Shop OS payment rail — the Revolut Merchant port.
 *
 * Run with: node tests/shop-os-payments.test.mjs
 *
 * Follows the house pattern (see tests/_fixtures.mjs): a hand-rolled check()
 * and REAL SQL against in-memory node:sqlite databases, so the queries actually
 * execute. Revolut is stubbed with a global fetch that answers the shapes the
 * 2026-08-17 Merchant API documents; nothing here reaches the network.
 *
 * What is proven here:
 *   - a webhook is rejected 401 unless a signature matches (and a rotated
 *     second v1 matches, and a stale timestamp or tampered body does not);
 *   - a one-off order settles exactly once, however many deliveries arrive;
 *   - a subscription setup order flips the tenant pending -> active exactly
 *     once, and a retry cannot create a second active subscription;
 *   - the plan/variation is created once per tier and then read from
 *     revolut_plan_cache;
 *   - a browser visit to the return URL can never move state on its own;
 *   - nothing anywhere writes a stripe_* column.
 *
 * NOT proven here: that a real card is charged, or that Revolut actually
 * delivers the webhook. That needs Leo's secrets and a live payment.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { REPO, d1, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("shop-os payments");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const src = async (rel) => import(pathToFileURL(join(REPO, rel)).href);

const checkout = await src("functions/api/shop-os/checkout.js");
const subscribe = await src("functions/api/shop-os/subscribe.js");
const webhook = await src("functions/api/shop-os/webhook.js");

const WH_KEY = "wsk_test_secret";
const SK_KEY = "sk_test_secret";
const NOW = "2026-10-04T00:00:00.000Z";

/* ---------------- the two databases ---------------- */

function repeaterDb(withCache = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    total REAL NOT NULL DEFAULT 0,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    processor_order_id TEXT NOT NULL DEFAULT '',
    processor_payment_id TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'retail',
    created_at TEXT,
    updated_at TEXT
  );`);
  db.exec("CREATE INDEX idx_orders_processor_order ON orders (processor_order_id);");
  if (withCache) {
    db.exec(`CREATE TABLE revolut_plan_cache (
      tier TEXT PRIMARY KEY, plan_id TEXT NOT NULL DEFAULT '',
      variation_id TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`);
  }
  return db;
}

function aphelionDb() {
  const db = new DatabaseSync(":memory:");
  // aphelion migrations 026 + 029, including the stripe_* columns we must never write.
  db.exec(`CREATE TABLE saas_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    contact_email TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL DEFAULT '',
    tenant_slug TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'starter',
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','cancelled','past_due')),
    trial_ends_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revolut_customer_id TEXT NOT NULL DEFAULT ''
  );`);
  db.exec(`CREATE TABLE saas_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    amount_cents INTEGER NOT NULL DEFAULT 0,
    interval TEXT NOT NULL DEFAULT 'month',
    stripe_subscription_id TEXT NOT NULL DEFAULT '',
    current_period_start TEXT,
    current_period_end TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revolut_subscription_id TEXT NOT NULL DEFAULT ''
  );`);
  return db;
}

function orderById(db, id) { return db.prepare("SELECT * FROM orders WHERE id = ?").get(id); }
function one(db, sql, ...b) { return db.prepare(sql).get(...b); }

/* ---------------- the Revolut stub ---------------- */

let revolutOrder = { id: "RV-ORD-1", state: "completed", amount: 14900, checkout_url: "https://merchant.revolut.com/pay/1", payments: [{ id: "PAY-1", state: "completed" }], customer: { full_name: "Jo Shop", email: "jo@example.com" } };
let revolutSub = { id: "RV-SUB-1", state: "active", trial_end_date: "2026-10-18T00:00:00.000Z" };
let setupOrderId = "RV-SETUP-1";
const calls = { plans: 0, customers: 0, subs: 0, orders: 0, cancels: 0, alert: 0 };

globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || "GET";
  // Not every request is JSON — the Pushover alert posts a form body — so a
  // parse failure must leave an empty object, not throw inside the stub.
  let body = {};
  try { body = opts && opts.body ? JSON.parse(opts.body) : {}; } catch { body = {}; }
  if (u.includes("pushover")) { calls.alert++; return new Response(JSON.stringify({ status: 1 }), { status: 200 }); }
  if (/\/api\/subscription-plans$/.test(u) && method === "POST") {
    calls.plans++;
    return new Response(JSON.stringify({
      id: "RV-PLAN-" + calls.plans, name: body.name, trial_duration: body.trial_duration, state: "active",
      variations: [{ id: "RV-VAR-" + calls.plans, phases: [{ id: "RV-PH-" + calls.plans, ordinal: 1, cycle_duration: "P1M", amount: body.variations[0].phases[0].amount, currency: "AUD" }] }],
    }), { status: 201, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/customers$/.test(u) && method === "POST") {
    calls.customers++;
    return new Response(JSON.stringify({ id: "RV-CUST-" + calls.customers, email: body.email }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/subscriptions$/.test(u) && method === "POST") {
    calls.subs++;
    return new Response(JSON.stringify({ id: revolutSub.id, state: "pending", setup_order_id: setupOrderId, external_reference: body.external_reference }), { status: 201, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/subscriptions\/[^/]+$/.test(u) && method === "GET") {
    return new Response(JSON.stringify(revolutSub), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/orders$/.test(u) && method === "POST") {
    calls.orders++;
    return new Response(JSON.stringify({ id: revolutOrder.id, state: "pending", checkout_url: revolutOrder.checkout_url, public_id: "pub-" + revolutOrder.id, token: "tok" }), { status: 201, headers: { "content-type": "application/json" } });
  }
  if (/\/api\/orders\/[^/]+\/cancel$/.test(u)) {
    calls.cancels++;
    return new Response(null, { status: 204 });
  }
  if (/\/api\/orders\/[^/]+$/.test(u) && method === "GET") {
    calls.orders++;
    return new Response(JSON.stringify(revolutOrder), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ message: "unexpected call " + method + " " + u }), { status: 500 });
};

/* ---------------- webhook helper ---------------- */

async function hmac(secret, body, ts) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("v1." + ts + "." + body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fireWebhook(env, evt, opts = {}) {
  const body = typeof evt === "string" ? evt : JSON.stringify(evt);
  const ts = opts.ts || String(Date.now());
  const sig = opts.sig || ("v1=" + (await hmac(WH_KEY, body, ts)));
  const request = new Request("https://repeater.com.au/api/shop-os/webhook", {
    method: "POST", body,
    headers: { "revolut-signature": sig, "revolut-request-timestamp": ts },
  });
  return webhook.onRequestPost({ request, env, ...(opts.ctx || {}) });
}

function env(rep, aph, extra = {}) {
  return { DB_REPEATER: d1(rep), DB_APHELION: d1(aph), REVOLUT_SECRET_KEY: SK_KEY, REVOLUT_WEBHOOK_SECRET: WH_KEY, PUSHOVER_TOKEN: "t", PUSHOVER_USER: "u", ...extra };
}

/* ================= 1. signature verification ================= */

console.log("\n--- webhook signature ---");
{
  const rep = repeaterDb(), aph = aphelionDb();
  const e = env(rep, aph);

  let r = await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "nothing" });
  check("a valid signature is accepted (200)", r.status === 200);

  // A rotational header: an old digest first, the live one second. Revolut
  // sends both while a secret is being rotated.
  const ts2 = String(Date.now());
  const b2 = JSON.stringify({ event: "ORDER_COMPLETED", order_id: "nothing" });
  r = await fireWebhook(e, b2, { ts: ts2, sig: "v1=" + "a".repeat(64) + "," + "v1=" + (await hmac(WH_KEY, b2, ts2)) });
  check("a rotated secret header (second v1 matches) is accepted", r.status === 200);

  const stale = String(Date.now() - 6 * 60 * 1000);
  r = await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "nothing" }, { ts: stale });
  check("a stale timestamp is rejected (401)", r.status === 401);

  const real = JSON.stringify({ event: "ORDER_COMPLETED", order_id: "nothing" });
  const good = { ts: String(Date.now()) };
  good.sig = "v1=" + (await hmac(WH_KEY, real, good.ts));
  r = await fireWebhook(e, JSON.stringify({ event: "ORDER_COMPLETED", order_id: "TAMPERED" }), good);
  check("a tampered body is rejected (401)", r.status === 401);

  r = await fireWebhook(env(rep, aph, { REVOLUT_WEBHOOK_SECRET: "" }), { event: "ORDER_COMPLETED", order_id: "x" });
  check("no signing secret configured rejects everything (401)", r.status === 401);
}

/* ================= 2. one-off order settles once ================= */

console.log("\n--- a one-off order settles once ---");
{
  const rep = repeaterDb(), aph = aphelionDb();
  const e = env(rep, aph);
  revolutOrder = { id: "RV-ONE", state: "completed", amount: 14900, checkout_url: "https://merchant.revolut.com/pay/one", payments: [{ id: "PAY-ONE", state: "completed" }], customer: { full_name: "One Off", email: "one@example.com" } };

  const made = await checkout.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/checkout", { method: "POST", body: JSON.stringify({ tier: "business", name: "One Off", email: "one@example.com" }) }), env: e });
  const madeJson = await made.json();
  check("POST one-off: returns a checkout url + reference, prices from the tier table",
    made.status === 200 && madeJson.ok && /checkout_url|merchant\.revolut/.test(String(madeJson.url)) && /^RPT-OS-/.test(madeJson.reference));

  const shadow = one(rep, "SELECT * FROM orders WHERE reference = ?", madeJson.reference);
  check("POST one-off: a shadow row carries processor_order_id and a $149 total",
    !!shadow && shadow.processor_order_id === "RV-ONE" && Math.round(shadow.total * 100) === 14900);

  let r = await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "RV-ONE" });
  check("ORDER_COMPLETED settles the shadow row (paid + payment id)", r.status === 200 && orderById(rep, shadow.id).status === "paid" && orderById(rep, shadow.id).processor_payment_id === "PAY-ONE");
  check("…and the owner is alerted once", calls.alert === 1);

  r = await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "RV-ONE" });
  check("a duplicate delivery is a no-op (still one alert)", r.status === 200 && calls.alert === 1);
}

/* ================= 3. subscription: trial -> active, exactly once ======== */

console.log("\n--- a subscription setup flips pending -> active once ---");
{
  const rep = repeaterDb(), aph = aphelionDb();
  const e = env(rep, aph);
  revolutSub = { id: "RV-SUB-A", state: "active", trial_end_date: "2026-10-18T00:00:00.000Z" };
  setupOrderId = "RV-SETUP-A";
  revolutOrder = { id: "RV-SETUP-A", state: "completed", amount: 0, payments: [], checkout_url: "https://merchant.revolut.com/pay/setup-a", customer: { full_name: "Sub Shop", email: "sub@example.com" } };

  const res = await subscribe.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/subscribe", { method: "POST", body: JSON.stringify({ tier: "starter", name: "Sub Shop", email: "sub@example.com", business: "Sub Shop Pty" }) }), env: e });
  const j = await res.json();
  check("POST subscribe: returns the setup checkout url + reference", res.status === 200 && j.ok && j.url === "https://merchant.revolut.com/pay/setup-a" && /^RPT-OS-/.test(j.reference));

  const cust = one(aph, "SELECT * FROM saas_customers WHERE contact_email = ?", "sub@example.com");
  check("subscribe: tenant recorded as trial with a Revolut customer id (stripe untouched)",
    !!cust && cust.status === "trial" && cust.revolut_customer_id === "RV-CUST-1" && cust.stripe_customer_id === "" && cust.plan === "starter");

  const subRow = one(aph, "SELECT * FROM saas_subscriptions WHERE revolut_subscription_id = ?", "RV-SUB-A");
  check("subscribe: subscription recorded pending, keyed by the Revolut id (stripe untouched)",
    !!subRow && subRow.status === "pending" && subRow.amount_cents === 4900 && subRow.stripe_subscription_id === "");

  const shadow = one(rep, "SELECT * FROM orders WHERE reference = ?", j.reference);
  check("subscribe: the shadow row keys the SETUP order and carries the subscription marker",
    !!shadow && shadow.processor_order_id === "RV-SETUP-A" && /"kind":"subscription"/.test(shadow.items));

  // A visit to the return URL must NOT move state.
  const before = one(aph, "SELECT status FROM saas_subscriptions WHERE revolut_subscription_id = ?", "RV-SUB-A").status;
  const visit = await subscribe.onRequestGet({ request: new Request("https://repeater.com.au/api/shop-os/subscribe?ref=" + encodeURIComponent(j.reference)), env: e });
  const visitJson = await visit.json();
  const after = one(aph, "SELECT status FROM saas_subscriptions WHERE revolut_subscription_id = ?", "RV-SUB-A").status;
  check("a browser visit reads state and changes nothing", visitJson.state === "pending" && before === "pending" && after === "pending");

  let r = await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "RV-SETUP-A" });
  check("ORDER_COMPLETED activates the subscription and the tenant",
    r.status === 200 &&
    one(aph, "SELECT status FROM saas_subscriptions WHERE revolut_subscription_id = ?", "RV-SUB-A").status === "active" &&
    one(aph, "SELECT status FROM saas_customers WHERE contact_email = ?", "sub@example.com").status === "active");

  // Two more deliveries + a retry of the whole flow must not create a second row.
  await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "RV-SETUP-A" });
  await fireWebhook(e, { event: "ORDER_COMPLETED", order_id: "RV-SETUP-A" });
  const retry = await subscribe.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/subscribe", { method: "POST", body: JSON.stringify({ tier: "starter", name: "Sub Shop", email: "sub@example.com", ref: j.reference }) }), env: e });
  const retryJson = await retry.json();
  check("a retry after settling is refused, and never creates a second active subscription",
    retry.status === 409 && !retryJson.ok &&
    one(aph, "SELECT COUNT(*) AS n FROM saas_subscriptions").n === 1 &&
    one(aph, "SELECT COUNT(*) AS n FROM saas_subscriptions WHERE status = 'active'").n === 1);

  r = await fireWebhook(e, { event: "SUBSCRIPTION_CANCELLED", subscription_id: "RV-SUB-A", external_reference: j.reference });
  check("SUBSCRIPTION_CANCELLED marks the subscription and the tenant cancelled",
    r.status === 200 &&
    one(aph, "SELECT status FROM saas_subscriptions WHERE revolut_subscription_id = ?", "RV-SUB-A").status === "cancelled" &&
    one(aph, "SELECT status FROM saas_customers WHERE contact_email = ?", "sub@example.com").status === "cancelled");
}

/* ================= 4. plan / variation reuse ================= */

console.log("\n--- the plan is created once per tier ---");
{
  const rep = repeaterDb(), aph = aphelionDb();
  const e = env(rep, aph);
  const before = calls.plans;
  revolutSub = { id: "RV-SUB-B", state: "active", trial_end_date: null };
  revolutOrder = { id: "RV-SETUP-B", state: "pending", amount: 0, payments: [], checkout_url: "https://merchant.revolut.com/pay/setup-b", customer: {} };

  await subscribe.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/subscribe", { method: "POST", body: JSON.stringify({ tier: "enterprise", name: "A", email: "a@example.com" }) }), env: e });
  const afterFirst = calls.plans;
  await subscribe.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/subscribe", { method: "POST", body: JSON.stringify({ tier: "enterprise", name: "B", email: "b@example.com" }) }), env: e });

  const cached = one(rep, "SELECT * FROM revolut_plan_cache WHERE tier = 'enterprise'");
  check("the tier's plan + variation are cached in revolut_plan_cache",
    !!cached && /^RV-PLAN-/.test(cached.plan_id) && /^RV-VAR-/.test(cached.variation_id));
  check("a second subscribe for the same tier does NOT create a new plan",
    afterFirst - before === 1 && calls.plans === afterFirst);
}

/* ================= 5. the config probe ================= */

console.log("\n--- the config probe ---");
{
  const rep = repeaterDb(), aph = aphelionDb();
  let r = await checkout.onRequestGet({ env: { DB_REPEATER: d1(rep), DB_APHELION: d1(aph) } });
  let j = await r.json();
  check("no secret -> not_configured (the shape the page has always handled)",
    r.status === 200 && j.ok === false && j.skip === true && j.reason === "not_configured");

  r = await checkout.onRequestGet({ env: env(rep, aph) });
  j = await r.json();
  check("secret present -> configured, production by default, and no key is echoed",
    r.status === 200 && j.ok === true && j.configured === true && j.env === "production" && !/sk_|wsk_/.test(JSON.stringify(j)));

  r = await checkout.onRequestGet({ env: env(repeaterDb(false), aph) });
  j = await r.json();
  check("rail table missing -> schema_pending, never a 500", r.status === 200 && j.ok === false && j.reason === "schema_pending");
}

/* ================= 6. nothing writes stripe_* ================= */

console.log("\n--- the stripe columns are never written ---");
{
  const files = [
    "functions/api/shop-os/checkout.js",
    "functions/api/shop-os/subscribe.js",
    "functions/api/shop-os/webhook.js",
    "functions/api/shop-os/_store.js",
    "functions/api/shop-os/_tiers.js",
    "functions/api/_revolut.js",
  ];
  // Comment lines may name the columns to say "never touch these"; only code
  // that actually writes them matters.
  const code = files.map((f) =>
    read(f).split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n")
  );
  const offenders = files.filter((_, i) => /stripe/i.test(code[i]));
  check("no source file under the shop-os rail writes a stripe column" + (offenders.length ? " (" + offenders.join(", ") + ")" : ""), offenders.length === 0);

  const rep = repeaterDb(), aph = aphelionDb();
  const e = env(rep, aph);
  await subscribe.onRequestPost({ request: new Request("https://repeater.com.au/api/shop-os/subscribe", { method: "POST", body: JSON.stringify({ tier: "business", name: "X", email: "x@example.com" }) }), env: e });
  check("after a full subscribe the stripe columns are still empty",
    one(aph, "SELECT stripe_customer_id AS s FROM saas_customers").s === "" &&
    one(aph, "SELECT stripe_subscription_id AS s FROM saas_subscriptions").s === "");
}

done();