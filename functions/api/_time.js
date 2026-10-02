/**
 * Melbourne wall-clock day, as YYYY-MM-DD.
 *
 * Ported from aphelion/functions/api/admin/_traffic.js — keep in sync.
 *
 * Cloudflare runs in UTC and crons fire in UTC, while Melbourne is UTC+10 or
 * +11 depending on daylight saving. Anything that buckets by "day" must say
 * which day it means, so this exists rather than calling toISOString().
 *
 * "en-CA" is not an accident: its short date format is already ISO-8601
 * (YYYY-MM-DD), so it gives the right string without reassembling parts.
 */

export function melbourneDay(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    // No ICU timezone data: fall back to UTC rather than throwing.
    return new Date(date).toISOString().slice(0, 10);
  }
}