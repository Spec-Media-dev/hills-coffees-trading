"use server";

import { revalidatePath } from "next/cache";

import { executeWarehouseOperation, recordWarehouseDelivery, type WarehouseDeliveryOutcome, type WarehouseOperationOutcome } from "@/lib/admin/warehouse";
import type { ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN D (T017/T018) — thin Server Actions over `lib/admin/warehouse.ts`, which itself
 * only delegates to Feature 009's named warehouse operations. These actions parse FormData and
 * revalidate; they perform no authorization of their own beyond what the orchestration layer and
 * the database enforce (the layer's own live guard runs on every call — a direct invocation with the
 * wrong role is refused there, never merely hidden in the UI).
 */

function revalidateShipment(shipmentId: unknown) {
  revalidatePath("/dashboard-admin/shipments");
  if (typeof shipmentId === "string") revalidatePath(`/dashboard-admin/shipments/${shipmentId}`);
  revalidatePath("/dashboard-admin");
  revalidatePath("/dashboard-admin/inventory");
  // The buyer's own tracking pages reflect the new status/quantities on their next request.
  revalidatePath("/dashboard/deliveries");
  if (typeof shipmentId === "string") revalidatePath(`/dashboard/deliveries/${shipmentId}`);
}

export async function runWarehouseOperation(_prev: ActionFeedbackResult<WarehouseOperationOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<WarehouseOperationOutcome>> {
  const shipmentId = formData.get("shipmentId");
  const operation = formData.get("operation");
  const reason = formData.get("reason");
  const result = await executeWarehouseOperation({
    shipmentId: typeof shipmentId === "string" ? shipmentId : undefined,
    operation: typeof operation === "string" ? operation : undefined,
    reason: typeof reason === "string" ? reason : undefined,
  });
  if (result.ok) revalidateShipment(shipmentId);
  return result;
}

/**
 * Item rows arrive as `items[<shipmentItemId>]=<deliveredQuantityKg>` (the NEW absolute total per
 * item); only the rows the operator actually filled in are sent, so an untouched item is never
 * re-written with a guessed value.
 */
export async function recordShipmentDelivery(_prev: ActionFeedbackResult<WarehouseDeliveryOutcome> | undefined, formData: FormData): Promise<ActionFeedbackResult<WarehouseDeliveryOutcome>> {
  const shipmentId = formData.get("shipmentId");
  const items: { shipmentItemId: string; deliveredQuantityKg: string }[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^items\[([^\]]+)\]$/.exec(key);
    if (match && typeof value === "string" && value.trim().length > 0) {
      items.push({ shipmentItemId: match[1]!, deliveredQuantityKg: value.trim() });
    }
  }
  const result = await recordWarehouseDelivery({ shipmentId: typeof shipmentId === "string" ? shipmentId : undefined, items });
  if (result.ok) revalidateShipment(shipmentId);
  return result;
}
