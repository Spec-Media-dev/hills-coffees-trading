import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PHASE89_FIXTURES,
  createAnonymousFixtureClient,
  resetCompleteDraftApplication,
  signInAsFixture,
} from "./fixture-session";

/**
 * Feature 003 T032 — KYB transition tests. LIVE, AUTHENTICATED-SESSION PROOF against the real Server
 * Actions (`src/app/dashboard/kyb/actions.ts`) and the real, already-applied RPCs they call — never a
 * mocked identity, never a direct privileged table write standing in for the application boundary.
 *
 * Fixtures: `pendingKyb` (a genuinely INCOMPLETE DRAFT — no registered address/business activity, no
 * documents) and `completeDraft` (a COMPLETE DRAFT — both scalar fields filled, all 5 required
 * documents present and ACCEPTED), both seeded directly by the privileged script (T029) so this file
 * proves the TRANSITION logic itself, not document upload (already covered live by RUN B and the KYB
 * upload-transport fix). `completeDraft` is restored to `DRAFT` via `resetCompleteDraftApplication`
 * after each test that submits it, so the fixture is reusable across runs.
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

async function loadActions(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  return import("@/src/app/dashboard/kyb/actions");
}

/** `redirect()`'s thrown Error.message is only the literal "NEXT_REDIRECT" — the destination lives in `.digest`. */
async function expectRedirectTo(promise: Promise<unknown>, pathSubstring: string): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
    return typeof digest === "string" && digest.includes(pathSubstring);
  });
}

afterEach(() => {
  serverClientState.client = null;
  vi.clearAllMocks();
});

describe.sequential("T032 — incomplete DRAFT submission is blocked, with specific missing items", () => {
  it("submitKyb refuses an incomplete draft and names the specific missing items, without changing status", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.pendingKyb.email);
    const { submitKyb } = await loadActions(client);

    const result = await submitKyb();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation_error");
    // Every required item this fixture is deliberately missing.
    expect(result.fieldErrors).toMatchObject({
      registeredAddress: ["missing"],
      businessActivity: ["missing"],
      TRADE_LICENSE: ["missing"],
      PROOF_OF_INCORPORATION: ["missing"],
      AUTHORIZED_SIGNATORY_ID: ["missing"],
      UBO_DECLARATION: ["missing"],
      BANKING_EVIDENCE: ["missing"],
    });

    const { data: application, error } = await client
      .from("kyb_applications")
      .select("status")
      .eq("id", PHASE89_FIXTURES.pendingKyb.applicationId)
      .single();
    expect(error).toBeNull();
    expect(application?.status).toBe("DRAFT");
  });
});

describe.sequential("T032 — a complete, valid DRAFT transitions to SUBMITTED", () => {
  afterEach(() => {
    resetCompleteDraftApplication();
  });

  it("submitKyb transitions DRAFT -> SUBMITTED and records submitted_by/submitted_at correctly", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.completeDraft.email);
    const { submitKyb } = await loadActions(client);

    await expect(submitKyb()).rejects.toThrow("NEXT_REDIRECT");

    const { data: application, error } = await client
      .from("kyb_applications")
      .select("status, submitted_by, submitted_at")
      .eq("id", PHASE89_FIXTURES.completeDraft.applicationId)
      .single();

    expect(error).toBeNull();
    expect(application?.status).toBe("SUBMITTED");
    expect(application?.submitted_by).toBe((await client.auth.getUser()).data.user?.id);
    expect(typeof application?.submitted_at).toBe("string");
  });
});

describe.sequential("T032 — a blocked user is refused at the KYB mutation boundary", () => {
  it("LIVE: saveKybDraft refuses a blocked caller (is_blocked_user() inside create_kyb_draft/update_kyb_draft)", async () => {
    // blockedMember's organization is deliberately ACTIVE + APPROVED (not DRAFT) — the same fixture
    // T030/T034 reuse to prove blocking overrides an otherwise-fully-approved organization. That
    // means `saveKybDraft` is the mutation this fixture can actually exercise live here: creating a
    // NEW draft application is refused purely by `is_blocked_user()`, independent of any existing
    // application's status (`submitKyb`'s own blocked-path is proven at the source level below,
    // since this fixture's terminal APPROVED application can't also be put in DRAFT to test it live
    // without contradicting its other, equally-required role).
    const client = await signInAsFixture(PHASE89_FIXTURES.blockedMember.email);
    const { saveKybDraft } = await loadActions(client);

    const formData = new FormData();
    formData.set("registeredAddress", "Somewhere");
    formData.set("businessActivity", "Trading");

    const result = await saveKybDraft(undefined, formData);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("kyb_draft_save_failed");
  });

  it("an anonymous caller cannot reach any KYB mutation either", async () => {
    const client = createAnonymousFixtureClient();
    const { saveKybDraft } = await loadActions(client);

    // Valid form data, so this reaches the AUTHENTICATE step rather than failing validation first —
    // proving the auth boundary specifically, not merely that empty input is rejected.
    const formData = new FormData();
    formData.set("registeredAddress", "Somewhere");
    formData.set("businessActivity", "Trading");

    await expectRedirectTo(saveKybDraft(undefined, formData), "/sign-in/");
  });

  it("STATIC: every KYB state-transition RPC independently denies a blocked caller, at the source", () => {
    const migration = readFileSync(
      "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql",
      "utf8"
    );
    for (const fn of [
      "create_kyb_draft",
      "transition_kyb_application",
      "resubmit_kyb_application",
      "attach_kyb_document",
    ]) {
      const body = migration.slice(migration.indexOf(`function public.${fn}(`));
      expect(body.slice(0, 1200)).toMatch(/is_blocked_user\(\)/);
    }
  });
});

describe("T032 — controlled mutation boundaries remain intact", () => {
  it("no KYB action file directly updates organizations.status/can_buy/can_sell or approves an application", () => {
    const source = readFileSync("src/app/dashboard/kyb/actions.ts", "utf8");
    expect(source).not.toMatch(/\.from\(\s*["']organizations["']\)\s*\.update\(/);
    expect(source).not.toMatch(/status:\s*["']APPROVED["']/);
    expect(source).not.toMatch(/can_buy|can_sell/);
  });
});
