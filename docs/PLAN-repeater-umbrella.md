# PLAN — Repeater umbrella restructure (phones · AI calls · Repair Shop OS)

> **Written 2026-10-03.** Supersedes the wholesale-only positioning in
> `PLAN-repeater-site.md`, while keeping everything that plan got right: the design
> system, the block catalogue, the content-honesty rules and the test suite. Read both —
> this one describes the *business*, that one describes the *craft*.
>
> Context: the site was built as a parts-wholesale counter. Leo then described the actual
> offering on 2026-10-03: *"we sell phone with repair plans and also AI call pick uper and
> also backend, saas."* The site is currently selling one facet — and, awkwardly, a facet
> that is listed as a **feature of the SaaS product**, not as the business.

---

## 0. What changed

| | Was | Now |
|---|---|---|
| Repeater is | a wholesale parts counter | the umbrella brand for three products |
| The hero sells | screens, batteries, boards | phones for tradies, AI call answering, Repair Shop OS |
| Parts wholesale | the whole pitch | supporting depth (`/catalogue`, `/wholesale`, `/pricing` kept) |
| SaaS | not mentioned on this site | a rebuilt in-site product with real pricing |
| Payments | n/a here | Revolut Merchant (see §5) — not Square, not Stripe |

## 1. The three pillars, as Leo described them

**1 · Fleet phones for tradies, repairs included.**
*"sold to tradies … like a couple phones in a fleet to tradies and since they break it
often we include repairs in the deal."*
Buyer: tradespeople and small contractors — electricians, plumbers, builders, sparkies.
Deal shape: a small fleet (a couple of handsets, realistically 2–10), **repairs bundled
in** because the phones get destroyed on site. This is device-as-a-service for trades, not
a retail handset sale. It is also not the same buyer as the OS: tradies buy phones, *shops*
buy the OS.

**2 · AI call answering.**
*"its primarially targeted to tradies it automatically takes bookings, answers calls,
answers questions and such, but also can be sold to other bussiness."*
Primary buyer: tradies — the same person as pillar 1, who is on a roof with a tool in one
hand and cannot answer the phone, and for whom a missed call is a lost job. It **takes
bookings, answers calls, answers questions**. Secondary: any business with the same
problem, so the page should not read as trades-only.

**3 · The Repair Shop OS.**
Already built and live (`aphelion.ltd/shop-os`): bookings, workshop, inventory, accounting,
marketing, B2B wholesale and wealth in one panel, sold to other repair shops with real
pricing — **Starter $49 / Business $149 / Enterprise $399 AUD per month, GST-exclusive, free
trial, no card to start.** Leo decided 2026-10-03 to **rebuild the page inside Repeater**.

Plus **trade supply** as depth, not a pillar: the existing parts/trade-account business.
`/catalogue`, `/wholesale` and `/pricing` are built, tested and reviewed — keep them, and
stop leading with them. This is a judgement call (the question went unanswered); veto it if
wrong, and the change is small because it is a link-and-framing decision, not a rewrite.

## 2. Why the current hero is actively misleading

The OS page already lists **"B2B wholesale — trade accounts, credit limits, negotiated
pricing and quotes that convert to orders"** as one of six OS capabilities. So a visitor who
reads `repeater.com.au` today learns that Repeater wholesales parts, and nothing about the
phones, the AI or the OS — while the OS product page quietly lists wholesale as a feature.
Fixing that overlap is the point of this restructure, not a side effect.

## 3. Navigation and page map

Nav: **Phones · AI Calls · Shop OS · Trade supply · About** + one CTA.

The CTA changes from *"Apply for a trade account"* to **"Book a call"** on the umbrella
pages (a 90-second conversation decides which of the three a visitor actually needs), and
stays *"Apply for a trade account"* only inside the trade-supply pages.

