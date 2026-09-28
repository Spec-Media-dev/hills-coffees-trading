import { execFileSync, spawnSync, type SpawnSyncOptionsWithStringEncoding } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { basename, isAbsolute } from "node:path";

const CONTAINER = "supabase_db_hills-f013-local";
const PROJECT = "hills-f013-local";
export const APPROVED_DOCKER_PATH = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
export const APPROVED_DOCKER_SHA256 = "35cab8a5c3b5db69ef9a9ef80623ddbc7f465ee15e64c9829cec1990be3a1612";
const SQL = {
  absence: "select (to_regnamespace('f013_local') is not null)::text, (to_regclass('f013_local.identity') is not null)::text",
  nonce: "select nonce from f013_local.identity",
  // T071 provenance validation: service_role holds no privilege on the M2e outbox by design, so the retained-chain
  // "no notification event" check reads the whole-table count through this fixed read-only local probe.
  notificationCount: "select count(*)::text from public.notification_events",
} as const;
export type F013IdentityProbe = keyof typeof SQL;

export class F013DockerProbeError extends Error {}

export function assertF013DockerInspect(output: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch { throw new F013DockerProbeError("Docker inspect returned invalid JSON."); }
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new F013DockerProbeError("Docker inspect must identify exactly one container.");
  const container = parsed[0];
  if (!container || typeof container !== "object" || Array.isArray(container)) throw new F013DockerProbeError("Docker inspect container is invalid.");
  const value = container as { Name?: unknown; Config?: { Labels?: Record<string, unknown> }; State?: { Running?: unknown }; NetworkSettings?: { Ports?: Record<string, unknown> } };
  const bindings = value.NetworkSettings?.Ports?.["5432/tcp"];
  const expectedBindings = new Set(["0.0.0.0|55422", "::|55422"]);
  const actualBindings = Array.isArray(bindings)
    ? bindings.map((entry) => {
      const binding = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as { HostIp?: unknown; HostPort?: unknown } : undefined;
      return typeof binding?.HostIp === "string" && typeof binding.HostPort === "string" ? `${binding.HostIp}|${binding.HostPort}` : undefined;
    })
    : [];
  if (value.Name !== `/${CONTAINER}` || value.Config?.Labels?.["com.supabase.cli.project"] !== PROJECT || value.State?.Running !== true ||
      !Array.isArray(bindings) || actualBindings.length !== 2 || actualBindings.some((binding) => binding === undefined || !expectedBindings.has(binding)) || new Set(actualBindings).size !== expectedBindings.size) {
    throw new F013DockerProbeError("Docker inspect does not match the fixed running F013 local database.");
  }
}

export type F013DockerProbeDependencies = {
  hashExecutable?: (path: string) => string;
  runCommand?: (path: string, args: readonly string[], env: NodeJS.ProcessEnv) => string;
  runPsql?: (path: string, args: readonly string[], options: SpawnSyncOptionsWithStringEncoding) => { status: number | null; stdout: string; stderr: string; error?: Error; signal?: string | null };
  approvedPath?: string;
  lstat?: (path: string) => { isFile: () => boolean };
};

function verifyDockerExecutable(executable: string | undefined, approvedHash: string | null, approvedPath: string, dependencies: F013DockerProbeDependencies): string {
  if (!approvedHash || !/^[a-f0-9]{64}$/.test(approvedHash)) throw new F013DockerProbeError("No approved F013 docker.exe SHA-256 pin is configured.");
  if (!executable || !isAbsolute(executable) || basename(executable).toLowerCase() !== "docker.exe") {
    throw new F013DockerProbeError("An absolute approved docker.exe path is required.");
  }
  const expectedPath = dependencies.approvedPath ?? approvedPath;
  if (executable !== expectedPath) {
    throw new F013DockerProbeError("Approved docker.exe path mismatch.");
  }
  let actual: string;
  try {
    const stat = (dependencies.lstat ?? lstatSync)(executable);
    if (!stat.isFile()) throw new Error("not a file");
    actual = (dependencies.hashExecutable ?? ((path) => createHash("sha256").update(readFileSync(path)).digest("hex")))(executable);
  } catch { throw new F013DockerProbeError("Approved docker.exe could not be verified."); }
  if (actual !== approvedHash) throw new F013DockerProbeError("Approved docker.exe hash mismatch.");
  return executable;
}

function inspectF013Docker(executable: string, env: NodeJS.ProcessEnv, dependencies: F013DockerProbeDependencies): void {
  const run = dependencies.runCommand ?? ((path: string, args: readonly string[], childEnv: NodeJS.ProcessEnv) => execFileSync(path, args, {
    env: childEnv, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
  }));
  assertF013DockerInspect(run(executable, ["inspect", CONTAINER], env));
}

/** Testable primitive. Runtime passes the operator-verified module pin. */
export function probeF013Identity(
  probe: F013IdentityProbe, executable: string | undefined, approvedHash: string | null = APPROVED_DOCKER_SHA256,
  env: NodeJS.ProcessEnv = process.env, dependencies: F013DockerProbeDependencies = {},
  approvedPath: string = APPROVED_DOCKER_PATH,
): string {
  if (!Object.hasOwn(SQL, probe)) throw new F013DockerProbeError("Unknown F013 identity probe.");
  const verified = verifyDockerExecutable(executable, approvedHash, approvedPath, dependencies);
  inspectF013Docker(verified, env, dependencies);
  const run = dependencies.runCommand ?? ((path: string, args: readonly string[], childEnv: NodeJS.ProcessEnv) => execFileSync(path, args, {
    env: childEnv, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"], timeout: 15_000,
  }));
  return run(verified, ["exec", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-F", "|", "-U", "postgres", "-d", "postgres", "-c", SQL[probe]], env).trim();
}

/** Executes validated SQL bytes through the fixed local container's psql stdin. */
export function runF013DockerPsqlStdin(
  input: Buffer, executable: string | undefined, env: NodeJS.ProcessEnv,
  dependencies: F013DockerProbeDependencies = {}, approvedHash: string | null = APPROVED_DOCKER_SHA256,
  approvedPath: string = APPROVED_DOCKER_PATH,
): { stdout: string; stderr: string } {
  if (!Buffer.isBuffer(input) || input.length === 0) throw new F013DockerProbeError("Pinned SQL input is empty or invalid.");
  const verified = verifyDockerExecutable(executable, approvedHash, approvedPath, dependencies);
  inspectF013Docker(verified, env, dependencies);
  const args = ["exec", "-i", CONTAINER, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"] as const;
  const options: SpawnSyncOptionsWithStringEncoding = {
    input, env, encoding: "utf8", shell: false, stdio: ["pipe", "pipe", "pipe"], timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
  };
  const result = (dependencies.runPsql ?? spawnSync)(verified, args, options);
  if (result.error || result.signal || result.status !== 0) throw new F013DockerProbeError(`F013 local psql failed (exit ${result.status ?? "unknown"}): ${result.stderr}`);
  return { stdout: result.stdout, stderr: result.stderr };
}

export function runtimeF013IdentityProbe(
  probe: F013IdentityProbe,
  executable: string | undefined,
  env: NodeJS.ProcessEnv,
  dependencies: F013DockerProbeDependencies = {},
): string {
  return probeF013Identity(probe, executable, APPROVED_DOCKER_SHA256, env, dependencies, APPROVED_DOCKER_PATH);
}
