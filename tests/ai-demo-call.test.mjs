/**
 * /api/ai-demo-call tests — the /ai numpad trigger.
 *
 * Run with: node tests/ai-demo-call.test.mjs
 *
 * Pins: AU number normalisation, the fail-closed not_configured path, the
 * trigger request shape (URL, token header, {mobile, mode:"tour"}), the
 * lead row in call_requests, both rate-limit scopes (number + IP), the
 * form-encoded fallback, and the method guard.
 *
 * The VPS call is stubbed — these tests must never dial a real number.
 */

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO, d1, platformDb, jsonReq, formReq, getReq, J, checkRunner,
} from "./_fixtures.mjs";

const { check, done } = checkRunner("ai-demo-call");

const at = (rel) => pathToFileURL(join(REPO, rel)).href;
const mod = await import(at("functions/api/ai-demo-call.js"));
const { normalizeAuNumber } = mod;

/* ---------------- normalisation ---------------- */

console.log("\n--- normalizeAuNumber ---");

const cases = [
  ["0412 345 678", "+61412345678"],
  ["(03) 9999 8888", "+61399998888"],
  ["+61412345678", "+61412345678"],
  ["61412345678", "+61412345678"],
  ["0490038313", "+61490038313"],
  ["0280000000", "+61280000000"],
  ["12345", ""],
  ["04123456789", ""],       // 11 local digits: not a valid AU local form
  ["0112345678", ""],        // 01 is not an Australian area code here
  ["+441234567890", ""],
  ["", ""],
];
for (const [input, want] of cases) {
  check(`normalizeAuNumber(${JSON.stringify(input)}) -> ${want}`,
    normalizeAuNumber(input) === want);
}

/* ---------------- harness ---------------- */

function db() {
  // call_requests comes from migration 004, not schema.sql — build it here.
  const db = platformDb();
  db.exec(`CREATE TABLE IF NOT EXISTS call_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mobile TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','dialled','done')),
    notes TEXT NOT NULL DEFAULT ''
  );`);
  return db;
}

let upstreamCalls = [];
let upstreamReply = null;
const realFetch = globalThis.fetch;
function stubFetch(reply) {
  upstreamReply = reply;
  globalThis.fetch = async (url, opts) => {
    upstreamCalls.push({ url, opts });
    return {
      ok: true,
      status: 200,
      json: async () => reply,
    };
  };
}
const envWith = (over = {}) => ({
  DB_REPEATER: d1(db()),
  DB_APHELION: d1(platformDb()),
  JARVIS_CALL_TOKEN: "test-token",
  ...over,
});
const rows = (dbobj) => dbobj.prepare("SELECT * FROM call_requests ORDER BY id DESC").all();

/* ---------------- endpoint ---------------- */

console.log("\n--- endpoint ---");

// No token: fail closed, but the request is still a logged lead.
let dbb = db();
let r = await J(mod.onRequest({
  request: jsonReq({ number: "0412345678" }, "https://repeater.com.au/api/ai-demo-call"),
  env: { DB_REPEATER: d1(dbb), DB_APHELION: d1(platformDb()) },
}));
check("missing token -> 503 not_configured (fail closed)",
  r.status === 503 && r.body.ok === false && r.body.error === "not_configured");
check("the request was still logged as a new lead",
  rows(dbb).length === 1 && rows(dbb)[0].mobile === "+61412345678" && rows(dbb)[0].status === "new");

r = await J(mod.onRequest({
  request: jsonReq({ number: "12345" }, "https://repeater.com.au/api/ai-demo-call"),
  env: envWith(),
}));
check("invalid number -> 400 invalid_number",
  r.status === 400 && r.body.ok === false && r.body.error === "invalid_number");

