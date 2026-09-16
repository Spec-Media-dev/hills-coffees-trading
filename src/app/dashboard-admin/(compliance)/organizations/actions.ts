"use server";

import { revalidatePath } from "next/cache";

import { setOrganizationStatus, type OrganizationStatusOutcome } from "@/lib/admin/decisions";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/** Feature 010 RUN B (T010) — thin Server Action over `lib/admin/decisions.ts#setOrganizationStatus`. */
export async function changeOrganizationStatus(_prev: ActionFeedbackResult<OrganizationStatusOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<OrganizationStatusOutcome>> {
  const organizationId = formData.get("organizationId");
  const status = formData.get("status");
  const reason = formData.get("reason");
  const result = await setOrganizationStatus({
    organizationId: typeof organizationId === "string" ? organizationId : undefined,
    status: typeof status === "string" ? status : undefined,
    reason: typeof reason === "string" ? reason : undefined,
  });
  if (result.ok) {
    revalidatePath("/dashboard-admin/organizations");
    revalidatePath(`/dashboard-admin/organizations/${String(organizationId)}`);
    revalidatePath("/dashboard-admin/kyb");
    revalidatePath("/dashboard-admin");
  }
  return result;
}
