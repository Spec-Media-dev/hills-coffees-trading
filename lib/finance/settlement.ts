import { createClient } from "@/lib/supabase/server";
import { mapFinanceError } from "@/lib/finance/errors";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 008 RUN E (Stripe provider decision) T018/T019 — the ONLY application caller of
 * `admin_review_payment()`, the approved settlement transaction core (T017's design decision: keep it
 * as the correct transaction core, extended with exactly one precondition by migration
 * `20260922120000_feature_008_stripe_trusted_funding.sql` — NOT YET APPLIED to the live database this
 * run, so every call through this module will fail with `payment_not_found`/a generic error until it
 * is; see the migration's own header for why `admin_review_payment()` itself is otherwise unchanged).
 *
 * SINGLE-CALLER DISCIPLINE (T018's own Verify clause: "repo-wide call-site audit finds exactly this
 * module"): `tests/finance/settlement.test.ts` greps the entire `src/`/`lib/`/`components/` tree and
 * fails if `admin_review_payment` is referenced anywhere outside this file (tests and fixture scripts
 * are exempt — they predate this feature and build disposable settled state directly, the SAME
 * established exemption `lib/orders/*`'s own single-caller modules already carry).
 *
 * This module performs NO direct settlement, ownership, inventory, reservation, payout, or order/payment
 * mutation of its own — it is a thin, typed, controlled-result wrapper around exactly one RPC call.
 * Feature 010 (or any future finance console) receives ONLY `approveSettlement`/`rejectSettlement` below
 * — never the raw `.rpc("admin_review_payment", ...)` call, never a generic database client (T020).
 *
 * THE ONE THING THIS MODULE DOES NOT DO: decide whether funding is trusted. That is `payments.
 * trusted_funding_confirmed_at`, set ONLY by `ingest_stripe_event()` (T013) after a verified webhook
 * event — this module (and the finance operator calling it) can only ever be REFUSED by that gate
 * (`FINANCE_SETTLEMENT_TRUSTED_FUNDING_MISSING`), never bypass it. "Approve Settlement" is the
 * finance operator's own decision layered ON TOP of trusted funding (Option A), never a substitute for
 * it — this module's naming (`approveSettlement`, not `confirmPaymentReceived`) reflects that literally,
 * per this run's own explicit product-decision wording.
 */

export type SettlementDecisionInput = { paymentId: string; reason?: string };

/**
 * The finance operator's "Approve Settlement" / "Release Seller Funds" action. Requires trusted Stripe
 * funding to already be confirmed for a PROVIDER-method payment (Option A) — a manual/NULL-method
 * payment (every currently-live settlement path, Features 005/006/007/009/010/012's own disposable
 * fixtures included) is completely unaffected by that gate, matching the migration's own documented
 * backward-compatibility proof.
 */
export async function approveSettlement(input: SettlementDecisionInput): Promise<ActionFeedbackResult<{ paymentId: string }>> {
  return reviewSettlement(input.paymentId, true, input.reason);
}

/** The finance operator's rejection decision — reverts the order to `HOLD` only from the manual-proof
 * states, exactly as `admin_review_payment()` already does; unchanged by this feature. */
export async function rejectSettlement(input: SettlementDecisionInput): Promise<ActionFeedbackResult<{ paymentId: string }>> {
  return reviewSettlement(input.paymentId, false, input.reason);
}

async function reviewSettlement(paymentId: string, approved: boolean, reason: string | undefined): Promise<ActionFeedbackResult<{ paymentId: string }>> {
  if (!paymentId) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { paymentId: ["Required"] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_payment", {
    p_payment_id: paymentId,
    p_approved: approved,
    p_reason: reason ?? null,
  });

  if (error) {
    return { ok: false, code: mapFinanceError(error) };
  }

  return { ok: true, data: { paymentId } };
}
