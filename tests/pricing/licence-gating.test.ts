import { describe, expect, it } from "vitest";

import { fetchBenchmarkSnapshot, fetchObservationsForSource } from "@/lib/pricing/sources";
import { PRICE_SOURCE_LICENCE_STATUSES } from "@/lib/pricing/types";

import { ALL_LICENCE_SOURCES, ANON_RLS, SOURCE_IDS, createFakePriceClient, observation } from "./fake-price-client";

/**
 * Feature 011 T016 (PS3, FR-002, SEC-003, SC-003) — the licence gate, proven AT THE DATA LAYER.
 *
 * The fake client exposes EVERY row by default (what a platform administrator's session would see — the case where
 * RLS does not protect), so these tests can only pass if `lib/pricing/sources.ts` itself gates on
 * `licence_status = 'APPROVED'` AND `is_active`. A second block models the anonymous policies on top (belt and braces),
 * and a mutation block proves each of the layer's three defences is independently necessary.
 */

const OBS = [
  observation(SOURCE_IDS.approved, { symbol: "KC" }),
  observation(SOURCE_IDS.pending, { symbol: "KC", raw_value: "111.111" }),
  observation(SOURCE_IDS.restricted, { symbol: "KC", raw_value: "222.222" }),
  observation(SOURCE_IDS.disabled, { symbol: "KC", raw_value: "333.333" }),
  observation(SOURCE_IDS.inactive, { symbol: "KC", raw_value: "444.444" }),
];

describe("T016 — licence gating (all four licence statuses, plus inactive)", () => {
  it("covers exactly the four licence statuses the schema allows", () => {
    expect([...PRICE_SOURCE_LICENCE_STATUSES].sort()).toEqual(["APPROVED", "DISABLED", "PENDING", "RESTRICTED"]);
  });

  it("the benchmark snapshot contains ONLY the approved + active source, even when every row is visible", async () => {
    const { client } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    const snapshot = await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    expect(snapshot.approvedSourceCount).toBe(1);
    expect(snapshot.records.map((r) => r.sourceId)).toEqual([SOURCE_IDS.approved]);
    expect(snapshot.records.map((r) => r.rawValue)).toEqual(["250.125"]);
  });

  it.each([
    ["PENDING", SOURCE_IDS.pending],
    ["RESTRICTED", SOURCE_IDS.restricted],
    ["DISABLED", SOURCE_IDS.disabled],
    ["inactive but APPROVED", SOURCE_IDS.inactive],
  ])("a %s source returns NO observations even when requested BY ID", async (_label, id) => {
    const { client, calls } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    expect(await fetchObservationsForSource(client, id)).toEqual([]);
    // the observation table is never even queried for a gated source
    expect(calls.some((c) => c.table === "price_observations")).toBe(false);
  });

  it("the approved source requested by id returns its observation", async () => {
    const { client } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    const rows = await fetchObservationsForSource(client, SOURCE_IDS.approved);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sourceId: SOURCE_IDS.approved, rawValue: "250.125" });
  });

  it("an unknown id and a malformed id both yield nothing (no error, no query on a malformed id)", async () => {
    const { client, calls } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    expect(await fetchObservationsForSource(client, "99999999-0000-4000-8000-000000000009")).toEqual([]);
    const before = calls.length;
    expect(await fetchObservationsForSource(client, "not-a-uuid'; drop table price_sources;--")).toEqual([]);
    expect(calls.length).toBe(before);
  });

  it("every source query carries BOTH gate filters; observations are requested only for the ids that passed", async () => {
    const { client, calls } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    const sourceCall = calls.find((c) => c.table === "price_sources")!;
    expect(sourceCall.filters).toEqual(expect.arrayContaining(["eq:is_active=true", "eq:licence_status=APPROVED"]));
    const obsCall = calls.find((c) => c.table === "price_observations")!;
    expect(obsCall.filters).toContain(`in:price_source_id=[${SOURCE_IDS.approved}]`);
  });

  it("modelling the ANONYMOUS policies on top yields the same single approved source (RLS + query agree)", async () => {
    const { client } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS }, { rls: ANON_RLS });
    const snapshot = await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    expect(snapshot.records.map((r) => r.sourceId)).toEqual([SOURCE_IDS.approved]);
  });

  it("when NO source is approved the snapshot says so (approvedSourceCount 0) and no observation is queried", async () => {
    const { client, calls } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES.filter((s) => s.id !== SOURCE_IDS.approved), price_observations: OBS });
    const snapshot = await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    expect(snapshot).toEqual({ readAt: "2026-09-20T00:00:00Z", approvedSourceCount: 0, records: [] });
    expect(calls.some((c) => c.table === "price_observations")).toBe(false);
  });
});

describe("T016 — defence in depth: each layer is independently necessary", () => {
  it("LAYER 3: a source that slips past a dropped filter is still dropped by the mapper (the row's own licence/active columns are re-checked)", async () => {
    // Simulate a client that ignores filters entirely (e.g. a widened policy AND a dropped query filter).
    const rows = ALL_LICENCE_SOURCES;
    const ignoringFilters = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "is", "lte", "or", "order", "limit"]) builder[m] = () => builder;
        builder.maybeSingle = () => builder;
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "price_sources" ? rows : OBS, error: null }).then(resolve);
        return builder;
      },
    };
    const snapshot = await fetchBenchmarkSnapshot(ignoringFilters as never, "2026-09-20T00:00:00Z");
    expect(snapshot.approvedSourceCount).toBe(1);
    expect(snapshot.records.map((r) => r.sourceId)).toEqual([SOURCE_IDS.approved]);
  });

  it("an observation belonging to a non-approved source is dropped even if the observation query returns it", async () => {
    const leakyObservations = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "is", "lte", "or", "order", "limit"]) builder[m] = () => builder;
        builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "price_sources" ? [source1()] : OBS, error: null }).then(resolve);
        return builder;
      },
    };
    function source1() {
      return ALL_LICENCE_SOURCES[0];
    }
    const snapshot = await fetchBenchmarkSnapshot(leakyObservations as never, "2026-09-20T00:00:00Z");
    expect(snapshot.records.map((r) => r.sourceId)).toEqual([SOURCE_IDS.approved]);
  });

  it("a database error is a THROWN failure, never an empty (\"nothing exists\") result", async () => {
    const { client } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS }, { failTable: "price_sources" });
    await expect(fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z")).rejects.toThrow(/source read failed/);
    const { client: client2 } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS }, { failTable: "price_observations" });
    await expect(fetchBenchmarkSnapshot(client2, "2026-09-20T00:00:00Z")).rejects.toThrow(/observation read failed/);
  });

  it("selects an explicit column allowlist: no metadata, no created_by, no select-star", async () => {
    const { client, calls } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    for (const call of calls) {
      expect(call.columns, call.table).not.toBeNull();
      expect(call.columns).not.toMatch(/\*/);
      expect(call.columns).not.toMatch(/metadata|created_by/);
    }
  });

  it("no leaked internal field reaches a DTO (the fake returns metadata / created_by on every raw row)", async () => {
    const { client } = createFakePriceClient({ price_sources: ALL_LICENCE_SOURCES, price_observations: OBS });
    const snapshot = await fetchBenchmarkSnapshot(client, "2026-09-20T00:00:00Z");
    expect(JSON.stringify(snapshot)).not.toMatch(/should-never-leak|internal|created_by|metadata/);
  });
});
