import { parseOrderStatus } from "@/lib/commerce/validation";
import type { OrderStatus } from "@/lib/commerce/types";
import { createClient } from "@/lib/supabase/server";
import type {
  BuyerOrderFinancialsDTO,
  OrderFinancialsDTO,
  PaginatedPayouts,
  PaymentDTO,
  PaymentQueueItemDTO,
  PaymentReviewDetailDTO,
  PayoutDTO,
  ProformaDTO,
  SellerOrderViewDTO,
  TaxInvoiceDTO,
} from "@/lib/finance/types";
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
 * H2 splits `order_financials`: buyers query `v_buyer_order_financials` (amounts due only), while finance,
 * auditors and platform admins query `v_internal_order_financials` (full frozen settlement). Direct base-table
 * access is revoked from authenticated, so a buyer cannot add internal fields to a PostgREST select.
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
  "order_id, base_subtotal, shipping_amount, vat_amount, buyer_total_amount, total_quantity_kg, currency, calculated_at";
const INTERNAL_ORDER_FINANCIALS_SELECT =
  "order_id, base_subtotal, discount_amount, seller_funded_discount, hills_funded_discount, shipping_amount, vat_amount, buyer_total_amount, total_quantity_kg, commission_amount, seller_net_amount, hills_share_amount, currency, commission_policy_id, commission_percentage_snapshot, tax_rule_id, tax_percentage_snapshot, tax_base_snapshot, calculated_at";

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
  buyer_total_amount: number;
  total_quantity_kg: number;
  currency: string;
  calculated_at: string;
};

/** Buyer-safe verbatim mapping — no commission/seller/Hills settlement field enters this DTO. */
function mapBuyerFinancialsRow(row: FinancialsRow): BuyerOrderFinancialsDTO {
  return {
    orderId: row.order_id,
    baseSubtotal: Number(row.base_subtotal),
    shippingAmount: Number(row.shipping_amount),
    vatAmount: Number(row.vat_amount),
    buyerTotalAmount: Number(row.buyer_total_amount),
    totalQuantityKg: Number(row.total_quantity_kg),
    currency: row.currency,
    calculatedAt: row.calculated_at,
  };
}

type InternalFinancialsRow = FinancialsRow & {
  commission_amount: number;
  seller_net_amount: number;
  hills_share_amount: number;
  commission_policy_id: string | null;
  commission_percentage_snapshot: number | null;
  tax_rule_id: string | null;
  tax_percentage_snapshot: number | null;
  tax_base_snapshot: string | null;
};

function mapInternalFinancialsRow(row: InternalFinancialsRow): OrderFinancialsDTO {
  return {
    ...mapBuyerFinancialsRow(row),
    commissionAmount: Number(row.commission_amount),
    sellerNetAmount: Number(row.seller_net_amount),
    hillsShareAmount: Number(row.hills_share_amount),
    commissionPolicyId: row.commission_policy_id,
    commissionPercentageSnapshot: row.commission_percentage_snapshot === null ? null : Number(row.commission_percentage_snapshot),
    taxRuleId: row.tax_rule_id,
    taxPercentageSnapshot: row.tax_percentage_snapshot === null ? null : Number(row.tax_percentage_snapshot),
    taxBaseSnapshot: row.tax_base_snapshot,
  };
}

/**
 * Returns full frozen settlement only to finance/admin/auditor; otherwise the buyer-safe projection.
 * Sellers and unrelated callers receive null from both views. The table itself is intentionally never queried.
 */