// Happy path: upstream answers.
stubFetch({ status: "answered", detail: "call connected" });
dbb = db();
const env = { DB_REPEATER: d1(dbb), DB_APHELION: d1(platformDb()), JARVIS_CALL_TOKEN: "test-token" };
r = await J(mod.onRequest({
  request: new Request("https://repeater.com.au/api/ai-demo-call", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify({ number: "0412345678" }),
  }),
  env,
}));
check("answered -> 200 {ok:true, calling:true, answered:true}",
  r.status === 200 && r.body.ok === true && r.body.calling === true && r.body.answered === true);
check("the trigger hit the VPS with the token and the tour mode",
  upstreamCalls.length === 1 &&
  upstreamCalls[0].url === "http://85.155.189.216:8000/call" &&
  upstreamCalls[0].opts.headers["x-jarvis-token"] === "test-token" &&
  JSON.parse(upstreamCalls[0].opts.body).mode === "tour" &&
  JSON.parse(upstreamCalls[0].opts.body).mobile === "+61412345678");
check("the dialled call is logged with status dialled",
  rows(dbb).length === 1 && rows(dbb)[0].status === "dialled");

// No answer is not an error: the call went out, the lead is kept.
stubFetch({ status: "timeout", detail: "no originate reply (callee did not answer in time)" });
r = await J(mod.onRequest({
  request: jsonReq({ number: "0412345678" }, "https://repeater.com.au/api/ai-demo-call"),
  env: { DB_REPEATER: d1(db()), DB_APHELION: d1(platformDb()), JARVIS_CALL_TOKEN: "test-token" },
}));
check("dialled but unanswered -> 200 answered:false, not an error",
  r.status === 200 && r.body.ok === true && r.body.answered === false);

// Upstream auth rejection surfaces as not_configured, never as a silent 500.
globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ detail: "Unauthorized" }) });
r = await J(mod.onRequest({
  request: jsonReq({ number: "0412345678" }, "https://repeater.com.au/api/ai-demo-call"),
  env: envWith(),
}));
check("upstream 401 -> 503 not_configured", r.status === 503 && r.body.error === "not_configured");

/* ---------------- rate limits ---------------- */

console.log("\n--- rate limits ---");

stubFetch({ status: "answered", detail: "call connected" });
const envLimited = envWith();

// Same number: 2 per day.
r = await J(mod.onRequest({ request: jsonReq({ number: "0412000111" }), env: envLimited }));
check("call 1 for a number is allowed", r.status === 200);
r = await J(mod.onRequest({ request: jsonReq({ number: "0412000111" }), env: envLimited }));
check("call 2 for a number is allowed", r.status === 200);
r = await J(mod.onRequest({ request: jsonReq({ number: "0412000111" }), env: envLimited }));
check("call 3 for the same number -> 429 scoped to number",
  r.status === 429 && r.body.error === "rate_limited" && r.body.scope === "number");

// Same IP: 5 per day across DIFFERENT numbers.
for (let i = 0; i < 5; i++) {
  r = await J(mod.onRequest({
    request: new Request("https://repeater.com.au/api/ai-demo-call", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.9" },
      body: JSON.stringify({ number: "041200022" + i }),
    }),
    env: envLimited,
  }));
}
r = await J(mod.onRequest({
  request: new Request("https://repeater.com.au/api/ai-demo-call", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.9" },
    body: JSON.stringify({ number: "0412000333" }),
  }),
  env: envLimited,
}));
check("6th call from one IP in a day -> 429 scoped to ip",
  r.status === 429 && r.body.error === "rate_limited" && r.body.scope === "ip");

/* ---------------- encodings + method ---------------- */

console.log("\n--- encodings + method ---");

r = await J(mod.onRequest({
  request: formReq({ number: "0412345678" }, "https://repeater.com.au/api/ai-demo-call"),
  env: envWith(),
}));
check("form-encoded fallback accepted (JS-off path)", r.status === 200);

r = await J(mod.onRequest({
  request: getReq("https://repeater.com.au/api/ai-demo-call"),
  env: envWith(),
}));
check("GET -> 405", r.status === 405 && r.body.error === "method_not_allowed");

globalThis.fetch = realFetch;
done();
