import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { assertF013BootstrapCapability, completeF013BootstrapNonce, f013BootstrapCli, F013_LOCAL_API_URL, F013_LOCAL_DB_URL, F013_LOCAL_PROJECT_ID, F013TargetError, requireF013BootstrapTarget, sanitizedF013Environment, type F013BootstrapTarget } from "./f013-local-target";
import { assertF013ApprovedHash, assertF013IdentitySqlNonIdempotent, assertF013PinnedRestoreFile, assertF013RenderedIdentity, discardF013RenderedIdentity, f013PinnedPath, renderF013IdentitySql, type F013PinnedFileKind, type F013RenderedIdentity } from "./f013-restore-pins";

export const F013_RESTORE_ORDER = [
  "pre-schema-acl", "restore-schema", "seed-baseline", "restore-auth-trigger", "apply-m4a",
  "m4a-postflight", "bootstrap-identity", "catalog-parity",
] as const;
export type F013RestoreStep = typeof F013_RESTORE_ORDER[number];
type JsonCommand = ReturnType<typeof f013BootstrapCli> & { transport: "supabase-json" };
type MutationKind = "pre-schema-acl" | "schema" | "baseline" | "auth-trigger" | "m4a" | "identity-rendered";
type MutationCommand = Readonly<{ transport: "docker-psql-stdin"; kind: MutationKind; path: string }>;
type Command = JsonCommand | MutationCommand;
export type F013RestorePlanStep = Readonly<{ id: F013RestoreStep; commands: readonly Command[]; requiresTrueResult?: boolean; finalizeNonceAfterDbVerify?: boolean; note?: string }>;

export function assertF013RestorePlanOrder(steps: readonly Pick<F013RestorePlanStep, "id">[]): void {
  if (steps.length !== F013_RESTORE_ORDER.length || steps.some((step, index) => step.id !== F013_RESTORE_ORDER[index])) {
    throw new F013TargetError("F013 restore step omitted or reordered.");
  }
}

export function assertF013M4aRolePreconditionResult(allowed: boolean): void {
  if (allowed !== true) throw new F013TargetError("Local database role does not satisfy M4a BYPASSRLS/superuser precondition.");
}

function sqlRows(output: string): Record<string, unknown>[] {
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch { throw new F013TargetError("F013 SQL check returned malformed JSON."); }
  if (!Array.isArray(parsed)) throw new F013TargetError("F013 SQL check must return a top-level JSON array.");
  if (!parsed.every((row) => row !== null && typeof row === "object" && !Array.isArray(row))) throw new F013TargetError("F013 SQL check returned an invalid row.");
  return parsed as Record<string, unknown>[];
}

function exactKeys(row: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key));
}

export function assertF013M4aRoleOutput(output: string): void {
  const rows = sqlRows(output);
  if (rows.length !== 1 || !exactKeys(rows[0]!, ["f013_role_status"]) || rows[0]!.f013_role_status !== "F013_ROLE_OK") throw new F013TargetError("M4a local role precondition failed.");
}

export function assertF013M4aPostflightOutput(output: string): void {
  const rows = sqlRows(output);
  if (rows.length !== 13) throw new F013TargetError("M4a postflight omitted checks or row 999.");
  const seen = new Set<number>();
  for (const row of rows) {
    const seq = row.seq;
    if (!exactKeys(row, ["seq", "check_name", "ok"]) || !Number.isInteger(seq) || typeof seq !== "number" || seen.has(seq) || !((seq >= 1 && seq <= 12) || seq === 999) || typeof row.check_name !== "string" || !row.check_name || row.ok !== true) throw new F013TargetError("M4a postflight has a failed, duplicate, or unexpected check.");
    if (seq === 999 && row.check_name !== "ALL CHECKS PASSED") throw new F013TargetError("M4a postflight row 999 did not pass.");
    seen.add(seq);
  }
  if (!Array.from({ length: 12 }, (_, index) => index + 1).every((seq) => seen.has(seq)) || !seen.has(999)) throw new F013TargetError("M4a postflight omitted checks or row 999.");
}

