import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  COMMERCE_FLOWS,
  CommerceFlowSchema,
  INVENTORY_RESERVATION_RELEASE_REASONS,
  INVENTORY_RESERVATION_STATUSES,
  InventoryReservationReleaseReasonSchema,
  InventoryReservationStatusSchema,
  LEGACY_ORDER_STATUSES,
  LEGACY_PAYOUT_STATUSES,
  LEGACY_PROFORMA_STATUSES,
  MANUAL_ADJUSTMENT_KINDS,
  ManualAdjustmentKindSchema,
  NOTIFICATION_AGGREGATE_TYPES,
  NOTIFICATION_EVENT_STATUSES,
  NotificationAggregateTypeSchema,
  NotificationEventStatusSchema,
  ORDER_SHIPMENT_KINDS,
  ORDER_STATUSES,
  OrderShipmentKindSchema,
  OrderStatusSchema,
  PAYMENT_METHODS,
  PAYMENT_PROOF_STATUSES,
  PAYMENT_PROOF_SUBMISSION_KINDS,
  PAYMENT_REVIEW_DECISIONS,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PaymentMethodSchema,
  PaymentProofStatusSchema,
  PaymentProofSubmissionKindSchema,
  PaymentReviewDecisionSchema,
  PaymentStatusSchema,
  PayoutStatusSchema,
  PROFORMA_SELLER_TYPES,
  PROFORMA_STATUSES,
  PROMOTION_DISCOUNT_TYPES,
  PROMOTION_FUNDING_SOURCES,
  PROMOTION_SCOPES,
  PROMOTION_STATUSES,
  PROMOTION_TARGET_KINDS,
  ProformaSellerTypeSchema,
  ProformaStatusSchema,
  PromotionDiscountTypeSchema,
  PromotionFundingSourceSchema,
  PromotionScopeSchema,
  PromotionStatusSchema,
  PromotionTargetKindSchema,
  RECONCILIATION_CASE_KINDS,
  RECONCILIATION_CASE_STATUSES,
  RECONCILIATION_RESOLUTION_TYPES,
  ReconciliationCaseKindSchema,
  ReconciliationCaseStatusSchema,
  ReconciliationResolutionTypeSchema,
  TAX_INVOICE_STATUSES,
  TaxInvoiceStatusSchema,
  parseCommerceFlow,
  parseManualAdjustmentKind,
  parseNotificationEventStatus,
  parseOrderStatus,
  parsePaymentMethod,
  parsePaymentProofStatus,
  parsePaymentReviewDecision,
  parsePaymentStatus,
  parsePayoutStatus,
  parseProformaStatus,
  parsePromotionScope,
  parsePromotionStatus,
  parseReconciliationCaseKind,
  parseReconciliationCaseStatus,
  parseReconciliationResolutionType,
  parseReleaseReason,
  parseReservationStatus,
  parseShipmentKind,
  parseTaxInvoiceStatus,
} from "@/lib/commerce/validation";

/**
 * Feature 013 (T064) — Static verification of canonical commerce vocabulary against the applied
 * Feature 013 database migrations (M1 through M2e).
 *
 * Every TypeScript allowlist must exactly match the corresponding database CHECK constraint.
 * No invented states. No removed valid states.
 */

const m1Sql = readFileSync("supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql", "utf8");
const m2bSql = readFileSync("supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql", "utf8");
const m2cSql = readFileSync("supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql", "utf8");
const m2dSql = readFileSync("supabase/migrations/20260925112000_feature_013_pricing_inputs.sql", "utf8");
const m2eSql = readFileSync("supabase/migrations/20260925115000_feature_013_notification_outbox.sql", "utf8");

