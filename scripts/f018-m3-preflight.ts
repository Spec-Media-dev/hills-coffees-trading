/** Feature 018 M3 preflight (T039). Read-only: npx tsx scripts/f018-m3-preflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M3_PREFLIGHT_SPEC = { id: "m3", phase: "preflight", file: "20261004_feature_018_admin_orchestration_preflight" } as const;

export function runM3Preflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m3-preflight", maintenancePath(M3_PREFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M3 preflight");
  return results;
}

if (entryPointMatches("f018-m3-preflight")) {
  try { process.exitCode = runMigrationCheckCli(M3_PREFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M3 preflight failed");
    process.exitCode = 1;
  }
}
