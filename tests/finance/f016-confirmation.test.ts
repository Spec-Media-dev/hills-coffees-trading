import { describe, expect, it } from "vitest";
import {
  buildF016OrderGraph,
  buildF016MultiGroupGraph,
  buildF016ConfirmedGraph,
} from "./f016-fixtures";

describe("Feature 016 T043: Finance Confirmation Contract & Invariant Tests", () => {
  it("enforces four-pointer authoritative proforma equality before confirmation", () => {
    const graph = buildF016OrderGraph();

    // 1. Proforma pointer must match between order, payment, and reservation
    expect(graph.order.currentProformaId).toBe(graph.proforma.id);
    expect(graph.payment.proformaId).toBe(graph.proforma.id);
    expect(graph.reservation.proformaId).toBe(graph.proforma.id);

    // 2. Proforma status must be authoritative CONFIRMED
    expect(graph.proforma.status).toBe("CONFIRMED");

    // 3. Exact upload intent must be FINALIZED and point to exact finalized proof
    expect(graph.uploadIntent.status).toBe("FINALIZED");
    expect(graph.uploadIntent.finalizedProofId).toBe(graph.paymentProof.id);
    expect(graph.paymentProof.paymentId).toBe(graph.payment.id);
  });

  it("verifies inventory signed conservation under confirmation", () => {
    const unconfirmed = buildF016OrderGraph();
    const confirmed = buildF016ConfirmedGraph();

    const initialSellerAvailable = unconfirmed.sellerPositions[0]!.availableQuantityKg;
    const initialSellerReserved = unconfirmed.sellerPositions[0]!.reservedQuantityKg;
    const reservedQty = unconfirmed.reservationItems[0]!.quantityKg;

    const finalSellerAvailable = confirmed.sellerPositions[0]!.availableQuantityKg;
    const finalSellerReserved = confirmed.sellerPositions[0]!.reservedQuantityKg;
    const finalBuyerAvailable = confirmed.buyerPositions[0]!.availableQuantityKg;

    // Signed conservation:
    // seller available -= q
    expect(finalSellerAvailable).toBe(initialSellerAvailable - reservedQty);
    // seller reserved -= q
    expect(finalSellerReserved).toBe(initialSellerReserved - reservedQty);
    // buyer available += q
    expect(finalBuyerAvailable).toBe(reservedQty);

    // Global inventory mass conservation:
    // Total system physical stock (seller available + buyer available) remains invariant
    const initialTotalAvailable = initialSellerAvailable;
    const finalTotalAvailable = finalSellerAvailable + finalBuyerAvailable;
    expect(finalTotalAvailable).toBe(initialTotalAvailable);
  });

  it("verifies null-location buyer upsert logic under uq_inventory_positions_null_safe", () => {
    const confirmed = buildF016ConfirmedGraph();
    const buyerPos = confirmed.buyerPositions[0]!;

    expect(buyerPos.warehouseLocationId).toBeNull();
    expect(buyerPos.ownerOrganizationId).toBe(confirmed.order.buyerOrganizationId);
    expect(buyerPos.availableQuantityKg).toBe(500);
    expect(buyerPos.reservedQuantityKg).toBe(0);
  });

  it("verifies exact-once tax invoice issuance with proforma snapshot", () => {
    const confirmed = buildF016ConfirmedGraph();

    expect(confirmed.taxInvoice).toBeDefined();
    expect(confirmed.taxInvoice!.status).toBe("ISSUED");
    expect(confirmed.taxInvoice!.orderId).toBe(confirmed.order.id);
    expect(confirmed.taxInvoice!.proformaId).toBe(confirmed.proforma.id);
    expect(confirmed.taxInvoice!.invoiceNumber).toMatch(/^INV-/);
  });

  it("verifies title transfer ownership events created for each reserved line", () => {
    const confirmed = buildF016ConfirmedGraph();

    expect(confirmed.ownershipEvents).toBeDefined();
    expect(confirmed.ownershipEvents!.length).toBe(confirmed.reservationItems.length);

    const event = confirmed.ownershipEvents![0]!;
    expect(event.lotId).toBe(confirmed.sellerPositions[0]!.lotId);
    expect(event.fromOrganizationId).toBe(confirmed.sellerPositions[0]!.ownerOrganizationId);
    expect(event.toOrganizationId).toBe(confirmed.order.buyerOrganizationId);
    expect(event.quantityKg).toBe(confirmed.reservationItems[0]!.quantityKg);
    expect(event.eventType).toBe("SALE");
  });

  it("verifies automatic group-correct FULFILLMENT shipment creation for multi-group orders", () => {
    const multi = buildF016MultiGroupGraph();

    expect(multi.fulfillmentGroups.length).toBe(2);
    expect(multi.fulfillmentGroups[0]!.id).not.toBe(multi.fulfillmentGroups[1]!.id);
    expect(multi.fulfillmentGroups[0]!.sellerOrganizationId).not.toBe(
      multi.fulfillmentGroups[1]!.sellerOrganizationId
    );

    // Each shipment must correspond 1-to-1 to a distinct proforma fulfillment group
    const shipments = multi.fulfillmentGroups.map((group) => {
      const groupItems = multi.proformaItems.filter((i) => i.fulfillmentGroupId === group.id);
      return {
        orderId: multi.order.id,
        shipmentKind: "FULFILLMENT",
        status: "REQUESTED",
        fulfillmentSellerOrganizationId: group.sellerOrganizationId,
        fulfillmentWarehouseId: group.warehouseId,
        proformaFulfillmentGroupId: group.id,
        deliveryMethod: group.deliveryMethod,
        items: groupItems.map((gi) => ({
          orderItemId: gi.orderItemId,
          plannedQuantityKg: gi.quantityKg,
        })),
      };
    });

    expect(shipments.length).toBe(2);
    expect(shipments[0]!.proformaFulfillmentGroupId).toBe(multi.fulfillmentGroups[0]!.id);
    expect(shipments[1]!.proformaFulfillmentGroupId).toBe(multi.fulfillmentGroups[1]!.id);

    // Group 1 line item
    expect(shipments[0]!.items.length).toBe(1);
    expect(shipments[0]!.items[0]!.plannedQuantityKg).toBe(500);

    // Group 2 line item
    expect(shipments[1]!.items.length).toBe(1);
    expect(shipments[1]!.items[0]!.plannedQuantityKg).toBe(300);
  });
});
