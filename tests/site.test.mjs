/**
 * Site integrity — routing, config files and internal links.
 *
 * Run with: node tests/site.test.mjs
 *
 * There is no build step and no router: a page is a file, and a link is a
 * string. That makes two classes of mistake very easy and completely invisible
 * until a customer hits them — a link to a page that was never created, and a
 * _redirects or _headers file with a syntax error that Cloudflare silently
 * ignores. Both are checked here.
 *
 * The link check walks every href in every page and resolves it against the
 * filesystem, treating `functions/` routes as real targets. That is why it
 * catches a typo'd "/catalogue" that would otherwise 404 in production.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

const allFiles = walk(publicDir);
const pages = allFiles.filter((p) => extname(p) === ".html");
const rel = (p) => p.replace(repo, "").replace(/\\/g, "/").replace(/^\//, "");

/* ---------------- routes exist ---------------- */

console.log("\n--- declared routes resolve to a file ---");

const ROUTES = [
  ["/", "public/index.html"],
  ["/phones", "public/phones/index.html"],
  ["/ai", "public/ai/index.html"],
  ["/shop-os", "public/shop-os/index.html"],
  ["/shop-os/pricing", "public/shop-os/pricing/index.html"],
  ["/shop-os/checkout", "public/shop-os/checkout/index.html"],
  ["/catalogue", "public/catalogue/index.html"],
  ["/wholesale", "public/wholesale/index.html"],
  ["/pricing", "public/pricing/index.html"],
  ["/about", "public/about/index.html"],
  ["/blog", "public/blog/index.html"],
  ["/contact", "public/contact/index.html"],
  ["/apply", "public/apply/index.html"],
  ["/privacy", "public/privacy.html"],
  ["/terms", "public/terms.html"],
  ["/404", "public/404.html"],
  ["/blog/article.html", "public/blog/article.html"],
];

for (const [route, file] of ROUTES) {
  check(`${route} -> ${file}`, existsSync(join(repo, file)));
}

console.log("\n--- function routes ---");
for (const f of ["functions/_middleware.js", "functions/sitemap.xml.js", "functions/blog/[slug].js",
                 "functions/api/proof.js", "functions/api/enquiry.js", "functions/api/catalogue.js",
                 "functions/api/posts.js", "functions/api/shop-os/checkout.js"]) {
  check(`${f} exists`, existsSync(join(repo, f)));
}
// The "_" convention is what stops a helper being served as an endpoint.
for (const h of ["functions/api/_proof.js", "functions/api/_ratelimit.js",
                 "functions/api/_alert.js", "functions/api/_time.js"]) {
  check(`${h} is a helper (never routed)`, existsSync(join(repo, h)));
}

/* ---------------- internal links resolve ---------------- */

console.log("\n--- internal links resolve ---");

/** Is there a static file, or a Pages Function, that would answer this path? */
function routeExists(path) {
  const clean = path.split("#")[0].split("?")[0];
  if (!clean || clean === "/") return existsSync(join(publicDir, "index.html"));

  const bare = clean.replace(/^\//, "");
  // Static candidates: exact file, or a directory index.
  if (existsSync(join(publicDir, bare))) return true;
  if (existsSync(join(publicDir, bare, "index.html"))) return true;
  if (existsSync(join(publicDir, bare + ".html"))) return true;

  // Function candidates, in Pages' precedence order.
  if (existsSync(join(repo, "functions", bare + ".js"))) return true;
  if (existsSync(join(repo, "functions", bare, "index.js"))) return true;

  // A dynamic segment, e.g. /blog/<slug> answered by functions/blog/[slug].js
  const parts = bare.split("/");
  if (parts.length >= 1) {
    const dir = join(repo, "functions", ...parts.slice(0, -1));
    if (existsSync(dir) && readdirSync(dir).some((n) => /^\[.*\]\.js$/.test(n))) return true;
  }
  return false;
}

let checkedLinks = 0;
const broken = [];

for (const p of pages) {
  const html = readFileSync(p, "utf8");
  const label = rel(p);
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    // Skip external, protocol and asset links — those are a separate concern.
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(href)) continue;
    if (/\.(css|js|woff2|png|svg|ico|xml|txt|webmanifest|json)$/.test(href.split("?")[0])) continue;
    if (!href.startsWith("/") && !href.startsWith("#")) continue;
    if (href.startsWith("#")) continue;

    checkedLinks++;
    if (!routeExists(href)) broken.push(`${label} -> ${href}`);
  }
}

