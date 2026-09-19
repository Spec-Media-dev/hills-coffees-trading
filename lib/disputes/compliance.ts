import { checkRoleFunctionAccess } from "@/lib/admin/guards";
import { mapDisputeWriteError } from "@/lib/disputes/errors";
import { isDisputeStatus, type DisputeStatus } from "@/lib/disputes/types";
import { DisputeOutcomeInput, DisputeTransitionInput } from "@/lib/disputes/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 (T004) — the COMPLIANCE-only dispute review/resolution domain layer that Feature 010's
 * console consumes (FR-002, FR-012, SEC-002). Six NAMED operations, each with a fixed target status.
 * There is no generic "set status" function, no status parameter, and no export that skips the
 * authority check.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DATABASE IS THE AUTHORITY (RUN E, 2026-09-19 — DB-OPEN-23 closed by migration
 * `20260919120000_feature_012_dispute_status_history.sql`)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every transition goes through ONE database function, `transition_dispute(p_dispute_id,
 * p_expected_status, p_to_status, p_reason)` (SECURITY DEFINER), which in a single transaction:
 * requires `is_compliance_operator()` + `mfa_satisfied()`; requires a non-empty reason; locks the
 * dispute; refuses unless the current status equals the status the operator saw (`dispute_stale`);
 * refuses any pair outside the approved graph (`invalid_dispute_transition`); writes the resolution,
 * `resolved_by` and `resolved_at` exactly once for RESOLVED/REJECTED; updates the dispute; and
 * appends one `dispute_status_history` row with the actor (`auth.uid()` — never client-supplied),
 * from/to status, reason, correlation id and time. A BEFORE UPDATE trigger on `disputes`
 * (`validate_dispute_transition`) refuses ANY other update — so the existing `disputes_ops_update`
 * policy alone can no longer change a dispute, and bypassing this module changes nothing.
 *
 * THIS MODULE'S ROLE: authorise early (`checkRoleFunctionAccess("is_compliance_operator")` —
 * members, WAREHOUSE, FINANCE and AUDITOR get `COMPLIANCE_NOT_CAPABLE` before any query), validate
 * input with keyed messages, pre-check the graph so an obviously invalid request never reaches the
 * database, and map every database refusal to a safe code. `DISPUTE_TRANSITIONS` below is the SAME
 * graph the database enforces (pinned by `tests/disputes/transition-history.test.ts` against the
 * migration text) — it is a convenience for callers and UI, never the boundary.
 *
 * `FROZEN` IS A RECORD LABEL ONLY (DB-OPEN-09, unchanged): `markFrozen` changes `disputes.status` and
 * records history — nothing else. No order/shipment/payment/inventory write exists here or in the
 * database function.
 */

/** The approved transition graph — identical to `transition_dispute()`'s. `CLOSED` is terminal. */
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
 * Every transition now records actor + reason + timestamp in `dispute_status_history` (DB-OPEN-23
 * resolved), so there is exactly one attribution outcome. The type is kept so callers that rendered
 * the previous `"timestamp-only"` case fail to compile rather than silently mislabel.
 */
export type TransitionAttribution = "recorded";

export type DisputeTransitionOutcome = {
  disputeId: string;
  fromStatus: DisputeStatus;
  toStatus: DisputeStatus;
  attribution: TransitionAttribution;
  historyId: string;
  recordedAt: string;
};

type Target = "UNDER_REVIEW" | "FROZEN" | "RESOLVED" | "REJECTED" | "CLOSED";

type RpcOutcome = { dispute_id: string; from_status: string; to_status: string; history_id: string; recorded_at: string };

