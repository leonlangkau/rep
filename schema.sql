-- Repeater wholesale site — schema for a fresh install.
--
-- SCOPE: this file holds ONLY the tables the *site* owns. The `repeater`
-- database was provisioned before this repo existed, from
-- ../fivestarrepairs/schema.sql plus ../aphelion/migrations/007_b2b_wholesale.sql,
-- which between them already own: products, price_lists, price_breaks,
-- cost_plus_rules, negotiated_prices, trade_accounts, wholesale_quotes,
-- wholesale_quote_items, orders, and the retail tables behind them.
--
-- NEVER recreate, alter or drop any of those here — aphelion/schema-notes.md is
-- explicit that business schema has a single owner, and the pricing tables in
-- particular are read by aphelion's Wholesale tab. This repo only ADDS.
--
-- Idempotent by construction: every statement is IF NOT EXISTS, so running this
-- against an already-populated database is a no-op. Incremental changes to the
-- tables below go in migrations/NNN_*.sql (starting at 002 — there is no 001,
-- matching the fivestarrepairs convention where schema.sql is the base).

-- Blog posts. Draft rows are never served publicly: /blog lists status =
-- 'published' only, and functions/blog/[slug].js 404s on a draft rather than
-- leaking it.
CREATE TABLE IF NOT EXISTS site_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_posts_status ON site_posts (status, published_at DESC);