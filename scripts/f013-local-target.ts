import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, linkSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import { assertF013PinnedRestoreFile, assertF013RenderedIdentity, type F013PinnedFileKind, type F013RenderedIdentity } from "./f013-restore-pins";
import { runtimeF013IdentityProbe } from "./f013-docker-identity";

export const F013_PRODUCTION_REF = "mxejnutukgxyccnohglo";
export const F013_LOCAL_PROJECT_ID = "hills-f013-local";
export const F013_LOCAL_API_URL = "http://127.0.0.1:55421";
export const F013_LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
export const F013_LOCAL_READ_ONLY_DB_URL = "postgresql://postgres:postgres@127.0.0.1:55422/postgres?sslmode=disable";

export const F013_LOCAL_WRITE_FLAGS = new Set([
  "--prepare-f013-provenance", "--prepare-f013-fixtures", "--cleanup-f013-fixtures",
  "--deactivate-f013-fixture-entities", "--reactivate-f013-fixture-entities",
  "--f013-m1-live-setup", "--f013-m1-live-probe", "--f013-m1-live-cleanup",
  "--f013-t031-setup", "--f013-t031-cleanup",
  "--prepare-f013-t071-run",
  "--prepare-f013-t071-snapshot-order",
]);
export const F013_READ_ONLY_FLAGS = new Set([
  "--inspect-f013-fixtures", "--inspect-f013-provenance", "--validate-f013-provenance",
  "--f013-m1-schema-probe", "--f013-m1-live-verify", "--f013-t031-verify",
  "--inspect-f013-t071-state",
]);

type Environment = Record<string, string | undefined>;
export type F013Mode = { kind: "production-default" } | { kind: "local" };
export type F013LocalTarget = {
  kind: "local";
  projectId: typeof F013_LOCAL_PROJECT_ID;
  workdir: string;
  apiUrl: typeof F013_LOCAL_API_URL;
  dbUrl: typeof F013_LOCAL_DB_URL;
  anonKey: string;
  serviceRoleKey: string;
  fixturePassword: string;
  nonce: string;
};
export type F013BootstrapTarget = {
  kind: "bootstrap";
  projectId: typeof F013_LOCAL_PROJECT_ID;
  workdir: string;
  apiUrl: typeof F013_LOCAL_API_URL;
  dbUrl: typeof F013_LOCAL_DB_URL;
  nonce: string;
};
export class F013TargetError extends Error {}
const VERIFIED_LOCAL_TARGETS = new WeakSet<object>();
const VERIFIED_BOOTSTRAP_TARGETS = new WeakSet<object>();

const RETIRED = ["F013_TARGET_REF", "F013_ISOLATED_TEST_APPROVED", "F013_ISOLATED_ENV_FILE"];
const LOCAL_MODE_VARIABLES = ["F013_TARGET", "F013_LOCAL_APPROVED", "F013_LOCAL_BOOTSTRAP_APPROVED", "F013_LOCAL_RESTORE_APPROVED", "F013_DOCKER_PATH", "F013_T071_LIVE"];
const INHERITED_DATABASE = /^(?:(?:NEXT_PUBLIC_)?SUPABASE_|PG|POSTGRES|DATABASE_URL)/i;

export function resolveF013Mode(env: Environment = process.env): F013Mode {
  if (RETIRED.some((name) => env[name] !== undefined)) throw new F013TargetError("hosted isolated mode retired");
  if (LOCAL_MODE_VARIABLES.every((name) => env[name] === undefined)) return { kind: "production-default" };
  if (env.F013_TARGET !== "local") throw new F013TargetError("F013_TARGET must be exactly local.");
  if (env.F013_LOCAL_APPROVED !== "1") throw new F013TargetError("F013_LOCAL_APPROVED must be exactly 1.");
  return { kind: "local" };
}

export function sanitizedF013Environment(parent: Environment = process.env): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const name of ["PATH", "Path", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"]) {
    if (parent[name] !== undefined) child[name] = parent[name];
  }
  return child;
}

function assertNoInheritedDatabaseCredentials(env: Environment): void {
  const inherited = Object.keys(env).find((name) => INHERITED_DATABASE.test(name));
  if (inherited) throw new F013TargetError(`F013 local mode refuses inherited ${inherited}.`);
  if (env.TEST_FIXTURE_PASSWORD !== undefined) throw new F013TargetError("F013 local mode refuses inherited TEST_FIXTURE_PASSWORD.");
}

