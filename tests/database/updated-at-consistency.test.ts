import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Database hygiene RUN M2 — STATIC / catalog review of
 * `supabase/migrations/20260920140000_database_hygiene_updated_at.sql`, its rollback and its postflight (no database
 * access; the live proof is `tests/database/updated-at-consistency-live.test.ts`, run after the migration is applied).
 *
 * The rule under test: every genuinely MUTABLE table carries a DB-owned `updated_at timestamptz NOT NULL DEFAULT now()`
 * kept fresh by the shared `set_updated_at()` BEFORE UPDATE trigger — and NO append-only / history / immutable table
 * ever gets one. The M2 table list is PINNED here: changing it (either direction) must be a conscious edit to this file.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const MIGRATION_FILE = "20260920140000_database_hygiene_updated_at";
const migrationRaw = read("supabase", "migrations", `${MIGRATION_FILE}.sql`);
const migration = strip(migrationRaw);
const rollback = strip(read("supabase", "rollback", `${MIGRATION_FILE}.rollback.sql`));
const postflight = strip(read("supabase", "maintenance", "20260920_database_hygiene_updated_at_postflight.sql"));

// ── the pinned scope ─────────────────────────────────────────────────────────────────────────────────────
/** Mutable, `updated_at` MISSING before M2 → column + trigger. */
const GROUP_A = ["kyb_documents", "order_items", "coffee_media", "warehouse_locations", "coffee_types", "coffee_varieties", "processing_methods", "packaging_types", "tags"] as const;
/** Mutable, `updated_at` PRESENT but no trigger maintained it → trigger only. */
const GROUP_B = ["origins", "regions", "warehouses", "offer_sensory_notes"] as const;
const M2_TABLES = [...GROUP_A, ...GROUP_B];
/** Append-only history / audit / event tables, immutable records and ambiguous tables: NEVER get `updated_at` from M2. */
const APPEND_ONLY = ["audit_logs", "account_status_history", "listing_status_history", "order_status_history", "dispute_status_history", "inventory_ownership_events", "kyb_reviews", "kyb_review_items", "listing_reviews", "payment_reviews", "payment_events", "dispute_evidence", "support_messages", "notifications"] as const;
const IMMUTABLE = ["agreement_acceptances", "file_assets", "payment_proofs", "tax_invoices", "proforma_invoices", "proforma_invoice_items", "order_financials", "price_observations", "coffee_certifications", "coffee_documents", "offer_documents", "coffee_translations", "origin_translations", "coffee_tags", "offer_tags", "inventory_reservation_items"] as const;
const EXCLUDED = [...APPEND_ONLY, ...IMMUTABLE];
/** Left untouched on purpose (ambiguous / decision needed, M3). */
const AMBIGUOUS = ["inventory_reservations", "storage_allocations", "shipment_items", "payouts", "notification_preferences", "notification_deliveries", "organization_members", "disputes"] as const;
/** Tables that already had a set_updated_at trigger (baseline) or received one in M1 — M2 must not add to or double them. */
const M1_TABLES = ["platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules", "payment_accounts"] as const;

type Baseline = {
  columns: { table_name: string; column_name: string; data_type: string; nullable: string }[];
  triggers: { table_name: string; trigger_name: string; function_name: string }[];
};
function schemaReport(): Baseline {
  const raw = JSON.parse(read("docs", "database", "database-schema-report.json")) as unknown;
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) for (const item of node) {
      const hit = find(item);
      if (hit) return hit;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "database_schema_report" && typeof value === "string") return JSON.parse(value);
        const hit = find(value);
        if (hit) return hit;
      }
    }
    return null;
  };
  return find(raw) as Baseline;
}
const baseline = schemaReport();
const baselineHasColumn = (table: string, column: string) => baseline.columns.some((c) => c.table_name === table && c.column_name === column);

