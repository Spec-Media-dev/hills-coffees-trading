/**
 * Feature 011 — the price-type taxonomy (T001, T002 — FR-001, FR-003, SC-001).
 *
 * THE PLATFORM HAS FOUR DIFFERENT PRICE CONCEPTS AND THEY MUST NEVER BE CONFLATED (SRS §9, Appendix D #8):
 *
 *   | Type              | What it is                                                        | Executable? |
 *   |-------------------|-------------------------------------------------------------------|-------------|
 *   | ReferencePrice    | external Arabica/Robusta/ICO indicator with full disclosure       | NO          |
 *   | HillsQuotePrice   | a price Hills offers for a defined product/quantity/term          | within rules|
 *   | ListingPrice      | a seller's ask on one eligible lot (`coffee_offers.price_per_kg`) | in workflow |
 *   | ExecutedPrice     | what was agreed, snapshotted (`order_items.unit_price_per_kg`)    | history     |
 *
 * THE COMPILER, NOT CONVENTION, KEEPS THEM APART. Each type carries a UNIQUE-SYMBOL brand as a required property,
 * so a value of one type is not assignable to another even though their remaining fields could line up
 * structurally — a `ReferencePrice` cannot be handed to anything that expects an `ExecutablePrice`
 * (`tests/pricing/type-separation.test.ts` pins this with `@ts-expect-error`, which fails the typecheck if the
 * substitution ever compiles). There is deliberately NO generic shared "price" / "money" / "amount" type in this
 * module or anywhere in `lib/pricing`: a common denominator is exactly what would let one concept stand in for
 * another.
 *
 * DISCLOSURE IS STRUCTURAL. `ReferencePrice` carries every disclosure field as a REQUIRED property (source, raw
 * unit, raw currency, observation timestamp, time zone, delay type, and the reference-only statement). The only
 * way to obtain one is `makeReferencePrice`, which returns `null` when any of them is missing or malformed — so a
 * bare number cannot exist as a `ReferencePrice`, and the presentation component (which takes the whole object)
 * cannot render one (FR-003).
 *
 * RAW VALUES ARE STRINGS, ON PURPOSE. `raw_value` is a PostgreSQL `numeric`; it is read as its exact decimal text
 * and kept as text, never parsed to a float. That is what guarantees "stored amount rendered exactly" — no
 * floating-point drift, no rounding, and no arithmetic anywhere in this feature (FR-006, DB-OPEN-08).
 *
 * DB-OPEN-08 — THERE IS NO CURRENCY / UNIT CONVERSION IN THIS MODULE OR ANYWHERE IN `lib/pricing`. The approved
 * schema stores no exchange rate, so a currency/unit transformation (cents/lb → USD/MT → USD/kg) could not be
 * audited (PX-03). Raw value, raw unit and raw currency are carried through unchanged (`tests/pricing/no-conversion.test.ts` guards this).
 *
 * ── BRAND SYMBOLS ARE EXPORTED ONLY SO THE TYPES CAN NAME THEM. Never build a branded value by hand or with a
 * cast; use the factory. Branded objects are rebuilt from plain cached records AFTER the cache boundary (a symbol
 * key does not survive `unstable_cache`'s JSON round trip, and that is the desired behaviour: every consumer
 * re-validates completeness through the factory).
 */

export const REFERENCE_PRICE_BRAND: unique symbol = Symbol("hills.price.reference");
export const HILLS_QUOTE_PRICE_BRAND: unique symbol = Symbol("hills.price.hills-quote");
export const LISTING_PRICE_BRAND: unique symbol = Symbol("hills.price.listing");
export const EXECUTED_PRICE_BRAND: unique symbol = Symbol("hills.price.executed");

// ── vocabulary (mirrors the live CHECK constraints exactly) ─────────────────────────────────────────────────────

/** `price_sources_delay_type_check`. `REAL_TIME` is labelled as such only for an APPROVED, active source (FR-004). */
export const REFERENCE_DELAY_TYPES = ["REAL_TIME", "DELAYED", "DAILY", "MANUAL"] as const;
export type ReferenceDelayType = (typeof REFERENCE_DELAY_TYPES)[number];

