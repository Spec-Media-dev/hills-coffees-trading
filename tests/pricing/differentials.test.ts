import { describe, expect, it } from "vitest";

import { fetchActiveDifferentials, isInEffectivePeriod } from "@/lib/pricing/differentials";
import { buildReferencePresentation } from "@/lib/pricing/presentation";
import { fetchBenchmarkSnapshot } from "@/lib/pricing/sources";

import { ANON_RLS, SOURCE_IDS, createFakePriceClient, observation, source } from "./fake-price-client";

/**
 * Feature 011 T005 / T010 (PS5, FR-010) — active, in-period differentials with type, amount, currency, unit and
 * effective period; expired / inactive / not-yet-effective / lot-scoped ones are excluded; nothing is summed.
 */

const NOW = new Date("2026-09-20T12:00:00Z");
const diff = (over: Record<string, unknown> = {}) => ({
  differential_type: "ORIGIN",
  amount: "12.50",
  currency: "USD",
  unit: "KG",
  effective_from: "2026-08-01T00:00:00+00:00",
  effective_until: null,
  is_active: true,
  lot_id: null,
  coffee_id: null,
  origin_id: null,
  notes: "internal note that must never be published",
  created_by: "should-never-leak",
  ...over,
});

const run = (rows: Record<string, unknown>[], scope: Parameters<typeof fetchActiveDifferentials>[1] = { kind: "general" }, options = {}) => {
  const { client, calls } = createFakePriceClient({ price_differentials: rows }, options);
  return fetchActiveDifferentials(client, scope, NOW).then((records) => ({ records, calls }));
};

