import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPUTE_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  PHASE89_FIXTURES,
  cleanupAuditorFixture,
  cleanupComplianceFixture,
  cleanupDisputeTestRows,
  createAnonymousFixtureClient,
  inspectAuditorFixture,
  inspectComplianceFixture,
  inspectDisputeFixtures,
  prepareAuditorFixture,
  prepareComplianceFixture,
  seedDisputeFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 012 RUN A — T019 (role restriction) plus the live proofs for T003 (member raise/evidence)
 * and T004 (compliance transitions), against the REAL database under real password-grant sessions.
 *
 * Identities: the standing buyer-only member (Org A, owner of Feature 005's standing order
 * `F005-FIX-ORDER-A`), the standing buyer-and-seller member (Org B — the UNRELATED organization),
 * the standing blocked member (with Feature 012's standing fixture order on its own organization),
 * the standing WAREHOUSE and FINANCE operators, and two HUMAN-AUTHORIZED DISPOSABLE operators created
 * for this file only — COMPLIANCE (role exactly COMPLIANCE) and AUDITOR (role exactly AUDITOR), both
 * de-privileged in `afterAll`. No SUPER_ADMIN, no ADMIN, no service role is used for any product
 * path; the privileged seed script only prepares/inspects/cleans fixtures (its approved boundary).
 *
 * Every raised dispute carries `DISPUTE_FIXTURES.reasonPrefix` and sits on a fixture order, so
 * `cleanupDisputeTestRows()` removes exactly this suite's rows and nothing else.
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

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  cookieState.value = undefined;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 120_000;
const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
const ORG_B = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;
const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
const BLOCKED_ORG = PHASE89_FIXTURES.blockedMember.organizationId;
const tag = (text: string) => `${DISPUTE_FIXTURES.reasonPrefix} ${text}`;

let buyer: SupabaseClient;
let buyerUserId: string;
let otherOrg: SupabaseClient;
let otherOrgUserId: string;
let blocked: SupabaseClient;
let blockedUserId: string;
let warehouse: SupabaseClient;
let finance: SupabaseClient;
let compliance: SupabaseClient;
let complianceUserId: string;
let auditor: SupabaseClient;
let anonymous: SupabaseClient;
let sideEffectsBefore: Record<string, unknown>;

/** The side-effect-relevant part of a fixture snapshot (everything except the disputes themselves). */
function businessState(snapshot: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "disputes" && key !== "evidence"));
}

