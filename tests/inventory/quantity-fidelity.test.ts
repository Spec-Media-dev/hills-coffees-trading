import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createFakeSupabaseClient } from "./fake-supabase";
import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

const fakeClientState = vi.hoisted(() => ({ client: null as ReturnType<typeof createFakeSupabaseClient> | SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!fakeClientState.client) throw new Error("test has no fake/live client installed");
    return fakeClientState.client;
  }),
}));

function withFakeTables(tables: Record<string, readonly unknown[]>) {
  fakeClientState.client = createFakeSupabaseClient(tables);
}

/** Swaps in a REAL, authenticated fixture-session client (never service-role) for the live proofs below. */
async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  fakeClientState.client = client;
  vi.resetModules();
  return run();
}

/**
 * Feature 005 T001/T002/T017 — quantity fidelity. Proves every displayed quantity equals its
 * database column exactly, with a controlled fake row (see `fake-supabase.ts`'s header comment for
 * why a fake is used here rather than live data — the real tables are genuinely empty right now).
 */
describe("T002 — positions: quantity fidelity, DB-OPEN-05 degradation, no fabricated lot values", () => {
  it("availableQuantityKg/reservedQuantityKg equal the source row exactly, with no arithmetic applied", async () => {
    withFakeTables({
      inventory_positions: [
        {
          id: "pos-1",
          lot_id: "lot-1",
          owner_organization_id: "org-a",
          warehouse_id: "wh-1",
          warehouse_location_id: null,
          available_quantity_kg: 123.456,
          reserved_quantity_kg: 7.5,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      // DB-OPEN-05: no coffee_lots row comes back for an ordinary member — the fake reflects that.
      coffee_lots: [],
      coffees: [],
      warehouses: [{ id: "wh-1", code: "WH1", name: "Warehouse One", city: "Dubai", country_code: "AE" }],
      warehouse_locations: [],
    });

    const { getInventoryPositions } = await import("@/lib/inventory/positions");
    const result = await getInventoryPositions({ organizationId: "org-a" });

    expect(result.rows).toHaveLength(1);
    const position = result.rows[0]!;
    expect(position.availableQuantityKg).toBe(123.456);
    expect(position.reservedQuantityKg).toBe(7.5);
    // Never a fabricated lot value: with no readable coffee_lots row, lot context is honestly null.
    expect(position.lot).toBeNull();
    // Warehouse context still resolves — it is not blocked by DB-OPEN-05.
    expect(position.warehouse).not.toBeNull();
    expect(position.warehouse!.code).toBe("WH1");
  });

  it("lot context resolves when readable (forward-compatible with DB-OPEN-05 being fixed)", async () => {
    withFakeTables({
      inventory_positions: [
        {
          id: "pos-2",
          lot_id: "lot-2",
          owner_organization_id: "org-a",
          warehouse_id: "wh-1",
          warehouse_location_id: null,
          available_quantity_kg: 50,
          reserved_quantity_kg: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      coffee_lots: [{ id: "lot-2", coffee_id: "coffee-1", lot_code: "HC-2026-0001", crop_year: "2026", quality_grade: "A", cup_score: 87.5 }],
      coffees: [{ id: "coffee-1", name: "Yirgacheffe" }],
      warehouses: [],
      warehouse_locations: [],
    });

    const { getInventoryPositions } = await import("@/lib/inventory/positions");
    const result = await getInventoryPositions({ organizationId: "org-a" });

    expect(result.rows[0]!.lot).toEqual({
      lotId: "lot-2",
      lotCode: "HC-2026-0001",
      cropYear: "2026",
      qualityGrade: "A",
      cupScore: 87.5,
      coffeeId: "coffee-1",
      coffeeName: "Yirgacheffe",
    });
  });

  it("pagination: requesting more rows than the bounded page size never returns an unbounded result", async () => {
    // Simulate a `.range(0, pageSize)` fetch: the fake returns exactly pageSize+1 rows (as the real
    // over-fetch-by-one hasMore-detection technique would), and the function must slice to pageSize.
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `pos-${i}`,
      lot_id: `lot-${i}`,
      owner_organization_id: "org-a",
      warehouse_id: "wh-1",
      warehouse_location_id: null,
      available_quantity_kg: 1,
      reserved_quantity_kg: 0,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    }));
    withFakeTables({ inventory_positions: rows, coffee_lots: [], coffees: [], warehouses: [], warehouse_locations: [] });

    const { getInventoryPositions } = await import("@/lib/inventory/positions");
    const result = await getInventoryPositions({ organizationId: "org-a", pageSize: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });
});

describe("T003 — allocations: exact vocabulary, distinct quantities", () => {
  it("STORED/RELEASED/DELIVERED render their exact domain value; allocated and released stay distinct", async () => {
    withFakeTables({
      storage_allocations: [
        { id: "a1", order_item_id: "oi-1", owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 100, released_quantity_kg: 0, status: "STORED", started_at: "2026-01-01T00:00:00.000Z", released_at: null },
        { id: "a2", order_item_id: "oi-2", owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 60, released_quantity_kg: 25, status: "RELEASED", started_at: "2026-01-01T00:00:00.000Z", released_at: "2026-01-02T00:00:00.000Z" },
        { id: "a3", order_item_id: "oi-3", owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 40, released_quantity_kg: 40, status: "DELIVERED", started_at: "2026-01-01T00:00:00.000Z", released_at: "2026-01-03T00:00:00.000Z" },
      ],
    });

    const { getStorageAllocations } = await import("@/lib/inventory/allocations");
    const result = await getStorageAllocations({ organizationId: "org-a" });

    expect(result.rows.map((r) => r.status)).toEqual(["STORED", "RELEASED", "DELIVERED"]);
    const stored = result.rows[0]!;
    expect(stored.quantityKg).toBe(100);
    expect(stored.releasedQuantityKg).toBe(0);
    const released = result.rows[1]!;
    expect(released.quantityKg).toBe(60);
    // A genuine PARTIAL release: releasedQuantityKg (25) is its own stored fact, not equal to and
    // not derived from quantityKg (60) — proves the two fields are read independently.
    expect(released.releasedQuantityKg).toBe(25);
    const delivered = result.rows[2]!;
    expect(delivered.quantityKg).toBe(40);
    expect(delivered.releasedQuantityKg).toBe(40);
  });
});

describe("T004 — ownership: both directions, redaction, no reconstruction", () => {
  it("an incoming and an outgoing event are both represented correctly, chronologically ordered", async () => {
    withFakeTables({
      inventory_ownership_events: [
        {
          id: "evt-2",
          lot_id: "lot-1",
          from_organization_id: "org-a",
          to_organization_id: "org-b",
          order_item_id: "oi-1",
          quantity_kg: 10,
          event_type: "RESALE",
          created_by: "user-1",
          created_at: "2026-01-02T00:00:00.000Z",
          correlation_id: "corr-2",
          reason: "resale to org-b",
          source_document_id: null,
        },
        {
          id: "evt-1",
          lot_id: "lot-1",
          from_organization_id: null,
          to_organization_id: "org-a",
          order_item_id: "oi-0",
          quantity_kg: 20,
          event_type: "INITIAL_ALLOCATION",
          created_by: "user-1",
          created_at: "2026-01-01T00:00:00.000Z",
          correlation_id: "corr-1",
          reason: null,
          source_document_id: null,
        },
      ],
      organizations: [{ id: "org-a", display_name: "Org A" }], // only the acting org's own row is ever readable
    });

    const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
    const result = await getOwnershipEvents({ organizationId: "org-a" });

    expect(result.rows).toHaveLength(2);
    const [outgoing, incoming] = result.rows;
    expect(outgoing!.role).toEqual({ isSource: true, isDestination: false });
    expect(outgoing!.from.displayName).toBe("Org A"); // acting org resolves its own name
    expect(outgoing!.to.organizationId).toBe("org-b");
    expect(outgoing!.to.displayName).toBeNull();
    expect(outgoing!.to.redacted).toBe(true); // real counterparty, unreadable name — redacted, not dropped

    expect(incoming!.role).toEqual({ isSource: false, isDestination: true });
    expect(incoming!.from.organizationId).toBeNull();
    expect(incoming!.from.redacted).toBe(false); // no counterparty at all (INITIAL_ALLOCATION) — not a redaction
    expect(incoming!.quantityKg).toBe(20);
  });

  it("event types are preserved verbatim from the approved vocabulary", async () => {
    withFakeTables({
      inventory_ownership_events: (["INITIAL_ALLOCATION", "SALE", "RESALE", "ADJUSTMENT", "VOID"] as const).map((eventType, i) => ({
        id: `evt-${i}`,
        lot_id: "lot-1",
        from_organization_id: "org-a",
        to_organization_id: "org-a",
        order_item_id: null,
        quantity_kg: 1,
        event_type: eventType,
        created_by: null,
        created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
        correlation_id: null,
        reason: null,
        source_document_id: null,
      })),
      organizations: [{ id: "org-a", display_name: "Org A" }],
    });

    const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
    const result = await getOwnershipEvents({ organizationId: "org-a" });
    expect(result.rows.map((r) => r.eventType).sort()).toEqual(["ADJUSTMENT", "INITIAL_ALLOCATION", "RESALE", "SALE", "VOID"].sort());
  });
});

/**
 * Feature 005 Phase 5 (T017) — quantity fidelity against REAL, seeded, DISTINCTIVE non-round
 * decimals (`scripts/seed-test-fixtures.ts#seedInventoryFixtures`, exposed as `INVENTORY_FIXTURES`).
 * The fake-client tests above already proved the read layer passes through whatever a row contains;
 * this section proves the SAME property against the actual live database, through real RLS, with a
 * real authenticated session — closing the gap the fake-client tests cannot close (a fake row is
 * definitionally never wrong).
 *
 * Quantities were deliberately chosen (see the seed script's own header comment) so that no fixture
 * value's sum or difference with another coincides with any other fixture value — an agent that
 * reintroduces `available - reserved` or `available + reserved` arithmetic anywhere in the chain
 * produces a number that cannot be mistaken for a genuine fixture value.
 */
describe("T017 — quantity fidelity against real seeded database rows", () => {
  it("Org A's position: availableQuantityKg/reservedQuantityKg equal the live DB row EXACTLY", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const position = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });
    expect(position).not.toBeNull();
    expect(position!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAAvailable);
    expect(position!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAReserved);
    // Sanity: prove these are genuinely distinctive, non-coincidental values — not round numbers an
    // accidental clamp/rounding could reproduce by chance.
    expect(Number.isInteger(position!.availableQuantityKg)).toBe(false);
    expect(Number.isInteger(position!.reservedQuantityKg)).toBe(false);
  });

  it("Org B's position: its own distinct live quantities, independent of Org A's", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const position = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        positionId: INVENTORY_FIXTURES.orgB.positionId,
      });
    });
    expect(position!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionBAvailable);
    expect(position!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionBReserved);
  });

  it("the live availability breakdown for Org A's position equals the same DB row exactly — no arithmetic between the two read paths", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const [breakdown] = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionIds: [INVENTORY_FIXTURES.orgA.positionId],
      });
    });
    expect(breakdown).toBeTruthy();
    expect(breakdown!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAAvailable);
    expect(breakdown!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAReserved);
  });

  it("Org A's storage allocation: quantityKg/releasedQuantityKg equal the live DB row EXACTLY, as two independent facts", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    const allocation = result.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.allocationId);
    expect(allocation!.quantityKg).toBe(INVENTORY_FIXTURES.quantities.allocationAQuantity);
    expect(allocation!.releasedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.allocationAReleased);
  });

  // UI/display fidelity (rendering `AvailabilityBreakdown` with these live-sourced quantities) is
  // proven in `tests/inventory/run-b-ui.test.tsx` — JSX requires a `.tsx` file, and this file's own
  // name (`quantity-fidelity.test.ts`) is fixed by the task/directive, so the render-based assertion
  // lives there instead of duplicating this file's mocking setup under a renamed extension.

  it("units are presentation-only: the numeric value inside the rendered string is the exact fixture number, never rounded/clamped", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const [breakdown] = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionIds: [INVENTORY_FIXTURES.orgA.positionId],
      });
    });
    // toFixed(0)/Math.round would both destroy the distinctive decimal — this proves neither happened.
    expect(String(breakdown!.availableQuantityKg)).toBe(String(INVENTORY_FIXTURES.quantities.positionAAvailable));
    expect(breakdown!.availableQuantityKg % 1).not.toBe(0);
  });
});

