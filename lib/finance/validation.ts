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

import {
  PAYMENT_METHODS,
  type PaymentMethod,
  PAYMENT_STATUSES,
  type PaymentStatus,
  PROFORMA_STATUSES,
  type ProformaStatus,
  PAYOUT_STATUSES,
  type PayoutStatus,
  LEGACY_PROFORMA_STATUSES,
  type LegacyProformaStatus,
  LEGACY_PAYOUT_STATUSES,
  type LegacyPayoutStatus,
  PaymentStatusSchema,
  PaymentMethodSchema,
  ProformaStatusSchema,
  PayoutStatusSchema,
  parsePaymentStatus,
  parsePaymentMethod,
  parseProformaStatus,
  parsePayoutStatus,
} from "@/lib/commerce/validation";

export {
  PAYMENT_METHODS,
  type PaymentMethod,
  PAYMENT_STATUSES,
  type PaymentStatus,
  PROFORMA_STATUSES,
  type ProformaStatus,
  PAYOUT_STATUSES,
  type PayoutStatus,
  LEGACY_PROFORMA_STATUSES,
  type LegacyProformaStatus,
  LEGACY_PAYOUT_STATUSES,
  type LegacyPayoutStatus,
  PaymentStatusSchema,
  PaymentMethodSchema,
  ProformaStatusSchema,
  PayoutStatusSchema,
  parsePaymentStatus,
  parsePaymentMethod,
  parseProformaStatus,
  parsePayoutStatus,
};

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