async function readDisputeAsCompliance(id: string) {
  const { data, error } = await compliance
    .from("disputes")
    .select("id, order_id, status, reason, resolution, resolved_by, resolved_at, opened_by_user_id, opened_by_organization_id, correlation_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`compliance read failed: ${error.code}`);
  return data;
}

async function raiseAsBuyer(text: string): Promise<string> {
  const result = await withLiveClient(buyer, async () => {
    const { raiseDispute } = await import("@/lib/disputes/member");
    return raiseDispute({ organizationId: ORG_A, userId: buyerUserId, input: { orderId: ORDER_A, reason: tag(text) } });
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`raise failed: ${result.code}`);
  return result.data.id;
}

beforeAll(async () => {
  seedDisputeFixtures();
  cleanupDisputeTestRows();
  prepareComplianceFixture();
  prepareAuditorFixture();

  buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
  otherOrg = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
  blocked = await signInAsFixture(PHASE89_FIXTURES.blockedMember.email);
  warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
  finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  anonymous = createAnonymousFixtureClient();

  buyerUserId = (await buyer.auth.getUser()).data.user!.id;
  otherOrgUserId = (await otherOrg.auth.getUser()).data.user!.id;
  blockedUserId = (await blocked.auth.getUser()).data.user!.id;
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;

  sideEffectsBefore = inspectDisputeFixtures();
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  // Disputes first: `resolved_by` references the disposable compliance principal's profile.
  const disputeCleanup = cleanupDisputeTestRows();
  expect(disputeCleanup.remainingTaggedDisputes).toBe(0);

  const complianceCleanup = cleanupComplianceFixture();
  expect(complianceCleanup.activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);

  const auditorCleanup = cleanupAuditorFixture();
  expect(auditorCleanup.activeAdminPrivilege).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T003 — member raises a dispute through the approved authority (live)", () => {
  let disputeId: string;

  it("the buyer's Server Action raises an OPEN dispute attributed to the authenticated user, the acting organization and the order", async () => {
    const result = await withLiveClient(buyer, async () => {
      const { raiseDisputeAction } = await import("@/src/app/dashboard/disputes/actions");
      const formData = new FormData();
      formData.set("orderId", ORDER_A);
      formData.set("reason", tag("Delivered bags do not match the contracted lot."));
      return raiseDisputeAction(undefined, formData);
    });
    expect(result).toMatchObject({ ok: true, code: "dispute_raised" });
    if (!result.ok) return;
    disputeId = result.data.id;

    const row = await readDisputeAsCompliance(disputeId);
    expect(row).toMatchObject({
      order_id: ORDER_A,
      status: "OPEN",
      opened_by_user_id: buyerUserId,
      opened_by_organization_id: ORG_A,
      resolution: null,
      resolved_by: null,
      resolved_at: null,
    });

    // Correlation: the dispute carries its order's own correlation id when the order has one.
    const order = (sideEffectsBefore.orders as Array<{ id: string; correlation_id: string | null }>).find((candidate) => candidate.id === ORDER_A);
    if (order?.correlation_id) expect(row?.correlation_id).toBe(order.correlation_id);
    else expect(row?.correlation_id).toMatch(/^[0-9a-f-]{36}$/);
  }, LIVE_TIMEOUT_MS);

  it("the member read layer returns the dispute to its own organization, and only there", async () => {
    const own = await withLiveClient(buyer, async () => {
      const { getDisputeForMember, listDisputesForMember } = await import("@/lib/disputes/read");
      return { detail: await getDisputeForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId }), list: await listDisputesForMember({ organizationId: ORG_A, userId: buyerUserId }) };
    });
    expect(own.detail).toMatchObject({ id: disputeId, orderId: ORDER_A, status: "OPEN", raisedByYou: true });
    expect(own.detail).not.toHaveProperty("openedByUserId");
    expect(own.detail).not.toHaveProperty("resolvedBy");
    expect(own.list.rows.map((row) => row.id)).toContain(disputeId);

    const foreign = await withLiveClient(otherOrg, async () => {
      const { getDisputeForMember, listDisputesForMember, getDisputeEvidenceForMember } = await import("@/lib/disputes/read");
      return {
        detail: await getDisputeForMember({ organizationId: ORG_B, userId: otherOrgUserId, disputeId }),
        list: await listDisputesForMember({ organizationId: ORG_B, userId: otherOrgUserId }),
        evidence: await getDisputeEvidenceForMember({ organizationId: ORG_B, userId: otherOrgUserId, disputeId }),
        // Even claiming Org A's id cannot widen what RLS returns to this session.
        spoofed: await getDisputeForMember({ organizationId: ORG_A, userId: otherOrgUserId, disputeId }),
      };
    });
    expect(foreign.detail).toBeNull();
    expect(foreign.spoofed).toBeNull();
    expect(foreign.evidence).toBeNull();
    expect(foreign.list.rows.map((row) => row.id)).not.toContain(disputeId);

    const { data: rawForeign } = await otherOrg.from("disputes").select("id").eq("id", disputeId);
    expect(rawForeign).toEqual([]);
  }, LIVE_TIMEOUT_MS);

  it("an unrelated organization is refused — by the domain layer (safe not-found) and by RLS", async () => {
    const result = await withLiveClient(otherOrg, async () => {
      const { raiseDispute } = await import("@/lib/disputes/member");
      return raiseDispute({ organizationId: ORG_B, userId: otherOrgUserId, input: { orderId: ORDER_A, reason: tag("cross-organization attempt") } });
    });
    expect(result).toEqual({ ok: false, code: "order_not_found" });

    const { error } = await otherOrg.from("disputes").insert({ order_id: ORDER_A, opened_by_user_id: otherOrgUserId, opened_by_organization_id: ORG_B, reason: tag("raw cross-organization insert") });
    expect(error?.code).toBe("42501");
  }, LIVE_TIMEOUT_MS);

  it("opened_by_user_id cannot be forged: RLS refuses a dispute attributed to another user", async () => {
    const { error } = await buyer.from("disputes").insert({ order_id: ORDER_A, opened_by_user_id: otherOrgUserId, reason: tag("forged opener") });
    expect(error?.code).toBe("42501");
  }, LIVE_TIMEOUT_MS);

  it("a blocked user is refused — by the Server Action boundary and by RLS's own NOT is_blocked_user() clause", async () => {
    // The blocked user CAN view its own organization's fixture order, so only the blocked clause refuses.
    const { data: visible } = await blocked.from("orders").select("id").eq("id", DISPUTE_FIXTURES.blockedOrderId);
    expect(visible).toEqual([{ id: DISPUTE_FIXTURES.blockedOrderId }]);

    const actionResult = await withLiveClient(blocked, async () => {
      const { raiseDisputeAction } = await import("@/src/app/dashboard/disputes/actions");
      const formData = new FormData();
      formData.set("orderId", DISPUTE_FIXTURES.blockedOrderId);
      formData.set("reason", tag("blocked user attempt via action"));
      return raiseDisputeAction(undefined, formData);
    });
    expect(actionResult).toEqual({ ok: false, code: "dispute_not_capable" });

    const domainResult = await withLiveClient(blocked, async () => {
      const { raiseDispute } = await import("@/lib/disputes/member");
      return raiseDispute({ organizationId: BLOCKED_ORG, userId: blockedUserId, input: { orderId: DISPUTE_FIXTURES.blockedOrderId, reason: tag("blocked user attempt via domain") } });
    });
    expect(domainResult.ok).toBe(false);

    const { error } = await blocked.from("disputes").insert({ order_id: DISPUTE_FIXTURES.blockedOrderId, opened_by_user_id: blockedUserId, reason: tag("raw blocked insert") });
    expect(error?.code).toBe("42501");
  }, LIVE_TIMEOUT_MS);

  it("text evidence: the participant appends a note (no file); an unrelated organization can neither add nor read one", async () => {
    const added = await withLiveClient(buyer, async () => {
      const { addDisputeEvidenceNote } = await import("@/lib/disputes/member");
      return addDisputeEvidenceNote({ organizationId: ORG_A, userId: buyerUserId, input: { disputeId, note: "<img src=x onerror=alert(1)> photo of torn bags available on request" } });
    });
    expect(added).toMatchObject({ ok: true, code: "dispute_evidence_recorded" });

    const own = await withLiveClient(buyer, async () => {
      const { getDisputeEvidenceForMember } = await import("@/lib/disputes/read");
      return getDisputeEvidenceForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId });
    });
    expect(own).toHaveLength(1);
    expect(own?.[0]).toMatchObject({ uploadedBy: buyerUserId, hasFileReference: false });

    const foreign = await withLiveClient(otherOrg, async () => {
      const { addDisputeEvidenceNote } = await import("@/lib/disputes/member");
      return addDisputeEvidenceNote({ organizationId: ORG_B, userId: otherOrgUserId, input: { disputeId, note: "cross-organization note" } });
    });
    expect(foreign).toEqual({ ok: false, code: "dispute_not_found" });

    const { error } = await otherOrg.from("dispute_evidence").insert({ dispute_id: disputeId, uploaded_by: otherOrgUserId, note: "raw cross-organization note" });
    expect(error?.code).toBe("42501");
  }, LIVE_TIMEOUT_MS);
});