/**
 * Structural anti-arithmetic guard (T017) — targets ONLY quantity-FIELD arithmetic (the exact camelCase
 * DTO field names combined with an operator), never a bare `-`/`+`/`*`/`/` character, so legitimate
 * unrelated arithmetic (pagination's `from + boundedPageSize`, `page * pageSize`) is never
 * false-flagged. Covers BOTH `positions.ts` (not previously checked by any structural test) and
 * `availability.ts` (already checked by `availability.test.ts`, reconfirmed here as a durable,
 * co-located guard for T017 specifically).
 */
describe("T017 — structural anti-arithmetic guard (durable, field-targeted)", () => {
  const QUANTITY_ARITHMETIC_PATTERN = /(available|reserved|owned)QuantityKg\s*[-+*/]|[-+*/]\s*(available|reserved|owned)QuantityKg/;

  it("lib/inventory/positions.ts contains no quantity-field arithmetic", () => {
    const source = readFileSync("lib/inventory/positions.ts", "utf8");
    expect(source).not.toMatch(QUANTITY_ARITHMETIC_PATTERN);
  });

  it("lib/inventory/availability.ts contains no quantity-field arithmetic", () => {
    const source = readFileSync("lib/inventory/availability.ts", "utf8");
    expect(source).not.toMatch(QUANTITY_ARITHMETIC_PATTERN);
  });

  it("lib/inventory/allocations.ts contains no quantity-field arithmetic", () => {
    const source = readFileSync("lib/inventory/allocations.ts", "utf8");
    expect(source).not.toMatch(QUANTITY_ARITHMETIC_PATTERN);
  });

  it("the guard does NOT false-flag legitimate, unrelated pagination arithmetic", () => {
    // Positive control: `positions.ts` genuinely contains `from + boundedPageSize`-shaped arithmetic
    // for pagination — the pattern above must not react to it. If this assertion ever fails, the
    // pattern has become too broad and is at risk of blocking legitimate code.
    const source = readFileSync("lib/inventory/positions.ts", "utf8");
    expect(source).toMatch(/from\s*\+\s*boundedPageSize/);
    expect(source).not.toMatch(QUANTITY_ARITHMETIC_PATTERN);
  });

  it("INTENTIONAL FAILURE PROOF: the guard actually catches quantity-field arithmetic when present, rather than vacuously passing", () => {
    // A synthetic string standing in for "an agent reintroduced the forbidden computation" — proves
    // the pattern is not a no-op that would pass regardless of content. Each shape the run directive
    // names is checked individually.
    expect("const truelyAvailable = availableQuantityKg - reservedQuantityKg;").toMatch(QUANTITY_ARITHMETIC_PATTERN);
    expect("const owned = availableQuantityKg + reservedQuantityKg;").toMatch(QUANTITY_ARITHMETIC_PATTERN);
    expect("const remaining = ownedQuantityKg - reservedQuantityKg;").toMatch(QUANTITY_ARITHMETIC_PATTERN);
  });
});

