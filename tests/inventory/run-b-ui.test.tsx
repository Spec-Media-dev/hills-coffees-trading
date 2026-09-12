import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
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

/** Swaps in a REAL, authenticated fixture-session client (never service-role). */
async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  fakeClientState.client = client;
  vi.resetModules();
  return run();
}

/**
 * Strips `/* ... *\/` and `// ...` comments before a structural "must not contain X" check, so a
 * doc comment that legitimately NAMES a forbidden pattern to explain its deliberate absence (this
 * codebase's own established precedent — see `tests/inventory/availability.test.ts`) never produces
 * a false positive against actual code usage.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Feature 005 RUN B — T007/T008 read-layer additions (`getInventoryPositionById`,
 * `getInventoryPositionsCount`, `getStoredAllocationsCount`) built for the new UI surfaces.
 */
describe("RUN B — position detail lookup and bounded overview counts", () => {
  it("getInventoryPositionById returns the exact position, quantity fields verbatim, when it belongs to the caller's org", async () => {
    withFakeTables({
      inventory_positions: [
        { id: "pos-1", lot_id: "lot-1", owner_organization_id: "org-a", warehouse_id: "wh-1", warehouse_location_id: null, available_quantity_kg: 100, reserved_quantity_kg: 15, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-02T00:00:00.000Z" },
      ],
    });
    const { getInventoryPositionById } = await import("@/lib/inventory/positions");
    const position = await getInventoryPositionById({ organizationId: "org-a", positionId: "pos-1" });
    expect(position).not.toBeNull();
    expect(position!.availableQuantityKg).toBe(100);
    expect(position!.reservedQuantityKg).toBe(15);
  });

  it("getInventoryPositionById returns null for both a nonexistent id and a cross-org id — the caller cannot distinguish them", async () => {
    withFakeTables({ inventory_positions: [] });
    const { getInventoryPositionById } = await import("@/lib/inventory/positions");
    const result = await getInventoryPositionById({ organizationId: "org-a", positionId: "does-not-exist" });
    expect(result).toBeNull();
  });

  it("getInventoryPositionsCount / getStoredAllocationsCount are single-aggregate reads — no row data returned", async () => {
    withFakeTables({
      inventory_positions: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
      storage_allocations: [{ id: "a1" }],
    });
    const { getInventoryPositionsCount } = await import("@/lib/inventory/positions");
    const { getStoredAllocationsCount } = await import("@/lib/inventory/allocations");
    expect(await getInventoryPositionsCount({ organizationId: "org-a" })).toBe(3);
    expect(await getStoredAllocationsCount({ organizationId: "org-a" })).toBe(1);
  });

  it("getInventoryPositionsCount source contains no unbounded/full-scan `select(\"*\")` pattern", () => {
    const source = readFileSync("lib/inventory/positions.ts", "utf8");
    expect(source).toMatch(/count:\s*"exact",\s*head:\s*true/);
  });
});

/**
 * Feature 005 RUN B reconciliation — T010's `storage_allocations` → `order_items` → `orders` order
 * context. Empirically proven live (service-role setup/teardown only, real authenticated read as the
 * order's buyer and as an unrelated cross-org member) before this read-layer extension was written —
 * see `lib/inventory/types.ts#StorageAllocationOrderContext`'s doc comment for the full evidence.
 */
describe("RUN B reconciliation — T010 originating order context", () => {
  it("resolves the order code when the order_item/order are readable", async () => {
    withFakeTables({
      storage_allocations: [
        { id: "alloc-1", order_item_id: "item-1", owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 10, released_quantity_kg: 0, status: "STORED", started_at: "2026-01-01T00:00:00.000Z", released_at: null },
      ],
      order_items: [{ id: "item-1", order_id: "order-1" }],
      orders: [{ id: "order-1", order_code: "HC-0001" }],
    });
    const { getStorageAllocations } = await import("@/lib/inventory/allocations");
    const { rows } = await getStorageAllocations({ organizationId: "org-a" });
    expect(rows[0]!.order).toEqual({ orderId: "order-1", orderCode: "HC-0001" });
  });

  it("degrades to null (never fabricated) when there is no order_item_id at all", async () => {
    withFakeTables({
      storage_allocations: [
        { id: "alloc-1", order_item_id: null, owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 10, released_quantity_kg: 0, status: "STORED", started_at: "2026-01-01T00:00:00.000Z", released_at: null },
      ],
    });
    const { getStorageAllocations } = await import("@/lib/inventory/allocations");
    const { rows } = await getStorageAllocations({ organizationId: "org-a" });
    expect(rows[0]!.order).toBeNull();
  });

  it("degrades to null (never a raw id, never a guess) when order_items/orders come back empty (RLS-denied)", async () => {
    withFakeTables({
      storage_allocations: [
        { id: "alloc-1", order_item_id: "item-1", owner_organization_id: "org-a", lot_id: "lot-1", warehouse_id: "wh-1", warehouse_location_id: null, quantity_kg: 10, released_quantity_kg: 0, status: "STORED", started_at: "2026-01-01T00:00:00.000Z", released_at: null },
      ],
      order_items: [],
    });
    const { getStorageAllocations } = await import("@/lib/inventory/allocations");
    const { rows } = await getStorageAllocations({ organizationId: "org-a" });
    expect(rows[0]!.order).toBeNull();
  });

  it("the storage page renders the order code as plain reference text, never a hyperlink to a nonexistent order route", () => {
    const source = stripComments(readFileSync("src/app/dashboard/storage/page.tsx", "utf8"));
    expect(source).not.toMatch(/dashboard\/orders/);
  });
});

describe("RUN B — AvailabilityBreakdown component (T009): presentation only, no arithmetic", () => {
  it("source contains no arithmetic operator on quantity fields", () => {
    const source = stripComments(readFileSync("components/inventory/availability-breakdown.tsx", "utf8"));
    expect(source).not.toMatch(/(available|reserved|owned)QuantityKg\s*[-+*/]/);
    expect(source).not.toMatch(/[-+*/]\s*(available|reserved|owned)QuantityKg/);
    expect(source).not.toMatch(/Math\.max\(0,/);
  });

  it("renders owned/reserved quantities verbatim with units", async () => {
    const { AvailabilityBreakdown } = await import("@/components/inventory/availability-breakdown");
    render(
      <AvailabilityBreakdown
        breakdown={{ positionId: "p1", lotId: "l1", availableQuantityKg: 200, reservedQuantityKg: 40, reservationCauses: [] }}
      />
    );
    expect(screen.getByText("200 kg")).toBeTruthy();
    expect(screen.getByText("40 kg")).toBeTruthy();
  });

  it("Feature 005 Phase 5 (T017) — renders REAL, live-seeded quantities verbatim: real DB row → read layer → component, end to end", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const [breakdown] = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionIds: [INVENTORY_FIXTURES.orgA.positionId],
      });
    });
    const { AvailabilityBreakdown } = await import("@/components/inventory/availability-breakdown");
    render(<AvailabilityBreakdown breakdown={breakdown!} />);
    expect(screen.getByText(`${INVENTORY_FIXTURES.quantities.positionAAvailable} kg`)).toBeTruthy();
    expect(screen.getByText(`${INVENTORY_FIXTURES.quantities.positionAReserved} kg`)).toBeTruthy();
  });

  it("an unknown reservation cause renders the honest unavailable copy, never a fabricated reason", async () => {
    const { AvailabilityBreakdown } = await import("@/components/inventory/availability-breakdown");
    render(
      <AvailabilityBreakdown
        breakdown={{ positionId: "p1", lotId: "l1", availableQuantityKg: 100, reservedQuantityKg: 10, reservationCauses: [{ kind: "unknown" }] }}
      />
    );
    expect(screen.getAllByText(/unavailable right now/i).length).toBeGreaterThan(0);
  });

  it("a genuinely negative value never gets silently clamped — a controlled data-integrity state renders instead", async () => {
    const { AvailabilityBreakdown } = await import("@/components/inventory/availability-breakdown");
    render(
      <AvailabilityBreakdown breakdown={{ positionId: "p1", lotId: "l1", availableQuantityKg: -5, reservedQuantityKg: 10, reservationCauses: [] }} />
    );
    expect(screen.getAllByText(/data integrity/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("0 kg")).toBeNull();
  });
});