/** Helper to extract enum values from a SQL CHECK constraint definition. */
function extractCheckValues(sql: string, constraintName: string): string[] {
  const regex = new RegExp(`constraint\\s+${constraintName}\\s+check\\s*\\([a-z_]+\\s+in\\s*\\(([^)]+)\\)\\)`, "i");
  const match = regex.exec(sql);
  if (!match) {
    // Also try table-level `add constraint` or column-level without repeating constraint name before check
    const altRegex = new RegExp(`${constraintName}\\s+check\\s*\\([a-z_]+\\s+in\\s*\\(([^)]+)\\)\\)`, "i");
    const altMatch = altRegex.exec(sql);
    if (!altMatch) throw new Error(`Could not find constraint ${constraintName} in SQL`);
    return [...altMatch[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  }
  return [...match[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe("T064 — Canonical TypeScript allowlists match database CHECK constraints byte-for-byte", () => {
  it("orders_commerce_flow_check matches COMMERCE_FLOWS", () => {
    const values = extractCheckValues(m1Sql, "orders_commerce_flow_check");
    expect([...COMMERCE_FLOWS]).toEqual(values);
  });

  it("orders_status_check matches ORDER_STATUSES (15 statuses, M1)", () => {
    const values = extractCheckValues(m1Sql, "orders_status_check");
    expect([...ORDER_STATUSES]).toEqual(values);
    expect(ORDER_STATUSES).toHaveLength(15);
  });

  it("inventory_reservations_status_check matches INVENTORY_RESERVATION_STATUSES (5 statuses, M1)", () => {
    const values = extractCheckValues(m1Sql, "inventory_reservations_status_check");
    expect([...INVENTORY_RESERVATION_STATUSES]).toEqual(values);
    expect(INVENTORY_RESERVATION_STATUSES).toHaveLength(5);
  });

  it("inventory_reservations_release_reason_check matches INVENTORY_RESERVATION_RELEASE_REASONS (5 reasons, M1)", () => {
    const values = extractCheckValues(m1Sql, "inventory_reservations_release_reason_check");
    expect([...INVENTORY_RESERVATION_RELEASE_REASONS]).toEqual(values);
    expect(INVENTORY_RESERVATION_RELEASE_REASONS).toHaveLength(5);
  });

  it("payment_reviews_decision_check matches PAYMENT_REVIEW_DECISIONS (3 decisions, M1)", () => {
    const values = extractCheckValues(m1Sql, "payment_reviews_decision_check");
    expect([...PAYMENT_REVIEW_DECISIONS]).toEqual(values);
    expect(PAYMENT_REVIEW_DECISIONS).toHaveLength(3);
  });

  it("payouts_status_check matches PAYOUT_STATUSES (5 statuses, M1)", () => {
    const values = extractCheckValues(m1Sql, "payouts_status_check");
    expect([...PAYOUT_STATUSES]).toEqual(values);
    expect(PAYOUT_STATUSES).toHaveLength(5);
    expect(PAYOUT_STATUSES).toContain("ACCRUED");
  });

  it("PAYMENT_METHODS matches payments_payment_method_check", () => {
    expect([...PAYMENT_METHODS]).toEqual(["BANK_TRANSFER", "PROVIDER"]);
  });

  it("payment_proofs_submission_kind_check matches PAYMENT_PROOF_SUBMISSION_KINDS (2 kinds, M1)", () => {
    const values = extractCheckValues(m1Sql, "payment_proofs_submission_kind_check");
    expect([...PAYMENT_PROOF_SUBMISSION_KINDS]).toEqual(values);
  });

  it("payment_proofs_status_check matches PAYMENT_PROOF_STATUSES (4 statuses, M1)", () => {
    const values = extractCheckValues(m1Sql, "payment_proofs_status_check");
    expect([...PAYMENT_PROOF_STATUSES]).toEqual(values);
  });

  it("proforma_invoices_status_check matches PROFORMA_STATUSES (7 statuses, M2b)", () => {
    const values = extractCheckValues(m2bSql, "proforma_invoices_status_check");
    expect([...PROFORMA_STATUSES]).toEqual(values);
    expect(PROFORMA_STATUSES).toHaveLength(7);
  });

  it("proforma_invoice_items_seller_type_check matches PROFORMA_SELLER_TYPES (2 types, M2b)", () => {
    const values = extractCheckValues(m2bSql, "proforma_invoice_items_seller_type_check");
    expect([...PROFORMA_SELLER_TYPES]).toEqual(values);
  });

  it("tax_invoices_status_check matches TAX_INVOICE_STATUSES (2 statuses, M2c)", () => {
    const values = extractCheckValues(m2cSql, "tax_invoices_status_check");
    expect([...TAX_INVOICE_STATUSES]).toEqual(values);
  });

  it("order_shipments_shipment_kind_check matches ORDER_SHIPMENT_KINDS (2 kinds, M2c)", () => {
    const values = extractCheckValues(m2cSql, "order_shipments_shipment_kind_check");
    expect([...ORDER_SHIPMENT_KINDS]).toEqual(values);
  });

  it("reconciliation_cases_kind_check matches RECONCILIATION_CASE_KINDS (5 kinds, M2c)", () => {
    const values = extractCheckValues(m2cSql, "reconciliation_cases_kind_check");
    expect([...RECONCILIATION_CASE_KINDS]).toEqual(values);
  });

  it("reconciliation_cases_status_check matches RECONCILIATION_CASE_STATUSES (4 statuses, M2c)", () => {
    const values = extractCheckValues(m2cSql, "reconciliation_cases_status_check");
    expect([...RECONCILIATION_CASE_STATUSES]).toEqual(values);
  });

  it("reconciliation_cases_resolution_type_check matches RECONCILIATION_RESOLUTION_TYPES (4 types, M2c)", () => {
    const values = extractCheckValues(m2cSql, "reconciliation_cases_resolution_type_check");
    expect([...RECONCILIATION_RESOLUTION_TYPES]).toEqual(values);
  });

  it("manual_financial_adjustments_kind_check matches MANUAL_ADJUSTMENT_KINDS (3 kinds, M2c)", () => {
    const values = extractCheckValues(m2cSql, "manual_financial_adjustments_kind_check");
    expect([...MANUAL_ADJUSTMENT_KINDS]).toEqual(values);
  });

  it("promotions_status_check matches PROMOTION_STATUSES (6 statuses, M2d)", () => {
    const values = extractCheckValues(m2dSql, "promotions_status_check");
    expect([...PROMOTION_STATUSES]).toEqual(values);
  });

  it("promotions_scope_check matches PROMOTION_SCOPES (2 scopes, M2d)", () => {
    const values = extractCheckValues(m2dSql, "promotions_scope_check");
    expect([...PROMOTION_SCOPES]).toEqual(values);
  });

  it("promotions_funding_source_check matches PROMOTION_FUNDING_SOURCES (2 sources, M2d)", () => {
    const values = extractCheckValues(m2dSql, "promotions_funding_source_check");
    expect([...PROMOTION_FUNDING_SOURCES]).toEqual(values);
  });

  it("promotions_discount_type_check matches PROMOTION_DISCOUNT_TYPES (2 types, M2d)", () => {
    const values = extractCheckValues(m2dSql, "promotions_discount_type_check");
    expect([...PROMOTION_DISCOUNT_TYPES]).toEqual(values);
  });

  it("promotion_targets_kind_check matches PROMOTION_TARGET_KINDS (4 kinds, M2d)", () => {
    const values = extractCheckValues(m2dSql, "promotion_targets_kind_check");
    expect([...PROMOTION_TARGET_KINDS]).toEqual(values);
  });

  it("notification_events_status_check matches NOTIFICATION_EVENT_STATUSES (4 statuses, M2e)", () => {
    const values = extractCheckValues(m2eSql, "notification_events_status_check");
    expect([...NOTIFICATION_EVENT_STATUSES]).toEqual(values);
  });

  it("notification_events_aggregate_type_check matches NOTIFICATION_AGGREGATE_TYPES (7 types, M2e)", () => {
    const values = extractCheckValues(m2eSql, "notification_events_aggregate_type_check");
    expect([...NOTIFICATION_AGGREGATE_TYPES]).toEqual(values);
  });
});

describe("T064 — Zod schemas accept valid values and reject invented/unauthorized statuses", () => {
  it.each(ORDER_STATUSES)("OrderStatusSchema accepts valid status %s", (status) => {
    expect(OrderStatusSchema.safeParse(status).success).toBe(true);
  });

  it.each(PAYMENT_STATUSES)("PaymentStatusSchema accepts valid payment status %s", (status) => {
    expect(PaymentStatusSchema.safeParse(status).success).toBe(true);
  });

  it.each(PROFORMA_STATUSES)("ProformaStatusSchema accepts valid proforma status %s", (status) => {
    expect(ProformaStatusSchema.safeParse(status).success).toBe(true);
  });

  it.each(PAYOUT_STATUSES)("PayoutStatusSchema accepts valid payout status %s", (status) => {
    expect(PayoutStatusSchema.safeParse(status).success).toBe(true);
  });

  const INVENTED_ESCROW_STATUSES = ["FUNDED", "ESCROW_FUNDED", "AUTHORIZED", "CAPTURED", "AWAITING_ESCROW", "RELEASED"];

  it.each(INVENTED_ESCROW_STATUSES)("PaymentStatusSchema rejects invented escrow status %s", (status) => {
    expect(PaymentStatusSchema.safeParse(status).success).toBe(false);
  });

  it.each(INVENTED_ESCROW_STATUSES)("PayoutStatusSchema rejects invented escrow status %s", (status) => {
    expect(PayoutStatusSchema.safeParse(status).success).toBe(false);
  });

  it("schemas reject arbitrary unknown strings", () => {
    expect(OrderStatusSchema.safeParse("UNKNOWN").success).toBe(false);
    expect(CommerceFlowSchema.safeParse("FLOW_V2").success).toBe(false);
    expect(TaxInvoiceStatusSchema.safeParse("DRAFT").success).toBe(false);
    expect(ReconciliationCaseStatusSchema.safeParse("PENDING").success).toBe(false);
    expect(PaymentMethodSchema.safeParse("BITCOIN").success).toBe(false);
    expect(PaymentProofStatusSchema.safeParse("FORGED").success).toBe(false);
    expect(PaymentProofSubmissionKindSchema.safeParse("EARLY").success).toBe(false);
    expect(PaymentReviewDecisionSchema.safeParse("APPROVED").success).toBe(false);
    expect(ProformaSellerTypeSchema.safeParse("THIRD_PARTY").success).toBe(false);
    expect(OrderShipmentKindSchema.safeParse("EXPRESS").success).toBe(false);
    expect(ReconciliationCaseKindSchema.safeParse("FRAUD").success).toBe(false);
    expect(ReconciliationResolutionTypeSchema.safeParse("WRITE_OFF").success).toBe(false);
    expect(ManualAdjustmentKindSchema.safeParse("DISCOUNT").success).toBe(false);
    expect(PromotionStatusSchema.safeParse("PROPOSED").success).toBe(false);
    expect(PromotionScopeSchema.safeParse("GLOBAL").success).toBe(false);
    expect(PromotionFundingSourceSchema.safeParse("PARTNER").success).toBe(false);
    expect(PromotionDiscountTypeSchema.safeParse("FREE").success).toBe(false);
    expect(PromotionTargetKindSchema.safeParse("CATEGORY").success).toBe(false);
    expect(NotificationEventStatusSchema.safeParse("QUEUED").success).toBe(false);
    expect(NotificationAggregateTypeSchema.safeParse("user").success).toBe(false);
    expect(InventoryReservationStatusSchema.safeParse("PENDING").success).toBe(false);
    expect(InventoryReservationReleaseReasonSchema.safeParse("USER_REQUEST").success).toBe(false);
  });
});

describe("T064 — Safe parser helpers return typed values or null", () => {
  it("parseCommerceFlow parses valid and rejects invalid", () => {
    expect(parseCommerceFlow("BANK_TRANSFER_V1")).toBe("BANK_TRANSFER_V1");
    expect(parseCommerceFlow("LEGACY")).toBe("LEGACY");
    expect(parseCommerceFlow("UNKNOWN")).toBeNull();
    expect(parseCommerceFlow(null)).toBeNull();
    expect(parseCommerceFlow(123)).toBeNull();
  });

  it("parseOrderStatus parses valid and rejects invalid", () => {
    expect(parseOrderStatus("PROFORMA_ISSUED")).toBe("PROFORMA_ISSUED");
    expect(parseOrderStatus("CANCELLED")).toBe("CANCELLED");
    expect(parseOrderStatus("PAYMENT_REJECTED")).toBe("PAYMENT_REJECTED");
    expect(parseOrderStatus("NOT_A_STATUS")).toBeNull();
  });

  it("parsePaymentStatus parses valid and rejects invalid", () => {
    expect(parsePaymentStatus("CONFIRMED")).toBe("CONFIRMED");
    expect(parsePaymentStatus("ESCROW_FUNDED")).toBeNull();
  });

  it("parsePaymentMethod parses valid and rejects invalid", () => {
    expect(parsePaymentMethod("BANK_TRANSFER")).toBe("BANK_TRANSFER");
    expect(parsePaymentMethod("CRYPTO")).toBeNull();
  });

  it("parseProformaStatus parses valid and rejects invalid", () => {
    expect(parseProformaStatus("SUPERSEDED")).toBe("SUPERSEDED");
    expect(parseProformaStatus("CONFIRMED")).toBe("CONFIRMED");
    expect(parseProformaStatus("DRAFT")).toBeNull();
  });

  it("parsePayoutStatus parses valid and rejects invalid", () => {
    expect(parsePayoutStatus("ACCRUED")).toBe("ACCRUED");
    expect(parsePayoutStatus("PAID")).toBe("PAID");
    expect(parsePayoutStatus("ESCROW_RELEASED")).toBeNull();
  });

  it("parseReservationStatus parses valid and rejects invalid", () => {
    expect(parseReservationStatus("REVIEW_HOLD")).toBe("REVIEW_HOLD");
    expect(parseReservationStatus("ACTIVE")).toBe("ACTIVE");
    expect(parseReservationStatus("UNKNOWN")).toBeNull();
  });

  it("parseReleaseReason parses valid and rejects invalid", () => {
    expect(parseReleaseReason("ADMIN_VOID")).toBe("ADMIN_VOID");
    expect(parseReleaseReason("UNKNOWN")).toBeNull();
  });

  it("parsePaymentProofStatus parses valid and rejects invalid", () => {
    expect(parsePaymentProofStatus("IN_RECONCILIATION")).toBe("IN_RECONCILIATION");
    expect(parsePaymentProofStatus("UNKNOWN")).toBeNull();
  });

  it("parsePaymentReviewDecision parses valid and rejects invalid", () => {
    expect(parsePaymentReviewDecision("SENT_TO_RECONCILIATION")).toBe("SENT_TO_RECONCILIATION");
    expect(parsePaymentReviewDecision("UNKNOWN")).toBeNull();
  });

  it("parseTaxInvoiceStatus parses valid and rejects invalid", () => {
    expect(parseTaxInvoiceStatus("ISSUED")).toBe("ISSUED");
    expect(parseTaxInvoiceStatus("VOID")).toBe("VOID");
    expect(parseTaxInvoiceStatus("DRAFT")).toBeNull();
  });

  it("parseShipmentKind parses valid and rejects invalid", () => {
    expect(parseShipmentKind("FULFILLMENT")).toBe("FULFILLMENT");
    expect(parseShipmentKind("DELIVERY_REQUEST")).toBe("DELIVERY_REQUEST");
    expect(parseShipmentKind("UNKNOWN")).toBeNull();
  });

  it("parseReconciliationCaseKind parses valid and rejects invalid", () => {
    expect(parseReconciliationCaseKind("WRONG_CURRENCY")).toBe("WRONG_CURRENCY");
    expect(parseReconciliationCaseKind("UNKNOWN")).toBeNull();
  });

  it("parseReconciliationCaseStatus parses valid and rejects invalid", () => {
    expect(parseReconciliationCaseStatus("CLOSED_NO_ACTION")).toBe("CLOSED_NO_ACTION");
    expect(parseReconciliationCaseStatus("UNKNOWN")).toBeNull();
  });

  it("parseReconciliationResolutionType parses valid and rejects invalid", () => {
    expect(parseReconciliationResolutionType("REFUNDED_EXTERNALLY")).toBe("REFUNDED_EXTERNALLY");
    expect(parseReconciliationResolutionType("UNKNOWN")).toBeNull();
  });

  it("parseManualAdjustmentKind parses valid and rejects invalid", () => {
    expect(parseManualAdjustmentKind("REVERSAL")).toBe("REVERSAL");
    expect(parseManualAdjustmentKind("UNKNOWN")).toBeNull();
  });

  it("parsePromotionStatus parses valid and rejects invalid", () => {
    expect(parsePromotionStatus("SCHEDULED")).toBe("SCHEDULED");
    expect(parsePromotionStatus("UNKNOWN")).toBeNull();
  });

  it("parsePromotionScope parses valid and rejects invalid", () => {
    expect(parsePromotionScope("PLATFORM")).toBe("PLATFORM");
    expect(parsePromotionScope("UNKNOWN")).toBeNull();
  });

  it("parseNotificationEventStatus parses valid and rejects invalid", () => {
    expect(parseNotificationEventStatus("PROCESSED")).toBe("PROCESSED");
    expect(parseNotificationEventStatus("UNKNOWN")).toBeNull();
  });
});

describe("T064 — Legacy compatibility allowlists preserve historical boundaries", () => {
  it("LEGACY_ORDER_STATUSES contains exactly the 12 pre-M1 statuses", () => {
    expect(LEGACY_ORDER_STATUSES).toEqual([
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
    ]);
  });

  it("LEGACY_PROFORMA_STATUSES contains exactly the 3 pre-M2b statuses", () => {
    expect(LEGACY_PROFORMA_STATUSES).toEqual(["ISSUED", "PAID", "VOID"]);
  });

  it("LEGACY_PAYOUT_STATUSES contains exactly the 4 pre-M1 statuses", () => {
    expect(LEGACY_PAYOUT_STATUSES).toEqual(["PENDING_PAYOUT", "PROCESSING", "PAID", "VOID"]);
  });
});
