/**
 * Feature 018 migration preflight/postflight runner (T013/T016, T020/T036, T039/T044).
 *
 * Each check file under supabase/maintenance is ONE read-only SELECT returning a JSON row per check. This module
 * loads it, validates it through the same read-only contract as the schema capture, and runs it either against the
 * local reference PostgreSQL or - only with the explicit read-only approval and pinned target - the approved remote.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  F018_APPROVAL_ENV, F018_LOCAL_DATABASE, assertF018Target, createLocalDockerRunner, createRemoteReadOnlyRunner, wrapReadOnly,
  type F018Section, type SectionRunner,
} from "./f018-capture-schema";

export interface CheckResult { check: string; ok: boolean; detail: string | null }

export class F018MigrationCheckError extends Error {
  constructor(message: string, readonly failures: CheckResult[] = []) { super(message); }
}

export const maintenancePath = (name: string, cwd = process.cwd()) => resolve(cwd, "supabase", "maintenance", `${name}.sql`);

/** Strips line comments and the trailing semicolon so the file is exactly one statement for the read-only wrapper. */
export function loadCheckSection(id: string, file: string): F018Section {
  const sql = readFileSync(file, "utf8").replace(/\r/g, "").split("\n").filter((line) => !/^\s*--/.test(line)).join("\n").trim().replace(/;\s*$/, "");
  const section: F018Section = { id, task: "migration-check", optional: false, sql };
  wrapReadOnly(section);
  return section;
}

export function runMigrationChecks(runner: SectionRunner, section: F018Section): CheckResult[] {
  const result = runner.run(section);
  if (!result.ok) throw new F018MigrationCheckError(`check_run_failed:${section.id}:${result.code}:${result.message}`);
  return result.rows.map((row) => ({ check: String(row.check), ok: row.ok === true, detail: row.detail == null ? null : String(row.detail) }));
}

export function assertChecksPass(results: CheckResult[], label: string): void {
  if (!results.length) throw new F018MigrationCheckError(`${label}: no checks returned`);
  const failures = results.filter((entry) => !entry.ok);
  if (failures.length) throw new F018MigrationCheckError(`${label}: ${failures.length} failed: ${failures.map((entry) => entry.check).join("; ")}`, failures);
}

export function formatChecks(results: CheckResult[]): string {
  return results.map((entry) => `${entry.ok ? "PASS" : "FAIL"}  ${entry.check}${entry.detail ? ` (${entry.detail})` : ""}`).join("\n");
}

export interface MigrationCheckSpec { id: string; phase: "preflight" | "postflight"; file: string }

/** Shared CLI: `--local [--database name]` (default) or `--remote` (approval + pinned target + read-only). */
export function runMigrationCheckCli(spec: MigrationCheckSpec, argv: string[]): number {
  const option = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const section = loadCheckSection(`${spec.id}-${spec.phase}`, maintenancePath(spec.file));
  let runner: SectionRunner;
  if (argv.includes("--remote")) {
    const target = assertF018Target(process.env);
    console.log(`F018 ${spec.id} ${spec.phase} REMOTE READ-ONLY: ${target.projectName} (${target.ref}); approval ${F018_APPROVAL_ENV}=1`);
    runner = createRemoteReadOnlyRunner(target);
  } else {
    runner = createLocalDockerRunner(option("--database") ?? F018_LOCAL_DATABASE);
  }
  const results = runMigrationChecks(runner, section);
  console.log(formatChecks(results));
  return results.every((entry) => entry.ok) ? 0 : 3;
}

export function entryPointMatches(scriptName: string): boolean {
  return Boolean(process.argv[1]) && new RegExp(`${scriptName}\\.ts$`).test(process.argv[1]!.replace(/\\/g, "/"));
}
