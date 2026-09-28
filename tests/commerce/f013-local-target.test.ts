import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  F013_LOCAL_API_URL, F013_LOCAL_DB_URL, F013_LOCAL_PROJECT_ID, F013_LOCAL_READ_ONLY_DB_URL, F013_PRODUCTION_REF,
  assertF013WindowsSafeSqlPath, completeF013BootstrapNonce, f013BootstrapCli, f013LocalChildEnv,
  requireF013BootstrapTarget, requireF013LocalTarget, resolveF013Mode, supabaseCli,
} from "@/scripts/f013-local-target";
import { assertF013ProductionDefault, productionChildEnv, readProductionEnvLocal } from "@/scripts/f013-production-env.mjs";
import { assertF013ApprovedHash, assertF013IdentitySqlNonIdempotent, assertF013IdentityTemplate, assertF013PinnedRestoreFile, discardF013RenderedIdentity, f013PinnedPath, renderF013IdentitySql } from "@/scripts/f013-restore-pins";
import { assertF013CatalogOutput, assertF013M4aPostflightOutput, assertF013M4aRoleOutput, assertF013M4aRolePreconditionResult, assertF013RestorePlanOrder, buildF013RestorePlan, dryRunF013LocalRestore, executeF013LocalRestore, F013_RESTORE_ORDER } from "@/scripts/f013-restore-plan";

const repo = process.cwd();
const config = readFileSync(resolve(repo, "tools/f013-local/supabase/config.toml"), "utf8");
const nonce = "a".repeat(64);
const localEnv = { F013_TARGET: "local", F013_LOCAL_APPROVED: "1" };
const bootstrapEnv = { ...localEnv, F013_LOCAL_BOOTSTRAP_APPROVED: "1" };
const status = { API_URL: F013_LOCAL_API_URL, DB_URL: F013_LOCAL_DB_URL, ANON_KEY: "local-anon", SERVICE_ROLE_KEY: "local-service" };
const workdir = resolve(repo, "tools/f013-local");
const queryFile = resolve(repo, "supabase/migrations/20260926100000_feature_013_cart_destination_rpcs.sql");

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    env: localEnv,
    cwd: repo,
    readFile: (path: string) => path.endsWith("config.toml") ? config : nonce,
    exists: () => false,
    status: () => status,
    verifyNonce: () => nonce,
    log: () => {},
    ...overrides,
  };
}

