# PROMPT-5 — rep: brand build to canon + full admin panel (aligned to the Repeater master doc set)

Repo: `/root/workspace/rep` (Repeater, repeater.com.au — Aphileon Pty Ltd's B2B brand for
tradies and field service). You see only this repo. Work in yolo mode. Follow `CLAUDE.md`.

**Canon source:** this brief mirrors the owner's master document set (Business Plan &
Market Data 25/09, Setup Plan, Marketing v3, MSA RPT-MSA-2026-09 v1.2, PA-1..PA-7,
Referral Terms). Where this brief and any older repo doc disagree, THIS brief wins.
**Payments note:** the master doc set predates the fleet-wide rail switch — every
reference in older docs to Square (card-on-file, recurring, payment links) now means
**Revolut Merchant**. Do not build or name any Square integration.

Product names, prices and contract terms below are LOCKED canon — render them exactly,
never invent or "improve" them.

## 0. Decisions already made — do not re-derive

- **The phone business — three products, all phone capital client-funded (Leo floats
  ~$1k for demo/loaner stock only):**
  - **PA-1 Managed Fleet (customer-facing name; document code stays PA-1):** $572 upfront
    per device + $50 establishment fee, payable on signing · **+ $29/month per device
    management fee** `[OWNER TO CONFIRM]` · 24-month term · **Repeater keeps title for the
    whole term — the client never owns the device; no buyout option** · MDM enrolment is a
    condition (non-negotiable) · PPSR-registered before delivery · devices ordered on
    cleared funds (single-unit supplier, ~$500–600 landed) so delivery follows signing by
    a few days · **repairs included:** screen, back-glass and manufacturer-warranty faults
    repaired at $0 (legally safe because the device is Repeater's own asset — this is
    maintenance of our own property); deliberate/reckless damage quoted before any work ·
    **pay-in-full option:** the client may instead pay **$1,180 + GST per device on
    signing** `[OWNER TO CONFIRM]` — the full 24-month term in one payment (upfront +
    establishment + all management fees, normally $1,318 — saves $138); no further
    recurring amounts for that device, early-exit refunds the unused management-fee
    component less the device amortisation in the lease terms ·
    **same-day swap:** if a device can't be repaired same day it is swapped from the
    loaner pool (2 refurb loaners on hand; loaners are older-model iPhones, not new
    stock) · end of term: device returns to Repeater, wiped and either resold or
    redeployed as a loaner — the client starts a fresh term for a current device.
  - **PA-2 Device Care Plan:** client-owned devices only (leased devices are NOT eligible)
    · $622 day one per device + $5.50/week per device · $60 per service event · cap 2
    events per calendar quarter plus 1 extra per quarter per 4 devices on the plan ·
    over-cap events at standard repair price, quoted and approved in writing first · $30
    call-out within 20 km of Mount Waverley · same-day target for pre-2pm bookings (a
    target, not an entitlement) · 90-day workmanship warranty · **accidental damage on
    client-owned devices is NOT included** — quoted separately (this exclusion is being
    added to PA-2 cl 3; see the contract edit list below).
- **Services are the business; phones are the door.** The site sells PA-3 Website Care
  ($20/wk), PA-4 Data Admin ($15/wk), PA-5 Ads Management ($100/wk, spend stays on the
  client's own ad accounts), PA-6 AI Receptionist ($167/month + $300 setup, 500 answered
  minutes/mo then $0.25/min), PA-7 Security Review ($400–800 quoted setup + optional
  $12/wk monitoring, Essential Eight based). All prices + GST.
- **Bundle tiers exist (MSA cl 6): 2 products 5.5% → all 6 17.5%.** Present them as a
  discount line on each product's own terms. NEVER use the words package, bundle or
  add-on in customer-facing copy.
- **Billing runs on Revolut Merchant** (recurring card payments, card-on-file authority
  wording per MSA cl 5). This pass does NOT build payment flows — the Revolut port is
  PROMPT-4's approved work. Render billing copy rail-neutral: "recurring card payment".
- **Voice rules (legal + brand, apply to every word on the site):** numbers first; plain
  words; short sentences; **no insurance vocabulary ever** — never cover, policy, premium,
  claim, insure, protect, guarantee, peace of mind; say the hard parts out loud (caps,
  fees, exit terms on page one of any pricing context); **no exclamation marks**;
  Australian spelling.
- **Design = FSR family, related not identical.** Keep rep's current layout structure and
  block inventory. Typography matches FSR (Manrope display + Inter body — copy the
  Manrope woff2 files from `../fivestarrepairs/public/assets/fonts/`). Palette: charcoal
  base with a single signal-amber accent (FSR's gold #F5B301 works as that amber; do NOT
  clone FSR's warm-cream surfaces or gold-on-black band styling wholesale — Repeater reads
  technical, FSR reads warm). `[DESIGN DECISION PENDING LEO — amber #F5B301 is the
  default accent; if Leo picks a different signal hue it is a one-line token change.]`
