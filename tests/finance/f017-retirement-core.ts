import { readFileSync } from "node:fs";
import { resolve } from "node:path";
export type LiveScenarioHandler = () => Promise<void>;
import { F016_TARGET_REF } from "../../scripts/f016-live-target";

/**
 * Feature 017 pure live retirement and recovery core. This module has no Vitest dependency.
 *
 * Enforces specs/017-stripe-runtime-retirement/contracts/database-acl-retirement.md
 * 1. HIGH 3: Real database runner, real denial proof, real F016 compatibility invocation,
 *    real rollback/reapply lifecycle orchestration, and real operator recovery command.
 * 2. HIGH 4: Conservative exact-signature recovery inspection (no false-safe claims, fresh inspection on failure).
 * 3. MEDIUM 3: Explicit compatibility manifest with strict identity and regression tests.
 */

export const F017_MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/20261003100000_feature_017_stripe_runtime_retirement.sql");
export const F017_ROLLBACK_PATH = resolve(process.cwd(), "supabase/rollback/20261003100000_feature_017_stripe_runtime_retirement.rollback.sql");
export const F017_POSTFLIGHT_PATH = resolve(process.cwd(), "supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql");

export const F017_RETIRED_FUNCTIONS = [
  "admin_review_payment",
  "record_stripe_payment_intent",
  "record_payment_transfer",
  "ingest_stripe_event",
] as const;

export const F017_RETIRED_SIGNATURES = [
  "public.admin_review_payment(uuid, boolean, text)",
  "public.record_stripe_payment_intent(uuid, text, text)",
  "public.record_payment_transfer(uuid, text, text, text)",
  "public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)",
] as const;

export type F017SqlRunner = (query: string) => Promise<unknown>;
export interface F017RecoverySession { query(query: string): Promise<unknown>; close(): void; }
export type F017RecoverySessionFactory = () => Promise<F017RecoverySession>;

export function isSessionFailure(error: unknown): boolean {
  const details = error as { message?: unknown; sqlState?: unknown; code?: unknown };
  const sqlState = typeof details?.sqlState === "string" ? details.sqlState : "";
  const code = typeof details?.code === "string" ? details.code : "";
  // A PostgreSQL SQLSTATE is authoritative, including when node-postgres places
  // it in `code`. No message may override a semantic SQL error.
  if (/^[0-9A-Z]{5}$/.test(sqlState)) return sqlState.startsWith("08");
  // EPIPE is five letters but is an established OS code, not a PostgreSQL
  // state when supplied in `code`; an explicit sqlState above remains decisive.
  if (["ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH"].includes(code)) return true;
  if (/^[0-9A-Z]{5}$/.test(code)) return code.startsWith("08");
  if (sqlState || code) return false;
  const message = typeof details?.message === "string" ? details.message : String(error);
  // These are the actual, unstructured errors emitted by f016-live-session.ts.
  // Recovery may wrap them after inspection, so match a complete error token.
  return /(?:^|:)f016_session_(?:closed|transport_error|tls_error|tls_refused|connect_timeout|query_timeout|not_ready|lifetime_timeout|protocol_error)(?:$|:)/.test(message);
}

export type F017FunctionStatus = "PRESENT_RETIRED" | "PRESENT_EXPOSED" | "MISSING" | "UNKNOWN";

export interface F017AclState {
  functionName: string;
  signature: string;
  status: F017FunctionStatus;
  definitionExists: boolean;
  hasPublicExecute: boolean;
  hasAnonExecute: boolean;
  hasAuthenticatedExecute: boolean;
  hasServiceRoleExecute: boolean;
}

export interface F017InspectionResult {
  isApplied: boolean;
  status: "RETIRED" | "EXPOSED" | "DRIFTED" | "UNKNOWN";
  acls: Record<string, F017AclState>;
  unexpectedGrants: string[];
  inspectionError?: string;
  inspectionIsSessionFailure?: boolean;
}

