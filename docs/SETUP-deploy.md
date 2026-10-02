# SETUP — deploying the Repeater site

Everything the build could not do for you, in the order it has to happen.
**Nothing in this file has been executed.** Each step says who runs it and why.

Read §0 first — it explains the one gate that will stop the deploy, and it is
deliberate.

---

## 0. The gate: the ABN is still unknown

`public/assets/facts.js` carries `[OWNER TO CONFIRM]` for the ABN, the phone
number, the address, the dispatch SLA, the delivery coverage, the warranty and
the minimum order value. Only two facts are evidenced: `orders@repeater.com.au`
and `fleet@repeater.com.au` (from `aphelion/tests/sending-domains.test.mjs`),
plus GST-exclusive pricing and the 7/14/30/60 day terms (from
`aphelion/migrations/007_b2b_wholesale.sql`).

`tests/facts.test.mjs` refuses to let those placeholders reach a live domain.
The switch is one environment variable:

```bash
REPEATER_CUSTOM_DOMAIN=repeater.com.au   # set this ONLY once facts.js is filled
```

- **Unset** (today): the test passes, but prints every unresolved fact loudly on
  every run.
- **Set to a domain**: the test FAILS if any `[OWNER TO CONFIRM]` remains.

That is on purpose. An Australian B2B site must display its ABN, and a
placeholder rendered to a customer is worse than a missing page. **Do not delete
or weaken that test to make a deploy go green.** If you want the site live
without an ABN, that is a legal-exposure decision — make it explicitly, not by
editing a test.

**To clear the gate:** fill these keys in `public/assets/facts.js`:
`ABN`, `TEL`, `TEL_DISPLAY`, `ADDRESS`, `DISPATCH_SLA`, `DELIVERY`, `WARRANTY`,
`MIN_ORDER`. Then set `REPEATER_CUSTOM_DOMAIN` and confirm `npm test` is green.

---

## 1. Preview deploy (safe, no gate)

Nothing public changes. The site lands on an unlisted `*.pages.dev` URL.

```bash
cd C:/Users/admin/Documents/ai/gemini/rep
npx wrangler pages project create repeater-site --production-branch main
```

Then, in the Cloudflare dashboard → **Workers & Pages → repeater-site →
Settings → Functions**:

| Binding | Type | Value |
|---|---|---|
| `DB_REPEATER` | D1 | `repeater` (`60bf7791-8963-4b10-870a-16194e4be0f3`) |
| `DB_APHELION` | D1 | `aphelion-admin` (`3f6d51f8-7b13-437b-aedb-5af019b62901`) |
| `MEDIA_FSR` | R2 | `fivestarrepairs-media` |

Production + preview env vars (**Settings → Environment variables**):

| Variable | Why |
|---|---|
| `PUSHOVER_TOKEN` | **Set this.** Without it there is no alert channel at all, so `/api/enquiry` answers 503 instead of accepting a trade application. See §4. |
| `PUSHOVER_USER` | The recipient key(s). Comma or space separated. |
| `BOOKING_EMAIL_TO` | Only needed if the email failsafe is added back (see §4). |

Bindings are already declared in `wrangler.toml`, so a dashboard-connected build
picks them up; the table above is for the CLI-created project.

Deploy on push:

```bash
git push origin main
```

Then verify:

```bash
BASE=https://repeater-site.pages.dev
curl -s -o /dev/null -w "%{http_code}\n" $BASE/                 # 200
curl -s $BASE/api/proof                                          # {"ok":true,"quotes":[],...}
curl -s -o /dev/null -w "%{http_code}\n" $BASE/api/enquiry       # 405
curl -s -o /dev/null -w "%{http_code}\n" $BASE/sitemap.xml       # 200
curl -s -o /dev/null -w "%{http_code}\n" $BASE/definitely-not-a-page  # 404
```

Report that URL to Leo — he judges design visually.

---

## 2. The site-own schema

`site_posts` is the only table this repo owns. It does not exist in the
`repeater` database yet.

```bash
cd C:/Users/admin/Documents/ai/gemini/rep
npx wrangler d1 execute repeater --remote --yes --file=schema.sql
npx wrangler d1 execute repeater --remote --yes --file=migrations/002_site_posts.sql
```

Verify:

```bash
npx wrangler d1 execute repeater --remote --yes --command="SELECT name FROM sqlite_master WHERE type='table' AND name='site_posts'"
```

