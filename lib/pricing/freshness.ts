/**
 * Feature 011 freshness resolution (T004 — FR-005, FR-008, SC-004).
 *
 * PX-05 FORBIDS PRESENTING STALE OR CACHED DATA AS CURRENT. This module is where the verdict is made — from FACTS
 * that travel with the value through the cache (`isStale`, `observedAt`, `receivedAt`), never from a verdict that
 * was frozen into a cache entry. A cache hit therefore re-resolves to exactly the same honest state.
 *
 * Nothing here invents a threshold. The stale flag is the stored `price_observations.is_stale`; this feature adds no
 * age cut-off of its own (none is approved), and it always shows the observation timestamp so the reader can judge
 * the age for themselves.
 *
 * Nothing here estimates, interpolates or carries a value forward: an absent observation is the explicit
 * `unavailable` shape, never a fabricated number.
 */

/** Observation instants are always presented in UTC, and that is stated wherever a timestamp is shown. */
export const OBSERVATION_TIME_ZONE = "UTC" as const;

export type FreshnessState = "current" | "stale";

export type Freshness = {
  readonly state: FreshnessState;
  /** When the price was observed at its source. */
  readonly observedAt: string;
  /** When Hills received it (`null` if the record did not carry it). */
  readonly receivedAt: string | null;
  readonly timeZone: typeof OBSERVATION_TIME_ZONE;
  /**
   * The last successful observation. For a stale feed this is the latest observation we hold — the context the
   * stale state shows in place of a current-looking value.
   */
  readonly lastSuccessAt: string;
};

export type FreshnessInput = {
  observedAt: string;
  receivedAt?: string | null;
  isStale: boolean;
};

/** Resolves the freshness of one observation from its stored facts. */
export function resolveFreshness(input: FreshnessInput): Freshness {
  return {
    state: input.isStale ? "stale" : "current",
    observedAt: input.observedAt,
    receivedAt: input.receivedAt ?? null,
    timeZone: OBSERVATION_TIME_ZONE,
    lastSuccessAt: input.observedAt,
  };
}

/** Why nothing can be shown. Distinct reasons, so a surface never guesses (and never says "empty" for "failed"). */
export const UNAVAILABLE_REASONS = ["no_approved_source", "no_observation", "incomplete_disclosure", "read_failed"] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

/** The explicit "there is nothing to show" shape — carries no value field to fall back to by accident. */
export type Unavailable = {
  readonly status: "unavailable";
  readonly reason: UnavailableReason;
  /** Last successful observation timestamp when one is known; `null` when there never was one. */
  readonly lastSuccessAt: string | null;
  readonly timeZone: typeof OBSERVATION_TIME_ZONE;
};

export function unavailable(reason: UnavailableReason, lastSuccessAt: string | null = null): Unavailable {
  return { status: "unavailable", reason, lastSuccessAt, timeZone: OBSERVATION_TIME_ZONE };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Deterministic, locale-independent rendering of an observation instant: `YYYY-MM-DD HH:mm UTC`.
 * (No `Intl` — its output varies by runtime locale, and the digits must be exactly the stored ones.)
 * Returns `null` for an unparsable instant rather than rendering `Invalid Date`.
 */
export function formatObservationInstant(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${OBSERVATION_TIME_ZONE}`;
}
