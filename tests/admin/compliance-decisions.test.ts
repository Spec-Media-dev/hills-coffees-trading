import { readFileSync } from "node:fs";
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  LISTING_FIXTURES,
  PHASE89_FIXTURES,
  cleanupComplianceFixture,
  createAnonymousFixtureClient,
  inspectComplianceFixture,
  prepareComplianceFixture,
  resetCompleteDraftApplication,
  resetListingReviewFixtures,
  resetSuspendedFixture,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 010 RUN B — LIVE proof for T009 (KYB decisions), T010 (organization status) and T011
 * (listing decisions) through `lib/admin/decisions.ts`, with the human-authorized disposable
 * COMPLIANCE fixture (role exactly COMPLIANCE, no organization) plus the standing WAREHOUSE / FINANCE /
 * member / anonymous sessions. Every assertion reads the database back through a real session; the
 * privileged seed script is used ONLY to prepare/restore fixtures (its approved boundary).
 */

const root = process.cwd();
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

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
  vi.resetModules();
  return run();
}

const LIVE_TIMEOUT_MS = 90_000;
const APP = PHASE89_FIXTURES.completeDraft.applicationId;

async function submitCompleteDraft(): Promise<void> {
  resetCompleteDraftApplication();
  const member = await signInAsFixture(PHASE89_FIXTURES.completeDraft.email);
  const { error } = await member.rpc("submit_kyb_application", { p_application_id: APP });
  if (error) throw new Error(`fixture submit failed: ${error.message}`);
}

async function readApplication(client: SupabaseClient) {
  const { data } = await client.from("kyb_applications").select("id, status, decided_by, decided_at, rejection_reason").eq("id", APP).maybeSingle();
  return data;
}

async function readReviews(client: SupabaseClient, applicationId: string) {
  const { data } = await client.from("kyb_reviews").select("id, decision, reason, reviewer_user_id, created_at").eq("application_id", applicationId).order("created_at", { ascending: true });
  return data ?? [];
}

let compliance: SupabaseClient;
let complianceUserId: string;

beforeAll(async () => {
  prepareComplianceFixture();
  compliance = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
  complianceUserId = (await compliance.auth.getUser()).data.user!.id;
}, LIVE_TIMEOUT_MS);

/** SUSPENDED→PUBLISHED requires `is_compliance_operator()` (trigger gate), so the compliance session restores the live fixture itself. */
async function restoreLiveListingAsCompliance(): Promise<void> {
  const { data } = await compliance.from("coffee_offers").select("status").eq("id", LISTING_FIXTURES.offerReviewLive).maybeSingle();
  if (data && data.status !== "PUBLISHED") {
    const { error } = await compliance.from("coffee_offers").update({ status: "PUBLISHED", rejection_reason: null }).eq("id", LISTING_FIXTURES.offerReviewLive);
    if (error) throw new Error(`live listing restore failed: ${error.message}`);
  }
}

afterAll(async () => {
  resetCompleteDraftApplication();
  resetSuspendedFixture();
  resetListingReviewFixtures();
  await restoreLiveListingAsCompliance();
  const cleanup = cleanupComplianceFixture();
  expect(cleanup.activeAdminPrivilege).toBe(false);
  const after = inspectComplianceFixture();
  expect(after.activeCapability).toBe(false);
}, LIVE_TIMEOUT_MS);

