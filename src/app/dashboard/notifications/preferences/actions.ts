"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { saveOwnNotificationPreferences } from "@/lib/notifications/preferences";
import { NOTIFICATION_PREFERENCE_CHANNELS, NOTIFICATION_PREFERENCE_TYPES, preferenceFieldName } from "@/lib/notifications/types";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN B (T011) — the only notification write in the product: the caller's OWN
 * preferences. The form posts each (type, channel) cell as `"true"`/`"false"`; any other key or value
 * fails exact-field validation (`NotificationPreferencesInput.strict()`), and the user id is never a
 * form field — `lib/notifications/preferences.ts` resolves it from the verified session, and RLS
 * (`notification_preferences_own`) refuses any other user's row regardless.
 *
 * AUTH CONTRACT: same `/dashboard/*` member contract as every other page/action.
 */
export async function saveNotificationPreferencesAction(_prevState: ActionFeedbackResult<{ saved: number }> | undefined, formData: FormData): Promise<ActionFeedbackResult<{ saved: number }>> {
  const allowed = new Set<string>(NOTIFICATION_PREFERENCE_TYPES.flatMap((type) => NOTIFICATION_PREFERENCE_CHANNELS.map((channel) => preferenceFieldName(type, channel))));
  const input: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue; // Next.js' own Server Action bookkeeping fields.
    if (!allowed.has(key) || (value !== "true" && value !== "false")) return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
    input[key] = value === "true";
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp || identity.organization === null || !identity.isAuthorizedMember) {
    return { ok: false, code: ACTION_FEEDBACK.NOTIFICATION_PREFERENCES_NOT_CAPABLE };
  }

  const result = await saveOwnNotificationPreferences(input);
  if (!result.ok) return result;
  revalidatePath("/dashboard/notifications/preferences");
  return result;
}
