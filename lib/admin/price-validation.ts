import { z } from "zod";

import { DIFFERENTIAL_TYPES, REFERENCE_COMMODITIES } from "@/lib/pricing/types";

/**
 * Feature 010 T049 — input contracts for reference-price administration (Feature 011 FR-011).
 *
 * VOCABULARIES ARE THE DATABASE'S OWN CHECK CONSTRAINTS (schema report, re-checked 2026-09-21):
 * `price_sources_licence_status_check`, `price_sources_delay_type_check`, `price_sources_source_type_check`,
 * `price_observations_commodity_type_check`, `price_differentials_differential_type_check`. Two are deliberately
 * NARROWER than the database, never wider:
 *   - observations: only the benchmark commodities Feature 011 displays (`REFERENCE_COMMODITIES`). The exchange-rate
 *     and `OTHER` types stay unrecordable here — an exchange-rate observation is exactly the input a conversion would
 *     need, and none may exist while DB-OPEN-08 stands.
 *   - new sources: the exchange-rate source type is not offered, for the same reason.
 *
 * EXACT VALUES: `rawValue` / `amount` stay STRINGS from the form to the database (PostgREST casts text → numeric).
 * They are never parsed into a float, rounded or re-formatted. At most 6 fractional digits are accepted — the
 * columns' fixed scale — so the database never silently rounds an entered value.
 *
 * TIME: every instant is entered and stored as UTC (Feature 011 presents observation instants in UTC). A value
 * without an explicit zone is read AS UTC, never in the server's local zone. An observation cannot be in the future.
 *
 * VALIDATION IS NOT AUTHORIZATION: every write in `lib/admin/prices.ts` re-verifies `is_platform_admin()` live, and
 * the `price_*_admin` RLS policies decide underneath.
 */

export const PRICE_LICENCE_STATUSES = ["PENDING", "APPROVED", "RESTRICTED", "DISABLED"] as const;
export type PriceLicenceStatus = (typeof PRICE_LICENCE_STATUSES)[number];

export const PRICE_DELAY_TYPES = ["REAL_TIME", "DELAYED", "DAILY", "MANUAL"] as const;
export type PriceDelayType = (typeof PRICE_DELAY_TYPES)[number];

/** `price_sources_source_type_check` minus the exchange-rate type (see header). */
export const PRICE_SOURCE_TYPES = ["ICE_ARABICA", "ICE_ROBUSTA", "ICO", "OTHER"] as const;
export type PriceSourceType = (typeof PRICE_SOURCE_TYPES)[number];

/** Only the benchmark commodities Feature 011 displays — bound to its own constant so the two cannot drift. */
export const PRICE_OBSERVATION_COMMODITIES = REFERENCE_COMMODITIES;
export const PRICE_DIFFERENTIAL_TYPES = DIFFERENTIAL_TYPES;

export const PRICE_SCALE = 6;
const DECIMAL = /^-?\d{1,12}(\.\d{1,6})?$/;
const POSITIVE_DECIMAL = /^\d{1,12}(\.\d{1,6})?$/;

const uuid = z.string().uuid("INVALID_REFERENCE");
const optionalUuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.string().uuid("INVALID_REFERENCE").nullable());
const name = z.string().trim().min(2, "NAME_REQUIRED").max(120, "NAME_TOO_LONG");
const sourceCode = z.string().trim().toUpperCase().min(2, "CODE_REQUIRED").max(32, "CODE_TOO_LONG").regex(/^[A-Z0-9]+(?:[-_][A-Z0-9]+)*$/, "CODE_INVALID");
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.string().max(500, "URL_INVALID").regex(/^https?:\/\/\S+$/i, "URL_INVALID").nullable());
const optionalDelayMinutes = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null))
  .pipe(z.string().regex(/^\d{1,6}$/, "DELAY_MINUTES_INVALID").transform(Number).nullable());
/** HTML checkbox semantics: an unchecked box is ABSENT from the FormData, so absent = false. */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((value) => value === "on" || value === "true" || value === true);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "CURRENCY_INVALID");
const unit = z.string().trim().min(1, "UNIT_REQUIRED").max(32, "UNIT_TOO_LONG");
const symbol = z.string().trim().min(1, "SYMBOL_REQUIRED").max(32, "SYMBOL_TOO_LONG").regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, "SYMBOL_INVALID");
const notes = z
  .string()
  .trim()
  .max(1000, "NOTES_TOO_LONG")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

