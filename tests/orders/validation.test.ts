import { describe, expect, it } from "vitest";

import {
  AddOrderItemInput,
  AddShipmentItemInput,
  CreateShipmentInput,
  ORDER_ITEM_SELLER_TYPES,
  ORDER_SHIPMENT_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PROFORMA_STATUSES,
} from "@/lib/orders/validation";

/**
 * Feature 007 RUN A (T001) — status vocabulary and Zod schema proofs. The exact expected arrays
 * below were read directly from the live `orders_status_check`/`payments_status_check`/
 * `proforma_invoices_status_check`/`order_shipments_status_allowed`/
 * `order_items_seller_type_snapshot_check` CHECK constraints (2026-09-13 preflight against
 * `docs/database/database-schema-report.json`) — this test guards against silent drift, it does not
 * re-derive the schema itself.
 */
describe("T001 — status vocabularies match the live CHECK constraints exactly", () => {
  it("ORDER_STATUSES matches orders_status_check", () => {
    expect(ORDER_STATUSES).toEqual([
      "DRAFT",
      "CONFIRMED",
      "HOLD",
      "PAYMENT_PROOF_SUBMITTED",
      "PAYMENT_UNDER_REVIEW",
      "PAID",
      "FULFILLMENT_IN_PROGRESS",
      "PARTIALLY_DELIVERED",
      "COMPLETED",
      "EXPIRED",
      "VOID",
      "DISPUTED",
      "PROFORMA_ISSUED",
      "CANCELLED",
      "PAYMENT_REJECTED",
    ]);
  });

  it("PAYMENT_STATUSES matches payments_status_check", () => {
    expect(PAYMENT_STATUSES).toEqual(["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "EXPIRED", "VOID"]);
  });

  it("PROFORMA_STATUSES matches proforma_invoices_status_check", () => {
    expect(PROFORMA_STATUSES).toEqual([
      "ISSUED",
      "CONFIRMED",
      "PAID",
      "EXPIRED",
      "SUPERSEDED",
      "CANCELLED",
      "VOID",
    ]);
  });

  it("ORDER_SHIPMENT_STATUSES matches order_shipments_status_allowed", () => {
    expect(ORDER_SHIPMENT_STATUSES).toEqual([
      "DRAFT",
      "REQUESTED",
      "CAPACITY_CONFIRMED",
      "READY",
      "RESERVED",
      "PICKING",
      "BOOKED",
      "DISPATCHED",
      "PARTIALLY_DELIVERED",
      "DELIVERED",
      "CANCELLED",
      "FAILED",
      "DISPUTED",
    ]);
  });

  it("ORDER_ITEM_SELLER_TYPES matches order_items_seller_type_snapshot_check", () => {
    expect(ORDER_ITEM_SELLER_TYPES).toEqual(["HILLS", "MEMBER_SELLER"]);
  });
});

describe("T001 — no DTO in this file exposes a computed total (source-level proof)", () => {
  it("validation.ts never performs arithmetic on a financial/quantity figure", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/orders/validation.ts", "utf8");
    // A DTO/type file has no business computing a total — only Zod chain methods (.min/.max/...)
    // legitimately contain numeric literals; there must be no `+`/`*` arithmetic on a domain field.
    expect(source).not.toMatch(/base_subtotal|buyer_total_amount/i);
    expect(source).not.toMatch(/quantityKg\s*\*|amount\s*\+/);
  });
});

describe("T004/SEC — AddOrderItemInput never accepts a security-authority field (VALIDATION IS NOT AUTHORIZATION)", () => {
  it("parses only offerId/quantityKg; a forged extra field is silently stripped, never carried through", () => {
    const parsed = AddOrderItemInput.safeParse({
      offerId: "11111111-1111-4111-8111-111111111111",
      quantityKg: "10",
      unitPricePerKg: 999,
      sellerOrganizationId: "forged",
      status: "PUBLISHED",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ offerId: "11111111-1111-4111-8111-111111111111", quantityKg: 10 });
    expect((parsed.data as Record<string, unknown>).unitPricePerKg).toBeUndefined();
    expect((parsed.data as Record<string, unknown>).sellerOrganizationId).toBeUndefined();
    expect((parsed.data as Record<string, unknown>).status).toBeUndefined();
  });

  it("rejects a non-positive quantity and a malformed offer id", () => {
    expect(AddOrderItemInput.safeParse({ offerId: "not-a-uuid", quantityKg: 10 }).success).toBe(false);
    expect(AddOrderItemInput.safeParse({ offerId: "11111111-1111-4111-8111-111111111111", quantityKg: 0 }).success).toBe(false);
    expect(AddOrderItemInput.safeParse({ offerId: "11111111-1111-4111-8111-111111111111", quantityKg: -5 }).success).toBe(false);
  });
});

describe("T007 — CreateShipmentInput/AddShipmentItemInput never accept shippingFee/status/createdBy", () => {
  it("CreateShipmentInput strips a forged shippingFee/status/createdBy", () => {
    const parsed = CreateShipmentInput.safeParse({
      deliveryMethod: "Courier",
      countryCode: "ae",
      addressLine: "1 Example Street",
      contactName: "Jane Buyer",
      contactPhone: "+971500000000",
      shippingFee: 999,
      status: "READY",
      createdBy: "forged",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({
      deliveryMethod: "Courier",
      countryCode: "AE",
      addressLine: "1 Example Street",
      contactName: "Jane Buyer",
      contactPhone: "+971500000000",
    });
    expect((parsed.data as Record<string, unknown>).shippingFee).toBeUndefined();
    expect((parsed.data as Record<string, unknown>).status).toBeUndefined();
  });

  it("AddShipmentItemInput requires a positive planned quantity and a valid order item id", () => {
    expect(AddShipmentItemInput.safeParse({ orderItemId: "not-a-uuid", plannedQuantityKg: 5 }).success).toBe(false);
    expect(AddShipmentItemInput.safeParse({ orderItemId: "11111111-1111-4111-8111-111111111111", plannedQuantityKg: 0 }).success).toBe(false);
    expect(AddShipmentItemInput.safeParse({ orderItemId: "11111111-1111-4111-8111-111111111111", plannedQuantityKg: 5 }).success).toBe(true);
  });
});
