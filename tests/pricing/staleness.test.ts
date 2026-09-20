import { beforeEach, describe, expect, it, vi } from "vitest";

import { formatObservationInstant, resolveFreshness, unavailable } from "@/lib/pricing/freshness";
import { buildReferencePresentation } from "@/lib/pricing/presentation";
import { fetchBenchmarkSnapshot } from "@/lib/pricing/sources";

import { ALL_LICENCE_SOURCES, SOURCE_IDS, createFakePriceClient, observation, source } from "./fake-price-client";

/**
 * Feature 011 T017 / T004 (PS4, FR-005, FR-008, SC-004) — stale flags, absent observations and CACHED staleness all
 * render honestly. The cached-value case is the subtle one PX-05 warns about: a cache hit must never turn a stale value
 * into a current one, because the FACTS (`isStale`, `observedAt`, `readAt`) travel with the cached record and the
 * verdict is re-derived on every render.
 *
 * `next/cache` is replaced by a tag-aware memo so the accessor path (`getReferencePresentation`) can be exercised for
 * real: first call computes, later calls HIT the memo (even after the underlying data changed), and
 * `revalidateReferencePrices()` (→ `revalidateTag`) drops the tagged entries.
 */

const memo = vi.hoisted(() => ({ entries: new Map<string, unknown>(), tags: new Map<string, Set<string>>(), revalidated: [] as string[] }));
const fakeClientState = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[], options: { tags?: string[] }) => async (...args: unknown[]) => {
    const key = keyParts.join("|");
    if (memo.entries.has(key)) return memo.entries.get(key);
    // JSON round trip == what the real cache does to stored values (drops symbol keys, freezes the facts)
    const value = JSON.parse(JSON.stringify(await fn(...args)));
    memo.entries.set(key, value);
    for (const tag of options.tags ?? []) memo.tags.set(tag, (memo.tags.get(tag) ?? new Set()).add(key));
    return value;
  },
  revalidateTag: (tag: string) => {
    memo.revalidated.push(tag);
    for (const key of memo.tags.get(tag) ?? []) memo.entries.delete(key);
  },
}));
vi.mock("@/lib/public/supabase", () => ({ createPublicReadClient: () => fakeClientState.client }));

const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(() => {
  memo.entries.clear();
  memo.tags.clear();
  memo.revalidated.length = 0;
});

describe("T004 — freshness resolves from stored facts", () => {
  it("is_stale → stale, with the last successful observation carried; otherwise current", () => {
    expect(resolveFreshness({ observedAt: "2026-09-01T12:00:00Z", receivedAt: "2026-09-01T12:05:00Z", isStale: true })).toEqual({ state: "stale", observedAt: "2026-09-01T12:00:00Z", receivedAt: "2026-09-01T12:05:00Z", timeZone: "UTC", lastSuccessAt: "2026-09-01T12:00:00Z" });
    expect(resolveFreshness({ observedAt: "2026-09-01T12:00:00Z", isStale: false }).state).toBe("current");
    expect(resolveFreshness({ observedAt: "2026-09-01T12:00:00Z", isStale: false }).receivedAt).toBeNull();
  });

  it("invents NO age threshold: an old but un-flagged observation stays 'current' with its timestamp visible (no unapproved cut-off exists)", () => {
    expect(resolveFreshness({ observedAt: "2001-01-01T00:00:00Z", isStale: false }).state).toBe("current");
  });

  it("the unavailable shape has no value field and a distinct reason each", () => {
    for (const reason of ["no_approved_source", "no_observation", "incomplete_disclosure", "read_failed"] as const) {
      const shape = unavailable(reason);
      expect(shape).toEqual({ status: "unavailable", reason, lastSuccessAt: null, timeZone: "UTC" });
      expect(Object.keys(shape)).not.toContain("value");
      expect(Object.keys(shape)).not.toContain("rawValue");
    }
    expect(unavailable("no_observation", "2026-09-01T12:00:00Z").lastSuccessAt).toBe("2026-09-01T12:00:00Z");
  });

  it("timestamps render deterministically in UTC with the zone stated — and never as 'Invalid Date'", () => {
    expect(formatObservationInstant("2026-09-01T12:05:00Z")).toBe("2026-09-01 12:05 UTC");
    expect(formatObservationInstant("2026-09-01T23:59:00-05:00")).toBe("2026-09-02 04:59 UTC");
    expect(formatObservationInstant("nonsense")).toBeNull();
  });
});

