import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPUTE_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  LISTING_FIXTURES,
  NOTIFICATION_FIXTURE,
  PHASE89_FIXTURES,
  cleanupDisputeTestRows,
  cleanupNotificationTestRows,
  seedDisputeFixtures,
  seedNotificationFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 012 — T018: unrelated organizations cannot READ or WRITE disputes, dispute evidence,
 * notifications or histories (SEC-001, SC-001). Every category is proven at BOTH boundaries:
 *   - application: the real Feature 012 read/write modules, called under the outsider's session;
 *   - database: raw PostgREST SELECT / INSERT / UPDATE / DELETE under the same session, so an RLS
 *     regression is caught even if an application check masked it.
 *
 * Owner: the buyer-only member (Org A, `F005-FIX-ORDER-A`). Outsiders: the buyer-and-seller member
 * (Org B) and the under-review member (Org C). History subjects are STANDING records never written by
 * this file: an Org B order with `order_status_history`, the Hills review listing, the SUSPENDED
 * fixture organization's account history, and Feature 005's ownership ledger. Tagged dispute and
 * notification rows are removed by the fixture script in `afterAll`.
 */

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
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function as<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  cookieState.value = undefined;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 180_000;
const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
const ORG_B = INVENTORY_FIXTURES.orgB.organizationId;
const ORG_C = INVENTORY_FIXTURES.orgC.organizationId;
const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
const SUSPENDED_ORG = PHASE89_FIXTURES.suspended.organizationId;
const LISTING = LISTING_FIXTURES.offerPendingReview;

let owner: SupabaseClient;
let ownerUserId: string;
const outsiders: Array<{ label: string; organizationId: string; client: SupabaseClient; userId: string }> = [];
let disputeId: string;
let evidenceId: string;
let orgBOrderWithHistory: string;
let orgAEventId: string;

/** A raw write the outsider must not achieve: either an error, or zero affected rows. */
async function expectNoWrite(promise: PromiseLike<{ data: unknown; error: { code?: string } | null }>, label: string) {
  const { data, error } = await promise;
  if (error) return;
  expect(Array.isArray(data) ? data : data === null ? [] : [data], label).toEqual([]);
}

beforeAll(async () => {
  seedDisputeFixtures();
  cleanupDisputeTestRows();
  cleanupNotificationTestRows();
  seedNotificationFixture();

  owner = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  ownerUserId = (await owner.auth.getUser()).data.user!.id;
  for (const [label, email, organizationId] of [
    ["Org B (buyer-and-seller)", FOUNDATION_FIXTURES.buyerAndSeller.email, ORG_B],
    ["Org C (under review)", INVENTORY_FIXTURES.orgC.email, ORG_C],
  ] as const) {
    const client = await signInAsFixture(email);
    outsiders.push({ label, organizationId, client, userId: (await client.auth.getUser()).data.user!.id });
  }

  const raised = await as(owner, async () => (await import("@/lib/disputes/member")).raiseDispute({ organizationId: ORG_A, userId: ownerUserId, input: { orderId: ORDER_A, reason: `${DISPUTE_FIXTURES.reasonPrefix} T018 isolation subject.` } }));
  if (!raised.ok) throw new Error(`raise failed: ${raised.code}`);
  disputeId = raised.data.id;
  const note = await as(owner, async () => (await import("@/lib/disputes/member")).addDisputeEvidenceNote({ organizationId: ORG_A, userId: ownerUserId, input: { disputeId, note: "T018 isolation evidence note." } }));
  if (!note.ok) throw new Error(`evidence failed: ${note.code}`);
  evidenceId = note.data.id;

  const { data: orderHistory } = await outsiders[0]!.client.from("order_status_history").select("order_id, orders!inner(buyer_organization_id)").eq("orders.buyer_organization_id", ORG_B).limit(1);
  orgBOrderWithHistory = orderHistory![0]!.order_id as string;
  const { data: events } = await owner.from("inventory_ownership_events").select("id, from_organization_id, to_organization_id").or(`from_organization_id.eq.${ORG_A},to_organization_id.eq.${ORG_A}`).limit(50);
  // An Org A event Org C is NOT a party to (Org B may legitimately be a party to some — they're excluded where it matters).
  orgAEventId = (events ?? []).find((row) => row.from_organization_id !== ORG_C && row.to_organization_id !== ORG_C && row.from_organization_id !== ORG_B && row.to_organization_id !== ORG_B)!.id as string;
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  expect(cleanupDisputeTestRows().remainingTaggedDisputes).toBe(0);
  expect(cleanupNotificationTestRows().remainingTaggedNotifications).toBe(0);
}, LIVE_TIMEOUT_MS);

