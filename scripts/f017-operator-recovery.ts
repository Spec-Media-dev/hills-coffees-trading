#!/usr/bin/env tsx
/**
 * Feature 017: Operator Database ACL Recovery Entry Point
 *
 * PURPOSE:
 * Standalone, operator-facing recovery script capable of restoring Feature 017's
 * retired database ACL state on the approved remote target `mxejnutukgxyccnohglo`.
 *
 * SAFETY INVARIANTS:
 * 1. Strict approval gate: Requires F016_REMOTE_LIVE_DB_APPROVED=1
 * 2. Pinned target identity: Exactly mxejnutukgxyccnohglo (hillscoffees-trading)
 * 3. Environment-only credentials (SUPABASE_DB_PASSWORD)
 * 4. Never prints secrets, passwords, or connection strings
 * 5. Uses proven Feature 016 TLS / SCRAM session path
 * 6. Inspects current migration and ACL state
 * 7. Reapplies forward migration if needed
 * 8. Runs Feature 017 postflight
 * 9. Proves all four functions are in retired state (denied to application roles)
 * 10. Returns exit code 0 on success, nonzero on any failure
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertF016LiveTarget, F016_TARGET_REF } from "./f016-live-target";
import type { LiveSession } from "../tests/finance/f016-live-session";
import {
  F017_MIGRATION_PATH,
  F017_POSTFLIGHT_PATH,
  inspectF017State,
  F017InspectionResult,
} from "../tests/finance/f017-retirement-core";

export interface OperatorRecoveryOptions {
  migrationPath?: string;
  postflightPath?: string;
  migrationSql?: string;
  postflightSql?: string;
  customSession?: LiveSession;
  logger?: (msg: string) => void;
}

export async function executeOperatorRecovery(options: OperatorRecoveryOptions = {}): Promise<F017InspectionResult> {
  const log = options.logger ?? console.log;
  const migrationPath = options.migrationPath ?? F017_MIGRATION_PATH;
  const postflightPath = options.postflightPath ?? F017_POSTFLIGHT_PATH;
  const migrationContent = options.migrationSql ?? readFileSync(migrationPath, "utf8");
  const postflightContent = options.postflightSql ?? readFileSync(postflightPath, "utf8");

  log("[F017-RECOVERY] Verifying remote target and approval gates...");
  const target = assertF016LiveTarget();
  if (target.ref !== F016_TARGET_REF) {
    throw new Error(`Target ref mismatch: expected '${F016_TARGET_REF}', got '${target.ref}'`);
  }
  log(`[F017-RECOVERY] Target confirmed: ${target.ref} (${target.projectName})`);

  let session: LiveSession | undefined = options.customSession;
  let ownsSession = false;
  if (!session) {
    // Delay loading the TLS/SCRAM runner until real recovery mode. This keeps
    // --help/--self-check standalone and network-free.
    const { openLiveSession } = await import("../tests/finance/f016-live-session");
    session = await openLiveSession();
    ownsSession = true;
  }

  try {
    const sqlRunner = async (sql: string) => {
      const rows = await session!.query(sql);
      return rows;
    };

    log("[F017-RECOVERY] Inspecting current Feature 017 ACL state...");
    const initialState = await inspectF017State(sqlRunner);

    if (initialState.status === "UNKNOWN") {
      log("[F017-RECOVERY] Current state is UNKNOWN / INSPECTION_FAILED. Proceeding to forward reapply...");
    } else if (initialState.isApplied) {
      log("[F017-RECOVERY] All 4 retired functions currently present with zero application grants.");
    } else {
      log(`[F017-RECOVERY] Feature 017 is DRIFTED. Unexpected grants: ${initialState.unexpectedGrants.join(", ")}`);
    }

    if (!initialState.isApplied) {
      log("[F017-RECOVERY] Reapplying Feature 017 forward migration...");
      await sqlRunner(migrationContent);
      log("[F017-RECOVERY] Forward migration applied successfully.");
    }

    log("[F017-RECOVERY] Running Feature 017 read-only postflight verification...");
    await sqlRunner(postflightContent);
    log("[F017-RECOVERY] Postflight passed.");

    log("[F017-RECOVERY] Proving final retired ACL state...");
    const finalState = await inspectF017State(sqlRunner);

    if (!finalState.isApplied || finalState.status !== "RETIRED") {
      throw new Error(
        `Final ACL state verification failed. Unexpected grants: ${finalState.unexpectedGrants.join(", ")}; Status: ${finalState.status}`
      );
    }

    log("[F017-RECOVERY] RECOVERY COMPLETED: All four retired functions confirmed in retired state.");
    return finalState;
  } finally {
    if (ownsSession && session) {
      session.close();
    }
  }
}

export function parseOperatorRecoveryArguments(args: string[]): "run" | "self-check" | "help" {
  if (args.length === 0) return "run";
  if (args.length === 1 && args[0] === "--self-check") return "self-check";
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return "help";
  throw new Error("usage: npx tsx scripts/f017-operator-recovery.ts [--self-check|--help]");
}

function printUsage(): void {
  console.log("Usage: npx tsx scripts/f017-operator-recovery.ts [--self-check|--help]");
}

// CLI execution entry point. --self-check proves standalone module loading and
// parsing without reading credentials, opening a socket, or mutating a target.
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  let mode: "run" | "self-check" | "help";
  try {
    mode = parseOperatorRecoveryArguments(process.argv.slice(2));
  } catch (error) {
    console.error("[F017-RECOVERY-FATAL]", error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (mode === "self-check") {
    console.log("F017 operator recovery self-check passed (no network connection opened).");
    process.exit(0);
  }
  if (mode === "help") {
    printUsage();
    process.exit(0);
  }
  executeOperatorRecovery()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[F017-RECOVERY-FATAL]", err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