function configEntries(config: string): Map<string, string> {
  const entries = new Map<string, string>();
  let section = "";
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const header = /^\[([\w.]+)\]$/.exec(line);
    if (header) { section = header[1]!; continue; }
    const pair = /^([\w]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) throw new F013TargetError("Malformed F013 local config.");
    const key = `${section}.${pair[1]}`;
    if (entries.has(key)) throw new F013TargetError(`Duplicate F013 local config key ${key}.`);
    entries.set(key, pair[2]!.replace(/^"|"$/g, ""));
  }
  return entries;
}

function assertLocalConfig(config: string): void {
  const entries = configEntries(config);
  const required: Record<string, string> = {
    ".project_id": F013_LOCAL_PROJECT_ID,
    "api.port": "55421", "db.port": "55422", "db.shadow_port": "55420", "db.major_version": "17",
    "studio.port": "55423", "inbucket.port": "55424", "inbucket.smtp_port": "55425", "inbucket.pop3_port": "55426",
    "db.pooler.enabled": "false", "analytics.enabled": "false", "edge_runtime.enabled": "false",
  };
  for (const [key, expected] of Object.entries(required)) {
    if (entries.get(key) !== expected) throw new F013TargetError(`F013 local config mismatch: ${key}.`);
  }
}

function assertLocalJwt(key: string): void {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)) return;
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(Buffer.from(key.split(".")[1]!, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { throw new F013TargetError("Malformed local JWT key."); }
  if (claims.iss !== "supabase-demo") throw new F013TargetError("Local JWT issuer is not supabase-demo.");
  if (["ref", "project_ref", "project_id"].some((name) => typeof claims[name] === "string" && /^[a-z0-9]{20}$/.test(claims[name]))) {
    throw new F013TargetError("Local JWT carries a hosted project ref claim.");
  }
}

type LocalDependencies = {
  env?: Environment;
  cwd?: string;
  readFile?: (path: string) => string;
  exists?: (path: string) => boolean;
  status?: (workdir: string, env: NodeJS.ProcessEnv) => unknown;
  verifyNonce?: (dbUrl: string, expected: string, env: NodeJS.ProcessEnv) => string;
  log?: (message: string) => void;
};

type BootstrapDependencies = LocalDependencies & {
  inspectIdentity?: (dbUrl: string, env: NodeJS.ProcessEnv) => { schemaExists: boolean; identityRowExists: boolean };
  generateNonce?: () => string;
};

type BootstrapFinishDependencies = BootstrapDependencies & {
  readDatabaseNonce?: (dbUrl: string, env: NodeJS.ProcessEnv) => string;
  fileOps?: {
    writeExclusive: (path: string, contents: string) => void;
    linkExclusive: (source: string, destination: string) => void;
    remove: (path: string) => void;
  };
};

function realStatus(workdir: string, env: NodeJS.ProcessEnv): unknown {
  return JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json", "--workdir", "tools/f013-local"], {
    cwd: resolve(workdir, "..", ".."), env, encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000,
  })) as unknown;
}

/**
 * Read-only whole-outbox count for a nonce-verified local target (T071 retained-provenance validation). Uses the same
 * pinned docker.exe and fixed container identity as the nonce probe; never accepts SQL from the caller.
 */
export function f013LocalNotificationEventCount(target: F013LocalTarget, env: Environment = process.env): number {
  if (!VERIFIED_LOCAL_TARGETS.has(target) || target.dbUrl !== F013_LOCAL_DB_URL) throw new F013TargetError("Verified F013 local target is required.");
  const raw = runtimeF013IdentityProbe("notificationCount", env.F013_DOCKER_PATH, sanitizedF013Environment(env));
  if (!/^\d+$/.test(raw)) throw new F013TargetError("F013 local notification count probe returned an unknown result.");
  return Number(raw);
}

/** Runtime Docker identity probe using the pinned operator-verified docker.exe SHA-256 and path. */
function queryLocalIdentity(dbUrl: string, probe: "absence" | "nonce", sourceEnv: Environment, cleanEnv: NodeJS.ProcessEnv): string {
  if (dbUrl !== F013_LOCAL_DB_URL) throw new F013TargetError("F013 identity probe requires the fixed local DB URL.");
  return runtimeF013IdentityProbe(probe, sourceEnv.F013_DOCKER_PATH, cleanEnv);
}

