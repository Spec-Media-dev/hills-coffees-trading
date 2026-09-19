import { getRequestIdentity } from "@/lib/auth/dal";
import type { OwnNotificationDTO, OwnNotificationPage } from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Feature 012 RUN B (T009) — SERVER-ONLY own-user notification reads (imports `lib/auth/dal` and
 * `lib/supabase/server`, both `next/headers`-bound). No service role, no cache API, and NO write of
 * any kind: this file never inserts, updates or deletes a notification (DB-BLOCK-04 — see
 * `lib/notifications/limitations.ts`).
 *
 * SCOPE: the live policy `notifications_own` is `user_id = auth.uid() OR is_platform_admin()`. The
 * admin branch would let an ADMIN session read EVERY user's notifications, so this file additionally
 * filters `user_id = <the verified caller>` — the member surface only ever shows the caller's own.
 * The user id comes from `getRequestIdentity()` (server-verified `auth.getUser()`), never from an
 * argument: there is no parameter through which another user's id could be requested.
 *
 * Anonymous callers get `null`. A notification id belonging to another user yields `null`, exactly
 * like a nonexistent id (no existence signal).
 */

const NOTIFICATION_SELECT = "id, user_id, notification_type, title, body, created_at";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type NotificationRow = { id: string; user_id: string; notification_type: string; title: string; body: string; created_at: string };

export class NotificationReadError extends Error {
  constructor() {
    super("notification_read_failed");
    this.name = "NotificationReadError";
  }
}

function toDTO(row: NotificationRow): OwnNotificationDTO {
  return { id: row.id, notificationType: row.notification_type, title: row.title, body: row.body, createdAt: row.created_at };
}

async function verifiedUserId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.requiresMfaStepUp) return null;
  return identity.userId;
}

/** The signed-in user's own notifications, newest first; `null` when there is no verified user. */
export async function listOwnNotifications({ page = 0, pageSize = DEFAULT_PAGE_SIZE }: { page?: number; pageSize?: number } = {}): Promise<OwnNotificationPage | null> {
  const userId = await verifiedUserId();
  if (!userId) return null;
  const size = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, Math.floor(page)) * size;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + size);
  if (error) throw new NotificationReadError();
  const rows = ((data ?? []) as NotificationRow[]).filter((row) => row.user_id === userId);
  const hasMore = rows.length > size;
  return { rows: (hasMore ? rows.slice(0, size) : rows).map(toDTO), hasMore, page: Math.max(0, Math.floor(page)), pageSize: size };
}

/** One of the signed-in user's own notifications; `null` for anonymous, malformed, missing or another user's id. */
export async function getOwnNotification(notificationId: string): Promise<OwnNotificationDTO | null> {
  if (!UUID_PATTERN.test(notificationId)) return null;
  const userId = await verifiedUserId();
  if (!userId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("notifications").select(NOTIFICATION_SELECT).eq("id", notificationId).eq("user_id", userId).maybeSingle();
  if (error) throw new NotificationReadError();
  const row = data as NotificationRow | null;
  return row && row.user_id === userId ? toDTO(row) : null;
}
