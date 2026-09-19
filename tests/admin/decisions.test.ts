import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  DISPUTE_FIXTURES,
  FOUNDATION_FIXTURES,
  INVENTORY_FIXTURES,
  LISTING_FIXTURES,
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
  resetCompleteDraftApplication,
  resetListingReviewFixtures,
  seedDisputeFixtures,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 Phase 10 — T032: `tests/admin/decisions.test.ts` (this file). Literal task: "every
 * KYB/listing/payment/dispute decision records reviewer, decision and reason and changes status
 * exactly once, including under concurrent operators." Depends: T009 (KYB decisions), T011 (listing
 * decisions), T014 (payment decision via Feature 008's `decidePayment`).
 *
 * ── STATUS (2026-09-17, re-checked) ────────────────────────────────────────────────────────────
 * T009 and T011 are COMPLETE (RUN B). **T014 is BLOCKED** — Feature 008 has not supplied
 * `decidePayment()` (re-confirmed: `grep -rn decidePayment lib src components` → nothing), so there
 * is NO payment decision path in Feature 010 to prove — fabricating one would violate the RUN C
 * boundary ("Feature 010 MUST NOT become a second finance/payment engine").
 *
 * **Dispute decisions (Feature 010 dispute-unblock run, 2026-09-19)**: Feature 012 closed (28/28) with
 * the database-authoritative `transition_dispute()` + append-only `dispute_status_history`, and T012
 * composed it into the console (`/dashboard-admin/disputes` + the `recordDisputeTransition` Server
 * Action). The dispute half is now proven LIVE through that console action: reviewer (actor), decision
 * (from → to) and reason recorded in the history, status changed exactly once, every non-compliance
 * role refused, the database refusing an unapproved pair and a stale change, and two independent
 * COMPLIANCE sessions racing the same dispute → exactly one success. No order/shipment/payment side
 * effect (DB-OPEN-09 unchanged — FROZEN is a record label only).
 *
 * So KYB, listing and dispute halves are proven; the payment half is proven HONESTLY absent. Per the
 * literal `Depends: T014`, T032 stays UNCHECKED/BLOCKED until Feature 008 supplies `decidePayment()`.
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
/** Per-call session binding for races: each concurrent request keeps ITS OWN session (AsyncLocalStorage). */
const requestSession = await vi.hoisted(async () => new (await import("node:async_hooks")).AsyncLocalStorage<SupabaseClient>());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    const client = requestSession.getStore() ?? serverClientState.client;
    if (!client) throw new Error("Test request has no Supabase client");
    return client;
  }),
}));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

afterEach(() => {
  vi.clearAllMocks();
});

