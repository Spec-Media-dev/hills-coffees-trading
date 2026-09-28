import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const RETIRED = ["F013_TARGET_REF", "F013_ISOLATED_TEST_APPROVED", "F013_ISOLATED_ENV_FILE"];
const LOCAL = ["F013_TARGET", "F013_LOCAL_APPROVED", "F013_LOCAL_BOOTSTRAP_APPROVED", "F013_LOCAL_RESTORE_APPROVED", "F013_DOCKER_PATH", "F013_FIXTURES_APPROVED", "F013_T071_LIVE"];

/** Historical production-default proof paths only; any F013 target selection blocks this loader. */
/** @param {Record<string, string | undefined>} env */
export function assertF013ProductionDefault(env = process.env) {
  if (RETIRED.some((name) => env[name] !== undefined)) throw new Error("hosted isolated mode retired");
  if (LOCAL.some((name) => env[name] !== undefined)) throw new Error("production-default env refused in F013 local mode");
}

/** @param {Record<string, string | undefined>} env */
export function readProductionEnvLocal(env = process.env, cwd = process.cwd()) {
  assertF013ProductionDefault(env);
  const contents = readFileSync(resolve(cwd, ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const name = /^\s*(F013_[A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (name && RETIRED.includes(name)) throw new Error("hosted isolated mode retired");
    if (name && LOCAL.includes(name)) throw new Error("production-default env refused in F013 local mode");
  }
  return contents;
}

/** Legacy tests may load named values only after the production-default mode check. */
/** @param {readonly string[]} names @param {Record<string, string | undefined>} env */
export function loadProductionEnvLocal(names, env = process.env, cwd = process.cwd()) {
  assertF013ProductionDefault(env);
  let contents;
  try { contents = readProductionEnvLocal(env, cwd); } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const allowed = new Set(names);
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim();
    if (!allowed.has(name) || env[name] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[name] = value;
  }
}

/** @param {string} name @param {Record<string, string | undefined>} env */
export function productionEnvValue(name, env = process.env, cwd = process.cwd()) {
  assertF013ProductionDefault(env);
  loadProductionEnvLocal([name], env, cwd);
  if (!env[name]) throw new Error(`${name} missing from production-default environment`);
  return env[name];
}

/** Child scripts re-read the guarded production file themselves; no ambient credentials are forwarded. */
/** @param {Record<string, string | undefined>} env @param {Record<string, string | undefined>} overrides @returns {NodeJS.ProcessEnv} */
export function productionChildEnv(env = process.env, overrides = {}) {
  assertF013ProductionDefault(env);
  for (const name of Object.keys(overrides)) {
    if (name !== "F010P_DIRECT_OBSERVATION") throw new Error(`Unsupported production child override ${name}`);
  }
  /** @type {NodeJS.ProcessEnv} */
  const child = { NODE_ENV: env.NODE_ENV ?? "test" };
  for (const name of ["PATH", "Path", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "NODE_ENV"]) {
    if (env[name] !== undefined) child[name] = env[name];
  }
  if (overrides.F010P_DIRECT_OBSERVATION !== undefined) child.F010P_DIRECT_OBSERVATION = overrides.F010P_DIRECT_OBSERVATION;
  return child;
}
