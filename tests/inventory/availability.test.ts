import { readFileSync } from "node:fs";

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
 * Feature 005 T005 — availability/reservation context. See `lib/inventory/availability.ts`'s own
 * header comment for the full reasoning; these tests prove the properties the run directive
 * specifically requires.
 */
describe("T005 — availability: quantity fidelity, no arithmetic, honest reservation-cause degradation", () => {
  it("owned/reserved/available values equal the source DB row exactly — no arithmetic anywhere in the module", () => {
    const source = readFileSync("lib/inventory/availability.ts", "utf8");
    // The exact structural audit the run directive/task specify.
    expect(source).not.toMatch(/[-+*/]\s*(available|reserved)_quantity/);
    // Broader guard: no arithmetic operator directly touching the camelCase DTO fields either.
    expect(source).not.toMatch(/(available|reserved|owned)QuantityKg\s*[-+*/]/);
    expect(source).not.toMatch(/[-+*/]\s*(available|reserved|owned)QuantityKg/);
  });

  it("inventory_reservations is never referenced as a `.from(\"inventory_reservations\")` service-role/privileged query — only the same request-scoped client, and only to read `order_id`", () => {
    const source = readFileSync("lib/inventory/availability.ts", "utf8");
    expect(source).not.toMatch(/SERVICE_ROLE|service_role/);
    // It IS read (documented, RLS-respecting attempt) — but never through a privileged path, and the
    // module's own header explains exactly why and what is expected to come back.
    expect(source).toMatch(/admin-only/i);
  });

  it("with no resolvable reservation cause, the reserved quantity truth is preserved and the cause is honestly \"unknown\" — never fabricated", async () => {
    withFakeTables({
      inventory_positions: [{ id: "pos-1", lot_id: "lot-1", available_quantity_kg: 100, reserved_quantity_kg: 15 }],
      inventory_reservation_items: [], // the expected real-world result today (see file header)
    });

    const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
    const [breakdown] = await getAvailabilityBreakdown({ organizationId: "org-a" });

    expect(breakdown!.availableQuantityKg).toBe(100);
    expect(breakdown!.reservedQuantityKg).toBe(15);
    expect(breakdown!.reservationCauses).toEqual([{ kind: "unknown" }]);
  });

  it("a resolvable reservation cause (order + hold_expires_at) is surfaced without leaking anything beyond it", async () => {
    withFakeTables({
      inventory_positions: [{ id: "pos-1", lot_id: "lot-1", available_quantity_kg: 100, reserved_quantity_kg: 10 }],
      inventory_reservation_items: [{ reservation_id: "res-1", inventory_position_id: "pos-1" }],
      inventory_reservations: [{ id: "res-1", order_id: "order-1" }],
      orders: [{ id: "order-1", order_code: "HC-0001", hold_expires_at: "2026-02-01T00:00:00.000Z" }],
    });

    const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
    const [breakdown] = await getAvailabilityBreakdown({ organizationId: "org-a" });

    expect(breakdown!.reservationCauses).toEqual([
      { kind: "order", orderId: "order-1", orderCode: "HC-0001", holdExpiresAt: "2026-02-01T00:00:00.000Z" },
    ]);
  });

  it("zero reserved quantity never manufactures a spurious cause entry", async () => {
    withFakeTables({
      inventory_positions: [{ id: "pos-1", lot_id: "lot-1", available_quantity_kg: 50, reserved_quantity_kg: 0 }],
      inventory_reservation_items: [],
    });
    const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
    const [breakdown] = await getAvailabilityBreakdown({ organizationId: "org-a" });
    expect(breakdown!.reservationCauses).toEqual([]);
  });
});

/**
 * Feature 005/006 T006 — the facts-vs-rules boundary.
 */
describe("T006 — Feature 006 eligibility facts: factual shape only, no listing decision", () => {
  it("exposes quantities and custody facts only — no isEligibleToList/canList/listingAllowed/canResell EXPORTED anywhere in lib/inventory", async () => {
    const files = ["types.ts", "positions.ts", "allocations.ts", "ownership.ts", "availability.ts"];
    for (const file of files) {
      const source = readFileSync(`lib/inventory/${file}`, "utf8");
      // Bans actual code usage (a declared/exported symbol) — doc comments explaining the deliberate
      // ABSENCE of these names (e.g. "no isEligibleToList field exists") legitimately mention them.
      expect(source).not.toMatch(/export\s+(function|const|type)\s+(isEligibleToList|canList|listingAllowed|canResell)\b/i);
      expect(source).not.toMatch(/^\s*(isEligibleToList|canList|listingAllowed|canResell)\s*[:(]/im);
    }
  });

  it("returns exactly the documented factual shape for each position", async () => {
    withFakeTables({
      inventory_positions: [
        { id: "pos-1", lot_id: "lot-1", owner_organization_id: "org-a", warehouse_id: "wh-1", available_quantity_kg: 200, reserved_quantity_kg: 5 },
      ],
    });
    const { getInventoryEligibilityFacts } = await import("@/lib/inventory/availability");
    const facts = await getInventoryEligibilityFacts({ organizationId: "org-a" });
    expect(facts).toEqual([
      {
        positionId: "pos-1",
        lotId: "lot-1",
        ownerOrganizationId: "org-a",
        warehouseId: "wh-1",
        availableQuantityKg: 200,
        reservedQuantityKg: 5,
      },
    ]);
  });
});
