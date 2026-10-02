/**
 * Repeater site behaviour — the five motions, and nothing else.
 *
 *   1. Sticky nav: grows a hairline and a blur once you leave the top, and a
 *      burger panel below 810px.
 *   2. Reveal on scroll: one shared IntersectionObserver for every .rv element,
 *      staggered by an inline --d.
 *   3. Count-up: stat figures roll from zero. The markup ships the real number
 *      and this only animates it, so a failure here still shows the right value.
 *   4. Marquee: pure CSS; JS only pauses it on hover for readers who want to
 *      look at a logo. Nothing to do.
 *   5. Accordion: grid-template-rows 0fr -> 1fr, so there is no JS height maths
 *      and no max-height guess to get wrong.
 *
 * Plus in-view progress bars, and a smooth scroll for same-page anchors.
 *
 * Every one of these is a no-op under prefers-reduced-motion: reduce — the CSS
 * kill-switch handles the animations, and the guards below stop the JS from
 * queueing work that will never be seen.
 *
 * House style: classic script, IIFE, "use strict", var/function, own helpers,
 * promise chains over async, and a file:// guard so opening a page directly
 * from disk doesn't spray errors.
 */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) { reduced = false; }

  /* ---------------- 1. nav ---------------- */

  function initNav() {
    var nav = $("#nav");
    if (!nav) return;

    var burger = $(".nav__burger", nav);
    if (burger) {
      burger.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        burger.setAttribute("aria-expanded", open ? "true" : "false");
      });
      // A tap on a link inside the panel closes it, so the next page starts fresh.
      $$(".nav__panel a", nav).forEach(function (a) {
        a.addEventListener("click", function () {
          nav.classList.remove("is-open");
          burger.setAttribute("aria-expanded", "false");
        });
      });
    }

    // Threshold of 8px: below that the border would flicker on rubber-band scroll.
    var stuck = false;
    function onScroll() {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      var want = y > 8;
      if (want !== stuck) {
        stuck = want;
        nav.classList.toggle("is-stuck", want);
      }
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------- 2. reveal on scroll ---------------- */

  function initReveal() {
    var items = $$(".rv");
    if (!items.length) return;

    if (reduced || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- 3. count-up ---------------- */

  /**
   * Roll a number from zero. The markup carries the real value (and the real
   * suffix, e.g. "+"), so if IntersectionObserver is unavailable or motion is
   * reduced we simply leave the markup alone.
   *
   * The value is read from data-count, never parsed back out of the rendered
   * text — that way a currency symbol or a thousands separator can never feed a
   * bad number into Number().
   */
  function initCounters() {
    var els = $$("[data-count]");
    if (!els.length || reduced || !("IntersectionObserver" in window)) return;

    function roll(el) {
      var target = Number(el.getAttribute("data-count"));
      if (!isFinite(target)) return;
      var prefix = el.getAttribute("data-prefix") || "";
      var suffix = el.getAttribute("data-suffix") || "";
      var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10);
      var dur = 900;
      var start = null;

      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min(1, (ts - start) / dur);
        // ease-out cubic, matching --ease-out's feel
        var eased = 1 - Math.pow(1 - p, 3);
        var val = target * eased;
        el.textContent = prefix + val.toFixed(decimals) + suffix;
        if (p < 1) requestAnimationFrame(frame);
        else el.textContent = prefix + target.toFixed(decimals) + suffix;
      }

      // Start from a formatted zero so the width doesn't jump on the first frame.
      el.textContent = prefix + (0).toFixed(decimals) + suffix;
      requestAnimationFrame(frame);
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        roll(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.4 });

    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- 5. accordion ---------------- */

  function initAccordion() {
    var items = $$(".faq__item");
    if (!items.length) return;

    items.forEach(function (item) {
      var btn = $(".faq__q", item);
      if (!btn) return;
      btn.addEventListener("click", function () {
        var open = !item.classList.contains("is-open");
        item.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
  }

  /* ---------------- progress bars ---------------- */

  /**
   * Bars fill to their data-value once seen. The width is ALSO written to a
   * --w custom property so the reduced-motion rule in site.css can snap them
   * straight to the final width without any animation.
   */
  function initBars() {
    var bars = $$(".bar__fill");
    if (!bars.length) return;

    function setBar(el) {
      var v = Math.max(0, Math.min(100, Number(el.getAttribute("data-value")) || 0));
      el.style.setProperty("--w", v + "%");
      el.style.width = v + "%";
    }

    if (reduced || !("IntersectionObserver" in window)) {
      bars.forEach(setBar);
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // One frame's delay so the transition has a 0% start to move from.
        requestAnimationFrame(function () { setBar(el); });
        io.unobserve(el);
      });
    }, { threshold: 0.3 });

    bars.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- anchor links ---------------- */

  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href");
      if (!id || id === "#") return;
      a.addEventListener("click", function (ev) {
        var target = document.getElementById(id.slice(1));
        if (!target) return;
        ev.preventDefault();
        target.scrollIntoView({
          behavior: reduced ? "auto" : "smooth",
          block: "start"
        });
        if (history.replaceState) history.replaceState(null, "", id);
      });
    });
  }

  /* ---------------- theme switcher ---------------- */

  /**
   * Five preset palettes plus a custom accent.
   *
   * The hard part is the colour wheel. A visitor can pick #ffeaea, and a link in
   * that colour on white is about 1.05:1 — invisible. So the picked colour is
   * used EXACTLY for what it is good at (fills, large display type, icons) and a
   * derived, contrast-checked shade is used for links and small text. That is the
   * same --accent / --accent-strong split the design system already had; this
   * just computes the second one instead of hand-picking it.
   *
   * The derived values are what get persisted, not the raw pick, so the tiny
   * inline script in each page's <head> can reapply them before first paint
   * without needing any of this logic.
   */
  var STORE_THEME = "rep:theme";
  var STORE_ACCENT = "rep:accent";

  function toRgb(h) {
    var s = String(h || "").replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [0, 2, 4].map(function (i) { return parseInt(s.slice(i, i + 2), 16) || 0; });
  }
  function toHex(rgb) {
    return "#" + rgb.map(function (v) {
      var n = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return n.length === 1 ? "0" + n : n;
    }).join("");
  }
  function luminance(h) {
    var c = toRgb(h).map(function (v) { return v / 255; }).map(function (v) {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function mix(a, b, t) {
    var A = toRgb(a), B = toRgb(b);
    return toHex([0, 1, 2].map(function (i) { return A[i] + (B[i] - A[i]) * t; }));
  }

  /** Push `hex` toward black or white until it clears `target` against `bg`. */
  function legible(hex, bg, target) {
    var toward = luminance(bg) > 0.5 ? "#000000" : "#ffffff";
    var out = hex;
    for (var i = 0; i < 24 && contrast(out, bg) < target; i++) out = mix(out, toward, 0.08);
    return out;
  }

  function rgba(hex, alpha) {
    var c = toRgb(hex);
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + alpha + ")";
  }

  /** The full set of accent-derived tokens for a pick, against the live canvas. */
  function deriveAccent(pick) {
    var cs = getComputedStyle(document.documentElement);
    var bg = (cs.getPropertyValue("--bg") || "#ffffff").trim() || "#ffffff";
    var strong = legible(pick, bg, 4.5);
    var pressed = legible(mix(strong, luminance(bg) > 0.5 ? "#000000" : "#ffffff", 0.18), bg, 4.5);
    // Ink or white on the fill, whichever actually reads.
    var onAccent = contrast("#ffffff", strong) >= contrast("#0b1220", strong) ? "#ffffff" : "#0b1220";
    return {
      "--accent": pick,
      "--accent-strong": strong,
      "--accent-pressed": pressed,
      "--accent-soft": rgba(pick, 0.12),
      "--accent-ring": rgba(pick, 0.36),
      "--fg-on-accent": onAccent
    };
  }

  function applyAccent(tokens) {
    var root = document.documentElement;
    if (!tokens) {
      Object.keys(deriveAccent("#4f8cff")).forEach(function (k) { root.style.removeProperty(k); });
      return;
    }
    Object.keys(tokens).forEach(function (k) { root.style.setProperty(k, tokens[k]); });
  }

  function readStore(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, val) {
    try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val); } catch (e) { /* private mode */ }
  }

  function initThemer() {
    var wrap = $("[data-themer]");
    if (!wrap) return;

    var btn = $("[data-themer-btn]", wrap);
    var panel = $(".themer__panel", wrap);
    var swatches = $$("[data-theme-set]", wrap);
    var custom = $("[data-themer-custom]", wrap);
    var reset = $("[data-themer-reset]", wrap);

    function currentTheme() {
      return document.documentElement.getAttribute("data-theme") || "";
    }

    function syncSwatches() {
      var now = currentTheme();
      swatches.forEach(function (s) {
        s.setAttribute("aria-pressed", s.getAttribute("data-theme-set") === now ? "true" : "false");
      });
      // Reflect the active accent in the button's dot, custom or preset.
      var cs = getComputedStyle(document.documentElement);
      var dot = $(".themer__btn-dot", btn);
      if (dot) dot.style.background = (cs.getPropertyValue("--accent") || "").trim();
      if (custom) {
        var picked = readStore("rep:accent-pick");
        if (picked) custom.value = picked;
      }
    }

    function setTheme(name) {
      var root = document.documentElement;
      if (name) root.setAttribute("data-theme", name);
      else root.removeAttribute("data-theme");
      writeStore(STORE_THEME, name || null);
      // A custom accent was derived against the OLD canvas. Re-derive it, or the
      // link colour can silently fall back under AA when the background moves.
      var pick = readStore("rep:accent-pick");
      if (pick) {
        var tokens = deriveAccent(pick);
        applyAccent(tokens);
        writeStore(STORE_ACCENT, JSON.stringify(tokens));
      }
      syncSwatches();
    }

    function open(state) {
      wrap.classList.toggle("is-open", state);
      if (btn) btn.setAttribute("aria-expanded", state ? "true" : "false");
    }

    if (btn) {
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        open(!wrap.classList.contains("is-open"));
      });
    }

    swatches.forEach(function (s) {
      s.addEventListener("click", function () {
        setTheme(s.getAttribute("data-theme-set") || "");
      });
    });

    if (custom) {
      custom.addEventListener("input", function () {
        var pick = custom.value;
        var tokens = deriveAccent(pick);
        applyAccent(tokens);
        writeStore("rep:accent-pick", pick);
        writeStore(STORE_ACCENT, JSON.stringify(tokens));
        syncSwatches();
      });
    }

    if (reset) {
      reset.addEventListener("click", function () {
        applyAccent(null);
        writeStore(STORE_ACCENT, null);
        writeStore("rep:accent-pick", null);
        setTheme("");
        open(false);
      });
    }

    document.addEventListener("click", function (ev) {
      if (!wrap.contains(ev.target)) open(false);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && wrap.classList.contains("is-open")) {
        open(false);
        if (btn) btn.focus();
      }
    });

    syncSwatches();
    void panel;
  }

  /* ---------------- boot ---------------- */

  function init() {
    initNav();
    initThemer();
    initReveal();
    initCounters();
    initAccordion();
    initBars();
    initAnchors();
  }

  /**
   * Re-run the content-dependent motions after something has injected markup.
   *
   * proof.js, catalogue.js and posts.js all fetch and then build DOM, which
   * lands AFTER the first pass — a `.stat__fig` inside a card that arrived from
   * /api/proof would otherwise never get its count-up, and a `.bar__fill` would
   * never leave 0%. They call this instead of reaching into each other's
   * internals.
   *
   * Deliberately not exported on window as `init`: that name is far too easy to
   * collide with on a page that has its own script.
   */
  function rehydrate() {
    initReveal();
    initCounters();
    initAccordion();
    initBars();
    initAnchors();
  }

  window.repHydrate = rehydrate;

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();