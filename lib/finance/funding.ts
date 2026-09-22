import { createClient } from "@/lib/supabase/server";
import { mapFinanceError } from "@/lib/finance/errors";
import { isStripeConfigured } from "@/lib/finance/stripe/config";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";
import { RequestFundingInput } from "@/lib/finance/validation";

/**
 * Feature 008 Phase 1 (T004), extended RUN E (Stripe provider decision) T012/T014 — the provider seam.
 * The browser/future React Native client submits only a minimal identifier (`orderId`) — NEVER an
 * authoritative amount, currency, payment status, provider status, or settlement eligibility (FR-004).
 * This function never accepts anything else, and it re-reads every fact it needs from the database.
 *
 * UNCONFIGURED (still today's real state — T010 stays open, no credential exists): identical to Phase
 * 1's original behavior — `ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE`, no network call, no SDK
 * import reached, no secret read. This code path is unchanged.
 *
 * CONFIGURED (once `STRIPE_SECRET_KEY` exists — genuinely untestable live this run, but the code path
 * is real, not a stub): invokes the `stripe-create-payment-intent` Supabase Edge Function (T012) — a
 * plain HTTP boundary a future React Native client can call identically, never a Next.js-coupled RPC
 * (T014's own Verify clause) — forwarding the caller's OWN session (never a service-role bypass, so the
 * Edge Function's own `is_org_member` check inside `record_stripe_payment_intent()` sees the real
 * buyer). The Edge Function re-reads order/payment truth itself and creates the ONE PaymentIntent for
 * the order (`STRIPE-PREPARATION.md` §4a); this function only relays its controlled result. **Never
 * fabricates success**: an Edge Function/network failure maps to `FINANCE_FUNDING_CREATE_FAILED`, not a
 * fake client secret.
 */
export async function requestFunding(input: unknown): Promise<ActionFeedbackResult<{ clientSecret: string | null }>> {
  const parsed = RequestFundingInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  if (!isStripeConfigured()) {
    return { ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke<{ clientSecret: string | null; code?: string }>("stripe-create-payment-intent", {
    body: { orderId: parsed.data.orderId },
  });

  if (error || !data) {
    // Covers: the Edge Function is not deployed (genuinely true today — T012's live boundary does not
    // exist yet), a network failure, or the function's own controlled refusal. Never fabricated success.
    return { ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_CREATE_FAILED };
  }
  if (data.code) {
    return { ok: false, code: mapFinanceError({ message: data.code }) };
  }

  return { ok: true, data: { clientSecret: data.clientSecret } };
}
