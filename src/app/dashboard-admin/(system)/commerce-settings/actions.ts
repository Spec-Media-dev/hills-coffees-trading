"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkAreaAccess } from "@/lib/admin/guards";
import { updateCommerceSettings } from "@/lib/admin/commerce-settings";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 013 T101 — the SINGLE caller of `update_commerce_settings`. `is_platform_admin()`-only,
 * re-verified live via `checkAreaAccess("commerceSettings")` (the same per-area guard every other
 * Operations Console write uses); the RPC itself re-checks MFA server-side.
 */
const Input = z.object({
  validityHours: z.coerce.number().int().min(1).max(720),
  checkoutEnabled: z.boolean(),
  pilotOrganizationIds: z.string(),
});

export async function saveCommerceSettings(_previous: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const access = await checkAreaAccess("commerceSettings");
  if (!access.ok) return { ok: false, code: ACTION_FEEDBACK.ADMIN_FORBIDDEN };

  const parsed = Input.safeParse({
    validityHours: formData.get("validityHours"),
    checkoutEnabled: formData.get("checkoutEnabled") === "on",
    pilotOrganizationIds: formData.get("pilotOrganizationIds") ?? "",
  });
  if (!parsed.success) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };

  const uuid = z.string().uuid();
  const pilotOrganizationIds = parsed.data.pilotOrganizationIds
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (pilotOrganizationIds.some((id) => !uuid.safeParse(id).success)) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { pilotOrganizationIds: ["Each pilot organization id must be a valid UUID"] } };
  }

  const result = await updateCommerceSettings({
    validityHours: parsed.data.validityHours,
    checkoutEnabled: parsed.data.checkoutEnabled,
    pilotOrganizationIds,
    requestId: crypto.randomUUID(),
  });
  if (!result.ok) {
    if (result.code === "mfa_step_up_required") return { ok: false, code: ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED };
    if (result.code === "forbidden") return { ok: false, code: ACTION_FEEDBACK.ADMIN_FORBIDDEN };
    if (result.code === "invalid_validity_hours") return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: { validityHours: ["Must be between 1 and 720 hours"] } };
    return { ok: false, code: ACTION_FEEDBACK.SYSTEM_SAVE_FAILED };
  }

  revalidatePath("/dashboard-admin/commerce-settings");
  return { ok: true, data: undefined, code: ACTION_FEEDBACK.SYSTEM_SAVED };
}
