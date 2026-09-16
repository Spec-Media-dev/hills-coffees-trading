"use server";

import { revalidatePath } from "next/cache";

import { decideKybApplication, startKybReview, type KybDecisionOutcome, type OrganizationFollowThrough } from "@/lib/admin/decisions";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN B (T009) — Server Actions for the KYB detail page. Thin wrappers: they parse the
 * form, delegate every check (validation → live `is_compliance_operator()` → compare-and-set →
 * review row) to `lib/admin/decisions.ts`, and revalidate the console's own private paths. Server
 * Actions are globally addressable, so the authority lives in the domain layer, never here.
 */

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function recordKybDecision(_prev: ActionFeedbackResult<KybDecisionOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<KybDecisionOutcome>> {
  const applicationId = text(formData, "applicationId");
  const result = await decideKybApplication({ applicationId, decision: text(formData, "decision"), reason: text(formData, "reason") });
  if (result.ok) {
    revalidatePath("/dashboard-admin/kyb");
    revalidatePath(`/dashboard-admin/kyb/${applicationId}`);
    revalidatePath("/dashboard-admin");
  }
  return result;
}

export async function beginKybReview(
  _prev: ActionFeedbackResult<{ applicationId: string; organizationFollowThrough: OrganizationFollowThrough }> | undefined,
  formData: FormData,
): Promise<ActionFeedbackResult<{ applicationId: string; organizationFollowThrough: OrganizationFollowThrough }>> {
  const applicationId = text(formData, "applicationId");
  const result = await startKybReview({ applicationId });
  if (result.ok) {
    revalidatePath("/dashboard-admin/kyb");
    revalidatePath(`/dashboard-admin/kyb/${applicationId}`);
    revalidatePath("/dashboard-admin");
  }
  return result;
}
