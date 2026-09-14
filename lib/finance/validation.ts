import { z } from "zod";

/**
 * Feature 008 Phase 1 (T001) — the finance domain's audited status vocabulary and Zod validation.
 * Every value below is copied VERBATIM from the live `database-schema-report.json` CHECK constraints
 * (read directly, 2026-09-13 preflight — the run directive's own "authoritative source order"), never
 * guessed from planning prose. `lib/finance/read.ts` and `lib/finance/funding.ts` import these shapes
 * rather than trusting an unvalidated string from a row or a caller.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * NO INVENTED ESCROW VOCABULARY (spec.md "Provider-neutral lifecycle", plan.md "Honest status
 * mapping") — this file MUST NEVER add `FUNDED`, `ESCROW_FUNDED`, `AUTHORIZED`, `CAPTURED`,
 * `AWAITING_ESCROW`, `RELEASED`, or any other provider-fiction status. `payments.status = 'PENDING'`
 * means only "an internal payment row exists after checkout" — never "funding initiated/received."
 * `payments.status = 'CONFIRMED'` means only the existing post-settlement result — never a
 * pre-settlement trusted-funding precursor. A provider-selected phase may only add new vocabulary
 * through an approved database migration/design (T009), never silently in application code.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** `payments.payment_method`'s own CHECK constraint (`payments_payment_method_check`). */
export const PAYMENT_METHODS = ["BANK_TRANSFER", "PROVIDER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `payments.status`'s own CHECK constraint (`payments_status_check`) — exactly seven values. */
export const PAYMENT_STATUSES = ["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "EXPIRED", "VOID"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** `proforma_invoices.status`'s own CHECK constraint (`proforma_invoices_status_check`). */
export const PROFORMA_STATUSES = ["ISSUED", "PAID", "VOID"] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

/** `payouts.status`'s own CHECK constraint (`payouts_status_check`) — exactly four values. A payout
 * record/status is accounting state only; it is never evidence of actual provider money movement
 * (FR-017) — that distinction belongs to presentation copy, not this vocabulary. */
export const PAYOUT_STATUSES = ["PENDING_PAYOUT", "PROCESSING", "PAID", "VOID"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Rejects any string outside the live `payments_status_check` allowlist — including every
 * provider-fiction status this feature must never invent. */
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);
export const ProformaStatusSchema = z.enum(PROFORMA_STATUSES);
export const PayoutStatusSchema = z.enum(PAYOUT_STATUSES);

/**
 * Parses a raw database column value against its live CHECK-constraint allowlist, never assuming the
 * value is well-formed just because it came from a `SELECT`. Returns `null` on anything unrecognized
 * rather than throwing — a read layer that encounters this should treat it as "unknown/unsafe to
 * display" (mapped to a controlled fallback by the caller), never crash a page.
 */
export function parsePaymentStatus(value: unknown): PaymentStatus | null {
  const result = PaymentStatusSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parsePaymentMethod(value: unknown): PaymentMethod | null {
  const result = PaymentMethodSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseProformaStatus(value: unknown): ProformaStatus | null {
  const result = ProformaStatusSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function parsePayoutStatus(value: unknown): PayoutStatus | null {
  const result = PayoutStatusSchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * T004 — the funding seam's own input contract. The browser/React Native client MUST submit only
 * this minimal identifier (FR-004): never amount, currency, payment status, provider status, or
 * settlement eligibility. `lib/finance/funding.ts` is the sole consumer.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
const uuid = (fieldLabel: string) => z.uuid({ error: `Choose a valid ${fieldLabel}.` });

export const RequestFundingInput = z.object({
  orderId: uuid("order"),
});
export type RequestFundingInput = z.infer<typeof RequestFundingInput>;
