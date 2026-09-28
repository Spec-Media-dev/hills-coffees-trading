# Interface Contracts: In-App Notifications

**Feature**: `014-notifications-messaging-seo` (Sprint 2)  
**Spec**: [spec.md](../spec.md)

---

## 1. Database RPC Contracts

### `public.mark_notification_read(p_notification_id uuid)`

* **Type**: Remote Procedure Call (`supabase.rpc("mark_notification_read")`)
* **Privileges**: EXECUTE granted to `authenticated` only
* **Arguments**:
  * `p_notification_id` (`uuid`, required): Primary key of the notification row
* **Returns**: `boolean`
  * `true`: Row existed, belonged to `auth.uid()`, and `read_at` was updated.
  * `false`: Row did not exist, belonged to another user, or was already read.
* **Error Behavior**: No error thrown on non-existent ID (safe non-enumerating return).

### `public.mark_all_notifications_read()`

* **Type**: Remote Procedure Call (`supabase.rpc("mark_all_notifications_read")`)
* **Privileges**: EXECUTE granted to `authenticated` only
* **Arguments**: None
* **Returns**: `integer`
  * Count of notifications whose `read_at` changed from NULL to `clock_timestamp()`.

### `public.get_unread_notification_count()`

* **Type**: Remote Procedure Call (`supabase.rpc("get_unread_notification_count")`)
* **Privileges**: EXECUTE granted to `authenticated` only
* **Arguments**: None
* **Returns**: `integer`
  * Count of active unread notifications for `auth.uid()`.

---

## 2. Server Action Contracts

### `markNotificationReadAction(notificationId: string)`

* **Path**: `src/app/dashboard/notifications/actions.ts`
* **Input**:
  ```typescript
  type MarkReadInput = { notificationId: string };
  ```
* **Output**:
  ```typescript
  type ActionResponse = 
    | { ok: true; readAt: string }
    | { ok: false; error: "UNAUTHORIZED" | "NOT_FOUND" | "INTERNAL_ERROR" };
  ```
* **Side Effects**: Calls `revalidatePath("/dashboard/notifications")`.

### `markAllNotificationsReadAction()`

* **Path**: `src/app/dashboard/notifications/actions.ts`
* **Input**: None
* **Output**:
  ```typescript
  type ActionResponse = 
    | { ok: true; count: number }
    | { ok: false; error: "UNAUTHORIZED" | "INTERNAL_ERROR" };
  ```
* **Side Effects**: Calls `revalidatePath("/dashboard/notifications")`.

---

## 3. Data Transfer Objects (DTOs)

```typescript
export interface NotificationItemDTO {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPageDTO {
  rows: NotificationItemDTO[];
  unreadCount: number;
  hasMore: boolean;
}
```
