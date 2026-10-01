import { createClient } from "@/lib/supabase/server";

import { mapCommerceError, type CommerceErrorCode } from "./errors";

export interface CheckoutResultData {
  orderId: string;
  orderCode: string;
  proformaId: string;
  proformaCode: string;
  paymentId: string;
  reservationId: string;
  expiresAt: string;
  buyerTotal: number;
  currency: string;
}

export type CheckoutResult =
  | { ok: true; data: CheckoutResultData }
  | { ok: false; code: CommerceErrorCode | "commerce_error" };

/**
 * Feature 015 T036 — DAL checkout caller with stable request-ID propagation.
 * Single entry point for invoking checkout_bank_transfer_v1.
 */
export async function checkoutBankTransferOrder(
  orderId: string,
  destinationId: string,
  requestId: string
): Promise<CheckoutResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("checkout_bank_transfer_v1", {
    p_order_id: orderId,
    p_destination_id: destinationId,
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, code: mapCommerceError(error).code };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "commerce_error" };
  }

  const raw = data as Record<string, unknown>;
  if (
    typeof raw.order_id !== "string" ||
    typeof raw.proforma_id !== "string" ||
    typeof raw.reservation_id !== "string" ||
    typeof raw.expires_at !== "string"
  ) {
    return { ok: false, code: "commerce_error" };
  }

  return {
    ok: true,
    data: {
      orderId: raw.order_id,
      orderCode: String(raw.order_code ?? ""),
      proformaId: raw.proforma_id,
      proformaCode: String(raw.proforma_code ?? ""),
      paymentId: String(raw.payment_id ?? ""),
      reservationId: raw.reservation_id,
      expiresAt: raw.expires_at,
      buyerTotal: Number(raw.buyer_total ?? 0),
      currency: String(raw.currency ?? "USD"),
    },
  };
}
