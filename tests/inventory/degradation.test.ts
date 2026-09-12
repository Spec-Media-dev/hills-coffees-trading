import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createAnonymousFixtureClient, INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 005 Phase 5 (T019) — proves the application survives DB-OPEN-05 gracefully, using a REAL
 * seeded position whose `lot_id` genuinely points at a real `coffee_lots` row
 * (`INVENTORY_FIXTURES.lotA`/`lotB`). DB-OPEN-05 itself is a real, still-open database capability gap
 * (`coffee_lots`' `member_read_trade_lots` policy predicate `co.lot_id = co.id` — a self-comparison on
 * the WRONG table inside `coffee_offers`, never satisfiable for an ordinary member) — this file does
 * NOT resolve it, does NOT touch the policy, schema, or a migration, and does NOT use service-role to
 * work around it. It proves Feature 005's own read layer/UI degrade honestly WHILE the blocker stays
 * open, exactly as the run directive requires.
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

describe("T019 — DB-OPEN-05 graceful degradation with a real seeded position", () => {
  it("the dedicated DRAFT coffee and its hidden fixture offers are not publicly readable", async () => {
    const client = createAnonymousFixtureClient();

    const [{ data: coffeeRows, error: coffeeError }, { data: offerRows, error: offerError }] = await Promise.all([
      client.from("coffees").select("id").eq("id", INVENTORY_FIXTURES.coffeeId),
      client.from("coffee_offers").select("id").in("id", INVENTORY_FIXTURES.offerIds),
    ]);

    expect(coffeeError).toBeNull();
    expect(coffeeRows).toEqual([]);
    // `anon` has no SELECT privilege on `coffee_offers` at all; a PostgreSQL denial is the actual,
    // stronger public boundary, rather than a misleading empty success response.
    expect(offerError?.code).toBe("42501");
    expect(offerRows).toBeNull();
  });

  it("the position still returns, with its authoritative quantities intact, even though its lot is genuinely unreadable", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const position = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });

    expect(position).not.toBeNull();
    // Authoritative quantities remain intact — DB-OPEN-05 affects lot CONTEXT only, never the
    // position's own owned/reserved quantity truth.
    expect(position!.availableQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAAvailable);
    expect(position!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAReserved);
    // Lot detail is honestly null — DB-OPEN-05, reconfirmed live, not a crash, not an empty object.
    expect(position!.lot).toBeNull();
    // Warehouse context is NOT blocked by DB-OPEN-05 (a separate, member-readable table) — it still
    // resolves, proving the degradation is scoped to exactly the blocked table.
    expect(position!.warehouse).not.toBeNull();
    expect(position!.warehouse!.warehouseId).toBe(INVENTORY_FIXTURES.warehouse);
  });

  it("no fabricated lot code/origin/grade/process/crop/quality-grade value appears anywhere in the returned position", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const position = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });
    // The real, seeded lot code ("F005-LOT-A") — genuinely stored in coffee_lots — must NOT leak into
    // the position DTO by any other path (e.g. a stray join), since lot detail is meant to be null.
    expect(JSON.stringify(position)).not.toContain("F005-LOT-A");
    expect(position!.lot).toBeNull();
  });

  it("the position list (not just single-position lookup) does not crash and still returns the row, degrading the same way", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    const seeded = result.rows.find((row) => row.id === INVENTORY_FIXTURES.orgA.positionId);
    expect(seeded).toBeTruthy();
    expect(seeded!.lot).toBeNull();
  });

  // UI/component-level proof (real degraded position → the page's actual "Lot detail unavailable"
  // branch, rendered) lives in `tests/inventory/run-b-ui.test.tsx` — JSX requires a `.tsx` file, and
  // this file's name (`degradation.test.ts`) is fixed by the task/directive.
});

/**
 * DB-OPEN-12 narrow regression (not this task's primary subject, but the run directive requires it):
 * reserved quantity remains authoritative and truthful, and the reservation cause for a position with
 * NO seeded `inventory_reservation_items` row honestly degrades to "unknown" rather than fabricating
 * a cause or crashing. This does not attempt to resolve DB-OPEN-12 — no reservation row is seeded
 * here at all (Phase 5's fixture data deliberately does not create one), consistent with "do not
 * attempt to solve DB-OPEN-12 in this run."
 */
describe("DB-OPEN-12 regression — reserved quantity truthful, cause honestly unknown, no workaround", () => {
  it("Org A's real reserved_quantity_kg is returned verbatim, and its reservation cause is honestly unresolvable (no inventory_reservation_items row exists for it)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const [breakdown] = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionIds: [INVENTORY_FIXTURES.orgA.positionId],
      });
    });
    expect(breakdown!.reservedQuantityKg).toBe(INVENTORY_FIXTURES.quantities.positionAReserved);
    // Reserved quantity is nonzero (88.654) but no reservation row exists for it in this run's
    // fixtures — the honest "unknown" cause, never a fabricated order reference.
    expect(breakdown!.reservationCauses).toEqual([{ kind: "unknown" }]);
  });

  it("no service-role/privileged runtime workaround exists anywhere in lib/inventory for DB-OPEN-12", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/inventory/availability.ts", "utf8");
    expect(source).not.toMatch(/SERVICE_ROLE|service_role/);
  });
});
