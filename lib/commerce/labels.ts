/**
 * Feature 013 Bank Transfer Commerce Core (T064) — typed EN/AR label ACCESSORS for every commerce vocabulary.
 *
 * SINGLE SOURCE OF TRUTH: every label lives in the canonical application copy (`lib/app/copy/en.ts` / `ar.ts`) — the
 * same dictionaries the status badges render. This module holds NO label text of its own; it only knows where each
 * vocabulary's labels live and pairs it with its database allowlist (`lib/commerce/validation.ts`), so a label can never
 * drift from what the UI shows. `tests/commerce/labels-parity.test.ts` proves: every allowlist value has EN and AR copy,
 * no set has duplicate labels in either language, and this file contains no label literals.
 *
 * No raw database enum value is ever returned: a missing Arabic label falls back to the English copy, and a value the
 * copy does not know returns "" (LOC-002).
 */

import { ar } from "@/lib/app/copy/ar";
import { en } from "@/lib/app/copy/en";
import {
  COMMERCE_FLOWS,
  INVENTORY_RESERVATION_RELEASE_REASONS,
  INVENTORY_RESERVATION_STATUSES,
  MANUAL_ADJUSTMENT_KINDS,
  NOTIFICATION_AGGREGATE_TYPES,
  NOTIFICATION_EVENT_STATUSES,
  ORDER_SHIPMENT_KINDS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROOF_STATUSES,
  PAYMENT_PROOF_SUBMISSION_KINDS,
  PAYMENT_REVIEW_DECISIONS,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PROFORMA_SELLER_TYPES,
  PROFORMA_STATUSES,
  PROMOTION_DISCOUNT_TYPES,
  PROMOTION_FUNDING_SOURCES,
  PROMOTION_SCOPES,
  PROMOTION_STATUSES,
  PROMOTION_TARGET_KINDS,
  RECONCILIATION_CASE_KINDS,
  RECONCILIATION_CASE_STATUSES,
  RECONCILIATION_RESOLUTION_TYPES,
  TAX_INVOICE_STATUSES,
} from "./validation";
import type { CommerceFlow, InventoryReservationStatus, OrderStatus, PaymentStatus, PayoutStatus, ProformaStatus } from "./types";

export type SupportedLocale = "en" | "ar";

type Copy = typeof en;
type LabelDictionary = Readonly<Record<string, string>>;

/**
 * Every commerce vocabulary: its database allowlist and the location of its labels in the canonical copy. The
 * selector is applied to both `en` and `ar` (the Arabic copy is `DeepPartial`, so a missing key is detected, never
 * papered over).
 */