type LocalBase = {
  env: Environment;
  workdir: string;
  read: (path: string) => string;
  exists: (path: string) => boolean;
  cleanEnv: NodeJS.ProcessEnv;
  anonKey: string;
  serviceRoleKey: string;
};

function resolveLocalBase(dependencies: LocalDependencies): LocalBase {
  const env = dependencies.env ?? process.env;
  if (resolveF013Mode(env).kind !== "local") throw new F013TargetError("F013 local target is required.");
  assertNoInheritedDatabaseCredentials(env);
  const workdir = resolve(dependencies.cwd ?? process.cwd(), "tools", "f013-local");
  const read = dependencies.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const exists = dependencies.exists ?? existsSync;
  const supabase = join(workdir, "supabase");
  try { assertLocalConfig(read(join(supabase, "config.toml"))); }
  catch (error) { if (error instanceof F013TargetError) throw error; throw new F013TargetError("F013 local workdir config unavailable."); }
  for (const forbidden of [join(supabase, ".temp", "project-ref"), join(supabase, "migrations"), join(supabase, "functions")]) {
    if (exists(forbidden)) throw new F013TargetError(`F013 local workdir contains forbidden path: ${forbidden}.`);
  }
  const cleanEnv = sanitizedF013Environment(env);
  let status: Record<string, unknown>;
  try { status = (dependencies.status ?? realStatus)(workdir, cleanEnv) as Record<string, unknown>; }
  catch { throw new F013TargetError("F013 local stack/status unavailable."); }
  if (!status || status.API_URL !== F013_LOCAL_API_URL || status.DB_URL !== F013_LOCAL_DB_URL) {
    throw new F013TargetError("F013 local stack endpoints do not match the fixed loopback target.");
  }
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  if (typeof anonKey !== "string" || !anonKey || typeof serviceRoleKey !== "string" || !serviceRoleKey) {
    throw new F013TargetError("F013 local status omitted required keys.");
  }
  assertLocalJwt(anonKey);
  assertLocalJwt(serviceRoleKey);
  return { env, workdir, read, exists, cleanEnv, anonKey, serviceRoleKey };
}

/** Fail closed before fixture clients or proof children. Only status and identity probes may run here. */
export function requireF013LocalTarget(dependencies: LocalDependencies = {}): F013LocalTarget {
  const { env, workdir, read, cleanEnv, anonKey, serviceRoleKey } = resolveLocalBase(dependencies);
  let nonce: string;
  try { nonce = read(join(workdir, ".f013-local-identity")).trim(); }
  catch { throw new F013TargetError("F013 local identity nonce file is unavailable."); }
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new F013TargetError("F013 local identity nonce is invalid.");
  let databaseNonce: string;
  try { databaseNonce = (dependencies.verifyNonce ?? ((dbUrl, _expected, probeEnv) => queryLocalIdentity(dbUrl, "nonce", env, probeEnv)))(F013_LOCAL_DB_URL, nonce, cleanEnv); }
  catch (error) { if (error instanceof F013TargetError) throw error; throw new F013TargetError("F013 local database identity could not be verified."); }
  if (databaseNonce !== nonce) throw new F013TargetError("F013 local database identity nonce mismatch.");
  const fixturePassword = `f013-local-${createHash("sha256").update(`${nonce}:${anonKey}`).digest("hex").slice(0, 32)}`;
  (dependencies.log ?? console.log)(`F013 LOCAL target: ${F013_LOCAL_PROJECT_ID} (${F013_LOCAL_API_URL}; DB 127.0.0.1:55422)`);
  const target: F013LocalTarget = { kind: "local", projectId: F013_LOCAL_PROJECT_ID, workdir, apiUrl: F013_LOCAL_API_URL, dbUrl: F013_LOCAL_DB_URL, anonKey, serviceRoleKey, fixturePassword, nonce };
  Object.freeze(target);
  VERIFIED_LOCAL_TARGETS.add(target);
  return target;
}

