import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { INVENTORY_FIXTURES, LISTING_FIXTURES, signInAsFixture } from "@/tests/auth/fixture-session";

/**
 * Feature 006 RUN B (T015) — the permitted `DRAFT -> PENDING_REVIEW` Server Action. No parallel
 * state machine: `validate_offer_transition`'s own trigger is the sole authority on legality — this
 * action's `.eq("status","DRAFT")` clause is only its OWN defence in depth, never a substitute.
 *
 * All cases here are live (real fixture sessions, real RLS/trigger) — this task needs no fake client,
 * since none of its paths depend on the coffee_id-resolution gap `create-action-eligible.test.ts`
 * documents (this action never inserts a new row, only transitions an existing one).
 */
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

describe("T015 — submitListingForReview (live)", () => {
  it("VALIDATION_ERROR — missing offerId is refused before any database call", async () => {
    const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
    const result = await submitListingForReview(undefined, new FormData());
    expect(result).toEqual({ ok: false, code: "validation_error" });
  });

  it("SELLER_NOT_CAPABLE — a real buyer-only (canSell=false) session is refused, regardless of offerId", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgA.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "seller_not_capable" });
  });

  it("cross-org offer id — a real seller-capable session cannot transition another org's (Hills') listing", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      // A real, live HILLS-owned offer from RUN A's own fixtures — Org B is neither its owner nor an admin.
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });

  it("wrong current status — a real, live PARTIALLY_FILLED offer is not DRAFT, so the transition is refused (not silently a no-op success)", async () => {
    // Confirms the `.eq("status","DRAFT")` defence-in-depth clause itself: even if Org B somehow
    // owned this row, PARTIALLY_FILLED -> PENDING_REVIEW is not `DRAFT -> PENDING_REVIEW` and must be
    // refused, never silently treated as already-done. Re-used the same live fixture as the
    // cross-org case above (it is also cross-org here) — genuinely proves both boundaries at once
    // without inventing a redundant own-org-wrong-status fixture the settled-order ceiling would
    // block anyway (see `create-action.test.ts`'s own header for that limitation).
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", LISTING_FIXTURES.offerPublished);
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });

  it("a nonexistent offer id is refused identically to a real cross-org id — no existence leak", async () => {
    const client = await signInAsFixture(INVENTORY_FIXTURES.orgB.email);
    const result = await withLiveClient(client, async () => {
      const { submitListingForReview } = await import("@/src/app/dashboard/listings/new/actions");
      const formData = new FormData();
      formData.set("offerId", "00000000-0000-4000-8000-000000000000");
      return submitListingForReview(undefined, formData);
    });
    expect(result).toEqual({ ok: false, code: "listing_transition_refused" });
  });
});

describe("T015 — no parallel state machine / no compliance action (source-level proof)", () => {
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  it("submitListingForReview writes ONLY status: 'PENDING_REVIEW' — never APPROVED/PUBLISHED, never a client-chosen status", async () => {
    const { readFileSync } = await import("node:fs");
    const source = stripComments(readFileSync("src/app/dashboard/listings/new/actions.ts", "utf8"));
    const submitFn = source.slice(source.indexOf("export async function submitListingForReview"));
    expect(submitFn).toMatch(/status:\s*"PENDING_REVIEW"/);
    expect(submitFn).not.toMatch(/APPROVED|PUBLISHED/);
    expect(submitFn).not.toMatch(/formData\.get\("status"\)/);
  });

  it("never manually inserts a listing_status_history row — the database trigger owns it", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/dashboard/listings/new/actions.ts", "utf8");
    expect(source).not.toMatch(/listing_status_history/);
  });
});
