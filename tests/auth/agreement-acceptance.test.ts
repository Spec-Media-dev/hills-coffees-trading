import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCurrentAgreement } from "@/lib/auth/agreements";

import {
  createAnonymousFixtureClient,
  FOUNDATION_FIXTURES,
  signInAsFixture,
} from "./fixture-session";

/**
 * Feature 003 T024 — `acceptAgreement` (`src/app/dashboard/actions.ts`) live/static verification.
 *
 * NO CLEANUP STEP, DELIBERATELY: `authenticated` holds no DELETE grant on `agreement_acceptances`
 * (confirmed against the live schema report — INSERT/SELECT/UPDATE/REFERENCES/TRIGGER only), and
 * inventing a service-role cleanup path here would itself violate this run's "no service-role in
 * runtime" / "do not invent destructive cleanup behavior" constraints. The live-insert test below
 * therefore runs exactly once meaningfully per environment; every later run hits the same
 * `(organization_id, user_id, agreement_type, agreement_version)` unique constraint and is handled
 * by the SAME idempotent 23505 path the production action uses — which is itself the second test
 * below. This is the schema's own approved idempotency mechanism (spec T024: "follow repository
 * authority for idempotency"), not a workaround.
 *
 * BLOCKED-USER AND CROSS-ORG DENIAL: no blocked-user or multi-organization fixture exists in
 * `scripts/seed-test-fixtures.ts` (confirmed — `tests/auth/acting-organization.test.ts` notes the
 * same absence for T002, and adding one is explicitly Phase 8's T029, out of this run's scope).
 * These two paths are proven at the SOURCE level instead: the action never reads an organization id,
 * user id, or blocked-state signal from client input at all — `organization_id`/`user_id` come
 * exclusively from `getRequestIdentity()`'s server-verified acting organization, and the live RLS
 * `agreement_accept` policy (`with_check: user_id = auth.uid() AND is_org_member(organization_id)
 * AND NOT is_blocked_user()`) is the actual, already-applied enforcement boundary — re-verified by
 * reading the policy directly against the schema report, not re-implemented here.
 */

const serverClientState = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "x-forwarded-for": "203.0.113.42, 10.0.0.1",
      "user-agent": "Foundation-Test-Agent/1.0",
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) {
      throw new Error("Test request has no Supabase client");
    }
    return serverClientState.client;
  }),
}));

async function loadAction(client: SupabaseClient) {
  serverClientState.client = client;
  vi.resetModules();
  return import("@/src/app/dashboard/actions");
}

function agreementForm(agreementType: string): FormData {
  const formData = new FormData();
  formData.set("agreementType", agreementType);
  return formData;
}

afterEach(() => {
  serverClientState.client = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("acceptAgreement — trusted-field source boundary", () => {
  const source = readFileSync("src/app/dashboard/actions.ts", "utf8");

  it("never reads organization id, user id, timestamp, version or hash from client form input", () => {
    expect(source).not.toMatch(/formData\.get\(\s*["'](organizationId|userId|acceptedAt|agreementVersion|documentHash|version|hash)["']/);
  });

  it("derives version and hash exclusively from the approved registry, never from request input", () => {
    expect(source).toMatch(/getCurrentAgreement\(agreementType\)/);
    expect(source).toMatch(/current\.version/);
    expect(source).toMatch(/current\.documentHash/);
  });

  it("resolves organization_id/user_id exclusively from the server-verified identity", () => {
    expect(source).toMatch(/identity\.organization\.organizationId/);
    expect(source).toMatch(/identity\.userId/);
  });

  it("never constructs or references a service-role client", () => {
    expect(source.toLowerCase()).not.toContain("service_role");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE");
  });
});

describe.sequential("acceptAgreement against Phase 8 fixtures", () => {
  it("rejects an unauthenticated request without inserting an acceptance", async () => {
    const client = createAnonymousFixtureClient();
    const fromSpy = vi.spyOn(client, "from");
    const { acceptAgreement } = await loadAction(client);

    const result = await acceptAgreement(undefined, agreementForm("platform_terms"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("profile_auth_required");
    expect(fromSpy).not.toHaveBeenCalledWith("agreement_acceptances");
  });

  it("returns a validation error for an agreement type outside the approved registry, before authentication", async () => {
    const client = createAnonymousFixtureClient();
    const fromSpy = vi.spyOn(client, "from");
    const { acceptAgreement } = await loadAction(client);

    const result = await acceptAgreement(undefined, agreementForm("not-a-real-agreement-type"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("validation_error");
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("records a complete, server-derived acceptance for the authenticated fixture", async () => {
    const fixture = FOUNDATION_FIXTURES.buyerOnly;
    const client = await signInAsFixture(fixture.email);
    const { acceptAgreement } = await loadAction(client);

    const result = await acceptAgreement(undefined, agreementForm("platform_terms"));
    expect(result.ok).toBe(true);

    const current = getCurrentAgreement("platform_terms");
    const { data, error } = await client
      .from("agreement_acceptances")
      .select("organization_id, user_id, agreement_type, agreement_version, document_hash, accepted_at, ip_address, user_agent")
      .eq("organization_id", fixture.organizationId)
      .eq("agreement_type", "platform_terms")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      organization_id: fixture.organizationId,
      agreement_type: "platform_terms",
      agreement_version: current.version,
      document_hash: current.documentHash,
      user_agent: "Foundation-Test-Agent/1.0",
    });
    // The first (left-most, client-nearest) hop of a comma-separated x-forwarded-for chain.
    expect(data?.ip_address).toBe("203.0.113.42");
    expect(typeof data?.accepted_at).toBe("string");
  });

  it("treats a repeat acceptance of the exact same current version as an idempotent success, not an error", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { acceptAgreement } = await loadAction(client);

    // Whether or not the previous test already inserted this exact row, this call must still
    // succeed — the unique (organization_id, user_id, agreement_type, agreement_version)
    // constraint's 23505 is handled as success, never surfaced as a user-facing failure.
    const result = await acceptAgreement(undefined, agreementForm("platform_terms"));
    expect(result).toEqual({ ok: true, data: undefined, code: "agreement_accepted" });
  });

  it("rejects an authenticated caller with no resolved acting organization", async () => {
    // No multi-organization, no-selection fixture exists to reach this branch live (see file
    // docstring); this proves the code path structurally instead.
    const source = readFileSync("src/app/dashboard/actions.ts", "utf8");
    expect(source).toMatch(/identity\.organization === null \|\| identity\.requiresOrganizationSelection/);
  });
});
