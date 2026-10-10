/**
 * Repeater, the facts that must not drift.
 *
 * Every hard number, address and contact detail on this site comes from here.
 * Nothing is duplicated into markup: pages carry <span data-fact="ABN"> and this
 * file fills them.
 *
 * WHY THIS FILE EXISTS. The site was built while several facts were still
 * unknown. Rather than scattering "[OWNER TO CONFIRM]" through eleven pages and
 * hoping someone greps for it later, every unresolved value is a single
 * PLACEHOLDER constant, rendered through one helper, and tests/facts.test.mjs
 * fails the build if one of them reaches a custom domain. Never invent any of
 * these, an ABN on an Australian B2B site is a legal requirement, and a wrong
 * one is worse than a missing one.
 *
 * Progressive enhancement: the markup already contains the muted placeholder, so
 * with JavaScript disabled the page still reads honestly. This script only ever
 * REPLACES a placeholder with a real value, it never introduces one.
 *
 * WHICH VALUES ARE REAL: EMAIL_ORDERS and EMAIL_FLEET are evidenced in
 * aphelion/tests/sending-domains.test.mjs. TERMS_DAYS is evidenced by
 * aphelion/migrations/007_b2b_wholesale.sql (trade_accounts.terms_days).
 * Everything else is unknown and stays a placeholder until Leo supplies it.
 */
(function () {
  "use strict";

  var PLACEHOLDER = "[OWNER TO CONFIRM]";

  var REPEATER = {
    NAME: "Repeater",
    DOMAIN: "repeater.com.au",
    /* The umbrella pitch: four products, in the order the plan fixes them.
       Shown in the footer and the JSON-LD; keep it in step with the pages. */
    TAGLINE: "Fleet phones for tradies, AI call answering, Repair Shop OS and websites.",

    /* --- Evidence-backed --- */
    EMAIL_ORDERS: "orders@repeater.com.au",
    EMAIL_FLEET: "fleet@repeater.com.au",
    TERMS_DAYS: [7, 14, 30, 60],
    CURRENCY: "AUD",
    LOCALE: "en-AU",
    TIMEZONE: "Australia/Melbourne",

    /* --- Owner to supply. Do not guess. ABN and LEGAL_NAME are now known. --- */
    ABN: "50 702 477 361",              /* verified against the ATO checksum */
    ABN_PLAIN: "50702477361",  /* unspaced, for forms and invoices */
    LEGAL_NAME: "Aphileon LTD",
    TEL: PLACEHOLDER,
    TEL_DISPLAY: PLACEHOLDER,
    ADDRESS: PLACEHOLDER,
    /* DISPATCH_SLA, DELIVERY, WARRANTY and MIN_ORDER were placeholdered while
       the site led with trade supply. They now belong to the demoted trade
       pages, which state those terms in the enquiry copy instead, so the keys
       are gone rather than left permanently unresolved, deleting them closes
       the deploy gate honestly instead of quietly widening it. */

    /* --- Fleet phones (pillar 1). The SHAPE is Leo's own description and is
       safe to state; every NUMBER is unknown, so it stays a placeholder. --- */
    PHONES_PRICE: PLACEHOLDER,      /* monthly per-handset price */
    PHONES_COVER: PLACEHOLDER,      /* what a bundled repair covers */
    PHONES_TERM: PLACEHOLDER,       /* minimum term */
    PHONES_EXCESS: PLACEHOLDER,     /* excess per repair, if any */

    /* --- AI call answering (pillar 2) is priced on its own page: Standard
       $99 / Premium $139 a month. Like the Repair Shop OS tiers, the numbers
       live in the markup, so they are not duplicated as placeholders here. --- */

    PLACEHOLDER: PLACEHOLDER
  };

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** True when a value is missing or still the placeholder sentinel. */
  function unresolved(v) {
    return v == null || v === "" || v === PLACEHOLDER;
  }

  /* ---------------- rendering ---------------- */

  /**
   * Fill every [data-fact] element. Unresolved keys keep the muted placeholder
   * markup that is already in the HTML and get data-unresolved="1" so the test
   * suite can scan the rendered DOM rather than guessing at intent.
   */
  function fillText() {
    var els = document.querySelectorAll("[data-fact]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute("data-fact");
      var v = REPEATER[key];
      if (unresolved(v)) {
        el.setAttribute("data-unresolved", "1");
        if (!el.querySelector(".placeholder")) {
          el.innerHTML = '<span class="placeholder">[owner to confirm]</span>';
        }
        continue;
      }
      el.textContent = String(v);
      el.removeAttribute("data-unresolved");
    }
  }

  /**
   * Links whose href depends on a fact. data-fact-href="tel" builds "tel:...",
   * "mailto" builds "mailto:...". When the fact is unresolved the href is
   * REMOVED rather than left dangling, a half-built "tel:" link is worse than
   * plain text, and a broken link inside a sentence reads as a bug.
   */
  function fillLinks() {
    var links = document.querySelectorAll("[data-fact-href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var kind = a.getAttribute("data-fact-href");
      var key = kind === "tel" ? "TEL" : "EMAIL_ORDERS";
      var v = REPEATER[key];
      if (unresolved(v)) {
        a.removeAttribute("href");
        a.setAttribute("data-unresolved", "1");
        continue;
      }
      a.setAttribute("href", kind + ":" + v);
    }
  }

  /** Format money in AUD, the only way this site prints a price. */
  function money(n) {
    try {
      return new Intl.NumberFormat("en-AU", {
        style: "currency", currency: "AUD",
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(Number(n) || 0);
    } catch (e) {
      return "$" + (Number(n) || 0).toFixed(2);
    }
  }

  function init() {
    fillText();
    fillLinks();
  }

  REPEATER.esc = esc;
  REPEATER.unresolved = unresolved;
  REPEATER.money = money;
  REPEATER.fill = init;
  REPEATER.placeholderKeys = function () {
    var out = [];
    for (var k in REPEATER) {
      if (Object.prototype.hasOwnProperty.call(REPEATER, k) && unresolved(REPEATER[k])) out.push(k);
    }
    return out;
  };

  window.REPEATER = REPEATER;

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();