import { getDisputeForMember } from "@/lib/disputes/read";
import { mapDisputeWriteError } from "@/lib/disputes/errors";
import { DISPUTE_INITIAL_STATUS, type DisputeStatus } from "@/lib/disputes/types";
import { DisputeEvidenceNoteInput, RaiseDisputeInput } from "@/lib/disputes/validation";
import { getOrderById } from "@/lib/orders/read";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN A (T003) — a member's ENTIRE write surface into the dispute system: raise a
 * dispute on an order, and attach a TEXT evidence note to a dispute. Nothing else.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE DELIBERATELY CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * - NO STATUS PATH. No export here issues an UPDATE on `disputes`, accepts a status, or names a
 *   target status. A member cannot move, resolve, reject, freeze, close or re-open a dispute. (The
 *   database agrees: `disputes_ops_update` is `is_compliance_operator()` only.) Status changes live
 *   exclusively in `lib/disputes/compliance.ts`.
 * - NO EDIT / DELETE. Neither table has a member UPDATE or DELETE policy, and nothing here attempts
 *   one. A correction is a new evidence note, never an edit (FR-003, OPS-02).
 * - NO FREEZE, NO SIDE EFFECT. Raising a dispute writes ONE `disputes` row and nothing else — no
 *   order, shipment, payment, reservation, inventory or settlement write, and no automatic freeze
 *   (DB-OPEN-09: no trigger on `disputes` writes any other table; the database performs no freeze, so neither does
 *   the application).
 * - NO FILE. `file_asset_id` is never set — evidence files cannot be stored (DB-BLOCK-01); the file
 *   seam is T005, not RUN A.
 * - NO NOTIFICATION (DB-BLOCK-04).
 *
 * AUTHORITY: the caller (a Server Action) has already resolved an authenticated, unblocked, authorized
 * member with an acting organization — same split as `lib/delivery/buyer.ts`; this file never calls
 * `getRequestIdentity()` itself. The DATABASE remains the boundary: `disputes_create` requires
 * `opened_by_user_id = auth.uid() AND can_view_order(order_id) AND NOT is_blocked_user()`, and
 * `dispute_evidence_add` requires `uploaded_by = auth.uid()` and a visible parent dispute. The
 * pre-reads below exist only so a refusal is a clean, non-leaking code — never instead of RLS.
 *
 * `opened_by_organization_id` is NOT checked by any policy (the column is only a foreign key), so the
 * application sets it from the server-resolved acting organization and ONLY after proving that
 * organization is the order's buyer (`getOrderById`'s buyer-scoped read) — never from input.
 */

export type RaisedDispute = { id: string; orderId: string; status: DisputeStatus; correlationId: string };

export async function raiseDispute({
  organizationId,
  userId,
  input,
}: {
  organizationId: string;
  userId: string;
  input: unknown;
}): Promise<ActionFeedbackResult<RaisedDispute>> {
  const parsed = RaiseDisputeInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Buyer-scoped, RLS-respecting: another organization's order and a nonexistent order are the SAME `null`.
  const order = await getOrderById({ organizationId, orderId: parsed.data.orderId });
  if (!order) return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disputes")
    .insert({
      order_id: order.id,
      opened_by_user_id: userId,
      opened_by_organization_id: organizationId,
      reason: parsed.data.reason,
      // Cross-record tracing: the dispute carries its order's own correlation id when the order has
      // one; otherwise the column default generates a fresh one. `status` is never sent — the column
      // default (`OPEN`) is the approved initial status.
      ...(order.correlationId ? { correlation_id: order.correlationId } : {}),
    })
    .select("id, order_id, status, correlation_id")
    .single();

  if (error || !data) return { ok: false, code: mapDisputeWriteError(error, "raise") };
  if (data.status !== DISPUTE_INITIAL_STATUS) {
    // Unreachable against the approved schema (default `OPEN`; the RUN E guard trigger also refuses any other initial status); fail loudly rather than
    // report an unexpected initial status as a normal success.
    return { ok: false, code: ACTION_FEEDBACK.DISPUTE_RAISE_FAILED };
  }

  return {
    ok: true,
    code: ACTION_FEEDBACK.DISPUTE_RAISED,
    data: { id: data.id as string, orderId: data.order_id as string, status: DISPUTE_INITIAL_STATUS, correlationId: data.correlation_id as string },
  };
}

/**
 * Appends a TEXT evidence note to one of the acting organization's own disputes. Permitted in any
 * dispute status the database permits (the policy does not condition on status); the note is
 * timestamped and attributed by the database row itself, and can never be edited afterwards.
 */
export async function addDisputeEvidenceNote({
  organizationId,
  userId,
  input,
}: {
  organizationId: string;
  userId: string;
  input: unknown;
}): Promise<ActionFeedbackResult<{ id: string }>> {
  const parsed = DisputeEvidenceNoteInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const dispute = await getDisputeForMember({ organizationId, userId, disputeId: parsed.data.disputeId });
  if (!dispute) return { ok: false, code: ACTION_FEEDBACK.DISPUTE_NOT_FOUND };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dispute_evidence")
    .insert({ dispute_id: dispute.id, uploaded_by: userId, note: parsed.data.note })
    .select("id")
    .single();

  if (error || !data) return { ok: false, code: mapDisputeWriteError(error, "evidence") };
  return { ok: true, code: ACTION_FEEDBACK.DISPUTE_EVIDENCE_RECORDED, data: { id: data.id as string } };
}