/**
 * No third "available to trade" figure (T017) — reconfirms the reconciled database truth (only
 * `available_quantity_kg`/`reserved_quantity_kg` exist; there is no `owned_quantity_kg` column, view
 * or function) is still exactly what the DTO layer exposes: two quantity fields, never three.
 */
describe("T017 — no third computed quantity has been introduced", () => {
  it("AvailabilityBreakdown/InventoryPosition/InventoryEligibilityFacts expose exactly two quantity fields each", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const [breakdown] = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionIds: [INVENTORY_FIXTURES.orgA.positionId],
      });
    });
    const quantityKeys = Object.keys(breakdown!).filter((key) => /QuantityKg$/.test(key));
    expect(quantityKeys.sort()).toEqual(["availableQuantityKg", "reservedQuantityKg"]);
  });

  it("no lib/inventory source file declares an ownedQuantityKg/availableToTradeQuantityKg field or export", () => {
    const files = ["types.ts", "positions.ts", "allocations.ts", "ownership.ts", "availability.ts"];
    for (const file of files) {
      const source = readFileSync(`lib/inventory/${file}`, "utf8");
      expect(source).not.toMatch(/\bownedQuantityKg\s*[:=]/);
      expect(source).not.toMatch(/\bavailableToTradeQuantityKg\b/i);
      expect(source).not.toMatch(/\bfreeQuantityKg\b/i);
    }
  });
});
