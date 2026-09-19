import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN A (T001) — the dispute domain's safe error mapping.
 *
 * WHAT THE DATABASE CAN ACTUALLY RAISE ON THESE TABLES (read from the live schema report, never
 * guessed): `disputes` and `dispute_evidence` have NO triggers at all, so there is no custom
 * `RAISE EXCEPTION` vocabulary to translate. The only failures a write can produce are PostgreSQL's
 * own SQLSTATE classes:
 *   - `42501` — an RLS `WITH CHECK` refusal (`disputes_create`, `dispute_evidence_add`) or no
 *     `UPDATE` policy matching the caller (`disputes_ops_update` is `is_compliance_operator()` only);
 *   - `23503` — a foreign key (`disputes_order_id_fkey`, `…_opened_by_organization_id_fkey`,
 *     `dispute_evidence_dispute_id_fkey`, …);
 *   - `23514` — a CHECK (`disputes_status_check`, `dispute_evidence_check` — note or file required);
 *   - `23502` — a NOT NULL (`reason`, `order_id`, …);
 *   - `22P02` — a malformed uuid literal.
 * An RLS-filtered `UPDATE` does NOT raise; it matches zero rows. Callers detect that by asking for
 * the updated row back (`.select().maybeSingle()`) and treating `null` as `DISPUTE_STALE` /
 * `DISPUTE_NOT_FOUND` — see `lib/disputes/compliance.ts`.
 *
 * SAFE ERROR CONTRACT: no raw Postgres/PostgREST message, SQLSTATE, policy/constraint/table name or
 * stack trace ever reaches a client. An unrecognized failure degrades to the operation's generic
 * code and is logged server-side with ONLY the SQLSTATE-shaped `code` — never the message (which can
 * echo row values, including a member's untrusted dispute text), never any payload (SEC-006).
 */

type RawDatabaseError = { message?: unknown; code?: unknown } | null | undefined;

export type DisputeWriteOperation = "raise" | "evidence" | "transition";

const GENERIC_FAILURE: Record<DisputeWriteOperation, ActionFeedbackCode> = {
  raise: ACTION_FEEDBACK.DISPUTE_RAISE_FAILED,
  evidence: ACTION_FEEDBACK.DISPUTE_EVIDENCE_FAILED,
  transition: ACTION_FEEDBACK.DISPUTE_TRANSITION_FAILED,
};

/**
 * An RLS refusal or a dangling reference means "the caller cannot act on this record" — reported
 * with the SAME code a nonexistent record gets, so a refusal never confirms that another
 * organization's order or dispute exists.
 */
const NOT_VISIBLE: Record<DisputeWriteOperation, ActionFeedbackCode> = {
  raise: ACTION_FEEDBACK.ORDER_NOT_FOUND,
  evidence: ACTION_FEEDBACK.DISPUTE_NOT_FOUND,
  transition: ACTION_FEEDBACK.DISPUTE_NOT_FOUND,
};

function sqlState(error: RawDatabaseError): string | null {
  if (!error || typeof error !== "object") return null;
  const code = "code" in error ? error.code : undefined;
  return typeof code === "string" && code.length > 0 ? code : null;
}

export function mapDisputeWriteError(error: RawDatabaseError, operation: DisputeWriteOperation): ActionFeedbackCode {
  const code = sqlState(error);
  switch (code) {
    case "42501":
    case "23503":
    case "22P02":
      return NOT_VISIBLE[operation];
    case "23514":
    case "23502":
      return operation === "transition" ? ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED : ACTION_FEEDBACK.VALIDATION_ERROR;
    default:
      // Diagnostic only: the SQLSTATE-shaped code, never the message or any row data.
      console.error("[disputes] unmapped database error", { operation, code: code ?? "unknown" });
      return GENERIC_FAILURE[operation];
  }
}

/** Reads never surface a code to a client; a failed read is thrown as this fixed, message-free error. */
export class DisputeReadError extends Error {
  constructor() {
    super("dispute_read_failed");
    this.name = "DisputeReadError";
  }
}
