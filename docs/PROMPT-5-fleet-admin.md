# PROMPT-5 — rep: FSR-style rebrand + fleet product + full admin panel

Repo: `/root/workspace/rep` (Repeater, repeater.com.au — Aphileon LTD's B2B fleet-phone brand).
You see only this repo. Work in yolo mode. Follow `CLAUDE.md` house rules throughout.

## 0. Decisions already made — do not re-derive or second-guess

- **Design = hybrid.** Adopt FSR's palette/typography (tokens in §2), KEEP rep's current
  layout structure and block inventory. This supersedes any earlier note in
  `docs/PLAN-repeater-site.md` about the monochrome AppNext palette.
- **Two plan tiers, named after the phone:** Work 15 and Work 16e. Supersedes any
  single-phone notes.
- **MDM is managed by Repeater, not the customer.** It is an internal fleet field, never a
  customer-facing feature or login.
- **What customers are buying:** fleet iPhones with included screen/back-glass repairs,
  same-day swap to a loaner when a phone can't be repaired same-day, and Repeater's repair
  backend (FSR-style ticketing) behind it. Ticketing lives in rep's own D1 for now.
- **Call-request field is UI-ONLY this pass.** No endpoint, no table, no backend. A fake
  success state plus a `TODO: POST /api/call-request` comment is the entire wiring. This
  supersedes anything else in this repo's docs about call requests.
- **Prices below are PROVISIONAL, set by Leo from the unit-economics model:**
  Work 16e **$89/mo**, Work 15 **$79/mo**, 24-month commitment, **BYO SIM** (customers
  keep their existing carrier and plan — Repeater does NOT supply SIMs or data).
  Render them exactly; add a small `[OWNER TO CONFIRM]` HTML comment next to each price.
  Never invent other business facts — unknown terms get `[OWNER TO CONFIRM]` placeholders.

## 1. Sync + baseline first

1. `git fetch origin && git pull --ff-only origin main` — report what came in.
2. Install deps if needed; run `npm test` AND `npm run test:imports`. Both green BEFORE any
   change, so later failures are attributable to this work.
3. **Run pending remote D1 migrations NOW, before code work.** Verify what is actually
   applied by inspecting tables (`PRAGMA table_info`, `sqlite_master`) — never trust a
   migration tracker table. Re-check the next migration number AFTER the pull; parallel
   sibling sessions pick "the next" number from stale views and collide.

## 2. Rebrand to FSR design language (tokens only — structure stays)

Single source of truth stays `public/assets/site.css` `:root`. Apply:

```css
/* palette (from ../fivestarrepairs live site) */
--bg:#ffffff; --bg-sunken:#faf7ef; --bg-raised:#f4efe2;
--band:#241d04; --band-fg:#ffffff; --band-fg-2:rgba(255,255,255,.62); --band-line:rgba(255,255,255,.14);
--fg:#1a1c20; --fg-2:#52565e; --fg-3:#7a7e87;
--accent:#f5b301; --accent-strong:#8f6b00; --accent-pressed:#d99e00;
--accent-ink:#231a00; --accent-soft:rgba(245,179,1,.12); --accent-ring:rgba(26,28,32,.18);
--line:#ece7da; --line-2:#f0ebdf; --line-strong:#dcd4bf;
--ok:#1e9e50; --danger:#d92d20; --info:#2563eb;
--font-display:"Manrope", system-ui, sans-serif;  /* replaces Jost */
```

- Copy the Manrope webfonts from `../fivestarrepairs/public/assets/fonts/manrope-latin*.woff2`
  into `public/assets/fonts/`, add matching `@font-face` rules, swap `--font-display` from
  Jost to Manrope. Keep Inter for body. Remove the Jost files only if nothing references
  them after the swap.
- Contrast rules: text on gold buttons is `--accent-ink` (#231a00), never white.
- Do NOT redesign layouts, grids, or section order — this is a palette/type swap plus the
  new sections in §3/§4. Existing blocks keep their shapes.

## 3. Public site: fleet product pages

1. **Pricing page (`public/pricing/`)** — two tiers, side by side:
   - **Work 15 — $79/mo per phone** · **Work 16e — $89/mo per phone** (both: 24-month
     commitment, BYO SIM, `[OWNER TO CONFIRM]` comments in the HTML).
   - Every tier includes: the phone, unlimited screen & back-glass repairs ($0 excess),
     **same-day swap** — if we can't repair it same day the tradie walks out with a loaner
     phone, MDM enrolled and managed by Repeater, BYO SIM (they keep their carrier and
     number), and the repair-backend ticketing portal for the boss.
   - Show per-team monthly totals (3 / 5 / 10 / 20 phones) for each tier — static numbers:
     Work 15 $237 / $395 / $790 / $1,580 · Work 16e $267 / $445 / $890 / $1,780.
2. **Fleet explainer section** (pricing page or its own page): the tradie-boss story —
   employees break phones; screens are replaced in-house; unrepairable same-day = instant
   loaner swap; boss sees every ticket in the portal. Keep it simple, few blocks.
3. **Call-request field (UI-only)** on the pricing page and in the final CTA band:
   labelled **"Or get a call from our AI — we'll ring you"**, single input (AU mobile
   format validated client-side) + submit button. On submit: client-side only — show a
   success state ("Got it — our AI will call 04XX XXX XXX shortly"), log to console,
   `// TODO: POST /api/call-request` comment. No network call, no endpoint.
4. Update nav/footer copy where it still describes rep as wholesale-parts-only, to include
   the fleet product. Keep the wholesale side intact — it is demoted, not deleted.

## 4. Admin panel (full build, `/admin`)

Reference implementation for structure, auth and styling is `../fivestarrepairs`'s admin
(read its `functions/api/admin/` for the pattern — `_middleware.js`, `login.js`, `me.js`,
`logout.js`, session-cookie auth). Port the PATTERN; rep stays dependency-free.

1. **New D1 migration** (next number after pull) creating:
   `companies` (id, name, contact_name, contact_mobile, email, notes, created_at),
   `employees` (id, company_id, name, role, mobile),
   `fleet_phones` (id, company_id, employee_id?, model CHECK('iPhone 15','iPhone 16e'),
   tier, imei, serial, condition, status CHECK('deployed','loaner_pool','in_repair','retired'),
   warranty_until, mdm_enrolled INTEGER, enrolled_at, notes),
   `repair_tickets` (id, phone_id, issue, status CHECK('open','in_repair','swapped','resolved'),
   swap_phone_id?, opened_at, resolved_at, notes),
   `swaps` (id, ticket_id, loaner_phone_id, swapped_out_at, swapped_back_at).
   Indexes on company_id/phone_id/status. Apply it REMOTE and verify with `PRAGMA`.
2. **Auth:** session-cookie login for `admin` users (bcrypt-style hashed password via
   WebCrypto, sessions table in D1, `_middleware` guard on every `/api/admin/*` and the
   `/admin` HTML). TOTP is a follow-up — leave a stub route returning 501, don't fake it.
3. **Sections** (server-rendered HTML, FSR-admin styling with the §2 tokens):
   - **Dashboard:** counts — fleet by status, active companies, open tickets, phones in
     repair, loaners out, MRR placeholder `[OWNER TO CONFIRM]` until billing lands.
   - **Companies:** CRUD + per-company employee list + their phones and tickets.
   - **Fleet:** phone inventory CRUD (model, tier, IMEI, serial, condition, status,
     warranty, mdm_enrolled toggle). Filters by status/tier.
   - **Tickets:** open/in_repair/swapped/resolved; create ticket against a phone; when
     status → `swapped`, pick a loaner from `loaner_pool` and write a `swaps` row; resolve
     returns the loaner. This is the same-day-swap workflow.
   - **Reports:** repairs per month, swaps per month, fleet composition — plain tables.
4. **Call-requests admin card:** empty state only ("wired later — see PROMPT decision 0").
   No table, no endpoint.
5. **Billing section:** read-only view over rep's existing shop-os subscription data where
   present; empty state where not. Do NOT build new payment flows — Revolut port is a
   separate approved brief (PROMPT-4). Never touch payment-processor columns.

## 5. Hard scope fences

- Only this repo, only rep's own D1 tables. Never ALTER another project's tables; never
  write into fsr/aphelion data.
- Code against env names only; every optional integration degrades with
  `{ok:false, skip:true, reason:"not_configured"}`. A push with no secrets set must not
  change behaviour.
- No new npm dependencies, no build step, no framework. Static HTML + dependency-free
  Pages Functions. All SQL parameterised.
- Never weaken a test to go green; extend the suite for new features instead.
- The call-request flow gets NO backend in this pass (decision 0).

## 6. Finish gates

1. `npm test` and `npm run test:imports` green on the final tree.
2. Push to main (push = production deploy on this repo) and verify the Pages deployment.
3. Prod probe: load `/`, `/pricing/`, `/admin/` and one admin API route (expect 401
   unauthenticated, not 500). Report status codes.
4. Report structured as: **what changed / verified vs unverified / blocked / anything Leo
   must do by hand** (e.g. `npx wrangler pages secret put` commands — you never set
   secrets yourself).
