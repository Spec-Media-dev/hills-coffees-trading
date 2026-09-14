"use server";

import { revalidatePath } from "next/cache";

import { getRequestIdentity } from "@/lib/auth/dal";
import * as deliveryBuyer from "@/lib/delivery/buyer";
import { AddShipmentItemInput, CreateShipmentInput } from "@/lib/orders/validation";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN A (T007) / Feature 009 RUN B (T014) — the buyer-owned shipment-planning Server
 * Action surface: `order_shipments` INSERT as `DRAFT`, UPDATE to `REQUESTED` or `CANCELLED` (DRAFT
 * only), and `shipment_items` while `DRAFT`. Everything beyond `REQUESTED` belongs to the warehouse
 * role (`lib/delivery/warehouse.ts`) — this file never sets, exposes, or even names a later status as
 * a selectable option anywhere in its own code or forms.
 *
 * REUSE, NOT DUPLICATION: every actual write now lives in `lib/delivery/buyer.ts` (T014) — this file
 * is Zod validation + identity resolution + the thin Server Action contract only, mirroring
 * `dashboard/orders/actions.ts` -> `lib/orders/drafts.ts`'s own established split. `cancelShipment`
 * is the one NEW action (Phase 2's `shipments_buyer_draft_update` RLS widening, live since RUN A2).
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

  const result = await deliveryBuyer.createDraftShipment({
    organizationId: identity.organization!.organizationId,
    userId: identity.userId,
    orderId,
    input: parsed.data,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return result;
}

/**
 * T007 — plans a quantity of one existing order item onto a DRAFT shipment.
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

  const result = await deliveryBuyer.addShipmentItem({
    organizationId: identity.organization!.organizationId,
    orderId,
    shipmentId,
    input: parsed.data,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}

/**
 * T007 — the ONLY forward status transition this file ever attempts: `DRAFT -> REQUESTED`.
 * `validate_shipment_transition`'s trigger and the `shipments_buyer_draft_update` RLS policy both
 * independently refuse anything else; this action offers no status selector at all.
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

  const result = await deliveryBuyer.requestShipment({
    organizationId: identity.organization!.organizationId,
    orderId,
    shipmentId,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}

/**
 * Feature 009 RUN B (T014) — NEW: withdraws an unwanted `DRAFT` shipment plan before submission, via
 * Phase 2's now-live `shipments_buyer_draft_update` RLS widening (DB-OPEN-18). The ONLY other target
 * this action ever attempts beyond `REQUESTED` — `CANCELLED`, and only from `DRAFT`.
 */
export async function cancelShipment(_prevState: ActionFeedbackResult | undefined, formData: FormData): Promise<ActionFeedbackResult> {
  const orderId = formData.get("orderId");
  const shipmentId = formData.get("shipmentId");
  if (typeof orderId !== "string" || orderId.length === 0 || typeof shipmentId !== "string" || shipmentId.length === 0) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const identity = await requireBuyerCapableIdentity();
  if (!identity) {
    return { ok: false, code: ACTION_FEEDBACK.BUYER_NOT_CAPABLE };
  }

  const result = await deliveryBuyer.cancelDraftShipment({
    organizationId: identity.organization!.organizationId,
    orderId,
    shipmentId,
  });
  if (!result.ok) return result;

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { ok: true, data: undefined };
}
