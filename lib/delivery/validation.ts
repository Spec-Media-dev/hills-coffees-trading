import { z } from "zod";

import { ORDER_SHIPMENT_STATUSES, type OrderShipmentStatus } from "@/lib/orders/validation";

/**
 * Feature 009 RUN A1 (T001) — the delivery domain's own validation surface.
 *
 * REUSE, NOT DUPLICATION: the 13-value shipment status vocabulary (`ORDER_SHIPMENT_STATUSES`, its
 * `OrderShipmentStatus` type, and `CreateShipmentInput`/`AddShipmentItemInput` for the buyer-owned
 * DRAFT-planning surface) already exist in `lib/orders/validation.ts`, built and live-verified by
 * Feature 007 RUN A — see `lib/delivery/types.ts`'s header for the full reasoning. This file
 * re-exports the status vocabulary for delivery-domain call sites and adds ONLY the genuinely new
 * input contracts Feature 009 itself needs: the warehouse operational-transition surface, which
 * Feature 007 explicitly and deliberately never built (`shipment/actions.ts`'s own header: "this
 * file never sets, exposes, or even names a later status as a selectable option").
 *
 * VALIDATION IS NOT AUTHORIZATION (same rule `lib/orders/validation.ts`/`lib/listings/validation.ts`
 * already state): a well-formed shape here proves nothing about role/ownership/state legality —
 * `validate_shipment_transition`/`validate_shipment_item` remain the final authority. None of these
 * schemas accepts a status value directly from the client; each warehouse operation's TARGET status
 * is a literal the calling function (Phase 3's `lib/delivery/warehouse.ts`) supplies itself — never a
 * client-selectable field, exactly mirroring `requestShipment`'s own "no status selector at all" rule.
 */
export { ORDER_SHIPMENT_STATUSES };
export type { OrderShipmentStatus };

const uuid = (fieldLabel: string) => z.uuid({ error: `Choose a valid ${fieldLabel}.` });

/** Every warehouse operation targets exactly one shipment — the only client-supplied identifier. */
export const ShipmentIdInput = z.object({
  shipmentId: uuid("shipment"),
});
export type ShipmentIdInput = z.infer<typeof ShipmentIdInput>;

/** `confirmCapacity`, `markReady`, `reserve`, `startPicking`, `book`, `dispatch` — identifier only; no other field is client-supplied for these transitions. */
export const ConfirmCapacityInput = ShipmentIdInput;
export type ConfirmCapacityInput = ShipmentIdInput;
export const MarkReadyInput = ShipmentIdInput;
export type MarkReadyInput = ShipmentIdInput;
export const ReserveInput = ShipmentIdInput;
export type ReserveInput = ShipmentIdInput;
export const StartPickingInput = ShipmentIdInput;
export type StartPickingInput = ShipmentIdInput;
export const BookInput = ShipmentIdInput;
export type BookInput = ShipmentIdInput;
export const DispatchInput = ShipmentIdInput;
export type DispatchInput = ShipmentIdInput;

/** `fail`/`cancel` (warehouse-initiated) — a shipment id plus the mandatory reason `payment_reviews`-style actions already require project-wide. */
export const FailShipmentInput = z.object({
  shipmentId: uuid("shipment"),
  reason: z.string().trim().min(1, "Enter a reason.").max(500, "Keep the reason under 500 characters."),
});
export type FailShipmentInput = z.infer<typeof FailShipmentInput>;

export const CancelShipmentInput = z.object({
  shipmentId: uuid("shipment"),
  reason: z.string().trim().min(1, "Enter a reason.").max(500, "Keep the reason under 500 characters."),
});
export type CancelShipmentInput = z.infer<typeof CancelShipmentInput>;

/**
 * `recordDelivery` — per-item delivered quantities only. `shipmentItemId` identifies the row;
 * `deliveredQuantityKg` is the NEW absolute total for that item (never a delta the app computes) —
 * `validate_shipment_item`'s own `delivered_quantity_cannot_decrease`/`delivered_quantity_exceeds_plan`
 * checks remain the authority on whether a given value is acceptable.
 */
export const RecordDeliveryItemInput = z.object({
  shipmentItemId: uuid("shipment item"),
  deliveredQuantityKg: z.coerce.number({ error: "Enter a delivered quantity." }).nonnegative("Delivered quantity cannot be negative.").finite("Enter a valid quantity."),
});
export type RecordDeliveryItemInput = z.infer<typeof RecordDeliveryItemInput>;

export const RecordDeliveryInput = z.object({
  shipmentId: uuid("shipment"),
  items: z.array(RecordDeliveryItemInput).min(1, "Record at least one item's delivered quantity."),
});
export type RecordDeliveryInput = z.infer<typeof RecordDeliveryInput>;

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DB-BLOCK-07 / T005 — draft exception vocabulary the Phase 2 database design will raise. NOT YET
 * IMPLEMENTED IN THE DATABASE (no migration is applied in RUN A1) — named here so `lib/delivery/
 * errors.ts` (T002) and the draft migration SQL (T007) use the SAME strings rather than inventing
 * them independently. See `specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md` for the full design
 * these names come from.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const DB_BLOCK_07_DRAFT_EXCEPTIONS = [
  "delivery_reservation_requires_settled_order",
  "delivery_reservation_insufficient_inventory",
  "delivery_reservation_position_missing",
] as const;
