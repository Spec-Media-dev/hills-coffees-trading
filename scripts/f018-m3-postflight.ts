/** Feature 018 M3 postflight (T044). Read-only: npx tsx scripts/f018-m3-postflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M3_POSTFLIGHT_SPEC = { id: "m3", phase: "postflight", file: "20261004_feature_018_admin_orchestration_postflight" } as const;

export function runM3Postflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m3-postflight", maintenancePath(M3_POSTFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M3 postflight");
  return results;
}

/** After the M3 rollback the routines are gone but revision counters, bump triggers and the readiness gate must remain. */
export const M3_RETAINED_AFTER_ROLLBACK: readonly string[] = [
  "revision counters are NOT NULL integers on Coffee and offer with positive checks",
  "revision and readiness triggers are bound and enabled",
  "publication readiness gate fires only on a transition into PUBLISHED (AFTER UPDATE OF status WHEN)",
  "private helpers exist with no application-role EXECUTE",
  "role policies are unchanged: Coffee writes Platform Admin, offer status Compliance, stock Warehouse",
  "Feature 017 provider functions still executable by no application role",
];

if (entryPointMatches("f018-m3-postflight")) {
  try { process.exitCode = runMigrationCheckCli(M3_POSTFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M3 postflight failed");
    process.exitCode = 1;
  }
}
