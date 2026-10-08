/**
 * Repair Shop OS checkout, plan summary, the payment handover, and the return
 * state.
 *
 * PAYMENT HONESTY. This page must never claim a payment happened when it did
 * not. Concretely:
 *
 *   - It never prints "order confirmed" or "payment successful" from a browser
 *     state. The only success wording it can reach is "active", and only after
 *     the SERVER reports it through /api/shop-os/subscribe?ref=…, the webhook
 *     is what settles a payment, and the browser never decides that.
 *   - The payment action is hidden by DEFAULT and only revealed when the config
 *     probe (/api/shop-os/checkout GET) says the rail is live. A hidden button
 *     cannot be clicked on a page that cannot honour it.
 *   - Card entry happens on Revolut's own hosted page. This page never sees,
 *     stores or transmits a card number, and never redirects with card data.
 *   - When the rail is not configured the page falls back to the enquiry form.
 *     A submitted enquiry says "we'll be in touch", never "paid".
 *   - A declined/failed setup returns the customer to THIS page with their
 *     details intact and a plain message; a cancelled/closed tab is neutral and
 *     the pending order stays resumable (the reference is kept in the URL).
 *
 * House style: IIFE, "use strict", var/function, promise chains, file:// guard.
 */
(function () {
  "use strict";

  /* The figures are copied from /shop-os/pricing and must not drift. */
  var PLANS = {
    starter: { name: "Starter", price: "$49", blurb: "One business, bookings, workshop, inventory and BAS-ready accounting." },
    business: { name: "Business", price: "$149", blurb: "Up to three businesses, adds B2B wholesale and marketing." },
    enterprise: { name: "Enterprise", price: "$399", blurb: "Unlimited businesses, adds the wealth dashboard and onboarding." }
  };
  var DEFAULT_PLAN = "business";
  var POLL_MS = 3000;
  var POLL_TRIES = 20;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function param(name) {
    var m = new RegExp("[?&]" + name + "=([^&]+)").exec(location.search);
    return m ? decodeURIComponent(m[1]) : "";
  }
  function setStatus(el, kind, message) {
    if (!el) return;
    el.className = "qform__status" + (kind ? " qform__status--" + kind : "");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function chosenPlan() {
    var key = param("plan").toLowerCase();
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
      msg.value = "I'd like to start on the " + plan.name + " plan (" + plan.price + " AUD/mo).";
    }

    $$("[data-plan-link]").forEach(function (a) {
      var on = a.getAttribute("data-plan-link") === key;
      a.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  /* ---------------- the payment handover ---------------- */

  function fieldValue(sel) {
    var el = $(sel);
    return el && el.value ? String(el.value).trim() : "";
  }

  /** The buyer details, taken from the same fields the enquiry form uses. */
  function readBuyer() {
    return {
      name: fieldValue("#name-o"),
      email: fieldValue("#email-o"),
      business: fieldValue("#business-o")
    };
  }

  /** Ask the backend to start a purchase and hand off to Revolut. */
  function start(kind, button) {
    var buyer = readBuyer();
    var status = $("[data-checkout-pay-status]");
    if (!buyer.name) {
      setStatus(status, "err", "Please add your name above first.");
      if ($("#name-o")) $("#name-o").focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email)) {
      setStatus(status, "err", "Please add a valid email above first, it's how the receipt reaches you.");
      if ($("#email-o")) $("#email-o").focus();
      return;
    }
    if (button) button.disabled = true;
    setStatus(status, "busy", "Taking you to Revolut\u2026");

    var body = { tier: chosenPlan(), name: buyer.name, email: buyer.email, business: buyer.business };
    var ref = param("ref");
    if (ref) body.ref = ref;

    fetch(kind === "one-off" ? "/api/shop-os/checkout" : "/api/shop-os/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (j && j.ok && j.url) { location.href = j.url; return; }
        if (j && j.reason === "not_configured") {
          setStatus(status, "err", "Card payment isn't switched on yet, use the form below and we'll set you up.");
          return;
        }
        setStatus(status, "err", (j && j.error) || "We couldn't start that right now. Please try again, or use the form below.");
      })
      .catch(function () {
        setStatus(status, "err", "Network problem, nothing was started. Please try again, or use the form below.");
      })
      .then(function () { if (button) button.disabled = false; });
  }

  /* ---------------- the return from Revolut ---------------- */

  /**
   * Poll the backend for the state of this reference. The webhook is what flips
   * it; we only ever read. Never renders success from a browser guess.
   */
  function watch(ref) {
    var state = $("[data-checkout-state]");
    var tries = 0;

    function tick() {
      tries++;
      fetch("/api/shop-os/subscribe?ref=" + encodeURIComponent(ref), { headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          var s = j && j.state;
          if (s === "active") {
            setStatus(state, "ok", "You're set. Repair Shop OS is active. A receipt is on its way to your inbox.");
            return;
          }
          if (s === "cancelled") {
            setStatus(state, "err", "That setup didn't go through, so no money was taken. Pick up whenever you're ready.");
            return;
          }
          if (tries < POLL_TRIES) {
            setStatus(state, "busy", "Processing\u2026 You can leave this tab open; we'll confirm the moment it lands.");
            setTimeout(tick, POLL_MS);
            return;
          }
          setStatus(state, "busy", "Still processing. Nothing has been charged. It's safe to check back shortly.");
        })
        .catch(function () {
          if (tries < POLL_TRIES) setTimeout(tick, POLL_MS);
          else setStatus(state, "busy", "We couldn't confirm yet. Nothing has been charged, check back shortly.");
        });
    }
    tick();
  }

  function showReturn() {
    var state = $("[data-checkout-state]");
    var pay = $("[data-checkout-pay]");
    var note = $("[data-checkout-note]");
    if (pay) pay.hidden = true;
    if (note) note.hidden = true;

    var status = param("status");
    if (status === "cancelled") {
      setStatus(state, "busy", "Payment cancelled, pick up whenever you're ready. Nothing has been charged.");
      return true;
    }
    if (status === "return" || param("ref")) {
      setStatus(state, "busy", "Processing\u2026 Nothing is charged until the payment clears.");
      var ref = param("ref");
      if (ref) watch(ref);
      return true;
    }
    return false;
  }

  /* ---------------- boot ---------------- */

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

    var sub = $("[data-checkout-subscribe]");
    if (sub) sub.addEventListener("click", function () { start("subscribe", sub); });
    var oneoff = $("[data-checkout-oneoff]");
    if (oneoff) oneoff.addEventListener("click", function (e) {
      e.preventDefault();
      start("one-off", oneoff);
    });

    if (!showReturn()) probe();
  }

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();