if (broken.length) broken.forEach((b) => console.log("     broken: " + b));
check(`all ${checkedLinks} internal links resolve to a page or a function`, broken.length === 0);

/* ---------------- forms ---------------- */

console.log("\n--- forms are real and complete ---");

const forms = [];
for (const p of pages) {
  const html = readFileSync(p, "utf8");
  for (const m of html.matchAll(/<form[^>]*class="qform"[^>]*>([\s\S]*?)<\/form>/g)) {
    forms.push({ page: rel(p), tag: m[0], body: m[1] });
  }
}

check("there are three qform forms (contact, apply and the shop-os checkout)",
  forms.length === 3);

// Each form owns its attribution. The leads vocabulary is aphelion's
// ('fleet' | 'wholesale' | 'software' | 'other'), so the checkout — which is a
// software enquiry — must send 'software', not 'wholesale'.
const FORM_META = {
  "public/contact/index.html": { interest: "wholesale", source: "contact:enquiry" },
  "public/apply/index.html": { interest: "wholesale", source: "apply:trade" },
  "public/shop-os/checkout/index.html": { interest: "software", source: "checkout:enquiry" },
};

for (const f of forms) {
  check(`${f.page}: form posts to /api/enquiry`, /action="\/api\/enquiry"/.test(f.tag));
  check(`${f.page}: form method is post`, /method="post"/.test(f.tag));
  check(`${f.page}: sends business_slug=repeater`, /name="business_slug" value="repeater"/.test(f.body));
  check(`${f.page}: sends a source for attribution`, /name="source" value="[^"]+"/.test(f.body));
  check(`${f.page}: carries the honeypot field`, /name="company"/.test(f.body));
  check(`${f.page}: honeypot is off-screen and untabbable`,
    /qform__hp/.test(f.body) && /tabindex="-1"/.test(f.body));
  check(`${f.page}: has a name field`, /name="name"/.test(f.body));
  check(`${f.page}: has an email field`, /name="email"/.test(f.body));
  check(`${f.page}: has a phone field`, /name="phone"/.test(f.body));
  check(`${f.page}: has a message field`, /name="message"/.test(f.body));
  check(`${f.page}: has a status line for the JS path`, /class="qform__status"/.test(f.body));
  // novalidate would let an invalid form post natively and return raw JSON to a
  // visitor with JavaScript off. Native validation must stay on.
  check(`${f.page}: does NOT disable native validation`, !/novalidate/.test(f.tag));

  const meta = FORM_META[f.page];
  check(`${f.page}: is a known form with recorded attribution`, !!meta);
  if (meta) {
    check(`${f.page}: sends interest=${meta.interest}`,
      new RegExp(`name="interest" value="${meta.interest}"`).test(f.body));
    check(`${f.page}: sends source=${meta.source}`,
      new RegExp(`name="source" value="${meta.source}"`).test(f.body));
  }
}

check("the apply form asks for an ABN", forms.some((f) => /name="abn"/.test(f.body)));
check("the apply form asks for a volume band", forms.some((f) => /name="headcount"/.test(f.body)));
check("the apply form sends source=apply:trade", forms.some((f) => /value="apply:trade"/.test(f.body)));
check("the contact form sends source=contact:enquiry", forms.some((f) => /value="contact:enquiry"/.test(f.body)));

/* ---------------- _headers ---------------- */

console.log("\n--- _headers ---");
{
  const file = join(publicDir, "_headers");
  check("public/_headers exists", existsSync(file));
  if (existsSync(file)) {
    const lines = readFileSync(file, "utf8").split("\n");
    let currentPath = null;
    let headerCount = 0;
    let bad = [];
    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      if (!line.trim() || line.trim().startsWith("#")) continue;
      if (!/^\s/.test(line)) {
        // A path glob.
        if (!line.startsWith("/") && !line.startsWith("*") && !line.includes("/*")) {
          bad.push("path does not look like a glob: " + line);
        }
        currentPath = line;
        continue;
      }
      const m = /^\s+([A-Za-z][A-Za-z0-9-]*):\s*(.+)$/.exec(line);
      if (!m) bad.push("malformed header line: " + line);
      else {
        headerCount++;
        if (!currentPath) bad.push("header before any path: " + line);
      }
    }
    if (bad.length) bad.forEach((b) => console.log("     " + b));
    check("every non-comment line is a path or a well-formed 'Name: value' header", bad.length === 0);
    check("_headers declares more than a handful of rules", headerCount >= 8);
    check("HTML is set to revalidate", /Cache-Control: public, max-age=0, must-revalidate/.test(readFileSync(file, "utf8")));
    check("hashed-immutable fonts are declared", /\/assets\/fonts\/\*/.test(readFileSync(file, "utf8")));
    check("site.css is enumerated for must-revalidate",
      /\/assets\/site\.css\n\s+Cache-Control: public, max-age=0, must-revalidate/.test(readFileSync(file, "utf8")));
  }
}

