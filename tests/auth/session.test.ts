import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  FOUNDATION_FIXTURES,
  PHASE89_FIXTURES,
  createAnonymousFixtureClient,
  fixturePassword,
  signInAsFixture,
} from "./fixture-session";
import { totpCode } from "./totp";

/**
 * Feature 003 T033 — session / MFA / auth-disclosure. AUTHENTICATED DB/RLS + REAL Server Action
 * proof throughout — no mocked identity anywhere in this file (contrast `auth-boundary-feedback.
 * test.tsx`, which deliberately mocks `getRequestIdentity` to unit-test the action's own branching
 * in isolation; this file is the live counterpart, exercising the real fixture password/session/DB
 * round trip end to end).
 */

const serverClientState = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    if (!serverClientState.client) throw new Error("Test request has no Supabase client");
    return serverClientState.client;
  }),
}));

async function loadSignInActions() {
  vi.resetModules();
  const memberModule = await import("@/src/app/(auth)/sign-in/actions");
  const adminModule = await import("@/src/app/admin/sign-in/actions");
  return { signIn: memberModule.signIn, adminSignIn: adminModule.adminSignIn };
}

function credentials(email: string, password: string): FormData {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", password);
  return formData;
}

/** `redirect()`'s Error.message is only "NEXT_REDIRECT" — the destination lives in `.digest`. */
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

describe.sequential("T033 — sign-out", () => {
  it("protected access works before sign-out, is server-side revoked, and the next request on the same client is denied", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);

    const before = await client.auth.getUser();
    expect(before.error).toBeNull();
    expect(before.data.user).not.toBeNull();

    const { data: beforeRow, error: beforeError } = await client.from("profiles").select("id").single();
    expect(beforeError).toBeNull();
    expect(beforeRow).not.toBeNull();

    // Scoped to THIS session only — proves this client's own sign-out, without revoking any other
    // concurrently-active session for the same fixture account elsewhere in the suite (the default
    // 'global' scope would).
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    expect(signOutError).toBeNull();

    // Same client, next request: no stale session/response is reused.
    const after = await client.auth.getUser();
    expect(after.data.user).toBeNull();

    const { data: afterRow, error: afterRowError } = await client.from("profiles").select("id").maybeSingle();
    // No session → RLS's `auth.uid()` is null → `profiles_select_own` denies; either an empty/null
    // result or an explicit error is an acceptable "denied", never the previously-readable row.
    expect(afterRow).toBeNull();
    void afterRowError;
  });
});

