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
 * FORWARD-COMPATIBLE, NOT PREMATURELY ACTED ON: `lib/finance/read.ts` (T003) performs SELECT-only,
 * RLS-scoped reads — it does not call a mutating RPC, so it has no RAISE EXCEPTION surface to map yet.
 * `lib/finance/funding.ts` (T004) never calls the database at all. `FINANCE_ERROR_MAP` is therefore
 * empty this run, deliberately: Phase 3/4's provider-event and settlement work will add its own
 * entries once `admin_review_payment()`'s approved trusted-funding gate exists (T009, T017–T019) —
 * this SAME map/function pair is reused then rather than a second one being invented.
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
