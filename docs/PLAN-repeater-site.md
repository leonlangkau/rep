# PLAN — `rep` → repeater.com.au marketing site

> **Written 2026-10-02, revised the same day after Leo's four decisions** (see §12).
> Written against `aphelion` `main` (migrations to `028_site_proof.sql`) and
> `fivestarrepairs` `main` (migrations to `076_visitor_events.sql`).
> Remote `https://github.com/leonlangkau/rep`; repo root == git root == this folder.
>
> ⚠ **Read `PLAN-repeater-umbrella.md` first.** On 2026-10-03 Leo described the actual
> offering — fleet phones for tradies with repairs included, AI call answering, and the
> Repair Shop OS — so the wholesale-only positioning below is superseded as *business
> framing*. This file still owns the **craft**: the design system (§2), the block
> catalogue (§3), the content-honesty rules (§5), the API contracts (§6) and the test
> strategy (§9). Where the two disagree about what the business sells, the umbrella plan
> wins; where they disagree about how to build it, this one does.
>
> Read this whole file before writing code. `docs/AGENT-PROMPT-full-build.md` is the
> copy-paste run brief; this file is the spec it points at. **Where they disagree, this
> file wins** — and say so in your report.

---

## 0. What this is

The public marketing site for **Repeater**, the B2B wholesale arm of Aphileon LTD
(`repeater.com.au`, registry slug `repeater`, `kind='b2b'`, brand `#4f8cff`, D1
`repeater` / binding `DB_REPEATER`, R2 shared as `MEDIA_FSR`).

Visually it fuses two Framer templates:

