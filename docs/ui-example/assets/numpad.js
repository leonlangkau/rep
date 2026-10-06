/* Numpad — the /ai page demo-call widget.
 *
 * A real <form method="post" action="/api/ai-demo-call"> underneath: with JS
 * off the visitor types into the tel input and submits. With JS on the input
 * becomes the display (keyboard suppressed, inputmode set), the pad fills it,
 * and submit fetches the endpoint so the page can answer inline.
 *
 * Kept dependency-free and classic-script like the rest of the house JS.
 */
(function () {
  "use strict";
  if (location.protocol === "file:") return;

  var $ = function (s, r) { return (r || document).querySelector(s); };

  function init() {
    var form = $("[data-numpad]");
    if (!form) return;
    var input = $("[data-numpad-input]", form);
    var status = $("[data-numpad-status]", form);
    var okBtn = $("button[type=submit]", form);
    if (!input || !status || !okBtn) return;

    input.setAttribute("readonly", "readonly");
    input.setAttribute("inputmode", "none"); // the pad is the only keyboard
    input.setAttribute("autocomplete", "off");

    var digits = "";

    function valid() {
      var d = digits;
      return /^0[234578]\d{8}$/.test(d) || /^61[234578]\d{8}$/.test(d);
    }

    function shown() {
      // 04XX XXX XXX for locals, +61 4XX XXX XXX for the 61-prefixed form
      if (digits.indexOf("61") === 0 && digits.length >= 2) {
        var d = digits.slice(2);
        var out = "+61";
        if (d.length > 0) out += " " + d.slice(0, 3);
        if (d.length > 3) out += " " + d.slice(3, 6);
        if (d.length > 6) out += " " + d.slice(6, 10);
        return out;
      }
      var out2 = digits.slice(0, 4);
      if (digits.length > 4) out2 += " " + digits.slice(4, 7);
      if (digits.length > 7) out2 += " " + digits.slice(7, 10);
      return out2;
    }

    function render() {
      input.value = digits ? shown() : "";
      okBtn.disabled = !valid();
    }

    function set_status(text, kind) {
      status.textContent = text || "";
      status.className = "numpad__status" + (kind ? " numpad__status--" + kind : "");
    }

    form.addEventListener("click", function (ev) {
      var key = ev.target.closest("[data-key]");
      if (!key) return;
      var k = key.getAttribute("data-key");
      if (k === "del") {
        digits = digits.slice(0, -1);
      } else if (k === "clr") {
        digits = "";
      } else if (digits.length < 11 && k >= "0" && k <= "9") {
        digits += k;
      }
      render();
      set_status("");
    });

    render();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (!valid()) {
        set_status("Enter a 10-digit Australian number.", "err");
        return;
      }
      okBtn.disabled = true;
      set_status("Dialling Jarvis now \u2014 keep the phone handy.", "busy");
      fetch(form.getAttribute("action"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ number: digits })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) {
          return { code: r.status, body: b };
        });
      }).then(function (res) {
        var b = res.body || {};
        if (res.code === 200 && b.ok) {
          digits = "";
          render();
          if (b.answered === false) {
            set_status("The call went out but nobody picked up \u2014 try again, or book a call below.", "err");
          } else {
            set_status("He's calling you now. The walkthrough runs a few minutes \u2014 ask him anything.", "ok");
          }
        } else if (res.code === 429) {
          set_status("That number has had its calls for today \u2014 try again tomorrow, or book a call below.", "err");
        } else if (res.code === 400) {
          set_status("That number doesn't look right. Ten digits, starting 04 or your area code.", "err");
        } else {
          set_status("The call service is offline right now \u2014 book a call below and we'll ring you.", "err");
        }
      }).catch(function () {
        set_status("The call service is offline right now \u2014 book a call below and we'll ring you.", "err");
      }).finally(function () {
        okBtn.disabled = !valid();
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
