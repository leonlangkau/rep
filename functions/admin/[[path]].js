/**
 * /admin — Repeater's fleet desk, server-rendered.
 *
 * Served by this Function (not a static page) so the gate is real: without a
 * valid session cookie it returns the sign-in page and nothing else. The login
 * form posts to /api/admin/login, which sets the cookie and redirects back
 * here; sign-out posts to /api/admin/logout.
 *
 * Every section is rendered from D1 on the server, so the panel works with
 * JavaScript off. Writes are ordinary <form> posts to /api/admin/<resource>,
 * which answer with a 303 back to /admin?tab=<resource>. The JSON endpoints
 * that back the panel are under /api/admin/* (guarded by the admin middleware)
 * and are also usable directly.
 *
 * Styling uses the site's own design tokens (no new palette), scoped to .adm*.
 * A repaint is deliberately not part of this pass.
 */

import { SESSION_COOKIE, readCookie } from "../api/admin/_lib.js";
import { findSession } from "../api/admin/_users.js";
import { onRequestGet as dashboardData } from "../api/admin/dashboard.js";
import { onRequestGet as reportsData } from "../api/admin/reports.js";
import { onRequestGet as billingData } from "../api/admin/billing.js";

/* ---------------- helpers ---------------- */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function money(n) {
  const v = Number(n) || 0;
  return "$" + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

async function many(env, sql, params = []) {
  const db = env && (env.DB_REPEATER || env.DB);
  if (!db || typeof db.prepare !== "function") return [];
  try {
    const res = await db.prepare(sql).bind(...params).all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}

const TABS = [
  ["dashboard", "Dashboard"],
  ["companies", "Companies"],
  ["employees", "Employees"],
  ["devices", "Devices"],
  ["leases", "Leases"],
  ["service-events", "Service events"],
  ["callouts", "Call-outs"],
  ["call-requests", "Call requests"],
  ["reports", "Reports"],
  ["billing", "Billing"],
];

const OPTIONS = {
  "device-status": ["in_stock", "leased", "on_plan", "loaner_pool", "in_repair", "returned", "retired"],
  ownership: ["repeater", "client"],
  plan: ["phones_only", "device_care"],
  payment_plan: ["weekly", "prepaid"],
  election_status: ["active", "return", "renew", "holdover"],
  "service-status": ["booked", "in_progress", "done", "declined"],
  "request-status": ["new", "dialled", "done"],
};

/* Field specs: name, label, type, extra. type: text|number|date|textarea|select|checkbox */
const FORMS = {
  companies: [
    ["name", "Name", "text", { required: true }],
    ["contact_name", "Contact name", "text"],
    ["contact_mobile", "Contact mobile", "text"],
    ["email", "Email", "text"],
    ["notes", "Notes", "textarea"],
  ],
  employees: [
    ["company_id", "Company id", "number", { required: true }],
    ["name", "Name", "text", { required: true }],
    ["role", "Role", "text"],
    ["mobile", "Mobile", "text"],
  ],
  devices: [
    ["model", "Model", "text", { required: true }],
    ["imei", "IMEI", "text"],
    ["serial", "Serial", "text"],
    ["status", "Status", "select", { options: OPTIONS["device-status"] }],
    ["condition", "Condition", "text"],
    ["ownership", "Ownership", "select", { options: OPTIONS.ownership }],
    ["company_id", "Company id", "number"],
    ["employee_id", "Employee id", "number"],
    ["mdm_enrolled", "MDM enrolled", "checkbox"],
    ["landed_cost", "Landed cost", "number"],
    ["notes", "Notes", "textarea"],
  ],
  leases: [
    ["device_id", "Device id", "number", { required: true }],
    ["company_id", "Company id", "number", { required: true }],
    ["plan", "Plan", "select", { options: OPTIONS.plan, required: true }],
    ["dayone_amount", "Day-one amount", "number"],
    ["admin_fee_oneoff", "Admin fee (one-off)", "number"],
    ["admin_fee_plan_cap", "Admin fee plan cap", "number"],
    ["recurring_fee", "Weekly care fee", "number"],
    ["payment_plan", "Payment plan", "select", { options: OPTIONS.payment_plan }],
    ["prepaid_total", "Prepaid total", "number"],
    ["start_date", "Start date", "date"],
    ["term_months", "Term (months)", "number"],
    ["ppsr_registration_number", "PPSR number", "text"],
    ["ppsr_registered_at", "PPSR registered", "date"],
    ["ppsr_expiry", "PPSR expiry", "date"],
    ["election_status", "End-of-term election", "select", { options: OPTIONS.election_status }],
    ["holdover_started_at", "Holdover started", "date"],
    ["notes", "Notes", "textarea"],
  ],
  "service-events": [
    ["device_id", "Device id", "number", { required: true }],
    ["lease_id", "Lease id", "number"],
    ["event_type", "Event type", "text"],
    ["fee_charged", "Fee charged (0 included / 60 over-cap)", "number"],
    ["parts_cost", "Parts cost", "number"],
    ["status", "Status", "select", { options: OPTIONS["service-status"] }],
    ["approved_by_client", "Approved by client", "checkbox"],
    ["opened_at", "Opened", "date"],
    ["resolved_at", "Resolved", "date"],
    ["notes", "Notes", "textarea"],
  ],
  callouts: [
    ["company_id", "Company id", "number", { required: true }],
    ["visit_date", "Visit date", "date"],
    ["fee_charged", "Fee charged (0 free / 19)", "number"],
    ["within_20km", "Within 20 km", "checkbox"],
    ["notes", "Notes", "textarea"],
  ],
  "call-requests": [
    ["mobile", "Mobile", "text"],
    ["status", "Status", "select", { options: OPTIONS["request-status"] }],
    ["notes", "Notes", "textarea"],
  ],
};

/** Create/edit defaults that mirror the locked canon, so a PA-2 lease is one click. */
const LEASE_DEFAULTS = {
  plan: "device_care", dayone_amount: 622, admin_fee_oneoff: 27.5, admin_fee_plan_cap: 110,
  recurring_fee: 5.6, payment_plan: "weekly", term_months: 24, election_status: "active",
};

function fieldHtml(name, label, type, opts = {}, value) {
  const v = value == null ? "" : value;
  const req = opts.required ? " required" : "";
  const id = "f_" + name;
  let input;
  if (type === "textarea") {
    input = `<textarea id="${id}" name="${esc(name)}" rows="2">${esc(v)}</textarea>`;
  } else if (type === "select") {
    const list = (opts.options || []).map((o) =>
      `<option value="${esc(o)}"${String(v) === o ? " selected" : ""}>${esc(o)}</option>`).join("");
    input = `<select id="${id}" name="${esc(name)}"${req}>${list}</select>`;
  } else if (type === "checkbox") {
    input = `<input type="hidden" name="${esc(name)}" value=""><input id="${id}" type="checkbox" name="${esc(name)}" value="1"${v === 1 || v === "1" || v === true ? " checked" : ""}>`;
  } else {
    input = `<input id="${id}" type="${type}" name="${esc(name)}" value="${esc(v)}"${req}>`;
  }
  return `<label class="adm-field"><span>${esc(label)}</span>${input}</label>`;
}

function formHtml(resource, row) {
  const spec = FORMS[resource];
  if (!spec) return "";
  const editing = row && row.id;
  const defaults = resource === "leases" ? LEASE_DEFAULTS : {};
  const body = spec.map(([name, label, type, opts]) => {
    let value = row ? row[name] : defaults[name];
    return fieldHtml(name, label, type, opts, value);
  }).join("");
  return `<form class="adm-form" method="post" action="/api/admin/${esc(resource)}">
    ${editing ? `<input type="hidden" name="id" value="${esc(row.id)}">` : ""}
    ${body}
    <div class="adm-actions">
      <button class="adm-btn" type="submit">${editing ? "Save" : "Create"}</button>
      ${editing ? `<a class="adm-btn adm-btn--quiet" href="/admin?tab=${esc(resource)}">Cancel</a>` : ""}
    </div>
  </form>`;
}

function deleteForm(resource, id) {
  return `<form method="post" action="/api/admin/${esc(resource)}" class="adm-inline" onsubmit="return confirm('Delete this row?')">
    <input type="hidden" name="id" value="${esc(id)}"><input type="hidden" name="_delete" value="1">
    <button class="adm-link adm-link--danger" type="submit">Delete</button>
  </form>`;
}

function editLink(resource, id) {
  return `<a class="adm-link" href="/admin?tab=${esc(resource)}&edit=${esc(id)}">Edit</a>`;
}

function table(headers, rows) {
  if (!rows.length) return `<p class="adm-empty">Nothing yet.</p>`;
  return `<div class="adm-tablewrap"><table class="adm-table">
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

/* ---------------- sections ---------------- */

async function tabDashboard(env) {
  const data = await (await dashboardData({ env })).json();
  const sum = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  const cards = [
    ["Devices in field", String(data.devices_in_field || 0)],
    ["Active leases", String(sum(data.active_leases || [], "leases"))],
    ["Quarterly events logged", String(sum(data.quarterly_events || [], "used"))],
    ["Free call-outs used", String(sum(data.free_callouts || [], "free_used"))],
  ];
  let out = `<div class="adm-cards">${cards.map(([k, v]) =>
    `<div class="adm-card"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join("")}</div>`;

  out += `<h2>Service events, this quarter vs cap</h2>` + table(
    ["Company", "Devices on plan", "Used", "Cap"],
    (data.quarterly_events || []).map((r) => [esc(r.company || r.company_id), esc(r.devices_on_plan), esc(r.used), esc(r.cap)]));

  out += `<h2>Devices approaching the 4-paid-event limit</h2>` + table(
    ["Company", "Device", "Paid events (12 mo)"],
    (data.approaching_paid_limit || []).map((r) => [esc(r.company || r.company_id), esc(r.model || r.device_id), esc(r.paid_events)]));

  out += `<h2>Free call-outs used (rolling 12 months)</h2>` + table(
    ["Company", "Free used (first 2 free, then $19 within 20 km)"],
    (data.free_callouts || []).map((r) => [esc(r.company || r.company_id), esc(r.free_used)]));

  out += `<h2>PPSR expiring within 90 days</h2>` + table(
    ["Company", "Device", "PPSR", "Expiry"],
    (data.ppsr_expiring || []).map((r) => [esc(r.company), esc(r.model), esc(r.ppsr_registration_number), esc(r.ppsr_expiry)]));

  out += `<h2>End-of-term elections due within 60 days (return or renew)</h2>` + table(
    ["Company", "Device", "Start", "Term"],
    (data.elections_due || []).map((r) => [esc(r.company), esc(r.model), esc(r.start_date), esc(r.term_months)]));

  out += `<h2>Recurring billing run list</h2>` + table(
    ["Charge day", "Weekly leases", "Weekly fees"],
    (data.billing_run || []).map((r) => [esc(r.charge_day), esc(r.leases), esc(money(r.weekly_fees))]));
  return out;
}

async function tabReports(env) {
  const data = await (await reportsData({ env })).json();
  let out = `<h2>Service events per month</h2>` + table(
    ["Month", "Events", "Paid events", "Fees", "Parts"],
    (data.events_per_month || []).map((r) => [esc(r.month), esc(r.events), esc(r.paid_events), esc(money(r.fee_total)), esc(money(r.parts_total))]));

  out += `<h2>Parts cost per event (the $80 tripwire average)</h2>` + table(
    ["Month", "Done events", "Average parts", "Max parts", "Against $80"],
    (data.parts_per_event || []).map((r) => [esc(r.month), esc(r.events), esc(money(r.avg_parts_cost)), esc(money(r.max_parts_cost)), esc(r.tripwire)]));

  out += `<h2>Fleet composition</h2>` + table(
    ["Ownership", "Status", "Devices"],
    (data.fleet_composition || []).map((r) => [esc(r.ownership), esc(r.status), esc(r.devices)]));

  out += `<h2>Return vs renew</h2>` + table(
    ["Election", "Leases"],
    (data.return_vs_renew || []).map((r) => [esc(r.election_status), esc(r.n)]));
  return out;
}

async function tabBilling(env) {
  const data = await (await billingData({ env })).json();
  if (!data.configured) {
    return `<p class="adm-empty">Repair Shop OS subscription data is not available from here yet. Nothing is read from a payment processor on this page.</p>`;
  }
  return table(
    ["Business", "Contact", "Plan", "Amount", "Interval", "Status", "Period end"],
    (data.rows || []).map((r) => [esc(r.business_name || r.customer_id), esc(r.contact_email), esc(r.plan),
      esc(money((Number(r.amount_cents) || 0) / 100)), esc(r.interval), esc(r.status), esc(r.current_period_end)]));
}

const LIST_SQL = {
  companies: "SELECT * FROM companies ORDER BY name COLLATE NOCASE LIMIT 300",
  employees: "SELECT * FROM employees ORDER BY company_id, name COLLATE NOCASE LIMIT 500",
  devices: "SELECT * FROM devices ORDER BY id DESC LIMIT 500",
  leases: "SELECT * FROM leases ORDER BY id DESC LIMIT 500",
  "service-events": "SELECT * FROM service_events ORDER BY id DESC LIMIT 500",
  callouts: "SELECT * FROM callouts ORDER BY visit_date DESC, id DESC LIMIT 500",
  "call-requests": "SELECT * FROM call_requests ORDER BY created_at DESC, id DESC LIMIT 500",
};

async function tabResource(env, resource, url) {
  const rows = await many(env, LIST_SQL[resource]);
  const editId = url.searchParams.get("edit");
  const editing = editId ? rows.find((r) => String(r.id) === String(editId)) || null : null;

  let heading = editing ? `Edit ${resource} #${esc(editing.id)}` : `New ${resource.replace(/-/g, " ")}`;
  let out = `<h2>${heading}</h2>` + formHtml(resource, editing);

  if (!rows.length) return out + `<p class="adm-empty">Nothing yet.</p>`;

  const defs = {
    companies: {
      headers: ["id", "name", "contact", "mobile", "email", ""],
      row: (r) => [esc(r.id), esc(r.name), esc(r.contact_name), esc(r.contact_mobile), esc(r.email),
        editLink("companies", r.id) + " " + deleteForm("companies", r.id)],
    },
    employees: {
      headers: ["id", "company", "name", "role", "mobile", ""],
      row: (r) => [esc(r.id), esc(r.company_id), esc(r.name), esc(r.role), esc(r.mobile),
        editLink("employees", r.id) + " " + deleteForm("employees", r.id)],
    },
    devices: {
      headers: ["id", "model", "imei", "status", "ownership", "company", "MDM", ""],
      row: (r) => [esc(r.id), esc(r.model), esc(r.imei), esc(r.status), esc(r.ownership), esc(r.company_id),
        r.mdm_enrolled ? "yes" : "no", editLink("devices", r.id) + " " + deleteForm("devices", r.id)],
    },
    leases: {
      headers: ["id", "device", "company", "plan", "payment", "weekly", "election", "PPSR expiry", ""],
      row: (r) => [esc(r.id), esc(r.device_id), esc(r.company_id), esc(r.plan), esc(r.payment_plan),
        r.recurring_fee == null ? "—" : esc(money(r.recurring_fee)), esc(r.election_status), esc(r.ppsr_expiry),
        editLink("leases", r.id) + " " + deleteForm("leases", r.id)],
    },
    "service-events": {
      headers: ["id", "device", "type", "fee", "parts", "status", "approved", ""],
      row: (r) => [esc(r.id), esc(r.device_id), esc(r.event_type), esc(money(r.fee_charged)), esc(money(r.parts_cost)),
        esc(r.status), r.approved_by_client ? "yes" : "no", editLink("service-events", r.id) + " " + deleteForm("service-events", r.id)],
    },
    callouts: {
      headers: ["id", "company", "date", "fee", "within 20 km", ""],
      row: (r) => [esc(r.id), esc(r.company_id), esc(r.visit_date), esc(money(r.fee_charged)), r.within_20km ? "yes" : "no",
        editLink("callouts", r.id) + " " + deleteForm("callouts", r.id)],
    },
    "call-requests": {
      headers: ["id", "mobile", "created", "status", "notes", ""],
      row: (r) => [esc(r.id), esc(r.mobile), esc(r.created_at), esc(r.status), esc(r.notes),
        editLink("call-requests", r.id) + " " + deleteForm("call-requests", r.id)],
    },
  }[resource];

  out += `<h2>${esc(resource.replace(/-/g, " "))}</h2>` + table(defs.headers, rows.map(defs.row));
  return out;
}

/* ---------------- shell ---------------- */

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body.adm { margin: 0; font: 15px/1.5 Inter, system-ui, sans-serif; color: var(--fg, #0b1220); background: var(--bg, #fff); }
.adm-wrap { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 20px; }
.adm-top { border-bottom: 1px solid var(--line, #e6e6e6); background: var(--bg-sunken, #f7f7f8); position: sticky; top: 0; z-index: 5; }
.adm-top .adm-wrap { display: flex; align-items: center; gap: 16px; min-height: 56px; flex-wrap: wrap; }
.adm-brand { font-weight: 700; text-decoration: none; color: inherit; letter-spacing: -0.02em; }
.adm-brand span { color: var(--fg-3, #6b7280); font-weight: 500; }
.adm-tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.adm-tab { padding: 7px 11px; border-radius: 999px; text-decoration: none; color: var(--fg-2, #374151); font-size: 13.5px; }
.adm-tab:hover { background: var(--bg, #fff); color: var(--fg, #0b1220); }
.adm-tab[aria-current="page"] { background: var(--accent-strong, #2f6fe0); color: #fff; }
main.adm-wrap { padding: 28px 20px 80px; }
h2 { font-size: 18px; letter-spacing: -0.01em; margin: 32px 0 12px; }
.adm-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 8px 0 4px; }
.adm-card { border: 1px solid var(--line, #e6e6e6); border-radius: 12px; padding: 16px; background: var(--bg, #fff); }
.adm-card b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
.adm-card span { color: var(--fg-3, #6b7280); font-size: 13px; }
.adm-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: end; border: 1px solid var(--line, #e6e6e6); border-radius: 12px; padding: 16px; background: var(--bg-sunken, #f7f7f8); }
.adm-field { display: grid; gap: 4px; font-size: 13px; }
.adm-field span { color: var(--fg-2, #374151); font-weight: 500; }
.adm-field input, .adm-field select, .adm-field textarea { width: 100%; padding: 8px 10px; font: inherit; border: 1px solid var(--line-strong, #cfcfcf); border-radius: 8px; background: var(--bg, #fff); color: inherit; }
.adm-actions { grid-column: 1 / -1; display: flex; gap: 8px; }
.adm-btn { display: inline-flex; align-items: center; justify-content: center; padding: 8px 14px; border-radius: 999px; border: 1px solid transparent; background: var(--accent-strong, #2f6fe0); color: #fff; font: 600 14px/1 Inter, system-ui, sans-serif; cursor: pointer; text-decoration: none; }
.adm-btn--quiet { background: transparent; border-color: var(--line-strong, #cfcfcf); color: var(--fg, #0b1220); }
.adm-link { color: var(--accent-strong, #2f6fe0); font-size: 13px; text-decoration: none; }
.adm-link--danger { background: none; border: 0; cursor: pointer; color: var(--danger-strong, #b00020); padding: 0; }
.adm-inline { display: inline; }
.adm-tablewrap { overflow-x: auto; border: 1px solid var(--line, #e6e6e6); border-radius: 12px; }
.adm-table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.adm-table th { text-align: left; padding: 10px 12px; background: var(--bg-sunken, #f7f7f8); color: var(--fg-3, #6b7280); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
.adm-table td { padding: 10px 12px; border-top: 1px solid var(--line-2, #efefef); white-space: nowrap; font-variant-numeric: tabular-nums; }
.adm-empty { color: var(--fg-3, #6b7280); border: 1px dashed var(--line-strong, #cfcfcf); border-radius: 12px; padding: 16px; }
.adm-login { max-width: 380px; margin: 12vh auto; }
.adm-login h1 { font-size: 24px; letter-spacing: -0.02em; }
.adm-login .adm-form { grid-template-columns: minmax(0, 1fr); }
.adm-note { color: var(--fg-3, #6b7280); font-size: 13px; }
@media (max-width: 860px) { .adm-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } .adm-form { grid-template-columns: minmax(0, 1fr); } }
`;

function page(title, inner) {
  return `<!doctype html>
<html lang="en-AU"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>${STYLE}</style>
</head><body class="adm">
${inner}
</body></html>`;
}

function loginPage(message) {
  return page("Sign in — Repeater admin", `
<main class="adm-wrap adm-login">
  <h1>Repeater admin</h1>
  ${message ? `<p class="adm-note">${esc(message)}</p>` : ""}
  <form class="adm-form" method="post" action="/api/admin/login">
    <label class="adm-field"><span>Username</span><input type="text" name="username" autocomplete="username" value="admin"></label>
    <label class="adm-field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
    <div class="adm-actions"><button class="adm-btn" type="submit">Sign in</button></div>
  </form>
  <p class="adm-note">Sessions are held in this site's own D1 tables. Two-factor is a follow-up, not enabled.</p>
</main>`);
}

function shell(session, tab, body) {
  const tabs = TABS.map(([key, label]) =>
    `<a class="adm-tab"${key === tab ? ' aria-current="page"' : ""} href="/admin?tab=${esc(key)}">${esc(label)}</a>`).join("");
  return page("Repeater admin", `
<header class="adm-top"><div class="adm-wrap">
  <a class="adm-brand" href="/admin">Repeater <span>admin</span></a>
  <nav class="adm-tabs" aria-label="Admin sections">${tabs}</nav>
  <form method="post" action="/api/admin/logout"><button class="adm-btn adm-btn--quiet" type="submit">Sign out</button></form>
</div></header>
<main class="adm-wrap">
  ${body}
</main>`);
}

/* ---------------- handler ---------------- */

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }

  const session = await findSession(env, readCookie(request, SESSION_COOKIE));
  if (!session) {
    return html(loginPage(url.searchParams.get("loggedout") ? "You have been signed out." : ""));
  }

  const tab = TABS.some(([k]) => k === url.searchParams.get("tab")) ? url.searchParams.get("tab") : "dashboard";
  let body;
  try {
    if (tab === "dashboard") body = await tabDashboard(env);
    else if (tab === "reports") body = await tabReports(env);
    else if (tab === "billing") body = await tabBilling(env);
    else if (FORMS[tab]) body = await tabResource(env, tab, url);
    else body = `<p class="adm-empty">Unknown section.</p>`;
  } catch (err) {
    body = `<p class="adm-empty">Could not render this section: ${esc(String((err && err.message) || err).slice(0, 200))}</p>`;
  }

  if (url.searchParams.get("saved")) body = `<p class="adm-note">Saved.</p>` + body;
  return html(shell(session, tab, body));
}