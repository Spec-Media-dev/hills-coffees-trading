import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { RequestFundingInput } from "@/lib/finance/validation";

/**
 * Feature 008 Phase 1 (T004) — the provider-neutral funding seam. Deliberately SMALL and INERT
 * (spec.md PS2, FR-003 through FR-007, plan.md decision 2/3):
 *
 * - No provider is selected. No approved database trusted-funding gate exists (T009 is not done).
 * - This function makes NO network call, imports NO SDK, names NO provider, reads NO secret, writes
 *   NO payment/provider state, and calls neither `admin_review_payment()` nor `submit_payment_proof()`
 *   nor a Supabase Edge Function. It is pure: same input shape in, same controlled outcome out.
 * - The browser/future React Native client submits only a minimal identifier (`orderId`) — never an
 *   authoritative amount, currency, payment status, provider status, or settlement eligibility
 *   (FR-004). A future provider-selected phase re-reads order/organization/payment/amount/currency/
 *   state/authorization from the database itself before any real funding decision; this seam
 *   preserves that shape by accepting nothing else today.
 *
 * `provider not selected` + `approved provider DB gate does not exist` = funding unavailable. This is
 * the ONLY outcome this function can produce right now, and it is honest: it never claims payment
 * success, escrow initiation, a bank instruction, or a pending provider state (run directive
 * "UNAVAILABLE UX CONTRACT"). `ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE` is the controlled,
 * localized, non-actionable result code a caller maps to copy — see `lib/app/copy/en.ts`'s
 * `finance.funding.unavailable` block.
 */
export async function requestFunding(input: unknown): Promise<ActionFeedbackResult<never>> {
  const parsed = RequestFundingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  return { ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE };
}