- **Call-request field is UI-ONLY this pass.** Labelled "Or get a call from our AI —
  we'll ring you": single AU-mobile-format input + submit, client-side success state only,
  `// TODO: POST /api/call-request` comment, no endpoint, no table.
- Website copy must not contain missed-call statistics sourced from vendors ($8B/yr,
  $126k/yr etc.). The approved pitch line is the client's own arithmetic: "missing one
  $500 job a week costs you $26,000 a year."

## 1. Sync + baseline first

1. `git fetch origin && git pull --ff-only origin main` — report what came in.
2. Install deps if needed; run `npm test` AND `npm run test:imports`. Both green BEFORE
   any change.
3. **Run pending remote D1 migrations NOW, before code work.** Verify what is applied by
   inspecting tables (`PRAGMA table_info`, `sqlite_master`) — never trust a migration
   tracker table. Re-check the next migration number AFTER the pull; parallel sibling
   sessions pick "the next" number from stale views and collide.

## 2. Rebrand (typography + tokens — structure stays)

Single source of truth stays `public/assets/site.css` `:root`:

```css
/* Repeater: technical charcoal family-cousin of FSR */
--bg:#ffffff; --bg-sunken:#f4f4f4; --bg-raised:#fafafa;
--ink:#16181b; --ink-2:#4b4f56; --ink-3:#6b7078;
--band:#16181b; --band-fg:#f4f4f1; --band-fg-2:rgba(244,244,241,.62); --band-line:rgba(244,244,241,.14);
--accent:#f5b301; --accent-strong:#8f6b00; --accent-pressed:#d99e00;
--accent-ink:#231a00; --accent-soft:rgba(245,179,1,.12); --accent-ring:rgba(22,24,27,.25);
--line:#e2e4e7; --line-strong:#cfd2d6;
--ok:#1e7f45; --danger:#c42b1c; --info:#2563eb;
--font-display:"Manrope", system-ui, sans-serif;  /* replaces Jost */
```

- Copy `manrope-latin*.woff2` from `../fivestarrepairs/public/assets/fonts/` into
  `public/assets/fonts/`, add matching `@font-face` rules, swap `--font-display` from Jost
  to Manrope, keep Inter for body. Remove Jost files only if nothing references them.
