"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import type { ConfirmedReservation, ReservationResult } from "@/lib/commerce/reservation";
import {
  preparePaymentProofUpload,
  finalizePaymentProof,
  type PrepareUploadResult,
} from "@/lib/commerce/payment-proof";
import type { FinalizeProofResult } from "@/lib/commerce/types";

/**
 * Feature 013/015 confirmReservation action: Deprecated under Feature 015 cutover per Final Owner Authority.
 * Returns deprecation error immediately at the Server Action boundary without
 * executing legacy DAL or database RPCs.
 */
export async function confirmReservation(
  _previous: ReservationResult<ConfirmedReservation> | undefined,
  _formData: FormData
): Promise<ReservationResult<ConfirmedReservation>> {
  void _previous;
  void _formData;
  return { ok: false, code: "endpoint_deprecated_use_checkout_v1" };
}

const PrepareProofInput = z.object({
  orderId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  displayFilename: z.string().max(255).optional(),
});

/**
 * Feature 015 T040 — Prepares single-use upload intent for payment proof.
 */
export async function preparePaymentProofAction(
  _previous: PrepareUploadResult | undefined,
  formData: FormData
): Promise<PrepareUploadResult> {
  const identity = await getRequestIdentity();
  if (
    identity.kind !== "authenticated" ||
    !identity.isAuthorizedMember ||
    identity.requiresMfaStepUp ||
    !identity.organization?.canBuy
  ) {
    return { ok: false, code: "buyer_not_authorized" };
  }

  const rawOrderId = formData.get("orderId");
  const rawRequestId = formData.get("requestId");
  const rawFilename = formData.get("displayFilename");

  const input = PrepareProofInput.safeParse({
    orderId: rawOrderId,
    requestId: rawRequestId || undefined,
    displayFilename: rawFilename || undefined,
  });

  if (!input.success) {
    return { ok: false, code: "validation_error" };
  }

  const stableRequestId = input.data.requestId ?? crypto.randomUUID();
  return await preparePaymentProofUpload(
    input.data.orderId,
    stableRequestId,
    input.data.displayFilename
  );
}

const FinalizeProofInput = z.object({
  orderId: z.string().uuid(),
  uploadIntentId: z.string().uuid(),
  requestId: z.string().uuid(),
  customerClaimedAmount: z.coerce.number().positive().optional().nullable(),
  customerTransferDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  customerBankReference: z.string().trim().min(1).max(80).optional().nullable(),
  customerReferenceText: z.string().trim().max(500).optional().nullable(),
});

/**
 * Feature 015 T042 — Finalizes payment proof, revalidates on committed success.
 */
export async function finalizePaymentProofAction(
  _previous: FinalizeProofResult | undefined,
  formData: FormData
): Promise<FinalizeProofResult> {
  const identity = await getRequestIdentity();
  if (
    identity.kind !== "authenticated" ||
    !identity.isAuthorizedMember ||
    identity.requiresMfaStepUp ||
    !identity.organization?.canBuy
  ) {
    return { ok: false, code: "buyer_not_authorized" };
  }

  const input = FinalizeProofInput.safeParse({
    orderId: formData.get("orderId"),
    uploadIntentId: formData.get("uploadIntentId"),
    requestId: formData.get("requestId"),
    customerClaimedAmount: formData.get("customerClaimedAmount") || undefined,
    customerTransferDate: formData.get("customerTransferDate") || undefined,
    customerBankReference: formData.get("customerBankReference") || undefined,
    customerReferenceText: formData.get("customerReferenceText") || undefined,
  });

  if (!input.success) {
    return { ok: false, code: "validation_error" };
  }

  const result = await finalizePaymentProof(input.data);

  if (result.ok) {
    revalidatePath(`/dashboard/orders/${input.data.orderId}/proforma`, "page");
    revalidatePath(`/dashboard/orders/${input.data.orderId}`, "page");
  }

  return result;
}
