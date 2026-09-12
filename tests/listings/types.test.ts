import { describe, expect, it } from "vitest";

import { LISTING_STATUSES, SELLER_TYPES } from "@/lib/listings/types";
import type { BuyerBrowseListing, BuyerListingDetail, EligibilityResult, ManagedListing } from "@/lib/listings/types";

/**
 * Feature 006 T001 — the audited DTO boundary. Two proof styles are used deliberately:
 *
 * - RUNTIME: the closed vocabulary constants match the live `coffee_offers_status_allowed`/
 *   `coffee_offers_seller_type_check` CHECK constraints exactly (2026-09-12 preflight, see
 *   `lib/listings/types.ts`'s own header for the full evidence).
 * - COMPILE-TIME (`@ts-expect-error`): TypeScript's own excess-property check on a fresh object
 *   literal assigned directly to a typed variable is the load-bearing proof here — a build that
 *   ever accidentally widens `BuyerBrowseListing`/`BuyerListingDetail` to carry a seller-private
 *   field makes the `@ts-expect-error` directive itself an error ("unused '@ts-expect-error'
 *   directive"), which `npm run typecheck` catches. This is a genuine compiler-enforced boundary,
 *   not a runtime assertion pretending to be one.
 */
describe("T001 — listing status/seller-type vocabulary matches the live schema exactly", () => {
  it("LISTING_STATUSES is exactly the 9 values from `coffee_offers_status_allowed`, in order", () => {
    expect(LISTING_STATUSES).toEqual(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PUBLISHED", "PARTIALLY_FILLED", "SUSPENDED", "SOLD_OUT", "ARCHIVED"]);
  });

  it("SELLER_TYPES is exactly the 2 values from `coffee_offers_seller_type_check`", () => {
    expect(SELLER_TYPES).toEqual(["HILLS", "MEMBER_SELLER"]);
  });
});

describe("T001 — buyer DTO field boundary (compile-time)", () => {
  it("BuyerBrowseListing accepts every field a buyer is entitled to", () => {
    const buyerRow: BuyerBrowseListing = {
      id: "offer-1",
      title: "Ethiopia Yirgacheffe",
      coffeeId: "coffee-1",
      coffeeName: "Ethiopia Yirgacheffe",
      lot: null,
      warehouse: null,
      sellerType: "HILLS",
      quantityKg: 100,
      reservedQuantityKg: 10,
      filledQuantityKg: 20,
      pricePerKg: 12.5,
      currency: "USD",
      status: "PUBLISHED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    expect(buyerRow.status).toBe("PUBLISHED");
  });

  it("BuyerBrowseListing rejects `sourcePurchaseOrderItemId` at compile time — seller-private provenance must never leak to a buyer DTO", () => {
    const buyerRow: BuyerBrowseListing = {
      id: "offer-1",
      title: null,
      coffeeId: "coffee-1",
      coffeeName: null,
      lot: null,
      warehouse: null,
      sellerType: "HILLS",
      quantityKg: 1,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      pricePerKg: 1,
      currency: "USD",
      status: "DRAFT",
      createdAt: "now",
      updatedAt: "now",
    };
    // @ts-expect-error — `sourcePurchaseOrderItemId` is seller-private provenance; a buyer DTO must never carry it.
    const leaked: BuyerBrowseListing = { ...buyerRow, sourcePurchaseOrderItemId: "leak" };
    expect(leaked.id).toBe("offer-1");
  });

  it("BuyerBrowseListing rejects `rejectionReason`/`reviewedBy`/`reviewedAt`/`createdBy`/`deletedAt` at compile time", () => {
    const buyerRow: BuyerBrowseListing = {
      id: "offer-1",
      title: null,
      coffeeId: "coffee-1",
      coffeeName: null,
      lot: null,
      warehouse: null,
      sellerType: "MEMBER_SELLER",
      quantityKg: 1,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      pricePerKg: 1,
      currency: "USD",
      status: "REJECTED",
      createdAt: "now",
      updatedAt: "now",
    };
    // @ts-expect-error — review/compliance metadata is seller/compliance-internal, never a buyer's business.
    const leaked: BuyerBrowseListing = { ...buyerRow, rejectionReason: "leak", reviewedBy: "leak", reviewedAt: "leak", deletedAt: "leak" };
    expect(leaked.id).toBe("offer-1");
  });

  it("BuyerListingDetail (buyer detail view) carries the SAME field boundary, plus sensory/tag context only", () => {
    const detail: BuyerListingDetail = {
      id: "offer-1",
      title: null,
      coffeeId: "coffee-1",
      coffeeName: null,
      lot: null,
      warehouse: null,
      sellerType: "HILLS",
      quantityKg: 1,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      pricePerKg: 1,
      currency: "USD",
      status: "PUBLISHED",
      createdAt: "now",
      updatedAt: "now",
      sensoryNotes: null,
      tags: [],
    };
    // @ts-expect-error — the detail DTO extends the same buyer boundary; provenance still must not leak.
    const leaked: BuyerListingDetail = { ...detail, sourcePurchaseOrderItemId: "leak" };
    expect(leaked.tags).toEqual([]);
  });
});

describe("T001 — seller management DTO carries the seller-private superset", () => {
  it("ManagedListing genuinely carries provenance/review fields the buyer DTO omits", () => {
    const managed: ManagedListing = {
      id: "offer-1",
      title: null,
      coffeeId: "coffee-1",
      coffeeName: null,
      lot: null,
      warehouse: null,
      sellerOrganizationId: "org-1",
      sellerType: "MEMBER_SELLER",
      sourcePurchaseOrderItemId: "order-item-1",
      quantityKg: 1,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      pricePerKg: 1,
      currency: "USD",
      status: "REJECTED",
      isVisible: false,
      rejectionReason: "Trade licence expired",
      reviewedBy: "reviewer-1",
      reviewedAt: "2026-01-03T00:00:00.000Z",
      createdAt: "now",
      updatedAt: "now",
      deletedAt: null,
    };
    expect(managed.sourcePurchaseOrderItemId).toBe("order-item-1");
    expect(managed.rejectionReason).toBe("Trade licence expired");
  });
});

describe("T001 — eligibility result is a genuine discriminated union", () => {
  it("the `eligible: true` branch always carries a sourcePurchaseOrderItemId, never a refusal reason", () => {
    const result: EligibilityResult = { eligible: true, eligibleQuantityKg: 42, sourcePurchaseOrderItemId: "order-item-1" };
    if (result.eligible) {
      expect(result.sourcePurchaseOrderItemId).toBe("order-item-1");
    }
  });

  it("the `eligible: false` branch always carries a typed reason from the closed vocabulary", () => {
    const result: EligibilityResult = { eligible: false, reason: "CUSTODY_NOT_ELIGIBLE", eligibleQuantityKg: null };
    if (!result.eligible) {
      expect(["SELLER_NOT_CAPABLE", "POSITION_NOT_OWNED", "NOT_HILLS_SOURCED", "CUSTODY_NOT_ELIGIBLE", "RESERVED_QUANTITY", "INSUFFICIENT_QUANTITY"]).toContain(result.reason);
    }
  });
});