describe.sequential("T033 — MFA server/data gate", () => {
  it("LIVE: a user with no verified factor remains allowed at aal1", async () => {
    const client = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
    expect(factorsError).toBeNull();
    expect(factors?.all.filter((factor) => factor.status === "verified")).toHaveLength(0);

    const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aalError).toBeNull();
    expect(aal?.currentLevel).toBe("aal1");
    expect(aal?.nextLevel).toBe("aal1");

    serverClientState.client = client;
    vi.resetModules();
    const { getRequestIdentity } = await import("@/lib/auth/dal");
    const identity = await getRequestIdentity();
    expect(identity.kind).toBe("authenticated");
    if (identity.kind === "authenticated") expect(identity.requiresMfaStepUp).toBe(false);

    const { data: profile, error: profileError } = await client.from("profiles").select("id").single();
    expect(profileError).toBeNull();
    expect(profile).not.toBeNull();
  });

  it("LIVE: completing the TOTP challenge genuinely promotes the session to aal2 (the mechanism itself works)", async () => {
    const client = await signInAsFixture(PHASE89_FIXTURES.mfaMember.email);

    // Clean slate: remove any factor left by an earlier interrupted run.
    const { data: existing } = await client.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      await client.auth.mfa.unenroll({ factorId: factor.id });
    }

    const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollError).toBeNull();
    if (!enrolled) throw new Error("enrollment did not return factor data");

    const code = totpCode(enrolled.totp.secret);
    const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code });
    expect(verifyError).toBeNull();

    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal2");

    await client.auth.mfa.unenroll({ factorId: enrolled.id });
  });

  /**
   * APPLICATION-LAYER PROOF (real fixture/session, real `getRequestIdentity()`, real Server Action —
   * not mocked identity): `lib/auth/dal.ts#resolveMfaStepUpRequired` resolves fresh from Supabase
   * Auth's own AAL API, `lib/auth/eligibility.ts#getEligibility` surfaces it as a dedicated blocking
   * reason checked before any organization/KYB branch, and `updateMyProfile`
   * (`src/app/dashboard/settings/actions.ts`) independently re-checks it before ever calling
   * `update_my_profile` — the SAME defence-in-depth pattern every other Feature 003 mutation already
   * follows for authentication/authorization. Enrolled-factor existence ALONE does not count as a
   * completed challenge: the assertions below hold for a BRAND-NEW session of the SAME now-enrolled
   * user that has not itself completed `challengeAndVerify` — exactly "visiting /mfa/ without
   * completing the challenge is still denied."
   */
  it("APPLICATION LAYER: a fresh aal1 session with a pending step-up is denied identity-level access and a real protected mutation; the SAME user post-challenge succeeds", async () => {
    const enrollClient = await signInAsFixture(PHASE89_FIXTURES.mfaMember.email);
    const { data: existing } = await enrollClient.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      await enrollClient.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data: enrolled, error: enrollError } = await enrollClient.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollError).toBeNull();
    if (!enrolled) throw new Error("enrollment did not return factor data");
    const { error: verifyError } = await enrollClient.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      code: totpCode(enrolled.totp.secret),
    });
    expect(verifyError).toBeNull();

    try {
      // A BRAND-NEW session for the same now-MFA-enrolled user — aal1, step-up required and NOT
      // performed on THIS session. Enrolled-factor existence alone (established above, on a
      // DIFFERENT session) does not satisfy it.
      const freshClient = await signInAsFixture(PHASE89_FIXTURES.mfaMember.email);
      const { data: aal } = await freshClient.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(aal?.currentLevel).toBe("aal1");
      expect(aal?.nextLevel).toBe("aal2");

      serverClientState.client = freshClient;
      vi.resetModules();
      const { getRequestIdentity } = await import("@/lib/auth/dal");
      const { getEligibility } = await import("@/lib/auth/eligibility");
      const preChallengeIdentity = await getRequestIdentity();
      expect(preChallengeIdentity.kind).toBe("authenticated");
      if (preChallengeIdentity.kind !== "authenticated") return;
      expect(preChallengeIdentity.requiresMfaStepUp).toBe(true);
      expect(getEligibility(preChallengeIdentity).blockingReason).toBe("mfa-step-up-required");

      // A real protected MUTATION, denied before it ever reaches `update_my_profile`.
      vi.resetModules();
      const { updateMyProfile } = await import("@/src/app/dashboard/settings/actions");
      const formData = new FormData();
      formData.set("fullName", "Should Not Persist");
      formData.set("phone", "");
      formData.set("companyName", "");
      formData.set("avatarPath", "");
      const deniedResult = await updateMyProfile(undefined, formData);
      expect(deniedResult).toEqual({ ok: false, code: "mfa_step_up_required" });

      // Complete the step-up on THIS SAME session — no sign-out, no new session — then the identical
      // resolution/mutation succeeds.
      const { error: freshVerifyError } = await freshClient.auth.mfa.challengeAndVerify({
        factorId: enrolled.id,
        code: totpCode(enrolled.totp.secret),
      });
      expect(freshVerifyError).toBeNull();

      vi.resetModules();
      const { getRequestIdentity: getRequestIdentityAgain } = await import("@/lib/auth/dal");
      const postChallengeIdentity = await getRequestIdentityAgain();
      expect(postChallengeIdentity.kind).toBe("authenticated");
      if (postChallengeIdentity.kind !== "authenticated") return;
      expect(postChallengeIdentity.requiresMfaStepUp).toBe(false);
    } finally {
      await enrollClient.auth.mfa.unenroll({ factorId: enrolled.id });
    }
  });

  it("LIVE DB/RPC: a fresh MFA-enrolled aal1 session cannot bypass the gate, while the SAME aal2 session can use its otherwise-authorized protected data", async () => {
    // This fixture is deliberately a complete, editable DRAFT with document/file metadata, so the
    // Storage probe has a path that would otherwise be authorized. The denial below is therefore
    // attributable to the AAL1 MFA gate, not to an unrelated terminal-KYB-state restriction.
    const fixture = PHASE89_FIXTURES.completeDraft;
    const enrollClient = await signInAsFixture(fixture.email);
    const { data: existing } = await enrollClient.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      await enrollClient.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data: enrolled, error: enrollError } = await enrollClient.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollError).toBeNull();
    if (!enrolled) throw new Error("enrollment did not return factor data");
    const { error: verifyError } = await enrollClient.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      code: totpCode(enrolled.totp.secret),
    });
    expect(verifyError).toBeNull();

    try {
      const freshClient = await signInAsFixture(fixture.email);
      const { data: aal } = await freshClient.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(aal?.currentLevel).toBe("aal1");
      expect(aal?.nextLevel).toBe("aal2");

      // The route's read-only MFA setup calls use the same Auth API but do not mint an aal2 JWT.
      // This is the session-level equivalent of visiting /mfa/ and stopping before its challenge.
      const { data: factorsAfterRouteSetup, error: factorsAfterRouteSetupError } = await freshClient.auth.mfa.listFactors();
      expect(factorsAfterRouteSetupError).toBeNull();
      expect(factorsAfterRouteSetup?.all.some((factor) => factor.id === enrolled.id && factor.status === "verified")).toBe(true);
      const { data: stillAal1 } = await freshClient.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(stillAal1?.currentLevel).toBe("aal1");
      const { data: mfaSatisfiedAtAal1, error: mfaSatisfiedAtAal1Error } = await freshClient.rpc("mfa_satisfied");
      expect(mfaSatisfiedAtAal1Error).toBeNull();
      expect(mfaSatisfiedAtAal1).toBe(false);

      // Every protected table is queried directly through the browser-capable Supabase client — no
      // Next.js guard, no service role and no mocked identity. RLS denial is intentionally a silent
      // empty result in PostgREST, so assert that no protected row is emitted.
      const protectedTables = [
        "profiles",
        "organizations",
        "organization_members",
        "kyb_applications",
        "kyb_documents",
        "file_assets",
        "agreement_acceptances",
        "kyb_review_items",
        "kyb_reviews",
        "account_status_history",
      ] as const;
      for (const table of protectedTables) {
        const { data, error } = await freshClient.from(table as "profiles").select("*").limit(1);
        expect(error, `${table} must not expose a direct aal1 row`).toBeNull();
        expect(data, `${table} must be empty at aal1`).toEqual([]);
      }

      // `storage.objects` is reached through the Storage REST surface rather than a public-schema
      // table. This attempted upload is denied before an object can be created, so it is both a real
      // AAL1 Storage-policy proof and leaves no byte residue in the private production bucket.
      const storageProbePath = `org/${fixture.organizationId}/application/${fixture.applicationId}/t033-aal1-denied-probe.pdf`;
      const { error: storageProbeError } = await freshClient.storage
        .from("kyb-evidence")
        .upload(storageProbePath, new Blob(["T033 AAL1 denial probe"], { type: "application/pdf" }), {
          contentType: "application/pdf",
          upsert: false,
        });
      expect(storageProbeError).not.toBeNull();

      // All browser-callable SECURITY DEFINER APIs are called directly with inert/invalid arguments.
      // Each must fail at the MFA wrapper BEFORE its old implementation can inspect input, authorize,
      // or mutate any state.
      const deniedRpcCalls: Array<[string, Record<string, unknown>]> = [
        ["update_my_profile", { p_full_name: "T033 must not persist", p_phone: null, p_company_name: null, p_avatar_path: null }],
        ["update_organization_contact", { p_organization_id: fixture.organizationId, p_display_name: "T033 must not persist", p_email: null, p_phone: null }],
        ["start_organization_onboarding", { p_legal_name: "T033", p_display_name: "T033", p_account_type: "BUYER", p_country_code: null, p_tax_number: null, p_registration_number: null, p_email: null, p_phone: null }],
        ["create_kyb_draft", { p_organization_id: fixture.organizationId }],
        ["update_kyb_draft", { p_application_id: fixture.applicationId, p_registered_address: "T033 must not persist", p_business_activity: "T033 must not persist" }],
        ["attach_kyb_document", { p_application_id: fixture.applicationId, p_document_type: "TRADE_LICENSE", p_object_path: storageProbePath, p_original_name: "t033.pdf", p_mime_type: "application/pdf", p_size_bytes: 1, p_expires_at: null, p_supersedes_document_id: null }],
        ["submit_kyb_application", { p_application_id: fixture.applicationId }],
        ["resubmit_kyb_application", { p_application_id: fixture.applicationId }],
        ["create_kyb_review", { p_application_id: fixture.applicationId, p_document_id: "f0000000-0000-4000-8000-000000000091", p_decision: "ACCEPTED", p_reason: null }],
        ["list_kyb_document_reviews", { p_application_id: fixture.applicationId }],
      ];
      for (const [rpcName, args] of deniedRpcCalls) {
        const { error } = await freshClient.rpc(rpcName as never, args as never);
        expect(error, `${rpcName} must reject direct aal1 access`).not.toBeNull();
        expect(error?.message, `${rpcName} must be rejected by the MFA wrapper`).toContain("mfa_step_up_required");
        expect(error?.code, `${rpcName} must use the permission-denied SQLSTATE`).toBe("42501");
      }

      // Step up THIS SAME browser-held session — no sign-in, no new client — and prove both a
      // direct protected read and a direct protected mutation now reach their existing authorization
      // rules. Supplying the current values preserves fixture business data.
      const { error: freshVerifyError } = await freshClient.auth.mfa.challengeAndVerify({
        factorId: enrolled.id,
        code: totpCode(enrolled.totp.secret),
      });
      expect(freshVerifyError).toBeNull();
      const { data: aal2 } = await freshClient.auth.mfa.getAuthenticatorAssuranceLevel();
      expect(aal2?.currentLevel).toBe("aal2");
      const { data: mfaSatisfiedAtAal2, error: mfaSatisfiedAtAal2Error } = await freshClient.rpc("mfa_satisfied");
      expect(mfaSatisfiedAtAal2Error).toBeNull();
      expect(mfaSatisfiedAtAal2).toBe(true);

      const { data: directOrganization, error: directOrganizationError } = await freshClient
        .from("organizations")
        .select("id")
        .eq("id", fixture.organizationId)
        .single();
      expect(directOrganizationError).toBeNull();
      expect(directOrganization?.id).toBe(fixture.organizationId);
      const { data: directMemberships, error: directMembershipsError } = await freshClient
        .from("organization_members")
        .select("organization_id")
        .eq("organization_id", fixture.organizationId);
      expect(directMembershipsError).toBeNull();
      expect(directMemberships).toHaveLength(1);
      const { data: directApplication, error: directApplicationError } = await freshClient
        .from("kyb_applications")
        .select("id")
        .eq("id", fixture.applicationId)
        .single();
      expect(directApplicationError).toBeNull();
      expect(directApplication?.id).toBe(fixture.applicationId);
      const { data: directDocuments, error: directDocumentsError } = await freshClient
        .from("kyb_documents")
        .select("id")
        .eq("application_id", fixture.applicationId);
      expect(directDocumentsError).toBeNull();
      expect(directDocuments?.length).toBeGreaterThan(0);
      const { data: directFiles, error: directFilesError } = await freshClient
        .from("file_assets")
        .select("id")
        .eq("organization_id", fixture.organizationId);
      expect(directFilesError).toBeNull();
      expect(directFiles?.length).toBeGreaterThan(0);
      const { data: storedProbeRows, error: storedProbeRowsError } = await freshClient.storage
        .from("kyb-evidence")
        .list(`org/${fixture.organizationId}/application/${fixture.applicationId}`);
      expect(storedProbeRowsError).toBeNull();
      expect(storedProbeRows?.some((entry) => entry.name === "t033-aal1-denied-probe.pdf")).toBe(false);

      const { data: profileRow, error: profileError } = await freshClient
        .from("profiles")
        .select("full_name, phone, company_name, avatar_path")
        .single();
      expect(profileError).toBeNull();
      expect(profileRow).not.toBeNull();
      const { error: mutationError } = await freshClient.rpc("update_my_profile", {
        p_full_name: profileRow?.full_name ?? null,
        p_phone: profileRow?.phone ?? null,
        p_company_name: profileRow?.company_name ?? null,
        p_avatar_path: profileRow?.avatar_path ?? null,
      });
      expect(mutationError).toBeNull();
    } finally {
      await enrollClient.auth.mfa.unenroll({ factorId: enrolled.id });
    }
  }, 30_000);
});

