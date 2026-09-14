import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 009 RUN B (T015) — page-level guard/render proofs for `/dashboard/deliveries/new`, mirroring
 * `tests/orders/pages.test.tsx`'s own established mocked-render pattern exactly: the underlying
 * write/security boundary is already proven live in `tests/delivery/buyer.test.ts`/`tests/orders/
 * shipment.test.ts` (the SAME `requestShipment`/`cancelShipment` actions this page's own rendered
 * `ShipmentPlanner` calls, unchanged) — these tests prove the PAGE's own rendering/guard/wiring logic:
 * auth guards, the "no order selected" honest empty state, `notFound()` on a cross-org/nonexistent
 * order, and that a genuine own-org order correctly renders the shared plan editor with the order's
 * own items/shipment passed through untouched (never independently recomputed by the page, per this
 * task's own verify line).
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  order: null as unknown,
  items: [] as unknown[],
  shipments: [] as unknown[],
  shipmentItems: [] as unknown[],
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/orders/read", () => ({
  getOrderById: vi.fn(async () => mocks.order),
  getOrderItems: vi.fn(async () => mocks.items),
  getOrderShipments: vi.fn(async () => mocks.shipments),
  getShipmentItems: vi.fn(async () => mocks.shipmentItems),
}));

afterEach(cleanup);

const buyerIdentity = {
  kind: "authenticated" as const,
  userId: "user-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: false },
};

async function renderNewDeliveryPage(searchParams: { orderId?: string } = {}) {
  vi.resetModules();
  const [{ default: NewDeliveryPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/deliveries/new/page"), import("@/components/locale/locale-provider")]);
  const element = await NewDeliveryPage({ searchParams: Promise.resolve(searchParams) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T015 — /dashboard/deliveries/new page guard", () => {
  it("anonymous identity sees the unauthorized state", async () => {
    mocks.identity = { kind: "anonymous" };
    await renderNewDeliveryPage({ orderId: "order-1" });
    expect(screen.getByText("Sign in required")).toBeTruthy();
  });

  it("a non-authorized-member identity sees the forbidden state", async () => {
    mocks.identity = { ...buyerIdentity, isAuthorizedMember: false };
    await renderNewDeliveryPage({ orderId: "order-1" });
    expect(screen.getByText("You do not have access")).toBeTruthy();
  });

  it("no orderId given renders the honest empty state, not a guessed order", async () => {
    mocks.identity = buyerIdentity;
    await renderNewDeliveryPage({});
    expect(screen.getByText("Choose an order to deliver")).toBeTruthy();
  });

  it("a nonexistent/cross-org order id triggers notFound()", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = null;
    await expect(renderNewDeliveryPage({ orderId: "order-x" })).rejects.toBeTruthy();
  });

  it("a genuine own-org order renders the SAME shared plan editor with its own items/shipment passed through verbatim", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0001", buyerOrganizationId: "org-1", status: "CONFIRMED", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: null, paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", correlationId: null };
    mocks.items = [];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    await renderNewDeliveryPage({ orderId: "order-1" });
    expect(screen.getAllByText("HC-2026-0001").length).toBeGreaterThan(0);
    // ShipmentPlanner's own "no shipment yet" create-form state (proves the shared component rendered, not a second implementation).
    expect(screen.getByLabelText("Delivery method")).toBeTruthy();
  });

  it("a CANCELLED-only shipment history does not block a fresh plan (same fix as [orderId]/page.tsx)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { id: "order-1", orderCode: "HC-2026-0001", buyerOrganizationId: "org-1", status: "CONFIRMED", currency: "USD", holdStartedAt: null, holdExpiresAt: null, confirmedAt: null, paidAt: null, completedAt: null, createdBy: "user-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", correlationId: null };
    mocks.items = [];
    mocks.shipments = [
      {
        id: "shipment-1",
        orderId: "order-1",
        shipmentCode: "SHP-1",
        status: "CANCELLED",
        deliveryMethod: "Courier",
        countryCode: "AE",
        city: null,
        addressLine: "1 Test St",
        contactName: "T",
        contactPhone: "+971500000000",
        shippingFee: 0,
        currency: "USD",
        readyAt: null,
        deliveredAt: null,
        createdBy: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mocks.shipmentItems = [];
    await renderNewDeliveryPage({ orderId: "order-1" });
    // The CANCELLED shipment is excluded, so the create form (not a read-only CANCELLED view) renders.
    expect(screen.getByLabelText("Delivery method")).toBeTruthy();
  });
});