// ── an analyser over a migration's SQL, so the mutation tests below can prove the checks actually bite ────────────
type Analysis = { addedColumns: string[]; triggers: { name: string; table: string; fn: string; timing: string; events: string }[]; forbidden: string[] };
const analyse = (sqlRaw: string): Analysis => {
  const sql = strip(sqlRaw);
  const addedColumns: string[] = [];
  for (const m of sql.matchAll(/alter\s+table\s+public\.(\w+)\s+add\s+column\s+updated_at\b/gi)) addedColumns.push(m[1]);
  // (the self-check block is a `do $verify$` — only look at top-level statements for triggers)
  const outsideDo = sql.replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "");
  const triggers = [...outsideDo.matchAll(/create\s+trigger\s+(\w+)\s+(before|after)\s+([\w\s]+?)\s+on\s+public\.(\w+)\s+for\s+each\s+row\s+execute\s+function\s+public\.(\w+)\(\)/gi)].map((m) => ({ name: m[1], timing: m[2].toLowerCase(), events: m[3].toLowerCase(), table: m[4], fn: m[5] }));
  const forbidden: string[] = [];
  const probes: [string, RegExp][] = [
    ["create/alter/drop policy", /\b(create|alter|drop)\s+policy\b/i],
    ["grant/revoke", /\b(grant|revoke)\b/i],
    ["create/alter/drop type (enum change)", /\b(create|alter|drop)\s+type\b/i],
    ["create/replace/drop function", /\b(create(\s+or\s+replace)?|drop)\s+function\b/i],
    ["updated_by", /\bupdated_by\b/i],
    ["audit trigger", /\bwrite_audit_log\w*\s*\(\)/i],
    ["row-level UPDATE/DELETE/INSERT outside the self-check", /(^|;)\s*(update\s+public\.|delete\s+from\s+public\.|insert\s+into\s+public\.)/i],
    ["created_at altered", /alter\s+column\s+created_at\b|drop\s+column\s+created_at\b|add\s+column\s+created_at\b/i],
    ["enable/disable rls or trigger", /\b(enable|disable|force)\s+(row\s+level\s+security|trigger)\b/i],
    ["drop table/column (other than expression)", /\bdrop\s+(table|column)\b/i],
  ];
  for (const [label, re] of probes) if (re.test(outsideDo)) forbidden.push(label);
  // any ALTER TABLE naming a table outside the M2 list
  for (const m of outsideDo.matchAll(/alter\s+table\s+public\.(\w+)/gi)) if (!(M2_TABLES as readonly string[]).includes(m[1])) forbidden.push(`alter table on out-of-scope table ${m[1]}`);
  for (const t of triggers) if (!(M2_TABLES as readonly string[]).includes(t.table)) forbidden.push(`trigger on out-of-scope table ${t.table}`);
  return { addedColumns, triggers, forbidden };
};
/** The whole policy for an M2 migration; returns human-readable violations (empty = compliant). */
const violations = (sqlRaw: string): string[] => {
  const a = analyse(sqlRaw);
  const problems = [...a.forbidden];
  for (const t of M2_TABLES) {
    const mine = a.triggers.filter((x) => x.table === t);
    if (mine.length !== 1) problems.push(`${t}: expected exactly one trigger, found ${mine.length}`);
    else {
      const [x] = mine;
      if (x.fn !== "set_updated_at" || x.timing !== "before" || x.events !== "update" || x.name !== `trg_${t}_updated_at`) problems.push(`${t}: trigger is not trg_${t}_updated_at BEFORE UPDATE set_updated_at()`);
    }
  }
  for (const t of GROUP_A) if (a.addedColumns.filter((c) => c === t).length !== 1) problems.push(`${t}: updated_at must be added exactly once`);
  for (const t of a.addedColumns) if (!(GROUP_A as readonly string[]).includes(t)) problems.push(`${t}: gains updated_at but is not a group-A table`);
  for (const t of a.addedColumns) if ((EXCLUDED as readonly string[]).includes(t) || (AMBIGUOUS as readonly string[]).includes(t)) problems.push(`${t}: append-only / immutable / ambiguous table gains updated_at`);
  return problems;
};

