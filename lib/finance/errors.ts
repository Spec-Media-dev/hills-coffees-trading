import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";
import type { FinanceReviewErrorCode } from "@/lib/finance/types";

/**
 * Feature 016 Contract (server-actions.md §5) — Canonical Domain Error Messages
 */
export const FINANCE_REVIEW_ERROR_MESSAGES: Record<FinanceReviewErrorCode, string> = {
  unauthenticated: "Authentication required. Please sign in again.",
  forbidden: "You do not have permission to perform finance reviews.",
  mfa_required: "Multi-factor authentication step-up required for finance operations.",
  order_not_found: "The requested order could not be found.",
  payment_not_found: "The requested payment could not be found.",
  proforma_not_found: "Authoritative proforma invoice could not be found for this order.",
  proforma_not_confirmed: "Authoritative proforma invoice is not in CONFIRMED status.",
  reservation_not_found: "Stock reservation could not be found for this order.",
  reservation_not_review_hold: "The review is no longer eligible for an initial decision.",
  authoritative_proforma_mismatch: "Payment, order, and reservation do not identify the same confirmed proforma.",
  finalized_upload_intent_not_found: "Finalized payment proof upload intent could not be verified.",
  finalized_proof_not_found: "Finalized payment proof document record could not be found.",
  proof_payment_mismatch: "The finalized payment proof does not match the payment under review.",
  rejection_notes_required: "A mandatory rejection reason must be provided to reject payment.",
  request_id_conflict: "Request ID conflict: previous review was submitted with different parameters.",
  order_already_finalized: "Order has already been finalized with a different review decision.",
  persisted_review_integrity_error: "Database integrity error: the replayed review could not be verified against complete persisted terminal truth.",
  seller_available_insufficient: "Inventory conservation failure: seller available stock is insufficient.",
  seller_reserved_insufficient: "Inventory conservation failure: seller reserved stock is insufficient.",
  invalid_decision: "Invalid review decision specified.",
  invalid_payment_status: "Payment is not in an eligible review state.",
  invalid_commerce_flow: "Order commerce flow is not eligible for bank transfer review.",
};

export function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    if ("message" in error && typeof (error as { message: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
    if ("details" in error && typeof (error as { details: unknown }).details === "string") {
      return (error as { details: string }).details;
    }
  }
  return "";
}

/**
 * Feature 016 T023 — Maps RPC exceptions, integrity errors, and authorization errors
 * to contract-safe domain error codes and human-readable feedback.
 */
export function mapFinanceReviewError(error: unknown): { code: FinanceReviewErrorCode; message: string } {
  const rawMsg = extractErrorMessage(error).trim();
  for (const [code, msg] of Object.entries(FINANCE_REVIEW_ERROR_MESSAGES)) {
    if (rawMsg.includes(code)) {
      return { code: code as FinanceReviewErrorCode, message: msg };
    }
  }
  return {
    code: "persisted_review_integrity_error",
    message: rawMsg || "An unexpected error occurred while processing the finance review.",
  };
}

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
const FINANCE_ERROR_MAP: Record<string, ActionFeedbackCode> = {};

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
