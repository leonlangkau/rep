/**
 * Design-token integrity.
 *
 * Run with: node tests/tokens.test.mjs
 *
 * Three things this file exists to prevent, in order of how badly they'd hurt:
 *
 *   1. CONTRAST DRIFT. Every ratio asserted below was computed from the WCAG
 *      2.x relative-luminance formula, and this file recomputes them from the
 *      parsed :root block — so changing a hex value without re-checking
 *      accessibility fails the build rather than shipping.
 *
 *   2. RETIRED BRAND COLOURS creeping back in. Businity's lime, the
 *      fivestarrepairs gold family and aphelion's violet/teal all belong to
 *      other brands. Aphelion pins the same idea with a RETIRED_COLOURS regex
 *      in tests/site-root.test.mjs; this is the rep equivalent.
 *
 *   3. --warn USED AS TEXT. #e3b324 is 1.96:1 on white — it fails at every
 *      size, including large text. It may only ever be a fill, an icon or a
 *      dot. Its readable counterpart is --warn-strong (#7a5c00, 6.25:1).
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = join(repo, "public/assets/site.css");
const css = readFileSync(cssPath, "utf8");

let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " " + name);
  if (!cond) failures++;
}

/* ---------------- token parsing ---------------- */

const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(css);
const root = rootBlock ? rootBlock[1] : "";
const token = (name) => {
  const m = new RegExp("--" + name + "\\s*:\\s*([^;]+);").exec(root);
  return m ? m[1].trim() : "";
};
const hex = (name) => {
  const v = token(name);
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  return m ? "#" + m[1].toLowerCase() : "";
};

console.log("\n--- parsed tokens ---");
for (const t of ["fg", "fg-2", "fg-3", "accent", "accent-strong", "accent-pressed",
                 "ok", "ok-strong", "warn", "warn-strong", "danger", "danger-strong"]) {
  console.log("  --" + t + ": " + (hex(t) || "(unparsed: " + token(t) + ")"));
}

/* ---------------- WCAG 2.x contrast ---------------- */

