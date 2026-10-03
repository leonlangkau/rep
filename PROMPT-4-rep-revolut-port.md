# PROMPT — rep repo: port the fsr Revolut payment system — qwen session

You are working in the `rep` repo (repeater.com.au, Cloudflare Pages project `repeater`).
Yolo mode: act autonomously, never touch secrets, never weaken a test. Pushing `main`
deploys production.

**Mission: repeater now sells for money — port the proven Revolut Merchant rail from the
sibling `fivestarrepairs` (fsr) repo, where Leo built and approved it.** fsr's pattern is
the source of truth; adapt it, don't reinvent it. The design-system / content work
(U0–U5) is either already done or a separate session — this session is payments only.

## 0 — Sync first
1. `git fetch origin && git pull --ff-only origin main`. Report what came in.
2. Read `CLAUDE.md` (note its rule "Writes to DB_APHELION are limited to the `leads`
   insert and the `rate_limits` helper" — you are extending that contract in step 4,
   and must UPDATE the CLAUDE.md text to say so).
3. Fetch fsr's adapter and study it before writing any code (fsr is cloned at
   `../fivestarrepairs`; if stale, `git -C ../fivestarrepairs fetch origin`):
   - `git show origin/main:functions/api/_revolut.js` — the whole Revolut client
   - `git show origin/main:functions/api/shop/webhook.js` — webhook conventions
   - `git show origin/main:functions/api/shop/checkout.js` — checkout conventions
   - `git show origin/main:docs/SETUP-revolut-payments.md` — the ops runbook
4. `npm test && npm run test:imports` green as your baseline. If wrangler is not
   authenticated, STOP and ask Leo.

## 1 — Migrations NOW (remote, before code)
1. The `repeater` DB already has the wholesale tables + `site_posts`. Check what exists:
   `npx wrangler d1 execute repeater --remote --yes --command "SELECT name FROM sqlite_master WHERE type='table'"`
2. Create and apply `migrations/003_revolut_payments.sql`:
   ```sql
   -- 003: Revolut Merchant rail, ported from fsr migration 081.
   -- Neutral processor columns on orders (fsr convention — no backfill needed here,
   -- the orders table is empty for payment purposes).
   -- NOT re-runnable: D1 has no ADD COLUMN IF NOT EXISTS. Apply each ALTER separately.
   ALTER TABLE orders ADD COLUMN processor_order_id TEXT NOT NULL DEFAULT '';
   ALTER TABLE orders ADD COLUMN processor_payment_id TEXT NOT NULL DEFAULT '';
   CREATE INDEX IF NOT EXISTS idx_orders_processor_order ON orders (processor_order_id);
   -- Cache of Revolut subscription plan/variation ids per OS tier, so
   -- /api/shop-os/subscribe reuses them instead of recreating per signup.
   CREATE TABLE IF NOT EXISTS revolut_plan_cache (
     tier TEXT PRIMARY KEY,            -- 'starter' | 'business' | 'enterprise'
     plan_id TEXT NOT NULL DEFAULT '',
     variation_id TEXT NOT NULL DEFAULT '',
     updated_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```
   Apply the ALTERs and the CREATE as separate invocations (multi-statement batches are
   unreliable). Verify each with `PRAGMA table_info(orders)` / a SELECT on the cache table.
3. Mirror the new table + columns into `schema.sql` (this repo owns them).

## 2 — Port the adapter verbatim
Copy fsr's `functions/api/_revolut.js` into `functions/api/_revolut.js` essentially
unchanged (it is deliberately repo-agnostic). Keep its exact public surface and env names:
`revolutConfig(env)`, `revolutBase(env)` (production DEFAULT; `REVOLUT_ENV=sandbox` opts
in), `DEFAULT_REVOLUT_VERSION = "2026-08-17"`, `rv()` (never throws), `createRevolutOrder`,
`getRevolutOrder`, `cancelRevolutOrder`, `verifyRevolutWebhook`. Env vars:
`REVOLUT_SECRET_KEY` (sk_…), `REVOLUT_WEBHOOK_SECRET` (wsk_…), `REVOLUT_ENV`,
optional `REVOLUT_API_VERSION` and `REVOLUT_PUBLIC_KEY`. Adapt only what the house style
of THIS repo requires (import style, file header comment).

## 3 — Endpoints (all in `functions/api/shop-os/`)
- `checkout.js` — GET probe (keep the existing `{ok:false, skip:true,
  reason:"not_configured"}` shape when secrets are absent — the page already handles it)
  and POST one-off: price/tier comes from the DB or a server-side constant table, amount
  in CENTS, `merchant_order_data.reference` carries a correlation id, store the shadow row
  in `orders` with `processor_order_id`, return `checkout_url`. Follow fsr checkout.js
  conventions: never throws, honest failure JSON, creation failure leaves nothing orphaned.
