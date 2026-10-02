/**
 * Import integrity.
 *
 * Run with: node tests/imports.test.mjs
 *
 * Walks every .js under functions/ and imports it.
 *
 * This test exists for one reason: an unresolved named import is a LINK-TIME
 * error in ESM. One missing export takes down every route in the file that
 * imports it, and no other test notices — because nothing else imports those
 * routes. aphelion keeps the same gate for the same reason and calls it
 * non-negotiable. It is deliberately run separately from `npm test`, because it
 * is the one check that must pass before anything is pushed.
 */

import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const functionsDir = join(repo, "functions");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? "PASS" : "FAIL") + " " + name + (cond || !detail ? "" : " -> " + detail));
  if (!cond) failures++;
}

const files = walk(functionsDir).sort();
console.log(`\n--- importing ${files.length} module(s) under functions/ ---`);

for (const file of files) {
  const rel = file.replace(repo, "").replace(/\\/g, "/");
  const base = rel.split("/").pop();
  const isMiddleware = base === "_middleware.js";
  const isHelper = !isMiddleware && base.startsWith("_");

  try {
    const mod = await import(pathToFileURL(file).href);
    const exported = Object.keys(mod);
    const handler = /onRequest/.test(exported.join(" "));
    check(rel, true);
    if (exported.length) console.log("     exports: " + exported.join(", "));

    if (isMiddleware) {
      // Root middleware IS routed (it wraps every request), so it must export
      // onRequest — but it is not a page route, so the route rule below
      // deliberately does not apply to it.
      check(rel + " (middleware) exports onRequest", handler);
    } else if (isHelper) {
      // Files prefixed "_" are imported by handlers and never routed by Pages.
      check(rel + ' is a helper (prefixed "_", not routed)', !handler);
    } else if (/^\/functions\/.+\.js$/.test(rel)) {
      // A route with no handler would silently do nothing in production.
      check(rel + " exports a request handler", handler);
    }
  } catch (e) {
    check(rel, false, e && e.message);
  }
}

console.log(failures ? `\n${failures} FAILED` : `\nImport integrity: ${files.length} module(s) under functions/, 0 failure(s).`);
process.exit(failures ? 1 : 0);