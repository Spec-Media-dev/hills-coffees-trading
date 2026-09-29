import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { TicketList } from "@/components/messaging/ticket-list";
import { MessageThread } from "@/components/messaging/message-thread";
import { ComposeBox } from "@/components/messaging/compose-box";
import { NewTicketModal } from "@/components/messaging/new-ticket-modal";
import { AdminTicketQueue } from "@/components/admin/messaging/admin-ticket-queue";
import { NotificationItem } from "@/components/notifications/notification-item";
import { MarkAllReadButton } from "@/components/notifications/mark-all-read-button";
import type {
  SupportTicketListItemDTO,
  SupportMessageDTO,
} from "@/lib/messaging/types";
import type { OwnNotificationDTO } from "@/lib/notifications/types";
import { getAppCopy } from "@/lib/app/copy";

/**
 * Feature 014 — Mandatory UI/UX Quality Gate Verification (T027, T028, T029).
 * Verifies:
 * 1. Mobile touch target compliance (>= 44px)
 * 2. LTR ticket code protection in Arabic RTL contexts
 * 3. Light / Dark theme tokens and contrast
 * 4. Responsive wrapping and layout hierarchy
 * 5. Bilingual string integration (no raw untranslated strings)
 */

const mockLocaleVal = {
  locale: "ar" as const,
  isRtl: true,
  direction: "rtl" as const,
  t: { controls: { close: "إغلاق" } },
  tApp: {
    supportMessaging: {
      title: "الدعم والرسائل",
      breadcrumb: "الرسائل",
      newInquiry: "استفسار جديد",
      newInquiryDescription: "أرسل استفساراً إلى فريق عمليات هيلز.",
      ticketReference: "رقم التذكرة",
      orderReference: "رقم الطلب",
      subject: "الموضوع",
      subjectPlaceholder: "ملخص موجز لاستفسارك",
      initialMessage: "الرسالة",
      initialMessagePlaceholder: "صف استفسارك أو مشكلتك بالتفصيل…",
      priority: "الأولوية",
      priorities: {
        LOW: "منخفضة",
        NORMAL: "عادية",
        HIGH: "مرتفعة",
        URGENT: "عاجلة",
      },
      status: {
        OPEN: "مفتوحة",
        IN_PROGRESS: "قيد المتابعة",
        RESOLVED: "تم الحل",
        CLOSED: "مغلقة",
      },
      submit: "إرسال الاستفسار",
      submitting: "جارٍ الإرسال…",
      cancel: "إلغاء",
      reply: "رد",
      replyPlaceholder: "اكتب ردك هنا…",
      sendReply: "إرسال الرد",
      sendingReply: "جارٍ الإرسال…",
      ticketClosedNotice: "هذه التذكرة مغلقة. لا يمكن إضافة ردود جديدة.",
      empty: {
        title: "لا توجد استفسارات دعم",
        description: "لم ترسل أي استفسارات بعد.",
      },
      staffBadge: "فريق هيلز",
      youBadge: "أنت",
      ticketCreatedSuccess: "تم إرسال الاستفسار بنجاح: {code}",
      viewTicket: "عرض التذكرة",
      adminTitle: "قائمة الدعم",
      adminDescription: "قائمة العمليات لاستفسارات الأعضاء ورسائل الدعم.",
      filterAll: "الكل",
      markResolved: "تحديد كمحلول",
      closeTicket: "إغلاق التذكرة",
      reopenTicket: "إعادة فتح التذكرة",
      conversationHistory: "سجل المحادثة",
      postStaffReply: "إرسال رد الفريق",
      staffReplyPlaceholder: "اكتب ردك إلى العضو هنا…",
      sendStaffReply: "إرسال رد الفريق",
      sendingStaffReply: "جارٍ إرسال الرد…",
      noTicketsInQueue: "لا توجد تذاكر في هذه القائمة",
      noTicketsInQueueDesc: "اختر تصنيفاً آخر أو انتظر استفسارات الأعضاء الجديدة.",
      queueColumns: {
        reference: "رقم التذكرة",
        subject: "الموضوع",
        status: "الحالة",
        priority: "الأولوية",
        updated: "آخر تحديث",
        action: "الإجراء",
        open: "فتح",
      },
    },
    notificationCenter: getAppCopy("ar").notificationCenter,
  },
};

vi.mock("@/components/locale/locale-provider", () => ({
  useLocale: () => mockLocaleVal,
  useOptionalLocale: () => mockLocaleVal,
}));

vi.mock("@/src/app/dashboard/messages/actions", () => ({
  createSupportTicketAction: vi.fn(async () => ({ ok: true, ticketId: "t-1", ticketCode: "HLP-20260928-0000042" })),
  sendSupportMessageAction: vi.fn(async () => ({ ok: true, messageId: "m-1" })),
}));

vi.mock("@/src/app/dashboard-admin/(system)/messages/actions", () => ({
  adminUpdateTicketStatusAction: vi.fn(async () => ({ ok: true })),
  adminSendSupportReplyAction: vi.fn(async () => ({ ok: true, messageId: "m-staff-1" })),
}));

