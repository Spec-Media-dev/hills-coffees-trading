import { readFileSync } from "node:fs";

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
  inspectDisputeStatusHistory,
  prepareAuditorFixture,
  prepareComplianceFixture,
  probeDisputeHistoryGuards,
  seedDisputeFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";
import { DISPUTE_TRANSITIONS } from "@/lib/disputes/compliance";
import { DISPUTE_STATUSES, type DisputeStatus } from "@/lib/disputes/types";

/**
 * Feature 012 RUN E — T004 / FR-002 / DB-OPEN-23 LIVE proof of the database-authoritative dispute
 * transition path (`transition_dispute()` + `trg_disputes_transition_guard`) and its append-only
 * history (`dispute_status_history` + `trg_dispute_status_history_append_only`), migration
 * `supabase/migrations/20260919120000_feature_012_dispute_status_history.sql`.
 *
 * Real password-grant sessions only: the standing buyer-only member (Org A, participant), the
 * standing buyer-and-seller member (Org B, unrelated), the blocked member, WAREHOUSE, FINANCE, and the
 * two HUMAN-AUTHORIZED DISPOSABLE operators (COMPLIANCE, AUDITOR — de-privileged in `afterAll`). The
 * service role appears ONLY inside the fixture script (seed / inspect / cleanup, and one probe that
 * proves the triggers refuse even an RLS-bypassing caller) — never on a product path.
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
const ORG_B = FOUNDATION_FIXTURES.buyerAndSeller.organizationId;
const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
const tag = (text: string) => `${DISPUTE_FIXTURES.reasonPrefix} ${text}`;

type HistoryRow = { id: string; dispute_id: string; from_status: DisputeStatus; to_status: DisputeStatus; actor_user_id: string; reason: string; correlation_id: string | null; created_at: string };
type Step = { to: DisputeStatus; reason: string };

let buyer: SupabaseClient;
let buyerUserId: string;
let otherOrg: SupabaseClient;
let otherOrgUserId: string;
let blocked: SupabaseClient;
let warehouse: SupabaseClient;
let finance: SupabaseClient;
let compliance: SupabaseClient;
let complianceSecond: SupabaseClient;
let complianceUserId: string;
let auditor: SupabaseClient;
let anonymous: SupabaseClient;
let historyRowsBefore: number;
let businessBefore: Record<string, unknown>;

const businessState = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "disputes" && key !== "evidence"));

async function raise(text: string): Promise<{ id: string; correlationId: string }> {
  const result = await as(buyer, async () => {
    const { raiseDisputeAction } = await import("@/src/app/dashboard/disputes/actions");
    const formData = new FormData();
    formData.set("orderId", ORDER_A);
    formData.set("reason", tag(text));
    return raiseDisputeAction(undefined, formData);
  });
  if (!result.ok) throw new Error(`raise failed: ${result.code}`);
  const row = await disputeAsCompliance(result.data.id);
  expect(row).toMatchObject({ status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
  expect(row.correlation_id).toBeTruthy();
  return { id: result.data.id, correlationId: row.correlation_id as string };
}

async function historyOf(client: SupabaseClient, disputeId: string) {
  return client.from("dispute_status_history").select("id, dispute_id, from_status, to_status, actor_user_id, reason, correlation_id, created_at").eq("dispute_id", disputeId).order("created_at").order("id");
}

async function historyAsCompliance(disputeId: string): Promise<HistoryRow[]> {
  const { data, error } = await historyOf(compliance, disputeId);
  if (error) throw new Error(`history read failed: ${error.code}`);
  return (data ?? []) as HistoryRow[];
}

async function disputeAsCompliance(disputeId: string) {
  const { data, error } = await compliance.from("disputes").select("id, status, resolution, resolved_by, resolved_at, correlation_id, updated_at").eq("id", disputeId).single();
  if (error) throw new Error(`dispute read failed: ${error.code}`);
  return data;
}

/** A raw call to the database function — no application pre-check, no role check, no graph check. */
async function rawTransition(client: SupabaseClient, disputeId: string, expected: DisputeStatus | null, to: string, reason: string) {
  return client.rpc("transition_dispute", { p_dispute_id: disputeId, p_expected_status: expected, p_to_status: to, p_reason: reason });
}

