import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 005 Phase 5 (T016) — the release-blocking cross-organization tenant-isolation proof.
 *
 * Unlike `tests/inventory/live-empty.test.ts` (RUN A — proved the read layer runs against the real
 * database with no error, but every table was genuinely empty, so "both queries returned empty" was
 * the strongest available evidence), this file runs against REAL, DIFFERENTIATED rows: Org A and
 * Org B each have their OWN distinct position/allocation/ownership-event data
 * (`scripts/seed-test-fixtures.ts#seedInventoryFixtures`, exposed here as `INVENTORY_FIXTURES`). A
 * positive own-org read and a negative cross-org read are therefore both genuine, distinguishable
 * proofs — not two empty results that happen to look the same.
 *
 * Every read here goes through the SAME `lib/inventory/*` read-layer functions the application uses
 * (never a raw ad-hoc query), via a REAL authenticated fixture session (`signInAsFixture` —
 * `signInWithPassword`, never service-role). Service-role exists ONLY in
 * `scripts/seed-test-fixtures.ts`'s setup/teardown, never as the reading identity under test.
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no live client installed");
    return serverClientState.client;
  }),
}));

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

describe("T016 — cross-organization isolation (real seeded rows, real RLS, real sessions)", () => {
  it("Org A sees its OWN position, with the exact seeded quantities — a genuine positive read", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    const seeded = result.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.positionId);
    expect(seeded).toBeTruthy();
    expect(seeded!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAAvailable);
    expect(seeded!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAReserved);
  });

  it("Org A does NOT see Org B's position when querying under Org B's organization id — empty, not an error", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
    });
    expect(result.rows.find((row) => row.id === INVENTORY_FIXTURES.orgB.positionId)).toBeUndefined();
  });

  it("Org B sees its OWN position, with its own distinct seeded quantities (reciprocal proof)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
    });
    const seeded = result.rows.find((row) => row.id === INVENTORY_FIXTURES.orgB.positionId);
    expect(seeded).toBeTruthy();
    expect(seeded!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionBAvailable);
    expect(seeded!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionBReserved);
  });

  it("position-detail isolation: Org B requesting Org A's specific positionId gets null — indistinguishable from nonexistent", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgB.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });
    expect(result).toBeNull();
  });

  it("position-detail: Org A CAN read its own specific positionId by id", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });
    expect(result).not.toBeNull();
    expect(result!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAAvailable);
  });

  it("Org A sees its OWN storage allocation, and Org B does not", async () => {
    const asOrgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const ownResult = await withLiveClient(asOrgA, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    const ownAllocation = ownResult.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.allocationId);
    expect(ownAllocation).toBeTruthy();
    expect(ownAllocation!.quantityKg).toBe(INVENTORY_FIXTURES.quantities.allocationAQuantity);
    expect(ownAllocation!.releasedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.allocationAReleased);

    const asOrgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const crossResult = await withLiveClient(asOrgB, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    expect(crossResult.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.allocationId)).toBeUndefined();
  });

  it("storage/order context isolation: Org A sees its own allocation's order code; Org B never sees Org A's order context", async () => {
    const asOrgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const ownResult = await withLiveClient(asOrgA, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    const ownAllocation = ownResult.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.allocationId);
    expect(ownAllocation!.order).toEqual({ orderId: INVENTORY_FIXTURES.orgA.orderId, orderCode: INVENTORY_FIXTURES.orgA.orderCode });

    // Org B cannot even read the allocation row itself (proven above) — so it categorically cannot
    // see its order/hold-expiry context either. This assertion makes that explicit rather than
    // implicit in the prior test.
    const asOrgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const crossResult = await withLiveClient(asOrgB, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    expect(JSON.stringify(crossResult)).not.toContain(INVENTORY_FIXTURES.orgA.orderCode);
  });

  describe("ownership event visibility", () => {
    it("Org A sees the event where it is the DESTINATION (from hillsOrg)", async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const result = await withLiveClient(client, async () => {
        const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
        return getOwnershipEvents({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
      });
      const event = result.rows.find((row) => row.id === INVENTORY_FIXTURES.events.hillsToOrgA);
      expect(event).toBeTruthy();
      expect(event!.role).toEqual({ isSource: false, isDestination: true });
    });

    it("Org A sees the event where it is the SOURCE (to Org B), and Org B sees the same event as destination", async () => {
      const asOrgA = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const fromA = await withLiveClient(asOrgA, async () => {
        const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
        return getOwnershipEvents({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
      });
      const eventForA = fromA.rows.find((row) => row.id === INVENTORY_FIXTURES.events.orgAToOrgB);
      expect(eventForA).toBeTruthy();
      expect(eventForA!.role).toEqual({ isSource: true, isDestination: false });

      const asOrgB = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
      const fromB = await withLiveClient(asOrgB, async () => {
        const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
        return getOwnershipEvents({ organizationId: INVENTORY_FIXTURES.orgB.organizationId });
      });
      const eventForB = fromB.rows.find((row) => row.id === INVENTORY_FIXTURES.events.orgAToOrgB);
      expect(eventForB).toBeTruthy();
      expect(eventForB!.role).toEqual({ isSource: false, isDestination: true });
      // Counterparty redaction, not omission: Org B can see the EVENT (it is a real party to it), but
      // Org A's organization name is not readable via `organizations`' own RLS — so it must be
      // redacted, never fabricated, and the event itself must never be dropped for that reason.
      expect(eventForB!.from.organizationId).toBe(INVENTORY_FIXTURES.orgA.organizationId);
      expect(eventForB!.from.redacted).toBe(true);
      expect(eventForB!.from.displayName).toBeNull();
    });

    it("Org A does NOT see the unrelated Org B → Org C event — invisible, not merely redacted", async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
      const result = await withLiveClient(client, async () => {
        const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
        return getOwnershipEvents({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
      });
      expect(result.rows.find((row) => row.id === INVENTORY_FIXTURES.events.orgBToOrgC)).toBeUndefined();
    });

    it("Org C DOES see the Org B → Org C event, as destination, with Org B's identity redacted", async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.orgC.email);
      const result = await withLiveClient(client, async () => {
        const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
        return getOwnershipEvents({ organizationId: INVENTORY_FIXTURES.orgC.organizationId });
      });
      const event = result.rows.find((row) => row.id === INVENTORY_FIXTURES.events.orgBToOrgC);
      expect(event).toBeTruthy();
      expect(event!.role).toEqual({ isSource: false, isDestination: true });
      expect(event!.from.redacted).toBe(true);
    });
  });

  describe("multi-organization acting-context isolation", () => {
    it("the SAME authenticated multi-org user gets only the explicitly requested acting organization's inventory — no organizations[0] or stale-context leak", async () => {
      const client = await signInAsFixture(INVENTORY_FIXTURES.multiOrg.email);

      const resultA = await withLiveClient(client, async () => {
        const { getInventoryPositions } = await import("@/lib/inventory/positions");
        return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.multiOrg.organizationAId });
      });
      expect(resultA.rows.map((row) => row.id)).toContain(INVENTORY_FIXTURES.multiOrg.positionAId);
      expect(resultA.rows.every((row) => row.ownerOrganizationId === INVENTORY_FIXTURES.multiOrg.organizationAId)).toBe(true);
      expect(resultA.rows.find((row) => row.id === INVENTORY_FIXTURES.multiOrg.positionBId)).toBeUndefined();

      const resultB = await withLiveClient(client, async () => {
        const { getInventoryPositions } = await import("@/lib/inventory/positions");
        return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.multiOrg.organizationBId });
      });
      expect(resultB.rows.map((row) => row.id)).toContain(INVENTORY_FIXTURES.multiOrg.positionBId);
      expect(resultB.rows.every((row) => row.ownerOrganizationId === INVENTORY_FIXTURES.multiOrg.organizationBId)).toBe(true);
      expect(resultB.rows.find((row) => row.id === INVENTORY_FIXTURES.multiOrg.positionAId)).toBeUndefined();
    });
  });
});