/** `YYYY-MM-DDTHH:MM[:SS]` (a `datetime-local` value) or a full ISO instant; a zone-less value is UTC. */
export function parseUtcInstant(value: string): string | null {
  const trimmed = value.trim();
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(trimmed)) return null;
  const time = Date.parse(zoned ? trimmed : `${trimmed}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const utcInstant = z
  .string()
  .trim()
  .min(1, "DATE_REQUIRED")
  .transform((value, ctx) => {
    const iso = parseUtcInstant(value);
    if (!iso) {
      ctx.addIssue({ code: "custom", message: "DATE_INVALID" });
      return z.NEVER;
    }
    return iso;
  });
const optionalUtcInstant = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    const iso = parseUtcInstant(value);
    if (!iso) {
      ctx.addIssue({ code: "custom", message: "DATE_INVALID" });
      return z.NEVER;
    }
    return iso;
  });

/** Tolerated clock skew between the operator's entry and the server, for the "not in the future" rule. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// ── sources ──────────────────────────────────────────────────────────────────────────────────────

const sourceEditable = {
  name,
  sourceUrl: optionalUrl,
  licenceStatus: z.enum(PRICE_LICENCE_STATUSES, { message: "INVALID_REFERENCE" }),
  delayType: z.enum(PRICE_DELAY_TYPES, { message: "INVALID_REFERENCE" }),
  delayMinutes: optionalDelayMinutes,
  isActive: checkbox,
};

/** A new source. `code` and `sourceType` are fixed once created (they identify the feed). */
export const PriceSourceCreateInput = z.object({ ...sourceEditable, code: sourceCode, sourceType: z.enum(PRICE_SOURCE_TYPES, { message: "INVALID_REFERENCE" }) });
export type PriceSourceCreateInput = z.infer<typeof PriceSourceCreateInput>;

export const PriceSourceUpdateInput = z.object({ ...sourceEditable, sourceId: uuid });
export type PriceSourceUpdateInput = z.infer<typeof PriceSourceUpdateInput>;

// ── observations (append-only) ───────────────────────────────────────────────────────────────────

export const PriceObservationInput = z
  .object({
    sourceId: uuid,
    symbol,
    commodityType: z.enum(PRICE_OBSERVATION_COMMODITIES, { message: "COMMODITY_INVALID" }),
    rawValue: z.string().trim().regex(POSITIVE_DECIMAL, "VALUE_INVALID").refine((value) => /[1-9]/.test(value), "VALUE_INVALID"),
    rawCurrency: currency,
    rawUnit: unit,
    observedAt: utcInstant,
    isStale: checkbox,
  })
  .superRefine((input, ctx) => {
    if (Date.parse(input.observedAt) > Date.now() + FUTURE_SKEW_MS) ctx.addIssue({ code: "custom", path: ["observedAt"], message: "DATE_IN_FUTURE" });
  });
export type PriceObservationInput = z.infer<typeof PriceObservationInput>;

// ── differentials ────────────────────────────────────────────────────────────────────────────────

/**
 * A new differential: general (no scope), one coffee, or one origin — the three scopes Feature 011's public layer
 * reads. Lot-scoped differentials are private and are not created here.
 */
export const PriceDifferentialCreateInput = z
  .object({
    differentialType: z.enum(PRICE_DIFFERENTIAL_TYPES, { message: "INVALID_REFERENCE" }),
    amount: z.string().trim().regex(DECIMAL, "VALUE_INVALID"),
    currency,
    unit,
    effectiveFrom: utcInstant,
    effectiveUntil: optionalUtcInstant,
    coffeeId: optionalUuid,
    originId: optionalUuid,
    notes,
    isActive: checkbox,
  })
  .superRefine((input, ctx) => {
    if (input.coffeeId && input.originId) ctx.addIssue({ code: "custom", path: ["originId"], message: "SCOPE_SINGLE" });
    if (input.effectiveUntil && Date.parse(input.effectiveUntil) <= Date.parse(input.effectiveFrom)) ctx.addIssue({ code: "custom", path: ["effectiveUntil"], message: "EFFECTIVE_UNTIL_BEFORE_FROM" });
  });
export type PriceDifferentialCreateInput = z.infer<typeof PriceDifferentialCreateInput>;

/** Lifecycle only: the amount, currency, unit, type and scope of an existing differential are fixed. */
export const PriceDifferentialUpdateInput = z.object({
  differentialId: uuid,
  effectiveUntil: optionalUtcInstant,
  notes,
  isActive: checkbox,
});
export type PriceDifferentialUpdateInput = z.infer<typeof PriceDifferentialUpdateInput>;
