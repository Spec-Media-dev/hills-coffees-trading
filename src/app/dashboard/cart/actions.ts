"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestIdentity } from "@/lib/auth/dal";
import { addCartLine, removeCartLine as removeLine, updateCartLine as updateLine, type CartResult } from "@/lib/commerce/cart";

const uuid = z.string().uuid();
const quantity = z.coerce.number().finite().positive();
const AddInput = z.object({ offerId: uuid, quantityKg: quantity });
const EditInput = z.object({ orderId: uuid, lineId: uuid, quantityKg: quantity });
const RemoveInput = z.object({ orderId: uuid, lineId: uuid });

async function buyerOrganizationId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.requiresMfaStepUp || !identity.organization?.canBuy) return null;
  return identity.organization.organizationId;
}

export async function addToCart(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = AddInput.safeParse({ offerId: formData.get("offerId"), quantityKg: formData.get("quantityKg") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await addCartLine(organizationId, input.data.offerId, input.data.quantityKg, crypto.randomUUID());
  if (!result.ok) return result;
  revalidatePath("/dashboard/cart");
  return { ok: true, data: undefined };
}

export async function updateCartLine(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = EditInput.safeParse({ orderId: formData.get("orderId"), lineId: formData.get("lineId"), quantityKg: formData.get("quantityKg") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await updateLine(organizationId, input.data.orderId, input.data.lineId, input.data.quantityKg);
  if (result.ok) revalidatePath("/dashboard/cart");
  return result;
}

export async function removeCartLine(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = RemoveInput.safeParse({ orderId: formData.get("orderId"), lineId: formData.get("lineId") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await removeLine(organizationId, input.data.orderId, input.data.lineId);
  if (result.ok) revalidatePath("/dashboard/cart");
  return result;
}
