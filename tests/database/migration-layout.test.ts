import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration-history hygiene (2026-09-20 reconciliation). The Supabase CLI reads EVERY `*.sql` file
 * directly under `supabase/migrations/` whose name matches `^([0-9]+)_(.*)\.sql$` as a migration —
 * including `<version>_<name>.rollback.sql`, which it sees as a second migration with the SAME
 * version. That produced duplicate rows in `supabase migration list`, and a `db push` would have run a
 * rollback BEFORE its forward migration (it sorts first) and then failed on the duplicate version.
 * Rollback scripts therefore live in `supabase/rollback/` (same basenames), never in the CLI's folder.
 *
 * Pure static filesystem test — no database, no CLI, nothing written.
 */

const root = process.cwd();
const MIGRATIONS = path.join(root, "supabase", "migrations");
const ROLLBACK = path.join(root, "supabase", "rollback");

/** The CLI's own rule for what counts as a migration file (version = the leading digits). */
const CLI_MIGRATION_PATTERN = /^([0-9]+)_(.*)\.sql$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) walkFiles(abs, out);
    else out.push(path.relative(root, abs).replace(/\\/g, "/"));
  }
  return out;
}

describe("supabase/migrations holds forward migrations only, one file per version", () => {
  const files = readdirSync(MIGRATIONS);

  it("contains no *.rollback.sql anywhere under supabase/migrations/ (recursively)", () => {
    expect(walkFiles(MIGRATIONS).filter((file) => /\.rollback\.sql$/i.test(file))).toEqual([]);
  });

  it("every entry is a plain file the CLI reads as a migration named <14-digit version>_<snake_case>.sql (no subfolders, no drafts, no helpers)", () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) {
      expect(statSync(path.join(MIGRATIONS, file)).isFile(), `${file} must be a file`).toBe(true);
      expect(file, file).toMatch(/^[0-9]{14}_[a-z0-9_]+\.sql$/);
      expect(file, file).not.toMatch(/rollback|\.draft\.|preflight|postflight/i);
    }
  });

  it("every migration version is unique — the CLI's version extraction yields exactly one file per version", () => {
    const versions = files.flatMap((file) => {
      const match = CLI_MIGRATION_PATTERN.exec(file);
      return match ? [match[1]!] : [];
    });
    expect(versions).toHaveLength(files.length);
    const duplicates = versions.filter((version, index) => versions.indexOf(version) !== index);
    expect(duplicates).toEqual([]);
    expect([...versions].sort()).toEqual(versions);
  });
});

describe("supabase/rollback holds the paired rollback scripts", () => {
  it("exists, contains only <version>_<name>.rollback.sql files, and each has its forward migration", () => {
    expect(existsSync(ROLLBACK)).toBe(true);
    const rollbacks = readdirSync(ROLLBACK);
    expect(rollbacks.length).toBeGreaterThanOrEqual(9);
    const forward = new Set(readdirSync(MIGRATIONS));
    for (const file of rollbacks) {
      expect(file, file).toMatch(/^[0-9]{14}_[a-z0-9_]+\.rollback\.sql$/);
      expect(forward.has(file.replace(/\.rollback\.sql$/, ".sql")), `${file} has no forward migration`).toBe(true);
    }
  });

  it("the rollback folder is outside the CLI's migration folder (not a subfolder of it)", () => {
    expect(path.relative(MIGRATIONS, ROLLBACK).startsWith("..")).toBe(true);
  });
});

describe("Supabase CLI link metadata is never committed", () => {
  it("supabase/.temp/ is git-ignored", () => {
    const ignore = readFileSync(path.join(root, ".gitignore"), "utf8").split(/\r?\n/).map((line) => line.trim());
    expect(ignore).toContain("/supabase/.temp/");
  });
});
