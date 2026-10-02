# Agent Prompt — Repeater site, full autonomous build

Copy-paste for the coding agent (Claude Code / Codex CLI / OpenCode). Run from the repo
root with the CLI command at the bottom. Open-ended time budget: work the whole scope,
fix forward through failures, push to `main` in verified chunks.

**Read `docs/PLAN-repeater-site.md` first — this prompt is the run order, that file is
the spec. Where they disagree, the spec wins and you say so in the report.**

```
You are working as a long-running autonomous engineer on `rep` — the public marketing
site for REPEATER, the B2B wholesale arm of Aphileon LTD (repeater.com.au). It is the
third site in a family: `aphelion` (owner control centre, aphelion.ltd/admin) and
`fivestarrepairs` (retail, fivestarrepairs.com.au) are sibling repos at
C:\Users\admin\Documents\ai\gemini\{aphelion,fivestarrepairs}. READ THEM. They are the
style guide, and several files get ported verbatim.

Stack: Cloudflare Pages + Pages Functions + D1 + R2. NO build step, NO framework, NO npm
runtime dependency, NO linter, NO transpiler. Static HTML in `public/`, one shared
stylesheet `public/assets/site.css`, classic IIFE scripts in `public/assets/*.js`,
handlers in `functions/api/*.js` (files prefixed `_` are helpers, not routes).

Design: a fusion of two Framer templates — BUSINITY (business/agency: restraint, one
accent, hairline rules, editorial type, eyebrow→headline→lede rhythm) and APPNEXT
(SaaS: modular block catalogue, category chips, attributed stat cards, dark final-CTA
band, Product/Company/Connect footer). LIGHT-FIRST, not dark. Leo's instruction:
"simplicity, but the professionalism of Businity." When a choice exists, take the
simpler one. Full token values, block catalogue and page map are in the PLAN.

HARD RULES (violating any of these is a catastrophic failure):

- NEVER INVENT BUSINESS FACTS. Testimonials, client logos and headline figures come from
  `GET /api/proof` and the block is REMOVED from the DOM when its list is empty —
  aphelion's migration 028 states the doctrine: "the site never invents a testimonial,
  and never shows an unfinished placeholder either." Prices, ABN, phone, address,
  dispatch SLAs and trade tiers live in `public/assets/facts.js` as
  "[OWNER TO CONFIRM]" until Leo supplies them, rendered visibly muted. Catalogue rows
  come from DB_REPEATER, never from markup; empty → an honest empty state, not six fake
  products. Only orders@repeater.com.au and fleet@repeater.com.au are evidenced.
  An ABN on an Australian B2B site is a legal requirement — do not guess one.

- CONTRAST IS NON-NEGOTIABLE (all ratios computed, PLAN §2.1). `--accent` #4f8cff is
  3.22:1 on white: fills, display type >=24px, icon strokes, focus rings — NEVER small
  text. `--accent-strong` #2f6fe0 is 4.70:1: links, small accent text, and the
  `.btn--accent` fill with white text. `--fg-3` is #767676 (4.54:1) — NOT AppNext's
  #8c8c8c, which is only 3.36:1. `--warn` #e3b324 is 1.96:1 and FAILS at every size:
  fills and icons only, never a `color:` value; its text variant is `--warn-strong`
  #7a5c00 (6.25:1). Same split for --ok/--ok-strong and --danger/--danger-strong.
  `tests/tokens.test.mjs` recomputes all of these from the parsed :root and fails on drift.

- NO RETIRED COLOURS. Businity's lime (#c4f666, #b3db6a, #b3db69, #00ff86), FSR's gold
  family (#f5b301, #ffc633, #d99e00, #ffd873), aphelion's violet/teal (#7c6cff, #35e0d0)
  must not appear anywhere in `public/`. Copy aphelion's RETIRED_COLOURS regex test.

- NO THIRD-PARTY CDN. Fonts are self-hosted woff2 (4 files: jost + inter, latin and
  latin-ext). No Google Fonts link, no icon font, no emoji icons — inline SVG path data
  only. aphelion's privacy page promises this in writing.

- SCHEMA OWNERSHIP. The `repeater` D1 already contains FSR's `schema.sql` plus aphelion's
  `007_b2b_wholesale.sql` (trade_accounts, price_lists, price_breaks, cost_plus_rules,
  negotiated_prices, wholesale_quotes, wholesale_quote_items, orders.channel). DO NOT
  recreate, alter or drop any of those. `rep/schema.sql` holds ONLY the site's own new
  tables (start with `site_posts`), all `IF NOT EXISTS`; migrations start at 002 (FSR
  convention, no 001). Never write to DB_APHELION except the `leads` insert via the
  ported `/api/enquiry` and the `rate_limits` helper.

- MIGRATION NUMBERS: `git fetch` in BOTH sibling repos before picking a number. Leo runs
  several agent sessions in parallel and each picks "the next" number from a stale view —
  this has already caused a collision (FSR 068 was taken mid-work and became 070).

- NEVER expose cost_plus_rules, negotiated_prices, or another account's pricing in a
  public response. Public catalogue shows quantity breaks only, GST-exclusive.

- HOUSE CODE STYLE. Public JS: classic script, IIFE, "use strict", var/function (not
  const/arrow), own $/$$ helpers, promise chains not async, boot via
  readyState check, `if (location.protocol === "file:") return;` guard. Every form is a
  REAL `<form method="post" action="/api/enquiry">` that works with JS disabled — the
  endpoint accepts form-encoded bodies for exactly this reason. `esc()` every
  interpolated value. Wide tables always inside a `.table-wrap` overflow container.
  `Intl.NumberFormat("en-AU",{currency:"AUD"})` for money, Australia/Melbourne for dates.
  Headings get `text-wrap:balance`; body copy `max-width:60ch`.

- DOCTRINE (verbatim from FSR's CLAUDE.md, put it in rep/CLAUDE.md too):
  "Auth fails closed. Everything else degrades gracefully." A missing D1 binding, R2
  bucket or secret must never break the customer flow — degrade to an empty state or a
  hidden block, never a 500.

- Read files fully before editing. Verify claims against actual code, not comments,
  docs or this prompt. If the PLAN cites a file that doesn't exist, say so in the report
  rather than inventing it.

MODE — AUTONOMOUS LONG RUN:
- Do NOT stop at the first difficulty. Fix forward: diagnose, repair, retest, continue.
- Only stop outright when (a) a gate fails and you have exhausted reasonable fixes,
  (b) production is broken after a push, or (c) a task needs a business decision or a
  secret you don't have — then DEFER it, record it in the report, and carry on.
- Keep `docs/WORKLOG-<date>.md` current: per phase, what you built, gates run, what you
  deferred and why. Commit it with each push so the run is resumable if the CLI dies.
- After EACH task group: `npm test` AND `node tests/imports.test.mjs` green → commit →
  `git fetch origin` → push `main` → verify. Each push is one coherent chunk. Never
  force-push. Stage only files belonging to the change — another session may have
  uncommitted work.

────────────────────────────────────────────────────────────
TASK 0 — Already done. Read this, don't redo it.
────────────────────────────────────────────────────────────
Repo root == git root == C:\Users\admin\Documents\ai\gemini\rep. The double-nesting is
resolved (`.git` moved up, inner folder removed, `.gitignore` added). Commit 1ab044c.

FOUR DECISIONS LEO HAS ALREADY MADE — do not re-ask, do not re-litigate:
 1. Repo nesting: RESOLVED as above. All paths in this prompt are repo-root relative.
 2. API wiring: SAME-ORIGIN PORTS. Port aphelion's proof.js + enquiry.js into rep and
    bind DB_APHELION by database_id. Do NOT call https://aphelion.ltd/api/* cross-origin.
 3. Catalogue: DB_REPEATER.products is NOT populated. `/catalogue` ships the empty state
    as its normal, primary design — not as a degraded fallback. Build the grid, the
    `.breaks` table and catalogue.js fully; they just have no rows.
 4. Launch: bind repeater.com.au — AUTHORISED but GATED. See Task 8. Deploy to the
    *.pages.dev preview first and never bind the domain while an "[OWNER TO CONFIRM]"
    placeholder remains. Do not weaken facts.test.mjs to make a deploy go through.

Also settled earlier: subject = Repeater B2B wholesale; stack = zero-build vanilla
(Astro and Next.js both rejected); look = LIGHT-FIRST with dark accents (deliberately
not the dark canvas either reference uses); scope = full multi-page.

Start at Task 1.

────────────────────────────────────────────────────────────
TASK 1 — Phase 0: skeleton + tokens
────────────────────────────────────────────────────────────
`.gitignore` ALREADY EXISTS (copied from aphelion, carries the `.qwen/` line) — leave it
unless something needs adding. Create `package.json`
(type:module, private, scripts dev/test, NO devDependencies — qrcode isn't needed),
`wrangler.toml` (PLAN §6.1, verbatim, three bindings + commented optional ones),
`README.md` (house section order: intro → ## Layout as an ASCII tree with `←` arrows →
## Databases → ## Run locally → ## Deploy → ### Remote migrations), `CLAUDE.md` (FSR's
shape: What this is / Commands / ### Routing / ### Fail-closed auth, fail-open features /
### Database), `schema.sql`, empty `public/ functions/ tests/ migrations/ docs/`.
Then `public/assets/site.css`: the COMPLETE `:root` token block from PLAN §2 (colours,
type, space, radii, shadows, motion), the base reset and shell primitives copied from
aphelion's site.css, `@font-face` for the four self-hosted woff2, section banner
comments, and ALL `@media` collected at the END (desktop-first max-width: 1199 / 809 /
559, plus hover:none and prefers-reduced-motion).
Write `tests/tokens.test.mjs` FIRST (contrast ratios, RETIRED_COLOURS, brace balance).
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 2 — Phase 1: chrome + all 12 HTML shells
────────────────────────────────────────────────────────────
Blocks `.nav` `.foot` `.cta` `.head` `.btn` `.wrap` `.sec` per PLAN §3, then all 12
pages stubbed with correct `<head>`: lang="en-AU", unique title + description, canonical,
OG + twitter (INCLUDING og:image — FSR has one, aphelion doesn't; we do), theme-color,
favicon.svg, font preloads, JSON-LD (Organization on /, WholesaleStore + FAQPage where
relevant). Chrome is COPY-PASTED into every page — there are no includes in this house.
`public/_headers` and `public/_redirects` in FSR's two-space-indented format (enumerate
each JS/CSS file for must-revalidate; HTML always revalidate; assets immutable),
`robots.txt`, `404.html`, `public/assets/site.js` (nav is-stuck, burger, reveal
observer, counters, marquee, accordion, bars — PLAN §8, five motions, all killed by
prefers-reduced-motion), `public/assets/facts.js` (window.REPEATER, PLAN §5b),
`favicon.svg`, `logo.svg`.
Write `tests/chrome.test.mjs` + `tests/facts.test.mjs` + `tests/site.test.mjs`.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 3 — Phase 2: the home page
────────────────────────────────────────────────────────────
`public/index.html` with all 16 home blocks in PLAN §4's order. Placeholder visuals are
CSS/SVG-drawn ONLY — `.show` is a fake trade dashboard built from divs (AppNext draws
its studio dashboard the same way), `.team` uses monogram tiles until Leo supplies
photography. No stock photos, no hot-linked framerusercontent assets.
Verify by hand at 1440 / 1199 / 809 / 559 and with a coarse pointer; verify
prefers-reduced-motion leaves the page fully readable and static. The page must look
COMPLETE with proof and catalogue both empty — check that explicitly.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 4 — Phase 3: proof + facts wiring
────────────────────────────────────────────────────────────
Port `aphelion/functions/api/proof.js` to `rep/functions/api/proof.js` VERBATIM (it
imports ./admin/_proof.js for LIST_MAX + shapePublic — port that helper too, or inline
the two functions and note it). Port `public/assets/references.js` to
`public/assets/proof.js`, extended to fill `.marquee` (logos), `.stats` (figures with
attribution), `.bars` (figures as percentages) and `.proof` (quotes) — each block
REMOVED from the DOM when its list is empty. `cache-control:public,max-age=60`.
Write `tests/contract.test.mjs` asserting the response shape matches aphelion's
field-for-field, and that an unbound/absent DB_APHELION yields `{ok:true,quotes:[],
figures:[],logos:[]}` — never a throw.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 5 — Phase 4: catalogue, wholesale, pricing
────────────────────────────────────────────────────────────
`functions/api/catalogue.js` reading `products` + `price_breaks` from DB_REPEATER →
`{ok,categories[],products[]}`, GST-exclusive, quantity breaks only. Degrade to
`{ok:true,categories:[],products:[]}` when unbound. `public/assets/catalogue.js` renders
the grid and the `.breaks` table.
LEO HAS CONFIRMED `products` IS EMPTY — so the empty state is the page's normal design,
not an error path: "Trade pricing is released to approved accounts — apply and we'll
send your price list" with a `.btn--accent` to `/apply`. Build the populated rendering
too and test it with seeded rows in `tests/catalogue.test.mjs`, so the page starts
working the moment Leo loads products. Don't apologise for the empty state in the copy —
for B2B wholesale, gated pricing is a feature.
Build `/catalogue`, `/wholesale` (the `.steps` explainer: apply → price list → order →
terms, plus the GST-exclusive and Net 7/14/30/60 facts, which ARE evidenced from
007_b2b_wholesale.sql), and `/pricing` (`.tiers` — tier NAMES and entitlements are
"[OWNER TO CONFIRM]", so render the block with muted placeholders rather than invented
prices).
Write `tests/catalogue.test.mjs`: negotiated_prices and cost_plus_rules must never
appear in a public response; unbound DB → empty, not 500.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 6 — Phase 5: about, contact, apply + enquiry
────────────────────────────────────────────────────────────
Port `aphelion/functions/api/enquiry.js` VERBATIM plus its `_ratelimit.js`, `_alert.js`
and `melbourneDay` from `./admin/_traffic.js`. Keep every behaviour: JSON OR
form-encoded/multipart body, the `company` honeypot returning `{ok:true,stored:false}`,
5-per-600s rate limit, the SHA-256 ip+UA+day hash (NEVER the raw IP), 400 on missing
name / missing email-and-phone / bad email, 503 ONLY when both insert and alert fail.
Alerting degrades gracefully if PUSHOVER_TOKEN/USER aren't set — the lead still stores.
Client sends interest:"wholesale", business_slug:"repeater", source:"<page>:<block>".
Build `/about` (story, `.bars`, `.team` monogram tiles, `.case`, `.proof`), `/contact`
(qform + details from facts.js), `/apply` (the trade application: business name, ABN,
contact, phone, email, monthly volume, message — maps onto the `leads` columns, NOT onto
`trade_accounts`; creating a trade account stays an owner action in aphelion's Wholesale
tab, which is where credit_limit and terms_days are set).
Extend `tests/contract.test.mjs`: both content types, honeypot, all four error paths,
429 on the 6th hit, and an assertion that no raw IP is ever written.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 7 — Phase 6: blog, sitemap, beacon
────────────────────────────────────────────────────────────
`schema.sql` + `migrations/002_site_posts.sql` (PLAN §6.3). `public/blog/index.html`
lists published posts; `functions/blog/[slug].js` SHADOWS a static article template and
injects the post — FSR's `functions/blog/[slug].js` is the model. Draft or missing slug
→ 404, never a leak of draft content. `functions/sitemap.xml.js` (literal dotted
filename) listing every route that actually exists. `public/_redirects` for any aliases.
`functions/_middleware.js` injecting
`<script defer data-b="repeater" src="https://aphelion.ltd/t.js"></script>` before
`</head>` on every text/html response — idempotent (`if (!html.includes("/t.js"))`),
path-gated, and always rebuilding the Response because the body was consumed. Copy FSR's
`functions/_middleware.js`.
`node tests/imports.test.mjs` must report 0 failures — it exists because one unresolved
named import silently kills every route in a file.
Gates green → commit → push.

────────────────────────────────────────────────────────────
TASK 8 — Phase 7: deploy, then the GATED domain bind
────────────────────────────────────────────────────────────
8a — DEPLOY TO PREVIEW (agent may do this if wrangler is authenticated):
 Create the Pages project, blank build command, output dir `public`. Bind
 DB_APHELION (3f6d51f8-7b13-437b-aedb-5af019b62901), DB_REPEATER
 (60bf7791-8963-4b10-870a-16194e4be0f3), MEDIA_FSR (fivestarrepairs-media).
 Set SESSION_SECRET byte-identical to aphelion's, or the shared fsr_session cookie
 won't cross-verify. Ship to the unlisted *.pages.dev URL and give Leo that URL — he
 judges design visually and may only read your last message.
 If wrangler isn't logged in, write docs/SETUP-deploy.md with the exact commands and
 hand it over instead of guessing at credentials.

8b — BIND repeater.com.au: AUTHORISED, BUT DO NOT DO IT YET.
 Leo chose "bind now" over the unlisted preview. That collides with the content rule:
 an Australian B2B site must display its ABN, and facts.test.mjs fails if any
 "[OWNER TO CONFIRM]" placeholder is live on a custom domain. The gate is real.
   1. Ask Leo for the ABN, trade phone, address and dispatch SLA.
   2. Fill public/assets/facts.js, confirm facts.test.mjs passes with zero placeholders.
   3. ONLY THEN bind the domain (Pages → Custom domains).
 NEVER delete, skip or relax facts.test.mjs to get a green run. If Leo says bind anyway
 without an ABN, stop and put it to him explicitly as a legal-exposure decision — that
 is his informed call, not something to ship quietly.

8c — APHELION-SIDE REGISTRY (MUTATES LIVE PRODUCTION — PREPARE, DON'T EXECUTE):
 Write these into docs/SETUP-deploy.md and stop. Do not run them without a go-ahead:
   - Set the registry row's `site_url` to https://repeater.com.au. Without it the
     traffic beacon silently 204s, because /api/t echoes an Origin only on an exact
     site_url match and never `*`.
   - PATCH (never POST) the five 010_business_branding fields. Skipping this leaves
     repeater inheriting DEFAULT_BRANDING — FSR's name, from-address and `fsr-` bounce
     prefix — which is its current state. Suggest from_email
     "Repeater <orders@repeater.com.au>", bounce_prefix "repeater-".
   - The `status` flip to 'live' returns 409 needsProvisioning until the binding exists
     in env — aphelion's runbook says "that guard is intentional, don't remove it."

Verify after deploy: `/` → 200, `/api/proof` → 200 with ok:true, `/api/enquiry` GET →
405 with allow:POST, an unknown path → 404.html, `/sitemap.xml` → 200.

────────────────────────────────────────────────────────────
FINAL REPORT (end of run)
────────────────────────────────────────────────────────────
1. Every task group: what shipped, push SHA, verification result.
2. Gate results after the LAST push (npm test count, imports test count, curl statuses).
3. Every remaining "[OWNER TO CONFIRM]" placeholder, and exactly which decision unblocks it.
4. Deferred items and the business decision / credential each needs.
5. Any migration created, its number, the `git fetch` that confirmed the number was free,
   and confirmation it's in schema.sql + README §Remote migrations.
6. Anything in the PLAN you chose NOT to do, and why.
7. The exact URL to open, and what to look at first. Leo may only read this last message.

If you hit a hard blocker: leave docs/WORKLOG-<date>.md current, revert nothing that is
green, and end with a report — but try every reasonable path first.
```

## Launch commands

Run from the repo root, working tree clean, after `git fetch origin`.

**Claude Code:**
```bash
cd /c/Users/admin/Documents/ai/gemini/rep && git status --short && git fetch origin
claude -p "$(cat docs/AGENT-PROMPT-full-build.md)" --dangerously-skip-permissions --max-turns 2000
```

**Codex CLI:**
```bash
cd /c/Users/admin/Documents/ai/gemini/rep && git status --short && git fetch origin
codex exec --full-auto "$(cat docs/AGENT-PROMPT-full-build.md)"
```

**OpenCode:**
```bash
cd /c/Users/admin/Documents/ai/gemini/rep && git status --short && git fetch origin
opencode run "$(cat docs/AGENT-PROMPT-full-build.md)"
```

> If a command shows an output budget or model-call cap, raise it to the max — this job
> runs until the phases are done, not to a turn count. If the CLI dies mid-run, re-run
> the same command: the prompt is idempotent, `docs/WORKLOG-<date>.md` says where it got
> to, and everything committed is already verified.
