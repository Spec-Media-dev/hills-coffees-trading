import { getActiveDifferentials, isInEffectivePeriod, type DifferentialRecord, type DifferentialScope } from "./differentials";
import { resolveFreshness, unavailable, type Freshness, type Unavailable } from "./freshness";
import { getReferenceBenchmarks, type BenchmarkRecord, type BenchmarkSnapshot } from "./sources";
import { makeReferencePrice, type ReferencePrice, type ReferenceSourceIdentity } from "./types";

/**
 * Feature 011 presentation contract — the shape Feature 002 (and any later consumer) renders (T007 — FR-003, FR-005,
 * SC-002).
 *
 * THE CONTRACT CANNOT EXPRESS "A NUMBER WITHOUT DISCLOSURE". A value only ever appears inside a `ReferencePrice`,
 * which cannot be constructed without every disclosure element (`makeReferencePrice` returns `null` otherwise, and
 * the record is then WITHHELD). AC-06 is therefore a property of the type, not of a consumer's diligence.
 *
 * FOUR EXPLICIT, MUTUALLY EXCLUSIVE SHAPES, so a consumer cannot mistake one for another:
 *
 *   entry `current`  → a complete, disclosure-carrying `ReferencePrice`.
 *   entry `stale`    → a `StaleReference`: the feed is flagged stale. It has NO value field at all — a stale figure
 *                      is withheld rather than shown looking current — only the source and the last-success timestamp.
 *   `unavailable`    → `Unavailable`: nothing to show, with a DISTINCT reason (no approved source / no observation /
 *                      incomplete disclosure / read failed) and no value field to fall back to by accident.
 *   `basis`          → benchmark(s) + differentials, explicitly marked `explanatoryOnly: true` — a basis explanation,
 *                      never an executable quote, and never summed (different units/currencies are not comparable
 *                      while DB-OPEN-08 stands).
 *
 * THE VERDICT IS RE-DERIVED ON EVERY CALL from facts (`isStale`, `observedAt`, the differential periods), never
 * frozen into the cache (FR-008). Nothing here estimates, interpolates, sums, rounds or transforms a value.
 */

/** A stale feed's last known context. Carries NO price value. */
export type StaleReference = {
  readonly kind: "STALE_REFERENCE";
  readonly source: ReferenceSourceIdentity;
  readonly symbol: string;
  readonly freshness: Freshness;
};

export type ReferencePriceEntry =
  | { readonly state: "current"; readonly price: ReferencePrice; readonly freshness: Freshness }
  | { readonly state: "stale"; readonly stale: StaleReference };

/** One differential as displayed: type, amount, currency, unit, effective period — nothing more. */
export type BasisComponent = DifferentialRecord;

export type BasisBreakdown = {
  /** The current benchmark(s) the components are explained against. Never empty. */
  readonly benchmarks: readonly ReferencePrice[];
  readonly components: readonly BasisComponent[];
  /** A basis explanation — not a quote, not executable, not a total. */
  readonly explanatoryOnly: true;
};

export type ReferencePresentation =
  | { readonly status: "unavailable"; readonly unavailable: Unavailable }
  | {
      readonly status: "ready";
      readonly entries: readonly ReferencePriceEntry[];
      /** `null` when there are no in-period differentials, no current benchmark, or the differential read failed. */
      readonly basis: BasisBreakdown | null;
      /** When the underlying cache entry was built. */
      readonly readAt: string;
    };

function toIdentity(record: BenchmarkRecord): ReferenceSourceIdentity {
  return { name: record.source.name, code: record.source.code, sourceType: record.source.sourceType, url: record.source.url };
}

/**
 * Pure: turns a snapshot (+ differentials) into the presentation contract. `now` bounds the differential periods.
 * Exported for the unit suites — the async accessor below only supplies the (cached) inputs.
 */
export function buildReferencePresentation(snapshot: BenchmarkSnapshot | null, differentials: readonly DifferentialRecord[] | null, now: Date): ReferencePresentation {
  if (snapshot === null) return { status: "unavailable", unavailable: unavailable("read_failed") };
  if (snapshot.approvedSourceCount === 0) return { status: "unavailable", unavailable: unavailable("no_approved_source") };
  if (snapshot.records.length === 0) return { status: "unavailable", unavailable: unavailable("no_observation") };

  const entries: ReferencePriceEntry[] = [];
  let withheld = 0;
  let lastSuccessAt: string | null = null;

  for (const record of snapshot.records) {
    const freshness = resolveFreshness({ observedAt: record.observedAt, receivedAt: record.receivedAt, isStale: record.isStale });
    if (lastSuccessAt === null || Date.parse(record.observedAt) > Date.parse(lastSuccessAt)) lastSuccessAt = record.observedAt;

    if (freshness.state === "stale") {
      // A stale figure is never shown as if current: only who/what/when. Requires a real identity to say anything.
      if (!record.source.name.trim() || !record.symbol.trim() || Number.isNaN(Date.parse(record.observedAt))) {
        withheld += 1;
        continue;
      }
      entries.push({ state: "stale", stale: { kind: "STALE_REFERENCE", source: toIdentity(record), symbol: record.symbol, freshness } });
      continue;
    }

    const price = makeReferencePrice({
      source: { name: record.source.name, code: record.source.code, sourceType: record.source.sourceType, url: record.source.url },
      symbol: record.symbol,
      commodity: record.commodity,
      rawValue: record.rawValue,
      rawUnit: record.rawUnit,
      rawCurrency: record.rawCurrency,
      observedAt: record.observedAt,
      delayType: record.delayType,
      delayMinutes: record.delayMinutes,
    });
    if (price === null) {
      withheld += 1; // incomplete disclosure → the value is withheld, never shown bare
      continue;
    }
    entries.push({ state: "current", price, freshness });
  }

  if (entries.length === 0) {
    return { status: "unavailable", unavailable: unavailable(withheld > 0 ? "incomplete_disclosure" : "no_observation", lastSuccessAt) };
  }

  const currentBenchmarks = entries.flatMap((entry) => (entry.state === "current" ? [entry.price] : []));
  const inPeriod = (differentials ?? []).filter((d) => isInEffectivePeriod(d, now));
  const basis: BasisBreakdown | null = currentBenchmarks.length > 0 && inPeriod.length > 0 ? { benchmarks: currentBenchmarks, components: inPeriod, explanatoryOnly: true } : null;

  return { status: "ready", entries, basis, readAt: snapshot.readAt };
}

/**
 * The contract Feature 002's public surface renders. Reads the licence-gated, cached benchmark snapshot and the
 * general-scope differentials (both public, anonymous, tag `reference-prices`), then builds the presentation.
 * Never throws: a failed read is the explicit `read_failed` unavailable state.
 */
export async function getReferencePresentation(scope: DifferentialScope = { kind: "general" }): Promise<ReferencePresentation> {
  const [snapshot, differentials] = await Promise.all([getReferenceBenchmarks(), getActiveDifferentials(scope)]);
  return buildReferencePresentation(snapshot, differentials, new Date());
}