describe("T033 — MFA gate is checked at every protected surface, at the source", () => {
  it("both portal layouts check requiresMfaStepUp and redirect to /mfa/ before any protected branch", () => {
    const memberLayout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
    expect(memberLayout).toMatch(/identity\.requiresMfaStepUp/);
    expect(memberLayout).toMatch(/redirect\("\/mfa\/"\)/);

    const adminLayout = readFileSync("src/app/dashboard-admin/layout.tsx", "utf8");
    expect(adminLayout).toMatch(/identity\.requiresMfaStepUp/);
    expect(adminLayout).toMatch(/redirect\("\/mfa\/"\)/);
  });

  it("the Feature 003 mutation Server Actions independently re-check the gate — defence in depth, not layout-only", () => {
    const kybActions = readFileSync("src/app/dashboard/kyb/actions.ts", "utf8");
    expect(kybActions).toMatch(/identity\.requiresMfaStepUp/);

    const dashboardActions = readFileSync("src/app/dashboard/actions.ts", "utf8");
    expect(dashboardActions).toMatch(/identity\.requiresMfaStepUp/);

    const settingsActions = readFileSync("src/app/dashboard/settings/actions.ts", "utf8");
    expect((settingsActions.match(/identity\.requiresMfaStepUp/g) ?? []).length).toBeGreaterThanOrEqual(2);

    const onboardingActions = readFileSync("src/app/dashboard/onboarding/actions.ts", "utf8");
    expect(onboardingActions).toMatch(/identity\.requiresMfaStepUp/);
  });

  it("getRequestIdentity resolves the gate from Supabase's own AAL API, never from factor existence, frontend state, or an invented cookie", () => {
    const dal = readFileSync("lib/auth/dal.ts", "utf8");
    expect(dal).toMatch(/getAuthenticatorAssuranceLevel/);
    expect(dal).not.toMatch(/mfa_verified_cookie|localStorage|sessionStorage/i);
  });

  it("the pending DB helper matches application semantics: no factor is allowed, verified-factor aal1 is denied, aal2 is allowed", () => {
    const migration = readFileSync(
      "supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql",
      "utf8"
    );
    expect(migration).toMatch(/not exists\s*\([\s\S]*auth\.mfa_factors[\s\S]*status = 'verified'[\s\S]*\) then true/i);
    expect(migration).toMatch(/auth\.jwt\(\) ->> 'aal'\) = 'aal2'/);
    expect(migration).toMatch(/when auth\.uid\(\) is null then false/);
  });

  it("the pending migration gates every browser-callable Feature 003 SECURITY DEFINER RPC before its retained implementation", () => {
    const migration = readFileSync(
      "supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql",
      "utf8"
    );
    const protectedRpcs = [
      "update_my_profile",
      "update_organization_contact",
      "start_organization_onboarding",
      "create_kyb_draft",
      "update_kyb_draft",
      "attach_kyb_document",
      "submit_kyb_application",
      "resubmit_kyb_application",
      "create_kyb_review",
      "list_kyb_document_reviews",
    ];

    for (const rpc of protectedRpcs) {
      expect(migration).toContain(`t033_internal_${rpc}`);
      const wrapperStart = migration.indexOf(`create function public.${rpc}`);
      const wrapperEnd = migration.indexOf("revoke all on function", wrapperStart);
      expect(wrapperStart).toBeGreaterThan(-1);
      expect(migration.slice(wrapperStart, wrapperEnd)).toContain("if not public.mfa_satisfied()");
    }
  });

  it("the pending restrictive policies cover protected rows, review/admin data, legal evidence, and private KYB bytes", () => {
    const migration = readFileSync(
      "supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql",
      "utf8"
    );
    for (const policy of [
      "mfa_gate_profiles",
      "mfa_gate_organizations",
      "mfa_gate_organization_members",
      "mfa_gate_kyb_applications",
      "mfa_gate_kyb_documents",
      "mfa_gate_file_assets",
      "mfa_gate_agreement_acceptances",
      "mfa_gate_kyb_review_items",
      "mfa_gate_kyb_reviews",
      "mfa_gate_account_status_history",
      "mfa_gate_kyb_evidence",
    ]) {
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toMatch(/bucket_id <> 'kyb-evidence' or public\.mfa_satisfied\(\)/);
  });

  it("the rollback removes every MFA policy/wrapper and restores all original RPC names", () => {
    const rollback = readFileSync(
      "supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.rollback.sql",
      "utf8"
    );
    expect(rollback).toContain("drop policy if exists mfa_gate_kyb_evidence on storage.objects");
    for (const rpc of [
      "update_my_profile",
      "update_organization_contact",
      "start_organization_onboarding",
      "create_kyb_draft",
      "update_kyb_draft",
      "attach_kyb_document",
      "submit_kyb_application",
      "resubmit_kyb_application",
      "create_kyb_review",
      "list_kyb_document_reviews",
    ]) {
      expect(rollback).toContain(`rename to ${rpc}`);
    }
  });
});

