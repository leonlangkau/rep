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

- **The phone business is a THREE-plan ladder (Leo, 2026-10-04 — supersedes the earlier
  one-product instruction). A client holds at most ONE phone plan; the plan is fixed at
  signing for the whole 24-month term — care can never be added mid-term, only at
  renewal on a new term. Minimum 2 devices on every plan; solo tradies (1 device) are
  steered to FSR walk-in repairs — no plan.**
  - **PA-1 Fleet Phones (device only, NO care — care cannot be added later; PA-1 v1.4
    as drafted by the contract writer is the adopted baseline):** $622 per device
    payable on signing — $572 device + $50 establishment + $27.50 fleet-administration
    fee, the admin fee **one-off and capped at $110 per plan for the whole term** (every
    device beyond the fourth carries no admin fee) · **nil weekly fee** · 24-month term
    · **NO buyout — title never transfers; end of term is return and renew** (holdover
    $11.50/wk pending return) · stolen or lost device: one-off **$300 fleet loss fee**,
    that device's lease ends, no remaining-term payout · MDM enrolment is a condition
    (non-negotiable) · PPSR-registered before delivery · devices ordered on cleared
    funds (~$500–600 landed), delivery days after signing · no repair services included:
    manufacturer-warranty faults administered free; accidental damage at standard price,
    quoted and approved first · no loaner swap, no included service events.
  - **PA-2 Managed Fleet (device + care):** $622 day one per device · **fleet
    administration fee $27.50 per device, capped at $110 per plan for the whole term,
    collected in equal weekly instalments alongside the weekly fee** · **weekly care fee
    per device: 2–4 $5.60 · 5–9 $5.10 · 10–19 $4.70 · 20–49 $4.30 · 50+ $3.90** (all +
    GST) · the $622 day-one never discounts · standard per-phone
    total at 2–4 devices: **$1,231.90** ($622 + $27.50 admin + $5.60 × 104) ·
    **pay-in-full option: 10% off the standard total for your tier, per device on
    signing — $1,109 (2–4) · $1,057 (5–9) · $1,010 (10–19) · $967 (20–49) · $927 (50+)** —
    the stepper computes it live so it is never upside-down ·
    term — the client never owns the device; no buyout** · MDM enrolment is a condition
    (non-negotiable) · PPSR-registered before delivery · devices ordered on cleared funds
    (single-unit supplier, ~$500–600 landed), delivery days after signing ·
    **care plan included:** service events 2 per calendar quarter plus 1 extra per quarter
    per 4 devices on the plan, **$0 each**; over-cap events **$60 flat each**, with a hard
    limit of 4 paid events per device per rolling 12 months — beyond that, quoted per job
    or the device is removed from the plan · deliberate/reckless damage is never a service
    event — quoted and approved before work · theft and loss remain the client's risk ·
    **call-outs: the first 2 per rolling 12 months are free** (per account — market this),
    then $19 within 20 km of Mount Waverley, beyond that quoted · same-day target for
    bookings before 2 pm (a target, not an entitlement) · 90-day workmanship warranty on
    repairs · **same-day swap:** if a device can't be repaired same day it is swapped from
    the loaner pool (2 refurb loaners; older-model iPhones) · end of term: device returns
    to Repeater, wiped, resold or redeployed as a loaner; the client starts a fresh term
    on a current model.
  - **PA-8 Fleet Connect (device + care + SIM) — COMING SOON:** a static coming-soon card
    only. No pricing, no register-interest form, no schema table, no contract document,
    not wired to anything. One sentence of copy: "Device + Care + SIM. One plan, one
    weekly fee. Coming soon."
  - "From" pricing anywhere on the page must be a real minimum-order price (ACCC
    misleading-price rules); tier tables are shown so every step is visible and
    verifiable.
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
- **Design = unchanged.** Keep rep's CURRENT design system exactly — blue accent
  (#4f8cff family), Jost display + Inter body, existing tokens, layouts and blocks. No
  rebrand, no recolour, no font swap this pass. This supersedes the master doc §1.5
  "charcoal + signal amber" direction (Leo's call, 2026-10-04) and any FSR-family
  recolour. §2 below is a hold-steady section, not a change list.
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

## 2. Design — unchanged (hold-steady)

No visual changes this pass. The agent must NOT touch `public/assets/site.css` tokens,
fonts, colours, layouts, grids or section order. If any §3 content (pricing blocks,
stepper, services list) needs styling, use the existing classes and tokens as they are.
The only permitted additions are new HTML blocks styled with existing classes.

## 3. Public site

1. **Pricing page (`public/pricing/`)** — three sections, each product on its own line
   with its own terms (no menu framing):
   - **Fleet Phones (PA-1):** "$622 all-in per device on signing — device, setup and
     fleet administration for the whole term · no weekly fee · 24 months · hand the
     phones back at term end and start fresh on the current model, or renew · warranty
     faults handled for you free · any other repair quoted before work starts · phone
     stolen or lost? A $300 fleet loss fee ends that device's lease — no payout of the
     remaining term · MDM-managed and PPSR-registered · care is not available on this
     plan — choose Managed Fleet if you want repairs included · your plan is fixed for
     the term." State plainly: devices are ordered on cleared funds and arrive within
     days of signing; theft and loss remain the client's risk per the agreement.
     Quantity stepper starting at 2: live "today" line ($622 per device × count), with
     the fleet-admin cap noted under it (2–4 devices pay $27.50 each; from 5 devices
     the admin fee is $110 total for the whole term).
   - **Managed Fleet (PA-2):** "$622 upfront per device · from $5.60 a week per device
     — that is the care: repairs, call-outs and the loaner swap — plus fleet
     administration spread across your weekly payments ($27.50 per device for the whole
     term, capped at $110 per plan) · 24 months · the phone stays Repeater's property —
     you never own it, we manage everything · repairs included: 2 service events per
     quarter, plus 1 extra per quarter for every 4 devices on the plan, $0 each · past
     the cap? $60 flat per extra repair · first 2 call-outs free every 12 months, then
     $19 within 20 km · can't fix it same day? You get a loaner phone the same visit ·
     MDM-managed and PPSR-registered · at term end hand it back and start fresh on the
     current model." State plainly: devices are ordered on cleared funds and arrive
     within days of signing; deliberate damage is quoted before any work; theft and
     loss remain the client's risk per the agreement. Pay-in-full option under the
     card: "$1,109 + GST for the full 24 months, paid once — saves you $123. Bigger
     fleets prepay less — 10% off your tier's total."
   - **Managed Fleet stepper (PA-2 block):** quantity control starting at 2 devices with
     plus/minus buttons. As the count changes, the per-device weekly fee steps per §0
     tiers ($5.60/$5.10/$4.70/$4.30/$3.90) and the page shows live: devices, per-device
     weekly fee (care + admin share), weekly total, the "today" line ($622 per device),
     and the pay-in-full figure (10% off that tier's standard total). Tier table
     displayed below the stepper so every step is visible without interaction. Headline
     for the section: "from $5.60 a week per device" (the real 2-device price) — never
     the 50+-device price, per ACCC misleading-price rules. Show all amounts with GST.
     Solo tradies (1 device) are steered to FSR walk-in repairs.
   - **Fleet Connect (PA-8) — coming-soon card:** static card between PA-2 and the
     services list. Copy: "Device + Care + SIM. One plan, one weekly fee. Coming soon."
     No pricing, no form, no capture, nothing wired.
   - **Services (PA-3..PA-7)** with the locked prices from §0, one line each, each
     individually cancellable after its 13-week minimum, discount tiers shown as a plain
     table (2→5.5% … 6→17.5%).
   - Hard parts on page one: minimum terms, upfront + weekly amounts, caps, call-out
     fee, "the phone stays ours".
2. **Fleet explainer section:** the tradie-boss story — employees break phones; every
   fleet device carries included repairs (capped free events, $60 flat past the cap) and
   a loaner when we can't fix it same day; the fleet stays Repeater's property under MDM.
   Keep it simple, few blocks, no invented statistics.
3. **Call-request field (UI-only)** on the pricing page and final CTA band per §0.
4. Update nav/footer copy from wholesale-parts-only to the 7-product Repeater. Keep the
   wholesale side intact — demoted, not deleted. Run every new string past the §0 voice
   rules; zero tolerance on insurance vocabulary and exclamation marks.
5. Read `public/privacy.html` for accuracy. No new page this pass collects personal
   information (the call-request field is client-side only and stores nothing), so the
   policy's substance must NOT be rewritten — only flag in the report if anything the
   new pages do contradicts what it says. The full privacy-policy rewrite is a separate
   contract-drafter deliverable, not this agent's job.

## 4. Admin panel (full build, `/admin`)

Reference implementation for structure/auth/styling: `../fivestarrepairs`'s admin
(`functions/api/admin/` — `_middleware.js`, `login.js`, `me.js`, `logout.js`, session
cookies). Port the pattern; rep stays dependency-free.

1. **New D1 migration** (next number after pull) creating:
   `companies` (id, name, contact_name, contact_mobile, email, notes, created_at),
   `employees` (id, company_id, name, role, mobile),
   `devices` (id, company_id?, employee_id?, model, imei, serial, status
   CHECK('in_stock','leased','on_plan','loaner_pool','in_repair','returned','retired'),
   condition, ownership CHECK('repeater','client'), mdm_enrolled INTEGER, enrolled_at,
   landed_cost, notes),
   `leases` (id, device_id, company_id, plan CHECK('phones_only','device_care'),
   dayone_amount, admin_fee_oneoff, admin_fee_plan_cap, recurring_fee,
   payment_plan CHECK('weekly','prepaid'),
   prepaid_total, start_date, term_months DEFAULT 24, ppsr_registration_number,
   ppsr_registered_at, ppsr_expiry, election_status
   CHECK('active','return','renew','holdover'), holdover_started_at, notes)
   — one lease row per device; plan fixed at signing (no separate care_plans table —
   care lives inside the device_care lease). phones_only (PA-1 v1.4): dayone_amount 572,
   admin_fee_oneoff 27.50 capped at admin_fee_plan_cap 110 per plan for the whole term,
   recurring_fee null, end-of-term election is return or renew (NO buyout — title never
   transfers), fleet-loss fee $300 on stolen/lost. device_care: dayone_amount 622,
   admin fee $27.50/device capped $110 per plan but COLLECTED WEEKLY (instalments across
   the term), recurring_fee per weekly care tier (5.60 base ladder), prepaid = 10% off
   the tier's standard total, return/renew only.
   `service_events` (id, lease_id?, device_id, event_type, fee_charged (0 included /
   60 over-cap), parts_cost, status CHECK('booked','in_progress','done','declined'),
   approved_by_client INTEGER, opened_at, resolved_at, notes)
   — the rolling 12-month paid-event count per device (fee_charged > 0) drives the
   4-paid-events limit warning and the quote-or-remove state.
   `callouts` (id, company_id, visit_date, fee_charged, within_20km INTEGER, notes)
   — rolling 12-month free-callout counter per company (first 2 free, then $19).
   `call_requests` (id, mobile, created_at, status CHECK('new','dialled','done'), notes)
   — the UI-only field's future landing spot; admin card shows the queue, no calling
   integration this pass.
   Indexes on company_id/device_id/status; CHECK constraints as listed.
2. **Auth:** session-cookie login for admin users (WebCrypto-hashed passwords, sessions
   table in D1, middleware guard on every `/api/admin/*` route and the `/admin` HTML).
   TOTP is a follow-up — stub route returning 501, never fake it.
3. **Sections** (server-rendered HTML, FSR-admin styling with §2 tokens):
   - **Dashboard:** active leases (weekly + prepaid), devices in field, service events
     this quarter vs cap per account, devices approaching the 4-paid-events limit,
     free call-outs used per company (rolling 12 months), PPSR registrations expiring
     within 90 days, lease end-of-term elections due within 60 days (return or renew —
     no buyout on either plan), recurring billing run list
     (weekly + monthly fees and services grouped by charge day).
   - **Companies:** CRUD + per-company employees, devices, leases, service events,
     call-outs.
   - **Devices:** inventory CRUD (model, IMEI, serial, ownership, status incl. loaner
     pool, MDM toggle, landed cost). Filters by status/ownership.
   - **Leases:** create lease from an in-stock device or "ordered on cleared funds"
     pending state. PA-1 (phones_only): $572 device + $50 establishment + one-off admin
     fee $27.50/device capped $110 per plan, no recurring. PA-2 (device_care): $622 day
     one, weekly fee per tier, prepaid flag ($1,075). PPSR fields for both. Record
     end-of-term election (return/renew/holdover — no buyout on either plan), early-exit
     view, repossession note, fleet-loss fee record on stolen/lost.
   - **Service events & call-outs:** event logging per device with fee ($0 included /
     $60 over-cap), cap tracker per account (2/quarter + 1 per 4 devices), over-cap
     events recorded with the paid-event counter and the 4-paid limit warning,
     quote-or-remove flow, call-out log with the free-2 countdown per company.
   - **Call requests:** queue table, status updates. No dialler.
   - **Reports:** events per month, parts cost per event (the $80 tripwire average),
     fleet composition, return vs renew ratio — plain tables.
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