const OPERATION: Record<string, "beginReview" | "markFrozen" | "resumeReview" | "resolveDispute" | "rejectDispute" | "closeDispute"> = {
  "OPEN>UNDER_REVIEW": "beginReview",
  "OPEN>FROZEN": "markFrozen",
  "OPEN>REJECTED": "rejectDispute",
  "UNDER_REVIEW>FROZEN": "markFrozen",
  "UNDER_REVIEW>RESOLVED": "resolveDispute",
  "UNDER_REVIEW>REJECTED": "rejectDispute",
  "FROZEN>UNDER_REVIEW": "resumeReview",
  "FROZEN>RESOLVED": "resolveDispute",
  "FROZEN>REJECTED": "rejectDispute",
  "RESOLVED>CLOSED": "closeDispute",
  "REJECTED>CLOSED": "closeDispute",
};

/** Every pair the graph does NOT approve from `from` (including staying put), for the DB-refusal sweep. */
const unapprovedFrom = (from: DisputeStatus) => DISPUTE_STATUSES.filter((to) => !(DISPUTE_TRANSITIONS[from] as readonly string[]).includes(to));

const refusedInvalidPairs: string[] = [];

/**
 * Walks one dispute along `steps` through the COMPLIANCE domain layer. Before every step it first
 * sweeps EVERY unapproved target from the current status straight at the database function (bypassing
 * the application's pre-check) and requires `invalid_dispute_transition` with no history row added.
 */
async function walk(disputeId: string, steps: Step[]) {
  let from: DisputeStatus = "OPEN";
  const outcomes = [];
  for (const [index, step] of [...steps, null].entries()) {
    const before = await historyAsCompliance(disputeId);
    for (const invalid of unapprovedFrom(from)) {
      const { data, error } = await rawTransition(compliance, disputeId, from, invalid, `Invalid ${from} to ${invalid} sweep.`);
      expect(data, `${from}>${invalid}`).toBeNull();
      expect(error?.message, `${from}>${invalid}`).toBe("invalid_dispute_transition");
      refusedInvalidPairs.push(`${from}>${invalid}`);
    }
    expect(await historyAsCompliance(disputeId), `no history from refused sweep at ${from}`).toEqual(before);
    if (!step) break;

    const operation = OPERATION[`${from}>${step.to}`]!;
    const input = operation === "resolveDispute" || operation === "rejectDispute" ? { disputeId, resolution: step.reason, expectedStatus: from } : { disputeId, reason: step.reason, expectedStatus: from };
    const result = await as(compliance, async () => {
      const ops = await import("@/lib/disputes/compliance");
      return ops[operation](input);
    });
    expect(result, `${from}>${step.to} (step ${index})`).toMatchObject({ ok: true, code: "dispute_transition_recorded", data: { disputeId, fromStatus: from, toStatus: step.to, attribution: "recorded" } });
    if (!result.ok) throw new Error("transition failed");
    outcomes.push(result.data);
    from = step.to;
  }
  return outcomes;
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
  complianceSecond = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
  anonymous = createAnonymousFixtureClient();

  buyerUserId = (await buyer.auth.getUser()).data.user!.id;
  otherOrgUserId = (await otherOrg.auth.getUser()).data.user!.id;
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;

  const baseline = inspectDisputeStatusHistory();
  expect(baseline.taggedDisputeIds).toEqual([]);
  historyRowsBefore = baseline.totalHistoryRows as number;
  businessBefore = businessState(inspectDisputeFixtures());
}, LIVE_TIMEOUT_MS);

