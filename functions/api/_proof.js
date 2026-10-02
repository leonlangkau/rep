/**
 * Shared helpers for the site-proof reader.
 *
 * Ported from aphelion/functions/api/admin/_proof.js — keep in sync.
 *
 * aphelion's original is shared by its public reader AND its owner CRUD, so it
 * also carries a normalise() validator for submitted items. This repo only ever
 * READS, so the validator has no caller here and is omitted. Everything that
 * shapes or sanitises a value on the way OUT is kept byte-identical, because
 * that is the part that stops a stored value becoming a javascript: link in the
 * public markup.
 *
 * Files prefixed with "_" are not routed by Cloudflare Pages, only imported.
 */

export const KINDS = ["quote", "figure", "logo"];
export const LIST_MAX = 40;
export const MAX = { title: 120, body: 400, attribution: 120, url: 500, sort: 999 };

export function clean(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

/**
 * Accept only an http(s) URL or a root-relative path, so a stored value can
 * never become a `javascript:` or `data:` link in the public markup.
 */
export function safeUrl(v) {
  const s = clean(v, MAX.url);
  if (!s) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : "";
}

/** DB row → the public JSON shape. */
export function shapePublic(r) {
  return {
    id: r.id,
    kind: r.kind,
    title: clean(r.title, MAX.title),
    body: clean(r.body, MAX.body),
    attribution: clean(r.attribution, MAX.attribution),
    image_url: safeUrl(r.image_url),
    link_url: safeUrl(r.link_url),
    sort_order: Number(r.sort_order) || 0,
  };
}