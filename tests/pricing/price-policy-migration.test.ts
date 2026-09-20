import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 011 — STATIC review of the DB-BLOCK-10 REMAINDER migration
 * `supabase/migrations/20260920160000_feature_011_db_block_10_price_policy_scope.sql`, its rollback and postflight
 * (no database access; the anonymous READ behaviour is proven live by `reference-prices-live.test.ts` after the push,
 * and the SQL itself was validated offline against an in-memory PostgreSQL rebuilt from the baseline schema report).
 *
 * WHAT THE MIGRATION IS ALLOWED TO DO: change the ROLE SCOPE of exactly three policies from `public` to
 * `authenticated` and nothing else — no expression change, no new policy, no grant, no EXECUTE grant to `anon`, no
 * `warehouses` change, no row DML. The analyser below encodes that as a policy and the mutation tests prove it bites.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const VERSION = "20260920160000";
const NAME = `${VERSION}_feature_011_db_block_10_price_policy_scope`;
const migrationRaw = read("supabase", "migrations", `${NAME}.sql`);
const rollbackRaw = read("supabase", "rollback", `${NAME}.rollback.sql`);
const postflightRaw = read("supabase", "maintenance", "20260920_feature_011_price_policy_scope_postflight.sql");

const EXPECTED: ReadonlyArray<readonly [string, string]> = [
  ["price_sources_admin", "price_sources"],
  ["price_observations_admin", "price_observations"],
  ["price_differentials_admin", "price_differentials"],
];

/** Top-level statements only: the guard and self-check `do $x$ … $x$` blocks are excluded. */
const topLevel = (sqlRaw: string) => strip(sqlRaw).replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "");

const violations = (sqlRaw: string): string[] => {
  const top = topLevel(sqlRaw);
  const problems: string[] = [];
  const alters = [...top.matchAll(/alter\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+(to|using|with\s+check|rename)\s+([^;]*);/gi)];
  for (const [policy, table] of EXPECTED) {
    const mine = alters.filter((m) => m[1] === policy && m[2] === table);
    if (mine.length !== 1) problems.push(`${policy}: expected exactly one ALTER POLICY, found ${mine.length}`);
    else if (mine[0][3].toLowerCase() !== "to" || mine[0][4].trim() !== "authenticated") problems.push(`${policy}: must be exactly "TO authenticated"`);
  }
  for (const m of alters) if (!EXPECTED.some(([p, t]) => p === m[1] && t === m[2])) problems.push(`out-of-scope ALTER POLICY ${m[1]} on ${m[2]}`);
  if (alters.length !== 3) problems.push(`expected exactly 3 ALTER POLICY statements, found ${alters.length}`);
  const probes: Array<[string, RegExp]> = [
    ["create policy", /\bcreate\s+policy\b/i],
    ["drop policy", /\bdrop\s+policy\b/i],
    ["grant/revoke", /\b(grant|revoke)\b/i],
    ["function DDL", /\b(create(\s+or\s+replace)?|alter|drop)\s+function\b/i],
    ["table/column/constraint/index/trigger DDL", /\b(alter\s+table|create\s+table|drop\s+table|create\s+(unique\s+)?index|create\s+trigger|drop\s+trigger|add\s+column|drop\s+column)\b/i],
    ["row DML", /(^|;)\s*(insert\s+into|update\s+public\.|delete\s+from)\b/i],
    ["rls toggle", /\b(enable|disable|force)\s+row\s+level\s+security\b/i],
    ["warehouses", /\bwarehouses\b/i],
    ["policy on another table", /alter\s+policy\s+\w+\s+on\s+public\.(?!price_)\w+/i],
  ];
  for (const [label, re] of probes) if (re.test(top)) problems.push(label);
  return problems;
};

describe("Feature 011 migration — exactly three role-scope changes", () => {
  it("the migration passes the whole policy", () => {
    expect(violations(migrationRaw)).toEqual([]);
  });

  it("changes ONLY the three price_*_admin policies, each `TO authenticated`", () => {
    const alters = [...topLevel(migrationRaw).matchAll(/alter\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+to\s+(\w+)/gi)].map((m) => `${m[1]}@${m[2]}=>${m[3]}`);
    expect(alters.sort()).toEqual(["price_differentials_admin@price_differentials=>authenticated", "price_observations_admin@price_observations=>authenticated", "price_sources_admin@price_sources=>authenticated"]);
  });

  it("does not touch the public-read policies, warehouses, grants or anon EXECUTE (statement text, comments excluded)", () => {
    const top = topLevel(migrationRaw);
    expect(top).not.toMatch(/public_read/);
    expect(top).not.toMatch(/warehouses/);
    expect(top).not.toMatch(/\bgrant\b/i);
    expect(top).not.toMatch(/\bexecute\b/i);
  });

  it("is transactional and self-checking: guard first (refuses any unexpected pre-state), self-check last (rolls back on any drift)", () => {
    const sql = strip(migrationRaw);
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
    expect(sql).toMatch(/preflight failed — nothing applied/);
    expect(sql).toMatch(/self-check failed — everything rolled back/);
    for (const key of ["app.f011_policies", "app.f011_grants", "app.f011_function_acl"]) expect(sql.split(key).length, key).toBe(3);
    expect(sql).toMatch(/has_function_privilege\('anon', 'public\.is_platform_admin\(\)', 'execute'\)/);
    expect(sql.indexOf("$guard$")).toBeLessThan(sql.indexOf("alter policy"));
    expect(sql.lastIndexOf("alter policy")).toBeLessThan(sql.indexOf("$verify$"));
  });

  it("documents the cause, the unchanged write path, and that warehouses is deliberately out of scope", () => {
    expect(migrationRaw).toMatch(/42501/);
    expect(migrationRaw).toMatch(/permission denied for function is_platform_admin/);
    expect(migrationRaw).toMatch(/`warehouses` is NOT touched/);
    expect(migrationRaw).toMatch(/NO write capability is granted to anyone new/);
  });

  it("the three artefacts share one unique version and live in their designated folders", () => {
    const versions = readdirSync(path.join(root, "supabase", "migrations")).map((f) => f.slice(0, 14));
    expect(versions.filter((v) => v === VERSION)).toHaveLength(1);
    expect(existsSync(path.join(root, "supabase", "rollback", `${NAME}.rollback.sql`))).toBe(true);
    expect(existsSync(path.join(root, "supabase", "maintenance", "20260920_feature_011_price_policy_scope_postflight.sql"))).toBe(true);
    expect(readdirSync(path.join(root, "supabase", "migrations")).filter((f) => /rollback|postflight/i.test(f))).toEqual([]);
  });
});

