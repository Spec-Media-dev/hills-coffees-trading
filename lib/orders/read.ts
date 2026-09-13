import { createClient } from "@/lib/supabase/server";
import type {
  OrderFinancialsDTO,
  OrderItemDTO,
  OrderShipmentDTO,
  OrderStatus,
  OrderStatusHistoryEntry,
  OrderSummary,
  PaginatedOrders,
  ProformaDTO,
  ShipmentItemDTO,
} from "@/lib/orders/validation";

/**
 * Feature 007 RUN A (T003) — SERVER-ONLY, `can_view_order`-scoped reads for the order/draft/
 * shipment domain (imports `lib/supabase/server`, which pulls in `next/headers` — never import
 * from a Client Component). Every read runs under the caller's own request-scoped, RLS-respecting
 * client — never the service-role key (SEC-003). No `unstable_cache`/`"use cache"`/`cacheTag`/
 * `cacheLife`/`updateTag` anywhere in this file (FR-012) — order data is transactional truth,
 * re-read fresh on every call.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SECURITY BOUNDARY THIS FILE MUST NEVER WEAKEN
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `orders_view` (confirmed live) is `can_view_order(id)`, and `can_view_order()` itself grants
 * visibility to BOTH the order's own buyer organization AND any organization that is the SELLER on
 * at least one of the order's `order_items`. This file's `organizationId`-scoped functions
 * (`getOrdersForOrganization`, `getOrderById`) additionally apply an explicit
 * `.eq("buyer_organization_id", organizationId)` filter — the SAME defense-in-depth convention
 * `lib/listings/manage.ts#getManagedListingById` already established — because this run's
 * consumers (T004–T007, all buyer-owned draft/shipment flows) only ever need the BUYER's own view.
 * A seller-side "what orders include my listings" read is a genuinely different, not-yet-built
 * capability, deliberately out of RUN A's scope (no Phase 6/7/8/9 task requires it yet) — it is NOT
 * silently narrowed here to look complete; it simply does not exist as a function in this file.
 *
 * `getOrderItems`/`getOrderStatusHistory`/`getOrderShipments`/`getOrderFinancials`/`getProforma`
 * take only an already-verified `orderId` (the caller — a Server Action or page — must have already
 * resolved and authorized the parent order via `getOrderById` first) and rely on RLS
 * (`order_items_view`/`order_history_view`/`shipments_view`/`financials_view`/`proforma_view`, all
 * `can_view_order`-gated) as the sole further boundary — a cross-org id simply returns empty/null,
 * never an error, never a distinguishable "exists but not yours" signal.
 *
 * NO RESERVATION-TABLE READ: this file never queries `inventory_reservations` or
 * `inventory_reservation_items` (SEC-003/the run directive's own explicit prohibition) — hold state
 * is presented from `orders.hold_expires_at`/`orders.status` alone, both already selected by
 * `getOrderById`/`getOrdersForOrganization` above.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const ORDER_SELECT =
  "id, order_code, buyer_organization_id, status, currency, hold_started_at, hold_expires_at, confirmed_at, paid_at, completed_at, created_by, created_at, updated_at, correlation_id";

const ORDER_ITEM_SELECT =
  "id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, origin_name_snapshot, variant_name_snapshot, lot_code_snapshot, seller_type_snapshot, currency, created_at";

const ORDER_FINANCIALS_SELECT =
  "order_id, base_subtotal, shipping_amount, vat_amount, commission_amount, seller_net_amount, buyer_total_amount, total_quantity_kg, currency, commission_policy_id, commission_percentage_snapshot, tax_rule_id, tax_percentage_snapshot, tax_base_snapshot, calculated_at";

const PROFORMA_SELECT = "id, order_id, proforma_code, status, issued_at, valid_until, file_asset_id";
const PROFORMA_ITEM_SELECT = "id, proforma_id, order_item_id, description, quantity_kg, unit_price, amount";

const ORDER_STATUS_HISTORY_SELECT = "id, order_id, old_status, new_status, changed_by, reason, created_at";

const ORDER_SHIPMENT_SELECT =
  "id, order_id, shipment_code, status, delivery_method, country_code, city, address_line, contact_name, contact_phone, shipping_fee, currency, ready_at, delivered_at, created_by, created_at, updated_at";

const SHIPMENT_ITEM_SELECT = "id, shipment_id, order_item_id, planned_quantity_kg, delivered_quantity_kg";

type OrderRow = {
  id: string;
  order_code: string;
  buyer_organization_id: string;
  status: string;
  currency: string;
  hold_started_at: string | null;
  hold_expires_at: string | null;
  confirmed_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  correlation_id: string | null;
};

function mapOrderRow(row: OrderRow): OrderSummary {
  return {
    id: row.id,
    orderCode: row.order_code,
    buyerOrganizationId: row.buyer_organization_id,
    status: row.status as OrderStatus,
    currency: row.currency,
    holdStartedAt: row.hold_started_at,
    holdExpiresAt: row.hold_expires_at,
    confirmedAt: row.confirmed_at,
    paidAt: row.paid_at,
    completedAt: row.completed_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    correlationId: row.correlation_id,
  };
}

/**
 * The caller's own organization's orders, newest first. `organizationId` MUST be the caller's
 * already-resolved `identity.organization.organizationId` — never `organizations[0]`, a URL/
 * localStorage/hidden-form value (mirrors `lib/listings/manage.ts`'s own established convention).
 */
