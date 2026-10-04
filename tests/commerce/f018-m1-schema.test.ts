import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, stripComments, stripDollarBodies } from "./migrations/sql-rules";
import { loadCheckSection, maintenancePath } from "../../scripts/f018-migration-checks";
import { M1_POSTFLIGHT_SPEC } from "../../scripts/f018-m1-postflight";
import { M1_PREFLIGHT_SPEC } from "../../scripts/f018-m1-preflight";

const root = process.cwd();
const M1 = "20261004100000_feature_018_featured_arabic_snapshots.sql";
const forward = readFileSync(path.join(root, "supabase", "migrations", M1), "utf8");
const rollback = readFileSync(path.join(root, "supabase", "rollback", M1.replace(/\.sql$/, ".rollback.sql")), "utf8");
const topLevel = (sql: string) => normalize(maskStrings(stripDollarBodies(stripComments(sql))));

describe("Feature 018 M1 migration contract (static)", () => {
  it("is a correctly named, ordered forward migration with paired rollback, preflight and postflight", () => {
    expect(M1).toMatch(/^[0-9]{14}_feature_018_[a-z0-9_]+\.sql$/);
    const all = readdirSync(path.join(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
    expect(all.indexOf(M1)).toBeGreaterThan(all.indexOf("20261003100000_feature_017_stripe_runtime_retirement.sql"));
    expect(existsSync(path.join(root, "supabase", "rollback", M1.replace(/\.sql$/, ".rollback.sql")))).toBe(true);
    expect(existsSync(maintenancePath(M1_PREFLIGHT_SPEC.file))).toBe(true);
    expect(existsSync(maintenancePath(M1_POSTFLIGHT_SPEC.file))).toBe(true);
    // Rollbacks never live in supabase/migrations: `db push` would apply them as forward migrations.
    expect(all.filter((name) => /rollback/i.test(name))).toEqual([]);
  });

  it("satisfies the repository migration conventions (single transaction, guard first, no unsafe grants)", () => {
    expect(conventionViolations(M1, forward)).toEqual([]);
    const body = topLevel(forward);
    expect(body).toMatch(/^begin;/);
    expect(body).toMatch(/commit;$/);
    expect(topLevel(rollback)).toMatch(/^begin;/);
    expect(topLevel(rollback)).toMatch(/commit;$/);
  });

  it("adds only nullable, default-free columns and never backfills or rewrites history", () => {
    const body = topLevel(forward);
    expect(body).toContain("alter table public.coffees add column if not exists featured_at timestamptz;");
    expect(body).toContain("add column if not exists product_name_ar_snapshot text");
    expect(body).toContain("add column if not exists origin_name_ar_snapshot text");
    expect(body).not.toMatch(/add column [^,;]*\bnot null\b/);
    expect(body).not.toMatch(/add column [^,;]*\bdefault\b/);
    for (const forbidden of [/\bupdate public\./, /\binsert into public\./, /\bdelete from public\./, /\btruncate\b/, /\bdrop (table|column|policy|trigger)\b/]) {
      expect(body).not.toMatch(forbidden);
    }
  });

  it("indexes Featured to match the public query and guards legacy rows from Arabic values", () => {
    const body = topLevel(forward);
    expect(body).toContain("create index if not exists idx_coffees_featured_published on public.coffees (featured_at desc, id desc) where status = '' and featured_at is not null;");
    expect(forward).toContain("where status = 'PUBLISHED' and featured_at is not null");
    expect(forward).toContain("check (seller_type_snapshot is not null or (product_name_ar_snapshot is null and origin_name_ar_snapshot is null))");
  });

  it("creates no grants, policies, triggers or public surface and leaves immutability to the existing trigger", () => {
    const body = topLevel(forward);
    expect(body).not.toMatch(/\b(grant|revoke|create policy|alter policy|create trigger|disable trigger|alter default privileges)\b/);
    expect(forward).toContain("trg_proforma_invoice_items_immutable");
    expect(forward).toContain("feature_018_m1_feature_017_not_retired");
  });

  it("rollback retains populated history and refuses while M3 still writes featured_at", () => {
    const body = topLevel(rollback);
    expect(rollback).toContain("feature_018_m1_rollback_requires_m3_rolled_back_first");
    expect(rollback).toContain("v_featured_rows = 0");
    expect(rollback).toContain("v_arabic_rows = 0 and not v_kernel_installed");
    expect(body).not.toMatch(/\bdrop table\b|\btruncate\b|\bdelete from\b|\bupdate public\./);
  });

  it("preflight and postflight are single read-only SELECT checks accepted by the read-only runner contract", () => {
    for (const spec of [M1_PREFLIGHT_SPEC, M1_POSTFLIGHT_SPEC]) {
      const section = loadCheckSection(`${spec.id}-${spec.phase}`, maintenancePath(spec.file));
      expect(section.sql).toMatch(/^select jsonb_build_object\('check'/);
      expect(section.sql).not.toContain(";");
    }
  });

  it("never edits a historical migration (all pre-Feature-018 files are byte-identical to HEAD)", () => {
    const status = spawnSync("git", ["status", "--porcelain", "--", "supabase/migrations"], { cwd: root, encoding: "utf8" });
    if (status.error || status.status !== 0) return; // git unavailable: nothing to compare against
    const changed = status.stdout.split(/\r?\n/).filter(Boolean)
      .map((line) => line.slice(3).replace(/^"|"$/g, "").replace(/^supabase\/migrations\//, ""))
      .filter((name) => !name.includes("feature_018"));
    expect(changed).toEqual([]);
  });
});

describe("Feature 018 migration conventions bite (mutation checks on synthetic SQL)", () => {
  it.each([
    ["missing guard", forward.replace(/do \$guard\$[\s\S]*?\$guard\$;/, "")],
    ["no commit", forward.replace(/commit;\s*$/, "")],
    ["anon grant", forward.replace("commit;", "grant select on table public.coffees to anon;\ncommit;")],
  ])("%s is reported", (_label, sql) => {
    expect(conventionViolations(M1, sql).length).toBeGreaterThan(0);
  });
});
