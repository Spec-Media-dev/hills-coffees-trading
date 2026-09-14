import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ORDER_SHIPMENT_STATUSES } from "@/lib/orders/validation";
import { BookInput, CancelShipmentInput, ConfirmCapacityInput, DB_BLOCK_07_DRAFT_EXCEPTIONS, DispatchInput, FailShipmentInput, MarkReadyInput, RecordDeliveryInput, ReserveInput, StartPickingInput } from "@/lib/delivery/validation";
import { mapDeliveryError } from "@/lib/delivery/errors";
import { BUYER_PERMITTED_FROM_DRAFT, SHIPMENT_TRANSITIONS, isTransitionDisplayable } from "@/lib/delivery/transitions";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN A1 (T001-T004) — proofs for the delivery domain's foundation: status vocabulary
 * reuse, warehouse-operation input validation, error mapping (including reuse of the established
 * `mapShipmentError`), and the UI-affordance transition map's fidelity to the LIVE trigger graph.
 */
describe("T001 — status vocabulary is reused from lib/orders/validation.ts, not redefined", () => {
  it("ORDER_SHIPMENT_STATUSES is exactly the live order_shipments_status_allowed allowlist, in order", () => {
    expect(ORDER_SHIPMENT_STATUSES).toEqual(["DRAFT", "REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED", "FAILED", "DISPUTED"]);
  });

  it("lib/delivery/types.ts does not redefine OrderShipmentDTO/ShipmentItemDTO — only re-exports and extends", () => {
    const source = readFileSync("lib/delivery/types.ts", "utf8");
    expect(source).toContain('import type { OrderShipmentDTO, OrderShipmentStatus, ShipmentItemDTO } from "@/lib/orders/validation"');
    expect(source).not.toMatch(/export type OrderShipmentDTO = \{/);
    expect(source).not.toMatch(/export type ShipmentItemDTO = \{/);
  });
});

describe("T001 — warehouse-operation input schemas accept only an identifier (plus reason where applicable), never a client-selectable status", () => {
  it.each([
    ["ConfirmCapacityInput", ConfirmCapacityInput],
    ["MarkReadyInput", MarkReadyInput],
    ["ReserveInput", ReserveInput],
    ["StartPickingInput", StartPickingInput],
    ["BookInput", BookInput],
    ["DispatchInput", DispatchInput],
  ])("%s accepts a valid shipmentId and ignores a client-supplied status field", (_name, schema) => {
    const validId = "00000000-0000-4000-8000-000000000000";
    const result = schema.safeParse({ shipmentId: validId, status: "DELIVERED" });
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data)).toEqual(["shipmentId"]);
  });

  it("FailShipmentInput/CancelShipmentInput require a non-empty reason", () => {
    const validId = "00000000-0000-4000-8000-000000000000";
    expect(FailShipmentInput.safeParse({ shipmentId: validId, reason: "" }).success).toBe(false);
    expect(FailShipmentInput.safeParse({ shipmentId: validId, reason: "Carrier unavailable." }).success).toBe(true);
    expect(CancelShipmentInput.safeParse({ shipmentId: validId }).success).toBe(false);
  });

  it("RecordDeliveryInput requires at least one item and rejects a negative delivered quantity", () => {
    const validId = "00000000-0000-4000-8000-000000000000";
    expect(RecordDeliveryInput.safeParse({ shipmentId: validId, items: [] }).success).toBe(false);
    expect(RecordDeliveryInput.safeParse({ shipmentId: validId, items: [{ shipmentItemId: validId, deliveredQuantityKg: -1 }] }).success).toBe(false);
    expect(RecordDeliveryInput.safeParse({ shipmentId: validId, items: [{ shipmentItemId: validId, deliveredQuantityKg: 10 }] }).success).toBe(true);
  });
});

