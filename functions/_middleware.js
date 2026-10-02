/**
 * Site-wide middleware — the aphelion traffic beacon installer.
 *
 * Modelled on fivestarrepairs/functions/_middleware.js.
 *
 * Injects one tag into every HTML response, so all thirteen pages plus the
 * blog's server-rendered output need no per-file edit:
 *
 *   <script defer data-b="repeater" src="https://aphelion.ltd/t.js"></script>
 *
 * `data-b="repeater"` is the actual declaration of which business this site is.
 * There is no config file in this repo naming the slug; the beacon resolves it
 * to the registry row, and aphelion then echoes CORS only for an origin that
 * exactly matches that row's `site_url` — never "*". So a new site is inert
 * until its registry row is set, which is deliberate and is why
 * docs/SETUP-deploy.md has a step for it.
 *
 * The beacon itself is Aphelion-owned, drops no cookies, stores no raw IPs, and
 * always answers 204 — a beacon outage can never affect this site.
 *
 * FSR also injects a visitor logger and an address gate. Neither applies here:
 * there is no /visitor-log.js in this repo, and no street address to reveal.
 *
 * The injection is idempotent (`if (!html.includes(...))`), so a page can never
 * end up carrying two copies. The body has been read by then, so the Response is
 * ALWAYS rebuilt — returning `res` unchanged would hand Cloudflare a consumed
 * body and the page would arrive empty.
 */

export async function onRequest(context) {
  const res = await context.next();

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return res;

  const html = await res.text();

  const tags = [];
  if (!html.includes("/t.js") && html.includes("</head>")) {
    tags.push('<script defer data-b="repeater" src="https://aphelion.ltd/t.js"></script>');
  }

  const out = tags.length ? html.replace("</head>", tags.join("") + "</head>") : html;

  return new Response(out, {
    status: res.status,
    headers: res.headers,
  });
}