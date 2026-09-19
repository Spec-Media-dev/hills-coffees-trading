import { mapSystemError, requireSuperAdmin, saved, validationFailure, type SystemWriteOutcome } from "@/lib/admin/system-errors";
import { ShippingRuleFieldsInput, ShippingRuleUpdateInput, TaxRuleFieldsInput, TaxRuleUpdateInput, type TaxableBase } from "@/lib/admin/system-validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 010 RUN F — T028 tax-rule and shipping-rule configuration over the EXISTING `tax_rules` and
 * `shipping_rules` tables (RLS `tax_admin` / `shipping_admin`: `is_super_admin()` USING + WITH CHECK).
 *
 * FUTURE SNAPSHOTS ONLY — `checkout_order` reads the in-force tax rule (`is_active`, country, latest
 * `effective_from`) at checkout time and writes `order_financials.tax_rule_id` /
 * `tax_percentage_snapshot` / `vat_amount`; nothing here reads or writes `order_financials`, and no
 * path recalculates an existing order. A rule change is felt by the NEXT checkout only.
 *
 * SHIPPING RULES — HONEST STATEMENT: no database function and no application path consumes
 * `shipping_rules` today (`checkout_order` takes shipping from `order_shipments.shipping_fee`;
 * verified across every applied migration and `lib/`, 2026-09-17). Rows are stored for the seam
 * Feature 007/009 may adopt; the UI says so — nothing pretends a fee is applied.
 *
 * ATTRIBUTION — every create / edit / deactivation is recorded by the database in `audit_logs` (actor =
 * `auth.uid()`; DB-OPEN-21 resolved by migration `20260920120000_feature_010_db_open_21_config_attribution.sql`); `updated_at` is DB-owned.
 * NO HARD DELETE — no `.delete()`; retirement is `is_active = false` / `effective_until`.
 */

export type TaxRuleRow = { id: string; countryCode: string; taxName: string; ratePercentage: number; taxableBase: TaxableBase; isActive: boolean; effectiveFrom: string; effectiveUntil: string | null; createdBy: string | null };
export type ShippingRuleRow = { id: string; countryCode: string | null; deliveryMethod: string; flatFee: number; currency: string; isActive: boolean; effectiveFrom: string; effectiveUntil: string | null; createdBy: string | null };

const TAX_SELECT = "id, country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from, effective_until, created_by";
const SHIPPING_SELECT = "id, country_code, delivery_method, flat_fee, currency, is_active, effective_from, effective_until, created_by";

type TaxRaw = { id: string; country_code: string; tax_name: string; rate_percentage: number | string; taxable_base: TaxableBase; is_active: boolean; effective_from: string; effective_until: string | null; created_by: string | null };
type ShippingRaw = { id: string; country_code: string | null; delivery_method: string; flat_fee: number | string; currency: string; is_active: boolean; effective_from: string; effective_until: string | null; created_by: string | null };

const toTax = (r: TaxRaw): TaxRuleRow => ({ id: r.id, countryCode: r.country_code.trim(), taxName: r.tax_name, ratePercentage: Number(r.rate_percentage), taxableBase: r.taxable_base, isActive: r.is_active, effectiveFrom: r.effective_from, effectiveUntil: r.effective_until, createdBy: r.created_by });
const toShipping = (r: ShippingRaw): ShippingRuleRow => ({ id: r.id, countryCode: r.country_code?.trim() ?? null, deliveryMethod: r.delivery_method, flatFee: Number(r.flat_fee), currency: r.currency.trim(), isActive: r.is_active, effectiveFrom: r.effective_from, effectiveUntil: r.effective_until, createdBy: r.created_by });

export async function listTaxRules(): Promise<readonly TaxRuleRow[] | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tax_rules").select(TAX_SELECT).order("country_code").order("effective_from", { ascending: false }).limit(500);
  if (error) throw new Error("pricing_rules_read_failed");
  return ((data ?? []) as TaxRaw[]).map(toTax);
}