describe("T009 — KYB decisions (live, COMPLIANCE fixture)", () => {
  it("RESUBMISSION_REQUIRED with a reason: application status changes exactly once, review row records reviewer/decision/reason, no organization change is required", async () => {
    await submitCompleteDraft();
    const reviewsBefore = await readReviews(compliance, APP);
    const result = await withLiveClient(compliance, async () => {
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: APP, decision: "RESUBMISSION_REQUIRED", reason: "Trade licence scan is unreadable — please upload a clearer copy." });
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toBe("kyb_decision_recorded");
    expect(result.data).toMatchObject({ fromStatus: "SUBMITTED", toStatus: "RESUBMISSION_REQUIRED", organizationFollowThrough: "not-required" });

    const after = await readApplication(compliance);
    expect(after?.status).toBe("RESUBMISSION_REQUIRED");
    expect(after?.decided_by).toBe(complianceUserId);
    expect(after?.rejection_reason).toContain("Trade licence scan");
    const reviews = await readReviews(compliance, APP);
    expect(reviews.length).toBe(reviewsBefore.length + 1);
    const latest = reviews[reviews.length - 1]!;
    expect(latest).toMatchObject({ decision: "RESUBMISSION_REQUIRED", reviewer_user_id: complianceUserId });
    expect(latest.reason).toContain("Trade licence scan");
    expect(latest.id).toBe(result.data.reviewId);

    // History preserved: the earlier review rows are still there, untouched.
    for (const previous of reviewsBefore) expect(reviews.find((r) => r.id === previous.id)).toBeTruthy();
    // Exactly once: the same decision again is STALE (the application is no longer SUBMITTED/UNDER_REVIEW).
    const again = await withLiveClient(compliance, async () => {
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: APP, decision: "RESUBMISSION_REQUIRED", reason: "duplicate attempt" });
    });
    expect(again).toEqual({ ok: false, code: "kyb_decision_stale" });
    expect((await readReviews(compliance, APP)).length).toBe(reviews.length);
  }, LIVE_TIMEOUT_MS);

  it("a reason-required decision without a reason is refused BEFORE any write (field error on `reason`)", async () => {
    await submitCompleteDraft();
    for (const decision of ["REJECTED", "RESUBMISSION_REQUIRED", "SUSPENDED"] as const) {
      const result = await withLiveClient(compliance, async () => {
        const { decideKybApplication } = await import("@/lib/admin/decisions");
        return decideKybApplication({ applicationId: APP, decision, reason: "" });
      });
      expect(result).toEqual({ ok: false, code: "validation_error", fieldErrors: { reason: ["REASON_REQUIRED"] } });
    }
    expect((await readApplication(compliance))?.status).toBe("SUBMITTED");
  }, LIVE_TIMEOUT_MS);

  it("start review (SUBMITTED → UNDER_REVIEW) then REJECTED with a reason: status changes once, reason lands on both the application and the review row", async () => {
    await submitCompleteDraft();
    const started = await withLiveClient(compliance, async () => {
      const { startKybReview } = await import("@/lib/admin/decisions");
      return startKybReview({ applicationId: APP });
    });
    expect(started.ok).toBe(true);
    expect((await readApplication(compliance))?.status).toBe("UNDER_REVIEW");

    const rejected = await withLiveClient(compliance, async () => {
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: APP, decision: "REJECTED", reason: "Registration number does not match the trade licence." });
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.data.toStatus).toBe("REJECTED");
    const after = await readApplication(compliance);
    expect(after?.status).toBe("REJECTED");
    expect(after?.rejection_reason).toContain("Registration number");
    const latest = (await readReviews(compliance, APP)).at(-1)!;
    expect(latest.decision).toBe("REJECTED");
    expect(latest.reviewer_user_id).toBe(complianceUserId);
  }, LIVE_TIMEOUT_MS);

  it("APPROVED: the application status changes once and is recorded; since DB-OPEN-22 closed (RUN J) the organization follow-through APPLIES for a pure COMPLIANCE operator (PENDING_KYB → ACTIVE, an approved guard transition) and the member can buy on its next request", async () => {
    await submitCompleteDraft();
    try {
      const result = await withLiveClient(compliance, async () => {
        const { decideKybApplication } = await import("@/lib/admin/decisions");
        return decideKybApplication({ applicationId: APP, decision: "APPROVED" });
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.toStatus).toBe("APPROVED");
      expect(result.data.organizationFollowThrough).toBe("applied");
      expect((await readApplication(compliance))?.status).toBe("APPROVED");
      expect((await readReviews(compliance, APP)).at(-1)?.decision).toBe("APPROVED");

      // The database's own capability rule decides the effect: APPROVED application + ACTIVE organization.
      const member = await signInAsFixture(PHASE89_FIXTURES.completeDraft.email);
      const { data: canBuy } = await member.rpc("organization_can_buy", { p_organization_id: PHASE89_FIXTURES.completeDraft.organizationId });
      expect(canBuy).toBe(true);
      const { data: organization } = await member.from("organizations").select("status").eq("id", PHASE89_FIXTURES.completeDraft.organizationId).maybeSingle();
      expect(organization?.status).toBe("ACTIVE");
    } finally {
      // Canonical fixture state (DRAFT application, PENDING_KYB organization); history rows are kept.
      resetCompleteDraftApplication();
    }
  }, LIVE_TIMEOUT_MS);

  it("TWO OPERATORS RACE: two concurrent decisions on the same SUBMITTED application → exactly one takes effect, exactly one review row, the loser is STALE", async () => {
    await submitCompleteDraft();
    const second = await signInAsFixture(FOUNDATION_FIXTURES.complianceReviewer.email);
    const reviewsBefore = (await readReviews(compliance, APP)).length;

    // Two independent sessions, two independent module instances, fired concurrently.
    const run = async (client: SupabaseClient, decision: "APPROVED" | "REJECTED") => {
      serverClientState.client = client;
      vi.resetModules();
      const { decideKybApplication } = await import("@/lib/admin/decisions");
      return decideKybApplication({ applicationId: APP, decision, reason: decision === "REJECTED" ? "Concurrent rejection attempt." : undefined });
    };
    // The module import happens per call; both calls read the client at import time, so give each
    // its own client before awaiting. (`createClient` mock reads `serverClientState` lazily per call —
    // both decisions run against their own session because each `run` sets it before importing.)
    const [a, b] = await Promise.all([run(compliance, "APPROVED"), run(second, "REJECTED")]);
    const outcomes = [a, b];
    const winners = outcomes.filter((o) => o.ok);
    const losers = outcomes.filter((o) => !o.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0]).toEqual({ ok: false, code: "kyb_decision_stale" });

    const after = await readApplication(compliance);
    expect(["APPROVED", "REJECTED"]).toContain(after?.status);
    const reviews = await readReviews(compliance, APP);
    expect(reviews.length).toBe(reviewsBefore + 1);
    expect(reviews.at(-1)?.decision).toBe(after?.status);
  }, LIVE_TIMEOUT_MS);
});

