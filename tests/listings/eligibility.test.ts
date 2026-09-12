import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createFakeSupabaseClient } from "@/tests/inventory/fake-supabase";
import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 T004 — the eligibility RULE composed over Feature 005's inventory FACTS.
 *
 * FOUR of the six refusal reasons are provable LIVE with the current fixtures, with no settled order
 * required:
 *   - SELLER_NOT_CAPABLE: a pure `!canSell` branch — genuinely returns before any database call at all.
 *   - POSITION_NOT_OWNED: a real cross-org position lookup (Org B session, Org A's positionId).
 *   - CUSTODY_NOT_ELIGIBLE: `LISTING_FIXTURES.positionOrgBInactiveWarehouse` — Org B's OWN position,
 *     but its warehouse has `is_active=false` (the one custody-adjacent fact this run's Feature-005
 *     extension exposes).
 *   - NOT_HILLS_SOURCED: `LISTING_FIXTURES.positionOrgBOnLotA` — Org B's OWN position, active warehouse,
 *     but no settled order proves Org B purchased that lot (Feature 005's `orderA`/`orderItemA` on the
 *     same lot belongs to Org A as buyer, and is left at DRAFT status — neither condition this
 *     function's `findHillsSourceProvenance` requires is satisfied for Org B).
 *
 * The remaining two paths (`eligible: true`, `INSUFFICIENT_QUANTITY`) and `RESERVED_QUANTITY` all
 * require a position that BOTH passes custody AND has genuine Hills-source provenance — which requires
 * a real settled order, which (per `manage.test.ts`'s header comment and the Feature 006 handoff) cannot
 * be constructed with current fixture tooling. Those three are proven with a FAKE client instead —
 * this is an application-logic proof (the function's own branching/arithmetic), not a live RLS proof;
 * the live cases above already cover every path RLS/ownership can affect.
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | ReturnType<typeof createFakeSupabaseClient> | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no client installed");
    return serverClientState.client;
  }),
}));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

async function withFakeClient<T>(tables: Record<string, readonly unknown[]>, run: () => Promise<T>): Promise<T> {
  serverClientState.client = createFakeSupabaseClient(tables);
  vi.resetModules();
  return run();
}

describe("T004 — live refusal paths (real RLS/ownership, no settled order required)", () => {
  it("SELLER_NOT_CAPABLE — canSell=false refuses before any database call", async () => {
    const { checkListingEligibility } = await import("@/lib/listings/eligibility");
    const result = await checkListingEligibility({
      organizationId: INVENTORY_FIXTURES.orgA.organizationId,
      canSell: false,
      positionId: INVENTORY_FIXTURES.orgA.positionId,
      requestedQuantityKg: 1,
    });
    expect(result).toEqual({ eligible: false, reason: "SELLER_NOT_CAPABLE", eligibleQuantityKg: null });
  });

  it("POSITION_NOT_OWNED — Org B (real canSell=true) requesting Org A's real positionId, cross-org", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { checkListingEligibility } = await import("@/lib/listings/eligibility");
      return checkListingEligibility({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        canSell: true,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
        requestedQuantityKg: 1,
      });
    });
    expect(result).toEqual({ eligible: false, reason: "POSITION_NOT_OWNED", eligibleQuantityKg: null });
  });

  it("CUSTODY_NOT_ELIGIBLE — Org B's own position, but its warehouse is inactive", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { checkListingEligibility } = await import("@/lib/listings/eligibility");
      return checkListingEligibility({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        canSell: true,
        positionId: LISTING_FIXTURES.positionOrgBInactiveWarehouse,
        requestedQuantityKg: 1,
      });
    });
    expect(result).toEqual({ eligible: false, reason: "CUSTODY_NOT_ELIGIBLE", eligibleQuantityKg: null });
  });

  it("NOT_HILLS_SOURCED — Org B's own position, active warehouse, but no settled purchase of that lot", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { checkListingEligibility } = await import("@/lib/listings/eligibility");
      return checkListingEligibility({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        canSell: true,
        positionId: LISTING_FIXTURES.positionOrgBOnLotA,
        requestedQuantityKg: 1,
      });
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe("NOT_HILLS_SOURCED");
  });
});

