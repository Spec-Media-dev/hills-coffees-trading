import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Feature 010 T027 / T029 / DB-OPEN-21 — STATIC review of the M1 migration
 * `supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql`, its rollback and its
 * postflight (no database access; the live proof is `config-attribution-live.test.ts`, run after the
 * migration is applied). Everything here is about what the migration is ALLOWED to do:
 *
 *   - exactly the six configuration tables are touched (five gain `updated_at`; all six gain a
 *     `set_updated_at()` trigger and an audit trigger) and nothing else;
 *   - no RLS policy, grant, or existing function is created/altered/dropped;
 *   - `platform_admins` is audited by a sibling keyed on `user_id` (it has no `id` column, so the existing
 *     `write_audit_log()` would raise on every write);
 *   - `payment_accounts` is audited by a REDACTED, allow-listed payload — the full account number / IBAN
 *     can never reach `audit_logs`;
 *   - the app no longer writes `updated_at` (the database owns it).
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

const MIGRATION_FILE = "20260920120000_feature_010_db_open_21_config_attribution";
const migrationRaw = read("supabase", "migrations", `${MIGRATION_FILE}.sql`);
const migration = strip(migrationRaw);
const rollback = strip(read("supabase", "rollback", `${MIGRATION_FILE}.rollback.sql`));
const postflight = strip(read("supabase", "maintenance", "20260920_feature_010_db_open_21_postflight.sql"));

const SIX = ["platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules", "payment_accounts"] as const;
const FIVE = SIX.filter((table) => table !== "platform_admins");

function schemaReport(): {
  columns: { table_name: string; column_name: string; udt_name: string }[];
  functions: { function_name: string; definition: string }[];
  triggers: { table_name: string; function_name: string }[];
  rls_policies: { table_name: string }[];
} {
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
  return find(raw) as ReturnType<typeof schemaReport>;
}
const baseline = schemaReport();
const functionBody = (name: string) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const bodyStart = migration.indexOf("$function$", start);
  return migration.slice(bodyStart, migration.indexOf("$function$;", bodyStart + 10));
};

describe("why the migration is shaped this way (baseline schema facts, pinned)", () => {
  it("platform_admins has NO id column and write_audit_log() reads new.id / old.id — so the existing function cannot be attached to it", () => {
    const columns = baseline.columns.filter((column) => column.table_name === "platform_admins").map((column) => column.column_name);
    expect(columns).toEqual(expect.arrayContaining(["user_id", "role", "is_active", "created_by", "created_at", "updated_at"]));
    expect(columns).not.toContain("id");
    const audit = baseline.functions.find((fn) => fn.function_name === "write_audit_log")!.definition;
    expect(audit).toMatch(/new\.id/);
    expect(audit).toMatch(/to_jsonb\(\s*new\s*\)/);
  });

  it("the other five tables each have a uuid id (so the existing write_audit_log() is safe there); commission_tiers has no created_by at all", () => {
    for (const table of FIVE) {
      expect(baseline.columns.some((column) => column.table_name === table && column.column_name === "id" && column.udt_name === "uuid"), table).toBe(true);
    }
    expect(baseline.columns.some((column) => column.table_name === "commission_tiers" && column.column_name === "created_by")).toBe(false);
  });

  it("none of the six tables had a user trigger in the baseline, and only platform_admins already had updated_at", () => {
    for (const table of SIX) expect(baseline.triggers.filter((trigger) => trigger.table_name === table), table).toEqual([]);
    for (const table of FIVE) expect(baseline.columns.some((column) => column.table_name === table && column.column_name === "updated_at"), table).toBe(false);
    expect(baseline.columns.some((column) => column.table_name === "platform_admins" && column.column_name === "updated_at")).toBe(true);
  });

  it("set_updated_at() is the shared, existing DB-owned maintenance function (reused, not reinvented)", () => {
    expect(baseline.functions.find((fn) => fn.function_name === "set_updated_at")!.definition).toMatch(/new\.updated_at\s*=\s*now\(\)/);
  });
});

