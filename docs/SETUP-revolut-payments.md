# Setup: Revolut payments (Repair Shop OS)

Money on the Repair Shop OS is taken by the **Revolut Merchant API**. The checkout page at
`/shop-os/checkout` starts a **subscription** (`POST /api/shop-os/subscribe`) or a **one-off
month** (`POST /api/shop-os/checkout`), the customer is sent to Revolut's hosted checkout to
add a card, and `POST /api/shop-os/webhook` settles it.

This rail is **ported from the sibling `fivestarrepairs` repo**, which owns it — read
`../fivestarrepairs/docs/SETUP-revolut-payments.md` and
`../fivestarrepairs/functions/api/_revolut.js` when you change anything here. There is no
Square anywhere in this repo (there never was), and Stripe is not used for the OS.

- **Cloudflare account/project:** `repeater` (Workers & Pages)
- **D1 databases:**
  - `repeater` (id `60bf7791-8963-4b10-870a-16194e4be0f3`), bound as **`DB_REPEATER`** —
    our own tables, including the `orders` shadow rows and `revolut_plan_cache`.
  - `aphelion-admin` (id `3f6d51f8-7b13-437b-aedb-5af019b62901`), bound as
    **`DB_APHELION`** — where `saas_customers` / `saas_subscriptions` live.

---

## 1. Apply the database migrations

- **`migrations/003_revolut_payments.sql`** (this repo, against the `repeater` database):
  adds the neutral `processor_order_id` / `processor_payment_id` columns to the shared
  `orders` table (matching fivestarrepairs migration 081), the
  `idx_orders_processor_order` index, and creates `revolut_plan_cache`.
  **Run each `ALTER` as its own command** — D1 has no `ADD COLUMN IF NOT EXISTS`, and a
  multi-statement batch can apply only some of it. Re-running the `ALTER`s reports
  "duplicate column", which is harmless.
- **aphelion migration `029_saas_revolut.sql`** adds `saas_customers.revolut_customer_id`
  and `saas_subscriptions.revolut_subscription_id`. It is applied to `aphelion-admin`
  (aphelion owns it). Verify with
  `npx wrangler d1 execute aphelion-admin --remote --yes --command "SELECT name FROM pragma_table_info('saas_customers')"`.

```bash
npx wrangler d1 execute repeater --remote --yes --command "ALTER TABLE orders ADD COLUMN processor_order_id TEXT NOT NULL DEFAULT ''"
npx wrangler d1 execute repeater --remote --yes --command "ALTER TABLE orders ADD COLUMN processor_payment_id TEXT NOT NULL DEFAULT ''"
npx wrangler d1 execute repeater --remote --yes --command "CREATE INDEX IF NOT EXISTS idx_orders_processor_order ON orders (processor_order_id)"
npx wrangler d1 execute repeater --remote --yes --file=migrations/003_revolut_payments.sql
```

(The last line is for a fresh database only; on an existing one the two `ALTER`s above are
what matter.)

---

## 2. Create the Revolut Merchant API key

