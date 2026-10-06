# PROMPT-6 — the shop-style rebuild (read docs/VOICE.md first)

You are running inside the `rep` repo (repeater.com.au, zero-build vanilla on
Cloudflare Pages; push to `main` IS the deploy). Execute this fully, in order.
Where this file and an older doc disagree, this file wins — but the canon
prices below may never be changed by you.

## 0. Sync and baseline

1. `git fetch origin && git pull --ff-only origin main`
2. `npm test` must be green before you start (it was: all suites, including
   the new `tests/ai-demo-call.test.mjs`). If not green, STOP and report.
3. Read, in this order: `docs/VOICE.md`, `docs/ui-example/README.md`,
   `docs/ui-example/index.html`, `docs/ui-example/phones.html`,
   `docs/ui-example/ai.html`, `docs/ui-example/assets/shop.css`,
   `docs/PLAN-repeater-umbrella.md` (business canon).

## 1. What this build is

A shop-style rebuild of the public site, in the CURRENT design system (do not
introduce new colours, fonts, frameworks or motion). The UI example under
`docs/ui-example/` is the layout reference. Three moves:

- **Home (`public/index.html`) becomes product-front-and-center.** Hero copy
  shrinks to eyebrow + one headline + one lede. The three products are the
  hero: three equal cards (`.products`/`.product`), each with its kind, name,
  real price, three feature bullets and ONE CTA:
  - Fleet phones — `$622` all-in per device, 24-month term → "See the phones"
  - AI call answering — `Quoted` to your call volume and setup → "Hear it live"
    (links to `/ai#demo-call`)
  - Repair Shop OS — `$49` from, per month, AUD GST-excl. → "See the OS"
  Trade supply stays one line under the cards ("runs behind all three").
  Keep the existing post-hero blocks that still earn their place (how it
  works, FAQ, CTA band) and rewrite their copy in the VOICE.md register.
- **`/phones` becomes a plan page, not prose.** Port the example's structure
  exactly: `.plans` with PA-1 / PA-2 side by side (PA-2 flagged "Care
  included", `.plan--pick`), day-one price as the headline, every cap as a
  scannable bullet, fine print under each card, PA-8 as a dashed strip, the
  "every cap and fee" table, FAQ. Keep the existing pricing-page stepper
  linked, don't duplicate it here.
- **`/ai` keeps its numpad.** The Jarvis demo call is LIVE
  (`POST /api/ai-demo-call`, `public/assets/numpad.js`). Do NOT change the
  endpoint, the `data-numpad*` attributes, or the fetch contract. Rewrite the
  words AROUND it (hero, three-things, who-it's-for, FAQ) to VOICE.md.

## 2. Wording rules (the core of this pass)

- Rewrite ALL public copy you touch in the VOICE.md register. The example's
  wording is a reference, not scripture — you may improve it, but only toward
  MORE plain, MORE factual, MORE understated. Structure and classes: copy
  closely; words: rewrite.
- Banned words/patterns in VOICE.md are hard-fail: grep your diff for them
  before committing (unlock|unleash|elevate|seamless|effortless|empower|
  delight|revolutionary|game-changer|cutting-edge|supercharge|world-class|
  best-in-class|next-level) case-insensitive across `public/**` — zero hits
  required. Also zero exclamation marks in `public/**`.
- Never invent a fact, price, term or testimonial. Unresolved owner facts keep
  the `[OWNER TO CONFIRM]` placeholder protocol (`tests/facts.test.mjs`).

## 3. Canon prices — never re-derive, never round

- Fleet Phones (PA-1): **$622 all-in per device on signing** = $572 device +
  $50 establishment + $27.50 fleet administration (one-off, capped $110 per
  plan); 24 months; no weekly fee; no buyout; $300 fleet loss fee.
- Managed Fleet (PA-2): **$622 per device, then from $5.60/wk per device**;
  repairs 2/quarter +1 per 4 devices, $0 each; $60 flat past cap; first 2
  call-outs free per 12 months then $19 within 20 km; loaner same visit;
  10% off for prepaid term; phones stay Repeater's property.
- PA-8 Fleet Connect: coming soon, not open.
- Repair Shop OS: Starter **from $49**, Business **from $149**, Enterprise
  **from $399** per month, AUD, GST-exclusive, free trial, no card to start.
- AI call answering: quoted per business. Never print a made-up figure.
- Minimum two devices; one phone plan per client; solo tradie → Five Star
  Repairs walk-in.

## 4. CSS

Move the rules from `docs/ui-example/assets/shop.css` into
`public/assets/site.css` behind a banner comment (`/* ---- Shop: product
cards ---- */` style, matching the file's existing banners), placed before the
responsive media block at the end. Keep the file's rule: all `@media` at the
end. `tests/tokens.test.mjs` must stay green (no new colours, no `color:` on
`--warn`).

## 5. Tests

- All suites must stay green (`npm test`). If you change pinned strings
  (e.g. `umbrella.test.mjs` pins hero/TAGLINE wording), update the TEST to the
  new strings deliberately and list every such change in your report — the
  pins follow the copy, never the reverse.
- Add `exclam` and `banned-words` assertions to `tests/chrome.test.mjs`
  following its existing pattern (walk `public/**`).
- `node --check` every JS file you touch.

## 6. Boundaries — do not touch

- `functions/api/ai-demo-call.js`, `public/assets/numpad.js` contract,
  `functions/api/shop-os/*`, `functions/api/_revolut.js`, webhooks, auth.
- Migrations: do NOT create any. If a migration is needed, report it instead.
- Aphelion/FSR tables; the `call_requests` table already exists (004).
- The themer panel and the site's token block.

## 7. Finish

All suites green → commit → push `main` → verify with curl:
`https://repeater.com.au/` (200, contains `product__name`),
`/phones/` (200, contains `plan--pick`),
`/ai/` (200, still contains `numpad__key` and `demo-call`).
Report: what changed / what is verified vs unverified / any test-pin changes
you made / anything you flagged rather than did.
