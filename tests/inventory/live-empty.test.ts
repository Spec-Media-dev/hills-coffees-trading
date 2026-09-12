import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, PHASE89_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 005 T002–T005 — LIVE integration proof against the REAL database, using the SAME
 * mock-of-`createClient` technique `tests/auth/request-identity.test.ts` already established (a real
 * fixture session client is injected so server-only code can run outside a Next.js request).
 *
 * HONEST SCOPE: Phase 5 now seeds differentiated inventory rows for its positive RLS/fidelity proofs,
 * so this file deliberately uses the documented `pendingKyb` organization, which has no Feature 005
 * inventory fixture row. It therefore still proves that the read layer runs against the REAL database,
 * through REAL RLS, with a REAL authenticated session, and returns an honest empty result with NO
 * error. Positive and cross-tenant proof live in `tests/inventory/isolation.test.ts`; this file keeps
 * the equally important empty-state behavior covered without falsely claiming the entire table is empty.
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

afterEach(() => {
  serverClientState.client = null;
  vi.clearAllMocks();
});

describe("Feature 005 RUN A — live, real-RLS empty-state proof (the selected fixture organization has no inventory)", () => {
  it("getInventoryPositions runs against the real database with a real session and returns an honest empty page, no error", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getInventoryPositions for an organization the caller does not belong to also returns empty, no error, no leak", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: FOUNDATION_FIXTURES.buyerAndSeller.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getStorageAllocations runs against the real database and returns an honest empty page", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getOwnershipEvents runs against the real database and returns an honest empty page", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
      return getOwnershipEvents({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getAvailabilityBreakdown runs against the real database and returns an empty array for the empty fixture organization", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual([]);
  });

  it("getInventoryEligibilityFacts (T006) runs against the real database and returns an empty array", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryEligibilityFacts } = await import("@/lib/inventory/availability");
      return getInventoryEligibilityFacts({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual([]);
  });

  it("a genuinely unauthenticated/anonymous session also gets an honest empty result, never an error leaking schema/policy detail", async () => {
    const { createAnonymousFixtureClient } = await import("@/tests/auth/fixture-session");
    const anon = createAnonymousFixtureClient();
    const result = await withLiveClient(anon, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: PHASE89_FIXTURES.pendingKyb.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });
});
