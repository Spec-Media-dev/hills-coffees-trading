import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  LISTING_FIXTURES,
  PHASE89_FIXTURES,
  cleanupComplianceFixture,
  inspectComplianceFixture,
  prepareComplianceFixture,
  resetCompleteDraftApplication,
  resetListingReviewFixtures,
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
 * boundary ("Feature 010 MUST NOT become a second finance/payment engine"). **Dispute decisions do
 * not exist either** — Feature 012 (the dispute domain) is not started (T012 BLOCKED); there is no
 * dispute area, no dispute decision function, nothing to test. This file therefore proves the KYB
 * and listing halves fully (reviewer + decision + reason + exactly-once, INCLUDING two independent
 * operators racing the same record), and proves the payment/dispute halves are HONESTLY absent
 * rather than skipped silently. Per the literal `Depends: T014`, T032 stays UNCHECKED/BLOCKED.
 * `npm test -- admin/decisions` passes on its own, today, for the two halves that exist.
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

  it("Feature 012 (dispute domain) is not started; the console declares the disputes area as blocked, not as a working decision surface", async () => {
    const { ADMIN_AREAS } = await import("@/lib/admin/areas");
    const disputes = ADMIN_AREAS.find((area) => area.key === "disputes");
    expect(disputes?.availability).toBe("blocked");
    expect(disputes?.blocker).toBe("feature-012-dispute-layer");
  });
});
