import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ORDER_STATUSES } from "@/lib/orders/validation";

/**
 * Feature 007 RUN C (T015/T016/T017) — order list/detail/component proofs via module mocks (the
 * live boundaries — own-org isolation, cross-org denial, lazy expiry — are proven in
 * `read.test.ts`/`expiry.test.ts`; these prove the VIEWS' own behaviour and source discipline).
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  orders: { rows: [] as unknown[], hasMore: false },
  financialsByOrder: new Map<string, unknown>(),
  order: null as unknown,
  items: [] as unknown[],
  shipments: [] as unknown[],
  shipmentItems: [] as unknown[],
  financials: null as unknown,
  proforma: null as unknown,
  payment: null as unknown,
  history: [] as unknown[],
  ensureHoldFreshCalls: [] as string[],
  readCalls: [] as string[],
}));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
// Feature 012 RUN B (T007): the order detail page now lists this order's dispute records (read-only linkage).
vi.mock("@/lib/disputes/read", () => ({ listDisputesForOrder: vi.fn(async () => []) }));
vi.mock("@/lib/orders/read", () => ({
  getOrdersForOrganization: vi.fn(async () => {
    mocks.readCalls.push("getOrdersForOrganization");
    return mocks.orders;
  }),
  getOrderFinancialsForOrders: vi.fn(async () => mocks.financialsByOrder),
  getOrderById: vi.fn(async () => mocks.order),
  getOrderItems: vi.fn(async () => {
    mocks.readCalls.push("getOrderItems");
    return mocks.items;
  }),
  getOrderShipments: vi.fn(async () => mocks.shipments),
  getShipmentItems: vi.fn(async () => mocks.shipmentItems),
  getOrderFinancials: vi.fn(async () => mocks.financials),
  getProforma: vi.fn(async () => mocks.proforma),
  getPaymentStatus: vi.fn(async () => mocks.payment),
  getOrderStatusHistory: vi.fn(async () => mocks.history),
}));
vi.mock("@/lib/orders/expiry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/orders/expiry")>()),
  ensureHoldFresh: vi.fn(async (orderId: string) => {
    mocks.ensureHoldFreshCalls.push(orderId);
    mocks.readCalls.push("ensureHoldFresh");
    const order = mocks.order as { status?: string; holdExpiresAt?: string | null } | null;
    if (!order) return { ok: false, code: "order_not_found" };
    const fresh = order.status === "HOLD" && !!order.holdExpiresAt && new Date(order.holdExpiresAt).getTime() > Date.now();
    return { ok: true, data: { order, fresh, expiredNow: false } };
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
  id: "11111111-1111-4111-8111-111111111111",
  orderCode: "ORD-20260913-0000042",
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

const financials = { orderId: baseOrder.id, baseSubtotal: 40, shippingAmount: 5, vatAmount: 2, commissionAmount: 1, sellerNetAmount: 39, buyerTotalAmount: 47, totalQuantityKg: 4, currency: "USD", commissionPolicyId: null, commissionPercentageSnapshot: 0, taxRuleId: null, taxPercentageSnapshot: 5, taxBaseSnapshot: "MERCHANDISE_ONLY", calculatedAt: "2026-09-13T10:59:00.000Z" };

async function renderListPage() {
  vi.resetModules();
  const [{ default: OrdersPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/page"), import("@/components/locale/locale-provider")]);
  const element = await OrdersPage({ searchParams: Promise.resolve({}) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

async function renderDetailPage() {
  vi.resetModules();
  const [{ default: OrderDetailPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/orders/[orderId]/page"), import("@/components/locale/locale-provider")]);
  const element = await OrderDetailPage({ params: Promise.resolve({ orderId: baseOrder.id }) });
  render(<LocaleProvider>{element}</LocaleProvider>);
}

const EXPECTED_EN_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  HOLD: "On hold",
  PAYMENT_PROOF_SUBMITTED: "Payment proof submitted",
  PAYMENT_UNDER_REVIEW: "Payment under review",
  PAID: "Paid",
  FULFILLMENT_IN_PROGRESS: "Fulfilment in progress",
  PARTIALLY_DELIVERED: "Partially delivered",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
  VOID: "Void",
  DISPUTED: "Disputed",
  PROFORMA_ISSUED: "Proforma issued",
  CANCELLED: "Cancelled",
  PAYMENT_REJECTED: "Payment rejected",
};

describe("T015 — all fifteen orders.status values render their exact approved labels (EN + AR present), 1:1, no alias", () => {
  it.each(ORDER_STATUSES)("%s renders its own label with a data-status marker", async (status) => {
    vi.resetModules();
    const [{ OrderStatusBadge }, { LocaleProvider }] = await Promise.all([import("@/components/orders/order-status-badge"), import("@/components/locale/locale-provider")]);
    render(
      <LocaleProvider>
        <OrderStatusBadge status={status} />
      </LocaleProvider>
    );
    const badge = document.querySelector(`[data-slot="order-status-badge"][data-status="${status}"]`);
    expect(badge).not.toBeNull();
    expect(screen.getByText(EXPECTED_EN_LABELS[status]!)).toBeTruthy();
    expect(badge!.querySelector('[lang="ar"]')!.textContent!.length).toBeGreaterThan(0);
  });

  it("exactly 15 statuses exist in the vocabulary and every one has EN + AR copy", async () => {
    const { en } = await import("@/lib/app/copy/en");
    const { ar } = await import("@/lib/app/copy/ar");
    expect(ORDER_STATUSES).toHaveLength(15);
    for (const status of ORDER_STATUSES) {
      expect((en.orders.status as Record<string, string>)[status]).toBeTruthy();
      expect(((ar as { orders?: { status?: Record<string, string> } }).orders?.status ?? {})[status]).toBeTruthy();
    }
  });
});

describe("T015 — orders list page", () => {
  it("renders each order's code (monospace), status badge, stored buyer total with currency, and a HOLD 'held until' indication", async () => {
    mocks.identity = buyerIdentity;
    const holdOrder = { ...baseOrder, id: "22222222-2222-4222-8222-222222222222", orderCode: "ORD-20260913-0000043", status: "HOLD", holdExpiresAt: "2099-01-01T00:00:00.000Z" };
    mocks.orders = { rows: [baseOrder, holdOrder], hasMore: false };
    mocks.financialsByOrder = new Map([[holdOrder.id, { ...financials, orderId: holdOrder.id }]]);
    mocks.readCalls = [];
    await renderListPage();

    expect(screen.getAllByText("ORD-20260913-0000042")[0]!.className).toMatch(/font-mono/);
    expect(screen.getAllByText("USD 47").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0); // no snapshot for the DRAFT — never fabricated
    expect(screen.getAllByText(/Held until 2099-01-01T00:00:00.000Z/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-status="HOLD"]').length).toBeGreaterThan(0);
    // No stale hold on this page → lazy expiry not invoked, single page read.
    expect(mocks.readCalls.filter((call) => call === "ensureHoldFresh")).toHaveLength(0);
  });

  it("a STALE hold on the page is passed through ensureHoldFresh and the page is re-read before rendering", async () => {
    mocks.identity = buyerIdentity;
    const stale = { ...baseOrder, id: "33333333-3333-4333-8333-333333333333", status: "HOLD", holdExpiresAt: "2000-01-01T00:00:00.000Z" };
    mocks.orders = { rows: [stale], hasMore: false };
    mocks.financialsByOrder = new Map();
    mocks.order = stale;
    mocks.readCalls = [];
    mocks.ensureHoldFreshCalls = [];
    await renderListPage();
    expect(mocks.ensureHoldFreshCalls).toEqual([stale.id]);
    expect(mocks.readCalls).toEqual(["getOrdersForOrganization", "ensureHoldFresh", "getOrdersForOrganization"]);
  });

  it("the list reads only through lib/orders/read.ts with a bounded, deterministically-ordered query and no cache directive (source-level)", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/dashboard/orders/page.tsx", "utf8");
    expect(page).toMatch(/from ["']@\/lib\/orders\/read["']/);
    expect(page).not.toMatch(/\.from\(\s*["']orders["']/);
    expect(page).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
    const read = readFileSync("lib/orders/read.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(read).toMatch(/const MAX_PAGE_SIZE = 100/);
    expect(read).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)\s*\.range\(from, to\)/);
    expect(read).toMatch(/\.in\("order_id", ids\)/); // page-keyed financials, never an org-wide scan
    expect(read).toMatch(/slice\(0, MAX_PAGE_SIZE\)/);
  });
});

describe("T016 — order detail page", () => {
  it("runs ensureHoldFresh BEFORE any other order read and renders the order it returned", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "CONFIRMED" };
    mocks.items = [];
    mocks.shipments = [];
    mocks.financials = null;
    mocks.proforma = null;
    mocks.payment = null;
    mocks.history = [];
    mocks.readCalls = [];
    mocks.ensureHoldFreshCalls = [];
    await renderDetailPage();
    expect(mocks.ensureHoldFreshCalls).toEqual([baseOrder.id]);
    expect(mocks.readCalls[0]).toBe("ensureHoldFresh");
    expect(mocks.readCalls.indexOf("getOrderItems")).toBeGreaterThan(mocks.readCalls.indexOf("ensureHoldFresh"));
  });

  it("the detail page's source calls ensureHoldFresh before every other order read (position proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/orders/[orderId]/page.tsx", "utf8");
    const expiryIndex = source.indexOf("await ensureHoldFresh(orderId)");
    expect(expiryIndex).toBeGreaterThan(0);
    for (const later of ["getOrderItems({", "getOrderShipments({", "getOrderFinancials({", "getProforma({", "getPaymentStatus({", "getOrderStatusHistory({"]) {
      expect(source.indexOf(later)).toBeGreaterThan(expiryIndex);
    }
    expect(source).not.toMatch(/getOrderById\(/); // the order rendered IS the one ensureHoldFresh returned
  });

  it("an EXPIRED order renders the explicit expired state with its reason and genuine recovery routes, no countdown, no checkout entry, no edit/remove control", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "EXPIRED", holdStartedAt: "2026-09-13T10:00:00.000Z", holdExpiresAt: "2026-09-13T10:20:00.000Z" };
    mocks.items = [{ id: "item-1", orderId: baseOrder.id, offerId: "offer-1", lotId: "lot-1", sellerOrganizationId: "hills", quantityKg: 4, unitPricePerKg: 10, productNameSnapshot: "Fixture Coffee", originNameSnapshot: null, variantNameSnapshot: null, lotCodeSnapshot: "F007-LOT-D", sellerTypeSnapshot: "HILLS", currency: "USD", createdAt: "" }];
    mocks.shipments = [];
    mocks.financials = financials;
    mocks.proforma = { id: "pf-1", orderId: baseOrder.id, proformaCode: "PF-20260913-0000009", status: "ISSUED", issuedAt: "", validUntil: null, fileAssetId: null, items: [] };
    mocks.payment = { status: "EXPIRED", amount: 47, currency: "USD" };
    mocks.history = [
      { id: "1", orderId: baseOrder.id, oldStatus: "DRAFT", newStatus: "CONFIRMED", changedBy: "user-1", reason: null, createdAt: "2026-09-13T09:59:00.000Z" },
      { id: "2", orderId: baseOrder.id, oldStatus: "CONFIRMED", newStatus: "HOLD", changedBy: null, reason: null, createdAt: "2026-09-13T10:00:00.000Z" },
      { id: "3", orderId: baseOrder.id, oldStatus: "HOLD", newStatus: "EXPIRED", changedBy: null, reason: null, createdAt: "2026-09-13T10:21:00.000Z" },
    ];
    await renderDetailPage();

    expect(screen.getByText("Reservation expired")).toBeTruthy();
    expect(screen.getByText("Hold window ended")).toBeTruthy();
    // The recovery controls are real `<a href>` navigations rendered through the project Button
    // (Base UI adds role="button" to the anchor, so they are located by href, not by link role).
    expect(screen.getByText("Start a new order").closest("a")!.getAttribute("href")).toBe("/dashboard/orders");
    expect(screen.getByText("Back to marketplace").closest("a")!.getAttribute("href")).toBe("/dashboard/coffee");
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText("Proceed to checkout")).toBeNull();
    expect(screen.queryByLabelText("Listing ID")).toBeNull();
    expect(screen.queryByRole("button", { name: /remove|edit/i })).toBeNull();
    // Payment status is DISPLAYED (EXPIRED) with no payment action whatsoever.
    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /pay|proof|escrow/i })).toBeNull();
    // Status history renders labelled transitions in order.
    // Feature 012 RUN C (T016): the shared read-only timeline renders bilingual labels (EN + AR spans),
    // so the English transition is asserted on each entry's English-language text.
    const transitions = [...document.querySelectorAll('[data-slot="history-entry"]')].map((entry) =>
      [...entry.querySelectorAll(':scope > div:first-child > span:first-child [lang="en"]')].map((node) => node.textContent).join(" → "),
    );
    expect(transitions).toEqual(expect.arrayContaining(["Draft → Confirmed", "On hold → Expired"]));
    // Financial snapshot rendered verbatim with currency; proforma code shown, monospace.
    expect(screen.getAllByText("USD 47").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PF-20260913-0000009")[0]!.className).toMatch(/font-mono/);
  });

  it("a PAID (non-HOLD, non-expired) order shows neither the countdown nor the expired panel, but does show the financial snapshot", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "PAID", holdExpiresAt: "2026-09-13T10:20:00.000Z", paidAt: "2026-09-13T10:10:00.000Z" };
    mocks.items = [];
    mocks.shipments = [];
    mocks.financials = financials;
    mocks.proforma = null;
    mocks.payment = { status: "CONFIRMED", amount: 47, currency: "USD" };
    mocks.history = [];
    await renderDetailPage();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByText("Reservation expired")).toBeNull();
    expect(screen.queryByText("Quantity reserved")).toBeNull();
    expect(screen.getAllByText("USD 47").length).toBeGreaterThan(0);
    expect(screen.getByText("4 kg")).toBeTruthy();
  });

  it("a fresh HOLD shows the countdown (and nothing else claims expiry)", async () => {
    mocks.identity = buyerIdentity;
    mocks.order = { ...baseOrder, status: "HOLD", holdExpiresAt: "2099-01-01T00:00:00.000Z" };
    mocks.items = [];
    mocks.shipments = [];
    mocks.financials = financials;
    mocks.proforma = null;
    mocks.payment = { status: "PENDING", amount: 47, currency: "USD" };
    mocks.history = [];
    await renderDetailPage();
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("timer")).toBeTruthy();
    expect(screen.queryByText("Reservation expired")).toBeNull();
  });
});

describe("T017 — components", () => {
  it("FinancialSummary renders every money figure with its currency and the quantity with kg, verbatim from the DTO, monospace, with no arithmetic in source", async () => {
    vi.resetModules();
    const [{ FinancialSummary }, { LocaleProvider }] = await Promise.all([import("@/components/orders/financial-summary"), import("@/components/locale/locale-provider")]);
    render(
      <LocaleProvider>
        <FinancialSummary financials={financials} />
      </LocaleProvider>
    );
    for (const text of ["USD 40", "USD 5", "USD 2", "USD 47", "4 kg"]) {
      const element = screen.getByText(text);
      expect(element.className).toMatch(/font-mono/);
      expect(element.getAttribute("dir")).toBe("ltr");
    }
    // Commission / seller-net are seller/finance-facing — never shown to the buyer.
    expect(screen.queryByText("USD 1")).toBeNull();
    expect(screen.queryByText("USD 39")).toBeNull();

    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/orders/financial-summary.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/[+\-*/]\s*financials\.|financials\.\w+\s*[+\-*/]|toFixed|Math\./);
  });

  it("HoldCountdown derives only from hold_expires_at, never announces per second, marks expiry accessibly, and animates nothing (reduced-motion safe)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("components/orders/hold-countdown.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(source).toMatch(/new Date\(holdExpiresAt\)/);
    expect(source).not.toMatch(/20\s*\*\s*60|\+\s*20|1200000|holdStartedAt|createdAt|checkedOutAt/);
    expect(source).toMatch(/role="timer"/);
    expect(source).toMatch(/aria-live="polite"/);
    expect(source).not.toMatch(/aria-live="assertive"/);
    expect(source).not.toMatch(/animate-|transition-|motion-/);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T11:00:00.000Z"));
    try {
      vi.resetModules();
      const [{ HoldCountdown }, { LocaleProvider }] = await Promise.all([import("@/components/orders/hold-countdown"), import("@/components/locale/locale-provider")]);
      render(
        <LocaleProvider>
          <HoldCountdown holdExpiresAt="2026-09-13T10:59:00.000Z" />
        </LocaleProvider>
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByRole("timer").textContent).toBe("00:00");
      expect(screen.getByText("This reservation window has ended.")).toBeTruthy();
      expect(document.querySelector('[data-slot="hold-countdown"]')!.getAttribute("data-expired")).toBe("true");
    } finally {
      vi.useRealTimers();
    }
  });

  it("order and proforma codes use the monospace treatment with safe wrapping on the pages", async () => {
    const { readFileSync } = await import("node:fs");
    const detail = readFileSync("src/app/dashboard/orders/[orderId]/page.tsx", "utf8");
    const list = readFileSync("src/app/dashboard/orders/page.tsx", "utf8");
    expect(detail).toMatch(/font-mono break-all[^>]*>\s*\{order\.orderCode\}/);
    expect(detail).toMatch(/font-mono break-all[^>]*>\s*\{proforma\.proformaCode\}/);
    expect(list).toMatch(/font-mono break-all[^>]*>\s*\{order\.orderCode\}/);
  });
});
