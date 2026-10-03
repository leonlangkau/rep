/**
 * Repair Shop OS checkout — plan summary, and the payment configuration probe.
 *
 * PAYMENT HONESTY. This page must never claim a payment happened when it did
 * not. Concretely:
 *
 *   - It never prints "order confirmed" or "payment successful" from a browser
 *     state. Those words belong to a verified backend webhook (the Revolut port
 *     that follows), and they are deliberately absent from this file and the
 *     markup.
 *   - The payment action is hidden by DEFAULT and only revealed when the config
 *     probe says the rail is live. A hidden button cannot be clicked on a page
 *     that cannot honour it.
 *   - When the rail is not configured — which is every case tonight — the page
 *     falls back to the enquiry form. A submitted enquiry says "we'll be in
 *     touch", never "paid".
 *   - A future decline/fail path returns the customer to THIS page with their
 *     details intact, so nothing is lost or silently retried.
 *
 * The probe is GET /api/shop-os/checkout, which currently answers
 * { ok:false, skip:true, reason:"not_configured" } — the same shape the Revolut
 * port will use, so this page does not change when the rail goes live.
 *
 * House style: IIFE, "use strict", var/function, promise chains, file:// guard.
 */
(function () {
  "use strict";

  /* The figures are copied from /shop-os/pricing and must not drift. */
  var PLANS = {
    starter: { name: "Starter", price: "$49", blurb: "One business \u2014 bookings, workshop, inventory and BAS-ready accounting." },
    business: { name: "Business", price: "$149", blurb: "Up to three businesses \u2014 adds B2B wholesale and marketing." },
    enterprise: { name: "Enterprise", price: "$399", blurb: "Unlimited businesses \u2014 adds the wealth dashboard and onboarding." }
  };
  var DEFAULT_PLAN = "business";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function chosenPlan() {
    var m = /[?&]plan=([a-z]+)/i.exec(location.search);
    var key = m ? m[1].toLowerCase() : "";
    return PLANS[key] ? key : DEFAULT_PLAN;
  }

  function renderPlan(key) {
    var plan = PLANS[key] || PLANS[DEFAULT_PLAN];
    var name = $("[data-plan-name]");
    var price = $("[data-plan-price]");
    var blurb = $("[data-plan-blurb]");
    if (name) name.textContent = plan.name;
    if (price) price.textContent = "from " + plan.price + " AUD/mo";
    if (blurb) blurb.textContent = plan.blurb;

    var msg = $("#checkoutMessage");
    if (msg && !msg.value) {
      msg.value = "I'd like to start on the " + plan.name + " plan (" + plan.price + " AUD/mo, GST-exclusive).";
    }

    $$("[data-plan-link]").forEach(function (a) {
      var on = a.getAttribute("data-plan-link") === key;
      a.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  /**
   * Ask the backend which rail is live before offering to take money.
   * Configured -> reveal the pay action and hide the fallback note.
   * Anything else (including a network failure) -> leave the enquiry fallback.
   */
  function probe() {
    var pay = $("[data-checkout-pay]");
    var note = $("[data-checkout-note]");

    function fallback() {
      if (pay) pay.hidden = true;
      if (note) note.hidden = false;
    }

    fetch("/api/shop-os/checkout", { headers: { accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (cfg && cfg.ok === true && cfg.configured === true) {
          if (pay) pay.hidden = false;
          if (note) note.hidden = true;
          return;
        }
        fallback();
      })
      .catch(fallback);
  }

  function init() {
    renderPlan(chosenPlan());
    probe();
  }

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();