export async function getOrdersForOrganization({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedOrders<OrderSummary>> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("buyer_organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;
  return { rows: pageRows.map(mapOrderRow), hasMore };
}

/**
 * Single-order lookup, org-scoped exactly like `lib/listings/manage.ts#getManagedListingById` — a
 * nonexistent id and a cross-org id return the IDENTICAL `null`, so a caller cannot distinguish
 * "not yours" from "does not exist" (SEC-002).
 */
export async function getOrderById({ organizationId, orderId }: { organizationId: string; orderId: string }): Promise<OrderSummary | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("orders").select(ORDER_SELECT).eq("id", orderId).eq("buyer_organization_id", organizationId).maybeSingle();
  return row ? mapOrderRow(row) : null;
}

/**
 * `order_items` for an already-authorized order. RLS (`order_items_view`: `can_view_order(order_id)`)
 * is the real boundary — callers must have already resolved the parent order (via `getOrderById`)
 * before calling this, matching `lib/listings/manage.ts#getListingStatusHistory`'s own convention.
 */
export async function getOrderItems({ orderId }: { orderId: string }): Promise<readonly OrderItemDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("order_items").select(ORDER_ITEM_SELECT).eq("order_id", orderId).order("created_at", { ascending: true }).order("id", { ascending: true });

  return (rows ?? []).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    offerId: row.offer_id,
    lotId: row.lot_id,
    sellerOrganizationId: row.seller_organization_id,
    quantityKg: Number(row.quantity_kg),
    unitPricePerKg: Number(row.unit_price_per_kg),
    productNameSnapshot: row.product_name_snapshot,
    originNameSnapshot: row.origin_name_snapshot,
    variantNameSnapshot: row.variant_name_snapshot,
    lotCodeSnapshot: row.lot_code_snapshot,
    sellerTypeSnapshot: row.seller_type_snapshot as OrderItemDTO["sellerTypeSnapshot"],
    currency: row.currency,
    createdAt: row.created_at,
  }));
}

/**
 * `order_financials` — a VERBATIM pass-through, never recomputed (FR-010). `null` for every RUN A
 * order (the row is written exactly once, by `checkout_order()`, Phase 4 — not called this run).
 */
export async function getOrderFinancials({ orderId }: { orderId: string }): Promise<OrderFinancialsDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("order_financials").select(ORDER_FINANCIALS_SELECT).eq("order_id", orderId).maybeSingle();
  if (!row) return null;

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

/** `proforma_invoices` + its items — issued ONLY by `checkout_order()`. `null` for every RUN A order. */
export async function getProforma({ orderId }: { orderId: string }): Promise<ProformaDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("proforma_invoices").select(PROFORMA_SELECT).eq("order_id", orderId).maybeSingle();
  if (!row) return null;

  const { data: itemRows } = await supabase.from("proforma_invoice_items").select(PROFORMA_ITEM_SELECT).eq("proforma_id", row.id).order("description", { ascending: true });

  return {
    id: row.id,
    orderId: row.order_id,
    proformaCode: row.proforma_code,
    status: row.status as ProformaStatusValue,
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
type ProformaStatusValue = ProformaDTO["status"];

/** `order_status_history` — read-only, `can_view_order`-scoped. Empty for a fresh DRAFT (the recording trigger fires only `AFTER UPDATE OF status`). */
export async function getOrderStatusHistory({ orderId }: { orderId: string }): Promise<readonly OrderStatusHistoryEntry[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("order_status_history").select(ORDER_STATUS_HISTORY_SELECT).eq("order_id", orderId).order("created_at", { ascending: true }).order("id", { ascending: true });

  return (rows ?? []).map((row) => ({
    id: String(row.id),
    orderId: row.order_id,
    oldStatus: row.old_status as OrderStatus | null,
    newStatus: row.new_status as OrderStatus,
    changedBy: row.changed_by,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

/** `order_shipments` for an already-authorized order — the buyer's own shipment plan(s). */
export async function getOrderShipments({ orderId }: { orderId: string }): Promise<readonly OrderShipmentDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("order_shipments").select(ORDER_SHIPMENT_SELECT).eq("order_id", orderId).order("created_at", { ascending: true });

  return (rows ?? []).map((row) => ({
    id: row.id,
    orderId: row.order_id,
    shipmentCode: row.shipment_code,
    status: row.status as OrderShipmentDTO["status"],
    deliveryMethod: row.delivery_method,
    countryCode: row.country_code,
    city: row.city,
    addressLine: row.address_line,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    shippingFee: Number(row.shipping_fee),
    currency: row.currency,
    readyAt: row.ready_at,
    deliveredAt: row.delivered_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** `shipment_items` for one already-authorized shipment. */
export async function getShipmentItems({ shipmentId }: { shipmentId: string }): Promise<readonly ShipmentItemDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("shipment_items").select(SHIPMENT_ITEM_SELECT).eq("shipment_id", shipmentId);

  return (rows ?? []).map((row) => ({
    id: row.id,
    shipmentId: row.shipment_id,
    orderItemId: row.order_item_id,
    plannedQuantityKg: Number(row.planned_quantity_kg),
    deliveredQuantityKg: Number(row.delivered_quantity_kg),
  }));
}