| Reference | What we take | What we leave |
|---|---|---|
| **[Businity](https://businity.framer.website/)** (NFrame, business/agency) | The **professionalism**: restraint, one accent, hairline rules, generous whitespace, editorial type, eyebrow→headline→lede rhythm, progress-bar stats, 3-tier pricing, case study, team, FAQ, blog teaser | The near-black `#151515` canvas and the lime `#c4f666` accent — we go light-first with Repeater blue |
| **[AppNext](https://appnext.framer.website/)** (Naveed Shah, SaaS/app) | The **modularity + conversion structure**: reusable block catalogue, category-chip row, attributed stat-card grid, product-showcase cards, dark final-CTA band, `Product / Company / Connect` footer, its genuinely light tokens (`#f4f4f4`, `#fff`, `#121212`, `#606060`), its soft shadow language | The phone-mockup hero, App Store badges, and the studio-booking subject matter |

**Governing instruction from Leo:** *simplicity, with the professionalism of Businity.*
When a choice is available, take the simpler one. Fewer tokens, fewer blocks, fewer
animations, fewer dependencies. Nothing in this plan needs a build step.

Stack: **zero-build vanilla HTML/CSS/JS on Cloudflare Pages** — identical to
`aphelion` and `fivestarrepairs`. No framework, no npm runtime dependency, no
linter, no transpiler. Pages Functions for the three API endpoints.

---

## 1. ✅ Task 0 — repo nesting: RESOLVED 2026-10-02

**Git root == project root == `C:\Users\admin\Documents\ai\gemini\rep`.** Leo chose to
move `.git` up one level rather than build inside a nested `rep\rep\`. Done and verified:

- `git rev-parse --show-toplevel` → `C:/Users/admin/Documents/ai/gemini/rep`
- commit `1ab044c` intact, `main` in sync with `origin/main`, tree clean
- the empty inner `rep\` folder removed
- `.gitignore` added (copied from aphelion — it carries the `.qwen/` line, which matters
  now that `.qwen` sits inside the repo root)

⚠ **Gotcha for the future:** `move rep\.git .git` **fails in cmd.exe** with
*"The system cannot find the file specified"* — cmd does not handle dot-prefixed
directories as move targets. It failed cleanly (nothing moved, nothing broken), but use:

```powershell
Move-Item -LiteralPath '<src>\.git' -Destination '<dst>\.git'
```

Nothing else in this plan is affected by the move. All paths below are relative to the
repo root.

---

## 2. Design tokens — the single source of truth

One stylesheet: `public/assets/site.css`. `:root` tokens at the top, then base, then
component sections behind banner comments, then **all `@media` at the end** (aphelion's
`site.css` organisation). Aphelion's header comment is the rule to copy:

> *"Pages inline only what is unique to them; everything shared lives here. Its `:root`
> tokens are the single place to change the palette."*

### 2.1 Colour (light-first)

```css
:root{
  /* ---- Surfaces ---- */
  --bg:#ffffff;
  --bg-sunken:#f4f4f4;          /* AppNext token, used 8x */
  --bg-raised:#fafafa;
  --band:#121212;               /* the dark CTA band — AppNext ink */
  --band-fg:#ffffff;
  --band-fg-2:rgba(255,255,255,.62);
  --band-line:rgba(255,255,255,.14);

  /* ---- Ink ---- */
  --fg:#121212;                 /* AppNext ink */
  --fg-2:#606060;               /* AppNext muted (101 uses) */
  --fg-3:#767676;               /* lightest grey still AA on white */
  --fg-on-accent:#ffffff;

  /* ---- Lines ---- */
  --line:#e6e6e6;
  --line-2:#eeeeee;             /* AppNext */
  --line-strong:#d4d4d4;

  /* ---- Brand: Repeater blue ---- */
  --accent:#4f8cff;             /* registry colour — decorative only, see table */
  --accent-strong:#2f6fe0;      /* the readable one */
  --accent-pressed:#2559b8;
  --accent-soft:rgba(79,140,255,.10);
  --accent-ring:rgba(79,140,255,.35);

  /* ---- Status (AppNext's four) — the -strong variants are the only ones
       legal as TEXT on white; the base hues are fills, icons and dots ---- */
  --ok:#1bab49;            --ok-strong:#157f37;
  --warn:#e3b324;          --warn-strong:#7a5c00;
  --danger:#e03800;        --danger-strong:#b32d00;
  --info:#40c6ff;          /* decorative only — no text-safe variant needed */

  /* ---- Focus / selection ---- */
  --ring:0 0 0 3px var(--accent-ring);
}
::selection{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent-strong);outline-offset:3px}
```

**The accessibility rule — do not get this wrong.** All ratios below were **computed
2026-10-02** with the WCAG 2.x relative-luminance formula, not eyeballed:

| Token | On `#fff` | Grade | Permitted use |
|---|---|---|---|
| `--fg` `#121212` | **18.73 : 1** | AAA | all body copy, headings |
| `--fg-2` `#606060` | **6.29 : 1** | AA | ledes, secondary copy, muted labels |
| `--fg-3` `#767676` | **4.54 : 1** | AA | captions, table meta, disabled-looking text. *(AppNext's own muted grey `#8c8c8c` is only 3.36:1 — that is why we use `#767676`.)* |
| `--accent` `#4f8cff` | **3.22 : 1** | AA-large **only** | fills behind white/ink, display type ≥24px, icon strokes, focus rings, chart lines, glows. **Never small text.** |
| `--accent-strong` `#2f6fe0` | **4.70 : 1** | AA | links, small accent text, the `.btn--accent` fill with white text |
| `--accent-pressed` `#2559b8` | **6.56 : 1** | AA | hover/active on accent fills |
| `--ok` `#1bab49` | 3.01 : 1 | AA-large | dots, icons, badges — text uses `--ok-strong` `#157f37` (**5.09 : 1**) |
| `--warn` `#e3b324` | **1.96 : 1** | **FAIL** | fills and icons **only**. Never text at any size. Text uses `--warn-strong` `#7a5c00` (**6.25 : 1**). Ink `#121212` on a warn fill is 9.58 : 1. |
| `--danger` `#e03800` | 4.43 : 1 | AA-large | text uses `--danger-strong` `#b32d00` (**6.38 : 1**) |

On `--bg-sunken` `#f4f4f4`: `--fg` is 17.03 : 1, `--fg-2` is 5.72 : 1 — both still AA.

So: **`.btn--accent` uses `--accent-strong` with white text (4.70:1 ✓ AA)**, never
`--accent` with white text (3.22:1 ✗ for normal text). `--accent` is the decorative
brand colour; `--accent-strong` is the readable one. `tests/tokens.test.mjs` recomputes
every number in this table from the parsed `:root` block and fails on drift.

**No lime, no gold, no violet.** Businity's `#c4f666`/`#b3db6a` and FSR's `#f5b301`
family must not appear. Aphelion has a precedent test for exactly this — a
`RETIRED_COLOURS` regex in `tests/site-root.test.mjs`. Copy that pattern:

```js
const RETIRED_COLOURS = /#c4f666|#b3db6a|#b3db69|#00ff86|#f5b301|#ffc633|#d99e00|#ffd873|#7c6cff|#35e0d0/i;
```
Assert it matches nothing in `public/**`. Separately assert `--warn` never appears in a
`color:` declaration — only `background`, `border`, `fill` and `box-shadow`.

### 2.2 Type

Two families, **self-hosted woff2**. Neither sibling repo uses a Google Fonts CDN, and
aphelion's privacy policy makes it a promise: *"We self-host our assets rather than
pulling them from third-party services, so your visit isn't shared with a font or script
network."*

- **Display — `Jost`** (Businity's face: geometric, elegant, unmistakably
  professional). Weights **500, 600**. Latin + latin-ext, `font-display:swap`.
- **Body/UI — `Inter`** (common to *both* references). Weights **400, 500, 600**.
- **Mono — system stack**, for `.eyebrow` only (aphelion's `.lbl` convention).

Four woff2 files in `public/assets/fonts/`, `@font-face` at the top of `site.css`
(copy FSR's `styles.css:17-49` shape, including explicit `unicode-range`), and
`<link rel="preload" as="font" type="font/woff2" crossorigin>` for the two latin files.
Download them from Google Fonts' own repo rather than hot-linking.

```css
--font-display:"Jost", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-sans:"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
--font-mono:ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

Scale as **fluid clamps at point of use** (aphelion's convention — no `--text-*` ladder).
Derived from the union of both references' measured sizes (88/70/64/56/48 AppNext 120/90/64/58/42):

| Role | Size | Line-height | Tracking | Weight | Face |
|---|---|---|---|---|---|
| `.display` (hero h1) | `clamp(2.75rem, 7.2vw, 5.5rem)` → 44–88px | `1.02` | `-0.042em` | 600 | Jost |
| `h1` (page) | `clamp(2.25rem, 5.2vw, 4rem)` → 36–64px | `1.06` | `-0.036em` | 600 | Jost |
| `h2` (section) | `clamp(1.75rem, 3.6vw, 2.75rem)` → 28–44px | `1.14` | `-0.030em` | 600 | Jost |
| `h3` (card) | `clamp(1.25rem, 2vw, 1.625rem)` → 20–26px | `1.25` | `-0.020em` | 600 | Jost |
| `h4` | `1.125rem` (18px) | `1.35` | `-0.01em` | 600 | Inter |
| `.lede` | `clamp(1.0625rem, 1.4vw, 1.1875rem)` → 17–19px | `1.55` | `-0.01em` | 400 | Inter |
| body | `1rem` (16px) | `1.68` | `-0.01em` | 400 | Inter |
| `.sm` | `0.875rem` (14px) | `1.5` | `0` | 400/500 | Inter |
| `.eyebrow` | `0.6875rem` (11px) | `1.2` | **`+0.14em`** | 600 | **mono, uppercase** |
| `.stat__fig` | `clamp(2rem, 4.4vw, 3.5rem)` → 32–56px | `1` | `-0.03em` | 600 | Jost |

`19px` is AppNext's most-used size (10×) — that is the `.lede`. `1.68` body line-height
is aphelion's. `text-wrap:balance` on every heading; `max-width:60ch` on body copy,
`26ch` on headings. `font-variant-numeric:tabular-nums` on all money and stat figures.

Weights used: **400 / 500 / 600 only.** Neither reference uses 700 on the public site
(AppNext tops out at 500, Businity at 700 but only for the logo). Restraint is the point.

### 2.3 Space, radii, shadows, motion

```css
/* Spacing — FSR's ladder, verbatim */
--space-1:4px;  --space-2:8px;   --space-3:12px;  --space-4:16px;
--space-5:20px; --space-6:24px;  --space-8:32px;  --space-10:40px;
--space-12:48px;--space-16:64px; --space-20:80px; --space-24:96px;

/* Section rhythm — aphelion's .sec */
--section:clamp(56px, 8vw, 104px);

/* Layout */
--maxw:1180px;  --maxw-narrow:760px;  --gutter:24px;  --nav-h:72px;

/* Radii: Businity's tightness, AppNext's cards */
--r-xs:6px; --r-sm:10px; --r-md:16px; --r-lg:24px; --r-pill:999px; --r-full:50%;

/* Shadows — measured off both references */
--shadow-xs:0 1px 11px rgba(0,0,0,.10);                                    /* AppNext */
--shadow-sm:0 4px 12px rgba(18,18,18,.06);                                 /* Businity 4px 4px 12px */
--shadow-md:0 1px 2px rgba(18,18,18,.05), 0 8px 20px rgba(18,18,18,.07);   /* AppNext layered */
--shadow-lg:0 40px 40px rgba(0,0,0,.10);                                   /* AppNext, verbatim */
--shadow-glow:0 0 20px rgba(79,140,255,.28);                               /* AppNext 168,209,255 → brand */

/* Motion */
--ease-out:cubic-bezier(.32,.72,.2,1);
--dur-fast:.15s; --dur-base:.25s; --dur-slow:.5s;
```

Base reset — copy aphelion's verbatim (`box-sizing:border-box` on `*`,
`-webkit-text-size-adjust:100%`, `scroll-behavior:smooth` gated behind
`prefers-reduced-motion:no-preference`, `margin:0` on `h1-h4`/`p`,
`list-style:none` + `padding:0` on `ul`, `overflow-x:hidden` on `body`,
`border-collapse:collapse` + `width:100%` on `table`).

Shell primitives, also from aphelion:
```css
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding:0 var(--gutter)}
.sec{padding:var(--section) 0}
.rule{height:1px;background:var(--line-2);border:0;margin:0}
```

### 2.4 Breakpoints

Desktop-first `max-width`, matching both references *and* the house:

| Query | What changes |
|---|---|
| `@media (max-width:1199px)` | AppNext's desktop→tablet. 4-col grids → 2-col, hero visual shrinks |
| `@media (max-width:809px)` | **Framer's tablet→phone — both templates use exactly this value.** Nav → burger, every grid → 1 col, `.display` bottoms out |
| `@media (max-width:559px)` | Tighten `--gutter` to 20px, stack the stat grid, hide `.eyebrow` rules |
| `@media (hover:none),(pointer:coarse)` | **≥44px touch targets**; inputs stay **16px** to avoid iOS zoom-on-focus (aphelion admin rule) |
| `@media (prefers-reduced-motion:reduce)` | aphelion's verbatim kill-switch: `animation-duration:.001ms!important;transition-duration:.001ms!important` on `*,*::before,*::after` |

No CSS nesting, no `@layer`, no preprocessor, no reliance on `:has()`.

---

## 3. Block catalogue — the "modular sections"

AppNext advertises *"25+ reusable modular sections"*. In a zero-build vanilla repo with
no includes, modularity means **a documented block vocabulary + identical class names +
a parity test** — not components. House precedent: FSR copy-pastes `<nav>`/`<footer>`
into every page; aphelion pins them with `tests/site-root.test.mjs`.

Naming is **BEM-ish kebab with a per-block prefix** (house rule). All blocks share:

```css
.sec--sunken{background:var(--bg-sunken)}
.sec--band{background:var(--band);color:var(--band-fg)}
.head{max-width:60ch;margin-bottom:var(--space-12)}
.head--center{margin-inline:auto;text-align:center}
.head__eyebrow{ /* .eyebrow */ }
.head__title{ /* h2 */ }
.head__lede{ /* .lede, --fg-2 */ }
.grid{display:grid;gap:var(--space-6)}
.grid--2{grid-template-columns:repeat(2,1fr)}
.grid--3{grid-template-columns:repeat(3,1fr)}
.grid--4{grid-template-columns:repeat(4,1fr)}
.card{background:var(--bg);border:1px solid var(--line);border-radius:var(--r-md);padding:var(--space-8)}
.card--sunken{background:var(--bg-sunken);border-color:transparent}
```

| # | Prefix | Block | From | Used on |
|---|---|---|---|---|
| 1 | `.nav` | Sticky header: logo · 6 links · burger · `.btn--accent` CTA. Shrinks + grows a hairline + `backdrop-filter:blur(12px)` after 8px of scroll | both | all |
| 2 | `.hero` | Eyebrow → `.display` → `.lede` → 2 CTAs → trust line, with a right-hand visual plate | Businity | `/` |
| 3 | `.chips` | Horizontally scrolling pill row of categories | AppNext (`Yoga/Gym/…`) | `/`, `/catalogue` |
| 4 | `.marquee` | Edge-masked infinite logo scroll. Mask is Businity's exact gradient: `linear-gradient(to right,transparent 0%,#000 12.5%,#000 87.5%,transparent 100%)` as `mask-image`. Pauses on hover | Businity | `/` |
| 5 | `.svc` | 3-card service grid, numbered `01/02/03` | Businity "Our Services" | `/` |
| 6 | `.steps` | 4-step process, hairline-connected | Businity "Simple Steps to Smarter Growth" | `/`, `/wholesale` |
| 7 | `.show` | Product/dashboard showcase — **fake UI drawn in HTML+CSS**, no screenshots | AppNext "Built for modern studio operations" | `/` |
| 8 | `.bars` | Labelled progress bars that fill on scroll into view | Businity "What Do The Number Say" (85/95/100/75%) | `/` |
| 9 | `.stats` | Stat-card grid with **source attribution** under each figure | AppNext "Real results from studios" | `/` |
| 10 | `.feat` | 3 feature cards, icon + h3 + copy | AppNext ("Always in sync / Built for daily use / Scales with you") | `/` |
| 11 | `.proof` | Testimonials — **rendered from `GET /api/proof`, hidden when empty** | Businity "What Clients Said" + aphelion `references.js` | `/`, `/about` |
| 12 | `.tiers` | Pricing tiers, one highlighted | Businity "Flexible Plans" | `/pricing` |
| 13 | `.breaks` | Volume-break table (`.table-wrap` overflow container — house rule) | Repeater domain (`price_breaks`) | `/pricing`, `/catalogue` |
| 14 | `.case` | Case-study teaser: figure + outcome + link | Businity "Success Story Case Study" | `/about` |
| 15 | `.team` | Member grid, square portraits | Businity "Meet Our Leaders" | `/about` |
| 16 | `.faq` | Accordion, `<details>`-free: `grid-template-rows:0fr→1fr` transition, no JS height maths | both | `/`, `/wholesale` |
| 17 | `.posts` | 3-up blog teaser | Businity "Insights & Updates" | `/`, `/blog` |
| 18 | `.cta` | **Dark band** (`.sec--band`), big Jost line + one accent button | AppNext "Run your studio, without the chaos" | every page |
| 19 | `.foot` | 4-column: brand+ABN · Product · Company · Connect | AppNext | all |
| 20 | `.qform` | Enquiry/application form — **real `<form method=post action=/api/enquiry>`**, JS enhances | Businity + aphelion `quote-form.js` | `/contact`, `/apply` |

Buttons — aphelion's system, four variants + one size modifier:
```css
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
     padding:12px 22px;border:1px solid transparent;border-radius:var(--r-pill);
     font:600 14.5px/1 var(--font-sans);text-decoration:none;cursor:pointer;
     transition:background var(--dur-fast) var(--ease-out),
                border-color var(--dur-fast) var(--ease-out),
                color var(--dur-fast) var(--ease-out)}
.btn--solid  {background:var(--fg);color:#fff}                 /* primary, 18.73:1 */
.btn--accent {background:var(--accent-strong);color:#fff}      /* the ONE high-value CTA, 4.70:1 */
.btn--line   {background:transparent;border-color:var(--line-strong);color:var(--fg)}
.btn--quiet  {background:transparent;color:var(--fg-2);padding:12px 10px}
.btn--sm     {padding:9px 16px;font-size:13.5px}
```
**At most one `.btn--accent` above the fold per page.** That restraint is what makes
Businity read as professional; if everything is the accent colour, nothing is.

---

## 4. Page map

**9 primary routes + 3 utility.** Flat `.html` files and folders-per-section with
`index.html` — clean URLs come from Pages' directory-index behaviour, never from
extension stripping (house convention).

| Route | File | Blocks (in order) |
|---|---|---|
| `/` | `public/index.html` | nav · **hero** · marquee · chips · svc · show · bars · stats · feat · proof · tiers(teaser) · case · faq · posts · cta · foot |
| `/catalogue` | `public/catalogue/index.html` | nav · page-head · chips · breaks · product grid · cta · foot |
| `/wholesale` | `public/wholesale/index.html` | nav · page-head · steps · feat · breaks · faq · cta · foot |
| `/pricing` | `public/pricing/index.html` | nav · page-head · tiers · breaks · faq · cta · foot |
| `/about` | `public/about/index.html` | nav · page-head · story · bars · team · case · proof · cta · foot |
| `/blog` | `public/blog/index.html` | nav · page-head · posts grid · cta · foot |
| `/blog/<slug>` | `functions/blog/[slug].js` *(shadows a static template)* | nav · article · posts(related) · cta · foot |
| `/contact` | `public/contact/index.html` | nav · page-head · qform + details · faq · foot |
| `/apply` | `public/apply/index.html` | nav · page-head · steps · **qform (trade application)** · faq · foot |
| 404 | `public/404.html` | Pages' reserved filename |
| `/privacy` | `public/privacy.html` | Reuse aphelion's copy as the base — it already promises self-hosted assets and hashed IPs |
| `/terms` | `public/terms.html` | — |

Case studies: a **`.case` section on `/about`** for now. A `/case-studies/<slug>`
template is Phase 6, deferred — it needs owner-written content.

Nav links: `Catalogue · Wholesale · Pricing · About · Blog` + `.btn--accent`
**"Apply for a trade account"** → `/apply`.

---

## 5. Content honesty — the rule that overrides everything

Leo is asleep or away when an agent runs. He cannot answer "what's the real price?"
The house already solved this twice over; follow both precedents exactly.

**(a) Testimonials, logos and headline figures are never invented.**
Migration `028_site_proof.sql` says so in its own header comment:

> *"the site never invents a testimonial, and never shows an unfinished placeholder
> either."*

So `.marquee`, `.stats`, `.bars` and `.proof` are all filled from `GET /api/proof`
(`{quotes[], figures[], logos[]}`) by `public/assets/proof.js`, ported from
`aphelion/public/assets/references.js`. **When a list is empty the whole block is
removed from the DOM** — no skeleton, no lorem, no "Coming soon". The page must still
look complete without them; design the section order so it does.

**(b) Every hard fact lives in one file, marked until confirmed.**
Port FSR's `public/redesign/shared/fsr-core.js` pattern — a single
`/* ---- Facts that must not drift ---- */` block, exposed as `window.REPEATER`:

```js
window.REPEATER = {
  TEL:        "[OWNER TO CONFIRM]",   // → tel: href
  EMAIL:      "orders@repeater.com.au", // confirmed: appears in aphelion/tests/sending-domains.test.mjs
  FLEET_EMAIL:"fleet@repeater.com.au",  // confirmed: same source
  ABN:        "[OWNER TO CONFIRM]",   // legally required on an AU B2B site — do NOT guess
  ADDRESS:    "[OWNER TO CONFIRM]",
  DISPATCH_SLA:"[OWNER TO CONFIRM]",  // e.g. "same-day before 2pm"
  TERMS_DAYS: [7, 14, 30, 60],        // confirmed: trade_accounts.terms_days comment
  GST:        "exclusive",            // confirmed: trade_accounts.gst_exclusive defaults 1
  CURRENCY:   "AUD",
  LOCALE:     "en-AU"
};
```
Anything still reading `[OWNER TO CONFIRM]` must be **visibly rendered as a muted
placeholder**, and `tests/facts.test.mjs` must fail if one reaches production while the
site is bound to a custom domain. `Intl.NumberFormat("en-AU",{currency:"AUD"})` for all
money (house rule).

Only three emails are actually evidenced (`orders@`/`fleet@repeater.com.au` in
`aphelion/tests/sending-domains.test.mjs`). Everything else is a placeholder.

**(c) Catalogue rows come from the database, never from markup.**
**Confirmed by Leo 2026-10-02: `DB_REPEATER.products` is NOT populated.** `/catalogue`
ships with the empty state as its *normal* rendered condition, not as a fallback — the
grid, the `.breaks` table and `catalogue.js` are all fully built and tested, they simply
have no rows yet. The empty state is the primary design:

> *"Trade pricing is released to approved accounts — apply and we'll send your price
> list."* → `.btn--accent` to `/apply`

That is a better B2B page than a sparse catalogue would be, so do not treat it as a
degraded state or apologise for it in the copy.

`GET /api/catalogue` reads `products` + `price_breaks` from `DB_REPEATER`. Empty or
unbound → `{ok:true,categories:[],products:[]}`, **never a 500**. Public prices are
**GST-exclusive** and, where a `price_list_id` is required, withheld until the account
exists — respect `trade_accounts.credit_limit` and the price-resolution order recorded
in `007_b2b_wholesale.sql`:

> *negotiated price → quantity break → price-list discount → cost-plus rule → retail price*

Public catalogue shows **quantity breaks only**. Never expose `cost_plus_rules`,
`negotiated_prices` or another account's pricing.

---

## 6. Data & API

### 6.1 Bindings — `wrangler.toml`

```toml
name = "repeater-site"
compatibility_date = "2026-06-29"
pages_build_output_dir = "public"

# Aphelion-owned platform tables: leads (migration 027), site_proof (028),
# rate_limits. Declared here with the SAME database_id aphelion uses, so the
# site stays same-origin — no CORS surface, and `credentials:"same-origin"` works.
[[d1_databases]]
binding = "DB_APHELION"
database_name = "aphelion-admin"
database_id = "3f6d51f8-7b13-437b-aedb-5af019b62901"

# Repeater's own business DB: products, price_breaks, price_lists, site_posts.
# Provisioned from ../fivestarrepairs/schema.sql + ../aphelion/migrations/007.
[[d1_databases]]
binding = "DB_REPEATER"
database_name = "repeater"
database_id = "60bf7791-8963-4b10-870a-16194e4be0f3"

# Shared media bucket (the registry already points repeater at MEDIA_FSR).
[[r2_buckets]]
binding = "MEDIA_FSR"
bucket_name = "fivestarrepairs-media"
```
No `[vars]`, no `[build]`, no `[assets]` — matches both siblings. Commented-out
optional bindings with a prose paragraph each (house style).

### 6.2 Endpoints

| Route | File | Contract |
|---|---|---|
| `GET /api/proof` | `functions/api/proof.js` | Port aphelion's **verbatim**. `{ok,quotes[],figures[],logos[]}`, `cache-control:public,max-age=60`, never throws, empty lists when unmigrated |
| `POST /api/enquiry` | `functions/api/enquiry.js` | Port aphelion's **verbatim**, then send `interest:"wholesale"`, `business_slug:"repeater"`, `source:"<page>:<block>"` from the client. Keeps: JSON **or** form-encoded body, `company` honeypot, 5-per-600s rate limit, `ip_hash` (never raw IP), `{ok:true,stored:boolean}`, 503 only if store **and** alert both fail |
| `GET /api/catalogue` | `functions/api/catalogue.js` | New. `{ok, categories[], products[]}` from `DB_REPEATER`. Degrades to `{ok:true,products:[]}` |
| `GET /blog/<slug>` | `functions/blog/[slug].js` | Shadows the static template, injects the post from `site_posts` |
| `GET /sitemap.xml` | `functions/sitemap.xml.js` | House precedent: literal dotted filename |

`_`-prefixed files (`_ratelimit.js`, `_alert.js`) are **helpers, not routes**.

**Decision (Leo, 2026-10-02): same-origin ports.** Do **not** call
`https://aphelion.ltd/api/*` cross-origin.

Rationale, for the record: aphelion's `functions/api/t.js` only echoes an `Origin` that
exactly matches the registry row's `site_url`, and never `*`. A cross-origin call would
mean widening that allow-list and adding preflight handling to a live production project
that three businesses depend on. Two ~120-line ports plus `tests/contract.test.mjs`
asserting the response shapes match field-for-field is the smaller risk.

The duplication is the accepted cost. Manage it:
- Port `proof.js` and `enquiry.js` **verbatim** — do not "improve" them while copying.
- Copy their header docstrings unchanged and append one line:
  `Ported verbatim from aphelion/functions/api/<name>.js — keep in sync.`
- `tests/contract.test.mjs` is the drift alarm. If aphelion's response shape changes,
  that test is what tells you.
- `_ratelimit.js`, `_alert.js` and `melbourneDay` come along with `enquiry.js`.

### 6.3 New schema — `rep` owns it

Hard rule from `aphelion/schema-notes.md`: *"Never create or alter a business-DB table
from aphelion"* and *"Never copy `schema.sql` or migrations into this repo."* The
converse also holds: **`rep` must not re-create tables FSR's `schema.sql` or aphelion's
`007` already made in the `repeater` DB.**

So `rep` gets `schema.sql` (idempotent, all `IF NOT EXISTS`, **only the site's own
tables**) plus `migrations/002_*.sql` onward — FSR's convention of no `001`.

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS site_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published')),
  published_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_site_posts_status ON site_posts (status, published_at DESC);
```

⚠ **`git fetch` in aphelion and fivestarrepairs before choosing a migration number.**
Leo runs several agent sessions in parallel and each independently picks "the next"
number from a stale view — this has already caused a collision (FSR's `068` was taken
mid-work and had to be renumbered to `070`).

---

## 7. Repo layout

```
rep/                              ← git root (see §1)
├─ .gitignore                     ← copy aphelion's (it has the .qwen/ line)
├─ package.json                   ← {"type":"module","private":true,
│                                    scripts:{dev:"wrangler pages dev",
│                                             test:"node --test tests/*.test.mjs"}}
│                                    NO devDependencies — qrcode isn't needed here
├─ wrangler.toml                  ← §6.1
├─ schema.sql                     ← §6.3
├─ README.md                      ← intro → ## Layout (ASCII tree, ← arrows) →
│                                    ## Databases → ## Run locally → ## Deploy →
│                                    ### Remote migrations
├─ CLAUDE.md                      ← FSR's convention, the densest agent brief in the
│                                    house: What this is / Commands / ### Routing /
│                                    ### Fail-closed auth, fail-open features /
│                                    ### Database
├─ migrations/002_*.sql
├─ docs/                          ← this file, AGENT-PROMPT-full-build.md,
│                                    WORKLOG-<date>.md, SETUP-deploy.md
├─ public/
│  ├─ index.html  privacy.html  terms.html  404.html
│  ├─ favicon.svg  robots.txt  sitemap.xml  _headers  _redirects
│  ├─ catalogue/index.html  wholesale/index.html  pricing/index.html
│  │  about/index.html  blog/index.html  contact/index.html  apply/index.html
│  └─ assets/
│     ├─ site.css                 ← THE stylesheet. Tokens first, banners, media last
│     ├─ site.js                  ← nav, reveal, counters, marquee, accordion, bars
│     ├─ proof.js                 ← /api/proof → .marquee/.stats/.bars/.proof
│     ├─ facts.js                 ← window.REPEATER, §5(b)
│     ├─ catalogue.js             ← /api/catalogue → product grid
│     ├─ form.js                  ← progressive enhancement over the real <form>
│     ├─ fonts/ jost-latin.woff2 jost-latin-ext.woff2
│     │          inter-latin.woff2 inter-latin-ext.woff2
│     └─ img/ logo.svg og.png     ← og:image is required; aphelion omits it, FSR doesn't
├─ functions/
│  ├─ _middleware.js              ← injects <script defer data-b="repeater"
│  │                                 src="https://aphelion.ltd/t.js"></script> before
│  │                                 </head> on every text/html response, idempotently
│  ├─ sitemap.xml.js
│  ├─ blog/[slug].js
│  └─ api/ _ratelimit.js _alert.js proof.js enquiry.js catalogue.js
└─ tests/  tokens.test.mjs chrome.test.mjs facts.test.mjs contract.test.mjs
           catalogue.test.mjs imports.test.mjs site.test.mjs
```

Public JS is **classic scripts in an IIFE, `"use strict"`, `var`/`function`, own
`$`/`$$` helpers, no ES modules** — aphelion `quote-form.js` and FSR `app.js` are the
models. Boot with:
```js
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
```
Guard `if (location.protocol === "file:") return;`. Fetch with promise chains, and
**always progressive-enhance a real form** — aphelion's contract comment:

> *"the markup is a real `<form method="post" action="/api/enquiry">`, and the endpoint
> also accepts form-encoded bodies — so the enquiry is still captured if this script
> never loads."*

Icons: **inline SVG path data, no icon font, no emoji, no CDN** (FSR keeps an `ICONS`
object of Lucide paths and a `mountIcons()` that fills `[data-lucide]` placeholders).

Doctrine, verbatim from FSR's `CLAUDE.md` — put it in `rep/CLAUDE.md` too:
> **Auth fails closed. Everything else degrades gracefully.** Missing D1 binding, R2
> bucket, or any third-party secret must never break the customer flow.

---

## 8. Motion

Five things, no more. All killed by `prefers-reduced-motion:reduce`.

1. **Reveal on scroll** — `.rv` → `.rv.is-in` via one shared `IntersectionObserver`
   (`rootMargin:"0px 0px -12% 0px"`, `once:true`), `translateY(14px)→0` +
   `opacity:0→1`, `var(--dur-slow) var(--ease-out)`, staggered with `--d`.
2. **Count-up stats** — AppNext's fetched HTML literally contains `0%` and `0+`, its
   pre-animation SSR values. Do the same: render `0` in the markup, roll to the real
   figure over 900ms with `requestAnimationFrame`, honouring `tabular-nums` so the
   layout doesn't jitter. Values come from `/api/proof`, so an empty proof list means
   no counters at all.
3. **Marquee** — CSS `@keyframes` `translateX(0→-50%)` over 40s linear infinite, list
   duplicated once in markup, `animation-play-state:paused` on `:hover`, edge mask per §3.
4. **Accordion** — `grid-template-rows:0fr → 1fr` on a wrapper with `overflow:hidden`.
   No JS height measurement, no `max-height` guessing.
5. **Nav** — after 8px of scroll add `.is-stuck`: `padding` shrinks, a
   `border-bottom:1px solid var(--line)` appears, `backdrop-filter:blur(12px)
   saturate(1.4)` with a solid `--bg` fallback under `@media (prefers-reduced-transparency:reduce)`.

**No parallax, no scroll-jacking, no cursor effects, no page transitions.** Simplicity.

---

## 9. Tests

Framework: **none.** Plain Node, flat `tests/*.test.mjs`, run with
`node --test tests/*.test.mjs`. The house assertion style, in every file:

```js
let failures = 0;
function check(name, cond){ console.log((cond?"PASS":"FAIL")+" "+name); if(!cond) failures++; }
// … console.log("\n--- Section ---") banners …
console.log(failures ? "\n"+failures+" FAILED" : "\nall <name> assertions passed");
process.exit(failures ? 1 : 0);
```
Header comment names its own run command. D1 is mocked with **`node:sqlite`
`DatabaseSync(":memory:")` + a ~25-line adapter**, schema loaded from **the real
migration files** so drift is caught. Handlers are imported by absolute `file://` URL
and called with a plain object literal context spread with a real `Request`. Browser
code is tested with `node:vm` + a hand-rolled DOM stub.

| File | Pins |
|---|---|
| `tokens.test.mjs` | The §2.1 contrast ratios; `RETIRED_COLOURS` regex finds no lime/gold/violet in any public file; `site.css` brace balance == 0 |
| `chrome.test.mjs` | Every page in `PUBLIC_PAGES` contains the identical `<nav>`, `<footer>`, `favicon.svg`, `site.css`, `og:image`, and the `skip` link; each has a unique `<title>` and `meta description`; `lang="en-AU"` |
| `facts.test.mjs` | No `[OWNER TO CONFIRM]` string survives in `public/**` **when a production domain is configured**; `window.REPEATER` parses under `node:vm`; `tel:`/`mailto:` hrefs are well-formed |
| `contract.test.mjs` | `/api/proof` and `/api/enquiry` responses match aphelion's shapes field-for-field; enquiry accepts **both** JSON and `application/x-www-form-urlencoded`; honeypot `company` → `{ok:true,stored:false}`; missing name → 400; missing email **and** phone → 400; 6th hit in 600s → 429; no raw IP ever written |
| `catalogue.test.mjs` | Price resolution exposes quantity breaks only; `negotiated_prices`/`cost_plus_rules` never appear in a public response; unbound `DB_REPEATER` → `{ok:true,products:[]}`, **not** a 500 |
| `imports.test.mjs` | Walks `functions/` and `await import()`s every module. **Non-negotiable gate** — aphelion runs it separately from `npm test` because *"unresolved named imports are link-time errors in ESM, so one missing export takes down every route in the file"* |
| `site.test.mjs` | `ASSETS` stub serves the real files off disk; `/` → 200; unknown path → `404.html`; `_headers`/`_redirects` parse; `sitemap.xml` lists every route that exists |

Other verification habits from aphelion's worklog, all worth keeping: `node --check`
every touched JS file; local static serve returns 200 with all new blocks present;
post-push production curl.

---

## 10. Phases & gates

Each phase ends with: `npm test` **and** `node tests/imports.test.mjs` green → commit →
push `main` → verify. **Pushing `main` is the deploy path** (`wrangler pages deploy`
does not work for aphelion; assume the same here).

| Phase | Deliverable | Gate |
|---|---|---|
| **0** | Resolve §1 nesting. `.gitignore`, `package.json`, `wrangler.toml`, `README.md`, `CLAUDE.md`, empty `public/`+`functions/`+`tests/`, `site.css` with the full `:root` token block and base reset, `favicon.svg` | `npm test` green with `tokens.test.mjs` only |
| **1** | Chrome: `.nav`, `.foot`, `.cta`, `.head`, `.btn`, `.wrap`/`.sec`; fonts self-hosted + preloaded; all 12 HTML files stubbed with correct `<head>` (OG, canonical, JSON-LD `Organization`/`WholesaleStore`); `_headers`, `_redirects`, `robots.txt`, `404.html` | `chrome.test.mjs` green; every page 200 locally |
| **2** | `public/index.html` complete — all 16 home blocks, all five motions | Manual: 1440 / 1199 / 809 / 559 / coarse-pointer; reduced-motion |
| **3** | `proof.js` + ported `/api/proof`; `facts.js`; empty-state behaviour verified by unplugging the binding | `contract.test.mjs` + `facts.test.mjs` green |
| **4** | `/catalogue`, `/wholesale`, `/pricing` + `/api/catalogue` + `catalogue.js` | `catalogue.test.mjs` green |
| **5** | `/about`, `/contact`, `/apply` + ported `/api/enquiry` + `form.js` | End-to-end: a real POST lands a `leads` row with `interest='wholesale'`, `business_slug='repeater'` |
| **6** | `/blog` + `functions/blog/[slug].js` + `schema.sql` + `migrations/002_*`; `sitemap.xml.js`; beacon `_middleware.js` with `data-b="repeater"` | `imports.test.mjs` green; sitemap lists every live route |
| **7** | **Register in aphelion** (§11) and deploy | Production curls: `/` → 200, `/api/proof` → 200, `/api/enquiry` GET → 405 |

Phase 7 touches a **live production project** (`aphelion`). Do not PATCH the registry
without Leo's go-ahead — see §11.

---

## 11. Registration steps that live outside this repo

These mutate **live production** (`aphelion` + Cloudflare DNS). Steps 1-3 and 5 are
Leo's calls — prepare them in `docs/SETUP-deploy.md`, present them, don't run them.
Step 4 is authorised, but **gated** — read it carefully.

1. **`site_url`** — the registry row must carry the deployed origin or the traffic
   beacon silently 204s (aphelion's `/api/t` echoes an `Origin` only on an exact
   `site_url` match, never `*`). Set it to `https://repeater.com.au`.
2. **Branding PATCH** — migration `010_business_branding.sql` fields
   (`from_email`, `signature`, `app_url`, `review_url`, `bounce_prefix`). aphelion's
   runbook warns that skipping this leaves `repeater` inheriting `DEFAULT_BRANDING` —
   **FSR's name, from-address and `fsr-` bounce prefix** — which it currently does.
   Use `PATCH`, never `POST`. Suggested: `from_email` = `Repeater <orders@repeater.com.au>`,
   `bounce_prefix` = `repeater-`.
3. **`SESSION_SECRET`** on the new Pages project must be **byte-identical** to
   aphelion's, or the shared `fsr_session` cookie won't cross-verify.
4. **Custom domain — AUTHORISED by Leo 2026-10-02, but blocked until the ABN arrives.**

   He chose *"Bind repeater.com.au now"* over the unlisted `*.pages.dev` preview. That
   decision **collides with the §5(b) content rule**: an Australian B2B site must display
   its ABN, and `tests/facts.test.mjs` is specified to fail if any `[OWNER TO CONFIRM]`
   placeholder is live on a custom domain. So the gate is real and must not be weakened
   to make the deploy go through.

   Resolution order — do **not** skip ahead:
   1. Build and deploy to the `*.pages.dev` preview URL first. That is free, instant,
      and lets Leo review the design while the facts are outstanding.
   2. Ask Leo for the **ABN**, trade **phone**, **address** and **dispatch SLA**.
   3. Fill `facts.js`, confirm `facts.test.mjs` passes with no placeholders.
   4. Only then bind `repeater.com.au` (Pages → Custom domains) and set `site_url`.

   If Leo says to bind anyway without an ABN, **stop and say so explicitly** — that is a
   legal-exposure call, not a build call, and it must be his informed decision rather
   than something an agent quietly shipped. Never delete or relax the placeholder test to
   get a green run.
5. **`status` flip to `live`** — aphelion returns `409 needsProvisioning` until the
   binding exists in `env`. The runbook says: *"that guard is intentional, don't remove
   it."*

---

## 12. Decisions taken, and what's still outstanding

### Answered by Leo, 2026-10-02 — settled, do not re-litigate

| # | Question | Answer |
|---|---|---|
| 1 | Repo nesting (§1) | **`.git` moved up** — git root == project root. Done, commit `1ab044c` intact |
| 2 | API wiring (§6.2) | **Same-origin ports** in `rep`, binding `DB_APHELION` by `database_id`. No CORS to aphelion.ltd |
| 3 | Catalogue (§5c) | **`DB_REPEATER.products` is NOT populated** — `/catalogue` ships the empty state as its normal design |
| 4 | Launch (§11.4) | **Bind `repeater.com.au`** — authorised, but gated on the ABN per §11.4 |

Earlier the same day he also locked: **subject** = Repeater B2B wholesale,
**stack** = zero-build vanilla (Astro and Next.js both rejected), **look** = light-first
with dark accents (deliberately *not* the dark canvas both references use),
**scope** = full multi-page.

### Still outstanding — all facts only Leo has

| # | Needed | Blocks | Interim behaviour |
|---|---|---|---|
| 5 | **ABN** | §11.4 domain binding — legally required on an AU B2B site | muted `[OWNER TO CONFIRM]`, `facts.test.mjs` fails on a custom domain |
| 6 | Trade phone, service/postal address | footer, `/contact`, JSON-LD | ditto. Only `orders@`/`fleet@repeater.com.au` are evidenced |
| 7 | Dispatch SLA + delivery coverage | hero trust line, `/wholesale` `.steps` | ditto |
| 8 | Trade-tier names + entitlements | `.tiers` on `/pricing` | Net 7/14/30/60 and GST-exclusive *are* evidenced from `trade_accounts`; names are not |
| 9 | Logo (SVG) + `og:image` 1200×630 | favicon, nav, social cards | text wordmark; `og:image` is required — aphelion omits it, FSR doesn't, we do |
| 10 | Team portraits, product photography | `.team`, `.show` | monogram tiles + CSS-drawn UI (§5) |
| 11 | Testimonials, client logos, headline stats | `.proof`, `.marquee`, `.stats`, `.bars` | **not sent to an agent** — Leo enters these in aphelion **Admin → References**; the site picks them up via `GET /api/proof`, and empty means the block is removed from the DOM |
| 12 | Blog / case-study content | `/blog`, `.case` on `/about` | Phase 6 builds the machinery; posts stay `draft` until written |

Items 5-10 block nothing before Phase 5. Build Phases 0-4 now.

---

## Appendix A — measured tokens, for provenance

Extracted 2026-10-02 from the live demos' inlined minified CSS
(`businity.framer.website`, `appnext.framer.website`, ~830 KB each).

**Businity** — fonts `Jost` (27×), `Inter`/`Inter Display` (42×), `DM Sans` (20×).
Sizes 88/70/64/56/48/40/36/32/24/22/20/18/16/15/14/12/10. Weights 300–700. Tracking
`-3.52px` (≈ `-0.04em` at 88px, 10×), `0.06em` eyebrows. Ink `#151515` (12×), `#000`,
`#fff` (41×), greys `#333 #494949 #bbb #c8c8c8 #d9d9d9 #ddd #eee #f2f2f2`. Accent lime
`#c4f666` (11×) / `#b3db6a` / `#b3db69`. Radii `8px` (14×) `12px` `40px` `100px` `50%`.
Shadows `9px 11px 26px 4px #00000014`, `4px 4px 12px #00000014`, `0 10px 20px #0000000d`,
glow `0 0 100px -9px #aab8ff`. Gradients `linear-gradient(#fff 0%,#c8c8c8 100%)` (7×,
silver), `linear-gradient(#fff 0%,#c4f666 81.785%,#00ff86 100%)`, marquee mask
`linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 87.5%, rgba(0,0,0,0) 100%)`.
Breakpoints `max-width:1439px` / `809px`, `min-width:1440px` / `810px`.
Routes `./ ./about-us ./services ./pricing ./contact ./case-study ./blog/{financial-planning,cloud-accounting,navigating-change}`.
Hero `h1` "The Future of Business Clarity" (three `h1` lines) + "190K+". Contact
`mailto:hello@businity.consultant`, `tel:+0685689696`, `cal.com` booking.

**AppNext** — fonts `Stack Sans Headline` (29×), `Switzer`, `Inter`. Sizes
120/90/64/58/42/40/38/34/30/28/26/24/23/20/**19 (10×)**/18/16/14. Weights **300/400/500
only**. Line-heights `1.1/1.2/1.3/1.5/1.6em`. Tracking `-.01em` (14×), `-.3px`,
`-0.03em`. Ink `#121212` (5×), `#222` (30×), `#000` (38×), `#fff`, `#606060` (101×),
`#f4f4f4` (8×), `#eee`. Accents `#e03800` `#a6daff` `#40c6ff` `#044680` `#ebf9ff`
`#1bab49` `#e3b324`. Radii `24px` (11×) `40px` `20px` `16px` `8px` `100px` `50px` `50%`.
Shadows `0px 40px 40px 0px rgba(0,0,0,0.1)` (6×), layered
`.0602px .7226px .7251px -1.25px #12121224, .2289px 2.7462px 2.7558px -2.5px #12121221, 1px 12px 12.04px -3.75px #1212120d`,
`0px 1px 11px rgba(0,0,0,.1)`, glow `0 0 20px rgba(168,209,255,.5)`. Breakpoints
`max-width:1199px` (11×) / `809px` (11×), `min-width:1200px` / `810px`, one
`prefers-color-scheme:dark`. Routes `./ ./features ./pricing ./about ./blog ./contact ./faq ./privacy-policy`.
Nav `Features Pricing About Team Blog Contact`. Sections: hero "Manage Classes. Book
Instantly. Grow Your Studio." + chips `Yoga Gym Wellness Dance Pilates Boxing Massage`
+ "App of the day Appstore" badge → "Built for modern studio operations" → "Built to
simplify daily operations effectively" (Save Time / Stay Organized / Grow Faster) →
"Powering studios every day" → "Real results from studios" (+38% / 2x / 12K+ / 4.8/5 /
+68% / 12 min, each attributed to a named studio) → "Everything your studio needs, in
one place" → "Booking, Simplified" → "Loved by modern studios" → "Built by people who
understand studios" → "Frequently asked questions" → "Run your studio, without the
chaos". Footer columns `Product / Company / Connect`.

Note the SSR'd `0%` / `0+` in AppNext's markup — its counters animate up from zero on
load, which is what §8.2 replicates.
