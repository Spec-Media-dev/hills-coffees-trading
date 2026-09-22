import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

/**
 * Feature 008 Phase 1 (T002) — the finance domain's safe, explicit mapping from a raised database
 * exception string to a stable `ActionFeedbackCode`, mirroring `lib/orders/errors.ts`'s own exact
 * pattern (the run directive's own explicit "reuse the established convention" instruction).
 *
 * SAFE ERROR CONTRACT: no raw Postgres/PostgREST text, SQLSTATE, policy/constraint/trigger/table
 * name, provider payload, provider reference, secret, or stack trace ever reaches a client. Every
 * entry below is looked up ONCE and converted to a stable code; an UNRECOGNIZED message falls back to
 * a generic, domain-scoped safe code and is logged server-side with ONLY the SQLSTATE-shaped
 * diagnostic context (never the caller's row data, never any payload) — see `logUnmappedFinanceError`.
 *
 * FORWARD-COMPATIBLE, NOT PREMATURELY ACTED ON — UPDATED (Feature 008 RUN E, Stripe provider decision):
 * `lib/finance/read.ts` (T003) is still pure SELECT and has no RAISE EXCEPTION surface. `admin_review_
 * payment()`'s trusted-funding precondition (T009/T017, migration `20260922120000_feature_008_stripe_
 * trusted_funding.sql`, NOT YET APPLIED to the live database this run) and the new `ingest_stripe_
 * event()`/`record_stripe_payment_intent()`/`record_payment_transfer()` functions now have a real
 * exception vocabulary, mapped below (T018/T019) — this is the SAME map/function pair Phase 1 always
 * intended to extend, never a second one.
 */
const FINANCE_ERROR_MAP: Record<string, ActionFeedbackCode> = {
  // admin_review_payment() — settlement (lib/finance/settlement.ts, T018/T019).
  forbidden: ACTION_FEEDBACK.FINANCE_SETTLEMENT_FORBIDDEN,
  payment_not_found: ACTION_FEEDBACK.FINANCE_SETTLEMENT_PAYMENT_NOT_FOUND,
  trusted_funding_required: ACTION_FEEDBACK.FINANCE_SETTLEMENT_TRUSTED_FUNDING_MISSING,
  active_reservation_missing: ACTION_FEEDBACK.FINANCE_SETTLEMENT_RESERVATION_MISSING,
  reservation_expired: ACTION_FEEDBACK.FINANCE_SETTLEMENT_RESERVATION_EXPIRED,
  seller_inventory_position_invalid: ACTION_FEEDBACK.FINANCE_SETTLEMENT_INVENTORY_INVALID,

  // record_stripe_payment_intent() — funding creation (lib/finance/funding.ts).
  order_not_found: ACTION_FEEDBACK.FINANCE_SETTLEMENT_PAYMENT_NOT_FOUND,
  order_not_fundable: ACTION_FEEDBACK.FINANCE_FUNDING_ORDER_NOT_FUNDABLE,
  stripe_payment_intent_already_recorded: ACTION_FEEDBACK.FINANCE_FUNDING_ALREADY_INITIATED,
  stripe_payment_intent_required: ACTION_FEEDBACK.VALIDATION_ERROR,
  stripe_idempotency_key_required: ACTION_FEEDBACK.VALIDATION_ERROR,

  // record_payment_transfer() — reuses the same settlement/funding codes above (payout_not_found,
  // stripe_transfer_id_required, stripe_transfer_group_required) since they mean the same thing in this
  // domain — never a third, redundant vocabulary.
  payout_not_found: ACTION_FEEDBACK.FINANCE_SETTLEMENT_PAYMENT_NOT_FOUND,
  stripe_transfer_id_required: ACTION_FEEDBACK.VALIDATION_ERROR,
  stripe_transfer_group_required: ACTION_FEEDBACK.VALIDATION_ERROR,
};

/** Minimal shape of what supabase-js's `PostgrestError` (or any thrown value) may carry — never assumed to be an `Error` instance. */
type RawDatabaseError = { message?: unknown; code?: unknown } | null | undefined;

function extractRaisedMessage(error: RawDatabaseError): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? error.message : undefined;
  return typeof message === "string" && message.length > 0 ? message : null;
}

/**
 * Logs an UNRECOGNIZED database error server-side for diagnosis — deliberately narrow: only the
 * SQLSTATE-shaped `code` field (never the message text, never any row/payload/provider data). Never
 * logs a full error object, matching the run directive's explicit "internal logging must also avoid
 * sensitive finance/provider/bank/proof payloads" rule.
 */
function logUnmappedFinanceError(error: RawDatabaseError): void {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "unknown";
  console.error("[finance] unmapped database error", { sqlstate: code });
}

/** T002 — maps a finance-domain database error to a safe `ActionFeedbackCode`. Any error without a
 * recognized raised message falls back to `FINANCE_READ_FAILED` and is logged without payload. */
export function mapFinanceError(error: RawDatabaseError): ActionFeedbackCode {
  const message = extractRaisedMessage(error);
  const mapped = message ? FINANCE_ERROR_MAP[message] : undefined;
  if (mapped) return mapped;
  logUnmappedFinanceError(error);
  return ACTION_FEEDBACK.FINANCE_READ_FAILED;
}
