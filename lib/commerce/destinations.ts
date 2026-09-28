import { createClient } from "@/lib/supabase/server";
import { mapCommerceError } from "./errors";
import type { CartResult } from "./cart";
import type { Destination, DestinationInput } from "./destination-validation";

/** Member-RLS read, always narrowed to the fresh acting organization. */
export async function readDestinations(organizationId: string): Promise<Destination[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("delivery_destinations")
    .select("id, label, country_code, city, address_line_1, address_line_2, contact_name, contact_phone, delivery_method, is_default")
    .eq("organization_id", organizationId)
    .is("retired_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error("destinations_read_failed");
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    countryCode: row.country_code.trim(),
    city: row.city,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2 ?? "",
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    deliveryMethod: row.delivery_method as "Courier",
    isDefault: row.is_default,
  }));
}

/** One M4a RPC owns all destination writes, including default uniqueness and audit. */
export async function saveDestination(organizationId: string, input: DestinationInput, requestId: string): Promise<CartResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("upsert_delivery_destination", {
    p_id: input.id ?? null,
    p_org_id: organizationId,
    p_fields: {
      label: input.label,
      country_code: input.countryCode,
      city: input.city,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? "",
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
      delivery_method: input.deliveryMethod,
      is_default: input.isDefault,
    },
    p_request_id: requestId,
  });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  if (typeof data !== "string") return { ok: false, code: "commerce_error" };
  return { ok: true, data: { id: data } };
}

export async function retireDestination(destinationId: string, requestId: string): Promise<CartResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_delivery_destination", { p_id: destinationId, p_request_id: requestId });
  return error ? { ok: false, code: mapCommerceError(error).code } : { ok: true, data: undefined };
}
