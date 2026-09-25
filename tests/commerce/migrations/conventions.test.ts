import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_TABLES, conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T019 — migration conventions for EVERY `*_feature_013_*.sql` forward migration (tasks.md "Migration
 * protocol", MP-1/MP-2). Pure static filesystem test: no database, no CLI, nothing written.
 *
 * Rules (each migration is checked on its own; the suite passes vacuously while no Feature 013 migration exists):
 *   - `<14-digit version>_feature_013_<snake_case>.sql`, versions after `20260924120000`, strictly ascending, unique;
 *   - the name is free of `commission` / `payment_accounts` / `platform_admins` / `run_f` / `feature_010`;
 *   - paired `supabase/rollback/<same>.rollback.sql` and read-only `supabase/maintenance/<yyyymmdd>_<name>_postflight.sql`;
 *   - one explicit transaction whose first statement is a `do $guard$` block that raises on drift;
 *   - every new table: RLS enabled AND forced, `revoke all ... from public, anon`;
 *   - no grant to `anon`; `authenticated` never receives a table write privilege;
 *   - every SECURITY DEFINER function pins `search_path` and has an explicit revoke + grant EXECUTE list;
 *   - no policy/trigger change on the six Feature 010 configuration tables;
 *   - no DML against financial rows outside function bodies, except a per-file sanctioned backfill (exact text).
 */

const root = process.cwd();
const MIGRATIONS = path.join(root, "supabase", "migrations");
const ROLLBACK = path.join(root, "supabase", "rollback");
const MAINTENANCE = path.join(root, "supabase", "maintenance");

const LAST_PRE_013_VERSION = "20260924120000";
const F013_PATTERN = /^([0-9]{14})_(feature_013_[a-z0-9_]+)\.sql$/;
const FORBIDDEN_NAME_FRAGMENTS = ["commission", "payment_accounts", "platform_admins", "run_f", "feature_010"];
const f013Files = existsSync(MIGRATIONS) ? readdirSync(MIGRATIONS).filter((file) => file.includes("_feature_013_")).sort() : [];

describe("T019 — Feature 013 migration inventory", () => {
  it("every Feature 013 migration is named <version>_feature_013_<snake_case>.sql with a clean name", () => {
    for (const file of f013Files) {
      const match = F013_PATTERN.exec(file);
      expect(match, file).not.toBeNull();
      const name = match![2]!.replace(/^feature_013_/, "");
      for (const fragment of FORBIDDEN_NAME_FRAGMENTS) expect(name, `${file} contains ${fragment}`).not.toContain(fragment);
    }
  });

  it("versions are after 20260924120000, unique and strictly ascending in file order", () => {
    const versions = f013Files.map((file) => F013_PATTERN.exec(file)?.[1] ?? "");
    for (const version of versions) expect(version > LAST_PRE_013_VERSION, version).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort()).toEqual(versions);
    const all = readdirSync(MIGRATIONS).sort();
    // No pre-013 file may appear after a Feature 013 file (Feature 013 only appends).
    const firstF013 = all.findIndex((file) => file.includes("_feature_013_"));
    if (firstF013 !== -1) for (const file of all.slice(firstF013)) expect(file.includes("_feature_013_"), file).toBe(true);
  });

  it("every Feature 013 migration has its paired rollback and read-only postflight", () => {
    for (const file of f013Files) {
      const [, version, name] = F013_PATTERN.exec(file)!;
      expect(existsSync(path.join(ROLLBACK, file.replace(/\.sql$/, ".rollback.sql"))), `${file}: rollback`).toBe(true);
      const postflight = path.join(MAINTENANCE, `${version!.slice(0, 8)}_${name}_postflight.sql`);
      expect(existsSync(postflight), `${file}: ${path.relative(root, postflight)}`).toBe(true);
      expect(postflightViolations(readFileSync(postflight, "utf8")), `${file}: postflight`).toEqual([]);
    }
  });
});

describe("T019 — Feature 013 migration MP-2 rules", () => {
  it("every forward migration satisfies the generic rules", () => {
    for (const file of f013Files) {
      expect(conventionViolations(file, readFileSync(path.join(MIGRATIONS, file), "utf8")), file).toEqual([]);
    }
  });

  it("every rollback is one explicit transaction and never touches a Feature 010 configuration table's policies/triggers", () => {
    for (const file of f013Files) {
      const rollback = normalize(maskStrings(stripDollarBodies(stripComments(readFileSync(path.join(ROLLBACK, file.replace(/\.sql$/, ".rollback.sql")), "utf8")))));
      expect(rollback, file).toMatch(/^begin;/);
      expect(rollback, file).toMatch(/commit;$/);
      expect(rollback, file).not.toMatch(new RegExp(`\\b(create|alter|drop) (policy|trigger) [^;]*\\bon public\\.(${CONFIG_TABLES.join("|")})\\b`));
    }
  });
});

describe("T019 — the rules actually bite (mutation checks on synthetic SQL)", () => {
  const good = [
    "begin;",
    "do $guard$ begin if false then raise exception 'x'; end if; end $guard$;",
    "create table public.t (id uuid primary key);",
    "alter table public.t enable row level security;",
    "alter table public.t force row level security;",
    "revoke all on table public.t from public, anon, authenticated;",
    "grant select on table public.t to authenticated;",
    "create or replace function public.f() returns void language plpgsql security definer set search_path = pg_catalog, public as $function$ begin update public.payments set amount = 0; end $function$;",
    "revoke all on function public.f() from public, anon;",
    "grant execute on function public.f() to authenticated, service_role;",
    "commit;",
  ].join("\n");
  const file = "20990101000000_feature_013_synthetic.sql";

  it("a compliant file has no violations (DML inside a function body is allowed)", () => {
    expect(conventionViolations(file, good)).toEqual([]);
  });

  it.each([
    ["missing guard", good.replace(/do \$guard\$[\s\S]*?\$guard\$;/, "")],
    ["RLS not forced", good.replace("alter table public.t force row level security;", "")],
    ["no revoke from anon", good.replace("revoke all on table public.t from public, anon, authenticated;", "")],
    ["grant to anon", good.replace("to authenticated;", "to anon;")],
    ["authenticated write grant", good.replace("grant select on table public.t", "grant select, insert on table public.t")],
    ["definer without search_path", good.replace(" set search_path = pg_catalog, public", "")],
    ["definer without revoke", good.replace("revoke all on function public.f() from public, anon;", "")],
    ["policy on a config table", good.replace("commit;", "create policy p on public.tax_rules for select using (true);\ncommit;")],
    ["top-level DML on a financial table", good.replace("commit;", "update public.payouts set amount = 1;\ncommit;")],
    ["no commit", good.replace("commit;", "")],
  ])("%s is reported", (_label, sql) => {
    expect(conventionViolations(file, sql).length).toBeGreaterThan(0);
  });

  it("a sanctioned backfill is accepted only by exact text for its own file", () => {
    const backfill = good.replace("commit;", "update public.payment_proofs set submitted_at = created_at where submitted_at is null;\ncommit;");
    expect(conventionViolations("20260925100000_feature_013_commerce_state_vocabulary.sql", backfill)).toEqual([]);
    expect(conventionViolations(file, backfill).length).toBeGreaterThan(0);
  });

  it("a postflight with a write is rejected; a single SELECT is accepted", () => {
    expect(postflightViolations("select 1 as ok;")).toEqual([]);
    expect(postflightViolations("update public.orders set status = 'VOID'; select 1;").length).toBeGreaterThan(0);
  });
});
