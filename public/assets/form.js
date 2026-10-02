/**
 * Progressive enhancement for the enquiry and trade-application forms.
 *
 * THE FORM IS REAL WITHOUT THIS FILE. The markup is a real
 * `<form method="post" action="/api/enquiry">` with real `name` attributes, and
 * the endpoint accepts form-encoded bodies for exactly this reason — so if this
 * script never loads, the enquiry is still captured. That contract is why the
 * endpoint parses multipart/urlencoded at all, and it must not be broken by
 * anything added here.
 *
 * What this adds is only the nicer path: no full page reload, an inline status
 * line, and the server's own error message shown in place rather than as raw
 * JSON in a new tab.
 *
 * House style: IIFE, "use strict", var/function, promise chains, and a file://
 * guard so opening a page from disk leaves the form alone.
 */
(function () {
  "use strict";

  var STATUS_CLASS = "qform__status";

  function setStatus(el, kind, message) {
    if (!el) return;
    el.className = STATUS_CLASS + (kind ? " " + STATUS_CLASS + "--" + kind : "");
    el.textContent = message || "";
  }

  function init() {
    var forms = document.querySelectorAll("form.qform");
    if (!forms.length) return;

    Array.prototype.slice.call(forms).forEach(function (form) {
      // Native validation is doing the field-level work (the markup carries the
      // required/type attributes). We only take over the submission itself.
      form.addEventListener("submit", function (ev) {
        var status = form.querySelector(".qform__status");

        // Belt and braces: some browsers fire submit before reporting validity.
        if (typeof form.checkValidity === "function" && !form.checkValidity()) {
          ev.preventDefault();
          if (typeof form.reportValidity === "function") form.reportValidity();
          setStatus(status, "err", "Please check the highlighted fields.");
          return;
        }

        ev.preventDefault();

        var data = new FormData(form);
        var payload = {};
        data.forEach(function (value, key) {
          if (typeof value === "string") payload[key] = value;
        });

        var button = form.querySelector('button[type="submit"]');
        if (button) button.disabled = true;
        setStatus(status, "busy", "Sending\u2026");

        fetch("/api/enquiry", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(payload)
        })
          .then(function (res) {
            return res.json()
              .catch(function () { return {}; })
              .then(function (json) { return { res: res, json: json }; });
          })
          .then(function (r) {
            var json = r.json || {};

            if (r.res.ok && json.ok) {
              // A honeypot submission also lands here, deliberately: the server
              // answers 200 so a bot believes it worked. A real person never
              // fills that field, so there is nothing to disambiguate.
              form.reset();
              setStatus(status, "ok", "Thanks \u2014 that's with the trade desk. We'll come back to you shortly.");
              return;
            }

            if (r.res.status === 429) {
              setStatus(status, "err", json.error || "Too many enquiries just now. Please try again in a few minutes.");
              return;
            }

            if (r.res.status === 503) {
              setStatus(status, "err", json.error || "We couldn't send that. Please email orders@repeater.com.au.");
              return;
            }

            setStatus(status, "err", json.error || "Something went wrong sending that. Please try again.");
          })
          .catch(function () {
            setStatus(status, "err", "Network problem \u2014 your enquiry wasn't sent. Please email orders@repeater.com.au.");
          })
          .then(function () {
            if (button) button.disabled = false;
          });
      });
    });
  }

  if (location.protocol === "file:") return;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();