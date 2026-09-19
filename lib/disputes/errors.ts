import { ACTION_FEEDBACK, type ActionFeedbackCode } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN A (T001) — the dispute domain's safe error mapping.
 *
 * WHAT THE DATABASE CAN ACTUALLY RAISE ON THESE TABLES (read from the live schema report, never
 * guessed): in the baseline `disputes` and `dispute_evidence` have NO triggers, so their writes fail
 * only with PostgreSQL's own SQLSTATE classes (below). Since RUN E (T004 / DB-OPEN-23) the dispute
 * TRANSITION path additionally raises its own named exceptions — mapped first, in
 * `TRANSITION_EXCEPTIONS`. The SQLSTATE classes:
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

/**
 * Feature 012 RUN E (T004 / DB-OPEN-23) — the exceptions raised by the authoritative transition path
 * (`transition_dispute()` and the `trg_disputes_transition_guard` / `trg_dispute_status_history_append_only`
 * triggers, migration `20260919120000_feature_012_dispute_status_history.sql`). Matched on the raised
 * text itself (SQLSTATE `P0001`), exactly like `lib/orders/errors.ts`, so each refusal keeps its meaning.
 */
const TRANSITION_EXCEPTIONS: Record<string, ActionFeedbackCode> = {
  forbidden: ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE,
  mfa_step_up_required: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED,
  dispute_reason_required: ACTION_FEEDBACK.VALIDATION_ERROR,
  dispute_reason_too_long: ACTION_FEEDBACK.VALIDATION_ERROR,
  dispute_not_found: ACTION_FEEDBACK.DISPUTE_NOT_FOUND,
  dispute_stale: ACTION_FEEDBACK.DISPUTE_STALE,
  invalid_dispute_transition: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED,
  dispute_resolution_already_recorded: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED,
  dispute_changes_only_through_workflow: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED,
  dispute_intake_is_immutable: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED,
  dispute_status_history_is_append_only: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED,
  // Raised only for an INSERT that is not a fresh OPEN dispute — unreachable through `raiseDispute`.
  dispute_must_start_open: ACTION_FEEDBACK.DISPUTE_RAISE_FAILED,
};

function raisedMessage(error: RawDatabaseError): string | null {
  if (!error || typeof error !== "object") return null;
  const message = "message" in error ? error.message : undefined;
  return typeof message === "string" && message.length > 0 ? message : null;
}

export function mapDisputeWriteError(error: RawDatabaseError, operation: DisputeWriteOperation): ActionFeedbackCode {
  const raised = raisedMessage(error);
  if (raised && Object.hasOwn(TRANSITION_EXCEPTIONS, raised)) return TRANSITION_EXCEPTIONS[raised]!;
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
