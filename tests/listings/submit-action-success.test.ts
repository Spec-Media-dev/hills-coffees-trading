import { describe, expect, it, vi } from "vitest";

/**
 * Feature 006 RUN B (T015) — the successful `DRAFT -> PENDING_REVIEW` path, proven with module mocks
 * in its own file (same `vi.mock` per-file hoisting reason `create-action-eligible.test.ts`
 * documents).
 *
 * WHY THIS CANNOT BE LIVE: submitting requires a REAL, own-org DRAFT `coffee_offers` row. No such row
 * can exist live for the SAME root cause `create-action.test.ts`/`eligibility.test.ts` already
 * established (no settled order exists, so no MEMBER_SELLER row can ever be inserted, fixture or
 * otherwise — `validate_offer_transition`'s MEMBER_SELLER provenance check is unconditional even on
 * INSERT) — AND, separately, even a HILLS-seller DRAFT row could not be submitted by a real session
 * either, because `hillsOrg` has no signable-in member (Feature 005's own deliberate fixture design).
 * This file proves the ACTION's OWN logic (the update chain, the result shape) is correct; it does
 * NOT and cannot prove the database trigger's `listing_status_history` write end-to-end — that
 * remains an honest, open verification gap, recorded in the Feature 006 handoff, until a future run
 * produces a genuinely submittable listing.
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mocks = vi.hoisted(() => ({ identity: null as unknown, client: null as unknown }));

vi.mock("@/lib/auth/dal", () => ({ getRequestIdentity: vi.fn(async () => mocks.identity) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => mocks.client) }));

const sellerIdentity = {
  kind: "authenticated" as const,
  userId: "user-eligible-1",
  isAuthorizedMember: true,
  organization: { organizationId: "org-eligible", displayName: "Eligible Co", memberRole: "OWNER", canBuy: true, canSell: true },
};

function fakeUpdateClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => result,
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe("T015 — submitListingForReview success path (module mock)", () => {
  it("a real DRAFT own-org row that the database accepts transitions successfully", async () => {
    mocks.identity = sellerIdentity;
    mocks.client = fakeUpdateClient({ data: { id: "offer-1", status: "PENDING_REVIEW" }, error: null });

    const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
    const formData = new FormData();
    formData.set("offerId", "offer-1");
    const result = await submitListingForReview(undefined, formData);

    expect(result).toEqual({ ok: true, data: undefined });
  });

  it("a zero-row update result (RLS/status/ownership mismatch) is refused, never treated as a silent success", async () => {
    mocks.identity = sellerIdentity;
    mocks.client = fakeUpdateClient({ data: null, error: null });

    const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
    const formData = new FormData();
    formData.set("offerId", "offer-1");
    const result = await submitListingForReview(undefined, formData);

    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });
});
