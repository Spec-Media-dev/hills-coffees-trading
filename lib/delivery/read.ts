import { createClient } from "@/lib/supabase/server";
import { getOrderShipments, getShipmentItems } from "@/lib/orders/read";
import type { OrderShipmentDTO, OrderShipmentStatus, ShipmentItemDTO, ShipmentWithOrderContextDTO } from "@/lib/delivery/types";

/**
 * Feature 009 RUN A1 (T003) — SERVER-ONLY delivery-domain reads (imports `lib/supabase/server`,
 * which pulls in `next/headers` — never import from a Client Component). Every read runs under the
 * caller's own request-scoped, RLS-respecting client — never the service-role key. No
 * `unstable_cache`/`"use cache"`/`cacheTag`/`cacheLife`/`updateTag` anywhere in this file — shipment/
 * delivery data is transactional/operational truth, re-read fresh on every call.
 *
 * REUSE, NOT DUPLICATION: `getOrderShipments`/`getShipmentItems` (buyer/`can_view_order`-scoped,
 * already RLS-compatible with warehouse callers too — see below) are re-exported directly from
 * `lib/orders/read.ts`, built and live-verified by Feature 007 RUN A. This file adds ONLY the
 * genuinely new warehouse-facing capability Feature 007 never needed: a shipment lookup/listing that
 * does not start from an already-known `orderId`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE LIVE RLS BOUNDARY THIS FILE MUST NEVER WEAKEN (read directly from
 * `docs/database/database-schema-report.json`'s `rls_policies`, confirmed during Feature 009 RUN 0
 * and re-confirmed here — never assumed)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `order_shipments` — `shipments_view`: `can_view_order(order_id) OR is_warehouse_operator()`. This
 * means `getOrderShipments` (imported above) is ALREADY warehouse-compatible for any orderId a
 * warehouse operator already has — no separate "warehouse" variant of that function is needed.
 * `shipment_items` — `shipment_items_view`: `is_warehouse_operator() OR EXISTS(... can_view_order
 * ...)`. Same conclusion: `getShipmentItems` (imported above) already works for warehouse callers.
 * `orders` — `orders_view`: `can_view_order(id)`, and `can_view_order()` grants the buyer AND every
 * seller-of-record — NOT a general warehouse-operator branch. A warehouse operator therefore cannot
 * read `orders` directly for an order it is not itself a party to; `mapOrderContext` below degrades
 * to `null` order-context fields rather than fabricating them when the second query returns nothing,
 * exactly the same "safe degradation, never a guessed value" precedent DB-OPEN-12's own resolution
 * already established for `lib/inventory/availability.ts`.
 *
 * The genuine gap this file closes: a warehouse operator managing a QUEUE (e.g. "every REQUESTED
 * shipment awaiting capacity confirmation") has no `orderId` to start from at all —
 * `getShipmentsForWarehouseQueue` below is scoped by `is_warehouse_operator()` alone (RLS's own
 * second branch on `order_shipments`), with an explicit application-level status filter (never a
 * substitute for RLS, purely a query-shape convenience). `getShipmentById` resolves one shipment by
 * id alone (a queue-row click, or a buyer's own tracking-detail page) the same way.
 */
export { getOrderShipments, getShipmentItems };
export type { OrderShipmentDTO, ShipmentItemDTO };

const SHIPMENT_SELECT =
  "id, order_id, shipment_code, status, delivery_method, country_code, city, address_line, contact_name, contact_phone, shipping_fee, currency, ready_at, delivered_at, created_by, created_at, updated_at";

type ShipmentRow = {
  id: string;
  order_id: string;
  shipment_code: string;
  status: string;
  delivery_method: string;
  country_code: string;
  city: string | null;
  address_line: string;
  contact_name: string;
  contact_phone: string;
  shipping_fee: number;
  currency: string;
  ready_at: string | null;
  delivered_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function mapShipmentRow(row: ShipmentRow): OrderShipmentDTO {
  return {
    id: row.id,
    orderId: row.order_id,
    shipmentCode: row.shipment_code,
    status: row.status as OrderShipmentStatus,
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
  };
}

/**
 * A warehouse operator's queue view — shipments in any of the given operational statuses, across
 * every organization's orders. Relies on `shipments_view`'s `is_warehouse_operator()` branch as the
 * REAL boundary; the `.in("status", statuses)` filter is a query-shape convenience only, never
 * authorization. A non-warehouse caller gets an empty result (RLS), not an error, matching the
 * project's established non-enumerating convention. Order context (`orderCode`/`buyerOrganizationId`)
 * is attached from a second, separately-authorized `orders` read — see this file's own header for why
 * a single embedded join is not used, and why a warehouse operator without independent `orders`
 * visibility degrades to `null` context rather than a fabricated value.
 */
export async function getShipmentsForWarehouseQueue({ statuses }: { statuses: readonly OrderShipmentStatus[] }): Promise<readonly ShipmentWithOrderContextDTO[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("order_shipments").select(SHIPMENT_SELECT).in("status", statuses).order("created_at", { ascending: true });

  const shipments = (rows as ShipmentRow[] | null) ?? [];
  if (shipments.length === 0) return [];

  const orderIds = [...new Set(shipments.map((row) => row.order_id))];
  const { data: orderRows } = await supabase.from("orders").select("id, order_code, buyer_organization_id").in("id", orderIds);
  const orderContextById = new Map((orderRows ?? []).map((row) => [row.id as string, { orderCode: row.order_code as string, buyerOrganizationId: row.buyer_organization_id as string }]));

  return shipments.map((row) => {
    const context = orderContextById.get(row.order_id);
    return {
      ...mapShipmentRow(row),
      orderCode: context?.orderCode ?? "",
      buyerOrganizationId: context?.buyerOrganizationId ?? "",
    };
  });
}

/**
 * Resolves one shipment by id alone (a warehouse operator's queue-row click, or a buyer's own
 * tracking-detail page) — RLS (`shipments_view`) decides visibility; `null` if the shipment does not
 * exist or the caller may not see it, never a distinguishable error either way.
 */
export async function getShipmentById({ shipmentId }: { shipmentId: string }): Promise<ShipmentWithOrderContextDTO | null> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("order_shipments").select(SHIPMENT_SELECT).eq("id", shipmentId).maybeSingle();
  if (!row) return null;

  const { data: orderRow } = await supabase.from("orders").select("order_code, buyer_organization_id").eq("id", row.order_id).maybeSingle();

  return {
    ...mapShipmentRow(row as ShipmentRow),
    orderCode: orderRow?.order_code ?? "",
    buyerOrganizationId: orderRow?.buyer_organization_id ?? "",
  };
}
