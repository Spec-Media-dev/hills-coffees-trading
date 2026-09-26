import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 013 T063 — the seller-safe order view after M3 (no database; the live proof is
 * `tests/finance/t023-documents-payouts.test.tsx`, F008_LIVE_PROOF=1).
 *
 * `/dashboard/payments/[orderId]` renders the buyer/finance view when `getPayment` returns the payment. For a SELLER of
 * the order, M3 makes `getPayment` return `null`; the page must then render ONLY `SellerOrderDetail` — the caller's own
 * lines from `v_seller_order_lines` plus its own payout — and must never even call the buyer reads (financials,
 * proforma, tax invoice, funding). A caller with no own line gets `notFound()`.
 */

const reads = vi.hoisted(() => ({
  getPayment: vi.fn(),
  getOrderFinancials: vi.fn(),
  getProforma: vi.fn(),
  getTaxInvoice: vi.fn(),
  getPayoutsForOrder: vi.fn(),
  getSellerOrderLines: vi.fn(),
  requestFunding: vi.fn(),
}));

vi.mock("@/lib/finance/read", () => ({
  getPayment: reads.getPayment,
  getOrderFinancials: reads.getOrderFinancials,
  getProforma: reads.getProforma,
  getTaxInvoice: reads.getTaxInvoice,
  getPayoutsForOrder: reads.getPayoutsForOrder,
  getSellerOrderLines: reads.getSellerOrderLines,
}));
vi.mock("@/lib/finance/funding", () => ({ requestFunding: reads.requestFunding }));
vi.mock("@/lib/finance/stripe/config", () => ({ stripePublishableKey: () => null }));
vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => ({
    kind: "authenticated",
    userId: "00000000-0000-4000-8000-0000000000aa",
    isAuthorizedMember: true,
    organization: { organizationId: SELLER_ORG, canSell: true, canBuy: true },
  })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));

const SELLER_ORG = "13000000-0000-4000-8000-0000000000b3";
const ORDER_ID = "13000000-0000-4000-8000-0000000000c1";
/** Buyer-owned values that must never appear in the seller view. */
const BUYER_SECRETS = { buyerTotal: "9876.54", proformaCode: "PI-20260926-0000077", invoiceNumber: "INV-SECRET-77", bankRef: "BANK-REF-SECRET" };

const SELLER_VIEW = {
  orderId: ORDER_ID,
  orderCode: "ORD-20260926-0000123",
  orderStatus: "PAID",
  lines: [
    { orderItemId: "13000000-0000-4000-8000-0000000000d1", productNameSnapshot: "Guji Natural", lotCodeSnapshot: "LOT-OWN-1", quantityKg: 5, currency: "USD",
      ownGrossAmount: 50, ownCommissionAmount: 1.5, ownSellerNetAmount: 48.5, ownGroupShipmentStatus: null, ownPayoutStatus: "ACCRUED" },
  ],
};
const OWN_PAYOUT = { id: "p1", orderId: ORDER_ID, sellerOrganizationId: SELLER_ORG, amount: 48.5, currency: "USD", status: "PENDING_PAYOUT", paidAt: null, paymentReference: null, createdAt: "2026-09-26T10:00:00Z" };

afterEach(cleanup);
beforeEach(() => {
  for (const fn of Object.values(reads)) fn.mockReset();
  reads.getOrderFinancials.mockResolvedValue({ currency: "USD", buyerTotalAmount: Number(BUYER_SECRETS.buyerTotal) });
  reads.getProforma.mockResolvedValue({ id: "pf", orderId: ORDER_ID, proformaCode: BUYER_SECRETS.proformaCode, status: "PAID", issuedAt: null, validUntil: null, fileAssetId: null, items: [] });
  reads.getTaxInvoice.mockResolvedValue({ id: "ti", orderId: ORDER_ID, invoiceNumber: BUYER_SECRETS.invoiceNumber, fileAssetId: null, issuedAt: null, createdAt: "x" });
  reads.requestFunding.mockResolvedValue({ ok: false });
});

async function renderPage() {
  vi.resetModules();
  const [{ default: PaymentDetailPage }, { LocaleProvider }] = await Promise.all([
    import("@/src/app/dashboard/payments/[orderId]/page"),
    import("@/components/locale/locale-provider"),
  ]);
  const element = await PaymentDetailPage({ params: Promise.resolve({ orderId: ORDER_ID }) });
  return render(<LocaleProvider>{element}</LocaleProvider>);
}