const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("F013 local-only target", () => {
  it.each(["F013_TARGET_REF", "F013_ISOLATED_TEST_APPROVED", "F013_ISOLATED_ENV_FILE"])("retires hosted variable %s in both modes", (name) => {
    expect(() => resolveF013Mode({ ...localEnv, [name]: "" })).toThrow(/hosted isolated mode retired/);
    expect(() => resolveF013Mode({ [name]: "" })).toThrow(/hosted isolated mode retired/);
    expect(() => readProductionEnvLocal({ [name]: "" })).toThrow(/hosted isolated mode retired/);
  });

  it("requires explicit local target and exact approval", () => {
    expect(resolveF013Mode({})).toEqual({ kind: "production-default" });
    expect(() => requireF013LocalTarget(dependencies({ env: {} }))).toThrow(/local target is required/);
    for (const value of ["", "LOCAL", F013_PRODUCTION_REF, "unknown"]) {
      expect(() => resolveF013Mode({ F013_TARGET: value, F013_LOCAL_APPROVED: "1" })).toThrow(/exactly local/);
    }
    for (const value of [undefined, "", "0", "true", "01"]) {
      expect(() => resolveF013Mode({ F013_TARGET: "local", F013_LOCAL_APPROVED: value })).toThrow(/exactly 1/);
    }
  });

  it.each(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PGHOST", "PGPASSWORD", "DATABASE_URL", "POSTGRES_PASSWORD", "TEST_FIXTURE_PASSWORD"])("refuses inherited %s before status", (name) => {
    let statusCalled = false;
    expect(() => requireF013LocalTarget(dependencies({
      env: { ...localEnv, [name]: "production-credential" },
      status: () => { statusCalled = true; return status; },
    }))).toThrow(/refuses inherited/);
    expect(statusCalled).toBe(false);
  });

  it("fails closed when local status is unavailable", () => {
    expect(() => requireF013LocalTarget(dependencies({ status: () => { throw new Error("offline"); } }))).toThrow(/stack\/status unavailable/);
  });

  it("passes only sanitized environment and fixed DB URL to local probes", () => {
    let statusEnv: NodeJS.ProcessEnv | undefined;
    let nonceEnv: NodeJS.ProcessEnv | undefined;
    let nonceUrl: string | undefined;
    requireF013LocalTarget(dependencies({
      env: { ...localEnv, F013_FIXTURES_APPROVED: "1", F013_LIVE: "1", PATH: "safe-path" },
      status: (_workdir: string, env: NodeJS.ProcessEnv) => { statusEnv = env; return status; },
      verifyNonce: (dbUrl: string, _expected: string, env: NodeJS.ProcessEnv) => { nonceUrl = dbUrl; nonceEnv = env; return nonce; },
    }));
    expect(statusEnv).toEqual({ NODE_ENV: "test", PATH: "safe-path" });
    expect(nonceEnv).toEqual(statusEnv);
    expect(nonceUrl).toBe(F013_LOCAL_DB_URL);
  });

  it.each([
    ["localhost API", { API_URL: "http://localhost:55421" }],
    ["HTTPS API", { API_URL: "https://127.0.0.1:55421" }],
    ["wrong API port", { API_URL: "http://127.0.0.1:54321" }],
    ["hosted API", { API_URL: `https://${F013_PRODUCTION_REF}.supabase.co` }],
    ["wrong DB host", { DB_URL: "postgresql://postgres:postgres@localhost:55422/postgres" }],
    ["wrong DB port", { DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" }],
    ["pooler DB", { DB_URL: "postgresql://postgres:postgres@aws.pooler.supabase.com:55422/postgres" }],
  ])("refuses %s", (_label, mutation) => {
    expect(() => requireF013LocalTarget(dependencies({ status: () => ({ ...status, ...mutation }) }))).toThrow(/endpoints/);
  });

  it.each([
    ["project id", config.replace(F013_LOCAL_PROJECT_ID, "other")],
    ["API port", config.replace("port = 55421", "port = 54321")],
    ["DB port", config.replace("port = 55422", "port = 54322")],
    ["PG version", config.replace("major_version = 17", "major_version = 16")],
    ["SMTP port", config.replace("smtp_port = 55425", "smtp_port = 54325")],
    ["POP3 port", config.replace("pop3_port = 55426", "pop3_port = 54326")],
    ["edge runtime", config.replace("[edge_runtime]\nenabled = false", "[edge_runtime]\nenabled = true")],
  ])("refuses mismatched %s in config", (_label, altered) => {
    expect(() => requireF013LocalTarget(dependencies({ readFile: (path: string) => path.endsWith("config.toml") ? altered : nonce }))).toThrow(/config mismatch/);
  });

  it.each([".temp/project-ref", "migrations", "functions"])("refuses forbidden workdir path %s before status", (path) => {
    let statusCalled = false;
    expect(() => requireF013LocalTarget(dependencies({
      exists: (candidate: string) => candidate.replaceAll("\\", "/").endsWith(path),
      status: () => { statusCalled = true; return status; },
    }))).toThrow(/forbidden path/);
    expect(statusCalled).toBe(false);
  });

  it("requires local JWT issuer and rejects hosted project claims", () => {
    const jwt = (claims: object) => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
    expect(() => requireF013LocalTarget(dependencies({ status: () => ({ ...status, ANON_KEY: jwt({ iss: "hosted" }) }) }))).toThrow(/issuer/);
    expect(() => requireF013LocalTarget(dependencies({ status: () => ({ ...status, ANON_KEY: jwt({ iss: "supabase-demo", ref: F013_PRODUCTION_REF }) }) }))).toThrow(/hosted project ref/);
  });

  it("checks the nonce on disk against the database before accepting", () => {
    expect(() => requireF013LocalTarget(dependencies({ verifyNonce: () => "b".repeat(64) }))).toThrow(/nonce mismatch/);
    expect(() => requireF013LocalTarget(dependencies({ readFile: (path: string) => path.endsWith("config.toml") ? config : "missing" }))).toThrow(/nonce is invalid/);
    const logs: string[] = [];
    const target = requireF013LocalTarget(dependencies({ log: (line: string) => logs.push(line) }));
    expect(target).toMatchObject({ kind: "local", projectId: F013_LOCAL_PROJECT_ID, apiUrl: F013_LOCAL_API_URL, dbUrl: F013_LOCAL_DB_URL, nonce });
    expect(logs).toEqual([expect.stringContaining(F013_LOCAL_PROJECT_ID)]);
  });

  it("sanitizes children and uses the fixed DB URL without linking", () => {
    const target = requireF013LocalTarget(dependencies());
    const ambient = { ...localEnv, PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: "secret", PGHOST: "production", DATABASE_URL: "hosted", TEST_FIXTURE_PASSWORD: "secret", F013_FIXTURES_APPROVED: "1", F013_LOCAL_RESTORE_APPROVED: "1" };
    const child = f013LocalChildEnv(target, ambient);
    expect(child).toMatchObject({ F013_TARGET: "local", F013_LOCAL_APPROVED: "1", F013_FIXTURES_APPROVED: "1" });
    for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "PGHOST", "DATABASE_URL", "TEST_FIXTURE_PASSWORD", "F013_LOCAL_RESTORE_APPROVED"]) expect(child[name]).toBeUndefined();
    const cli = supabaseCli(target, ["db", "query", "-f", queryFile], localEnv);
    expect(cli.args).toEqual(["supabase", "db", "query", "--db-url", F013_LOCAL_READ_ONLY_DB_URL, "-f", queryFile]);
    expect(cli.cwd).toBe(workdir);
    expect(cli.args).not.toContain("--linked");
    expect(F013_LOCAL_READ_ONLY_DB_URL).toBe("postgresql://postgres:postgres@127.0.0.1:55422/postgres?sslmode=disable");
    expect(cli.args.join(" ")).not.toContain(F013_PRODUCTION_REF);
  });

  it.each(["--linked", "link", "--project-ref", `--project-ref=${F013_PRODUCTION_REF}`, "push"])("rejects injected CLI token %s", (token) => {
    const target = requireF013LocalTarget(dependencies());
    expect(() => supabaseCli(target, ["db", "query", "-f", queryFile, token], localEnv)).toThrow(/forbidden/);
  });

  it.each(["--linked=true", "--linked=false", "--project-ref=abc", "--db-url=postgresql://host/db", "--db-url:host", "link", "push"])("rejects forbidden CLI prefix in SQL file slot: %s", (token) => {
    const target = requireF013LocalTarget(dependencies());
    expect(() => supabaseCli(target, ["db", "query", "-f", token], localEnv)).toThrow(/forbidden/);
    const bootstrap = requireF013BootstrapTarget(dependencies({ env: bootstrapEnv, inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }), generateNonce: () => nonce }));
    expect(() => f013BootstrapCli(bootstrap, { kind: "m4a", path: token }, bootstrapEnv)).toThrow();
  });

  it("requires an absolute existing regular SQL file in both builders", () => {
    const target = requireF013LocalTarget(dependencies());
    const bootstrap = requireF013BootstrapTarget(dependencies({ env: bootstrapEnv, inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }), generateNonce: () => nonce }));
    for (const file of ["relative.sql", resolve(repo, "missing.sql"), resolve(repo, "package.json"), repo]) {
      expect(() => supabaseCli(target, ["db", "query", "-f", file], localEnv)).toThrow();
      expect(() => f013BootstrapCli(bootstrap, { kind: "m4a", path: file }, bootstrapEnv)).toThrow();
    }
  });

  it("rejects Windows cmd metacharacters and unsafe path spellings", () => {
    expect(() => assertF013WindowsSafeSqlPath("C:\\safe\\schema.sql")).not.toThrow();
    for (const unsafe of ["C:\\with space\\schema.sql", "C:\\a&b\\schema.sql", "C:\\a|b\\schema.sql", "C:\\a^b\\schema.sql", "C:\\a%b\\schema.sql", "C:\\a\"b\\schema.sql", "C:\\a'b\\schema.sql", "C:\\a(b)\\schema.sql", "C:\\a<b>\\schema.sql", "C:\\a!b\\schema.sql", "relative.sql", "C:\\safe\\schema.txt"]) {
      expect(() => assertF013WindowsSafeSqlPath(unsafe), unsafe).toThrow(/shell metacharacters/);
    }
  });

  it("rejects a SQL symlink as a non-regular file", () => {
    const dir = mkdtempSync(join(tmpdir(), "f013-symlink-"));
    temporary.push(dir);
    const link = join(dir, "linked.sql");
    try { symlinkSync(queryFile, link, "file"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return; throw error; }
    const target = requireF013LocalTarget(dependencies());
    expect(() => supabaseCli(target, ["db", "query", "-f", link], localEnv)).toThrow(/regular file/);
  });

  it("rejects forged local CLI target and refuses production CLI when any F013 target variable exists", () => {
    const target = requireF013LocalTarget(dependencies());
    expect(() => supabaseCli({ ...target, dbUrl: `postgresql://postgres:postgres@${F013_PRODUCTION_REF}.supabase.co:5432/postgres` } as unknown as typeof target, ["db", "query", "-f", queryFile], localEnv)).toThrow(/verified fixed/);
    expect(() => supabaseCli({ ...target }, ["db", "query", "-f", queryFile], localEnv)).toThrow(/verified fixed/);
    expect(() => f013LocalChildEnv({ ...target }, localEnv)).toThrow(/target is invalid/);
    const proof = ["db", "query", "-f", queryFile];
    expect(() => supabaseCli({ kind: "production-default" }, proof, {})).toThrow(/F013_LIVE=1/);
    expect(supabaseCli({ kind: "production-default" }, proof, { F013_LIVE: "1" }).args).toContain("--linked");
    expect(supabaseCli({ kind: "production-default" }, proof, { F013_LIVE: "1", SUPABASE_ACCESS_TOKEN: "historical-proof-token", SUPABASE_SERVICE_ROLE_KEY: "must-not-inherit", DATABASE_URL: "must-not-inherit" }).env).toMatchObject({ SUPABASE_ACCESS_TOKEN: "historical-proof-token" });
    const productionChild = supabaseCli({ kind: "production-default" }, proof, { F013_LIVE: "1", SUPABASE_ACCESS_TOKEN: "historical-proof-token", SUPABASE_SERVICE_ROLE_KEY: "must-not-inherit", DATABASE_URL: "must-not-inherit" }).env;
    expect(productionChild.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(productionChild.DATABASE_URL).toBeUndefined();
    for (const variables of [{ F013_TARGET: "local" }, { F013_LOCAL_APPROVED: "1" }, { F013_TARGET_REF: F013_PRODUCTION_REF }, { F013_ISOLATED_TEST_APPROVED: "1" }, { F013_ISOLATED_ENV_FILE: "old" }, { F013_T071_LIVE: "1" }, { F013_LOCAL_BOOTSTRAP_APPROVED: "1" }, { F013_LOCAL_RESTORE_APPROVED: "1" }, { F013_DOCKER_PATH: "docker.exe" }, { F013_FIXTURES_APPROVED: "1" }]) {
      expect(() => supabaseCli({ kind: "production-default" }, proof, { F013_LIVE: "1", ...variables })).toThrow();
      expect(() => assertF013ProductionDefault(variables)).toThrow();
    }
    expect(() => productionChildEnv({ ...localEnv, SUPABASE_URL: "hosted" })).toThrow(/refused in F013 local mode/);
    expect(productionChildEnv({ NODE_ENV: "test", SUPABASE_SERVICE_ROLE_KEY: "no", PATH: "safe" }, { F010P_DIRECT_OBSERVATION: "approved" })).toEqual({ NODE_ENV: "test", PATH: "safe", F010P_DIRECT_OBSERVATION: "approved" });
    expect(() => productionChildEnv({}, { SUPABASE_SERVICE_ROLE_KEY: "no" })).toThrow(/Unsupported production child override/);
  });

  it("production env loader refuses local mode before reading the honeypot", () => {
    const cwd = mkdtempSync(join(tmpdir(), "f013-loader-"));
    temporary.push(cwd);
    writeFileSync(join(cwd, ".env.local"), `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.2:1\n`);
    expect(() => readProductionEnvLocal(localEnv, cwd)).toThrow(/refused in F013 local mode/);
    expect(() => productionChildEnv(localEnv)).toThrow(/refused in F013 local mode/);
    writeFileSync(join(cwd, ".env.local"), "F013_TARGET=local\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.2:1\n");
    expect(() => readProductionEnvLocal({}, cwd)).toThrow(/refused in F013 local mode/);
  });
});

