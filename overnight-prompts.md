# OVERNIGHT PROMPT BUNDLE — 2026-10-03/04

## PROMPT-1 (rep: content restructure U0-U5) — rep window

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

## PROMPT-2 (aphelion: Repeater control) — aphelion window, in parallel with rep

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

---

## NOT IN THIS BUNDLE: PROMPT-4 (rep Revolut port) — deferred to tomorrow evening with Leo present. File: PROMPT-4-rep-revolut-port.md
