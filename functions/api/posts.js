/**
 * Public blog posts API.
 *
 * GET /api/posts           -> { ok, posts: [...] }  (latest 3, for the home teaser)
 * GET /api/posts?all=1     -> { ok, posts: [...] }  (up to 50, for /blog)
 *
 * Reads `site_posts` from DB_REPEATER — the one table this repo owns outright
 * (schema.sql + migrations/002_site_posts.sql).
 *
 * Only status = 'published' is ever returned, and `body` is never included: the
 * index pages need headings and excerpts, and the full article is served by
 * functions/blog/[slug].js. A draft row must not be able to leak through the
 * list any more than through the article route.
 *
 * Degrades gracefully: no binding, no table, or a drifted schema all yield
 * { ok: true, posts: [] }, so the consuming block removes itself rather than
 * showing a broken rail.
 */

const MAX_LIST = 50;
const MAX_TEASER = 3;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

export async function onRequestGet({ request, env }) {
  const empty = { ok: true, posts: [] };
  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return json(empty);

  let limit = MAX_TEASER;
  try {
    const q = new URL(request.url).searchParams;
    if (q.get("all") === "1") limit = MAX_LIST;
  } catch {
    /* default teaser count */
  }

  let rows = [];
  try {
    const r = await db
      .prepare(
        "SELECT slug, title, excerpt, author, cover_url, published_at " +
          "FROM site_posts WHERE status = 'published' " +
          "ORDER BY published_at DESC, id DESC LIMIT ?"
      )
      .bind(limit)
      .all();
    rows = (r && r.results) || [];
  } catch {
    return json(empty);
  }

  return json({
    ok: true,
    posts: rows.map((r) => ({
      slug: clean(r.slug, 120),
      title: clean(r.title, 200),
      excerpt: clean(r.excerpt, 400),
      author: clean(r.author, 80),
      cover_url: clean(r.cover_url, 500),
      published_at: clean(r.published_at, 40),
    })),
  }, 200, { "cache-control": "public, max-age=60" });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET" });
}