afterAll(async () => {
  const disputes = cleanupDisputeTestRows();
  expect(disputes.remainingTaggedDisputes).toBe(0);
  // History cascades with its (disposable) dispute: nothing of this suite's remains, nothing else moved.
  const history = inspectDisputeStatusHistory();
  expect(history.taggedDisputeIds).toEqual([]);
  expect(history.totalHistoryRows).toBe(historyRowsBefore);

  expect(cleanupComplianceFixture().activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
  expect(cleanupAuditorFixture().activeAdminPrivilege).toBe(false);
  expect(inspectAuditorFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("static: the database graph IS the application graph", () => {
  it("transition_dispute()'s approved pairs equal DISPUTE_TRANSITIONS exactly (no second vocabulary)", () => {
    const sql = readFileSync("supabase/migrations/20260919120000_feature_012_dispute_status_history.sql", "utf8");
    const body = sql.slice(sql.indexOf("create or replace function public.transition_dispute("));
    const clauses = [...body.matchAll(/v_dispute\.status = '([A-Z_]+)' and p_to_status (?:in \(([^)]*)\)|= '([A-Z_]+)')/g)];
    const database: Record<string, string[]> = {};
    for (const [, from, list, single] of clauses) {
      database[from!] = (list ? [...list.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]!) : [single!]).sort();
    }
    const application = Object.fromEntries(Object.entries(DISPUTE_TRANSITIONS).filter(([, targets]) => targets.length > 0).map(([from, targets]) => [from, [...targets].sort()]));
    expect(database).toEqual(application);
    expect(DISPUTE_TRANSITIONS.CLOSED).toEqual([]);
  });

  it("the migration adds no generic setter, no backfill, and never touches order/shipment/payment/inventory tables", () => {
    const sql = readFileSync("supabase/migrations/20260919120000_feature_012_dispute_status_history.sql", "utf8").replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/\b(insert into|update|delete from)\s+public\.(orders|order_shipments|order_items|payments|payouts|inventory_positions|inventory_reservations|storage_allocations)\b/i);
    expect(sql.match(/insert into public\.dispute_status_history/gi)).toHaveLength(1);
    expect(sql).not.toMatch(/insert into public\.dispute_status_history[^;]*select/i);
    expect(sql).toMatch(/grant select on (table )?public\.dispute_status_history to authenticated/i);
    expect(sql).not.toMatch(/grant[^;]*(insert|update|delete)[^;]*dispute_status_history/i);
    expect(sql).not.toMatch(/grant[^;]*dispute_status_history[^;]*\banon\b/i);
  });
});

describe("T004 — every approved transition, attributed and recorded exactly once (live)", () => {
  const PATHS: Array<{ label: string; steps: Step[] }> = [
    {
      label: "A: OPEN → UNDER_REVIEW → FROZEN → UNDER_REVIEW → RESOLVED → CLOSED",
      steps: [
        { to: "UNDER_REVIEW", reason: "Moisture complaint accepted for review." },
        { to: "FROZEN", reason: "Awaiting the independent moisture test." },
        { to: "UNDER_REVIEW", reason: "Independent moisture test received." },
        { to: "RESOLVED", reason: "Moisture confirmed; partial credit agreed with the seller." },
        { to: "CLOSED", reason: "Credit note issued; dispute closed." },
      ],
    },
    { label: "B: OPEN → FROZEN → RESOLVED", steps: [{ to: "FROZEN", reason: "Frozen pending the warehouse weight report." }, { to: "RESOLVED", reason: "Weight report reconciles; no loss found." }] },
    {
      label: "C: OPEN → FROZEN → REJECTED → CLOSED",
      steps: [
        { to: "FROZEN", reason: "Frozen pending the carrier statement." },
        { to: "REJECTED", reason: "Carrier statement shows the damage was pre-existing." },
        { to: "CLOSED", reason: "Rejection communicated; dispute closed." },
      ],
    },
    { label: "D: OPEN → UNDER_REVIEW → REJECTED", steps: [{ to: "UNDER_REVIEW", reason: "Grading complaint accepted for review." }, { to: "REJECTED", reason: "Grade matches the contracted specification." }] },
    { label: "E: OPEN → REJECTED", steps: [{ to: "REJECTED", reason: "Duplicate of an existing dispute on the same order." }] },
  ];
  const walked: Array<{ id: string; correlationId: string; steps: Step[]; history: HistoryRow[] }> = [];

  it("1–4: the member raises real disputes; COMPLIANCE walks every edge of the graph; each transition appends exactly one correctly attributed row", async () => {
    for (const path of PATHS) {
      const { id, correlationId } = await raise(`RUN E history proof, path ${path.label.slice(0, 1)}.`);
      expect(await historyAsCompliance(id), "a freshly raised dispute has no history").toEqual([]);

      const outcomes = await walk(id, path.steps);
      const history = await historyAsCompliance(id);
      expect(history, path.label).toHaveLength(path.steps.length);

      let from: DisputeStatus = "OPEN";
      history.forEach((row, index) => {
        const step = path.steps[index]!;
        expect(row, `${path.label} #${index}`).toMatchObject({ dispute_id: id, from_status: from, to_status: step.to, actor_user_id: complianceUserId, reason: step.reason, correlation_id: correlationId });
        expect(row.id).toBe(outcomes[index]!.historyId);
        expect(Date.parse(row.created_at)).toBe(Date.parse(outcomes[index]!.recordedAt));
        if (index > 0) expect(Date.parse(row.created_at)).toBeGreaterThanOrEqual(Date.parse(history[index - 1]!.created_at));
        from = step.to;
      });

      const dispute = await disputeAsCompliance(id);
      expect(dispute.status).toBe(from);
      expect(Date.parse(dispute.updated_at)).toBe(Date.parse(history.at(-1)!.created_at));
      // Resolution semantics: the outcome step's reason is the resolution, written once, kept by CLOSED.
      const outcomeIndex = path.steps.findIndex((step) => step.to === "RESOLVED" || step.to === "REJECTED");
      expect(dispute.resolution).toBe(path.steps[outcomeIndex]!.reason);
      expect(dispute.resolved_by).toBe(complianceUserId);
      expect(Date.parse(dispute.resolved_at!)).toBe(Date.parse(history[outcomeIndex]!.created_at));
      walked.push({ id, correlationId, steps: path.steps, history });
    }

    const covered = new Set(walked.flatMap((entry) => entry.history.map((row) => `${row.from_status}>${row.to_status}`)));
    expect([...covered].sort()).toEqual(Object.keys(OPERATION).sort());
  }, LIVE_TIMEOUT_MS);

  it("5: every unapproved pair from every status was refused BY THE DATABASE (application pre-check bypassed)", () => {
    const expected = DISPUTE_STATUSES.flatMap((from) => unapprovedFrom(from).map((to) => `${from}>${to}`)).sort();
    expect(expected).toHaveLength(DISPUTE_STATUSES.length * DISPUTE_STATUSES.length - Object.keys(OPERATION).length);
    expect([...new Set(refusedInvalidPairs)].sort()).toEqual(expected);
  });

  it("5b: an unknown target, an outcome re-write and an empty/oversized reason are refused by the database; nothing is recorded", async () => {
    const [closed, resolved] = [walked[0]!, walked[1]!];
    const unknown = await rawTransition(compliance, resolved.id, "RESOLVED", "ARCHIVED", "Unknown target status.");
    expect(unknown.error?.message).toBe("invalid_dispute_transition");
    const reopen = await rawTransition(compliance, closed.id, "CLOSED", "UNDER_REVIEW", "Attempt to reopen a closed dispute.");
    expect(reopen.error?.message).toBe("invalid_dispute_transition");
    const blank = await rawTransition(compliance, resolved.id, "RESOLVED", "CLOSED", "   ");
    expect(blank.error?.message).toBe("dispute_reason_required");
    const oversized = await rawTransition(compliance, resolved.id, "RESOLVED", "CLOSED", "x".repeat(2001));
    expect(oversized.error?.message).toBe("dispute_reason_too_long");
    const missing = await rawTransition(compliance, "12000000-0000-4000-8000-0000000000ff", "OPEN", "UNDER_REVIEW", "Nonexistent dispute.");
    expect(missing.error?.message).toBe("dispute_not_found");
    expect(await historyAsCompliance(resolved.id)).toEqual(resolved.history);
    expect(await historyAsCompliance(closed.id)).toEqual(closed.history);
    expect((await disputeAsCompliance(resolved.id)).status).toBe("RESOLVED");
  }, LIVE_TIMEOUT_MS);

  it("6: a stale expected status is refused by the database AND the application; a real race lets exactly one writer win", async () => {
    const { id } = await raise("RUN E stale and race proof.");
    const staleRaw = await rawTransition(compliance, id, "UNDER_REVIEW", "FROZEN", "Operator saw an outdated status.");
    expect(staleRaw.error?.message).toBe("dispute_stale");
    const nullExpected = await rawTransition(compliance, id, null, "UNDER_REVIEW", "No expected status supplied.");
    expect(nullExpected.error?.message).toBe("dispute_stale");
    const staleApp = await as(compliance, async () => (await import("@/lib/disputes/compliance")).markFrozen({ disputeId: id, reason: "Operator saw an outdated status.", expectedStatus: "UNDER_REVIEW" }));
    expect(staleApp).toEqual({ ok: false, code: "dispute_stale" });
    expect(await historyAsCompliance(id)).toEqual([]);

    // Two independent COMPLIANCE sessions fire at the same instant from the SAME observed status.
    const [first, second] = await Promise.all([
      rawTransition(compliance, id, "OPEN", "UNDER_REVIEW", "Race writer one begins review."),
      rawTransition(complianceSecond, id, "OPEN", "REJECTED", "Race writer two rejects."),
    ]);
    const winners = [first, second].filter((result) => result.error === null);
    const losers = [first, second].filter((result) => result.error !== null);
    expect(winners).toHaveLength(1);
    expect(losers.map((result) => result.error?.message)).toEqual(["dispute_stale"]);
    const history = await historyAsCompliance(id);
    expect(history).toHaveLength(1);
    const winnerTo = (winners[0]!.data as { to_status: string }).to_status;
    expect(history[0]).toMatchObject({ from_status: "OPEN", to_status: winnerTo });
    expect((await disputeAsCompliance(id)).status).toBe(winnerTo);
  }, LIVE_TIMEOUT_MS);

  it("7–12: member, unrelated member, blocked member, WAREHOUSE, FINANCE and AUDITOR are refused by the database function; anonymous cannot even execute it", async () => {
    const { id } = await raise("RUN E role refusal proof.");
    for (const [label, client] of [["member (participant)", buyer], ["member (unrelated organization)", otherOrg], ["blocked member", blocked], ["WAREHOUSE", warehouse], ["FINANCE", finance], ["AUDITOR", auditor]] as const) {
      const { data, error } = await rawTransition(client, id, "OPEN", "UNDER_REVIEW", `Unauthorized transition by ${label}.`);
      expect(data, label).toBeNull();
      expect(error?.message, label).toBe("forbidden");
      const app = await as(client, async () => (await import("@/lib/disputes/compliance")).beginReview({ disputeId: id, reason: `Unauthorized transition by ${label}.` }));
      expect(app, label).toEqual({ ok: false, code: "compliance_not_capable" });
    }
    const anon = await rawTransition(anonymous, id, "OPEN", "UNDER_REVIEW", "Anonymous transition attempt.");
    expect(anon.data).toBeNull();
    expect(anon.error?.code).toBe("42501");
    const anonApp = await as(anonymous, async () => (await import("@/lib/disputes/compliance")).beginReview({ disputeId: id, reason: "Anonymous transition attempt." }));
    expect(anonApp).toEqual({ ok: false, code: "compliance_not_capable" });

    expect(await historyAsCompliance(id)).toEqual([]);
    expect(await disputeAsCompliance(id)).toMatchObject({ status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
  }, LIVE_TIMEOUT_MS);

  it("13: a raw UPDATE by COMPLIANCE itself (which the disputes_ops_update policy admits) is refused by the trigger; so is a pre-resolved raw INSERT", async () => {
    const { id } = await raise("RUN E raw bypass proof.");
    for (const patch of [
      { status: "RESOLVED" },
      { status: "UNDER_REVIEW" },
      { resolution: "Raw resolution bypass.", resolved_by: complianceUserId, resolved_at: new Date().toISOString() },
      { updated_at: new Date().toISOString() },
      { reason: tag("Rewritten intake reason.") },
    ]) {
      const { data, error } = await compliance.from("disputes").update(patch).eq("id", id).select("id");
      expect(data, JSON.stringify(patch)).toBeNull();
      expect(error?.message, JSON.stringify(patch)).toBe("dispute_changes_only_through_workflow");
    }
    expect(await disputeAsCompliance(id)).toMatchObject({ status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
    expect(await historyAsCompliance(id)).toEqual([]);

    const { error: forgedOutcome } = await buyer.from("disputes").insert({ order_id: ORDER_A, opened_by_user_id: buyerUserId, opened_by_organization_id: ORG_A, reason: tag("Pre-resolved raw insert."), status: "RESOLVED", resolution: "Self-granted." });
    expect(forgedOutcome?.message).toBe("dispute_must_start_open");
  }, LIVE_TIMEOUT_MS);

  it("14–15: no session can INSERT, UPDATE or DELETE history rows (no grant); the service role is refused by the trigger itself", async () => {
    const target = walked[0]!;
    const row = target.history[0]!;
    for (const [label, client] of [["member (participant)", buyer], ["member (unrelated organization)", otherOrg], ["COMPLIANCE", compliance], ["AUDITOR", auditor], ["WAREHOUSE", warehouse], ["FINANCE", finance], ["anonymous", anonymous]] as const) {
      const update = await client.from("dispute_status_history").update({ reason: `Rewritten by ${label}.` }).eq("id", row.id).select("id");
      expect(update.error?.code, `${label} update`).toBe("42501");
      const remove = await client.from("dispute_status_history").delete().eq("id", row.id).select("id");
      expect(remove.error?.code, `${label} delete`).toBe("42501");
      const forge = await client.from("dispute_status_history").insert({ dispute_id: target.id, from_status: "OPEN", to_status: "CLOSED", actor_user_id: complianceUserId, reason: `Forged by ${label}.` });
      expect(forge.error?.code, `${label} insert`).toBe("42501");
    }

    const probe = probeDisputeHistoryGuards();
    expect(probe).toEqual({
      historyUpdate: { refusal: "dispute_status_history_is_append_only", rows: 0 },
      historyDelete: { refusal: "dispute_status_history_is_append_only", rows: 0 },
      historyInsert: { refusal: "dispute_status_history_is_append_only", rows: 0 },
      disputeUpdate: { refusal: "dispute_changes_only_through_workflow", rows: 0 },
      historyUnchanged: true,
      disputeUnchanged: true,
    });
  }, LIVE_TIMEOUT_MS);

  it("16: history written earlier is byte-identical after every later transition, refusal and probe", async () => {
    for (const entry of walked) expect(await historyAsCompliance(entry.id), entry.steps.map((step) => step.to).join(">")).toEqual(entry.history);
  }, LIVE_TIMEOUT_MS);

  it("RLS: the participant, COMPLIANCE and AUDITOR read the history; the unrelated organization, WAREHOUSE, FINANCE and anonymous read nothing", async () => {
    const target = walked[0]!;
    for (const [label, client] of [["member (participant)", buyer], ["COMPLIANCE", compliance], ["AUDITOR", auditor]] as const) {
      const { data, error } = await historyOf(client, target.id);
      expect(error, label).toBeNull();
      expect(data, label).toEqual(target.history);
    }
    for (const [label, client] of [["member (unrelated organization)", otherOrg], ["WAREHOUSE", warehouse], ["FINANCE", finance], ["blocked member", blocked]] as const) {
      const { data, error } = await historyOf(client, target.id);
      expect(error, label).toBeNull();
      expect(data, label).toEqual([]);
    }
    const anon = await historyOf(anonymous, target.id);
    expect(anon.error !== null || (anon.data ?? []).length === 0).toBe(true);
  }, LIVE_TIMEOUT_MS);

  it("read layer: the member sees the timeline without any operator id; operators see the actor; other audiences get null", async () => {
    const target = walked[0]!;
    const member = await as(buyer, async () => (await import("@/lib/disputes/read")).getDisputeStatusHistoryForMember({ organizationId: ORG_A, userId: buyerUserId, disputeId: target.id }));
    expect(member?.map((row) => [row.fromStatus, row.toStatus, row.reason, row.byYou])).toEqual(target.history.map((row) => [row.from_status, row.to_status, row.reason, false]));
    expect(JSON.stringify(member)).not.toContain(complianceUserId);

    const operator = await as(compliance, async () => (await import("@/lib/disputes/read")).getDisputeStatusHistoryForOperator("compliance", target.id));
    expect(operator?.map((row) => row.actorUserId)).toEqual(target.history.map(() => complianceUserId));
    const audit = await as(auditor, async () => (await import("@/lib/disputes/read")).getDisputeStatusHistoryForOperator("auditor", target.id));
    expect(audit).toHaveLength(target.history.length);

    const foreign = await as(otherOrg, async () => (await import("@/lib/disputes/read")).getDisputeStatusHistoryForMember({ organizationId: ORG_B, userId: otherOrgUserId, disputeId: target.id }));
    expect(foreign).toBeNull();
    const wrongAudience = await as(warehouse, async () => (await import("@/lib/disputes/read")).getDisputeStatusHistoryForOperator("compliance", target.id));
    expect(wrongAudience).toBeNull();
  }, LIVE_TIMEOUT_MS);

  it("no side effect: FROZEN and every other transition left the fixture orders, shipments, payments, reservations, order history and custody untouched (DB-OPEN-09 unchanged)", () => {
    const after = inspectDisputeFixtures();
    expect(businessState(after)).toEqual(businessBefore);
    for (const order of after.orders as Array<{ status: string }>) expect(order.status).not.toBe("DISPUTED");
  });
});
