/** Feature 018 M1 preflight (T013). Read-only: npx tsx scripts/f018-m1-preflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M1_PREFLIGHT_SPEC = { id: "m1", phase: "preflight", file: "20261004_feature_018_featured_arabic_snapshots_preflight" } as const;

export function runM1Preflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m1-preflight", maintenancePath(M1_PREFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M1 preflight");
  return results;
}

if (entryPointMatches("f018-m1-preflight")) {
  try { process.exitCode = runMigrationCheckCli(M1_PREFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M1 preflight failed");
    process.exitCode = 1;
  }
}
