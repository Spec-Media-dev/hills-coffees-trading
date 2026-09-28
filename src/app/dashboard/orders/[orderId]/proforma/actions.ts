"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import { confirmProforma, type ConfirmedReservation, type ReservationResult } from "@/lib/commerce/reservation";

/**
 * Feature 013 T098 — the SINGLE caller of `confirm_proforma` in the whole app (owner scope reduction,
 * 2026-09-28: `cancelOrder` is not implemented — `cancel_order` is not authored in the reduced scope).
 */
const Input = z.object({ proformaId: z.string().uuid() });

export async function confirmReservation(_previous: ReservationResult<ConfirmedReservation> | undefined, formData: FormData): Promise<ReservationResult<ConfirmedReservation>> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.requiresMfaStepUp || !identity.organization?.canBuy) {
    return { ok: false, code: "buyer_not_authorized" };
  }
  const input = Input.safeParse({ proformaId: formData.get("proformaId") });
  if (!input.success) return { ok: false, code: "commerce_error" };

  const result = await confirmProforma(input.data.proformaId, crypto.randomUUID());
  if (result.ok) revalidatePath("/dashboard/orders/[orderId]/proforma", "page");
  return result;
}