/** `price_sources_licence_status_check`. Only `APPROVED` (with `is_active`) is ever displayable (FR-002). */
export const PRICE_SOURCE_LICENCE_STATUSES = ["PENDING", "APPROVED", "RESTRICTED", "DISABLED"] as const;
export type PriceSourceLicenceStatus = (typeof PRICE_SOURCE_LICENCE_STATUSES)[number];

/**
 * The commodity types shown as coffee reference benchmarks. `price_observations_commodity_type_check` also allows
 * the exchange-rate type and `OTHER`; both are EXCLUDED here — an exchange-rate observation is precisely the input a
 * currency transformation would need (DB-OPEN-08 forbids one), and `OTHER` is not an Arabica/Robusta/ICO benchmark
 * (spec §Purpose). Recorded assumption.
 */
export const REFERENCE_COMMODITIES = ["ARABICA", "ROBUSTA", "ICO_INDICATOR"] as const;
export type ReferenceCommodity = (typeof REFERENCE_COMMODITIES)[number];

/** `price_differentials_differential_type_check`. */
export const DIFFERENTIAL_TYPES = ["ORIGIN", "QUALITY", "CERTIFICATION", "CROP", "COMMERCIAL", "OTHER"] as const;
export type DifferentialType = (typeof DIFFERENTIAL_TYPES)[number];

// ── reference price ─────────────────────────────────────────────────────────────────────────────────────────────

export type ReferenceSourceIdentity = {
  readonly name: string;
  readonly code: string;
  readonly sourceType: string;
  /** Public attribution link when the source recorded one; never required. */
  readonly url: string | null;
};

/** Every element AC-06 / FR-003 requires next to a displayed benchmark. All required; none optional. */
export type ReferencePriceDisclosure = {
  readonly source: ReferenceSourceIdentity;
  readonly symbol: string;
  readonly commodity: ReferenceCommodity;
  readonly rawUnit: string;
  readonly rawCurrency: string;
  /** ISO-8601 instant (the stored `timestamptz`). */
  readonly observedAt: string;
  /** Observation instants are always presented in UTC — stated, never implied. */
  readonly timeZone: "UTC";
  readonly delayType: ReferenceDelayType;
  /** Minutes of delay when the source recorded them; `null` otherwise. Never guessed. */
  readonly delayMinutes: number | null;
  /** The reference-only statement is a structural property, not a caption a caller may forget. */
  readonly referenceOnly: true;
};

/** Information only — NEVER executable. Not assignable to `ExecutablePrice`. */
export type ReferencePrice = ReferencePriceDisclosure & {
  readonly kind: "REFERENCE";
  /** The stored `raw_value`, as its exact decimal text. Never parsed, rounded or transformed. */
  readonly rawValue: string;
  readonly [REFERENCE_PRICE_BRAND]: true;
};

/** The plain (JSON-safe, cacheable) shape a `ReferencePrice` is built from. */
export type ReferencePriceInput = {
  source: { name: string; code: string; sourceType: string; url: string | null };
  symbol: string;
  commodity: string;
  rawValue: string;
  rawUnit: string;
  rawCurrency: string;
  observedAt: string;
  delayType: string;
  delayMinutes: number | null;
};

