"use server";

import { revalidatePath } from "next/cache";

import { beginReview, closeDispute, markFrozen, rejectDispute, resolveDispute, resumeReview, type DisputeTransitionOutcome } from "@/lib/disputes/compliance";
import { isDisputeStatus } from "@/lib/disputes/types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 T012 — thin Server Action over Feature 012's NAMED compliance operations
 * (`lib/disputes/compliance.ts`). It owns no transition rule, no status write and no role logic:
 *
 * - the chosen next status only SELECTS which named operation runs (OPEN→UNDER_REVIEW is
 *   `beginReview`, FROZEN→UNDER_REVIEW is `resumeReview`; each other target has exactly one
 *   operation). Anything else is a validation error — there is no generic status setter;
 * - the status the operator saw (`expectedStatus`) is passed through, so a dispute that moved
 *   meanwhile is refused as stale by Feature 012 and, under a row lock, by `transition_dispute()`;
 * - the operation itself checks `is_compliance_operator()`, requires the reason, and the database
 *   enforces the approved graph, MFA, write-once resolution and the attributed history row;
 * - no freeze side effect exists anywhere (DB-OPEN-09): nothing here touches orders, shipments,
 *   payments, inventory, settlement or delivery.
 */
const field = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
};

/** Feature 012's schemas key the outcome text as `resolution`; the console form names it `reason`. */
function withReasonErrors(result: ActionFeedbackResult<DisputeTransitionOutcome>): ActionFeedbackResult<DisputeTransitionOutcome> {
  if (result.ok || result.code !== ACTION_FEEDBACK.VALIDATION_ERROR) return result;
  const errors = result.fieldErrors ?? {};
  const text = errors.reason?.[0] ?? errors.resolution?.[0];
  if (!text) return result;
  return { ...result, fieldErrors: { ...errors, reason: [/TooLong$/.test(text) ? "REASON_TOO_LONG" : "REASON_REQUIRED"] } };
}

export async function recordDisputeTransition(_prev: ActionFeedbackResult<DisputeTransitionOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<DisputeTransitionOutcome>> {
  const disputeId = field(formData, "disputeId");
  const reason = field(formData, "reason");
  const target = field(formData, "status");
  const seen = field(formData, "expectedStatus");
  if (!isDisputeStatus(seen)) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { expectedStatus: ["EXPECTED_STATUS_REQUIRED"] } };
  const expectedStatus = seen;

  let result: ActionFeedbackResult<DisputeTransitionOutcome>;
  switch (target) {
    case "UNDER_REVIEW":
      result = await (expectedStatus === "FROZEN" ? resumeReview : beginReview)({ disputeId, reason, expectedStatus });
      break;
    case "FROZEN":
      result = await markFrozen({ disputeId, reason, expectedStatus });
      break;
    case "RESOLVED":
      result = await resolveDispute({ disputeId, resolution: reason, expectedStatus });
      break;
    case "REJECTED":
      result = await rejectDispute({ disputeId, resolution: reason, expectedStatus });
      break;
    case "CLOSED":
      result = await closeDispute({ disputeId, reason, expectedStatus });
      break;
    default:
      return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { status: ["DECISION_REQUIRED"] } };
  }

  if (result.ok) {
    revalidatePath("/dashboard-admin/disputes");
    revalidatePath(`/dashboard-admin/disputes/${String(disputeId)}`);
    revalidatePath("/dashboard-admin");
    // The member's own dispute pages reflect the new status and outcome on their next request.
    revalidatePath("/dashboard/disputes");
    revalidatePath(`/dashboard/disputes/${String(disputeId)}`);
  }
  return withReasonErrors(result);
}