describe("T004 — quantity/eligible-true paths (fake client — see header for why this path cannot be live yet)", () => {
  const basePosition = {
    id: "pos-eligible-1",
    lot_id: "lot-eligible-1",
    owner_organization_id: "org-eligible",
    warehouse_id: "wh-eligible-1",
    warehouse_location_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
  const activeWarehouse = { id: "wh-eligible-1", code: "WH-E", name: "Eligible Warehouse", city: null, country_code: null, is_active: true };
  const settledOrderItem = { id: "order-item-eligible-1", order_id: "order-eligible-1", lot_id: "lot-eligible-1" };
  const settledOrder = { id: "order-eligible-1", buyer_organization_id: "org-eligible", status: "PAID" };

  it("eligible: true — available minus reserved covers the requested quantity, with real Hills-source provenance", async () => {
    const result = await withFakeClient(
      {
        inventory_positions: [{ ...basePosition, available_quantity_kg: 100, reserved_quantity_kg: 20 }],
        warehouses: [activeWarehouse],
        coffee_lots: [],
        order_items: [settledOrderItem],
        orders: [settledOrder],
      },
      async () => {
        const { checkListingEligibility } = await import("@/lib/listings/eligibility");
        return checkListingEligibility({ organizationId: "org-eligible", canSell: true, positionId: "pos-eligible-1", requestedQuantityKg: 50 });
      }
    );
    expect(result).toEqual({ eligible: true, eligibleQuantityKg: 80, sourcePurchaseOrderItemId: "order-item-eligible-1" });
  });

  it("INSUFFICIENT_QUANTITY — requested exceeds the authoritative eligible figure, which is disclosed to the owning seller", async () => {
    const result = await withFakeClient(
      {
        inventory_positions: [{ ...basePosition, available_quantity_kg: 100, reserved_quantity_kg: 20 }],
        warehouses: [activeWarehouse],
        coffee_lots: [],
        order_items: [settledOrderItem],
        orders: [settledOrder],
      },
      async () => {
        const { checkListingEligibility } = await import("@/lib/listings/eligibility");
        return checkListingEligibility({ organizationId: "org-eligible", canSell: true, positionId: "pos-eligible-1", requestedQuantityKg: 999 });
      }
    );
    expect(result).toEqual({ eligible: false, reason: "INSUFFICIENT_QUANTITY", eligibleQuantityKg: 80 });
  });

  it("RESERVED_QUANTITY — available equals reserved (nothing free), even with real provenance", async () => {
    const result = await withFakeClient(
      {
        inventory_positions: [{ ...basePosition, available_quantity_kg: 50, reserved_quantity_kg: 50 }],
        warehouses: [activeWarehouse],
        coffee_lots: [],
        order_items: [settledOrderItem],
        orders: [settledOrder],
      },
      async () => {
        const { checkListingEligibility } = await import("@/lib/listings/eligibility");
        return checkListingEligibility({ organizationId: "org-eligible", canSell: true, positionId: "pos-eligible-1", requestedQuantityKg: 1 });
      }
    );
    expect(result).toEqual({ eligible: false, reason: "RESERVED_QUANTITY", eligibleQuantityKg: 0 });
  });
});

/** A doc comment legitimately NAMING a forbidden pattern to explain its deliberate absence (e.g. the
 * preflight table citing `organization_can_sell` as something this file REUSES rather than re-derives)
 * must never trip a "must not contain X" check — same precedent as `tests/inventory/run-b-ui.test.tsx`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T004 — never re-derives organization_can_sell (source-level proof)", () => {
  it("eligibility.ts never calls an RPC/select against organization_can_sell or platform_admins", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/eligibility.ts", "utf8"));
    expect(source).not.toMatch(/organization_can_sell/);
    expect(source).not.toMatch(/\.rpc\(/);
  });

  it("never invents hold/variance/quarantine vocabulary in actual code (only in comments explaining the DB-BLOCK-07 gap)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/eligibility.ts", "utf8"));
    expect(source).not.toMatch(/deliveryHold|custodyHold|quarantine|variance/i);
  });
});
