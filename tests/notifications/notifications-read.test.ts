import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOwnNotification,
  getUnreadNotificationCount,
  listOwnNotifications,
  NotificationReadError,
} from "@/lib/notifications/read";
import { NOTIFICATION_LIMITATIONS } from "@/lib/notifications/limitations";

const mockIdentity = vi.hoisted(() => ({
  value: {
    kind: "authenticated" as const,
    userId: "usr-test-1111",
    organizationId: "org-test-1111",
    roles: ["MEMBER"],
    requiresMfaStepUp: false,
  },
}));

vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => mockIdentity.value),
}));

const mockSupabase = vi.hoisted(() => ({
  client: null as unknown as SupabaseClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabase.client),
}));

describe("Feature 014 — Notification Read Layer (T007)", () => {
  beforeEach(() => {
    mockIdentity.value = {
      kind: "authenticated",
      userId: "usr-test-1111",
      organizationId: "org-test-1111",
      roles: ["MEMBER"],
      requiresMfaStepUp: false,
    };
  });

  it("exposes canMarkRead = true in limitations", () => {
    expect(NOTIFICATION_LIMITATIONS.canMarkRead).toBe(true);
    expect(NOTIFICATION_LIMITATIONS.deliveryChannelsApproved).toBe(false);
  });

  it("listOwnNotifications maps read_at to readAt and filters by authenticated user", async () => {
    const rawRows = [
      {
        id: "d0000000-0000-4000-8000-000000000001",
        user_id: "usr-test-1111",
        notification_type: "ORDER_STATUS_PROFORMA_ISSUED",
        title: "Proforma Issued",
        body: "Your proforma invoice is ready.",
        created_at: "2026-09-29T10:00:00Z",
        read_at: null,
      },
      {
        id: "d0000000-0000-4000-8000-000000000002",
        user_id: "usr-test-1111",
        notification_type: "ORDER_STATUS_HOLD",
        title: "Order on Hold",
        body: "Your order is on hold pending review.",
        created_at: "2026-09-29T09:00:00Z",
        read_at: "2026-09-29T09:30:00Z",
      },
    ];

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.range = vi.fn(async () => ({ data: rawRows, error: null }));

    mockSupabase.client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient;

    const result = await listOwnNotifications({ page: 0, pageSize: 25 });
    expect(result).not.toBeNull();
    expect(result?.rows).toHaveLength(2);
    expect(result?.rows[0]).toEqual({
      id: "d0000000-0000-4000-8000-000000000001",
      notificationType: "ORDER_STATUS_PROFORMA_ISSUED",
      title: "Proforma Issued",
      body: "Your proforma invoice is ready.",
      createdAt: "2026-09-29T10:00:00Z",
      readAt: null,
    });
    expect(result?.rows[1]?.readAt).toBe("2026-09-29T09:30:00Z");
    expect(builder.select).toHaveBeenCalledWith(
      "id, user_id, notification_type, title, body, created_at, read_at"
    );
  });

  it("getOwnNotification returns single DTO with readAt", async () => {
    const rawRow = {
      id: "d0000000-0000-4000-8000-000000000001",
      user_id: "usr-test-1111",
      notification_type: "ORDER_STATUS_PROFORMA_ISSUED",
      title: "Proforma Issued",
      body: "Your proforma invoice is ready.",
      created_at: "2026-09-29T10:00:00Z",
      read_at: "2026-09-29T10:05:00Z",
    };

    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.maybeSingle = vi.fn(async () => ({ data: rawRow, error: null }));

    mockSupabase.client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient;

    const result = await getOwnNotification("d0000000-0000-4000-8000-000000000001");
    expect(result).toEqual({
      id: "d0000000-0000-4000-8000-000000000001",
      notificationType: "ORDER_STATUS_PROFORMA_ISSUED",
      title: "Proforma Issued",
      body: "Your proforma invoice is ready.",
      createdAt: "2026-09-29T10:00:00Z",
      readAt: "2026-09-29T10:05:00Z",
    });
  });

  it("getUnreadNotificationCount calls rpc('get_unread_notification_count')", async () => {
    const rpcMock = vi.fn(async () => ({ data: 4, error: null }));
    mockSupabase.client = {
      rpc: rpcMock,
    } as unknown as SupabaseClient;

    const count = await getUnreadNotificationCount();
    expect(count).toBe(4);
    expect(rpcMock).toHaveBeenCalledWith("get_unread_notification_count");
  });

  it("getUnreadNotificationCount returns 0 for unauthenticated callers without DB call", async () => {
    mockIdentity.value = {
      kind: "unauthenticated" as unknown as "authenticated",
      userId: "",
      organizationId: "",
      roles: [],
      requiresMfaStepUp: false,
    };
    const rpcMock = vi.fn();
    mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

    const count = await getUnreadNotificationCount();
    expect(count).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("listOwnNotifications throws NotificationReadError on database failure", async () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = vi.fn(chain);
    builder.eq = vi.fn(chain);
    builder.order = vi.fn(chain);
    builder.range = vi.fn(async () => ({ data: null, error: { message: "connection error" } }));

    mockSupabase.client = {
      from: vi.fn(() => builder),
    } as unknown as SupabaseClient;

    await expect(listOwnNotifications()).rejects.toThrow(NotificationReadError);
  });
});
