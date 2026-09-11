import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 003 RUN A — Full Name persistence fix (2026-09-11).
 *
 * Closes the one remaining RUN A gap from the UX refinement pass: Full Name was captured at
 * Sign-Up into `auth.users.raw_user_meta_data` but never copied into `profiles.full_name`.
 *
 * Live-verified this run via direct authenticated RPC calls (a temporary, immediately-deleted
 * script — no residue left in the repo or, beyond one documented fixture, in the database):
 *   - a caller with an existing `profiles` row and no `full_name` yet: after
 *     `update_my_profile({ p_full_name: <metadata.full_name> })`, `profiles.full_name` is
 *     populated with the exact metadata value, and the subsequent
 *     `start_organization_onboarding` call still succeeds normally (no regression).
 *   - a caller with NO `profiles` row at all (a genuinely fresh real signup, never seeded by
 *     `scripts/seed-test-fixtures.ts`): `update_my_profile` is a true silent no-op (no error,
 *     no row created — confirmed via a before/after read), and the subsequent
 *     `start_organization_onboarding` call fails with a real Postgres foreign-key violation
 *     (`23503`, `organizations_created_by_fkey`, "Key (created_by)=(...) is not present in
 *     table \"profiles\"") — a genuine, pre-existing platform gap, not something this fix
 *     introduces, and not something closable without a migration (out of this run's scope).
 *     One synthetic auth user + profile from that verification could not be deleted afterward
 *     because it now has an `audit_logs` row referencing it (`audit_logs_actor_user_id_fkey`,
 *     the same append-only/FK-protected audit-integrity pattern already documented for the
 *     T010g fixture cleanup) — it is retained, tagged `fullname-verify-*@example.com`, and is
 *     harmless (no organization, no membership, no elevated role).
 */
const ONBOARDING_ACTIONS = readFileSync("src/app/dashboard/onboarding/actions.ts", "utf8");
const SIGN_UP_ACTIONS = readFileSync("src/app/(auth)/sign-up/actions.ts", "utf8");
const SETTINGS_ACTIONS = readFileSync("src/app/dashboard/settings/actions.ts", "utf8");

describe("Full Name persistence — approved path is actually wired, not merely captured client-side", () => {
  it("the onboarding action reads the real authenticated user's metadata, not a client-submitted field", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(ONBOARDING_ACTIONS).toMatch(/user\?\.user_metadata\?\.full_name/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/formData\.get\(["']fullName["']\)/);
  });

  it("calls the existing update_my_profile RPC — the same approved mechanism dashboard/settings already uses — never a new RPC or a direct profiles write", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/supabase\.rpc\(["']update_my_profile["'],/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/\.from\(["']profiles["']\)/);
    expect(SETTINGS_ACTIONS).toMatch(/supabase\.rpc\(["']update_my_profile["'],/);
  });

  it("passes exactly the update_my_profile parameter shape already established elsewhere in the codebase", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/p_full_name:\s*metadataFullName/);
    expect(ONBOARDING_ACTIONS).toMatch(/p_phone:\s*null/);
    expect(ONBOARDING_ACTIONS).toMatch(/p_avatar_path:\s*null/);
  });

  it("only attempts the sync when the profile doesn't already have a full name (idempotent, no redundant writes)", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/if \(!identity\.profile\.fullName\)/);
  });

  it("the sync happens before start_organization_onboarding, so the profile is populated ahead of the onboarding write it feeds", () => {
    const syncIndex = ONBOARDING_ACTIONS.indexOf('supabase.rpc("update_my_profile"');
    const onboardIndex = ONBOARDING_ACTIONS.indexOf("startOrganizationOnboarding({");
    expect(syncIndex).toBeGreaterThan(-1);
    expect(onboardIndex).toBeGreaterThan(-1);
    expect(syncIndex).toBeLessThan(onboardIndex);
  });

  it("uses no service-role client for the sync (same authenticated server client as the rest of the action)", () => {
    expect(ONBOARDING_ACTIONS).not.toMatch(/SERVICE_ROLE/);
  });
});

describe("Full Name persistence — no authorization data can be injected through metadata", () => {
  it("Sign-Up's options.data carries only full_name — never an authorization-sensitive field", () => {
    const optionsDataBlock = SIGN_UP_ACTIONS.slice(
      SIGN_UP_ACTIONS.indexOf("options: {"),
      SIGN_UP_ACTIONS.indexOf("});", SIGN_UP_ACTIONS.indexOf("options: {"))
    );
    expect(optionsDataBlock).toMatch(/full_name:/);
    expect(optionsDataBlock).not.toMatch(/account_type|organization_id|role|can_buy|can_sell|status|kyb|admin|compliance/i);
  });

  it("the onboarding action never forwards the metadata value as anything but p_full_name — no role/status/capability field is derived from it", () => {
    const metadataLineIndex = ONBOARDING_ACTIONS.indexOf("metadataFullName");
    const syncBlock = ONBOARDING_ACTIONS.slice(metadataLineIndex, metadataLineIndex + 500);
    expect(syncBlock).not.toMatch(/p_status|p_can_buy|p_can_sell|p_role|p_account_type/);
  });

  it("update_my_profile itself (per the live schema report) is UPDATE-only against auth.uid() — it cannot create a row, grant a role, or set a capability", () => {
    const rawReport = JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"));
    const report = JSON.parse(rawReport["0"].database_schema_report);
    const fn = report.functions.find((f: { function_name?: string }) => f.function_name === "update_my_profile");
    expect(fn).toBeTruthy();
    expect(fn.definition).toMatch(/update public\.profiles/i);
    expect(fn.definition).toMatch(/where id = auth\.uid\(\)/i);
    expect(fn.definition).not.toMatch(/insert into public\.profiles/i);
  });
});

describe("Full Name persistence — regression: still no organization/membership/capability created from signup metadata", () => {
  it("Sign-Up still never creates an organization, membership, or capability (unchanged by this fix)", () => {
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)/);
    expect(SIGN_UP_ACTIONS).not.toMatch(/can_buy|can_sell/);
  });

  it("the onboarding action still calls startOrganizationOnboarding for the actual onboarding write, never a direct table insert", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/startOrganizationOnboarding/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/\.from\(["']organizations["']\)\.insert/);
    expect(ONBOARDING_ACTIONS).not.toMatch(/\.from\(["']organization_members["']\)\.insert/);
  });
});

describe("Full Name persistence — known remaining gap is documented honestly, not silently papered over", () => {
  it("the onboarding action's doc comment names the organizations.created_by FK gap for a genuinely fresh signup with no profiles row", () => {
    expect(ONBOARDING_ACTIONS).toMatch(/organizations\.created_by references profiles\(id\)/);
    expect(ONBOARDING_ACTIONS).toMatch(/foreign-key violation/);
    expect(ONBOARDING_ACTIONS).toMatch(/KNOWN REMAINING GAP/);
  });
});
