# OVERNIGHT PROMPT BUNDLE — 2026-10-03/04

## PROMPT-1 (rep: content restructure U0-U5) — run FIRST in the rep window

# PROMPT — rep repo (repeater.com.au) — qwen session, 2026-10-03 evening

You are working in the `rep` repo (Cloudflare Pages project `repeater`, site repeater.com.au).
You are running in yolo mode: act autonomously, but NEVER invent business facts, never touch
secrets, and never weaken a test to get it green. Pushing `main` IS the production deploy.

**Payments are NOT in scope for this repo tonight.** Leo is building and proving the
Revolut Merchant adapter in the sibling `fivestarrepairs` (fsr) repo first; once he approves
it, that adapter gets ported here. Do NOT build Revolut endpoints and do NOT create a
`revolut_plan_cache` migration. The checkout surface ships as UI + the enquiry fallback only
(see the U4 adjustment below).

## 0 — Sync first
1. `git fetch origin && git pull --ff-only origin main`. Report what came in.
2. `npm install` if node_modules is missing, then `npm test && npm run test:imports` — confirm green BEFORE starting, so you know your baseline.

## 1 — Apply pending D1 migration NOW (remote, before code work)
Use `npx wrangler d1 execute repeater --remote --yes --file=<file>`. If wrangler is not
authenticated, STOP and ask Leo to authenticate before continuing.
1. Check what is missing first:
   `npx wrangler d1 execute repeater --remote --yes --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"`
   The live `repeater` DB currently has all the wholesale tables but is MISSING `site_posts`.
2. Run `schema.sql` (idempotent, safe) and `migrations/002_site_posts.sql`.

## 2 — Main work: the umbrella restructure, phases U0–U5
The spec is `docs/PLAN-repeater-umbrella.md` — read it fully, plus `CLAUDE.md` and
`docs/PLAN-repeater-site.md` (that one owns the craft: design system, honesty rules, tests).
Build phases U0 → U5 in order, **one coherent commit per phase**, and update
`docs/WORKLOG-2026-10-03.md` as you go. Gate per phase as the plan's §8 table says.

### Content comes FIRST — the current copy reads as the wrong business
Leo's own words: the product content/context is "kinda odd" right now. He is right — the
site is written as a parts counter ("Stock the counter. Skip the runaround.", tagline
"Wholesale parts, screens and consumables for Australian repair businesses") when Repeater
actually sells three things. The restructure is not a layout change; it is a **voice
change**. Rules for every word you write:

1. **Lead with the three products, in this order, everywhere** (nav, hero, meta titles,
   meta descriptions, og tags, footer, sitemap descriptions, facts.js TAGLINE):
   1. **Fleet phones for tradies — repairs included.** Small fleets (2–10 handsets) for
      electricians, plumbers, builders, sparkies whose phones get destroyed on site;
      repairs bundled into the deal. Device-as-a-service for trades, NOT a retail handset
      sale, NOT directed at repair shops.
   2. **AI call answering.** For a tradie on a roof with one hand occupied: it answers
      calls, takes bookings, answers questions — a missed call is a lost job. Also
      sellable to any business with the same problem, so don't write it trades-only.
   3. **Repair Shop OS** (the SaaS, "Repair Shop OS, by Repeater"): bookings, workshop,
      inventory, accounting, marketing, B2B wholesale, wealth — for repair shops, priced
      per §4 of the plan (copy figures EXACTLY).
2. **Write for the buyer's ear.** Plain Australian site-tradie English, short sentences,
   no parts-counter jargon on the umbrella pages ("price list per account", "ageing you
   can see", "net 7–60 day terms" belong ONLY on the demoted trade-supply pages). The
   hero is about phones that survive the job and calls that never go missed — not about
   "stocking the counter".
3. **Trade supply stays, demoted.** `/catalogue`, `/wholesale`, `/pricing` keep their
   structure but their copy reframes as supporting depth ("we also supply parts on trade
   terms to repair businesses"), per plan U5. They must not appear as what Repeater IS.
4. **Honesty unchanged:** anything not evidenced (phones pricing, handset model inclusions,
   excess, term, fair-use, AI call volumes/pricing/trial) is `[OWNER TO CONFIRM]` via
   facts.js — the OFFER SHAPE from Leo's descriptions above is safe to state, the NUMBERS
   are not. Update `tests/facts.test.mjs` expectations as facts change (e.g. TAGLINE).
5. For each product page, write a **"What you actually get"** section from the plan's
   pillar descriptions, plus a "who it's for" line — concrete, no lorem, no invented
   stats. If a claim cannot be traced to the plan or Leo's words, cut it.

Copy pricing figures for `/shop-os/pricing` EXACTLY from the plan §4 (Starter $49 /
Business $149 / Enterprise $399 AUD/mo GST-exclusive, free trial, no card to start).
Never invent phones/AI-calls pricing — `[OWNER TO CONFIRM]` placeholders per the honesty rules.

**U4 adjustment (tonight only):** build `/shop-os/checkout` as a page whose payment action
falls back to the enquiry form, and add the `GET /api/shop-os/checkout` config probe
returning `{ok:false, skip:true, reason:"not_configured"}` — the shape already matches the
future Revolut port. The checkout page must already follow the payment-honesty rules fsr
is proving tonight: it NEVER renders "order confirmed"/"payment successful" except from a
verified backend state, a submitted enquiry shows "we'll be in touch" (not "paid"), and
any future decline/fail path returns the customer to this page with their details intact.
Do NOT build the Revolut order/subscription/webhook endpoints; a follow-up session ports
fsr's proven adapter — including its failure-UX behaviour (decline → return with state
intact, redirect ≠ confirmation, retry-safe) — and adds the `revolut_plan_cache`
migration. Note this deferral explicitly in the WORKLOG.

## 3 — Finish
- `npm test && npm run test:imports` green, working tree clean, everything pushed to main.
- Verify the deploy: `GET https://repeater.com.au/api/proof` and `/` return 200
  (the custom domain is already bound and live).
- Final report: phases done, migrations applied (list them), files changed, what was
  deferred to the Revolut port, and anything still unverified or blocked.

---

## PROMPT-4 (rep: Revolut port) — run in the SAME rep window AFTER PROMPT-1 fully finishes (fresh qwen session)

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
---

## PROMPT-2 (aphelion: Repeater control) — run in the aphelion window, in parallel with rep

# PROMPT — aphelion repo (owner control centre) — qwen session, 2026-10-03 evening

You are working in the `aphelion` repo — Aphileon LTD's owner control centre
(aphelion.ltd/admin, Cloudflare Pages project `aphelion`). Yolo mode: act autonomously,
but never touch secrets, never weaken a test, and remember pushing `main` deploys production.

Tonight's goal: the Aphileon backend gains **full control of Repeater** (the new B2B site,
repo `../rep`, live project `repeater`) alongside the control it already has of Five Star
Repairs (fsr).

