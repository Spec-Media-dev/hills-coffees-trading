import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DashboardNotificationsButton } from "@/components/dashboard/topbar";
import { NotificationItem } from "@/components/notifications/notification-item";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import type { OwnNotificationDTO } from "@/lib/notifications/types";

vi.mock("@/components/locale/locale-provider", () => ({
  useLocale: () => ({
    locale: "en",
    isRtl: false,
    t: {
      account: {
        menuLabel: "Account menu",
        signOut: "Sign out",
      },
    },
    tApp: {
      notifications: {
        label: "Notifications",
        unavailable: "Notifications aren't available yet.",
        unreadCountAria: "{count} unread notifications",
      },
      dashboardAccount: {
        fallbackName: "Account",
      },
      settings: "Settings",
    },
  }),
}));

vi.mock("@/src/app/dashboard/notifications/actions", () => ({
  markNotificationReadAction: vi.fn(async () => ({ ok: true })),
  markAllNotificationsReadAction: vi.fn(async () => ({ ok: true, data: { updatedCount: 3 } })),
}));

describe("Feature 014 — Notification UI Components (T010 & T011)", () => {
  afterEach(() => {
    cleanup();
  });

  describe("DashboardNotificationsButton", () => {
    it("renders plain bell link without badge when unreadCount is 0", () => {
      render(<DashboardNotificationsButton unreadCount={0} />);
      const link = screen.getByRole("link", { name: "Notifications" });
      expect(link).toBeTruthy();
      expect(link.getAttribute("href")).toMatch(/^\/dashboard\/notifications\/?$/);
      expect(document.querySelector('[data-slot="unread-badge"]')).toBeNull();
    });

    it("renders badge with exact count and updated aria-label when unreadCount > 0", () => {
      render(<DashboardNotificationsButton unreadCount={7} />);
      const link = screen.getByRole("link", { name: "7 unread notifications" });
      expect(link).toBeTruthy();
      const badge = document.querySelector('[data-slot="unread-badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("7");
    });

    it("renders 99+ when unreadCount exceeds 99", () => {
      render(<DashboardNotificationsButton unreadCount={120} />);
      const link = screen.getByRole("link", { name: "120 unread notifications" });
      expect(link).toBeTruthy();
      const badge = document.querySelector('[data-slot="unread-badge"]');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe("99+");
    });
  });

  describe("NotificationItem", () => {
    const unreadNotification: OwnNotificationDTO = {
      id: "d0000000-0000-4000-8000-000000000001",
      notificationType: "ORDER_STATUS_PROFORMA_ISSUED",
      title: "Proforma Invoice Ready",
      body: "Please review your proforma invoice.",
      createdAt: "2026-09-29T10:00:00Z",
      readAt: null,
    };

    const readNotification: OwnNotificationDTO = {
      id: "d0000000-0000-4000-8000-000000000002",
      notificationType: "ORDER_STATUS_HOLD",
      title: "Order Placed on Hold",
      body: "Verification pending.",
      createdAt: "2026-09-29T09:00:00Z",
      readAt: "2026-09-29T09:30:00Z",
    };

    it("renders unread state with mark-as-read button and unread dot", () => {
      render(<NotificationItem notification={unreadNotification} />);
      expect(screen.getByText("Proforma Invoice Ready")).toBeTruthy();
      expect(screen.getByText("Please review your proforma invoice.")).toBeTruthy();
      expect(screen.getByRole("button", { name: /mark notification as read/i })).toBeTruthy();
      const item = screen.getByRole("listitem");
      expect(item.getAttribute("data-unread")).toBe("true");
    });

    it("renders read state without mark-as-read button", () => {
      render(<NotificationItem notification={readNotification} />);
      expect(screen.getByText("Order Placed on Hold")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /mark notification as read/i })).toBeNull();
      const item = screen.getByRole("listitem");
      expect(item.getAttribute("data-unread")).toBe("false");
    });
  });

  describe("MarkAllReadButton", () => {
    it("renders nothing when unreadCount is 0", () => {
      const { container } = render(<MarkAllReadButton unreadCount={0} />);
      expect(container.firstChild).toBeNull();
    });

    it("renders button when unreadCount > 0", () => {
      render(<MarkAllReadButton unreadCount={5} />);
      const button = screen.getByRole("button", { name: /mark all notifications as read/i });
      expect(button).toBeTruthy();
    });
  });
});
