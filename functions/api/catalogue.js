/**
 * Public catalogue API.
 *
 * GET /api/catalogue -> { ok, categories: [...], products: [...] }
 *
 * Reads DB_REPEATER, which this repo does NOT own: `products` and `price_breaks`
 * were created by ../fivestarrepairs/schema.sql and are also read by aphelion's
 * Wholesale tab. This handler only ever reads, and only ever the columns listed
 * below.
 *
 * WHAT IS PUBLISHED, AND WHAT IS NOT.
 *   Published: product identity (name, brand, category, condition), whether it
 *   is in stock, and its quantity-break ladder — the published trade price for
 *   each break, GST-exclusive, exactly as 007_b2b_wholesale.sql defines it.
 *   Withheld: anything account-specific. `negotiated_prices`, `price_lists` and
 *   `cost_plus_rules` are never read by this file, so an account's own pricing
 *   and our cost base cannot leak through this endpoint even by accident.
 *   tests/catalogue.test.mjs asserts those three tables are absent from the SQL.
 *
 * `products.price` is deliberately NOT selected. In this shared schema it is the
 * RETAIL price (it is what fivestarrepairs.com.au shoppifies), so publishing it
 * on a wholesale site would quote the wrong number at the wrong customer.
 *
 * Degrades gracefully, per the house doctrine: a missing binding, an unmigrated
 * table or a schema that has drifted all yield { ok: true, products: [] } rather
 * than a 500. An empty catalogue is a normal state here — the page is designed
 * around it — so it must never look like an error.
 */

export const MAX_PRODUCTS = 200;
export const MAX_BREAKS = 8;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

export async function onRequestGet({ env }) {
  const empty = { ok: true, categories: [], products: [] };
  const db = env && env.DB_REPEATER;
  if (!db || typeof db.prepare !== "function") return json(empty, 200, { "cache-control": "public, max-age=60" });

  let rows = [];
  try {
    const r = await db
      .prepare(
        "SELECT id, slug, name, brand, category, description, condition, stock " +
          "FROM products WHERE status = 'active' " +
          "ORDER BY category, brand, name LIMIT ?"
      )
      .bind(MAX_PRODUCTS)
      .all();
    rows = (r && r.results) || [];
  } catch {
    // Table missing, or a column renamed by a sibling repo: publish nothing
    // rather than a 500. The page then shows its normal gated state.
    return json(empty, 200, { "cache-control": "public, max-age=60" });
  }

  if (!rows.length) return json(empty, 200, { "cache-control": "public, max-age=60" });

  // Quantity breaks, in one query rather than one per product.
  const breaksByProduct = new Map();
  try {
    const ids = rows.map((r) => r.id).filter((id) => Number.isFinite(id));
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const b = await db
        .prepare(
          "SELECT product_id, min_qty, unit_price_ex FROM price_breaks " +
            `WHERE product_id IN (${placeholders}) ORDER BY product_id, min_qty`
        )
        .bind(...ids)
        .all();
      for (const row of (b && b.results) || []) {
        const list = breaksByProduct.get(row.product_id) || [];
        if (list.length >= MAX_BREAKS) continue;
        list.push({
          min_qty: Number(row.min_qty) || 1,
          unit_price_ex: Number(row.unit_price_ex) || 0,
        });
        breaksByProduct.set(row.product_id, list);
      }
    }
  } catch {
    // No price_breaks table: publish the products without break tiers rather
    // than dropping the whole catalogue.
  }

  const products = rows.map((r) => {
    const stock = Number(r.stock) || 0;
    return {
      id: r.id,
      slug: clean(r.slug, 120),
      name: clean(r.name, 160),
      brand: clean(r.brand, 80),
      category: clean(r.category, 40) || "other",
      description: clean(r.description, 400),
      condition: clean(r.condition, 40),
      in_stock: stock > 0,
      breaks: breaksByProduct.get(r.id) || [],
    };
  });

  const categories = [...new Set(products.map((p) => p.category))].sort();

  return json({ ok: true, categories, products }, 200, {
    "cache-control": "public, max-age=60",
  });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET" });
}