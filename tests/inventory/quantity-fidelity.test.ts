import { describe, expect, it, vi } from "vitest";

import { createFakeSupabaseClient } from "./fake-supabase";

const fakeClientState = vi.hoisted(() => ({ client: null as ReturnType<typeof createFakeSupabaseClient> | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!fakeClientState.client) throw new Error("test has no fake client installed");
    return fakeClientState.client;
  }),
}));

function withFakeTables(tables: Record<string, readonly unknown[]>) {
  fakeClientState.client = createFakeSupabaseClient(tables);
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
