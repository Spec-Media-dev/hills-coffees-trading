import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { F013_PRODUCTION_REF, requireF013LocalTarget, resolveF013Mode, supabaseCli } from "@/scripts/f013-local-target";
import { productionEnvValue } from "@/scripts/f013-production-env.mjs";

/** Single execution path for historical Batch B and future verified local proof queries. */
export function runF013ProofSqlFile(sql: string, prefix: string, timeout = 180_000): string {
  const mode = resolveF013Mode();
  const target = mode.kind === "local" ? requireF013LocalTarget() : mode;
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const file = path.join(dir, "query.sql");
  try {
    writeFileSync(file, sql);
    const command = supabaseCli(target, ["db", "query", "-f", file]);
    try {
      return execFileSync(command.command, command.args, {
        cwd: command.cwd, env: command.env, encoding: "utf8", shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"], timeout,
      });
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      return `${failure.stdout ?? ""}\n${failure.stderr ?? ""}`;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function f013ProofEnv(name: string): string {
  if (resolveF013Mode().kind === "local") {
    const target = requireF013LocalTarget();
    if (name === "NEXT_PUBLIC_SUPABASE_URL") return target.apiUrl;
    if (name === "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") return target.anonKey;
    throw new Error(`Unsupported F013 local proof environment name ${name}.`);
  }
  return productionEnvValue(name);
}

/** Local proofs never consult the repository's historical linked-project marker. */
export function verifiedF013ProofRef(): string {
  if (resolveF013Mode().kind === "local") return requireF013LocalTarget().projectId;
  const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (ref !== F013_PRODUCTION_REF) throw new Error("Historical Batch B proof linked project ref mismatch.");
  return ref;
}
