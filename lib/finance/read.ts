import { parseOrderStatus } from "@/lib/commerce/validation";
import { createClient } from "@/lib/supabase/server";
import type { OrderFinancialsDTO, PaginatedPayouts, PaymentDTO, PayoutDTO, ProformaDTO, SellerOrderViewDTO, TaxInvoiceDTO } from "@/lib/finance/types";
import type { PaymentMethod, PaymentStatus, PayoutStatus, ProformaStatus } from "@/lib/finance/validation";

/**
 * Feature 008 Phase 1 (T003) — SERVER-ONLY, RLS-scoped reads for the finance domain (imports
 * `lib/supabase/server`, which pulls in `next/headers` — never import from a Client Component). Every
 * read runs under the caller's own request-scoped, RLS-respecting client — never the service-role key
 * (SEC-001/SEC-013/FR-013). No `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag`/Redis/
 * Upstash anywhere in this file (FR-014) — finance data is transactional truth, re-read fresh on
 * every call. Every function accepts an already-authorized `orderId`/`organizationId` — mirrors
 * `lib/orders/read.ts`'s own established convention exactly (the caller, a Server Action or page, has
 * already resolved and authorized identity/acting-organization via `lib/auth/dal.ts#getRequestIdentity`
 * before calling any function here) — and relies on RLS as the real further boundary: a cross-org id
 * simply returns `null`/`[]`, never an error, never a distinguishable "exists but not yours" signal.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE RLS BOUNDARY THIS FILE MUST NEVER WEAKEN — Feature 013 M3 (`20260925120000_feature_013_rls_realignment`,
 * applied 2026-09-26; contracts/rls-storage.md §1/§2). B = buyer-org member, S = member of the row's own seller org,
 * F = finance operator, A = auditor, PA = platform admin. A restrictive MFA gate applies to every table below.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `payments` — `payments_read`: B ∨ F ∨ PA. SELLERS AND AUDITORS CANNOT READ IT (auditors use
 * `v_audit_payments`). `payment_proofs` (never read here): B ∨ F.
 *
 * `order_financials` — `order_financials_read`: B ∨ F ∨ A ∨ PA. Sellers cannot read the full-order economics.
 *
 * `proforma_invoices` — `proforma_invoices_read`: B ∨ F ∨ PA. Sellers and auditors cannot read the header
 * (buyer/destination snapshots, bank mask, buyer totals). `proforma_invoice_items`: B ∨ S(own lines) ∨ F ∨ PA.
 *
 * `tax_invoices` — `tax_invoices_read`: B ∨ F ∨ PA (SELECT only; finance writes go through RPCs).
 *
 * `payouts` — `payouts_view` (unchanged): `is_platform_admin() OR is_org_member(seller_organization_id)`;
 * `payouts_finance_read`: F (SELECT only). A payout row is always the caller's OWN seller record.
 *
 * SELLERS read an order ONLY through `getSellerOrderLines` below: the M3 projection `v_seller_order_lines`
 * (security_invoker, own lines only — order code/status, own quantities, own economics from the frozen snapshot,
 * own shipment and payout status). There is no seller path to a buyer total, payment, proof, bank data, destination,
 * the proforma header or another seller's line, and none may be added here.
 *
 * NO `payment_events` READ: this file never selects `payment_events` at all — not even a safe
 * allowlist of non-payload columns. No Phase 1 consumer needs event metadata, so the safest and most
 * honest choice is to expose none of it (the run directive's own instruction: "Do NOT expose
 * payment_events.payload to normal members" — omission trivially satisfies this, and the LIVE RLS on
 * `payment_events` denies ordinary buyer/seller members regardless: only
 * `is_platform_admin()`/`is_finance_operator()`/`is_auditor()` have any SELECT policy on it at all).
 *
 * SNAPSHOT-ONLY (T006): `getOrderFinancials`/`getPayoutsForOrder`/`getPayoutsForOrganization` are
 * VERBATIM pass-throughs of `order_financials`/`payouts`. This file never queries `commission_policies`
 * or `commission_tiers`, and performs no money arithmetic (FR-002, FR-016) — grep this file yourself if
 * you doubt it; `tests/finance/read.test.ts` asserts it at the source level.
 */