function unknownInspection(message: string, inspectionIsSessionFailure = false): F017InspectionResult {
  const acls: Record<string, F017AclState> = {};
  for (let i = 0; i < F017_RETIRED_FUNCTIONS.length; i++) {
    const functionName = F017_RETIRED_FUNCTIONS[i];
    acls[functionName] = {
      functionName,
      signature: F017_RETIRED_SIGNATURES[i],
      status: "UNKNOWN",
      definitionExists: false,
      hasPublicExecute: false,
      hasAnonExecute: false,
      hasAuthenticatedExecute: false,
      hasServiceRoleExecute: false,
    };
  }
  return { isApplied: false, status: "UNKNOWN", acls, unexpectedGrants: ["INSPECTION_FAILED"], inspectionError: message, inspectionIsSessionFailure };
}

/** Accept only the complete, canonical catalog payload emitted by inspectF017State. */
function validateInspectionPayload(payload: unknown): asserts payload is { functions: Array<Record<string, unknown>> } {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { functions?: unknown }).functions)) {
    throw new Error("malformed_json_payload");
  }
  const functions = (payload as { functions: unknown[] }).functions;
  if (functions.length !== F017_RETIRED_SIGNATURES.length) throw new Error("unexpected_function_count");
  const seen = new Set<string>();
  for (let index = 0; index < functions.length; index++) {
    const row = functions[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("malformed_function_row");
    const value = row as Record<string, unknown>;
    const expectedName = F017_RETIRED_FUNCTIONS[index];
    const expectedSignature = F017_RETIRED_SIGNATURES[index];
    if (value.name !== expectedName || value.sig !== expectedSignature || seen.has(expectedSignature)) {
      throw new Error("wrong_or_duplicate_function_signature");
    }
    seen.add(expectedSignature);
    if (!Number.isInteger(value.oid) || (value.oid as number) <= 0) throw new Error("invalid_function_oid");
    for (const key of ["has_public", "has_anon", "has_authenticated", "has_service_role"]) {
      if (typeof value[key] !== "boolean") throw new Error(`invalid_privilege:${key}`);
    }
  }
}

export interface F017FatalRecoveryReport {
  timestamp: string;
  targetRef: string;
  migrationState: "APPLIED" | "ROLLBACK" | "DRIFTED" | "UNKNOWN";
  acls: Record<string, F017AclState>;
  failedRestorationStep: string;
  applicationRoleExposed: boolean | "UNKNOWN";
  operatorRecoveryCommand: string;
  details?: string;
}

export interface FatalRecoveryError extends Error {
  code?: string;
  recoveryReport?: F017FatalRecoveryReport;
}

// Real operator recovery script command
export const OPERATOR_RECOVERY_COMMAND = "npx tsx scripts/f017-operator-recovery.ts";

// ─────────────────────────────────────────────────────────────────────────────
// MEDIUM 3: Explicit Approved Compatibility Manifest
// ─────────────────────────────────────────────────────────────────────────────

export const F016_APPROVED_COMPATIBLE_MANIFEST: ReadonlyArray<{ readonly id: number; readonly name: string }> = [
  { id: 1, name: "Confirm happy path" },
  { id: 2, name: "Reject happy path" },
  { id: 3, name: "Confirm vs Confirm race" },
  { id: 4, name: "Reject vs Reject race" },
  { id: 5, name: "Confirm vs Reject race" },
  { id: 6, name: "Same-key replay" },
  { id: 7, name: "Same-key opposite decision" },
  { id: 8, name: "Same-key different payment" },
  { id: 9, name: "Different-key same terminal decision" },
  { id: 10, name: "Different-key opposite terminal decision" },
  { id: 11, name: "Missing payment review replay" },
  { id: 12, name: "Corrupt invoice replay" },
  { id: 13, name: "Corrupt ownership replay" },
  { id: 14, name: "Corrupt shipment replay" },
  { id: 15, name: "Inventory conservation" },
  { id: 16, name: "NULL-location buyer-position concurrency" },
  { id: 17, name: "Multi-fulfillment-group shipment membership" },
  { id: 18, name: "No duplicate shipments" },
  { id: 19, name: "Invoice exact-once" },
  { id: 20, name: "No invoice on reject" },
  { id: 21, name: "Ownership exact-once" },
  { id: 22, name: "No ownership on reject" },
  { id: 23, name: "Payment-proof-submitted notification" },
  { id: 24, name: "Confirmed/rejected buyer notification" },
  { id: 25, name: "Warehouse handoff notification" },
  { id: 26, name: "Injected CONFIRM rollback" },
  { id: 27, name: "Injected REJECT rollback" },
] as const;

