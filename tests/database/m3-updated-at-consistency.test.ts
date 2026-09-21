import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Database hygiene RUN M3 — STATIC / catalog review of
 * `supabase/migrations/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.sql`, its rollback and its postflight.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const M3_MIGRATION_FILE = "20260921140000_database_hygiene_m3_proforma_invoices_updated_at";
const migrationRaw = read("supabase", "migrations", `${M3_MIGRATION_FILE}.sql`);
const migration = strip(migrationRaw);
const rollback = strip(read("supabase", "rollback", `${M3_MIGRATION_FILE}.rollback.sql`));
const postflight = strip(read("supabase", "maintenance", "20260921_database_hygiene_m3_proforma_invoices_updated_at_postflight.sql"));

describe("Database hygiene M3 — proforma_invoices migration verification", () => {
  it("migration targets exactly proforma_invoices and no other table", () => {
    // Strip the DO block to examine top-level statements
    const outsideDo = migration.replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "");

    const alterMatches = [...outsideDo.matchAll(/alter\s+table\s+public\.(\w+)/gi)].map((m) => m[1]);
    expect([...new Set(alterMatches)]).toEqual(["proforma_invoices"]);

    const triggerMatches = [...outsideDo.matchAll(/create\s+trigger\s+(\w+)\s+before\s+update\s+on\s+public\.(\w+)\s+for\s+each\s+row\s+execute\s+function\s+public\.(\w+)\(\)/gi)];
    expect(triggerMatches).toHaveLength(1);
    const [, triggerName, tableName, functionName] = triggerMatches[0];
    expect(triggerName).toBe("trg_proforma_invoices_updated_at");
    expect(tableName).toBe("proforma_invoices");
    expect(functionName).toBe("set_updated_at");
  });

  it("uses generated always as (issued_at) stored then drop expression to avoid firing table updates", () => {
    expect(migration).toMatch(/alter\s+table\s+public\.proforma_invoices\s+add\s+column\s+updated_at\s+timestamptz\s+generated\s+always\s+as\s+\(issued_at\)\s+stored/i);
    expect(migration).toMatch(/alter\s+table\s+public\.proforma_invoices\s+alter\s+column\s+updated_at\s+drop\s+expression/i);
    expect(migration).toMatch(/alter\s+table\s+public\.proforma_invoices\s+alter\s+column\s+updated_at\s+set\s+default\s+now\(\),\s*alter\s+column\s+updated_at\s+set\s+not\s+null/i);
  });

  it("contains no forbidden statements (no grant/revoke, no policy changes, no enum changes, no new functions)", () => {
    const outsideDo = migration.replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "");
    expect(outsideDo).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    expect(outsideDo).not.toMatch(/\b(grant|revoke)\b/i);
    expect(outsideDo).not.toMatch(/\b(create|alter|drop)\s+type\b/i);
    expect(outsideDo).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/i);
    expect(outsideDo).not.toMatch(/\bwrite_audit_log/i);
  });

  it("rollback cleans up the trigger and column safely", () => {
    expect(rollback).toMatch(/drop\s+trigger\s+if\s+exists\s+trg_proforma_invoices_updated_at\s+on\s+public\.proforma_invoices/i);
    expect(rollback).toMatch(/alter\s+table\s+if\s+exists\s+public\.proforma_invoices\s+drop\s+column\s+if\s+exists\s+updated_at/i);
  });

  it("postflight checks table, column, trigger, no duplicates, no nulls, RLS, and untouched candidates", () => {
    expect(postflight).toMatch(/table proforma_invoices exists/i);
    expect(postflight).toMatch(/column updated_at: timestamptz NOT NULL DEFAULT now\(\)/i);
    expect(postflight).toMatch(/trigger trg_proforma_invoices_updated_at is active BEFORE UPDATE/i);
    expect(postflight).toMatch(/no duplicate set_updated_at trigger on proforma_invoices/i);
    expect(postflight).toMatch(/append-only tables untouched/i);
    expect(postflight).toMatch(/other M3 candidates untouched/i);
    expect(postflight).toMatch(/disputes updated_at intact/i);
  });
});