describe.sequential("T033 — authentication disclosure resistance (live Server Action)", () => {
  it("an unknown email and a known email with the wrong password return the SAME generic code", async () => {
    const { signIn } = await loadSignInActions();

    serverClientState.client = createAnonymousFixtureClient();
    const unknownEmailResult = await signIn(
      undefined,
      credentials("definitely-not-a-real-account+foundation-test@example.com", "wrong-password-value")
    );

    serverClientState.client = createAnonymousFixtureClient();
    const wrongPasswordResult = await signIn(
      undefined,
      credentials(FOUNDATION_FIXTURES.buyerOnly.email, "definitely-the-wrong-password")
    );

    expect(unknownEmailResult).toEqual({ ok: false, code: "invalid_credentials" });
    expect(wrongPasswordResult).toEqual({ ok: false, code: "invalid_credentials" });
  });

  it("a real admin account's wrong password never discloses admin-role existence — same generic code, no ADMIN_PORTAL_REQUIRED", async () => {
    const { signIn } = await loadSignInActions();
    serverClientState.client = createAnonymousFixtureClient();

    const result = await signIn(
      undefined,
      credentials(FOUNDATION_FIXTURES.warehouseAdmin.email, "definitely-the-wrong-password")
    );

    expect(result).toEqual({ ok: false, code: "invalid_credentials" });
  });
});

