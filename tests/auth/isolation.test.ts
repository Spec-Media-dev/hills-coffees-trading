import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FOUNDATION_FIXTURES, PHASE89_FIXTURES, signInAsFixture } from "./fixture-session";

/**
 * Feature 003 T030 — cross-organization isolation. Every assertion here queries through a real,
 * authenticated fixture session's own request-scoped Supabase client (never the service-role key,
 * never a mocked identity) — this is AUTHENTICATED DB/RLS PROOF, not source inspection or a UI
 * assumption. A cross-org read resolving to an empty array/denied error is the actual database
 * boundary refusing visibility, exactly what "the DB/server boundary itself must deny visibility"
 * requires — "the UI does not show it" is never accepted as proof here.
 *
 * Fixtures used: `buyerOnly`/`buyerAndSeller` (001) as the two clearly-distinct approved
 * organizations under test; `PHASE89_FIXTURES.blockedMember`/`multiOrg` (T029) for the additional
 * negatives.
 *
 * The second `describe` block below exercises the REAL `setActingOrganization` (`lib/auth/
 * eligibility.ts`) against a real fixture session, mocking only `next/headers`'s `cookies()` (to
 * observe the write) and `@/lib/supabase/server` (to inject the real, signed-in fixture client) —
 * the same minimal-mock pattern `tests/auth/acting-organization.test.ts` established. These
 * `vi.mock` calls are file-scoped (Vitest hoists them regardless of which `describe` they are
 * physically written under), which is harmless here: the first `describe` block never imports
 * `next/headers` or `@/lib/supabase/server` at all (`signInAsFixture` builds its own client
 * directly), so the mocks have no effect on it.
 */

const cookieState = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "hills-acting-org" && cookieState.value ? { value: cookieState.value } : undefined),
    set: (name: string, value: string) => {
      if (name === "hills-acting-org") cookieState.value = value;
    },
  }),
}));

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

describe.sequential("T030 — cross-organization isolation", () => {
  it("a member of Organization A cannot read Organization B's kyb_applications", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);

    const { data, error } = await client
      .from("kyb_applications")
      .select("id, status")
      .eq("organization_id", FOUNDATION_FIXTURES.buyerAndSeller.organizationId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a member of Organization A cannot read Organization B's kyb_documents", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);

    const { data, error } = await client
      .from("kyb_documents")
      .select("id, document_type, kyb_applications!inner(organization_id)")
      .eq("kyb_applications.organization_id", FOUNDATION_FIXTURES.buyerAndSeller.organizationId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a member of Organization A cannot read Organization B's agreement_acceptances", async () => {
    const ownClient = await signInAsFixture(FOUNDATION_FIXTURES.buyerAndSeller.email);
    // Ensure there is at least one real row to attempt to see (idempotent — 23505 on a repeat run is
    // expected and ignored, matching the production action's own idempotency handling).
    await ownClient.from("agreement_acceptances").insert({
      organization_id: FOUNDATION_FIXTURES.buyerAndSeller.organizationId,
      user_id: (await ownClient.auth.getUser()).data.user?.id,
      agreement_type: "platform_terms",
      agreement_version: "0.1.0-pending-legal",
      document_hash: "PENDING_LEGAL_DOCUMENT",
    });

    const otherClient = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { data, error } = await otherClient
      .from("agreement_acceptances")
      .select("id")
      .eq("organization_id", FOUNDATION_FIXTURES.buyerAndSeller.organizationId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a blocked user cannot read another organization's data either — same boundary, not a special case", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.blockedMember.email);

    const { data, error } = await client
      .from("kyb_applications")
      .select("id")
      .eq("organization_id", FOUNDATION_FIXTURES.buyerOnly.organizationId);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a multi-org user can read both of their own organizations' membership rows but not a third organization they do not belong to", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.multiOrg.email);

    const [ownA, ownB, thirdParty] = await Promise.all([
      client
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", PHASE89_FIXTURES.multiOrg.organizationAId),
      client
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", PHASE89_FIXTURES.multiOrg.organizationBId),
      client
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", FOUNDATION_FIXTURES.buyerOnly.organizationId),
    ]);

    expect(ownA.error).toBeNull();
    expect(ownA.data?.length).toBeGreaterThan(0);
    expect(ownB.error).toBeNull();
    expect(ownB.data?.length).toBeGreaterThan(0);
    expect(thirdParty.error).toBeNull();
    expect(thirdParty.data).toEqual([]);
  });
});

describe.sequential("T030 — acting-organization switch cannot grant access to a non-membership", () => {
  afterEach(() => {
    serverClientState.client = null;
    cookieState.value = undefined;
    vi.clearAllMocks();
  });

  it("refuses to set the acting-organization cookie for an organization the caller is not a member of", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.multiOrg.email);
    serverClientState.client = client;
    vi.resetModules();
    const { setActingOrganization } = await import("@/lib/auth/eligibility");

    await expect(
      setActingOrganization(FOUNDATION_FIXTURES.buyerOnly.organizationId, "/dashboard/settings/")
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(cookieState.value).toBeUndefined();
  });

  it("accepts the acting-organization cookie for an organization the caller genuinely belongs to", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.multiOrg.email);
    serverClientState.client = client;
    vi.resetModules();
    const { setActingOrganization } = await import("@/lib/auth/eligibility");

    await expect(
      setActingOrganization(PHASE89_FIXTURES.multiOrg.organizationBId, "/dashboard/settings/")
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(cookieState.value).toBe(PHASE89_FIXTURES.multiOrg.organizationBId);
  });
});
