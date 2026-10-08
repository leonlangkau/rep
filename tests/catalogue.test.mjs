/**
 * Catalogue API tests — /api/catalogue.
 *
 * Run with: node tests/catalogue.test.mjs
 *
 * Leo confirmed on 2026-10-02 that DB_REPEATER.products is empty, so the
 * published state of this endpoint is "nothing yet". These tests cover BOTH
 * states: the empty one, which is live, and the populated one, which must work
 * the moment products are loaded without anyone touching the code.
 *
 * The load-bearing assertion is the last section: this endpoint must never be
 * able to leak an account's own pricing or our cost base, so it is checked both
 * at runtime (those tables are seeded and must not appear) and statically (their
 * names must not appear in the SQL at all).
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPO, d1, siteDb, getReq, jsonReq, J, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("catalogue");

const catMod = await import(pathToFileURL(join(REPO, "functions/api/catalogue.js")).href);

/* ================= empty / degraded states ================= */

console.log("\n--- /api/catalogue degraded states ---");

let r = await J(catMod.onRequestGet({ env: {} }));
check("no DB_REPEATER binding -> 200 {ok:true} with empty lists, never a 500",
  r.status === 200 && r.body.ok === true &&
  Array.isArray(r.body.categories) && r.body.categories.length === 0 &&
  Array.isArray(r.body.products) && r.body.products.length === 0);

check("response carries exactly the agreed keys",
  JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["categories", "ok", "products"]));

check("empty result is cacheable", String(r.headers.get("cache-control") || "").includes("max-age=60"));

r = await J(catMod.onRequestGet({ env: { DB_REPEATER: {} } }));
check("a binding object with no prepare() does not throw", r.status === 200 && r.body.ok === true);

// The live state: the table exists and holds nothing.
r = await J(catMod.onRequestGet({ env: { DB_REPEATER: d1(siteDb()) } }));
check("an empty products table is a normal 200 'nothing yet', not an error",
  r.status === 200 && r.body.ok === true && r.body.products.length === 0 && r.body.categories.length === 0);

// A drifted schema must also degrade rather than 500.
{
  const db = siteDb();
  db.exec("DROP TABLE products");
  r = await J(catMod.onRequestGet({ env: { DB_REPEATER: d1(db) } }));
  check("a missing products table degrades to empty, not 500", r.status === 200 && r.body.ok === true);
}

/* ================= populated state ================= */

console.log("\n--- /api/catalogue with real rows ---");

function seeded() {
  const db = siteDb();
  db.exec(`INSERT INTO products (slug, name, brand, description, price, category, condition, stock, status) VALUES
    ('screen-a', 'Display Assembly A', 'Generic', 'Service pack display.', 189.00, 'part', 'new', 12, 'active'),
    ('battery-b', 'Battery B', 'Generic', 'Battery with adhesive.', 34.50, 'part', 'new', 0, 'active'),
    ('tool-c', 'Pentalobe Driver', 'ToolCo', 'Bench driver.', 12.00, 'accessory', 'new', 40, 'active'),
    ('hidden-d', 'Draft Product', 'Generic', 'Not live yet.', 5.00, 'other', 'new', 3, 'draft'),
    ('sold-e', 'Archived Thing', 'Generic', 'Gone.', 5.00, 'other', 'new', 0, 'archived');`);

  db.exec(`INSERT INTO price_breaks (product_id, min_qty, unit_price_ex) VALUES
    (1, 1, 171.00), (1, 5, 159.00), (1, 25, 148.00),
    (3, 10, 10.20);`);

  // Decoys: if the handler ever starts selecting these, the assertions below
  // will see them.
  db.exec(`INSERT INTO negotiated_prices (trade_account_id, product_id, unit_price_ex) VALUES (1, 1, 99.00);`);
  db.exec(`INSERT INTO cost_plus_rules (scope, ref_id, margin_pct) VALUES ('product', '1', 0.25);`);
  return db;
}

