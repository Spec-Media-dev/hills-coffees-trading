import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 013 T005 — the commerce preflight is strictly read-only.
 *
 * `supabase/maintenance/20260925_feature_013_preflight.sql` is run by an OPERATOR against production. It must
 * contain no data- or schema-changing statement, must run inside a READ ONLY transaction that ends in ROLLBACK,
 * and must never print a full bank identifier.
 */
const FILE = "supabase/maintenance/20260925_feature_013_preflight.sql";
const raw = readFileSync(FILE, "utf8");
const sql = raw
  .replace(/--[^\n]*/g, "")
  .replace(/'(?:[^']|'')*'/g, "''")
  .toLowerCase();

describe("T005 — Feature 013 preflight is read-only", () => {
  it("contains no DML or DDL statement outside comments and string literals", () => {
    for (const keyword of ["insert", "update", "delete", "merge", "alter", "create", "drop", "grant", "revoke", "truncate", "comment on", "vacuum", "copy", "call", "do"]) {
      expect(sql, keyword).not.toMatch(new RegExp(`(^|[;\\s(])${keyword.replace(" ", "\\s+")}\\b`));
    }
    expect(sql).not.toMatch(/\bset_config\s*\(/);
    expect(sql).not.toMatch(/\bnextval\s*\(/);
  });

  it("runs inside a READ ONLY transaction and ends in ROLLBACK", () => {
    expect(sql).toMatch(/^\s*begin;\s*set transaction read only;/);
    expect(sql.trim().endsWith("rollback;")).toBe(true);
    expect(sql).not.toMatch(/\bcommit\b/);
  });

  it("never selects a full bank identifier (account number / IBAN are masked to the last 4)", () => {
    const bankSection = raw.slice(raw.indexOf("-- 4."), raw.indexOf("-- 5."));
    const selectList = bankSection.slice(bankSection.indexOf("select"), bankSection.indexOf("from public.payment_accounts"));
    expect(selectList).not.toMatch(/^\s*(account_number|iban)\s*,?\s*$/m);
    expect(selectList).toMatch(/right\(account_number, 4\)/);
    expect(selectList).toMatch(/right\(iban, 4\)/);
  });

  it("captures what the Feature 013 migrations and gates depend on", () => {
    for (const needle of [
      "supabase_migrations.schema_migrations",
      "has_009_settlement_hook",
      "pg_get_functiondef",
      "pg_policies",
      "pg_extension",
      "drafts_with_shipment_plan",
      "payment_transfers",
      "trusted_funding_set",
    ]) {
      expect(raw, needle).toContain(needle);
    }
  });
});