/** Separate one-time bootstrap capability. It never qualifies as a normal nonce-verified target. */
export function requireF013BootstrapTarget(dependencies: BootstrapDependencies = {}): F013BootstrapTarget {
  const env = dependencies.env ?? process.env;
  if (resolveF013Mode(env).kind !== "local") throw new F013TargetError("F013 bootstrap requires verified local mode.");
  if (env.F013_LOCAL_BOOTSTRAP_APPROVED !== "1") throw new F013TargetError("F013 bootstrap requires F013_LOCAL_BOOTSTRAP_APPROVED=1.");
  const base = resolveLocalBase(dependencies);
  const identityFile = join(base.workdir, ".f013-local-identity");
  if (base.exists(identityFile)) throw new F013TargetError("F013 local identity file already exists; re-bootstrap refused.");
  let identity: { schemaExists: boolean; identityRowExists: boolean };
  try {
    identity = (dependencies.inspectIdentity ?? ((dbUrl, probeEnv) => {
      const result = queryLocalIdentity(dbUrl, "absence", base.env, probeEnv);
      if (result !== "false|false" && result !== "true|false" && result !== "true|true") throw new F013TargetError("F013 bootstrap identity absence probe returned an unknown result.");
      const [schema, row] = result.split("|");
      return { schemaExists: schema === "true", identityRowExists: row === "true" };
    }))(F013_LOCAL_DB_URL, base.cleanEnv);
  } catch (error) { if (error instanceof F013TargetError) throw error; throw new F013TargetError("F013 bootstrap identity absence could not be verified."); }
  if (identity.schemaExists || identity.identityRowExists) throw new F013TargetError("F013 local identity already exists; re-bootstrap refused.");
  const nonce = (dependencies.generateNonce ?? (() => randomBytes(32).toString("hex")))();
  if (!/^[a-f0-9]{64}$/.test(nonce)) throw new F013TargetError("F013 bootstrap nonce is invalid.");
  (dependencies.log ?? console.log)(`F013 LOCAL BOOTSTRAP target: ${F013_LOCAL_PROJECT_ID} (${F013_LOCAL_API_URL}; DB 127.0.0.1:55422)`);
  const target: F013BootstrapTarget = { kind: "bootstrap", projectId: F013_LOCAL_PROJECT_ID, workdir: base.workdir, apiUrl: F013_LOCAL_API_URL, dbUrl: F013_LOCAL_DB_URL, nonce };
  Object.freeze(target);
  VERIFIED_BOOTSTRAP_TARGETS.add(target);
  return target;
}

export function assertF013BootstrapCapability(target: F013BootstrapTarget, env: Environment): void {
  if (!VERIFIED_BOOTSTRAP_TARGETS.has(target) || target.kind !== "bootstrap" || target.projectId !== F013_LOCAL_PROJECT_ID || target.apiUrl !== F013_LOCAL_API_URL || target.dbUrl !== F013_LOCAL_DB_URL || resolveF013Mode(env).kind !== "local" || env.F013_LOCAL_BOOTSTRAP_APPROVED !== "1") {
    throw new F013TargetError("Verified F013 local bootstrap capability is required.");
  }
}

export function assertF013WindowsSafeSqlPath(file: string): void {
  if (!/^[A-Za-z]:\\[A-Za-z0-9_.\\-]+\.sql$/.test(file)) {
    throw new F013TargetError("SQL file path contains Windows shell metacharacters or unsupported characters.");
  }
}

function assertQueryFileArgs(args: readonly string[]): string {
  if (args.some((part) => part === "link" || part === "push" || ["--linked", "--project-ref", "--db-url"].some((flag) => part.startsWith(flag)))) {
    throw new F013TargetError("Linked/project-ref/push or caller-supplied DB destinations are forbidden.");
  }
  if (args.length !== 4 || args[0] !== "db" || args[1] !== "query" || args[2] !== "-f") {
    throw new F013TargetError("Only a single db query file is supported.");
  }
  const file = args[3];
  if (!file || !isAbsolute(file) || extname(file).toLowerCase() !== ".sql") {
    throw new F013TargetError("SQL query file must be an absolute existing .sql file.");
  }
  if (process.platform === "win32") assertF013WindowsSafeSqlPath(file);
  try {
    if (!lstatSync(file).isFile()) throw new F013TargetError("SQL query path is not a regular file.");
  } catch (error) {
    if (error instanceof F013TargetError) throw error;
    throw new F013TargetError("SQL query file does not exist or cannot be inspected.");
  }
  return file;
}

