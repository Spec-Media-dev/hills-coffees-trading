import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { inspectDeliveryOrder, inspectDeliveryPositionByLotOwner, inspectF006Offer, inspectF006RowCounts, F006_FIXTURES } from "@/tests/auth/fixture-session";
import { buildHoldOrder } from "@/tests/orders/live-helpers";
import { ORG_A, ORG_B, chainHelpers, prepareChain, teardownChain, type ChainSessions, type ChainTeardown } from "@/tests/listings/live-chain";

/**
 * Feature 005 T014 / DB-OPEN-19 — LIVE proof of the inventory variance / hold / quarantine capability, against the REAL
 * database, through the REAL Feature 006 / 007 / 009 flows and the REAL warehouse-operator RPCs.
 *
 * GATED: runs only with `F005_LIVE_PROOF=1` AND only AFTER the migration
 * `20260921120000_feature_005_db_open_19_inventory_variance_hold.sql` has been approved and applied (before that, the
 * RPCs do not exist and the very first live step fails — which is the point: the gate keeps `npm test` green and honest).
 * It reuses Feature 006's settled-stock chain (`tests/listings/live-chain.ts`); cleanup is `teardownChain()`.
 *
 * RESIDUE (by design, hardening H2): the variance history is append-only and its FK to the position is ON DELETE RESTRICT, so the
 * fixture position that had cases can never be deleted. The last step therefore ZEROES it through a resolved count (leaving an empty,
 * reusable position — the next F006 / F005 run settles into it and starts from a known quantity), and the seed script's cleanup retains
 * and reports it (`retainedVariancePositions`). The `ADJUSTMENT` ownership events the resolutions write are append-only as well.
 *
 * NOT covered here (proved in `tests/database/inventory-variance-scratch.test.ts` against a scratch Postgres): the
 * concurrent-resolution race with parallel sessions and the full trigger/constraint matrix.
 */

const F005_LIVE = process.env.F005_LIVE_PROOF === "1";

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

