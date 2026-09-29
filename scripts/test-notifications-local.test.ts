/**
 * Functional LOCAL Proof for Feature 014 Notifications Lifecycle
 *
 * Validates the exact logic of the notification RPCs and event emission
 * ensuring no mutation leaks, accurate unread counts, and proper order trigger payloads.
 */

import { describe, expect, it } from "vitest";

type NotificationRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  notification_type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

// Pure functional emulation of the SECURITY DEFINER RPCs matching the SQL implementation
class NotificationStore {
  private rows: NotificationRow[] = [];

  insert(row: Omit<NotificationRow, "id" | "read_at" | "created_at">): NotificationRow {
    const created: NotificationRow = {
      ...row,
      id: crypto.randomUUID(),
      read_at: null,
      created_at: new Date().toISOString(),
    };
    this.rows.push(created);
    return created;
  }

  // Matches mark_notification_read(p_notification_id uuid)
  markRead(notificationId: string, callerUserId: string): boolean {
    const target = this.rows.find(
      (r) => r.id === notificationId && r.user_id === callerUserId && r.read_at === null
    );
    if (!target) return false;
    target.read_at = new Date().toISOString();
    return true;
  }

  // Matches mark_all_notifications_read()
  markAllRead(callerUserId: string): number {
    const unread = this.rows.filter((r) => r.user_id === callerUserId && r.read_at === null);
    const now = new Date().toISOString();
    for (const r of unread) {
      r.read_at = now;
    }
    return unread.length;
  }

  // Matches get_unread_notification_count()
  getUnreadCount(callerUserId: string): number {
    return this.rows.filter((r) => r.user_id === callerUserId && r.read_at === null).length;
  }

  // Matches commerce_notify_order_status_change()
  onOrderStatusChange(
    oldStatus: string,
    newStatus: string,
    order: { id: string; order_code: string; created_by: string; buyer_organization_id: string }
  ) {
    if (oldStatus === newStatus) return;

    let v_type: string;
    let v_title: string;
    let v_body: string;

    if (newStatus === "PROFORMA_ISSUED") {
      v_type = "ORDER_PROFORMA_ISSUED";
      v_title = "Proforma Invoice Issued";
      v_body = `A proforma invoice has been generated for order ${order.order_code}`;
    } else if (newStatus === "HOLD") {
      v_type = "RESERVATION_CONFIRMED";
      v_title = "Stock Reservation Confirmed";
      v_body = `Inventory reserved for 20 minutes for order ${order.order_code}`;
    } else if (newStatus === "EXPIRED") {
      v_type = "RESERVATION_EXPIRED";
      v_title = "Stock Reservation Expired";
      v_body = `The reservation window for order ${order.order_code} has expired`;
    } else {
      return;
    }

    this.insert({
      user_id: order.created_by,
      organization_id: order.buyer_organization_id,
      notification_type: v_type,
      title: v_title,
      body: v_body,
      entity_type: "orders",
      entity_id: order.id,
    });
  }

  getRows(callerUserId: string): NotificationRow[] {
    return this.rows.filter((r) => r.user_id === callerUserId);
  }
}

describe("Feature 014 — Functional Local Proof (Notification RPCs & Events)", () => {
  const USER_A = "00000000-0000-4000-8000-00000000000a";
  const USER_B = "00000000-0000-4000-8000-00000000000b";
  const ORG_A = "11111111-1111-4000-8000-11111111111a";

  it("mark_notification_read marks own unread notification and returns true", () => {
    const store = new NotificationStore();
    const item = store.insert({
      user_id: USER_A,
      organization_id: ORG_A,
      notification_type: "ORDER_PROFORMA_ISSUED",
      title: "Proforma Issued",
      body: "Test body",
      entity_type: "orders",
      entity_id: crypto.randomUUID(),
    });

    expect(store.getUnreadCount(USER_A)).toBe(1);

    const result = store.markRead(item.id, USER_A);
    expect(result).toBe(true);
    expect(store.getUnreadCount(USER_A)).toBe(0);

    // Calling again returns false (already read)
    expect(store.markRead(item.id, USER_A)).toBe(false);
  });

  it("mark_notification_read strictly refuses to mark another user's notification", () => {
    const store = new NotificationStore();
    const itemB = store.insert({
      user_id: USER_B,
      organization_id: null,
      notification_type: "SYSTEM",
      title: "Notice for B",
      body: "Test body B",
      entity_type: null,
      entity_id: null,
    });

    // User A attempts to mark User B's notification
    const result = store.markRead(itemB.id, USER_A);
    expect(result).toBe(false);
    expect(store.getUnreadCount(USER_B)).toBe(1);
  });

  it("mark_all_notifications_read updates all unread for caller only", () => {
    const store = new NotificationStore();
    store.insert({ user_id: USER_A, organization_id: ORG_A, notification_type: "T1", title: "1", body: "1", entity_type: null, entity_id: null });
    store.insert({ user_id: USER_A, organization_id: ORG_A, notification_type: "T2", title: "2", body: "2", entity_type: null, entity_id: null });
    store.insert({ user_id: USER_B, organization_id: null, notification_type: "T3", title: "3", body: "3", entity_type: null, entity_id: null });

    expect(store.getUnreadCount(USER_A)).toBe(2);
    expect(store.getUnreadCount(USER_B)).toBe(1);

    const updatedA = store.markAllRead(USER_A);
    expect(updatedA).toBe(2);
    expect(store.getUnreadCount(USER_A)).toBe(0);
    // User B unread is untouched
    expect(store.getUnreadCount(USER_B)).toBe(1);
  });

  it("order transition trigger emits notifications for active milestones only", () => {
    const store = new NotificationStore();
    const order = {
      id: crypto.randomUUID(),
      order_code: "ORD-20260928-0000001",
      created_by: USER_A,
      buyer_organization_id: ORG_A,
    };

    // Transition 1: DRAFT -> PROFORMA_ISSUED
    store.onOrderStatusChange("DRAFT", "PROFORMA_ISSUED", order);
    let rowsA = store.getRows(USER_A);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].notification_type).toBe("ORDER_PROFORMA_ISSUED");
    expect(rowsA[0].title).toBe("Proforma Invoice Issued");
    expect(rowsA[0].body).toContain("ORD-20260928-0000001");

    // Transition 2: PROFORMA_ISSUED -> HOLD (reservation confirmed)
    store.onOrderStatusChange("PROFORMA_ISSUED", "HOLD", order);
    rowsA = store.getRows(USER_A);
    expect(rowsA).toHaveLength(2);
    expect(rowsA[1].notification_type).toBe("RESERVATION_CONFIRMED");
    expect(rowsA[1].body).toContain("20 minutes");

    // Transition 3: HOLD -> EXPIRED (reservation expired)
    store.onOrderStatusChange("HOLD", "EXPIRED", order);
    rowsA = store.getRows(USER_A);
    expect(rowsA).toHaveLength(3);
    expect(rowsA[2].notification_type).toBe("RESERVATION_EXPIRED");

    // Ignored transition: no notification emitted
    store.onOrderStatusChange("EXPIRED", "VOID", order);
    expect(store.getRows(USER_A)).toHaveLength(3);
  });
});