describe("T017 — stale / absent / cached states render honestly", () => {
  const snapshotWith = (over: Record<string, unknown>) =>
    fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved, over)] }).client, "2026-09-20T11:00:00Z");

  it("a stale observation renders the STALE shape — no value field, last-success timestamp present", async () => {
    const presentation = buildReferencePresentation(await snapshotWith({ is_stale: true, raw_value: "250.125" }), [], NOW);
    expect(presentation.status).toBe("ready");
    if (presentation.status !== "ready") return;
    expect(presentation.entries).toHaveLength(1);
    const [entry] = presentation.entries;
    expect(entry.state).toBe("stale");
    if (entry.state === "stale") {
      expect(entry.stale.freshness.lastSuccessAt).toBe("2026-09-01T12:00:00+00:00");
      expect(JSON.stringify(entry)).not.toContain("250.125");
      expect(Object.keys(entry.stale)).not.toEqual(expect.arrayContaining(["rawValue"]));
    }
    // a stale-only presentation offers no basis (there is no current benchmark to explain)
    expect(presentation.basis).toBeNull();
  });

  it("no approved source → 'no_approved_source'; source without observations → 'no_observation' (distinct; nothing fabricated)", async () => {
    const none = await fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES.filter((s) => s.id !== SOURCE_IDS.approved), price_observations: [] }).client, "t");
    expect(buildReferencePresentation(none, [], NOW)).toEqual({ status: "unavailable", unavailable: unavailable("no_approved_source") });
    const noObs = await fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [] }).client, "t");
    expect(buildReferencePresentation(noObs, [], NOW)).toEqual({ status: "unavailable", unavailable: unavailable("no_observation") });
  });

  it("a read failure is 'read_failed' — never an empty widget", () => {
    expect(buildReferencePresentation(null, null, NOW)).toEqual({ status: "unavailable", unavailable: unavailable("read_failed") });
  });

  it("the most recent observation per (source, symbol) wins, with ITS OWN timestamp; other symbols are independent", async () => {
    const client = createFakePriceClient({
      price_sources: [source(SOURCE_IDS.approved)],
      price_observations: [
        observation(SOURCE_IDS.approved, { symbol: "KC", raw_value: "240.5", observed_at: "2026-08-31T12:00:00+00:00" }),
        observation(SOURCE_IDS.approved, { symbol: "KC", raw_value: "250.125", observed_at: "2026-09-01T12:00:00+00:00" }),
        observation(SOURCE_IDS.approved, { symbol: "RC", commodity_type: "ROBUSTA", raw_value: "4100", raw_unit: "USD/MT", observed_at: "2026-08-15T00:00:00+00:00" }),
      ],
    }).client;
    const snapshot = await fetchBenchmarkSnapshot(client, "t");
    expect(snapshot.records.map((r) => [r.symbol, r.rawValue, r.observedAt])).toEqual([
      ["KC", "250.125", "2026-09-01T12:00:00+00:00"],
      ["RC", "4100", "2026-08-15T00:00:00+00:00"],
    ]);
  });

  it("an observation of the exchange-rate or OTHER commodity type is never requested — and would be dropped if returned", async () => {
    const { client, calls } = createFakePriceClient({
      price_sources: [source(SOURCE_IDS.approved)],
      price_observations: [observation(SOURCE_IDS.approved, { symbol: "EURUSD", commodity_type: "FX", raw_value: "1.08" }), observation(SOURCE_IDS.approved, { symbol: "MISC", commodity_type: "OTHER" })],
    });
    const snapshot = await fetchBenchmarkSnapshot(client, "t");
    expect(snapshot.records).toEqual([]);
    expect(calls.find((c) => c.table === "price_observations")!.filters.join(" ")).toContain("in:commodity_type=[ARABICA,ROBUSTA,ICO_INDICATOR]");
  });

  it("CACHED: a cache HIT keeps reporting stale even after the underlying data changed (facts travel with the value)", async () => {
    const tables = { price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved, { is_stale: true })] as Record<string, unknown>[] };
    fakeClientState.client = createFakePriceClient(tables).client;
    const { getReferencePresentation } = await import("@/lib/pricing/presentation");

    const first = await getReferencePresentation();
    expect(first.status === "ready" && first.entries[0].state).toBe("stale");

    // The feed recovers in the database, but the cached entry is still served (TTL not elapsed):
    tables.price_observations[0].is_stale = false;
    const hit = await getReferencePresentation();
    expect(hit.status === "ready" && hit.entries[0].state, "a cache hit re-derives the SAME honest verdict from the cached facts").toBe("stale");
    if (hit.status === "ready" && first.status === "ready") expect(hit.readAt).toBe(first.readAt); // …and says when that entry was built
  });

  it("CACHED: the inverse — a value cached as current is never relabelled, and carries its observation timestamp with it", async () => {
    fakeClientState.client = createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved, { is_stale: false })] }).client;
    const { getReferencePresentation } = await import("@/lib/pricing/presentation");
    const presentation = await getReferencePresentation();
    expect(presentation.status).toBe("ready");
    if (presentation.status === "ready" && presentation.entries[0].state === "current") {
      expect(presentation.entries[0].price.observedAt).toBe("2026-09-01T12:00:00+00:00");
      expect(presentation.entries[0].freshness.state).toBe("current");
    }
  });

  it("CACHED: revalidateReferencePrices() invalidates the tag — the next read reflects the change (SC-006)", async () => {
    const tables = { price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved, { is_stale: true })] as Record<string, unknown>[] };
    fakeClientState.client = createFakePriceClient(tables).client;
    const { getReferencePresentation } = await import("@/lib/pricing/presentation");
    const { revalidateReferencePrices } = await import("@/lib/pricing/cache");

    expect((await getReferencePresentation()).status === "ready").toBe(true);
    tables.price_observations[0].is_stale = false;
    expect(revalidateReferencePrices()).toEqual(["reference-prices"]);
    expect(memo.revalidated).toEqual(["reference-prices"]);
    const after = await getReferencePresentation();
    expect(after.status === "ready" && after.entries[0].state).toBe("current");
  });

  it("CACHED: a licence revocation followed by revalidation removes the source from the surface (PS3 scenario 2)", async () => {
    const tables = { price_sources: [source(SOURCE_IDS.approved)] as Record<string, unknown>[], price_observations: [observation(SOURCE_IDS.approved)] };
    fakeClientState.client = createFakePriceClient(tables).client;
    const { getReferencePresentation } = await import("@/lib/pricing/presentation");
    const { revalidateReferencePrices } = await import("@/lib/pricing/cache");

    expect((await getReferencePresentation()).status).toBe("ready");
    tables.price_sources[0].licence_status = "RESTRICTED";
    revalidateReferencePrices();
    expect(await getReferencePresentation()).toEqual({ status: "unavailable", unavailable: unavailable("no_approved_source") });
  });

  it("FAILURES ARE NOT CACHED: a failed read yields read_failed, and the next call retries instead of serving a cached emptiness", async () => {
    fakeClientState.client = createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved)] }, { failTable: "price_sources" }).client;
    const { getReferencePresentation } = await import("@/lib/pricing/presentation");
    expect(await getReferencePresentation()).toEqual({ status: "unavailable", unavailable: unavailable("read_failed") });
    expect([...memo.entries.keys()].some((k) => k.startsWith("reference-price-benchmarks")), "the failed benchmark read was not stored").toBe(false);
    fakeClientState.client = createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved)] }).client;
    expect((await getReferencePresentation()).status).toBe("ready");
  });
});
