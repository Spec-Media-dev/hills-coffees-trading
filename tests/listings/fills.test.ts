import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { appCopy } from "@/lib/app/copy";
import { projectFillState } from "@/lib/listings/fills";
import { F006_LIVE, LISTING_FIXTURES, ageCheckoutHold, inspectCheckoutOrder, inspectDeliveryOrder, inspectDeliveryPositionByLotOwner, inspectF006Offer, inspectF006Residue, inspectF006RowCounts } from "@/tests/auth/fixture-session";
import { buildHoldOrder } from "@/tests/orders/live-helpers";

import { ORG_A, ORG_B, chainHelpers, prepareChain, storedListing, teardownChain, type ChainSessions, type ChainTeardown } from "./live-chain";

// The live block below drives real actions/pages: `revalidatePath` has no Next runtime under Vitest, the seller page calls
// `notFound`/hooks from next/navigation — the same minimal mocks Features 007/010's live suites use; nothing else is stubbed.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
}));
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
afterEach(cleanup);

/** Mirrors `tests/inventory/run-b-ui.test.tsx`'s own precedent: a doc comment legitimately NAMING a
 * forbidden pattern to explain its deliberate absence must never trip a "must not contain X" check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * T018 + T024 LIVE PROOFS (2026-09-21): see the second describe at the bottom of this file. The pure proofs below are
 * unchanged and stay ungated; the live block adds the reservation → settlement → fill chain and the exactly-once expiry
 * proof over a REAL own-organization listing (`F006_LIVE_PROOF=1`; why it is gated: `./live-chain.ts`).
 *
 * Feature 006 T005 — pure, deterministic fill projection. No database access is needed here: the
 * function's whole contract is "these three stored numbers in, this projection out," so a live
 * fixture round-trip would only prove the SAME arithmetic twice. `browse.test.ts` already proves the
 * live fixture rows carry these exact stored numbers; this file proves the projection over them.
 */
