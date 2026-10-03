import type { OrderStatus } from "@/lib/commerce/types";
import type { PaymentMethod, PaymentStatus, PayoutStatus, ProformaStatus } from "@/lib/finance/validation";

/**
 * Feature 008 Phase 1 (T001) — the finance domain's shared, web/mobile-safe DTO allowlists.
 * `lib/finance/read.ts` is the only place that maps a database row into one of these shapes; nothing
 * elsewhere in the application selects `payments`/`order_financials`/`proforma_invoices`/
 * `proforma_invoice_items`/`tax_invoices`/`payouts` directly.
 *
 * DTO SAFETY (run directive, FR-002, SEC-004): every field below is a field an actual current
 * consumer needs. None of the following ever appears here: `payment_accounts` fields, `confirmed_by`/
 * `paid_by`/`uploaded_by` (internal profile-id FKs with no current consumer), `idempotency_key`
 * (server-internal retry key, never rendered), `payment_events.payload` (never selected by this
 * feature at all — see `read.ts`'s own header), secrets, service keys, or raw audit payloads.
 *
 * MONEY/CURRENCY (run directive "MONEY / CURRENCY"): every DTO below carries exactly one `currency`
 * field that applies to every amount field in that same DTO — mirroring the database's own shape,
 * where `payments`/`order_financials`/`payouts` each store one currency column per row. No amount is
 * ever returned without its accompanying stored currency, and no FX conversion or normalization is
 * performed anywhere in this feature.
 */

/** `payments` — a safe, verbatim projection. Never recalculated (FR-002); never includes a provider
 * secret or the caller-invisible internal `payment_account_id`/`confirmed_by`/`idempotency_key`. */