describe("T004 — compliance transitions and resolution (live, disposable COMPLIANCE operator)", () => {
  it("walks OPEN → UNDER_REVIEW → FROZEN → UNDER_REVIEW → RESOLVED → CLOSED, recording actor/reason/timestamp where the schema has columns for them", async () => {
    const id = await raiseAsBuyer("Moisture reading on arrival exceeds the contract specification.");

    const steps = await withLiveClient(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      const review = await ops.beginReview({ disputeId: id });
      const frozen = await ops.markFrozen({ disputeId: id });
      const resumed = await ops.resumeReview({ disputeId: id });
      const resolved = await ops.resolveDispute({ disputeId: id, resolution: "Moisture test confirmed; partial credit agreed with the seller." });
      return { review, frozen, resumed, resolved };
    });
    expect(steps.review).toMatchObject({ ok: true, data: { fromStatus: "OPEN", toStatus: "UNDER_REVIEW", attribution: "timestamp-only" } });
    expect(steps.frozen).toMatchObject({ ok: true, data: { fromStatus: "UNDER_REVIEW", toStatus: "FROZEN", attribution: "timestamp-only" } });
    expect(steps.resumed).toMatchObject({ ok: true, data: { fromStatus: "FROZEN", toStatus: "UNDER_REVIEW" } });
    expect(steps.resolved).toMatchObject({ ok: true, code: "dispute_transition_recorded", data: { fromStatus: "UNDER_REVIEW", toStatus: "RESOLVED", attribution: "recorded" } });

    const resolvedRow = await readDisputeAsCompliance(id);
    expect(resolvedRow).toMatchObject({ status: "RESOLVED", resolution: "Moisture test confirmed; partial credit agreed with the seller.", resolved_by: complianceUserId, opened_by_user_id: buyerUserId, order_id: ORDER_A });
    expect(resolvedRow?.resolved_at).toBeTruthy();
    expect(Date.parse(resolvedRow!.updated_at)).toBeGreaterThan(0);

    const closing = await withLiveClient(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      return { closed: await ops.closeDispute({ disputeId: id }), reResolve: await ops.resolveDispute({ disputeId: id, resolution: "Attempt to overwrite the recorded outcome." }), reopen: await ops.beginReview({ disputeId: id }) };
    });
    expect(closing.closed).toMatchObject({ ok: true, data: { fromStatus: "RESOLVED", toStatus: "CLOSED", attribution: "timestamp-only" } });
    expect(closing.reResolve).toEqual({ ok: false, code: "dispute_transition_refused" });
    expect(closing.reopen).toEqual({ ok: false, code: "dispute_transition_refused" });

    const closedRow = await readDisputeAsCompliance(id);
    // Non-destructive: closing kept the recorded resolution, actor and timestamp exactly.
    expect(closedRow).toMatchObject({ status: "CLOSED", resolution: resolvedRow!.resolution, resolved_by: complianceUserId, resolved_at: resolvedRow!.resolved_at });

    // The member sees the outcome but never the operator's identity.
    const memberView = await withLiveClient(buyer, async () => {
      const { getDisputeForMember } = await import("@/lib/disputes/read");
      return getDisputeForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId: id });
    });
    expect(memberView).toMatchObject({ status: "CLOSED", resolution: resolvedRow!.resolution });
    expect(JSON.stringify(memberView)).not.toContain(complianceUserId);
  }, LIVE_TIMEOUT_MS);

  it("rejects straight from OPEN with a recorded reason; unapproved transitions, invalid input and missing ids are refused safely", async () => {
    const id = await raiseAsBuyer("Duplicate complaint raised in error.");
    const results = await withLiveClient(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      return {
        closeOpen: await ops.closeDispute({ disputeId: id }),
        resolveOpen: await ops.resolveDispute({ disputeId: id, resolution: "Cannot resolve before review." }),
        shortReason: await ops.rejectDispute({ disputeId: id, resolution: "no" }),
        missing: await ops.beginReview({ disputeId: "12000000-0000-4000-8000-0000000000ff" }),
        malformed: await ops.beginReview({ disputeId: "not-a-uuid" }),
        rejected: await ops.rejectDispute({ disputeId: id, resolution: "Duplicate of an existing dispute on the same order." }),
      };
    });
    expect(results.closeOpen).toEqual({ ok: false, code: "dispute_transition_refused" });
    expect(results.resolveOpen).toEqual({ ok: false, code: "dispute_transition_refused" });
    expect(results.shortReason).toMatchObject({ ok: false, code: "validation_error" });
    expect(results.missing).toEqual({ ok: false, code: "dispute_not_found" });
    expect(results.malformed).toMatchObject({ ok: false, code: "validation_error" });
    expect(results.rejected).toMatchObject({ ok: true, data: { fromStatus: "OPEN", toStatus: "REJECTED", attribution: "recorded" } });

    const row = await readDisputeAsCompliance(id);
    expect(row).toMatchObject({ status: "REJECTED", resolution: "Duplicate of an existing dispute on the same order.", resolved_by: complianceUserId });
  }, LIVE_TIMEOUT_MS);

  it("operator read audiences: COMPLIANCE and AUDITOR read disputes (a pure role cannot read the order context — reported, not guessed); each audience function refuses the other roles", async () => {
    const id = await raiseAsBuyer("Audience read check.");
    const complianceView = await withLiveClient(compliance, async () => {
      const read = await import("@/lib/disputes/read");
      return { own: await read.getDisputeForCompliance(id), queue: await read.listDisputesForCompliance({ statuses: ["OPEN"] }), asAuditor: await read.getDisputeForAuditor(id), missing: await read.getDisputeForCompliance("12000000-0000-4000-8000-0000000000ff") };
    });
    expect(complianceView.own).toMatchObject({ id, status: "OPEN", orderId: ORDER_A, orderCode: null, orderContextReadable: false });
    expect(complianceView.queue?.rows.map((row) => row.id)).toContain(id);
    expect(complianceView.asAuditor).toBeNull();
    expect(complianceView.missing).toBeNull();

    const auditorView = await withLiveClient(auditor, async () => {
      const read = await import("@/lib/disputes/read");
      return { own: await read.getDisputeForAuditor(id), evidence: await read.getDisputeEvidenceForOperator("auditor", id), asCompliance: await read.getDisputeForCompliance(id) };
    });
    expect(auditorView.own).toMatchObject({ id, status: "OPEN" });
    expect(auditorView.evidence).toEqual([]);
    expect(auditorView.asCompliance).toBeNull();

    for (const [label, client] of [["member (participant)", buyer], ["member (unrelated organization)", otherOrg], ["warehouse", warehouse], ["finance", finance]] as const) {
      const view = await withLiveClient(client, async () => {
        const read = await import("@/lib/disputes/read");
        return { compliance: await read.getDisputeForCompliance(id), auditor: await read.getDisputeForAuditor(id), queue: await read.listDisputesForCompliance() };
      });
      expect(view, label).toEqual({ compliance: null, auditor: null, queue: null });
    }
  }, LIVE_TIMEOUT_MS);
});