describe("Feature 011 migration — mutation tests (the policy fails when the migration is wrong)", () => {
  it("dropping one ALTER POLICY fails", () => {
    const mutated = migrationRaw.replace(/^alter policy price_differentials_admin.*$/m, "");
    expect(mutated).not.toBe(migrationRaw);
    expect(violations(mutated).join("\n")).toMatch(/price_differentials_admin: expected exactly one ALTER POLICY, found 0/);
  });

  it("scoping to the wrong role fails (e.g. `to public` or `to anon`)", () => {
    expect(violations(migrationRaw.replace("price_sources_admin       on public.price_sources       to authenticated", "price_sources_admin       on public.price_sources       to anon")).join("\n")).toMatch(/must be exactly "TO authenticated"/);
    expect(violations(migrationRaw.replace("on public.price_observations  to authenticated;", "on public.price_observations  to public;")).join("\n")).toMatch(/must be exactly "TO authenticated"/);
  });

  it("changing an expression (USING / WITH CHECK) fails", () => {
    expect(violations(migrationRaw.replace("-- 2. Self-check", "alter policy price_sources_admin on public.price_sources using (true);\n-- 2. Self-check")).join("\n")).toMatch(/must be exactly|expected exactly 3/);
  });

  it("touching warehouses, a public-read policy, another table's policy, or granting anything fails", () => {
    const add = (sql: string) => migrationRaw.replace("-- 2. Self-check", `${sql}\n-- 2. Self-check`);
    expect(violations(add("alter policy catalog_admin_warehouses on public.warehouses to authenticated;")).join("\n")).toMatch(/warehouses|out-of-scope/);
    expect(violations(add("alter policy price_sources_public_read on public.price_sources to authenticated;")).join("\n")).toMatch(/out-of-scope/);
    expect(violations(add("grant delete on public.price_sources to authenticated;")).join("\n")).toMatch(/grant/);
    expect(violations(add("grant execute on function public.is_platform_admin() to anon;")).join("\n")).toMatch(/grant/);
    expect(violations(add("create policy extra on public.price_sources for select using (true);")).join("\n")).toMatch(/create policy/);
    expect(violations(add("delete from public.price_sources;")).join("\n")).toMatch(/row DML/);
  });
});

describe("Feature 011 rollback and postflight", () => {
  it("rollback restores exactly the three policies to `TO public` behind a guard, and changes nothing else", () => {
    const top = topLevel(rollbackRaw);
    const alters = [...top.matchAll(/alter\s+policy\s+(\w+)\s+on\s+public\.(\w+)\s+to\s+(\w+)/gi)].map((m) => `${m[1]}@${m[2]}=>${m[3]}`);
    expect(alters.sort()).toEqual(["price_differentials_admin@price_differentials=>public", "price_observations_admin@price_observations=>public", "price_sources_admin@price_sources=>public"]);
    expect(strip(rollbackRaw)).toMatch(/rollback refused/);
    expect(top).not.toMatch(/\b(grant|revoke|create\s+policy|drop\s+policy|insert|update|delete|alter\s+table)\b/i);
    expect(strip(rollbackRaw).trimStart().startsWith("begin;")).toBe(true);
    expect(strip(rollbackRaw).trimEnd().endsWith("commit;")).toBe(true);
  });

  it("postflight is read-only and pins policy scope, expressions, policy count, anon EXECUTE, grants, RLS and the untouched warehouses policy", () => {
    const sql = strip(postflightRaw);
    expect(sql).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|alter\s+|drop\s+|create\s+|grant\s+|revoke\s+|truncate)\b/i);
    for (const needle of ["price_sources_admin", "price_observations_admin", "price_differentials_admin", "{authenticated}", "has_function_privilege('anon'", "relrowsecurity", "role_table_grants", "catalog_admin_warehouses", "pg_policies"]) expect(sql, needle).toContain(needle);
    expect(sql).toMatch(/select n, check_name, coalesce\(ok, false\) as ok, detail from checks order by n;/);
  });
});
