/**
 * The Repair Shop OS tier table — the ONE place a price is decided server-side.
 *
 * Both payment endpoints price from here, never from the client, so a tampered
 * request cannot change what is charged. The figures are the published ones on
 * /shop-os/pricing and in public/assets/checkout.js; tests assert they agree.
 *
 * Money is in cents (the currency's lowest denomination), exactly as the
 * Revolut API takes it: $49.00 → 4900.
 */

/**
 * [OWNER TO CONFIRM] The pricing page promises a "free trial" but not a length.
 * 14 days is the default we ship, and it is the only number here that is not
 * published anywhere. Revolut accepts only whole days ("P14D"); to change it,
 * change this one constant.
 */
export const TRIAL_DAYS = 14;

/** The ISO-8601 trial duration Revolut takes, derived from TRIAL_DAYS. */
export function trialDuration() {
  return "P" + TRIAL_DAYS + "D";
}

export const TIERS = {
  starter: { name: "Starter", cents: 4900, blurb: "One business — bookings, workshop, inventory and BAS-ready accounting." },
  business: { name: "Business", cents: 14900, blurb: "Up to three businesses — adds B2B wholesale and marketing." },
  enterprise: { name: "Enterprise", cents: 39900, blurb: "Unlimited businesses — adds the wealth dashboard and onboarding." },
};

export const DEFAULT_TIER = "business";

/** A known tier key, or the default. Never null, so callers can't 500 on input. */
export function tierKey(raw) {
  const k = String(raw == null ? "" : raw).trim().toLowerCase();
  return TIERS[k] ? k : DEFAULT_TIER;
}

/** { key, name, cents, blurb } for a (possibly unknown) tier input. */
export function tierOf(raw) {
  const key = tierKey(raw);
  return { key, ...TIERS[key] };
}

/**
 * Our correlation reference. Echoed back by Revolut on the order/handover and
 * stored on the shadow row, so a webhook (or a support question) can be traced
 * both ways. Matches the `RPT-OS-…` house pattern of the sibling repo.
 */
export function newReference() {
  return (
    "RPT-OS-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}