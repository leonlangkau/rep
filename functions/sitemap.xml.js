/**
 * /sitemap.xml
 *
 * A literal dotted filename under functions/ is the house way to route an
 * extension — Cloudflare Pages matches the file name against the path, so no
 * rewriting or _redirects entry is involved.
 *
 * Every route is probed through env.ASSETS before it is listed. A sitemap that
 * advertises a 404 is worse than a short sitemap, and this site will grow pages
 * over time — so the list is derived from what actually exists rather than from
 * a hardcoded array someone forgets to update.
 *
 * Published posts are appended when DB_REPEATER is bound. With no binding, the
 * static routes still ship — the sitemap must never 500 for a missing database.
 */

const ORIGIN = "https://repeater.com.au";

/** path, changefreq, priority. Order is the order in the sitemap. */
const ROUTES = [
  ["/", "weekly", "1.0"],
  ["/phones", "monthly", "0.9"],
  ["/ai", "monthly", "0.9"],
  ["/shop-os", "monthly", "0.9"],
  ["/shop-os/pricing", "monthly", "0.8"],
  ["/websites", "monthly", "0.9"],
  ["/catalogue", "weekly", "0.7"],
  ["/wholesale", "monthly", "0.7"],
  ["/pricing", "monthly", "0.7"],
  ["/apply", "monthly", "0.6"],
  ["/about", "monthly", "0.6"],
  ["/blog", "weekly", "0.6"],
  ["/contact", "monthly", "0.5"],
  ["/privacy", "yearly", "0.2"],
  ["/terms", "yearly", "0.2"],
];
// /shop-os/checkout is deliberately absent: it is noindex and every real entry
// point is the pricing page.

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function exists(env, request, path) {
  const assets = env && env.ASSETS;
  if (!assets || typeof assets.fetch !== "function") return true; // no way to check; list it
  try {
    const url = new URL(path, new URL(request.url).origin);
    const res = await assets.fetch(new Request(url.toString()));
    return !!res && res.ok;
  } catch {
    return false;
  }
}

function urlEntry(loc, changefreq, priority, lastmod) {
  return (
    "  <url>\n" +
    "    <loc>" + esc(loc) + "</loc>\n" +
    (lastmod ? "    <lastmod>" + esc(lastmod) + "</lastmod>\n" : "") +
    "    <changefreq>" + esc(changefreq) + "</changefreq>\n" +
    "    <priority>" + esc(priority) + "</priority>\n" +
    "  </url>"
  );
}

export async function onRequestGet({ request, env }) {
  const entries = [];

  for (const [path, changefreq, priority] of ROUTES) {
    if (await exists(env, request, path === "/" ? "/index.html" : path + "/index.html")) {
      entries.push(urlEntry(ORIGIN + path, changefreq, priority, null));
    } else if (await exists(env, request, path)) {
      // A flat .html file at the root (privacy, terms).
      entries.push(urlEntry(ORIGIN + path, changefreq, priority, null));
    }
  }

  // Published posts only — the same status filter the article route uses.
  const db = env && env.DB_REPEATER;
  if (db && typeof db.prepare === "function") {
    try {
      const r = await db
        .prepare(
          "SELECT slug, published_at FROM site_posts WHERE status = 'published' " +
            "ORDER BY published_at DESC LIMIT 500"
        )
        .all();
      for (const row of (r && r.results) || []) {
        const slug = String(row.slug || "").trim();
        if (!slug) continue;
        entries.push(
          urlEntry(ORIGIN + "/blog/" + encodeURIComponent(slug), "monthly", "0.5",
            String(row.published_at || "").slice(0, 10) || null)
        );
      }
    } catch {
      /* no table yet — ship the static routes */
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join("\n") +
    "\n</urlset>\n";

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export function onRequest(context) {
  if (context.request.method === "GET" || context.request.method === "HEAD") return onRequestGet(context);
  return new Response("Method not allowed.", { status: 405, headers: { allow: "GET" } });
}