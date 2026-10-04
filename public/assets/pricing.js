/**
 * Pricing page behaviour — the two quantity steppers and the UI-only
 * call-request field.
 *
 * Everything here is progressive enhancement. The markup ships the real 2-device
 * figures already computed, so with JavaScript off the page still reads
 * correctly; this script only recomputes them as the number changes.
 *
 * The money maths is canon, not invention:
 *   - PA-1 (Fleet Phones): $622 per device today; the fleet-administration fee
 *     is $27.50 per device for 2-4 devices, $110 total for the plan from 5 up.
 *   - PA-2 (Managed Fleet): $622 today per device; the weekly care ladder is
 *     2-4 $5.60 · 5-9 $5.10 · 10-19 $4.70 · 20-49 $4.30 · 50+ $3.90; the
 *     $27.50-per-device admin fee is capped at $110 per plan and spread across
 *     the 104 weekly payments. The pay-in-full figure is the owner's locked
 *     per-tier number (NOT recomputed — the brief locks them).
 *
 * The call-request field stores nothing and calls nothing. Its success state is
 * client-side only; the endpoint is a future job, marked TODO below.
 *
 * House style: classic script, IIFE, "use strict", var/function, own helpers,
 * a file:// guard.
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

  /** Two-week instalments: min($27.50/device, $110/plan) for the whole term. */
  function adminPlanTotal(count) {
    return Math.min(ADMIN_PER_DEVICE * count, ADMIN_PLAN_CAP);
  }

  /** The owner's locked pay-in-full figures. Do not recompute from 10%. */
  function prepaidTotal(count) {
    if (count >= 50) return 927;
    if (count >= 20) return 967;
    if (count >= 10) return 1010;
    if (count >= 5) return 1057;
    return 1109;
  }

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
      set($("[data-today]", root), money(DAYONE * count));

      if (kind === "phones") {
        set($("[data-admin]", root), count <= 4 ? money(ADMIN_PER_DEVICE * count) : money(ADMIN_PLAN_CAP));
        return;
      }

      var care = careFee(count);
      var adminWeek = adminPlanTotal(count) / WEEKS;          // whole plan, per week
      var perDevice = care + adminWeek / count;               // care + admin share
      set($("[data-care]", root), money(care));
      set($("[data-perweek]", root), money(perDevice));
      set($("[data-weekly]", root), money(perDevice * count));
      set($("[data-adminweek]", root), money(adminWeek));
      set($("[data-prepaid]", root), money(prepaidTotal(count)));
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

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();