const DECIMAL = /^-?\d+(\.\d+)?$/;

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function isValidInstant(value: unknown): value is string {
  return nonEmpty(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Builds a `ReferencePrice`, or returns `null` when ANY disclosure element is missing/malformed.
 * A `null` means "withhold the value" — callers must render the unavailable state, never the bare number
 * (FR-003, PS2 scenario 2). Trims only insignificant whitespace (`character(n)` padding); it never alters a digit.
 */
export function makeReferencePrice(input: ReferencePriceInput): ReferencePrice | null {
  if (!input || !input.source) return null;
  const { source } = input;
  if (!nonEmpty(source.name) || !nonEmpty(source.code) || !nonEmpty(source.sourceType)) return null;
  if (!nonEmpty(input.symbol) || !nonEmpty(input.rawUnit) || !nonEmpty(input.rawCurrency)) return null;
  if (!nonEmpty(input.rawValue) || !DECIMAL.test(input.rawValue.trim())) return null;
  if (!isValidInstant(input.observedAt)) return null;
  if (!(REFERENCE_COMMODITIES as readonly string[]).includes(input.commodity)) return null;
  if (!(REFERENCE_DELAY_TYPES as readonly string[]).includes(input.delayType)) return null;
  if (input.delayMinutes !== null && !(Number.isInteger(input.delayMinutes) && input.delayMinutes >= 0)) return null;

  return Object.freeze({
    kind: "REFERENCE",
    source: Object.freeze({
      name: source.name.trim(),
      code: source.code.trim(),
      sourceType: source.sourceType.trim(),
      url: nonEmpty(source.url) ? source.url.trim() : null,
    }),
    symbol: input.symbol.trim(),
    commodity: input.commodity as ReferenceCommodity,
    rawValue: input.rawValue.trim(),
    rawUnit: input.rawUnit.trim(),
    rawCurrency: input.rawCurrency.trim(),
    observedAt: input.observedAt,
    timeZone: "UTC",
    delayType: input.delayType as ReferenceDelayType,
    delayMinutes: input.delayMinutes,
    referenceOnly: true,
    [REFERENCE_PRICE_BRAND]: true,
  } as const) as ReferencePrice;
}

/** Runtime guard for the presentation component (the last line of defence against a cast that skipped the factory). */
export function isReferencePrice(value: unknown): value is ReferencePrice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ReferencePrice> & Record<symbol, unknown>;
  return (
    candidate[REFERENCE_PRICE_BRAND] === true &&
    candidate.kind === "REFERENCE" &&
    candidate.referenceOnly === true &&
    nonEmpty(candidate.rawValue) &&
    DECIMAL.test(String(candidate.rawValue).trim()) &&
    nonEmpty(candidate.rawUnit) &&
    nonEmpty(candidate.rawCurrency) &&
    isValidInstant(candidate.observedAt) &&
    candidate.timeZone === "UTC" &&
    nonEmpty(candidate.symbol) &&
    !!candidate.source &&
    nonEmpty(candidate.source.name) &&
    (REFERENCE_DELAY_TYPES as readonly string[]).includes(String(candidate.delayType))
  );
}

// ── the three EXECUTABLE price types (owned by Features 006 / 007 / a future quote workflow) ────────────────────

/**
 * A seller's ask on one eligible physical lot — `coffee_offers.price_per_kg`. Executable only inside the authorized
 * listing/checkout workflow. Declared here so the taxonomy is complete and a reference value can never be
 * substituted for it; Feature 006 owns producing one.
 */
export type ListingPrice = {
  readonly kind: "LISTING";
  readonly amount: string;
  readonly currency: string;
  readonly unit: string;
  readonly [LISTING_PRICE_BRAND]: true;
};

/**
 * What was actually agreed, snapshotted on the order — `order_items.unit_price_per_kg`, `order_financials`.
 * A historical fact. Feature 007 owns producing one.
 */
export type ExecutedPrice = {
  readonly kind: "EXECUTED";
  readonly amount: string;
  readonly currency: string;
  readonly unit: string;
  readonly [EXECUTED_PRICE_BRAND]: true;
};

/**
 * A price Hills offers for a defined product / quantity / term (SRS §9 "Hills quote").
 *
 * ── NO DATA MODEL EXISTS (T002) ────────────────────────────────────────────────────────────────────────────────
 * The approved schema has NO quote entity — orders reference `coffee_offers` prices, and the RFQ → quote workflow
 * has nowhere to live (`specs/011-pricing-reference-data/spec.md` §Open items; a product + database decision is
 * required before a quote workflow can exist). This type is declared ONLY so that, when the workflow is approved,
 * the taxonomy already has a home, and so nothing can accidentally fill the gap in the meantime.
 *
 * It has NO fields beyond its brand and NO constructor anywhere: no code path may build one from a listing price,
 * an executed price, a reference price or any other data (`tests/pricing/type-separation.test.ts` pins this).
 */
export type HillsQuotePrice = {
  readonly kind: "HILLS_QUOTE";
  readonly [HILLS_QUOTE_PRICE_BRAND]: true;
};

/** Anything a purchase action may carry. A `ReferencePrice` is deliberately NOT a member. */
export type ExecutablePrice = ListingPrice | ExecutedPrice | HillsQuotePrice;

/** The four price concepts, for exhaustive switches. */
export type AnyPriceType = ReferencePrice | ExecutablePrice;
