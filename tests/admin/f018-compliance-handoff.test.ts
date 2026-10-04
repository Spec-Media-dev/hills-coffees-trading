/**
 * Feature 018 T054 - Compliance approval hand-off. STATIC: `decideListing` is one database transaction
 * (`record_listing_review_decision`); authority and from-status are enforced by the database (proved on real
 * PostgreSQL in f018-catalogue-orchestration.test.ts). Here: the app layer's contract and error mapping.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guard = vi.hoisted(() => ({ result: { ok: true, identity: { userId: "u1" } } as { ok: boolean; denial?: string; identity?: { userId: string } } }));
vi.mock("@/lib/admin/guards", () => ({ checkRoleFunctionAccess: vi.fn(async () => guard.result) }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }));

import { decideListing } from "@/lib/admin/decisions";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

const OFFER = "f0180006-0000-4000-8000-000000000001";
const KEY = "f018000c-0000-4000-8000-000000000009";

beforeEach(() => { rpc.mockReset(); guard.result = { ok: true, identity: { userId: "u1" } }; });

describe("decideListing -> record_listing_review_decision", () => {
  it("makes exactly ONE database call carrying the request key (no separate status update + history insert)", async () => {
    rpc.mockResolvedValue({ data: { review_id: "r1", from_status: "PENDING_REVIEW", to_status: "APPROVED" }, error: null });
    const result = await decideListing({ offerId: OFFER, decision: "APPROVED" }, KEY);
    expect(result).toMatchObject({ ok: true, code: ACTION_FEEDBACK.LISTING_DECISION_RECORDED, data: { reviewId: "r1", toStatus: "APPROVED" } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("record_listing_review_decision", { p_offer_id: OFFER, p_decision: "APPROVED", p_reason: null, p_request_id: KEY });
  });

  it("is a Compliance-only guard: a denied operator never reaches the database", async () => {
    guard.result = { ok: false, denial: "forbidden" };
    expect(await decideListing({ offerId: OFFER, decision: "APPROVED" })).toMatchObject({ ok: false, code: ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE });
    guard.result = { ok: false, denial: "anonymous" };
    expect(await decideListing({ offerId: OFFER, decision: "APPROVED" })).toMatchObject({ ok: false, code: ACTION_FEEDBACK.PROFILE_AUTH_REQUIRED });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["listing_decision_stale", ACTION_FEEDBACK.LISTING_DECISION_STALE],
    ["mfa_step_up_required", ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED],
    ["forbidden", ACTION_FEEDBACK.COMPLIANCE_NOT_CAPABLE],
    ["unexpected database detail", ACTION_FEEDBACK.LISTING_DECISION_FAILED],
  ])("maps %s to a safe code without echoing text", async (message, code) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await decideListing({ offerId: OFFER, decision: "REJECTED", reason: "no docs" })).toEqual({ ok: false, code });
  });

  it("the Admin catalogue stepper never decides a listing (no role expansion)", () => {
    for (const file of ["lib/admin/catalogue.ts", "src/app/dashboard-admin/(catalogue)/coffees/workflow-actions.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/record_listing_review_decision|decideListing/);
    }
  });
});
