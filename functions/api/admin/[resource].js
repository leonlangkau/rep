/**
 * /api/admin/<resource> — CRUD for the fleet tables that share one shape.
 *
 *   companies · employees · devices · leases · service-events · callouts · call-requests
 *
 * Reached only through the admin middleware, so every request here is already
 * authenticated. Read-only views that need real aggregation live in
 * dashboard.js / reports.js / billing.js instead.
 *
 *   GET    ?id=          one row          (else: a filtered list)
 *   GET    ?status=&ownership=&company_id= (per-resource filters)
 *   POST   body.id?      update           (else: create)
 *   POST   body._delete=1                 delete
 *   PATCH/PUT body.id    update
 *   DELETE ?id=
 *
 * A form post (the server-rendered panel) is answered with a 303 back to
 * /admin?tab=<resource>; a fetch()/JSON caller gets JSON. Every value is bound;
 * only whitelisted table and column names reach the SQL string.
 */

import { json, readBody, wantsHtml, clean } from "./_lib.js";

const RESOURCES = {
  "companies": {
    table: "companies",
    cols: ["name", "contact_name", "contact_mobile", "email", "notes"],
    required: ["name"], order: "name COLLATE NOCASE", filters: [],
  },
  "employees": {
    table: "employees",
    cols: ["company_id", "name", "role", "mobile"],
    required: ["company_id", "name"], num: ["company_id"], order: "name COLLATE NOCASE", filters: ["company_id"],
  },
  "devices": {
    table: "devices",
    cols: ["company_id", "employee_id", "model", "imei", "serial", "status", "condition",
           "ownership", "mdm_enrolled", "enrolled_at", "landed_cost", "notes"],
    required: ["model"], num: ["company_id", "employee_id", "landed_cost"],
    nullableNum: ["company_id", "employee_id"], bool: ["mdm_enrolled"],
    order: "id DESC", filters: ["status", "ownership", "company_id"],
  },
  "leases": {
    table: "leases",
    cols: ["device_id", "company_id", "plan", "dayone_amount", "admin_fee_oneoff", "admin_fee_plan_cap",
           "recurring_fee", "payment_plan", "prepaid_total", "start_date", "term_months",
           "ppsr_registration_number", "ppsr_registered_at", "ppsr_expiry", "election_status",
           "holdover_started_at", "notes"],
    required: ["device_id", "company_id", "plan"],
    num: ["device_id", "company_id", "dayone_amount", "admin_fee_oneoff", "admin_fee_plan_cap", "term_months"],
    nullableNum: ["recurring_fee", "prepaid_total"],
    order: "id DESC", filters: ["plan", "payment_plan", "election_status", "company_id", "device_id"],
  },
  "service-events": {
    table: "service_events",
    cols: ["lease_id", "device_id", "event_type", "fee_charged", "parts_cost", "status",
           "approved_by_client", "opened_at", "resolved_at", "notes"],
    required: ["device_id"], num: ["lease_id", "device_id", "fee_charged", "parts_cost"],
    nullableNum: ["lease_id"], bool: ["approved_by_client"],
    order: "id DESC", filters: ["status", "device_id", "lease_id"],
  },
  "callouts": {
    table: "callouts",
    cols: ["company_id", "visit_date", "fee_charged", "within_20km", "notes"],
    required: ["company_id"], num: ["company_id", "fee_charged"], bool: ["within_20km"],
    order: "visit_date DESC, id DESC", filters: ["company_id"],
  },
  "call-requests": {
    table: "call_requests",
    cols: ["mobile", "status", "notes"],
    required: [], order: "created_at DESC, id DESC", filters: ["status"],
  },
};