const PAYMENT_SELECT = "id, order_id, payment_method, provider, external_reference, amount, currency, status, confirmed_at, rejected_reason, correlation_id, created_at, updated_at";

const ORDER_FINANCIALS_SELECT =
  "order_id, base_subtotal, shipping_amount, vat_amount, commission_amount, seller_net_amount, buyer_total_amount, total_quantity_kg, currency, commission_policy_id, commission_percentage_snapshot, tax_rule_id, tax_percentage_snapshot, tax_base_snapshot, calculated_at";

const PROFORMA_SELECT = "id, order_id, proforma_code, status, issued_at, valid_until, file_asset_id";
const PROFORMA_ITEM_SELECT = "id, proforma_id, order_item_id, description, quantity_kg, unit_price, amount";

const TAX_INVOICE_SELECT = "id, order_id, invoice_number, file_asset_id, issued_at, created_at";

const PAYOUT_SELECT = "id, order_id, seller_organization_id, amount, currency, status, paid_at, payment_reference, created_at";

type PaymentRow = {
  id: string;
  order_id: string;
  payment_method: string;
  provider: string | null;
  external_reference: string | null;
  amount: number;
  currency: string;
  status: string;
  confirmed_at: string | null;
  rejected_reason: string | null;
  correlation_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapPaymentRow(row: PaymentRow): PaymentDTO {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentMethod: row.payment_method as PaymentMethod,
    provider: row.provider,
    externalReference: row.external_reference,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PaymentStatus,
    confirmedAt: row.confirmed_at,
    rejectedReason: row.rejected_reason,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `payments` — RLS-scoped (M3 `payments_read`: buyer, finance, platform admin — never a seller or auditor), one row
 * per order (UNIQUE `order_id`). `null` before checkout has ever run, or when the caller is not permitted to see it. */
export async function getPayment({ orderId }: { orderId: string }): Promise<PaymentDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("payments").select(PAYMENT_SELECT).eq("order_id", orderId).maybeSingle();
  return row ? mapPaymentRow(row) : null;
}

type FinancialsRow = {
  order_id: string;
  base_subtotal: number;
  shipping_amount: number;
  vat_amount: number;
  commission_amount: number;
  seller_net_amount: number;
  buyer_total_amount: number;
  total_quantity_kg: number;
  currency: string;
  commission_policy_id: string | null;
  commission_percentage_snapshot: number | null;
  tax_rule_id: string | null;
  tax_percentage_snapshot: number | null;
  tax_base_snapshot: string | null;
  calculated_at: string;
};

/** Verbatim column-for-column mapping (T006) — `Number()` coerces PostgREST's numeric strings, nothing else changes. */
function mapFinancialsRow(row: FinancialsRow): OrderFinancialsDTO {
  return {
    orderId: row.order_id,
    baseSubtotal: Number(row.base_subtotal),
    shippingAmount: Number(row.shipping_amount),
    vatAmount: Number(row.vat_amount),
    commissionAmount: Number(row.commission_amount),
    sellerNetAmount: Number(row.seller_net_amount),
    buyerTotalAmount: Number(row.buyer_total_amount),
    totalQuantityKg: Number(row.total_quantity_kg),
    currency: row.currency,
    commissionPolicyId: row.commission_policy_id,
    commissionPercentageSnapshot: row.commission_percentage_snapshot === null ? null : Number(row.commission_percentage_snapshot),
    taxRuleId: row.tax_rule_id,
    taxPercentageSnapshot: row.tax_percentage_snapshot === null ? null : Number(row.tax_percentage_snapshot),
    taxBaseSnapshot: row.tax_base_snapshot,
    calculatedAt: row.calculated_at,
  };
}

/** `order_financials` — RLS-scoped (M3 `order_financials_read`: buyer, finance, auditor, platform admin — never a
 * seller), a snapshot written ONCE by `checkout_order()` (Feature 007). `null` until checkout has run, or when not permitted. */
export async function getOrderFinancials({ orderId }: { orderId: string }): Promise<OrderFinancialsDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("order_financials").select(ORDER_FINANCIALS_SELECT).eq("order_id", orderId).maybeSingle();
  return row ? mapFinancialsRow(row) : null;
}

