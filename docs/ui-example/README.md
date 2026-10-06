# UI example — the Repeater shop-style rebuild

A high-fidelity, browser-ready reference for the rebuild of repeater.com.au.
Same design system as the live site (site.css tokens, Jost/Inter, hairline
rules) — restructured shop-style. Served nowhere; it lives in `docs/`, which
Cloudflare Pages never publishes.

## What's here

| File | Shows |
|---|---|
| `index.html` | Shop-style home: the copy shrinks, and the **three products are the hero** — equal cards, real prices, one CTA each |
| `phones.html` | The /phones fix: **PA-1 / PA-2 side by side**, day-one price as the headline, every cap in a scannable list, fine print under each card, plus a fees table |
| `ai.html` | The /ai page with the **numpad**: type the number, hit OK, Jarvis calls you with the walkthrough (live on the site already — `POST /api/ai-demo-call`) |
| `assets/shop.css` | The NEW components only (`.product`, `.plan`, `.plans`, `.planstrip`, `.hero--shop`, numpad already merged in `site.css`) — merge these into `site.css` in the rebuild |
| `assets/site.css` | The live stylesheet, verbatim (font URLs made relative for this folder) |

## Viewing

```bash
cd docs/ui-example && python3 -m http.server 8777
# http://localhost:8777  (open in a browser; nav links point at real /paths)
```

## Rules for whoever ports this (qwen or otherwise)

- Copy the **structure and classes**, not the words verbatim — wording gets its
  own pass (see `docs/PROMPT-6-*` for the voice and positioning spec).
- Keep prices exactly as canon: $622 / $5.60-wk / $49-$149-$399 — never re-derive.
- Keep the numpad markup, `data-numpad*` attributes and `/api/ai-demo-call`
  contract exactly — the endpoint is live and the JS is shipped.
- One accent button above the fold; hairline rules; no new colours.