export function assertF013CatalogOutput(output: string): void {
  const rows = sqlRows(output);
  const columns = ["status", "commerce_settings_present", "platform_settings_present", "identity_present", "commerce_settings_safe", "platform_settings_singleton", "identity_singleton", "kyb_bucket_present", "public_assets_bucket_present", "listing_media_bucket_present", "auth_trigger_present"];
  if (rows.length !== 1 || !exactKeys(rows[0]!, columns) || rows[0]!.status !== "F013_CATALOG_OK" || columns.slice(1).some((column) => rows[0]![column] !== true)) throw new F013TargetError("F013 catalog parity checks failed.");
}

/** Builds a reviewed sequence only after every target and file pin passes. Never executes SQL. */
export function buildF013RestorePlan(target: F013BootstrapTarget, identity: F013RenderedIdentity, env: Record<string, string | undefined> = process.env): readonly F013RestorePlanStep[] {
  assertF013BootstrapCapability(target, env);
  const pinned: F013PinnedFileKind[] = ["pre-schema-acl", "schema", "baseline", "auth-trigger", "role-check", "m4a", "postflight", "catalog-check", "identity-template"];
  for (const kind of pinned) assertF013PinnedRestoreFile(kind, f013PinnedPath(kind), target.dbUrl);
  assertF013RenderedIdentity(identity, target);
  const check = (kind: "role-check" | "postflight" | "catalog-check"): JsonCommand => ({ ...f013BootstrapCli(target, { kind, path: f013PinnedPath(kind) }, env), transport: "supabase-json" });
  const mutation = (kind: Exclude<MutationKind, "identity-rendered">): MutationCommand => ({ transport: "docker-psql-stdin", kind, path: f013PinnedPath(kind) });
  const steps: F013RestorePlanStep[] = [
    { id: "pre-schema-acl", commands: [mutation("pre-schema-acl")], note: "Normalize only postgres default privileges in public before schema objects are created." },
    { id: "restore-schema", commands: [mutation("schema")] },
    { id: "seed-baseline", commands: [mutation("baseline")] },
    { id: "restore-auth-trigger", commands: [mutation("auth-trigger")] },
    { id: "apply-m4a", commands: [check("role-check"), mutation("m4a")], requiresTrueResult: true, note: "Run the read-only role check and require true before applying M4a." },
    { id: "m4a-postflight", commands: [check("postflight")] },
    { id: "bootstrap-identity", commands: [{ transport: "docker-psql-stdin", kind: "identity-rendered", path: identity.path }], finalizeNonceAfterDbVerify: true, note: "After catalog parity, verify the database nonce and atomically finalize the local identity file." },
    { id: "catalog-parity", commands: [check("catalog-check")], requiresTrueResult: true, note: "Compare the offline pinned artifacts and require all catalogue predicates true." },
  ];
  assertF013RestorePlanOrder(steps);
  return Object.freeze(steps.map((step) => Object.freeze({ ...step, commands: Object.freeze(step.commands) })));
}

export type F013RestoreDryRun = Readonly<{
  target: string;
  steps: readonly F013RestorePlanStep[];
  databaseIdentityUnverified: true;
  nonceIsPlaceholder: true;
  dispose: () => void;
}>;

function prepareF013Restore(dependencies: NonNullable<Parameters<typeof requireF013BootstrapTarget>[0]>, tempRoot?: string) {
  const target = requireF013BootstrapTarget(dependencies);
  const env = dependencies.env ?? process.env;
  const rendered = renderF013IdentitySql(target, env, tempRoot);
  try { return { target, rendered, steps: buildF013RestorePlan(target, rendered, env) }; }
  catch (error) { discardF013RenderedIdentity(rendered); throw error; }
}