describe("T002 — mapDeliveryError reuses lib/orders/errors.ts for every current exception, never redefining the map", () => {
  const source = readFileSync("lib/delivery/errors.ts", "utf8");

  it("imports and delegates to the established mapShipmentError, rather than reimplementing the shipment error map", () => {
    expect(source).toContain('import { mapShipmentError } from "@/lib/orders/errors"');
    expect(source).not.toMatch(/warehouse_required_for_operational_shipment_status:\s*ACTION_FEEDBACK/);
  });

  it("known current shipment exceptions map through to a safe code (delegated)", () => {
    expect(mapDeliveryError({ message: "shipment_plan_is_closed" })).toBe(ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
    expect(mapDeliveryError({ message: "only_warehouse_can_record_delivery" })).toBe(ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE);
    expect(mapDeliveryError({ message: "delivered_quantity_exceeds_plan" })).toBe(ACTION_FEEDBACK.SHIPMENT_ITEM_QUANTITY_INVALID);
  });

  it("the DB-BLOCK-07 draft exceptions map to controlled codes, forward-compatible and not yet reachable in the live database", () => {
    for (const exception of DB_BLOCK_07_DRAFT_EXCEPTIONS) {
      const mapped = mapDeliveryError({ message: exception });
      expect(Object.values(ACTION_FEEDBACK)).toContain(mapped);
    }
    expect(mapDeliveryError({ message: "delivery_reservation_requires_settled_order" })).toBe(ACTION_FEEDBACK.SHIPMENT_ORDER_NOT_SETTLED);
  });

  it("an unrecognized error falls back to the generic safe code without throwing", () => {
    expect(mapDeliveryError(null)).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
    expect(mapDeliveryError({ message: "something entirely new" })).toBe(ACTION_FEEDBACK.SHIPMENT_SAVE_FAILED);
  });

  it("never constructs a raw-error passthrough or a second toast system", () => {
    expect(source).not.toMatch(/toast\(/);
    expect(source).not.toMatch(/createContext.*[Tt]oast/);
  });
});

/** Strips comments so a doc comment legitimately naming a forbidden pattern to explain its deliberate
 * absence never trips a "must not contain X" check — same precedent as `tests/orders/read.test.ts`/
 * `tests/finance/read.test.ts#stripComments`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T003 — lib/delivery/read.ts reuses buyer-scoped reads, never select(\"*\"), never a cache directive", () => {
  const source = readFileSync("lib/delivery/read.ts", "utf8");
  const code = stripComments(source);

  it("re-exports getOrderShipments/getShipmentItems from lib/orders/read.ts rather than redefining them", () => {
    expect(source).toContain('import { getOrderShipments, getShipmentItems } from "@/lib/orders/read"');
    expect(source).toContain("export { getOrderShipments, getShipmentItems };");
  });

  it("never uses a broad select(\"*\")", () => {
    expect(code).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("never uses a shared cache directive or a service-role client (in actual code, not doc comments)", () => {
    expect(code).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag|Redis|Upstash/);
    expect(code).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

describe("T004 — SHIPMENT_TRANSITIONS matches the LIVE validate_shipment_transition graph exactly", () => {
  it("matches every permitted transition read directly from the live trigger body", () => {
    expect(SHIPMENT_TRANSITIONS.DRAFT).toEqual(["REQUESTED", "READY", "CANCELLED"]);
    expect(SHIPMENT_TRANSITIONS.REQUESTED).toEqual(["CAPACITY_CONFIRMED", "READY", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.CAPACITY_CONFIRMED).toEqual(["RESERVED", "READY", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.READY).toEqual(["RESERVED", "BOOKED", "PICKING", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.RESERVED).toEqual(["PICKING", "BOOKED", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.PICKING).toEqual(["DISPATCHED", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.BOOKED).toEqual(["DISPATCHED", "CANCELLED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.DISPATCHED).toEqual(["PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.PARTIALLY_DELIVERED).toEqual(["DELIVERED", "FAILED", "DISPUTED"]);
    expect(SHIPMENT_TRANSITIONS.DELIVERED).toEqual([]);
    expect(SHIPMENT_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it("FAILED and DISPUTED are deliberately empty (application-level narrowing), matching this file's own documented caveat", () => {
    expect(SHIPMENT_TRANSITIONS.FAILED).toEqual([]);
    expect(SHIPMENT_TRANSITIONS.DISPUTED).toEqual([]);
    const source = readFileSync("lib/delivery/transitions.ts", "utf8");
    expect(source).toMatch(/NO DB-ENFORCED FORWARD LIMIT/);
  });

  it("every status is covered by SHIPMENT_TRANSITIONS with no missing/extra key", () => {
    expect(Object.keys(SHIPMENT_TRANSITIONS).sort()).toEqual([...ORDER_SHIPMENT_STATUSES].sort());
  });

  it("BUYER_PERMITTED_FROM_DRAFT is the narrow buyer subset, not the full DRAFT transition list (READY excluded — warehouse/internal only)", () => {
    expect(BUYER_PERMITTED_FROM_DRAFT).toEqual(["REQUESTED", "CANCELLED"]);
    expect(BUYER_PERMITTED_FROM_DRAFT).not.toContain("READY");
  });

  it("exports no function that authorizes a write — only a boolean display hint", () => {
    const source = readFileSync("lib/delivery/transitions.ts", "utf8");
    expect(source).not.toMatch(/createClient|\.from\(|\.update\(|\.insert\(/);
    expect(isTransitionDisplayable("DRAFT", "REQUESTED")).toBe(true);
    expect(isTransitionDisplayable("DELIVERED", "DRAFT")).toBe(false);
  });
});
