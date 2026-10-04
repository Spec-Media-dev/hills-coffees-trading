/** Feature 018 M1 postflight (T016). Read-only: npx tsx scripts/f018-m1-postflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M1_POSTFLIGHT_SPEC = { id: "m1", phase: "postflight", file: "20261004_feature_018_featured_arabic_snapshots_postflight" } as const;

export function runM1Postflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m1-postflight", maintenancePath(M1_POSTFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M1 postflight");
  return results;
}

if (entryPointMatches("f018-m1-postflight")) {
  try { process.exitCode = runMigrationCheckCli(M1_POSTFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M1 postflight failed");
    process.exitCode = 1;
  }
}
