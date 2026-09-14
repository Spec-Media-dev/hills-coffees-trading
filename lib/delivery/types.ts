import type { OrderShipmentDTO, OrderShipmentStatus, ShipmentItemDTO } from "@/lib/orders/validation";

/**
 * Feature 009 RUN A1 (T001) — the delivery domain's shared DTO surface.
 *
 * REUSE, NOT DUPLICATION: `OrderShipmentDTO`, `ShipmentItemDTO`, `OrderShipmentStatus`, and the live
 * 13-value `ORDER_SHIPMENT_STATUSES` array (verbatim from `order_shipments_status_allowed`) were
 * already built and live-verified by Feature 007 RUN A (T001) in `lib/orders/validation.ts` — that
 * file's own header states it is the canonical DTO boundary for `orders`/`order_items`/
 * `order_shipments`/`shipment_items`. Feature 009 discovered this during RUN A1 (its own planning in
 * RUN 0 did not have full application-layer visibility, only DB-schema visibility) and deliberately
 * re-exports rather than redefines these shapes — recreating them here would be exactly the kind of
 * duplicated business logic the constitution's Engineering Standards prohibit, and would risk two
 * mappings silently drifting apart for the same live CHECK constraint.
 *
 * `ORDER_SHIPMENT_STATUSES` itself (the runtime array + Zod schema) is re-exported from
 * `lib/delivery/validation.ts`, not here — this file is types-only, mirroring the project's existing
 * `types.ts`/`validation.ts` split convention (e.g. `lib/finance/types.ts` vs. `lib/finance/validation.ts`).
 */
export type { OrderShipmentDTO, OrderShipmentStatus, ShipmentItemDTO };

/**
 * A shipment row plus the minimal order context a WAREHOUSE-facing read needs and a buyer-facing
 * read does not (the buyer already has the order in context from the page they're on).
 * Genuinely NEW — no Feature 007 equivalent exists, since 007's own actions never needed a
 * cross-organization, not-yet-orderId-scoped shipment lookup (007's buyer flow always starts from a
 * known `orderId`). Verbatim projection only — no computed field.
 */
export type ShipmentWithOrderContextDTO = OrderShipmentDTO & {
  orderCode: string;
  buyerOrganizationId: string;
};