describe("F013 future bootstrap capability, mocked only", () => {
  const bootstrapDependencies = (overrides: Record<string, unknown> = {}) => dependencies({
    env: bootstrapEnv,
    inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }),
    generateNonce: () => nonce,
    ...overrides,
  });

  it("requires separate approval and repeats the normal config, status, and credential checks", () => {
    let statusCalled = false;
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ env: localEnv, status: () => { statusCalled = true; return status; } }))).toThrow(/BOOTSTRAP_APPROVED=1/);
    expect(statusCalled).toBe(false);
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ env: { ...bootstrapEnv, SUPABASE_URL: "hosted" } }))).toThrow(/refuses inherited/);
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ status: () => ({ ...status, API_URL: `https://${F013_PRODUCTION_REF}.supabase.co` }) }))).toThrow(/endpoints/);
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ readFile: (path: string) => path.endsWith("config.toml") ? config.replace(F013_LOCAL_PROJECT_ID, "wrong") : nonce }))).toThrow(/config mismatch/);
  });

  it("requires both the nonce file and database identity to be absent", () => {
    let inspected = false;
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({
      exists: (path: string) => path.endsWith(".f013-local-identity"),
      inspectIdentity: () => { inspected = true; return { schemaExists: false, identityRowExists: false }; },
    }))).toThrow(/already exists/);
    expect(inspected).toBe(false);
    for (const identity of [{ schemaExists: true, identityRowExists: false }, { schemaExists: true, identityRowExists: true }, { schemaExists: false, identityRowExists: true }]) {
      expect(() => requireF013BootstrapTarget(bootstrapDependencies({ inspectIdentity: () => identity }))).toThrow(/re-bootstrap refused/);
    }
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ generateNonce: () => "weak" }))).toThrow(/nonce is invalid/);
  });

  it("accepts only an absent local identity and grants a separate one-time capability", () => {
    const target = requireF013BootstrapTarget(bootstrapDependencies());
    expect(target).toMatchObject({ kind: "bootstrap", dbUrl: F013_LOCAL_DB_URL, apiUrl: F013_LOCAL_API_URL, nonce });
    expect(Object.isFrozen(target)).toBe(true);
    expect(() => f013LocalChildEnv(target as unknown as ReturnType<typeof requireF013LocalTarget>, bootstrapEnv)).toThrow(/invalid/);
    expect(() => supabaseCli(target as unknown as ReturnType<typeof requireF013LocalTarget>, ["db", "query", "-f", queryFile], bootstrapEnv)).toThrow();
    const cli = f013BootstrapCli(target, { kind: "m4a", path: queryFile }, bootstrapEnv);
    expect(cli.args).toEqual(["supabase", "db", "query", "--db-url", F013_LOCAL_READ_ONLY_DB_URL, "--output-format", "json", "-f", queryFile]);
    expect(cli.cwd).toBe(workdir);
    expect(cli.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    for (const token of ["--linked", "link", "--project-ref", "push", "--db-url", `--db-url=postgresql://${F013_PRODUCTION_REF}.supabase.co/db`]) {
      expect(() => f013BootstrapCli(target, { kind: "m4a", path: token }, bootstrapEnv)).toThrow();
    }
    expect(() => f013BootstrapCli({ ...target }, { kind: "m4a", path: queryFile }, bootstrapEnv)).toThrow(/capability/);
  });

  it("refuses to finalize until the DB nonce matches, then links the completed file once", () => {
    const target = requireF013BootstrapTarget(bootstrapDependencies());
    const files = new Map<string, string>();
    const fileOps = {
      writeExclusive: (path: string, contents: string) => { if (files.has(path)) throw new Error("EEXIST"); files.set(path, contents); },
      linkExclusive: (source: string, destination: string) => { if (files.has(destination)) throw new Error("EEXIST"); files.set(destination, files.get(source)!); },
      remove: (path: string) => { files.delete(path); },
    };
    const finish = (readDatabaseNonce: () => string) => bootstrapDependencies({
      exists: (path: string) => files.has(path), readDatabaseNonce, fileOps,
    });
    expect(() => completeF013BootstrapNonce(target, finish(() => "b".repeat(64)))).toThrow(/nonce mismatch/);
    expect(files.size).toBe(0);
    completeF013BootstrapNonce(target, finish(() => nonce));
    expect(files.get(join(workdir, ".f013-local-identity"))).toBe(`${nonce}\n`);
    expect(files.size).toBe(1);
    expect(() => completeF013BootstrapNonce(target, finish(() => nonce))).toThrow(/capability/);
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ exists: (path: string) => files.has(path) }))).toThrow(/re-bootstrap refused/);
  });

  it("never overwrites a competing nonce file during an atomic link race", () => {
    const target = requireF013BootstrapTarget(bootstrapDependencies());
    const files = new Map<string, string>();
    const identityFile = join(workdir, ".f013-local-identity");
    const fileOps = {
      writeExclusive: (path: string, contents: string) => { files.set(path, contents); },
      linkExclusive: (_source: string, destination: string) => { files.set(destination, "competing nonce"); throw new Error("EEXIST"); },
      remove: (path: string) => { files.delete(path); },
    };
    expect(() => completeF013BootstrapNonce(target, bootstrapDependencies({
      exists: () => false, readDatabaseNonce: () => nonce, fileOps,
    }))).toThrow(/EEXIST/);
    expect(files.get(identityFile)).toBe("competing nonce");
    expect(files.size).toBe(1);
  });

  it("fails closed without an explicitly pinned nonce probe strategy", () => {
    expect(() => requireF013LocalTarget(dependencies({ verifyNonce: undefined }))).toThrow(/database identity could not be verified/);
    expect(() => requireF013BootstrapTarget(bootstrapDependencies({ inspectIdentity: undefined }))).toThrow(/identity absence could not be verified/);
    const target = requireF013BootstrapTarget(bootstrapDependencies());
    expect(() => completeF013BootstrapNonce(target, bootstrapDependencies({ readDatabaseNonce: undefined }))).toThrow(/database nonce could not be verified/);
  });
});

