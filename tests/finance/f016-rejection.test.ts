import { describe, expect, it } from "vitest";
import {
  buildF016OrderGraph,
  buildF016RejectedGraph,
} from "./f016-fixtures";

describe("Feature 016 T044: Finance Terminal Rejection Invariants & Zero Artifact Tests", () => {
  it("verifies terminal rejection state transitions and backing-position-before-offer release", () => {
    const unreviewed = buildF016OrderGraph();
    const rejected = buildF016RejectedGraph(
      "16030000-0000-0000-0000-000000000002",
      "Bank transfer reference not found in bank ledger"
    );

    // 1. Order and Payment become terminal REJECTED
    expect(rejected.order.status).toBe("PAYMENT_REJECTED");
    expect(rejected.payment.status).toBe("REJECTED");
    expect(rejected.payment.rejectedReason).toBe("Bank transfer reference not found in bank ledger");

    // 2. Exact finalized payment proof becomes REJECTED
    expect(rejected.paymentProof.status).toBe("REJECTED");

    // 3. Reservation is RELEASED with reason REJECTED
    expect(rejected.reservation.status).toBe("RELEASED");
    expect(rejected.reservation.releaseReason).toBe("REJECTED");
    expect(rejected.reservation.releasedAt).toBeDefined();

    // 4. Backing seller position reserved quantity is released
    const initialSellerReserved = unreviewed.sellerPositions[0]!.reservedQuantityKg;
    const reservedQty = unreviewed.reservationItems[0]!.quantityKg;
    const finalSellerReserved = rejected.sellerPositions[0]!.reservedQuantityKg;

    expect(finalSellerReserved).toBe(initialSellerReserved - reservedQty);
    expect(finalSellerReserved).toBe(0);

    // Available quantity is untouched (already reflects available stock; reserved hold is lifted)
    expect(rejected.sellerPositions[0]!.availableQuantityKg).toBe(
      unreviewed.sellerPositions[0]!.availableQuantityKg
    );
  });

  it("proves ZERO tax invoice, ownership transfer, or FULFILLMENT shipment artifacts exist on rejection", () => {
    const rejected = buildF016RejectedGraph();

    // Zero tax invoices
    expect(rejected.taxInvoice).toBeUndefined();

    // Zero ownership events
    expect(rejected.ownershipEvents).toBeUndefined();

    // Zero FULFILLMENT shipments
    expect(rejected.shipments).toBeUndefined();

    // Zero buyer positions created
    expect(rejected.buyerPositions.length).toBe(0);
  });

  it("verifies review record captures decision and non-blank mandatory reason", () => {
    const reasonText = "Wire transfer slip blurred and unreadable";
    const rejected = buildF016RejectedGraph(
      "16030000-0000-0000-0000-000000000002",
      reasonText
    );

    expect(rejected.review).toBeDefined();
    expect(rejected.review!.decision).toBe("REJECTED");
    expect(rejected.review!.reason).toBe(reasonText);
    expect(rejected.review!.reason?.trim().length).toBeGreaterThanOrEqual(3);
  });
});