| Route | File | Status |
|---|---|---|
| `/` | `public/index.html` | **rewrite** — umbrella hero + three pillars |
| `/phones` | `public/phones/index.html` | **new** |
| `/ai` | `public/ai/index.html` | **new** |
| `/shop-os` | `public/shop-os/index.html` | **new** (rebuilt from aphelion's) |
| `/shop-os/pricing` | `public/shop-os/pricing.html` | **new** (real tiers, §4) |
| `/shop-os/checkout` | `public/shop-os/checkout.html` | **new** (§5) |
| `/catalogue` `/wholesale` `/pricing` | — | **reframe** copy only; structure stays |
| `/about` | — | **reframe** — umbrella story, not just a parts counter |
| `/blog` `/contact` `/apply` `/privacy` `/terms` `/404` | — | copy touch-ups |

`/pricing` needs a decision: it is currently *trade* pricing (volume breaks, GST-exclusive
terms). With three products it becomes ambiguous. **Plan: keep `/pricing` as trade pricing**,
and price the OS on `/shop-os/pricing`. Phones and AI calls are quoted per enquiry, because
neither has published pricing yet.

## 4. The OS pricing page — real numbers, already written

Copy the tiers from `aphelion/public/shop-os/pricing.html` rather than inventing them:

| Plan | Businesses | Price | Includes |
|---|---|---|---|
| Starter | 1 | from **$49** AUD/mo | Core panel (bookings, workshop, inventory), accounting + BAS-ready figures, email support |
| Business | up to 3 | from **$149** AUD/mo | + B2B wholesale (trade accounts, quotes, orders), marketing (blog, deals, AI writer), priority support |
| Enterprise | unlimited | from **$399** AUD/mo | + wealth dashboard + lender pack, onboarding + data import, dedicated support |

Keep the honest qualifier verbatim in spirit: *"Indicative prices in AUD, GST exclusive,
billed monthly, confirmed on quote. Every plan starts with a free trial — you only pay after
it ends."*

**Product name.** aphelion's pages are titled *"Aphileon — the Repair Shop OS"* and the
wordmark is `Aphileonos`. Rebuilding inside Repeater raises a real branding question — is it
"Aphileon OS" on a Repeater site? **Judgement call: keep the product name unchanged** (never
silently rebrand a live product with paying tenants) and present it as *"Repair Shop OS, by
Repeater"*. Flagged for Leo. The six capability pillars carry over as-is: Workshop,
Inventory, Accounting, Marketing, B2B wholesale, Wealth.

## 5. Payments — Revolut Merchant, not Square or Stripe

Leo, 2026-10-03: *"setup compatibility with square, ill create a new square bussiness name
and also make a webhook for it."* — then, later the same day: **"actually we're moving to
revolut merchant for repeater after that."**

**So the rail is Revolut Merchant, not Square.** This supersedes the earlier Square decision;
it is recorded here only so nobody re-derives it.

Unlike Square, **Revolut appears nowhere in the stack today** — `revolut|REVOLUT_|merchant.revolut`
returns no matches across `aphelion`, `fivestarrepairs` and `rep` — so this is a genuinely new
integration rather than a second rail bolted onto an existing one. It is still the more
coherent choice for a new site: it keeps Repeater's own money separate from FSR's Square
account, which is what "a new business name" was about.

### ⚠ The one thing that is NOT a like-for-like swap

**Revolut Merchant is an orders-and-payment-links API. It is not a subscriptions engine.**
What is verified from Revolut's own docs: create an order, get a `checkout_url`, take a
one-off payment, fulfil on a webhook. That covers phones and any one-off charge perfectly.

The **OS is a monthly subscription** (Starter $49 / Business $149 / Enterprise $399, billed
monthly). Stripe *is* a subscriptions engine and already has live tenants on it. So moving
the OS subscription onto Revolut is not a swap, and there are two real options that are not
equivalent:

1. **Recurring built on top of Revolut orders** — a payment link per period, re-charged on a
   schedule. Aphelion already runs a `scheduler/` Worker, so the cron host exists; but this
   means owning billing logic ourselves, including dunning, failed-card retries and the whole
   `past_due` state machine Stripe currently supplies for free.
2. **Keep Stripe for the OS subscription only, use Revolut for everything else** (phones,
   any one-off). Nothing is rebuilt, no tenant is disturbed, and Revolut still becomes
   Repeater's rail for the new products.

**Recommendation: option 2 now, option 1 as its own project.** Rebuilding recurring billing to
prove a point is the kind of work that quietly costs a quarter. **This needs Leo's call and is
the most important open question on this page.**

### What to build

| Route | File | Behaviour |
|---|---|---|
| `GET /api/shop-os/checkout` | `functions/api/shop-os/checkout.js` | Config probe: reports which rail is live, so the page can hide a button it cannot honour |
| `POST /api/shop-os/checkout` | same | Creates the Revolut order, records a `saas_customers` row, returns `checkout_url` |
| `POST /api/shop-os/revolut-webhook` | `functions/api/shop-os/revolut-webhook.js` | Signature-verified; flips `saas_customers.status` to `active` and writes `saas_subscriptions` |

### Revolut Merchant API — verified from `developer.revolut.com`, not guessed

**Create an order** — **server-side only**; the secret key must never reach the browser.
Required: `amount` in the **smallest denomination** (cents) and `currency` (ISO 4217).
Useful optionals: `description`, `customer.email`, `redirect_url`,
`merchant_order_data.reference` (put the plan and a correlation id there). The response
carries `id`, `token`, `state: "pending"` and the shareable `checkout_url` —
`https://checkout.revolut.com/payment-link/<token>`.

**Webhook verification** — the part that must be exactly right:

- Headers are `Revolut-Signature` (`v1=<hex>`, **comma-separated during key rotation**) and
  `Revolut-Request-Timestamp`, a UNIX timestamp in **milliseconds**.
- The signed string is `"v1." + timestamp + "." + rawBody` — **the raw body, byte for byte.**
  Re-serialising JSON breaks it, so read the body as text once and verify *before* parsing.
- `HMAC-SHA256(signing_secret, signed_string)`, hex, compared **constant-time**, and accept if
  **any** of the listed `v1=` values matches — that is what makes rotation non-breaking.
- **Replay protection:** reject a timestamp outside a **5-minute** window of UTC now. A valid
  signature with a stale timestamp is a replay, not a payment.
- The signing secret is the `wsk_…` value returned when the webhook is created.
- Fulfil on `ORDER_COMPLETED` (or `ORDER_AUTHORISED` under manual capture); handle
  `ORDER_CANCELLED`, `ORDER_FAILED`, `ORDER_PAYMENT_DECLINED`, `ORDER_PAYMENT_FAILED`.
  **Never fulfil on the browser redirect** — it is not proof of payment.

One third-party page describes a Stripe-style `t=…,v1=…` scheme over `"<timestamp>.<body>"`.
It contradicts Revolut's own documentation; follow `developer.revolut.com`.

**Secrets** (Leo creates the Revolut merchant account and the webhook, then sets these on the
Pages project): `REVOLUT_SECRET_KEY`, `REVOLUT_WEBHOOK_SIGNING_SECRET`,
`REVOLUT_ENVIRONMENT` (`sandbox` | `production`).

### Non-negotiable

- Unconfigured Revolut must never break the customer flow. `/api/shop-os/checkout` reports
  `{ok:false, skip:true, reason:"not_configured"}` and the page falls back to the enquiry
  form — the same degradation doctrine as every other endpoint here.
- **Do not touch aphelion's Stripe path.** It has live tenants.
  `saas_customers.stripe_customer_id` and `saas_subscriptions.stripe_subscription_id` stay
  exactly as they are, and **no Revolut id may ever be written into a `stripe_*` column** —
  that would silently corrupt reconciliation. Add `revolut_order_id` / `revolut_payment_id`
  by migration, mirroring the `square_order_id` / `square_payment_id` columns `orders`
  already carries.
- Signature failure, stale timestamp, or unparseable body → **401**, never a silent accept.
  A payment webhook is the one place a permissive default is indefensible.
- **Idempotency:** a webhook can be delivered more than once. Guard the `active` transition
  the way aphelion's `shop/webhook.js` guards `markOrderPaid` — a conditional UPDATE that
  only fires from the pre-paid state.
- This integration **cannot be end-to-end tested here** — it needs Leo's Revolut credentials
  and a real webhook delivery. Build it, unit-test the signature (correct, rotated, stale and
  tampered) plus the state transitions against fixtures, and say plainly in the report that
  the live path is unverified.


## 6. Content honesty, unchanged and now more load-bearing

The rules from `PLAN-repeater-site.md` §5 apply to everything new, and matter more because
two of the three pillars have **no known prices, inclusions or terms**:

- **Phones**: price, what the repair cover includes, excess, term, fair-use, whether a
  handset is included or BYO — all `[OWNER TO CONFIRM]`. The *shape* of the offer (small
  fleet, repairs included) is Leo's own description and is safe to state.
- **AI calls**: what it integrates with, call volumes, pricing, whether there is a trial —
  `[OWNER TO CONFIRM]`. Safe to state: it answers calls, takes bookings, answers questions,
  is aimed at tradies, and can be sold to other businesses.
- **OS**: the pricing above is real and must be copied exactly. Everything else about
  onboarding stays as the live pages state it.
- Testimonials, logos and figures still come from `site_proof` and their blocks are still
  **removed from the DOM** when empty. With three new pages this is now five surfaces that
  must each look complete with nothing published.

## 7. Judgement calls I made (two questions went unanswered)

1. **Trade supply stays as a pillar's worth of depth** rather than being folded into the OS
   or deleted. It is built, tested and reviewed; deleting it destroys real work, and folding
   it into the OS would say "wholesale is only a feature" while the business still takes
   trade accounts.
2. **AI calls get their own page with an enquiry CTA, no published pricing** — the option I
   recommended. He described the product but not its price, and inventing one on a page
   that also says "talk to us" would be worse than not stating it.
3. **The OS keeps its name.** See §4.

Veto any of these and the change is small — they are framing decisions, not structural ones.

## 8. Build order

| Phase | Work | Gate |
|---|---|---|
| **U0** | Nav + footer change across all pages (adds 3 links) | `chrome` suite updated and green |
| **U1** | Home page rewrite: umbrella hero, three pillar blocks, trade-supply demoted to a section | renders complete with `site_proof` empty |
| **U2** | `/phones` and `/ai` — full pages, placeholders where facts are unknown | `chrome` + `site` green; no invented fact |
| **U3** | `/shop-os` landing + `/shop-os/pricing` rebuilt on this design system | pricing figures match §4 exactly |
| **U4** | `/shop-os/checkout` + Revolut endpoints + migration for `revolut_*` columns | signature (valid / rotated / stale / tampered) + state-transition tests green; live path explicitly unverified; **blocked on Leo's recurring-billing call (§5)** |
| **U5** | Reframe `/catalogue`, `/wholesale`, `/pricing`, `/about`; sitemap + `_redirects`; tests | full suite + `imports` green |

Same discipline as before: one coherent commit per phase, pushed to `main`, `WORKLOG`
updated each time, and never a green test obtained by weakening an assertion.

**Still blocked on Leo, unchanged:** the **ABN** (blocks the domain bind), plus phones
pricing, AI call pricing, and the Square credentials for U4.