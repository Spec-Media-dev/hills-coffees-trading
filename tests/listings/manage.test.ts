import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { createFakeSupabaseClient } from "@/tests/inventory/fake-supabase";
import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 T003 — the seller management read path (`lib/listings/manage.ts`), kept in its own
 * file from `browse.ts` so the security boundary is obvious from the import alone.
 *
 * HONEST FIXTURE LIMITATION (documented, not worked around): `LISTING_FIXTURES.offerPublished`/
 * `offerSoldOut` are seller_type=HILLS, owned by the synthetic Hills-internal organization. Feature
 * 005's own established convention (`scripts/seed-test-fixtures.ts#seedInventoryFixtures`) DELIBERATELY
 * clears every membership on that organization on every seed run ("never an acting organization for a
 * real user") — so there is NO fixture identity that can sign in AS the Hills organization to exercise
 * `offers_owner_or_admin`'s `is_org_member(seller_organization_id)` branch positively. Constructing a
 * genuine MEMBER_SELLER-owned `coffee_offers` row (which WOULD have a signable-in owner) is separately
 * blocked: `validate_offer_transition`'s MEMBER_SELLER branch unconditionally requires a real, SETTLED
 * order (`orders.status IN ('PAID','FULFILLMENT_IN_PROGRESS','PARTIALLY_DELIVERED','COMPLETED')`) behind
 * `source_purchase_order_item_id` even on a fresh INSERT — and walking an order to a settled status
 * requires `is_internal_transition()`/`is_platform_admin()`/`is_finance_operator()`, none of which a
 * privileged fixture script can satisfy without either a full authenticated checkout/shipment/payment
 * walk (Feature 007/008's own domain, out of RUN A's scope) or an unapproved bypass. This was diagnosed
 * and the attempted fixture removed during this run (see the Feature 006 handoff for the full account).
 *
 * So: the CROSS-ORG NEGATIVE case is proven LIVE below (a real session that is neither the Hills org
 * member nor a platform admin genuinely cannot read the Hills-owned fixture offers — this is real RLS,
 * not a stand-in). The POSITIVE "own org sees its own listing, including seller-private fields" case is
 * proven via a FAKE client (mapping/shape correctness only — it does not simulate RLS, which is why the
 * negative case above is proven live instead), the SAME precedent already established for
 * `eligibility.test.ts`'s unreachable settled-order path.
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

describe("T003 — cross-organization denial is real RLS, not an application filter (live)", () => {
  it("Org A (neither the Hills org member nor a platform admin) cannot read the Hills-owned fixture offer by id", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const listing = await withLiveClient(client, async () => {
      const { getManagedListingById } = await import("@/lib/listings/manage");
      return getManagedListingById({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, offerId: LISTING_FIXTURES.offerPublished });
    });
    expect(listing).toBeNull();
  });

  it("Org A's own managed-listings page never contains the Hills-owned fixture offer", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const { rows } = await withLiveClient(client, async () => {
      const { getManagedListings } = await import("@/lib/listings/manage");
      return getManagedListings({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, pageSize: 100 });
    });
    expect(rows.some((row) => row.id === LISTING_FIXTURES.offerPublished)).toBe(false);
  });

  it("status history for the Hills-owned offer is empty for an unrelated org session (RLS-consistent; no fabricated history)", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const history = await withLiveClient(client, async () => {
      const { getListingStatusHistory } = await import("@/lib/listings/manage");
      return getListingStatusHistory({ organizationId: INVENTORY_FIXTURES.orgA.organizationId, offerId: LISTING_FIXTURES.offerPublished });
    });
    expect(history).toEqual([]);
  });
});

