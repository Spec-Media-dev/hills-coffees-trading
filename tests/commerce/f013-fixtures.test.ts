import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { F013_FIXTURES } from "@/tests/auth/fixture-session";

/**
 * Feature 013 T016 — the Feature 013 fixture tooling targets exact identities only.
 *
 * Static checks over scripts/seed-test-fixtures.ts (the F013 block): fixed ids in the reserved `13000000-` range,
 * `+f013-test@example.com` identities, no wildcard/pattern/range filter, no hard delete of any business row, an
 * explicit per-run approval gate and a project-ref check before any write, and constants mirrored exactly in
 * tests/auth/fixture-session.ts.
 */
const script = readFileSync("scripts/seed-test-fixtures.ts", "utf8").replace(/\r\n/g, "\n");
const block = script.slice(script.indexOf("// Feature 013 T016"), script.indexOf("async function main(): Promise<void> {"));
const cleanup = block.slice(block.indexOf("async function cleanupF013Fixtures"));
const prepare = block.slice(block.indexOf("async function prepareF013Fixtures"), block.indexOf("async function cleanupF013Fixtures"));

/**
 * The ONE hard-delete exception (owner-approved 2026-09-25, T025/T016): disposable PRE-FINANCIAL M1 proof orders only.
 * It lives in exactly one function, `deleteF013M1ProofOrders`; everything else in the block stays under the generic
 * "never hard-delete" rule.
 */
const EXCEPTION_NAME = "async function deleteF013M1ProofOrders(";
const functionText = (source: string, header: string) => {
  const start = source.indexOf(header);
  return start === -1 ? "" : source.slice(start, source.indexOf("\n}\n", start) + 3);
};
const exceptionFn = functionText(block, EXCEPTION_NAME);
/**
 * The SECOND named exception (owner-approved 2026-09-25, T031 "clean them up afterwards by exact id"): the two
 * disposable T031 proof destinations only, in `deleteF013T031ProofDestinations`.
 */
