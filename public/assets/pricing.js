/**
 * Pricing page behaviour — the two quantity steppers and the UI-only
 * call-request field.
 *
 * Everything here is progressive enhancement. The markup ships the real 2-device
 * figures already computed, so with JavaScript off the page still reads
 * correctly; this script only recomputes them as the number changes.
 *
 * The money maths is canon, not invention:
 *   - PA-1 (Fleet Phones): headline "$622 all-in per device on signing" is
 *     shorthand. Itemised, day one is $572 device + $50 establishment + the
 *     fleet-administration fee, and that fee is ONE-OFF and capped at $110 per
 *     plan for the whole term. So per-device day one is $649.50 at 2-4 devices
 *     and less at 5+ as the cap spreads.
 *   - PA-2 (Managed Fleet): $622 day one per device (the admin fee is NOT in the
 *     day-one number — it is collected in weekly instalments). The weekly care
 *     ladder is 2-4 $5.60 · 5-9 $5.10 · 10-19 $4.70 · 20-49 $4.30 · 50+ $3.90.
 *     The admin is min(n x $27.50, $110) for the whole plan, spread across 104
 *     weekly payments. Pay-in-full, per device = 10% off
 *     (622 + adminPerDevice + care x 104), computed from the exact count.
 *
 * The published pay-in-full table shows the owner's examples at the tier
 * minimums; see the note by PUBLISHED_EXAMPLES below.
 *
 * The call-request field stores nothing and calls nothing. Its success state is
 * client-side only; the endpoint is a future job, marked TODO below.
 *
 * House style: classic script, IIFE, "use strict", var/function, own helpers,
 * a file:// guard. The maths is exposed on window.REP_PRICING so tests can run
 * it under a DOM stub (the same trick tests/facts.test.mjs uses).
 */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var WEEKS = 104;                 // 24 months
  var DAYONE = 622;                // per device, both PA-1 and PA-2
  var ADMIN_PER_DEVICE = 27.50;
  var ADMIN_PLAN_CAP = 110;

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

  function careFee(count) {
    if (count >= 50) return 3.90;
    if (count >= 20) return 4.30;
    if (count >= 10) return 4.70;
    if (count >= 5) return 5.10;
    return 5.60;
  }

  /** The whole-plan administration fee: $27.50/device, capped at $110. */
  function adminPlanTotal(count) {
    return Math.min(ADMIN_PER_DEVICE * count, ADMIN_PLAN_CAP);
  }

  /** The administration fee's share for one device (cap shared across the fleet). */
  function adminPerDevice(count) {
    return adminPlanTotal(count) / count;
  }

  /** PA-1: what is due on signing across the fleet — $622/device plus the one-off admin. */
  function phonesDayOneTotal(count) {
    return DAYONE * count + adminPlanTotal(count);
  }

  /** PA-2: 10% off (day-one + admin share + the tier's weekly care over the term), per device. */
  function prepaidPerDevice(count) {
    var standard = DAYONE + adminPerDevice(count) + careFee(count) * WEEKS;
    return Math.round(standard * 0.9);
  }

  /*
   * The owner's published pay-in-full examples at the tier minimums. These are
   * canon and are rendered verbatim in the table. They agree with
   * prepaidPerDevice() at 2/5/10/50; at exactly 20 the owner's published figure
   * is $958 while the rule above computes $967 — rendered as given, flagged, and
   * not silently reconciled.
   */
  var PUBLISHED_EXAMPLES = { 2: 1109, 5: 1057, 10: 1010, 20: 958, 50: 927 };

  function set(el, value) {
    if (el) el.textContent = value;
  }

  function initStepper(root) {
    var kind = root.getAttribute("data-stepper");
    var qtyEl = $("[data-qty]", root);
    var minus = $('[data-step="-1"]', root);
    var plus = $('[data-step="1"]', root);
    if (!qtyEl) return;

    var MIN = 2, MAX = 100;
    var count = parseInt(qtyEl.textContent, 10);
    if (!isFinite(count)) count = MIN;

    function render() {
      count = Math.max(MIN, Math.min(MAX, count));
      set(qtyEl, String(count));

      if (kind === "phones") {
        set($("[data-devices]", root), money(DAYONE * count));
        set($("[data-admin]", root), money(adminPlanTotal(count)));
        set($("[data-today]", root), money(phonesDayOneTotal(count)));
        return;
      }

      var care = careFee(count);
      var adminWeek = adminPlanTotal(count) / WEEKS;          // whole plan, per week
      var perDevice = care + adminPerDevice(count) / WEEKS;   // care + admin share
      set($("[data-care]", root), money(care));
      set($("[data-adminweek]", root), money(adminWeek));
      set($("[data-perweek]", root), money(perDevice));
      set($("[data-weekly]", root), money(perDevice * count));
      set($("[data-today]", root), money(DAYONE * count));
      set($("[data-prepaid]", root), money(prepaidPerDevice(count)));
    }

    function bump(delta) {
      // The buttons are real buttons; nothing happens without this script.
      count += delta;
      render();
    }

    if (minus) minus.addEventListener("click", function () { bump(-1); });
    if (plus) plus.addEventListener("click", function () { bump(1); });
    render();
  }

  /* ---------------- call-request (UI only) ---------------- */

  var AU_MOBILE = /^(?:\+?61|0)?4\d{2}\s?\d{3}\s?\d{3}$/;

  function normaliseMobile(raw) {
    return String(raw || "").replace(/[\s()-]/g, "");
  }

  function initCallRequest(root) {
    var input = $("input", root);
    var button = $("[data-callreq-btn]", root);
    var status = $("[data-callreq-status]", root);
    if (!input || !button) return;

    function show(kind, message) {
      if (!status) return;
      status.className = "form-note" + (kind ? " callreq__status--" + kind : "");
      status.textContent = message || "";
    }

    button.addEventListener("click", function () {
      var value = normaliseMobile(input.value);
      if (!value) { show("err", "Enter your mobile number first."); return; }
      if (!AU_MOBILE.test(value)) { show("err", "That doesn't look like an Australian mobile. Try 04xx xxx xxx."); return; }
      // TODO: POST /api/call-request
      // The call-request field is UI-only this pass: it stores nothing and
      // calls nothing. This success state is deliberately client-side only.
      input.value = "";
      show("ok", "Thanks \u2014 we'll ring you back on that number.");
    });
  }

  function init() {
    $$("[data-stepper]").forEach(initStepper);
    $$("[data-callreq]").forEach(initCallRequest);
  }

  // Exposed so the maths can be tested without a browser (tests/pricing.test.mjs
  // runs this file under a DOM stub and asserts against these functions).
  window.REP_PRICING = {
    WEEKS: WEEKS, DAYONE: DAYONE, ADMIN_PER_DEVICE: ADMIN_PER_DEVICE, ADMIN_PLAN_CAP: ADMIN_PLAN_CAP,
    money: money, careFee: careFee, adminPlanTotal: adminPlanTotal, adminPerDevice: adminPerDevice,
    phonesDayOneTotal: phonesDayOneTotal, prepaidPerDevice: prepaidPerDevice,
    PUBLISHED_EXAMPLES: PUBLISHED_EXAMPLES
  };

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();