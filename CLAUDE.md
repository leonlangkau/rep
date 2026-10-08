# CLAUDE.md

Guidance for agents working in this repository.

## What this is

The public site for **Repeater**, Aphileon LTD's umbrella brand (`repeater.com.au`): fleet
phones for tradies, AI call answering, and the Repair Shop OS — with the original B2B
wholesale parts supply demoted to one side of the business. Static HTML in `public/`,
dependency-free Cloudflare Pages Functions in `functions/`, D1 for data, R2 for media.
**No build step, no framework, no linter, no transpiler, and no runtime npm dependency.**
The whole design system is one hand-written stylesheet.

Money on the Repair Shop OS is taken by **Revolut Merchant** (ported from
`../fivestarrepairs`, which owns the rail) — see `docs/SETUP-revolut-payments.md`.

It is the third site in a family — siblings are `../aphelion` (owner control centre) and
`../fivestarrepairs` (retail). Read them: they are the style guide, and several files
here are deliberate ports of theirs.

## Commands

```bash
npm run dev              # wrangler pages dev -> http://localhost:8788
npm test                 # node --test tests/*.test.mjs
npm run test:imports     # walks functions/ and imports every module
```

Before every push: `npm test` **and** `npm run test:imports` must both be green. The
imports test exists because an unresolved named import is a link-time error in ESM — one
missing export takes down every route in the file that imports it, and no other test
notices.

## Architecture

### Routing

- `public/**` is served as-is. Clean URLs come from directory-index behaviour and
  `_redirects`, never from extension stripping.
- `functions/**` is auto-discovered. `functions/api/pricing.js` → `/api/pricing`;
  `functions/blog/[slug].js` → `/blog/<slug>`; `functions/sitemap.xml.js` →
  `/sitemap.xml` (a literal dotted filename is the house way to route an extension).
- **Files prefixed `_` are not routed** — `_ratelimit.js`, `_alert.js` are helpers.
- Pages Functions **shadow** a static file of the same name rather than replacing it.
- `functions/_middleware.js` runs on every request and string-injects the aphelion traffic
  beacon before `</head>`. Injections are idempotent and the Response is always rebuilt,
  because reading the body consumes it.

### Fail-closed auth, fail-open features

There is no auth in this repo. The doctrine still applies to everything else:

> **Auth fails closed. Everything else degrades gracefully.** A missing D1 binding, R2
> bucket or third-party secret must never break the customer flow.

Concretely: `/api/proof` returns empty lists rather than throwing; `/api/catalogue`
returns `{ok:true,products:[]}` with no database; `/api/enquiry` still succeeds if the
`leads` insert fails *as long as* the owner alert fired, and only returns 503 when both
paths failed — never a false "thanks".

### Database: schema.sql + migrations

- `schema.sql` is the **complete current schema for a fresh install** and is idempotent
  (every statement `IF NOT EXISTS`). It holds **only the tables this site owns.**
- `migrations/NNN_snake_case_topic.sql`, three digits, starting at **002** (there is no
  001 — `schema.sql` is the base, matching fivestarrepairs).
- A schema change means editing **both**: update `schema.sql` and add a numbered
  migration.
- `ALTER TABLE ADD COLUMN` migrations are **not re-runnable** — D1 has no
  `ADD COLUMN IF NOT EXISTS`. Note that in the migration's comment.
- **`git fetch` in both sibling repos before choosing a migration number.** Parallel agent
  sessions each pick "the next" number from a stale view; this has already caused a
  collision (fivestarrepairs `068` was taken mid-work and became `070`).

### What this repo must never touch

The `repeater` database already contains the wholesale tables created by
`../fivestarrepairs/schema.sql` and `../aphelion/migrations/007_b2b_wholesale.sql`
(`products`, `price_lists`, `price_breaks`, `cost_plus_rules`, `negotiated_prices`,
`trade_accounts`, `wholesale_quotes`, `wholesale_quote_items`, `orders`). aphelion's
Wholesale tab reads and writes them. **Never recreate, alter or drop them here.**

