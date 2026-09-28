import { createClient } from "@/lib/supabase/server";

import { mapCommerceError, type CommerceErrorCode } from "./errors";

/**
 * Feature 013 T098 (owner scope reduction, 2026-09-28: reservation only — `cancelOrder` is not
 * implemented here because `cancel_order` is not authored in the reduced M4c scope; the 20-minute
 * expiry already releases every un-actioned reservation).
 */
export type ReservationResult<T = undefined> = { ok: true; data: T } | { ok: false; code: CommerceErrorCode | "commerce_error" };

export type ConfirmedReservation = { orderId: string; reservationId: string; expiresAt: string; buyerTotal: number | null };

/** The single caller of `confirm_proforma`. */
export async function confirmProforma(proformaId: string, requestId: string): Promise<ReservationResult<ConfirmedReservation>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_proforma", { p_proforma_id: proformaId, p_request_id: requestId });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  if (!data || typeof data !== "object") return { ok: false, code: "commerce_error" };
  const raw = data as Record<string, unknown>;
  if (typeof raw.order_id !== "string" || typeof raw.reservation_id !== "string" || typeof raw.expires_at !== "string") return { ok: false, code: "commerce_error" };
  return {
    ok: true,
    data: { orderId: raw.order_id, reservationId: raw.reservation_id, expiresAt: raw.expires_at, buyerTotal: raw.buyer_total === null || raw.buyer_total === undefined ? null : Number(raw.buyer_total) },
  };
}

/**
 * Lazy expiry-on-read (research.md R-9: "order reads and writes also run it lazily"). Safe to call on
 * every proforma-page view: `expire_reservation` itself is a no-op unless the reservation is genuinely
 * `ACTIVE ∧ expires_at <= clock_timestamp()`, so a fresh HOLD is untouched. The caller must be the
 * buyer's own org member or a platform admin (checked again, server-side, by the RPC itself).
 */
export async function ensureReservationFresh(orderId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("expire_reservation", { p_order_id: orderId });
}
