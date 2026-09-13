import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 007 RUN B (T009/T010) — page-level proofs via module mocks (same pattern as
 * `tests/orders/pages.test.tsx`): the checkout review page shows only stored snapshots and no
 * computed total; the order detail page presents the HOLD outcome from the database rows.
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  order: null as unknown,
  items: [] as unknown[],
  shipments: [] as unknown[],
  shipmentItems: [] as unknown[],
  financials: null as unknown,
  proforma: null as unknown,
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/orders/read", () => ({
  getOrdersForOrganization: vi.fn(async () => ({ rows: [], hasMore: false })),
  getOrderById: vi.fn(async () => mocks.order),
  getOrderItems: vi.fn(async () => mocks.items),
  getOrderShipments: vi.fn(async () => mocks.shipments),
  getShipmentItems: vi.fn(async () => mocks.shipmentItems),
  getOrderFinancials: vi.fn(async () => mocks.financials),
  getProforma: vi.fn(async () => mocks.proforma),
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

const buyerIdentity = {
  kind: "authenticated" as const,
  userId: "user-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-1", displayName: "Org One", memberRole: "OWNER", canBuy: true, canSell: false },
};

const baseOrder = {
  id: "order-1",
  orderCode: "ORD-20260913-0000001",
  buyerOrganizationId: "org-1",
  status: "DRAFT",
  currency: "USD",
  holdStartedAt: null,
  holdExpiresAt: null,
  confirmedAt: null,
  paidAt: null,
  completedAt: null,
  createdBy: "user-1",
  createdAt: "2026-09-13T10:00:00.000Z",
  updatedAt: "2026-09-13T10:00:00.000Z",
  correlationId: null,
  idempotencyKey: null,
};

const item = {
  id: "item-1",
  orderId: "order-1",
  offerId: "offer-1",
  lotId: "lot-1",
  sellerOrganizationId: "hills",
  quantityKg: 5,
  unitPricePerKg: 10,
  productNameSnapshot: "Fixture Coffee",
  originNameSnapshot: null,
  variantNameSnapshot: null,
  lotCodeSnapshot: "F007-LOT-D",
  sellerTypeSnapshot: "HILLS",
  currency: "USD",
  createdAt: "2026-09-13T10:00:00.000Z",
};