**Revolut is NOT in scope for this repo tonight.** Leo is proving the Revolut Merchant
adapter in the `fivestarrepairs` (fsr) repo first; once approved it ports to Repeater, and
only THEN does aphelion get the `revolut_customer_id` / `revolut_subscription_id` columns
on `saas_customers` / `saas_subscriptions` (a future migration 029). Do NOT run any
migration tonight and do NOT touch the Stripe checkout/webhook code paths — live tenants.

## 0 — Sync first
1. `git fetch origin && git pull --ff-only origin main`. Report what came in.
2. `npm install` if needed; run the existing test suite and confirm green as your baseline.
3. Read `README.md`, `CLAUDE.md` if present, and `docs/` plans relevant to admin tabs.
4. NO D1 migrations are needed tonight — all aphelion migrations through 028 are already
   applied remotely. If you believe otherwise, verify with
   `PRAGMA table_info(...)` before touching anything, and stop if wrangler is not authenticated.

## 1 — Register Repeater as a business (full control)
1. Inspect first: `PRAGMA table_info(businesses)` and
   `SELECT * FROM businesses` (via `npx wrangler d1 execute aphelion-admin --remote --yes --command "..."`).
2. If no row with slug `repeater` exists, INSERT one: name "Repeater", slug `repeater`,
   site_url `https://repeater.com.au`, comingSoon off — matching the exact columns the
   registry schema defines (migrations 006 + 010). Do not invent field values the schema
   requires but you don't know — leave them default/empty and list them in your report.
3. Branding (migration 010 fields): set what is known (site_url / app_url). Do NOT invent
   from_email, signature, review_url or bounce_prefix — if left unset they inherit FSR's
   DEFAULT_BRANDING; flag that inheritance explicitly in your report so Leo can decide.

## 2 — New admin tab: Repeater (owner edits Repeater's data remotely)
Build a **Repeater** tab in the owner panel, following the existing tab patterns
(`public/admin/tabs/references.js` + `functions/api/admin/proof.js` are the model):

- **Products & trade pricing CRUD** over the `DB_REPEATER` binding (already declared in
  wrangler.toml, database `repeater`): `products`, `price_lists`, `price_breaks` — list,
  create, edit, deactivate. Respect the ownership rule: these tables are shared with the
  rep site's `/api/catalogue`, which publishes quantity breaks GST-exclusive only — never
  expose `cost_plus_rules` or `negotiated_prices` in a public response (this tab is
  owner-gated, so it may show them if present, but never write to those tables here).
- **Blog CRUD** over `site_posts` in the `repeater` DB (created by rep's migration 002 —
  if the table does not exist yet, the tab must degrade gracefully and the backend must
  return a clear "schema pending" state, not 500; the rep agent is applying 002 tonight).
- Every mutation goes through the owner auth middleware and writes to the audit log
  (`functions/api/admin/_audit.js`), same as every other admin endpoint.
- Owner-gated only — staff sessions must be rejected.

## 3 — Verify FSR control is intact
Do a read-only pass over the existing FSR coverage (dashboard/reports/search/stats over
`DB_FSR`) and confirm nothing regressed. Fix only if you find a real gap; otherwise report
"verified, no changes". Do NOT add Revolut to FSR in this repo — fsr's own repo handles that.

## 4 — Finish
- New/updated tests green (`node --test tests/*.test.mjs`), imports clean, working tree
  clean, pushed to main (push = deploy).
- Verify prod: `GET https://aphelion.ltd/api/version` (or your usual probe) returns 200.
- Final report: registry row state, branding fields left unset (listed), new tab summary,
  FSR verification result, anything that needs Leo's input (branding values, from_email
  decision), and the deferred Revolut work (future migration 029 + SaaS-tab rail display).
