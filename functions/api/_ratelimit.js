/**
 * Lightweight, D1-backed fixed-window rate limiter (defence-in-depth).
 *
 * Ported from aphelion/functions/api/_ratelimit.js — keep in sync.
 *
 * Used here to throttle POST /api/enquiry, because each submission pings the
 * owner. Keyed by client IP (Cloudflare's cf-connecting-ip, which the client
 * can't spoof). One row per active key in the `rate_limits` table; the window
 * resets lazily on the next hit after it expires.
 *
 * Degrades gracefully: with no DB bound (or on any DB error) it FAILS OPEN — the
 * endpoint keeps working, just unthrottled. That is the right trade-off because
 * the honeypot and the field validation still apply; the limiter is an extra
 * layer, not the gate.
 *
 * NOTE: aphelion's rate_limits table also carries single-use auth markers
 * ("totp:used:*", "wan:chal:*") which fail CLOSED. Those are written by
 * aphelion, not here — but this repo shares the table, so keep windows >= 60
 * seconds or the opportunistic sweep below could reap a still-live marker.
 * Today's only window here is 600s.
 *
 * Files prefixed with "_" are not routed by Cloudflare Pages, only imported.
 */

// Cloudflare sets cf-connecting-ip to the real client IP; fall back to a shared
// bucket if it's somehow missing so a spoofed/absent header can't dodge the limit.
export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Record a hit for `key` and report whether it's now over `limit` within
 * `windowSeconds`. Returns { limited, remaining, retryAfter }.
 * Fails open ({ limited: false }) when there's no DB or the query errors.
 */
export async function rateLimit(env, key, limit, windowSeconds) {
  const db = env && (env.DB_APHELION || env.DB);
  if (!db) return { limited: false, remaining: limit, retryAfter: 0 };

  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const threshold = now - windowMs; // windows started at/before this have expired

  try {
    // Upsert atomically: reset the counter to 1 if the stored window has
    // expired, otherwise increment it. RETURNING gives us the live count and
    // the (possibly reset) window start in a single round-trip.
    const row = await db.prepare(
      "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) " +
        "ON CONFLICT(key) DO UPDATE SET " +
        "count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END, " +
        "window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END " +
        "RETURNING count, window_start"
    )
      .bind(key, now, threshold, threshold, now)
      .first();

    const count = (row && row.count) || 1;
    const windowStart = (row && row.window_start) || now;
    const limited = count > limit;
    const retryAfter = limited
      ? Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))
      : 0;

    // Opportunistic cleanup so rows for one-off IPs don't accumulate forever.
    // Cheap and best-effort; never blocks or fails the request.
    if (count === 1) {
      db.prepare("DELETE FROM rate_limits WHERE window_start <= ?")
        .bind(now - windowMs * 4)
        .run()
        .catch(() => {});
    }

    return { limited, remaining: Math.max(0, limit - count), retryAfter };
  } catch {
    // Fail open: a limiter outage must never take down the endpoint.
    return { limited: false, remaining: limit, retryAfter: 0 };
  }
}