import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 007 RUN A (T003) — `lib/orders/read.ts` proofs. Unlike Feature 006's listing/inventory
 * domains, a plain authenticated buyer session CAN construct genuine test data here (`orders`
 * INSERT only requires `organization_can_buy` + `created_by = auth.uid()` + `status = 'DRAFT'`, all
 * satisfiable by an ordinary fixture session) — no privileged fixture seeding or settled-order
 * ceiling applies to this domain at all.
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

/** Setup helper: creates a real DRAFT order via `lib/orders/drafts.ts#createDraftOrder` itself
 * (DB-OPEN-14's own two-step insert-then-read pattern) rather than a raw insert, so this test suite
 * exercises the SAME code path production code uses. */
async function createTestOrder(client: SupabaseClient, organizationId: string): Promise<{ id: string }> {
  return withLiveClient(client, async () => {
    const { createDraftOrder } = await import("@/lib/orders/drafts");
    const userId = (await client.auth.getUser()).data.user!.id;
    const result = await createDraftOrder({ organizationId, userId });
    if (!result.ok) throw new Error(`test setup failed: ${result.code}`);
    return { id: result.data.id };
  });
}

describe("T003 — own-org order read, cross-org denial, and the financial/proforma null-until-checkout proof (live)", () => {
  it("a fresh DRAFT order is readable by its own buyer org, and invisible to an unrelated org", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const created = await createTestOrder(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const ownRead = await withLiveClient(orgBClient, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgB.organizationId, orderId: created.id });
    });
    expect(ownRead).not.toBeNull();
    expect(ownRead!.status).toBe("DRAFT");
    expect(ownRead!.buyerOrganizationId).toBe(INVENTORY_FIXTURES.orgB.organizationId);

    const orgAClient = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const crossOrgRead = await withLiveClient(orgAClient, async () => {
      const { getOrderById } = await import("@/lib/orders/read");
      return getOrderById({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, orderId: created.id });
    });
    expect(crossOrgRead).toBeNull();

    const crossOrgList = await withLiveClient(orgAClient, async () => {
      const { getOrdersForOrganization } = await import("@/lib/orders/read");
      return getOrdersForOrganization({ organizationId: INVENTORY_FIXTURES.orgA.organizationId });
    });
    expect(crossOrgList.rows.some((row) => row.id === created.id)).toBe(false);
  });

  it("order_financials and proforma are honestly null for a DRAFT order (checkout has never run)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const created = await createTestOrder(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const [financials, proforma] = await withLiveClient(orgBClient, async () => {
      const { getOrderFinancials, getProforma } = await import("@/lib/orders/read");
      return Promise.all([getOrderFinancials({ orderId: created.id }), getProforma({ orderId: created.id })]);
    });

    expect(financials).toBeNull();
    expect(proforma).toBeNull();
  });

  it("order_status_history is empty for a fresh DRAFT order (the recording trigger fires only on a status CHANGE)", async () => {
    const orgBClient = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const created = await createTestOrder(orgBClient, INVENTORY_FIXTURES.orgB.organizationId);

    const history = await withLiveClient(orgBClient, async () => {
      const { getOrderStatusHistory } = await import("@/lib/orders/read");
      return getOrderStatusHistory({ orderId: created.id });
    });
    expect(history).toEqual([]);
  });
});

/** A doc comment legitimately NAMING a forbidden pattern to explain its deliberate absence must
 * never trip a "must not contain X" check — same precedent as `tests/inventory/run-b-ui.test.tsx`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T003 — no reservation-table runtime read (source-level proof)", () => {
  it("read.ts never queries inventory_reservations/inventory_reservation_items", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/read.ts", "utf8"));
    expect(source).not.toMatch(/inventory_reservations/);
    expect(source).not.toMatch(/inventory_reservation_items/);
  });

  it("read.ts never uses a shared cache directive", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/orders/read.ts", "utf8"));
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
  });
});
