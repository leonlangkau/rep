/**
 * Chrome parity and head hygiene.
 *
 * Run with: node tests/chrome.test.mjs
 *
 * There are no includes in this house — the nav, footer and CTA band are
 * copy-pasted into every page, and there is no build step that could template
 * them. So parity is enforced here instead, by extracting the chrome from each
 * page and comparing it against public/404.html. This is exactly the job
 * aphelion's tests/site-root.test.mjs does for its public pages, and it is the
 * only thing standing between "copy-pasted" and "drifted".
 *
 * A page that adds a nav link, drops the skip link, or forgets og:image fails
 * the build rather than shipping a subtly different header on one page.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(repo, "public");

let failures = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " " + name);
  if (!cond) failures++;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const pages = walk(publicDir).filter((p) => extname(p) === ".html").sort();
/** Repo-relative, forward-slashed, no leading slash — "public/index.html". */
const rel = (p) => p.replace(repo, "").replace(/\\/g, "/").replace(/^\//, "");

/** Collapse whitespace so indentation differences don't read as drift. */
const norm = (s) => String(s).replace(/\s+/g, " ").trim();

/** The article template renders through a Function, so its slots differ. */
const isTemplate = (p) => rel(p) === "public/blog/article.html";

console.log(`\n--- ${pages.length} page(s) ---`);
pages.forEach((p) => console.log("  " + rel(p)));

/* ---------------- chrome parity ---------------- */

const reference = readFileSync(join(publicDir, "404.html"), "utf8");

function extract(html, tag, className) {
  const re = new RegExp(`<${tag}[^>]*class="${className}"[^>]*>[\\s\\S]*?</${tag}>`, "i");
  const m = re.exec(html);
  return m ? norm(m[0]) : null;
}

/*
 * The nav is byte-identical on every page except two deliberate slots: the
 * `nav__link--here` active marker, and the CTA. The umbrella pages invite a
 * conversation ("Book a call"); the trade-supply pages invite an application.
 * Normalise both slots before comparing, and assert the CTA's exact value
 * separately below — parity still covers everything else, byte for byte.
 */
const NAV_CTA_RE = /<a class="btn btn--accent (btn--sm|btn--block)" href="[^"]*">[^<]*<\/a>/g;
const normalizeNav = (s) => String(s)
  .replace(/\s*nav__link--here/g, "")
  .replace(NAV_CTA_RE, (_, cls) => `<a class="btn btn--accent ${cls}" href="CTA">CTA</a>`);

/** Trade-supply pages keep the application CTA; everything else books a call. */
const TRADE_PAGES = new Set([
  "public/catalogue/index.html",
  "public/wholesale/index.html",
  "public/apply/index.html",
]);
const NAV_CTA = {
  umbrella: { href: "/contact", label: "Book a call" },
  trade: { href: "/apply", label: "Apply for a trade account" },
};

const refNav = normalizeNav(extract(reference, "header", "nav"));
const refFoot = extract(reference, "footer", "foot");
const refCta = extract(reference, "section", "sec sec--band cta");

console.log("\n--- chrome parity against 404.html ---");
check("the reference page has a nav, a footer and a CTA band",
  !!refNav && !!refFoot && !!refCta);

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);

  const nav = extract(html, "header", "nav");
  const foot = extract(html, "footer", "foot");
  const cta = extract(html, "section", "sec sec--band cta");

  check(`${label}: has the shared <header class="nav">`, !!nav);
  check(`${label}: has the shared <footer class="foot">`, !!foot);
  check(`${label}: has the shared CTA band`, !!cta);

  if (nav) {
    const same = normalizeNav(nav) === refNav;
    check(`${label}: nav is identical to the reference (bar the CTA variant)`, same);

    const cm = /<a class="btn btn--accent btn--sm" href="([^"]+)">([^<]+)<\/a>/.exec(nav);
    const want = TRADE_PAGES.has(label) ? NAV_CTA.trade : NAV_CTA.umbrella;
    check(`${label}: nav CTA is "${want.label}" -> ${want.href}`,
      !!cm && cm[1] === want.href && cm[2] === want.label);
  }
  if (foot) check(`${label}: footer is identical to the reference`, foot === refFoot);

  // The CTA band is deliberately NOT byte-identical: its headline is per-page
  // copy ("Order wholesale, without the chaos." on the home page, "Ask before
  // you apply." on privacy), which is the point of it. What must not drift is
  // its STRUCTURE — the same wrapper, the same eyebrow, one headline, one lede,
  // and exactly one solid button.
  if (cta) {
    check(`${label}: CTA band uses the shared wrapper class`, /class="wrap cta__in"/.test(cta));
    check(`${label}: CTA band has an eyebrow, an h2 and a lede`,
      /class="eyebrow"/.test(cta) && /<h2>/.test(cta) && /<p>/.test(cta));
    const buttons = (cta.match(/class="btn btn--solid"/g) || []).length;
    check(`${label}: CTA band has exactly one solid button`, buttons === 1);
  }

  check(`${label}: nav arrives before the main content`,
    html.indexOf('class="nav"') < html.indexOf("<main"));
  check(`${label}: footer comes after the CTA band`,
    html.indexOf('class="foot"') > html.indexOf("sec--band cta"));
}

