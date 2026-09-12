import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 005 T002–T005 — LIVE integration proof against the REAL database, using the SAME
 * mock-of-`createClient` technique `tests/auth/request-identity.test.ts` already established (a real
 * fixture session client is injected so server-only code can run outside a Next.js request).
 *
 * HONEST SCOPE: `inventory_positions`/`storage_allocations`/`inventory_ownership_events`/
 * `inventory_reservation_items`/`inventory_reservations`/`coffee_lots` are ALL genuinely empty in the
 * live database right now (verified directly, service-role, unfiltered count = 0 for every one) —
 * there is no approved way to create realistic rows yet, since the only functions that would ever
 * write them (`checkout_order`, `admin_review_payment`, warehouse-operator writes) belong to Features
 * 007/008/010, none of which exist yet. This file therefore proves: the read layer runs against the
 * REAL database, through REAL RLS, with a REAL authenticated session, and returns an honest empty
 * result with NO error — not a full positive-and-negative cross-tenant isolation proof (that requires
 * seeded rows, which is explicitly Phase 5's job — `tests/inventory/isolation.test.ts`, not this run).
 * `tests/inventory/quantity-fidelity.test.ts` and `availability.test.ts` supply the controlled,
 * fake-client proof that quantities/vocabulary/redaction map correctly — this file supplies the
 * "against a real database, for real" half that a fake client cannot.
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

describe("Feature 005 RUN A — live, real-RLS proof (tables are currently empty; see file header)", () => {
  it("getInventoryPositions runs against the real database with a real session and returns an honest empty page, no error", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getInventoryPositions for an organization the caller does not belong to also returns empty, no error, no leak", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: FOUNDATION_FIXTURES.buyerAndSeller.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getStorageAllocations runs against the real database and returns an honest empty page", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getStorageAllocations } = await import("@/lib/inventory/allocations");
      return getStorageAllocations({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getOwnershipEvents runs against the real database and returns an honest empty page", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getOwnershipEvents } = await import("@/lib/inventory/ownership");
      return getOwnershipEvents({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });

  it("getAvailabilityBreakdown runs against the real database and returns an empty array (no positions exist yet)", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getAvailabilityBreakdown } = await import("@/lib/inventory/availability");
      return getAvailabilityBreakdown({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual([]);
  });

  it("getInventoryEligibilityFacts (T006) runs against the real database and returns an empty array", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const result = await withLiveClient(client, async () => {
      const { getInventoryEligibilityFacts } = await import("@/lib/inventory/availability");
      return getInventoryEligibilityFacts({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual([]);
  });

  it("a genuinely unauthenticated/anonymous session also gets an honest empty result, never an error leaking schema/policy detail", async () => {
    const { createAnonymousFixtureClient } = await import("@/tests/auth/fixture-session");
    const anon = createAnonymousFixtureClient();
    const result = await withLiveClient(anon, async () => {
      const { getInventoryPositions } = await import("@/lib/inventory/positions");
      return getInventoryPositions({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId });
    });
    expect(result).toEqual({ rows: [], hasMore: false });
  });
});
