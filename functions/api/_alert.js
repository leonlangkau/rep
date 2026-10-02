/**
 * Owner alerts for the Repeater site.
 *
 * NOT a verbatim port of aphelion/functions/api/_alert.js — see the note below.
 * The exported contract is identical, so enquiry.js reads the same either way:
 *
 *   alertOwner(env, { title, message, url?, urlTitle?, priority? })
 *     -> { ok: boolean, channel?: "pushover" | "webhook", ... }
 *
 * Never throws and never rejects. A failed alert must not fail the customer's
 * request — the caller decides what to do when nothing was captured and nobody
 * was told.
 *
 * WHY THIS IS A REWRITE RATHER THAN A PORT.
 * aphelion's version delegates its email leg to functions/api/_email.js: a
 * multi-provider sending stack (Cloudflare Email Service REST plus Resend)
 * with branded HTML templates and a send log that backs aphelion's Email tab.
 * This site has no Email tab and no send history to write to — vendoring a few
 * hundred lines of machinery with no caller would be the worst of both worlds.
 *
 * So the email failsafe is dropped and Pushover plus the team webhooks are kept.
 * CONSEQUENCE, and it is a real one: if PUSHOVER_TOKEN/PUSHOVER_USER are unset
 * there is no alert channel configured at all, and /api/enquiry will answer 503
 * (correctly — nothing stored and nobody told) rather than silently swallowing
 * the lead. Setting those two secrets on the Pages project is therefore not
 * optional in practice; docs/SETUP-deploy.md calls it out.
 *
 * Configuration (Pages secrets / .dev.vars), all optional, everything degrades
 * to "not configured" rather than failing the request:
 *   PUSHOVER_TOKEN / PUSHOVER_USER / PUSHOVER_PRIORITY
 *   SLACK_WEBHOOK_URL | TEAMS_WEBHOOK_URL | DISCORD_WEBHOOK_URL  (first set wins)
 */

const PUSHOVER_API = "https://api.pushover.net/1/messages.json";

function envStr(env, key) {
  const v = env && env[key];
  return v == null ? "" : String(v).trim();
}

function parseList(raw) {
  return String(raw == null ? "" : raw).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function pushoverPriority(env) {
  const raw = envStr(env, "PUSHOVER_PRIORITY");
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= -2 && n <= 1 ? n : 1;
}

// Pushover caps: 250 chars of title, 1024 of message (HTML tags included).
const PUSHOVER_TITLE_MAX = 250;
const PUSHOVER_MESSAGE_MAX = 1024;

async function sendPushover(env, { title, message, html, url, urlTitle, priority }) {
  const token = envStr(env, "PUSHOVER_TOKEN");
  const users = parseList(envStr(env, "PUSHOVER_USER"));
  if (!token || !users.length) return { ok: false, skip: true, reason: "not_configured" };

  // `html` is an optional richer copy of `message` for the phone push (Pushover
  // renders <b>/<i>/<u>/<a> when html=1).
  const body = String(html || message || "").slice(0, PUSHOVER_MESSAGE_MAX);
  const prio = Number.isFinite(priority) ? Math.max(-2, Math.min(1, priority)) : pushoverPriority(env);

  const results = await Promise.all(users.map(async (user) => {
    const form = new URLSearchParams();
    form.set("token", token);
    form.set("user", user);
    form.set("title", String(title || "").slice(0, PUSHOVER_TITLE_MAX));
    form.set("message", body);
    if (html) form.set("html", "1");
    form.set("priority", String(prio));
    if (url) { form.set("url", url); form.set("url_title", urlTitle || "Open"); }
    try {
      const res = await fetch(PUSHOVER_API, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        console.error(`alert/pushover: HTTP ${res.status}: ${detail}`);
        return { ok: false, status: res.status };
      }
      return { ok: true };
    } catch (e) {
      console.error("alert/pushover: fetch failed", e && e.message);
      return { ok: false, error: e && e.message };
    }
  }));

  return { ok: results.every((r) => r.ok), sent: results.filter((r) => r.ok).length, total: results.length };
}

/**
 * Mirror an alert into the team channel: Slack webhook, Teams webhook or
 * Discord webhook — whichever is configured (checked in that order). Never
 * throws.
 */
export async function alertTeam(env, { title = "", message = "", url = "" }) {
  try {
    const slack = envStr(env, "SLACK_WEBHOOK_URL");
    const teams = envStr(env, "TEAMS_WEBHOOK_URL");
    const discord = envStr(env, "DISCORD_WEBHOOK_URL");

    if (slack) {
      const r = await fetch(slack, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: title + (message ? "\n" + message : "") + (url ? "\n" + url : ""),
        }),
      });
      return { ok: r.ok, channel: "slack", status: r.status };
    }
    if (teams) {
      const r = await fetch(teams, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          summary: title,
          title,
          text: message,
          potentialAction: url ? [{ "@type": "OpenUri", name: "Open", targets: [{ os: "default", uri: url }] }] : [],
        }),
      });
      return { ok: r.ok, channel: "teams", status: r.status };
    }
    if (discord) {
      const r = await fetch(discord, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: "**" + String(title).slice(0, 200) + "**\n" + String(message).slice(0, 1800) + (url ? "\n" + url : ""),
        }),
      });
      return { ok: r.ok, channel: "discord", status: r.status };
    }
    return { ok: false, skip: true, reason: "not_configured" };
  } catch (e) {
    console.error("alert/team: fetch failed", e && e.message);
    return { ok: false, error: e && e.message };
  }
}

/**
 * Push `{ title, message, html?, url?, urlTitle?, priority? }` to the owner.
 *   html      optional Pushover-HTML copy of `message` (bold lines etc.)
 *   priority  optional -2..1 override of PUSHOVER_PRIORITY for this one push
 * Never throws and never rejects. Returns { ok, channel } so callers can log
 * which path carried it. When a team webhook is configured the alert is also
 * mirrored there.
 */
export async function alertOwner(env, payload) {
  try {
    const team = await alertTeam(env, payload);
    const push = await sendPushover(env, payload);
    if (push.ok) return { ok: true, channel: "pushover", team: team.ok };

    // No email leg in this repo (see the header note) — if the webhook carried
    // it, that is a real alert; otherwise report the failure honestly so
    // enquiry.js can decide whether to tell the visitor it didn't work.
    if (team.ok) return { ok: true, channel: "webhook", pushover: push };

    return { ok: false, pushover: push, team };
  } catch (e) {
    console.error("alert: unexpected failure", e && e.message);
    return { ok: false, error: e && e.message };
  }
}