describe("scope — exactly the six configuration tables, nothing else", () => {
  it("alters only the five tables that lack updated_at, and only by adding that column (then its default/NOT NULL)", () => {
    const altered = [...migration.matchAll(/alter table public\.(\w+)/gi)].map((match) => match[1]);
    expect([...new Set(altered)].sort()).toEqual([...FIVE].sort());
    expect(migration.match(/add column updated_at timestamptz;/g)).toHaveLength(5);
    expect(migration.match(/alter column updated_at set default now\(\), alter column updated_at set not null;/g)).toHaveLength(5);
    expect(migration).not.toMatch(/\bdrop\s+(column|table|trigger|function|policy)\b/i);
    expect(migration).not.toMatch(/\b(create|alter)\s+table\b(?![^;]*\b(alter table|add column)\b)[^;]*\bcreate\b/i);
  });

  it("creates exactly twelve triggers — an updated_at and an audit trigger on each of the six tables — and no other trigger", () => {
    const created = [...migration.matchAll(/create trigger (\w+)\s+(before|after)\s+([a-z ]+?)\s+on public\.(\w+)\s+for each row execute function public\.(\w+)\(\)/gi)].map((match) => ({
      name: match[1], timing: match[2]!.toLowerCase(), events: match[3]!.toLowerCase(), table: match[4]!, fn: match[5],
    }));
    expect(created).toHaveLength(12);
    for (const table of SIX) {
      expect(created.find((trigger) => trigger.table === table && trigger.fn === "set_updated_at")).toMatchObject({ name: `trg_${table}_updated_at`, timing: "before", events: "update" });
      expect(created.find((trigger) => trigger.table === table && trigger.name === `trg_audit_${table}`)).toMatchObject({ timing: "after", events: "insert or update or delete" });
    }
    const auditFunction = (table: string) => created.find((trigger) => trigger.name === `trg_audit_${table}`)!.fn;
    for (const table of ["commission_policies", "commission_tiers", "tax_rules", "shipping_rules"]) expect(auditFunction(table), table).toBe("write_audit_log");
    expect(auditFunction("platform_admins")).toBe("write_audit_log_platform_admins");
    expect(auditFunction("payment_accounts")).toBe("write_audit_log_payment_accounts");
    expect(migration.match(/create trigger/gi)).toHaveLength(12);
  });

  it("creates only the two sibling audit functions (SECURITY DEFINER, pinned search_path) and never redefines write_audit_log() or set_updated_at()", () => {
    const created = [...migration.matchAll(/create or replace function public\.(\w+)\(/gi)].map((match) => match[1]);
    expect(created.sort()).toEqual(["write_audit_log_payment_accounts", "write_audit_log_platform_admins"]);
    for (const name of created) {
      const start = migration.indexOf(`create or replace function public.${name}(`);
      const header = migration.slice(start, migration.indexOf("$function$", start));
      expect(header, name).toMatch(/security definer/);
      expect(header, name).toMatch(/set search_path = pg_catalog, public, auth/);
      expect(migration, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\(\\) from public;`));
      expect(migration, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\(\\) from anon;`));
      expect(migration, name).toMatch(new RegExp(`revoke all on function public\\.${name}\\(\\) from authenticated;`));
    }
  });

  it("changes NO RLS policy, grant or role: no policy DDL, no grant, and the only revokes are on the two new trigger functions", () => {
    expect(migration).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    expect(migration).not.toMatch(/\benable\s+row\s+level\s+security\b|\bdisable\s+row\s+level\s+security\b|\bforce\s+row\s+level\s+security\b/i);
    expect(migration).not.toMatch(/\bgrant\b/i);
    const revokes = [...migration.matchAll(/revoke all on (\w+) ([\w.]+)\(\)/gi)].map((match) => `${match[1]} ${match[2]}`);
    expect(revokes).toHaveLength(6);
    expect(new Set(revokes)).toEqual(new Set(["function public.write_audit_log_platform_admins", "function public.write_audit_log_payment_accounts"]));
    expect(migration).not.toMatch(/\b(create|alter|drop)\s+role\b/i);
    // The ONLY ownership statements: pin the two NEW functions to `postgres`, and only when run by a member of it.
    const owners = [...migration.matchAll(/alter\s+(\w+)\s+([\w.()]+)\s+owner\s+to\s+(\w+)/gi)].map((match) => `${match[1]} ${match[2]} -> ${match[3]}`);
    expect(owners).toEqual(["function public.write_audit_log_platform_admins() -> postgres", "function public.write_audit_log_payment_accounts() -> postgres"]);
    expect(migration).toMatch(/if current_user <> 'postgres' and pg_has_role\(current_user, 'postgres', 'USAGE'\) then/);
  });

  it("modifies no data except the updated_at backfill of the five new columns, and does it BEFORE any trigger exists (so it writes no audit rows)", () => {
    const updates = [...migration.matchAll(/^\s*update\s+public\.(\w+)\s+set\s+(\w+)\s*=\s*([^;]+);/gim)];
    expect(updates.map((match) => `${match[1]}.${match[2]}`).sort()).toEqual(FIVE.map((table) => `${table}.updated_at`).sort());
    // Outside the two audit-function bodies there is no INSERT / DELETE / TRUNCATE at all; inside them the
    // ONLY write is one INSERT into audit_logs.
    const functionBodies = [...migration.matchAll(/\$function\$[\s\S]*?\$function\$;/g)].map((match) => match[0]);
    expect(functionBodies).toHaveLength(2);
    expect(migration.replace(/\$function\$[\s\S]*?\$function\$;/g, "")).not.toMatch(/\b(insert into|delete from|truncate)\b/i);
    for (const body of functionBodies) {
      expect([...body.matchAll(/\binsert\s+into\s+([\w.]+)/gi)].map((match) => match[1])).toEqual(["public.audit_logs"]);
      expect(body).not.toMatch(/\b(delete\s+from|truncate|update\s+public\.)/i);
    }
    const backfillEnd = Math.max(...updates.map((match) => match.index!));
    expect(backfillEnd).toBeLessThan(migration.indexOf("create trigger"));
    // created_at where the table has one; otherwise the migration time (documented as "tracking starts here").
    const from = (table: string) => updates.find((match) => match[1] === table)![3]!.trim();
    expect(from("commission_policies")).toBe("created_at");
    expect(from("payment_accounts")).toBe("created_at");
    for (const table of ["commission_tiers", "tax_rules", "shipping_rules"]) expect(from(table), table).toBe("now()");
    expect(migrationRaw).toMatch(/tracking starts here/);
  });

  it("begins with a preflight guard that runs before any DDL and refuses (raises) on drift", () => {
    expect(migration.indexOf("do $guard$")).toBeGreaterThan(-1);
    expect(migration.indexOf("do $guard$")).toBeLessThan(migration.indexOf("alter table"));
    expect(migration).toMatch(/raise exception 'feature_010_db_open_21 preflight failed — nothing applied: %'/);
    for (const table of SIX) expect(migration, table).toContain(`'${table}'`);
    expect(migration).toMatch(/rolbypassrls/);
    expect(migration).toMatch(/already has ' \|\| v_count \|\| ' user trigger/);
    expect(migration.trim().startsWith("begin;")).toBe(true);
    expect(migration.trim().endsWith("commit;")).toBe(true);
  });
});

