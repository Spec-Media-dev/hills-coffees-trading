import { describe, expect, it, vi } from "vitest";

/**
 * Feature 006 RUN B (T014) — the `eligible: true` happy path and the
 * `LISTING_COFFEE_CONTEXT_UNAVAILABLE` refusal, proven with module mocks in their OWN file (Vitest's
 * `vi.mock` hoists per-file, so these mocks of `@/lib/auth/dal`/`@/lib/inventory/positions`/
 * `@/lib/listings/eligibility` must never share a file with `create-action.test.ts`'s LIVE tests,
 * which need the REAL versions of all three).
 *
 * WHY THIS CANNOT BE LIVE (same reason as `eligibility.test.ts`'s own fake-client section): no
 * settled order exists in the live database, so no real inventory position ever has genuine
 * Hills-source provenance — `checkListingEligibility` therefore always refuses with
 * `NOT_HILLS_SOURCED` for any real position before this action's own `resolveCoffeeIdForLot` logic is
 * ever reached. This file proves that downstream logic exists and behaves correctly at the
 * application level; `create-action.test.ts` proves everything RLS/ownership can affect, live.
 */
const mocks = vi.hoisted(() => ({
  identity: null as unknown,
  position: null as unknown,
  eligibility: null as unknown,
  client: null as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/inventory/positions", () => ({ getInventoryPositionById: vi.fn(async () => mocks.position) }));
vi.mock("@/lib/listings/eligibility", () => ({ checkListingEligibility: vi.fn(async () => mocks.eligibility) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => mocks.client) }));

const sellerIdentity = {
  kind: "authenticated" as const,
  userId: "user-eligible-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-eligible", displayName: "Eligible Co", memberRole: "OWNER", canBuy: true, canSell: true },
};

const eligiblePosition = {
  id: "33333333-3333-4333-8333-333333333333",
  lotId: "lot-eligible-1",
  ownerOrganizationId: "org-eligible",
  warehouseId: "wh-eligible-1",
  warehouseLocationId: null,
  availableQuantityKg: 100,
  reservedQuantityKg: 20,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lot: null,
  warehouse: null,
};

function fakeReadWriteClient(config: { orderItemOfferId: string | null; originalOffer: { coffee_id: string; lot_id: string } | null; insertResult: { data: unknown; error: unknown } }) {
  return {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (table === "order_items") return { data: config.orderItemOfferId ? { offer_id: config.orderItemOfferId } : null, error: null };
              if (table === "coffee_offers") return { data: config.originalOffer, error: null };
              return { data: null, error: null };
            },
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => config.insertResult,
          }),
        }),
      };
    },
  };
}

const formDataFrom = (fields: Record<string, string>): FormData => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
};

describe("T014 — eligible/coffee-context paths (module mocks — see file header for why this cannot be live yet)", () => {
  it("eligible: true, coffee_id resolvable — creates the DRAFT with only the explicit allowlisted fields", async () => {
    mocks.identity = sellerIdentity;
    mocks.position = eligiblePosition;
    mocks.eligibility = { eligible: true, eligibleQuantityKg: 80, sourcePurchaseOrderItemId: "order-item-1" };
    mocks.client = fakeReadWriteClient({
      orderItemOfferId: "original-offer-1",
      originalOffer: { coffee_id: "coffee-1", lot_id: "lot-eligible-1" },
      insertResult: { data: { id: "new-offer-1", title: null, quantity_kg: 50, price_per_kg: 5, currency: "USD" }, error: null },
    });

    const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await createListingDraft(undefined, formDataFrom({ positionId: "33333333-3333-4333-8333-333333333333", quantityKg: "50", pricePerKg: "5", currency: "USD" }));

    expect(result).toEqual({
      ok: true,
      data: { id: "new-offer-1", title: null, quantityKg: 50, pricePerKg: 5, currency: "USD" },
    });
  });

  it("LISTING_COFFEE_CONTEXT_UNAVAILABLE — eligible, but the original listing's coffee_id cannot be recovered (the confirmed DB-OPEN-05 write gap)", async () => {
    mocks.identity = sellerIdentity;
    mocks.position = eligiblePosition;
    mocks.eligibility = { eligible: true, eligibleQuantityKg: 80, sourcePurchaseOrderItemId: "order-item-1" };
    mocks.client = fakeReadWriteClient({ orderItemOfferId: null, originalOffer: null, insertResult: { data: null, error: null } });

    const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await createListingDraft(undefined, formDataFrom({ positionId: "33333333-3333-4333-8333-333333333333", quantityKg: "50", pricePerKg: "5", currency: "USD" }));

    expect(result).toEqual({ ok: false, code: "listing_coffee_context_unavailable" });
  });

  it("a mismatched lot_id on the recovered original offer is rejected rather than trusted", async () => {
    mocks.identity = sellerIdentity;
    mocks.position = eligiblePosition;
    mocks.eligibility = { eligible: true, eligibleQuantityKg: 80, sourcePurchaseOrderItemId: "order-item-1" };
    mocks.client = fakeReadWriteClient({
      orderItemOfferId: "original-offer-1",
      originalOffer: { coffee_id: "coffee-1", lot_id: "some-other-lot" },
      insertResult: { data: null, error: null },
    });

    const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await createListingDraft(undefined, formDataFrom({ positionId: "33333333-3333-4333-8333-333333333333", quantityKg: "50", pricePerKg: "5", currency: "USD" }));

    expect(result).toEqual({ ok: false, code: "listing_coffee_context_unavailable" });
  });

  it("a database refusal at insert time (e.g. a trigger/unique-index conflict) maps to LISTING_SAVE_FAILED, never a raw error", async () => {
    mocks.identity = sellerIdentity;
    mocks.position = eligiblePosition;
    mocks.eligibility = { eligible: true, eligibleQuantityKg: 80, sourcePurchaseOrderItemId: "order-item-1" };
    mocks.client = fakeReadWriteClient({
      orderItemOfferId: "original-offer-1",
      originalOffer: { coffee_id: "coffee-1", lot_id: "lot-eligible-1" },
      insertResult: { data: null, error: { message: 'duplicate key value violates unique constraint "uq_active_offer_per_lot_owner"' } },
    });

    const { createListingDraft } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await createListingDraft(undefined, formDataFrom({ positionId: "33333333-3333-4333-8333-333333333333", quantityKg: "50", pricePerKg: "5", currency: "USD" }));

    expect(result).toEqual({ ok: false, code: "listing_save_failed" });
  });
});