/* ---------------- head hygiene ---------------- */

console.log("\n--- head hygiene ---");

const titles = new Map();
const descriptions = new Map();
// The article template is excluded from the description check (its description
// is written per post by functions/blog/[slug].js), so uniqueness is asserted
// against the pages that actually declare one.
let descriptionsChecked = 0;

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const template = isTemplate(p);
  const notFound = label.endsWith("404.html");

  check(`${label}: <html lang="en-AU">`, /<html lang="en-AU">/.test(html));
  check(`${label}: <meta charset="utf-8">`, /<meta charset="utf-8">/.test(html));
  check(`${label}: viewport meta`, /<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html));

  const t = /<title[^>]*>([\s\S]*?)<\/title>/.exec(html);
  check(`${label}: has a <title>`, !!t && t[1].trim().length > 8);
  if (t) {
    const key = norm(t[1]);
    if (titles.has(key)) check(`${label}: title is unique (also on ${titles.get(key)})`, false);
    else titles.set(key, label);
  }

  // blog/article.html is a server-rendered template: a Function fills its
  // description, canonical and JSON-LD per post (see functions/blog/[slug].js),
  // so the static defaults are deliberately generic and are not asserted here.
  if (!template) {
    const d = /<meta name="description"[^>]*content="([^"]+)"/.exec(html);
    check(`${label}: has a meta description`, !!d && d[1].trim().length > 30);
    if (d) {
      descriptionsChecked++;
      const key = norm(d[1]);
      if (descriptions.has(key)) check(`${label}: description is unique (also on ${descriptions.get(key)})`, false);
      else descriptions.set(key, label);
    }

    // A 404 is noindex and has no canonical entity, so the canonical is
    // deliberately absent there. Every other page must carry one.
    if (!notFound) {
      check(`${label}: has a canonical`, /<link rel="canonical" href="https:\/\/repeater\.com\.au/.test(html));
    } else {
      check(`${label}: 404 is marked noindex`, /<meta name="robots" content="noindex/.test(html));
    }
  }

  check(`${label}: theme-color is set`, /<meta name="theme-color" content="#ffffff">/.test(html));
  check(`${label}: links favicon.svg`, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/.test(html));
  check(`${label}: preloads the latin Inter woff2`, /preload" as="font" type="font\/woff2" href="\/assets\/fonts\/inter-latin\.woff2"/.test(html));
  check(`${label}: preloads the latin Jost woff2`, /preload" as="font" type="font\/woff2" href="\/assets\/fonts\/jost-latin\.woff2"/.test(html));
  check(`${label}: links site.css`, /<link rel="stylesheet" href="\/assets\/site\.css">/.test(html));
  check(`${label}: loads facts.js`, /<script defer src="\/assets\/facts\.js"><\/script>/.test(html));
  check(`${label}: loads site.js`, /<script defer src="\/assets\/site\.js"><\/script>/.test(html));

  check(`${label}: carries og:image`, /og:image" content="https:\/\/repeater\.com\.au\/assets\/img\/og\.png"/.test(html));
  check(`${label}: declares og:locale en_AU`, /og:locale" content="en_AU"/.test(html));
  check(`${label}: declares a twitter card`, /name="twitter:card" content="summary_large_image"/.test(html));

  check(`${label}: has a skip link immediately after <body>`,
    /<body>\s*<a class="skip" href="#main">Skip to content<\/a>/.test(html));
  check(`${label}: has a <main id="main">`, /<main id="main">/.test(html));

  check(`${label}: no Google Fonts reference`, !/fonts\.(googleapis|gstatic)\.com/.test(html));
  check(`${label}: no retired brand colour`, !/#c4f666|#b3db6a|#b3db69|#00ff86|#f5b301|#ffc633|#d99e00|#ffd873|#7c6cff|#35e0d0/i.test(html));
}

check("every page has a distinct title", titles.size === pages.length);
check("every page that declares a description has a distinct one",
  descriptions.size === descriptionsChecked && descriptionsChecked > 8);

/* ---------------- the active nav link ---------------- */

console.log("\n--- active nav link ---");
const EXPECTED_ACTIVE = {
  "public/index.html": null,
  "public/404.html": null,
  "public/privacy.html": null,
  "public/terms.html": null,
  "public/catalogue/index.html": null,
  "public/wholesale/index.html": "Trade supply",
  "public/pricing/index.html": "Pricing",
  "public/about/index.html": "About",
  "public/blog/index.html": null,
  "public/blog/article.html": null,
  "public/contact/index.html": null,
  "public/apply/index.html": null,
  "public/phones/index.html": "Phones",
  "public/ai/index.html": "AI Calls",
  "public/shop-os/index.html": "Shop OS",
  "public/shop-os/pricing/index.html": "Shop OS",
  "public/shop-os/checkout/index.html": "Shop OS",
};

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const want = EXPECTED_ACTIVE[label];
  const m = /<a class="nav__link nav__link--here" href="([^"]+)">([^<]+)<\/a>/.exec(html);
  const got = m ? m[2] : null;
  if (want === undefined) {
    console.log("  (no expectation recorded for " + label + ")");
    continue;
  }
  check(`${label}: active nav link is ${want === null ? "none" : want}`, got === want);
}

/* ---------------- JSON-LD ---------------- */

console.log("\n--- structured data ---");
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];

  // The 404 has no entity to describe (it is noindex, and there is no "page"
  // here), and the article template's JSON-LD is written per post by
  // functions/blog/[slug].js. Both are deliberate omissions, not oversights.
  if (isTemplate(p)) {
    check(`${label}: carries a JSON-LD slot for the Function to fill`, blocks.length === 1);
    continue;
  }
  if (label.endsWith("404.html")) continue;

  check(`${label}: has a JSON-LD block`, blocks.length > 0);
  for (const [, body] of blocks) {
    let ok = true;
    let err = "";
    try { JSON.parse(body); } catch (e) { ok = false; err = e.message; }
    check(`${label}: JSON-LD parses${ok ? "" : " -> " + err}`, ok);
  }
}