describe.sequential("T033 — Member/Admin auth boundary (live, real fixture credentials, real Server Actions)", () => {
  it("an MFA-enrolled admin's fresh aal1 sign-in is routed to /mfa/ before the Operations Console", async () => {
    const enrollClient = await signInAsFixture(FOUNDATION_FIXTURES.warehouseAdmin.email);
    const { data: existing } = await enrollClient.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      await enrollClient.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data: enrolled, error: enrollError } = await enrollClient.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollError).toBeNull();
    if (!enrolled) throw new Error("admin enrollment did not return factor data");
    const { error: verifyError } = await enrollClient.auth.mfa.challengeAndVerify({
      factorId: enrolled.id,
      code: totpCode(enrolled.totp.secret),
    });
    expect(verifyError).toBeNull();

    try {
      const { adminSignIn } = await loadSignInActions();
      serverClientState.client = createAnonymousFixtureClient();
      await expectRedirectTo(
        adminSignIn(undefined, credentials(FOUNDATION_FIXTURES.warehouseAdmin.email, fixturePassword())),
        "/mfa/"
      );
    } finally {
      await enrollClient.auth.mfa.unenroll({ factorId: enrolled.id });
    }
  });

  it("an active admin through member /sign-in/ is rejected, session cleaned up, routed to the Admin Portal — never enters the member flow", async () => {
    const { signIn } = await loadSignInActions();
    serverClientState.client = createAnonymousFixtureClient();
    const client = serverClientState.client;

    const result = await signIn(undefined, credentials(FOUNDATION_FIXTURES.warehouseAdmin.email, fixturePassword()));

    expect(result).toEqual({ ok: false, code: "admin_portal_required" });
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull(); // session cleanup — signed back out, no dangling authenticated session
  });

  it("a member through admin /admin/sign-in/ is denied, signed out, and no role is created", async () => {
    const { adminSignIn } = await loadSignInActions();
    serverClientState.client = createAnonymousFixtureClient();
    const client = serverClientState.client;

    const result = await adminSignIn(undefined, credentials(FOUNDATION_FIXTURES.buyerOnly.email, fixturePassword()));

    expect(result).toEqual({ ok: false, code: "admin_access_denied" });
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });

  it("a genuine member signing in through /sign-in/ reaches the member dashboard redirect, not denial", async () => {
    const { signIn } = await loadSignInActions();
    serverClientState.client = createAnonymousFixtureClient();

    await expectRedirectTo(
      signIn(undefined, credentials(FOUNDATION_FIXTURES.buyerOnly.email, fixturePassword())),
      "/dashboard/"
    );
  });

  it("a genuine admin signing in through /admin/sign-in/ reaches the admin console redirect, not denial", async () => {
    const { adminSignIn } = await loadSignInActions();
    serverClientState.client = createAnonymousFixtureClient();

    await expectRedirectTo(
      adminSignIn(undefined, credentials(FOUNDATION_FIXTURES.warehouseAdmin.email, fixturePassword())),
      "/dashboard-admin/"
    );
  });
});
