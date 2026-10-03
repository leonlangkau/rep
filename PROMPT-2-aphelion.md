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
