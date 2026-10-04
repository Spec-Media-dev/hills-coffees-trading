/**
 * Feature 018 real-PostgreSQL test harness (LOCAL ONLY).
 *
 * Talks exclusively to the disposable `hills_f018_local` database inside the fixed local Supabase container through
 * `docker exec psql`. It never touches a remote host, a fixture session or the F013 `postgres` database. Real
 * concurrency is exercised with independent long-lived psql sessions (`PsqlSession`), not sequential promises.
 *
 * Opt in with F018_LOCAL_PG=1 (the base database must exist: `npx tsx scripts/f018-local-db.ts --build-base`).
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  F018_BASE_DB, F018_LOCAL_CONTAINER, F018_WORK_DB, assertLocalContainer, buildBaseDatabase, createDatabase, databaseExists, psqlSql, resetWorkDatabase,
} from "../../scripts/f018-local-db";

export const F018_LOCAL_PG_ENABLED = process.env.F018_LOCAL_PG === "1";
export const F018_ROOT = process.cwd();
export const F018_WORLD_DB = "hills_f018_world";
export const migrationPath = (name: string) => resolve(F018_ROOT, "supabase", "migrations", name);
export const rollbackPath = (name: string) => resolve(F018_ROOT, "supabase", "rollback", name.replace(/\.sql$/, ".rollback.sql"));

export const F018_M1 = "20261004100000_feature_018_featured_arabic_snapshots.sql";
export const F018_M2 = "20261004110000_feature_018_checkout_foundation.sql";
export const F018_M3 = "20261004120000_feature_018_admin_orchestration.sql";

export function ensureBase(): void {
  assertLocalContainer();
  if (!databaseExists(F018_BASE_DB)) buildBaseDatabase();
}

/** Fresh disposable working database cloned from the Feature 017 base. */
export function freshWorkDatabase(): void {
  ensureBase();
  resetWorkDatabase();
}

/** Clones the prepared world template (migrations + fixtures) into a fresh working database. */
export function resetFromWorldTemplate(): void {
  createDatabase(F018_WORK_DB, F018_WORLD_DB);
}

/** Snapshots the current working database as the world template (live connections are terminated first). */
export function saveWorldTemplate(): void {
  psqlSql(`select pg_terminate_backend(pid) from pg_stat_activity where datname = '${F018_WORK_DB}' and pid <> pg_backend_pid();`, { database: "postgres", user: "supabase_admin" });
  createDatabase(F018_WORLD_DB, F018_WORK_DB);
}

export function work(sql: string, user = "postgres"): string {
  return psqlSql(sql, { database: F018_WORK_DB, user });
}

export function workScalar(sql: string, user = "postgres"): string {
  return work(sql, user).trim();
}

export function workJson<T = unknown>(sql: string, user = "postgres"): T {
  return JSON.parse(workScalar(sql, user)) as T;
}

export function applyFile(path: string, user = "postgres"): void {
  psqlSql(readFileSync(path, "utf8"), { database: F018_WORK_DB, user });
}

export const applyForward = (name: string) => applyFile(migrationPath(name));
export const applyRollback = (name: string) => applyFile(rollbackPath(name));

export interface TryResult { ok: boolean; stdout: string; error: string }

/** Runs SQL that may fail; never throws. `error` is the first PostgreSQL error line (terse). */
export function tryWork(sql: string, user = "postgres"): TryResult {
  assertLocalContainer();
  const run = spawnSync("docker", ["exec", "-i", F018_LOCAL_CONTAINER, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=terse", "-U", user, "-d", F018_WORK_DB], { input: sql, encoding: "utf8", shell: false, maxBuffer: 64 * 1024 * 1024 });
  const error = (run.stderr || "").split(/\r?\n/).find((line) => /error/i.test(line)) ?? "";
  return { ok: run.status === 0, stdout: run.stdout ?? "", error };
}

/** One independent PostgreSQL session. Statements run in order; `run` resolves when its sentinel returns. */
export class PsqlSession {
  private child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private waiters = new Map<string, (output: string) => void>();
  private counter = 0;

  constructor(readonly name: string, user = "postgres", database = F018_WORK_DB) {
    if (!/^[a-z][a-z0-9_]{2,40}$/.test(database) || !/^[a-z_]{3,30}$/.test(user)) throw new Error("unsafe_session_identity");
    // stderr is merged so a PostgreSQL error arrives in order with the statement that raised it.
    this.child = spawn("docker", ["exec", "-i", F018_LOCAL_CONTAINER, "sh", "-c", `psql -X -q -A -t -v VERBOSITY=terse -U ${user} -d ${database} 2>&1`], { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => { this.buffer += chunk; this.flush(); });
    this.child.stderr.resume();
  }

  private flush(): void {
    for (;;) {
      let earliest: { token: string; at: number } | undefined;
      for (const token of this.waiters.keys()) {
        const at = this.buffer.indexOf(`@@${token}@@`);
        if (at >= 0 && (!earliest || at < earliest.at)) earliest = { token, at };
      }
      if (!earliest) return;
      const output = this.buffer.slice(0, earliest.at);
      const resolveWaiter = this.waiters.get(earliest.token)!;
      this.buffer = this.buffer.slice(earliest.at + earliest.token.length + 4).replace(/^\r?\n/, "");
      this.waiters.delete(earliest.token);
      resolveWaiter(output);
    }
  }

  /** Sends SQL then a sentinel; resolves with everything psql printed for it (errors included). */
  run(sql: string): Promise<string> {
    const token = `${this.name}-${++this.counter}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise((resolveRun) => {
      this.waiters.set(token, resolveRun);
      this.child.stdin.write(`${sql}\n\\echo @@${token}@@\n`);
    });
  }

  /** Acts as an authenticated user with genuine JWT claims (RLS and grants apply). */
  async asUser(userId: string, aal: "aal1" | "aal2" = "aal1"): Promise<void> {
    const claims = JSON.stringify({ sub: userId, role: "authenticated", aal });
    await this.run(`set application_name = 'f018-${this.name}'; select set_config('request.jwt.claims', '${claims}', false); set role authenticated;`);
  }

  async close(): Promise<void> {
    try { await Promise.race([this.run("rollback;"), new Promise((r) => setTimeout(r, 3000))]); } catch { /* ignore */ }
    this.child.stdin.end();
    await new Promise<void>((resolveClose) => { this.child.on("close", () => resolveClose()); setTimeout(resolveClose, 3000); });
    this.child.kill();
  }
}

export const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

export const errorLine = (output: string): string | undefined => output.split(/\r?\n/).find((line) => /^ERROR:/.test(line));
export const jsonLine = <T = Record<string, unknown>>(output: string): T => {
  const line = output.split(/\r?\n/).find((entry) => entry.trim().startsWith("{") || entry.trim().startsWith("["));
  if (!line) throw new Error(`no JSON in output: ${output.slice(0, 300)}`);
  return JSON.parse(line) as T;
};

/** Polls pg_stat_activity until the named session's backend is waiting on a lock (proof of genuine overlap). */
export async function waitForLockWait(sessionName: string, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const waiting = workScalar(`select count(*) from pg_stat_activity where datname = '${F018_WORK_DB}' and application_name = 'f018-${sessionName}' and wait_event_type = 'Lock'`);
    if (waiting !== "0") return true;
    await sleep(150);
  }
  return false;
}