async function withLiveClient<T>(client: SupabaseClient, run: () => Promise<T>): Promise<T> {
  serverClientState.client = client;
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 90_000;
const KYB_APP = PHASE89_FIXTURES.completeDraft.applicationId;

async function submitCompleteDraft(): Promise<void> {
  resetCompleteDraftApplication();
  const member = await signInAsFixture(PHASE89_FIXTURES.completeDraft.email);
  const { error } = await member.rpc("submit_kyb_application", { p_application_id: KYB_APP });
  if (error) throw new Error(`fixture submit failed: ${error.message}`);
}

let compliance: SupabaseClient;
let complianceUserId: string;

beforeAll(async () => {
  prepareComplianceFixture();
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;
}, LIVE_TIMEOUT_MS);

afterAll(() => {
  resetCompleteDraftApplication();
  resetListingReviewFixtures();
  const result = cleanupComplianceFixture();
  expect(result.activeAdminPrivilege).toBe(false);
  expect(inspectComplianceFixture().activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T032 — KYB decisions: reviewer + decision + reason recorded, status changes exactly once", () => {
  it("REJECTED with a reason: the application status changes exactly once, the review row records reviewer/decision/reason, a repeat is refused as stale", async () => {
    await submitCompleteDraft();
    const result = await withLiveClient(compliance, async () => {
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: KYB_APP, decision: "REJECTED", reason: "T032 decisions proof — trade licence unreadable." });
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ fromStatus: "SUBMITTED", toStatus: "REJECTED" });
    const { data: application } = await compliance.from("kyb_applications").select("status, decided_by, rejection_reason").eq("id", KYB_APP).maybeSingle();
    expect(application).toMatchObject({ status: "REJECTED", decided_by: complianceUserId });
    expect(application?.rejection_reason).toContain("trade licence unreadable");
    const { data: reviews } = await compliance.from("kyb_reviews").select("id, decision, reviewer_user_id, reason").eq("application_id", KYB_APP).order("created_at", { ascending: false }).limit(1);
    expect(reviews?.[0]).toMatchObject({ id: result.data.reviewId, decision: "REJECTED", reviewer_user_id: complianceUserId });
    expect(reviews?.[0]?.reason).toContain("trade licence unreadable");

    const again = await withLiveClient(compliance, async () => {
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: KYB_APP, decision: "REJECTED", reason: "duplicate attempt" });
    });
    expect(again).toEqual({ ok: false, code: "kyb_decision_stale" });
  }, LIVE_TIMEOUT_MS);

  it("CONCURRENT OPERATORS: two independent sessions decide the same SUBMITTED application at once — exactly one takes effect, exactly one review row is appended, the loser is refused as stale", async () => {
    await submitCompleteDraft();
    const second = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
    const reviewsBefore = (await compliance.from("kyb_reviews").select("id").eq("application_id", KYB_APP)).data?.length ?? 0;

    const run = async (client: SupabaseClient, decision: "APPROVED" | "REJECTED") => {
      serverClientState.client = client;
      vi.resetModules();
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: KYB_APP, decision, reason: decision === "REJECTED" ? "T032 concurrent rejection." : undefined });
    };
    const [a, b] = await Promise.all([run(compliance, "APPROVED"), run(second, "REJECTED")]);
    const winners = [a, b].filter((o) => o.ok);
    const losers = [a, b].filter((o) => !o.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0]).toEqual({ ok: false, code: "kyb_decision_stale" });

    const { data: application } = await compliance.from("kyb_applications").select("status").eq("id", KYB_APP).maybeSingle();
    expect(["APPROVED", "REJECTED"]).toContain(application?.status);
    const { data: reviews } = await compliance.from("kyb_reviews").select("id, decision, reviewer_user_id").eq("application_id", KYB_APP).order("created_at", { ascending: false });
    expect(reviews?.length).toBe(reviewsBefore + 1);
    expect(reviews?.[0]?.decision).toBe(application?.status);
    expect(reviews?.[0]?.reviewer_user_id).toBe(complianceUserId);
  }, LIVE_TIMEOUT_MS);
});

describe("T032 — listing decisions: reviewer + decision + reason recorded, status changes exactly once", () => {
  it("REJECTED with a reason: the listing changes status exactly once, listing_reviews and listing_status_history both record reviewer/decision/reason, a repeat is refused as stale", async () => {
    resetListingReviewFixtures();
    const result = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "REJECTED", reason: "T032 decisions proof — grade evidence missing." });
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ fromStatus: "PENDING_REVIEW", toStatus: "REJECTED" });
    const { data: offer } = await compliance.from("coffee_offers").select("status, rejection_reason").eq("id", LISTING_FIXTURES.offerPendingReview).maybeSingle();
    expect(offer?.status).toBe("REJECTED");
    expect(offer?.rejection_reason).toContain("grade evidence missing");
    const { data: reviews } = await compliance.from("listing_reviews").select("id, decision, reviewer_user_id").eq("offer_id", LISTING_FIXTURES.offerPendingReview).order("created_at", { ascending: false }).limit(1);
    expect(reviews?.[0]).toMatchObject({ id: result.data.reviewId, decision: "REJECTED", reviewer_user_id: complianceUserId });
    const { data: history } = await compliance.from("listing_status_history").select("old_status, new_status, reason, changed_by").eq("offer_id", LISTING_FIXTURES.offerPendingReview).order("created_at", { ascending: false }).limit(1);
    expect(history?.[0]).toMatchObject({ old_status: "PENDING_REVIEW", new_status: "REJECTED", changed_by: complianceUserId });
    expect(history?.[0]?.reason).toContain("grade evidence missing");

    const again = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "REJECTED", reason: "duplicate attempt" });
    });
    expect(again).toEqual({ ok: false, code: "listing_decision_stale" });
  }, LIVE_TIMEOUT_MS);

  it("CONCURRENT OPERATORS: two independent sessions decide the same PENDING_REVIEW listing at once — exactly one takes effect, exactly one listing_reviews row is appended, the loser is refused as stale", async () => {
    resetListingReviewFixtures();
    const second = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
    const reviewsBefore = (await compliance.from("listing_reviews").select("id").eq("offer_id", LISTING_FIXTURES.offerPendingReview)).data?.length ?? 0;

    const run = async (client: SupabaseClient, decision: "APPROVED" | "REJECTED") => {
      serverClientState.client = client;
      vi.resetModules();
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision, reason: decision === "REJECTED" ? "T032 concurrent rejection." : undefined });
    };
    const [a, b] = await Promise.all([run(compliance, "APPROVED"), run(second, "REJECTED")]);
    const winners = [a, b].filter((o) => o.ok);
    const losers = [a, b].filter((o) => !o.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0]).toEqual({ ok: false, code: "listing_decision_stale" });

    const { data: offer } = await compliance.from("coffee_offers").select("status").eq("id", LISTING_FIXTURES.offerPendingReview).maybeSingle();
    expect(["APPROVED", "REJECTED"]).toContain(offer?.status);
    const { data: reviews } = await compliance.from("listing_reviews").select("id, decision, reviewer_user_id").eq("offer_id", LISTING_FIXTURES.offerPendingReview).order("created_at", { ascending: false });
    expect(reviews?.length).toBe(reviewsBefore + 1);
    expect(reviews?.[0]?.decision).toBe(offer?.status);
    expect(reviews?.[0]?.reviewer_user_id).toBe(complianceUserId);
  }, LIVE_TIMEOUT_MS);
});