async function transition({ disputeId, reason, expectedStatus }: { disputeId: string; reason: string; expectedStatus?: DisputeStatus }, to: Target): Promise<ActionFeedbackResult<DisputeTransitionOutcome>> {
  const access = await checkRoleFunctionAccess("is_compliance_operator");
  if (!access.ok) return { ok: false, code: ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("disputes").select("id, status").eq("id", disputeId).maybeSingle();
  if (readError) return { ok: false, code: mapDisputeWriteError(readError, "transition") };
  if (!current || !isDisputeStatus(current.status)) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_NOT_FOUND };

  // The status the operator saw wins; otherwise the status just read. Either way the database
  // re-checks it under a row lock, so a concurrent change between here and there is refused as stale.
  const from = expectedStatus ?? current.status;
  if (from !== current.status) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_STALE };
  if (!isApprovedDisputeTransition(from, to)) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_TRANSITION_REFUSED };

  const { data, error } = await supabase.rpc("transition_dispute", { p_dispute_id: disputeId, p_expected_status: from, p_to_status: to, p_reason: reason });
  if (error) return { ok: false, code: mapDisputeWriteError(error, "transition") };
  const outcome = data as RpcOutcome | null;
  if (!outcome || outcome.dispute_id !== disputeId || outcome.to_status !== to || !isDisputeStatus(outcome.from_status)) {
    return { ok: false, code: ACTION_FEEDBACK.DISPUTE_TRANSITION_FAILED };
  }

  return {
    ok: true,
    code: ACTION_FEEDBACK.DISPUTE_TRANSITION_RECORDED,
    data: { disputeId, fromStatus: outcome.from_status, toStatus: to, attribution: "recorded", historyId: outcome.history_id, recordedAt: outcome.recorded_at },
  };
}

function withReason(input: unknown): { ok: true; value: DisputeTransitionInput } | { ok: false; result: ActionFeedbackResult<DisputeTransitionOutcome> } {
  const parsed = DisputeTransitionInput.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors } };
  return { ok: true, value: parsed.data };
}

function withOutcome(input: unknown): { ok: true; value: DisputeOutcomeInput } | { ok: false; result: ActionFeedbackResult<DisputeTransitionOutcome> } {
  const parsed = DisputeOutcomeInput.safeParse(input);
  if (!parsed.success) return { ok: false, result: { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors } };
  return { ok: true, value: parsed.data };
}

/** OPEN → UNDER_REVIEW. `{ disputeId, reason, expectedStatus? }`. */
export async function beginReview(input: unknown) {
  const parsed = withReason(input);
  return parsed.ok ? transition(parsed.value, "UNDER_REVIEW") : parsed.result;
}

/**
 * OPEN | UNDER_REVIEW → FROZEN. Changes the dispute record's status ONLY — no order, shipment,
 * payment, settlement, inventory or trading effect exists or is implied (DB-OPEN-09).
 */
export async function markFrozen(input: unknown) {
  const parsed = withReason(input);
  return parsed.ok ? transition(parsed.value, "FROZEN") : parsed.result;
}

/** FROZEN → UNDER_REVIEW. `{ disputeId, reason, expectedStatus? }`. */
export async function resumeReview(input: unknown) {
  const parsed = withReason(input);
  return parsed.ok ? transition(parsed.value, "UNDER_REVIEW") : parsed.result;
}

/** UNDER_REVIEW | FROZEN → RESOLVED. The resolution is both the transition's reason and the recorded outcome (written once). */
export async function resolveDispute(input: unknown) {
  const parsed = withOutcome(input);
  return parsed.ok ? transition({ disputeId: parsed.value.disputeId, reason: parsed.value.resolution, expectedStatus: parsed.value.expectedStatus }, "RESOLVED") : parsed.result;
}

/** OPEN | UNDER_REVIEW | FROZEN → REJECTED. The rejection reason is both the transition's reason and the recorded outcome (written once). */
export async function rejectDispute(input: unknown) {
  const parsed = withOutcome(input);
  return parsed.ok ? transition({ disputeId: parsed.value.disputeId, reason: parsed.value.resolution, expectedStatus: parsed.value.expectedStatus }, "REJECTED") : parsed.result;
}

/** RESOLVED | REJECTED → CLOSED. The recorded resolution is preserved unchanged. `{ disputeId, reason, expectedStatus? }`. */
export async function closeDispute(input: unknown) {
  const parsed = withReason(input);
  return parsed.ok ? transition(parsed.value, "CLOSED") : parsed.result;
}
