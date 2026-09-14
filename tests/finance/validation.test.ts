import { describe, expect, it } from "vitest";

import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PROFORMA_STATUSES,
  PaymentMethodSchema,
  PaymentStatusSchema,
  PayoutStatusSchema,
  ProformaStatusSchema,
  RequestFundingInput,
  parsePaymentMethod,
  parsePaymentStatus,
  parsePayoutStatus,
  parseProformaStatus,
} from "@/lib/finance/validation";

/**
 * Feature 008 Phase 1 (T001) — proofs that the finance domain's status vocabulary matches the LIVE
 * `payments_status_check`/`payments_payment_method_check`/`proforma_invoices_status_check`/
 * `payouts_status_check` CHECK constraints exactly, and rejects every invented escrow-fiction status.
 */
describe("T001 — payment status/method vocabulary mirrors the live CHECK constraints exactly", () => {
  it("PAYMENT_STATUSES is exactly the live payments_status_check allowlist, in order", () => {
    expect(PAYMENT_STATUSES).toEqual(["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "EXPIRED", "VOID"]);
  });

  it("PAYMENT_METHODS is exactly the live payments_payment_method_check allowlist", () => {
    expect(PAYMENT_METHODS).toEqual(["BANK_TRANSFER", "PROVIDER"]);
  });

  it("PROFORMA_STATUSES is exactly the live proforma_invoices_status_check allowlist", () => {
    expect(PROFORMA_STATUSES).toEqual(["ISSUED", "PAID", "VOID"]);
  });

  it("PAYOUT_STATUSES is exactly the live payouts_status_check allowlist", () => {
    expect(PAYOUT_STATUSES).toEqual(["PENDING_PAYOUT", "PROCESSING", "PAID", "VOID"]);
  });

  it.each(PAYMENT_STATUSES)("accepts the current status %s", (status) => {
    expect(PaymentStatusSchema.safeParse(status).success).toBe(true);
  });

  it.each(PAYMENT_METHODS)("accepts the current method %s", (method) => {
    expect(PaymentMethodSchema.safeParse(method).success).toBe(true);
  });

  it.each(PROFORMA_STATUSES)("accepts the current proforma status %s", (status) => {
    expect(ProformaStatusSchema.safeParse(status).success).toBe(true);
  });

  it.each(PAYOUT_STATUSES)("accepts the current payout status %s", (status) => {
    expect(PayoutStatusSchema.safeParse(status).success).toBe(true);
  });

  /** The exact provider-fiction vocabulary the run directive forbids inventing. */
  const INVENTED_ESCROW_STATUSES = ["FUNDED", "ESCROW_FUNDED", "AUTHORIZED", "CAPTURED", "AWAITING_ESCROW", "RELEASED"];

  it.each(INVENTED_ESCROW_STATUSES)("rejects the invented escrow status %s as a payment status", (status) => {
    expect(PaymentStatusSchema.safeParse(status).success).toBe(false);
    expect(parsePaymentStatus(status)).toBeNull();
  });

  it.each(INVENTED_ESCROW_STATUSES)("rejects the invented escrow status %s as a payout status", (status) => {
    expect(PayoutStatusSchema.safeParse(status).success).toBe(false);
    expect(parsePayoutStatus(status)).toBeNull();
  });

  it("rejects an arbitrary unknown string, not just the specific invented list", () => {
    expect(PaymentStatusSchema.safeParse("SOMETHING_ELSE").success).toBe(false);
    expect(PaymentMethodSchema.safeParse("CREDIT_CARD").success).toBe(false);
    expect(ProformaStatusSchema.safeParse("DRAFT").success).toBe(false);
    expect(parsePaymentMethod("CREDIT_CARD")).toBeNull();
    expect(parseProformaStatus("DRAFT")).toBeNull();
  });

  it("rejects non-string input rather than coercing it", () => {
    expect(parsePaymentStatus(undefined)).toBeNull();
    expect(parsePaymentStatus(null)).toBeNull();
    expect(parsePaymentStatus(123)).toBeNull();
    expect(parsePaymentStatus({})).toBeNull();
  });

  it("PENDING and CONFIRMED are present with no alias/synonym key introduced", () => {
    // Documents the honest meaning boundary (spec.md "Provider-neutral lifecycle"): PENDING means
    // only "an internal payment row exists after checkout"; CONFIRMED means only the existing
    // post-settlement result. Neither is duplicated under a second key/spelling anywhere in this file.
    expect(PAYMENT_STATUSES).toContain("PENDING");
    expect(PAYMENT_STATUSES).toContain("CONFIRMED");
    expect(PAYMENT_STATUSES.filter((status) => status.includes("FUND") || status.includes("ESCROW"))).toEqual([]);
  });
});

describe("T004 — RequestFundingInput accepts only a minimal identifier", () => {
  it("accepts a well-formed orderId and nothing else required", () => {
    const result = RequestFundingInput.safeParse({ orderId: "00000000-0000-4000-8000-000000000000" });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toEqual(["orderId"]);
  });

  it("rejects a malformed orderId", () => {
    expect(RequestFundingInput.safeParse({ orderId: "not-a-uuid" }).success).toBe(false);
    expect(RequestFundingInput.safeParse({}).success).toBe(false);
  });

  it("does not accept client-supplied amount, currency, status, or provider fields as authoritative", () => {
    // Zod's default (non-strict) object parsing ignores unrecognized keys rather than trusting them —
    // proving an extra field never becomes part of the validated, typed result a caller can act on.
    const result = RequestFundingInput.safeParse({
      orderId: "00000000-0000-4000-8000-000000000000",
      amount: 999999,
      currency: "EUR",
      status: "CONFIRMED",
      provider: "some-provider",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ orderId: "00000000-0000-4000-8000-000000000000" });
  });
});
