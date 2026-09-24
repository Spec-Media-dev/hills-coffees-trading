import { readFileSync } from "node:fs";

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
const script = readFileSync("scripts/seed-test-fixtures.ts", "utf8");
const block = script.slice(script.indexOf("// Feature 013 T016"), script.indexOf("async function main(): Promise<void> {"));
const cleanup = block.slice(block.indexOf("async function cleanupF013Fixtures"));
const prepare = block.slice(block.indexOf("async function prepareF013Fixtures"), block.indexOf("async function cleanupF013Fixtures"));

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
    expect(cleanup).not.toMatch(/\.delete\(/);
    expect(cleanup).toMatch(/cleanupDisposableOperatorFixture\(admin, operator\)/);
    for (const call of cleanup.matchAll(/\.update\([^)]*\)\.eq\("id", ([^)]+)\)/g)) {
      expect(call[1]).toMatch(/^(orgId|listing\.offer|F013_FIXTURE_IDS\.[A-Za-z0-9]+)$/);
    }
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
