-- 004: Repeater fleet-phone admin — the companies / employees / devices /
-- leases / service-events / call-outs / call-requests model, plus the tables
-- Repeater's own /admin panel authenticates against.
--
-- Applies to: the `repeater` database (DB_REPEATER).
--   npx wrangler d1 execute repeater --remote --yes --file=migrations/004_fleet_admin.sql
--
-- Re-runnable: every statement is IF NOT EXISTS, and there is no ALTER here, so
-- (unlike 003) this file is safe to apply twice.
--
-- OWNERSHIP. This database is shared: it carries the fivestarrepairs schema
-- (jobs, invoices, orders, parts …) and aphelion's wholesale tables. It also
-- already carries fivestarrepairs' `admin_users` (it references `staff.id`), so
-- Repeater's admin auth does NOT reuse that name — it owns
-- `rep_admin_users` / `rep_admin_sessions` instead and never touches FSR's.
-- This file creates only tables this repo owns.

-- ---------------- customers / staff of a fleet ----------------

CREATE TABLE IF NOT EXISTS companies (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  contact_name   TEXT NOT NULL DEFAULT '',
  contact_mobile TEXT NOT NULL DEFAULT '',
  email          TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (name);

CREATE TABLE IF NOT EXISTS employees (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT '',
  mobile     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees (company_id);

-- ---------------- the handsets ----------------
-- A device may sit in stock before it is attached to a company or employee.
-- `ownership` separates Repeater's leased fleet from a client-owned handset
-- that is nonetheless managed (MDM) on a plan.

CREATE TABLE IF NOT EXISTS devices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  model        TEXT NOT NULL DEFAULT '',
  imei         TEXT NOT NULL DEFAULT '',
  serial       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'in_stock'
                 CHECK (status IN ('in_stock','leased','on_plan','loaner_pool','in_repair','returned','retired')),
  condition    TEXT NOT NULL DEFAULT '',
  ownership    TEXT NOT NULL DEFAULT 'repeater' CHECK (ownership IN ('repeater','client')),
  mdm_enrolled INTEGER NOT NULL DEFAULT 0,
  enrolled_at  TEXT,
  landed_cost  REAL NOT NULL DEFAULT 0,
  notes        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);
CREATE INDEX IF NOT EXISTS idx_devices_ownership ON devices (ownership);
CREATE INDEX IF NOT EXISTS idx_devices_company ON devices (company_id);

-- ---------------- one lease row per device ----------------
-- The plan is fixed at signing and never changes mid-term, so there is no
-- separate care_plans table: the care terms live inside a device_care lease.
--
--   phones_only (PA-1) : dayone 572 + establishment, one-off admin fee 27.50
--                        capped at admin_fee_plan_cap 110 per plan, recurring
--                        fee NULL, no buyout at term end.
--   device_care (PA-2) : dayone 622, admin fee 27.50/device capped 110 per plan
--                        but COLLECTED WEEKLY across the term, recurring_fee per
--                        care tier (5.60 base ladder), prepaid = 10% off the
--                        tier's standard total, return/renew only.
-- The headline figures on the public page are the owner's locked canon; where
-- they and these stored components differ, the page copy is authoritative and
-- the difference is reported rather than reconciled here.

CREATE TABLE IF NOT EXISTS leases (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id                INTEGER NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  company_id               INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  plan                     TEXT NOT NULL CHECK (plan IN ('phones_only','device_care')),
  dayone_amount            REAL NOT NULL DEFAULT 0,
  admin_fee_oneoff         REAL NOT NULL DEFAULT 0,
  admin_fee_plan_cap       REAL NOT NULL DEFAULT 110,
  recurring_fee            REAL,
  payment_plan             TEXT NOT NULL DEFAULT 'weekly' CHECK (payment_plan IN ('weekly','prepaid')),
  prepaid_total            REAL,
  start_date               TEXT,
  term_months              INTEGER NOT NULL DEFAULT 24,
  ppsr_registration_number TEXT NOT NULL DEFAULT '',
  ppsr_registered_at       TEXT,
  ppsr_expiry              TEXT,
  election_status          TEXT NOT NULL DEFAULT 'active'
                             CHECK (election_status IN ('active','return','renew','holdover')),
  holdover_started_at      TEXT,
  notes                    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_leases_device ON leases (device_id);
CREATE INDEX IF NOT EXISTS idx_leases_company ON leases (company_id);
CREATE INDEX IF NOT EXISTS idx_leases_election ON leases (election_status);

-- ---------------- repairs / service events ----------------
-- fee_charged 0 = an included event, 60 = over-cap. The rolling 12-month count
-- of rows with fee_charged > 0 drives the 4-paid-events limit warning and the
-- quote-or-remove state.

CREATE TABLE IF NOT EXISTS service_events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id           INTEGER REFERENCES leases(id) ON DELETE SET NULL,
  device_id          INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL DEFAULT '',
  fee_charged        REAL NOT NULL DEFAULT 0,
  parts_cost         REAL NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'booked'
                       CHECK (status IN ('booked','in_progress','done','declined')),
  approved_by_client INTEGER NOT NULL DEFAULT 0,
  opened_at          TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at        TEXT,
  notes              TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_service_events_device ON service_events (device_id);
CREATE INDEX IF NOT EXISTS idx_service_events_lease ON service_events (lease_id);
CREATE INDEX IF NOT EXISTS idx_service_events_status ON service_events (status);

-- ---------------- call-outs ----------------
-- fee_charged 0 = one of the first two free call-outs in a rolling 12 months,
-- otherwise 19 (within 20 km). The free count is per company.

CREATE TABLE IF NOT EXISTS callouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  visit_date  TEXT NOT NULL DEFAULT (date('now')),
  fee_charged REAL NOT NULL DEFAULT 0,
  within_20km INTEGER NOT NULL DEFAULT 0,
  notes       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_callouts_company ON callouts (company_id, visit_date);

-- ---------------- the UI-only call-request field's future landing spot ----------------
-- The public /pricing call-request widget stores nothing this pass; this table
-- exists so the queue has somewhere to live when the endpoint is built.

CREATE TABLE IF NOT EXISTS call_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mobile     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','dialled','done')),
  notes      TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_call_requests_status ON call_requests (status, created_at);

-- ---------------- admin auth (stateful sessions in D1) ----------------
-- Distinct names from fivestarrepairs' `admin_users` on purpose — see the
-- ownership note at the top. Password hashes are PBKDF2-SHA-256 in the
-- "pbkdf2$<iters>$<salt>$<hash>" format (functions/api/admin/_lib.js).

CREATE TABLE IF NOT EXISTS rep_admin_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','staff')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS rep_admin_sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES rep_admin_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rep_admin_sessions_user ON rep_admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_rep_admin_sessions_expiry ON rep_admin_sessions (expires_at);