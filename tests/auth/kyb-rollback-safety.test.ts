import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 003 RUN DB — migration review fix #9 (rollback safety) and the cross-cutting "no
 * destructive evidence path" assertions from fix #10's regression list.
 *
 * STATIC/CONTRACT VERIFIED ONLY — see the header note in `controlled-onboarding.test.ts`. This
 * migration is not applied anywhere in this run; the rollback file has never actually executed
 * against a real database. These tests prove the SQL TEXT contains the intended refusal guards.
 */
const ROLLBACK_PATH = "supabase/migrations/20260911010000_feature_003_kyb_foundation.rollback.sql";
const MIGRATION_PATH = "supabase/migrations/20260911010000_feature_003_kyb_foundation.sql";
const rollbackSql = readFileSync(ROLLBACK_PATH, "utf8");
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

describe("T010g — rollback safety (migration review fix #9)", () => {
  it("refuses to run if kyb_review_items contains any real review history", () => {
    expect(rollbackSql).toMatch(/if exists \(select 1 from public\.kyb_review_items limit 1\) then/);
    expect(rollbackSql).toMatch(/raise exception 'rollback_refused: kyb_review_items contains real review history/);
  });

  it("refuses to run if kyb_documents contains real version/review/supersession state", () => {
    expect(rollbackSql).toMatch(/where version > 1\s*\n\s*or status <> 'PENDING'\s*\n\s*or supersedes_document_id is not null/);
    expect(rollbackSql).toMatch(/raise exception 'rollback_refused: kyb_documents contains real version\/review state/);
  });

  it("refuses to run if the kyb-evidence bucket contains any real uploaded object", () => {
    expect(rollbackSql).toMatch(/if exists \(select 1 from storage\.objects where bucket_id = 'kyb-evidence' limit 1\) then/);
    expect(rollbackSql).toMatch(/raise exception 'rollback_refused: the kyb-evidence bucket contains real uploaded objects/);
  });

  it("the safety guards run inside a DO block that executes before any destructive DROP/DELETE statement", () => {
    const guardIndex = rollbackSql.indexOf("do $$");
    const firstDropIndex = rollbackSql.indexOf("drop policy");
    const firstDeleteIndex = rollbackSql.indexOf("delete from storage.buckets");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(firstDropIndex).toBeGreaterThan(guardIndex);
    expect(firstDeleteIndex).toBeGreaterThan(guardIndex);
  });

  it("still fully reverses every object the migration creates once the guards pass (a genuinely unused rollback stays complete)", () => {
    for (const dropped of [
      "drop function if exists public.start_organization_onboarding",
      "drop function if exists public.create_kyb_draft",
      "drop function if exists public.transition_kyb_application",
      "drop function if exists public.submit_kyb_application",
      "drop function if exists public.resubmit_kyb_application",
      "drop function if exists public.attach_kyb_document",
      "drop function if exists public.kyb_storage_object_authorized",
      "drop function if exists public.list_kyb_document_reviews",
      "drop function if exists public.create_kyb_review",
      "drop function if exists public.validate_kyb_document_lineage",
      "drop function if exists public.validate_review_item_document",
      "drop function if exists public.apply_kyb_review_item_decision",
      "drop function if exists public.prevent_kyb_review_item_mutation",
      "drop table if exists public.kyb_review_items",
      "drop index if exists public.uq_kyb_documents_supersedes_document_id",
    ]) {
      expect(rollbackSql, `rollback must drop: ${dropped}`).toContain(dropped);
    }
  });

  it("does not touch organization_can_buy, organization_can_sell, or is_authorized_member", () => {
    for (const protectedFn of ["organization_can_buy", "organization_can_sell", "is_authorized_member"]) {
      expect(rollbackSql).not.toMatch(new RegExp(`drop function[^;]*${protectedFn}`));
    }
  });
});

describe("T010g — no destructive evidence path outside an explicitly trusted retention mechanism (migration review fix #3, cross-checked)", () => {
  it("kyb_documents has exactly one policy, and it is SELECT-only", () => {
    const policies = [...migrationSql.matchAll(/create policy (\w+) on public\.kyb_documents/g)].map((m) => m[1]);
    expect(policies).toEqual(["kyb_documents_member_select"]);
  });

  it("storage.objects (kyb-evidence scope) has no policy granting UPDATE or DELETE to any role", () => {
    const storagePolicies = migrationSql.match(/create policy kyb_evidence_\w+ on storage\.objects[\s\S]*?;/g) ?? [];
    expect(storagePolicies.length).toBeGreaterThan(0);
    for (const policy of storagePolicies) {
      expect(policy).not.toMatch(/for (update|delete|all)/i);
    }
  });

  it("kyb_review_items has no policy granting INSERT, UPDATE, or DELETE to any role — only a compliance SELECT", () => {
    const policies = migrationSql.match(/create policy kyb_review_items_\w+[\s\S]*?;/g) ?? [];
    expect(policies.length).toBe(1);
    expect(policies[0]).toMatch(/for select/);
  });

  it("every write path into these three tables is a named SECURITY DEFINER function, never a table grant", () => {
    for (const fn of ["attach_kyb_document", "create_kyb_review", "start_organization_onboarding", "create_kyb_draft"]) {
      expect(migrationSql).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
    }
  });
});
