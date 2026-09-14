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

/** `order_financials` — the immutable checkout snapshot (FR-002, FR-016, T006). A `null` result means
 * checkout has never run for this order; it is never treated as "zero" or backfilled. */
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
  /** Snapshot-only (T006): identifies WHICH policy applied at checkout time. Never used to re-query
   * `commission_policies`/`commission_tiers` for a live percentage. */
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
