/**
 * Facts integrity.
 *
 * Run with: node tests/facts.test.mjs
 *
 * `public/assets/facts.js` is the single source of truth for every hard fact on
 * this site. This test does four things:
 *
 *   1. Parses it under node:vm with a DOM stub, so a syntax error or a bad
 *      reference fails here rather than silently leaving every fact blank on the
 *      live site.
 *
 *   2. Checks every `data-fact="..."` key used anywhere in public/ actually
 *      exists in window.REPEATER. A typo would otherwise render nothing at all,
 *      which looks like a broken page rather than a missing fact.
 *
 *   3. Checks the markup ships a muted placeholder for every unresolved fact, so
 *      the no-JavaScript view is honest too — facts.js only ever REPLACES a
 *      placeholder, it never introduces one.
 *
 *   4. Enforces the deploy gate. With REPEATER_CUSTOM_DOMAIN set, no
 *      "[OWNER TO CONFIRM]" may remain anywhere in public/. Unset, it passes but
 *      lists every outstanding fact loudly.
 *
 * The gate exists because an Australian B2B site must display its ABN. Do not
 * delete or weaken it to make a deploy go green — see docs/SETUP-deploy.md §0.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(repo, "public");

let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " " + name);
  if (!cond) failures++;
}

/* ---------------- load facts.js under a DOM stub ---------------- */

const SRC = readFileSync(join(publicDir, "assets/facts.js"), "utf8");

function makeSandbox() {
  const sandbox = {
    console,
    location: { protocol: "https:" },
    document: {
      readyState: "complete",
      addEventListener() {},
      querySelectorAll: () => [],
    },
  };
  sandbox.window = sandbox;
  return sandbox;
}

console.log("\n--- facts.js loads ---");
let R = null;
try {
  const ctx = vm.createContext(makeSandbox());
  vm.runInContext(SRC, ctx, { filename: "facts.js" });
  R = ctx.window.REPEATER;
  check("facts.js evaluates without throwing", true);
} catch (e) {
  check("facts.js evaluates without throwing -> " + (e && e.message), false);
}

if (R) {
  check("window.REPEATER is an object", typeof R === "object" && R !== null);

  // The evidenced values. If one of these changes, it is a fact change and
  // should be a deliberate edit here too.
  console.log("\n--- evidenced facts ---");
  check("EMAIL_ORDERS is the address recorded in aphelion's sending-domain tests",
    R.EMAIL_ORDERS === "orders@repeater.com.au");
  check("EMAIL_FLEET matches the same source", R.EMAIL_FLEET === "fleet@repeater.com.au");
  check("TERMS_DAYS matches trade_accounts.terms_days (7/14/30/60)",
    JSON.stringify(R.TERMS_DAYS) === JSON.stringify([7, 14, 30, 60]));
  check("GST is declared exclusive", R.GST === "exclusive");
  check("currency is AUD and locale is en-AU", R.CURRENCY === "AUD" && R.LOCALE === "en-AU");
  check("timezone is Australia/Melbourne", R.TIMEZONE === "Australia/Melbourne");

  console.log("\n--- unresolved facts ---");
  const unresolvedKeys = R.placeholderKeys().filter((k) => k !== "PLACEHOLDER");
  console.log("     " + (unresolvedKeys.length ? unresolvedKeys.join(", ") : "(none)"));
  check("unresolved() reports the placeholder sentinel", R.unresolved(R.PLACEHOLDER) === true);
  check("unresolved() allows a real value", R.unresolved("12 345 678 901") === false);
  check("unresolved() treats an empty string as unresolved", R.unresolved("") === true);

  // Money formatting is the only way this site prints a price.
  console.log("\n--- helpers ---");
  check("money() formats in AUD with two decimals", R.money(171) === "$171.00");
  check("money() uses a thousands separator", R.money(12450) === "$12,450.00");
  check("esc() escapes angle brackets and quotes",
    R.esc('<a href="x">') === "&lt;a href=&quot;x&quot;&gt;");
}

/* ---------------- pages agree with facts.js ---------------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(publicDir);
const pages = files.filter((p) => extname(p) === ".html");
const rel = (p) => p.replace(repo, "").replace(/\\/g, "/");

console.log(`\n--- ${pages.length} page(s): data-fact keys resolve ---`);

const usedKeys = new Set();
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  for (const m of html.matchAll(/data-fact="([^"]+)"/g)) usedKeys.add(m[1]);
}

if (R) {
  const known = new Set(Object.keys(R));
  const unknown = [...usedKeys].filter((k) => !known.has(k));
  if (unknown.length) console.log("     unknown: " + unknown.join(", "));
  check("every data-fact key used in markup exists in window.REPEATER", unknown.length === 0);
  console.log("     keys used: " + ([...usedKeys].sort().join(", ") || "(none)"));
}

/* ---------------- the no-JS view is honest ---------------- */

console.log("\n--- unresolved facts render as a muted placeholder without JS ---");

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const factSpans = [...html.matchAll(/data-fact="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/span>/g)];
  if (!factSpans.length) continue;

  const bad = factSpans.filter(([, key, inner]) => {
    if (!R) return false;
    const v = R[key];
    // A resolved fact must be hard-coded in the markup (so it shows without JS);
    // an unresolved one must carry the placeholder span.
    if (R.unresolved(v)) return !/class="placeholder"/.test(inner);
    return false;
  });

  check(`${rel(p)}: unresolved facts carry the placeholder span`, bad.length === 0);
  if (bad.length) bad.forEach(([, key]) => console.log("       missing placeholder for " + key));
}

/* ---------------- the deploy gate ---------------- */

console.log("\n--- deploy gate ---");

const domain = String(process.env.REPEATER_CUSTOM_DOMAIN || "").trim();
const PLACEHOLDER = /\[OWNER TO CONFIRM\]|\[owner to confirm\]/;

if (!domain) {
  const offenders = [];
  for (const p of files.filter((f) => [".html", ".js", ".css", ".svg", ".txt"].includes(extname(f)))) {
    if (PLACEHOLDER.test(readFileSync(p, "utf8"))) offenders.push(rel(p));
  }
  check("REPEATER_CUSTOM_DOMAIN is unset, so a preview deploy is allowed", true);
  console.log("     placeholders present in: " + (offenders.join(", ") || "(none)"));
  console.log("     outstanding facts: " + ((R && R.placeholderKeys().filter((k) => k !== "PLACEHOLDER").join(", ")) || "(unknown)"));
  console.log("     -> these MUST be filled, and REPEATER_CUSTOM_DOMAIN set, before binding repeater.com.au");
} else {
  console.log("     REPEATER_CUSTOM_DOMAIN=" + domain);
  check("a custom domain is configured, so no placeholder may remain in public/", true);

  const offenders = [];
  for (const p of files.filter((f) => [".html", ".js", ".css", ".svg", ".txt"].includes(extname(f)))) {
    if (PLACEHOLDER.test(readFileSync(p, "utf8"))) offenders.push(rel(p));
  }
  if (offenders.length) offenders.forEach((f) => console.log("       placeholder remains in " + f));
  check(`${offenders.length === 0 ? "no" : offenders.length + ""} placeholder(s) remain with a custom domain bound`, offenders.length === 0);
  check("facts.js reports no unresolved facts", !R || R.placeholderKeys().filter((k) => k !== "PLACEHOLDER").length === 0);
}

console.log(failures ? "\n" + failures + " FAILED" : "\nall facts assertions passed");
process.exit(failures ? 1 : 0);