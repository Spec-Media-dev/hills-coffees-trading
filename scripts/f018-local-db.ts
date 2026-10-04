/**
 * Feature 018 local PostgreSQL builder (LOCAL ONLY).
 *
 * Builds `hills_f018_base` - the repository-derived state through Feature 017 - inside the existing local Supabase
 * container, then clones it to a disposable `hills_f018_local` working database. Nothing here can reach a remote
 * host: every command is `docker exec` into the fixed local container, and the `postgres` database used by the
 * Feature 013 local stack is only read (pg_dump of the platform schemas).
 *
 *   npx tsx scripts/f018-local-db.ts --build-base      # rebuild the base database (about a minute)
 *   npx tsx scripts/f018-local-db.ts --reset-work      # fresh working copy of the base
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export const F018_LOCAL_CONTAINER = "supabase_db_hills-f013-local";
export const F018_LOCAL_PROJECT_LABEL = "hills-f013-local";
export const F018_BASE_DB = "hills_f018_base";
export const F018_WORK_DB = "hills_f018_local";
export const F018_SCHEMA_DUMP_SHA256 = "a51ec3853a6daeecc845766cc843c209eece5fc5caf0c8b951fac7aac369fc21";
export const F018_SCHEMA_DUMP_DEFAULT = "C:\\Users\\Dell\\hills-coffee-backups\\2026-09-26-pre-m4a\\schema.sql";
const MAX_BUFFER = 256 * 1024 * 1024;

export class F018LocalDbError extends Error {}

const SAFE_DB = /^hills_f018_[a-z0-9_]{1,30}$/;
export function assertSafeLocalDatabase(name: string): string {
  if (!SAFE_DB.test(name)) throw new F018LocalDbError(`unsafe_local_database_name:${name}`);
  return name;
}

interface DockerResult { status: number; stdout: string; stderr: string }
function docker(args: string[], input?: string | Buffer, timeout = 600_000): DockerResult {
  const result = spawnSync("docker", args, { input, encoding: "utf8", shell: false, timeout, maxBuffer: MAX_BUFFER });
  if (result.error) throw new F018LocalDbError(`docker_unavailable:${result.error.message.slice(0, 160)}`);
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** The only host this module will ever talk to: the fixed local Supabase database container. */
export function assertLocalContainer(): void {
  const result = docker(["inspect", F018_LOCAL_CONTAINER], undefined, 20_000);
  if (result.status !== 0) throw new F018LocalDbError("local_container_not_found");
  const parsed = JSON.parse(result.stdout) as Array<{ Name?: string; State?: { Running?: boolean }; Config?: { Labels?: Record<string, string> } }>;
  const container = parsed[0];
  if (parsed.length !== 1 || container?.Name !== `/${F018_LOCAL_CONTAINER}` || container.State?.Running !== true ||
      container.Config?.Labels?.["com.supabase.cli.project"] !== F018_LOCAL_PROJECT_LABEL) {
    throw new F018LocalDbError("local_container_identity_mismatch");
  }
}

export interface PsqlOptions { database: string; user?: string; failOnError?: boolean }

