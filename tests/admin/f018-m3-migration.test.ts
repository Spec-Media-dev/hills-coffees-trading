/**
 * Feature 018 T045 - M3 migration contract, SQL syntax and local PostgreSQL dry-run (apply, idempotent re-apply,
 * rollback, reapply, retained fences). Static checks always run; PostgreSQL sections need F018_LOCAL_PG=1. LOCAL ONLY.
 */
import { readFileSync } from "node:fs";
import { parse } from "@pgsql/parser/v17";
import { beforeAll, describe, expect, it } from "vitest";

import { createLocalDockerRunner, F018_LOCAL_DATABASE } from "../../scripts/f018-capture-schema";
import { M3_POSTFLIGHT_SPEC, M3_RETAINED_AFTER_ROLLBACK, runM3Postflight } from "../../scripts/f018-m3-postflight";
import { M3_PREFLIGHT_SPEC, runM3Preflight } from "../../scripts/f018-m3-preflight";
import { loadCheckSection, maintenancePath, runMigrationChecks } from "../../scripts/f018-migration-checks";
import { conventionViolations, stripComments } from "../commerce/migrations/sql-rules";
import { F018_LOCAL_PG_ENABLED, F018_M1, F018_M2, F018_M3, applyForward, applyRollback, freshWorkDatabase, migrationPath, rollbackPath, tryWork, work, workScalar } from "../commerce/f018-local-pg";

const forward = readFileSync(migrationPath(F018_M3), "utf8");
const rollback = readFileSync(rollbackPath(F018_M3), "utf8");

