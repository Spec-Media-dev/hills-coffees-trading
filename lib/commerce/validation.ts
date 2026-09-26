import { z } from "zod";

export type * from "./types";

import type {
  CommerceFlow,
  InventoryReservationReleaseReason,
  InventoryReservationStatus,
  ManualAdjustmentKind,
  NotificationEventStatus,
  OrderShipmentKind,
  OrderStatus,
  PaymentMethod,
  PaymentProofStatus,
  PaymentReviewDecision,
  PaymentStatus,
  PayoutStatus,
  ProformaStatus,
  PromotionScope,
  PromotionStatus,
  ReconciliationCaseKind,
  ReconciliationCaseStatus,
  ReconciliationResolutionType,
  TaxInvoiceStatus,
} from "./types";

// ── Orders & Commerce Flow (M1) ──────────────────────────────────────────────────────────────────

/** `orders.commerce_flow` CHECK constraint (`orders_commerce_flow_check`). */
export const COMMERCE_FLOWS = ["LEGACY", "BANK_TRANSFER_V1"] as const;
export const CommerceFlowSchema = z.enum(COMMERCE_FLOWS);

/**
 * `orders.status` CHECK constraint (`orders_status_check`) — exactly 15 values.
 * Expanded in M1 with PROFORMA_ISSUED, CANCELLED, PAYMENT_REJECTED.
 */
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
  "PROFORMA_ISSUED",
  "CANCELLED",
  "PAYMENT_REJECTED",
] as const;
export const OrderStatusSchema = z.enum(ORDER_STATUSES);