**Do not run anything from `../fivestarrepairs` or `../aphelion` against this
database as part of a site deploy.** Those tables (`products`, `trade_accounts`,
`price_breaks`, `wholesale_*`, `orders`) already exist and are owned elsewhere.
`schema.sql` here is additive only, by design.

Until this runs, `/api/posts` returns `{ok:true,posts:[]}` and `/blog` shows its
empty state — both correct, neither an error.

---

## 3. Bind repeater.com.au — AFTER §0

Only once `facts.test.mjs` is green with `REPEATER_CUSTOM_DOMAIN` set.

1. Cloudflare dashboard → **Workers & Pages → repeater-site → Custom domains →
   Set up a custom domain** → `repeater.com.au`.
2. Confirm the DNS record Cloudflare proposes. If `repeater.com.au` is not
   already in this Cloudflare account, the zone has to be added first — that is
   a registrar-level change and Leo's call, not an agent's.
3. Add the apex → `www` redirect if `www` is wanted (`_redirects` already covers
   in-site aliases but not cross-host ones).

Then set `site_url` (§4, step 1) — without it the beacon is inert.

---

## 4. Aphelion-side registration — MUTATES LIVE PRODUCTION

**Nothing here has been run.** aphelion is live and serves three businesses;
these steps are the only place this project reaches outside its own repo.

### 4.1 `site_url` (required for the traffic beacon)

Without it the beacon silently answers 204: aphelion's `functions/api/t.js`
echoes an `Origin` header only when it exactly matches the registry row's
`site_url`, and never `*`.

```bash
# In aphelion (Admin → Businesses, or via the registry API):
PATCH /api/admin/businesses
{ "slug": "repeater", "site_url": "https://repeater.com.au" }
```

### 4.2 Branding (currently WRONG — inheriting Five Star Repairs)

`repeater` has never had migration `010_business_branding.sql`'s fields set, so
it inherits `DEFAULT_BRANDING`: **Five Star Repairs' name, from-address and the
`fsr-` bounce prefix.** Any email the platform sends as Repeater currently looks
like it came from FSR. `PATCH`, never `POST`:

```bash
PATCH /api/admin/businesses
{
  "slug": "repeater",
  "from_email": "Repeater <orders@repeater.com.au>",
  "bounce_prefix": "repeater-",
  "app_url": "https://repeater.com.au",
  "review_url": "",
  "signature": "Repeater — wholesale supply for repair businesses"
}
```

`signature` and `review_url` are Leo's wording to decide; the values above are
suggestions, not facts.

### 4.3 Status flip

`repeater` flips to `live` only once the `DB_REPEATER` binding exists in the
Pages project's env — aphelion answers `409 needsProvisioning` until then.
aphelion's runbook says of that guard: *"that guard is intentional, don't remove
it."*

### 4.4 `SESSION_SECRET`

Only needed if this project ever grows an admin. If it does, it must be
**byte-identical** to aphelion's, or the shared `fsr_session` cookie will not
cross-verify. This site has no admin and does not read that cookie today.

---

## 5. Content the owner supplies (not an agent)

| Where | What |
|---|---|
| aphelion → **Admin → References** | Testimonials, client logos and headline figures. The site fetches them via `GET /api/proof`. **Empty means the block is removed from the DOM entirely** — no placeholder, no skeleton. Entering them makes sections appear on `/`, `/about`. |
| `repeater` D1 → `products`, `price_breaks` | The catalogue. `/catalogue` switches from the gated state to a real grid and price list on its own. |
| `repeater` D1 → `site_posts` | Blog posts. Insert with `status='draft'` first; drafts are never served. |
| `public/assets/facts.js` | ABN, phone, address, dispatch SLA, delivery, warranty, minimum order. |

A raster `og:image` (1200×630) is generated and committed at
`public/assets/img/og.png` — a brand card with the mark, no words, because
typesetting one without a font rasteriser would have meant hand-drawing a bitmap
font. **Worth replacing with a designed version carrying the tagline before any
paid promotion**, but it is valid and on-brand as it stands.

---

## 6. Rollback

Cloudflare Pages → **Deployments** → any earlier deployment → *Rollback*. No
database migration in this repo is destructive, and `002_site_posts.sql` is
re-runnable, so a rollback needs no schema step.