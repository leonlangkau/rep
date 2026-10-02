/**
 * Catalogue renderer — product grid, category chips and the trade
 * volume-break table, all from GET /api/catalogue.
 *
 * THE PAGE'S NORMAL STATE IS THE EMPTY ONE. Leo confirmed on 2026-10-02 that
 * DB_REPEATER.products holds nothing yet, so the gated-pricing panel that ships
 * visible in the markup is not a fallback — it is the design. Everything below
 * exists so the page starts working the moment products are loaded, without
 * anyone touching the HTML again.
 *
 * When there IS stock it shows what a trade buyer actually needs: identity,
 * availability, and the break ladder. It never prints a retail price —
 * /api/catalogue does not select one, and this file would have nothing to print
 * if it did.
 */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "";
    try {
      return new Intl.NumberFormat("en-AU", {
        style: "currency", currency: "AUD",
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(v);
    } catch (e) {
      return "$" + v.toFixed(2);
    }
  }

  function titleCase(s) {
    s = String(s || "");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function showSectionOf(el) {
    if (!el) return;
    var sec = el.closest ? el.closest("section") : null;
    if (sec) sec.hidden = false;
  }

  /* ---------------- chips ---------------- */

  function renderChips(host, categories) {
    if (!host) return;
    if (!categories.length) return;
    host.innerHTML = categories.map(function (c) {
      return '<a class="chip" href="#catalogue">' + esc(titleCase(c)) + "</a>";
    }).join("");
    showSectionOf(host);
  }

  /* ---------------- product grid ---------------- */

  function renderGrid(host, products) {
    if (!host) return;
    if (!products.length) return;

    host.innerHTML = products.map(function (p, i) {
      var meta = [p.brand, titleCase(p.condition)].filter(Boolean).join(" · ");
      return '<article class="card rv" style="--d:' + (i % 4) * 60 + 'ms">' +
        '<span class="card__num">' + esc(titleCase(p.category)) + "</span>" +
        "<h3>" + esc(p.name) + "</h3>" +
        (meta ? '<p class="sm faint">' + esc(meta) + "</p>" : "") +
        (p.description ? "<p>" + esc(p.description) + "</p>" : "") +
        '<p style="margin-top:var(--space-4)">' +
          '<span class="chip">' + (p.in_stock ? "In stock" : "On order") + "</span>" +
        "</p>" +
        "</article>";
    }).join("");

    show(host);
    showSectionOf(host);
  }

  /* ---------------- volume-break table ---------------- */

  /**
   * One row per product, one pair of columns per break tier — i.e. the trade
   * price list itself. Break counts vary per product, so the column count comes
   * from the widest product rather than being fixed.
   */
  function renderBreaks(host, products) {
    if (!host) return;
    var withBreaks = products.filter(function (p) { return p.breaks && p.breaks.length; });
    if (!withBreaks.length) return;

    var cols = 0;
    withBreaks.forEach(function (p) { cols = Math.max(cols, p.breaks.length); });
    cols = Math.min(cols, 6);

    var head = "<tr><th>Product</th>";
    for (var c = 0; c < cols; c++) head += "<th>Break " + (c + 1) + "</th>";
    head += "</tr>";

    var body = withBreaks.map(function (p) {
      var cells = "";
      for (var c = 0; c < cols; c++) {
        var b = p.breaks[c];
        cells += b
          ? '<td class="num"><b>' + esc(money(b.unit_price_ex)) + "</b><br><span class=\"faint\">" + esc(b.min_qty) + "+ units</span></td>"
          : '<td class="num faint">&mdash;</td>';
      }
      return "<tr><td>" + esc(p.name) + (p.brand ? '<br><span class="faint">' + esc(p.brand) + "</span>" : "") + "</td>" + cells + "</tr>";
    }).join("");

    host.innerHTML =
      '<div class="table-wrap"><table><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      '<p class="breaks__note">All prices are GST-exclusive, in AUD. Quantity breaks apply automatically to the volume on the line.</p>';

    show(host);
    showSectionOf(host);
  }

  function render(data) {
    var d = data || {};
    var products = d.products || [];
    var categories = d.categories || [];

    var empty = document.querySelector('[data-catalogue="empty"]');
    var grid = document.querySelector('[data-catalogue="grid"]');
    var breaks = document.querySelector('[data-catalogue="breaks"]');
    var chips = document.querySelector('[data-catalogue="chips"]');

    if (!products.length) {
      // The gated state is already visible in the markup; make sure it stays
      // that way and that nothing half-built is showing.
      show(empty);
      hide(grid);
      hide(breaks);
      return;
    }

    hide(empty);
    renderChips(chips, categories);
    renderGrid(grid, products);
    renderBreaks(breaks, products);

    if (window.repHydrate) window.repHydrate();
  }

  fetch("/api/catalogue", { headers: { accept: "application/json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { render(d || {}); })
    .catch(function () { render({}); });
})();