/** `proforma_invoices` + its items — RLS-scoped (M3 `proforma_invoices_read`: buyer, finance, platform admin — never a
 * seller or auditor). `null` until checkout has run, or when not permitted (a seller always gets `null`). */
export async function getProforma({ orderId }: { orderId: string }): Promise<ProformaDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("proforma_invoices").select(PROFORMA_SELECT).eq("order_id", orderId).maybeSingle();
  if (!row) return null;

  const { data: itemRows } = await supabase.from("proforma_invoice_items").select(PROFORMA_ITEM_SELECT).eq("proforma_id", row.id).order("description", { ascending: true });

  return {
    id: row.id,
    orderId: row.order_id,
    proformaCode: row.proforma_code,
    status: row.status as ProformaStatus,
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    fileAssetId: row.file_asset_id,
    items: (itemRows ?? []).map((item) => ({
      id: item.id,
      proformaId: item.proforma_id,
      orderItemId: item.order_item_id,
      description: item.description,
      quantityKg: item.quantity_kg === null ? null : Number(item.quantity_kg),
      unitPrice: item.unit_price === null ? null : Number(item.unit_price),
      amount: Number(item.amount),
    })),
  };
}

/** `tax_invoices` — RLS-scoped (M3 `tax_invoices_read`: buyer, finance, platform admin). `null` until issued, or when
 * not permitted. */
export async function getTaxInvoice({ orderId }: { orderId: string }): Promise<TaxInvoiceDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("tax_invoices").select(TAX_INVOICE_SELECT).eq("order_id", orderId).maybeSingle();
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    invoiceNumber: row.invoice_number,
    fileAssetId: row.file_asset_id,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
  };
}

type PayoutRow = {
  id: string;
  order_id: string;
  seller_organization_id: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  payment_reference: string | null;
  created_at: string;
};

function mapPayoutRow(row: PayoutRow): PayoutDTO {
  return {
    id: row.id,
    orderId: row.order_id,
    sellerOrganizationId: row.seller_organization_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status as PayoutStatus,
    paidAt: row.paid_at,
    paymentReference: row.payment_reference,
    createdAt: row.created_at,
  };
}

/** `payouts` for one order (every seller line it produced) — RLS-scoped (`payouts_view`/
 * `payouts_finance_read`, SELECT only; a pure auditor reads none). */
export async function getPayoutsForOrder({ orderId }: { orderId: string }): Promise<readonly PayoutDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("payouts").select(PAYOUT_SELECT).eq("order_id", orderId).order("created_at", { ascending: true });
  return (rows ?? []).map(mapPayoutRow);
}

const DEFAULT_PAYOUT_PAGE_SIZE = 25;
const MAX_PAYOUT_PAGE_SIZE = 100;

/** A seller organization's own payout records, newest first — RLS-scoped (`payouts_view`:
 * `is_org_member(seller_organization_id)`). `organizationId` MUST be the caller's already-resolved
 * `identity.organization.organizationId` — mirrors `lib/orders/read.ts#getOrdersForOrganization`'s own
 * established convention, never a URL/localStorage/hidden-form value.
 *
 * Feature 008 T023 — bounded, exactly like every other org-scoped list in this codebase
 * (`getOrdersForOrganization`, `getManagedListingsWithFills`): one extra row is fetched past
 * `pageSize` to detect `hasMore`, never an unbounded scan of a seller's whole payout history. */
