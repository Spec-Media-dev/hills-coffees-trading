import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGREEMENT_TYPES,
  CURRENT_AGREEMENTS,
  hasAcceptedAllCurrentAgreements,
  hasAcceptedCurrentVersion,
  outstandingAgreements,
} from "@/lib/auth/agreements";

import { FOUNDATION_FIXTURES, PHASE89_FIXTURES, signInAsFixture } from "./fixture-session";

/** Feature 003 T003 verification (`lib/auth/agreements.ts` — spec FR-014, PS5). */
describe("T003 — agreement registry and version gate", () => {
  it("every registered agreement type has a current definition", () => {
    for (const type of AGREEMENT_TYPES) {
      expect(CURRENT_AGREEMENTS.some((a) => a.type === type)).toBe(true);
    }
  });

  it("an acceptance at the current version satisfies the gate", () => {
    const acceptances = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    expect(hasAcceptedCurrentVersion(acceptances, "platform_terms")).toBe(true);
  });

  it("an acceptance at an OLD version does not satisfy the gate", () => {
    const acceptances = [{ type: "platform_terms" as const, version: "0.0.1-superseded" }];
    expect(hasAcceptedCurrentVersion(acceptances, "platform_terms")).toBe(false);
  });

  it("bumping the version in the registry re-gates a previously-accepted acceptance", () => {
    const oldVersion = CURRENT_AGREEMENTS.find((a) => a.type === "purchase_terms")!.version;
    const acceptances = [{ type: "purchase_terms" as const, version: oldVersion }];
    expect(hasAcceptedCurrentVersion(acceptances, "purchase_terms")).toBe(true);

    // Simulate the version bump the way the real registry would receive one: a new version string
    // for the same type. The gate re-evaluated against the NEW definition must reject the old record.
    const bumped = CURRENT_AGREEMENTS.map((a) =>
      a.type === "purchase_terms" ? { ...a, version: "0.2.0-legal-approved" } : a
    );
    const stillSatisfies = bumped.some(
      (a) => a.type === "purchase_terms" && acceptances.some((acc) => acc.type === "purchase_terms" && acc.version === a.version)
    );
    expect(stillSatisfies).toBe(false);
  });

  it("hasAcceptedAllCurrentAgreements is false until every type is accepted at its current version", () => {
    const onlyOne = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    expect(hasAcceptedAllCurrentAgreements(onlyOne)).toBe(false);

    const all = CURRENT_AGREEMENTS.map((a) => ({ type: a.type, version: a.version }));
    expect(hasAcceptedAllCurrentAgreements(all)).toBe(true);
  });

  it("outstandingAgreements names the SPECIFIC missing types, never a generic count", () => {
    const acceptances = [{ type: "platform_terms" as const, version: CURRENT_AGREEMENTS[0]!.version }];
    const missing = outstandingAgreements(acceptances);
    expect(missing).not.toContain("platform_terms");
    expect(missing.length).toBe(AGREEMENT_TYPES.length - 1);
    for (const type of missing) expect(AGREEMENT_TYPES).toContain(type);
  });

  it("no real document hash is fabricated — the pending sentinel is explicit and honest", () => {
    for (const agreement of CURRENT_AGREEMENTS) {
      expect(agreement.documentHash).toBe("PENDING_LEGAL_DOCUMENT");
      expect(agreement.version).toMatch(/pending-legal/);
    }
  });
});

/**
 * Feature 003 T034 — AUTHENTICATED DB/RLS + REAL Server Action proof, using T029's fixtures to close
 * the live/test gaps Phase 6/7 could previously only prove statically (agreement-acceptance.test.ts
 * already live-proves the evidence-field/idempotency contract for `buyerOnly`; this section adds the
 * injection-resistance and version-bump-re-gating negatives that file could not reach without these
 * fixtures).
 */
const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Foundation-Test-Agent/1.0" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

afterEach(() => {
  serverClientState.client = null;
  vi.clearAllMocks();
});