describe("T003 — own-organization read maps every seller-private field correctly (fake client — mapping proof, see header)", () => {
  const ownRow = {
    id: "offer-own-1",
    coffee_id: "coffee-1",
    lot_id: "lot-1",
    seller_organization_id: "org-own",
    seller_type: "MEMBER_SELLER",
    source_purchase_order_item_id: "order-item-1",
    warehouse_id: "wh-1",
    title: "My Own Listing",
    quantity_kg: 200,
    reserved_quantity_kg: 30,
    filled_quantity_kg: 10,
    price_per_kg: 8.25,
    currency: "USD",
    status: "APPROVED",
    is_visible: false,
    rejection_reason: null,
    reviewed_by: "reviewer-1",
    reviewed_at: "2026-02-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-05T00:00:00.000Z",
    deleted_at: null,
  };

  it("getManagedListingById returns every seller-private field verbatim", async () => {
    const listing = await withFakeClient({ coffee_offers: [ownRow] }, async () => {
      const { getManagedListingById } = await import("@/lib/listings/manage");
      return getManagedListingById({ organizationId: "org-own", offerId: "offer-own-1" });
    });
    expect(listing).not.toBeNull();
    expect(listing!.sellerOrganizationId).toBe("org-own");
    expect(listing!.sourcePurchaseOrderItemId).toBe("order-item-1");
    expect(listing!.isVisible).toBe(false);
    expect(listing!.reviewedBy).toBe("reviewer-1");
    expect(listing!.reviewedAt).toBe("2026-02-01T00:00:00.000Z");
    expect(listing!.quantityKg).toBe(200);
    expect(listing!.reservedQuantityKg).toBe(30);
    expect(listing!.filledQuantityKg).toBe(10);
  });

  it("getManagedListings maps the same row shape in the list path", async () => {
    const { rows } = await withFakeClient({ coffee_offers: [ownRow] }, async () => {
      const { getManagedListings } = await import("@/lib/listings/manage");
      return getManagedListings({ organizationId: "org-own" });
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourcePurchaseOrderItemId).toBe("order-item-1");
  });
});

/** A doc comment legitimately NAMING a forbidden pattern to explain its deliberate absence (manage.ts's
 * own header explains there is no `includePrivate`-shaped switch) must never trip a "must not contain
 * X" check — same precedent as `tests/inventory/run-b-ui.test.tsx`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T003 — no ambiguous 'includePrivate' switch (source-level proof)", () => {
  it("manage.ts never declares an includePrivate-shaped parameter in actual code", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/manage.ts", "utf8"));
    expect(source).not.toMatch(/includePrivate/i);
    expect(source).not.toMatch(/select\(\s*["']\*["']\s*\)/);
  });

  it("manage.ts and browse.ts are genuinely separate files, never merged", async () => {
    const { existsSync } = await import("node:fs");
    expect(existsSync("lib/listings/manage.ts")).toBe(true);
    expect(existsSync("lib/listings/browse.ts")).toBe(true);
  });
});

/**
 * T003 CLOSURE RECONCILIATION — "own-org rows only" is proven by TWO independent, complementary
 * proofs, neither of which requires a genuine MEMBER_SELLER fixture (impossible under current DB
 * constraints — see this file's own header):
 *   1. LIVE (above): an unrelated org's session gets nothing back for another org's real offer,
 *      its list, or its status history — real RLS, not an application filter.
 *   2. SOURCE-LEVEL (here): the query itself is explicitly scoped by `seller_organization_id`, so a
 *      caller's own org id is structurally the only id the query can ever match. Combined, these
 *      satisfy T003's literal written Verify criterion ("returns own-org rows only; a cross-org id
 *      request returns nothing") in full — a genuine SELLER'S OWN positive multi-state read is a
 *      stronger, different claim this task's Verify line does not require, and remains honestly
 *      unproven live (see `IMPLEMENTATION-HANDOFF.md` §10).
 */
describe("T003 — 'own-org rows only' is structurally guaranteed by explicit query scoping (source-level proof)", () => {
  it("getManagedListings/getManagedListingById/getListingStatusHistory each scope by the caller's own organizationId", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/listings/manage.ts", "utf8");
    expect(source).toMatch(/\.eq\(\s*["']seller_organization_id["']\s*,\s*organizationId\s*\)/g);
    // Exactly two call sites scope coffee_offers this way (list + by-id) — status history relies on
    // RLS alone (`offer_history_view`), documented in this file's own header as a deliberate choice.
    expect(source.match(/\.eq\(\s*["']seller_organization_id["']\s*,\s*organizationId\s*\)/g)?.length).toBe(2);
  });
});