describe("F013 future restore pin validation, no SQL execution", () => {
  it("accepts only the pinned M4a bytes at the fixed local destination", () => {
    expect(() => assertF013PinnedRestoreFile("m4a", queryFile, F013_LOCAL_DB_URL)).not.toThrow();
    expect(() => assertF013PinnedRestoreFile("schema", f013PinnedPath("schema"), F013_LOCAL_DB_URL)).not.toThrow();
    expect(() => assertF013PinnedRestoreFile("m4a", queryFile, "postgresql://hosted/db")).toThrow(/fixed local/);
    const dir = mkdtempSync(join(tmpdir(), "f013-m4a-pin-"));
    temporary.push(dir);
    const changed = join(dir, "20260926100000_feature_013_cart_destination_rpcs.sql");
    writeFileSync(changed, `${readFileSync(queryFile, "utf8")}\n-- modified\n`);
    expect(() => assertF013ApprovedHash("m4a", readFileSync(changed))).toThrow(/hash/);
    expect(() => assertF013PinnedRestoreFile("m4a", changed, F013_LOCAL_DB_URL)).toThrow(/exact approved path/);
  });

  it("rejects absent or unpinned dump and identity files, wrong types, and data or roles dumps", () => {
    const dir = mkdtempSync(join(tmpdir(), "f013-pins-"));
    temporary.push(dir);
    for (const name of ["schema.sql", "identity.sql", "data.sql", "roles.sql", "wrong.txt"]) writeFileSync(join(dir, name), "select 1;\n");
    for (const name of ["schema.sql", "identity.sql", "data.sql", "roles.sql", "wrong.txt", "missing.sql"]) {
      expect(() => assertF013PinnedRestoreFile("schema", join(dir, name), F013_LOCAL_DB_URL)).toThrow();
    }
    for (const name of ["data.sql", "roles.sql", "wrong.txt"]) {
      expect(() => assertF013PinnedRestoreFile("schema", join(dir, name), F013_LOCAL_DB_URL)).toThrow(/type or exact approved path/);
    }
    expect(() => assertF013PinnedRestoreFile("identity-template", join(dir, "identity.sql"), F013_LOCAL_DB_URL)).toThrow(/exact approved path/);
    expect(() => assertF013PinnedRestoreFile("m4a", f013PinnedPath("schema"), F013_LOCAL_DB_URL)).toThrow(/exact approved path/);
    expect(() => assertF013PinnedRestoreFile("unknown" as "m4a", queryFile, F013_LOCAL_DB_URL)).toThrow(/Unknown/);
  });

  it("requires identity SQL to create schema and table and insert one row exactly once", () => {
    const template = readFileSync(f013PinnedPath("identity-template"), "utf8");
    const valid = template.replace("__F013_NONCE__", nonce);
    expect(() => assertF013IdentityTemplate(template)).not.toThrow();
    expect(() => assertF013ApprovedHash("identity-template", Buffer.from(`${template}\n-- altered`))).toThrow(/hash/);
    expect(() => assertF013IdentitySqlNonIdempotent(valid)).not.toThrow();
    for (const mutation of [valid.replace("create schema", "create schema if not exists"), valid.replace("create table", "create table if not exists"), `${valid} insert into f013_local.identity (id, nonce) values (true, '${nonce}');`, valid.replace(`'${nonce}'`, `'${nonce}'), (true, '${nonce}'`), `${valid}\ndo $$ begin null; end $$;`, `${valid}\nalter table f013_local.identity add column bad text;`, `${valid}\ndrop table f013_local.identity;`, `${valid}\nexecute 'select 1';`, `${valid}\ncreate function bad() returns void language sql security definer as $$ select 1 $$;`]) {
      expect(() => assertF013IdentitySqlNonIdempotent(mutation)).toThrow();
    }
    expect(() => assertF013IdentityTemplate(template.replace("__F013_NONCE__", ""))).toThrow(/placeholder/);
    expect(() => assertF013IdentityTemplate(template.replace("__F013_NONCE__", "__F013_NONCE____F013_NONCE__"))).toThrow(/placeholder/);
  });

  it("renders one approved nonce into a private temporary file and rejects substitution", () => {
    const target = requireF013BootstrapTarget(dependencies({ env: bootstrapEnv, inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }), generateNonce: () => nonce }));
    const rendered = renderF013IdentitySql(target, bootstrapEnv);
    try {
      expect(rendered.sourceTemplateHash).toMatch(/^[a-f0-9]{64}$/);
      expect(readFileSync(rendered.path, "utf8")).toContain(nonce);
      expect(f013BootstrapCli(target, rendered, bootstrapEnv).args.at(-1)).toBe(rendered.path);
      expect(() => f013BootstrapCli(target, { ...rendered }, bootstrapEnv)).toThrow(/provenance/);
      writeFileSync(rendered.path, "select 1;");
      expect(() => f013BootstrapCli(target, rendered, bootstrapEnv)).toThrow(/changed/);
    } finally { discardF013RenderedIdentity(rendered); }
    expect(() => f013BootstrapCli(target, rendered, bootstrapEnv)).toThrow(/provenance/);
  });

  it("builds the ordered local restore plan only after all pins and target checks", () => {
    const target = requireF013BootstrapTarget(dependencies({ env: bootstrapEnv, inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }), generateNonce: () => nonce }));
    const rendered = renderF013IdentitySql(target, bootstrapEnv);
    try {
      const plan = buildF013RestorePlan(target, rendered, bootstrapEnv);
      expect(plan.map((step) => step.id)).toEqual(F013_RESTORE_ORDER);
      expect(plan.map((step) => step.id)).toEqual(["pre-schema-acl", "restore-schema", "seed-baseline", "restore-auth-trigger", "apply-m4a", "m4a-postflight", "bootstrap-identity", "catalog-parity"]);
      const commands = plan.flatMap((step) => step.commands);
      expect(commands.filter((command) => command.transport === "docker-psql-stdin").map((command) => command.kind)).toEqual(["pre-schema-acl", "schema", "baseline", "auth-trigger", "m4a", "identity-rendered"]);
      expect(plan[0]?.commands[0]).toMatchObject({ transport: "docker-psql-stdin", kind: "pre-schema-acl", path: f013PinnedPath("pre-schema-acl") });
      expect(plan[1]?.commands[0]).toMatchObject({ transport: "docker-psql-stdin", kind: "schema", path: f013PinnedPath("schema") });
      expect(commands.filter((command) => command.transport === "supabase-json").every((command) => command.args.includes(F013_LOCAL_READ_ONLY_DB_URL) && !command.args.includes("--linked"))).toBe(true);
      expect(commands.filter((command) => command.transport === "docker-psql-stdin").every((command) => !Object.hasOwn(command, "args"))).toBe(true);
      expect(plan.find((step) => step.id === "apply-m4a")?.commands.map((command) => command.transport === "supabase-json" ? command.args.at(-1) : command.path)).toEqual([f013PinnedPath("role-check"), f013PinnedPath("m4a")]);
      expect(plan.find((step) => step.id === "apply-m4a")?.requiresTrueResult).toBe(true);
      const catalog = plan.find((step) => step.id === "catalog-parity")?.commands[0];
      expect(catalog?.transport).toBe("supabase-json");
      if (catalog?.transport === "supabase-json") expect(catalog.args.at(-1)).toBe(f013PinnedPath("catalog-check"));
      expect(plan.find((step) => step.id === "bootstrap-identity")?.finalizeNonceAfterDbVerify).toBe(true);
      expect(() => assertF013RestorePlanOrder(plan.slice(1))).toThrow(/omitted or reordered/);
      expect(() => assertF013RestorePlanOrder([...plan].reverse())).toThrow(/omitted or reordered/);
      expect(() => buildF013RestorePlan({ ...target }, rendered, bootstrapEnv)).toThrow(/capability/);
      expect(() => assertF013M4aRolePreconditionResult(false)).toThrow(/BYPASSRLS/);
      expect(() => assertF013M4aRolePreconditionResult(true)).not.toThrow();
    } finally { discardF013RenderedIdentity(rendered); }
  });

  it("pins local baseline, trigger, role guard, and catalog SQL to reviewed definitions", () => {
    const baseline = readFileSync(f013PinnedPath("baseline"), "utf8");
    for (const fragment of ["commerce_settings", "proforma_validity_hours", "24, false, true", "'{}'::uuid[]", "platform_settings", "kyb-evidence", "public-assets", "listing-media"]) expect(baseline).toContain(fragment);
    const trigger = readFileSync(f013PinnedPath("auth-trigger"), "utf8");
    const migration = readFileSync(resolve(repo, "supabase/migrations/20260912000000_feature_003_profile_bootstrap.sql"), "utf8");
    expect(migration).toContain(trigger.slice(trigger.indexOf("drop trigger if exists")).trim());
    const functionDefinition = trigger.slice(trigger.indexOf("create or replace function"), trigger.indexOf("drop trigger if exists")).trim().replace(/\s+/g, " ");
    expect(migration.replace(/\s+/g, " ")).toContain(functionDefinition);
    expect(readFileSync(f013PinnedPath("role-check"), "utf8")).toContain("rolbypassrls or rolsuper");
    expect(readFileSync(f013PinnedPath("catalog-check"), "utf8")).toContain("identity_singleton");
    for (const kind of ["baseline", "auth-trigger", "role-check", "postflight", "catalog-check", "identity-template"] as const) {
      expect(() => assertF013PinnedRestoreFile(kind, f013PinnedPath(kind), F013_LOCAL_DB_URL)).not.toThrow();
    }
  });

  it("pins a public/postgres-only pre-schema default ACL normalization", () => {
    const path = f013PinnedPath("pre-schema-acl");
    const sql = readFileSync(path, "utf8");
    const statements = sql.split(";").map((part) => part.trim()).filter(Boolean);
    expect(statements).toEqual(["TABLES", "FUNCTIONS", "SEQUENCES"].map((objectType) =>
      `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${objectType} FROM anon, authenticated, service_role`));
    expect(sql).not.toMatch(/\b(?:auth|storage)\b|mxejnutukgxyccnohglo|https?:\/\/|data\.sql|roles\.sql/i);
    expect(sql).not.toMatch(/REVOKE\s+ALL\s+ON\s+\w+\s+FROM\s+postgres\b/i);
    expect(() => assertF013PinnedRestoreFile("pre-schema-acl", path, F013_LOCAL_DB_URL)).not.toThrow();
    expect(() => assertF013ApprovedHash("pre-schema-acl", Buffer.from(`${sql}-- altered`))).toThrow(/hash/);
    expect(() => assertF013PinnedRestoreFile("pre-schema-acl", path, "postgresql://hosted.example/db")).toThrow(/fixed local/);
  });

  it("dry-runs all ordered commands with mocked local probes and no SQL execution", () => {
    let sqlExecuted = false;
    const dryRun = dryRunF013LocalRestore(dependencies({
      env: bootstrapEnv,
      inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }),
      generateNonce: () => nonce,
      executePsql: () => { sqlExecuted = true; throw new Error("SQL execution forbidden in dry-run test"); },
    }));
    try {
      expect(dryRun.target).toContain(F013_LOCAL_DB_URL);
      expect(dryRun.databaseIdentityUnverified).toBe(true);
      expect(dryRun.nonceIsPlaceholder).toBe(true);
      expect(dryRun.steps.map((step) => step.id)).toEqual(F013_RESTORE_ORDER);
      expect(dryRun.steps.flatMap((step) => step.commands).length).toBe(9);
      expect(sqlExecuted).toBe(false);
    } finally { dryRun.dispose(); }
  });

  it("requires a separate execution gate before any target probe", () => {
    let statusCalled = false;
    expect(() => executeF013LocalRestore(dependencies({
      env: bootstrapEnv,
      status: () => { statusCalled = true; return status; },
    }))).toThrow(/RESTORE_APPROVED=1/);
    expect(statusCalled).toBe(false);
  });

  it("routes every mutation through pinned SQL bytes and keeps the three checks on JSON", () => {
    const events: string[] = [];
    const rows = [...Array.from({ length: 12 }, (_, index) => ({ seq: index + 1, check_name: `check ${index + 1}`, ok: true })), { seq: 999, check_name: "ALL CHECKS PASSED", ok: true }];
    const catalog = { status: "F013_CATALOG_OK", commerce_settings_present: true, platform_settings_present: true, identity_present: true, commerce_settings_safe: true, platform_settings_singleton: true, identity_singleton: true, kyb_bucket_present: true, public_assets_bucket_present: true, listing_media_bucket_present: true, auth_trigger_present: true };
    executeF013LocalRestore(dependencies({
      env: { ...bootstrapEnv, F013_LOCAL_RESTORE_APPROVED: "1" },
      inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }),
      generateNonce: () => nonce,
      runMutation: (command: { kind: string; path: string }, bytes: Buffer, cleanEnv: NodeJS.ProcessEnv) => {
        events.push(command.kind);
        expect(bytes.equals(readFileSync(command.path))).toBe(true);
        expect(cleanEnv.F013_LOCAL_RESTORE_APPROVED).toBeUndefined();
      },
      runJsonCheck: (command: { args: string[] }) => {
        expect(command.args).toContain("--output-format");
        events.push(`json:${command.args.at(-1)?.split(/[\\/]/).at(-1)}`);
        expect(command.args).toContain(F013_LOCAL_READ_ONLY_DB_URL);
        if (command.args.at(-1) === f013PinnedPath("role-check")) return JSON.stringify([{ f013_role_status: "F013_ROLE_OK" }]);
        if (command.args.at(-1) === f013PinnedPath("postflight")) return JSON.stringify(rows);
        return JSON.stringify([catalog]);
      },
      finalizeNonce: () => { events.push("finalize"); },
    }));
    expect(events).toEqual([
      "pre-schema-acl", "schema", "baseline", "auth-trigger", "json:m4a-role-precondition.sql", "m4a",
      "json:20260926_feature_013_cart_destination_rpcs_postflight.sql", "identity-rendered", "json:catalog-parity.sql", "finalize",
    ]);
  });

  it("stops at the first failed psql transport result", () => {
    const events: string[] = [];
    expect(() => executeF013LocalRestore(dependencies({
      env: { ...bootstrapEnv, F013_LOCAL_RESTORE_APPROVED: "1" },
      inspectIdentity: () => ({ schemaExists: false, identityRowExists: false }),
      generateNonce: () => nonce,
      runMutation: (command: { kind: string }) => { events.push(command.kind); throw new Error("mocked psql exit 3"); },
      runJsonCheck: () => { events.push("json"); throw new Error("must not run"); },
      finalizeNonce: () => { events.push("finalize"); },
    }))).toThrow(/mocked psql exit 3/);
    expect(events).toEqual(["pre-schema-acl"]);
  });

  it("requires every M4a postflight check and row 999 success", () => {
    const rows = [...Array.from({ length: 12 }, (_, index) => ({ seq: index + 1, check_name: `check ${index + 1}`, ok: true })), { seq: 999, check_name: "ALL CHECKS PASSED", ok: true }];
    const passed = JSON.stringify(rows);
    expect(() => assertF013M4aPostflightOutput(passed)).not.toThrow();
    expect(() => assertF013M4aPostflightOutput(JSON.stringify(rows.map((row) => row.seq === 1 ? { ...row, ok: false } : row)))).toThrow();
    expect(() => assertF013M4aPostflightOutput(JSON.stringify(rows.slice(0, -1)))).toThrow(/omitted/);
    expect(() => assertF013M4aPostflightOutput(passed.replace("ALL CHECKS PASSED", "CHECKS FAILED"))).toThrow(/row 999/);
    expect(() => assertF013M4aPostflightOutput(JSON.stringify([...rows.slice(0, -1), rows[0]]))).toThrow(/duplicate/);
    for (const output of ["not-json", JSON.stringify(rows.map((row) => row.seq === 1 ? { ...row, seq: "1" } : row)), JSON.stringify({ rows }), JSON.stringify([...rows.slice(0, -1), { ...rows[12], ok: "true" }]), JSON.stringify([...rows.slice(0, -1), { ...rows[12], seq: 1000 }]), JSON.stringify([...rows.slice(0, -1), { ...rows[12], extra: true }])]) expect(() => assertF013M4aPostflightOutput(output)).toThrow();
    expect(() => assertF013M4aRoleOutput(JSON.stringify([{ f013_role_status: "F013_ROLE_OK" }]))).not.toThrow();
    for (const output of ["postgres | F013_ROLE_OK", "not-json", JSON.stringify({ rows: [{ f013_role_status: "F013_ROLE_OK" }] }), JSON.stringify([{ f013_role_status: "F013_ROLE_OK" }, { f013_role_status: "F013_ROLE_OK" }]), JSON.stringify([{ f013_role_status: "F013_ROLE_DENIED" }]), JSON.stringify([{ f013_role_status: "F013_ROLE_OK", extra: true }])]) expect(() => assertF013M4aRoleOutput(output)).toThrow();
    const catalog = { status: "F013_CATALOG_OK", commerce_settings_present: true, platform_settings_present: true, identity_present: true, commerce_settings_safe: true, platform_settings_singleton: true, identity_singleton: true, kyb_bucket_present: true, public_assets_bucket_present: true, listing_media_bucket_present: true, auth_trigger_present: true };
    expect(() => assertF013CatalogOutput(JSON.stringify([catalog]))).not.toThrow();
    for (const output of ["F013_CATALOG_OK", "not-json", JSON.stringify({ rows: [catalog] }), JSON.stringify([{ ...catalog, status: "F013_CATALOG_FAILED" }]), JSON.stringify([{ ...catalog, auth_trigger_present: false }]), JSON.stringify([{ ...catalog, extra: true }]), JSON.stringify([catalog, catalog])]) expect(() => assertF013CatalogOutput(output)).toThrow();
  });
});

