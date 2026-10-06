/**
 * Umbrella restructure — content honesty and the payment config probe.
 *
 * Run with: node tests/umbrella.test.mjs
 *
 * Three things here are load-bearing and easy to get subtly wrong:
 *
 *   1. /api/shop-os/checkout must report the rail as NOT configured, with the
 *      exact shape the future Revolut port will use. A page must never offer a
 *      payment action it cannot honour.
 *   2. The Repair Shop OS pricing figures are real (from aphelion's live page)
 *      and must not drift: Starter $49 / Business $149 / Enterprise $399, AUD,
 *      GST-exclusive, free trial, no card.
 *   3. The checkout page must never claim a payment happened. Those words
 *      ("order confirmed", "payment successful") belong to a verified backend
 *      webhook, not the browser.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { REPO, getReq, jsonReq, J, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("umbrella");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");

/* ================= /api/shop-os/checkout ================= */

console.log("\n--- the checkout config probe ---");
const mod = await import(pathToFileURL(join(REPO, "functions/api/shop-os/checkout.js")).href);

let r = await J(mod.onRequestGet({}));
check("GET -> 200 {ok:false, skip:true, reason:'not_configured'}",
  r.status === 200 && r.body && r.body.ok === false && r.body.skip === true &&
  r.body.reason === "not_configured");
check("the probe response carries exactly the agreed keys",
  JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["ok", "reason", "skip"]));
check("the probe is never cached (config can change)",
  String(r.headers.get("cache-control") || "").includes("no-store"));

r = await J(mod.onRequest({ request: getReq("https://repeater.com.au/api/shop-os/checkout") }));
check("GET via onRequest -> 200", r.status === 200);
// POST is the one-off purchase now (see tests/shop-os-payments.test.mjs), so an
// unsupported verb is what still has to be refused, naming both allowed ones.
r = await J(mod.onRequest({ request: new Request("https://repeater.com.au/api/shop-os/checkout", { method: "DELETE" }) }));
check("an unsupported verb -> 405 with allow: GET, POST", r.status === 405 && r.headers.get("allow") === "GET, POST");

/* ================= OS pricing figures ================= */

console.log("\n--- Repair Shop OS pricing ---");
const pricing = read("public/shop-os/pricing/index.html");
check("Starter is from $49", /from \$49/.test(pricing));
check("Business is from $149", /from \$149/.test(pricing));
check("Enterprise is from $399", /from \$399/.test(pricing));
check("every plan is AUD", (pricing.match(/AUD\/mo/g) || []).length === 3);
check("the qualifier names GST-exclusion and the free trial",
  /GST exclusive/.test(pricing) && /free trial/.test(pricing));
check("no card to start is stated", /no card to start/.test(pricing));

const checkoutJs = read("public/assets/checkout.js");
check("checkout.js carries the same three figures (no drift)",
  ["$49", "$149", "$399"].every((v) => checkoutJs.includes(v)));

/* ================= payment honesty ================= */

console.log("\n--- the checkout page never claims a payment ---");
const checkout = read("public/shop-os/checkout/index.html");

// The banned phrases are the ones a browser could only print from a guessed
// state. They must not appear anywhere in the page.
const BANNED = /order confirmed|payment successful|payment received|payment complete|\bpaid\b/i;
const hit = BANNED.exec(checkout);
check("no 'order confirmed' / 'payment successful' / 'paid' text on the checkout page" +
  (hit ? " (found: " + hit[0] + ")" : ""), !hit);

check("the enquiry fallback is a real no-JS form",
  /<form class="qform" method="post" action="\/api\/enquiry"/.test(checkout));
check("the checkout page loads the config probe",
  /src="\/assets\/checkout\.js"/.test(checkout));
check("the payment action ships hidden until the rail is configured",
  /data-checkout-pay hidden/.test(checkout));
check("the fallback note is present in the markup (honest with JS off)",
  /data-checkout-note/.test(checkout));

// The script that talks to the payment rail must be just as careful: the only
// success wording it may reach is "active", and only after the server says so.
{
  // The script's own comments name the forbidden phrases in order to forbid
// them, so the code is what is scanned.
  const js = read("public/assets/checkout.js")
    .split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  const jsHit = BANNED.exec(js);
  check("the checkout script never promises a completed payment either" +
    (jsHit ? " (found: " + jsHit[0] + ")" : ""), !jsHit);
  check("the checkout script reads state from the backend, never assumes it",
    /\/api\/shop-os\/subscribe\?ref=/.test(js) && /s === "active"/.test(js));
}

/* ================= the home page leads with the three products ============= */

console.log("\n--- the umbrella home ---");
const home = read("public/index.html");

check("the hero names all three products",
  /Fleet phones/.test(home) && /AI call answering/.test(home) && /Repair Shop OS/.test(home));

// Order matters: phones, then AI calls, then Repair Shop OS. In the shop hero
// the three products ARE the cards, so their titles are the pinned sequence.
{
  const names = [...home.matchAll(/<h2 class="product__name">([^<]+)<\/h2>/g)]
    .map((m) => m[1].trim());
  check("the hero's three product cards are phones, AI, OS in that order",
    names.length === 3 && names[0] === "Fleet phones" &&
    names[1] === "AI call answering" && names[2] === "Repair Shop OS");
}

check("trade supply is framed as depth behind the three products, not as what Repeater is",
  /Trade supply of parts/.test(home) && /runs behind all three/.test(home));

check("the old parts-counter hero is gone",
  !/Stock the counter/.test(home));

/* ================= facts.js ================= */

console.log("\n--- facts.js umbrella line ---");
const facts = read("public/assets/facts.js");
check("TAGLINE names the three products in order",
  /TAGLINE: "Fleet phones for tradies, AI call answering, and Repair Shop OS\."/.test(facts));

done();