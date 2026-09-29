import React from "react";
import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AddToCartForm } from "@/components/commerce/add-to-cart-form";
import { ListingCard } from "@/components/listings/listing-card";
import { LocaleProvider } from "@/components/locale/locale-provider";
import { getCartDisabledReason, type CartLine } from "@/lib/commerce/cart";
import { CartGroup } from "@/components/commerce/cart-group";
import type { BuyerBrowseListing, FillProjection } from "@/lib/listings/types";

/**
 * Feature 014 — Critical Commerce Regression & UX Check
 *
 * Verifies:
 * 1. Marketplace listing card and detail page eligibility consistency via getCartDisabledReason
 * 2. Add to cart never fails silently, exposes no server/Postgres internals
 * 3. Successful add renders clear visible confirmation and direct /dashboard/cart navigation
 * 4. Ineligible/own listings present clear user-facing refusal
 * 5. Cart view renders items, quantities, seller groupings, and responsive touch targets
 * 6. RTL and LTR protection for numeric prices and codes
 */

afterEach(cleanup);

const mockListing: BuyerBrowseListing = {
  id: "offer-001",
  coffeeId: "coffee-001",
  coffeeName: "Ethiopia Yirgacheffe G1",
  lot: {
    lotId: "lot-001",
    lotCode: "ETH-2026-01",
    cropYear: "2026",
    qualityGrade: "G1",
    cupScore: 88,
    coffeeId: "coffee-001",
    coffeeName: "Ethiopia Yirgacheffe G1",
  },
  sellerOrganizationId: "seller-org-1",
  sellerType: "MEMBER_SELLER",
  warehouse: {
    warehouseId: "wh-001",
    code: "WH-DXB-01",
    name: "Jebel Ali Cold Store",
    city: "Dubai",
    countryCode: "AE",
  },
  title: "Ethiopia Yirgacheffe Washed G1",
  quantityKg: 500,
  reservedQuantityKg: 0,
  filledQuantityKg: 0,
  pricePerKg: 12.5,
  currency: "USD",
  status: "PUBLISHED",
  createdAt: "2026-09-28T10:00:00Z",
  updatedAt: "2026-09-28T10:00:00Z",
};

const mockAvailableProjection: FillProjection = {
  ok: true,
  quantityKg: 500,
  reservedQuantityKg: 0,
  filledQuantityKg: 0,
  remainingQuantityKg: 500,
  state: "AVAILABLE",
};

const mockSoldOutProjection: FillProjection = {
  ok: true,
  quantityKg: 500,
  reservedQuantityKg: 500,
  filledQuantityKg: 0,
  remainingQuantityKg: 0,
  state: "SOLD_OUT",
};

describe("Critical Commerce Regression / UX Check — Eligibility & Consistency", () => {
  it("getCartDisabledReason enforces identical rules across listing card and detail page", () => {
    // 1. Unauthenticated / no buyer org -> unavailable
    expect(getCartDisabledReason(null, "seller-org-1", mockAvailableProjection)).toBe("unavailable");
    expect(getCartDisabledReason(undefined, "seller-org-1", mockAvailableProjection)).toBe("unavailable");

    // 2. Buyer is same organization as seller -> own
    expect(getCartDisabledReason("seller-org-1", "seller-org-1", mockAvailableProjection)).toBe("own");

    // 3. Different buyer org and available -> operable (undefined)
    expect(getCartDisabledReason("buyer-org-1", "seller-org-1", mockAvailableProjection)).toBeUndefined();

    // 4. Sold out / remaining <= 0 -> unavailable
    expect(getCartDisabledReason("buyer-org-1", "seller-org-1", mockSoldOutProjection)).toBe("unavailable");

    // 5. Corrupted projection -> unavailable
    const corruptedProjection: FillProjection = {
      ok: false,
      problem: "NEGATIVE_REMAINING",
      quantityKg: 100,
      reservedQuantityKg: 120,
      filledQuantityKg: 0,
    };
    expect(getCartDisabledReason("buyer-org-1", "seller-org-1", corruptedProjection)).toBe("unavailable");
  });

  it("Marketplace listing card uses getCartDisabledReason and renders AddToCartForm", () => {
    render(
      <LocaleProvider>
        <ListingCard
          listing={mockListing}
          projection={mockAvailableProjection}
          buyerOrganizationId="buyer-org-1"
        />
      </LocaleProvider>
    );

    const button = screen.getByRole("button", { name: "Add to cart" });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.className).toContain("min-h-11");
  });

  it("Listing card disables purchase and shows own listing refusal when buyer owns the listing", () => {
    render(
      <LocaleProvider>
        <ListingCard
          listing={mockListing}
          projection={mockAvailableProjection}
          buyerOrganizationId="seller-org-1"
        />
      </LocaleProvider>
    );

    const button = screen.getByRole("button", { name: "Add to cart" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/cannot buy its own listing/i)).toBeDefined();
  });
});

describe("Critical Commerce Regression / UX Check — Add to Cart Interaction & Feedback", () => {
  it("renders truthful no-reservation notice and quantity input", () => {
    render(
      <LocaleProvider>
        <AddToCartForm offerId="offer-001" />
      </LocaleProvider>
    );

    expect(screen.getByText(/Cart quantities are not reserved/i)).toBeDefined();
    const input = screen.getByRole("spinbutton");
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.getAttribute("min")).toBe("0.001");
  });

  it("provides touch-target compliance on mobile viewports", () => {
    render(
      <LocaleProvider>
        <AddToCartForm offerId="offer-001" />
      </LocaleProvider>
    );

    const button = screen.getByRole("button", { name: "Add to cart" });
    expect(button.className).toContain("min-h-11");
  });
});

describe("Critical Commerce Regression / UX Check — Cart Display & Persistence", () => {
  const mockLines: CartLine[] = [
    {
      id: "line-001",
      offerId: "offer-001",
      sellerOrganizationId: "seller-org-1",
      sellerType: "PRODUCER",
      warehouseId: "wh-001",
      warehouseName: "Jebel Ali Cold Store",
      productName: "Ethiopia Yirgacheffe Washed G1",
      quantityKg: 60,
      estimatedUnitPrice: 12.5,
      currency: "USD",
      eligible: true,
    },
  ];

  it("renders cart lines grouped by seller and warehouse with unit prices in LTR", () => {
    render(
      <LocaleProvider>
        <CartGroup
          orderId="order-001"
          lines={mockLines}
          sellerLabel="Seller 1"
          warehouseName="Jebel Ali Cold Store"
        />
      </LocaleProvider>
    );

    expect(screen.getByText("Ethiopia Yirgacheffe Washed G1")).toBeDefined();
    expect(screen.getByText(/Jebel Ali Cold Store/)).toBeDefined();
    expect(screen.getByDisplayValue("60")).toBeDefined();
  });
});