describe("F013 local honeypot spawns", () => {
  function spawnScript(script: string, args: string[], overrides: Record<string, string> = {}) {
    const cwd = mkdtempSync(join(tmpdir(), "f013-spawn-"));
    temporary.push(cwd);
    // Reading this path would produce EISDIR (or EPERM on some Windows builds).
    mkdirSync(join(cwd, ".env.local"));
    mkdirSync(join(cwd, "tools", "f013-local", "supabase"), { recursive: true });
    writeFileSync(join(cwd, "tools", "f013-local", "supabase", "config.toml"), config);
    const bin = join(cwd, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "npx.cmd"), "@echo off\r\necho mocked local status unavailable 1>&2\r\nexit /b 1\r\n");
    writeFileSync(join(bin, "npx"), "#!/bin/sh\necho mocked local status unavailable >&2\nexit 1\n", { mode: 0o755 });
    const searchPath = `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`;
    const env = { NODE_ENV: "test" as const, PATH: searchPath, Path: searchPath, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec, PATHEXT: process.env.PATHEXT, TEMP: process.env.TEMP, TMP: process.env.TMP, ...localEnv, ...overrides };
    let scriptPath = resolve(repo, script);
    if (script === "@fixture-helper") {
      scriptPath = join(cwd, "fixture-helper.mts");
      writeFileSync(scriptPath, `import { resetCheckoutFixtures } from ${JSON.stringify(pathToFileURL(resolve(repo, "tests/auth/fixture-session.ts")).href)};\nresetCheckoutFixtures();\n`);
    }
    return spawnSync(process.execPath, [resolve(repo, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", resolve(repo, "tsconfig.json"), scriptPath, ...args], { cwd, env, encoding: "utf8", timeout: 15_000 });
  }

  it.each([{ args: [] }, { args: ["--teardown"] }, { args: ["--reset-checkout-fixtures"] }, { args: ["--prepare-f013-fixtures"] }])("seed $args refuses before a client or honeypot connection", ({ args }) => {
    const result = spawnScript("scripts/seed-test-fixtures.ts", args);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/local stack\/status unavailable/);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/EISDIR|EPERM/);
  });

  it("T013 script refuses local mode before reading the honeypot", () => {
    const result = spawnScript("scripts/t013-delivery-live-proof.ts", []);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/T013 proof is production-only; refused in F013 local mode/);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/EISDIR|EPERM/);
  });

  it("fixture-session legacy child helper fails at local status before a fixture child", () => {
    const result = spawnScript("@fixture-helper", []);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/local stack\/status unavailable/);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/EISDIR|EPERM/);
  });

  it.each(["--PREPARE-F013-FIXTURES", "--f013-future=value", "--F013-M1-LIVE-SETUP=1"])("refuses unknown F013 argument %s before status", (argument) => {
    const result = spawnScript("scripts/seed-test-fixtures.ts", [argument]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Unknown F013 operation refused/);
    expect(`${result.stdout}\n${result.stderr}`).not.toMatch(/mocked local status unavailable|127\.0\.0\.2|honeypot/);
  });

  it.each(["F013_TARGET_REF", "F013_ISOLATED_TEST_APPROVED", "F013_ISOLATED_ENV_FILE"])("seed and T013 refuse retired %s", (name) => {
    for (const script of ["scripts/seed-test-fixtures.ts", "scripts/t013-delivery-live-proof.ts"]) {
      const result = spawnScript(script, [], { [name]: "old" });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/hosted isolated mode retired/);
    }
  });
});
