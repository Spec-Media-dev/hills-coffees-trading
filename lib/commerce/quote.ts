import { createClient } from "@/lib/supabase/server";

import { mapCommerceError, type CommerceErrorCode } from "./errors";

/**
 * Feature 013 T084 — buyer-facing checkout estimate. A thin, single-caller wrapper around the
 * server-computed `estimate_cart` RPC (already authenticated-scoped, buyer-member-checked, MFA-checked
 * inside the database). This file never computes a price, discount, tax or total itself (SEC-003):
 * every number below is exactly what the RPC returned, only reshaped from snake_case JSON to a typed
 * object — no `*`/`+` on any money field anywhere in this file.
 */
export type QuoteResult<T = undefined> = { ok: true; data: T } | { ok: false; code: CommerceErrorCode | "commerce_error" };

export type EstimateLine = {
  offerCode: string;
  productName: string;
  quantityKg: number;
  unitPrice: number;
  gross: number;
  discount: number;
  net: number;
  vat: number | null;
};

export type EstimateGroup = {
  sellerId: string;
  warehouseId: string;
  shippingRuleId: string | null;
  deliveryMethod: string;
  shipping: number;
  shippingVat: number;
  merchandiseNet: number;
};

export type CheckoutEstimate = {
  isEstimate: true;
  /** `"destination_required"` when no destination was passed — shipping/VAT/total are then null. */
  reason: "destination_required" | null;
  orderId: string;
  currency: "USD";
  lines: readonly EstimateLine[];
  groups: readonly EstimateGroup[];
  merchandiseGross: number;
  discountTotal: number;
  merchandiseNet: number;
  shippingTotal: number | null;
  vatTotal: number | null;
  buyerTotal: number | null;
};

/** `p_destination_id: null` is a valid, intentional call — the RPC itself returns the partial estimate (FR-015: this
 * never reserves anything; it is read-only). */
export async function getCheckoutEstimate(orderId: string, destinationId: string | null): Promise<QuoteResult<CheckoutEstimate>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("estimate_cart", { p_order_id: orderId, p_destination_id: destinationId, p_promo_code: null });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  if (!data || typeof data !== "object") return { ok: false, code: "commerce_error" };
  const raw = data as Record<string, unknown>;
  const lines = Array.isArray(raw.lines)
    ? (raw.lines as Record<string, unknown>[]).map((line) => ({
        offerCode: String(line.offer_code ?? ""),
        productName: String(line.product_name ?? ""),
        quantityKg: Number(line.quantity_kg),
        unitPrice: Number(line.unit_price),
        gross: Number(line.gross),
        discount: Number(line.discount ?? 0),
        net: Number(line.net),
        vat: line.vat === null || line.vat === undefined ? null : Number(line.vat),
      }))
    : [];
  const groups = Array.isArray(raw.groups)
    ? (raw.groups as Record<string, unknown>[]).map((group) => ({
        sellerId: String(group.seller_id ?? ""),
        warehouseId: String(group.warehouse_id ?? ""),
        shippingRuleId: group.shipping_rule_id === null || group.shipping_rule_id === undefined ? null : String(group.shipping_rule_id),
        deliveryMethod: String(group.delivery_method ?? ""),
        shipping: Number(group.shipping),
        shippingVat: Number(group.shipping_vat ?? 0),
        merchandiseNet: Number(group.merchandise_net),
      }))
    : [];
  return {
    ok: true,
    data: {
      isEstimate: true,
      reason: raw.reason === "destination_required" ? "destination_required" : null,
      orderId: String(raw.order_id ?? orderId),
      currency: "USD",
      lines,
      groups,
      merchandiseGross: Number(raw.merchandise_gross ?? 0),
      discountTotal: Number(raw.discount_total ?? 0),
      merchandiseNet: Number(raw.merchandise_net ?? 0),
      shippingTotal: raw.shipping_total === null || raw.shipping_total === undefined ? null : Number(raw.shipping_total),
      vatTotal: raw.vat_total === null || raw.vat_total === undefined ? null : Number(raw.vat_total),
      buyerTotal: raw.buyer_total === null || raw.buyer_total === undefined ? null : Number(raw.buyer_total),
    },
  };
}
