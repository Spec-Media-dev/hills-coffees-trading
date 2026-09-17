import { z } from "zod";

/**
 * Feature 010 RUN F (Phase 9) — input contracts for the SUPER_ADMIN system-configuration surfaces.
 * Every vocabulary below is the database's own CHECK constraint, verbatim (schema report,
 * re-checked 2026-09-17): `platform_admins_role_check`, `commission_policies_status_check`,
 * `tax_rules_taxable_base_check`, `shipping_rules_currency_check` / `payment_accounts_currency_check`
 * (`'USD'` only). Numeric bounds mirror `commission_tiers_*_check`, `tax_rules_rate_percentage_check`
 * and `shipping_rules_flat_fee_check`. Nothing here invents a status, a role or a currency.
 */

// ── Shared primitives ────────────────────────────────────────────────────────────────────────────

const uuid = z.string().uuid("INVALID_REFERENCE");
const name = z.string().trim().min(2, "NAME_REQUIRED").max(120, "NAME_TOO_LONG");
const countryCode = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "COUNTRY_CODE_INVALID");
const optionalCountryCode = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value.toUpperCase() : null))
  .pipe(z.string().regex(/^[A-Z]{2}$/, "COUNTRY_CODE_INVALID").nullable());
/** HTML checkbox semantics: an unchecked box is simply ABSENT from the FormData, so the key is optional and absent = false. */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);
/** `datetime-local` / ISO input → ISO instant; empty = absent. */
const instant = z
  .string()
  .trim()
  .min(1, "DATE_REQUIRED")
  .refine((value) => !Number.isNaN(Date.parse(value)), "DATE_INVALID")
  .transform((value) => new Date(value).toISOString());
const optionalInstant = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.string().refine((value) => !Number.isNaN(Date.parse(value)), "DATE_INVALID").transform((value) => new Date(value).toISOString()).nullable());
const percentage = z.coerce.number({ error: "PERCENTAGE_INVALID" }).min(0, "PERCENTAGE_INVALID").max(100, "PERCENTAGE_INVALID");
const nonNegative = z.coerce.number({ error: "QUANTITY_INVALID" }).min(0, "QUANTITY_INVALID");
const optionalNonNegative = z
  .union([z.literal(""), z.null(), z.coerce.number({ error: "QUANTITY_INVALID" }).min(0, "QUANTITY_INVALID")])
  .optional()
  .transform((value) => (value === "" || value === undefined || value === null ? null : value));
/** Every configuration currency column is CHECK-constrained to exactly `USD`. */
export const CONFIG_CURRENCY = "USD" as const;

function effectiveWindow<T extends { effectiveFrom: string; effectiveUntil: string | null }>(input: T, ctx: z.RefinementCtx) {
  if (input.effectiveUntil && Date.parse(input.effectiveUntil) <= Date.parse(input.effectiveFrom)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["effectiveUntil"], message: "EFFECTIVE_UNTIL_BEFORE_FROM" });
  }
}

// ── T027 — platform admin roles (`platform_admins_role_check`) ──────────────────────────────────

export const PLATFORM_ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN", "COMPLIANCE", "WAREHOUSE", "FINANCE", "AUDITOR"] as const;
export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

export const RoleGrantInput = z.object({ userId: uuid, role: z.enum(PLATFORM_ADMIN_ROLES) });
export type RoleGrantInput = z.infer<typeof RoleGrantInput>;
/** Compare-and-set: the caller states the role/activity it saw; a mismatch is STALE, never overwritten. */
export const RoleChangeInput = z.object({ userId: uuid, role: z.enum(PLATFORM_ADMIN_ROLES), expectedRole: z.enum(PLATFORM_ADMIN_ROLES) });
export type RoleChangeInput = z.infer<typeof RoleChangeInput>;
export const RoleActivityInput = z.object({ userId: uuid, isActive: checkbox, expectedRole: z.enum(PLATFORM_ADMIN_ROLES), expectedActive: checkbox });
export type RoleActivityInput = z.infer<typeof RoleActivityInput>;

// ── T042 — commission policies and tiers ────────────────────────────────────────────────────────

export const COMMISSION_POLICY_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type CommissionPolicyStatus = (typeof COMMISSION_POLICY_STATUSES)[number];

/**
 * Named status operations — the only way a policy's `status` moves, each a compare-and-set on the
 * operation's source statuses. There is no generic status setter.
 */
export const COMMISSION_POLICY_TRANSITIONS = {
  activate: { from: ["DRAFT"], to: "ACTIVE" },
  deactivate: { from: ["ACTIVE"], to: "DRAFT" },
  archive: { from: ["DRAFT", "ACTIVE"], to: "ARCHIVED" },
  restore: { from: ["ARCHIVED"], to: "DRAFT" },
} as const satisfies Record<string, { from: readonly CommissionPolicyStatus[]; to: CommissionPolicyStatus }>;
export type CommissionPolicyTransitionKey = keyof typeof COMMISSION_POLICY_TRANSITIONS;
export const COMMISSION_POLICY_TRANSITION_KEYS = Object.keys(COMMISSION_POLICY_TRANSITIONS) as readonly CommissionPolicyTransitionKey[];
export function commissionTransitionsFor(status: CommissionPolicyStatus): readonly CommissionPolicyTransitionKey[] {
  return COMMISSION_POLICY_TRANSITION_KEYS.filter((key) => (COMMISSION_POLICY_TRANSITIONS[key].from as readonly CommissionPolicyStatus[]).includes(status));
}