- `subscribe.js` — NEW territory (fsr only does one-off orders). Use `rv()` for the
  **Revolut Subscriptions API**: `POST /api/subscription-plans` (once per tier, cached in
  `revolut_plan_cache` — never recreated per signup) → multi-phase variation: phase 1
  zero-amount **trial** (`TRIAL_DAYS = 14` constant at the top, flagged `[OWNER TO
  CONFIRM]` in a comment — the pricing page promises "free trial" without a length),
  phase 2 the tier's monthly amount (`P1M`, minor units) → `POST /api/subscriptions`
  against the variation → returns the setup-payment checkout URL. Record the tenant in
  `saas_customers` (DB_APHELION binding): `business_name`, `contact_email`, `plan`, status
  `trial`, plus `revolut_customer_id` when the API returns a customer id — **NEVER touch
  `stripe_customer_id` / `stripe_subscription_id`**. Verify endpoint paths and request
  shapes against developer.revolut.com before hardcoding; the version header is pinned by
  the adapter.
- `webhook.js` — `POST /api/shop-os/webhook`, a direct port of fsr's `shop/webhook.js`
  conventions: verify first (`verifyRevolutWebhook`, else **401**, never silent accept);
  on `ORDER_COMPLETED` read the full order back via `getRevolutOrder`, then match by
  reference → either the one-off `orders` row (mark paid, store `processor_payment_id`,
  idempotent via stored payment id) or a subscription setup (flip `saas_customers` to
  `active` + write `saas_subscriptions` with `revolut_subscription_id`, guarded by a
  conditional UPDATE that only fires from the pre-active state). Other events:
  acknowledge 200 and ignore, with one exception — if Revolut fires a
  subscription-cancelled/deactivated event (verify the exact event name on
  developer.revolut.com), mark that subscription `cancelled`. Owner alert via `_alert.js`
  on every paid/cancelled transition, inside try/catch so it can never cost Revolut its
  200. Double delivery must be a no-op.

## 4 — The contract change (do this explicitly)
`saas_customers` / `saas_subscriptions` live in the aphelion DB. Migration **029 is
already applied** (`revolut_customer_id`, `revolut_subscription_id` — Leo applied it;
verify with `npx wrangler d1 execute aphelion-admin --remote --yes --command "SELECT name
FROM pragma_table_info('saas_customers')"`). Writing those two columns from this repo is
the ONLY new DB_APHELION write allowed. Update the "What this repo must never touch" /
DB_APHELION section of `CLAUDE.md` to record the extended contract. If the columns are
somehow missing, degrade with `{ok:false, skip:true, reason:"schema_pending"}` — never
ALTER aphelion's tables from this repo.

## 5 — Checkout page failure UX (port from fsr's behaviour)
The `/shop-os/checkout` page must behave like fsr's shop cart:
- Declined/failed → back on the page they came from, plain message ("Your card was
  declined. No money has been taken."), details intact, nothing marked active.
- Cancelled/closed tab → neutral "Payment cancelled — pick up whenever you're ready",
  the pending subscription/order stays resumable.
- The browser redirect NEVER renders "subscription active" or "payment successful" —
  only "processing…" until the webhook lands; state always read from the backend.
- Retry must not double-create: reuse the pending order/subscription where Revolut
  allows it, else cancel (`cancelRevolutOrder`) and create fresh against the same row.
- Revolut unreachable → "temporarily unavailable" + the enquiry-form fallback stays
  selectable; no orphaned rows.

## 6 — Tests (house style: plain Node, `tests/*.test.mjs`)
Port fsr's webhook test patterns. Must cover: signature valid / rotated (second v1
matches) / stale timestamp / tampered body → 401; one-off order → ORDER_COMPLETED → paid
(idempotent on double delivery); subscription setup → trial → active transition guarded
(two deliveries + retry = exactly one active row, never a second); plan/variation reuse
asserted (second subscribe call reads `revolut_plan_cache`, does not POST a new plan);
redirect-visit alone can never flip state; nothing ever writes `stripe_*` columns.
`npm run test:imports` green. Say plainly in the report that the live payment + webhook
path is unverified until Leo registers the webhook and a real payment flows.

## 7 — Finish
- Suite green, tree clean, pushed to main (deploy). Verify `https://repeater.com.au/`
  and `/api/proof` return 200 and `GET /api/shop-os/checkout` reports the not_configured
  shape (secrets are Leo's to set).
- Report: migrations applied (list), files changed, the EXACT runbook for Leo —
  secrets to set on the Pages project (`REVOLUT_SECRET_KEY`, `REVOLUT_WEBHOOK_SECRET`,
  `REVOLUT_ENV` leave unset for production; `REVOLUT_PUBLIC_KEY` optional widget) and the
  webhook URL to register in the Revolut Merchant dashboard:
  **`https://repeater.com.au/api/shop-os/webhook`**, subscribed to `ORDER_COMPLETED`
  plus any subscription lifecycle event you implemented — copy fsr's
  `docs/SETUP-revolut-payments.md` into `docs/SETUP-revolut-payments.md` here, adapted
  (repeater has no Square history; drop those parts, add the subscriptions flow).