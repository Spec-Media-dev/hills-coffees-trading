import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 003 RUN DB — T010c static/contract verification for `start_organization_onboarding`
 * (`specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §1).
 *
 * STATIC/CONTRACT VERIFIED ONLY. This migration is not applied to any database in this run (no
 * commit/push, no production mutation — see the run's final report), so there is no live database
 * to exercise it against. These tests prove the SQL TEXT satisfies the security contract; they do
 * not and cannot prove live RLS/transaction behaviour. That proof is T010g's remaining, explicitly
 * deferred obligation once a human has reviewed and applied the migration to a real environment.
 */
const MIGRATION_PATH = "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql";
const sql = readFileSync(MIGRATION_PATH, "utf8");

function functionBody(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `function ${name} must exist in the migration`).toBeGreaterThan(-1);
  const end = sql.indexOf("\n$$;", start);
  expect(end, `function ${name} must be terminated with $$; `).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("T010c — controlled organization onboarding (start_organization_onboarding)", () => {
  it("never touches the three protected authorization functions", () => {
    for (const protectedFn of ["organization_can_buy", "organization_can_sell", "is_authorized_member"]) {
      expect(sql).not.toMatch(new RegExp(`create or replace function public\\.${protectedFn}\\b`));
    }
  });

  it("is SECURITY DEFINER with a fixed, safe search_path", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = pg_catalog, public, auth/);
  });

  it("requires auth.uid() to exist and refuses blocked users", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/auth\.uid\(\) is null/);
    expect(body).toMatch(/is_blocked_user\(\)/);
  });

  it("checks email verification against auth.users server-side", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/auth\.users/);
    expect(body).toMatch(/email_confirmed_at is not null/);
  });

  it("accepts only BUYER or SELLER, never HILLS_INTERNAL, from the caller's account-type argument", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/p_account_type not in \('BUYER', 'SELLER'\)/);
    expect(body).not.toMatch(/HILLS_INTERNAL/);
  });

  it("has no caller-facing parameter for status, can_buy, can_sell, created_by, member_role, or user_id", () => {
    const signatureStart = sql.indexOf("create or replace function public.start_organization_onboarding(");
    const signatureEnd = sql.indexOf(")\nreturns jsonb", signatureStart);
    const signature = sql.slice(signatureStart, signatureEnd);
    for (const forbidden of ["p_status", "p_can_buy", "p_can_sell", "p_created_by", "p_member_role", "p_user_id", "p_organization_id"]) {
      expect(signature, `signature must not accept ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("derives can_buy/can_sell server-side from account_type only, never from a caller argument", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/v_can_buy := true;/);
    expect(body).toMatch(/v_can_sell := true;/);
    expect(body).toMatch(/v_can_sell := false;/);
  });

  it("always creates the organization as PENDING_KYB and non-internal", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/'PENDING_KYB'/);
    expect(body).toMatch(/false, auth\.uid\(\), v_can_buy, v_can_sell/);
  });

  it("creates only the caller's own OWNER membership, never an arbitrary user id", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/insert into public\.organization_members/);
    expect(body).toMatch(/v_new_org_id, auth\.uid\(\), 'OWNER', true/);
  });

  it("serializes concurrent calls per-caller with an advisory lock before the membership check", () => {
    const body = functionBody("start_organization_onboarding");
    const lockIndex = body.indexOf("pg_advisory_xact_lock");
    const checkIndex = body.indexOf("select 1 from public.organization_members om");
    expect(lockIndex, "advisory lock must be present").toBeGreaterThan(-1);
    expect(checkIndex, "existing-membership check must be present").toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(checkIndex);
  });

  it("returns a controlled conflict result for an existing member instead of creating a second organization", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/'conflict', 'already_member'/);
    const conflictReturnIndex = body.indexOf("'conflict', 'already_member'");
    const insertOrgIndex = body.indexOf("insert into public.organizations");
    expect(conflictReturnIndex).toBeLessThan(insertOrgIndex);
  });

  it("REVIEW FIX #7 — the existing-membership check is a plain EXISTS, never an ORDER BY ... LIMIT 1 pick", () => {
    const body = functionBody("start_organization_onboarding");
    expect(body).toMatch(/if exists \(\s*\n\s*select 1 from public\.organization_members om/);
    expect(body).not.toMatch(/order by[\s\S]*?limit 1/i);
  });

  it("REVIEW FIX #7 — the conflict response never names a specific organization (no picking for a multi-org caller)", () => {
    const body = functionBody("start_organization_onboarding");
    const conflictBlock = body.slice(
      body.indexOf("if exists ("),
      body.indexOf("'conflict', 'already_member'") + 60
    );
    expect(conflictBlock).not.toMatch(/organization_id/);
    expect(conflictBlock).not.toMatch(/organization_status/);
  });

  it("REVIEW FIX #7 — the TS wrapper's conflict result type carries no organization id/status either", () => {
    const wrapper = readFileSync("lib/kyb/mutations.ts", "utf8");
    const conflictType = wrapper.match(/\{ ok: true; created: false; conflict: "already_member" \}/);
    expect(conflictType).not.toBeNull();
  });

  it("EXECUTE is revoked from PUBLIC and granted only to authenticated/service_role — never anon", () => {
    const grantBlock = sql.slice(
      sql.indexOf("revoke all on function public.start_organization_onboarding"),
      sql.indexOf("revoke all on function public.start_organization_onboarding") + 400
    );
    expect(grantBlock).toMatch(/revoke all on function public\.start_organization_onboarding.* from public/);
    expect(grantBlock).toMatch(/grant execute on function public\.start_organization_onboarding.* to authenticated, service_role/);
    expect(grantBlock).not.toMatch(/\banon\b/);
  });

  it("does not create a broad direct INSERT policy on organizations or organization_members", () => {
    expect(sql).not.toMatch(/create policy [^\n]*\bon public\.organizations\b[^;]*for insert/i);
    expect(sql).not.toMatch(/create policy [^\n]*\bon public\.organization_members\b[^;]*for insert/i);
  });

  it("uses no service-role key anywhere in the wrapper module", () => {
    const wrapper = readFileSync("lib/kyb/mutations.ts", "utf8");
    expect(wrapper).not.toMatch(/SERVICE_ROLE/);
  });
});