/** Runs SQL text through psql stdin. Returns stdout; throws with the first error line when it fails. */
export function psqlSql(sql: string, options: PsqlOptions): string {
  assertLocalContainer();
  const user = options.user ?? "supabase_admin";
  const result = docker(["exec", "-i", F018_LOCAL_CONTAINER, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", user, "-d", options.database], sql);
  if (result.status !== 0 && options.failOnError !== false) {
    const line = result.stderr.split(/\r?\n/).find((entry) => /error/i.test(entry)) ?? result.stderr.split(/\r?\n/)[0] ?? "psql failed";
    throw new F018LocalDbError(line.slice(0, 400));
  }
  return result.stdout;
}

export function psqlScalar(sql: string, database: string): string {
  return psqlSql(sql, { database }).trim();
}

export function databaseExists(name: string): boolean {
  return psqlScalar(`select exists (select 1 from pg_database where datname = '${assertSafeLocalDatabase(name)}')`, "postgres") === "t";
}

export function dropDatabase(name: string): void {
  assertSafeLocalDatabase(name);
  psqlSql(`drop database if exists ${name} with (force)`, { database: "postgres" });
}

export function createDatabase(name: string, template?: string): void {
  assertSafeLocalDatabase(name);
  if (template) assertSafeLocalDatabase(template);
  dropDatabase(name);
  psqlSql(`create database ${name}${template ? ` template ${template}` : ""}`, { database: "postgres" });
}

export function migrationFiles(root = process.cwd()): string[] {
  return readdirSync(resolve(root, "supabase", "migrations")).filter((name) => name.endsWith(".sql")).sort();
}
export const isFeature018Migration = (name: string) => name.includes("feature_018");

/** Migrations run as `postgres`, exactly like the remote CLI, so object ownership and default ACLs match live. */
function applyFile(database: string, path: string): void {
  psqlSql(readFileSync(path, "utf8"), { database, user: "postgres" });
}

function schemaDumpPath(): string {
  const path = process.env.F018_SCHEMA_DUMP ?? F018_SCHEMA_DUMP_DEFAULT;
  if (!existsSync(path)) throw new F018LocalDbError("pre_m4a_schema_dump_missing");
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== F018_SCHEMA_DUMP_SHA256) throw new F018LocalDbError("pre_m4a_schema_dump_hash_mismatch");
  return path;
}

/** Rebuilds `hills_f018_base`: platform schemas + production pre-M4a schema + every non-018 migration after it. */
export function buildBaseDatabase(root = process.cwd()): { applied: string[] } {
  assertLocalContainer();
  const dump = schemaDumpPath();
  const platformFile = "/tmp/f018_platform.sql";
  const dumped = docker(["exec", F018_LOCAL_CONTAINER, "bash", "-c", `pg_dump -U supabase_admin -d postgres -s -n auth -n storage --no-comments > ${platformFile}`]);
  if (dumped.status !== 0) throw new F018LocalDbError(`platform_dump_failed:${dumped.stderr.slice(0, 200)}`);

  createDatabase(F018_BASE_DB);
  const db = F018_BASE_DB;
  psqlSql(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create schema if not exists vault;
    create extension if not exists supabase_vault with schema vault cascade;
    create publication supabase_realtime;
  `, { database: db });
  // The platform dump references one public trigger function that exists only after the application schema.
  const platform = docker(["exec", F018_LOCAL_CONTAINER, "bash", "-c", `psql -X -q -U supabase_admin -d ${db} -v ON_ERROR_STOP=0 -f ${platformFile} 2>&1 | grep -i error || true`]);
  const platformErrors = platform.stdout.split(/\r?\n/).filter((line) => /error/i.test(line) && !/public\.handle_new_user\(\) does not exist/.test(line));
  if (platformErrors.length) throw new F018LocalDbError(`platform_restore_errors:${platformErrors.join(" | ").slice(0, 400)}`);

  psqlSql(`
    alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
    alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
    alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
  `, { database: db });
  const copy = docker(["cp", dump, `${F018_LOCAL_CONTAINER}:/tmp/f018_schema_pre_m4a.sql`]);
  if (copy.status !== 0) throw new F018LocalDbError("schema_dump_copy_failed");
  const restored = docker(["exec", F018_LOCAL_CONTAINER, "bash", "-c", `psql -X -q -U supabase_admin -d ${db} -v ON_ERROR_STOP=0 -f /tmp/f018_schema_pre_m4a.sql 2>&1 | grep -i error || true`]);
  const schemaErrors = restored.stdout.split(/\r?\n/).filter((line) => /error/i.test(line));
  if (schemaErrors.length) throw new F018LocalDbError(`schema_restore_errors:${schemaErrors.join(" | ").slice(0, 400)}`);

  // Supabase grants these on a fresh project; a new local database starts without them.
  psqlSql("grant all on schema public to postgres, anon, authenticated, service_role;", { database: db });
  applyFile(db, resolve(root, "tools", "f013-local", "sql", "baseline-reference.sql"));
  applyFile(db, resolve(root, "tools", "f013-local", "sql", "feature003-auth-trigger.sql"));
  const applied: string[] = [];
  for (const name of migrationFiles(root)) {
    if (name < "20260926100000" || isFeature018Migration(name)) continue;
    try { applyFile(db, resolve(root, "supabase", "migrations", name)); } catch (error) {
      throw new F018LocalDbError(`migration_failed:${name}:${error instanceof Error ? error.message : "unknown"}`);
    }
    applied.push(name);
  }
  psqlSql(`create schema f018_local; create table f018_local.identity (nonce text primary key, created_at timestamptz not null default now()); insert into f018_local.identity values (encode(extensions.gen_random_bytes(16), 'hex'));`, { database: db });
  return { applied };
}

/** Disposable working copy of the base. Callers apply Feature 018 migrations on top. */
export function resetWorkDatabase(): void {
  if (!databaseExists(F018_BASE_DB)) throw new F018LocalDbError("base_database_missing_run_build_base");
  createDatabase(F018_WORK_DB, F018_BASE_DB);
}

export function applyMigrationToWork(path: string): void {
  applyFile(F018_WORK_DB, path);
}

function main(argv: string[]): number {
  if (argv.includes("--build-base")) {
    const result = buildBaseDatabase();
    console.log(`Built ${F018_BASE_DB}: ${result.applied.length} migration(s) applied after the pre-M4a schema (${result.applied[0]} .. ${result.applied.at(-1)}).`);
    return 0;
  }
  if (argv.includes("--reset-work")) { resetWorkDatabase(); console.log(`Reset ${F018_WORK_DB} from ${F018_BASE_DB}.`); return 0; }
  console.error("Usage: f018-local-db.ts --build-base | --reset-work");
  return 2;
}

if (process.argv[1] && /f018-local-db\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "f018 local db failed");
    process.exitCode = 1;
  }
}
