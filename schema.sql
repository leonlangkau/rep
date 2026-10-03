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

-- Revolut Merchant rail. Ours to own.
--
-- Cache of the Revolut subscription plan and variation ids per Repair Shop OS
-- tier, so /api/shop-os/subscribe creates the plan once and reuses it, rather
-- than POSTing a new plan on every signup. One row per tier.
CREATE TABLE IF NOT EXISTS revolut_plan_cache (
  tier         TEXT PRIMARY KEY,            -- 'starter' | 'business' | 'enterprise'
  plan_id      TEXT NOT NULL DEFAULT '',
  variation_id TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The two neutral processor columns on the shared `orders` table
-- (`processor_order_id`, `processor_payment_id`) and the
-- `idx_orders_processor_order` index are NOT mirrored here: `orders` is not this
-- site's table, and `ALTER TABLE ADD COLUMN` cannot be written idempotently for
-- a CREATE-only file. A fresh install gets them from
-- ../fivestarrepairs/schema.sql (fsr migration 081); an existing `repeater`
-- database gets them from migrations/003_revolut_payments.sql. This repo only
-- ever writes the two neutral names — never square_order_id/square_payment_id.