"use server";

import { revalidatePath } from "next/cache";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NotificationActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; code?: string };

/**
 * Server Action: Mark a single notification as read for the authenticated caller.
 */
export async function markNotificationReadAction(
  input: { notificationId: string } | FormData
): Promise<NotificationActionResult<{ updated: boolean }>> {
  const notificationId =
    input instanceof FormData
      ? String(input.get("notificationId") ?? "")
      : typeof input === "object" && input !== null && "notificationId" in input
      ? String(input.notificationId)
      : "";

  if (!notificationId || !UUID_PATTERN.test(notificationId)) {
    return { ok: false, error: "invalid_notification_id", code: "validation_error" };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp) {
    return { ok: false, error: "unauthorized", code: "auth_generic_error" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  if (error) {
    return { ok: false, error: "mark_read_failed", code: "notification_action_failed" };
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return { ok: true, data: { updated: Boolean(data) } };
}

/**
 * Server Action: Mark all unread notifications as read for the authenticated caller.
 */
export async function markAllNotificationsReadAction(): Promise<
  NotificationActionResult<{ updatedCount: number }>
> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp) {
    return { ok: false, error: "unauthorized", code: "auth_generic_error" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    return { ok: false, error: "mark_all_read_failed", code: "notification_action_failed" };
  }

  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return { ok: true, data: { updatedCount: typeof data === "number" ? data : 0 } };
}