/* ---------------- _redirects ---------------- */

console.log("\n--- _redirects ---");
{
  const file = join(publicDir, "_redirects");
  check("public/_redirects exists", existsSync(file));
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() && !l.trim().startsWith("#"));
    let bad = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2 || parts.length > 3) { bad.push("wrong field count: " + line); continue; }
      if (!parts[0].startsWith("/")) bad.push("source is not a path: " + line);
      if (parts[2] && !/^30[12]$/.test(parts[2])) bad.push("unsupported status: " + line);
    }
    if (bad.length) bad.forEach((b) => console.log("     " + b));
    check("every redirect line is 'source target [301|302]'", bad.length === 0);
    check(`${lines.length} redirects declared`, lines.length >= 5);

    // A redirect target that does not exist is a redirect to a 404.
    const deadTargets = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const target = parts[1];
      if (/^https?:/.test(target)) continue;
      if (!routeExists(target)) deadTargets.push(line);
    }
    if (deadTargets.length) deadTargets.forEach((t) => console.log("     dead target: " + t));
    check("every redirect target resolves to a real page", deadTargets.length === 0);
  }
}

/* ---------------- robots + sitemap ---------------- */

console.log("\n--- robots.txt and sitemap ---");
{
  const robots = readFileSync(join(publicDir, "robots.txt"), "utf8");
  check("robots.txt allows crawling", /User-agent: \*/i.test(robots) && /Allow: \//.test(robots));
  check("robots.txt points at the sitemap", /Sitemap: https:\/\/repeater\.com\.au\/sitemap\.xml/.test(robots));

  const sitemapFn = readFileSync(join(repo, "functions/sitemap.xml.js"), "utf8");
  check("sitemap.xml.js probes ASSETS before listing a route", /ASSETS/.test(sitemapFn));
  check("sitemap.xml.js lists published posts only", /status = 'published'/.test(sitemapFn));
  check("sitemap.xml.js never throws on a missing database", /catch\s*\{/.test(sitemapFn));

  // Every route the sitemap declares must exist, or the sitemap advertises 404s.
  const declared = [...sitemapFn.matchAll(/\[\s*"(\/[^"]*)"\s*,/g)].map((m) => m[1]);
  const missing = declared.filter((d) => !routeExists(d));
  if (missing.length) missing.forEach((m) => console.log("     sitemap lists a missing route: " + m));
  check(`all ${declared.length} routes named in the sitemap exist`, declared.length > 0 && missing.length === 0);
}

/* ---------------- no build artifacts / stray files ---------------- */

console.log("\n--- repository hygiene ---");
check("package.json declares no dependencies (no build step)",
  !/"dependencies"/.test(readFileSync(join(repo, "package.json"), "utf8")));
check("package.json declares no devDependencies (nothing to build)",
  !/"devDependencies"/.test(readFileSync(join(repo, "package.json"), "utf8")));
check("wrangler.toml sets pages_build_output_dir to public",
  /pages_build_output_dir = "public"/.test(readFileSync(join(repo, "wrangler.toml"), "utf8")));
check("wrangler.toml binds DB_REPEATER", /binding = "DB_REPEATER"/.test(readFileSync(join(repo, "wrangler.toml"), "utf8")));
check("wrangler.toml binds DB_APHELION", /binding = "DB_APHELION"/.test(readFileSync(join(repo, "wrangler.toml"), "utf8")));
check("wrangler.toml binds MEDIA_FSR", /binding = "MEDIA_FSR"/.test(readFileSync(join(repo, "wrangler.toml"), "utf8")));
check("no scratch or editor files under public/",
  !allFiles.some((f) => /\.(bak|tmp|orig|swp)$/i.test(f) || /~$/.test(f)));
check("no source maps under public/", !allFiles.some((f) => f.endsWith(".map")));

console.log(failures ? `\n${failures} FAILED` : "\nall site assertions passed");
process.exit(failures ? 1 : 0);