const home = readFileSync(join(publicDir, "index.html"), "utf8");
// The home page is the umbrella brand now, not a wholesale store, so it
// describes an Organization — WholesaleStore would re-claim the old positioning.
check("the home page declares Organization structured data", /"@type":\s*"Organization"/.test(home));

// FAQPage markup is worth having on every page that actually shows a FAQ —
// Google reads it, and it costs nothing because the text is already there.
console.log("\n--- FAQ structured data ---");
const FAQ_JSONLD_ERROR = [];
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const faqItems = (html.match(/class="faq__item"/g) || []).length;
  if (!faqItems) continue;
  const hasFaqSchema = /"@type":\s*"FAQPage"/.test(html);
  check(`${label}: shows ${faqItems} FAQ item(s) and carries FAQPage schema`, hasFaqSchema);
  if (!hasFaqSchema) FAQ_JSONLD_ERROR.push(label);
}
check("every page with a FAQ declares FAQPage", FAQ_JSONLD_ERROR.length === 0);

/* ---------------- client module wiring ---------------- */

// Each client module declares which markup hook it needs. A page that carries
// the hook but never loads the module fails SILENTLY: the block simply stays
// hidden forever, which looks exactly like "there is no content yet". That is
// how /about, /catalogue and /pricing shipped without proof.js/catalogue.js on
// the first pass — the chrome was perfect and the page was still dead.
console.log("\n--- client modules match their markup hooks ---");
const HOOKS = [
  { script: "/assets/proof.js", attr: "data-proof" },
  { script: "/assets/catalogue.js", attr: "data-catalogue" },
  { script: "/assets/posts.js", attr: "data-posts" },
  { script: "/assets/form.js", attr: 'class="qform"' },
];
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  for (const h of HOOKS) {
    if (!html.includes(h.attr)) continue;
    check(`${label}: uses ${h.attr}, so it loads ${h.script}`,
      new RegExp(`src="${h.script.replace(/[.]/g, "\\.")}"`).test(html));
  }
}