export const COMMERCE_LABEL_SETS = {
  orderStatus: { values: ORDER_STATUSES, select: (c: Copy) => c.orders.status },
  paymentStatus: { values: PAYMENT_STATUSES, select: (c: Copy) => c.finance.payments.status },
  paymentMethod: { values: PAYMENT_METHODS, select: (c: Copy) => c.commerce.paymentMethods },
  payoutStatus: { values: PAYOUT_STATUSES, select: (c: Copy) => c.finance.payouts.status },
  proformaStatus: { values: PROFORMA_STATUSES, select: (c: Copy) => c.finance.proforma.status },
  // the same HILLS / MEMBER_SELLER vocabulary the marketplace already labels (coffee_offers.seller_type)
  proformaSellerType: { values: PROFORMA_SELLER_TYPES, select: (c: Copy) => c.marketplace.card.sellerType },
  commerceFlow: { values: COMMERCE_FLOWS, select: (c: Copy) => c.commerce.flows },
  reservationStatus: { values: INVENTORY_RESERVATION_STATUSES, select: (c: Copy) => c.commerce.reservations.status },
  reservationReleaseReason: { values: INVENTORY_RESERVATION_RELEASE_REASONS, select: (c: Copy) => c.commerce.reservations.releaseReason },
  paymentProofStatus: { values: PAYMENT_PROOF_STATUSES, select: (c: Copy) => c.commerce.paymentProofs.status },
  paymentProofSubmissionKind: { values: PAYMENT_PROOF_SUBMISSION_KINDS, select: (c: Copy) => c.commerce.paymentProofs.submissionKind },
  paymentReviewDecision: { values: PAYMENT_REVIEW_DECISIONS, select: (c: Copy) => c.commerce.paymentReviews.decision },
  taxInvoiceStatus: { values: TAX_INVOICE_STATUSES, select: (c: Copy) => c.commerce.taxInvoices.status },
  shipmentKind: { values: ORDER_SHIPMENT_KINDS, select: (c: Copy) => c.commerce.shipmentKinds },
  reconciliationCaseKind: { values: RECONCILIATION_CASE_KINDS, select: (c: Copy) => c.commerce.reconciliation.kinds },
  reconciliationCaseStatus: { values: RECONCILIATION_CASE_STATUSES, select: (c: Copy) => c.commerce.reconciliation.status },
  reconciliationResolutionType: { values: RECONCILIATION_RESOLUTION_TYPES, select: (c: Copy) => c.commerce.reconciliation.resolutionTypes },
  manualAdjustmentKind: { values: MANUAL_ADJUSTMENT_KINDS, select: (c: Copy) => c.commerce.adjustments.kinds },
  promotionStatus: { values: PROMOTION_STATUSES, select: (c: Copy) => c.commerce.promotions.status },
  promotionScope: { values: PROMOTION_SCOPES, select: (c: Copy) => c.commerce.promotions.scope },
  promotionFundingSource: { values: PROMOTION_FUNDING_SOURCES, select: (c: Copy) => c.commerce.promotions.fundingSource },
  promotionDiscountType: { values: PROMOTION_DISCOUNT_TYPES, select: (c: Copy) => c.commerce.promotions.discountType },
  promotionTargetKind: { values: PROMOTION_TARGET_KINDS, select: (c: Copy) => c.commerce.promotions.targetKind },
  notificationEventStatus: { values: NOTIFICATION_EVENT_STATUSES, select: (c: Copy) => c.commerce.notifications.status },
  notificationAggregateType: { values: NOTIFICATION_AGGREGATE_TYPES, select: (c: Copy) => c.commerce.notifications.aggregateType },
} as const;

export type CommerceLabelSet = keyof typeof COMMERCE_LABEL_SETS;
export type CommerceLabelValue<S extends CommerceLabelSet> = (typeof COMMERCE_LABEL_SETS)[S]["values"][number];

/** The canonical dictionary of one vocabulary in one locale (`undefined` only if the Arabic copy lacks the whole set). */
export function commerceLabelDictionary(set: CommerceLabelSet, locale: SupportedLocale): LabelDictionary | undefined {
  const select = COMMERCE_LABEL_SETS[set].select as (c: Copy) => LabelDictionary | undefined;
  try {
    return select((locale === "ar" ? ar : en) as Copy);
  } catch {
    return undefined; // a DeepPartial Arabic copy missing an intermediate object
  }
}

/** The label of one value, from the canonical copy. Arabic falls back to English; an unknown value returns "". */
export function getCommerceLabel<S extends CommerceLabelSet>(set: S, value: CommerceLabelValue<S>, locale: SupportedLocale = "en"): string {
  const key = value as string;
  const english = commerceLabelDictionary(set, "en")?.[key] ?? "";
  return locale === "ar" ? commerceLabelDictionary(set, "ar")?.[key] ?? english : english;
}

// Typed convenience accessors for the vocabularies the UI renders most (all derive from the canonical copy).
export const getOrderStatusLabel = (status: OrderStatus, locale: SupportedLocale = "en") => getCommerceLabel("orderStatus", status, locale);
export const getPaymentStatusLabel = (status: PaymentStatus, locale: SupportedLocale = "en") => getCommerceLabel("paymentStatus", status, locale);
export const getPayoutStatusLabel = (status: PayoutStatus, locale: SupportedLocale = "en") => getCommerceLabel("payoutStatus", status, locale);
export const getProformaStatusLabel = (status: ProformaStatus, locale: SupportedLocale = "en") => getCommerceLabel("proformaStatus", status, locale);
export const getCommerceFlowLabel = (flow: CommerceFlow, locale: SupportedLocale = "en") => getCommerceLabel("commerceFlow", flow, locale);
export const getReservationStatusLabel = (status: InventoryReservationStatus, locale: SupportedLocale = "en") => getCommerceLabel("reservationStatus", status, locale);
