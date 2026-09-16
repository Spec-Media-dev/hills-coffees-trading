"use server";

import { revalidatePath } from "next/cache";

import { decideListing, type ListingDecisionOutcome } from "@/lib/admin/decisions";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/** Feature 010 RUN B (T011) — thin Server Action over `lib/admin/decisions.ts#decideListing`. */
export async function recordListingDecision(_prev: ActionFeedbackResult<ListingDecisionOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<ListingDecisionOutcome>> {
  const offerId = formData.get("offerId");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  const result = await decideListing({
    offerId: typeof offerId === "string" ? offerId : undefined,
    decision: typeof decision === "string" ? decision : undefined,
    reason: typeof reason === "string" ? reason : undefined,
  });
  if (result.ok) {
    revalidatePath("/dashboard-admin/listings");
    revalidatePath(`/dashboard-admin/listings/${String(offerId)}`);
    revalidatePath("/dashboard-admin");
    // The member-facing marketplace reflects the listing's new status on its next request.
    revalidatePath("/dashboard/marketplace");
    revalidatePath(`/dashboard/marketplace/${String(offerId)}`);
    revalidatePath("/dashboard/listings");
  }
  return result;
}