describe("platform_admins sibling audit function — record identity is user_id, actor is auth.uid()", () => {
  const body = () => functionBody("write_audit_log_platform_admins");

  it("keys entity_id on user_id (never .id), records auth.uid() as the actor, tg_op as the action, old/new rows, and the correlation id like write_audit_log()", () => {
    expect(body()).toMatch(/case when tg_op = 'DELETE' then old\.user_id else new\.user_id end/);
    expect(body()).not.toMatch(/\b(new|old)\.id\b/);
    expect(body()).toMatch(/auth\.uid\(\)/);
    expect(body()).toMatch(/tg_table_name/);
    expect(body()).toMatch(/current_setting\('app\.correlation_id', true\)/);
    expect(body()).toMatch(/coalesce\(v_correlation_id, gen_random_uuid\(\)\)/);
    expect(body()).toMatch(/case when tg_op = 'INSERT' then null else to_jsonb\(old\) end/);
    expect(body()).toMatch(/case when tg_op = 'DELETE' then null else to_jsonb\(new\) end/);
    expect(body()).toMatch(/jsonb_build_object\('identity_column', 'user_id'\)/);
  });

  it("does not reshape platform_admins (no key/column change) — the table's primary key stays user_id", () => {
    expect(migration).not.toMatch(/alter table public\.platform_admins/i);
    expect(migration).not.toMatch(/\bprimary key\b/i);
  });
});