describe("1 · DISPUTES — an unrelated organization can neither read nor write another organization's dispute", () => {
  it("reads: app layer (detail, list, per-order linkage) and raw RLS return nothing", async () => {
    for (const outsider of outsiders) {
      const read = await as(outsider.client, async () => {
        const mod = await import("@/lib/disputes/read");
        return {
          detail: await mod.getDisputeForMember({ organizationId: outsider.organizationId, userId: outsider.userId, disputeId }),
          spoofedOrg: await mod.getDisputeForMember({ organizationId: ORG_A, userId: outsider.userId, disputeId }),
          list: await mod.listDisputesForMember({ organizationId: outsider.organizationId, userId: outsider.userId }),
          forOrder: await mod.listDisputesForOrder({ organizationId: ORG_A, userId: outsider.userId, orderId: ORDER_A }),
        };
      });
      expect(read.detail, outsider.label).toBeNull();
      expect(read.spoofedOrg, outsider.label).toBeNull();
      expect(read.list.rows.map((row) => row.id), outsider.label).not.toContain(disputeId);
      expect(read.forOrder, outsider.label).toEqual([]);
      const { data } = await outsider.client.from("disputes").select("id, reason").eq("id", disputeId);
      expect(data, outsider.label).toEqual([]);
    }
  }, LIVE_TIMEOUT_MS);

  it("writes: raising on the owner's order is refused (app + RLS); UPDATE and DELETE change nothing", async () => {
    for (const outsider of outsiders) {
      const raised = await as(outsider.client, async () => (await import("@/lib/disputes/member")).raiseDispute({ organizationId: outsider.organizationId, userId: outsider.userId, input: { orderId: ORDER_A, reason: `${DISPUTE_FIXTURES.reasonPrefix} outsider attempt` } }));
      expect(raised, outsider.label).toEqual({ ok: false, code: "order_not_found" });
      const { error } = await outsider.client.from("disputes").insert({ order_id: ORDER_A, opened_by_user_id: outsider.userId, reason: `${DISPUTE_FIXTURES.reasonPrefix} raw outsider insert` });
      expect(error?.code, outsider.label).toBe("42501");
      await expectNoWrite(outsider.client.from("disputes").update({ status: "CLOSED", resolution: "outsider" }).eq("id", disputeId).select("id"), outsider.label);
      await expectNoWrite(outsider.client.from("disputes").delete().eq("id", disputeId).select("id"), outsider.label);
    }
    const { data } = await owner.from("disputes").select("status, resolution").eq("id", disputeId).single();
    expect(data).toEqual({ status: "OPEN", resolution: null });
  }, LIVE_TIMEOUT_MS);
});

describe("2 · DISPUTE EVIDENCE — an unrelated organization can neither read nor write it", () => {
  it("reads and writes are refused at both boundaries; the owner's note is unchanged", async () => {
    for (const outsider of outsiders) {
      const result = await as(outsider.client, async () => {
        const read = await import("@/lib/disputes/read");
        const member = await import("@/lib/disputes/member");
        return {
          read: await read.getDisputeEvidenceForMember({ organizationId: outsider.organizationId, userId: outsider.userId, disputeId }),
          add: await member.addDisputeEvidenceNote({ organizationId: outsider.organizationId, userId: outsider.userId, input: { disputeId, note: "outsider note" } }),
        };
      });
      expect(result.read, outsider.label).toBeNull();
      expect(result.add, outsider.label).toEqual({ ok: false, code: "dispute_not_found" });
      const { data } = await outsider.client.from("dispute_evidence").select("id, note").eq("dispute_id", disputeId);
      expect(data, outsider.label).toEqual([]);
      const { error } = await outsider.client.from("dispute_evidence").insert({ dispute_id: disputeId, uploaded_by: outsider.userId, note: "raw outsider note" });
      expect(error?.code, outsider.label).toBe("42501");
      await expectNoWrite(outsider.client.from("dispute_evidence").update({ note: "tampered" }).eq("id", evidenceId).select("id"), outsider.label);
      await expectNoWrite(outsider.client.from("dispute_evidence").delete().eq("id", evidenceId).select("id"), outsider.label);
    }
    const { data } = await owner.from("dispute_evidence").select("note").eq("id", evidenceId).single();
    expect(data?.note).toBe("T018 isolation evidence note.");
  }, LIVE_TIMEOUT_MS);
});

