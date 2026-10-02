/**
 * References renderer — the site's testimonials, figures, service-level bars and
 * client logos, all from GET /api/proof.
 *
 * Ported in spirit from aphelion/public/assets/references.js, extended here to
 * four blocks instead of one.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE. Aphelion migration 028 puts it plainly:
 * "the site never invents a testimonial, and never shows an unfinished
 * placeholder either." So when a list comes back empty, the WHOLE SECTION is
 * removed from the DOM — not hidden, not filled with a skeleton, not replaced by
 * a cheerful "coming soon". A page that looks complete without references is the
 * design, and the markup ships those sections `hidden` so a no-JS visitor never
 * sees an empty band either.
 *
 * Never throws: a failed fetch removes the sections, which is the same visual
 * result as an empty proof table.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** The section that contains a block, so an empty list can remove the whole thing. */
  function sectionOf(el) {
    return el.closest ? el.closest("section") : null;
  }

  function drop(el) {
    var sec = sectionOf(el);
    if (sec) sec.remove();
    else el.remove();
  }

  function show(el) {
    var sec = sectionOf(el);
    if (sec) sec.hidden = false;
  }

  /**
   * Split "95%" or "+38%" or "12,450" into prefix / number / suffix so the
   * counter can animate the numeric part and keep the decoration. Returns null
   * for anything that isn't a number, in which case the figure is printed as-is
   * rather than animated.
   */
  function numberParts(s) {
    var m = /^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/.exec(String(s == null ? "" : s).trim());
    if (!m) return null;
    var n = Number(m[2].replace(/,/g, ""));
    if (!isFinite(n)) return null;
    return { prefix: m[1], num: n, suffix: m[3], decimals: (m[2].split(".")[1] || "").length };
  }

  /* ---------------- logos → marquee ---------------- */

  function renderLogos(host, rows) {
    if (!rows.length) { drop(host); return; }

    function set() {
      return rows.map(function (l) {
        var inner = l.image_url
          ? '<img src="' + esc(l.image_url) + '" alt="' + esc(l.title) + '" loading="lazy">'
          : esc(l.title);
        return l.link_url
          ? '<a class="marquee__item" href="' + esc(l.link_url) + '" rel="noopener">' + inner + "</a>"
          : '<span class="marquee__item">' + inner + "</span>";
      }).join("");
    }

    // Two identical sets, because the keyframes translate by exactly -50%.
    host.innerHTML =
      '<div class="marquee__set">' + set() + "</div>" +
      '<div class="marquee__set" aria-hidden="true">' + set() + "</div>";

    show(host);
  }

  /* ---------------- figures → stat cards ---------------- */

  function renderFigures(host, rows) {
    if (!rows.length) { drop(host); return; }

    host.innerHTML = rows.map(function (f, i) {
      var parts = numberParts(f.title);
      var fig = parts
        ? '<span class="stat__fig" data-count="' + parts.num + '" data-prefix="' + esc(parts.prefix) +
          '" data-suffix="' + esc(parts.suffix) + '" data-decimals="' + parts.decimals + '">' + esc(f.title) + "</span>"
        : '<span class="stat__fig">' + esc(f.title) + "</span>";
      return '<div class="stat rv" style="--d:' + (i * 60) + 'ms">' + fig +
        (f.body ? '<p class="stat__label">' + esc(f.body) + "</p>" : "") +
        (f.attribution ? '<p class="stat__src">' + esc(f.attribution) + "</p>" : "") +
        "</div>";
    }).join("");

    show(host);
  }

  /* ---------------- figures → service-level bars ---------------- */

  function renderBars(host, rows) {
    // Only figures that actually carry a number make sense as a bar; a count
    // like "12,450" has no natural 0-100 position, so it is left to the stat
    // cards rather than being squeezed onto an axis it doesn't have.
    var usable = [];
    for (var i = 0; i < rows.length; i++) {
      var parts = numberParts(rows[i].title);
      if (parts) usable.push({ row: rows[i], parts: parts });
    }
    if (!usable.length) { drop(host); return; }

    host.innerHTML = usable.map(function (item) {
      var f = item.row;
      var v = Math.max(0, Math.min(100, item.parts.num));
      return '<div class="bar rv">' +
        '<div class="bar__top">' +
          '<span class="bar__label">' + esc(f.body || f.attribution || f.title) + "</span>" +
          '<span class="bar__val">' + esc(f.title) + "</span>" +
        "</div>" +
        '<div class="bar__track"><span class="bar__fill" data-value="' + v + '"></span></div>' +
        "</div>";
    }).join("");

    show(host);
  }

  /* ---------------- quotes → proof grid ---------------- */

  function renderQuotes(host, rows) {
    if (!rows.length) { drop(host); return; }

    host.innerHTML = rows.map(function (q, i) {
      return '<figure class="quote rv" style="--d:' + (i * 60) + 'ms">' +
        "<blockquote>" + esc(q.body) + "</blockquote>" +
        (q.attribution ? "<cite>" + esc(q.attribution) + "</cite>" : "") +
        "</figure>";
    }).join("");

    show(host);
  }

  function render(data) {
    var d = data || {};
    var quotes = d.quotes || [], figures = d.figures || [], logos = d.logos || [];

    var logoHost = document.querySelector('[data-proof="logos"]');
    if (logoHost) renderLogos(logoHost, logos);

    var barHost = document.querySelector('[data-proof="bars"]');
    if (barHost) renderBars(barHost, figures);

    var figHost = document.querySelector('[data-proof="figures"]');
    if (figHost) renderFigures(figHost, figures);

    var quoteHost = document.querySelector('[data-proof="quotes"]');
    if (quoteHost) renderQuotes(quoteHost, quotes);

    if (window.repHydrate) window.repHydrate();
  }

  fetch("/api/proof", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { render(d || {}); })
    .catch(function () { render({}); });
})();