- Text on gold/amber accents is always `--accent-ink` (#231a00), never white.
- Do NOT redesign layouts, grids, or section order — token/type swap plus §3/§4 only.

## 3. Public site

1. **Pricing page (`public/pricing/`)** — three sections, each product on its own line
   with its own terms (no menu framing):
   - **Managed Fleet (PA-1):** "$572 upfront + $50 establishment per device · $29/month
     management per device `[OWNER TO CONFIRM]` · 24 months · the phone stays Repeater's
     property — you never own it, we manage everything · screen, back-glass and warranty
     repairs included at $0 · can't fix it same day? You get a loaner phone the same
     visit · MDM-managed and PPSR-registered · at term end hand it back and start fresh
     on the current model." State plainly: devices are ordered on cleared funds and
     arrive within days of signing; deliberate damage is quoted before any work; theft
     and loss remain the client's risk per the agreement. Pay-in-full option shown under
     the card: "$1,180 + GST for the full 24 months, paid once — saves you $138
     `[OWNER TO CONFIRM]`."
   - **Device Care Plan (PA-2):** "$622 day one + $5.50/week per device · $60 per service
     event · 2 events per quarter included (+1 per 4 devices) · same-day target for
     pre-2pm bookings · 90-day workmanship warranty · your devices, your ownership."
   - **Services (PA-3..PA-7)** with the locked prices from §0, one line each, each
     individually cancellable after its 13-week minimum, discount tiers shown as a plain
     table (2→5.5% … 6→17.5%).
   - Hard parts on page one: minimum terms, upfront + monthly amounts, caps, call-out
     fee, "the phone stays ours".
2. **Fleet explainer section:** the tradie-boss story — employees break phones; the
   fleet stays Repeater's property under MDM, repairs are included and a loaner covers
   anything we can't fix same day; the Care Plan covers their own devices with capped
   events. Keep it simple, few blocks, no invented statistics.
3. **Call-request field (UI-only)** on the pricing page and final CTA band per §0.
4. Update nav/footer copy from wholesale-parts-only to the 7-product Repeater. Keep the
   wholesale side intact — demoted, not deleted. Run every new string past the §0 voice
   rules; zero tolerance on insurance vocabulary and exclamation marks.

## 4. Admin panel (full build, `/admin`)

Reference implementation for structure/auth/styling: `../fivestarrepairs`'s admin
(`functions/api/admin/` — `_middleware.js`, `login.js`, `me.js`, `logout.js`, session
cookies). Port the pattern; rep stays dependency-free.

1. **New D1 migration** (next number after pull) creating:
   `companies` (id, name, contact_name, contact_mobile, email, notes, created_at),
   `employees` (id, company_id, name, role, mobile),
   `devices` (id, company_id?, employee_id?, model, imei, serial, status
   CHECK('in_stock','leased','care_plan','loaner_pool','in_repair','returned','retired'),
   condition, ownership CHECK('repeater','client'), mdm_enrolled INTEGER, enrolled_at,
   landed_cost, notes),
   `leases` (id, device_id, company_id, upfront_amount, establishment_fee, monthly_fee,
   payment_plan CHECK('monthly','prepaid'), prepaid_total, start_date, term_months
   DEFAULT 24, ppsr_registration_number,
   ppsr_registered_at, ppsr_expiry, election_status
   CHECK('active','returned','renewed','holdover'), holdover_started_at, notes)
   — NOTE: no buyout column; the client never takes title under the Managed Fleet model.
   `care_plans` (id, device_id, company_id, dayone_amount, weekly_fee, start_date,
   active INTEGER),
   `service_events` (id, care_plan_id?, device_id, lease_id?, event_type, fee_charged,
   parts_cost, status CHECK('booked','in_progress','done','declined'),
   approved_by_client INTEGER, opened_at, resolved_at, notes),
   `call_requests` (id, mobile, created_at, status CHECK('new','dialled','done'), notes)
   — the UI-only field's future landing spot; admin card shows the queue, no calling
   integration this pass.
   Indexes on company_id/device_id/status; CHECK constraints as listed.
2. **Auth:** session-cookie login for admin users (WebCrypto-hashed passwords, sessions
   table in D1, middleware guard on every `/api/admin/*` route and the `/admin` HTML).
   TOTP is a follow-up — stub route returning 501, never fake it.
3. **Sections** (server-rendered HTML, FSR-admin styling with §2 tokens):
   - **Dashboard:** active leases, devices in field, care-plan devices, service events
     this quarter vs cap, PPSR registrations expiring within 90 days, lease elections due
     within 60 days, recurring billing run list (care plans + services grouped by charge
     day).
   - **Companies:** CRUD + per-company employees, devices, leases, care plans.
   - **Devices:** inventory CRUD (model, IMEI, serial, ownership, status incl. loaner
     pool, MDM toggle, landed cost). Filters by status/ownership.
   - **Leases (Managed Fleet):** create lease from an in-stock device or "ordered on
     cleared funds" pending state (auto-compute upfront/establishment, monthly fee, PPSR
     fields), record end-of-term election (return/renew/holdover), early-exit calculator
     ($572 less $23.83 per completed month), repossession note.
   - **Care plans & events:** device schedule per plan, event cap tracker per account
     (2/quarter + 1 per 4 devices), event logging with fee + parts cost, over-cap events
     requiring recorded client approval, decline flow.
   - **Call requests:** queue table, status updates. No dialler.
   - **Reports:** events per month, parts cost per event (the $80 tripwire average),
     fleet composition, lease buyout vs return ratio — plain tables.
4. **Billing:** read-only view over rep's existing shop-os subscription data where
   present; empty state where not. Do NOT build new payment flows or touch
   payment-processor columns — the Revolut Merchant port is PROMPT-4's approved work.

## 5. Hard scope fences

- Only this repo, only rep's own D1 tables. Never ALTER another project's tables; never
  write into fsr/aphelion data.
- Code against env names only; optional integrations degrade with
  `{ok:false, skip:true, reason:"not_configured"}`. A push with no secrets set must not
  change behaviour.
- No new npm dependencies, no build step, no framework. Static HTML + dependency-free
  Pages Functions. All SQL parameterised.
- Never weaken a test to go green; extend the suite instead.
- PA-1/PA-2/PA-3..7 prices and terms are locked canon — render, don't reinterpret.

## 6. Finish gates

1. `npm test` and `npm run test:imports` green on the final tree.
2. Push to main (push = production deploy) and verify the Pages deployment.
3. Prod probe: load `/`, `/pricing/`, `/admin/` and one admin API route (expect 401
   unauthenticated, not 500). Report status codes.
4. Report: **what changed / verified vs unverified / blocked / anything Leo must do by
   hand** (e.g. `npx wrangler pages secret put` commands — you never set secrets).