describe("3 · NOTIFICATIONS — another user's notification is unreachable and unwritable", () => {
  it("reads and writes are refused at both boundaries; the owner still sees it, unread and unchanged", async () => {
    for (const outsider of outsiders) {
      const read = await as(outsider.client, async () => {
        const mod = await import("@/lib/notifications/read");
        return { one: await mod.getOwnNotification(NOTIFICATION_FIXTURE.id), list: await mod.listOwnNotifications() };
      });
      expect(read.one, outsider.label).toBeNull();
      expect(read.list?.rows.map((row) => row.id), outsider.label).not.toContain(NOTIFICATION_FIXTURE.id);
      const { data } = await outsider.client.from("notifications").select("id, title").eq("id", NOTIFICATION_FIXTURE.id);
      expect(data, outsider.label).toEqual([]);
      const { error } = await outsider.client.from("notifications").insert({ user_id: ownerUserId, notification_type: "ORDER_UPDATES", title: `${NOTIFICATION_FIXTURE.titlePrefix} forged for owner`, body: "forged" });
      expect(error?.code, outsider.label).toBe("42501");
      await expectNoWrite(outsider.client.from("notifications").update({ read_at: new Date().toISOString(), title: "tampered" }).eq("id", NOTIFICATION_FIXTURE.id).select("id"), outsider.label);
      await expectNoWrite(outsider.client.from("notifications").delete().eq("id", NOTIFICATION_FIXTURE.id).select("id"), outsider.label);
    }
    const own = await as(owner, async () => (await import("@/lib/notifications/read")).getOwnNotification(NOTIFICATION_FIXTURE.id));
    expect(own?.title.startsWith(NOTIFICATION_FIXTURE.titlePrefix)).toBe(true);
    const { data } = await owner.from("notifications").select("read_at").eq("id", NOTIFICATION_FIXTURE.id).single();
    expect(data?.read_at).toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("4 · HISTORIES — order, listing, account and ownership history stay inside their authority", () => {
  it("order history: the unrelated organizations read nothing and cannot write, edit or delete it", async () => {
    const outsidersForOrder = [{ label: "Org A (buyer-only)", client: owner }, outsiders[1]!];
    for (const outsider of outsidersForOrder) {
      const rows = await as(outsider.client, async () => (await import("@/lib/audit/history")).readOrderStatusHistory(orgBOrderWithHistory));
      expect(rows, outsider.label).toEqual([]);
      const { error } = await outsider.client.from("order_status_history").insert({ order_id: orgBOrderWithHistory, new_status: "VOID", reason: "forged" });
      expect(error?.code, outsider.label).toBe("42501");
      await expectNoWrite(outsider.client.from("order_status_history").update({ reason: "tampered" }).eq("order_id", orgBOrderWithHistory).select("id"), outsider.label);
      await expectNoWrite(outsider.client.from("order_status_history").delete().eq("order_id", orgBOrderWithHistory).select("id"), outsider.label);
    }
  }, LIVE_TIMEOUT_MS);

  it("listing history: members who do not own the listing read nothing and cannot write it", async () => {
    for (const member of [{ label: "Org A", client: owner }, ...outsiders]) {
      const rows = await as(member.client, async () => (await import("@/lib/audit/history")).readListingStatusHistory(LISTING));
      expect(rows, member.label).toEqual([]);
      const { error } = await member.client.from("listing_status_history").insert({ offer_id: LISTING, new_status: "PUBLISHED", reason: "forged" });
      expect(error?.code, member.label).toBe("42501");
      await expectNoWrite(member.client.from("listing_status_history").delete().eq("offer_id", LISTING).select("id"), member.label);
    }
  }, LIVE_TIMEOUT_MS);

  it("account history: members of other organizations read nothing and cannot write it", async () => {
    for (const member of [{ label: "Org A", client: owner }, ...outsiders]) {
      const rows = await as(member.client, async () => (await import("@/lib/audit/history")).readAccountStatusHistory(SUSPENDED_ORG));
      expect(rows, member.label).toEqual([]);
      const { error } = await member.client.from("account_status_history").insert({ organization_id: SUSPENDED_ORG, new_status: "ACTIVE", reason: "forged" });
      expect(error?.code, member.label).toBe("42501");
      await expectNoWrite(member.client.from("account_status_history").update({ reason: "tampered" }).eq("organization_id", SUSPENDED_ORG).select("id"), member.label);
    }
  }, LIVE_TIMEOUT_MS);

  it("ownership events: an unrelated organization never sees a ledger row it is not a party to, and cannot insert, edit or delete one", async () => {
    const orgC = outsiders[1]!;
    const seen = await as(orgC.client, async () => (await import("@/lib/audit/history")).readOwnershipEvents({ organizationId: ORG_A, pageSize: 100 }));
    expect(seen.rows.map((row) => row.id)).not.toContain(orgAEventId);
    for (const row of seen.rows) expect(row.fromOrganizationId === ORG_C || row.toOrganizationId === ORG_C).toBe(true);
    const { data } = await orgC.client.from("inventory_ownership_events").select("id").eq("id", orgAEventId);
    expect(data).toEqual([]);

    const { error } = await orgC.client.from("inventory_ownership_events").insert({ lot_id: INVENTORY_FIXTURES.lotA, to_organization_id: ORG_C, quantity_kg: 1, event_type: "ADJUSTMENT", reason: "forged" });
    expect(error?.code).toBe("42501");
    for (const outsider of outsiders) {
      await expectNoWrite(outsider.client.from("inventory_ownership_events").update({ reason: "tampered" }).eq("id", orgAEventId).select("id"), outsider.label);
      await expectNoWrite(outsider.client.from("inventory_ownership_events").delete().eq("id", orgAEventId).select("id"), outsider.label);
    }
    const { data: still } = await owner.from("inventory_ownership_events").select("id").eq("id", orgAEventId);
    expect(still).toEqual([{ id: orgAEventId }]);
  }, LIVE_TIMEOUT_MS);
});
