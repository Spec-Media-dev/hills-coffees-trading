import { createClient } from "@/lib/supabase/server";
import { mapCommerceError, type CommerceErrorCode } from "@/lib/commerce/errors";

/**
 * Feature 013 T101 — the single global `commerce_settings` row. RLS-scoped read
 * (`commerce_settings_staff_read`: `is_platform_admin() OR is_finance_operator()`). Owner scope
 * reduction, 2026-09-28: `proof_submission_enabled` is read (never hidden) but NOT exposed as an
 * editable control here — it governs the now-cancelled M5a proof workflow, so there is nothing in the
 * current product for a toggle to do; writes pass NULL so the RPC preserves its live value.
 */
export type CommerceSettings = {
  proformaValidityHours: number;
  bankTransferCheckoutEnabled: boolean;
  proofSubmissionEnabled: boolean;
  pilotOrganizationIds: readonly string[];
  updatedAt: string | null;
};

export async function getCommerceSettings(): Promise<CommerceSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("commerce_settings").select("proforma_validity_hours, bank_transfer_checkout_enabled, proof_submission_enabled, pilot_organization_ids, updated_at").eq("id", true).maybeSingle();
  if (!data) return null;
  return {
    proformaValidityHours: data.proforma_validity_hours,
    bankTransferCheckoutEnabled: data.bank_transfer_checkout_enabled,
    proofSubmissionEnabled: data.proof_submission_enabled,
    pilotOrganizationIds: data.pilot_organization_ids ?? [],
    updatedAt: data.updated_at,
  };
}

export type CommerceSettingsResult = { ok: true; data: CommerceSettings } | { ok: false; code: CommerceErrorCode | "commerce_error" };

/** The single caller of `update_commerce_settings`. Platform admin + MFA are re-checked by the RPC itself. */
export async function updateCommerceSettings(input: {
  validityHours: number;
  checkoutEnabled: boolean;
  pilotOrganizationIds: readonly string[];
  requestId: string;
}): Promise<CommerceSettingsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_commerce_settings", {
    p_validity_hours: input.validityHours,
    p_checkout_enabled: input.checkoutEnabled,
    p_proof_enabled: null,
    p_request_id: input.requestId,
    p_pilot_organization_ids: input.pilotOrganizationIds,
  });
  if (error) return { ok: false, code: mapCommerceError(error).code };
  const raw = data as Record<string, unknown> | null;
  if (!raw) return { ok: false, code: "commerce_error" };
  return {
    ok: true,
    data: {
      proformaValidityHours: Number(raw.proforma_validity_hours),
      bankTransferCheckoutEnabled: Boolean(raw.bank_transfer_checkout_enabled),
      proofSubmissionEnabled: Boolean(raw.proof_submission_enabled),
      pilotOrganizationIds: Array.isArray(raw.pilot_organization_ids) ? raw.pilot_organization_ids.map(String) : [],
      updatedAt: null,
    },
  };
}