describe("payment_accounts sibling audit function — REDACTED, allow-listed payload", () => {
  const body = () => functionBody("write_audit_log_payment_accounts");
  const payloadKeys = (variable: "v_old" | "v_new") => {
    const start = body().indexOf(`${variable} := jsonb_build_object(`);
    const end = body().indexOf("\n    );", start);
    return [...body().slice(start, end).matchAll(/^\s*'(\w+)',/gm)].map((match) => match[1]);
  };

  it("never serialises the row: no to_jsonb(new|old) and no row_to_json anywhere in the function", () => {
    expect(body()).not.toMatch(/to_jsonb\s*\(\s*(new|old)/i);
    expect(body()).not.toMatch(/row_to_json|to_json\s*\(\s*(new|old)|hstore|\bnew\s*\.\*|\bold\s*\.\*/i);
    expect(migration).toMatch(/redacted_fields/);
  });

  it("builds each payload from an explicit allow-list, and account_number / iban appear ONLY inside the last4 masks and the change flags", () => {
    const expected = ["id", "account_name", "bank_name", "swift_code", "currency", "is_active", "created_by", "created_at", "updated_at", "account_number_last4", "iban_last4"];
    expect(payloadKeys("v_old")).toEqual(expected);
    expect(payloadKeys("v_new")).toEqual(expected);
    // Every mention of the sensitive columns is one of the three sanctioned forms.
    const mentions = [...body().matchAll(/\b(new|old)\.(account_number|iban)\b/g)].map((match) => body().slice(Math.max(0, match.index! - 40), match.index! + match[0].length + 22));
    expect(mentions.length).toBeGreaterThan(0);
    for (const mention of mentions) expect(mention, mention).toMatch(/(is null|char_length\(|right\(|is distinct from)/);
    expect(body()).not.toMatch(/'(account_number|iban)',\s*(new|old)\.(account_number|iban)/);
  });

  it("masks to the last four characters only (a value under eight characters is fully masked, NULL stays NULL) and flags a change without storing the value or a hash", () => {
    expect(body()).toMatch(/char_length\((old|new)\.account_number\)\s*<\s*8\s+then\s+'\*\*\*\*'\s+else\s+'\*\*\*\*'\s*\|\|\s*right\(\1\.account_number,\s*4\)/);
    expect(body()).toMatch(/char_length\((old|new)\.iban\)\s*<\s*8\s+then\s+'\*\*\*\*'\s+else\s+'\*\*\*\*'\s*\|\|\s*right\(\1\.iban,\s*4\)/);
    expect(body()).toMatch(/(old|new)\.account_number is null\s+then null/);
    expect(body()).toMatch(/'account_number_changed', new\.account_number is distinct from old\.account_number/);
    expect(body()).toMatch(/'iban_changed', new\.iban is distinct from old\.iban/);
    expect(body()).not.toMatch(/\b(md5|sha1|sha256|sha512|digest|hmac|crypt)\s*\(/i);
  });

  it("payment_accounts gets NO generic write_audit_log trigger (which would copy the raw row)", () => {
    expect(migration).not.toMatch(/create trigger trg_audit_payment_accounts[^;]*write_audit_log\(\)/i);
    expect(migration).toMatch(/create trigger trg_audit_payment_accounts\s+after insert or update or delete on public\.payment_accounts\s+for each row execute function public\.write_audit_log_payment_accounts\(\)/);
  });
});

describe("rollback and postflight", () => {
  it("the rollback (kept under supabase/rollback/, never in the CLI's folder) refuses unless the migrated shape exists, drops only what the migration added, and deletes no audit row", () => {
    expect(existsSync(path.join(root, "supabase", "migrations", `${MIGRATION_FILE}.rollback.sql`))).toBe(false);
    expect(rollback).toMatch(/raise exception 'feature_010_db_open_21 rollback refused/);
    expect(rollback.indexOf("do $guard$")).toBeLessThan(rollback.indexOf("drop trigger"));
    expect([...rollback.matchAll(/drop trigger if exists (\w+)/g)]).toHaveLength(12);
    expect([...rollback.matchAll(/drop function if exists public\.(\w+)\(\)/g)].map((match) => match[1]).sort()).toEqual(["write_audit_log_payment_accounts", "write_audit_log_platform_admins"]);
    expect([...rollback.matchAll(/alter table public\.(\w+)\s+drop column if exists updated_at/g)].map((match) => match[1]).sort()).toEqual([...FIVE].sort());
    expect(rollback).not.toMatch(/audit_logs|platform_admins\s+drop|\bdelete from\b|\btruncate\b|\bpolicy\b|\bgrant\b/i);
    expect(migrationRaw).toContain("supabase/rollback/20260920120000_feature_010_db_open_21_config_attribution.rollback.sql");
  });

  it("the postflight is read-only and covers columns, all twelve triggers, function safety/ownership, redaction, RLS, grants and the audit-trigger total", () => {
    const withoutLiterals = postflight.replace(/'(?:[^']|'')*'/g, "''");
    expect(withoutLiterals.trim().startsWith("with")).toBe(true);
    expect(withoutLiterals.match(/;/g)).toHaveLength(1);
    expect(withoutLiterals).not.toMatch(/\b(insert\s+into|update\s+public|delete\s+from|alter\s+(table|function|policy|trigger)|create\s+(table|function|trigger|policy|index)|drop\s+(table|function|trigger|policy|column)|grant\s|revoke\s|truncate\s)/i);
    for (const fragment of ["set_updated_at", "write_audit_log_platform_admins", "write_audit_log_payment_accounts", "prosecdef", "has_function_privilege", "account_number_last4", "to_jsonb", "role_table_grants", "audit_admin_read", "= 18"]) {
      expect(postflight, fragment).toContain(fragment);
    }
    expect(postflight.match(/union all/g)).toHaveLength(14);
  });
});

describe("application boundary — the database owns updated_at; no member route; no shadow log", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) return out;
    for (const entry of readdirSync(abs)) {
      const rel = `${dir}/${entry}`;
      if (statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(rel);
    }
    return out;
  };
  const stripTs = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("no console module writes updated_at any more (roles.ts used to); reads of the column stay", () => {
    for (const file of walk("lib/admin")) {
      const code = stripTs(read(...file.split("/")));
      expect(code, file).not.toMatch(/updated_at\s*:\s*(new Date|Date\.now|"|')/);
      expect(code, file).not.toMatch(/\.update\(\s*\{[^}]*updated_at/);
    }
    const roles = stripTs(read("lib", "admin", "roles.ts"));
    expect(roles).toContain('.update({ role: parsed.data.role })');
    expect(roles).toContain(".update({ is_active: parsed.data.isActive })");
  });

  it("no member-facing file (src/app/dashboard, components other than admin) references the configuration tables or their console libs", () => {
    const files = [...walk("src/app/dashboard"), ...walk("lib/dashboard"), ...walk("lib/orders"), ...walk("lib/listings")];
    expect(files.length).toBeGreaterThan(20);
    for (const file of files) {
      const code = stripTs(read(...file.split("/")));
      expect(code, file).not.toMatch(/platform_admins|payment_accounts|commission_policies|commission_tiers|tax_rules|shipping_rules|lib\/admin\/(roles|commission|pricing-rules|payment-accounts)/);
    }
  });

  it("no audit shadow table or client-side audit writer exists: nothing in lib/admin or src inserts into audit_logs", () => {
    for (const file of [...walk("lib/admin"), ...walk("src/app/dashboard-admin")]) {
      expect(stripTs(read(...file.split("/"))), file).not.toMatch(/from\(\s*["']audit_logs["']\s*\)\s*\.\s*(insert|upsert|update|delete)/);
    }
  });
});