export async function getOrderFinancials({ orderId }: { orderId: string }): Promise<BuyerOrderFinancialsDTO | OrderFinancialsDTO | null> {
  const supabase = await createClient();
  const { data: internal } = await supabase.from("v_internal_order_financials").select(INTERNAL_ORDER_FINANCIALS_SELECT).eq("order_id", orderId).maybeSingle();
  if (internal) return mapInternalFinancialsRow(internal as InternalFinancialsRow);
  const { data: buyer } = await supabase.from("v_buyer_order_financials").select(ORDER_FINANCIALS_SELECT).eq("order_id", orderId).maybeSingle();
  return buyer ? mapBuyerFinancialsRow(buyer as FinancialsRow) : null;
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

// ── Feature 016 Finance-only exact-proof projection ─────────────────────────

type FinanceProofProjectionRow = {
  finalized_proof_id: string;
  payment_id: string;
  file_asset_id: string;
  proof_status: "SUBMITTED" | "ACCEPTED" | "REJECTED";
  claimed_amount: number;
  claimed_currency: string;
  transfer_date: string | null;
  bank_reference: string | null;
  submitted_at: string;
};

/** The only DAL path that resolves an upload intent. The SECURITY DEFINER RPC is deliberately
 * narrower than SELECT access to payment_proof_upload_intents and rechecks Finance/Admin, MFA,
 * and blocked-user state in the database. */
async function getFinanceProofProjection(supabase: Awaited<ReturnType<typeof createClient>>, orderId: string) {
  const { data, error } = await supabase.rpc("finance_payment_proof_projection", { p_order_id: orderId });
  // An authorization/database failure is distinct from an order with no finalized proof. Never
  // present an unavailable proof as absent, because that could let an inspector act on stale data.
  if (error) {
    throw new Error(`finance_payment_proof_projection_failed:${error.code ?? "unknown"}`);
  }
  const rows = (data ?? []) as FinanceProofProjectionRow[];
  return rows.length === 1 ? rows[0]! : null;
}

// ── Feature 016 T018: Pending Payments Queue ────────────────────────────────

/**
 * Feature 016 T018 — Reads pending bank-transfer payments awaiting finance verification.
 * RLS on `payments` and `orders` requires Finance Operator or Platform Admin role.
 */
export async function getPendingPaymentsQueue(): Promise<PaymentQueueItemDTO[]> {
  const supabase = await createClient();

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, order_code, buyer_organization_id, status, current_proforma_id, created_at")
    .eq("status", "PAYMENT_PROOF_SUBMITTED")
    .order("created_at", { ascending: false });

  if (ordersError || !orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((o) => o.id);

  const [paymentsRes, reservationsRes, proofEntries] = await Promise.all([
    supabase
      .from("payments")
      .select("id, order_id, proforma_id, amount, currency, status")
      .in("order_id", orderIds),
    supabase
      .from("inventory_reservations")
      .select("id, order_id, proforma_id, status, expires_at")
      .in("order_id", orderIds),
    Promise.all(orderIds.map(async (id) => [id, await getFinanceProofProjection(supabase, id)] as const)),
  ]);

  const buyerOrgIds = [...new Set(orders.map((o) => o.buyer_organization_id))];
  const orgsRes = buyerOrgIds.length > 0
    ? await supabase
        .from("organizations")
        .select("id, display_name, legal_name")
        .in("id", buyerOrgIds)
    : { data: [] };

  const orgMap = new Map((orgsRes.data ?? []).map((o) => [o.id, o.display_name || o.legal_name || "Unknown Organization"]));
  const paymentMap = new Map((paymentsRes.data ?? []).map((p) => [p.order_id, p]));
  const proofMap = new Map(proofEntries);
  const reservationMap = new Map((reservationsRes.data ?? []).map((r) => [r.order_id, r]));

  const items: PaymentQueueItemDTO[] = [];
  for (const order of orders) {
    const payment = paymentMap.get(order.id);
    if (!payment) continue;
    const proof = proofMap.get(order.id) ?? undefined;
    const reservation = reservationMap.get(order.id);

    items.push({
      orderId: order.id,
      orderCode: order.order_code,
      paymentId: payment.id,
      buyerOrganizationId: order.buyer_organization_id,
      buyerOrganizationName: orgMap.get(order.buyer_organization_id) ?? "Unknown Organization",
      amount: Number(payment.amount),
      currency: payment.currency,
      orderStatus: order.status as OrderStatus,
      paymentStatus: payment.status as PaymentStatus,
      submittedAt: proof?.submitted_at ?? order.created_at,
      claimedAmount: Number(proof?.claimed_amount ?? payment.amount),
      claimedCurrency: proof?.claimed_currency ?? payment.currency,
      bankReference: proof?.bank_reference ?? "",
      fileAssetId: proof?.file_asset_id ?? "",
      finalizedProofId: proof?.finalized_proof_id ?? "",
      reservationStatus: reservation?.status ?? "UNKNOWN",
      expiresAt: reservation?.expires_at ?? null,
    });
  }

  return items;
}

// ── Feature 016 T019: Payment Review Detail ─────────────────────────────────

/**
 * Feature 016 T019 — Loads complete authoritative proforma snapshot, exact finalized
 * proof, reservation lines, and display-safe commercial context for inspector review.
 * Does NOT expose private bucket or storage object paths.
 */
export async function getPaymentReviewDetail(orderId: string): Promise<PaymentReviewDetailDTO | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_code, buyer_organization_id, current_proforma_id, commerce_flow, status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const proofProjectionPromise = getFinanceProofProjection(supabase, orderId);
  const [orgRes, paymentRes, proformaRes, reservationRes] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, display_name, legal_name")
      .eq("id", order.buyer_organization_id)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("id, status, amount, currency, proforma_id")
      .eq("order_id", orderId)
      .maybeSingle(),
    order.current_proforma_id
      ? supabase
          .from("proforma_invoices")
          .select("id, proforma_code, status, buyer_total, currency, confirmed_at, destination_snapshot")
          .eq("id", order.current_proforma_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("inventory_reservations")
      .select("id, status, expires_at")
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);

  const proofProjection = await proofProjectionPromise;
  if (
    !paymentRes.data ||
    !proformaRes.data ||
    proformaRes.data.status !== "CONFIRMED" ||
    !proofProjection ||
    proofProjection.payment_id !== paymentRes.data.id ||
    !reservationRes.data
  ) {
    return null;
  }

  const [itemsRes, groupsRes, resItemsRes] = await Promise.all([
    supabase
      .from("proforma_invoice_items")
      .select("order_item_id, product_name_snapshot, quantity_kg, unit_price, amount, seller_type_snapshot, fulfillment_group_id")
      .eq("proforma_id", proformaRes.data.id),
    supabase
      .from("proforma_fulfillment_groups")
      .select("id, seller_organization_id, warehouse_id, delivery_method, shipping_amount")
      .eq("proforma_id", proformaRes.data.id),
    supabase
      .from("inventory_reservation_items")
      .select("offer_id, inventory_position_id, quantity_kg")
      .eq("reservation_id", reservationRes.data.id),
  ]);

  const dest = (proformaRes.data.destination_snapshot as Record<string, unknown>) ?? {};
  const addressLines = Array.isArray(dest.address_lines)
    ? (dest.address_lines as string[])
    : typeof dest.address_line === "string"
      ? [dest.address_line]
      : [];

  return {
    orderId: order.id,
    orderCode: order.order_code,
    buyerOrganizationId: order.buyer_organization_id,
    buyerOrganizationName: orgRes.data?.display_name || orgRes.data?.legal_name || "Unknown Organization",
    paymentId: paymentRes.data.id,
    paymentStatus: paymentRes.data.status as PaymentStatus,
    amount: Number(paymentRes.data.amount),
    currency: paymentRes.data.currency,
    proforma: {
      id: proformaRes.data.id,
      proformaCode: proformaRes.data.proforma_code,
      status: "CONFIRMED",
      buyerTotal: Number(proformaRes.data.buyer_total),
      currency: proformaRes.data.currency,
      confirmedAt: proformaRes.data.confirmed_at ?? "",
      items: (itemsRes.data ?? []).map((i) => ({
        orderItemId: i.order_item_id,
        productName: i.product_name_snapshot ?? "Coffee Lot",
        quantityKg: Number(i.quantity_kg),
        unitPrice: Number(i.unit_price),
        amount: Number(i.amount),
        sellerTypeSnapshot: i.seller_type_snapshot ?? "MEMBER_SELLER",
        fulfillmentGroupId: i.fulfillment_group_id,
      })),
      fulfillmentGroups: (groupsRes.data ?? []).map((g) => ({
        id: g.id,
        sellerOrganizationId: g.seller_organization_id,
        warehouseId: g.warehouse_id,
        deliveryMethod: g.delivery_method,
        shippingAmount: Number(g.shipping_amount),
      })),
      destination: {
        countryCode: String(dest.country_code ?? "AE"),
        city: String(dest.city ?? "Dubai"),
        addressLines,
        contactName: String(dest.contact_name ?? "Customer"),
        contactPhone: String(dest.contact_phone ?? "+9710000000"),
      },
    },
    proof: {
      id: proofProjection.finalized_proof_id,
      fileAssetId: proofProjection.file_asset_id,
      status: proofProjection.proof_status,
      claimedAmount: Number(proofProjection.claimed_amount),
      claimedCurrency: proofProjection.claimed_currency ?? paymentRes.data.currency,
      transferDate: proofProjection.transfer_date ?? "",
      bankReference: proofProjection.bank_reference ?? "",
      submittedAt: proofProjection.submitted_at,
    },
    reservation: {
      id: reservationRes.data.id,
      status: reservationRes.data.status as "REVIEW_HOLD" | "CONSUMED" | "RELEASED",
      expiresAt: reservationRes.data.expires_at,
      items: (resItemsRes.data ?? []).map((r) => ({
        offerId: r.offer_id,
        inventoryPositionId: r.inventory_position_id,
        quantityKg: Number(r.quantity_kg),
      })),
    },
  };
}

// ── Feature 016 T020: Signed URL for Payment Proof ──────────────────────────

/**
 * Feature 016 T020 — Authorizes and generates a short-lived (max 900-second) signed URL
 * for inspecting payment proofs in the `payment-proofs` private bucket.
 */
export async function getPaymentProofSignedUrl(fileAssetId: string): Promise<{
  signedUrl: string;
  expiresInSeconds: number;
  mimeType: string;
  filename: string;
} | null> {
  const supabase = await createClient();

  const { data, error: projectionError } = await supabase.rpc("finance_payment_proof_asset_projection", { p_file_asset_id: fileAssetId });
  if (projectionError) {
    throw new Error(`finance_payment_proof_asset_projection_failed:${projectionError.code ?? "unknown"}`);
  }
  const rows = (data ?? []) as Array<{
    file_asset_id: string;
    bucket_name: string;
    object_path: string;
    mime_type: string | null;
    original_name: string | null;
  }>;
  const fileAsset = rows.length === 1 ? rows[0] : null;
  if (!fileAsset || !fileAsset.object_path || fileAsset.bucket_name !== "payment-proofs") return null;

  const { data: signed, error } = await supabase.storage
    .from("payment-proofs")
    .createSignedUrl(fileAsset.object_path, 900);

  if (error || !signed?.signedUrl) {
    throw new Error(`finance_payment_proof_signed_url_failed:${error?.message ?? "missing_url"}`);
  }

  return {
    signedUrl: signed.signedUrl,
    expiresInSeconds: 900,
    mimeType: fileAsset.mime_type || "application/octet-stream",
    filename: fileAsset.original_name || "payment-proof",
  };
}
