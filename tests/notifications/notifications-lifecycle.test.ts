import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/src/app/dashboard/notifications/actions";

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

const mockRevalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

describe("Feature 014 — Notification Lifecycle Actions (T008)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentity.value = {
      kind: "authenticated",
      userId: "usr-test-1111",
      organizationId: "org-test-1111",
      roles: ["MEMBER"],
      requiresMfaStepUp: false,
    };
  });

  describe("markNotificationReadAction", () => {
    it("refuses malformed notification ID", async () => {
      const res = await markNotificationReadAction({ notificationId: "not-a-uuid" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("invalid_notification_id");
    });

    it("refuses unauthenticated caller", async () => {
      mockIdentity.value = {
        kind: "unauthenticated" as unknown as "authenticated",
        userId: "",
        organizationId: "",
        roles: [],
        requiresMfaStepUp: false,
      };

      const res = await markNotificationReadAction({
        notificationId: "d0000000-0000-4000-8000-000000000001",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("unauthorized");
    });

    it("successfully marks single notification read and revalidates paths", async () => {
      const rpcMock = vi.fn(async () => ({ data: true, error: null }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const res = await markNotificationReadAction({
        notificationId: "d0000000-0000-4000-8000-000000000001",
      });

      expect(res.ok).toBe(true);
      expect(rpcMock).toHaveBeenCalledWith("mark_notification_read", {
        p_notification_id: "d0000000-0000-4000-8000-000000000001",
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/notifications");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("accepts FormData with notificationId", async () => {
      const rpcMock = vi.fn(async () => ({ data: true, error: null }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const formData = new FormData();
      formData.set("notificationId", "d0000000-0000-4000-8000-000000000001");

      const res = await markNotificationReadAction(formData);
      expect(res.ok).toBe(true);
      expect(rpcMock).toHaveBeenCalledWith("mark_notification_read", {
        p_notification_id: "d0000000-0000-4000-8000-000000000001",
      });
    });

    it("returns error on RPC failure", async () => {
      const rpcMock = vi.fn(async () => ({
        data: null,
        error: { message: "database timeout" },
      }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const res = await markNotificationReadAction({
        notificationId: "d0000000-0000-4000-8000-000000000001",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("mark_read_failed");
    });
  });

  describe("markAllNotificationsReadAction", () => {
    it("refuses unauthenticated caller", async () => {
      mockIdentity.value = {
        kind: "unauthenticated" as unknown as "authenticated",
        userId: "",
        organizationId: "",
        roles: [],
        requiresMfaStepUp: false,
      };

      const res = await markAllNotificationsReadAction();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("unauthorized");
    });

    it("successfully marks all unread notifications and revalidates paths", async () => {
      const rpcMock = vi.fn(async () => ({ data: 5, error: null }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const res = await markAllNotificationsReadAction();
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data?.updatedCount).toBe(5);
      expect(rpcMock).toHaveBeenCalledWith("mark_all_notifications_read");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/notifications");
      expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard");
    });

    it("returns error on RPC failure", async () => {
      const rpcMock = vi.fn(async () => ({
        data: null,
        error: { message: "internal error" },
      }));
      mockSupabase.client = { rpc: rpcMock } as unknown as SupabaseClient;

      const res = await markAllNotificationsReadAction();
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("mark_all_read_failed");
    });
  });
});
