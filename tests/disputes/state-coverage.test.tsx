import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditAccessNotice } from "@/components/audit/audit-access-notice";
import { HistoryTimeline } from "@/components/audit/history-timeline";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { getAppCopy } from "@/lib/app/copy";
import { DISPUTE_STATUSES } from "@/lib/disputes/types";

/**
 * Feature 012 RUN D — T023: every CURRENT Feature 012 surface renders each state that applies to it,
 * and "nothing here" is always distinguishable from "not permitted" (FR-015, FR-016).
 *
 * The real Server Components are rendered with their read layers mocked, so each state is driven
 * exactly (the security boundaries behind them are proven live elsewhere: role-restriction,
 * isolation, run-b-live, audit/history). Loading, error and the generic not-found come from the shared
 * `/dashboard` boundaries every Feature 012 route inherits; the dispute detail has its own not-found.
 */

const en = getAppCopy("en");
const ar = getAppCopy("ar");

const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  disputes: { rows: [] as unknown[], hasMore: false, page: 0, pageSize: 25 },
  dispute: null as unknown,
  evidence: [] as unknown[],
  orders: { rows: [] as unknown[], hasMore: false },
  notifications: { rows: [] as unknown[], hasMore: false, page: 0, pageSize: 25 } as unknown,
  preferences: [] as unknown,
}));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/disputes/read", () => ({
  listDisputesForMember: vi.fn(async () => mocks.disputes),
  getDisputeForMember: vi.fn(async () => mocks.dispute),
  getDisputeEvidenceForMember: vi.fn(async () => mocks.evidence),
}));
vi.mock("@/lib/orders/read", () => ({ getOrdersForOrganization: vi.fn(async () => mocks.orders) }));
vi.mock("@/lib/notifications/read", () => ({ listOwnNotifications: vi.fn(async () => mocks.notifications) }));
vi.mock("@/lib/notifications/preferences", () => ({ readOwnNotificationPreferences: vi.fn(async () => mocks.preferences), saveOwnNotificationPreferences: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

const member = {
  kind: "authenticated" as const,
  userId: "a0000000-0000-4000-8000-000000000001",
  isAuthorizedMember: true,
  requiresMfaStepUp: false,
  organization: { organizationId: "o1", displayName: "Org", memberRole: "OWNER", canBuy: true, canSell: false },
};
const noOrganization = { ...member, organization: null };
/** `is_authorized_member()` is false for a BLOCKED user and for a SUSPENDED / not-yet-approved organization. */
const blockedOrSuspended = { ...member, isAuthorizedMember: false };

const dispute = (status: string) => ({
  id: "12000000-0000-4000-8000-0000000000aa",
  orderId: "05000000-0000-4000-8000-00000000000b",
  orderCode: "F005-FIX-ORDER-A",
  orderStatus: "PAID",
  status,
  openedAt: "2026-09-19T00:00:00Z",
  resolvedAt: status === "RESOLVED" || status === "REJECTED" || status === "CLOSED" ? "2026-09-19T01:00:00Z" : null,
  updatedAt: "2026-09-19T01:00:00Z",
  correlationId: "ef7040e3-86eb-494a-a2d5-cffb06b93dba",
  raisedByYou: true,
  reason: "Bags arrived torn.",
  resolution: status === "RESOLVED" || status === "REJECTED" || status === "CLOSED" ? "Credit agreed." : null,
});

async function renderServer(element: Promise<React.ReactElement>) {
  return render(<LocaleProvider>{await element}</LocaleProvider>);
}
const stateOf = (container: HTMLElement) => container.querySelector("[data-state-screen]")?.getAttribute("data-state-screen") ?? null;

beforeEach(() => {
  mocks.identity = member;
  mocks.disputes = { rows: [], hasMore: false, page: 0, pageSize: 25 };
  mocks.dispute = null;
  mocks.evidence = [];
  mocks.orders = { rows: [{ id: "05000000-0000-4000-8000-00000000000b", orderCode: "F005-FIX-ORDER-A", status: "PAID" }], hasMore: false };
  mocks.notifications = { rows: [], hasMore: false, page: 0, pageSize: 25 };
  mocks.preferences = [];
});
afterEach(() => cleanup());

describe("Shared boundaries every Feature 012 route inherits", () => {
  it("loading renders the loading state screen", async () => {
    const { default: Loading } = await import("@/src/app/dashboard/loading");
    expect(stateOf(render(<Loading />).container)).toBe("loading");
  });

  it("error renders the generic error state and never the raw error message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { default: DashboardError } = await import("@/src/app/dashboard/error");
    const { container } = render(<DashboardError error={Object.assign(new Error('relation "disputes" violates row-level security'), { digest: "d1" })} reset={() => undefined} />);
    expect(stateOf(container)).toBe("error");
    expect(container.textContent).not.toMatch(/violates|row-level|disputes/);
    expect(JSON.stringify(spy.mock.calls)).not.toMatch(/violates/);
    spy.mockRestore();
  });
});

describe("Disputes list — /dashboard/disputes", () => {
  const load = async () => (await import("@/src/app/dashboard/disputes/page")).default({ searchParams: Promise.resolve({}) });

  it("unauthorized (no acting organization) and forbidden (blocked user / suspended organization) are explicit states, not an empty list", async () => {
    mocks.identity = noOrganization;
    expect(stateOf((await renderServer(load())).container)).toBe("unauthorized");
    cleanup();
    mocks.identity = blockedOrSuspended;
    const forbidden = (await renderServer(load())).container;
    expect(stateOf(forbidden)).toBe("forbidden");
    expect(forbidden.querySelector('[data-slot="empty-state"]')).toBeNull();
  });

  it("empty is an honest 'no disputes' state (with the raise form), distinct from forbidden", async () => {
    const { container } = await renderServer(load());
    expect(stateOf(container)).toBeNull();
    expect(container.querySelector('[data-slot="empty-state"]')?.textContent).toContain(en.disputes.list.empty.title);
    expect(container.querySelector('[data-slot="empty-state"]')?.textContent).toContain(ar.disputes.list.empty.title);
    expect(container.querySelector("form textarea")).not.toBeNull();
  });

  it("an organization with no orders is told why it cannot raise one (no form offered)", async () => {
    mocks.orders = { rows: [], hasMore: false };
    const { container } = await renderServer(load());
    expect(container.querySelector('[data-slot="dispute-no-orders"]')?.textContent).toContain(en.disputes.raise.noOrders.title);
    expect(container.querySelector("form textarea")).toBeNull();
  });

  it("rows in all six statuses render their exact textual labels", async () => {
    mocks.disputes = { rows: DISPUTE_STATUSES.map((status, index) => ({ ...dispute(status), id: `12000000-0000-4000-8000-00000000000${index}` })), hasMore: false, page: 0, pageSize: 25 };
    const { container } = await renderServer(load());
    const badges = [...container.querySelectorAll('[data-slot="dispute-status-badge"]')];
    for (const status of DISPUTE_STATUSES) {
      const badge = badges.find((node) => node.getAttribute("data-status") === status);
      expect(badge?.querySelector('[lang="en"]')?.textContent, status).toBe(en.disputes.status[status]);
      expect(badge?.querySelector('[lang="ar"]')?.textContent, status).toBe(ar.disputes.status[status]);
    }
  });
});

describe("Dispute detail — /dashboard/disputes/[disputeId]", () => {
  const load = async () => (await import("@/src/app/dashboard/disputes/[disputeId]/page")).default({ params: Promise.resolve({ disputeId: "12000000-0000-4000-8000-0000000000aa" }) });

  it("unauthorized, forbidden and not-found (missing OR another organization's) are distinct explicit states", async () => {
    mocks.identity = noOrganization;
    expect(stateOf((await renderServer(load())).container)).toBe("unauthorized");
    cleanup();
    mocks.identity = blockedOrSuspended;
    expect(stateOf((await renderServer(load())).container)).toBe("forbidden");
    cleanup();
    mocks.identity = member;
    mocks.dispute = null;
    await expect(load()).rejects.toThrow("NEXT_NOT_FOUND");
    const { default: NotFound } = await import("@/src/app/dashboard/disputes/[disputeId]/not-found");
    const { container } = render(<NotFound />);
    expect(container.textContent).toContain(en.disputes.detail.notFound.title);
    expect(container.textContent).toContain(ar.disputes.detail.notFound.title);
    expect(container.querySelector('a[href="/dashboard/disputes"]')?.getAttribute("role")).toBeNull();
  });

  it("each of the six statuses renders its label and its own honest description; FROZEN says record-only", async () => {
    for (const status of DISPUTE_STATUSES) {
      mocks.dispute = dispute(status);
      const { container } = await renderServer(load());
      expect(container.querySelector('[data-slot="dispute-status-badge"]')?.getAttribute("data-status"), status).toBe(status);
      expect(container.querySelector('[data-slot="dispute-status-description"] [lang="en"]')?.textContent, status).toBe(en.disputes.statusDescription[status]);
      const hasResolution = Boolean(container.querySelector('[data-slot="dispute-resolution"]'));
      expect(hasResolution, status).toBe(status === "RESOLVED" || status === "REJECTED" || status === "CLOSED");
      cleanup();
    }
    expect(en.disputes.statusDescription.FROZEN).toMatch(/dispute record only/);
  });

  it("evidence: empty, text-only and file-reference rows; the DB-BLOCK-01 limitation is shown and no upload control exists", async () => {
    mocks.dispute = dispute("OPEN");
    mocks.evidence = [];
    let { container } = await renderServer(load());
    expect(container.querySelector('[data-slot="evidence-empty"]')?.textContent).toContain(en.disputes.evidence.empty);
    expect(container.querySelector('[data-slot="evidence-files-unavailable"]')?.getAttribute("data-blocker")).toBe("DB-BLOCK-01");
    expect(container.querySelector('input[type="file"]')).toBeNull();
    cleanup();

    mocks.evidence = [
      { id: "e1", disputeId: "d", note: "Text-only note", hasFileReference: false, uploadedBy: member.userId, createdAt: "2026-09-19T00:00:00Z" },
      { id: "e2", disputeId: "d", note: null, hasFileReference: true, uploadedBy: "someone-else", createdAt: "2026-09-19T01:00:00Z" },
    ];
    ({ container } = await renderServer(load()));
    const items = [...container.querySelectorAll('[data-slot="evidence-item"]')];
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain(en.disputes.evidence.typeNote);
    expect(items[0]!.textContent).toContain(en.disputes.evidence.uploadedByYou);
    expect(items[1]!.textContent).toContain(en.disputes.evidence.typeFileReference);
    expect(items[1]!.querySelector("a, button")).toBeNull();
    expect(container.textContent).not.toContain("someone-else");
  });
});

describe("Notifications — /dashboard/notifications", () => {
  const load = async () => (await import("@/src/app/dashboard/notifications/page")).default();

  it("unauthorized / forbidden are explicit; the empty state is honest and carries the DB-BLOCK-04 limitation", async () => {
    mocks.identity = noOrganization;
    expect(stateOf((await renderServer(load())).container)).toBe("unauthorized");
    cleanup();
    mocks.identity = blockedOrSuspended;
    expect(stateOf((await renderServer(load())).container)).toBe("forbidden");
    cleanup();
    mocks.identity = member;
    const { container } = await renderServer(load());
    expect(container.querySelector('[data-slot="notifications-empty"]')?.textContent).toContain(en.notificationCenter.empty.title);
    expect(container.querySelector('[data-slot="notification-limitation"]')?.getAttribute("data-blocker")).toBe("DB-BLOCK-04");
    expect(container.textContent).toContain(en.notificationCenter.limitation.readState);
  });

  it("real rows render as they are — no read/unread styling, no count, no mark-read control", async () => {
    mocks.notifications = { rows: [{ id: "n1", notificationType: "ORDER_UPDATES", title: "Order confirmed", body: "Your order was confirmed.", createdAt: "2026-09-19T00:00:00Z" }], hasMore: false, page: 0, pageSize: 25 };
    const { container } = await renderServer(load());
    expect(container.querySelectorAll('[data-slot="notification-item"]')).toHaveLength(1);
    expect(container.querySelector("button")).toBeNull();
    // The limitation notice itself SAYS there is no read/unread state; the list must not HAVE one.
    const list = container.querySelector('[data-slot="notification-list"]')!;
    expect(list.textContent).not.toMatch(/unread|mark (all )?as read/i);
    expect(list.querySelector("[data-read], [data-unread], [aria-current]")).toBeNull();
  });
});

describe("Notification preferences — /dashboard/notifications/preferences", () => {
  const load = async () => (await import("@/src/app/dashboard/notifications/preferences/page")).default();
  const cells = (stored: boolean) => ["ORDER_UPDATES", "PAYMENT_INVOICES", "SHIPMENT_UPDATES", "KYB_DOCUMENTS"].flatMap((type) => ["EMAIL", "SMS", "WHATSAPP"].map((channel) => ({ type, channel, enabled: stored && channel === "EMAIL", stored })));

  it("unauthorized / forbidden are explicit", async () => {
    mocks.identity = noOrganization;
    expect(stateOf((await renderServer(load())).container)).toBe("unauthorized");
    cleanup();
    mocks.identity = blockedOrSuspended;
    expect(stateOf((await renderServer(load())).container)).toBe("forbidden");
  });

  it("loaded: 'nothing saved yet' is stated only when no row exists; twelve labelled checkboxes; the no-delivery note is always shown", async () => {
    mocks.preferences = cells(false);
    let { container } = await renderServer(load());
    expect(container.querySelector('[data-slot="preferences-not-saved"]')).not.toBeNull();
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(12);
    for (const input of container.querySelectorAll('input[type="checkbox"]')) expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    expect(container.querySelector('[data-slot="preferences-honesty"]')?.textContent).toContain(en.notificationPreferences.honesty);
    cleanup();
    mocks.preferences = cells(true);
    ({ container } = await renderServer(load()));
    expect(container.querySelector('[data-slot="preferences-not-saved"]')).toBeNull();
    expect([...container.querySelectorAll('input[type="checkbox"]')].filter((input) => (input as HTMLInputElement).checked)).toHaveLength(4);
  });

  it("a validation error and a signed-out save each map to their own localized message (never raw text)", async () => {
    const { saveNotificationPreferencesAction } = await import("@/src/app/dashboard/notifications/preferences/actions");
    const bad = new FormData();
    bad.set("ORDER_UPDATES__EMAIL", "yes");
    await expect(saveNotificationPreferencesAction(undefined, bad)).resolves.toEqual({ ok: false, code: "validation_error" });
    mocks.identity = { kind: "anonymous" };
    const good = new FormData();
    for (const type of ["ORDER_UPDATES", "PAYMENT_INVOICES", "SHIPMENT_UPDATES", "KYB_DOCUMENTS"]) for (const channel of ["EMAIL", "SMS", "WHATSAPP"]) good.set(`${type}__${channel}`, "false");
    await expect(saveNotificationPreferencesAction(undefined, good)).resolves.toEqual({ ok: false, code: "notification_preferences_not_capable" });
    for (const key of ["validation", "notCapable", "failed"] as const) expect(ar.notificationPreferences[key]).not.toBe(en.notificationPreferences[key]);
  });
});

describe("History / audit", () => {
  it("visible history vs genuinely empty history are distinct; an entry shows only stored fields", () => {
    let { container } = render(<HistoryTimeline labelledBy="h" entries={[{ id: "1", occurredAt: "2026-09-19T00:00:00Z", title: "Draft → Confirmed", actor: "not-recorded" }]} />);
    expect(container.querySelectorAll('[data-slot="history-entry"]')).toHaveLength(1);
    expect(container.querySelector('[data-slot="history-actor"]')?.textContent).toContain(en.history.byNotRecorded);
    cleanup();
    ({ container } = render(<HistoryTimeline labelledBy="h" entries={[]} />));
    expect(container.querySelector('[data-slot="history-empty"]')?.textContent).toContain(en.history.empty);
    expect(container.querySelector('[data-slot="history-timeline"]')).toBeNull();
  });

  it("not-permitted history is never shown as an empty log: the auditor gets the DB-OPEN-06 explanation, other roles 'not permitted'", () => {
    let { container } = render(<AuditAccessNotice access={{ status: "limited", blocker: "DB-OPEN-06", audience: "auditor" }} />);
    expect(container.textContent).toContain(en.auditAccess.auditorLimitation);
    expect(container.querySelector("ol, table")).toBeNull();
    cleanup();
    ({ container } = render(<AuditAccessNotice access={{ status: "not-permitted" }} />));
    expect(container.textContent).toContain(en.auditAccess.notPermitted);
  });
});
