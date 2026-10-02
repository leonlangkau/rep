/**
 * Shared test fixtures.
 *
 * Run by the suites under tests/, not directly.
 *
 * House pattern (from aphelion): tests assert with a hand-rolled check() and
 * mock D1 by running REAL SQL against an in-memory node:sqlite database, so the
 * queries are actually executed rather than stubbed. No test framework, no
 * miniflare, no vitest-pool-workers.
 *
 * The three platform tables this site touches live in aphelion, not here:
 *   leads        aphelion/migrations/027_leads.sql
 *   site_proof   aphelion/migrations/028_site_proof.sql
 *   rate_limits  aphelion/migrations/001_aphelion_core.sql
 *
 * Those migrations are copied in below rather than read across repos, so this
 * suite still runs from a bare checkout of `rep`. schemaDrift() then compares the
 * copies against the real files whenever the sibling repo IS present, so a
 * column added upstream shows up as a failure rather than as a silent surprise
 * in production.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PUBLIC_DIR = join(REPO, "public");
export const APHELION_DIR = join(REPO, "..", "aphelion");
export const FSR_DIR = join(REPO, "..", "fivestarrepairs");

/** D1-shaped adapter over a node:sqlite database. Mirrors aphelion's tests. */
export function d1(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() { return db.prepare(sql).get(...params) || null; },
            async all() { return { results: db.prepare(sql).all(...params) }; },
            async run() {
              const info = db.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
            },
          };
        },
        async first() { return db.prepare(sql).get() || null; },
        async all() { return { results: db.prepare(sql).all() }; },
        async run() {
          const info = db.prepare(sql).run();
          return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        },
      };
    },
    async batch(stmts) {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  };
}

/* ---------------- platform schema copies ---------------- */

export const PLATFORM_DDL = {
  // aphelion/migrations/001_aphelion_core.sql
  rate_limits: `CREATE TABLE IF NOT EXISTS rate_limits (
    key          TEXT PRIMARY KEY,
    count        INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  );`,
  // aphelion/migrations/027_leads.sql
  leads: `CREATE TABLE IF NOT EXISTS leads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL DEFAULT '',
    phone         TEXT NOT NULL DEFAULT '',
    business_name TEXT NOT NULL DEFAULT '',
    interest      TEXT NOT NULL DEFAULT 'fleet' CHECK (interest IN ('fleet','wholesale','software','other')),
    headcount     TEXT NOT NULL DEFAULT '',
    message       TEXT NOT NULL DEFAULT '',
    source        TEXT NOT NULL DEFAULT '',
    business_slug TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','quoted','won','lost')),
    follow_up_at  TEXT,
    notes         TEXT NOT NULL DEFAULT '',
    ip_hash       TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  // aphelion/migrations/028_site_proof.sql
  site_proof: `CREATE TABLE IF NOT EXISTS site_proof (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL DEFAULT 'quote' CHECK (kind IN ('quote','figure','logo')),
    title        TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    attribution  TEXT NOT NULL DEFAULT '',
    image_url    TEXT NOT NULL DEFAULT '',
    link_url     TEXT NOT NULL DEFAULT '',
    sort_order   INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
};

/** An in-memory database carrying the platform tables this site reads/writes. */
export function platformDb() {
  const db = new DatabaseSync(":memory:");
  for (const ddl of Object.values(PLATFORM_DDL)) db.exec(ddl);
  return db;
}

/** The site's own table, from this repo's schema.sql (the real file). */
export function siteDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(REPO, "schema.sql"), "utf8"));
  // The shared wholesale tables this repo only reads. Column lists are trimmed
  // to what /api/catalogue actually selects.
  db.exec(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    brand TEXT, description TEXT, price REAL NOT NULL DEFAULT 0, compare_price REAL,
    category TEXT, condition TEXT, stock INTEGER NOT NULL DEFAULT 0, image_url TEXT,
    images TEXT, options TEXT, sell_mode TEXT NOT NULL DEFAULT 'options',
    free_shipping INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS price_breaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, min_qty INTEGER NOT NULL DEFAULT 1,
    unit_price_ex REAL NOT NULL DEFAULT 0, UNIQUE (product_id, min_qty)
  );`);
  // Present specifically so a test can prove the catalogue never queries them.
  db.exec(`CREATE TABLE IF NOT EXISTS negotiated_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, trade_account_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL, unit_price_ex REAL NOT NULL DEFAULT 0,
    valid_from TEXT, valid_to TEXT, UNIQUE (trade_account_id, product_id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS cost_plus_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL, ref_id TEXT NOT NULL,
    margin_pct REAL NOT NULL DEFAULT 0, UNIQUE (scope, ref_id)
  );`);
  return db;
}

/* ---------------- drift alarm ---------------- */

/**
 * Compare the migrated-in DDL above against the real aphelion migrations, when
 * the sibling repo is checked out. Returns [] when it isn't — a bare checkout of
 * `rep` must not fail, but a machine that HAS aphelion must notice a column that
 * moved.
 */
export function schemaDrift() {
  const pairs = [
    ["rate_limits", "migrations/001_aphelion_core.sql"],
    ["leads", "migrations/027_leads.sql"],
    ["site_proof", "migrations/028_site_proof.sql"],
  ];
  const out = [];
  if (!existsSync(APHELION_DIR)) return out;

  /** Column names from a CREATE TABLE block, skipping constraint lines. */
  const columnsOf = (block) =>
    block
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[a-z_][a-z0-9_]*\s/i.test(l))
      .map((l) => l.split(/\s+/)[0])
      .filter((c) => !/^(CHECK|PRIMARY|FOREIGN|UNIQUE|CONSTRAINT)$/i.test(c));

  for (const [table, file] of pairs) {
    const full = join(APHELION_DIR, file);
    if (!existsSync(full)) continue;
    const sql = readFileSync(full, "utf8");
    const m = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`, "i").exec(sql);
    if (!m) { out.push(`${table}: not found in ${file} (renamed or moved?)`); continue; }

    const realCols = columnsOf(m[1]);
    const myCols = columnsOf(PLATFORM_DDL[table].split("\n").slice(1).join("\n"));

    const missing = realCols.filter((c) => !myCols.includes(c));
    const extra = myCols.filter((c) => !realCols.includes(c));
    if (missing.length) out.push(`${table}: copy is missing column(s) ${missing.join(", ")} from ${file}`);
    if (extra.length) out.push(`${table}: copy has unknown column(s) ${extra.join(", ")} not in ${file}`);
  }

  return out;
}

/* ---------------- request helpers ---------------- */

export function jsonReq(body, url = "https://repeater.com.au/x") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function formReq(fields, url = "https://repeater.com.au/x") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

export function getReq(url = "https://repeater.com.au/x", headers = {}) {
  return new Request(url, { headers });
}

/** Await a Response and decode JSON safely. -> { status, body, headers } */
export async function J(promise) {
  const res = await promise;
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body, headers: res.headers };
}

export function checkRunner(label) {
  let failures = 0;
  const check = (name, cond) => {
    console.log((cond ? "PASS" : "FAIL") + " " + name);
    if (!cond) failures++;
  };
  const done = () => {
    console.log(failures ? `\n${failures} FAILED` : `\nall ${label} assertions passed`);
    process.exit(failures ? 1 : 0);
  };
  return { check, done, count: () => failures };
}