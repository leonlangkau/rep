/**
 * /api/shop-os/checkout — the payment config probe.
 *
 * The checkout page NEVER assumes it can take a card. It asks this endpoint
 * first and only renders a payment action when the answer is configured. The
 * shape below is the shape the Revolut rail will answer with once the adapter
 * is ported from the fivestarrepairs repo.
 *
 * WHY IT IS ALWAYS "not_configured" TONIGHT. The Revolut Merchant adapter is
 * being built and proven in the sibling `fivestarrepairs` repo first; the order,
 * subscription and webhook endpoints are deliberately NOT built here yet, and
 * there is no `revolut_plan_cache` migration. Claiming a rail is live before its
 * endpoints exist would be worse than saying it is not — the page would offer a
 * button that could only fail. When the port lands, this probe reads the rail
 * state (rather than a hardcoded literal) and starts reporting `ok:true`.
 *
 * Degradation doctrine: an unconfigured rail must never break the customer
 * flow. The checkout page falls back to the enquiry form, so a 200 with a
 * "skip" instruction is the correct answer here, not an error.
 *
 * No secret is read or echoed: this endpoint reports capability, never a key.
 */

const NOT_CONFIGURED = { ok: false, skip: true, reason: "not_configured" };

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export function onRequestGet() {
  return json(NOT_CONFIGURED);
}

export function onRequest(context) {
  const method = context.request.method;
  if (method === "GET" || method === "HEAD") return onRequestGet(context);
  return json({ ok: false, error: "Method not allowed." }, 405, { allow: "GET" });
}