describe("RUN B — LedgerTimeline component (T011/T012): read-only, redaction preserved", () => {
  it("renders no edit/delete/reorder control of any kind", async () => {
    const source = stripComments(readFileSync("components/inventory/ledger-timeline.tsx", "utf8"));
    expect(source).not.toMatch(/onClick|<button|<Button|dangerouslySetInnerHTML/i);
  });

  it("renders event type, quantity, and a redacted counterparty honestly (never the real name)", async () => {
    const { LedgerTimeline } = await import("@/components/inventory/ledger-timeline");
    render(
      <LedgerTimeline
        events={[
          {
            id: "evt-1",
            lotId: "lot-1",
            quantityKg: 25,
            eventType: "SALE",
            role: { isSource: true, isDestination: false },
            from: { organizationId: "org-a", displayName: "Org A", redacted: false },
            to: { organizationId: "org-b", displayName: null, redacted: true },
            orderItemId: null,
            correlationId: "corr-123",
            reason: "Settlement",
            createdAt: "2026-01-01T00:00:00.000Z",
            createdBy: null,
          },
        ]}
      />
    );
    expect(screen.getByText("25 kg")).toBeTruthy();
    expect(screen.getByText("Another organization")).toBeTruthy();
    expect(screen.queryByText("Org B")).toBeNull();
  });

  it("reason/correlation text is rendered as plain React text, never dangerouslySetInnerHTML", () => {
    const source = stripComments(readFileSync("components/inventory/ledger-timeline.tsx", "utf8"));
    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
  });
});

