# PROMPT — fsr repo (fivestarrepairs) — qwen session, 2026-10-03 evening

You are working in the `fivestarrepairs` repo (referred to as **fsr**) — the retail site
(fivestarrepairs.com.au, Cloudflare Pages project `fivestarrepairs`, D1 database
`fivestarrepairs`). Yolo mode: act autonomously, never touch secrets, never weaken a test.
Pushing `main` DEPloys to production immediately — keep every new code path inert until its
feature flag/secret exists, so a push can never change customer-facing behaviour tonight.

**This is the FIRST of two Revolut builds.** fsr is the proving ground: you build the full
Revolut Merchant rail here. Once Leo has reviewed and approved how it works, the same
adapter pattern gets ported to the sibling `rep` repo (repeater.com.au / Repair Shop OS
subscriptions) — so build it clean and self-contained in `functions/api/_revolut.js`, and
in your final report summarise exactly what a port needs, INCLUDING the failure-UX
behaviour (§4) so repeater inherits it: decline/cancel return paths, redirect-never-
confirms rule, retry safety, and the owner-visibility events.

Tonight's goal: add **Revolut Merchant as a second payment rail** next to Square.
Square stays the default and is untouched. Revolut activates only when its secrets exist.

## 0 — Sync first
1. `git fetch origin && git pull --ff-only origin main` (the local clone is behind origin
   by several commits — pull before anything else). Report what came in.
2. `npm install` if needed; run the test suite and confirm green as your baseline.
3. Read `CLAUDE.md`, `ADMIN.md`, and `docs/PRD-square-ticket-sync.md` +
   `docs/SETUP-ticketing-square.md` to understand how Square is wired before adding a rail.

## 1 — Apply pending D1 migration NOW (remote, before code work)
The live DB has all migrations through `080_audit_log.sql` applied (verified by table
inspection; the `d1_migrations` tracker table exists but is empty — do not rely on it,
verify actual columns instead). Next number is **081** — but `git pull` first and re-check
nothing landed while you were reading this (parallel agents pick numbers from stale views;
collisions have happened before).

First INSPECT which payment tables carry Square ids and mirror exactly those:
`PRAGMA table_info(orders)`, `PRAGMA table_info(payment_links)`, `PRAGMA table_info(bookings)`
via `npx wrangler d1 execute fivestarrepairs --remote --yes --command "..."`.
Then create `migrations/081_revolut_columns.sql` adding, ONLY where a `square_*` counterpart
exists, e.g.:

```sql
-- 081: Revolut Merchant rail (second processor next to Square).
-- NOT re-runnable: D1 has no ADD COLUMN IF NOT EXISTS. Run each ALTER separately
-- (D1 multi-statement batches can silently apply only some; never BEGIN/COMMIT).
ALTER TABLE orders ADD COLUMN revolut_order_id TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN revolut_payment_id TEXT NOT NULL DEFAULT '';
-- (mirror payment_links / bookings the same way IF they carry square_* columns)
```

Apply each ALTER as its own `wrangler ... --command` or single-statement file, then verify
every column with `PRAGMA table_info`. If wrangler is not authenticated, STOP and ask Leo.

## 2 — Shared Revolut adapter
Create `functions/api/_revolut.js` (helper — the `_` prefix means not routed):

- `createOrder(env, {amount, currency, description, reference, redirect_url})` — server-side
  only; `amount` in the SMALLEST denomination (cents), currency `AUD`. POST to the Revolut
  Merchant orders endpoint with `Authorization: Bearer <REVOLUT_SECRET_KEY>` and a PINNED
  `Revolut-Api-Version` header (Revolut's own examples use `2026-08-17` — pin it, do not
  float). Verify the exact endpoint path and production/sandbox base URLs against
  developer.revolut.com before hardcoding. Response carries `id`, `token`, `state:"pending"`,
  and `checkout_url` (`https://checkout.revolut.com/payment-link/<token>`).
- `verifyWebhook(env, rawBodyText, signatureHeader, timestampHeader)` — the part that must
  be exactly right: `Revolut-Signature` carries `v1=<hex>` values, comma-separated during
  key rotation; the timestamp header is a UNIX timestamp in MILLISECONDS; the signed string
  is `"v1." + timestamp + "." + rawBody` (raw body byte-for-byte — read it as text ONCE and
  verify BEFORE parsing; re-serialising JSON breaks it); HMAC-SHA256 hex with
  `REVOLUT_WEBHOOK_SIGNING_SECRET`, constant-time compare, accept if ANY listed v1 matches;
  reject timestamps outside a 5-minute window of UTC now. Signature failure, stale
  timestamp, or unparseable body → 401, never a silent accept.
- `environment(env)` — `REVOLUT_ENVIRONMENT` selects sandbox/production base URL.
- `configured(env)` — all three env vars present: `REVOLUT_SECRET_KEY`,
  `REVOLUT_WEBHOOK_SIGNING_SECRET`, `REVOLUT_ENVIRONMENT`.

## 3 — Wire the rail into the customer-facing payment paths
- Probe/config: wherever the page asks "can I pay", the probe must report BOTH rails and
  hide buttons the site cannot honour. With `REVOLUT_*` unset (its state tonight) every
  path must behave EXACTLY as it does today — Square default, zero behaviour change.
