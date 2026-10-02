/**
 * API contract tests — /api/proof, /api/enquiry, /api/posts.
 *
 * Run with: node tests/contract.test.mjs
 *
 * These pin the contracts this repo shares with aphelion. proof.js and
 * enquiry.js are ports, and the whole point of a port is that the two sides
 * cannot drift silently — so the shapes and every error path are asserted here,
 * field for field, and schemaDrift() fails the build if aphelion adds a column
 * to `leads`, `site_proof` or `rate_limits` that the copy in _fixtures.mjs
 * doesn't know about.
 */

import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  REPO, d1, platformDb, schemaDrift, jsonReq, formReq, getReq, J, checkRunner,
} from "./_fixtures.mjs";

const { check, done } = checkRunner("contract");

const at = (rel) => pathToFileURL(join(REPO, rel)).href;
const proofMod = await import(at("functions/api/proof.js"));
const enquiryMod = await import(at("functions/api/enquiry.js"));
const postsMod = await import(at("functions/api/posts.js"));

/* ================= /api/proof ================= */

console.log("\n--- /api/proof ---");

// No database at all: the blocks must vanish, not the endpoint blow up.
let r = await J(proofMod.onRequestGet({ env: {} }));
check("proof with no DB -> 200 {ok:true} and three empty lists",
  r.status === 200 && r.body.ok === true &&
  Array.isArray(r.body.quotes) && r.body.quotes.length === 0 &&
  Array.isArray(r.body.figures) && r.body.figures.length === 0 &&
  Array.isArray(r.body.logos) && r.body.logos.length === 0);

check("proof response carries exactly the agreed keys",
  JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(["figures", "logos", "ok", "quotes"]));

check("proof is cacheable for a minute",
  String(r.headers.get("cache-control") || "").includes("max-age=60"));

// Unmigrated table: same answer, still no throw.
r = await J(proofMod.onRequestGet({ env: { DB_APHELION: d1(platformDb()) } }));
check("proof with an empty table -> still ok:true with empty lists",
  r.status === 200 && r.body.ok === true && r.body.quotes.length === 0);

r = await J(proofMod.onRequestGet({ env: { DB_APHELION: {} } }));
check("proof against a broken binding object does not throw",
  r.status === 200 && r.body.ok === true);

// Real rows, including the sanitisation the shape guarantees.
{
  const db = platformDb();
  db.exec(`INSERT INTO site_proof (kind, title, body, attribution, image_url, link_url, sort_order, enabled) VALUES
    ('quote', '', 'Reliable supply, priced properly.', 'A. Customer, Some Repairs', '', '', 1, 1),
    ('quote', '', 'Hidden quote', 'Nobody', '', '', 2, 0),
    ('figure', '98%', 'Orders dispatched same day', 'Some Client', '', '', 3, 1),
    ('logo', 'Client Co', '', '', 'javascript:alert(1)', 'javascript:alert(1)', 4, 1);`);
  r = await J(proofMod.onRequestGet({ env: { DB_APHELION: d1(db) } }));

  check("only enabled rows are returned (the enabled=0 quote is absent)",
    r.body.quotes.length === 1 && r.body.quotes[0].body === "Reliable supply, priced properly.");
  check("figures come back shaped with title and body",
    r.body.figures.length === 1 && r.body.figures[0].title === "98%" && r.body.figures[0].body === "Orders dispatched same day");
  check("a logo comes back with its title preserved",
    r.body.logos.length === 1 && r.body.logos[0].title === "Client Co");
  check("javascript: URLs are stripped from image_url and link_url (no XSS via a stored value)",
    r.body.logos[0].image_url === "" && r.body.logos[0].link_url === "");
}

// Method handling.
r = await J(proofMod.onRequest({ request: getReq("https://repeater.com.au/api/proof") }));
check("GET is allowed", r.status === 200);
r = await J(proofMod.onRequest({ request: jsonReq({}, "https://repeater.com.au/api/proof") }));
check("POST -> 405 with allow: GET", r.status === 405 && r.headers.get("allow") === "GET");

/* ================= /api/enquiry ================= */

