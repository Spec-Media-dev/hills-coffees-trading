import { createClient } from "@/lib/supabase/server";
import { getOrderById, getOrderShipments } from "@/lib/orders/read";
import { mapDeliveryError } from "@/lib/delivery/errors";
import type { CreateShipmentInput, AddShipmentItemInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 009 RUN B (T014) — the buyer's ENTIRE write surface into fulfilment: create a `DRAFT`
 * shipment, plan `shipment_items` while `DRAFT`, submit to `REQUESTED`, and cancel while `DRAFT`
 * (Phase 2's `shipments_buyer_draft_update` RLS widening, live since RUN A2). No other transition is
 * reachable from this module — mirrors `lib/orders/drafts.ts`'s own established domain-layer
 * convention exactly: every exported function assumes the caller (a Server Action) has already
 * validated input (Zod) and resolved a buy-capable acting identity; this file never calls
 * `getRequestIdentity()` itself.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * REUSE, NOT DUPLICATION: `createShipment`/`addShipmentItem`/`requestShipment`'s actual write shape
 * (insert allowlist, defense-in-depth pre-reads, error mapping) is carried over VERBATIM from Feature
 * 007 RUN A's own already-live-tested implementation, which lived directly inside
 * `src/app/dashboard/orders/[orderId]/shipment/actions.ts` as Server Action bodies. Feature 007 never
 * built a `lib/orders/shipments.ts`-shaped domain layer for this slice (unlike `drafts.ts` for
 * `orders`/`order_items`) — T014 closes that gap now, and `shipment/actions.ts` is refactored to
 * delegate here rather than keep a second, drifting copy of the same logic. `cancelDraftShipment` is
 * the ONE genuinely new capability (FR-001, DB-OPEN-18): Phase 2's migration widened
 * `shipments_buyer_draft_update`'s `WITH CHECK` to permit `CANCELLED` as a buyer-authorized DRAFT
 * target — live-proven in T013 scenario 1 (`cancelOk: true`).
 *
 * VALIDATION IS NOT AUTHORIZATION: every function below still lets `validate_shipment_transition`/
 * `validate_shipment_item` refuse the write regardless of what this file's own defense-in-depth
 * pre-reads found — those pre-reads exist only to avoid an existence-leaking or wasted round trip,
 * never as a substitute for the trigger.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

const SHIPMENT_SELECT =
  "id, order_id, shipment_code, status, delivery_method, country_code, city, address_line, contact_name, contact_phone, shipping_fee, currency, ready_at, delivered_at, created_by, created_at, updated_at";

/**
 * T014 — creates a `DRAFT` shipment plan on the caller's own order. `order_id`/`created_by` are
 * server-derived; `status`/`shipment_code`/`shipping_fee`/`currency` all rely on their own column
 * defaults — none is a client-selectable field in `CreateShipmentInput`.
 */
export async function createDraftShipment({
  organizationId,
  userId,
  orderId,
  input,
}: {
  organizationId: string;
  userId: string;
  orderId: string;
  input: CreateShipmentInput;
}): Promise<ActionFeedbackResult<{ id: string }>> {
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("order_shipments")
    .insert({
      order_id: orderId,
      created_by: userId,
      delivery_method: input.deliveryMethod,
      country_code: input.countryCode,
      city: input.city ?? null,
      address_line: input.addressLine,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, code: mapDeliveryError(error) };
  }

  return { ok: true, data: { id: inserted.id } };
}

/**
 * T014 — plans a quantity of one existing order item onto a DRAFT shipment. Re-verifies, server-side,
 * that the target shipment (a) belongs to the caller's own order and (b) is genuinely `DRAFT` before
 * attempting the write — `validate_shipment_item`'s trigger (`shipment_plan_is_closed`,
 * `shipment_order_item_mismatch`) and the `shipment_items_buyer_insert` RLS policy both independently
 * refuse regardless; this is defense in depth only, and it is what proves T014's own "a cross-order
 * item is refused" / "editing after REQUESTED is refused" verify criteria at the MODULE level.
 */
export async function addShipmentItem({
  organizationId,
  orderId,
  shipmentId,
  input,
}: {
  organizationId: string;
  orderId: string;
  shipmentId: string;
  input: AddShipmentItemInput;
}): Promise<ActionFeedbackResult<{ id: string }>> {
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const shipments = await getOrderShipments({ orderId });
  const shipment = shipments.find((row) => row.id === shipmentId);
  if (!shipment) {
    return { ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_FOUND };
  }
  if (shipment.status !== "DRAFT") {
    return { ok: false, code: ACTION_FEEDBACK.SHIPMENT_NOT_EDITABLE };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("shipment_items")
    .insert({ shipment_id: shipmentId, order_item_id: input.orderItemId, planned_quantity_kg: input.plannedQuantityKg })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, code: mapDeliveryError(error) };
  }

  return { ok: true, data: { id: inserted.id } };
}

/**
 * T014 — the ONLY forward status transition a buyer may ever attempt: `DRAFT -> REQUESTED`.
 * `validate_shipment_transition`'s trigger and the `shipments_buyer_draft_update` RLS policy's
 * `WITH CHECK` (`status IN ('DRAFT', 'REQUESTED', 'CANCELLED')`) both independently refuse anything
 * else; this function offers no status selector at all — the target value is a literal, never a
 * client-supplied field.
 */
export async function requestShipment({
  organizationId,
  orderId,
  shipmentId,
}: {
  organizationId: string;
  orderId: string;
  shipmentId: string;
}): Promise<ActionFeedbackResult<null>> {
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("order_shipments")
    .update({ status: "REQUESTED" })
    .eq("id", shipmentId)
    .eq("order_id", orderId)
    .eq("status", "DRAFT")
    .select(SHIPMENT_SELECT)
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: mapDeliveryError(error) };
  }

  return { ok: true, data: null };
}

/**
 * T014 — NEW (RUN B): withdraws an unwanted `DRAFT` plan before it is ever submitted. `DRAFT ->
 * CANCELLED` is the ONLY additional target this file ever attempts, and only from `DRAFT` — this is
 * the buyer's own narrow self-service withdrawal, distinct from `lib/delivery/warehouse.ts#cancel`
 * (warehouse-initiated, operates on submitted/in-progress shipments, carries an operational reason).
 * A `DRAFT` shipment was never submitted to warehouse, so there is nothing yet to explain — no reason
 * field exists on this path, matching the live `order_shipments` schema (no reason/cancellation-note
 * column exists at all — see `lib/delivery/warehouse.ts`'s own header for the same finding on the
 * operational side).
 */
export async function cancelDraftShipment({
  organizationId,
  orderId,
  shipmentId,
}: {
  organizationId: string;
  orderId: string;
  shipmentId: string;
}): Promise<ActionFeedbackResult<null>> {
  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("order_shipments")
    .update({ status: "CANCELLED" })
    .eq("id", shipmentId)
    .eq("order_id", orderId)
    .eq("status", "DRAFT")
    .select(SHIPMENT_SELECT)
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, code: mapDeliveryError(error) };
  }

  return { ok: true, data: null };
}
