/** Feature 018 M2 preflight (T020). Read-only: npx tsx scripts/f018-m2-preflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M2_PREFLIGHT_SPEC = { id: "m2", phase: "preflight", file: "20261004_feature_018_checkout_foundation_preflight" } as const;

export function runM2Preflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m2-preflight", maintenancePath(M2_PREFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M2 preflight");
  return results;
}

if (entryPointMatches("f018-m2-preflight")) {
  try { process.exitCode = runMigrationCheckCli(M2_PREFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M2 preflight failed");
    process.exitCode = 1;
  }
}
