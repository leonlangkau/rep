# CLAUDE.md

Guidance for agents working in this repository.

## What this is

The public marketing site for **Repeater**, Aphileon LTD's B2B wholesale business
(`repeater.com.au`). Static HTML in `public/`, dependency-free Cloudflare Pages Functions
in `functions/`, D1 for data, R2 for media. **No build step, no framework, no linter, no
transpiler, and no runtime npm dependency.** The whole design system is one hand-written
stylesheet.

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
in a public response. `/api/catalogue` publishes quantity breaks only, GST-exclusive.

Writes to `DB_APHELION` are limited to the `leads` insert in `/api/enquiry` and the
`rate_limits` helper. Nothing else.

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