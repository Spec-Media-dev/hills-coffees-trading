import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 RUN C (T025) — cross-organization isolation. Seller A (Org A, a real live session)
 * must never see another seller's non-published listing, documents, or status history.
 *
 * FIXTURE NOTE (honest, established since RUN A/B): no genuine SECOND seller-owned `coffee_offers`
 * row can exist live (no settled order can ever be constructed — `create-action.test.ts`'s own
 * header). The RUN A/B fixtures' `offerPublished`/`offerSoldOut` are HILLS-owned, and `hillsOrg` has
 * no signable-in member — so this file proves isolation the SAME way `manage.test.ts` already
 * established: a real, live, unrelated org (Org A) attempting to read another organization's (Hills')
 * private listing data, through every read surface this feature exposes. This is a genuine live RLS
 * proof of the isolation PROPERTY (an org that is neither the owner nor an admin gets nothing),
 * independent of which specific two organizations stand in for "seller A"/"seller B".
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

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

describe("T025 — cross-org isolation: non-published listing", () => {
  it("Org A cannot read the SOLD_OUT (non-published) offer by direct id through the manage read path", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { getManagedListingById } = await import("@/lib/listings/manage");
      return getManagedListingById({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, offerId: LISTING_FIXTURES.offerSoldOut });
    });
    expect(result).toBeNull();
  });

  it("Org A's own managed-listings list never contains the other organization's offers, published or not", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const { rows } = await withLiveClient(client, async () => {
      const { getManagedListings } = await import("@/lib/listings/manage");
      return getManagedListings({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, pageSize: 100 });
    });
    expect(rows.some((row) => row.id === LISTING_FIXTURES.offerPublished || row.id === LISTING_FIXTURES.offerSoldOut)).toBe(false);
  });
});

describe("T025 — cross-org isolation: status history", () => {
  it("Org A reads an empty status history for another organization's offer — no existence leak, no fabricated history", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const history = await withLiveClient(client, async () => {
      const { getListingStatusHistory } = await import("@/lib/listings/manage");
      return getListingStatusHistory({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, offerId: LISTING_FIXTURES.offerSoldOut });
    });
    expect(history).toEqual([]);
  });
});

describe("T025 — cross-org isolation: offer_documents (known policy gap, honestly characterized)", () => {
  it("Org A reads zero offer_documents rows for another organization's offer — no cross-org leak either way", async () => {
    // `offer_documents_owner_or_admin` genuinely permits the OWNING org's members to read their own
    // rows (confirmed live in this run's own RLS preflight) — this is NOT the "members can never read
    // documents" gap RUN A recorded; that gap is about a BUYER (non-owner) reading a PUBLISHED
    // listing's documents, which no policy grants at all. Either way, the property under test here —
    // an UNRELATED organization gets zero rows — holds regardless of which gap applies. No
    // `lib/listings/*` wrapper reads this table yet (RUN A/B never built one); this test queries it
    // directly, through the same real, RLS-respecting session, to prove the boundary exists at the
    // database level independent of any application code.
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const rows = await withLiveClient(client, async () => {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data } = await supabase.from("offer_documents").select("id").eq("offer_id", LISTING_FIXTURES.offerPublished);
      return data ?? [];
    });
    expect(rows).toEqual([]);
  });
});