function luminance(h) {
  const c = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "#ffffff";
const SUNKEN = hex("bg-sunken") || "#f4f4f4";

console.log("\n--- contrast on white (recomputed from site.css) ---");

// The exact ratios this palette was designed against. If a hex changes, the
// corresponding number here must be re-derived deliberately, not just edited.
const EXPECTED = {
  "fg": [18.73, "body copy and headings"],
  "fg-2": [6.29, "ledes and secondary copy"],
  "fg-3": [4.54, "captions and table meta"],
  "accent": [3.22, "DECORATIVE: fills, >=24px type, icons, rings"],
  "accent-strong": [4.70, "links, small accent text, .btn--accent"],
  "accent-pressed": [6.56, "hover/active on accent fills"],
  "ok": [3.01, "status dot/icon"],
  "ok-strong": [5.09, "status text"],
  "warn": [1.96, "FILL/ICON ONLY - fails at every size"],
  "warn-strong": [6.25, "warning text"],
  "danger": [4.43, "status icon"],
  "danger-strong": [6.38, "error text"],
};

for (const [name, [want, why]] of Object.entries(EXPECTED)) {
  const h = hex(name);
  if (!h) {
    check("--" + name + " parses as a 6-digit hex", false);
    continue;
  }
  const got = contrast(h, WHITE);
  const ok = Math.abs(got - want) < 0.06;
  console.log("  " + String(got.toFixed(2)).padStart(6) + ":1  (expected " + want.toFixed(2) + ")  --" + name + " - " + why);
  check("--" + name + " contrast on white is " + want.toFixed(2) + ":1", ok);
}

console.log("\n--- contrast grade rules ---");
for (const t of ["fg", "fg-2", "fg-3", "accent-strong", "accent-pressed", "ok-strong", "warn-strong", "danger-strong"]) {
  check("--" + t + " is AA for body text (>= 4.5:1)", contrast(hex(t), WHITE) >= 4.5);
}
check("--accent is NOT usable for small text (< 4.5:1) - it is decorative", contrast(hex("accent"), WHITE) < 4.5);
check("--warn FAILS at every size (< 3:1) - fill/icon only", contrast(hex("warn"), WHITE) < 3);
check("white on --accent-strong (the .btn--accent fill) is AA", contrast(WHITE, hex("accent-strong")) >= 4.5);
check("white on --fg (the .btn--solid fill) is AAA", contrast(WHITE, hex("fg")) >= 7);
check("--fg on --bg-sunken is still AA", contrast(hex("fg"), SUNKEN) >= 4.5);
check("--fg-2 on --bg-sunken is still AA", contrast(hex("fg-2"), SUNKEN) >= 4.5);

/* ---------------- every theme passes the battery ---------------- */

// A theme switcher is a way to ship a palette nobody checked. These five are
// selectable at runtime by any visitor, so each one has to clear the same bar
// the default does — a dark theme in particular inverts the button fill, which
// is why --fg-on-accent exists as a token rather than a hardcoded white.
//
// RETIRED_COLOURS is declared here rather than further down because the batched
// colour assertion below needs it; a `const` used before its declaration is a
// TDZ ReferenceError, not `undefined`.
const RETIRED_COLOURS =
  /#c4f666|#b3db6a|#b3db69|#00ff86|#f5b301|#ffc633|#d99e00|#ffd873|#d9a613|#7c6cff|#35e0d0/i;

console.log("\n--- every selectable theme ---");

/** All --x: value; pairs in a block. */
const tokenMap = (body) => {
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

const baseTokens = tokenMap(root);

// ":root[data-theme=...]" blocks, kept in file order.
const themeBlocks = [...css.matchAll(/:root\[data-theme="([a-z0-9-]+)"\]\s*\{([\s\S]*?)\n\}/gi)]
  .map((m) => ({ name: m[1], tokens: tokenMap(m[2]) }));

const EXPECTED_THEMES = ["ink", "harbour", "bone", "grove"];
check(`site.css defines ${EXPECTED_THEMES.length} extra themes`,
  themeBlocks.length === EXPECTED_THEMES.length);
for (const want of EXPECTED_THEMES) {
  check(`theme "${want}" has a block`, themeBlocks.some((t) => t.name === want));
}

// The dark theme is the one that can invert a button fill, so it must be real.
const inkBlock = themeBlocks.find((t) => t.name === "ink");
check("the dark theme declares color-scheme so native controls follow it",
  /:root\[data-theme="ink"\]\s*\{[\s\S]*?color-scheme:\s*dark/i.test(css));

const GRID = [
  ["fg", "bg", 7, "body copy (AAA)"],
  ["fg-2", "bg", 4.5, "ledes (AA)"],
  ["fg-3", "bg", 4.5, "captions (AA)"],
  ["fg-2", "bg-sunken", 4.5, "secondary on a sunken panel"],
  ["accent-strong", "bg", 4.5, "links and small accent text (AA)"],
  ["fg-on-accent", "accent-strong", 4.5, "the .btn--accent label"],
  ["fg-on-accent", "accent", 3, "ink/white on the raw accent fill"],
  ["band-fg", "band", 7, "the CTA band (AAA)"],
  ["accent", "bg", 3, "decorative accent (large type, icons)"],
];

const THEMES = [{ name: "trade (default)", tokens: baseTokens }, ...themeBlocks];

for (const theme of THEMES) {
  const t = Object.assign({}, baseTokens, theme.tokens);
  const val = (key) => {
    const v = t["--" + key] || "";
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    return m ? "#" + m[1].toLowerCase() : "";
  };

  console.log("\n  === " + theme.name + "  (bg " + (val("bg") || "?") + ") ===");
  for (const [a, b, min, label] of GRID) {
    const ca = val(a), cb = val(b);
    if (!ca || !cb) {
      check(`${theme.name}: --${a} and --${b} are both resolvable 6-digit hex`, false);
      continue;
    }
    const got = contrast(ca, cb);
    const ok = got >= min;
    console.log("    " + (ok ? "ok  " : "FAIL") + "  " + (a + " on " + b).padEnd(30) +
      got.toFixed(2) + ":1  (min " + min + ")  " + label);
    check(`${theme.name}: ${a} on ${b} >= ${min}:1`, ok);
  }

  // A theme must not be able to remove the token the accent button depends on.
  check(`${theme.name}: resolves --fg-on-accent`, !!t["--fg-on-accent"]);

  // And the retired-brand ban applies to the themes too.
  const body = JSON.stringify(theme.tokens);
  check(`${theme.name}: carries no retired brand colour`, !RETIRED_COLOURS.test(body));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const publicDir = join(repo, "public");
const assets = walk(publicDir).filter((p) => [".css", ".html", ".js", ".svg"].includes(extname(p)));
console.log("\n--- retired colours across " + assets.length + " public files ---");
for (const f of assets) {
  const text = readFileSync(f, "utf8");
  const hit = RETIRED_COLOURS.exec(text);
  if (hit) console.log("  " + f.replace(repo, "") + " -> " + hit[0]);
  check("no retired brand colour in " + f.replace(repo, ""), !hit);
}

/* ---------------- --warn must never be a text colour ---------------- */

console.log("\n--- --warn used as a fill only ---");
const warnAsColour = /(?:^|[;{\s])color\s*:\s*(?:var\(\s*--warn\s*\)|#e3b324)/i;
for (const f of assets) {
  const text = readFileSync(f, "utf8");
  const hit = warnAsColour.exec(text);
  if (hit) console.log("  " + f.replace(repo, "") + " -> " + hit[0].trim());
  check("--warn is not used as a text colour in " + f.replace(repo, ""), !hit);
}
check("--warn is still defined (it is a legitimate fill token)", hex("warn") !== "");

/* ---------------- structural sanity ---------------- */

console.log("\n--- stylesheet structure ---");
const braces = (css.match(/\{/g) || []).length - (css.match(/\}/g) || []).length;
console.log("  brace balance: " + braces);
check("site.css braces balance", braces === 0);

/* An undefined custom property fails SILENTLY: the declaration is dropped, the
   element simply doesn't get the style, and nothing appears in the console.
   That is exactly how --r-full shipped referenced by four rules and declared by
   none, so every theme swatch rendered as a square instead of a circle and the
   only way to notice was to look at it. */
{
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  const used = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]));
  // Set at runtime by site.js or inline in markup, never declared in the sheet.
  const FROM_RUNTIME = new Set(["--w", "--d", "--sw-bg", "--sw-ac"]);
  const missing = [...used].filter((u) => !declared.has(u) && !FROM_RUNTIME.has(u));
  missing.forEach((m) => console.log("     undefined custom property: " + m));
  check(`every var(--token) in site.css is declared (${used.size} used)`, missing.length === 0);

  // Same check across the markup, since pages set tokens inline.
  const pageVars = new Set();
  for (const p of walk(join(repo, "public"))) {
    if (!/\.[ch]tml$|\.css$/.test(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) pageVars.add(m[1]);
  }
  const pageMissing = [...pageVars].filter((u) => !declared.has(u) && !FROM_RUNTIME.has(u));
  pageMissing.forEach((m) => console.log("     undefined custom property in markup: " + m));
  check(`every var(--token) used in public/ markup is declared (${pageVars.size} used)`,
    pageMissing.length === 0);
}

check("site.css declares @font-face for Jost", /@font-face[^}]*font-family:\s*'Jost'/.test(css));
check("site.css declares @font-face for Inter", /@font-face[^}]*font-family:\s*'Inter'/.test(css));
check("no Google Fonts URL anywhere in site.css", !/fonts\.(googleapis|gstatic)\.com/.test(css));
check("no third-party CDN reference anywhere in site.css", !/https?:\/\/(?!www\.w3\.org)/.test(css.replace(/url\("\/assets[^"]*"\)/g, "")));
check("all @media blocks are collected at the end of the file",
  css.indexOf("@media (max-width: 1199px)") > css.indexOf(".rv.is-in"));
check("prefers-reduced-motion kill-switch present",
  /@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(css));
check("coarse-pointer 44px touch targets present",
  /@media\s*\(hover:\s*none\)\s*,\s*\(pointer:\s*coarse\)/.test(css));

/* ---------------- local font files exist ---------------- */

console.log("\n--- self-hosted fonts ---");
for (const f of ["jost-latin.woff2", "jost-latin-ext.woff2", "inter-latin.woff2", "inter-latin-ext.woff2"]) {
  let exists = false;
  try {
    exists = statSync(join(publicDir, "assets/fonts", f)).size > 1000;
  } catch { exists = false; }
  check("public/assets/fonts/" + f + " exists and is non-trivial", exists);
}

console.log(failures ? "\n" + failures + " FAILED" : "\nall token assertions passed");
process.exit(failures ? 1 : 0);