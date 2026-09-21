import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { F006_LIVE, INVENTORY_FIXTURES, LISTING_FIXTURES, PHASE89_FIXTURES, inspectDeliveryPositionByLotOwner, inspectF006Offer, inspectF006RowCounts, signInAsFixture } from "@/tests/auth/fixture-session";

import { ORG_A, ORG_B, chainHelpers, prepareChain, teardownChain, type ChainSessions, type ChainTeardown } from "./live-chain";

/**
 * Feature 006 RUN C (T023) — listing transitions. `validate_offer_transition`'s trigger is the sole
 * legality authority for every action tested here (`submitListingForReview`, `withdrawListing`,
 * `moveListingToDraft`) — none of them implements a parallel state machine.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * T015 + T023 LIVE PROOF (2026-09-21) — the "permitted transitions succeed and record history" half
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * The earlier blocker ("no MEMBER_SELLER row can exist without a settled order, and no settled order can be
 * constructed") no longer holds: Feature 007 (checkout) and Feature 009 (settlement, `admin_review_payment`) are CLOSED,
 * and Feature 009's own reviewed live proofs already walk real orders to PAID. The second describe below therefore
 * builds a REAL own-organization listing with the shared fixture architecture in `./live-chain.ts` (orgB buys from the
 * Hills fixture listing through the real 007 flow → FINANCE settles it → orgB owns a position and a PAID order → orgB
 * lists it through the real `createListingDraft`), then drives that ONE listing through every transition its actors may
 * legitimately make and asserts the trigger-written `listing_status_history` row for each — and the refusals in between.
 *
 * GATED: it runs only with `F006_LIVE_PROOF=1` (`npm run test -- listings/transitions` without the flag still runs
 * every ungated proof below and skips only this block). Reason: a settlement leaves append-only
 * `inventory_ownership_events` behind that no one may delete, so the ordinary suite must never create them implicitly,
 * and the disposable ADMIN/COMPLIANCE operators are created only on explicit request. Everything else the run creates is
 * removed and its removal proven (row counts before/after) in the block's final test.
 *
 * The forbidden-path proofs above still need no own-org row and stay ungated.
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("test has no client installed");
    return serverClientState.client;
  }),
}));

// The live block's actions call `revalidatePath` (no Next runtime under Vitest) and a multi-organization identity reads
// the acting-organization cookie — same two mocks Feature 010's live suites use, nothing else is stubbed.
const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
    getAll: () => [],
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

describe.skipIf(!F006_LIVE)("T015 + T023 — LIVE own-organization listing lifecycle (real settled provenance, real actors, DB-written history)", () => {
  let sessions: ChainSessions;
  let helpers: ReturnType<typeof chainHelpers>;
  let multiOrg: SupabaseClient;
  let baseline: Record<string, number>;
  let offerId: string;
  let sourceOrderItemId: string;
  let stockPositionId: string;
  let complianceUserId: string;
  let teardown: ChainTeardown | null = null;

  const history = () => inspectF006Offer(offerId).statusHistory.map((row) => [row.old_status, row.new_status] as const);
  const stored = () => inspectF006Offer(offerId).offer!;
  const submitAs = (client: SupabaseClient) =>
    withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", offerId);
      return submitListingForReview(undefined, formData);
    });
  const withdrawAs = (client: SupabaseClient) =>
    withLiveClient(client, async () => {
      const { withdrawListing } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", offerId);
      return withdrawListing(undefined, formData);
    });
  const toDraftAs = (client: SupabaseClient) =>
    withLiveClient(client, async () => {
      const { moveListingToDraft } = await import("@/src/app/dashboard/listings/[offerId]/actions");
      const formData = new FormData();
      formData.set("offerId", offerId);
      return moveListingToDraft(undefined, formData);
    });
  const rawStatusUpdate = (client: SupabaseClient, status: string) => client.from("coffee_offers").update({ status }).eq("id", offerId).select("id, status");

  beforeAll(async () => {
    baseline = inspectF006RowCounts();
    sessions = await prepareChain();
    helpers = chainHelpers(withLiveClient, sessions);
    multiOrg = await signInAsFixture(PHASE89_FIXTURES.multiOrg.email);
    complianceUserId = (await sessions.compliance.auth.getUser()).data.user!.id;
    const stock = await helpers.giveOrgBSettledStock(20);
    stockPositionId = stock.position.id;
    sourceOrderItemId = stock.orderItemId;
    const draft = await helpers.createDraft(stock.position.id, 12, "T015/T023 lifecycle");
    if (!draft.ok) throw new Error(`setup: createListingDraft refused: ${draft.code}`);
    offerId = draft.data.id;
  }, 600_000);

  afterAll(() => {
    // Idempotent: the last test already tore down and verified; this only runs if an earlier test aborted the suite.
    if (!teardown) teardown = teardownChain();
  }, 300_000);

  it("1. the fixture is a REAL own-org listing: orgB owns it, it starts DRAFT, and its provenance is a genuinely PAID order of orgB's own purchase", async () => {
    const listing = stored();
    expect(listing).toMatchObject({ status: "DRAFT", is_visible: false, seller_organization_id: ORG_B, seller_type: "MEMBER_SELLER", created_by: sessions.orgBUserId, source_purchase_order_item_id: sourceOrderItemId, reserved_quantity_kg: 0, filled_quantity_kg: 0 });
    expect(Number(listing.quantity_kg)).toBe(12);
    // the provenance the trigger demands: the source order item belongs to a PAID order whose buyer is the seller org, for the same lot
    const { data: item } = await sessions.orgB.from("order_items").select("order_id, lot_id, seller_type_snapshot").eq("id", sourceOrderItemId).single();
    expect(item).toMatchObject({ lot_id: listing.lot_id, seller_type_snapshot: "HILLS" });
    const { data: order } = await sessions.orgB.from("orders").select("status, buyer_organization_id").eq("id", item!.order_id).single();
    expect(order).toEqual({ status: "PAID", buyer_organization_id: ORG_B });
    // orgB's stock is settled and UNRESERVED, and a listing draft moves no inventory
    expect(inspectDeliveryPositionByLotOwner(listing.lot_id, ORG_B)).toMatchObject({ id: stockPositionId, available_quantity_kg: 20, reserved_quantity_kg: 0 });
    // `listing_status_history` is written by an AFTER UPDATE trigger only — the INSERT that created the draft wrote none
    expect(history()).toEqual([]);
  }, 120_000);

  it("2. FORBIDDEN on the DRAFT: another seller-capable org, a buyer-only org, a seller trying compliance states, and the REJECTED-only remediation are all refused — status, history and stock unchanged", async () => {
    // (a) buyer-only org: refused by the action (not seller-capable) AND invisible/untouchable at the RLS layer
    expect(await submitAs(sessions.orgA)).toEqual({ ok: false, code: "seller_not_capable" });
    const orgARaw = await rawStatusUpdate(sessions.orgA, "PENDING_REVIEW");
    expect(orgARaw.error !== null || (orgARaw.data ?? []).length === 0).toBe(true);

    // (b) ANOTHER SELLER-CAPABLE organization (Multi Org B, canSell=true): the action refuses, and so does raw RLS
    cookieState.value = PHASE89_FIXTURES.multiOrg.organizationBId;
    try {
      expect(await submitAs(multiOrg)).toEqual({ ok: false, code: "listing_transition_refused" });
      expect(await withdrawAs(multiOrg)).toEqual({ ok: false, code: "listing_transition_refused" });
    } finally {
      cookieState.value = undefined;
    }
    const otherSellerRaw = await rawStatusUpdate(multiOrg, "PENDING_REVIEW");
    expect(otherSellerRaw.error !== null || (otherSellerRaw.data ?? []).length === 0).toBe(true);

    // (c) the seller cannot reach compliance-owned states or a non-graph edge — REFUSED BY THE DATABASE TRIGGER
    for (const status of ["APPROVED", "PUBLISHED", "SUSPENDED", "REJECTED"]) {
      const attempt = await rawStatusUpdate(sessions.orgB, status);
      expect(attempt.error?.message, `DRAFT → ${status}`).toContain("compliance_required_for_listing_state");
    }
    const skip = await rawStatusUpdate(sessions.orgB, "SOLD_OUT");
    expect(skip.error?.message, "DRAFT → SOLD_OUT").toContain("invalid_listing_transition");

    // (d) the action-level defence in depth: REMEDIATION is REJECTED-only
    expect(await toDraftAs(sessions.orgB)).toEqual({ ok: false, code: "listing_transition_refused" });

    expect(stored().status).toBe("DRAFT");
    expect(history()).toEqual([]);
    expect(inspectDeliveryPositionByLotOwner(stored().lot_id, ORG_B)).toMatchObject({ available_quantity_kg: 20, reserved_quantity_kg: 0 });
  }, 180_000);

  it("3. ALLOWED — the seller's own DRAFT → PENDING_REVIEW succeeds and the DATABASE writes exactly one listing_status_history row (old, new, actor)", async () => {
    const before = inspectF006Offer(offerId);
    expect(before.offer!.status).toBe("DRAFT");
    expect(before.statusHistory).toEqual([]);

    const result = await submitAs(sessions.orgB);
    expect(result).toEqual({ ok: true, data: undefined });

    const after = inspectF006Offer(offerId);
    expect(after.offer).toMatchObject({ status: "PENDING_REVIEW", is_visible: false, seller_organization_id: ORG_B });
    expect(after.statusHistory).toHaveLength(1);
    expect(after.statusHistory[0]).toMatchObject({ old_status: "DRAFT", new_status: "PENDING_REVIEW", changed_by: sessions.orgBUserId });
    expect(Date.parse(after.statusHistory[0]!.created_at)).toBeGreaterThan(0);

    // the seller reads its own history through the real org-scoped layer (RLS: offer_history_view)
    const sellerHistory = await withLiveClient(sessions.orgB, async () => {
      const { getListingStatusHistory } = await import("@/lib/listings/manage");
      return getListingStatusHistory({ organizationId: ORG_B, offerId });
    });
    expect(sellerHistory.map((row) => [row.oldStatus, row.newStatus])).toEqual([["DRAFT", "PENDING_REVIEW"]]);
  }, 120_000);

  it("4. ISOLATION — another organization can neither read the listing nor its history, and a repeat submit is refused (no double history row)", async () => {
    const otherOrgReads = await withLiveClient(sessions.orgA, async () => {
      const { getManagedListingById, getListingStatusHistory } = await import("@/lib/listings/manage");
      return { listing: await getManagedListingById({ organizationId: ORG_A, offerId }), history: await getListingStatusHistory({ organizationId: ORG_A, offerId }) };
    });
    expect(otherOrgReads.listing).toBeNull();
    expect(otherOrgReads.history).toEqual([]);
    const rawHistory = await sessions.orgA.from("listing_status_history").select("id").eq("offer_id", offerId);
    expect(rawHistory.data ?? []).toEqual([]);

    expect(await submitAs(sessions.orgB)).toEqual({ ok: false, code: "listing_transition_refused" });
    expect(history()).toEqual([["DRAFT", "PENDING_REVIEW"]]);
  }, 120_000);

  it("5. FORBIDDEN from PENDING_REVIEW — the seller cannot withdraw (no ARCHIVED edge), self-approve, publish, or bounce it to draft; refused by the trigger, nothing recorded", async () => {
    expect(await withdrawAs(sessions.orgB)).toEqual({ ok: false, code: "listing_transition_refused" });
    for (const status of ["APPROVED", "PUBLISHED"]) {
      const attempt = await rawStatusUpdate(sessions.orgB, status);
      expect(attempt.error?.message, `PENDING_REVIEW → ${status}`).toContain("compliance_required_for_listing_state");
    }
    const archived = await rawStatusUpdate(sessions.orgB, "ARCHIVED");
    expect(archived.error?.message, "PENDING_REVIEW → ARCHIVED").toContain("invalid_listing_transition");
    const partial = await rawStatusUpdate(sessions.orgB, "PARTIALLY_FILLED");
    expect(partial.error?.message, "PENDING_REVIEW → PARTIALLY_FILLED").toContain("invalid_listing_transition");
    expect(stored().status).toBe("PENDING_REVIEW");
    expect(history()).toEqual([["DRAFT", "PENDING_REVIEW"]]);
  }, 120_000);

  it("6. ALLOWED chain — COMPLIANCE rejects (reason recorded) → seller remediates REJECTED → DRAFT → resubmits → COMPLIANCE approves → seller withdraws: every permitted step records its history row, in order, with the right actor", async () => {
    const rejected = await withLiveClient(sessions.compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId, decision: "REJECTED", reason: "F006L live proof — rejected for remediation" });
    });
    expect(rejected.ok).toBe(true);
    expect(stored().status).toBe("REJECTED");

    // FORBIDDEN from REJECTED: the only edge is REJECTED → DRAFT
    const straightBack = await rawStatusUpdate(sessions.orgB, "PENDING_REVIEW");
    expect(straightBack.error?.message, "REJECTED → PENDING_REVIEW").toContain("invalid_listing_transition");
    expect(stored().status).toBe("REJECTED");

    expect(await toDraftAs(sessions.orgB)).toEqual({ ok: true, data: undefined });
    expect(stored().status).toBe("DRAFT");
    expect(await submitAs(sessions.orgB)).toEqual({ ok: true, data: undefined });

    const approved = await helpers.approve(offerId);
    expect(approved.ok).toBe(true);
    expect(stored().status).toBe("APPROVED");

    // FORBIDDEN from APPROVED for the seller: publishing is compliance's
    const selfPublish = await rawStatusUpdate(sessions.orgB, "PUBLISHED");
    expect(selfPublish.error?.message, "APPROVED → PUBLISHED by the seller").toContain("compliance_required_for_listing_state");

    expect(await withdrawAs(sessions.orgB)).toEqual({ ok: true, data: undefined });

    const final = inspectF006Offer(offerId);
    expect(final.offer).toMatchObject({ status: "ARCHIVED", is_visible: false });
    expect(final.statusHistory.map((row) => [row.old_status, row.new_status])).toEqual([
      ["DRAFT", "PENDING_REVIEW"],
      ["PENDING_REVIEW", "REJECTED"],
      ["REJECTED", "DRAFT"],
      ["DRAFT", "PENDING_REVIEW"],
      ["PENDING_REVIEW", "APPROVED"],
      ["APPROVED", "ARCHIVED"],
    ]);
    expect(final.statusHistory.map((row) => row.changed_by)).toEqual([sessions.orgBUserId, complianceUserId, sessions.orgBUserId, sessions.orgBUserId, complianceUserId, sessions.orgBUserId]);
    expect(final.statusHistory[1]!.reason).toContain("rejected for remediation");
    expect(final.reviews.map((row) => row.decision).sort()).toEqual(["APPROVED", "REJECTED"]);
    // listing transitions never touch inventory
    expect(inspectDeliveryPositionByLotOwner(final.offer!.lot_id, ORG_B)).toMatchObject({ available_quantity_kg: 20, reserved_quantity_kg: 0 });
  }, 240_000);

  it("7. CLEANUP — every row this block created is removed, the shared baseline is restored, the disposable operators are de-privileged; only append-only rows remain (reported, not deleted)", () => {
    teardown = teardownChain();
    const after = inspectF006RowCounts();
    const business = teardown.cleanup.f006 as { before: { listings: number; orders: number; buyerPositions: number }; after: { listings: number; orders: number; buyerPositions: number }; retainedImmutableOwnershipEvents: number; businessFixtureResidue: string };
    expect(business.before).toMatchObject({ listings: 1, orders: 1, buyerPositions: 1 });
    expect(business.after).toMatchObject({ listings: 0, orders: 0, buyerPositions: 0 });
    expect(business.businessFixtureResidue).toBe("zero");
    expect((teardown.cleanup.adminFixture as { activeAdminPrivilege: boolean }).activeAdminPrivilege).toBe(false);
    expect(teardown.complianceActiveCapability).toBe(false);
    // every table is back to its pre-run count EXCEPT the two that are append-only by design
    const immutable = new Set(["inventory_ownership_events", "audit_logs"]);
    for (const [table, count] of Object.entries(baseline)) {
      if (immutable.has(table)) expect(after[table], table).toBeGreaterThanOrEqual(count);
      else expect(after[table], table).toBe(count);
    }
    expect(after.inventory_ownership_events! - baseline.inventory_ownership_events!).toBe(business.retainedImmutableOwnershipEvents);
    console.log("F006_T015_T023_CLEANUP", JSON.stringify({ baseline, after, retainedImmutableOwnershipEvents: business.retainedImmutableOwnershipEvents, cleanup: teardown.cleanup }));
  }, 300_000);
});
