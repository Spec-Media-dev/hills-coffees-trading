"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestIdentity } from "@/lib/auth/dal";
import type { CartResult } from "@/lib/commerce/cart";
import { readDestinations, retireDestination, saveDestination } from "@/lib/commerce/destinations";
import { DestinationInput } from "@/lib/commerce/destination-validation";

async function buyerOrganizationId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.requiresMfaStepUp || !identity.organization?.canBuy) return null;
  return identity.organization.organizationId;
}

export async function upsertDestination(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = DestinationInput.safeParse({
    id: formData.get("id") || undefined,
    label: formData.get("label"),
    countryCode: formData.get("countryCode"),
    city: formData.get("city"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || "",
    contactName: formData.get("contactName"),
    contactPhone: formData.get("contactPhone"),
    deliveryMethod: "Courier",
    isDefault: formData.get("isDefault") === "on",
  });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await saveDestination(organizationId, input.data, crypto.randomUUID());
  if (!result.ok) return result;
  revalidatePath("/dashboard/destinations");
  revalidatePath("/dashboard/checkout");
  return { ok: true, data: undefined };
}

export async function setDefaultDestination(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const destination = (await readDestinations(organizationId)).find((row) => row.id === id.data);
  if (!destination) return { ok: false, code: "destination_not_found" };
  const result = await saveDestination(organizationId, { ...destination, isDefault: true }, crypto.randomUUID());
  if (!result.ok) return result;
  revalidatePath("/dashboard/destinations");
  revalidatePath("/dashboard/checkout");
  return { ok: true, data: undefined };
}

export async function removeDestination(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  // Retire RPC derives ownership itself; this org-scoped precheck also refuses a forged foreign id without enumeration.
  if (!(await readDestinations(organizationId)).some((row) => row.id === id.data)) return { ok: false, code: "destination_not_found" };
  const result = await retireDestination(id.data, crypto.randomUUID());
  if (result.ok) {
    revalidatePath("/dashboard/destinations");
    revalidatePath("/dashboard/checkout");
  }
  return result;
}
