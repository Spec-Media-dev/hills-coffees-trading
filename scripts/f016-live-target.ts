/**
 * Feature 016 Live Database Target Harness
 *
 * Implements T005:
 * - Asserts target project ref `mxejnutukgxyccnohglo`
 * - Uses environment-only credentials (SUPABASE_DB_PASSWORD)
 * - Enforces documented 30-second SQL timeout and 180-second process limits
 * - Gated strictly by `F016_REMOTE_LIVE_DB_APPROVED=1` without requiring F013_LIVE or F015_REMOTE_LIVE_DB_APPROVED
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveF013Mode, sanitizedF013Environment } from "./f013-local-target";

export const F016_TARGET_REF = "mxejnutukgxyccnohglo";
export const F016_SQL_TIMEOUT_MS = 30000;
export const F016_PROCESS_TIMEOUT_MS = 180000;

export class F016TargetError extends Error {}

/** Reject local resolution, including a cached override, before any local identity probe. */
export function assertF016RemoteMode(localOverride = false, env: Record<string, string | undefined> = process.env): void {
  if (env.F016_REMOTE_LIVE_DB_APPROVED === "1" && (resolveF013Mode(env).kind === "local" || localOverride)) {
    throw new F016TargetError("f016_remote_refuses_f013_local_override");
  }
}

export function assertF016HttpTarget(value: string | undefined): void {
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new F016TargetError("f016_http_target_missing_or_malformed"); }
  if (url.protocol !== "https:" || url.hostname !== `${F016_TARGET_REF}.supabase.co` ||
      url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new F016TargetError("f016_http_target_mismatch");
  }
}

export interface F016VerifiedTarget {
  ref: string;
  projectName: string;
  poolerHost: string;
  poolerPort: string;
  poolerUser: string;
}

export function assertF016LiveTarget(env: Record<string, string | undefined> = process.env): F016VerifiedTarget {
  if (env.F016_REMOTE_LIVE_DB_APPROVED !== "1") {
    throw new F016TargetError("Feature 016 live database execution requires F016_REMOTE_LIVE_DB_APPROVED=1.");
  }

  assertF016RemoteMode(false, env);

  if (!env.SUPABASE_DB_PASSWORD) {
    throw new F016TargetError("Feature 016 live target requires SUPABASE_DB_PASSWORD in the current process environment.");
  }

  assertF016HttpTarget(env.NEXT_PUBLIC_SUPABASE_URL);

  const projectRefPath = resolve(process.cwd(), "supabase/.temp/project-ref");
  const linkedProjectPath = resolve(process.cwd(), "supabase/.temp/linked-project.json");
  const poolerUrlPath = resolve(process.cwd(), "supabase/.temp/pooler-url");

  let linkedRef = "";
  let linkedName = "";
  let poolerUrlStr = "";

  try {
    linkedRef = readFileSync(projectRefPath, "utf8").trim();
    const linked = JSON.parse(readFileSync(linkedProjectPath, "utf8")) as { ref?: string; name?: string };
    if (linked.ref !== linkedRef) {
      throw new F016TargetError("Mismatch between project-ref and linked-project.json.");
    }
    linkedName = linked.name ?? "";
    poolerUrlStr = readFileSync(poolerUrlPath, "utf8").trim();
  } catch (err: unknown) {
    if (err instanceof F016TargetError) throw err;
    throw new F016TargetError(`Failed to load Supabase linked target metadata: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (linkedRef !== F016_TARGET_REF || linkedName !== "hillscoffees-trading") {
    throw new F016TargetError(`Feature 016 direct SQL refused: linked target must be '${F016_TARGET_REF}' (hillscoffees-trading), got '${linkedRef}' (${linkedName}).`);
  }

  let pooler: URL;
  try {
    pooler = new URL(poolerUrlStr);
  } catch {
    throw new F016TargetError("Invalid pooler URL format in supabase/.temp/pooler-url.");
  }

  const expectedUser = `postgres.${F016_TARGET_REF}`;
  if (
    pooler.protocol !== "postgresql:" ||
    pooler.username !== expectedUser ||
    !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(pooler.hostname) ||
    (pooler.port && pooler.port !== "5432")
  ) {
    throw new F016TargetError("Feature 016 direct SQL refused: session-pooler identity mismatch.");
  }

  return {
    ref: linkedRef,
    projectName: linkedName,
    poolerHost: pooler.hostname,
    poolerPort: "5432",
    poolerUser: expectedUser,
  };
}

export function buildF016SanitizedEnv(env: Record<string, string | undefined> = process.env): NodeJS.ProcessEnv {
  const target = assertF016LiveTarget(env);
  const child = sanitizedF013Environment(env);

  child.F016_REMOTE_LIVE_DB_APPROVED = "1";
  child.F016_SQL_TIMEOUT_MS = String(F016_SQL_TIMEOUT_MS);
  child.PGHOST = target.poolerHost;
  child.PGPORT = target.poolerPort;
  child.PGUSER = target.poolerUser;
  child.SUPABASE_DB_PASSWORD = env.SUPABASE_DB_PASSWORD!;
  if (env.NODE_EXTRA_CA_CERTS) child.NODE_EXTRA_CA_CERTS = env.NODE_EXTRA_CA_CERTS;

  return child;
}

export async function executeF016Sql(sql: string, env: Record<string, string | undefined> = process.env): Promise<number> {
  const sanitized = buildF016SanitizedEnv(env);
  // Fixture-session URL validation must remain usable without loading the SQL executor.
  const { execute: executePgSimple } = await import("./pg-simple-exec.mjs");
  return await executePgSimple(sql, sanitized);
}