export type F013BootstrapSqlFile = { kind: Exclude<F013PinnedFileKind, "identity-template">; path: string } | F013RenderedIdentity;

/** Pure pinned local command builder. No command is launched here. */
export function f013BootstrapCli(target: F013BootstrapTarget, input: F013BootstrapSqlFile, env: Environment = process.env): { command: "npx"; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  assertF013BootstrapCapability(target, env);
  const file = input.kind === "identity-rendered" ? assertF013RenderedIdentity(input, target) : input.path;
  if (input.kind !== "identity-rendered") assertF013PinnedRestoreFile(input.kind, file, target.dbUrl);
  assertQueryFileArgs(["db", "query", "-f", file]);
  return { command: "npx", args: ["supabase", "db", "query", "--db-url", F013_LOCAL_READ_ONLY_DB_URL, "--output-format", "json", "-f", file], cwd: target.workdir, env: sanitizedF013Environment(env) };
}

function writeBootstrapNonceAtomically(path: string, nonce: string, fileOps?: BootstrapFinishDependencies["fileOps"]): void {
  const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  const writeExclusive = fileOps?.writeExclusive ?? ((name: string, contents: string) => writeFileSync(name, contents, { flag: "wx", mode: 0o600 }));
  const linkExclusive = fileOps?.linkExclusive ?? linkSync;
  const remove = fileOps?.remove ?? unlinkSync;
  writeExclusive(temp, `${nonce}\n`);
  try { linkExclusive(temp, path); }
  finally { remove(temp); }
}

/** Finalize only after a future reviewed operation has created the exact nonce row. */
export function completeF013BootstrapNonce(target: F013BootstrapTarget, dependencies: BootstrapFinishDependencies = {}): void {
  const env = dependencies.env ?? process.env;
  assertF013BootstrapCapability(target, env);
  const base = resolveLocalBase({ ...dependencies, cwd: resolve(target.workdir, "..", "..") });
  if (base.workdir !== target.workdir) throw new F013TargetError("F013 bootstrap workdir changed.");
  const identityFile = join(target.workdir, ".f013-local-identity");
  if (base.exists(identityFile)) throw new F013TargetError("F013 local identity file already exists; overwrite refused.");
  let databaseNonce: string;
  try { databaseNonce = (dependencies.readDatabaseNonce ?? ((dbUrl, probeEnv) => queryLocalIdentity(dbUrl, "nonce", env, probeEnv)))(F013_LOCAL_DB_URL, base.cleanEnv); }
  catch (error) { if (error instanceof F013TargetError) throw error; throw new F013TargetError("F013 bootstrap database nonce could not be verified."); }
  if (databaseNonce !== target.nonce) throw new F013TargetError("F013 bootstrap database nonce mismatch.");
  (dependencies.log ?? console.log)(`F013 LOCAL BOOTSTRAP finalize: ${F013_LOCAL_PROJECT_ID} (${F013_LOCAL_API_URL}; DB 127.0.0.1:55422)`);
  writeBootstrapNonceAtomically(identityFile, target.nonce, dependencies.fileOps);
  VERIFIED_BOOTSTRAP_TARGETS.delete(target);
}

/** No ambient credential, host, or database variable crosses into fixture children. */
export function f013LocalChildEnv(target: F013LocalTarget, parent: Environment = process.env): NodeJS.ProcessEnv {
  if (!VERIFIED_LOCAL_TARGETS.has(target) || target.kind !== "local" || target.projectId !== F013_LOCAL_PROJECT_ID || target.apiUrl !== F013_LOCAL_API_URL || target.dbUrl !== F013_LOCAL_DB_URL) {
    throw new F013TargetError("Local child target is invalid.");
  }
  const child = sanitizedF013Environment(parent);
  child.F013_TARGET = "local";
  child.F013_LOCAL_APPROVED = "1";
  if (parent.F013_FIXTURES_APPROVED === "1") child.F013_FIXTURES_APPROVED = "1";
  if (parent.F013_LIVE === "1") child.F013_LIVE = "1";
  if (parent.F013_T071_LIVE === "1") child.F013_T071_LIVE = "1";
  if (parent.F013_DOCKER_PATH !== undefined) child.F013_DOCKER_PATH = parent.F013_DOCKER_PATH;
  return child;
}

