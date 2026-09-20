import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { newCacheStamp, type CacheStamp, type Stamped } from "@/lib/public/cache";
import { createPublicReadClient } from "@/lib/public/supabase";

import { REFERENCE_PRICES_REVALIDATE_SECONDS, TAG_REFERENCE_PRICES } from "./cache";
import { REFERENCE_COMMODITIES } from "./types";

/**
 * Feature 011 licence-gated source & observation reads (T003 — FR-002, FR-007, SEC-002, SEC-003, SC-003).
 *
 * THE LICENCE GATE LIVES HERE, IN THE DATA LAYER — NEVER ONLY IN THE UI. Displaying unlicensed market data is a
 * legal exposure, so the UI never receives an unlicensed observation to hide. Three independent layers:
 *
 *   1. RLS (`price_sources_public_read`: `is_active AND licence_status = 'APPROVED'`; `price_observations_public_read`:
 *      only via such a source). The anonymous key can read nothing else — once the DB-BLOCK-10 remainder migration
 *      (`20260920160000_feature_011_db_block_10_price_policy_scope.sql`) lets the anonymous role evaluate the policies at
 *      all.
 *   2. The query itself: `.eq("is_active", true).eq("licence_status", "APPROVED")` on every source read, and
 *      observations are requested ONLY for the ids of sources that passed. This is what keeps the gate in force even
 *      for a privileged session (a platform administrator's RLS sees every source, including PENDING/RESTRICTED/DISABLED).
 *   3. The mapper re-checks the returned `licence_status` / `is_active` columns and drops anything that is not
 *      approved + active — so even a dropped filter or a widened policy cannot leak a row into a DTO.
 *
 * "REQUESTED BY ID" (Verify): `fetchObservationsForSource` first resolves the source THROUGH THE SAME GATE; if the
 * source is PENDING / RESTRICTED / DISABLED / inactive (or does not exist) it returns nothing without ever querying
 * `price_observations` for it.
 *
 * ANONYMOUS, SESSION-FREE (SEC-002): reads use `createPublicReadClient()` — the anon key, no cookies, no service
 * role — so a cached entry is provably identical for every visitor. Explicit column allowlists; `metadata` (free-form
 * jsonb) and `created_by` are never selected.
 *
 * EXACT VALUES (FR-006): `raw_value` is requested as text (`raw_value::text`) so the stored decimal reaches the
 * DTO digit-for-digit — no float parse, no rounding, no arithmetic. Units and currency are carried verbatim.
 * There is no currency or unit transformation anywhere in this layer (DB-OPEN-08 — no approved exchange-rate storage).
 *
 * WHAT IS DISPLAYABLE: coffee benchmarks only (`REFERENCE_COMMODITIES`). Rows of any other commodity type are not
 * requested at all.
 *
 * FAILURES DO NOT POISON THE CACHE: a failed read throws inside the cached function (`unstable_cache` never stores a
 * thrown result); the public accessor turns that into `null` so the caller renders the honest "unavailable" state
 * instead of an error screen or, worse, a cached emptiness.
 */

// ── DTOs ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** One latest observation of one (source, symbol), with everything a later disclosure needs. JSON-safe. */
export type BenchmarkRecord = {
  readonly sourceId: string;
  readonly source: { readonly name: string; readonly code: string; readonly sourceType: string; readonly url: string | null };
  readonly symbol: string;
  readonly commodity: string;
  /** Exact decimal text of `raw_value`. */
  readonly rawValue: string;
  readonly rawUnit: string;
  readonly rawCurrency: string;
  readonly observedAt: string;
  readonly receivedAt: string;
  readonly isStale: boolean;
  readonly delayType: string;
  readonly delayMinutes: number | null;
};

/** What the cache holds. `readAt` is when THIS entry was actually built — freshness metadata travels with it. */
export type BenchmarkSnapshot = {
  readonly readAt: string;
  /** How many approved, active sources exist (so "no source" and "no observation" stay distinguishable). */
  readonly approvedSourceCount: number;
  readonly records: readonly BenchmarkRecord[];
};

// ── column allowlists & row shapes ──────────────────────────────────────────────────────────────────────────────

