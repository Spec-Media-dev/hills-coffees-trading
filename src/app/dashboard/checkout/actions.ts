"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import { issueProforma } from "@/lib/commerce/proforma";
import type { CommerceErrorCode } from "@/lib/commerce/errors";

/**
 * Feature 013 T085 — the SINGLE caller of `issue_proforma`. Single-caller discipline: no other Server
 * Action or component in this app calls `issue_proforma` directly.
 */
const Input = z.object({ orderId: z.string().uuid(), destinationId: z.string().uuid() });

/** Success never resolves to a value here — it redirects to the proforma page instead. */
export type IssueProformaResult = { ok: false; code: CommerceErrorCode | "commerce_error" | "validation_error" };

export async function requestProforma(_previous: IssueProformaResult | undefined, formData: FormData): Promise<IssueProformaResult> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.requiresMfaStepUp || !identity.organization?.canBuy) {
    return { ok: false, code: "buyer_not_authorized" };
  }
  const input = Input.safeParse({ orderId: formData.get("orderId"), destinationId: formData.get("destinationId") });
  if (!input.success) return { ok: false, code: "validation_error" };

  const result = await issueProforma(input.data.orderId, input.data.destinationId, crypto.randomUUID());
  if (!result.ok) return result;
  redirect(`/dashboard/orders/${result.data.orderId}/proforma`);
}