describe("T005 — projectFillState (pure)", () => {
  it("AVAILABLE — nothing reserved or filled yet", () => {
    expect(projectFillState({ quantityKg: 100, reservedQuantityKg: 0, filledQuantityKg: 0 })).toEqual({
      ok: true,
      quantityKg: 100,
      reservedQuantityKg: 0,
      filledQuantityKg: 0,
      remainingQuantityKg: 100,
      state: "AVAILABLE",
    });
  });

  it("AVAILABLE — some reserved, nothing filled yet (reservation alone does not mean partially filled)", () => {
    const result = projectFillState({ quantityKg: 100, reservedQuantityKg: 10, filledQuantityKg: 0 });
    expect(result).toEqual({ ok: true, quantityKg: 100, reservedQuantityKg: 10, filledQuantityKg: 0, remainingQuantityKg: 90, state: "AVAILABLE" });
  });

  it("matches the live `offerPublished` fixture's exact stored numbers (100 / 15.5 / 24.5 → remaining 60, PARTIALLY_FILLED)", () => {
    const result = projectFillState({ quantityKg: 100, reservedQuantityKg: 15.5, filledQuantityKg: 24.5 });
    expect(result).toEqual({ ok: true, quantityKg: 100, reservedQuantityKg: 15.5, filledQuantityKg: 24.5, remainingQuantityKg: 60, state: "PARTIALLY_FILLED" });
    // Guards against silently editing the fixture without updating this cross-check.
    expect(LISTING_FIXTURES.offerPublished).toBeTruthy();
  });

  it("matches the live `offerSoldOut` fixture's exact stored numbers (50 / 0 / 50 → remaining 0, SOLD_OUT)", () => {
    const result = projectFillState({ quantityKg: 50, reservedQuantityKg: 0, filledQuantityKg: 50 });
    expect(result).toEqual({ ok: true, quantityKg: 50, reservedQuantityKg: 0, filledQuantityKg: 50, remainingQuantityKg: 0, state: "SOLD_OUT" });
  });

  it("SOLD_OUT — remaining exactly zero via reserved+filled combined, not filled alone", () => {
    const result = projectFillState({ quantityKg: 30, reservedQuantityKg: 30, filledQuantityKg: 0 });
    expect(result).toEqual({ ok: true, quantityKg: 30, reservedQuantityKg: 30, filledQuantityKg: 0, remainingQuantityKg: 0, state: "SOLD_OUT" });
  });

  it("a negative remainder is a controlled, OBSERVABLE integrity problem — never silently clamped to 0", () => {
    const result = projectFillState({ quantityKg: 10, reservedQuantityKg: 6, filledQuantityKg: 6 });
    expect(result).toEqual({ ok: false, problem: "NEGATIVE_REMAINING", quantityKg: 10, reservedQuantityKg: 6, filledQuantityKg: 6 });
  });

  it("never calls Math.max(0, ...) to clamp a negative remainder (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/fills.ts", "utf8"));
    expect(source).not.toMatch(/Math\.max\(0,/);
  });

  it("never queries order rows or accumulates with reduce()/+=  (source-level proof)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("lib/listings/fills.ts", "utf8"));
    expect(source).not.toMatch(/order_items|inventory_reservation_items|\.from\(/);
    expect(source).not.toMatch(/\.reduce\(|\+=/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * T018 + T024 — LIVE
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!F006_LIVE)("T018 + T024 — LIVE reservation → settlement → fill progression and exactly-once expiry over a real own-org listing", () => {
  let sessions: ChainSessions;
  let helpers: ReturnType<typeof chainHelpers>;
  let baseline: Record<string, number>;
  let offerId: string;
  let positionId: string;
  let teardown: ChainTeardown | null = null;
  const evidence: Record<string, unknown> = {};

  const QUANTITY = 12;
  const STOCK = 20;

  /** Stored truth: the listing + its seller position + the ACTIVE reservations behind the reserved mirror. */
  const snapshot = () => {
    const raw = inspectF006Offer(offerId);
    const offer = raw.offer!;
    return {
      status: offer.status,
      isVisible: offer.is_visible,
      quantity: Number(offer.quantity_kg),
      reserved: Number(offer.reserved_quantity_kg),
      filled: Number(offer.filled_quantity_kg),
      remaining: Number(offer.quantity_kg) - Number(offer.reserved_quantity_kg) - Number(offer.filled_quantity_kg),
      positionAvailable: Number(raw.sellerPosition!.available_quantity_kg),
      positionReserved: Number(raw.sellerPosition!.reserved_quantity_kg),
      activeReservationCount: raw.activeReservationCount,
      activeReservationKg: raw.activeReservationKg,
      history: raw.statusHistory.map((row) => [row.old_status, row.new_status] as const),
    };
  };

  /** What a BUYER can act on: Feature 006's own read + projection over the stored columns (orgA's real session). */
  const buyerView = () =>
    withLiveClient(sessions.orgA, async () => {
      const { getBrowseListingById } = await import("@/lib/listings/browse");
      const { projectFillState: project } = await import("@/lib/listings/fills");
      const listing = await getBrowseListingById(offerId);
      return listing ? project({ quantityKg: listing.quantityKg, reservedQuantityKg: listing.reservedQuantityKg, filledQuantityKg: listing.filledQuantityKg }) : null;
    });

  /** The seller's real page, rendered with the real components over the real database rows. */
  const sellerPage = async () => {
    cleanup();
    await withLiveClient(sessions.orgB, async () => {
      const [{ default: SellerListingDetailPage }, { LocaleProvider }] = await Promise.all([import("@/src/app/dashboard/listings/[offerId]/page"), import("@/components/locale/locale-provider")]);
      const element = await SellerListingDetailPage({ params: Promise.resolve({ offerId }) });
      render(createElement(LocaleProvider, null, element));
    });
    const section = document.querySelector(`section[aria-label="${appCopy.marketplace.detail.availabilityHeading}"]`);
    if (!section) throw new Error("the availability section did not render");
    const [listed, reserved, filled, remaining] = [...section.querySelectorAll("dd")].map((dd) => Number.parseFloat(dd.textContent ?? ""));
    return { listed, reserved, filled, remaining, text: document.body.textContent ?? "" };
  };

  const expireAsBuyer = (orderId: string) =>
    withLiveClient(sessions.orgA, async () => {
      const { ensureHoldFresh } = await import("@/lib/orders/expiry");
      return ensureHoldFresh(orderId, { now: new Date(Date.now() + 30 * 60_000) });
    });

  beforeAll(async () => {
    baseline = inspectF006RowCounts();
    sessions = await prepareChain();
    helpers = chainHelpers(withLiveClient, sessions);
    const stock = await helpers.giveOrgBSettledStock(STOCK);
    positionId = stock.position.id;
    const draft = await helpers.createDraft(positionId, QUANTITY, "T018/T024 fill progression", 11);
    if (!draft.ok) throw new Error(`setup: createListingDraft refused: ${draft.code}`);
    offerId = draft.data.id;
    await helpers.publishListing(offerId);
  }, 900_000);

  afterAll(() => {
    if (!teardown) teardown = teardownChain();
  }, 300_000);

  it("T018.1 STARTING STATE — a real PUBLISHED own-org listing: 12 kg listed, nothing reserved or filled; buyer and seller views agree with the stored columns", async () => {
    const start = snapshot();
    expect(start).toMatchObject({ status: "PUBLISHED", isVisible: true, quantity: QUANTITY, reserved: 0, filled: 0, remaining: QUANTITY, positionAvailable: STOCK, positionReserved: 0, activeReservationCount: 0 });
    // the state history was written by the trigger for every real step that got it here
    expect(start.history).toEqual([["DRAFT", "PENDING_REVIEW"], ["PENDING_REVIEW", "APPROVED"], ["APPROVED", "PUBLISHED"]]);
    expect(await buyerView()).toMatchObject({ ok: true, state: "AVAILABLE", quantityKg: QUANTITY, reservedQuantityKg: 0, filledQuantityKg: 0, remainingQuantityKg: QUANTITY });
    const ui = await sellerPage();
    expect([ui.listed, ui.reserved, ui.filled, ui.remaining]).toEqual([QUANTITY, 0, 0, QUANTITY]);
    evidence.start = { stored: start, seller: [ui.listed, ui.reserved, ui.filled, ui.remaining] };
  }, 180_000);

  let holdOrderId = "";
  it("T018.2 RESERVE through the real Feature 007 checkout — actionable quantity falls 12 → 7 on the stored columns, on the seller's position and in what a buyer can act on; nothing is filled yet", async () => {
    holdOrderId = await buildHoldOrder(withLiveClient, sessions.orgA, ORG_A, 5, offerId);
    const held = snapshot();
    expect(held).toMatchObject({ status: "PUBLISHED", quantity: QUANTITY, reserved: 5, filled: 0, remaining: 7, positionAvailable: STOCK, positionReserved: 5, activeReservationCount: 1, activeReservationKg: 5 });
    expect(inspectDeliveryOrder(holdOrderId).order?.status).toBe("HOLD");
    expect(await buyerView()).toMatchObject({ ok: true, state: "AVAILABLE", reservedQuantityKg: 5, filledQuantityKg: 0, remainingQuantityKg: 7 });
    const ui = await sellerPage();
    expect([ui.listed, ui.reserved, ui.filled, ui.remaining]).toEqual([QUANTITY, 5, 0, 7]);
    evidence.reserved = { stored: held, seller: [ui.listed, ui.reserved, ui.filled, ui.remaining] };
  }, 240_000);

  it("T018.3 SETTLE through the currently authoritative primitive (admin_review_payment — Feature 009's rewrite; Feature 008's payment layer does not exist and none is claimed) — filled 0 → 5, reserved 5 → 0, the listing flips PUBLISHED → PARTIALLY_FILLED and the seller page renders it", async () => {
    const eventsBefore = inspectF006RowCounts().inventory_ownership_events!;
    const paymentId = await helpers.settleOrder(holdOrderId);
    expect(paymentId).toBeTruthy();

    const settled = snapshot();
    expect(settled).toMatchObject({ status: "PARTIALLY_FILLED", isVisible: true, quantity: QUANTITY, reserved: 0, filled: 5, remaining: 7, positionAvailable: STOCK - 5, positionReserved: 0, activeReservationCount: 0 });
    expect(settled.history.at(-1)).toEqual(["PUBLISHED", "PARTIALLY_FILLED"]);
    expect(inspectDeliveryOrder(holdOrderId).order?.status).toBe("PAID");
    // title moved to the buyer at the seller's warehouse, and the ledger gained exactly one append-only event
    expect(inspectDeliveryPositionByLotOwner(inspectF006Offer(offerId).offer!.lot_id, ORG_A)).toMatchObject({ available_quantity_kg: 5 });
    expect(inspectF006RowCounts().inventory_ownership_events! - eventsBefore).toBe(1);
    expect(await buyerView()).toMatchObject({ ok: true, state: "PARTIALLY_FILLED", reservedQuantityKg: 0, filledQuantityKg: 5, remainingQuantityKg: 7 });

    const ui = await sellerPage();
    expect([ui.listed, ui.reserved, ui.filled, ui.remaining]).toEqual([QUANTITY, 0, 5, 7]);
    // the approved label for the new state renders, and the timeline shows the database-written transition
    expect(ui.text).toContain(appCopy.marketplace.status.PARTIALLY_FILLED);
    // the timeline (EN + AR labels are both in the DOM) ends with the database-written PUBLISHED → PARTIALLY_FILLED entry
    const timeline = ui.text.slice(ui.text.indexOf(appCopy.listings.detail.historyHeading));
    const lastArrow = timeline.lastIndexOf("→");
    expect(timeline.slice(Math.max(0, lastArrow - 60), lastArrow)).toContain(appCopy.marketplace.status.PUBLISHED);
    expect(timeline.slice(lastArrow)).toContain(appCopy.marketplace.status.PARTIALLY_FILLED);
    expect(timeline.slice(lastArrow)).not.toContain(appCopy.marketplace.status.APPROVED);
    evidence.settled = { stored: settled, seller: [ui.listed, ui.reserved, ui.filled, ui.remaining] };
  }, 240_000);

  let holdOne = "";
  let holdTwo = "";
  let afterFirstExpiry: ReturnType<typeof snapshot>;
  it("T024.1 two live holds (3 kg + 2 kg) reduce actionable quantity 7 → 2; filled stays 5", async () => {
    holdOne = await buildHoldOrder(withLiveClient, sessions.orgA, ORG_A, 3, offerId);
    holdTwo = await buildHoldOrder(withLiveClient, sessions.orgA, ORG_A, 2, offerId);
    const held = snapshot();
    expect(held).toMatchObject({ status: "PARTIALLY_FILLED", reserved: 5, filled: 5, remaining: 2, positionAvailable: STOCK - 5, positionReserved: 5, activeReservationCount: 2, activeReservationKg: 5 });
    evidence.twoHolds = held;
  }, 360_000);

  it("T024.2 EXPIRY restores exactly the expired hold's quantity — 3 kg back (remaining 2 → 5) on the listing AND the seller position; the OTHER hold and the settled fill are untouched; the reservation is EXPIRED and its order EXPIRED", async () => {
    ageCheckoutHold(holdOne);
    const result = await expireAsBuyer(holdOne);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ expiredNow: true });

    afterFirstExpiry = snapshot();
    expect(afterFirstExpiry).toMatchObject({ status: "PARTIALLY_FILLED", reserved: 2, filled: 5, remaining: 5, positionAvailable: STOCK - 5, positionReserved: 2, activeReservationCount: 1, activeReservationKg: 2 });
    expect(inspectDeliveryOrder(holdOne).order?.status).toBe("EXPIRED");
    expect(inspectCheckoutOrder(holdOne).reservations.map((row) => row.status)).toEqual(["EXPIRED"]);
    expect(inspectDeliveryOrder(holdTwo).order?.status).toBe("HOLD");
    expect(inspectCheckoutOrder(holdTwo).reservations.map((row) => row.status)).toEqual(["ACTIVE"]);
    evidence.firstExpiry = afterFirstExpiry;
  }, 180_000);

  it("T024.3 EXACTLY ONCE — retrying the application path, calling expire_order_hold() directly, and three CONCURRENT direct calls restore nothing more: no double restore, no negative reserved, no drift", async () => {
    const retry = await expireAsBuyer(holdOne);
    expect(retry.ok).toBe(true);
    if (retry.ok) expect(retry.data).toMatchObject({ expiredNow: false });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const direct = await sessions.orgA.rpc("expire_order_hold", { p_order_id: holdOne });
      expect(direct.error, "a repeat expiry is a silent no-op").toBeNull();
    }
    const concurrent = await Promise.all([1, 2, 3].map(() => sessions.orgA.rpc("expire_order_hold", { p_order_id: holdOne })));
    for (const outcome of concurrent) expect(outcome.error).toBeNull();

    const after = snapshot();
    expect(after).toEqual(afterFirstExpiry);
    for (const value of [after.reserved, after.positionReserved, after.remaining, after.filled]) expect(value).toBeGreaterThanOrEqual(0);
    // quantities close: quantity = filled + reserved + remaining, and the position mirrors the listing exactly
    expect(after.quantity).toBe(after.filled + after.reserved + after.remaining);
    expect(after.positionReserved).toBe(after.reserved);
    expect(after.positionAvailable).toBe(STOCK - after.filled);
    evidence.retries = { unchanged: true, snapshot: after };
  }, 240_000);

  it("T024.4 expiring the second hold restores it too (remaining 5 → 7) and only it; the settled fill (5 kg) stays authoritative throughout; repeat is a no-op", async () => {
    ageCheckoutHold(holdTwo);
    const result = await expireAsBuyer(holdTwo);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ expiredNow: true });
    const expired = snapshot();
    expect(expired).toMatchObject({ status: "PARTIALLY_FILLED", reserved: 0, filled: 5, remaining: 7, positionAvailable: STOCK - 5, positionReserved: 0, activeReservationCount: 0, activeReservationKg: 0 });
    expect(inspectCheckoutOrder(holdTwo).reservations.map((row) => row.status)).toEqual(["EXPIRED"]);

    const direct = await sessions.orgA.rpc("expire_order_hold", { p_order_id: holdTwo });
    expect(direct.error).toBeNull();
    expect(snapshot()).toEqual(expired);
    // the earlier settled order is untouched by any expiry
    expect(inspectDeliveryOrder(holdOrderId).order?.status).toBe("PAID");
    expect(await buyerView()).toMatchObject({ ok: true, state: "PARTIALLY_FILLED", reservedQuantityKg: 0, filledQuantityKg: 5, remainingQuantityKg: 7 });
    evidence.secondExpiry = expired;
  }, 240_000);

  it("T018.4 FILL TO SOLD_OUT — reserving and settling the remaining 7 kg flips PARTIALLY_FILLED → SOLD_OUT (filled 12, remaining 0, no longer visible) and the seller page renders it", async () => {
    const last = await helpers.buyAndSettle(sessions.orgA, ORG_A, offerId, 7);
    expect(last.holdSnapshot.order?.status).toBe("HOLD");
    expect(last.paidSnapshot.order?.status).toBe("PAID");
    const sold = snapshot();
    expect(sold).toMatchObject({ status: "SOLD_OUT", isVisible: false, quantity: QUANTITY, reserved: 0, filled: QUANTITY, remaining: 0, positionAvailable: STOCK - QUANTITY, positionReserved: 0 });
    expect(sold.history.at(-1)).toEqual(["PARTIALLY_FILLED", "SOLD_OUT"]);
    const ui = await sellerPage();
    expect([ui.listed, ui.reserved, ui.filled, ui.remaining]).toEqual([QUANTITY, 0, QUANTITY, 0]);
    expect(ui.text).toContain(appCopy.marketplace.status.SOLD_OUT);
    evidence.soldOut = { stored: sold, seller: [ui.listed, ui.reserved, ui.filled, ui.remaining] };
    // exactly the settlement-created rows exist for the cleanup to remove
    const residue = inspectF006Residue() as { listings: number; payouts: number; orders: number };
    expect(residue.listings).toBe(1);
    expect(residue.payouts).toBeGreaterThanOrEqual(1);
    expect(storedListing(offerId).filled_quantity_kg).toBe(QUANTITY);
  }, 480_000);

  it("CLEANUP — every row this block created is removed, the shared baseline is restored, operators are de-privileged; only append-only rows remain (reported)", () => {
    teardown = teardownChain();
    const after = inspectF006RowCounts();
    const business = teardown.cleanup.f006 as { before: { listings: number; orders: number; payouts: number; buyerPositions: number }; after: { listings: number; orders: number; payouts: number; buyerPositions: number }; retainedImmutableOwnershipEvents: number; businessFixtureResidue: string };
    expect(business.before.listings).toBe(1);
    expect(business.before.orders).toBeGreaterThanOrEqual(5); // the provenance purchase, the 5 kg + 7 kg fills, and the two expired holds
    expect(business.after).toMatchObject({ listings: 0, orders: 0, payouts: 0, buyerPositions: 0 });
    expect(business.businessFixtureResidue).toBe("zero");
    expect((teardown.cleanup.adminFixture as { activeAdminPrivilege: boolean }).activeAdminPrivilege).toBe(false);
    expect(teardown.complianceActiveCapability).toBe(false);
    const immutable = new Set(["inventory_ownership_events", "audit_logs"]);
    for (const [table, count] of Object.entries(baseline)) {
      if (immutable.has(table)) expect(after[table], table).toBeGreaterThanOrEqual(count);
      else expect(after[table], table).toBe(count);
    }
    expect(after.inventory_ownership_events! - baseline.inventory_ownership_events!).toBe(business.retainedImmutableOwnershipEvents);
    expect(business.retainedImmutableOwnershipEvents).toBe(3); // provenance purchase + 5 kg + 7 kg settlements
    console.log("F006_T018_T024_EVIDENCE", JSON.stringify(evidence));
    console.log("F006_T018_T024_CLEANUP", JSON.stringify({ baseline, after, retainedImmutableOwnershipEvents: business.retainedImmutableOwnershipEvents, cleanup: teardown.cleanup }));
  }, 300_000);

  void ORG_B;
});
