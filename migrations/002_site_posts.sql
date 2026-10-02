-- Migration 002: blog posts for the public site.
--
-- Applies to: the `repeater` business database.
-- Run once at provisioning, after schema.sql:
--   npx wrangler d1 execute repeater --remote --yes --file=schema.sql
--   npx wrangler d1 execute repeater --remote --yes --file=migrations/002_site_posts.sql
--
-- There is no 001 — schema.sql at the repo root is the base and is idempotent,
-- matching the fivestarrepairs convention.
--
-- Re-runnable: every statement is IF NOT EXISTS, so this is safe to apply twice.
-- (If this file ever gains a plain `ALTER TABLE ADD COLUMN`, that stops being
-- true — D1 has no ADD COLUMN IF NOT EXISTS. Note it here if it happens.)

CREATE TABLE IF NOT EXISTS site_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  cover_url    TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  published_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_site_posts_status ON site_posts (status, published_at DESC);