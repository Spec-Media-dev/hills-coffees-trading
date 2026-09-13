import { createClient } from "@/lib/supabase/server";
import { mapOrderError } from "@/lib/orders/errors";
import { getOrderById } from "@/lib/orders/read";
import type { OrderItemDTO, OrderStatus } from "@/lib/orders/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T004) — the draft-order write layer. Every exported function here assumes the
 * caller (`src/app/dashboard/orders/actions.ts`) has ALREADY validated input (Zod) and resolved/
 * authorized an acting, buy-capable identity — this file never calls `getRequestIdentity()` itself
 * (mirrors `lib/listings/manage.ts`'s "reads only" separation of concerns, applied here to writes).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * NO PARALLEL BUSINESS LOGIC — the database remains the sole authority
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `validate_order_item_offer` (fires on every `order_items` INSERT) is the ONLY place listing
 * eligibility for a purchase is decided — this file never re-implements "is this offer published",
 * "is the quantity available", or "is this buyer's own listing" checks; it inserts an explicit,
 * minimal allowlist and lets the trigger accept or refuse. Every server/trigger-derived field
 * (`lot_id`, `seller_organization_id`, `unit_price_per_kg`, `product_name_snapshot`,
 * `origin_name_snapshot`, `variant_name_snapshot`, `lot_code_snapshot`, `seller_type_snapshot`,
 * `currency`) is DELIBERATELY OMITTED from the insert — `validate_order_item_offer`'s own body
 * (read live, 2026-09-13) derives every one of them from the offer/lot/coffee rows itself (via a
 * `SECURITY DEFINER` join that bypasses RLS, so it succeeds even though a member session can never
 * read `coffee_lots` directly — DB-OPEN-05 does not block this write path). There is no field
 * anywhere in this file's insert shape a client could use to smuggle a price, provenance, or
 * seller-type value — confirmed structurally, not merely by convention.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DB-OPEN-13 — order_items has NO buyer UPDATE/DELETE RLS policy (confirmed live, recorded in
 * `docs/architecture/DATABASE-CAPABILITY-MAP.md` §9)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The live RLS policy set on `order_items` is exactly THREE policies: `order_items_create_buyer`
 * (INSERT), `order_items_view` (SELECT), and `order_items_admin` (ALL, `is_platform_admin()` only).
 * There is no buyer-facing UPDATE or DELETE policy at all. This means a buyer can ADD an item to a
 * DRAFT order, but can never remove or change the quantity of an item already added — regardless of
 * order status — through ordinary RLS. This is a genuine, confirmed database-capability gap against
 * spec.md's PS1 acceptance scenario 4 ("when the buyer edits quantities, then changes are permitted
 * only while the order remains DRAFT") — NOT worked around here with a service-role bypass, a
 * second "shadow" table, or client-side-only removal. `addOrderItem` below is therefore the ONLY
 * item-mutation function this file exports; there is no `removeOrderItem`/`updateOrderItemQuantity`
 * function, and the draft-editor UI (`components/orders/draft-editor.tsx`) does not offer a
 * remove/edit control that could never succeed. See the Feature 007 handoff §5 for the full account.
 */

const ORDER_ITEM_SELECT =
  "id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, origin_name_snapshot, variant_name_snapshot, lot_code_snapshot, seller_type_snapshot, currency, created_at";

type OrderItemRow = {
  id: string;
  order_id: string;
  offer_id: string;
  lot_id: string;
  seller_organization_id: string;
  quantity_kg: number;
  unit_price_per_kg: number;
  product_name_snapshot: string;
  origin_name_snapshot: string | null;
  variant_name_snapshot: string | null;
  lot_code_snapshot: string;
  seller_type_snapshot: string;
  currency: string;
  created_at: string;
};

function mapOrderItemRow(row: OrderItemRow): OrderItemDTO {
  return {
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
  };
}

/**
 * Creates a new `DRAFT` order for the caller's ALREADY-VERIFIED, buy-capable acting organization.
 * Explicit two-field insert allowlist: `buyer_organization_id` and `created_by` — NOT `status`
 * (relies on the column's own `DRAFT` default), NOT `idempotency_key`/`correlation_id` (irrelevant
 * before checkout, Phase 4), NOT `currency`/`order_code` (both column defaults). There is no field
 * in this function's own parameter list a caller could use to select any of those.
 *
 * The `orders_create_buyer` policy's own `with_check` (`is_org_member AND organization_can_buy AND
 * created_by = auth.uid() AND status = 'DRAFT'`) is a real, independent second gate — this function's
 * caller (`requireBuyerCapableIdentity` in `actions.ts`) already checks `organization.canBuy` first,
 * so the RLS gate is defense in depth, not the primary signal; a bypass attempt (forged org id, for
 * instance) would still be refused by RLS/the FK constraint even if the application check were
 * somehow skipped.
 *
 * DB-OPEN-14 (confirmed live, recorded in `docs/architecture/DATABASE-CAPABILITY-MAP.md` §9): a
 * plain `INSERT INTO orders` succeeds, but PostgREST's `INSERT ... RETURNING` (a chained
 * `.select()`) fails RLS on this ONE table specifically — `orders_view`'s own SELECT policy
 * (`can_view_order(id)`) self-references `orders` from inside its buyer-branch subquery, and Postgres
 * applies that SELECT policy to the RETURNING projection in addition to the INSERT policy's
 * `WITH CHECK`. The insert below is therefore deliberately NOT chained to `.select()` — the created
 * row's id is read back via a genuinely SEPARATE, already-proven-working `getOrderById` call. This is
 * not a workaround around RLS (no service-role, no weakened policy) — it is two ordinary,
 * RLS-respecting round-trips instead of one.
 */
export async function createDraftOrder({ organizationId, userId }: { organizationId: string; userId: string }): Promise<ActionFeedbackResult<{ id: string; orderCode: string; status: OrderStatus }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("orders").insert({ buyer_organization_id: organizationId, created_by: userId });

  if (error) {
    return { ok: false, code: mapOrderError(error) };
  }

  // Read the just-created row back separately (DB-OPEN-14) — newest DRAFT order for this org.
  const { data: created } = await supabase
    .from("orders")
    .select("id, order_code, status")
    .eq("buyer_organization_id", organizationId)
    .eq("created_by", userId)
    .eq("status", "DRAFT")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!created) {
    return { ok: false, code: mapOrderError(error) };
  }

  return { ok: true, data: { id: created.id, orderCode: created.order_code, status: created.status as OrderStatus } };
}

