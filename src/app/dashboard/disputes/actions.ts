"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import * as disputeMember from "@/lib/disputes/member";
import { RaiseDisputeInput } from "@/lib/disputes/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN A (T006) — the member dispute Server Action surface: raise a dispute. That is the
 * ONLY action here. No status-change, edit, delete, freeze or evidence-file action exists on the
 * member side (T003's own boundary; evidence UI is T008, not RUN A).
 *
 * Same contract as `dashboard/orders/[orderId]/shipment/actions.ts`: Zod validation (the SAME schema
 * the form uses) → server-resolved identity → the domain layer (`lib/disputes/member.ts`), which
 * the database's `disputes_create` policy backs regardless. The acting organization and user id
 * come ONLY from `getRequestIdentity()` — never from the form. Every refusal is a stable
 * `ActionFeedbackCode`; no raw database text is ever returned.
 *
 * AUTH CONTRACT (unchanged from every other `/dashboard/*` write): anonymous, MFA step-up owed, no
 * acting organization, or not `is_authorized_member()` (which is false for a BLOCKED user and for a
 * user whose only organization is suspended/not approved) → `DISPUTE_NOT_CAPABLE` before any query.
 */
export async function raiseDisputeAction(_prevState: ActionFeedbackResult<{ id: string }> | undefined, formData: FormData): Promise<ActionFeedbackResult<{ id: string }>> {
  const parsed = RaiseDisputeInput.safeParse({ orderId: formData.get("orderId") ?? "", reason: formData.get("reason") ?? "" });
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp || identity.organization === null || !identity.isAuthorizedMember) {
    return { ok: false, code: ACTION_FEEDBACK.DISPUTE_NOT_CAPABLE };
  }

  const result = await disputeMember.raiseDispute({
    organizationId: identity.organization.organizationId,
    userId: identity.userId,
    input: parsed.data,
  });
  if (!result.ok) return result;

  revalidatePath("/dashboard/disputes");
  return { ok: true, code: result.code, data: { id: result.data.id } };
}