/** Status/config and file/hash checks only. Database identity remains unverified; no SQL runs. */
export function dryRunF013LocalRestore(dependencies: Parameters<typeof requireF013BootstrapTarget>[0] = {}, tempRoot?: string): F013RestoreDryRun {
  const prepared = prepareF013Restore({ ...dependencies, inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }), generateNonce: () => "0".repeat(64) }, tempRoot);
  return Object.freeze({
    target: `${F013_LOCAL_PROJECT_ID} ${F013_LOCAL_API_URL} ${F013_LOCAL_DB_URL}`,
    steps: prepared.steps,
    databaseIdentityUnverified: true,
    nonceIsPlaceholder: true,
    dispose: () => discardF013RenderedIdentity(prepared.rendered),
  });
}

type RestoreDependencies = NonNullable<Parameters<typeof requireF013BootstrapTarget>[0]> & {
  runJsonCheck?: (command: JsonCommand) => string;
  runMutation?: (command: MutationCommand, bytes: Buffer, cleanEnv: NodeJS.ProcessEnv) => void;
  finalizeNonce?: (target: F013BootstrapTarget) => void;
};

/** Future execution entry point. Unit tests replace all process and database transports. */
export function executeF013LocalRestore(dependencies: RestoreDependencies = {}): void {
  const env = dependencies.env ?? process.env;
  if (env.F013_LOCAL_RESTORE_APPROVED !== "1") throw new F013TargetError("F013 local restore requires separate F013_LOCAL_RESTORE_APPROVED=1.");
  const prepared = prepareF013Restore(dependencies);
  const run = (command: Command): string => {
    if (env.F013_LOCAL_RESTORE_APPROVED !== "1") throw new F013TargetError("F013 local restore requires separate F013_LOCAL_RESTORE_APPROVED=1 immediately before SQL execution.");
    if (command.transport === "docker-psql-stdin") {
      if (command.kind === "identity-rendered") assertF013RenderedIdentity(prepared.rendered, prepared.target);
      else assertF013PinnedRestoreFile(command.kind, command.path, prepared.target.dbUrl);
      const bytes = readFileSync(command.path);
      if (command.kind === "identity-rendered") assertF013IdentitySqlNonIdempotent(bytes.toString("utf8"));
      else assertF013ApprovedHash(command.kind, bytes);
      if (dependencies.runMutation) dependencies.runMutation(command, bytes, sanitizedF013Environment(env));
      else runF013DockerPsqlStdin(bytes, env.F013_DOCKER_PATH, sanitizedF013Environment(env));
      return "";
    }
    const output = (dependencies.runJsonCheck ?? ((check: JsonCommand) => execFileSync(check.command, check.args, {
      cwd: check.cwd, env: check.env, encoding: "utf8", shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"], timeout: 180_000,
    })))(command);
    if (/\b(?:ERROR|FATAL):/i.test(output)) throw new F013TargetError("F013 local SQL command reported an error.");
    return output;
  };
  try {
    console.log(`F013 LOCAL RESTORE target: ${F013_LOCAL_PROJECT_ID} ${F013_LOCAL_API_URL} ${F013_LOCAL_DB_URL}`);
    for (const step of prepared.steps) {
      for (const command of step.commands) {
        if (command.transport === "supabase-json") {
          const kind = step.id === "apply-m4a" ? "role-check" : step.id === "m4a-postflight" ? "postflight" : "catalog-check";
          assertF013PinnedRestoreFile(kind, f013PinnedPath(kind), prepared.target.dbUrl);
        }
        const output = run(command);
        if (step.id === "apply-m4a" && command.transport === "supabase-json") assertF013M4aRoleOutput(output);
        if (step.id === "m4a-postflight") assertF013M4aPostflightOutput(output);
        if (step.id === "catalog-parity") assertF013CatalogOutput(output);
      }
    }
    // Finalize only after catalog parity passes and the DB nonce matches.
    (dependencies.finalizeNonce ?? ((target) => completeF013BootstrapNonce(target, dependencies)))(prepared.target);
  } finally { discardF013RenderedIdentity(prepared.rendered); }
}