function coerce(spec, key, raw) {
  if (spec.bool && spec.bool.includes(key)) {
    return (raw === true || raw === 1 || raw === "1" || raw === "on" || raw === "true") ? 1 : 0;
  }
  if (spec.num && spec.num.includes(key)) {
    if (raw === "" || raw == null) return spec.nullableNum && spec.nullableNum.includes(key) ? null : 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return String(raw == null ? "" : raw).slice(0, 4000);
}

function collect(spec, body) {
  const out = {};
  for (const k of spec.cols) {
    if (!(k in body)) continue;
    out[k] = coerce(spec, k, body[k]);
  }
  return out;
}

function isBlank(v) {
  return v == null || v === "" || v === 0 || v === "0";
}

async function listRows(db, spec, url) {
  const where = [];
  const params = [];
  for (const f of spec.filters) {
    const v = url.searchParams.get(f);
    if (v !== null && v !== "") { where.push(f + " = ?"); params.push(v); }
  }
  const sql = "SELECT * FROM " + spec.table +
    (where.length ? " WHERE " + where.join(" AND ") : "") +
    " ORDER BY " + spec.order + " LIMIT 500";
  const res = await db.prepare(sql).bind(...params).all();
  return (res && res.results) || [];
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const resource = clean(url.pathname.split("/").pop(), 40);
  const spec = RESOURCES[resource];
  if (!spec) return json({ error: "Unknown resource" }, 404);

  const db = env && (env.DB_REPEATER || env.DB);
  if (!db || typeof db.prepare !== "function") {
    return json({ ok: false, skip: true, reason: "schema_pending" }, 200);
  }

  const method = request.method.toUpperCase();

  try {
    if (method === "GET") {
      const id = url.searchParams.get("id");
      if (id !== null && id !== "") {
        const row = await db.prepare("SELECT * FROM " + spec.table + " WHERE id = ?").bind(id).first();
        return json({ ok: true, row: row || null });
      }
      return json({ ok: true, resource, rows: await listRows(db, spec, url) });
    }

    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      const body = method === "DELETE" ? {} : await readBody(request);
      const id = clean(url.searchParams.get("id") || body.id, 40);
      const del = method === "DELETE" || String(body._delete || "") === "1" || String(body._action || "") === "delete";

      if (del) {
        if (!id) return json({ error: "An id is required to delete." }, 400);
        await db.prepare("DELETE FROM " + spec.table + " WHERE id = ?").bind(id).run();
        return finish(request, resource, { ok: true, deleted: Number(id) });
      }

      const values = collect(spec, body);

      if (id) {
        const keys = Object.keys(values);
        if (!keys.length) return json({ error: "Nothing to update." }, 400);
        const sets = keys.map((k) => k + " = ?").join(", ");
        await db.prepare("UPDATE " + spec.table + " SET " + sets + " WHERE id = ?")
          .bind(...keys.map((k) => values[k]), id).run();
        const row = await db.prepare("SELECT * FROM " + spec.table + " WHERE id = ?").bind(id).first();
        return finish(request, resource, { ok: true, row: row || null });
      }

      for (const key of spec.required) {
        if (isBlank(values[key])) return json({ error: key + " is required." }, 400);
      }
      const cols = Object.keys(values).filter((k) => values[k] !== null || spec.num.includes(k));
      if (!cols.length) return json({ error: "Nothing to create." }, 400);
      const res = await db.prepare(
        "INSERT INTO " + spec.table + " (" + cols.join(", ") + ") VALUES (" +
        cols.map(() => "?").join(", ") + ")"
      ).bind(...cols.map((k) => values[k])).run();
      const newId = res && res.meta ? Number(res.meta.last_row_id) : null;
      const row = newId ? await db.prepare("SELECT * FROM " + spec.table + " WHERE id = ?").bind(newId).first() : null;
      return finish(request, resource, { ok: true, row: row || null });
    }

    return json({ error: "Method not allowed" }, 405, { allow: "GET, POST, PATCH, PUT, DELETE" });
  } catch (err) {
    return json({ error: "Database error", detail: String((err && err.message) || err).slice(0, 200) }, 400);
  }
}

function finish(request, resource, payload) {
  if (wantsHtml(request)) {
    return new Response(null, { status: 303, headers: { location: "/admin?tab=" + encodeURIComponent(resource) + "&saved=1" } });
  }
  return json(payload);
}