describe("T010 — organization status (live)", () => {
  it("since DB-OPEN-22 closed (RUN J), a pure COMPLIANCE operator reinstates and re-suspends the organization with a reason each time; the member's next request follows (full proof: organization-suspension.test.ts)", async () => {
    resetSuspendedFixture();
    try {
      const reviewsBefore = (await readReviews(compliance, PHASE89_FIXTURES.suspended.applicationId)).length;
      const member = await signInAsFixture(PHASE89_FIXTURES.suspended.email);
      const decide = (status: "ACTIVE" | "SUSPENDED", reason: string) =>
        withLiveClient(compliance, async () => {
          const { setOrganizationStatus } = await import("@/lib/admin/decisions");
          return setOrganizationStatus({ organizationId: PHASE89_FIXTURES.suspended.organizationId, status, reason });
        });

      expect(await decide("ACTIVE", "Reinstated after review.")).toMatchObject({ ok: true, code: "organization_status_changed", data: { fromStatus: "SUSPENDED", toStatus: "ACTIVE" } });
      expect((await member.rpc("organization_can_buy", { p_organization_id: PHASE89_FIXTURES.suspended.organizationId })).data).toBe(true);
      expect(await decide("SUSPENDED", "Suspended again for the round-trip proof.")).toMatchObject({ ok: true, code: "organization_status_changed", data: { fromStatus: "ACTIVE", toStatus: "SUSPENDED" } });
      expect((await member.rpc("organization_can_buy", { p_organization_id: PHASE89_FIXTURES.suspended.organizationId })).data).toBe(false);

      const reviews = await readReviews(compliance, PHASE89_FIXTURES.suspended.applicationId);
      expect(reviews.length).toBe(reviewsBefore + 2);
      expect(reviews.slice(-2).map((review) => review.decision)).toEqual(["APPROVED", "SUSPENDED"]);
    } finally {
      resetSuspendedFixture();
    }
  }, LIVE_TIMEOUT_MS);

  it("a missing reason is refused before any access check", async () => {
    const result = await withLiveClient(compliance, async () => {
      const { setOrganizationStatus } = await import("@/lib/admin/decisions");
      return setOrganizationStatus({ organizationId: PHASE89_FIXTURES.suspended.organizationId, status: "SUSPENDED", reason: "" });
    });
    expect(result).toEqual({ ok: false, code: "validation_error", fieldErrors: { reason: ["REASON_REQUIRED"] } });
  });
});

