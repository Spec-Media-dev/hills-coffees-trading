import { getRequestIdentity } from "@/lib/auth/dal";
import {
  NOTIFICATION_PREFERENCE_CHANNELS,
  NOTIFICATION_PREFERENCE_TYPES,
  NotificationPreferencesInput,
  preferenceFieldName,
  type NotificationPreferenceCell,
} from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 012 RUN B (T011) — SERVER-ONLY own-user notification preferences over the EXISTING
 * `notification_preferences` table (PK `user_id, channel, notification_type`; `is_enabled` default
 * true) and its policy `notification_preferences_own` (ALL, USING + WITH CHECK `user_id = auth.uid()`).
 *
 * OWN USER ONLY, TWICE: the user id is resolved server-side from `getRequestIdentity()` — no function
 * here accepts a user id — and RLS refuses any row whose `user_id` is not the caller's. There is no
 * DELETE grant for `authenticated`, so "off" is stored as `is_enabled = false`, never by deleting.
 *
 * HONESTY: saving a preference records a CHOICE only. No channel delivers anything today (no
 * generator, no approved provider — DB-BLOCK-04, SRS §12); the page says so.
 *
 * Only the application-owned vocabulary in `lib/notifications/types.ts` is read or written; rows with
 * any other `notification_type` are left untouched and never displayed as if they were understood.
 */

type PreferenceRow = { user_id: string; channel: string; notification_type: string; is_enabled: boolean };

async function verifiedUserId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp) return null;
  return identity.userId;
}

/** The caller's twelve preference cells (`stored: false` where nothing has been saved); `null` if not signed in. */
export async function readOwnNotificationPreferences(): Promise<readonly NotificationPreferenceCell[] | null> {
  const userId = await verifiedUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("user_id, channel, notification_type, is_enabled")
    .eq("user_id", userId)
    .in("notification_type", [...NOTIFICATION_PREFERENCE_TYPES])
    .in("channel", [...NOTIFICATION_PREFERENCE_CHANNELS]);
  if (error) throw new Error("notification_preferences_read_failed");

  const stored = new Map(((data ?? []) as PreferenceRow[]).filter((row) => row.user_id === userId).map((row) => [`${row.notification_type}__${row.channel}`, row.is_enabled]));
  return NOTIFICATION_PREFERENCE_TYPES.flatMap((type) =>
    NOTIFICATION_PREFERENCE_CHANNELS.map((channel) => {
      const value = stored.get(preferenceFieldName(type, channel));
      return { type, channel, enabled: value ?? false, stored: value !== undefined };
    }),
  );
}

/** Saves all twelve cells for the caller (exact-field validated). */
export async function saveOwnNotificationPreferences(input: unknown): Promise<ActionFeedbackResult<{ saved: number }>> {
  const parsed = NotificationPreferencesInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const userId = await verifiedUserId();
  if (!userId) return { ok: false, code: ACTION_FEEDBACK.NOTIFICATION_PREFERENCES_NOT_CAPABLE };

  const rows = NOTIFICATION_PREFERENCE_TYPES.flatMap((type) =>
    NOTIFICATION_PREFERENCE_CHANNELS.map((channel) => ({ user_id: userId, channel, notification_type: type, is_enabled: parsed.data[preferenceFieldName(type, channel)] })),
  );
  const supabase = await createClient();
  const { data, error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,channel,notification_type" }).select("user_id");
  if (error || !data || data.length !== rows.length) {
    if (error) console.error("[notifications] preference save failed", { code: typeof error.code === "string" ? error.code : "unknown" });
    return { ok: false, code: ACTION_FEEDBACK.NOTIFICATION_PREFERENCES_FAILED };
  }
  return { ok: true, code: ACTION_FEEDBACK.NOTIFICATION_PREFERENCES_SAVED, data: { saved: data.length } };
}