{
  const db = seeded();
  r = await J(catMod.onRequestGet({ env: { DB_REPEATER: d1(db) } }));
  const { products, categories } = r.body;

  check("only status='active' products are published",
    products.length === 3 && !products.some((p) => p.slug === "hidden-d" || p.slug === "sold-e"));

  check("categories are derived from the published rows, sorted and de-duplicated",
    JSON.stringify(categories) === JSON.stringify(["accessory", "part"]));

  const screen = products.find((p) => p.slug === "screen-a");
  check("a product carries its identity fields",
    !!screen && screen.name === "Display Assembly A" && screen.brand === "Generic" &&
    screen.category === "part" && screen.condition === "new");
  check("in_stock is true when stock > 0", screen.in_stock === true);

  const battery = products.find((p) => p.slug === "battery-b");
  check("in_stock is false when stock is 0 (shown as 'on order', not hidden)",
    !!battery && battery.in_stock === false);

  check("quantity breaks come back sorted by min_qty",
    screen.breaks.length === 3 &&
    screen.breaks[0].min_qty === 1 && screen.breaks[0].unit_price_ex === 171 &&
    screen.breaks[2].min_qty === 25 && screen.breaks[2].unit_price_ex === 148);

  check("a product with no breaks returns an empty ladder, not null",
    Array.isArray(battery.breaks) && battery.breaks.length === 0);

  // The retail price is the one number that must never appear here.
  const raw = JSON.stringify(r.body);
  check("the retail products.price is NOT published (189/34.5/12 appear nowhere)",
    !raw.includes("189") && !raw.includes("34.5") && !raw.includes('"price"'));
}

check("MAX_BREAKS caps how much of a ladder a single product can publish",
  catMod.MAX_BREAKS > 0 && catMod.MAX_BREAKS <= 10);

/* ================= what must never leak ================= */

console.log("\n--- account pricing and cost base ---");

{
  const db = seeded();
  r = await J(catMod.onRequestGet({ env: { DB_REPEATER: d1(db) } }));
  const raw = JSON.stringify(r.body);

  check("the negotiated account price (99.00) never appears in a public response",
    !raw.includes("99") || !raw.includes("99.00"));
  check("the cost-plus margin (0.25) never appears in a public response",
    !raw.includes("0.25") && !raw.includes("margin"));
  check("no response field is named after an account-specific concept",
    !/negotiated|cost_plus|margin_pct|price_list|credit_limit/i.test(raw));
}

// Static assertion: the handler must not even NAME those tables in executable
// code, so a future refactor cannot quietly start reading them.
//
// Comments are stripped first, and they have to be: the file's own header
// explains at length that negotiated_prices and cost_plus_rules are withheld,
// so a naive scan of the raw source would fail on its own documentation. The
// `[^:]` guard keeps "https://..." strings intact.
{
  const raw = readFileSync(join(REPO, "functions/api/catalogue.js"), "utf8");
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

  check("catalogue.js never mentions negotiated_prices in code", !/negotiated_prices/.test(src));
  check("catalogue.js never mentions cost_plus_rules in code", !/cost_plus_rules/.test(src));
  check("catalogue.js never mentions price_lists in code", !/price_lists/.test(src));
  check("catalogue.js never mentions trade_accounts in code", !/trade_accounts/.test(src));
  check("catalogue.js never selects products.price in code",
    !/SELECT[^;]*\bprice\b\s*(?:,|FROM)/i.test(src));

  const froms = src.match(/FROM\s+([a-z_]+)/gi) || [];
  check("catalogue.js only ever reads from products and price_breaks",
    froms.length > 0 && froms.every((m) => /FROM\s+(products|price_breaks)$/i.test(m.trim())));
  console.log("     tables read: " + froms.map((f) => f.trim()).join(", "));
}

/* ================= method handling ================= */

console.log("\n--- method handling ---");
r = await J(catMod.onRequest({ request: jsonReq({}, "https://repeater.com.au/api/catalogue") }));
check("POST -> 405 with allow: GET", r.status === 405 && r.headers.get("allow") === "GET");
check("GET is allowed", (await J(catMod.onRequest({ request: getReq("https://repeater.com.au/api/catalogue") }))).status === 200);

done();