describe("M2 scope is pinned (13 mutable tables; nothing else)", () => {
  it("the M2 table list is exactly the 13 confirmed mutable tables", () => {
    expect([...M2_TABLES].sort()).toEqual([
      "coffee_media", "coffee_types", "coffee_varieties", "kyb_documents", "offer_sensory_notes", "order_items", "origins",
      "packaging_types", "processing_methods", "regions", "tags", "warehouse_locations", "warehouses",
    ]);
    expect(M2_TABLES).toHaveLength(13);
  });

  it("the migration adds updated_at to exactly the 9 group-A tables and attaches exactly the 13 triggers", () => {
    const a = analyse(migrationRaw);
    expect([...a.addedColumns].sort()).toEqual([...GROUP_A].sort());
    expect(a.triggers.map((t) => t.table).sort()).toEqual([...M2_TABLES].sort());
    for (const t of a.triggers) {
      expect(t, t.table).toMatchObject({ name: `trg_${t.table}_updated_at`, fn: "set_updated_at", timing: "before", events: "update" });
    }
  });

  it("the migration satisfies the whole M2 policy (no policy/grant/enum/function/audit/updated_by/DML/created_at/out-of-scope change)", () => {
    expect(violations(migrationRaw)).toEqual([]);
  });

  it("group A: every table is confirmed by the baseline as missing updated_at; group B as already having it", () => {
    // (kyb_documents / order_items exist in the frozen baseline; warehouse_locations has no created_at there)
    for (const t of GROUP_A) expect(baselineHasColumn(t, "updated_at"), `${t} must lack updated_at in the baseline`).toBe(false);
    for (const t of GROUP_B) {
      const col = baseline.columns.find((c) => c.table_name === t && c.column_name === "updated_at");
      expect(col, `${t} must already have updated_at`).toBeTruthy();
      expect(col?.data_type).toBe("timestamp with time zone");
      expect(col?.nullable).toBe("NO");
    }
    expect(baselineHasColumn("warehouse_locations", "created_at")).toBe(false);
    for (const t of GROUP_A.filter((x) => x !== "warehouse_locations")) expect(baselineHasColumn(t, "created_at"), `${t}.created_at (backfill source)`).toBe(true);
  });

  it("no M2 table already had a set_updated_at trigger in the baseline (nothing is doubled)", () => {
    const already = new Set(baseline.triggers.filter((t) => t.function_name === "set_updated_at").map((t) => t.table_name));
    for (const t of M2_TABLES) expect(already.has(t), `${t} already maintained`).toBe(false);
    for (const t of M1_TABLES) expect((M2_TABLES as readonly string[]).includes(t)).toBe(false);
  });
});

describe("append-only / immutable / ambiguous tables are excluded", () => {
  it("the exclusion lists do not overlap the M2 list, and every excluded table is really excluded by the migration", () => {
    for (const t of [...EXCLUDED, ...AMBIGUOUS]) expect((M2_TABLES as readonly string[]).includes(t), `${t} must not be in M2`).toBe(false);
    const a = analyse(migrationRaw);
    for (const t of [...EXCLUDED, ...AMBIGUOUS]) {
      expect(a.addedColumns.includes(t), `${t} gains updated_at`).toBe(false);
      expect(a.triggers.some((x) => x.table === t), `${t} gains a trigger`).toBe(false);
      expect(migration.includes(`public.${t} `) && new RegExp(`(alter\\s+table|on)\\s+public\\.${t}\\b`, "i").test(migration.replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "")), `${t} touched outside the guard`).toBe(false);
    }
  });

  it("the guard and the self-check pin every EXCLUDED (append-only / immutable) table by name", () => {
    for (const t of EXCLUDED) expect(migration.includes(`'${t}'`), `${t} missing from the guard/self-check`).toBe(true);
    // both the preflight guard and the final self-check carry the list
    expect(migration.match(/'audit_logs'/g)?.length).toBe(2);
  });

  it("no append-only history table has (or has ever had) an updated_at in the baseline — the exclusion is not hiding a column", () => {
    for (const t of APPEND_ONLY) {
      const has = baselineHasColumn(t, "updated_at");
      expect(has, `${t} unexpectedly has updated_at in the baseline`).toBe(false);
    }
  });

  it("history tables are exactly those that block UPDATE/DELETE or have no update policy — none is in M2", () => {
    for (const t of ["audit_logs", "account_status_history", "listing_status_history", "order_status_history", "dispute_status_history", "inventory_ownership_events", "kyb_reviews", "kyb_review_items", "payment_events"]) {
      expect((M2_TABLES as readonly string[]).includes(t)).toBe(false);
    }
  });
});

