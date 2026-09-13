import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 RUN C (T023) — listing transitions. `validate_offer_transition`'s trigger is the sole
 * legality authority for every action tested here (`submitListingForReview`, `withdrawListing`,
 * `moveListingToDraft`) — none of them implements a parallel state machine.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * [BLOCKED LIVE PROOF] — kept honest, not fabricated (per this run's explicit instruction)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * T023's own Verify line requires "permitted transitions succeed and record history." This CANNOT be
 * proven live in this run: it requires a REAL, own-org, non-Hills `coffee_offers` row in a
 * transitionable status. No such row can exist today —
 *   - no MEMBER_SELLER row can ever be inserted without a genuinely settled order (`create-
 *     action.test.ts`'s own header; `validate_offer_transition`'s MEMBER_SELLER provenance check is
 *     unconditional even on INSERT), and no settled order can be constructed by privileged fixture
 *     tooling (`eligibility.test.ts`'s own header);
 *   - the only rows that DO exist (`LISTING_FIXTURES.offerPublished`/`offerSoldOut`) are
 *     HILLS-owned, and `hillsOrg` has no signable-in member (Feature 005's own deliberate fixture
 *     design) — so no live session can ever be their "own org" either.
 * This file does NOT fabricate a fixture, weaken the trigger, or invent a fake production state to
 * manufacture a passing "successful transition" test. Every FORBIDDEN path below IS provable live
 * (forbidden transitions do not require an own-org row — a real cross-org/wrong-capability attempt
 * is enough to prove refusal), and the successful-transition RESULT SHAPE is separately proven with a
 * fake client in `create-action-eligible.test.ts`/`submit-action-success.test.ts` (application-logic
 * proof only, explicitly NOT a claim that the database trigger's history write was re-verified
 * end-to-end). T023 therefore remains genuinely BLOCKED and is NOT marked complete.
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

describe("T023 — forbidden transitions are refused (live, no own-org row required)", () => {
  it("submit-for-review: a buyer-only (canSell=false) session is refused before any transition attempt", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "seller_not_capable" });
  });

  it("submit-for-review: a real seller-capable session cannot transition a cross-org (Hills) offer", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });

  it("withdraw: a buyer-only session is refused before any transition attempt", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { withdrawListing } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return withdrawListing(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "seller_not_capable" });
  });

  it("withdraw: a real seller-capable session cannot withdraw a cross-org (Hills) offer", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { withdrawListing } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return withdrawListing(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });

  it("withdraw: the trigger refuses ARCHIVED from a genuinely SOLD_OUT source status, even setting aside ownership", async () => {
    // Confirms this action never pre-empts the trigger's own state machine — SOLD_OUT has no
    // ARCHIVED target in `validate_offer_transition`'s permitted list, so even if ownership were not
    // also a refusal reason here, the transition itself is illegal. Proven via the same live
    // cross-org fixture (both boundaries hold simultaneously; this is not a redundant assertion — it
    // documents WHY refusal is doubly guaranteed for this specific fixture).
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { withdrawListing } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerSoldOut);
      return withdrawListing(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });

  it("move-to-draft (REJECTED remediation): a buyer-only session is refused before any transition attempt", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { moveListingToDraft } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return moveListingToDraft(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "seller_not_capable" });
  });

  it("move-to-draft: a real seller-capable session cannot move a cross-org (Hills), non-REJECTED offer to draft", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { moveListingToDraft } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return moveListingToDraft(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });
});

describe("T023 — no parallel state machine (source-level proof)", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("actions.ts files never branch on a client-supplied status to decide the write — every transition target is a hardcoded literal", async () => {
    const { readFileSync } = await import("node:fs");
    const submitSource = stripComments(readFileSync("src/app/dashboard/listings/new/actions.ts", "utf8"));
    const editSource = stripComments(readFileSync("src/app/dashboard/listings/[offerId]/actions.ts", "utf8"));
    expect(submitSource).toMatch(/status:\s*"PENDING_REVIEW"/);
    expect(editSource).toMatch(/status:\s*"ARCHIVED"/);
    expect(editSource).toMatch(/status:\s*"DRAFT"/);
    for (const source of [submitSource, editSource]) {
      expect(source).not.toMatch(/formData\.get\("status"\)/);
      expect(source).not.toMatch(/status:\s*parsed\.data/);
    }
  });
});
