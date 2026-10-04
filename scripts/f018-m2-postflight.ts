/** Feature 018 M2 postflight (T036). Read-only: npx tsx scripts/f018-m2-postflight.ts [--local --database name | --remote] */
import { assertChecksPass, entryPointMatches, loadCheckSection, maintenancePath, runMigrationCheckCli, runMigrationChecks, type CheckResult } from "./f018-migration-checks";
import type { SectionRunner } from "./f018-capture-schema";

export const M2_POSTFLIGHT_SPEC = { id: "m2", phase: "postflight", file: "20261004_feature_018_checkout_foundation_postflight" } as const;

export function runM2Postflight(runner: SectionRunner): CheckResult[] {
  const results = runMigrationChecks(runner, loadCheckSection("m2-postflight", maintenancePath(M2_POSTFLIGHT_SPEC.file)));
  assertChecksPass(results, "Feature 018 M2 postflight");
  return results;
}

/** After the M2 rollback only the retained fences and history protections must hold; the new entry points are gone. */
export const M2_RETAINED_AFTER_ROLLBACK: readonly string[] = [
  "tables exist with RLS enabled and forced",
  "receipts and permits grant no table privilege to any application role",
  "receipt uniqueness: request, source item, transaction order, transaction item and child request",
  "receipt foreign keys never cascade (history is retained)",
  "receipt rows are append-only (BEFORE UPDATE OR DELETE trigger enabled)",
  "permit cannot survive commit (deferred constraint trigger)",
  "zero durable permits",
  "request log carries a nullable object-typed bound_payload and no application-role privilege",
  "private helpers exist and have no application-role EXECUTE",
  "direct order_items INSERT is guarded by the canonical-cart trigger (BEFORE INSERT, enabled)",
  "public checkout is fenced: a DRAFT needs a permit and the private kernel does the work",
  "kernel requires staged locks, has no second reclamation scan and freezes Arabic snapshots",
  "historical quote signature retained as a delegating wrapper",
  "legacy issue_proforma and confirm_proforma fences retained",
  "Feature 017 provider functions still executable by no application role",
];

if (entryPointMatches("f018-m2-postflight")) {
  try { process.exitCode = runMigrationCheckCli(M2_POSTFLIGHT_SPEC, process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "M2 postflight failed");
    process.exitCode = 1;
  }
}