export type PaymentDTO = {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  /** `payments.provider` — schema value only (e.g. future provider slug); `null` until a provider is
   * selected and a real payment attempt exists. Never a secret; never a credential. */
  provider: string | null;
  /** `payments.external_reference` — an opaque provider-side reference id, safe to show the payment's
   * own organization; never a credential, never a full provider payload. */
  externalReference: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  confirmedAt: string | null;
  /** Existing manual-review vocabulary only (`PROOF_SUBMITTED`/`UNDER_REVIEW`/`REJECTED` flow) — never
   * an escrow/funding-failure reason and never raw provider/database text (SEC-004/FR-015). */
  rejectedReason: string | null;
  correlationId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Buyer-safe immutable order snapshot. */
export type BuyerOrderFinancialsDTO = {
  orderId: string;
  baseSubtotal: number;
  shippingAmount: number;
  vatAmount: number;
  buyerTotalAmount: number;
  totalQuantityKg: number;
  currency: string;
  calculatedAt: string;
};

/** Finance/admin/auditor-only extension; never returned by the buyer projection. */
export type OrderFinancialsDTO = BuyerOrderFinancialsDTO & {
  commissionAmount: number;
  sellerNetAmount: number;
  hillsShareAmount: number;
  /** Snapshot-only (T006): identifies WHICH policy applied at checkout time. Never used to re-query
   * `commission_policies`/`commission_tiers` for a live percentage. */
  commissionPolicyId: string | null;
  commissionPercentageSnapshot: number | null;
  taxRuleId: string | null;
  taxPercentageSnapshot: number | null;
  taxBaseSnapshot: string | null;
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

/** `proforma_invoices` + its items — issued only by `checkout_order()` (Feature 007); `null` until
 * checkout has run. `fileAssetId` is an id reference only — this feature never fabricates a file URL. */
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

/** `tax_invoices` — metadata only; `fileAssetId` is an id reference, never a fabricated download URL. */
export type TaxInvoiceDTO = {
  id: string;
  orderId: string;
  invoiceNumber: string;
  fileAssetId: string;
  issuedAt: string | null;
  createdAt: string;
};

/** `payouts` — a platform accounting record, never evidence of actual provider money release
 * (FR-017). Values are verbatim from the stored row; never recomputed from `order_financials`. */
export type PayoutDTO = {
  id: string;
  orderId: string;
  sellerOrganizationId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  paidAt: string | null;
  paymentReference: string | null;
  createdAt: string;
};

/**
 * Feature 013 T063 — one of the CALLER'S OWN lines on an order, read through the M3 seller-safe projection
 * `v_seller_order_lines` (security_invoker; own lines only). It deliberately has no buyer total, payment, proof, bank,
 * destination, proforma-header or other-seller field. The `own*` amounts come from the frozen
 * `proforma_line_economics` snapshot (`null` for a LEGACY order, which has none).
 */
export type SellerOrderLineDTO = {
  orderItemId: string;
  productNameSnapshot: string | null;
  lotCodeSnapshot: string | null;
  quantityKg: number;
  currency: string;
  ownGrossAmount: number | null;
  ownCommissionAmount: number | null;
  ownSellerNetAmount: number | null;
  ownGroupShipmentStatus: string | null;
  ownPayoutStatus: string | null;
};

/** Feature 013 T063 — the seller-safe view of one order: its reference, status and the caller's own lines only. */
export type SellerOrderViewDTO = {
  orderId: string;
  orderCode: string;
  /** Parsed through the canonical `parseOrderStatus` in the read layer — never an unvalidated string. */
  orderStatus: OrderStatus;
  lines: readonly SellerOrderLineDTO[];
};

/** Feature 008 T023 — the same bounded-page shape `lib/orders/read.ts#PaginatedOrders` and
 * `lib/listings/sales.ts` already use: one extra row is fetched to detect `hasMore`, never a full
 * unbounded scan of a seller organization's payout history. */
export type PaginatedPayouts<T> = { rows: readonly T[]; hasMore: boolean };

// ── Feature 016: Finance Review & Delivery Handoff DTOs ──────────────────────

export type PaymentReviewDecision = "CONFIRMED" | "REJECTED";

/** Operations Console Pending Verification queue item DTO */
export type PaymentQueueItemDTO = {
  orderId: string;
  orderCode: string;
  paymentId: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  amount: number;
  currency: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  submittedAt: string;
  claimedAmount: number;
  claimedCurrency: string;
  bankReference: string;
  fileAssetId: string;
  finalizedProofId: string;
  reservationStatus: string;
  expiresAt: string | null;
};

/** Detail inspector view DTO */
export type PaymentReviewDetailDTO = {
  orderId: string;
  orderCode: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  paymentId: string;
  paymentStatus: PaymentStatus;
  amount: number;
  currency: string;
  proforma: {
    id: string;
    proformaCode: string;
    status: "CONFIRMED";
    buyerTotal: number;
    currency: string;
    confirmedAt: string;
    items: readonly {
      orderItemId: string;
      productName: string;
      quantityKg: number;
      unitPrice: number;
      amount: number;
      sellerTypeSnapshot: string;
      fulfillmentGroupId: string;
    }[];
    fulfillmentGroups: readonly {
      id: string;
      sellerOrganizationId: string;
      warehouseId: string;
      deliveryMethod: string;
      shippingAmount: number;
    }[];
    destination: {
      countryCode: string;
      city: string;
      addressLines: string[];
      contactName: string;
      contactPhone: string;
    };
  };
  proof: {
    id: string;
    fileAssetId: string;
    status: "SUBMITTED" | "ACCEPTED" | "REJECTED";
    claimedAmount: number;
    claimedCurrency: string;
    transferDate: string;
    bankReference: string;
    submittedAt: string;
  };
  reservation: {
    id: string;
    status: "REVIEW_HOLD" | "CONSUMED" | "RELEASED";
    expiresAt: string;
    items: readonly {
      offerId: string;
      inventoryPositionId: string;
      quantityKg: number;
    }[];
  };
};

/** RPC return shape from public.finance_review_bank_transfer_v1 */
export type FinanceReviewRpcResult = {
  orderId: string;
  orderCode: string;
  paymentId: string;
  decision: PaymentReviewDecision;
  orderStatus: "PAID" | "PAYMENT_REJECTED";
  paymentStatus: "CONFIRMED" | "REJECTED";
  reservationStatus: "CONSUMED" | "RELEASED";
  taxInvoiceNumber?: string;
  shipmentIds?: string[];
  confirmedAt?: string;
  rejectedAt?: string;
  requestId: string;
};

/** Exact domain error code union matching contracts/server-actions.md §5 */
export type FinanceReviewErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "mfa_required"
  | "order_not_found"
  | "payment_not_found"
  | "proforma_not_found"
  | "proforma_not_confirmed"
  | "reservation_not_found"
  | "reservation_not_review_hold"
  | "authoritative_proforma_mismatch"
  | "finalized_upload_intent_not_found"
  | "finalized_proof_not_found"
  | "proof_payment_mismatch"
  | "rejection_notes_required"
  | "request_id_conflict"
  | "order_already_finalized"
  | "persisted_review_integrity_error"
  | "seller_available_insufficient"
  | "seller_reserved_insufficient"
  | "invalid_decision"
  | "invalid_payment_status"
  | "invalid_commerce_flow";