export const CommissionPolicyFieldsInput = z.object({ name, effectiveFrom: instant, effectiveUntil: optionalInstant }).superRefine(effectiveWindow);
export type CommissionPolicyFieldsInput = z.infer<typeof CommissionPolicyFieldsInput>;
export const CommissionPolicyUpdateInput = z.object({ policyId: uuid, name, effectiveFrom: instant, effectiveUntil: optionalInstant }).superRefine(effectiveWindow);
export type CommissionPolicyUpdateInput = z.infer<typeof CommissionPolicyUpdateInput>;
export const CommissionPolicyTransitionInput = z.object({ policyId: uuid, operation: z.enum(["activate", "deactivate", "archive", "restore"]) });
export type CommissionPolicyTransitionInput = z.infer<typeof CommissionPolicyTransitionInput>;

const tierBand = (input: { minQuantityKg: number; maxQuantityKg: number | null }, ctx: z.RefinementCtx) => {
  if (input.maxQuantityKg !== null && input.maxQuantityKg <= input.minQuantityKg) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxQuantityKg"], message: "MAX_NOT_ABOVE_MIN" });
  }
};
export const CommissionTierFieldsInput = z.object({ policyId: uuid, minQuantityKg: nonNegative, maxQuantityKg: optionalNonNegative, percentage }).superRefine(tierBand);
export type CommissionTierFieldsInput = z.infer<typeof CommissionTierFieldsInput>;
export const CommissionTierUpdateInput = z.object({ policyId: uuid, tierId: uuid, minQuantityKg: nonNegative, maxQuantityKg: optionalNonNegative, percentage }).superRefine(tierBand);
export type CommissionTierUpdateInput = z.infer<typeof CommissionTierUpdateInput>;

// ── T028 — tax rules and shipping rules ─────────────────────────────────────────────────────────

export const TAXABLE_BASES = ["MERCHANDISE_ONLY", "MERCHANDISE_AND_SHIPPING"] as const;
export type TaxableBase = (typeof TAXABLE_BASES)[number];

const taxRuleFields = z.object({
  countryCode,
  taxName: z.string().trim().min(1, "NAME_REQUIRED").max(60, "NAME_TOO_LONG"),
  ratePercentage: percentage,
  taxableBase: z.enum(TAXABLE_BASES),
  isActive: checkbox,
  effectiveFrom: instant,
  effectiveUntil: optionalInstant,
});
export const TaxRuleFieldsInput = taxRuleFields.superRefine(effectiveWindow);
export type TaxRuleFieldsInput = z.infer<typeof TaxRuleFieldsInput>;
export const TaxRuleUpdateInput = taxRuleFields.extend({ ruleId: uuid }).superRefine(effectiveWindow);
export type TaxRuleUpdateInput = z.infer<typeof TaxRuleUpdateInput>;

const shippingRuleFields = z.object({
  countryCode: optionalCountryCode,
  deliveryMethod: z.string().trim().min(1, "NAME_REQUIRED").max(100, "NAME_TOO_LONG"),
  flatFee: nonNegative,
  currency: z.literal(CONFIG_CURRENCY, { error: "CURRENCY_INVALID" }).default(CONFIG_CURRENCY),
  isActive: checkbox,
  effectiveFrom: instant,
  effectiveUntil: optionalInstant,
});
export const ShippingRuleFieldsInput = shippingRuleFields.superRefine(effectiveWindow);
export type ShippingRuleFieldsInput = z.infer<typeof ShippingRuleFieldsInput>;
export const ShippingRuleUpdateInput = shippingRuleFields.extend({ ruleId: uuid }).superRefine(effectiveWindow);
export type ShippingRuleUpdateInput = z.infer<typeof ShippingRuleUpdateInput>;

// ── T029 — payment accounts (high-risk; OPS-01 dual control NOT simulated) ──────────────────────

const optionalBankField = (max: number, key: string) =>
  z
    .string()
    .trim()
    .max(max, key)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const PaymentAccountFieldsInput = z.object({
  accountName: name,
  bankName: z.string().trim().min(2, "NAME_REQUIRED").max(120, "NAME_TOO_LONG"),
  accountNumber: optionalBankField(64, "ACCOUNT_NUMBER_TOO_LONG"),
  iban: optionalBankField(34, "IBAN_TOO_LONG").pipe(z.string().regex(/^[A-Z0-9 ]*$/i, "IBAN_INVALID").nullable()),
  swiftCode: optionalBankField(11, "SWIFT_TOO_LONG").pipe(z.string().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i, "SWIFT_INVALID").nullable()),
  currency: z.literal(CONFIG_CURRENCY, { error: "CURRENCY_INVALID" }).default(CONFIG_CURRENCY),
  isActive: checkbox,
});
export type PaymentAccountFieldsInput = z.infer<typeof PaymentAccountFieldsInput>;
export const PaymentAccountUpdateInput = PaymentAccountFieldsInput.extend({ accountId: uuid });
export type PaymentAccountUpdateInput = z.infer<typeof PaymentAccountUpdateInput>;