/** Legacy order statuses (12 values). Kept for legacy compatibility proofs. */
export const LEGACY_ORDER_STATUSES = [
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
export const LegacyOrderStatusSchema = z.enum(LEGACY_ORDER_STATUSES);

// ── Inventory Reservations (M1) ─────────────────────────────────────────────────────────────────

/** `inventory_reservations.status` CHECK constraint (`inventory_reservations_status_check`). */
export const INVENTORY_RESERVATION_STATUSES = [
  "ACTIVE",
  "CONSUMED",
  "RELEASED",
  "EXPIRED",
  "REVIEW_HOLD",
] as const;
export const InventoryReservationStatusSchema = z.enum(INVENTORY_RESERVATION_STATUSES);

/** `inventory_reservations.release_reason` CHECK constraint (`inventory_reservations_release_reason_check`). */
export const INVENTORY_RESERVATION_RELEASE_REASONS = [
  "EXPIRED",
  "CANCELLED",
  "REJECTED",
  "ADMIN_VOID",
  "EXCEPTION",
] as const;
export const InventoryReservationReleaseReasonSchema = z.enum(INVENTORY_RESERVATION_RELEASE_REASONS);

// ── Payments & Reviews (M1) ──────────────────────────────────────────────────────────────────────

/** `payments.status` CHECK constraint (`payments_status_check`) — exactly 7 values. */
export const PAYMENT_STATUSES = [
  "PENDING",
  "PROOF_SUBMITTED",
  "UNDER_REVIEW",
  "CONFIRMED",
  "REJECTED",
  "EXPIRED",
  "VOID",
] as const;
export const PaymentStatusSchema = z.enum(PAYMENT_STATUSES);

/** `payments.payment_method` CHECK constraint (`payments_payment_method_check`). */
export const PAYMENT_METHODS = ["BANK_TRANSFER", "PROVIDER"] as const;
export const PaymentMethodSchema = z.enum(PAYMENT_METHODS);

/** `payment_proofs.submission_kind` CHECK constraint (`payment_proofs_submission_kind_check`). */
export const PAYMENT_PROOF_SUBMISSION_KINDS = ["ON_TIME", "LATE_REPORT"] as const;
export const PaymentProofSubmissionKindSchema = z.enum(PAYMENT_PROOF_SUBMISSION_KINDS);

/** `payment_proofs.status` CHECK constraint (`payment_proofs_status_check`). */
export const PAYMENT_PROOF_STATUSES = [
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "IN_RECONCILIATION",
] as const;
export const PaymentProofStatusSchema = z.enum(PAYMENT_PROOF_STATUSES);

/** `payment_reviews.decision` CHECK constraint (`payment_reviews_decision_check`). */
export const PAYMENT_REVIEW_DECISIONS = [
  "CONFIRMED",
  "REJECTED",
  "SENT_TO_RECONCILIATION",
] as const;
export const PaymentReviewDecisionSchema = z.enum(PAYMENT_REVIEW_DECISIONS);

// ── Payouts (M1) ─────────────────────────────────────────────────────────────────────────────────

/**
 * `payouts.status` CHECK constraint (`payouts_status_check`) — exactly 5 values.
 * Expanded in M1 with ACCRUED.
 */
export const PAYOUT_STATUSES = [
  "PENDING_PAYOUT",
  "PROCESSING",
  "PAID",
  "VOID",
  "ACCRUED",
] as const;
export const PayoutStatusSchema = z.enum(PAYOUT_STATUSES);

/** Pre-M1 legacy payout statuses (4 values). Kept for legacy compatibility proofs. */
export const LEGACY_PAYOUT_STATUSES = [
  "PENDING_PAYOUT",
  "PROCESSING",
  "PAID",
  "VOID",
] as const;
export const LegacyPayoutStatusSchema = z.enum(LEGACY_PAYOUT_STATUSES);

// ── Proforma Invoices (M2b) ──────────────────────────────────────────────────────────────────────

/**
 * `proforma_invoices.status` CHECK constraint (`proforma_invoices_status_check`) — exactly 7 values.
 * Expanded in M2b from 3 to 7 values.
 */
export const PROFORMA_STATUSES = [
  "ISSUED",
  "CONFIRMED",
  "PAID",
  "EXPIRED",
  "SUPERSEDED",
  "CANCELLED",
  "VOID",
] as const;
export const ProformaStatusSchema = z.enum(PROFORMA_STATUSES);

/** Pre-M2b legacy proforma statuses (3 values). Kept for legacy compatibility proofs. */
export const LEGACY_PROFORMA_STATUSES = ["ISSUED", "PAID", "VOID"] as const;
export const LegacyProformaStatusSchema = z.enum(LEGACY_PROFORMA_STATUSES);

/** `proforma_invoice_items.seller_type_snapshot` CHECK constraint (`proforma_invoice_items_seller_type_check`). */
export const PROFORMA_SELLER_TYPES = ["HILLS", "MEMBER_SELLER"] as const;
export const ProformaSellerTypeSchema = z.enum(PROFORMA_SELLER_TYPES);

// ── Tax Invoices & Shipments (M2c) ───────────────────────────────────────────────────────────────

/** `tax_invoices.status` CHECK constraint (`tax_invoices_status_check`). */
export const TAX_INVOICE_STATUSES = ["ISSUED", "VOID"] as const;
export const TaxInvoiceStatusSchema = z.enum(TAX_INVOICE_STATUSES);

/** `order_shipments.shipment_kind` CHECK constraint (`order_shipments_shipment_kind_check`). */
export const ORDER_SHIPMENT_KINDS = ["DELIVERY_REQUEST", "FULFILLMENT"] as const;
export const OrderShipmentKindSchema = z.enum(ORDER_SHIPMENT_KINDS);

// ── Reconciliation Cases & Manual Adjustments (M2c) ──────────────────────────────────────────────

/** `reconciliation_cases.kind` CHECK constraint (`reconciliation_cases_kind_check`). */
export const RECONCILIATION_CASE_KINDS = [
  "LATE",
  "PARTIAL",
  "WRONG_CURRENCY",
  "DUPLICATE",
  "OTHER",
] as const;
export const ReconciliationCaseKindSchema = z.enum(RECONCILIATION_CASE_KINDS);

/** `reconciliation_cases.status` CHECK constraint (`reconciliation_cases_status_check`). */
export const RECONCILIATION_CASE_STATUSES = [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "CLOSED_NO_ACTION",
] as const;
export const ReconciliationCaseStatusSchema = z.enum(RECONCILIATION_CASE_STATUSES);

/** `reconciliation_cases.resolution_type` CHECK constraint (`reconciliation_cases_resolution_type_check`). */
export const RECONCILIATION_RESOLUTION_TYPES = [
  "REFUNDED_EXTERNALLY",
  "APPLIED_TO_NEW_ORDER",
  "NO_FUNDS_RECEIVED",
  "OTHER",
] as const;
export const ReconciliationResolutionTypeSchema = z.enum(RECONCILIATION_RESOLUTION_TYPES);

/** `manual_financial_adjustments.kind` CHECK constraint (`manual_financial_adjustments_kind_check`). */
export const MANUAL_ADJUSTMENT_KINDS = [
  "REFUND_EXTERNAL",
  "REVERSAL",
  "CORRECTION",
] as const;
export const ManualAdjustmentKindSchema = z.enum(MANUAL_ADJUSTMENT_KINDS);

// ── Promotions & Pricing (M2d) ───────────────────────────────────────────────────────────────────

/** `promotions.status` CHECK constraint (`promotions_status_check`). */
export const PROMOTION_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "ARCHIVED",
] as const;
export const PromotionStatusSchema = z.enum(PROMOTION_STATUSES);