describe("Feature 018 M3 migration static contract", () => {
  it("is a valid PostgreSQL 17 script (forward, rollback, preflight and postflight parse)", async () => {
    for (const sql of [forward, rollback, readFileSync(maintenancePath(M3_PREFLIGHT_SPEC.file), "utf8"), readFileSync(maintenancePath(M3_POSTFLIGHT_SPEC.file), "utf8")]) {
      const ast = await parse(sql);
      expect(ast.stmts?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("satisfies the repository migration conventions and orders after M2", () => {
    expect(conventionViolations(F018_M3, forward)).toEqual([]);
    expect(F018_M3 > F018_M2).toBe(true);
    expect(forward.indexOf("do $guard$")).toBeLessThan(forward.indexOf("alter table public.coffees"));
    expect(forward).toContain("feature_018_m3_feature_017_not_retired");
  });

  it("never writes inventory, widens a role or creates a policy", () => {
    const code = stripComments(forward);
    expect(code).not.toMatch(/(insert\s+into|update|delete\s+from)\s+public\.(inventory_positions|inventory_reservations|inventory_reservation_items|inventory_ownership_events|storage_allocations)/i);
    expect(code).not.toMatch(/create\s+policy|alter\s+policy|drop\s+policy|alter\s+table[^;]*(enable|disable|force)\s+row\s+level/i);
    expect(code).not.toMatch(/grant [^;]*\bto (anon|public|service_role)\b/i);
    expect(code).not.toMatch(/\bis_super_admin\b|\bis_finance_operator\b|\bis_warehouse_operator\b/);
  });

  it("every mutating routine authorizes in the database, binds a protected request and compares the revision", () => {
    for (const fn of ["create_catalogue_coffee_intent", "save_catalogue_step", "attach_catalogue_media", "remove_catalogue_media", "set_catalogue_media_primary",
      "create_backed_offer_intent", "save_offer_commercials", "set_coffee_featured", "publish_coffee_catalogue_only", "publish_coffee_with_approved_offer"]) {
      const start = forward.indexOf(`create or replace function public.${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const end = forward.indexOf("$function$;", forward.indexOf("$function$", start) + 10);
      const body = forward.slice(start, end);
      expect(body, fn).toContain("f018_assert_catalogue_admin");
      expect(body, fn).toContain("f018_request_begin");
      expect(body, fn).toContain("f018_request_complete");
      if (fn !== "create_catalogue_coffee_intent") expect(body, fn).toMatch(/f018_cas_coffee|revision_conflict/); // creation has no prior revision
    }
    const compliance = forward.slice(forward.indexOf("create or replace function public.record_listing_review_decision("));
    expect(compliance).toContain("is_compliance_operator");
    expect(compliance.slice(0, compliance.indexOf("$function$;"))).not.toContain("is_platform_admin");
  });

  it("rollback drops only the controlled routines and retains data, revisions and the readiness gate", () => {
    const code = stripComments(rollback);
    expect(code.match(/drop function if exists/g)).toHaveLength(14);
    expect(code).not.toMatch(/drop (trigger|table|column)|alter table|truncate|delete from|update /i);
    expect(code).not.toMatch(/f018_catalogue_readiness|f018_enforce_publication_readiness|f018_bump/);
  });
});

describe.skipIf(!F018_LOCAL_PG_ENABLED)("Feature 018 M3 local PostgreSQL migration (real database)", { timeout: 240_000 }, () => {
  const runner = () => createLocalDockerRunner(F018_LOCAL_DATABASE);
  beforeAll(() => { freshWorkDatabase(); });

  it("refuses to apply without M2 and leaves nothing behind", () => {
    applyForward(F018_M1);
    const refused = tryWork(forward);
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("feature_018_m3_prerequisite_missing");
    expect(workScalar("select count(*) from information_schema.columns where table_name = 'coffees' and column_name = 'revision'")).toBe("0");
  });

  it("preflight passes after M2; forward applies; postflight passes; re-apply is idempotent", () => {
    applyForward(F018_M2);
    expect(runM3Preflight(runner()).every((row) => row.ok)).toBe(true);
    applyForward(F018_M3);
    expect(runM3Postflight(runner()).every((row) => row.ok)).toBe(true);
    applyForward(F018_M3);
    expect(runM3Postflight(runner()).every((row) => row.ok)).toBe(true);
  });

  it("M1 cannot be rolled back while the Featured routine exists", () => {
    const refused = tryWork(readFileSync(rollbackPath(F018_M1), "utf8"));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("feature_018_m1_rollback_requires_m3_rolled_back_first");
  });

  it("rollback drops the routines but keeps revisions, bump triggers and the raw-publication readiness gate closed", () => {
    work("insert into auth.users (id, email) values ('f0180001-0000-4000-8000-0000000000aa', 'gate@f018.test') on conflict do nothing; insert into public.platform_admins (user_id, role) values ('f0180001-0000-4000-8000-0000000000aa', 'ADMIN') on conflict do nothing; insert into public.coffees (id, name, slug, status) values ('f0180005-0000-4000-8000-0000000000aa', 'Gate', 'f018-gate', 'DRAFT');");
    applyRollback(F018_M3);
    const results = runMigrationChecks(runner(), loadCheckSection("m3-postflight", maintenancePath(M3_POSTFLIGHT_SPEC.file)));
    const byName = new Map(results.map((row) => [row.check, row.ok]));
    for (const retained of M3_RETAINED_AFTER_ROLLBACK) expect(byName.get(retained), retained).toBe(true);
    expect(byName.get("public routines exist, are SECURITY DEFINER with a pinned search_path and are authenticated-only")).toBe(false);
    expect(workScalar("select count(*) from pg_proc where proname in ('create_catalogue_coffee_intent', 'publish_coffee_with_approved_offer', 'record_listing_review_decision')")).toBe("0");
    const raw = tryWork(`select set_config('request.jwt.claims', '{"sub":"f0180001-0000-4000-8000-0000000000aa","role":"authenticated","aal":"aal1"}', false); set role authenticated; update public.coffees set status = 'PUBLISHED' where id = 'f0180005-0000-4000-8000-0000000000aa';`);
    expect(raw.ok).toBe(false);
    expect(raw.error).toContain("coffee_not_publish_ready");
  });

  it("re-applying after rollback restores the complete applied state", () => {
    applyForward(F018_M3);
    expect(runM3Postflight(runner()).every((row) => row.ok)).toBe(true);
  });

  it("fails closed when Feature 017 retirement is violated, before any change", () => {
    applyRollback(F018_M3);
    work("grant execute on function public.record_stripe_payment_intent(uuid,text,text) to authenticated;", "supabase_admin");
    try {
      const refused = tryWork(forward);
      expect(refused.ok).toBe(false);
      expect(refused.error).toContain("feature_018_m3_feature_017_not_retired");
      expect(workScalar("select count(*) from pg_proc where proname = 'create_catalogue_coffee_intent'")).toBe("0");
    } finally {
      work("revoke execute on function public.record_stripe_payment_intent(uuid,text,text) from authenticated;", "supabase_admin");
      applyForward(F018_M3);
    }
  });
});