describe("T005 — differentials: active + in-period only, all five attributes", () => {
  it("returns type, amount, currency, unit and the effective period — exactly as stored — and nothing else", async () => {
    const { records } = await run([diff({ effective_until: "2026-12-31T00:00:00+00:00" })]);
    expect(records).toEqual([{ type: "ORIGIN", amount: "12.50", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00+00:00", effectiveUntil: "2026-12-31T00:00:00+00:00" }]);
    for (const key of ["type", "amount", "currency", "unit", "effectiveFrom", "effectiveUntil"]) expect(records[0]).toHaveProperty(key);
    expect(JSON.stringify(records)).not.toMatch(/internal note|should-never-leak|notes|created_by|lot_id|coffee_id/);
  });

  it("the amount keeps its trailing zero and digits (text, not a float): 12.50 stays 12.50, 0.10 stays 0.10", async () => {
    const { records } = await run([diff({ amount: "0.10" }), diff({ amount: "12.50", differential_type: "QUALITY" })]);
    expect(records.map((r) => r.amount).sort()).toEqual(["0.10", "12.50"]);
  });

  it("excludes inactive, expired and not-yet-effective differentials", async () => {
    const { records } = await run([
      diff({ differential_type: "ORIGIN" }),
      diff({ differential_type: "QUALITY", is_active: false }),
      diff({ differential_type: "CROP", effective_until: "2026-09-01T00:00:00+00:00" }), // expired
      diff({ differential_type: "COMMERCIAL", effective_from: "2026-10-01T00:00:00+00:00" }), // not yet effective
      diff({ differential_type: "CERTIFICATION", effective_until: "2026-09-20T12:00:00+00:00" }), // ends exactly now → excluded (until > now required)
    ]);
    expect(records.map((r) => r.type)).toEqual(["ORIGIN"]);
  });

  it("the period is checked in the QUERY and again on the rows (a client that ignores filters still yields only in-period rows)", async () => {
    const ignoring = { from: () => { const b: Record<string, unknown> = {}; for (const m of ["select", "eq", "in", "is", "lte", "or", "order", "limit"]) b[m] = () => b; b.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [diff(), diff({ is_active: false }), diff({ lot_id: "some-lot" }), diff({ effective_until: "2026-09-01T00:00:00+00:00" }), diff({ differential_type: "MYSTERY" })], error: null }).then(r); return b; } };
    const records = await fetchActiveDifferentials(ignoring as never, { kind: "general" }, NOW);
    expect(records).toHaveLength(1);
  });

  it("LOT-scoped differentials are never published (a lot identity is private)", async () => {
    const { records, calls } = await run([diff({ lot_id: "22222222-0000-4000-8000-000000000001" })]);
    expect(records).toEqual([]);
    expect(calls[0].filters).toContain("is:lot_id=null");
  });

  it("general scope means NO coffee and NO origin: a coffee- or origin-specific differential is not shown as general", async () => {
    const { records, calls } = await run([diff({ coffee_id: "c1" }), diff({ origin_id: "o1", differential_type: "QUALITY" }), diff({ differential_type: "CROP" })]);
    expect(records.map((r) => r.type)).toEqual(["CROP"]);
    expect(calls[0].filters).toEqual(expect.arrayContaining(["is:coffee_id=null", "is:origin_id=null", "eq:is_active=true"]));
  });

  it("coffee / origin scope filters by SLUG through an inner join (never by an internal id) and rejects a malformed slug without querying", async () => {
    const { records, calls } = await run([diff({ coffees: { slug: "kenya-aa" } }), diff({ coffees: { slug: "other" }, differential_type: "QUALITY" })], { kind: "coffee", slug: "kenya-aa" });
    expect(records.map((r) => r.type)).toEqual(["ORIGIN"]);
    expect(calls[0].columns).toContain("coffees!inner");
    expect(calls[0].filters).toContain("eq:coffees.slug=kenya-aa");
    const origin = await run([diff({ origins: { slug: "ethiopia" } })], { kind: "origin", slug: "ethiopia" });
    expect(origin.records).toHaveLength(1);
    expect(origin.calls[0].filters).toContain("eq:origins.slug=ethiopia");
    const bad = await run([diff()], { kind: "coffee", slug: "x'; drop--" });
    expect(bad.records).toEqual([]);
    expect(bad.calls).toHaveLength(0);
  });

  it("selects an explicit allowlist (no notes, no ids, no audit columns, no select-star) and throws on a database error", async () => {
    const { calls } = await run([diff()]);
    expect(calls[0].columns).not.toMatch(/\*|notes|created_by|created_at|updated_at|\bid\b/);
    await expect(run([diff()], { kind: "general" }, { failTable: "price_differentials" })).rejects.toThrow(/differential read failed/);
  });

  it("modelling the anonymous policy (is_active) on top changes nothing", async () => {
    const { records } = await run([diff(), diff({ is_active: false })], { kind: "general" }, { rls: ANON_RLS });
    expect(records).toHaveLength(1);
  });

  it("isInEffectivePeriod: boundaries", () => {
    expect(isInEffectivePeriod({ effectiveFrom: "2026-09-20T12:00:00Z", effectiveUntil: null }, NOW)).toBe(true); // starts exactly now → effective
    expect(isInEffectivePeriod({ effectiveFrom: "2026-09-20T12:00:01Z", effectiveUntil: null }, NOW)).toBe(false);
    expect(isInEffectivePeriod({ effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: "2026-09-20T12:00:00Z" }, NOW)).toBe(false);
    expect(isInEffectivePeriod({ effectiveFrom: "garbage", effectiveUntil: null }, NOW)).toBe(false);
  });
});

describe("T010 — the basis is composed from stored inputs only, and is never a total", () => {
  const snapshot = () => fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved)] }).client, "2026-09-20T11:00:00Z");
  const records = [
    { type: "ORIGIN" as const, amount: "12.5", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null },
    { type: "QUALITY" as const, amount: "0.75", currency: "USD", unit: "KG", effectiveFrom: "2026-08-01T00:00:00Z", effectiveUntil: null },
  ];

  it("benchmark + differentials → a basis marked explanatory; the components are exactly the stored ones", async () => {
    const presentation = buildReferencePresentation(await snapshot(), records, NOW);
    expect(presentation.status === "ready" && presentation.basis?.explanatoryOnly).toBe(true);
    if (presentation.status === "ready") {
      expect(presentation.basis?.components).toEqual(records);
      expect(presentation.basis?.benchmarks).toHaveLength(1);
      expect(Object.keys(presentation.basis ?? {}).sort()).toEqual(["benchmarks", "components", "explanatoryOnly"]);
    }
  });

  it("NEVER a sum: no total, netted or converted amount exists anywhere in the presentation object", async () => {
    const presentation = buildReferencePresentation(await snapshot(), records, NOW);
    const text = JSON.stringify(presentation);
    expect(text).not.toContain("13.25");
    expect(text).not.toMatch(/total|sum|net|converted/i);
  });

  it("re-checks each period at render time: a cached differential that has since expired is dropped", async () => {
    const expired = { ...records[0], effectiveUntil: "2026-09-20T00:00:00Z" };
    const presentation = buildReferencePresentation(await snapshot(), [expired], NOW);
    expect(presentation.status === "ready" && presentation.basis).toBeNull();
  });

  it("no differentials, a failed differential read, or no CURRENT benchmark → no basis (never guessed), benchmarks still shown", async () => {
    const snap = await snapshot();
    for (const diffs of [[], null]) {
      const presentation = buildReferencePresentation(snap, diffs, NOW);
      expect(presentation.status).toBe("ready");
      if (presentation.status === "ready") expect(presentation.basis).toBeNull();
    }
    const staleSnap = await fetchBenchmarkSnapshot(createFakePriceClient({ price_sources: [source(SOURCE_IDS.approved)], price_observations: [observation(SOURCE_IDS.approved, { is_stale: true })] }).client, "t");
    const stalePresentation = buildReferencePresentation(staleSnap, records, NOW);
    expect(stalePresentation.status === "ready" && stalePresentation.basis).toBeNull();
  });
});
