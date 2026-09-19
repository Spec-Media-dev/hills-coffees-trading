import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPUTE_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  NOTIFICATION_FIXTURE,
  cleanupComplianceFixture,
  cleanupDisputeTestRows,
  cleanupNotificationTestRows,
  createAnonymousFixtureClient,
  inspectComplianceFixture,
  inspectDisputeFixtures,
  prepareComplianceFixture,
  seedDisputeFixtures,
  seedNotificationFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 012 RUN B — LIVE security proof for T005/T008 (evidence), T007 (linkage, no side effect),
 * T009/T010 (own-user notification reads) and T011 (own-user preferences), under real password-grant
 * sessions against the live database. Same fixture discipline as RUN A: standing buyer-only member
 * (Org A, owner of `F005-FIX-ORDER-A`), standing buyer-and-seller member (Org B, the unrelated
 * organization), one disposable COMPLIANCE operator (de-privileged in `afterAll`), and tagged rows
 * removed by the fixture script. The one notification row is a TEST-ONLY fixture (the product cannot
 * create notifications — DB-BLOCK-04); it exists only so isolation is proven against a real record.
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

const LIVE_TIMEOUT_MS = 120_000;
const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
const ORG_B = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;
const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
const tag = (text: string) => `${DISPUTE_FIXTURES.reasonPrefix} ${text}`;

let buyer: SupabaseClient;
let buyerUserId: string;
let otherOrg: SupabaseClient;
let otherOrgUserId: string;
let compliance: SupabaseClient;
let anonymous: SupabaseClient;
let before: Record<string, unknown>;
let disputeId: string;

const businessState = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "disputes" && key !== "evidence"));

function preferenceForm(values: Record<string, boolean>) {
  const formData = new FormData();
  for (const type of ["ORDER_UPDATES", "PAYMENT_INVOICES", "SHIPMENT_UPDATES", "KYB_DOCUMENTS"]) {
    for (const channel of ["EMAIL", "SMS", "WHATSAPP"]) {
      const key = `${type}__${channel}`;
      formData.set(key, String(values[key] ?? false));
    }
  }
  return formData;
}

