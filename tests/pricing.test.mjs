/**
 * Pricing page — locked canon and voice rules.
 *
 * Run with: node tests/pricing.test.mjs (also picked up by `npm test`).
 *
 * Product names, prices and terms in this brief are LOCKED canon. This file
 * pins them so a later cleanup cannot quietly restate $622 as $600, drop the
 * $110 admin cap, or let an insurance word onto a page that sells a care plan
 * without insurance. It also pins that the call-request field stays UI-only:
 * no endpoint, no storage.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, checkRunner } from "./_fixtures.mjs";

const { check, done } = checkRunner("pricing");
const read = (rel) => readFileSync(join(REPO, rel), "utf8");
const page = read("public/pricing/index.html");
const js = read("public/assets/pricing.js");

/* ================= locked prices ================= */

console.log("\n--- locked canon, rendered ---");
const REQUIRED = [
  "$622",             // PA-1 / PA-2 day one, per device
  "$5.60", "$5.10", "$4.70", "$4.30", "$3.90",   // the care ladder
  "$27.50", "$110",   // fleet administration fee, per device and per plan cap
  "$300",             // fleet loss fee (and the AI setup fee)
  "$60",              // over-cap repair
  "$19", "20 km",    // call-out fee and radius
  "$11.50",           // holdover per week
  "$1,109", "$1,057", "$1,010", "$967", "$927",  // locked pay-in-full ladder
  "$123",             // the 2-4 device saving
  "$20/wk", "$15/wk", "$100/wk", "$167/month", "$0.25", "$12/wk",  // services
  "24-month", "13-week", "2 service events per quarter", "90-day",
];
for (const s of REQUIRED) check(`contains "${s}"`, page.includes(s));

check("the headline weekly price is the real 2-device minimum ($5.60), not the 50+ price",
  /from \$5\.60 a week per device/.test(page) && !/from \$3\.90/.test(page));
check("minimum order is two devices, stated plainly", /Minimum two devices/.test(page));
check("fleet loss does NOT pay out the remaining term", /no payout of the remaining term/.test(page));
check("title ownership is denied on both plans", /you never own it/.test(page) && /Title never transfers/.test(page));

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
  check(`names ${name}`, page.includes(name));
}
check("each service is individually cancellable after a 13-week minimum",
  /individually cancellable after its 13-week minimum/.test(page));
check("ad spend stays on the client's own accounts", /ad spend stays on your own ad accounts/i.test(page));
check("discount steps 5.5% and 17.5% are shown without inventing the middle",
  /5\.5%/.test(page) && /17\.5%/.test(page) && /Steps between two and six products are confirmed on quote/.test(page));

/* ================= voice rules ================= */

console.log("\n--- voice rules (legal + brand) ---");
// Scan the visible copy, not the markup: the DOCTYPE and comments legitimately
// carry punctuation that is not customer-facing text.
const copy = page
  .replace(/<!DOCTYPE[^>]*>/i, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");
const FORBIDDEN = [
  /\bcover\b/i, /\bcoverage\b/i, /\bpolicy\b/i, /\bpremium\b/i, /\bclaim(s|ed|ing)?\b/i,
  /\binsur(e|ance|ed)\b/i, /\bprotect(ion|ed|s)?\b/i, /\bguarantee(d|s)?\b/i, /peace of mind/i,
];
for (const re of FORBIDDEN) {
  const hit = re.exec(copy);
  check(`no banned word ${re}${hit ? " (found: " + hit[0] + ")" : ""}`, !hit);
}
check("no exclamation marks anywhere in the copy", !copy.includes("!"));
check('the words package / bundle / add-on appear nowhere in customer copy',
  !/\bpackage/i.test(copy) && !/\bbundle/i.test(copy) && !/\badd-on/i.test(copy));

/* ================= the steppers ================= */

console.log("\n--- the two steppers ---");
check("two steppers are present (PA-1 and PA-2)", (page.match(/data-stepper=/g) || []).length === 2);
check("both steppers start the markup at 2 devices, and markup carries real figures",
  /\$1,244\.00/.test(page) && /\$55\.00/.test(page) && /\$11\.73/.test(page) && /\$1,109\.00/.test(page));
check("the page loads the stepper script", /<script defer src="\/assets\/pricing\.js"><\/script>/.test(page));
check("pricing.js hard-codes the 104-week term", /WEEKS = 104/.test(js));
check("pricing.js carries the admin fee and its $110 cap", /ADMIN_PER_DEVICE = 27\.50/.test(js) && /ADMIN_PLAN_CAP = 110/.test(js));
check("pricing.js carries the care ladder", ["5.60", "5.10", "4.70", "4.30", "3.90"].every((v) => js.includes(v)));
check("pricing.js uses the locked pay-in-full ladder rather than recomputing 10%",
  /function prepaidTotal/.test(js) && ["1109", "1057", "1010", "967", "927"].every((v) => js.includes(v)));

/* ================= call-request stays UI-only ================= */

console.log("\n--- the call-request field is UI-only ---");
check("the field is present on the page", /Or get a call from our AI &mdash; we'll ring you/.test(page));
check("it does not post to an endpoint", !/action="\/api\/call-request/.test(page) && !/fetch\(/.test(js));
check("pricing.js marks the endpoint as a future TODO", /TODO: POST \/api\/call-request/.test(js));

/* ================= it is a real pricing page, not the old trade page ================= */

console.log("\n--- the page was actually replaced ---");
check("the old wholesale trade-pricing copy is gone", !/How trade pricing resolves/.test(page));
check("the page names all three phone-plan states", /Fleet Phones/.test(page) && /Managed Fleet/.test(page) && /Fleet Connect/.test(page));

done();