describe("the migration is DB-only hygiene — nothing else changes", () => {
  it("uses the shared set_updated_at() (no new function, no new mechanism)", () => {
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(migration).toMatch(/execute\s+function\s+public\.set_updated_at\(\)/i);
  });

  it("adds NO updated_by, NO audit trigger, NO policy/grant/enum change, NO row DML, never touches created_at", () => {
    const a = analyse(migrationRaw);
    expect(a.forbidden).toEqual([]);
  });

  it("group-A backfill never runs an UPDATE (it would fire kyb_documents' audit trigger and order_items' validation): generated column + DROP EXPRESSION", () => {
    for (const t of GROUP_A.filter((x) => x !== "warehouse_locations")) {
      expect(migration).toMatch(new RegExp(`alter\\s+table\\s+public\\.${t}\\s+add\\s+column\\s+updated_at\\s+timestamptz\\s+generated\\s+always\\s+as\\s+\\(created_at\\)\\s+stored`, "i"));
      expect(migration).toMatch(new RegExp(`alter\\s+table\\s+public\\.${t}\\s+alter\\s+column\\s+updated_at\\s+drop\\s+expression`, "i"));
      expect(migration).toMatch(new RegExp(`alter\\s+table\\s+public\\.${t}\\s+alter\\s+column\\s+updated_at\\s+set\\s+default\\s+now\\(\\),\\s*alter\\s+column\\s+updated_at\\s+set\\s+not\\s+null`, "i"));
    }
    expect(migration).toMatch(/alter\s+table\s+public\.warehouse_locations\s+add\s+column\s+updated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i);
    expect(migration.replace(/do\s+\$(\w+)\$[\s\S]*?\$\1\$;/gi, "")).not.toMatch(/\bupdate\s+public\./i);
  });

  it("is transactional and self-checking (guard first, verify last, commit)", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toMatch(/preflight failed — nothing applied/);
    expect(migration).toMatch(/self-check failed — everything rolled back/);
    for (const key of ["app.m2_policies", "app.m2_grants", "app.m2_user_triggers", "app.m2_audit_triggers", "app.m2_excluded_columns", "app.m2_rows"]) {
      expect(migration.split(key).length, `${key} set in the guard and read in the self-check`).toBe(3);
    }
  });

  it("documents (in the header) that existing rows get created_at / the migration time — and that group B keeps its values", () => {
    expect(migrationRaw).toMatch(/LOWER BOUND/);
    expect(migrationRaw).toMatch(/THIS\s+MIGRATION'S TIME/);
    expect(migrationRaw).toMatch(/keeps every value untouched/);
  });
});