beforeAll(async () => {
  seedDisputeFixtures();
  cleanupDisputeTestRows();
  cleanupNotificationTestRows();
  seedNotificationFixture();
  prepareComplianceFixture();

  buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  otherOrg = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  anonymous = createAnonymousFixtureClient();
  buyerUserId = (await buyer.auth.getUser()).data.user!.id;
  otherOrgUserId = (await otherOrg.auth.getUser()).data.user!.id;

  before = inspectDisputeFixtures();

  const raised = await as(buyer, async () => {
    const { raiseDispute } = await import("@/lib/disputes/member");
    return raiseDispute({ organizationId: ORG_A, userId: buyerUserId, input: { orderId: ORDER_A, reason: tag("RUN B evidence and linkage proof.") } });
  });
  if (!raised.ok) throw new Error(`raise failed: ${raised.code}`);
  disputeId = raised.data.id;
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  const disputes = cleanupDisputeTestRows();
  expect(disputes.remainingTaggedDisputes).toBe(0);
  const notifications = cleanupNotificationTestRows();
  expect(notifications.remainingTaggedNotifications).toBe(0);
  const operator = cleanupComplianceFixture();
  expect(operator.activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T005/T008 — text evidence works for the participant; nothing else can see or add it; zero bytes are stored", () => {
  it("the participant adds a text note through the Server Action and reads it back (text only, no file reference)", async () => {
    const added = await as(buyer, async () => {
      const { addEvidenceNoteAction } = await import("@/src/app/dashboard/disputes/actions");
      const formData = new FormData();
      formData.set("disputeId", disputeId);
      formData.set("note", "<b>Photo</b> of the torn bags is held by our warehouse manager.");
      return addEvidenceNoteAction(undefined, formData);
    });
    expect(added).toMatchObject({ ok: true, code: "dispute_evidence_recorded" });

    const evidence = await as(buyer, async () => {
      const { getDisputeEvidenceForMember } = await import("@/lib/disputes/read");
      return getDisputeEvidenceForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId });
    });
    expect(evidence).toHaveLength(1);
    expect(evidence![0]).toMatchObject({ note: "<b>Photo</b> of the torn bags is held by our warehouse manager.", hasFileReference: false, uploadedBy: buyerUserId });
  }, LIVE_TIMEOUT_MS);

  it("an unrelated organization can neither read nor add evidence — app boundary and RLS", async () => {
    const result = await as(otherOrg, async () => {
      const { addEvidenceNoteAction } = await import("@/src/app/dashboard/disputes/actions");
      const { getDisputeEvidenceForMember } = await import("@/lib/disputes/read");
      const formData = new FormData();
      formData.set("disputeId", disputeId);
      formData.set("note", "cross-organization note");
      return { add: await addEvidenceNoteAction(undefined, formData), read: await getDisputeEvidenceForMember({ organizationId: ORG_B, userId: otherOrgUserId, disputeId }) };
    });
    expect(result.add).toEqual({ ok: false, code: "dispute_not_found" });
    expect(result.read).toBeNull();

    const { data: rawRead } = await otherOrg.from("dispute_evidence").select("id, note").eq("dispute_id", disputeId);
    expect(rawRead).toEqual([]);
    const { error: rawInsert } = await otherOrg.from("dispute_evidence").insert({ dispute_id: disputeId, uploaded_by: otherOrgUserId, note: "raw cross-organization note" });
    expect(rawInsert?.code).toBe("42501");
  }, LIVE_TIMEOUT_MS);

  it("the file seam refuses without writing; no file_assets row or bucket appears; no evidence row carries a file reference", async () => {
    const { attachDisputeEvidenceFile } = await import("@/lib/disputes/evidence-files");
    await expect(attachDisputeEvidenceFile({ disputeId, fileName: "photo.jpg", bytes: "AAAA" })).resolves.toEqual({ ok: false, code: "dispute_evidence_file_unavailable" });
    const after = inspectDisputeFixtures();
    expect(after.fileAssetCount).toBe(before.fileAssetCount);
    expect(after.storageBuckets).toEqual(before.storageBuckets);
    expect((after.storageBuckets as Array<{ id: string }>).some((bucket) => /dispute/i.test(bucket.id))).toBe(false);
    for (const row of after.evidence as Array<{ file_asset_id: string | null }>) expect(row.file_asset_id).toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T009/T010 — own-user notification reads only; the surface stays honest", () => {
  it("the owner sees the one real row; the other user cannot observe its id or content by any path", async () => {
    const own = await as(buyer, async () => {
      const read = await import("@/lib/notifications/read");
      return { list: await read.listOwnNotifications(), one: await read.getOwnNotification(NOTIFICATION_FIXTURE.id) };
    });
    expect(own.list?.rows.map((row) => row.id)).toContain(NOTIFICATION_FIXTURE.id);
    expect(own.one?.title.startsWith(NOTIFICATION_FIXTURE.titlePrefix)).toBe(true);
    expect(own.one).not.toHaveProperty("readAt");

    const foreign = await as(otherOrg, async () => {
      const read = await import("@/lib/notifications/read");
      return { list: await read.listOwnNotifications(), one: await read.getOwnNotification(NOTIFICATION_FIXTURE.id) };
    });
    expect(foreign.one).toBeNull();
    expect(foreign.list?.rows.map((row) => row.id)).not.toContain(NOTIFICATION_FIXTURE.id);
    expect(JSON.stringify(foreign.list)).not.toContain(NOTIFICATION_FIXTURE.titlePrefix);
    // Honest empty state for a user with no notifications.
    expect(foreign.list?.rows).toEqual([]);

    const { data: rawForeign } = await otherOrg.from("notifications").select("id, title").eq("id", NOTIFICATION_FIXTURE.id);
    expect(rawForeign).toEqual([]);

    const anon = await as(anonymous, async () => {
      const read = await import("@/lib/notifications/read");
      return { list: await read.listOwnNotifications(), one: await read.getOwnNotification(NOTIFICATION_FIXTURE.id) };
    });
    expect(anon).toEqual({ list: null, one: null });
  }, LIVE_TIMEOUT_MS);

  it("DB-BLOCK-04 holds live: a member session can neither create a notification nor mark one read", async () => {
    const { error: insertError } = await buyer.from("notifications").insert({ user_id: buyerUserId, notification_type: "ORDER_UPDATES", title: `${NOTIFICATION_FIXTURE.titlePrefix} forged`, body: "forged" });
    expect(insertError?.code).toBe("42501");
    const { data: updated, error: updateError } = await buyer.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", NOTIFICATION_FIXTURE.id).select("id");
    expect(updateError === null ? updated : []).toEqual([]);
    const { data: row } = await buyer.from("notifications").select("id, read_at").eq("id", NOTIFICATION_FIXTURE.id).single();
    expect(row?.read_at).toBeNull();
  }, LIVE_TIMEOUT_MS);
});

describe("T011 — own-user notification preferences", () => {
  it("the owner's change persists (exact twelve cells) and reads back", async () => {
    const chosen = { ORDER_UPDATES__EMAIL: true, SHIPMENT_UPDATES__WHATSAPP: true, KYB_DOCUMENTS__SMS: true };
    const saved = await as(buyer, async () => {
      const { saveNotificationPreferencesAction } = await import("@/src/app/dashboard/notifications/preferences/actions");
      return saveNotificationPreferencesAction(undefined, preferenceForm(chosen));
    });
    expect(saved).toMatchObject({ ok: true, code: "notification_preferences_saved", data: { saved: 12 } });

    const cells = await as(buyer, async () => {
      const { readOwnNotificationPreferences } = await import("@/lib/notifications/preferences");
      return readOwnNotificationPreferences();
    });
    expect(cells).toHaveLength(12);
    for (const cell of cells!) {
      expect(cell.stored).toBe(true);
      expect(cell.enabled, `${cell.type}__${cell.channel}`).toBe(Boolean((chosen as Record<string, boolean>)[`${cell.type}__${cell.channel}`]));
    }
  }, LIVE_TIMEOUT_MS);

  it("exact-field validation refuses unknown keys, missing cells and non-boolean values", async () => {
    const results = await as(buyer, async () => {
      const { saveNotificationPreferencesAction } = await import("@/src/app/dashboard/notifications/preferences/actions");
      const unknown = preferenceForm({});
      unknown.set("MARKETPLACE_DIGEST__EMAIL", "true");
      const missing = preferenceForm({});
      missing.delete("ORDER_UPDATES__EMAIL");
      const badValue = preferenceForm({});
      badValue.set("ORDER_UPDATES__EMAIL", "yes");
      const smuggledUser = preferenceForm({});
      smuggledUser.set("user_id", otherOrgUserId);
      return Promise.all([unknown, missing, badValue, smuggledUser].map((form) => saveNotificationPreferencesAction(undefined, form)));
    });
    for (const result of results) expect(result).toMatchObject({ ok: false, code: "validation_error" });
  }, LIVE_TIMEOUT_MS);

  it("another user can neither read nor write the owner's preferences (app + RLS)", async () => {
    const theirs = await as(otherOrg, async () => {
      const { readOwnNotificationPreferences } = await import("@/lib/notifications/preferences");
      return readOwnNotificationPreferences();
    });
    expect(theirs?.every((cell) => !cell.stored)).toBe(true);

    const { data: rawRead } = await otherOrg.from("notification_preferences").select("user_id").eq("user_id", buyerUserId);
    expect(rawRead).toEqual([]);
    const { error: rawUpsert } = await otherOrg.from("notification_preferences").upsert({ user_id: buyerUserId, channel: "EMAIL", notification_type: "ORDER_UPDATES", is_enabled: false });
    expect(rawUpsert?.code).toBe("42501");
    const { data: rawUpdate, error: rawUpdateError } = await otherOrg.from("notification_preferences").update({ is_enabled: false }).eq("user_id", buyerUserId).select("user_id");
    expect(rawUpdateError === null ? rawUpdate : []).toEqual([]);

    const ownerStill = await as(buyer, async () => {
      const { readOwnNotificationPreferences } = await import("@/lib/notifications/preferences");
      return readOwnNotificationPreferences();
    });
    expect(ownerStill?.find((cell) => cell.type === "ORDER_UPDATES" && cell.channel === "EMAIL")?.enabled).toBe(true);
  }, LIVE_TIMEOUT_MS);
});

describe("T007 — linkage reflects the real record state; creating and updating a dispute changes nothing else (DB-OPEN-09)", () => {
  it("the dispute reports the order's OWN status; the order's dispute list links back; an unrelated organization sees no linkage", async () => {
    const own = await as(buyer, async () => {
      const read = await import("@/lib/disputes/read");
      return { detail: await read.getDisputeForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId }), forOrder: await read.listDisputesForOrder({ organizationId: ORG_A, userId: buyerUserId, orderId: ORDER_A }) };
    });
    const order = (before.orders as Array<{ id: string; status: string }>).find((row) => row.id === ORDER_A)!;
    expect(own.detail?.orderStatus).toBe(order.status);
    expect(own.forOrder.map((row) => row.id)).toContain(disputeId);

    const foreign = await as(otherOrg, async () => {
      const read = await import("@/lib/disputes/read");
      return read.listDisputesForOrder({ organizationId: ORG_B, userId: otherOrgUserId, orderId: ORDER_A });
    });
    expect(foreign).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("after raising, adding evidence and compliance FREEZING the dispute, every order/shipment/payment/reservation/history/custody/inventory row is byte-identical", async () => {
    const frozen = await as(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      const review = await ops.beginReview({ disputeId });
      const freeze = await ops.markFrozen({ disputeId });
      return { review, freeze };
    });
    expect(frozen.review.ok).toBe(true);
    expect(frozen.freeze).toMatchObject({ ok: true, data: { toStatus: "FROZEN" } });

    const after = inspectDisputeFixtures();
    expect(businessState(after)).toEqual(businessState(before));
    const orderAfter = (after.orders as Array<{ id: string; status: string }>).find((row) => row.id === ORDER_A)!;
    expect(orderAfter.status).not.toBe("DISPUTED");
    expect((after.disputes as Array<{ id: string; status: string }>).find((row) => row.id === disputeId)?.status).toBe("FROZEN");
  }, LIVE_TIMEOUT_MS);
});
