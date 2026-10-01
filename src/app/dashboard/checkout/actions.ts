"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import { checkoutBankTransferOrder } from "@/lib/commerce/checkout";
import type { CommerceErrorCode } from "@/lib/commerce/errors";

const CompleteCheckoutInput = z.object({
  orderId: z.string().uuid(),
  destinationId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
});

export type CompleteCheckoutResult =
  | { ok: false; code: CommerceErrorCode | "commerce_error" | "validation_error" };

/**
 * Feature 015 T037 — Authoritative atomic checkout Server Action.
 * Invokes checkout_bank_transfer_v1 and redirects to the proforma view on success.
 */
export async function completeCheckoutOrder(
  _previous: CompleteCheckoutResult | undefined,
  formData: FormData
): Promise<CompleteCheckoutResult> {
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
  const rawDestId = formData.get("destinationId");
  const rawReqId = formData.get("requestId");

  const input = CompleteCheckoutInput.safeParse({
    orderId: rawOrderId,
    destinationId: rawDestId,
    requestId: rawReqId || undefined,
  });

  if (!input.success) {
    return { ok: false, code: "validation_error" };
  }

  const stableRequestId = input.data.requestId ?? crypto.randomUUID();
  const result = await checkoutBankTransferOrder(
    input.data.orderId,
    input.data.destinationId,
    stableRequestId
  );

  if (!result.ok) {
    return result;
  }

  redirect(`/dashboard/orders/${result.data.orderId}/proforma`);
}

/**
 * Legacy requestProforma: Deprecated under Feature 015 cutover per Final Owner Authority.
 * Returns deprecation error immediately at the Server Action boundary without
 * executing legacy DAL or database RPCs.
 */
export type IssueProformaResult = { ok: false; code: "endpoint_deprecated_use_checkout_v1" };

export async function requestProforma(
  _previous: IssueProformaResult | undefined,
  _formData: FormData
): Promise<IssueProformaResult> {
  void _previous;
  void _formData;
  return { ok: false, code: "endpoint_deprecated_use_checkout_v1" };
}