- Wire Revolut into: the shop checkout (`functions/api/shop/checkout.js`), the booking
  prepay flow (migration 077), and the payment-links flow (migration 045 /
  `functions/api/admin/payment-links.js`), following each flow's existing Square shape:
  create order → return `checkout_url` → record `revolut_order_id` alongside (NEVER inside)
  the `square_*` columns → fulfil on webhook.
- Webhook endpoint `functions/api/revolut-webhook.js`: signature-verified per the adapter;
  fulfil on `ORDER_COMPLETED` only (handle `ORDER_CANCELLED`, `ORDER_FAILED`,
  `ORDER_PAYMENT_DECLINED`, `ORDER_PAYMENT_FAILED`); NEVER fulfil on the browser redirect;
  idempotent fulfilment — guard the paid transition with a conditional UPDATE that only
  fires from the pre-paid state, mirroring how the Square path guards `markOrderPaid`.
- A mistake here corrupts reconciliation: **no Revolut id may ever be written into a
  `square_*` column**, and Square's code paths stay byte-identical.

## 4 — Payment failure UX (non-negotiable, same weight as the signature rules)
Every path a failed or incomplete payment can take must land the customer somewhere honest:

- **Card declined / payment failed** (`ORDER_PAYMENT_DECLINED`, `ORDER_PAYMENT_FAILED`,
  `ORDER_AUTHORISED`→failed, gateway 4xx): the customer returns to the page they paid FROM
  (booking form / checkout / payment link), with a plain message — e.g. "Your card was
  declined. No money has been taken — try another card or pay at the shop." Their entered
  details must SURVIVE (booking/cart/form state intact) so retry is one click, not a
  re-type. The order/booking stays in its pre-paid state; nothing is ever marked paid,
  no receipt, no confirmation email, no staff "paid" flag.
- **Abandoned / cancelled** (`ORDER_CANCELLED`, or the customer closes the Revolut tab):
  same return path, neutral wording ("Payment cancelled — your booking is saved, pay
  whenever you're ready"). The pending order is resumable, not a dead end.
- **The browser redirect is not proof of payment.** The return URL must NEVER render
  "order confirmed", "payment successful", a receipt, or flip any state — even with a
  success-shaped query param. It may only show "processing your payment…" with an honest
  pending state (poll the order status or tell the customer confirmation arrives by
  email/SMS). Only the signature-verified webhook fulfilment may produce a success state.
- **State is read from the DB, never from the redirect.** The return page renders whatever
  the order's real status is; if the webhook hasn't landed yet, that is "pending", not
  "failed" — never show an error for a payment that may still complete.
- **Retry safety:** retrying after a decline must not create duplicate orders/charges —
  reuse the existing pending order's Revolut order (or explicitly void it and create a new
  one keyed to the same row), and the idempotent fulfilment guard already prevents a
  double-mark. Test: two webhook deliveries + a retry after decline → exactly one paid state.
- **Creation-time failures** (Revolut API down, timeout, 5xx): the customer stays on the
  page with "payment is temporarily unavailable — try again in a moment or pay at the
  shop", the Square path remains selectable, and NOTHING half-written is left behind
  (if the order row was created but the Revolut call failed, mark it so retry recovers
  cleanly instead of orphaning it).
- **Owner visibility:** every decline/fail/cancel event lands somewhere Leo can see
  (existing alert helper, log table, or admin view — pick the house pattern), with amount,
  reference and reason. A silent decline is an unanswerable support call.

Add tests for: declined → returns to form with details intact + order still pre-paid;
cancelled → resumable; redirect-visit alone can never flip state; double webhook + retry
→ single paid state; creation failure leaves no orphan.

## 5 — Tests
Plain-Node tests mirroring the Square test style (`tests/square-sync.test.mjs`,
`tests/booking-prepay.test.mjs` are the models). Must cover: signature valid / rotated
(second v1 matches) / stale timestamp / tampered body → 401; order creation shapes;
idempotent double webhook delivery; rail selection with Revolut unset = identical
behaviour to today; and that nothing ever writes Revolut ids into `square_*` columns,
PLUS every failure-UX case from §4. The live payment path cannot be end-to-end tested
without real webhook delivery — say so plainly in your final report.

## 6 — Finish
- Full suite green, imports clean, working tree clean, pushed to main (this deploys).
- Verify prod is unaffected: `GET https://fivestarrepairs.com.au/api/courses` returns 200
  and a booking-price probe still reports Square.
- Final report: migrations applied (exact list), files changed, the webhook URL Leo must
  register in the Revolut dashboard (`https://fivestarrepairs.com.au/api/revolut-webhook`),
  the secrets Leo must set on the Pages project (`REVOLUT_SECRET_KEY`,
  `REVOLUT_WEBHOOK_SIGNING_SECRET`, `REVOLUT_ENVIRONMENT` — via
  `npx wrangler pages secret put NAME --project-name=fivestarrepairs`, followed by an empty
  commit push because Pages secrets only apply to deployments created AFTER the secret was
  set), and everything still unverified or blocked.