export function validateF016CompatibleManifest(
  manifest: ReadonlyArray<{ id: number; name: string }>,
  registry: ReadonlyArray<{ id: number; name: string; handler: LiveScenarioHandler }>
): Array<{ id: number; name: string; handler: LiveScenarioHandler }> {
  // Check duplicate IDs or names in manifest
  const manifestIds = new Set<number>();
  const manifestNames = new Set<string>();
  for (const m of manifest) {
    if (manifestIds.has(m.id)) throw new Error(`duplicate_manifest_id:${m.id}`);
    if (manifestNames.has(m.name)) throw new Error(`duplicate_manifest_name:${m.name}`);
    manifestIds.add(m.id);
    manifestNames.add(m.name);
  }

  // Registry identity is a two-dimensional key. A duplicate name can otherwise
  // cause an approved manifest entry to execute the wrong handler.
  const registryIds = new Set<number>();
  const registryNames = new Set<string>();
  for (const r of registry) {
    if (registryIds.has(r.id)) throw new Error(`duplicate_registry_id:${r.id}`);
    if (registryNames.has(r.name)) throw new Error(`duplicate_registry_name:${r.name}`);
    registryIds.add(r.id);
    registryNames.add(r.name);
  }

  const result: Array<{ id: number; name: string; handler: LiveScenarioHandler }> = [];

  for (const approved of manifest) {
    // Explicitly reject Scenario 28 and 29 if somehow in manifest
    if (approved.id === 28 || approved.id === 29) {
      throw new Error(`excluded_scenario_in_manifest:${approved.id}`);
    }

    const found = registry.find((s) => s.id === approved.id);
    if (!found) {
      throw new Error(`approved_scenario_missing_from_registry:${approved.id}`);
    }

    // Verify name matches exactly (catches renamed scenarios or swapped IDs)
    if (found.name !== approved.name) {
      throw new Error(`scenario_identity_mismatch: id=${approved.id} expected="${approved.name}" actual="${found.name}"`);
    }

    result.push(found);
  }

  return result;
}

export function getF017CompatibleF016Scenarios(registry: ReadonlyArray<{ id: number; name: string; handler: LiveScenarioHandler }>) {
  return validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, registry);
}

