import type { FillProjection } from "@/lib/listings/types";
import { getRequestIdentity } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { mapCommerceError, type CommerceErrorCode } from "./errors";

/**
 * The caller's buying organization for member commerce UI (add-to-cart state), or null. A display input only — never a
 * guard: the dashboard/marketplace layouts own access control, and every commerce RPC re-authorizes in the database.
 */
export async function getBuyerOrganizationId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  return identity.kind === "authenticated" && identity.organization?.canBuy ? identity.organization.organizationId : null;
}

export type CartDisabledReason = "own" | "unavailable" | undefined;

/**
 * Server-authoritative eligibility logic shared between listing card and detail page.
 * Prevents duplicated or inconsistent frontend eligibility conditions.
 */
export function getCartDisabledReason(
  buyerOrganizationId: string | null | undefined,
  sellerOrganizationId: string,
  projection: FillProjection
): CartDisabledReason {
  if (!buyerOrganizationId) return "unavailable";
  if (buyerOrganizationId === sellerOrganizationId) return "own";
  if (!projection.ok || projection.remainingQuantityKg <= 0) return "unavailable";
  return undefined;
}

export type CartResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: CommerceErrorCode | "commerce_error" | "validation_error" };

export type CartLine = {
  id: string;
  offerId: string;
  sellerOrganizationId: string;
  sellerType: string;
  warehouseId: string | null;
  warehouseName: string | null;
  productName: string;
  quantityKg: number;
  estimatedUnitPrice: number;
  currency: string;
  eligible: boolean;
};

export type Cart = { orderId: string | null; lines: CartLine[] };

/** RLS-scoped read. Never creates a cart merely because the page was visited. */
export async function readCart(organizationId: string): Promise<Cart> {
  const supabase = await createClient();
  const { data: order, error: orderError } = await supabase.from("orders")
    .select("id")
    .eq("buyer_organization_id", organizationId)
    .eq("commerce_flow", "BANK_TRANSFER_V1")
    .eq("status", "DRAFT")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) throw new Error("cart_read_failed");
  if (!order) return { orderId: null, lines: [] };

  const { data: items, error: itemsError } = await supabase.from("order_items")
    .select("id, offer_id, seller_organization_id, seller_type_snapshot, product_name_snapshot, quantity_kg, unit_price_per_kg, currency")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });
  if (itemsError) throw new Error("cart_read_failed");
  const offerIds = (items ?? []).map((item) => item.offer_id);
  const { data: offers, error: offersError } = offerIds.length
    ? await supabase.from("coffee_offers").select("id, warehouse_id").in("id", offerIds)
    : { data: [] as { id: string; warehouse_id: string }[], error: null };
  if (offersError) throw new Error("cart_read_failed");
  const offerById = new Map((offers ?? []).map((offer) => [offer.id, offer]));
  const warehouseIds = [...new Set((offers ?? []).map((offer) => offer.warehouse_id))];
  const { data: warehouses, error: warehousesError } = warehouseIds.length
    ? await supabase.from("warehouses").select("id, name").in("id", warehouseIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (warehousesError) throw new Error("cart_read_failed");
  const warehouseById = new Map((warehouses ?? []).map((warehouse) => [warehouse.id, warehouse.name]));

  return {
    orderId: order.id,
    lines: (items ?? []).map((item) => {
      const warehouseId = offerById.get(item.offer_id)?.warehouse_id ?? null;
      return {
        id: item.id,
        offerId: item.offer_id,
        sellerOrganizationId: item.seller_organization_id,
        sellerType: item.seller_type_snapshot,
        warehouseId,
        warehouseName: warehouseId ? warehouseById.get(warehouseId) ?? null : null,
        productName: item.product_name_snapshot,
        quantityKg: Number(item.quantity_kg),
        estimatedUnitPrice: Number(item.unit_price_per_kg),
        currency: item.currency,
        eligible: warehouseId !== null && warehouseById.has(warehouseId),
      };
    }),
  };
}

/** One M4a RPC is the only write; the database checks seller, stock and membership. */
export async function addCartLine(organizationId: string, offerId: string, quantityKg: number, requestId: string): Promise<CartResult<{ orderId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_cart_line", {
    p_org_id: organizationId, p_offer_id: offerId, p_quantity_kg: quantityKg, p_request_id: requestId,
  });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  if (!data || typeof data.order_id !== "string") return { ok: false, code: "commerce_error" };
  return { ok: true, data: { orderId: data.order_id } };
}

/** The historical edit RPC has no request-id argument. Ownership is checked before the RPC and again by the DB. */
export async function updateCartLine(organizationId: string, orderId: string, lineId: string, quantityKg: number): Promise<CartResult> {
  const cart = await readCart(organizationId);
  if (cart.orderId !== orderId || !cart.lines.some((line) => line.id === lineId)) return { ok: false, code: "order_not_found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_order_item_quantity", { p_order_item_id: lineId, p_quantity_kg: quantityKg });
  return error ? { ok: false, code: mapCommerceError(error).code } : { ok: true, data: undefined };
}

export async function removeCartLine(organizationId: string, orderId: string, lineId: string): Promise<CartResult> {
  const cart = await readCart(organizationId);
  if (cart.orderId !== orderId || !cart.lines.some((line) => line.id === lineId)) return { ok: false, code: "order_not_found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_order_item", { p_order_item_id: lineId });
  return error ? { ok: false, code: mapCommerceError(error).code } : { ok: true, data: undefined };
}
