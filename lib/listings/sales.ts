import { createClient } from "@/lib/supabase/server";

/**
 * Feature 006 RUN C (T019) — seller sales reconciliation. SERVER-ONLY, org-scoped reads of
 * `order_items` (the seller's own settled/in-progress line items), joined to `orders` ONLY for the
 * safe, member-facing reference fields (`order_code`, `status`, dates) — NEVER `buyer_organization_id`
 * or any other buyer-identifying column, per the run directive's own "do not expose buyer private
 * organization data" rule.
 *
 * `order_items` already carries its OWN point-in-time snapshot of everything this view needs
 * (`quantity_kg`, `unit_price_per_kg`, `currency`, `product_name_snapshot`, `lot_code_snapshot`) —
 * confirmed live (RUN B's T014 preflight). This means DB-OPEN-05 (the broken `coffee_lots` member-read
 * policy) does NOT affect this view at all: no join to `coffee_lots`/`coffee_offers` is needed or
 * performed here.
 *
 * `can_view_order()` (confirmed live) has a genuine SELLER branch — `EXISTS (order_items oi JOIN
 * coffee_offers co ON co.id = oi.offer_id JOIN organization_members om ON om.organization_id =
 * co.seller_organization_id WHERE oi.order_id = p_order_id AND om.user_id = auth.uid())` — so a
 * seller's own `order_items`/`orders` rows are genuinely RLS-readable, no service role, no bypass.
 * `seller_organization_id` is filtered explicitly here for CORRECTNESS with a multi-org caller
 * (mirroring every other function in this feature) — RLS is still the real security boundary.
 *
 * NO reduce()/tally across rows to fabricate a "total sold" figure beyond what is directly rendered
 * per row — the caller sums the ALREADY-authoritative `quantityKg`/`totalValue` fields for display,
 * never re-derives a quantity from elsewhere.
 */

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export type SalesLineItem = {
  id: string;
  orderId: string;
  /** `orders.order_code` — safe member-facing reference; never the buyer's organization identity. */
  orderCode: string | null;
  orderStatus: string | null;
  orderCreatedAt: string | null;
  productNameSnapshot: string | null;
  lotCodeSnapshot: string | null;
  quantityKg: number;
  unitPricePerKg: number;
  currency: string;
  createdAt: string;
};

export type PaginatedSalesLineItems = {
  rows: readonly SalesLineItem[];
  hasMore: boolean;
};

const ORDER_ITEMS_SELECT = "id, order_id, seller_organization_id, quantity_kg, unit_price_per_kg, currency, product_name_snapshot, lot_code_snapshot, created_at";

export async function getSellerSalesLineItems({
  organizationId,
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  organizationId: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedSalesLineItems> {
  const boundedPageSize = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE));
  const from = Math.max(0, page) * boundedPageSize;
  const to = from + boundedPageSize;

  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("order_items")
    .select(ORDER_ITEMS_SELECT)
    .eq("seller_organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  const allRows = rows ?? [];
  const hasMore = allRows.length > boundedPageSize;
  const pageRows = hasMore ? allRows.slice(0, boundedPageSize) : allRows;

  if (pageRows.length === 0) return { rows: [], hasMore: false };

  const orderIds = [...new Set(pageRows.map((row) => row.order_id))];
  const { data: orderRows } = await supabase.from("orders").select("id, order_code, status, created_at").in("id", orderIds);
  const orderById = new Map((orderRows ?? []).map((row) => [row.id, row]));

  return {
    rows: pageRows.map((row) => {
      const order = orderById.get(row.order_id);
      return {
        id: row.id,
        orderId: row.order_id,
        orderCode: order?.order_code ?? null,
        orderStatus: order?.status ?? null,
        orderCreatedAt: order?.created_at ?? null,
        productNameSnapshot: row.product_name_snapshot,
        lotCodeSnapshot: row.lot_code_snapshot,
        quantityKg: Number(row.quantity_kg),
        unitPricePerKg: Number(row.unit_price_per_kg),
        currency: row.currency,
        createdAt: row.created_at,
      };
    }),
    hasMore,
  };
}
