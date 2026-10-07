/**
 * Blog post lists, the home-page teaser and the /blog index.
 *
 * Markup contract:
 *   [data-posts="latest"]  up to 3 posts   (home)
 *   [data-posts="all"]     up to 50 posts  (blog index)
 *   [data-posts="empty"]   the "nothing published yet" panel
 *
 * The empty panel ships VISIBLE and the list ships `hidden`, so a visitor with
 * JavaScript disabled gets an honest sentence instead of a blank grid or a
 * spinner that never resolves. With JS, whichever state is wrong flips.
 *
 * Post bodies are never fetched here, /api/posts returns headings and excerpts
 * only, so a draft cannot leak through a list any more than through the
 * article route.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** "2026-08-14" or an ISO timestamp -> "14 August 2026". Never throws. */
  function prettyDate(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    try {
      var d = new Date(s.length <= 10 ? s + "T00:00:00" : s);
      if (isNaN(d.getTime())) return s;
      return new Intl.DateTimeFormat("en-AU", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Melbourne"
      }).format(d);
    } catch (e) {
      return s;
    }
  }

  function card(p, i) {
    var meta = [prettyDate(p.published_at), p.author].filter(Boolean).join(" · ");
    return '<a class="post rv" href="/blog/' + esc(encodeURIComponent(p.slug)) + '" style="--d:' + (i * 60) + 'ms">' +
      (meta ? '<span class="post__meta">' + esc(meta) + "</span>" : "") +
      "<h3>" + esc(p.title) + "</h3>" +
      (p.excerpt ? "<p>" + esc(p.excerpt) + "</p>" : "") +
      '<span class="post__more">Read &rarr;</span>' +
      "</a>";
  }

  var host =
    document.querySelector('[data-posts="latest"]') ||
    document.querySelector('[data-posts="all"]');
  if (!host) return;

  var wantAll = host.getAttribute("data-posts") === "all";
  var url = wantAll ? "/api/posts?all=1" : "/api/posts";

  fetch(url, { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var posts = (d && d.posts) || [];
      var empty = document.querySelector('[data-posts="empty"]');

      if (!posts.length) {
        if (empty) empty.hidden = false;
        host.hidden = true;
        return;
      }

      if (empty) empty.hidden = true;
      host.innerHTML = posts.map(card).join("");
      host.hidden = false;

      // The blog index has no section wrapper to reveal; the home teaser does.
      var sec = host.closest ? host.closest("section") : null;
      if (sec) sec.hidden = false;

      if (window.repHydrate) window.repHydrate();
    })
    .catch(function () {
      // Leave the empty panel visible, it is the honest state when we cannot
      // confirm there is anything to show.
      var empty = document.querySelector('[data-posts="empty"]');
      if (empty) empty.hidden = false;
      host.hidden = true;
    });
})();