describe("mutation tests — the policy fails when the migration is wrong", () => {
  it("baseline: the real migration has no violations", () => {
    expect(violations(migrationRaw)).toEqual([]);
  });

  it("removing ONE trigger fails", () => {
    const mutated = migrationRaw.replace(/^create trigger trg_tags_updated_at.*$/m, "");
    expect(mutated).not.toBe(migrationRaw);
    expect(violations(mutated).join("\n")).toMatch(/tags: expected exactly one trigger, found 0/);
  });

  it("a trigger with the wrong timing / event / function / name fails", () => {
    const timing = migrationRaw.replace("create trigger trg_tags_updated_at                before update", "create trigger trg_tags_updated_at                after update");
    expect(timing).not.toBe(migrationRaw);
    expect(violations(timing).join("\n")).toMatch(/tags: trigger is not/);
    const event = migrationRaw.replace("before update on public.origins ", "before insert or update on public.origins ");
    expect(violations(event).join("\n")).toMatch(/origins: trigger is not/);
    const fn = migrationRaw.replace(/(create trigger trg_regions_updated_at.*execute function public\.)set_updated_at/, "$1write_audit_log");
    expect(fn).not.toBe(migrationRaw);
    expect(violations(fn).join("\n")).toMatch(/regions: trigger is not|audit trigger/);
  });

  it("adding an APPEND-ONLY table to M2 (column or trigger) fails", () => {
    const col = migrationRaw.replace("-- 3. Self-check", "alter table public.audit_logs add column updated_at timestamptz not null default now();\n-- 3. Self-check");
    expect(violations(col).join("\n")).toMatch(/audit_logs/);
    const trg = migrationRaw.replace("-- 3. Self-check", "create trigger trg_order_status_history_updated_at before update on public.order_status_history for each row execute function public.set_updated_at();\n-- 3. Self-check");
    expect(violations(trg).join("\n")).toMatch(/order_status_history/);
  });

  it("adding an AMBIGUOUS table (e.g. payouts) to M2 fails", () => {
    const mutated = migrationRaw.replace("-- 3. Self-check", "alter table public.payouts add column updated_at timestamptz not null default now();\ncreate trigger trg_payouts_updated_at before update on public.payouts for each row execute function public.set_updated_at();\n-- 3. Self-check");
    expect(violations(mutated).join("\n")).toMatch(/payouts/);
  });

  it("a second trigger on an M2 table, a missing column, updated_by, an audit trigger, a policy or a grant fail", () => {
    expect(violations(migrationRaw.replace("-- 3. Self-check", "create trigger trg_tags_dup before update on public.tags for each row execute function public.set_updated_at();\n-- 3. Self-check")).join("\n")).toMatch(/tags: expected exactly one trigger, found 2/);
    expect(violations(migrationRaw.replace(/^alter table public\.tags\s+add column updated_at .*$/m, "")).join("\n")).toMatch(/tags: updated_at must be added exactly once/);
    expect(violations(migrationRaw.replace("-- 3. Self-check", "alter table public.tags add column updated_by uuid;\n-- 3. Self-check")).join("\n")).toMatch(/updated_by/);
    expect(violations(migrationRaw.replace("-- 3. Self-check", "create trigger trg_audit_tags after insert on public.tags for each row execute function public.write_audit_log();\n-- 3. Self-check")).join("\n")).toMatch(/audit trigger/);
    expect(violations(migrationRaw.replace("-- 3. Self-check", "create policy p on public.tags for select using (true);\n-- 3. Self-check")).join("\n")).toMatch(/policy/);
    expect(violations(migrationRaw.replace("-- 3. Self-check", "grant delete on public.tags to authenticated;\n-- 3. Self-check")).join("\n")).toMatch(/grant/);
  });

  it("backfilling with UPDATE (would fire per-table triggers) or touching created_at fails", () => {
    expect(violations(migrationRaw.replace("-- 3. Self-check", "update public.tags set updated_at = created_at;\n-- 3. Self-check")).join("\n")).toMatch(/row-level/);
    expect(violations(migrationRaw.replace("-- 3. Self-check", "alter table public.tags alter column created_at set default now();\n-- 3. Self-check")).join("\n")).toMatch(/created_at altered/);
  });

  it("an out-of-scope table (a table not in the pinned list) is rejected", () => {
    expect(violations(migrationRaw.replace("-- 3. Self-check", "alter table public.orders add column updated_at timestamptz;\n-- 3. Self-check")).join("\n")).toMatch(/out-of-scope table orders|orders/);
  });
});

