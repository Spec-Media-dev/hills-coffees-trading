import { z } from "zod";

/**
 * Feature 007 RUN A (T001) — the order/draft/shipment domain's audited DTO boundary and Zod
 * validation. Every consumer (`lib/orders/read.ts`, `lib/orders/drafts.ts`, this feature's Server
 * Actions and pages) imports these shapes rather than querying `orders`/`order_items`/
 * `order_financials`/`proforma_invoices`/`order_status_history`/`order_shipments`/`shipment_items`
 * directly — mirrors `lib/listings/types.ts`'s own established convention exactly.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * STATUS VOCABULARIES — CONFIRMED AGAINST THE LIVE SCHEMA (2026-09-13 preflight, live
 * `database-schema-report.json` + function/trigger bodies read directly, per the run directive's
 * own "authoritative source order" — no assumption is carried over from an older planning doc)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** `orders.status`'s own CHECK constraint (`orders_status_check`) — exactly twelve values, no invented alias. */
export const ORDER_STATUSES = [
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
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** `payments.status`'s own CHECK constraint (`payments_status_check`). RUN A never creates a payment row — this is forward DTO surface only. */
export const PAYMENT_STATUSES = ["PENDING", "PROOF_SUBMITTED", "UNDER_REVIEW", "CONFIRMED", "REJECTED", "EXPIRED", "VOID"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** `proforma_invoices.status`'s own CHECK constraint (`proforma_invoices_status_check`). */
export const PROFORMA_STATUSES = ["ISSUED", "PAID", "VOID"] as const;
export type ProformaStatus = (typeof PROFORMA_STATUSES)[number];

/** `order_shipments.status`'s own CHECK constraint (`order_shipments_status_allowed`) — thirteen values. */
export const ORDER_SHIPMENT_STATUSES = [
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
] as const;
export type OrderShipmentStatus = (typeof ORDER_SHIPMENT_STATUSES)[number];

/** `order_items.seller_type_snapshot`'s own CHECK constraint (`order_items_seller_type_snapshot_check`). */
export const ORDER_ITEM_SELLER_TYPES = ["HILLS", "MEMBER_SELLER"] as const;
export type OrderItemSellerType = (typeof ORDER_ITEM_SELLER_TYPES)[number];

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DTOs — every financial/snapshot field is a VERBATIM pass-through of its stored column. No DTO
 * here computes a total, tax, commission, or "helpful" derived figure — see `read.ts`'s own header
 * for the pass-through rule this file's shapes exist to enforce at the type level.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The buyer's own order — `orders` row, `can_view_order`-scoped. */
export type OrderSummary = {
  id: string;
  orderCode: string;
  buyerOrganizationId: string;
  status: OrderStatus;
  currency: string;
  holdStartedAt: string | null;
  holdExpiresAt: string | null;
  confirmedAt: string | null;
  paidAt: string | null;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  correlationId: string | null;
};

/** One `order_items` row — carries its OWN point-in-time snapshot (never re-derived from `coffee_offers`/`coffee_lots`). */
export type OrderItemDTO = {
  id: string;
  orderId: string;
  offerId: string;
  lotId: string;
  sellerOrganizationId: string;
  quantityKg: number;
  unitPricePerKg: number;
  productNameSnapshot: string;
  originNameSnapshot: string | null;
  variantNameSnapshot: string | null;
  lotCodeSnapshot: string;
  sellerTypeSnapshot: OrderItemSellerType;
  currency: string;
  createdAt: string;
};

/** `order_financials` — a snapshot written ONCE by `checkout_order()`; `null` until checkout has run (every RUN A order). */
export type OrderFinancialsDTO = {
  orderId: string;
  baseSubtotal: number;
  shippingAmount: number;
  vatAmount: number;
  commissionAmount: number;
  sellerNetAmount: number;
  buyerTotalAmount: number;
  totalQuantityKg: number;
  currency: string;
  commissionPolicyId: string | null;
  commissionPercentageSnapshot: number | null;
  taxRuleId: string | null;
  taxPercentageSnapshot: number | null;
  taxBaseSnapshot: string | null;
  calculatedAt: string;
};

export type ProformaItemDTO = {
  id: string;
  proformaId: string;
  orderItemId: string;
  description: string;
  quantityKg: number | null;
  unitPrice: number | null;
  amount: number;
};

/** `proforma_invoices` + its items — issued ONLY by `checkout_order()`; `null` until checkout has run. */
export type ProformaDTO = {
  id: string;
  orderId: string;
  proformaCode: string;
  status: ProformaStatus;
  issuedAt: string;
  validUntil: string | null;
  fileAssetId: string | null;
  items: readonly ProformaItemDTO[];
};

export type OrderStatusHistoryEntry = {
  id: string;
  orderId: string;
  oldStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedBy: string | null;
  reason: string | null;
  createdAt: string;
};

/** One `order_shipments` row — the buyer-owned planning slice this feature governs (DRAFT/REQUESTED only). */
export type OrderShipmentDTO = {
  id: string;
  orderId: string;
  shipmentCode: string;
  status: OrderShipmentStatus;
  deliveryMethod: string;
  countryCode: string;
  city: string | null;
  addressLine: string;
  contactName: string;
  contactPhone: string;
  shippingFee: number;
  currency: string;
  readyAt: string | null;
  deliveredAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentItemDTO = {
  id: string;
  shipmentId: string;
  orderItemId: string;
  plannedQuantityKg: number;
  deliveredQuantityKg: number;
};

export type PaginatedOrders<T> = {
  rows: readonly T[];
  hasMore: boolean;
};

/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * VALIDATION — Zod schemas for the RUN A write surface only (draft item add, shipment planning).
 * VALIDATION IS NOT AUTHORIZATION (restated from `lib/listings/validation.ts`'s own rule): a
 * well-formed shape here proves nothing about ownership/eligibility/status legality —
 * `validate_order_item_offer`/`validate_shipment_transition`/`validate_shipment_item` remain the
 * final authority regardless of what this schema accepts.
 *
 * NEVER present in any schema below (the run directive's own explicit list, restated as a
 * structural guarantee): `buyerOrganizationId`/`sellerOrganizationId`/`createdBy`/any status field/
 * any commercial total/`reservedQuantityKg`/`filledQuantityKg`/`unitPricePerKg`/any provenance
 * snapshot field. All of those are server/trigger-derived — see `drafts.ts`'s own insert allowlists.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

const uuid = (fieldLabel: string) => z.uuid({ error: `Choose a valid ${fieldLabel}.` });

/** T004 — the only client-supplied fields when adding an item to a DRAFT order. */
export const AddOrderItemInput = z.object({
  offerId: uuid("listing"),
  quantityKg: z.coerce.number({ error: "Enter a quantity." }).positive("Quantity must be greater than zero.").finite("Enter a valid quantity."),
});
export type AddOrderItemInput = z.infer<typeof AddOrderItemInput>;

/**
 * T007 — buyer-owned shipment planning details. Every field here is genuine buyer-supplied
 * information (delivery method/address/contact) — NOT `shipping_fee` (server/warehouse-derived
 * later, defaults to 0, never client-set) and NOT `status` (server-derived, defaults to `DRAFT`).
 */
export const CreateShipmentInput = z.object({
  deliveryMethod: z.string().trim().min(1, "Choose a delivery method.").max(100, "Keep the delivery method under 100 characters."),
  countryCode: z
    .string()
    .trim()
    .length(2, "Use a 2-letter country code.")
    .transform((value) => value.toUpperCase()),
  city: z.string().trim().max(120, "Keep the city under 120 characters.").optional(),
  addressLine: z.string().trim().min(1, "Enter a delivery address.").max(300, "Keep the address under 300 characters."),
  contactName: z.string().trim().min(1, "Enter a contact name.").max(150, "Keep the contact name under 150 characters."),
  contactPhone: z.string().trim().min(1, "Enter a contact phone number.").max(40, "Keep the phone number under 40 characters."),
});
export type CreateShipmentInput = z.infer<typeof CreateShipmentInput>;

/** T007 — planning a quantity of one existing order item onto a DRAFT shipment. */
export const AddShipmentItemInput = z.object({
  orderItemId: uuid("order item"),
  plannedQuantityKg: z.coerce.number({ error: "Enter a planned quantity." }).positive("Planned quantity must be greater than zero.").finite("Enter a valid quantity."),
});
export type AddShipmentItemInput = z.infer<typeof AddShipmentItemInput>;