export async function getTaxRule(ruleId: string): Promise<TaxRuleRow | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok || !/^[0-9a-f-]{36}$/i.test(ruleId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tax_rules").select(TAX_SELECT).eq("id", ruleId).maybeSingle();
  if (error) throw new Error("pricing_rules_read_failed");
  return data ? toTax(data as TaxRaw) : null;
}

/** Which tax rule `checkout_order` would select for a country right now (same predicate and ordering as the function). */
export function resolveInForceTaxRule(rules: readonly TaxRuleRow[], countryCode: string, asOf: Date = new Date()): TaxRuleRow | null {
  const t = asOf.getTime();
  return rules.filter((r) => r.isActive && r.countryCode === countryCode.toUpperCase() && Date.parse(r.effectiveFrom) <= t && (r.effectiveUntil === null || Date.parse(r.effectiveUntil) > t)).sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0] ?? null;
}

export async function createTaxRule(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = TaxRuleFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_rules")
    .insert({ country_code: parsed.data.countryCode, tax_name: parsed.data.taxName, rate_percentage: parsed.data.ratePercentage, taxable_base: parsed.data.taxableBase, is_active: parsed.data.isActive, effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil, created_by: authority.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.id);
}

export async function updateTaxRule(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = TaxRuleUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_rules")
    .update({ country_code: parsed.data.countryCode, tax_name: parsed.data.taxName, rate_percentage: parsed.data.ratePercentage, taxable_base: parsed.data.taxableBase, is_active: parsed.data.isActive, effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil })
    .eq("id", parsed.data.ruleId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  return saved(data.id);
}

export async function listShippingRules(): Promise<readonly ShippingRuleRow[] | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipping_rules").select(SHIPPING_SELECT).order("delivery_method").order("effective_from", { ascending: false }).limit(500);
  if (error) throw new Error("pricing_rules_read_failed");
  return ((data ?? []) as ShippingRaw[]).map(toShipping);
}

export async function getShippingRule(ruleId: string): Promise<ShippingRuleRow | null> {
  const authority = await requireSuperAdmin();
  if (!authority.ok || !/^[0-9a-f-]{36}$/i.test(ruleId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("shipping_rules").select(SHIPPING_SELECT).eq("id", ruleId).maybeSingle();
  if (error) throw new Error("pricing_rules_read_failed");
  return data ? toShipping(data as ShippingRaw) : null;
}

/** True by construction until a consumer exists — the UI states the seam is not yet applied anywhere. */
export const SHIPPING_RULES_CONSUMED_BY_CHECKOUT = false as const;

export async function createShippingRule(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = ShippingRuleFieldsInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_rules")
    .insert({ country_code: parsed.data.countryCode, delivery_method: parsed.data.deliveryMethod, flat_fee: parsed.data.flatFee, currency: parsed.data.currency, is_active: parsed.data.isActive, effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil, created_by: authority.userId })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, code: mapSystemError(error) };
  return saved(data.id);
}

export async function updateShippingRule(input: unknown): Promise<ActionFeedbackResult<SystemWriteOutcome>> {
  const parsed = ShippingRuleUpdateInput.safeParse(input);
  if (!parsed.success) return validationFailure(parsed.error);
  const authority = await requireSuperAdmin();
  if (!authority.ok) return { ok: false, code: authority.code };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipping_rules")
    .update({ country_code: parsed.data.countryCode, delivery_method: parsed.data.deliveryMethod, flat_fee: parsed.data.flatFee, currency: parsed.data.currency, is_active: parsed.data.isActive, effective_from: parsed.data.effectiveFrom, effective_until: parsed.data.effectiveUntil })
    .eq("id", parsed.data.ruleId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, code: mapSystemError(error) };
  if (!data) return { ok: false, code: ACTION_FEEDBACK.SYSTEM_NOT_FOUND };
  return saved(data.id);
}