describe("RUN B — StorageStatusBadge (T010): exact closed vocabulary, dot + text", () => {
  it("maps all three approved statuses to their exact localized label, never a fourth value", async () => {
    const { StorageStatusBadge } = await import("@/components/inventory/storage-status-badge");
    for (const status of ["STORED", "RELEASED", "DELIVERED"] as const) {
      const { unmount } = render(<StorageStatusBadge status={status} />);
      expect(document.querySelector(`[data-status="${status}"]`)).toBeTruthy();
      unmount();
    }
  });
});

describe("RUN B — server-component / no-mutation / no-cache / no-service-role audit", () => {
  const pageFiles = [
    "src/app/dashboard/inventory/page.tsx",
    "src/app/dashboard/inventory/[positionId]/page.tsx",
    "src/app/dashboard/storage/page.tsx",
    "src/app/dashboard/inventory/history/page.tsx",
    "src/app/dashboard/not-found.tsx",
  ];

  it("none of the new RUN B pages is a Client Component", () => {
    for (const file of pageFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/^"use client"/m);
    }
  });

  it("none of the new RUN B pages or components declares a Server Action or performs a mutation", () => {
    const files = [...pageFiles, "components/inventory/availability-breakdown.tsx", "components/inventory/ledger-timeline.tsx", "components/inventory/storage-status-badge.tsx"];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/"use server"|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    }
  });

  it("none of the new RUN B files uses a cache directive or service-role", () => {
    const files = [
      ...pageFiles,
      "lib/inventory/positions.ts",
      "lib/inventory/allocations.ts",
      "components/inventory/availability-breakdown.tsx",
      "components/inventory/ledger-timeline.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/unstable_cache|cacheTag|cacheLife|updateTag|"use cache"|SERVICE_ROLE|service_role/i);
    }
  });

  it("the position detail page calls notFound() for a missing/cross-org position rather than branching on a leaking message", () => {
    const source = readFileSync("src/app/dashboard/inventory/[positionId]/page.tsx", "utf8");
    expect(source).toMatch(/notFound\(\)/);
    expect(source).not.toMatch(/belongs to another organization/i);
  });

  it("no public route imports lib/inventory", () => {
    const root = "src/app/(public)";
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          if (readFileSync(full, "utf8").includes("lib/inventory")) offenders.push(full);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

/**
 * Feature 005 Phase 5 (T019) — UI/component-level DB-OPEN-05 degradation proof against a REAL,
 * live-seeded position whose lot is genuinely unreadable. The read-layer half of this proof lives in
 * `tests/inventory/degradation.test.ts`; this half proves the rendered branch a real member would
 * actually see mirrors that data exactly.
 */
describe("RUN B / Phase 5 — DB-OPEN-05 degradation rendered honestly for a real position", () => {
  it("a real degraded position renders the localized 'Lot detail unavailable' notice, never a fabricated lot panel", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const position = await withLiveClient(client, async () => {
      const { getInventoryPositionById } = await import("@/lib/inventory/positions");
      return getInventoryPositionById({
        organizationId: INVENTORY_FIXTURES.orgA.organizationId,
        positionId: INVENTORY_FIXTURES.orgA.positionId,
      });
    });
    expect(position!.lot).toBeNull();

    const { AppBilingual } = await import("@/components/locale/app-bilingual");
    render(
      position!.lot ? (
        <div>lot detail (should not render)</div>
      ) : (
        <div>
          <p>
            <AppBilingual pick={(c) => c.inventory.detail.lotUnavailable.title} />
          </p>
          <p>
            <AppBilingual pick={(c) => c.inventory.detail.lotUnavailable.description} />
          </p>
        </div>
      )
    );
    expect(screen.getByText("Lot detail unavailable")).toBeTruthy();
    expect(screen.queryByText(/lot detail \(should not render\)/)).toBeNull();
  });
});