async function renderCheckoutPage() {
  vi.resetModules();
  const [{ default: CheckoutReviewPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/[orderId]/checkout/page"), import("@/components/locale/locale-provider")]);
  const element = await CheckoutReviewPage({ params: Promise.resolve({ orderId: "order-1" }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderDetailPage() {
  vi.resetModules();
  const [{ default: OrderDetailPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/[orderId]/page"), import("@/components/locale/locale-provider")]);
  const element = await OrderDetailPage({ params: Promise.resolve({ orderId: "order-1" }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T009 — checkout review page", () => {
  it("shows item quantity with kg, the unit-price snapshot with currency, and NO computed total before checkout", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "DRAFT" };
    mocks.items = [item];
    mocks.shipments = [{ id: "ship-1", orderId: "order-1", shipmentCode: "SHP-1", status: "READY", deliveryMethod: "Courier", countryCode: "AE", city: null, addressLine: "1 Checkout Street", contactName: "T", contactPhone: "+9715", shippingFee: 0, currency: "USD", readyAt: "2026-09-13T10:05:00.000Z", deliveredAt: null, createdBy: "user-1", createdAt: "", updatedAt: "" }];
    mocks.shipmentItems = [{ id: "si-1", shipmentId: "ship-1", orderItemId: "item-1", plannedQuantityKg: 5, deliveredQuantityKg: 0 }];
    mocks.financials = null;
    mocks.proforma = null;
    await renderCheckoutPage();

    expect(screen.getByText("5 kg")).toBeTruthy();
    expect(screen.getByText("USD 10/kg")).toBeTruthy();
    expect(screen.queryByText(/USD 50/)).toBeNull(); // 5 × 10 is never computed or shown
    expect(screen.getByText("This order is ready to confirm.")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: /Confirm and reserve/i });
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("with only a REQUESTED shipment, explains warehouse readiness honestly and disables confirmation", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "DRAFT" };
    mocks.items = [item];
    mocks.shipments = [{ id: "ship-1", orderId: "order-1", shipmentCode: "SHP-1", status: "REQUESTED", deliveryMethod: "Courier", countryCode: "AE", city: null, addressLine: "1 Checkout Street", contactName: "T", contactPhone: "+9715", shippingFee: 0, currency: "USD", readyAt: null, deliveredAt: null, createdBy: "user-1", createdAt: "", updatedAt: "" }];
    mocks.shipmentItems = [{ id: "si-1", shipmentId: "ship-1", orderItemId: "item-1", plannedQuantityKg: 5, deliveredQuantityKg: 0 }];
    await renderCheckoutPage();

    expect(screen.getByText(/warehouse hasn't confirmed delivery readiness/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Confirm and reserve/i }).hasAttribute("disabled")).toBe(true);
  });

  it("an order already in HOLD is redirected to its detail page (never re-reviewed)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "HOLD", holdExpiresAt: "2099-01-01T00:00:00.000Z" };
    await expect(renderCheckoutPage()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });

  it("a buyer-only-capability failure (canBuy=false) is refused before any order read", async () => {
    mocks.identity = { ...buyerIdentity, organization: { ...buyerIdentity.organization, canBuy: false } };
    await renderCheckoutPage();
    expect(screen.getByText("Buying isn't enabled for your organization")).toBeTruthy();
  });
});

describe("T010 — HOLD outcome on the order detail page (all from database rows)", () => {
  it("renders HOLD status, the stored hold_expires_at, the proforma code and the buyer total from order_financials verbatim", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T11:00:00.000Z"));
    try {
      mocks.identity = buyerIdentity;
      mocks.order = { ...baseOrder, status: "HOLD", holdStartedAt: "2026-09-13T10:59:00.000Z", holdExpiresAt: "2026-09-13T11:19:00.000Z", idempotencyKey: "k" };
      mocks.items = [item];
      mocks.shipments = [];
      mocks.shipmentItems = [];
      mocks.financials = { orderId: "order-1", baseSubtotal: 50, shippingAmount: 0, vatAmount: 2.5, commissionAmount: 0, sellerNetAmount: 50, buyerTotalAmount: 52.5, totalQuantityKg: 5, currency: "USD", commissionPolicyId: null, commissionPercentageSnapshot: 0, taxRuleId: null, taxPercentageSnapshot: 5, taxBaseSnapshot: "MERCHANDISE_ONLY", calculatedAt: "2026-09-13T10:59:00.000Z" };
      mocks.proforma = { id: "pf-1", orderId: "order-1", proformaCode: "PF-20260913-0000001", status: "ISSUED", issuedAt: "", validUntil: null, fileAssetId: null, items: [] };
      await renderDetailPage();

      expect(screen.getByText("Quantity reserved")).toBeTruthy();
      expect(screen.getByText("2026-09-13T11:19:00.000Z")).toBeTruthy();
      expect(screen.getAllByText("PF-20260913-0000001").length).toBeGreaterThan(0);
      expect(screen.getAllByText("USD 52.5").length).toBeGreaterThan(0);
      expect(screen.getByText("USD 2.5")).toBeTruthy();
      // The countdown is derived from the stored timestamp: 19:00 remaining at the mocked "now".
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole("timer").textContent).toBe("19:00");
      expect(screen.getByText("About 19 minutes remaining")).toBeTruthy();
      // No checkout entry point once on HOLD.
      expect(screen.queryByText("Proceed to checkout")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a DRAFT order offers the checkout entry point and shows financials as pending (no fabricated total)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "DRAFT" };
    mocks.items = [item];
    mocks.shipments = [];
    mocks.shipmentItems = [];
    mocks.financials = null;
    mocks.proforma = null;
    await renderDetailPage();
    expect(screen.getAllByText("Proceed to checkout").length).toBeGreaterThan(0);
    expect(screen.getByText("Totals are calculated when you confirm the order.")).toBeTruthy();
    expect(screen.queryByText("Quantity reserved")).toBeNull();
  });
});

describe("T010 — countdown/financial source proofs", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("hold-countdown.tsx derives only from the holdExpiresAt prop — no +20-minute arithmetic, no Date-based expiry computation from checkout time", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("components/orders/hold-countdown.tsx", "utf8"));
    expect(source).toMatch(/new Date\(holdExpiresAt\)/);
    expect(source).not.toMatch(/20\s*\*\s*60|\+\s*20|1200000|holdStartedAt|createdAt/);
    expect(source).not.toMatch(/aria-live="assertive"/);
    expect(source).toMatch(/role="timer"/);
  });

  it("neither order page computes a financial figure (no arithmetic on amounts)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const path of ["src/app/dashboard/orders/[orderId]/page.tsx", "src/app/dashboard/orders/[orderId]/checkout/page.tsx"]) {
      const source = stripComments(readFileSync(path, "utf8"));
      expect(source).not.toMatch(/quantityKg\s*\*\s*\w*[pP]rice|unitPricePerKg\s*\*|baseSubtotal\s*\+|\+\s*vatAmount|\+\s*shippingAmount/);
    }
  });
});
