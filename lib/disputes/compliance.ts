import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { mapDisputeWriteError } from "@/lib/disputes/errors";
import { isDisputeStatus, type DisputeStatus } from "@/lib/disputes/types";
import { DisputeOutcomeInput, DisputeReferenceInput } from "@/lib/disputes/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN A (T004) — the COMPLIANCE-only dispute review/resolution domain layer that
 * Feature 010's console will consume (FR-002, FR-012, SEC-002). Six NAMED operations, each with a
 * fixed target status. There is no generic "set status" function, no status parameter, and no
 * export that skips the authority check — the only way to change a dispute's status in this
 * codebase is through one of the operations below.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AUTHORITY (two independent layers)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. Application: `checkRoleFunctionAccess("is_compliance_operator")` — authenticated, MFA step-up
 *    satisfied, holds an operational role, and a LIVE `is_compliance_operator()` call returns true.
 *    Members, WAREHOUSE, FINANCE and AUDITOR are refused with `COMPLIANCE_NOT_CAPABLE` before any
 *    query. (The database function is hierarchical — ADMIN/SUPER_ADMIN also pass it; this layer
 *    follows the database's answer and adds no role of its own.)
 * 2. Database: `disputes_ops_update` (UPDATE, USING + WITH CHECK `is_compliance_operator()`). For
 *    any other caller an UPDATE matches zero rows — the row is unchanged.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE DATABASE DOES NOT ENFORCE — AND THEREFORE THIS FILE DOES (recorded, not hidden)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `disputes` has NO trigger (live schema report): no transition guard, no `updated_at` maintenance,
 * no audit-log trigger, and `disputes_ops_update` lets a compliance operator write ANY column. So:
 *   - TRANSITIONS are enforced here only (`DISPUTE_TRANSITIONS` below) — a conservative,
 *     application-owned policy; the database itself would accept any of the six values from any
 *     status for a compliance caller. Every update is a compare-and-set on the status the operator
 *     saw (`.eq("status", from)`), so a concurrent decision is refused as `DISPUTE_STALE`.
 *   - COLUMNS are allowlisted here: only `status`, `updated_at`, and — for RESOLVED/REJECTED only —
 *     `resolution`, `resolved_by`, `resolved_at`. `order_id`, `reason`, `opened_by_*` and
 *     `correlation_id` are never written by this module.
 *   - NON-DESTRUCTIVE: a resolution is written exactly once (`resolution IS NULL AND resolved_at IS
 *     NULL` guard), and no transition leaves RESOLVED/REJECTED except to CLOSED, which keeps the
 *     recorded resolution intact. Nothing is deleted; nothing earlier is overwritten.
 *
 * ATTRIBUTION — HONEST ABOUT THE SCHEMA: the only actor/reason/timestamp columns on `disputes` are
 * `resolution`, `resolved_by`, `resolved_at` (plus `updated_at`). RESOLVED and REJECTED therefore
 * record actor + reason + timestamp. `beginReview`, `markFrozen`, `resumeReview` and `closeDispute`
 * can record ONLY `updated_at`: there is no per-transition history table and no column for their
 * actor or reason, so none is collected (collecting a reason and discarding it would be dishonest).
 * Each result reports which case applied (`attribution`). This is a recorded capability gap for
 * RUN A's closure report — not solved here (no schema change in this feature).
 *
 * `FROZEN` IS A RECORD LABEL ONLY (DB-OPEN-09): `markFrozen` changes `disputes.status` and nothing
 * else. It does not — and under the approved policies cannot — hold or change the affected order,
 * shipment, payment, settlement, inventory or trading. No order/shipment write exists in this file.
 */

/** The application-owned transition policy. `CLOSED` is terminal. Frozen at module load. */
export const DISPUTE_TRANSITIONS: Readonly<Record<DisputeStatus, readonly DisputeStatus[]>> = Object.freeze({
  OPEN: Object.freeze(["UNDER_REVIEW", "FROZEN", "REJECTED"] as const),
  UNDER_REVIEW: Object.freeze(["FROZEN", "RESOLVED", "REJECTED"] as const),
  FROZEN: Object.freeze(["UNDER_REVIEW", "RESOLVED", "REJECTED"] as const),
  RESOLVED: Object.freeze(["CLOSED"] as const),
  REJECTED: Object.freeze(["CLOSED"] as const),
  CLOSED: Object.freeze([] as const),
});

export function isApprovedDisputeTransition(from: DisputeStatus, to: DisputeStatus): boolean {
  return DISPUTE_TRANSITIONS[from].includes(to);
}

/**
 * `recorded` — actor (`resolved_by`), reason (`resolution`) and timestamp (`resolved_at`) persisted.
 * `timestamp-only` — only `updated_at` persisted; the schema has no column for this transition's
 * actor or reason (see header).
 */
export type TransitionAttribution = "recorded" | "timestamp-only";

export type DisputeTransitionOutcome = {
  disputeId: string;
  fromStatus: DisputeStatus;
  toStatus: DisputeStatus;
  attribution: TransitionAttribution;
  recordedAt: string;
};

type Target = "UNDER_REVIEW" | "FROZEN" | "RESOLVED" | "REJECTED" | "CLOSED";

async function transition(disputeId: string, to: Target, outcome: { resolution: string } | null): Promise<ActionFeedbackResult<DisputeTransitionOutcome>> {
  const access = await checkRoleFunctionAccess("is_compliance_operator");
  if (!access.ok) return { ok: false, code: ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("disputes").select("id, status, resolution, resolved_at").eq("id", disputeId).maybeSingle();
  if (readError) return { ok: false, code: mapDisputeWriteError(readError, "transition") };
  if (!current || !isDisputeStatus(current.status)) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_NOT_FOUND };

  const from = current.status;
  if (!isApprovedDisputeTransition(from, to)) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED };
  if (outcome && (current.resolution !== null || current.resolved_at !== null)) {
    // A resolution is write-once; never overwrite a recorded outcome.
    return { ok: false, code: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED };
  }

  const recordedAt = new Date().toISOString();
  const patch: Record<string, string> = { status: to, updated_at: recordedAt };
  if (outcome) {
    patch.resolution = outcome.resolution;
    patch.resolved_by = access.identity.userId;
    patch.resolved_at = recordedAt;
  }

  let update = supabase.from("disputes").update(patch).eq("id", disputeId).eq("status", from);
  if (outcome) update = update.is("resolution", null).is("resolved_at", null);
  const { data: updated, error } = await update.select("id, status").maybeSingle();

  if (error) return { ok: false, code: mapDisputeWriteError(error, "transition") };
  if (!updated) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_STALE };

  return {
    ok: true,
    code: ACTION_FEEDBACK.DISPUTE_TRANSITION_RECORDED,
    data: { disputeId, fromStatus: from, toStatus: to, attribution: outcome ? "recorded" : "timestamp-only", recordedAt },
  };
}