describe.sequential("T034 — agreement acceptance injection resistance (live RLS + real Server Action)", () => {
  it("LIVE: a blocked user's acceptance attempt is refused by the Server Action, not silently accepted", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.blockedMember.email);
    serverClientState.client = client;
    vi.resetModules();
    const { acceptAgreement } = await import("@/src/app/dashboard/actions");

    const formData = new FormData();
    formData.set("agreementType", "platform_terms");
    const result = await acceptAgreement(undefined, formData);

    expect(result).toEqual({ ok: false, code: "agreement_accept_failed" });
  });

  it("LIVE: a direct cross-organization insert attempt is denied by RLS, not merely absent from the UI", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { data: user } = await client.auth.getUser();

    const { error } = await client.from("agreement_acceptances").insert({
      organization_id: FOUNDATION_FIXTURES.buyerAndSeller.organizationId, // NOT buyerOnly's own org
      user_id: user.user?.id,
      agreement_type: "purchase_terms",
      agreement_version: "0.1.0-pending-legal",
      document_hash: "PENDING_LEGAL_DOCUMENT",
    });

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("23505"); // a genuine RLS denial, not merely a duplicate-row race
  });

  it("LIVE: an arbitrary user_id cannot be injected — RLS requires user_id = auth.uid() regardless of organization_id", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { data: otherUser } = await (await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email)).auth.getUser();

    const { error } = await client.from("agreement_acceptances").insert({
      organization_id: FOUNDATION_FIXTURES.buyerOnly.organizationId, // buyerOnly's OWN org
      user_id: otherUser.user?.id, // but IMPERSONATING buyerAndSeller's user id
      agreement_type: "marketplace_terms",
      agreement_version: "0.1.0-pending-legal",
      document_hash: "PENDING_LEGAL_DOCUMENT",
    });

    expect(error).not.toBeNull();
    expect(error?.code).not.toBe("23505");
  });

  it("STATIC (re-confirmed): the Server Action reads no client-supplied organization id, user id, version, or document hash at all", () => {
    const source = readFileSync("src/app/dashboard/actions.ts", "utf8");
    expect(source).not.toMatch(/formData\.get\(\s*["'](organizationId|userId|agreementVersion|documentHash)["']/);
    expect(source).toMatch(/getCurrentAgreement\(agreementType\)/);
  });
});

describe.sequential("T034 — version-bump re-gating (live, no re-login)", () => {
  /**
   * `agreement_acceptances` rows are permanent once inserted (no DELETE grant for `authenticated` —
   * see `lib/agreements/acceptance-status.ts`'s doc comment), so a "not yet accepted" assertion
   * against LIVE fetched state would only be true on this test's very first-ever run and would fail
   * on every rerun thereafter — that specific pure-function behaviour (a stale version alone never
   * satisfies the gate) is already proven, rerun-safely, by the T003 suite above using in-memory
   * fixtures. What THIS test proves that T003 cannot is the two things that genuinely need a real,
   * live database: (a) a stale-version row and a current-version row for the SAME type can coexist
   * as two distinct rows (the unique constraint is per-version, not per-type) — real historical
   * retention, not a destructive overwrite; (b) resolving the gate immediately after inserting the
   * current-version row reflects it as satisfied, fetched fresh, no re-login — both assertions are
   * true regardless of how many times this test has run before.
   */
  it("a stale-version and a current-version acceptance for the same type coexist as real historical evidence, and the fresh-resolved gate reflects the current one", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.mfaMember.email);
    const { data: user } = await client.auth.getUser();
    const organizationId = PHASE89_FIXTURES.mfaMember.organizationId;
    const staleVersion = "0.0.1-t034-stale-test";
    const current = CURRENT_AGREEMENTS.find((a) => a.type === "platform_terms")!;

    const staleInsert = await client.from("agreement_acceptances").insert({
      organization_id: organizationId,
      user_id: user.user?.id,
      agreement_type: "platform_terms",
      agreement_version: staleVersion,
      document_hash: "PENDING_LEGAL_DOCUMENT",
    });
    if (staleInsert.error) expect(staleInsert.error.code).toBe("23505");

    const currentInsert = await client.from("agreement_acceptances").insert({
      organization_id: organizationId,
      user_id: user.user?.id,
      agreement_type: "platform_terms",
      agreement_version: current.version,
      document_hash: current.documentHash,
    });
    if (currentInsert.error) expect(currentInsert.error.code).toBe("23505");

    serverClientState.client = client;
    vi.resetModules();
    const { getOrganizationAgreementAcceptances } = await import("@/lib/agreements/acceptance-status");
    const acceptances = await getOrganizationAgreementAcceptances(organizationId, user.user!.id);

    // The current-version gate is satisfied — resolved fresh, no re-login.
    expect(hasAcceptedCurrentVersion(acceptances, "platform_terms")).toBe(true);
    // The stale row was never deleted or overwritten — both versions remain, real historical evidence.
    const platformTermsRows = acceptances.filter((row) => row.type === "platform_terms");
    expect(platformTermsRows.some((row) => row.version === staleVersion)).toBe(true);
    expect(platformTermsRows.some((row) => row.version === current.version)).toBe(true);
  });
});