1. Sign in to the **Revolut Merchant** dashboard ([merchant.revolut.com](https://merchant.revolut.com);
   use the **sandbox** dashboard while testing).
2. Open **API keys** (developer settings) and generate a **Merchant API secret key**. It
   starts with `sk_`. Sandbox and production keys are separate — generate the one that
   matches the `REVOLUT_ENV` below.
3. Copy it. This is `REVOLUT_SECRET_KEY`; the server sends it as `Authorization: Bearer sk_…`.
   It must never reach a browser.

## 3. Register the webhook

1. In the same dashboard, open **Webhooks** → **Add webhook**.
2. Set the URL to:

   ```
   https://repeater.com.au/api/shop-os/webhook
   ```

3. Subscribe it to **`ORDER_COMPLETED`** — the event the code settles on — and to
   **`SUBSCRIPTION_CANCELLED`**, which marks a tenant cancelled. You may also subscribe to
   `SUBSCRIPTION_INITIATED`, `SUBSCRIPTION_FINISHED` and `SUBSCRIPTION_OVERDUE`; they are
   acknowledged and ignored. (There is no "activated" event in the API — activation is
   confirmed by reading the subscription back, which the webhook does.)
4. Copy the webhook's **signing secret** (it starts with `wsk_`). This is
   `REVOLUT_WEBHOOK_SECRET`. Every request is verified as HMAC-SHA256 over
   `v1.{timestamp}.{raw body}`; without it the endpoint rejects everything **401**, so a
   payment would never mark itself settled.

## 4. Set the variables

Cloudflare Pages → **repeater** → **Settings → Variables and secrets** (Production, and
Preview too if you want the preview branch to take payments), then redeploy.

| Variable | Type | What it is |
|---|---|---|
| `REVOLUT_SECRET_KEY` | **secret** | The Merchant API secret key, `sk_…`. Required. Sent by the server as `Authorization: Bearer`. |
| `REVOLUT_WEBHOOK_SECRET` | **secret** | The signing secret of the webhook registered for the URL above, `wsk_…`. Required to settle payments. |
| `REVOLUT_ENV` | var | Leave unset for **production** (the default). Set to `sandbox` only to test against the sandbox. Must match the key. |
| `REVOLUT_API_VERSION` | var, optional | Pins the dated `Revolut-Api-Version` header. Unset uses the repo default (`DEFAULT_REVOLUT_VERSION` in `functions/api/_revolut.js`, currently `2026-08-17`). |

`REVOLUT_PUBLIC_KEY` is **not used** here: this rail redirects to Revolut's hosted page, so
no embedded widget and no public key is needed. Nothing in `public/` ever sees a key.

**Until `REVOLUT_SECRET_KEY` is set, the checkout page says so and offers the enquiry form
instead** — `GET /api/shop-os/checkout` reports `{ ok:false, skip:true, reason:"not_configured" }`
and the page never shows a payment button it cannot honour.

---

## How the money is taken

**Subscription (the normal path).** `/shop-os/checkout` → **Continue to Revolut** →
`POST /api/shop-os/subscribe`:

1. the tier's plan and its single monthly variation are created **once** and cached in
   `revolut_plan_cache` (never recreated per signup); the plan carries the
   `trial_duration` (`TRIAL_DAYS` in `functions/api/shop-os/_tiers.js`, currently 14 — the
   one number here that is flagged `[OWNER TO CONFIRM]` because the pricing page promises a
   trial without a length);
2. a Revolut customer is created (or reused) and the tenant is recorded in
   `saas_customers` as `trial`, with `revolut_customer_id`;
3. a subscription is created `pending` with a **setup order**; the customer is sent to that
   order's `checkout_url` to add a card. **Nothing is charged during the trial** — Revolut
   collects the first payment when the trial ends;
4. when the setup order completes, `ORDER_COMPLETED` arrives, the webhook flips
   `saas_subscriptions` (`pending` → `active`) and `saas_customers` (`trial` → `active`),
   and alerts the owner.

**One-off month.** The "Or pay for one month up front" link creates a single Revolut order
for the tier's monthly amount and writes a shadow row on `orders`; the same webhook settles
it. Use it for a customer who does not want a stored card.

**What the customer sees on return.** The browser is sent back to
`/shop-os/checkout?status=return&ref=…`, which shows *"Processing…"* and polls
`GET /api/shop-os/subscribe?ref=…`. The page **never** says a payment succeeded from a
browser state — it says "active" only after the server reports it, which only happens once
the webhook has settled. A declined or failed setup returns here with the details intact and
a plain "no money has been taken" message; a cancelled or closed tab is neutral, and the
pending order stays resumable because the reference is kept in the URL.

---

## Verify it works

- `curl -s https://repeater.com.au/api/shop-os/checkout` → with no key set:
  `{"ok":false,"skip":true,"reason":"not_configured"}`; with a key set:
  `{"ok":true,"configured":true,"env":"production"}`.
- In **sandbox** (`REVOLUT_ENV=sandbox`, sandbox key), take a Starter subscription through
  the hosted page with a Revolut test card. After the setup order completes, the return page
  should reach "active" on its own, `saas_customers.status` should become `active`, and a
  `saas_subscriptions` row should exist with `status = 'active'`. If nothing flips, check
  the webhook signing secret and the webhook subscription first.
- Confirm the owner alert arrived (Pushover / the team webhook) — `_alert.js` here has no
  email leg, so if Pushover is unset there is no alert channel at all.

**Until Leo registers the webhook and a real payment flows, the live payment path is
unverified.** The unit tests (`tests/shop-os-payments.test.mjs`) prove the settlement logic
against a stubbed Revolut; they cannot prove that Revolut accepts the plan/subscription
shapes on this merchant account.