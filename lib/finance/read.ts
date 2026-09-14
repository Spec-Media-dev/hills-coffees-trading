import { createClient } from "@/lib/supabase/server";
import type { OrderFinancialsDTO, PaymentDTO, PayoutDTO, ProformaDTO, TaxInvoiceDTO } from "@/lib/finance/types";
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
 * THE LIVE RLS BOUNDARY THIS FILE MUST NEVER WEAKEN (read directly from `docs/database/
 * database-schema-report.json`'s `rls_policies`, 2026-09-13 preflight — never assumed)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `payments` — `payments_view`: `is_platform_admin() OR can_view_order(order_id)` (buyer org, any
 * seller org on the order, or a platform admin); `payments_finance_read`: `is_finance_operator() OR
 * is_auditor()`. So: buyer/seller/admin/finance/auditor may read; cross-org and anonymous may not (no
 * `anon` grant exists on this table at all).
 *
 * `order_financials` — `financials_view`: `can_view_order(order_id)`; `financials_finance_read`:
 * `is_finance_operator() OR is_auditor()`. Same effective access as `payments`.
 *
 * `proforma_invoices` / `proforma_invoice_items` — ONLY `can_view_order(order_id)`
 * (`proforma_view`/`proforma_items_view`). THERE IS NO independent finance- or auditor-role SELECT
 * policy on these two tables: a FINANCE- or AUDITOR-role account that is not ALSO a platform admin and
 * not a party to the order (buyer/seller org) genuinely cannot read a proforma today. This is the
 * CURRENT database's own decision, not an application-side restriction — do not work around it.
 *
 * `tax_invoices` — `tax_invoice_view`: `can_view_order(order_id)`; `tax_invoice_finance`:
 * `is_finance_operator()` (ALL commands, not only SELECT). THERE IS NO auditor-specific policy here
 * either: a pure AUDITOR (not also ADMIN/SUPER_ADMIN/FINANCE) cannot read `tax_invoices`.
 *
 * `payouts` — `payouts_view`: `is_platform_admin() OR is_org_member(seller_organization_id)` (the
 * seller organization itself, or a platform admin); `payouts_finance`: `is_finance_operator()` (ALL
 * commands). Same auditor gap as `tax_invoices`: a pure AUDITOR cannot read `payouts`.
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

/** `payments` — RLS-scoped (`payments_view`/`payments_finance_read`), one row per order (UNIQUE
 * `order_id`). `null` before checkout has ever run, or when the caller is not permitted to see it. */
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

/** `order_financials` — RLS-scoped (`financials_view`/`financials_finance_read`), a snapshot written
 * ONCE by `checkout_order()` (Feature 007). `null` until checkout has run, or when not permitted. */
export async function getOrderFinancials({ orderId }: { orderId: string }): Promise<OrderFinancialsDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("order_financials").select(ORDER_FINANCIALS_SELECT).eq("order_id", orderId).maybeSingle();
  return row ? mapFinancialsRow(row) : null;
}

/** `proforma_invoices` + its items — RLS-scoped (`proforma_view`/`proforma_items_view`, buyer/seller/
 * platform-admin ONLY — see this file's own header for the confirmed absence of a finance/auditor
 * policy on this table). `null` until checkout has run, or when not permitted. */
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

/** `tax_invoices` — RLS-scoped (`tax_invoice_view`/`tax_invoice_finance`; see this file's own header
 * for the confirmed absence of an auditor policy). `null` until issued, or when not permitted. */
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
 * `payouts_finance`; see this file's own header for the confirmed absence of an auditor policy). */
export async function getPayoutsForOrder({ orderId }: { orderId: string }): Promise<readonly PayoutDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("payouts").select(PAYOUT_SELECT).eq("order_id", orderId).order("created_at", { ascending: true });
  return (rows ?? []).map(mapPayoutRow);
}

/** A seller organization's own payout records, newest first — RLS-scoped (`payouts_view`:
 * `is_org_member(seller_organization_id)`). `organizationId` MUST be the caller's already-resolved
 * `identity.organization.organizationId` — mirrors `lib/orders/read.ts#getOrdersForOrganization`'s own
 * established convention, never a URL/localStorage/hidden-form value. */
export async function getPayoutsForOrganization({ organizationId }: { organizationId: string }): Promise<readonly PayoutDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("payouts").select(PAYOUT_SELECT).eq("seller_organization_id", organizationId).order("created_at", { ascending: false });
  return (rows ?? []).map(mapPayoutRow);
}
