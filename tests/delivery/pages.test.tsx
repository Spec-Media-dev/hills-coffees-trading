import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ORDER_SHIPMENT_STATUSES } from "@/lib/orders/validation";

/**
 * Feature 009 RUN C (T019/T020/T033) — page-level render proofs for the delivery list/detail
 * screens, mirroring `tests/orders/pages.test.tsx`'s own established mocked-render pattern. The
 * security/read boundary itself is already proven live in `tests/delivery/read.test.ts`/
 * `buyer.test.ts`/`warehouse.test.ts` — these tests prove the PAGES' own rendering/guard logic and
 * (T033) truthful state coverage across all 13 shipment statuses plus loading/empty/error/
 * unauthorized states.
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  shipments: { rows: [] as unknown[], hasMore: false },
  shipment: null as unknown,
  shipmentItems: [] as unknown[],
  orderItems: [] as unknown[],
  custody: [] as unknown[],
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/delivery/read", () => ({
  getShipmentsForOrganization: vi.fn(async () => mocks.shipments),
  getShipmentById: vi.fn(async () => mocks.shipment),
  getShipmentItems: vi.fn(async () => mocks.shipmentItems),
}));
vi.mock("@/lib/orders/read", () => ({
  getOrderItems: vi.fn(async () => mocks.orderItems),
}));
// Feature 012 RUN B (T007): a DISPUTED shipment now links to its order's dispute records.
vi.mock("@/lib/disputes/read", () => ({ listDisputesForOrder: vi.fn(async () => []) }));
vi.mock("@/lib/delivery/custody", () => ({
  getCustodyForOrderItems: vi.fn(async () => mocks.custody),
}));

afterEach(cleanup);

const buyerIdentity = {
  kind: "authenticated" as const,
  userId: "user-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: false },
};

function shipmentFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "shipment-1",
    orderId: "order-1",
    orderCode: "HC-2026-0001",
    buyerOrganizationId: "org-1",
    shipmentCode: "SHP-0001",
    status: "REQUESTED",
    deliveryMethod: "Courier",
    countryCode: "AE",
    city: "Dubai",
    addressLine: "1 Test Street",
    contactName: "Jane Buyer",
    contactPhone: "+971500000000",
    shippingFee: 0,
    currency: "USD",
    readyAt: null,
    deliveredAt: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

async function renderListPage() {
  vi.resetModules();
  const [{ default: DeliveriesPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/deliveries/page"), import("@/components/locale/locale-provider")]);
  const element = await DeliveriesPage({ searchParams: Promise.resolve({}) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderDetailPage(shipmentId = "shipment-1") {
  vi.resetModules();
  const [{ default: DeliveryDetailPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/deliveries/[shipmentId]/page"), import("@/components/locale/locale-provider")]);
  const element = await DeliveryDetailPage({ params: Promise.resolve({ shipmentId }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T019 — deliveries list page guard + state coverage", () => {
  it("anonymous identity sees the unauthorized state", async () => {
    mocks.identity = { kind: "anonymous" };
    await renderListPage();
    expect(screen.getByText("Sign in required")).toBeTruthy();
  });

  it("a non-authorized-member identity sees the forbidden state", async () => {
    mocks.identity = { ...buyerIdentity, isAuthorizedMember: false };
    await renderListPage();
    expect(screen.getByText("You do not have access")).toBeTruthy();
  });

  it("an authorized member with no shipments sees the honest empty state", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipments = { rows: [], hasMore: false };
    await renderListPage();
    expect(screen.getByText("No deliveries yet")).toBeTruthy();
  });

  it("all 13 approved shipment statuses render their exact EN label somewhere on the list", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipments = {
      rows: ORDER_SHIPMENT_STATUSES.map((status, index) => shipmentFixture({ id: `shipment-${index}`, shipmentCode: `SHP-${index}`, status })),
      hasMore: false,
    };
    await renderListPage();
    const EXPECTED_LABELS: Record<string, string> = {
      DRAFT: "Draft",
      REQUESTED: "Requested",
      CAPACITY_CONFIRMED: "Capacity confirmed",
      READY: "Ready",
      RESERVED: "Reserved",
      PICKING: "Picking",
      BOOKED: "Booked",
      DISPATCHED: "Dispatched",
      PARTIALLY_DELIVERED: "Partially delivered",
      DELIVERED: "Delivered",
      CANCELLED: "Cancelled",
      FAILED: "Failed",
      DISPUTED: "Disputed",
    };
    expect(Object.keys(EXPECTED_LABELS)).toHaveLength(ORDER_SHIPMENT_STATUSES.length);
    for (const status of ORDER_SHIPMENT_STATUSES) {
      expect(screen.getAllByText(EXPECTED_LABELS[status]!).length).toBeGreaterThan(0);
    }
  });
});

describe("T033 — suspended organization: honest state coverage", () => {
  it("a suspended (canBuy: false) organization can still VIEW its existing deliveries — spec.md's own undecided stance on in-flight progression, never blocked from viewing", async () => {
    mocks.identity = { ...buyerIdentity, organization: { ...buyerIdentity.organization, canBuy: false } };
    mocks.shipments = { rows: [shipmentFixture()], hasMore: false };
    await renderListPage();
    expect(screen.getAllByText("SHP-0001").length).toBeGreaterThan(0);
  });
  // NOTE: no distinct "suspended" StateScreen view exists for this surface — confirmed, this is NOT
  // a gap unique to Feature 009: `grep -rn 'kind="suspended"' src/app/dashboard` finds ZERO usages
  // anywhere in the current codebase. Organizational suspension is represented via `canBuy: false`,
  // which gates NEW write attempts (`requireBuyerCapableIdentity`'s existing `BUYER_NOT_CAPABLE`
  // refusal, already proven throughout `tests/delivery/buyer.test.ts`/Feature 007's own tests) —
  // never a page-level "you are suspended" panel for merely VIEWING already-existing records, since
  // spec.md's own Edge Cases explicitly leave in-flight-progression visibility "Not decided here."
  // Inventing a distinct visual state here (with no precedent anywhere else in the app) would be
  // exactly the kind of unrequested new state this run's own rules forbid.
});

describe("T020 — delivery detail page guard + state coverage", () => {
  it("a nonexistent/cross-org shipment id triggers notFound()", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = null;
    await expect(renderDetailPage()).rejects.toBeTruthy();
  });

  it("a shipment belonging to another organization also triggers notFound() (no existence leak)", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ buyerOrganizationId: "org-other" });
    await expect(renderDetailPage()).rejects.toBeTruthy();
  });

  it("a REQUESTED shipment renders code, status, address, contact, and the items table without a reason/dispute panel", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "REQUESTED" });
    mocks.shipmentItems = [{ id: "item-1", shipmentId: "shipment-1", orderItemId: "order-item-1", plannedQuantityKg: 10, deliveredQuantityKg: 0 }];
    mocks.orderItems = [{ id: "order-item-1", productNameSnapshot: "Ethiopia Yirgacheffe" }];
    mocks.custody = [];
    await renderDetailPage();
    expect(screen.getAllByText("SHP-0001").length).toBeGreaterThan(0);
    expect(screen.getByText("1 Test Street, Dubai, AE")).toBeTruthy();
    expect(screen.getByText("Jane Buyer")).toBeTruthy();
    expect(screen.getAllByText("Ethiopia Yirgacheffe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^10 kg$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Reason")).toBeNull();
  });

  it("a partial delivery is visibly distinct from a complete one — never the same 'progress' text", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "PARTIALLY_DELIVERED" });
    mocks.shipmentItems = [{ id: "item-1", shipmentId: "shipment-1", orderItemId: "order-item-1", plannedQuantityKg: 10, deliveredQuantityKg: 4 }];
    mocks.orderItems = [{ id: "order-item-1", productNameSnapshot: "Ethiopia Yirgacheffe" }];
    mocks.custody = [];
    await renderDetailPage();
    // `TableCardList` renders BOTH the desktop <table> and the mobile card list in the DOM at once
    // (CSS-hidden by breakpoint, not removed) — every cell's text legitimately appears twice.
    expect(screen.getAllByText("Partial").length).toBeGreaterThan(0);
    expect(screen.queryByText("Complete")).toBeNull();
  });

  it("a FAILED shipment shows an honest 'reason not recorded' panel — never a fabricated reason", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "FAILED" });
    mocks.shipmentItems = [];
    mocks.orderItems = [];
    mocks.custody = [];
    await renderDetailPage();
    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getByText("No reason has been recorded for this status yet.")).toBeTruthy();
  });

  it("a DISPUTED shipment shows the reason panel AND its Feature 012 dispute linkage, without implementing dispute mechanics or claiming a hold", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "DISPUTED" });
    mocks.shipmentItems = [];
    mocks.orderItems = [];
    mocks.custody = [];
    await renderDetailPage();
    expect(screen.getByText("Reason")).toBeTruthy();
    expect(screen.getByText(/This delivery's own status is Disputed/)).toBeTruthy();
    expect(screen.getByText(/does not by itself hold the delivery/)).toBeTruthy();
    expect(screen.getByText(/No dispute record on this delivery's order is visible/)).toBeTruthy();
  });

  it("a CANCELLED shipment shows the reason panel", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "CANCELLED" });
    mocks.shipmentItems = [];
    mocks.orderItems = [];
    mocks.custody = [];
    await renderDetailPage();
    expect(screen.getByText("Reason")).toBeTruthy();
  });

  it("linked custody rows render read-only from Feature 005's own DTO shape, never a recomputed figure", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "DELIVERED" });
    mocks.shipmentItems = [{ id: "item-1", shipmentId: "shipment-1", orderItemId: "order-item-1", plannedQuantityKg: 10, deliveredQuantityKg: 10 }];
    mocks.orderItems = [{ id: "order-item-1", productNameSnapshot: "Ethiopia Yirgacheffe" }];
    mocks.custody = [{ id: "alloc-1", orderItemId: "order-item-1", ownerOrganizationId: "org-1", lotId: "lot-1", warehouseId: "wh-1", warehouseLocationId: null, quantityKg: 10, releasedQuantityKg: 10, status: "DELIVERED", startedAt: null, releasedAt: null, order: null }];
    await renderDetailPage();
    expect(screen.getAllByText(/10 \/ 10 kg/).length).toBeGreaterThan(0);
  });

  it("no custody record yet renders the honest empty note, not a fabricated allocation", async () => {
    mocks.identity = buyerIdentity;
    mocks.shipment = shipmentFixture({ status: "READY" });
    mocks.shipmentItems = [];
    mocks.orderItems = [];
    mocks.custody = [];
    await renderDetailPage();
    expect(screen.getByText("No custody record is linked to this delivery yet.")).toBeTruthy();
  });
});
