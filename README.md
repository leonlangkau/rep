# Repeater: website

Marketing site for **Repeater**, the B2B wholesale supply arm of Aphileon LTD
(`repeater.com.au`). Static HTML plus dependency-free Cloudflare Pages Functions,
talking to two D1 databases and one shared R2 bucket.

Design is a deliberate fusion of two references: the restraint of a business/agency
template (one accent, hairline rules, editorial display type, an eyebrow → headline →
lede rhythm) and the block structure of a SaaS template (category chips, attributed stat
cards, a dark product plate, a `Product / Company / Connect` footer). Light-first.

## Layout

```
.gitignore  package.json  wrangler.toml  schema.sql  README.md  CLAUDE.md
docs/                      ← PLAN-repeater-site.md is the spec; AGENT-PROMPT-*.md the run brief
migrations/                ← 002_*, NNN_snake_case_topic.sql (no 001; schema.sql is the base)
public/
  index.html               ← the landing page, all sixteen blocks
  catalogue/index.html     ← trade pricing (gated: empty state until products exist)
  wholesale/index.html     ← how a trade account works: apply → price list → order → terms
  pricing/index.html       ← trade tiers + volume-break table
  about/index.html         ← story, service levels, team, case study, references
  blog/index.html          ← published posts
  contact/index.html       ← enquiry form
  apply/index.html         ← trade account application
  404.html  privacy.html  terms.html
  robots.txt  sitemap.xml  _headers  _redirects  favicon.svg
  assets/
    site.css               ← THE stylesheet. Tokens first, then base, blocks, motion, @media last
    site.js                ← nav, reveal, counters, marquee, accordion, bars
    facts.js               ← window.REPEATER — every hard fact, single source of truth
    proof.js               ← GET /api/proof → marquee, stats, bars, quotes
    catalogue.js           ← GET /api/catalogue → product grid + volume breaks
    form.js                ← progressive enhancement over the real <form>
    fonts/                 ← self-hosted woff2 (Jost + Inter, latin + latin-ext)
functions/
  _middleware.js           ← injects the aphelion traffic beacon into every HTML response
  sitemap.xml.js           ← literal dotted filename, so it routes at /sitemap.xml
  blog/[slug].js           ← shadows the static article template, injects the post
  api/
    _ratelimit.js          ← helper (the "_" prefix means not routed)
    _alert.js              ← helper — Pushover / team webhook owner alerts
    proof.js               ← GET  /api/proof
    enquiry.js             ← POST /api/enquiry
    catalogue.js           ← GET  /api/catalogue
tests/                     ← flat *.test.mjs, dependency-free plain Node
vendor/                    ← unused here; this repo needs no npm build artifact
```

Day-to-day work lands on **`main`**. Pushing `main` is the deploy path.

## Databases

| Binding | Database | What this site uses it for | Owner |
|---|---|---|---|
| `DB_REPEATER` | `repeater` | `products`, `price_breaks`, `price_lists` for `/catalogue`; `site_posts` for `/blog` | this repo + fivestarrepairs |
| `DB_APHELION` | `aphelion-admin` | `leads` (trade applications), `site_proof` (references), `rate_limits` | aphelion |
| `MEDIA_FSR` | `fivestarrepairs-media` | product/blog imagery | shared |

**Schema ownership.** The `repeater` database was provisioned *before* this repo existed,
from `../fivestarrepairs/schema.sql` plus `../aphelion/migrations/007_b2b_wholesale.sql`.
Those files own `products`, `trade_accounts`, the `price_*` tables, `wholesale_*` and
`orders`. `schema.sql` here holds **only the tables this site owns** — add to it and add a
numbered migration; never recreate or alter the wholesale tables, which aphelion's
Wholesale tab reads.

**`DB_APHELION` is declared with the same `database_id` the aphelion project uses**, so
the site stays same-origin and needs no CORS allow-list. Only two tables are ever written:
`leads` (via `/api/enquiry`) and `rate_limits` (the limiter's own bookkeeping).

## Run locally

```bash
npm run dev                 # = wrangler pages dev -> http://localhost:8788
npm test                    # node --test tests/*.test.mjs
npm run test:imports        # every module under functions/ must import cleanly
```

`.dev.vars` (gitignored) is optional — every endpoint degrades gracefully without it:

```
PUSHOVER_TOKEN=
PUSHOVER_USER=
BOOKING_EMAIL_TO=
```

## Deploy

Cloudflare Pages serves this with **default settings** (root directory blank, no build
command); `wrangler.toml`'s `pages_build_output_dir = "public"` points it at `public/`,
and `functions/` is picked up automatically. Or connect the repo in the Cloudflare
dashboard with **build output directory = `public`** and add the three bindings under the
project's Functions settings.

Then, in **aphelion**: set this business's registry `site_url`, and PATCH the migration-010
branding fields (`from_email`, `signature`, `app_url`, `review_url`, `bounce_prefix`).
Without those it inherits `DEFAULT_BRANDING` — Five Star Repairs' name, from-address and
`fsr-` bounce prefix. See `docs/SETUP-deploy.md`.

### Remote migrations

```bash
# This repo's own tables (repeat per new migration):
npx wrangler d1 execute repeater --remote --yes --file=schema.sql
npx wrangler d1 execute repeater --remote --yes --file=migrations/002_site_posts.sql
```

`002_site_posts.sql` is **not re-runnable** if it ever gains an `ALTER TABLE` — D1 has no
`ADD COLUMN IF NOT EXISTS`.

Tests: `node tests/tokens.test.mjs`, `node tests/chrome.test.mjs`,
`node tests/facts.test.mjs`, `node tests/contract.test.mjs`,
`node tests/catalogue.test.mjs`, `node tests/site.test.mjs`,
`node tests/imports.test.mjs`.