Likewise: never expose `cost_plus_rules`, `negotiated_prices` or another account's pricing
in a public response. `/api/catalogue` publishes quantity breaks only.

The one exception to "never alter them" is `migrations/003_revolut_payments.sql`, which
adds the two **neutral** processor columns to `orders` (`processor_order_id`,
`processor_payment_id`) that the Repair Shop OS rail writes its shadow rows into. That
matches fivestarrepairs migration 081, adds nothing destructive, and is the only ALTER this
repo is allowed to run against the shared schema. The `square_*` columns stay unread and
unwritten.

### What this repo writes in DB_APHELION (extended 2026-10-04)

`DB_APHELION` writes are limited to four things, and nothing else:

- the `leads` insert in `/api/enquiry` (aphelion migration 027);
- the `rate_limits` helper (`functions/api/_ratelimit.js`);
- **`saas_customers` and `saas_subscriptions`** (aphelion migrations 026 + 029), written
  only by `functions/api/shop-os/subscribe.js` and `functions/api/shop-os/webhook.js` —
  the Repair Shop OS subscription rail. This is the extension of the old "leads and
  rate_limits only" rule.

On those two SaaS tables, this repo may write only the `revolut_*` columns
(`revolut_customer_id`, `revolut_subscription_id`) plus the tenant lifecycle columns it
needs: `business_name`, `contact_email`, `plan`, `status`, `trial_ends_at` on customers;
`customer_id`, `plan`, `amount_cents`, `interval`, `current_period_start`,
`current_period_end`, `status` on subscriptions.

**NEVER write `stripe_customer_id` / `stripe_subscription_id`.** Stripe stays authoritative
for existing tenants — aphelion migration 029 says so explicitly — and
`tests/shop-os-payments.test.mjs` fails if any code path names a stripe column. If
migration 029's columns are missing, the endpoints degrade with
`{ ok:false, skip:true, reason:"schema_pending" }`; this repo must never ALTER an aphelion
table itself.

### Content honesty

The site never invents business facts.

- Testimonials, client logos and headline figures come from `GET /api/proof`, which reads
  aphelion's `site_proof` table (owner-entered in aphelion's Admin → References). **When a
  list is empty the whole block is removed from the DOM** — no placeholder, no lorem, no
  skeleton. The page is designed to look complete without them.
- Hard facts (ABN, phone, address, dispatch SLA, tier names) live in
  `public/assets/facts.js` as `[OWNER TO CONFIRM]` and render visibly muted via
  `.placeholder`. `tests/facts.test.mjs` fails if one reaches a custom domain.
- An ABN on an Australian B2B site is a legal requirement. **Do not guess one.**

### Design tokens

`public/assets/site.css` is the single source of truth; its `:root` is the only place to
change the palette. **Contrast is enforced, not judged** — `tests/tokens.test.mjs`
recomputes every WCAG ratio from the parsed `:root` and recomputes the retired-brand-colour
scan. The two rules that catch people out:

- `--accent` (#4f8cff, 3.22:1) is **decorative only** — fills, ≥24px type, icons, rings.
  Links and small accent text use `--accent-strong` (#2f6fe0, 4.70:1).
- `--warn` (#e3b324, 1.96:1) **fails at every size**. It may only be a fill, an icon or a
  dot — never a `color:` value. Its text counterpart is `--warn-strong` (#7a5c00).

### House style

- Public JS: classic script, IIFE, `"use strict"`, `var`/`function` (not `const`/arrow),
  own `$`/`$$` helpers, promise chains rather than `async`, boot via a `readyState` check,
  and `if (location.protocol === "file:") return;`.
- Every form is a **real** `<form method="post" action="/api/enquiry">` that works with
  JavaScript disabled — which is why the endpoint accepts form-encoded bodies.
- `esc()` every interpolated value. No exceptions.
- Wide tables always sit inside a `.table-wrap` overflow container.
- `Intl.NumberFormat("en-AU",{currency:"AUD"})` for money; Australia/Melbourne for dates.
- Headings get `text-wrap: balance`; body copy stays within `60ch`.