console.log("\n--- /api/enquiry ---");

// No database: nothing stored, no alert channel configured -> must NOT claim success.
r = await J(enquiryMod.onRequestPost({
  request: jsonReq({ name: "Ada", email: "ada@example.com" }),
  env: {},
}));
check("no DB and no alert channel -> 503, never a false 'thanks'",
  r.status === 503 && r.body.ok === false);

// Happy path, JSON.
{
  const db = platformDb();
  const env = { DB_APHELION: d1(db) };
  r = await J(enquiryMod.onRequestPost({
    request: jsonReq({
      name: "Ada Lovelace", email: "ada@example.com", phone: "0400000000",
      business: "Analytical Repairs", headcount: "2000-10000",
      interest: "wholesale", message: "Need screens.",
      source: "apply:trade", business_slug: "repeater",
    }),
    env,
  }));
  check("JSON body -> 200 {ok:true, stored:true}", r.status === 200 && r.body.ok === true && r.body.stored === true);

  const row = db.prepare("SELECT * FROM leads").get();
  check("the lead landed with interest='wholesale'", row.interest === "wholesale");
  check("business_slug was recorded as repeater", row.business_slug === "repeater");
  check("source survived intact for attribution", row.source === "apply:trade");
  check("status starts at 'new'", row.status === "new");
  check("no raw IP was persisted — ip_hash is a short digest",
    typeof row.ip_hash === "string" && row.ip_hash.length === 16 && !row.ip_hash.includes("."));
  check("business name was stored in business_name, not message",
    row.business_name === "Analytical Repairs");
}

// Form-encoded body — the no-JavaScript path the endpoint exists to support.
{
  const db = platformDb();
  r = await J(enquiryMod.onRequestPost({
    request: formReq({ name: "Grace Hopper", phone: "0400111222", business: "Compiler Co", interest: "wholesale" }),
    env: { DB_APHELION: d1(db) },
  }));
  check("form-encoded body -> 200 stored (the form works without JS)",
    r.status === 200 && r.body.ok === true && r.body.stored === true);
  check("a phone-only form post is accepted (no email required)",
    db.prepare("SELECT phone FROM leads").get().phone === "0400111222");
}

// ABN folding: /apply sends abn, which is NOT a leads column.
{
  const db = platformDb();
  r = await J(enquiryMod.onRequestPost({
    request: jsonReq({ name: "Alan Turing", email: "alan@example.com", abn: "12 345 678 901" }),
    env: { DB_APHELION: d1(db) },
  }));
  check("an ABN in the body is accepted, not rejected", r.status === 200 && r.body.stored === true);
  check("the ABN is carried into message rather than silently dropped",
    /12 345 678 901/.test(db.prepare("SELECT message FROM leads").get().message));
}

// Honeypot.
{
  const db = platformDb();
  r = await J(enquiryMod.onRequestPost({
    request: jsonReq({ name: "Bot", email: "bot@example.com", company: "spam ltd" }),
    env: { DB_APHELION: d1(db) },
  }));
  check("honeypot -> 200 so the bot believes it worked", r.status === 200 && r.body.ok === true);
  check("honeypot -> stored:false", r.body.stored === false);
  check("honeypot -> nothing written to the database",
    db.prepare("SELECT COUNT(*) AS n FROM leads").get().n === 0);
}

// Validation.
console.log("\n--- /api/enquiry validation ---");
const badDb = () => ({ DB_APHELION: d1(platformDb()) });

r = await J(enquiryMod.onRequestPost({ request: jsonReq({ email: "x@y.com" }), env: badDb() }));
check("missing name -> 400", r.status === 400 && r.body.ok === false);

r = await J(enquiryMod.onRequestPost({ request: jsonReq({ name: "Ada" }), env: badDb() }));
check("missing both email and phone -> 400", r.status === 400);

r = await J(enquiryMod.onRequestPost({ request: jsonReq({ name: "Ada", email: "not-an-email" }), env: badDb() }));
check("malformed email -> 400", r.status === 400);

r = await J(enquiryMod.onRequestPost({ request: jsonReq({}), env: badDb() }));
check("empty JSON object -> 400", r.status === 400);

