import { readFileSync } from "node:fs";
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feature 017: T004 — Payment Detail Route Bank-Transfer & History UI Contracts
 *
 * Verifies that src/app/dashboard/payments/[orderId]/page.tsx:
 * 1. Has zero provider/card/Stripe controls or funding seams.
 * 2. Accurately renders bank-transfer status, financial summary, documents, and history.
 * 3. Preserves RLS-only scoping and seller-safe projection without existence leaks.
 */

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

// Mock next/navigation
const mockNotFound = vi.fn();
vi.mock("next/navigation", () => ({
  notFound: () => {
    mockNotFound();
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// Mock auth DAL
const mockIdentityState = {
  identity: {
    kind: "authenticated" as const,
    isAuthorizedMember: true,
    organization: {
      organizationId: "org-buyer-uuid",
      name: "Buyer Roastery",
    },
    profile: { id: "user-buyer-uuid" },
  },
};

vi.mock("@/lib/auth/dal", () => ({
  getRequestIdentity: vi.fn(async () => mockIdentityState.identity),
}));

// Mock finance read DAL
const mockPayment = {
  id: "pay-1234",
  orderId: "order-test-uuid",
  amount: 25000,
  currency: "SAR",
  status: "PENDING",
  paymentMethod: "BANK_TRANSFER",
  correlationId: "CORR-9999",
  externalReference: "EXT-8888",
  createdAt: "2026-10-01T12:00:00Z",
  updatedAt: "2026-10-01T12:00:00Z",
};

const mockFinancials = {
  orderId: "order-test-uuid",
  currency: "SAR",
  subtotalAmount: 25000,
  platformFeeAmount: 500,
  logisticsFeeAmount: 1000,
  vatAmount: 3975,
  totalAmount: 30475,
};

const mockProforma = {
  id: "prof-1234",
  orderId: "order-test-uuid",
  proformaCode: "PI-2026-0001",
  status: "ISSUED",
  totalAmount: 30475,
  currency: "SAR",
  issuedAt: "2026-10-01T12:00:00Z",
  items: [],
};

const mockTaxInvoice = {
  id: "inv-1234",
  orderId: "order-test-uuid",
  invoiceNumber: "INV-2026-0001",
  totalAmount: 30475,
  currency: "SAR",
  issuedAt: "2026-10-02T10:00:00Z",
};

const mockPayouts = [
  {
    id: "payout-1234",
    orderId: "order-test-uuid",
    amount: 23500,
    currency: "SAR",
    status: "PENDING",
    createdAt: "2026-10-02T10:00:00Z",
  },
];

const mockSellerOrderLines = {
  orderId: "order-test-uuid",
  orderCode: "ORD-2026-999",
  orderStatus: "HOLD",
  organizationId: "org-seller-uuid",
  sellerOrganizationId: "org-seller-uuid",
  lines: [
    {
      orderItemId: "item-1",
      offerId: "offer-1",
      productNameSnapshot: "Yemeni Haraz",
      lotCodeSnapshot: "LOT-HARAZ-01",
      quantityKg: 500,
      pricePerKg: 47,
      ownGrossAmount: 23500,
      ownCommissionAmount: 1175,
      ownSellerNetAmount: 22325,
      currency: "SAR",
    },
  ],
};

const financeReadMocks = vi.hoisted(() => ({
  getPayment: vi.fn(),
  getOrderFinancials: vi.fn(),
  getProforma: vi.fn(),
  getTaxInvoice: vi.fn(),
  getPayoutsForOrder: vi.fn(),
  getSellerOrderLines: vi.fn(),
}));

vi.mock("@/lib/finance/read", () => ({
  getPayment: financeReadMocks.getPayment,
  getOrderFinancials: financeReadMocks.getOrderFinancials,
  getProforma: financeReadMocks.getProforma,
  getTaxInvoice: financeReadMocks.getTaxInvoice,
  getPayoutsForOrder: financeReadMocks.getPayoutsForOrder,
  getSellerOrderLines: financeReadMocks.getSellerOrderLines,
}));

afterEach(cleanup);

describe("T004 — Source-level absence of provider funding in payment detail page", () => {
  const pageSource = stripComments(
    readFileSync("src/app/dashboard/payments/[orderId]/page.tsx", "utf8")
  );

  it("does not import requestFunding or lib/finance/funding", () => {
    expect(pageSource).not.toMatch(/from\s+["'].*\/lib\/finance\/funding["']/);
    expect(pageSource).not.toMatch(/\brequestFunding\b/);
  });

  it("does not import StripePaymentCollector or components/finance/stripe-payment-collector", () => {
    expect(pageSource).not.toMatch(/from\s+["'].*\/components\/finance\/stripe-payment-collector["']/);
    expect(pageSource).not.toMatch(/StripePaymentCollector/);
  });

  it("does not import FundingUnavailableNotice or components/finance/funding-unavailable-notice", () => {
    expect(pageSource).not.toMatch(/from\s+["'].*\/components\/finance\/funding-unavailable-notice["']/);
    expect(pageSource).not.toMatch(/FundingUnavailableNotice/);
  });

  it("does not import stripePublishableKey or lib/finance/stripe/config", () => {
    expect(pageSource).not.toMatch(/from\s+["'].*\/lib\/finance\/stripe\/config["']/);
    expect(pageSource).not.toMatch(/stripePublishableKey/);
  });

  it("does not read any STRIPE_ environment variable", () => {
    expect(pageSource).not.toMatch(/STRIPE_SECRET_KEY/);
    expect(pageSource).not.toMatch(/STRIPE_WEBHOOK_SECRET/);
    expect(pageSource).not.toMatch(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/);
  });

  it("preserves legitimate RLS-scoped data reads", () => {
    expect(pageSource).toMatch(/getPayment/);
    expect(pageSource).toMatch(/getOrderFinancials/);
    expect(pageSource).toMatch(/getProforma/);
    expect(pageSource).toMatch(/getTaxInvoice/);
    expect(pageSource).toMatch(/getPayoutsForOrder/);
    expect(pageSource).toMatch(/getSellerOrderLines/);
  });

  it("preserves authenticated and authorization membership check", () => {
    expect(pageSource).toMatch(/getRequestIdentity/);
    expect(pageSource).toMatch(/isAuthorizedMember/);
  });
});

describe("T004 — Payment detail UI rendering and behavior contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIdentityState.identity = {
      kind: "authenticated",
      isAuthorizedMember: true,
      organization: {
        organizationId: "org-buyer-uuid",
        name: "Buyer Roastery",
      },
      profile: { id: "user-buyer-uuid" },
    };

    financeReadMocks.getPayment.mockResolvedValue(mockPayment);
    financeReadMocks.getOrderFinancials.mockResolvedValue(mockFinancials);
    financeReadMocks.getProforma.mockResolvedValue(mockProforma);
    financeReadMocks.getTaxInvoice.mockResolvedValue(mockTaxInvoice);
    financeReadMocks.getPayoutsForOrder.mockResolvedValue(mockPayouts);
    financeReadMocks.getSellerOrderLines.mockResolvedValue(null);
  });

  it("renders bank-transfer payment information and history without any card/provider controls", async () => {
    const { default: PaymentDetailPage } = await import(
      "@/src/app/dashboard/payments/[orderId]/page"
    );
    const { LocaleProvider } = await import("@/components/locale/locale-provider");

    const jsx = await PaymentDetailPage({
      params: Promise.resolve({ orderId: "order-test-uuid" }),
    });
    const { container } = render(<LocaleProvider>{jsx}</LocaleProvider>);

    // Payment status badge
    expect(container.querySelector('[data-slot="payment-status-badge"]')).not.toBeNull();

    // Order reference and payment amount
    expect(container.textContent).toContain("order-test-uuid");
    expect(container.textContent).toContain("SAR 25000");
    expect(container.textContent).toContain("CORR-9999");
    expect(container.textContent).toContain("EXT-8888");

    // Financial summary
    expect(container.querySelector('[data-slot="financial-summary"]')).not.toBeNull();

    // Proforma & Tax invoice sections
    expect(container.querySelector('[data-slot="proforma-status-badge"]')).not.toBeNull();
    expect(container.textContent).toContain("PI-2026-0001");
    expect(container.textContent).toContain("INV-2026-0001");

    // ABSENCE: Zero card/provider payment CTAs or Element notices
    expect(container.querySelector('[data-finance-notice="funding-unavailable"]')).toBeNull();
    expect(container.querySelector('[data-slot="stripe-payment-collector"]')).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(container.textContent).not.toMatch(/\b(Pay with card|Credit Card|Stripe|Fund order)\b/i);
  });

  it("renders SellerOrderDetail when caller is seller without leaking buyer payment details", async () => {
    financeReadMocks.getPayment.mockResolvedValue(null);
    financeReadMocks.getSellerOrderLines.mockResolvedValue(mockSellerOrderLines);
    financeReadMocks.getPayoutsForOrder.mockResolvedValue(mockPayouts);

    const { default: PaymentDetailPage } = await import(
      "@/src/app/dashboard/payments/[orderId]/page"
    );
    const { LocaleProvider } = await import("@/components/locale/locale-provider");

    const jsx = await PaymentDetailPage({
      params: Promise.resolve({ orderId: "order-test-uuid" }),
    });
    const { container } = render(<LocaleProvider>{jsx}</LocaleProvider>);

    expect(container.textContent).toContain("Yemeni Haraz");
    expect(container.textContent).toContain("500 kg");
    // Buyer payment details are absent
    expect(container.querySelector('[data-slot="payment-status-badge"]')).toBeNull();
  });

  it("calls notFound() when neither buyer payment nor seller order lines exist", async () => {
    financeReadMocks.getPayment.mockResolvedValue(null);
    financeReadMocks.getSellerOrderLines.mockResolvedValue(null);

    const { default: PaymentDetailPage } = await import(
      "@/src/app/dashboard/payments/[orderId]/page"
    );

    await expect(
      PaymentDetailPage({
        params: Promise.resolve({ orderId: "nonexistent-order" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });
});