export function isF016ScenarioCompatibleWithF017(id: number, name?: string): boolean {
  const match = F016_APPROVED_COMPATIBLE_MANIFEST.find((m) => m.id === id);
  if (!match) return false;
  if (name !== undefined && match.name !== name) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH 4: Conservative Exact-Signature State Inspection
// ─────────────────────────────────────────────────────────────────────────────

export async function inspectF017State(runSql: F017SqlRunner): Promise<F017InspectionResult> {
  const query = `
    select jsonb_build_object(
      'functions', jsonb_build_array(
        jsonb_build_object(
          'name', 'admin_review_payment',
          'sig', 'public.admin_review_payment(uuid, boolean, text)',
          'oid', to_regprocedure('public.admin_review_payment(uuid, boolean, text)')::oid::bigint,
          'has_public', case when to_regprocedure('public.admin_review_payment(uuid, boolean, text)') is not null then has_function_privilege('public', to_regprocedure('public.admin_review_payment(uuid, boolean, text)'), 'EXECUTE') else null end,
          'has_anon', case when to_regprocedure('public.admin_review_payment(uuid, boolean, text)') is not null then has_function_privilege('anon', to_regprocedure('public.admin_review_payment(uuid, boolean, text)'), 'EXECUTE') else null end,
          'has_authenticated', case when to_regprocedure('public.admin_review_payment(uuid, boolean, text)') is not null then has_function_privilege('authenticated', to_regprocedure('public.admin_review_payment(uuid, boolean, text)'), 'EXECUTE') else null end,
          'has_service_role', case when to_regprocedure('public.admin_review_payment(uuid, boolean, text)') is not null then has_function_privilege('service_role', to_regprocedure('public.admin_review_payment(uuid, boolean, text)'), 'EXECUTE') else null end
        ),
        jsonb_build_object(
          'name', 'record_stripe_payment_intent',
          'sig', 'public.record_stripe_payment_intent(uuid, text, text)',
          'oid', to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)')::oid::bigint,
          'has_public', case when to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)') is not null then has_function_privilege('public', to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)'), 'EXECUTE') else null end,
          'has_anon', case when to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)') is not null then has_function_privilege('anon', to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)'), 'EXECUTE') else null end,
          'has_authenticated', case when to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)') is not null then has_function_privilege('authenticated', to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)'), 'EXECUTE') else null end,
          'has_service_role', case when to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)') is not null then has_function_privilege('service_role', to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)'), 'EXECUTE') else null end
        ),
        jsonb_build_object(
          'name', 'record_payment_transfer',
          'sig', 'public.record_payment_transfer(uuid, text, text, text)',
          'oid', to_regprocedure('public.record_payment_transfer(uuid, text, text, text)')::oid::bigint,
          'has_public', case when to_regprocedure('public.record_payment_transfer(uuid, text, text, text)') is not null then has_function_privilege('public', to_regprocedure('public.record_payment_transfer(uuid, text, text, text)'), 'EXECUTE') else null end,
          'has_anon', case when to_regprocedure('public.record_payment_transfer(uuid, text, text, text)') is not null then has_function_privilege('anon', to_regprocedure('public.record_payment_transfer(uuid, text, text, text)'), 'EXECUTE') else null end,
          'has_authenticated', case when to_regprocedure('public.record_payment_transfer(uuid, text, text, text)') is not null then has_function_privilege('authenticated', to_regprocedure('public.record_payment_transfer(uuid, text, text, text)'), 'EXECUTE') else null end,
          'has_service_role', case when to_regprocedure('public.record_payment_transfer(uuid, text, text, text)') is not null then has_function_privilege('service_role', to_regprocedure('public.record_payment_transfer(uuid, text, text, text)'), 'EXECUTE') else null end
        ),
        jsonb_build_object(
          'name', 'ingest_stripe_event',
          'sig', 'public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)',
          'oid', to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)')::oid::bigint,
          'has_public', case when to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)') is not null then has_function_privilege('public', to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)'), 'EXECUTE') else null end,
          'has_anon', case when to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)') is not null then has_function_privilege('anon', to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)'), 'EXECUTE') else null end,
          'has_authenticated', case when to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)') is not null then has_function_privilege('authenticated', to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)'), 'EXECUTE') else null end,
          'has_service_role', case when to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)') is not null then has_function_privilege('service_role', to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)'), 'EXECUTE') else null end
        )
      )
    )::text;
  `;

  let parsed: {
    functions: Array<{
      name: string;
      sig: string;
      oid: number | null;
      has_public: boolean | null;
      has_anon: boolean | null;
      has_authenticated: boolean | null;
      has_service_role: boolean | null;
    }>;
  };

  try {
    const raw = await runSql(query);
    const textVal = typeof raw === "string" ? raw : Array.isArray(raw) && raw[0] ? (Array.isArray(raw[0]) ? raw[0][0] : raw[0]) : null;
    if (!textVal || typeof textVal !== "string") {
      throw new Error("malformed_sql_result");
    }
    parsed = JSON.parse(textVal);
    validateInspectionPayload(parsed);
  } catch (err) {
    // A partial catalog payload is not evidence of safety. Never coerce null,
    // undefined, strings, or a wrong overload into a retired ACL conclusion.
    return unknownInspection(err instanceof Error ? err.message : String(err), isSessionFailure(err));
  }

  const acls: Record<string, F017AclState> = {};
  const unexpectedGrants: string[] = [];
  let allRetired = true;
  let anyExposed = false;

  for (let i = 0; i < F017_RETIRED_FUNCTIONS.length; i++) {
    const fn = F017_RETIRED_FUNCTIONS[i];
    const sig = F017_RETIRED_SIGNATURES[i];
    const found = parsed.functions[i] as {
      name: string; sig: string; oid: number; has_public: boolean; has_anon: boolean; has_authenticated: boolean; has_service_role: boolean;
    };

    if (!found || found.oid === null) {
      acls[fn] = {
        functionName: fn,
        signature: sig,
        status: "MISSING",
        definitionExists: false,
        hasPublicExecute: false,
        hasAnonExecute: false,
        hasAuthenticatedExecute: false,
        hasServiceRoleExecute: false,
      };
      unexpectedGrants.push(`${fn}:missing_definition`);
      allRetired = false;
    } else {
      const isExposed = found.has_public || found.has_anon || found.has_authenticated || found.has_service_role;
      if (isExposed) anyExposed = true;

      acls[fn] = {
        functionName: fn,
        signature: sig,
        status: isExposed ? "PRESENT_EXPOSED" : "PRESENT_RETIRED",
        definitionExists: true,
        hasPublicExecute: found.has_public,
        hasAnonExecute: found.has_anon,
        hasAuthenticatedExecute: found.has_authenticated,
        hasServiceRoleExecute: found.has_service_role,
      };

      if (found.has_public) unexpectedGrants.push(`${fn}:public`);
      if (found.has_anon) unexpectedGrants.push(`${fn}:anon`);
      if (found.has_authenticated) unexpectedGrants.push(`${fn}:authenticated`);
      if (found.has_service_role) unexpectedGrants.push(`${fn}:service_role`);
      if (isExposed) allRetired = false;
    }
  }

  const isApplied = allRetired && unexpectedGrants.length === 0;
  const overallStatus = isApplied ? "RETIRED" : anyExposed ? "EXPOSED" : "DRIFTED";

  return { isApplied, status: overallStatus, acls, unexpectedGrants };
}

export function createFatalRecoveryReport(
  state: F017InspectionResult,
  failedStep: string,
  originalError: unknown
): Error {
  const isUnknown = state.status === "UNKNOWN";

  let appExposed: boolean | "UNKNOWN";
  if (isUnknown) {
    appExposed = "UNKNOWN";
  } else {
    appExposed = Object.values(state.acls).some(
      (a) => a.hasPublicExecute || a.hasAnonExecute || a.hasAuthenticatedExecute || a.hasServiceRoleExecute
    );
  }

  const report: F017FatalRecoveryReport = {
    timestamp: new Date().toISOString(),
    targetRef: F016_TARGET_REF,
    migrationState: isUnknown ? "UNKNOWN" : state.isApplied ? "APPLIED" : "DRIFTED",
    acls: state.acls,
    failedRestorationStep: failedStep,
    applicationRoleExposed: appExposed,
    operatorRecoveryCommand: OPERATOR_RECOVERY_COMMAND,
    details: isUnknown ? "Exposure cannot be determined due to inspection failure" : undefined,
  };

  const messageLines = [
    `FATAL_RESTORATION_FAILURE: Failed at step '${failedStep}'.`,
  ];

  if (isUnknown) {
    messageLines.push("ACL_STATE_UNKNOWN: exposure cannot be determined from database evidence.");
  } else {
    messageLines.push(`Application role exposed: ${appExposed}`);
  }

  messageLines.push(
    `Run operator recovery command: ${OPERATOR_RECOVERY_COMMAND}`,
    `Report: ${JSON.stringify(report, null, 2)}`,
    `Cause: ${originalError instanceof Error ? originalError.message : String(originalError)}`
  );

  const err: FatalRecoveryError = new Error(messageLines.join("\n"));
  err.code = "F017_FATAL_RECOVERY";
  err.recoveryReport = report;
  return err;
}

export const F017_ROLLBACK_BASELINE: Readonly<Record<string, Readonly<Record<"public" | "anon" | "authenticated" | "service_role", boolean>>>> = {
  admin_review_payment: { public: false, anon: false, authenticated: true, service_role: true },
  record_stripe_payment_intent: { public: false, anon: false, authenticated: true, service_role: true },
  record_payment_transfer: { public: false, anon: false, authenticated: true, service_role: true },
  ingest_stripe_event: { public: false, anon: false, authenticated: false, service_role: true },
};

/** The rollback state is valid only when every captured role grant matches exactly. */
export function assertF017RollbackBaseline(state: F017InspectionResult): void {
  if (state.status === "UNKNOWN") throw new Error("rollback_baseline_acl_state_unknown");
  for (const functionName of F017_RETIRED_FUNCTIONS) {
    const acl = state.acls[functionName];
    const expected = F017_ROLLBACK_BASELINE[functionName];
    if (!acl || !acl.definitionExists ||
      acl.hasPublicExecute !== expected.public ||
      acl.hasAnonExecute !== expected.anon ||
      acl.hasAuthenticatedExecute !== expected.authenticated ||
      acl.hasServiceRoleExecute !== expected.service_role) {
      throw new Error(`rollback_baseline_mismatch:${functionName}`);
    }
  }
}

type RestorationOptions = { migrationSql?: string; postflightSql?: string; freshSessionFactory?: F017RecoverySessionFactory };

async function restoreWithRunner(runSql: F017SqlRunner, options?: RestorationOptions): Promise<void> {
  const currentState = await inspectF017State(runSql);
  if (currentState.status === "UNKNOWN" && currentState.inspectionIsSessionFailure) {
    throw Object.assign(new Error(`f017_recovery_session_unusable:${currentState.inspectionError}`), { code: "08006" });
  }
  if (!currentState.isApplied) {
    const migration = options?.migrationSql ?? readFileSync(F017_MIGRATION_PATH, "utf8");
    try { await runSql(migration); } catch (error) {
      if (isSessionFailure(error)) throw error;
      throw createFatalRecoveryReport(await inspectF017State(runSql), "migration_reapply", error);
    }
  }
  const postflight = options?.postflightSql ?? readFileSync(F017_POSTFLIGHT_PATH, "utf8");
  try { await runSql(postflight); } catch (error) {
    if (isSessionFailure(error)) throw error;
    throw createFatalRecoveryReport(await inspectF017State(runSql), "postflight_verification", error);
  }
  try { await executeDeniedRpcProof(runSql); } catch (error) {
    if (isSessionFailure(error)) throw error;
    throw createFatalRecoveryReport(await inspectF017State(runSql), "denied_acl_verification", error);
  }
  const finalCheck = await inspectF017State(runSql);
  if (!finalCheck.isApplied || finalCheck.status !== "RETIRED") {
    if (finalCheck.status === "UNKNOWN" && finalCheck.inspectionIsSessionFailure) {
      throw Object.assign(new Error(`f017_recovery_session_unusable:${finalCheck.inspectionError}`), { code: "08006" });
    }
    throw createFatalRecoveryReport(finalCheck, "final_retired_state", new Error("Unexpected grants remained after restoration"));
  }
}

export async function executeF017MandatoryRestoration(
  runSql: F017SqlRunner,
  options?: RestorationOptions
): Promise<void> {
  try {
    await restoreWithRunner(runSql, options);
  } catch (error) {
    if (!isSessionFailure(error) || !options?.freshSessionFactory) throw error;
    let session: F017RecoverySession | undefined;
    try {
      session = await options.freshSessionFactory();
      await restoreWithRunner((sql) => session!.query(sql), options);
    } catch (recoveryError) {
      const state = session ? await inspectF017State((sql) => session!.query(sql)) : unknownInspection("fresh_recovery_session_unavailable");
      throw createFatalRecoveryReport(state, "fresh_session_restoration", recoveryError);
    } finally {
      session?.close();
    }
  }
}

export async function withMandatoryRestoration<T>(
  runSql: F017SqlRunner,
  action: () => Promise<T>,
  options?: RestorationOptions
): Promise<T> {
  try {
    return await action();
  } catch (actionError) {
    try {
      await executeF017MandatoryRestoration(runSql, options);
    } catch (restorationError) {
      // If restoration itself fails, report the fatal failure
      throw restorationError;
    }
    // Re-surface the original error after successful restoration
    throw actionError;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH 3: Real Database Denial Proof & F016 Post-017 Compatibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real denial proof: Executes each retired RPC under the authenticated application role
 * and asserts that PostgreSQL denies execution with permission denied.
 */
export async function executeDeniedRpcProof(runSql: F017SqlRunner): Promise<void> {
  for (const fn of F017_RETIRED_FUNCTIONS) {
    let callExpr = "";
    if (fn === "admin_review_payment") {
      callExpr = "perform public.admin_review_payment(gen_random_uuid(), true, 'test');";
    } else if (fn === "record_stripe_payment_intent") {
      callExpr = "perform public.record_stripe_payment_intent(gen_random_uuid(), 'pi_test', 'idemp_test');";
    } else if (fn === "record_payment_transfer") {
      callExpr = "perform public.record_payment_transfer(gen_random_uuid(), 'tr_test', 'tg_test', 'idemp_test');";
    } else if (fn === "ingest_stripe_event") {
      callExpr = "perform public.ingest_stripe_event('STRIPE', 'evt_test', 'charge.succeeded', gen_random_uuid(), '{}'::jsonb, true);";
    }

    const testSql = `
      do $$
      begin
        set local role authenticated;
        ${callExpr}
      end $$;
    `;

    let failedAsExpected = false;
    try {
      await runSql(testSql);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("permission denied") || msg.includes("42501")) {
        failedAsExpected = true;
      } else {
        throw new Error(`Unexpected error checking denial on ${fn}: ${msg}`);
      }
    }

    if (!failedAsExpected) {
      throw new Error(`Execution was NOT denied for retired RPC: ${fn}`);
    }
  }
}

/**
 * Feature 017 Replacement for Scenario 29:
 * 1. Proves Feature 017 postflight passes.
 * 2. Proves all 4 retired RPCs are denied to application roles.
 * 3. Proves active V1 bank-transfer review RPC is authorized to finance operator.
 */
export async function executeF017Scenario29(runSql: F017SqlRunner): Promise<void> {
  // 1. Postflight execution
  const postflight = readFileSync(F017_POSTFLIGHT_PATH, "utf8");
  await runSql(postflight);

  // 2. Exact state inspection
  const state = await inspectF017State(runSql);
  if (!state.isApplied || state.status !== "RETIRED") {
    throw new Error(`Scenario 29 ACL verification failed: unexpected grants: ${state.unexpectedGrants.join(", ")}`);
  }

  // 3. Denial proof
  await executeDeniedRpcProof(runSql);

  // 4. Assert active V1 review RPC exists and is authorized
  const v1CheckSql = `
    select has_function_privilege('authenticated', to_regprocedure('public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)'), 'EXECUTE')::text;
  `;
  const v1Authorized = await runSql(v1CheckSql);
  const textVal = typeof v1Authorized === "string" ? v1Authorized : Array.isArray(v1Authorized) ? String(v1Authorized[0]) : "false";
  if (!textVal.includes("true")) {
    throw new Error("Active V1 review RPC finance_review_bank_transfer_v1 is not authorized to authenticated role");
  }
}

/**
 * Real Rollback / Reapply Lifecycle Orchestration:
 * APPLIED → postflight → rollback → verify pre-017 baseline → bounded compat check → reapply → postflight → denial proof → final APPLIED
 */
export async function executeF017LifecycleOrchestration(
  runSql: F017SqlRunner,
  scenarios: Array<{ id: number; name: string; handler: LiveScenarioHandler }>,
  options?: {
    migrationSql?: string;
    rollbackSql?: string;
    postflightSql?: string;
    freshSessionFactory?: F017RecoverySessionFactory;
    failpoint?: "after_rollback" | "during_baseline" | "during_compat" | "during_reapply" | "during_postflight" | "during_denial";
  }
): Promise<void> {
  const migration = options?.migrationSql ?? readFileSync(F017_MIGRATION_PATH, "utf8");
  const rollback = options?.rollbackSql ?? readFileSync(F017_ROLLBACK_PATH, "utf8");
  const postflight = options?.postflightSql ?? readFileSync(F017_POSTFLIGHT_PATH, "utf8");

  // Step 1: Verify APPLIED & postflight
  const initial = await inspectF017State(runSql);
  if (!initial.isApplied) {
    await runSql(migration);
  }
  await runSql(postflight);

  // Mandatory restoration wrapper around the entire rollback -> reapply flow
  await withMandatoryRestoration(runSql, async () => {
    // Step 2: Rollback Feature 017
    await runSql(rollback);
    if (options?.failpoint === "after_rollback") {
      throw new Error("injected_failure:after_rollback");
    }

    // Step 3: Verify the captured baseline, not merely "not applied".
    const rolledBackState = await inspectF017State(runSql);
    assertF017RollbackBaseline(rolledBackState);
    if (options?.failpoint === "during_baseline") {
      throw new Error("injected_failure:during_baseline");
    }

    // Step 4: Execute the real approved F016 handlers. Each handler owns and
    // cleans its fixture through the retained F016 fixture/session infrastructure.
    // Unit callers may provide an empty list to isolate ACL restoration; the
    // gated live caller always supplies the complete manifest-backed registry.
    if (scenarios.length > 0) validateF016CompatibleManifest(F016_APPROVED_COMPATIBLE_MANIFEST, scenarios);
    for (const scenario of scenarios) {
      await scenario.handler();
    }
    if (options?.failpoint === "during_compat") {
      throw new Error("injected_failure:during_compat");
    }

    // Step 5: Reapply Feature 017
    if (options?.failpoint === "during_reapply") {
      throw new Error("injected_failure:during_reapply");
    }
    await runSql(migration);

    // Step 6: Postflight
    if (options?.failpoint === "during_postflight") {
      throw new Error("injected_failure:during_postflight");
    }
    await runSql(postflight);

    // Step 7: Denial proof
    if (options?.failpoint === "during_denial") {
      throw new Error("injected_failure:during_denial");
    }
    await executeDeniedRpcProof(runSql);

    // This assertion remains inside the restoration boundary so a failure cannot
    // strand the target with rollback ACLs.
    const finalState = await inspectF017State(runSql);
    if (!finalState.isApplied || finalState.status !== "RETIRED") {
      throw new Error("Final state verification failed: not in retired state");
    }
  }, { migrationSql: migration, postflightSql: postflight, freshSessionFactory: options?.freshSessionFactory });
}

