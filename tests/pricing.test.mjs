/**
 * Pricing page — locked canon, the live prepaid rule, and voice rules.
 *
 * Run with: node tests/pricing.test.mjs (also picked up by `npm test`).
 *
 * Product names, prices and terms in this brief are LOCKED canon. This file
 * pins them so a later cleanup cannot quietly restate $794 as $600, drop the
 * $170 one-off, resurrect the old $967 20-device example, or let an insurance
 * word onto a page that sells a care plan without insurance.
 *
 * The stepper maths is run for real: public/assets/pricing.js is loaded under a
 * DOM stub (the same trick tests/facts.test.mjs uses) and its exposed
 * window.REP_PRICING functions are asserted against the canon figures.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { REPO, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("pricing");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const page = read("public/pricing/index.html");
const phones = read("public/phones/index.html");
const js = read("public/assets/pricing.js");

/** Load the browser script under a stub DOM and return window.REP_PRICING. */
function loadPricing() {
  const noop = () => {};
  const sandbox = {
    document: { readyState: "complete", addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
    location: { protocol: "https:" },
    console, Intl, Math, Number, String, Array, Object, JSON, parseInt, isFinite,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  return sandbox.REP_PRICING;
}
const P = loadPricing();

/* ================= locked prices ================= */

console.log("\n--- locked canon, rendered ---");
const REQUIRED = [
  "$622",             // PA-2 upfront, per device
  "$624", "$170", "$794",   // PA-1 device + one-off for the whole term, and the flat day one
  "$27.50", "$110",   // PA-2 fleet administration, and its plan cap
  "$5.60", "$5.10", "$4.70", "$4.30", "$3.90",   // the care ladder
  "$300",             // fleet loss fee (and the AI setup fee)
  "$60",              // over-cap repair
  "$19", "20 km",     // call-out fee and radius
  "$11.50",           // holdover per week
  "$1,109", "$1,057", "$1,010", "$958", "$927",  // published pay-in-full examples
  "$123",             // the 2-4 device saving
  "$20/wk", "$15/wk", "$100/wk", "$167/month", "$0.25", "$12/wk",  // services
  "24-month", "13-week", "2 service events per quarter", "90-day",
];
for (const s of REQUIRED) check(`pricing page contains "${s}"`, page.includes(s));

check("the old 20-device arithmetic error ($967) is gone from the page", !page.includes("$967"));
check("the headline weekly price is the real 2-device minimum ($5.60), not the 50+ price",
  /from \$5\.60 a week per device/.test(page) && !/from \$3\.90/.test(page));
check("minimum order is two devices, stated plainly", /Minimum two devices/.test(page));
check("fleet loss does NOT pay out the remaining term", /no payout of the remaining term/.test(page));
check("title ownership is denied on both plans", /you never own it/.test(page) && /Title never transfers/.test(page));

/* ================= PA-1 itemised breakdown ================= */

console.log("\n--- PA-1 headline + itemised small text ---");
const ITEMISED = "$624 device plus a one-off $170 for the whole term";
check("the pricing page keeps the $794 all-in headline", /\$794 all-in per device on signing/.test(page));
check("the pricing page carries the itemised breakdown verbatim", page.includes(ITEMISED));
check("the phones page carries the $794 all-in headline", /\$794 all-in per device on signing/.test(phones));
check("the phones page carries the same itemised breakdown", phones.includes(ITEMISED));
check("PA-1 day one is flat: no plan cap and no 'less at 5+' anywhere",
  !/less at 5\+/.test(page) && !/less at 5\+/.test(phones));

/* ================= PA-8 coming-soon card ================= */

console.log("\n--- PA-8 Fleet Connect ---");
check("PA-8 is a coming-soon card with the one sentence",
  /Fleet Connect/.test(page) && /Device \+ Care \+ SIM\. One plan, one weekly fee\. Coming soon\./.test(page));
{
  const m = /<section class="sec sec--tight" id="fleet-connect">([\s\S]*?)<\/section>/.exec(page);
  check("the PA-8 section exists as a static card", !!m);
  if (m) check("PA-8 carries no price and no form", !/\$/.test(m[1]) && !/<form/.test(m[1]));
}

/* ================= services ================= */

console.log("\n--- services PA-3..PA-7 ---");
for (const name of ["Website Care", "Data Admin", "Ads Management", "AI Receptionist", "Security Review"]) {
  check(`pricing page names ${name}`, page.includes(name));
}
check("each service is individually cancellable after a 13-week minimum",
  /individually cancellable after its 13-week minimum/.test(page));
check("ad spend stays on the client's own accounts", /ad spend stays on your own ad accounts/i.test(page));
check("discount steps 5.5% and 17.5% are shown without inventing the middle",
  /5\.5%/.test(page) && /17\.5%/.test(page) && /Steps between two and six products are confirmed on quote/.test(page));

/* ================= voice rules ================= */

console.log("\n--- voice rules (legal + brand) ---");
const FORBIDDEN = [
  /\bcover\b/i, /\bcoverage\b/i, /\bpolicy\b/i, /\bpremium\b/i, /\bclaim(s|ed|ing)?\b/i,
  /\binsur(e|ance|ed)\b/i, /\bprotect(ion|ed|s)?\b/i, /\bguarantee(d|s)?\b/i, /peace of mind/i,
];
for (const [file, html] of [["pricing", page], ["phones", phones]]) {
  const copy = html
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  for (const re of FORBIDDEN) {
    const hit = re.exec(copy);
    check(`${file}: no banned word ${re}${hit ? " (found: " + hit[0] + ")" : ""}`, !hit);
  }
  check(`${file}: no exclamation marks in the copy`, !copy.includes("!"));
  check(`${file}: no package / bundle / add-on in customer copy`,
    !/\bpackage/i.test(copy) && !/\bbundle/i.test(copy) && !/\badd-on/i.test(copy));
}

/* ================= the steppers + the live maths ================= */

console.log("\n--- the two steppers ---");
check("two steppers are present (PA-1 and PA-2)", (page.match(/data-stepper=/g) || []).length === 2);
check("the page loads the stepper script", /<script defer src="\/assets\/pricing\.js"><\/script>/.test(page));
check("pricing.js hard-codes the 104-week term", /WEEKS = 104/.test(js));
check("pricing.js carries the PA-2 admin fee and its $110 cap", /ADMIN_PER_DEVICE = 27\.50/.test(js) && /ADMIN_PLAN_CAP = 110/.test(js));
check("pricing.js carries the PA-1 device and one-off", /PHONES_DEVICE = 624/.test(js) && /PHONES_ONEOFF = 170/.test(js));

console.log("\n--- the live maths (window.REP_PRICING) ---");
check("careFee steps through the ladder",
  P.careFee(2) === 5.60 && P.careFee(5) === 5.10 && P.careFee(10) === 4.70 && P.careFee(20) === 4.30 && P.careFee(50) === 3.90);
check("adminPlanTotal is $27.50/device, capped at $110",
  P.adminPlanTotal(2) === 55 && P.adminPlanTotal(3) === 82.5 && P.adminPlanTotal(5) === 110 && P.adminPlanTotal(20) === 110);
check("PA-1 day one is $794 per device, flat ($1,588 at 2 devices, $3,970 at 5)",
  P.phonesDayOneTotal(2) === 1588 && P.phonesDayOneTotal(5) === 3970 &&
  P.phonesDayOneTotal(2) / 2 === 794 && P.phonesDayOneTotal(5) / 5 === 794);
check("PA-2 pay-in-full is 10% off (622 + admin share + care x 104), per device",
  P.prepaidPerDevice(2) === 1109 && P.prepaidPerDevice(5) === 1057 &&
  P.prepaidPerDevice(10) === 1010 && P.prepaidPerDevice(50) === 927);
check("the published examples are the owner's five, including $958 at 20",
  JSON.stringify(P.PUBLISHED_EXAMPLES) === JSON.stringify({ 2: 1109, 5: 1057, 10: 1010, 20: 958, 50: 927 }));
check("the page's tier table shows those exact published examples",
  ["$1,109", "$1,057", "$1,010", "$958", "$927"].every((v) => page.includes(v)));
// Documented divergence: the published 20-device example is the owner's $958,
// while the rule computes $967 at exactly 20. Rendered as given; flagged, not
// silently reconciled. If either side moves, this fires.
check("the 20-device divergence is conscious (rule $967 vs published $958)",
  P.prepaidPerDevice(20) === 967 && page.includes("$958") && !page.includes("$967"));

/* ================= call-request stays UI-only ================= */

console.log("\n--- the call-request field is UI-only ---");
check("the field is present on the pricing page", /Or get a call from our AI and we'll ring you/.test(page));
check("it does not post to an endpoint", !/action="\/api\/call-request/.test(page) && !/fetch\(/.test(js));
check("pricing.js marks the endpoint as a future TODO", /TODO: POST \/api\/call-request/.test(js));

/* ================= /phones is the three-plan ladder ================= */

console.log("\n--- /phones rewritten to the ladder ---");
check("the phones page names all three plans", /Fleet Phones/.test(phones) && /Managed Fleet/.test(phones) && /Fleet Connect/.test(phones));
check("the phones page has no [owner to confirm] marker", !/\[owner to confirm\]/i.test(phones));
check("the phones page has no data-fact placeholder spans", !/data-fact="PHONES/.test(phones) && !/class="placeholder"/.test(phones));
check("the old bundled-repairs hero copy is gone", !/repairs bundled into the deal/.test(phones) && !/with <b>repairs included<\/b>/.test(phones));
check("the device-only plan explicitly says no repair services are included",
  /No repair services included/.test(phones) && /care cannot be added mid-term/.test(phones));
check("the managed plan states care is included", /Repairs included: 2 service events per quarter/.test(phones));
check("the phones page links to /pricing for the stepper", /href="\/pricing"/.test(phones));
check("the phones page keeps the $622 upfront, the $794 PA-1 headline and from $5.60 identical to pricing",
  phones.includes("$622") && phones.includes("$794") && /from \$5\.60 a week per device/.test(phones) && phones.includes("$300"));

done();