r = await J(enquiryMod.onRequestPost({
  request: new Request("https://repeater.com.au/api/enquiry", { method: "POST", headers: { "content-type": "application/json" }, body: "not json at all" }),
  env: badDb(),
}));
check("a body that is neither JSON nor a form -> 400, not a crash", r.status === 400);

// Method handling.
r = await J(enquiryMod.onRequest({ request: getReq("https://repeater.com.au/api/enquiry") }));
check("GET -> 405 with allow: POST", r.status === 405 && r.headers.get("allow") === "POST");
{
  const res = await enquiryMod.onRequest({ request: new Request("https://repeater.com.au/api/enquiry", { method: "OPTIONS" }) });
  check("OPTIONS -> 204 with allow: POST", res.status === 204 && res.headers.get("allow") === "POST");
}

// Rate limiting: 5 per 600s, so the 6th identical submission is refused.
console.log("\n--- /api/enquiry rate limiting ---");
{
  const db = platformDb();
  const env = { DB_APHELION: d1(db) };
  let last = null;
  for (let i = 0; i < 6; i++) {
    last = await J(enquiryMod.onRequestPost({
      request: jsonReq({ name: "Repeat " + i, email: "r" + i + "@example.com", interest: "wholesale" }, "https://repeater.com.au/api/enquiry"),
      env,
    }));
  }
  check("the 6th submission in the window is refused with 429", last.status === 429 && last.body.ok === false);
  check("the 429 carries a retry-after hint", Number(last.headers.get("retry-after")) > 0);
  check("the first five were all accepted", db.prepare("SELECT COUNT(*) AS n FROM leads").get().n === 5);
}

// A missing rate_limits table must FAIL OPEN, not block the customer.
{
  const db = platformDb();
  db.exec("DROP TABLE rate_limits");
  r = await J(enquiryMod.onRequestPost({
    request: jsonReq({ name: "No Limiter", email: "nl@example.com" }),
    env: { DB_APHELION: d1(db) },
  }));
  check("with no rate_limits table the endpoint still succeeds (fail open)",
    r.status === 200 && r.body.stored === true);
}

/* ================= /api/posts ================= */

console.log("\n--- /api/posts ---");

r = await J(postsMod.onRequestGet({ request: getReq("https://repeater.com.au/api/posts"), env: {} }));
check("posts with no DB -> 200 {ok:true, posts:[]}", r.status === 200 && r.body.ok === true && r.body.posts.length === 0);

{
  const db = platformDb();
  // site_posts is created by this repo's real schema.sql.
  const { readFileSync } = await import("node:fs");
  db.exec(readFileSync(join(REPO, "schema.sql"), "utf8"));
  db.exec(`INSERT INTO site_posts (slug, title, excerpt, body, status, published_at) VALUES
    ('live-post', 'A live post', 'Excerpt here', 'Body text', 'published', '2026-09-01'),
    ('draft-post', 'A draft', 'Draft excerpt', 'Draft body', 'draft', '2026-09-02');`);

  r = await J(postsMod.onRequestGet({ request: getReq("https://repeater.com.au/api/posts"), env: { DB_REPEATER: d1(db) } }));
  check("only published posts are listed (draft absent)", r.body.posts.length === 1 && r.body.posts[0].slug === "live-post");
  check("post bodies are NOT included in the list response",
    r.body.posts.every((p) => !("body" in p)));
  check("list entries carry slug, title, excerpt, published_at",
    ["slug", "title", "excerpt", "author", "cover_url", "published_at"].every((k) => k in r.body.posts[0]));

  r = await J(postsMod.onRequestGet({ request: getReq("https://repeater.com.au/api/posts?all=1"), env: { DB_REPEATER: d1(db) } }));
  check("?all=1 still filters drafts out", r.body.posts.length === 1);
}

/* ================= drift ================= */

console.log("\n--- platform schema drift ---");
const drift = schemaDrift();
if (drift.length) drift.forEach((line) => check("drift: " + line, false));
else check("the copied platform DDL matches aphelion's migrations (leads, site_proof, rate_limits)", true);

done();