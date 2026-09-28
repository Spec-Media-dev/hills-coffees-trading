import { createClient } from "@/lib/supabase/server";

import { mapCommerceError } from "./errors";
import type { QuoteResult } from "./quote";

/**
 * Feature 013 T085 — `issueProforma` is the SINGLE caller of `issue_proforma` in the whole app. It
 * takes only the already-selected order and destination; the amount, tax, shipping, commission and
 * bank snapshot are all computed and frozen server-side (FIN-001) — this file passes no price.
 */
export async function issueProforma(orderId: string, destinationId: string, requestId: string): Promise<QuoteResult<{ orderId: string; proformaId: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_proforma", {
    p_order_id: orderId,
    p_destination_id: destinationId,
    p_promo_code: null,
    p_request_id: requestId,
  });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  if (!data || typeof data !== "object") return { ok: false, code: "commerce_error" };
  const raw = data as Record<string, unknown>;
  if (typeof raw.order_id !== "string" || typeof raw.proforma_id !== "string") return { ok: false, code: "commerce_error" };
  return { ok: true, data: { orderId: raw.order_id, proformaId: raw.proforma_id } };
}