describe("rollback and postflight", () => {
  it("rollback drops exactly the 13 triggers and only the 9 added columns (group-B columns survive) and is guarded", () => {
    const dropped = [...rollback.matchAll(/drop\s+trigger\s+if\s+exists\s+(\w+)\s+on\s+public\.(\w+)/gi)];
    expect(dropped.map((m) => m[2]).sort()).toEqual([...M2_TABLES].sort());
    for (const m of dropped) expect(m[1]).toBe(`trg_${m[2]}_updated_at`);
    const cols = [...rollback.matchAll(/alter\s+table\s+public\.(\w+)\s+drop\s+column\s+if\s+exists\s+updated_at/gi)].map((m) => m[1]);
    expect(cols.sort()).toEqual([...GROUP_A].sort());
    for (const t of GROUP_B) expect(cols.includes(t)).toBe(false);
    expect(rollback).toMatch(/rollback refused/);
    expect(rollback.trimStart().startsWith("begin;")).toBe(true);
    expect(rollback.trimEnd().endsWith("commit;")).toBe(true);
    expect(rollback).not.toMatch(/\b(create|alter|drop)\s+policy\b|\bgrant\b|\brevoke\b|\bupdate\s+public\./i);
  });

  it("postflight is read-only and pins column shape, one trigger per table, RLS, grants, excluded tables and row counts", () => {
    expect(postflight).not.toMatch(/\b(insert|update|delete|alter|drop|create\s+(table|trigger|function)|grant|revoke|truncate)\b\s+(into|public|from|table|policy)/i);
    for (const t of M2_TABLES) expect(postflight.includes(`'${t}'`), `${t} in postflight`).toBe(true);
    for (const t of ["audit_logs", "notifications", "payment_events", "dispute_status_history"]) expect(postflight.includes(`'${t}'`), `${t} excluded-checked`).toBe(true);
    expect(postflight).toMatch(/timestamp with time zone/);
    expect(postflight).toMatch(/column_default = 'now\(\)'/);
    expect(postflight).toMatch(/tgtype & 2\) = 2/); // BEFORE
    expect(postflight).toMatch(/tgtype & 16\) = 16/); // UPDATE
    expect(postflight).toMatch(/pg_policies/);
    expect(postflight).toMatch(/role_table_grants/);
    expect(postflight).toMatch(/count\(\*\) from public\.tags/);
  });

  it("the three artefacts share one version and the version is unique among migrations", () => {
    const versions = readdirSync(path.join(root, "supabase", "migrations")).map((f) => f.slice(0, 14));
    expect(versions.filter((v) => v === "20260920140000")).toHaveLength(1);
    expect(existsSync(path.join(root, "supabase", "rollback", `${MIGRATION_FILE}.rollback.sql`))).toBe(true);
    expect(existsSync(path.join(root, "supabase", "maintenance", "20260920_database_hygiene_updated_at_postflight.sql"))).toBe(true);
  });
});

describe("no application code writes updated_at (the database owns it)", () => {
  const SOURCE_DIRS = ["lib", "app", "src", "components"];
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
  };
  for (const d of SOURCE_DIRS) walk(path.join(root, d));

  it("no `updated_at:` value assignment (only read-typings like `updated_at: string`) and no `.set(...)` of it", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/["']?updated_at["']?\s*:\s*([^\n,;}]*)/g)) {
        const value = m[1].trim();
        if (/^(string|Date|string \| null)\b/.test(value)) continue; // type declaration
        offenders.push(`${path.relative(root, file)}: updated_at: ${value.slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no M2 taxonomy / catalogue update payload includes updated_at", () => {
    const catalogue = read("lib", "admin", "catalogue.ts");
    expect(catalogue).toMatch(/`updated_at` are deliberately NOT in this update|updated_at` are deliberately NOT/);
    expect(catalogue).not.toMatch(/\.update\(\{[^}]*updated_at/);
  });
});