/** Pure CLI command builder; execution remains with the caller. */
export function supabaseCli(target: Extract<F013Mode, { kind: "production-default" }> | F013LocalTarget, args: readonly string[], env: Environment = process.env): { command: string; args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const file = assertQueryFileArgs(args);
  if (target.kind === "local") {
    if (resolveF013Mode(env).kind !== "local") throw new F013TargetError("Local CLI mode not selected.");
    if (!VERIFIED_LOCAL_TARGETS.has(target) || target.projectId !== F013_LOCAL_PROJECT_ID || target.apiUrl !== F013_LOCAL_API_URL || target.dbUrl !== F013_LOCAL_DB_URL || target.workdir !== resolve(process.cwd(), "tools", "f013-local")) {
      throw new F013TargetError("Local CLI target is not the verified fixed workdir and endpoint.");
    }
    return { command: "npx", args: ["supabase", "db", "query", "--db-url", F013_LOCAL_READ_ONLY_DB_URL, "-f", file], cwd: target.workdir, env: sanitizedF013Environment(env) };
  }
  if (resolveF013Mode(env).kind !== "production-default" || env.F013_FIXTURES_APPROVED !== undefined) {
    throw new F013TargetError("Production proof CLI refused while F013 local mode is selected.");
  }
  const isF016 = env.F016_REMOTE_LIVE_DB_APPROVED === "1";
  if (!isF016 && env.F013_LIVE !== "1") throw new F013TargetError("Historical production proof CLI requires F013_LIVE=1.");
  const child = sanitizedF013Environment(env);
  // Feature 016 or Feature 015's explicitly approved remote proof uses one real PostgreSQL
  // session per SQL file. Never place credentials in argv or silently fall back.
  if (isF016 || env.F015_REMOTE_LIVE_DB_APPROVED === "1") {
    const featurePrefix = isF016 ? "Feature 016" : "Feature 015";
    if (!env.SUPABASE_DB_PASSWORD) throw new F013TargetError(`${featurePrefix} direct SQL requires SUPABASE_DB_PASSWORD in the current process environment.`);
    const linkedRef = readFileSync(resolve(process.cwd(), "supabase/.temp/project-ref"), "utf8").trim();
    const linked = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/linked-project.json"), "utf8")) as { ref?: string; name?: string };
    if (linkedRef !== F013_PRODUCTION_REF || linked.ref !== F013_PRODUCTION_REF || linked.name !== "hillscoffees-trading") {
      throw new F013TargetError(`${featurePrefix} direct SQL refused: linked Hills Coffee identity mismatch.`);
    }
    const pooler = new URL(readFileSync(resolve(process.cwd(), "supabase/.temp/pooler-url"), "utf8").trim());
    if (pooler.protocol !== "postgresql:" || pooler.username !== `postgres.${F013_PRODUCTION_REF}` ||
        !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(pooler.hostname) || (pooler.port && pooler.port !== "5432")) {
      throw new F013TargetError(`${featurePrefix} direct SQL refused: session-pooler identity mismatch.`);
    }
    if (isF016) {
      child.F016_REMOTE_LIVE_DB_APPROVED = "1";
    } else {
      child.F013_LIVE = "1";
      child.F015_REMOTE_LIVE_DB_APPROVED = "1";
    }
    child.PGHOST = pooler.hostname;
    child.PGPORT = "5432";
    child.PGUSER = `postgres.${F013_PRODUCTION_REF}`;
    child.SUPABASE_DB_PASSWORD = env.SUPABASE_DB_PASSWORD;
    if (env.NODE_EXTRA_CA_CERTS) child.NODE_EXTRA_CA_CERTS = env.NODE_EXTRA_CA_CERTS;
    return { command: process.execPath, args: [resolve(process.cwd(), "scripts/pg-simple-exec.mjs"), file], cwd: process.cwd(), env: child };
  }
  // Historical Batch B production proof only. This is the builder's sole linked branch.
  if (env.SUPABASE_ACCESS_TOKEN !== undefined) child.SUPABASE_ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
  return { command: "npx", args: ["supabase", "db", "query", "--linked", "-f", file], cwd: process.cwd(), env: child };
}