export async function getPayoutsForOrganization({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAYOUT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedPayouts<PayoutDTO>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAYOUT_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("payouts")
    .select(PAYOUT_SELECT)
    .eq("seller_organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;
  return { rows: pageRows.map(mapPayoutRow), hasMore };
}

const SELLER_ORDER_LINE_SELECT =
  "order_code, order_status, order_item_id, seller_organization_id, product_name_snapshot, lot_code_snapshot, quantity_kg, currency, own_gross_amount, own_commission_amount, own_seller_net_amount, own_group_shipment_status, own_payout_status";
const MAX_SELLER_ORDER_LINES = 100;

const nullableNumber = (value: number | string | null) => (value === null ? null : Number(value));

/**
 * Feature 013 T063 — the seller-safe view of one order: the caller's OWN lines only, through the M3 projection
 * `v_seller_order_lines`. `organizationId` MUST be the caller's already-resolved acting organization.
 *
 * The order reference is read from `orders` (the row policy `can_view_order` still admits a seller of the order;
 * M3's column grant never exposes the destination columns and none is selected here). The lines come ONLY from
 * the view, filtered to the acting organization. Returns `null` when the caller has no own line on the order — the
 * same answer for a nonexistent, a cross-organization or a buyer-only order, so existence never leaks.
 */
export async function getSellerOrderLines({ orderId, organizationId }: { orderId: string; organizationId: string }): Promise<SellerOrderViewDTO | null> {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("id, order_code").eq("id", orderId).maybeSingle();
  if (!order) return null;

  const { data: rows } = await supabase
    .from("v_seller_order_lines")
    .select(SELLER_ORDER_LINE_SELECT)
    .eq("order_code", order.order_code)
    .eq("seller_organization_id", organizationId)
    .order("order_item_id", { ascending: true })
    .limit(MAX_SELLER_ORDER_LINES);
  if (!rows || rows.length === 0) return null;
  // `orders.status` is CHECK-bound to the canonical vocabulary; a value outside it (a future migration the app does not
  // know yet) fails closed to the same `null` as "no own line" rather than reaching a badge unvalidated.
  const orderStatus = parseOrderStatus(rows[0]!.order_status);
  if (orderStatus === null) return null;

  return {
    orderId: order.id,
    orderCode: order.order_code,
    orderStatus,
    lines: rows.map((row) => ({
      orderItemId: row.order_item_id,
      productNameSnapshot: row.product_name_snapshot,
      lotCodeSnapshot: row.lot_code_snapshot,
      quantityKg: Number(row.quantity_kg),
      currency: row.currency,
      ownGrossAmount: nullableNumber(row.own_gross_amount),
      ownCommissionAmount: nullableNumber(row.own_commission_amount),
      ownSellerNetAmount: nullableNumber(row.own_seller_net_amount),
      ownGroupShipmentStatus: row.own_group_shipment_status,
      ownPayoutStatus: row.own_payout_status,
    })),
  };
}

const MAX_BATCH_SIZE = 100;

/**
 * Feature 008 T022 — the `payments` rows for ONE ALREADY-FETCHED page of order ids (mirrors
 * `lib/orders/read.ts#getOrderFinancialsForOrders`'s exact bounded-batch shape: never an org-wide
 * scan, never a cross-order "review queue" — the caller must already have resolved and authorized
 * `orderIds` itself, e.g. via `getOrdersForOrganization`). RLS (M3 `payments_read`) is the real boundary;
 * an id the caller was not authorized to see is simply absent from the returned map, same as a single
 * `getPayment` call. This is NOT the finance-operator review-queue read Feature 010's T013 still needs
 * (no proof reference, no cross-organization listing, no hold-status join) — that remains unbuilt.
 */
export async function getPaymentsForOrders({ orderIds }: { orderIds: readonly string[] }): Promise<Map<string, PaymentDTO>> {
  const result = new Map<string, PaymentDTO>();
  const ids = [...new Set(orderIds)].slice(0, MAX_BATCH_SIZE);
  if (ids.length === 0) return result;

  const supabase = await createClient();
  const { data: rows } = await supabase.from("payments").select(PAYMENT_SELECT).in("order_id", ids);
  for (const row of rows ?? []) result.set(row.order_id, mapPaymentRow(row));
  return result;
}