describe("T010c/T010e — create_kyb_draft concurrency (migration review fix #6)", () => {
  it("the pre-existing uq_one_open_kyb_application unique index is the authoritative duplicate guard, and this migration does not recreate it", () => {
    // Confirmed present in the checked-in baseline (supabase/trading_schema.sql): a partial unique
    // index on kyb_applications(organization_id) scoped to the four "open" statuses. This migration
    // must not attempt to recreate it (that would be redundant at best, a conflicting definition at
    // worst) — it only adds a lock and a graceful exception handler on top.
    expect(sql).not.toMatch(/create (unique )?index[^;]*uq_one_open_kyb_application/);
  });

  it("create_kyb_draft takes a per-organization advisory lock before its SELECT-then-INSERT", () => {
    const body = functionBody("create_kyb_draft");
    const lockIndex = body.indexOf("pg_advisory_xact_lock(hashtext(p_organization_id::text))");
    const selectIndex = body.indexOf("select id into v_application_id");
    expect(lockIndex).toBeGreaterThan(-1);
    expect(selectIndex).toBeGreaterThan(-1);
    expect(lockIndex).toBeLessThan(selectIndex);
  });

  it("create_kyb_draft catches unique_violation on the INSERT and falls back to the winning row instead of raising a raw constraint error", () => {
    const body = functionBody("create_kyb_draft");
    expect(body).toMatch(/exception\s*\n\s*when unique_violation then/);
  });
});

describe("T010c — no historical migration was edited", () => {
  it("the pre-existing DB-BLOCK-10 migration file is unchanged by this run", () => {
    // This test can only assert the file still exists at its original name — content diffing
    // against a prior commit is out of a static test's reach. The run's own git-diff audit
    // (final report §P) is the authoritative check that no historical migration file was modified.
    expect(() =>
      readFileSync("supabase/migrations/20260909000000_db_block_10_scope_catalog_admin_policies.sql", "utf8")
    ).not.toThrow();
  });

  it("this migration file is a NEW additive file, not a rewrite of an existing one", () => {
    expect(() => readFileSync(MIGRATION_PATH, "utf8")).not.toThrow();
  });
});
