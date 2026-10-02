/**
 * Blog article route — /blog/<slug>
 *
 * Shadows the static template at public/blog/article.html: the template holds
 * the chrome (nav, footer, CTA band, head) exactly once, and this function fills
 * its data-slot regions from `site_posts`. That keeps the header and footer
 * copy-pasted in ONE place rather than duplicated into a JS template string
 * where it would immediately drift from the other twelve pages.
 *
 * A draft, a missing slug, or a database that isn't bound all return the real
 * 404 page with a 404 status — a draft must never be readable by guessing its
 * slug, which is the whole reason `status` is checked in the WHERE clause rather
 * than after the fetch.
 *
 * Degrades gracefully: no DB_REPEATER binding yields a 404, not a 500.
 */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/i;

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/** Replace the inner content of the element carrying data-slot="name". */
function setText(html, slot, value) {
  const re = new RegExp(`(<([a-z0-9]+)[^>]*data-slot="${slot}"[^>]*>)[\\s\\S]*?(</\\2>)`, "i");
  return html.replace(re, `$1${value}$3`);
}

/** Set (or add) an attribute on the element carrying data-slot="name". */
function setAttr(html, slot, attr, value) {
  const withAttr = new RegExp(`(<[^>]*data-slot="${slot}"[^>]*?\\s${attr}=")[^"]*(")`, "i");
  if (withAttr.test(html)) return html.replace(withAttr, `$1${value}$2`);
  const el = new RegExp(`(<[^>]*data-slot="${slot}")`, "i");
  return html.replace(el, `$1 ${attr}="${value}"`);
}

function prettyDate(v) {
  const s = clean(v, 40);
  if (!s) return "";
  return s.slice(0, 10);
}

/**
 * Minimal, deliberately non-HTML renderer.
 *
 * Post bodies are stored as plain text and are ALWAYS escaped — stored HTML
 * would be a stored-XSS hole reachable from anywhere that writes a post. So the
 * only formatting supported is the small set below, on blank-line-separated
 * blocks:
 *   ## Heading      -> h2
 *   ### Heading     -> h3
 *   - item          -> list item (consecutive lines group into one <ul>)
 *   anything else   -> paragraph
 */
function renderBody(text) {
  const raw = String(text == null ? "" : text).replace(/\r\n/g, "\n").trim();
  if (!raw) return '<p class="muted">This post has no body yet.</p>';

  const blocks = raw.split(/\n{2,}/);
  const out = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      out.push("<ul>" + lines.map((l) => "<li>" + esc(l.replace(/^[-*]\s+/, "")) + "</li>").join("") + "</ul>");
      continue;
    }

    if (lines.length === 1 && /^###\s+/.test(lines[0])) {
      out.push("<h3>" + esc(lines[0].replace(/^###\s+/, "")) + "</h3>");
      continue;
    }
    if (lines.length === 1 && /^##\s+/.test(lines[0])) {
      out.push("<h2>" + esc(lines[0].replace(/^##\s+/, "")) + "</h2>");
      continue;
    }

    out.push("<p>" + esc(lines.join(" ")) + "</p>");
  }

  return out.join("\n");
}

function json(body, status, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

/** Serve a real static page (404.html) with the right status. */
async function staticPage(env, request, path, status) {
  const assets = env && env.ASSETS;
  if (assets && typeof assets.fetch === "function") {
    try {
      const url = new URL(path, new URL(request.url).origin);
      const res = await assets.fetch(new Request(url.toString(), { headers: request.headers }));
      if (res.ok) {
        return new Response(res.body, {
          status,
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      }
    } catch {
      /* fall through to the plain fallback below */
    }
  }
  return new Response(
    "<!DOCTYPE html><html lang=\"en-AU\"><head><meta charset=\"utf-8\"><title>" +
      (status === 404 ? "Not found" : "Error") +
      " — Repeater</title><meta name=\"robots\" content=\"noindex\"></head><body>" +
      "<h1>" + (status === 404 ? "That page isn't here." : "Something went wrong.") + "</h1>" +
      "<p><a href=\"/blog\">All posts</a> · <a href=\"/\">Home</a></p></body></html>",
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

export async function onRequestGet({ request, env, params }) {
  const slug = clean(params && params.slug, 120);
  if (!slug || !SLUG_RE.test(slug)) return staticPage(env, request, "/404.html", 404);

  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return staticPage(env, request, "/404.html", 404);

  let post = null;
  try {
    post = await db
      .prepare(
        "SELECT slug, title, excerpt, body, author, cover_url, published_at " +
          "FROM site_posts WHERE slug = ? AND status = 'published' LIMIT 1"
      )
      .bind(slug)
      .first();
  } catch {
    return staticPage(env, request, "/404.html", 404);
  }

  // Checked in the WHERE clause above, and again here so a future refactor of
  // the query cannot quietly turn a draft into a public page.
  if (!post || !post.slug) return staticPage(env, request, "/404.html", 404);

  // The chrome comes from the static template, so nav/footer stay identical to
  // every other page on the site.
  const assets = env && env.ASSETS;
  let html = null;
  if (assets && typeof assets.fetch === "function") {
    try {
      const url = new URL("/blog/article.html", new URL(request.url).origin);
      const res = await assets.fetch(new Request(url.toString()));
      if (res.ok) html = await res.text();
    } catch {
      /* handled below */
    }
  }
  if (!html) return staticPage(env, request, "/404.html", 404);

  const title = clean(post.title, 200) || "Article";
  const excerpt = clean(post.excerpt, 400);
  const canonical = "https://repeater.com.au/blog/" + encodeURIComponent(slug);
  const date = prettyDate(post.published_at);
  const author = clean(post.author, 80);

  const metaBits = [];
  if (date) metaBits.push('<span>' + esc(date) + "</span>");
  if (author) metaBits.push("<span>" + esc(author) + "</span>");

  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: excerpt,
    url: canonical,
    datePublished: date || undefined,
    author: author ? { "@type": "Person", name: author } : undefined,
    publisher: { "@type": "Organization", name: "Repeater", url: "https://repeater.com.au/" },
    image: "https://repeater.com.au/assets/img/og.png",
  }).replace(/</g, "\\u003c");

  html = setText(html, "title", esc(title) + " — Repeater");
  html = setAttr(html, "description", "content", esc(excerpt || title));
  html = setAttr(html, "canonical", "href", esc(canonical));
  html = setAttr(html, "ogtitle", "content", esc(title + " — Repeater"));
  html = setAttr(html, "ogdescription", "content", esc(excerpt || title));
  html = setAttr(html, "ogurl", "content", esc(canonical));
  html = setText(html, "jsonld", jsonld);
  html = setText(html, "meta", metaBits.join(""));
  html = setText(html, "h1", esc(title));
  html = setText(html, "body", renderBody(post.body));

  // A published post IS indexable; the template ships noindex only so the raw
  // template can never be indexed by a stray crawl.
  html = html.replace(/<meta name="robots" content="noindex,follow">/,
    '<meta name="robots" content="index,follow">');

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}

export function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET" });
}