const SOURCE_COLUMNS = "id, name, code, source_type, source_url, licence_status, delay_type, delay_minutes, is_active";
const OBSERVATION_COLUMNS = "id, price_source_id, symbol, commodity_type, raw_value::text, raw_currency, raw_unit, observed_at, received_at, is_stale";

/** The only licence state that may ever be displayed, and the only activity state that goes with it. */
const APPROVED = "APPROVED";

/** A generous ceiling on rows fetched for "latest per (source, symbol)"; bounded so a large history cannot blow up a read. */
const OBSERVATION_FETCH_LIMIT = 500;

type SourceRow = {
  id: string;
  name: string;
  code: string;
  source_type: string;
  source_url: string | null;
  licence_status: string;
  delay_type: string;
  delay_minutes: number | null;
  is_active: boolean;
};

type ObservationRow = {
  id: string;
  price_source_id: string;
  symbol: string;
  commodity_type: string;
  raw_value: string | number;
  raw_currency: string;
  raw_unit: string;
  observed_at: string;
  received_at: string;
  is_stale: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Layer 3 of the licence gate: an approved, active source — checked on the rows themselves, not on a filter. */
function isDisplayableSource(row: SourceRow): boolean {
  return row.licence_status === APPROVED && row.is_active === true;
}

/** The exact stored decimal. A number from a fake/legacy client is stringified; a text cast is passed through. */
function decimalText(value: string | number): string {
  return typeof value === "number" ? String(value) : value;
}

const isDisplayableCommodity = (value: string): boolean => (REFERENCE_COMMODITIES as readonly string[]).includes(value);

const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

// ── uncached fetchers ───────────────────────────────────────────────────────────────────────────────────────────

async function fetchApprovedSources(client: SupabaseClient): Promise<SourceRow[]> {
  const { data, error } = await client
    .from("price_sources")
    .select(SOURCE_COLUMNS)
    .eq("is_active", true)
    .eq("licence_status", APPROVED)
    .order("name", { ascending: true });
  if (error) throw new Error("Reference price source read failed.");
  // Layer 3 — never trust the filter alone.
  return ((data ?? []) as unknown as SourceRow[]).filter(isDisplayableSource);
}

function toRecord(source: SourceRow, row: ObservationRow): BenchmarkRecord {
  return {
    sourceId: source.id,
    source: { name: source.name, code: source.code, sourceType: source.source_type, url: source.source_url },
    symbol: row.symbol,
    commodity: row.commodity_type,
    rawValue: decimalText(row.raw_value),
    rawUnit: row.raw_unit,
    rawCurrency: row.raw_currency,
    observedAt: row.observed_at,
    receivedAt: row.received_at,
    isStale: row.is_stale === true,
    delayType: source.delay_type,
    delayMinutes: source.delay_minutes,
  };
}

/** Latest observation per (source, symbol) — "the most recent valid one is used, with its own timestamp" (spec edge case). */
function latestPerSourceAndSymbol(sources: readonly SourceRow[], rows: readonly ObservationRow[]): BenchmarkRecord[] {
  const bySource = new Map(sources.map((s) => [s.id, s]));
  const best = new Map<string, ObservationRow>();
  for (const row of rows) {
    if (!bySource.has(row.price_source_id)) continue; // an observation of a source that did not pass the gate is dropped
    if (!isDisplayableCommodity(row.commodity_type)) continue;
    const key = `${row.price_source_id}\u0000${row.symbol}`;
    const current = best.get(key);
    if (!current || timeOf(row.observed_at) > timeOf(current.observed_at) || (timeOf(row.observed_at) === timeOf(current.observed_at) && timeOf(row.received_at) > timeOf(current.received_at))) {
      best.set(key, row);
    }
  }
  return [...best.values()]
    .map((row) => toRecord(bySource.get(row.price_source_id)!, row))
    .sort((a, b) => a.source.name.localeCompare(b.source.name) || a.symbol.localeCompare(b.symbol));
}

/**
 * The full snapshot: approved + active sources, and the latest coffee-benchmark observation per (source, symbol)
 * for THOSE sources only. Throws on any database error (never returns a partial or empty result for a failure).
 */
export async function fetchBenchmarkSnapshot(client: SupabaseClient, readAt: string): Promise<BenchmarkSnapshot> {
  const sources = await fetchApprovedSources(client);
  if (sources.length === 0) return { readAt, approvedSourceCount: 0, records: [] };

  const { data, error } = await client
    .from("price_observations")
    .select(OBSERVATION_COLUMNS)
    .in("price_source_id", sources.map((s) => s.id))
    .in("commodity_type", [...REFERENCE_COMMODITIES])
    .order("observed_at", { ascending: false })
    .limit(OBSERVATION_FETCH_LIMIT);
  if (error) throw new Error("Reference price observation read failed.");

  return { readAt, approvedSourceCount: sources.length, records: latestPerSourceAndSymbol(sources, (data ?? []) as unknown as ObservationRow[]) };
}

/**
 * Observations for ONE source requested by id — the gate applies first (T003 Verify). A source that is PENDING,
 * RESTRICTED, DISABLED, inactive or unknown yields `[]` and `price_observations` is never queried for it.
 */
export async function fetchObservationsForSource(client: SupabaseClient, sourceId: string): Promise<BenchmarkRecord[]> {
  if (!UUID.test(sourceId)) return [];
  const { data: sourceData, error: sourceError } = await client
    .from("price_sources")
    .select(SOURCE_COLUMNS)
    .eq("id", sourceId)
    .eq("is_active", true)
    .eq("licence_status", APPROVED)
    .maybeSingle();
  if (sourceError) throw new Error("Reference price source read failed.");
  const source = sourceData as unknown as SourceRow | null;
  if (!source || !isDisplayableSource(source)) return [];

  const { data, error } = await client
    .from("price_observations")
    .select(OBSERVATION_COLUMNS)
    .eq("price_source_id", source.id)
    .in("commodity_type", [...REFERENCE_COMMODITIES])
    .order("observed_at", { ascending: false })
    .limit(OBSERVATION_FETCH_LIMIT);
  if (error) throw new Error("Reference price observation read failed.");
  return latestPerSourceAndSymbol([source], (data ?? []) as unknown as ObservationRow[]);
}

// ── cached entries (Feature 001's pinned API, unchanged; the tag is registered in the cache-policy contract) ────────

const cachedBenchmarkSnapshot = unstable_cache(
  async (): Promise<Stamped<BenchmarkSnapshot>> => {
    const stamp = newCacheStamp();
    return { stamp, value: await fetchBenchmarkSnapshot(createPublicReadClient(), stamp.computedAt) };
  },
  ["reference-price-benchmarks"],
  { tags: [TAG_REFERENCE_PRICES], revalidate: REFERENCE_PRICES_REVALIDATE_SECONDS }
);

function cachedSourceObservations(sourceId: string) {
  return unstable_cache(
    async (): Promise<Stamped<BenchmarkRecord[]>> => ({ stamp: newCacheStamp(), value: await fetchObservationsForSource(createPublicReadClient(), sourceId) }),
    ["reference-price-source-observations", sourceId],
    { tags: [TAG_REFERENCE_PRICES], revalidate: REFERENCE_PRICES_REVALIDATE_SECONDS }
  );
}

// ── public API ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The licence-gated benchmark snapshot, or `null` when the read failed. `null` ≠ "empty": callers must present the
 * distinct `read_failed` unavailable state, never an empty widget that reads as "nothing exists".
 */
export async function getReferenceBenchmarks(): Promise<BenchmarkSnapshot | null> {
  try {
    return (await cachedBenchmarkSnapshot()).value;
  } catch {
    return null;
  }
}

/** Observations for one source; `[]` unless it is approved + active. `null` when the read failed. */
export async function getReferenceObservationsForSource(sourceId: string): Promise<BenchmarkRecord[] | null> {
  try {
    return (await cachedSourceObservations(sourceId)()).value;
  } catch {
    return null;
  }
}

// ── test-only accessors (cache contract §5.2) ───────────────────────────────────────────────────────────────────

/** The provenance stamp of the benchmark cache entry. TEST/DIAGNOSTIC ONLY. */
export async function __readReferenceBenchmarksCacheStamp(): Promise<CacheStamp> {
  return (await cachedBenchmarkSnapshot()).stamp;
}