describe("T063 — the seller view of an order (M3: sellers read no payment, so the page falls through to the seller view)", () => {
  it("renders the seller's own lines, own amounts and own payout", async () => {
    reads.getPayment.mockResolvedValue(null);
    reads.getSellerOrderLines.mockResolvedValue(SELLER_VIEW);
    reads.getPayoutsForOrder.mockResolvedValue([OWN_PAYOUT]);
    await renderPage();
    expect(document.querySelector('[data-slot="seller-order-view"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="seller-order-line"]')).toHaveLength(1);
    const text = document.body.textContent ?? "";
    expect(text).toContain("ORD-20260926-0000123");
    expect(text).toContain("Guji Natural");
    expect(text).toContain("LOT-OWN-1");
    expect(text).toMatch(/48\.50?/);
    expect(document.querySelector('[data-slot="payout-status-badge"]')?.getAttribute("data-status")).toBe("PENDING_PAYOUT");
    expect(reads.getSellerOrderLines).toHaveBeenCalledWith({ orderId: ORDER_ID, organizationId: SELLER_ORG });
  });

  it("never reads nor renders the buyer's payment, totals, proforma, tax invoice, funding, proof or bank data", async () => {
    reads.getPayment.mockResolvedValue(null);
    reads.getSellerOrderLines.mockResolvedValue(SELLER_VIEW);
    reads.getPayoutsForOrder.mockResolvedValue([OWN_PAYOUT]);
    await renderPage();
    // not even called: the buyer-owned reads are unreachable from the seller branch
    expect(reads.getOrderFinancials).not.toHaveBeenCalled();
    expect(reads.getProforma).not.toHaveBeenCalled();
    expect(reads.getTaxInvoice).not.toHaveBeenCalled();
    expect(reads.requestFunding).not.toHaveBeenCalled();
    const text = document.body.textContent ?? "";
    for (const secret of Object.values(BUYER_SECRETS)) expect(text).not.toContain(secret);
    for (const slot of ["payment-status-badge", "financial-summary", "proforma-status-badge"]) expect(document.querySelector(`[data-slot="${slot}"]`), slot).toBeNull();
    expect(document.querySelector("#documents-heading")).toBeNull();
    expect(document.querySelector("#funding-heading")).toBeNull();
    expect(text).not.toMatch(/buyer total|tax invoice|proforma invoice|payment proof|iban|account number|swift/i);
  });

  it("a caller with no own line on the order (nonexistent, cross-organization, or a buyer-only party) gets notFound — no existence signal", async () => {
    reads.getPayment.mockResolvedValue(null);
    reads.getSellerOrderLines.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(reads.getPayoutsForOrder).not.toHaveBeenCalled();
  });

  it("buyers are unaffected: with a readable payment the full buyer view renders (proforma, financials) and the seller view is never built", async () => {
    reads.getPayment.mockResolvedValue({ id: "pay", orderId: ORDER_ID, paymentMethod: "BANK_TRANSFER", provider: null, externalReference: null, amount: 9876.54, currency: "USD",
      status: "CONFIRMED", confirmedAt: null, rejectedReason: null, correlationId: null, createdAt: "x", updatedAt: "x" });
    reads.getOrderFinancials.mockResolvedValue(null);
    reads.getPayoutsForOrder.mockResolvedValue([]);
    await renderPage();
    expect(document.querySelector('[data-slot="seller-order-view"]')).toBeNull();
    expect(document.querySelector('[data-slot="proforma-status-badge"]')?.getAttribute("data-status")).toBe("PAID");
    expect(document.body.textContent).toContain(BUYER_SECRETS.proformaCode);
    expect(reads.getSellerOrderLines).not.toHaveBeenCalled();
  });
});

describe("T063 — source audit of the seller read paths", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const read = strip(readFileSync("lib/finance/read.ts", "utf8"));
  const page = strip(readFileSync("src/app/dashboard/payments/[orderId]/page.tsx", "utf8"));
  const sales = strip(readFileSync("lib/listings/sales.ts", "utf8"));

  it("getSellerOrderLines reads only the seller-safe projection, filtered to the acting organization; the order reference selects no destination column", () => {
    const fn = read.slice(read.indexOf("export async function getSellerOrderLines"), read.indexOf("const MAX_BATCH_SIZE"));
    expect(fn).toMatch(/\.from\("v_seller_order_lines"\)/);
    expect(fn).toMatch(/\.eq\("seller_organization_id", organizationId\)/);
    expect(fn).toMatch(/\.from\("orders"\)\.select\("id, order_code"\)/);
    expect(fn).not.toMatch(/payments|order_financials|proforma_invoices|tax_invoices|payment_proofs|payment_accounts|destination|buyer_total/);
    const select = /SELLER_ORDER_LINE_SELECT =\s*"([^"]+)"/.exec(read)![1]!;
    expect(select).not.toMatch(/buyer|bank|proof|destination|hills_share|payment/);
  });
  it("the seller component renders nothing but its own lines and payouts", () => {
    const component = page.slice(page.indexOf("function SellerOrderDetail"));
    expect(component).not.toMatch(/getOrderFinancials|getProforma|getTaxInvoice|getPayment\b|requestFunding|FinancialSummary|ProformaStatusBadge|PaymentStatusBadge|buyerTotal/);
  });
  it("the sales list stays own-lines only (order_items filtered to the seller org) and never reads a buyer column", () => {
    expect(sales).toMatch(/\.eq\(\s*"seller_organization_id"\s*,\s*organizationId\s*\)/);
    expect(sales).not.toMatch(/buyer_organization_id|buyer_total|payments|proforma_invoices|destination/);
    expect(sales).toMatch(/\.from\("orders"\)\.select\("id, order_code, status, created_at"\)/);
  });
});
