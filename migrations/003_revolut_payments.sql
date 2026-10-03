-- 003: Revolut Merchant rail, ported from fivestarrepairs migration 081.
--
-- Applies to: the `repeater` database (DB_REPEATER).
--
-- NOT re-runnable: D1 has no `ADD COLUMN IF NOT EXISTS`. Apply each ALTER as its
-- own invocation and expect "duplicate column" on a second run, which is
-- harmless. The CREATE is IF NOT EXISTS and is always safe to re-run.
--
-- The two processor columns are the neutral names (the Square columns on
-- `orders` stay put and unread — this repo never writes square_*). They are
-- added here rather than only in fivestarrepairs because the `repeater` database
-- was provisioned before fsr 081, and the shop-os checkout writes a shadow row
-- into `orders` to correlate a Revolut order with the customer. No backfill is
-- needed: this table is empty for payment purposes.
ALTER TABLE orders ADD COLUMN processor_order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN processor_payment_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_processor_order ON orders (processor_order_id);

-- Cache of the Revolut subscription plan and variation ids per OS tier, so
-- /api/shop-os/subscribe reuses them instead of POSTing a new plan on every
-- signup. One row per tier; the ids are stable once created.
CREATE TABLE IF NOT EXISTS revolut_plan_cache (
  tier         TEXT PRIMARY KEY,            -- 'starter' | 'business' | 'enterprise'
  plan_id      TEXT NOT NULL DEFAULT '',
  variation_id TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);