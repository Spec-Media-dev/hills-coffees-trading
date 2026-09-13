"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import { mapShipmentError } from "@/lib/orders/errors";
import { getOrderById, getOrderShipments } from "@/lib/orders/read";
import { createClient } from "@/lib/supabase/server";
import { AddShipmentItemInput, CreateShipmentInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T007) — the buyer-owned shipment-planning slice ONLY: `order_shipments` INSERT
 * as `DRAFT`, UPDATE to `REQUESTED`, and `shipment_items` while `DRAFT`. Everything beyond
 * `REQUESTED` belongs to Feature 009/the warehouse role — this file never sets, exposes, or even
 * names a later status as a selectable option anywhere in its own code or forms.
 *
 * SAME six-step contract and acting-organization discipline as `dashboard/orders/actions.ts`.
 */

/** Mirrors `dashboard/orders/actions.ts#requireBuyerCapableIdentity` exactly (file-local, same established precedent as `dashboard/listings/[offerId]/actions.ts`). */
async function requireBuyerCapableIdentity() {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null) return null;
  if (!identity.isAuthorizedMember) return null;
  if (!identity.organization.canBuy) return null;
  return identity;
}

const SHIPMENT_SELECT =
  "id, order_id, shipment_code, status, delivery_method, country_code, city, address_line, contact_name, contact_phone, shipping_fee, currency, ready_at, delivered_at, created_by, created_at, updated_at";

/**
 * T007 — creates a `DRAFT` shipment plan on the caller's own order. `order_id`/`created_by` are
 * server-derived; `status`/`shipment_code`/`shipping_fee`/`currency` all rely on their own column
 * defaults (`DRAFT`, a generated code, `0`, `USD`) — none is a client-selectable field in
 * `CreateShipmentInput`.
 */
export async function createShipment(_prevState: ActionFeedbackResult<{ id: string }> | undefined, formData: FormData): Promise<ActionFeedbackResult<{ id: string }>> {
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || orderId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const parsed = CreateShipmentInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  // Re-read the parent order under the caller's OWN organization id — a cross-org/nonexistent
  // order id refuses identically, before any shipment write is attempted (no existence leak).
  const order = await getOrderById({ organizationId: identity.organization!.organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("order_shipments")
    .insert({
      order_id: orderId,
      created_by: identity.userId,
      delivery_method: parsed.data.deliveryMethod,
      country_code: parsed.data.countryCode,
      city: parsed.data.city ?? null,
      address_line: parsed.data.addressLine,
      contact_name: parsed.data.contactName,
      contact_phone: parsed.data.contactPhone,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, code: mapShipmentError(error) };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: { id: inserted.id } };
}

/**
 * T007 — plans a quantity of one existing order item onto a DRAFT shipment. Re-verifies, server-
 * side, that the target shipment (a) belongs to the caller's own order and (b) is genuinely `DRAFT`
 * before attempting the write — `validate_shipment_item`'s trigger (`shipment_plan_is_closed`) and
 * the `shipment_items_buyer_insert` RLS policy (`s.status = 'DRAFT'`) both refuse regardless, this
 * is defense in depth only.
 */
export async function addShipmentItem(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  const shipmentId = formData.get("shipmentId");
  if (typeof orderId !== "string" || orderId.length === 0 || typeof shipmentId !== "string" || shipmentId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const parsed = AddShipmentItemInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const order = await getOrderById({ organizationId: identity.organization!.organizationId, orderId });
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
    .insert({ shipment_id: shipmentId, order_item_id: parsed.data.orderItemId, planned_quantity_kg: parsed.data.plannedQuantityKg })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, code: mapShipmentError(error) };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}

/**
 * T007 — the ONLY status transition this file (or any buyer-facing surface) ever attempts:
 * `DRAFT -> REQUESTED`. `validate_shipment_transition`'s trigger and the `shipments_buyer_draft_
 * update` RLS policy (`with_check`: `status IN ('DRAFT','REQUESTED')`) both independently refuse
 * anything else; this action offers no status selector at all — the target value is a literal.
 */
export async function requestShipment(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  const shipmentId = formData.get("shipmentId");
  if (typeof orderId !== "string" || orderId.length === 0 || typeof shipmentId !== "string" || shipmentId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const order = await getOrderById({ organizationId: identity.organization!.organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase.from("order_shipments").update({ status: "REQUESTED" }).eq("id", shipmentId).eq("order_id", orderId).eq("status", "DRAFT").select(SHIPMENT_SELECT).maybeSingle();

  if (error || !updated) {
    return { ok: false, code: mapShipmentError(error) };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}
