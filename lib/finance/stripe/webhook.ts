import Stripe from "stripe";

/**
 * Feature 008 RUN E (Stripe provider decision) T008/T013 — the signature-verification boundary. This is
 * the ONE place a raw Stripe webhook payload is ever trusted, and it is deliberately independent of any
 * live Stripe account: Stripe's own documented algorithm (HMAC-SHA256 over `{timestamp}.{raw body}`,
 * keyed by the per-endpoint `whsec_...` secret, 5-minute default timestamp tolerance —
 * `STRIPE-PREPARATION.md` §1) is fully specified and testable with a FABRICATED secret and a
 * self-signed payload — no real Stripe API call, credential, or account is needed to prove this
 * function accepts a genuinely valid signature and rejects a forged one, a tampered body, a wrong
 * secret, or a stale/expired timestamp (`tests/finance/stripe-webhook.test.ts`).
 *
 * `stripe.webhooks.constructEvent` (the official SDK's own verifier, not a hand-rolled reimplementation)
 * requires the RAW request body — never a re-serialized `JSON.stringify(parsedBody)`, since that can
 * produce different bytes than what Stripe actually signed (key ordering, whitespace). Every caller of
 * this function MUST pass the exact bytes Stripe sent.
 */
export type StripeWebhookVerification =
  | { ok: true; event: Stripe.Event }
  | { ok: false; code: "missing_signature" | "invalid_signature" | "not_configured" };

/** Verifies a raw Stripe webhook payload against the given endpoint secret. Never throws — every
 * failure mode (missing header, forged/tampered signature, stale timestamp, wrong secret) returns a
 * controlled `{ ok: false }` result instead, so a caller never needs its own try/catch around this. */
export function verifyStripeWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string | null | undefined): StripeWebhookVerification {
  if (!webhookSecret) {
    return { ok: false, code: "not_configured" };
  }
  if (!signatureHeader) {
    return { ok: false, code: "missing_signature" };
  }

  try {
    // No live API key is needed to construct a Stripe SDK instance purely for local signature
    // verification — this codepath never makes a network call.
    const stripe = new Stripe("sk_not_used_for_webhook_verification", { apiVersion: "2026-08-26.dahlia" });
    const event = stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    return { ok: true, event };
  } catch {
    // Stripe's verifier throws on: forged signature, tampered body, wrong secret, and a timestamp
    // outside its tolerance window (replay protection) — all collapsed to one safe, generic code.
    // The raw error (which may echo back header/body fragments) is never logged or returned.
    return { ok: false, code: "invalid_signature" };
  }
}