const T031_EXCEPTION_NAME = "async function deleteF013T031ProofDestinations(";
const t031ExceptionFn = functionText(block, T031_EXCEPTION_NAME);
const cleanupWithoutException = cleanup.replace(exceptionFn, "").replace(t031ExceptionFn, "");
/** Every condition the T031 destination exception must keep; each returned string is a violation. */
function t031ExceptionViolations(fn: string, source: string): string[] {
  const problems: string[] = [];
  if (!fn) return ["T031 exception function missing"];
  if ((fn.match(/\.delete\(\)/g) ?? []).length !== 1) problems.push("expected exactly one delete");
  if (!/await admin\.from\("delivery_destinations"\)\.delete\(\)\.in\("id", ids\)\.eq\("label", F013_T031_PROOF_LABEL\);/.test(fn)) problems.push("delete is not delivery_destinations by checked ids AND the proof label");
  if (!/await admin\.from\("delivery_destinations"\)\.select\("id, label, organization_id"\)\.in\("id", F013_T031_ALL_DESTINATION_IDS\);/.test(fn)) problems.push("candidates are not read by the exact id list");
  if (!/const ids = \(rows \?\? \[\]\)\.map\(\(row\) => row\.id as string\);/.test(fn)) problems.push("delete ids are not exactly the rows read");
  if (!/row\.label !== F013_T031_PROOF_LABEL/.test(fn)) problems.push("proof-label precondition missing");
  if (!/row\.organization_id !== ORGANIZATION_IDS\.buyerOnly && row\.organization_id !== ORGANIZATION_IDS\.buyerAndSeller/.test(fn)) problems.push("fixture-org precondition missing");
  if (!/admin\.from\("orders"\)\.select\("id", \{ count: "exact", head: true \}\)\.in\("delivery_destination_id", ids\)[\s\S]*?if \(\(count \?\? 0\) !== 0\) problems\.push/.test(fn)) problems.push("order-reference precondition missing");
  const refusal = fn.indexOf("if (problems.length > 0) throw new SafeFixtureError");
  if (refusal === -1 || refusal > fn.indexOf(".delete()")) problems.push("refusal does not precede the delete");
  const ids = /const F013_T031_DESTINATION_IDS = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const literal = [...ids.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (literal.length !== 2 || !literal.every((id) => /^13000000-0000-4000-8000-0000000002[0-9a-f]{2}$/.test(id))) problems.push("proof destination ids are not the 2 exact reserved 13000000-…-0000000002xx ids");
  if (!/const F013_T031_ALL_DESTINATION_IDS = Object\.values\(F013_T031_DESTINATION_IDS\);/.test(source)) problems.push("F013_T031_ALL_DESTINATION_IDS is not exactly the proof id list");
  if (!/const F013_T031_PROOF_LABEL = "F013 T031 PROOF FIXTURE";/.test(source)) problems.push("proof label changed");
  return problems;
}
/** Tables that reference public.orders(id), except order_status_history (the only child a proof order may have). */
function tablesReferencingOrders(): string[] {
  const files = ["supabase/trading_schema.sql", ...readdirSync("supabase/migrations").map((f: string) => `supabase/migrations/${f}`)];
  const tables = new Set<string>();
  for (const file of files) {
    const sql = readFileSync(file, "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      if (/\breferences public\.orders\(id\)/.test(m[2]!)) tables.add(m[1]!);
    }
    for (const m of sql.matchAll(/alter table public\.(\w+)[^;]*?\badd column \w+ uuid[^;,]*references public\.orders\(id\)/g)) tables.add(m[1]!);
  }
  tables.delete("order_status_history");
  return [...tables].sort();
}
/** Every condition the exception must keep; each returned string is a violation. */
function exceptionViolations(fn: string, source: string): string[] {
  const problems: string[] = [];
  if (!fn) return ["exception function missing"];
  const deletes = [...fn.matchAll(/\.delete\(\)/g)];
  if (deletes.length !== 1) problems.push(`expected exactly one delete, found ${deletes.length}`);
  if (!/await admin\.from\("orders"\)\.delete\(\)\.in\("id", ids\)\.eq\("correlation_id", F013_M1_PROOF_MARKER\);/.test(fn)) problems.push("delete is not orders by exact proof ids AND the proof marker");
  if (!/const \{ data: orders, error \} = await admin\.from\("orders"\)\.select\("id, correlation_id, buyer_organization_id"\)\.in\("id", F013_M1_ALL_IDS\);/.test(fn)) problems.push("candidate ids are not read by the exact F013_M1_ALL_IDS list");
  if (!/const ids = \(orders \?\? \[\]\)\.map\(\(order\) => order\.id as string\);/.test(fn)) problems.push("delete ids are not exactly the rows read");
  if (!/order\.correlation_id !== F013_M1_PROOF_MARKER/.test(fn)) problems.push("proof-marker precondition missing");
  if (!/order\.buyer_organization_id !== ORGANIZATION_IDS\.buyerOnly/.test(fn)) problems.push("fixture-org precondition missing");
  if (!/for \(const table of F013_M1_ORDER_DEPENDENTS\)[\s\S]*?\.in\("order_id", ids\)[\s\S]*?if \(\(count \?\? 0\) !== 0\) problems\.push/.test(fn)) problems.push("dependent-row precondition missing");
  const refusal = fn.indexOf("if (problems.length > 0) throw new SafeFixtureError");
  if (refusal === -1 || refusal > fn.indexOf(".delete()")) problems.push("refusal does not precede the delete");
  const ids = /const F013_M1_ORDER_IDS = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const literal = [...ids.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (literal.length !== 10 || !literal.every((id) => /^13000000-0000-4000-8000-0000000001[0-9a-f]{2}$/.test(id))) problems.push("proof ids are not the 10 exact reserved 13000000-…-0000000001xx ids");
  if (!/const F013_M1_ALL_IDS = Object\.values\(F013_M1_ORDER_IDS\);/.test(source)) problems.push("F013_M1_ALL_IDS is not exactly the proof id list");
  if (!/const F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001ff";/.test(source)) problems.push("proof marker changed");
  const dependents = /const F013_M1_ORDER_DEPENDENTS = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  const listed = [...dependents.matchAll(/"(\w+)"/g)].map((m) => m[1]!).sort();
  if (JSON.stringify(listed) !== JSON.stringify(tablesReferencingOrders())) problems.push(`dependent list ${listed.join(",")} != tables referencing orders ${tablesReferencingOrders().join(",")}`);
  return problems;
}

describe("T016 — Feature 013 fixtures are exact-identity only", () => {
  it("every fixed id is in the reserved 13000000- range and unique", () => {
    const ids = [...block.matchAll(/"(13000000-0000-4000-8000-[0-9a-f]{12})"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    const anyOtherUuid = block.match(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g)?.filter((u) => !u.startsWith('"13000000-'));
    expect(anyOtherUuid ?? []).toEqual([]);
  });

  it("every identity is a reserved example.com +f013-test address", () => {
    const emails = [...block.matchAll(/email: "([^"]+)"/g)].map((m) => m[1]!);
    expect(emails).toHaveLength(8);
    for (const email of emails) expect(email).toMatch(/^[a-z0-9-]+\+f013-test@example\.com$/);
  });

  it("uses no wildcard, pattern or range filter anywhere in the F013 block", () => {
    expect(block).not.toMatch(/\.(like|ilike|neq|gt|gte|lt|lte|not|or|match|textSearch)\(/);
  });

  it("cleanup never hard-deletes a business or financial row (operator de-privilege goes through the existing helper)", () => {
    // Generic rule, unchanged: the only code allowed to delete is the one named proof-fixture exception below.
    expect(cleanupWithoutException).not.toMatch(/\.delete\(/);
    expect(cleanup).toMatch(/cleanupDisposableOperatorFixture\(admin, operator\)/);
    for (const call of cleanup.matchAll(/\.update\([^)]*\)\.eq\("id", ([^)]+)\)/g)) {
      expect(call[1]).toMatch(/^(orgId|listing\.offer|F013_FIXTURE_IDS\.[A-Za-z0-9]+|F013_M1_ORDER_IDS\[key\])$/);
    }
  });

  it("the block has exactly two hard deletes, one inside each named proof-fixture exception", () => {
    expect((block.match(/\.delete\(/g) ?? []).length).toBe(2);
    expect((exceptionFn.match(/\.delete\(/g) ?? []).length).toBe(1);
    expect((t031ExceptionFn.match(/\.delete\(/g) ?? []).length).toBe(1);
  });

  it("the T031 proof-destination exception keeps every condition (exact ids, proof label, fixture orgs, unreferenced, refusal first)", () => {
    expect(t031ExceptionViolations(t031ExceptionFn, block)).toEqual([]);
  });

  it.each([
    ["delete without the proof label", (s: string) => s.replace('.eq("label", F013_T031_PROOF_LABEL);', ";")],
    ["delete of a different table", (s: string) => s.replace('admin.from("delivery_destinations").delete()', 'admin.from("orders").delete()')],
    ["delete by the raw id list", (s: string) => s.replace('.delete().in("id", ids)', '.delete().in("id", F013_T031_ALL_DESTINATION_IDS)')],
    ["no refusal before the delete", (s: string) => s.replace("if (problems.length > 0) throw new SafeFixtureError", "if (false) console.log")],
    ["order-reference check removed", (s: string) => s.replace("if ((count ?? 0) !== 0) problems.push", "if (false) problems.push")],
    ["label check removed", (s: string) => s.replace("row.label !== F013_T031_PROOF_LABEL", "false")],
    ["a second delete", (s: string) => s.replace("return ids.length;", 'await admin.from("delivery_destinations").delete().in("id", ids);\n  return ids.length;')],
  ])("the T031 exception check rejects: %s", (_label, mutate) => {
    expect(t031ExceptionViolations(mutate(t031ExceptionFn), block).length).toBeGreaterThan(0);
  });

  it("T031 setup writes the proof label on every destination and never touches orders", () => {
    const setup = functionText(block, "async function setupF013T031(");
    expect(setup).toContain("label: F013_T031_PROOF_LABEL,");
    expect(setup).not.toMatch(/from\("orders"\)/);
  });

  it("the proof-fixture exception keeps every owner-approved condition (exact ids, proof marker, fixture org, no dependent row, refusal first)", () => {
    expect(exceptionViolations(exceptionFn, block)).toEqual([]);
  });

  it("every proof order is stamped with the proof marker by the dedicated setup/probe commands", () => {
    const setup = functionText(block, "async function setupF013M1LiveOrders(");
    const probe = functionText(block, "async function probeF013M1Transitions(");
    expect(setup).toContain("correlation_id: F013_M1_PROOF_MARKER,");
    expect(probe).toContain("correlation_id: F013_M1_PROOF_MARKER });");
    expect((block.match(/admin\.from\("orders"\)\.insert\(/g) ?? []).length).toBe(2);
  });

  it.each([
    ["delete without the proof marker", (s: string) => s.replace('.eq("correlation_id", F013_M1_PROOF_MARKER);', ";")],
    ["delete of a different table", (s: string) => s.replace('admin.from("orders").delete()', 'admin.from("payments").delete()')],
    ["delete by the raw id list instead of the checked rows", (s: string) => s.replace('.delete().in("id", ids)', '.delete().in("id", F013_M1_ALL_IDS)')],
    ["no refusal before the delete", (s: string) => s.replace("if (problems.length > 0) throw new SafeFixtureError", "if (false) console.log")],
    ["dependent-row check removed", (s: string) => s.replace("if ((count ?? 0) !== 0) problems.push", "if (false) problems.push")],
    ["marker check removed", (s: string) => s.replace("order.correlation_id !== F013_M1_PROOF_MARKER", "false")],
    ["a second delete", (s: string) => s.replace("return ids.length;", 'await admin.from("orders").delete().in("id", ids);\n  return ids.length;')],
  ])("the exception check rejects: %s", (_label, mutate) => {
    expect(exceptionViolations(mutate(exceptionFn), block).length).toBeGreaterThan(0);
  });

  it.each([
    ["a dependent table dropped from the list", (s: string) => s.replace('"payouts", ', "")],
    ["a non-reserved proof id", (s: string) => s.replace('"13000000-0000-4000-8000-000000000101"', '"f0000000-0000-4000-8000-000000000101"')],
    ["a different marker", (s: string) => s.replace('F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001ff"', 'F013_M1_PROOF_MARKER = "13000000-0000-4000-8000-0000000001fe"')],
  ])("the exception check rejects a source change: %s", (_label, mutate) => {
    expect(exceptionViolations(exceptionFn, mutate(block)).length).toBeGreaterThan(0);
  });

  it("prepare is gated by an explicit per-run approval and the verified project ref", () => {
    expect(prepare.indexOf("assertF013Project()")).toBeGreaterThan(-1);
    expect(prepare.indexOf('F013_FIXTURES_APPROVED !== "1"')).toBeGreaterThan(prepare.indexOf("assertF013Project()"));
    expect(prepare.indexOf('F013_FIXTURES_APPROVED !== "1"')).toBeLessThan(prepare.indexOf("await upsert("));
    expect(block).toContain('const F013_PROJECT_REF = "mxejnutukgxyccnohglo"');
  });

  it("fake bank data is clearly labelled and never a plausible real account", () => {
    expect(block).toContain('account_name: "F013 FIXTURE — NOT FOR PAYMENT"');
    expect(block).toMatch(/iban: "AE0{10,}13"/);
  });

  it("tests/auth/fixture-session.ts mirrors the script's identities and ids exactly", () => {
    for (const member of Object.values(F013_FIXTURES.members)) {
      expect(block).toContain(`email: "${member.email}"`);
      expect(block).toContain(`"${member.organizationId}"`);
    }
    for (const operator of Object.values(F013_FIXTURES.operators)) {
      expect(block).toContain(`email: "${operator.email}"`);
      expect(block).toContain(`platformAdminRole: "${operator.role}"`);
    }
    for (const id of [...Object.values(F013_FIXTURES.offers), ...Object.values(F013_FIXTURES.warehouses), ...Object.values(F013_FIXTURES.config), F013_FIXTURES.hillsOrganizationId]) {
      expect(block).toContain(`"${id}"`);
    }
  });
});
