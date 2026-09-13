import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 007 RUN A (T005) — page-level guard proofs via module mocks (mirrors
 * `tests/listings/manage-detail-page.test.tsx`'s own established pattern): the security/read
 * boundary itself is already proven live in `read.test.ts`/`drafts.test.ts`/`shipment.test.ts` —
 * these tests prove the PAGE's own rendering/guard logic.
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  orders: { rows: [] as unknown[], hasMore: false },
  order: null as unknown,
  items: [] as unknown[],
  shipments: [] as unknown[],
  shipmentItems: [] as unknown[],
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/orders/read", () => ({
  getOrdersForOrganization: vi.fn(async () => mocks.orders),
  getOrderById: vi.fn(async () => mocks.order),
  getOrderItems: vi.fn(async () => mocks.items),
  getOrderShipments: vi.fn(async () => mocks.shipments),
  getShipmentItems: vi.fn(async () => mocks.shipmentItems),
  // RUN B (T010): the detail page now also reads the financial snapshot + proforma (both null pre-checkout).
  getOrderFinancials: vi.fn(async () => null),
  getProforma: vi.fn(async () => null),
  // RUN C (T015/T016): payment status, status history, page-level financials.
  getPaymentStatus: vi.fn(async () => null),
  getOrderStatusHistory: vi.fn(async () => []),
  getOrderFinancialsForOrders: vi.fn(async () => new Map()),
}));

// RUN C (T016): the detail page runs lazy expiry first — mocked here to return the same order the
// read mock serves (fresh when HOLD); the real chain is proven live in `expiry.test.ts`.
vi.mock("@/lib/orders/expiry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders/expiry")>()),
  ensureHoldFresh: vi.fn(async () => {
    const order = mocks.order as { status?: string } | null;
    if (!order) return { ok: false, code: "order_not_found" };
    return { ok: true, data: { order, fresh: order.status === "HOLD", expiredNow: false } };
  }),
}));

afterEach(cleanup);

const draftItem = {
  id: "11111111-1111-4111-8111-111111111111",
  orderId: "order-1",
  offerId: "22222222-2222-4222-8222-222222222222",
  lotId: "33333333-3333-4333-8333-333333333333",
  sellerOrganizationId: "44444444-4444-4444-8444-444444444444",
  quantityKg: 3,
  unitPricePerKg: 10,
  productNameSnapshot: "Fixture Coffee",
  originNameSnapshot: null,
  variantNameSnapshot: null,
  lotCodeSnapshot: "LOT-1",
  sellerTypeSnapshot: "HILLS",
  currency: "USD",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const buyerIdentity = {
  kind: "authenticated" as const,
  userId: "user-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: false },
};

async function renderListPage() {
  vi.resetModules();
  const [{ default: OrdersPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/page"), import("@/components/locale/locale-provider")]);
  const element = await OrdersPage({ searchParams: Promise.resolve({}) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderDetailPage(orderId = "order-1") {
  vi.resetModules();
  const [{ default: OrderDetailPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/[orderId]/page"), import("@/components/locale/locale-provider")]);
  const element = await OrderDetailPage({ params: Promise.resolve({ orderId }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T005 — orders list page guard", () => {
  it("anonymous/no-organization identity sees the unauthorized state, never a listing read", async () => {
    mocks.identity = { kind: "anonymous" };
    await renderListPage();
    expect(screen.getByText("Sign in required")).toBeTruthy();
  });

  it("an authenticated but non-authorized-member identity sees the forbidden state", async () => {
    mocks.identity = { ...buyerIdentity, isAuthorizedMember: false };
    await renderListPage();
    expect(screen.getByText("You do not have access")).toBeTruthy();
  });

  it("a buy-capable authorized member sees the empty state honestly when there are no orders", async () => {
    mocks.identity = buyerIdentity;
    mocks.orders = { rows: [], hasMore: false };
    await renderListPage();
    expect(screen.getByText("No orders yet")).toBeTruthy();
  });
});

describe("T005/T006 — order detail page guard and notFound", () => {
  it("a nonexistent/cross-org order id triggers notFound() (getOrderById returned null)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = null;
    await expect(renderDetailPage()).rejects.toBeTruthy();
  });

  it("a genuine own-org DRAFT order renders its items and the add-item form", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0001", buyerOrganizationId: "org-1", status: "DRAFT", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: null, paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", correlationId: null };
    mocks.items = [];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderDetailPage();
    expect(screen.getAllByText("HC-2026-0001").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Listing ID")).toBeTruthy();
  });

  it("a DRAFT order with an item renders that item's quantity edit and remove controls (DB-OPEN-13 resolved, T004)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0003", buyerOrganizationId: "org-1", status: "DRAFT", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: null, paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", correlationId: null };
    mocks.items = [draftItem];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderDetailPage();
    expect(screen.getByRole("button", { name: "Update quantity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove item" })).toBeTruthy();
  });

  it("T026 (Phase 9) — a DRAFT order for a NON-buy-capable organization (e.g. suspended) renders NO add-item form and NO per-item edit/remove controls, only a safe explanation — never a control the server would refuse", async () => {
    mocks.identity = { ...buyerIdentity, organization: { ...buyerIdentity.organization, canBuy: false } };
    mocks.order = { id: "order-1", orderCode: "HC-2026-0005", buyerOrganizationId: "org-1", status: "DRAFT", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: null, paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", correlationId: null };
    mocks.items = [draftItem];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderDetailPage();
    expect(screen.queryByLabelText("Listing ID")).toBeNull();
    expect(screen.queryByRole("button", { name: "Update quantity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove item" })).toBeNull();
    expect(screen.getByText("Contact Hills Coffee to enable buying before starting an order.")).toBeTruthy();
  });

  it("a CONFIRMED order with an item shows NO edit/remove control (T006 — never a control that cannot succeed)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0004", buyerOrganizationId: "org-1", status: "CONFIRMED", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: "2026-01-02T00:00:00.000Z", paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", correlationId: null };
    mocks.items = [draftItem];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderDetailPage();
    expect(screen.queryByRole("button", { name: "Update quantity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove item" })).toBeNull();
    expect(screen.getByText("This order can no longer be edited.")).toBeTruthy();
  });

  it("a CONFIRMED order shows the honest not-editable note, never the add-item form (DB-OPEN-13/T006)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0002", buyerOrganizationId: "org-1", status: "CONFIRMED", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: "2026-01-02T00:00:00.000Z", paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", correlationId: null };
    mocks.items = [];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderDetailPage();
    expect(screen.getByText("This order can no longer be edited.")).toBeTruthy();
    expect(screen.queryByLabelText("Listing ID")).toBeNull();
  });
});