/**
 * Adds one `order_items` row to the caller's own DRAFT order (T004/PS1). Re-reads the parent order,
 * org-scoped, BEFORE attempting the insert — own defense-in-depth (never a substitute for
 * `validate_order_item_offer`'s own trigger-level check, which fires regardless): a nonexistent or
 * cross-org order id refuses with `ORDER_NOT_FOUND`, identically, before any listing data is even
 * touched (no existence leak); a real but non-DRAFT order refuses with `ORDER_NOT_EDITABLE` (T006)
 * without ever attempting the DB write.
 *
 * The insert itself lists exactly THREE fields — `order_id`, `offer_id`, `quantity_kg` — never a
 * spread of parsed form input. Every other `order_items` column is server/trigger-derived (see this
 * file's own header) or column-defaulted (`currency`).
 */
export async function addOrderItem({
  organizationId,
  orderId,
  offerId,
  quantityKg,
}: {
  organizationId: string;
  orderId: string;
  offerId: string;
  quantityKg: number;
}): Promise<ActionFeedbackResult<OrderItemDTO>> {
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }
  if (order.status !== "DRAFT") {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_EDITABLE };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("order_items")
    .insert({ order_id: orderId, offer_id: offerId, quantity_kg: quantityKg })
    .select(ORDER_ITEM_SELECT)
    .single();

  if (error || !inserted) {
    return { ok: false, code: mapOrderError(error) };
  }

  return { ok: true, data: mapOrderItemRow(inserted) };
}
