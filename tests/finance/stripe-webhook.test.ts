import Stripe from "stripe";
import { describe, expect, it } from "vitest";

import { verifyStripeWebhookSignature } from "@/lib/finance/stripe/webhook";

/**
 * Feature 008 RUN E (Stripe provider decision) T008/T013/T031 — signature-verification proofs. Every
 * case here is genuinely testable WITHOUT a live Stripe account: Stripe's own documented HMAC-SHA256
 * algorithm is fully specified (STRIPE-PREPARATION.md §1), and the SDK ships `Stripe.webhooks.
 * generateTestHeaderString` specifically so integrators can prove their own verifier against a
 * self-signed payload with a FABRICATED secret. Nothing here calls the Stripe API.
 */
const FAKE_SECRET = "whsec_test_fabricated_secret_never_a_real_credential";
const PAYLOAD = JSON.stringify({ id: "evt_test_123", type: "payment_intent.succeeded", data: { object: { id: "pi_test_123" } } });

function sign(payload: string, secret: string, timestampOverrideSeconds?: number): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: timestampOverrideSeconds,
  });
}

describe("T013/T031 — verifyStripeWebhookSignature", () => {
  it("accepts a genuinely valid signature and returns the parsed event", () => {
    const header = sign(PAYLOAD, FAKE_SECRET);
    const result = verifyStripeWebhookSignature(PAYLOAD, header, FAKE_SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.id).toBe("evt_test_123");
      expect(result.event.type).toBe("payment_intent.succeeded");
    }
  });

  it("rejects a forged/tampered body (signature no longer matches the bytes actually sent)", () => {
    const header = sign(PAYLOAD, FAKE_SECRET);
    const tamperedPayload = PAYLOAD.replace("payment_intent.succeeded", "payment_intent.payment_failed");
    const result = verifyStripeWebhookSignature(tamperedPayload, header, FAKE_SECRET);
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects a signature produced with the WRONG secret", () => {
    const header = sign(PAYLOAD, "whsec_a_different_fabricated_secret");
    const result = verifyStripeWebhookSignature(PAYLOAD, header, FAKE_SECRET);
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects a stale/replayed timestamp outside Stripe's own 5-minute default tolerance", () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 60 * 60; // one hour old
    const header = sign(PAYLOAD, FAKE_SECRET, staleTimestamp);
    const result = verifyStripeWebhookSignature(PAYLOAD, header, FAKE_SECRET);
    expect(result).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects a missing Stripe-Signature header without throwing", () => {
    const result = verifyStripeWebhookSignature(PAYLOAD, null, FAKE_SECRET);
    expect(result).toEqual({ ok: false, code: "missing_signature" });
  });

  it("refuses to even attempt verification when no webhook secret is configured", () => {
    const header = sign(PAYLOAD, FAKE_SECRET);
    const result = verifyStripeWebhookSignature(PAYLOAD, header, null);
    expect(result).toEqual({ ok: false, code: "not_configured" });
  });

  it("never throws for any malformed header string", () => {
    expect(() => verifyStripeWebhookSignature(PAYLOAD, "garbage-not-a-real-header", FAKE_SECRET)).not.toThrow();
    const result = verifyStripeWebhookSignature(PAYLOAD, "garbage-not-a-real-header", FAKE_SECRET);
    expect(result.ok).toBe(false);
  });
});
