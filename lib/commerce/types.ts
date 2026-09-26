/**
 * Feature 013 Bank Transfer Commerce Core (T064) — Canonical commerce domain types.
 *
 * Every type here is derived directly from the applied Feature 013 database CHECK constraints
 * (M1 through M2e: migrations 20260925100000 through 20260925115000).
 *
 * NO INVENTED STATES: every TypeScript allowlist matches the database CHECK vocabulary exactly.
 * LEGACY compatibility types are preserved where needed.
 */

// ── Orders & Commerce Flow (M1) ──────────────────────────────────────────────────────────────────

/** `orders.commerce_flow`'s CHECK constraint (`orders_commerce_flow_check`). */
export type CommerceFlow = "LEGACY" | "BANK_TRANSFER_V1";

/**
 * `orders.status`'s CHECK constraint (`orders_status_check`) — exactly 15 values.
 * Expanded in M1 with PROFORMA_ISSUED, CANCELLED, PAYMENT_REJECTED.
 */
export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "HOLD"
  | "PAYMENT_PROOF_SUBMITTED"
  | "PAYMENT_UNDER_REVIEW"
  | "PAID"
  | "FULFILLMENT_IN_PROGRESS"
  | "PARTIALLY_DELIVERED"
  | "COMPLETED"
  | "EXPIRED"
  | "VOID"
  | "DISPUTED"
  | "PROFORMA_ISSUED"
  | "CANCELLED"
  | "PAYMENT_REJECTED";

/** Pre-M1 legacy order statuses (12 values). */
export type LegacyOrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "HOLD"
  | "PAYMENT_PROOF_SUBMITTED"
  | "PAYMENT_UNDER_REVIEW"
  | "PAID"
  | "FULFILLMENT_IN_PROGRESS"
  | "PARTIALLY_DELIVERED"
  | "COMPLETED"
  | "EXPIRED"
  | "VOID"
  | "DISPUTED";

// ── Inventory Reservations (M1) ─────────────────────────────────────────────────────────────────

/** `inventory_reservations.status`'s CHECK constraint (`inventory_reservations_status_check`). */
export type InventoryReservationStatus =
  | "ACTIVE"
  | "CONSUMED"
  | "RELEASED"
  | "EXPIRED"
  | "REVIEW_HOLD";

/** `inventory_reservations.release_reason`'s CHECK constraint (`inventory_reservations_release_reason_check`). */
export type InventoryReservationReleaseReason =
  | "EXPIRED"
  | "CANCELLED"
  | "REJECTED"
  | "ADMIN_VOID"
  | "EXCEPTION";

// ── Payments & Reviews (M1) ──────────────────────────────────────────────────────────────────────

/** `payments.status`'s CHECK constraint (`payments_status_check`) — exactly 7 values. */
export type PaymentStatus =
  | "PENDING"
  | "PROOF_SUBMITTED"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED"
  | "VOID";

/** `payments.payment_method`'s CHECK constraint (`payments_payment_method_check`). */
export type PaymentMethod = "BANK_TRANSFER" | "PROVIDER";

/** `payment_proofs.submission_kind`'s CHECK constraint (`payment_proofs_submission_kind_check`). */
export type PaymentProofSubmissionKind = "ON_TIME" | "LATE_REPORT";

/** `payment_proofs.status`'s CHECK constraint (`payment_proofs_status_check`). */
export type PaymentProofStatus =
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "IN_RECONCILIATION";

/** `payment_reviews.decision`'s CHECK constraint (`payment_reviews_decision_check`). */
export type PaymentReviewDecision =
  | "CONFIRMED"
  | "REJECTED"
  | "SENT_TO_RECONCILIATION";

// ── Payouts (M1) ─────────────────────────────────────────────────────────────────────────────────

/**
 * `payouts.status`'s CHECK constraint (`payouts_status_check`) — exactly 5 values.
 * Expanded in M1 with ACCRUED.
 */
export type PayoutStatus =
  | "PENDING_PAYOUT"
  | "PROCESSING"
  | "PAID"
  | "VOID"
  | "ACCRUED";