describe("T019 — only COMPLIANCE changes dispute status: every other role is refused in the app AND by RLS (live)", () => {
  let targetId: string;

  beforeAll(async () => {
    targetId = await raiseAsBuyer("Role restriction target.");
  }, LIVE_TIMEOUT_MS);

  const refusedRoles = () =>
    [
      ["member (the dispute's own participant)", buyer],
      ["member (unrelated organization)", otherOrg],
      ["blocked member", blocked],
      ["WAREHOUSE", warehouse],
      ["FINANCE", finance],
      ["AUDITOR", auditor],
    ] as const;

  it("application boundary: every named compliance operation returns COMPLIANCE_NOT_CAPABLE for member / WAREHOUSE / FINANCE / AUDITOR / blocked / anonymous", async () => {
    for (const [label, client] of [...refusedRoles(), ["anonymous", anonymous] as const]) {
      const results = await withLiveClient(client, async () => {
        const ops = await import("@/lib/disputes/compliance");
        return [
          await ops.beginReview({ disputeId: targetId }),
          await ops.markFrozen({ disputeId: targetId }),
          await ops.resumeReview({ disputeId: targetId }),
          await ops.resolveDispute({ disputeId: targetId, resolution: `Unauthorized resolution attempt by ${label}.` }),
          await ops.rejectDispute({ disputeId: targetId, resolution: `Unauthorized rejection attempt by ${label}.` }),
          await ops.closeDispute({ disputeId: targetId }),
        ];
      });
      for (const result of results) expect(result, label).toEqual({ ok: false, code: "compliance_not_capable" });
    }
    const row = await readDisputeAsCompliance(targetId);
    expect(row).toMatchObject({ status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
  }, LIVE_TIMEOUT_MS);

  it("database boundary: a direct UPDATE from each refused role changes nothing (disputes_ops_update is is_compliance_operator() only)", async () => {
    for (const [label, client] of refusedRoles()) {
      const self = (await client.auth.getUser()).data.user!.id;
      const { data, error } = await client
        .from("disputes")
        .update({ status: "RESOLVED", resolution: `raw bypass by ${label}`, resolved_by: self, resolved_at: new Date().toISOString() })
        .eq("id", targetId)
        .select("id");
      expect(error === null ? data : [], label).toEqual([]);
    }
    const { data: anonData, error: anonError } = await anonymous.from("disputes").update({ status: "CLOSED" }).eq("id", targetId).select("id");
    expect(anonError !== null || (anonData ?? []).length === 0).toBe(true);

    // Nor can anyone delete a dispute (no DELETE policy for any authenticated role).
    for (const [label, client] of refusedRoles()) {
      const { data, error } = await client.from("disputes").delete().eq("id", targetId).select("id");
      expect(error === null ? data : [], label).toEqual([]);
    }
    const { data: complianceDelete, error: complianceDeleteError } = await compliance.from("disputes").delete().eq("id", targetId).select("id");
    expect(complianceDeleteError === null ? complianceDelete : []).toEqual([]);

    const row = await readDisputeAsCompliance(targetId);
    expect(row).toMatchObject({ id: targetId, status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
  }, LIVE_TIMEOUT_MS);

  it("positive control: the same database UPDATE path succeeds for COMPLIANCE through the domain layer", async () => {
    const result = await withLiveClient(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      return ops.beginReview({ disputeId: targetId });
    });
    expect(result).toMatchObject({ ok: true, data: { fromStatus: "OPEN", toStatus: "UNDER_REVIEW" } });
    expect((await readDisputeAsCompliance(targetId))?.status).toBe("UNDER_REVIEW");
  }, LIVE_TIMEOUT_MS);
});

describe("No side effects: raising, reviewing, freezing and resolving disputes touched no order, shipment, payment, reservation, history or custody row (DB-OPEN-09 preserved)", () => {
  it("the fixture orders' business state is byte-identical before and after the whole suite's dispute activity", () => {
    const after = inspectDisputeFixtures();
    expect(businessState(after)).toEqual(businessState(sideEffectsBefore));
    for (const order of after.orders as Array<{ status: string }>) expect(order.status).not.toBe("DISPUTED");
    // Every evidence row this suite wrote is text-only (DB-BLOCK-01: no file reference, no bytes).
    for (const evidence of after.evidence as Array<{ file_asset_id: string | null }>) expect(evidence.file_asset_id).toBeNull();
    expect((after.disputes as unknown[]).length).toBeGreaterThanOrEqual(4);
  });
});