function referenceOf(input: unknown): { ok: true; disputeId: string } | { ok: false; result: ActionFeedbackResult<DisputeTransitionOutcome> } {
  const parsed = DisputeReferenceInput.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors } };
  return { ok: true, disputeId: parsed.data.disputeId };
}

function outcomeOf(input: unknown): { ok: true; disputeId: string; resolution: string } | { ok: false; result: ActionFeedbackResult<DisputeTransitionOutcome> } {
  const parsed = DisputeOutcomeInput.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors } };
  return { ok: true, disputeId: parsed.data.disputeId, resolution: parsed.data.resolution };
}

/** OPEN → UNDER_REVIEW. Timestamp only (no actor/reason column exists for this transition). */
export async function beginReview(input: unknown) {
  const ref = referenceOf(input);
  return ref.ok ? transition(ref.disputeId, "UNDER_REVIEW", null) : ref.result;
}

/**
 * OPEN | UNDER_REVIEW → FROZEN. Changes the dispute record's status ONLY — no order, shipment,
 * payment, settlement, inventory or trading effect exists or is implied (DB-OPEN-09).
 */
export async function markFrozen(input: unknown) {
  const ref = referenceOf(input);
  return ref.ok ? transition(ref.disputeId, "FROZEN", null) : ref.result;
}

/** FROZEN → UNDER_REVIEW. Timestamp only. */
export async function resumeReview(input: unknown) {
  const ref = referenceOf(input);
  return ref.ok ? transition(ref.disputeId, "UNDER_REVIEW", null) : ref.result;
}

/** UNDER_REVIEW | FROZEN → RESOLVED, recording resolution text, `resolved_by` and `resolved_at` once. */
export async function resolveDispute(input: unknown) {
  const parsed = outcomeOf(input);
  return parsed.ok ? transition(parsed.disputeId, "RESOLVED", { resolution: parsed.resolution }) : parsed.result;
}

/** OPEN | UNDER_REVIEW | FROZEN → REJECTED, recording the reason, `resolved_by` and `resolved_at` once. */
export async function rejectDispute(input: unknown) {
  const parsed = outcomeOf(input);
  return parsed.ok ? transition(parsed.disputeId, "REJECTED", { resolution: parsed.resolution }) : parsed.result;
}

/** RESOLVED | REJECTED → CLOSED. The recorded resolution is preserved unchanged. Timestamp only. */
export async function closeDispute(input: unknown) {
  const ref = referenceOf(input);
  return ref.ok ? transition(ref.disputeId, "CLOSED", null) : ref.result;
}