/** Pre-M1 legacy payout statuses (4 values). */
export type LegacyPayoutStatus =
  | "PENDING_PAYOUT"
  | "PROCESSING"
  | "PAID"
  | "VOID";

// ── Proforma Invoices (M2b) ──────────────────────────────────────────────────────────────────────

/**
 * `proforma_invoices.status`'s CHECK constraint (`proforma_invoices_status_check`) — exactly 7 values.
 * Expanded in M2b from 3 to 7 values.
 */
export type ProformaStatus =
  | "ISSUED"
  | "CONFIRMED"
  | "PAID"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED"
  | "VOID";

/** Pre-M2b legacy proforma statuses (3 values). */
export type LegacyProformaStatus = "ISSUED" | "PAID" | "VOID";

/** `proforma_invoice_items.seller_type_snapshot`'s CHECK constraint (`proforma_invoice_items_seller_type_check`). */
export type ProformaSellerType = "HILLS" | "MEMBER_SELLER";

// ── Tax Invoices & Shipments (M2c) ───────────────────────────────────────────────────────────────

/** `tax_invoices.status`'s CHECK constraint (`tax_invoices_status_check`). */
export type TaxInvoiceStatus = "ISSUED" | "VOID";

/** `order_shipments.shipment_kind`'s CHECK constraint (`order_shipments_shipment_kind_check`). */
export type OrderShipmentKind = "DELIVERY_REQUEST" | "FULFILLMENT";

// ── Reconciliation Cases & Manual Adjustments (M2c) ──────────────────────────────────────────────

/** `reconciliation_cases.kind`'s CHECK constraint (`reconciliation_cases_kind_check`). */
export type ReconciliationCaseKind =
  | "LATE"
  | "PARTIAL"
  | "WRONG_CURRENCY"
  | "DUPLICATE"
  | "OTHER";

/** `reconciliation_cases.status`'s CHECK constraint (`reconciliation_cases_status_check`). */
export type ReconciliationCaseStatus =
  | "OPEN"
  | "IN_REVIEW"
  | "RESOLVED"
  | "CLOSED_NO_ACTION";

/** `reconciliation_cases.resolution_type`'s CHECK constraint (`reconciliation_cases_resolution_type_check`). */
export type ReconciliationResolutionType =
  | "REFUNDED_EXTERNALLY"
  | "APPLIED_TO_NEW_ORDER"
  | "NO_FUNDS_RECEIVED"
  | "OTHER";

/** `manual_financial_adjustments.kind`'s CHECK constraint (`manual_financial_adjustments_kind_check`). */
export type ManualAdjustmentKind =
  | "REFUND_EXTERNAL"
  | "REVERSAL"
  | "CORRECTION";

// ── Promotions & Pricing (M2d) ───────────────────────────────────────────────────────────────────

/** `promotions.status`'s CHECK constraint (`promotions_status_check`). */
export type PromotionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "ENDED"
  | "ARCHIVED";

/** `promotions.scope`'s CHECK constraint (`promotions_scope_check`). */
export type PromotionScope = "PLATFORM" | "SELLER";

/** `promotions.funding_source`'s CHECK constraint (`promotions_funding_source_check`). */
export type PromotionFundingSource = "HILLS" | "SELLER";

/** `promotions.discount_type`'s CHECK constraint (`promotions_discount_type_check`). */
export type PromotionDiscountType = "PERCENT" | "AMOUNT_PER_KG";

/** `promotion_targets.target_kind`'s CHECK constraint (`promotion_targets_kind_check`). */
export type PromotionTargetKind =
  | "OFFER"
  | "COFFEE"
  | "ALL_SELLER_OFFERS"
  | "ALL_OFFERS";

// ── Notification Outbox (M2e) ────────────────────────────────────────────────────────────────────

/** `notification_events.status`'s CHECK constraint (`notification_events_status_check`). */
export type NotificationEventStatus =
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

/** `notification_events.aggregate_type`'s CHECK constraint (`notification_events_aggregate_type_check`). */
export type NotificationAggregateType =
  | "proforma"
  | "order"
  | "payment"
  | "case"
  | "shipment"
  | "payout"
  | "campaign";