/* ---------------- the CTA band's per-page copy ---------------- */

// The band is allowed to differ per page — that is the point of it — but two
// failure modes are not allowed: a CTA whose button links to the page it is
// already on (which is what /contact did while inheriting 404.html's copy), and
// copy so thoroughly inherited that every page makes the same pitch.
console.log("\n--- CTA band copy ---");
const ctaHeadlines = new Map();
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const sec = /<section class="sec sec--band cta">([\s\S]*?)<\/section>/.exec(html);
  if (!sec) continue;

  const href = (/<a class="btn btn--solid" href="([^"]*)"/.exec(sec[1]) || [, null])[1];

  // "/" for index.html, else the directory.
  const selfPath = label === "public/index.html" ? "/" : "/" + label
    .replace(/^public\//, "").replace(/\/index\.html$/, "");
  check(`${label}: CTA button does not link to its own page (-> ${href})`, href !== selfPath);

  const h2 = (/<h2>([\s\S]*?)<\/h2>/.exec(sec[1]) || [, null])[1];
  if (h2) {
    const key = norm(h2);
    if (!ctaHeadlines.has(key)) ctaHeadlines.set(key, []);
    ctaHeadlines.get(key).push(label);
  }
}

// Reusing a headline is fine — the home page and the blog share the brand's
// primary line, which is deliberate. What is NOT fine is the whole site making
// one inherited pitch: that is exactly how seven pages ended up shipping
// 404.html's "The order line is faster than a form."
const worst = [...ctaHeadlines.entries()].sort((a, b) => b[1].length - a[1].length)[0];
console.log("     " + ctaHeadlines.size + " distinct headline(s); most common covers " +
  (worst ? worst[1].length : 0) + " page(s)");
if (worst && worst[1].length > 3) console.log("     over-used: " + JSON.stringify(worst[0]));
check("no single CTA headline is inherited by more than 3 pages",
  !worst || worst[1].length <= 3);
check(`the CTA makes a distinct pitch on most pages (${ctaHeadlines.size} headlines)`,
  ctaHeadlines.size >= Math.ceil(pages.length / 2));

/* ---------------- voice rules (VOICE.md) ---------------- */

// The wording constitution is enforced, not just written down. Two rules are
// mechanical enough to pin: the banned hype vocabulary, and the ban on
// exclamation marks. Both are checked against the COPY only — comments name the
// rules, scripts carry syntax, and neither is the page speaking to a reader.
console.log("\n--- voice rules ---");
const BANNED_WORDS =
  /unlock|unleash|elevate|seamless|effortless|empower|delight|revolutionary|game-changer|cutting-edge|supercharge|world-class|best-in-class|next-level/i;

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  const copy = html
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const bw = BANNED_WORDS.exec(copy);
  check(`${label}: no banned hype word${bw ? " (found: " + bw[0] + ")" : ""}`, !bw);

  const ex = copy.indexOf("!");
  check(`${label}: no exclamation marks in the copy`, ex === -1);
  if (ex !== -1) console.log("     near: " + copy.slice(Math.max(0, ex - 30), ex + 30).replace(/\s+/g, " "));
}

/* ---------------- em dashes ---------------- */

// VOICE.md calls them "em-dash confetti" and the site is kept free of them
// entirely. Unlike "!", which is legitimate inside scripts and !important, an em
// dash has no syntax role anywhere, so this walks EVERY text file under public/
// (comments, scripts and styles included) and asserts there is not one, in any
// of its three spellings.
console.log("\n--- em dashes ---");
const EM_DASH_EXT = new Set([".html", ".css", ".js", ".json", ".xml", ".txt", ".svg", ".md"]);
let emLeft = 0;
for (const p of walk(publicDir)) {
  if (!EM_DASH_EXT.has(extname(p))) continue;
  const hits = readFileSync(p, "utf8").match(/&mdash;|\u2014|\\u2014/g);
  if (hits) { emLeft += hits.length; check(`${rel(p)}: no em dashes (${hits.length} found)`, false); }
}
check("the site carries no em dashes at all", emLeft === 0);

console.log(failures ? `\n${failures} FAILED` : `\nall chrome assertions passed across ${pages.length} page(s)`);
process.exit(failures ? 1 : 0);