describe("T011 — listing decisions (live, HILLS review fixtures)", () => {
  it("APPROVED from PENDING_REVIEW: status changes exactly once, listing_reviews records reviewer/decision, a repeat is STALE", async () => {
    resetListingReviewFixtures();
    const result = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "APPROVED" });
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ fromStatus: "PENDING_REVIEW", toStatus: "APPROVED" });
    const { data: offer } = await compliance.from("coffee_offers").select("status, is_visible").eq("id", LISTING_FIXTURES.offerPendingReview).maybeSingle();
    expect(offer).toEqual({ status: "APPROVED", is_visible: false });
    const { data: reviews } = await compliance.from("listing_reviews").select("id, decision, reviewer_user_id").eq("offer_id", LISTING_FIXTURES.offerPendingReview).order("created_at", { ascending: false }).limit(1);
    expect(reviews?.[0]).toMatchObject({ id: result.data.reviewId, decision: "APPROVED", reviewer_user_id: complianceUserId });
    const again = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "APPROVED" });
    });
    expect(again).toEqual({ ok: false, code: "listing_decision_stale" });
  }, LIVE_TIMEOUT_MS);

  it("REJECTED requires a reason; with one, the reason lands on the listing AND in listing_status_history (the trigger copies rejection_reason)", async () => {
    resetListingReviewFixtures();
    const missing = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "REJECTED" });
    });
    expect(missing).toEqual({ ok: false, code: "validation_error", fieldErrors: { reason: ["REASON_REQUIRED"] } });

    const result = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "REJECTED", reason: "Lot photos do not match the declared grade." });
    });
    expect(result.ok).toBe(true);
    const { data: offer } = await compliance.from("coffee_offers").select("status, rejection_reason").eq("id", LISTING_FIXTURES.offerPendingReview).maybeSingle();
    expect(offer?.status).toBe("REJECTED");
    expect(offer?.rejection_reason).toContain("Lot photos");
    const { data: history } = await compliance
      .from("listing_status_history")
      .select("old_status, new_status, reason, changed_by")
      .eq("offer_id", LISTING_FIXTURES.offerPendingReview)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(history?.[0]).toMatchObject({ old_status: "PENDING_REVIEW", new_status: "REJECTED", changed_by: complianceUserId });
    expect(history?.[0]?.reason).toContain("Lot photos");
  }, LIVE_TIMEOUT_MS);

  it("SUSPENDED from PUBLISHED: the listing stops being visible/actionable for members — buyer browse no longer returns it, and a buyer purchase attempt is refused", async () => {
    resetListingReviewFixtures();
    await restoreLiveListingAsCompliance();
    const buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { data: visibleBefore } = await buyer.from("coffee_offers").select("id").eq("id", LISTING_FIXTURES.offerReviewLive).maybeSingle();
    expect(visibleBefore?.id).toBe(LISTING_FIXTURES.offerReviewLive);

    const result = await withLiveClient(compliance, async () => {
      const { decideListing } = await import("@/lib/admin/decisions");
      return decideListing({ offerId: LISTING_FIXTURES.offerReviewLive, decision: "SUSPENDED", reason: "Suspended pending origin documentation." });
    });
    expect(result.ok).toBe(true);
    const { data: offer } = await compliance.from("coffee_offers").select("status, is_visible").eq("id", LISTING_FIXTURES.offerReviewLive).maybeSingle();
    expect(offer).toEqual({ status: "SUSPENDED", is_visible: false });

    // Member actionability (Feature 006's own rules): invisible to buyers by RLS…
    const { data: visibleAfter } = await buyer.from("coffee_offers").select("id").eq("id", LISTING_FIXTURES.offerReviewLive).maybeSingle();
    expect(visibleAfter).toBeNull();
    // …and no longer purchasable: a real buyer's attempt to add it to a draft order is refused by
    // Feature 007's own domain path (the database's `validate_order_item_offer` requires a PUBLISHED
    // listing), never by an admin-UI affordance.
    const purchase = await withLiveClient(buyer, async () => {
      const { createDraftOrder, addOrderItem } = await import("@/lib/orders/drafts");
      const userId = (await buyer.auth.getUser()).data.user!.id;
      const order = await createDraftOrder({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId, userId });
      if (!order.ok) throw new Error(String(order.code));
      return addOrderItem({ organizationId: FOUNDATION_FIXTURES.buyerOnly.organizationId, orderId: order.data.id, offerId: LISTING_FIXTURES.offerReviewLive, quantityKg: 1 });
    });
    expect(purchase.ok).toBe(false);
  }, LIVE_TIMEOUT_MS);
});

