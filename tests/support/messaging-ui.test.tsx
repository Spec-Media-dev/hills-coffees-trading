import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TicketList } from "@/components/messaging/ticket-list";
import { MessageThread } from "@/components/messaging/message-thread";
import { ComposeBox } from "@/components/messaging/compose-box";
import { TicketStatusPill } from "@/components/messaging/ticket-status-pill";
import type { SupportTicketListItemDTO, SupportMessageDTO } from "@/lib/messaging/types";

vi.mock("@/components/locale/locale-provider", () => ({
  useLocale: () => ({
    locale: "en",
    isRtl: false,
    t: {},
    tApp: {
      supportMessaging: {
        title: "Support & Messages",
        breadcrumb: "Messages",
        status: {
          OPEN: "Open",
          IN_PROGRESS: "In Progress",
          RESOLVED: "Resolved",
          CLOSED: "Closed",
        },
        staffBadge: "Hills Staff",
        youBadge: "You",
        reply: "Reply",
        sendReply: "Send Reply",
        sendingReply: "Sending…",
        ticketClosedNotice: "This ticket is closed. New replies cannot be added.",
        empty: {
          title: "No support inquiries",
          description: "You have not submitted any inquiries yet.",
        },
      },
    },
  }),
}));

vi.mock("@/src/app/dashboard/messages/actions", () => ({
  sendSupportMessageAction: vi.fn(async () => ({ ok: true, messageId: "m1", createdAt: "2026-09-29T10:00:00Z" })),
}));

describe("Feature 014 — Support Messaging UI Components (T018)", () => {
  afterEach(() => {
    cleanup();
  });

  describe("TicketStatusPill", () => {
    it.each(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const)(
      "renders status %s with data-status attribute",
      (status) => {
        render(<TicketStatusPill status={status} />);
        const pill = document.querySelector(`[data-slot="ticket-status-pill"][data-status="${status}"]`);
        expect(pill).not.toBeNull();
      }
    );
  });

  describe("TicketList", () => {
    const mockTickets: SupportTicketListItemDTO[] = [
      {
        id: "t-001",
        ticketCode: "HLP-20260928-0001001",
        orderId: "ord-1",
        orderCodeSnapshot: "ORD-20260928-0001",
        subject: "Delivery inquiry for green coffee lot",
        status: "OPEN",
        priority: "NORMAL",
        createdAt: "2026-09-28T10:00:00Z",
        updatedAt: "2026-09-28T10:00:00Z",
      },
    ];

    it("displays HLP ticketCode prominently and never displays raw UUID", () => {
      render(<TicketList tickets={mockTickets} />);
      const codeBadge = document.querySelector('[data-slot="ticket-code-badge"]');
      expect(codeBadge).not.toBeNull();
      expect(codeBadge?.textContent).toBe("HLP-20260928-0001001");
      expect(screen.getByText("Delivery inquiry for green coffee lot")).toBeTruthy();
      expect(screen.getByText("ORD-20260928-0001")).toBeTruthy();
      expect(screen.queryByText("t-001")).toBeNull();
    });

    it("renders empty state when ticket list is empty", () => {
      render(<TicketList tickets={[]} />);
      expect(document.querySelector('[data-slot="tickets-empty"]')).not.toBeNull();
    });
  });

  describe("MessageThread", () => {
    const mockMessages: SupportMessageDTO[] = [
      {
        id: "msg-1",
        ticketId: "t-001",
        authorUserId: "user-1",
        authorName: "Alice",
        isStaff: false,
        body: "Hello, when will this lot be shipped?",
        createdAt: "2026-09-28T10:05:00Z",
      },
      {
        id: "msg-2",
        ticketId: "t-001",
        authorUserId: "staff-1",
        authorName: "Hills Operations",
        isStaff: true,
        body: "Hello Alice, the shipment is scheduled for tomorrow.",
        createdAt: "2026-09-28T10:30:00Z",
      },
    ];

    it("renders message bubbles with distinct staff reply indicators", () => {
      render(<MessageThread messages={mockMessages} />);
      const items = document.querySelectorAll('[data-slot="message-item"]');
      expect(items.length).toBe(2);

      // First message is member
      expect(items[0]?.getAttribute("data-staff")).toBe("false");
      expect(items[0]?.textContent).toContain("Hello, when will this lot be shipped?");

      // Second message is staff
      expect(items[1]?.getAttribute("data-staff")).toBe("true");
      expect(items[1]?.textContent).toContain("the shipment is scheduled for tomorrow");
      expect(items[1]?.querySelector('[data-slot="staff-badge"]')).not.toBeNull();
    });
  });

  describe("ComposeBox", () => {
    it("renders compose textarea and send button when ticket is open", () => {
      render(<ComposeBox ticketId="t-001" isClosed={false} />);
      expect(document.querySelector("textarea#reply-body")).not.toBeNull();
      expect(document.querySelector('[data-slot="send-reply-button"]')).not.toBeNull();
      expect(document.querySelector('[data-slot="ticket-closed-notice"]')).toBeNull();
    });

    it("renders ticket closed notice and no textarea when ticket is closed", () => {
      render(<ComposeBox ticketId="t-001" isClosed={true} />);
      expect(document.querySelector('[data-slot="ticket-closed-notice"]')).not.toBeNull();
      expect(document.querySelector("textarea#reply-body")).toBeNull();
    });
  });
});
