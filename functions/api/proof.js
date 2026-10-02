/**
 * Public proof API — the site's "References" content.
 *
 * GET /api/proof -> { ok, quotes: [...], figures: [...], logos: [...] }
 *
 * Ported from aphelion/functions/api/proof.js — keep in sync.
 * tests/contract.test.mjs asserts this shape matches aphelion's field-for-field.
 *
 * Read-only and unauthenticated on purpose: this is exactly the content the
 * owner chose to publish in aphelion's Admin → References. Rows with enabled = 0
 * are never returned.
 *
 * Never throws — an unmigrated table (or no database) yields empty lists, so the
 * public blocks that consume it simply remove themselves rather than erroring.
 * The doctrine from aphelion migration 028: "the site never invents a
 * testimonial, and never shows an unfinished placeholder either."
 */
import { LIST_MAX, shapePublic } from "./_proof.js";

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export async function onRequestGet({ env }) {
  const db = env && env.DB_APHELION;
  let rows = [];
  if (db && typeof db.prepare === "function") {
    try {
      const r = await db
        .prepare(
          "SELECT id, kind, title, body, attribution, image_url, link_url, sort_order " +
            "FROM site_proof WHERE enabled = 1 ORDER BY sort_order, id"
        )
        .all();
      rows = (r && r.results) || [];
    } catch {
      rows = []; // table not migrated yet — the blocks stay hidden
    }
  }

  const all = rows.map(shapePublic);
  const of = (kind) => all.filter((r) => r.kind === kind).slice(0, LIST_MAX);
  return json(
    { ok: true, quotes: of("quote"), figures: of("figure"), logos: of("logo") },
    200,
    { "cache-control": "public, max-age=60" }
  );
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET" });
}