describe("T032 — payment and dispute decisions: honestly absent, not fabricated", () => {
  it("Feature 008 supplies no decidePayment() to decide a payment through; the console builds no payment decision path", async () => {
    const { existsSync, readFileSync, readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const root = process.cwd();
    const walk = (dir: string, out: string[] = []): string[] => {
      const abs = path.join(root, dir);
      if (!existsSync(abs)) return out;
      for (const entry of readdirSync(abs)) {
        const rel = `${dir}/${entry}`;
        if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
        else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
      }
      return out;
    };
    for (const file of walk("lib/finance")) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src, file).not.toMatch(/export (async )?function decidePayment/);
    }
    for (const file of walk("lib/admin")) {
      const src = readFileSync(path.join(root, file), "utf8");
      expect(src, file).not.toMatch(/decidePayment|admin_review_payment/);
    }
  });

});

describe("T032 — dispute decisions through the console (T012 over Feature 012): reviewer + decision + reason recorded, status changes exactly once", () => {
  type HistoryRow = { dispute_id: string; from_status: string; to_status: string; actor_user_id: string; reason: string; correlation_id: string | null; created_at: string };
  const ORDER_A = INVENTORY_FIXTURES.orgA.orderId;
  const ORG_A = INVENTORY_FIXTURES.orgA.organizationId;
  let buyer: SupabaseClient;
  let buyerUserId: string;
  let otherOrg: SupabaseClient;
  let warehouse: SupabaseClient;
  let finance: SupabaseClient;
  let auditor: SupabaseClient;
  let anonymous: SupabaseClient;
  let historyRowsBefore: number;
  let businessBefore: Record<string, unknown>;
  const businessState = (snapshot: Record<string, unknown>) => Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "disputes" && key !== "evidence"));

  beforeAll(async () => {
    seedDisputeFixtures();
    cleanupDisputeTestRows();
    prepareAuditorFixture();
    buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    buyerUserId = (await buyer.auth.getUser()).data.user!.id;
    otherOrg = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
    warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    finance = await signInAsFixture(FOUNDATION_FIXTURES.financeAdmin.email);
    auditor = await signInAsFixture(FOUNDATION_FIXTURES.auditor.email);
    anonymous = createAnonymousFixtureClient();
    const baseline = inspectDisputeStatusHistory();
    expect(baseline.taggedDisputeIds).toEqual([]);
    historyRowsBefore = baseline.totalHistoryRows as number;
    businessBefore = businessState(inspectDisputeFixtures());
  }, LIVE_TIMEOUT_MS);

  afterAll(() => {
    expect(cleanupDisputeTestRows().remainingTaggedDisputes).toBe(0);
    const history = inspectDisputeStatusHistory();
    expect(history.taggedDisputeIds).toEqual([]);
    expect(history.totalHistoryRows).toBe(historyRowsBefore);
    expect(cleanupAuditorFixture().activeAdminPrivilege).toBe(false);
    expect(inspectAuditorFixture().activeCapability).toBe(false);
  }, LIVE_TIMEOUT_MS);

  async function raise(text: string): Promise<string> {
    const raised = await withLiveClient(buyer, async () => {
      const { raiseDispute } = await import("@/lib/disputes/member");
      return raiseDispute({ organizationId: ORG_A, userId: buyerUserId, input: { orderId: ORDER_A, reason: `${DISPUTE_FIXTURES.reasonPrefix} ${text}` } });
    });
    if (!raised.ok) throw new Error(`raise failed: ${raised.code}`);
    return raised.data.id;
  }

  /** The console's own Server Action, exactly as the decision form submits it. */
  async function decide(client: SupabaseClient, fields: { disputeId: string; status: string; expectedStatus: string; reason: string }, { fresh = true } = {}) {
    // A fresh module graph per request (no identity memoised across sessions); a race shares one graph.
    if (fresh) vi.resetModules();
    return requestSession.run(client, async () => {
      const { recordDisputeTransition } = await import("@/src/app/dashboard-admin/(compliance)/disputes/actions");
      const formData = new FormData();
      for (const [key, value] of Object.entries(fields)) formData.set(key, value);
      return recordDisputeTransition(undefined, formData);
    });
  }

  async function history(disputeId: string): Promise<HistoryRow[]> {
    const { data, error } = await compliance.from("dispute_status_history").select("dispute_id, from_status, to_status, actor_user_id, reason, correlation_id, created_at").eq("dispute_id", disputeId).order("created_at").order("id");
    if (error) throw new Error(`history read failed: ${error.code}`);
    return (data ?? []) as HistoryRow[];
  }

  async function dispute(disputeId: string) {
    const { data, error } = await compliance.from("disputes").select("status, resolution, resolved_by, resolved_at, correlation_id, updated_at").eq("id", disputeId).single();
    if (error) throw new Error(`dispute read failed: ${error.code}`);
    return data;
  }

  it("a valid COMPLIANCE decision path (review → resolve → close) records actor, from/to, exact reason and time once per change; a repeated decision is refused as stale and records nothing", async () => {
    vi.resetModules();
    const id = await raise("T032 console dispute decision proof.");
    const steps = [
      { status: "UNDER_REVIEW", expectedStatus: "OPEN", reason: "Console review opened for the moisture complaint." },
      { status: "RESOLVED", expectedStatus: "UNDER_REVIEW", reason: "Moisture confirmed; partial credit agreed with the seller." },
      { status: "CLOSED", expectedStatus: "RESOLVED", reason: "Credit note issued; dispute closed from the console." },
    ];
    for (const step of steps) {
      const result = await decide(compliance, { disputeId: id, ...step });
      expect(result, step.status).toMatchObject({ ok: true, code: "dispute_transition_recorded", data: { disputeId: id, fromStatus: step.expectedStatus, toStatus: step.status, attribution: "recorded" } });
    }
    const rows = await history(id);
    const record = await dispute(id);
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      expect(row, `row ${index}`).toMatchObject({ dispute_id: id, from_status: steps[index]!.expectedStatus, to_status: steps[index]!.status, actor_user_id: complianceUserId, reason: steps[index]!.reason, correlation_id: record.correlation_id });
      expect(Date.parse(row.created_at)).toBeGreaterThan(0);
    });
    expect(record).toMatchObject({ status: "CLOSED", resolution: steps[1]!.reason, resolved_by: complianceUserId });
    expect(Date.parse(record.resolved_at!)).toBe(Date.parse(rows[1]!.created_at));

    const again = await decide(compliance, { disputeId: id, status: "RESOLVED", expectedStatus: "UNDER_REVIEW", reason: "Duplicate attempt to record the outcome." });
    expect(again).toEqual({ ok: false, code: "dispute_stale" });
    expect(await history(id)).toEqual(rows);
  }, LIVE_TIMEOUT_MS);

  it("member (participant), unrelated member, WAREHOUSE, FINANCE, AUDITOR and anonymous are refused by the console action; nothing is recorded", async () => {
    const id = await raise("T032 console dispute refusal proof.");
    for (const [label, client] of [["member (participant)", buyer], ["member (unrelated organization)", otherOrg], ["WAREHOUSE", warehouse], ["FINANCE", finance], ["AUDITOR", auditor], ["anonymous", anonymous]] as const) {
      const result = await decide(client, { disputeId: id, status: "UNDER_REVIEW", expectedStatus: "OPEN", reason: `Unauthorized console decision by ${label}.` });
      expect(result, label).toEqual({ ok: false, code: "compliance_not_capable" });
    }
    expect(await history(id)).toEqual([]);
    expect(await dispute(id)).toMatchObject({ status: "OPEN", resolution: null, resolved_by: null, resolved_at: null });
  }, LIVE_TIMEOUT_MS);

  it("an unapproved transition is refused (the console's own path and the database function directly); an unknown status is a validation error, never a generic setter", async () => {
    const id = await raise("T032 console invalid transition proof.");
    expect(await decide(compliance, { disputeId: id, status: "CLOSED", expectedStatus: "OPEN", reason: "Attempt to close an open dispute." })).toEqual({ ok: false, code: "dispute_transition_refused" });
    expect(await decide(compliance, { disputeId: id, status: "OPEN", expectedStatus: "OPEN", reason: "Attempt to set an arbitrary status." })).toMatchObject({ ok: false, code: "validation_error" });
    expect(await decide(compliance, { disputeId: id, status: "UNDER_REVIEW", expectedStatus: "NOT_A_STATUS", reason: "Missing the observed status." })).toMatchObject({ ok: false, code: "validation_error" });
    expect(await decide(compliance, { disputeId: id, status: "UNDER_REVIEW", expectedStatus: "OPEN", reason: "short" })).toMatchObject({ ok: false, code: "validation_error", fieldErrors: { reason: ["REASON_REQUIRED"] } });
    const raw = await compliance.rpc("transition_dispute", { p_dispute_id: id, p_expected_status: "OPEN", p_to_status: "CLOSED", p_reason: "Raw unapproved pair straight at the database." });
    expect(raw.data).toBeNull();
    expect(raw.error?.message).toBe("invalid_dispute_transition");
    expect(await history(id)).toEqual([]);
    expect((await dispute(id)).status).toBe("OPEN");
  }, LIVE_TIMEOUT_MS);

  it("a stale decision (the dispute moved after the operator loaded it) is refused and records nothing", async () => {
    const id = await raise("T032 console stale decision proof.");
    expect(await decide(compliance, { disputeId: id, status: "UNDER_REVIEW", expectedStatus: "OPEN", reason: "First operator begins the review." })).toMatchObject({ ok: true });
    const stale = await decide(compliance, { disputeId: id, status: "FROZEN", expectedStatus: "OPEN", reason: "Second operator acting on an outdated view." });
    expect(stale).toEqual({ ok: false, code: "dispute_stale" });
    expect((await history(id)).map((row) => row.to_status)).toEqual(["UNDER_REVIEW"]);
  }, LIVE_TIMEOUT_MS);

  it("CONCURRENT OPERATORS: two independent COMPLIANCE sessions decide the same OPEN dispute at once through the console — exactly one succeeds, exactly one history row, the loser is refused as stale", async () => {
    const id = await raise("T032 console concurrent decision proof.");
    const second = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
    expect(second).not.toBe(compliance);
    vi.resetModules();
    const [a, b] = await Promise.all([
      decide(compliance, { disputeId: id, status: "UNDER_REVIEW", expectedStatus: "OPEN", reason: "Race writer one begins the review." }, { fresh: false }),
      decide(second, { disputeId: id, status: "REJECTED", expectedStatus: "OPEN", reason: "Race writer two rejects the dispute." }, { fresh: false }),
    ]);
    const winners = [a, b].filter((result) => result.ok);
    const losers = [a, b].filter((result) => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toEqual([{ ok: false, code: "dispute_stale" }]);
    const rows = await history(id);
    expect(rows).toHaveLength(1);
    const record = await dispute(id);
    expect(rows[0]).toMatchObject({ from_status: "OPEN", to_status: record.status, actor_user_id: complianceUserId });
  }, LIVE_TIMEOUT_MS);

  it("no side effect: every console dispute decision above left the fixture orders, shipments, payments, reservations, order history and custody untouched (DB-OPEN-09 — no freeze)", () => {
    const after = inspectDisputeFixtures();
    expect(businessState(after)).toEqual(businessBefore);
    for (const order of after.orders as Array<{ status: string }>) expect(order.status).not.toBe("DISPUTED");
  });
});