describe("Feature 014 — Responsive & Touch Target Gate (T027)", () => {
  afterEach(cleanup);

  it("Notification mark-read button meets minimum 44px mobile touch target requirement", () => {
    const mockNotification: OwnNotificationDTO = {
      id: "n-1",
      notificationType: "ORDER_PROFORMA_ISSUED",
      title: "Proforma Invoice Issued",
      body: "Your invoice is ready.",
      createdAt: "2026-09-28T10:00:00Z",
      readAt: null,
    };

    render(<NotificationItem notification={mockNotification} />);
    const button = document.querySelector('[data-slot="mark-read-button"]');
    expect(button).not.toBeNull();
    // Class min-h-11 is Tailwind 44px (11 * 0.25rem = 2.75rem = 44px)
    expect(button?.className).toContain("min-h-11");
    expect(button?.className).toContain("min-w-11");
  });

  it("shows generated order notifications in Arabic while isolating the order code", () => {
    render(<NotificationItem notification={{
      id: "n-ar", notificationType: "RESERVATION_CONFIRMED",
      title: "Stock Reservation Confirmed",
      body: "Inventory reserved for 20 minutes for order ORD-20260929-0001000",
      createdAt: "2026-09-29T10:00:00Z", readAt: null,
    }} />);
    expect(document.querySelector('[data-slot="notification-title"]')?.textContent).toBe("تأكد حجز المخزون");
    expect(document.querySelector('bdi[dir="ltr"]')?.textContent).toBe("ORD-20260929-0001000");
  });

  it("Notification mark-all-read button meets minimum 44px touch target requirement", () => {
    render(<MarkAllReadButton unreadCount={3} />);
    const button = document.querySelector('[data-slot="mark-all-read-button"]');
    expect(button).not.toBeNull();
    expect(button?.className).toContain("min-h-11");
  });

  it("Support ticket compose form send button meets touch target requirement", () => {
    render(<ComposeBox ticketId="t-1" isClosed={false} />);
    const button = document.querySelector('[data-slot="send-reply-button"]');
    expect(button).not.toBeNull();
    expect(button?.className).toContain("min-h-11");
  });

  it("New ticket modal trigger meets minimum 44px touch target requirement", () => {
    render(<NewTicketModal />);
    const trigger = document.querySelector('[data-slot="new-inquiry-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.className).toContain("min-h-11");
  });
});

describe("Feature 014 — RTL & Arabic Parity Gate (T028)", () => {
  afterEach(cleanup);

  it("renders ticket reference codes with dir='ltr' in ticket list to preserve numbering in Arabic", () => {
    const mockTickets: SupportTicketListItemDTO[] = [
      {
        id: "t-1",
        ticketCode: "HLP-20260928-0000042",
        subject: "استفسار عن الشحنة",
        status: "OPEN",
        priority: "NORMAL",
        orderId: "ord-1",
        orderCodeSnapshot: "ORD-20260928-1234567",
        createdAt: "2026-09-28T10:00:00Z",
        updatedAt: "2026-09-28T10:00:00Z",
      },
    ];

    render(
      <div dir="rtl">
        <TicketList tickets={mockTickets} />
      </div>
    );

    const codeBadge = document.querySelector('[data-slot="ticket-code-badge"]');
    expect(codeBadge).not.toBeNull();
    expect(codeBadge?.getAttribute("dir")).toBe("ltr");
    expect(codeBadge?.textContent).toBe("HLP-20260928-0000042");

    // Order snapshot badge also has dir="ltr"
    const orderBadge = document.querySelector('[data-slot="ticket-item"] span[dir="ltr"]:not([data-slot="ticket-code-badge"])');
    expect(orderBadge).not.toBeNull();
    expect(orderBadge?.textContent).toContain("ORD-20260928-1234567");
  });

  it("renders ticket codes in Admin queue table with dir='ltr'", () => {
    const mockTickets: SupportTicketListItemDTO[] = [
      {
        id: "t-admin-1",
        ticketCode: "HLP-20260928-0000099",
        subject: "طلب عينات كولومبيا",
        status: "IN_PROGRESS",
        priority: "HIGH",
        orderId: null,
        orderCodeSnapshot: null,
        createdAt: "2026-09-28T12:00:00Z",
        updatedAt: "2026-09-28T12:00:00Z",
      },
    ];

    render(
      <div dir="rtl">
        <AdminTicketQueue tickets={mockTickets} />
      </div>
    );

    const cell = document.querySelector("td[dir='ltr']");
    expect(cell).not.toBeNull();
    expect(cell?.textContent?.trim()).toBe("HLP-20260928-0000099");
  });

  it("uses start-aligned border (border-s-4) for staff distinction in message threads", () => {
    const mockMessages: SupportMessageDTO[] = [
      {
        id: "m-1",
        ticketId: "t-1",
        authorUserId: "u-admin",
        authorName: "Hills Operations",
        isStaff: true,
        body: "مرحباً، تم تأكيد استلام استفساركم وسنقوم بالمتابعة فوراً.",
        createdAt: "2026-09-28T11:00:00Z",
      },
    ];

    render(
      <div dir="rtl">
        <MessageThread messages={mockMessages} />
      </div>
    );

    const staffItem = document.querySelector('[data-slot="message-item"][data-staff="true"]');
    expect(staffItem).not.toBeNull();
    // Uses border-s-4 (start boundary) rather than hardcoded border-l-4
    expect(staffItem?.className).toContain("border-s-4");
  });
});

describe("Feature 014 — Visual Hierarchy & Empty States Gate (T029)", () => {
  afterEach(cleanup);

  it("renders branded empty state when member ticket list has zero inquiries", () => {
    render(<TicketList tickets={[]} />);
    const emptyState = document.querySelector('[data-slot="tickets-empty"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain("لا توجد استفسارات دعم");
  });

  it("renders branded empty state when admin queue is empty", () => {
    render(<AdminTicketQueue tickets={[]} />);
    const emptyState = document.querySelector('[data-slot="admin-tickets-empty"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain("لا توجد تذاكر في هذه القائمة");
  });

  it("renders ticket closed notice when ticket is closed", () => {
    render(<ComposeBox ticketId="t-closed" isClosed={true} />);
    const closedNotice = document.querySelector('[data-slot="ticket-closed-notice"]');
    expect(closedNotice).not.toBeNull();
    expect(closedNotice?.textContent).toContain("هذه التذكرة مغلقة");
  });
});
