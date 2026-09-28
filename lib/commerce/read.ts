import { createClient } from "@/lib/supabase/server";

/**
 * Feature 013 T086 — buyer-facing proforma detail read (`BANK_TRANSFER_V1` proformas only; the
 * legacy placeholder proforma stays on `lib/orders/read.ts#getProforma`). RLS-scoped
 * (`proforma_invoices_read`/`proforma_items_read`/`proforma_fulfillment_groups_read`: buyer member,
 * finance, or platform admin) — never the service-role key.
 *
 * H2 (buyer financial privacy): this file selects ONLY `proforma_invoices`, `proforma_invoice_items`
 * and `proforma_fulfillment_groups` — never `proforma_line_economics` or `proforma_seller_settlements`,
 * which hold commission/seller-net/Hills-share and are finance/admin/seller-own only. A future
 * maintainer must not add those tables here; `tests/commerce/proforma-page.test.ts` pins this file's
 * source text to prove it.
 */
export type ProformaLineDTO = {
  id: string;
  productName: string;
  originName: string | null;
  lotCode: string | null;
  quantityKg: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  vatAmount: number;
  lineTotal: number;
  /** "HILLS" | "MEMBER_SELLER" — the buyer-facing offer-origin label; never the seller's identity or economics. */
  sellerType: string;
  fulfillmentGroupId: string | null;
};

export type ProformaGroupDTO = {
  id: string;
  deliveryMethod: string;
  shippingAmount: number;
  shippingVatAmount: number;
  merchandiseNetAmount: number;
};

export type ProformaDestinationSnapshot = {
  label: string;
  countryCode: string;
  city: string;
  addressLines: readonly string[];
  contactName: string;
  contactPhone: string;
  deliveryMethod: string;
};

export type ProformaDetailDTO = {
  id: string;
  orderId: string;
  proformaCode: string;
  version: number;
  status: "ISSUED" | "CONFIRMED" | "PAID" | "EXPIRED" | "SUPERSEDED" | "CANCELLED" | "VOID";
  issuedAt: string;
  validUntil: string;
  currency: "USD";
  merchandiseGross: number;
  discountTotal: number;
  merchandiseNet: number;
  shippingTotal: number;
  vatTotal: number;
  buyerTotal: number;
  destination: ProformaDestinationSnapshot | null;
  lines: readonly ProformaLineDTO[];
  groups: readonly ProformaGroupDTO[];
};

const PROFORMA_SELECT =
  "id, order_id, proforma_code, version, status, issued_at, valid_until, currency, merchandise_gross, discount_total, merchandise_net, shipping_total, vat_total, buyer_total, destination_snapshot";
const ITEM_SELECT = "id, product_name_snapshot, origin_name_snapshot, lot_code_snapshot, quantity_kg, unit_price, gross_amount, discount_amount, net_amount, vat_amount, line_total, seller_type_snapshot, fulfillment_group_id";
const GROUP_SELECT = "id, delivery_method, shipping_amount, shipping_vat_amount, merchandise_net_amount";

/** The order's CURRENT `BANK_TRANSFER_V1` proforma (by version), or null if none was ever issued. */
export async function getProformaDetail({ orderId }: { orderId: string }): Promise<ProformaDetailDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("proforma_invoices")
    .select(PROFORMA_SELECT)
    .eq("order_id", orderId)
    .not("validity_hours_snapshot", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  const [{ data: itemRows }, { data: groupRows }] = await Promise.all([
    supabase.from("proforma_invoice_items").select(ITEM_SELECT).eq("proforma_id", row.id).order("id", { ascending: true }),
    supabase.from("proforma_fulfillment_groups").select(GROUP_SELECT).eq("proforma_id", row.id).order("id", { ascending: true }),
  ]);

  const destination = row.destination_snapshot as Record<string, unknown> | null;

  return {
    id: row.id,
    orderId: row.order_id,
    proformaCode: row.proforma_code,
    version: row.version,
    status: row.status as ProformaDetailDTO["status"],
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    currency: "USD",
    merchandiseGross: Number(row.merchandise_gross),
    discountTotal: Number(row.discount_total),
    merchandiseNet: Number(row.merchandise_net),
    shippingTotal: Number(row.shipping_total),
    vatTotal: Number(row.vat_total),
    buyerTotal: Number(row.buyer_total),
    destination: destination
      ? {
          label: String(destination.label ?? ""),
          countryCode: String(destination.country_code ?? ""),
          city: String(destination.city ?? ""),
          addressLines: Array.isArray(destination.address_lines) ? destination.address_lines.map(String) : [],
          contactName: String(destination.contact_name ?? ""),
          contactPhone: String(destination.contact_phone ?? ""),
          deliveryMethod: String(destination.delivery_method ?? ""),
        }
      : null,
    lines: (itemRows ?? []).map((item) => ({
      id: item.id,
      productName: item.product_name_snapshot,
      originName: item.origin_name_snapshot,
      lotCode: item.lot_code_snapshot,
      quantityKg: Number(item.quantity_kg),
      unitPrice: Number(item.unit_price),
      grossAmount: Number(item.gross_amount),
      discountAmount: Number(item.discount_amount),
      netAmount: Number(item.net_amount),
      vatAmount: Number(item.vat_amount),
      lineTotal: Number(item.line_total),
      sellerType: item.seller_type_snapshot,
      fulfillmentGroupId: item.fulfillment_group_id,
    })),
    groups: (groupRows ?? []).map((group) => ({
      id: group.id,
      deliveryMethod: group.delivery_method,
      shippingAmount: Number(group.shipping_amount),
      shippingVatAmount: Number(group.shipping_vat_amount),
      merchandiseNetAmount: Number(group.merchandise_net_amount),
    })),
  };
}