/** `promotions.scope` CHECK constraint (`promotions_scope_check`). */
export const PROMOTION_SCOPES = ["PLATFORM", "SELLER"] as const;
export const PromotionScopeSchema = z.enum(PROMOTION_SCOPES);

/** `promotions.funding_source` CHECK constraint (`promotions_funding_source_check`). */
export const PROMOTION_FUNDING_SOURCES = ["HILLS", "SELLER"] as const;
export const PromotionFundingSourceSchema = z.enum(PROMOTION_FUNDING_SOURCES);

/** `promotions.discount_type` CHECK constraint (`promotions_discount_type_check`). */
export const PROMOTION_DISCOUNT_TYPES = ["PERCENT", "AMOUNT_PER_KG"] as const;
export const PromotionDiscountTypeSchema = z.enum(PROMOTION_DISCOUNT_TYPES);

/** `promotion_targets.target_kind` CHECK constraint (`promotion_targets_kind_check`). */
export const PROMOTION_TARGET_KINDS = [
  "OFFER",
  "COFFEE",
  "ALL_SELLER_OFFERS",
  "ALL_OFFERS",
] as const;
export const PromotionTargetKindSchema = z.enum(PROMOTION_TARGET_KINDS);

// ── Notification Outbox (M2e) ────────────────────────────────────────────────────────────────────

/** `notification_events.status` CHECK constraint (`notification_events_status_check`). */
export const NOTIFICATION_EVENT_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const;
export const NotificationEventStatusSchema = z.enum(NOTIFICATION_EVENT_STATUSES);

/** `notification_events.aggregate_type` CHECK constraint (`notification_events_aggregate_type_check`). */
export const NOTIFICATION_AGGREGATE_TYPES = [
  "proforma",
  "order",
  "payment",
  "case",
  "shipment",
  "payout",
  "campaign",
] as const;
export const NotificationAggregateTypeSchema = z.enum(NOTIFICATION_AGGREGATE_TYPES);

// ── Safe Parsers (return null rather than throwing) ──────────────────────────────────────────────

export function parseCommerceFlow(value: unknown): CommerceFlow | null {
  const parsed = CommerceFlowSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseOrderStatus(value: unknown): OrderStatus | null {
  const parsed = OrderStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePaymentStatus(value: unknown): PaymentStatus | null {
  const parsed = PaymentStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePaymentMethod(value: unknown): PaymentMethod | null {
  const parsed = PaymentMethodSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseProformaStatus(value: unknown): ProformaStatus | null {
  const parsed = ProformaStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePayoutStatus(value: unknown): PayoutStatus | null {
  const parsed = PayoutStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseReservationStatus(value: unknown): InventoryReservationStatus | null {
  const parsed = InventoryReservationStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseReleaseReason(value: unknown): InventoryReservationReleaseReason | null {
  const parsed = InventoryReservationReleaseReasonSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePaymentProofStatus(value: unknown): PaymentProofStatus | null {
  const parsed = PaymentProofStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePaymentReviewDecision(value: unknown): PaymentReviewDecision | null {
  const parsed = PaymentReviewDecisionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseTaxInvoiceStatus(value: unknown): TaxInvoiceStatus | null {
  const parsed = TaxInvoiceStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseShipmentKind(value: unknown): OrderShipmentKind | null {
  const parsed = OrderShipmentKindSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseReconciliationCaseKind(value: unknown): ReconciliationCaseKind | null {
  const parsed = ReconciliationCaseKindSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseReconciliationCaseStatus(value: unknown): ReconciliationCaseStatus | null {
  const parsed = ReconciliationCaseStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseReconciliationResolutionType(value: unknown): ReconciliationResolutionType | null {
  const parsed = ReconciliationResolutionTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseManualAdjustmentKind(value: unknown): ManualAdjustmentKind | null {
  const parsed = ManualAdjustmentKindSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePromotionStatus(value: unknown): PromotionStatus | null {
  const parsed = PromotionStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parsePromotionScope(value: unknown): PromotionScope | null {
  const parsed = PromotionScopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseNotificationEventStatus(value: unknown): NotificationEventStatus | null {
  const parsed = NotificationEventStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
