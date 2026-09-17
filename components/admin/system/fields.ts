import type { RecordField } from "@/components/admin/catalogue/record-form";
import type { CommissionPolicyRow, CommissionTierRow } from "@/lib/admin/commission";
import type { PaymentAccountDetail } from "@/lib/admin/payment-accounts";
import type { ShippingRuleRow, TaxRuleRow } from "@/lib/admin/pricing-rules";
import { CONFIG_CURRENCY } from "@/lib/admin/system-validation";

/**
 * Feature 010 RUN F — server-side field declarations (data only) for the system-configuration forms.
 * Every option list is the database's own vocabulary; `status` is NEVER a form field (named
 * operations only); `created_by` / timestamps are never client-supplied.
 */

/** ISO instant → `datetime-local` value (minutes precision, local-agnostic ISO prefix). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export function roleGrantFields(target: { id: string; fullName: string | null } | null): RecordField[] {
  return [
    { name: "userId", labelKey: "userId", hintKey: "userIdHint", kind: "text", required: true, ltr: true, maxLength: 36, defaultValue: target?.id ?? "", readOnly: Boolean(target) },
    { name: "role", labelKey: "role", kind: "select", statusOptions: "role", required: true, defaultValue: "COMPLIANCE" },
  ];
}

export function commissionPolicyFields(policy: CommissionPolicyRow | null): RecordField[] {
  return [
    { name: "name", labelKey: "name", kind: "text", required: true, maxLength: 120, defaultValue: policy?.name ?? "" },
    { name: "effectiveFrom", labelKey: "effectiveFrom", hintKey: "effectiveFromHint", kind: "datetime", required: true, defaultValue: toLocalInput(policy?.effectiveFrom ?? null) },
    { name: "effectiveUntil", labelKey: "effectiveUntil", hintKey: "effectiveUntilHint", kind: "datetime", defaultValue: toLocalInput(policy?.effectiveUntil ?? null) },
  ];
}

export function commissionTierFields(tier: CommissionTierRow | null): RecordField[] {
  return [
    { name: "minQuantityKg", labelKey: "minQuantityKg", kind: "number", required: true, min: 0, step: "any", defaultValue: tier ? String(tier.minQuantityKg) : "" },
    { name: "maxQuantityKg", labelKey: "maxQuantityKg", hintKey: "maxQuantityHint", kind: "number", min: 0, step: "any", defaultValue: tier?.maxQuantityKg === null || tier?.maxQuantityKg === undefined ? "" : String(tier.maxQuantityKg) },
    { name: "percentage", labelKey: "percentage", hintKey: "percentageHint", kind: "number", required: true, min: 0, max: 100, step: "any", defaultValue: tier ? String(tier.percentage) : "" },
  ];
}

export function taxRuleFields(rule: TaxRuleRow | null): RecordField[] {
  return [
    { name: "countryCode", labelKey: "countryCode", hintKey: "countryCodeHint", kind: "text", required: true, ltr: true, maxLength: 2, defaultValue: rule?.countryCode ?? "" },
    { name: "taxName", labelKey: "taxName", kind: "text", required: true, maxLength: 60, defaultValue: rule?.taxName ?? "VAT" },
    { name: "ratePercentage", labelKey: "ratePercentage", kind: "number", required: true, min: 0, max: 100, step: "any", defaultValue: rule ? String(rule.ratePercentage) : "" },
    { name: "taxableBase", labelKey: "taxableBase", kind: "select", statusOptions: "taxableBase", required: true, defaultValue: rule?.taxableBase ?? "MERCHANDISE_ONLY" },
    { name: "effectiveFrom", labelKey: "effectiveFrom", hintKey: "effectiveFromHint", kind: "datetime", required: true, defaultValue: toLocalInput(rule?.effectiveFrom ?? null) },
    { name: "effectiveUntil", labelKey: "effectiveUntil", hintKey: "effectiveUntilHint", kind: "datetime", defaultValue: toLocalInput(rule?.effectiveUntil ?? null) },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: rule ? rule.isActive : true },
  ];
}

export function shippingRuleFields(rule: ShippingRuleRow | null): RecordField[] {
  return [
    { name: "deliveryMethod", labelKey: "deliveryMethod", kind: "text", required: true, maxLength: 100, defaultValue: rule?.deliveryMethod ?? "" },
    { name: "countryCode", labelKey: "countryCode", hintKey: "countryCodeOptionalHint", kind: "text", ltr: true, maxLength: 2, defaultValue: rule?.countryCode ?? "" },
    { name: "flatFee", labelKey: "flatFee", kind: "number", required: true, min: 0, step: "any", defaultValue: rule ? String(rule.flatFee) : "" },
    { name: "currency", labelKey: "currency", hintKey: "currencyHint", kind: "text", required: true, ltr: true, maxLength: 3, readOnly: true, defaultValue: CONFIG_CURRENCY },
    { name: "effectiveFrom", labelKey: "effectiveFrom", hintKey: "effectiveFromHint", kind: "datetime", required: true, defaultValue: toLocalInput(rule?.effectiveFrom ?? null) },
    { name: "effectiveUntil", labelKey: "effectiveUntil", hintKey: "effectiveUntilHint", kind: "datetime", defaultValue: toLocalInput(rule?.effectiveUntil ?? null) },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: rule ? rule.isActive : true },
  ];
}

export function paymentAccountFields(account: PaymentAccountDetail | null): RecordField[] {
  return [
    { name: "accountName", labelKey: "accountName", kind: "text", required: true, maxLength: 120, defaultValue: account?.accountName ?? "" },
    { name: "bankName", labelKey: "bankName", kind: "text", required: true, maxLength: 120, defaultValue: account?.bankName ?? "" },
    { name: "accountNumber", labelKey: "accountNumber", kind: "text", ltr: true, maxLength: 64, defaultValue: account?.accountNumber ?? "" },
    { name: "iban", labelKey: "iban", kind: "text", ltr: true, maxLength: 34, defaultValue: account?.iban ?? "" },
    { name: "swiftCode", labelKey: "swiftCode", kind: "text", ltr: true, maxLength: 11, defaultValue: account?.swiftCode ?? "" },
    { name: "currency", labelKey: "currency", hintKey: "currencyHint", kind: "text", required: true, ltr: true, maxLength: 3, readOnly: true, defaultValue: CONFIG_CURRENCY },
    { name: "isActive", labelKey: "isActive", hintKey: "isActiveHint", kind: "checkbox", defaultValue: account ? account.isActive : true },
  ];
}