describe.skipIf(!F005_LIVE)("T014 — LIVE variance / hold / quarantine over real settled stock", () => {
  let sessions: ChainSessions;
  let helpers: ReturnType<typeof chainHelpers>;
  let baseline: Record<string, number>;
  let positionId = "";
  let lotId = "";
  let offerId = "";
  let varianceId = "";
  let start = 0; // the position's quantity after settlement (a retained position from an earlier run may add to it)
  let teardown: ChainTeardown | null = null;

  const STOCK = 20;
  const position = () => inspectDeliveryPositionByLotOwner(lotId, ORG_B)!;
  /** `counted` only applies to a VARIANCE; a HOLD / QUARANTINE carries none. */
  const record = (client: SupabaseClient, kind: string, expected: number, counted: number | null, reason = "F005 live proof") =>
    client.rpc("record_inventory_variance", { p_position_id: positionId, p_kind: kind, p_expected_available_quantity_kg: expected, p_counted_quantity_kg: counted, p_reason: reason });
  const resolve = (client: SupabaseClient, id: string, outcome: string, reason = "F005 live proof resolution") =>
    client.rpc("resolve_inventory_variance", { p_variance_id: id, p_outcome: outcome, p_reason: reason });
  const openNotices = (client: SupabaseClient) => client.from("inventory_position_hold_notices").select("variance_id, kind, variance_quantity_kg").eq("inventory_position_id", positionId);

  beforeAll(async () => {
    baseline = inspectF006RowCounts();
    sessions = await prepareChain();
    helpers = chainHelpers(withLiveClient, sessions);
    const stock = await helpers.giveOrgBSettledStock(STOCK);
    positionId = stock.position.id;
    lotId = F006_FIXTURES.hillsLotId;
    start = Number(position().available_quantity_kg);
    // a real PUBLISHED listing over 5 kg of it, created BEFORE the hold (so reservation refusal can be proven against it)
    const draft = await helpers.createDraft(positionId, 5, "F005 variance proof");
    if (!draft.ok) throw new Error(`setup: createListingDraft refused: ${draft.code}`);
    offerId = draft.data.id;
    await helpers.publishListing(offerId);
  }, 900_000);

  afterAll(() => {
    if (!teardown) teardown = teardownChain();
  }, 300_000);

  it("1-3 unauthorized actors cannot record (member seller, other org, finance operator)", async () => {
    for (const client of [sessions.orgB, sessions.orgA, sessions.finance]) {
      const { data, error } = await record(client, "QUARANTINE", start, null);
      expect(data).toBeNull();
      expect(error?.message).toBe("forbidden");
    }
    expect(position()).toMatchObject({ available_quantity_kg: start, reserved_quantity_kg: 0 });
  }, 120_000);

  it("4 the warehouse operator records a count variance (-2 kg); the owner sees the reason-free notice, the other organization sees nothing, and NO member can read the operator's reason", async () => {
    const { data, error } = await record(sessions.warehouse, "VARIANCE", start, start - 2, "F005 live: operator-only reason");
    expect(error).toBeNull();
    varianceId = (data as { variance_id: string }).variance_id;
    const notice = await openNotices(sessions.orgB);
    expect(notice.data).toHaveLength(1);
    expect(Number(notice.data![0]!.variance_quantity_kg)).toBe(-2);
    expect((await openNotices(sessions.orgA)).data).toEqual([]);
    // H3: a member has no path to the history or the full holds view, and the notice has no reason column
    for (const client of [sessions.orgB, sessions.orgA]) {
      expect((await client.from("inventory_variance_events").select("id, reason").eq("inventory_position_id", positionId)).data ?? []).toEqual([]);
      expect((await client.from("inventory_position_holds").select("variance_id").eq("inventory_position_id", positionId)).data ?? []).toEqual([]);
    }
    expect((await sessions.orgB.from("inventory_position_hold_notices").select("reason").eq("inventory_position_id", positionId)).error).not.toBeNull();
    // the operator (and only operators / auditors) can read it back
    const history = await sessions.warehouse.from("inventory_variance_events").select("reason").eq("id", varianceId).single();
    expect(history.data?.reason).toBe("F005 live: operator-only reason");
    // a second open case on the same position is refused
    expect((await record(sessions.warehouse, "QUARANTINE", start, null)).error?.message).toBe("variance_already_open");
  }, 120_000);

  it("5 the held stock is not actionable: new listing refused (early + database), reservation on the existing listing refused, no raw write by any session, quantities unchanged", async () => {
    const draft = await helpers.createDraft(positionId, 3, "F005 blocked");
    expect(draft).toMatchObject({ ok: false, code: "listing_ineligible", fieldErrors: { positionId: ["INVENTORY_HELD"] } });

    await expect(buildHoldOrder(withLiveClient, sessions.orgA, ORG_A, 2, offerId)).rejects.toThrow();
    expect(position()).toMatchObject({ available_quantity_kg: start, reserved_quantity_kg: 0 });
    expect(Number(inspectF006Offer(offerId).offer!.reserved_quantity_kg)).toBe(0);

    // H1: no session — the seller, a buyer, a warehouse operator or an admin — can write a position directly at all
    for (const client of [sessions.orgB, sessions.orgA, sessions.warehouse, sessions.admin]) {
      const update = await client.from("inventory_positions").update({ available_quantity_kg: 100 }).eq("id", positionId).select("id");
      expect(update.error?.message ?? "").toMatch(/permission denied/i);
      expect(update.data ?? []).toHaveLength(0);
    }
    expect(position().available_quantity_kg).toBe(start);
  }, 300_000);

  it("6 unauthorized actors cannot resolve", async () => {
    for (const client of [sessions.orgB, sessions.orgA, sessions.finance]) {
      const { data, error } = await resolve(client, varianceId, "ADJUSTED");
      expect(data).toBeNull();
      expect(error?.message).toBe("forbidden");
    }
    expect(position().available_quantity_kg).toBe(start);
  }, 120_000);

  it("7-9 the warehouse operator adjusts exactly once (-2 kg), then a retry is refused and nothing changes; the member-visible ledger reason is the fixed member-safe text", async () => {
    const eventsBefore = inspectF006RowCounts().inventory_ownership_events!;
    const first = await resolve(sessions.warehouse, varianceId, "ADJUSTED", "F005 live: operator-only resolution reason");
    expect(first.error).toBeNull();
    expect(position()).toMatchObject({ available_quantity_kg: start - 2, reserved_quantity_kg: 0 });
    expect((await resolve(sessions.warehouse, varianceId, "ADJUSTED")).error?.message).toBe("variance_already_resolved");
    expect((await resolve(sessions.warehouse, varianceId, "RELEASED")).error?.message).toBe("variance_already_resolved");
    expect(position().available_quantity_kg).toBe(start - 2);
    expect(inspectF006RowCounts().inventory_ownership_events! - eventsBefore).toBe(1); // one immutable ADJUSTMENT event, never two
    // H3: the owner reads its own ledger (PS3) — the reason is fixed, never the operator's free text
    const ledger = await sessions.orgB.from("inventory_ownership_events").select("reason").eq("event_type", "ADJUSTMENT").eq("lot_id", lotId).order("created_at", { ascending: false }).limit(1);
    // (the recorded quantity is the position's numeric column, so it prints with its stored scale — `20.000` — while the counted one prints as entered)
    expect(ledger.data?.[0]?.reason).toMatch(new RegExp(`^Warehouse stock count adjustment \\(shortage, recorded ${start}(\\.0+)? kg, counted ${start - 2}(\\.0+)? kg\\)$`));
    expect(ledger.data?.[0]?.reason).not.toContain("operator-only");
  }, 120_000);

  it("10 the position is actionable again; the history is intact and append-only for every session", async () => {
    expect((await openNotices(sessions.orgB)).data).toEqual([]);
    // this run's case only: the fixture position is retained across runs (append-only history), so earlier runs' cases are on it too
    const history = await sessions.warehouse.from("inventory_variance_events").select("event_type, kind, outcome").eq("variance_id", varianceId).order("created_at");
    expect(history.data).toEqual([
      { event_type: "RECORDED", kind: "VARIANCE", outcome: null },
      { event_type: "RESOLVED", kind: "VARIANCE", outcome: "ADJUSTED" },
    ]);
    // no role can rewrite, delete or truncate history (no privilege at all; the trigger is the second wall)
    for (const client of [sessions.warehouse, sessions.admin, sessions.orgB]) {
      const update = await client.from("inventory_variance_events").update({ reason: "tampered" }).eq("inventory_position_id", positionId).select("id");
      const remove = await client.from("inventory_variance_events").delete().eq("inventory_position_id", positionId).select("id");
      expect(update.data ?? []).toHaveLength(0);
      expect(remove.data ?? []).toHaveLength(0);
    }
    expect((await sessions.warehouse.from("inventory_variance_events").select("reason").eq("id", varianceId).single()).data?.reason).toBe("F005 live: operator-only reason");
    // the stock is listable again: Feature 006's eligibility no longer refuses it (a second DRAFT cannot be created here only because
    // `uq_active_offer_per_lot_owner` allows one active listing per lot and seller — this run's published listing already holds it)
    const eligibility = await withLiveClient(sessions.orgB, async () => {
      const { checkListingEligibility } = await import("@/lib/listings/eligibility");
      return checkListingEligibility({ organizationId: ORG_B, canSell: true, positionId, requestedQuantityKg: 3 });
    });
    expect(eligibility, JSON.stringify(eligibility)).toMatchObject({ eligible: true });
  }, 240_000);

  it("11 a QUARANTINE: a stale expectation is refused, it can only be RELEASED (never adjusted), and a release leaves the quantity untouched", async () => {
    expect((await record(sessions.warehouse, "QUARANTINE", start, null)).error?.message).toBe("variance_stale_position");
    const { data, error } = await record(sessions.warehouse, "QUARANTINE", start - 2, null, "F005 live quarantine");
    expect(error).toBeNull();
    const id = (data as { variance_id: string }).variance_id;
    expect((await resolve(sessions.warehouse, id, "ADJUSTED")).error?.message).toBe("variance_adjustment_not_applicable");
    expect((await resolve(sessions.warehouse, id, "RELEASED")).error).toBeNull();
    expect(position()).toMatchObject({ available_quantity_kg: start - 2, reserved_quantity_kg: 0 });
  }, 120_000);

  it("11b DELIVERY — a delivery cannot be progressed while the buyer's own position is held (the guard is the only source of the refusal), and the reservation is intact when released", async () => {
    // orgB buys 4 kg more through the real 007 flow and it is settled: the shipment is delivery-reserved against orgB's position
    const purchase = await helpers.buyAndSettle(sessions.orgB, ORG_B, F006_FIXTURES.hillsOfferId, 4);
    const current = position();
    const shipments = inspectDeliveryOrder(purchase.orderId).shipments;
    expect(shipments.length).toBeGreaterThan(0);
    expect(Number(current.reserved_quantity_kg)).toBeGreaterThan(0);

    const held = await record(sessions.warehouse, "HOLD", Number(current.available_quantity_kg), null, "F005 live: hold under a delivery");
    expect(held.error).toBeNull();
    const holdId = (held.data as { variance_id: string }).variance_id;
    // ALWAYS release the hold and free the delivery reservation, whatever the assertions below find (a stuck hold or reservation would
    // poison the retained fixture position for every later run)
    try {
      // the warehouse tries every operational status the guard covers. A status equal to the current one is not a transition (skipped);
      // the database's own transition graph decides which of the others are legal from here — for a legal one the ONLY thing standing
      // in the way is the hold, and it raises exactly `inventory_position_held`.
      const messages: string[] = [];
      for (const target of ["REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED"]) {
        if (target === shipments[0]!.status) continue;
        const { error } = await sessions.warehouse.from("order_shipments").update({ status: target }).eq("id", shipments[0]!.id).select("id");
        messages.push(`${target}:${error?.message ?? "ALLOWED"}`);
      }
      expect(messages.some((m) => m.endsWith(":inventory_position_held")), `from ${shipments[0]!.status}: ${messages.join(" | ")}`).toBe(true);
      expect(messages.filter((m) => m.endsWith(":ALLOWED")), `no covered status may be reachable while held: ${messages.join(" | ")}`).toEqual([]);
      // nothing moved: the shipments and the position are exactly as they were
      expect(inspectDeliveryOrder(purchase.orderId).shipments.map((row) => row.status)).toEqual(shipments.map((row) => row.status));
      expect(position()).toMatchObject({ available_quantity_kg: current.available_quantity_kg, reserved_quantity_kg: current.reserved_quantity_kg });
    } finally {
      expect((await resolve(sessions.warehouse, holdId, "RELEASED", "F005 live: released after the delivery refusal")).error).toBeNull();
      await helpers.cancelDeliveryShipments(purchase.orderId);
    }
    expect(position()).toMatchObject({ reserved_quantity_kg: 0 });
  }, 480_000);

  it("12 the fixture position is ZEROED through a resolved count (it can never be deleted — its history is retained), then cleanup", async () => {
    const remaining = Number(position().available_quantity_kg);
    const { data, error } = await record(sessions.warehouse, "VARIANCE", remaining, 0, "F005 live: zero the disposable fixture position");
    expect(error).toBeNull();
    expect((await resolve(sessions.warehouse, (data as { variance_id: string }).variance_id, "ADJUSTED", "fixture zeroed")).error).toBeNull();
    expect(position()).toMatchObject({ available_quantity_kg: 0, reserved_quantity_kg: 0 });
    // the position now has history, so the cleanup must retain (not delete) it, and report that
    teardown = teardownChain();
    const after = inspectF006RowCounts();
    const residue = Object.fromEntries(Object.entries(after).filter(([table, count]) => count !== baseline[table]));
    console.info("[F005-LIVE] teardown", JSON.stringify(teardown), "residue vs baseline", JSON.stringify(residue));
    expect(position()).toMatchObject({ available_quantity_kg: 0, reserved_quantity_kg: 0 });
  }, 300_000);
});
