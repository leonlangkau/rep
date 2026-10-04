/**
 * POST /api/admin/totp — deliberately NOT implemented yet.
 *
 * The brief is explicit: TOTP is a follow-up, and a stub must never fake it.
 * A 501 here means "there is no second factor", which an operator can read
 * correctly. Returning a fake {ok:true} would be worse than useless: it would
 * teach whoever wired the UI that two-factor is on when it is not.
 *
 * Any real implementation must add a claim to the session that is only set
 * after a verified code, so a pre-2FA cookie can never satisfy it — the pattern
 * `../fivestarrepairs/functions/api/admin/_middleware.js` uses.
 */

import { json } from "./_lib.js";

export function onRequest() {
  return json({ ok: false, error: "Not implemented", reason: "totp_followup" }, 501);
}