describe("Cross-role refusal (live) — direct action invocation", () => {
  const attempts = async (client: SupabaseClient) =>
    withLiveClient(client, async () => {
      const { decideKybApplication, decideListing, setOrganizationStatus, startKybReview } = await import("@/lib/admin/decisions");
      return Promise.all([
        decideKybApplication({ applicationId: APP, decision: "APPROVED" }),
        startKybReview({ applicationId: APP }),
        setOrganizationStatus({ organizationId: PHASE89_FIXTURES.suspended.organizationId, status: "ACTIVE", reason: "Attempted by the wrong role." }),
        decideListing({ offerId: LISTING_FIXTURES.offerPendingReview, decision: "APPROVED" }),
      ]);
    });

  it("WAREHOUSE, FINANCE and an approved trading member are refused with compliance_not_capable on every decision; anonymous is refused as unauthenticated", async () => {
    resetCompleteDraftApplication();
    resetListingReviewFixtures();
    for (const email of [FOUNDATION_FIXTURES.warehouseAdmin.email, FOUNDATION_FIXTURES.financeAdmin.email, FOUNDATION_FIXTURES.buyerOnly.email]) {
      const client = await signInAsFixture(email);
      for (const result of await attempts(client)) expect(result, email).toEqual({ ok: false, code: "compliance_not_capable" });
    }
    for (const result of await attempts(createAnonymousFixtureClient())) expect(result).toEqual({ ok: false, code: "profile_auth_required" });
    // Nothing moved.
    const { data: offer } = await compliance.from("coffee_offers").select("status").eq("id", LISTING_FIXTURES.offerPendingReview).maybeSingle();
    expect(offer?.status).toBe("PENDING_REVIEW");
    expect((await readApplication(compliance))?.status).toBe("DRAFT");
  }, LIVE_TIMEOUT_MS);

  it("even at the database layer, a WAREHOUSE session's direct kyb_applications / kyb_reviews / coffee_offers status writes affect zero rows", async () => {
    const warehouse = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    const app = await warehouse.from("kyb_applications").update({ status: "APPROVED" }, { count: "exact" }).eq("id", APP);
    expect(app.count ?? 0).toBe(0);
    const review = await warehouse.from("kyb_reviews").insert({ application_id: APP, reviewer_user_id: (await warehouse.auth.getUser()).data.user!.id, decision: "APPROVED", reason: null });
    expect(review.error).not.toBeNull();
    const offer = await warehouse.from("coffee_offers").update({ status: "APPROVED" }, { count: "exact" }).eq("id", LISTING_FIXTURES.offerPendingReview);
    expect(offer.count ?? 0).toBe(0);
  }, LIVE_TIMEOUT_MS);
});

describe("No hard delete / no service role / no cache — structural", () => {
  it("lib/admin/decisions.ts and lib/admin/compliance.ts issue no .delete(), no service role, no cache API, no raw error text", () => {
    for (const file of ["decisions.ts", "compliance.ts", "validation.ts"]) {
      const src = source("lib", "admin", file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/\.delete\(|SERVICE_ROLE|service_role|unstable_cache|"use cache"|cacheTag|error\.message/);
    }
    const decisions = source("lib", "admin", "decisions.ts");
    expect(decisions).not.toMatch(/admin_review_payment|order_shipments|inventory_positions/);
  });
});
