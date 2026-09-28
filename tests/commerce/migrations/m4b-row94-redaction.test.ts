import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ROW94_APPLY_SHA256, ROW94_DRY_RUN_SHA256, ROW94_REDACTION_FILE, row94Variants, sha256, verifyRow94Pins,
} from "@/scripts/f013-row94-redaction-pins";

const text = readFileSync(ROW94_REDACTION_FILE, "utf8");
const runner = readFileSync("scripts/f013-m4b-row94-redaction.ts", "utf8");
const redact = text.slice(text.indexOf("do $redact$"), text.indexOf("$redact$;"));

describe("Feature 013 T081 row-94 LOCAL redaction (review B4)", () => {
  it("pins the reviewed file and its apply variant by SHA-256", () => {
    expect(sha256(text)).toBe(ROW94_DRY_RUN_SHA256);
    const { dryRun, apply } = verifyRow94Pins(text);
    expect(dryRun).toBe(text);
    expect(sha256(apply)).toBe(ROW94_APPLY_SHA256);
    // The apply variant differs from the dry run only in its terminal statement.
    expect(apply.replace(/\ncommit;(\s*)$/, "\nrollback;$1")).toBe(text);
  });

  it("refuses edited or ambiguous files", () => {
    expect(() => verifyRow94Pins(text.replace("c_audit_id constant bigint := 94;", "c_audit_id constant bigint := 95;"))).toThrow(/pinned SHA-256/);
    expect(() => row94Variants(`${text}\ncommit;\n`)).toThrow();
    expect(() => row94Variants(text.replace(/\nrollback;\s*$/, "\n"))).toThrow(/terminal ROLLBACK/);
    expect(() => row94Variants(text.replace(/\nrollback;\s*$/, "\nrollback;\nrollback;\n"))).toThrow(/terminal ROLLBACK/);
  });

  it("keeps the LOCAL-only, one-row, one-key scope", () => {
    expect(text).toContain("if to_regclass('f013_local.identity') is null then");
    expect(redact).toContain("c_audit_id constant bigint := 94;");
    expect(redact.match(/\bupdate public\.audit_logs\b/g)).toHaveLength(1);
    expect(redact).toContain("set new_data = new_data - 'destination_snapshot'\n  where id = c_audit_id and new_data ? 'destination_snapshot';");
    expect(redact).not.toMatch(/\bdelete from\b|\btruncate\b|\bupdate public\.orders\b/i);
    expect(redact.match(/\binsert into public\.audit_logs\b/g)).toHaveLength(1);
  });

  it("uses NULL-safe comparisons in every guard", () => {
    // Plain `<>` / `=` against a possibly-NULL value yields UNKNOWN, which an IF treats as false (guard silently passes).
    // Exception: `if not exists (… where … = …)` is fail-closed by construction (UNKNOWN filters the row out → raise).
    const orderCopy = "  if not exists (select 1 from public.orders o where o.id = c_order_id\n                 and o.destination_snapshot is not null\n                 and o.destination_snapshot = v_row.new_data -> 'destination_snapshot') then\n    raise exception 'f013_redaction_not_fixture_order_copy';";
    expect(redact).toContain(orderCopy);
    const guardLines = redact.replace(orderCopy, "").split("\n")
      .filter((line) => /^\s*(?:if|or|and)\b/.test(line) && !/'null'::jsonb|\?\|/.test(line));
    expect(guardLines.length).toBeGreaterThan(20);
    for (const line of guardLines) expect(line, line).not.toMatch(/<>|(?<![<>!])=(?!>)\s*(?:c_|v_|'|\()/);
    expect(redact).not.toMatch(/\bnot like\b/i);
    expect(redact).toContain("is distinct from 1 then");
    expect(redact).toContain("is distinct from 0 then");
  });

  it("runs only through the nonce-verified, hash-pinned LOCAL runner; apply needs operator approval and the apply hash", () => {
    expect(runner).toContain("requireF013LocalTarget();");
    expect(runner).toContain("verifyRow94Pins(readFileSync(ROW94_REDACTION_FILE");
    expect(runner).toContain('process.env.F013_T081_ROW94_APPLY_APPROVED !== "1"');
    expect(runner).toContain("process.env.F013_ROW94_APPLY_SHA256 !== ROW94_APPLY_SHA256");
    expect(runner.indexOf("row-94 apply refused")).toBeLessThan(runner.indexOf("requireF013LocalTarget();"));
    expect(runner).not.toMatch(/--linked|supabase db|createClient|SUPABASE_SERVICE_ROLE/);
    // Apply re-runs the dry run first and verifies the committed result.
    expect(runner.indexOf("const before = dryRun();")).toBeGreaterThan(-1);
    expect(runner.indexOf("const before = dryRun();")).toBeLessThan(runner.indexOf("psql(variants.apply)"));
    for (const label of ["committed: zero leaks remain", "committed: exactly one PII-free correction event for row 94",
      "committed: fixture order unchanged", "committed: every other audit row unchanged"]) expect(runner).toContain(label);
    // A rerun after apply stops at the pre-state check before any SQL executes.
    expect(runner).toContain('before.ROW94_KEY === "t" && before.LEAKS === "1" && before.EVENTS === "0"');
  });

  it("never prints payload values: psql failures are reduced to the ERROR line", () => {
    expect(runner).toMatch(/function psql\(sql: string\)[\s\S]*?catch \(error\)[\s\S]*?\/\\bERROR:\/\.test\(candidate\)/);
    // Only the local psql wrapper reaches the database; no raw runF013DockerPsqlStdin call outside it.
    expect(runner.match(/runF013DockerPsqlStdin\(/g)).toHaveLength(1);
    expect(runner).not.toMatch(/console\.(?:log|error)\([^)]*(?:stdout|stderr)\b/);
  });
});
