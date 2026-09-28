import { createHash, randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";

import { assertF013BootstrapCapability, assertF013WindowsSafeSqlPath, F013_LOCAL_DB_URL, F013TargetError, type F013BootstrapTarget } from "./f013-local-target";

export type F013PinnedFileKind = "pre-schema-acl" | "schema" | "m4a" | "baseline" | "auth-trigger" | "role-check" | "postflight" | "catalog-check" | "identity-template";
const repo = process.cwd();
const localSql = (name: string) => resolve(repo, "tools", "f013-local", "sql", name);
const PINS: Readonly<Record<F013PinnedFileKind, { path: string; algorithm: "sha256" | "md5"; hash: string }>> = Object.freeze({
  "pre-schema-acl": { path: localSql("pre-schema-acl-normalization.sql"), algorithm: "sha256", hash: "f6a5a65fa55601bcaa0690a4a6c646d0eb91fe690232849f1f5e5150fb17ce97" },
  schema: { path: "C:\\Users\\Dell\\hills-coffee-backups\\2026-09-26-pre-m4a\\schema.sql", algorithm: "sha256", hash: "a51ec3853a6daeecc845766cc843c209eece5fc5caf0c8b951fac7aac369fc21" },
  m4a: { path: resolve(repo, "supabase/migrations/20260926100000_feature_013_cart_destination_rpcs.sql"), algorithm: "md5", hash: "8e39cf78988524497c194f2718cc2db7" },
  baseline: { path: localSql("baseline-reference.sql"), algorithm: "sha256", hash: "f53f4dc7472993e909919a7294ec217519e9e68fd68f7a5309a92e480567e478" },
  "auth-trigger": { path: localSql("feature003-auth-trigger.sql"), algorithm: "sha256", hash: "5a229081478c2f1700e642edf47ccbab4ed93fbf9a2363da919ba67568af3640" },
  "role-check": { path: localSql("m4a-role-precondition.sql"), algorithm: "sha256", hash: "2d841b505cd8e85abbe734c58b5e2a58a5c0a521917e109198f4a39e56962113" },
  postflight: { path: resolve(repo, "supabase/maintenance/20260926_feature_013_cart_destination_rpcs_postflight.sql"), algorithm: "sha256", hash: "38cdc1ff6bea91769e2ec8401a6df9d6735ca58fb39d719e7eddf1684e1541b2" },
  "catalog-check": { path: localSql("catalog-parity.sql"), algorithm: "sha256", hash: "62c3b3153de2c52ad400ce3c1681af557b66539e6f8a8965573ec5d4ef6585c2" },
  "identity-template": { path: localSql("identity-template.sql"), algorithm: "sha256", hash: "5c092060b40e04fa295499a067bcafaf6af0023d627c05d880dc8022b6ce3ebd" },
});

export function f013PinnedPath(kind: F013PinnedFileKind): string {
  if (!Object.hasOwn(PINS, kind)) throw new F013TargetError("Unknown F013 restore file kind.");
  return PINS[kind].path;
}
const digest = (bytes: Buffer, algorithm: "sha256" | "md5") => createHash(algorithm).update(bytes).digest("hex");

export function assertF013ApprovedHash(kind: F013PinnedFileKind, bytes: Buffer): void {
  if (!Object.hasOwn(PINS, kind) || digest(bytes, PINS[kind].algorithm) !== PINS[kind].hash) throw new F013TargetError("Restore file hash is not approved.");
}

/** Exact path, exact hash, fixed loopback destination. No SQL is executed. */
export function assertF013PinnedRestoreFile(kind: F013PinnedFileKind, file: string, destination: string): void {
  if (destination !== F013_LOCAL_DB_URL) throw new F013TargetError("Restore file requires the fixed local destination.");
  if (!Object.hasOwn(PINS, kind)) throw new F013TargetError("Unknown F013 restore file kind.");
  if (!isAbsolute(file) || extname(file).toLowerCase() !== ".sql" || /^(?:data|roles)\.sql$/i.test(basename(file)) || resolve(file) !== resolve(PINS[kind].path)) {
    throw new F013TargetError("Restore file type or exact approved path is forbidden.");
  }
  if (process.platform === "win32") assertF013WindowsSafeSqlPath(file);
  let bytes: Buffer;
  try {
    if (!lstatSync(file).isFile()) throw new F013TargetError("Restore path is not a regular file.");
    bytes = readFileSync(file);
  } catch (error) {
    if (error instanceof F013TargetError) throw error;
    throw new F013TargetError("Restore file is missing or unreadable.");
  }
  assertF013ApprovedHash(kind, bytes);
  if (kind === "identity-template") assertF013IdentityTemplate(bytes.toString("utf8"));
}

export const F013_NONCE_PLACEHOLDER = "__F013_NONCE__";
function normalizedStatements(sql: string): string[] {
  if (/--|\/\*|\*\//.test(sql)) throw new F013TargetError("Identity SQL comments are not allowed.");
  return sql.split(";").map((statement) => statement.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/** Deliberately narrow grammar for the reviewed singleton template. */
export function assertF013IdentitySqlNonIdempotent(sql: string): void {
  const statements = normalizedStatements(sql);
  if (statements.length !== 4 ||
      !/^create schema f013_local$/i.test(statements[0]!) ||
      !/^revoke all on schema f013_local from public$/i.test(statements[1]!) ||
      !/^create table f013_local\.identity \( id boolean primary key default true check \(id\), nonce text not null check \(nonce ~ '\^\[a-f0-9\]\{64\}\$'\) \)$/i.test(statements[2]!) ||
      !/^insert into f013_local\.identity \(id, nonce\) values \(true, '[a-f0-9]{64}'\)$/i.test(statements[3]!)) {
    throw new F013TargetError("Identity SQL must create the exact non-idempotent singleton and insert one nonce row.");
  }
}

export function assertF013IdentityTemplate(sql: string): void {
  if (sql.split(F013_NONCE_PLACEHOLDER).length !== 2) throw new F013TargetError("Identity template must contain exactly one nonce placeholder.");
  assertF013IdentitySqlNonIdempotent(sql.replace(F013_NONCE_PLACEHOLDER, "a".repeat(64)));
}

export type F013RenderedIdentity = Readonly<{ kind: "identity-rendered"; path: string; sourceTemplateHash: string; nonce: string }>;
const RENDERED = new WeakMap<F013RenderedIdentity, { target: F013BootstrapTarget; hash: string; directory: string }>();

/** Creates a private temporary SQL file from the pinned template; never executes it. */
export function renderF013IdentitySql(target: F013BootstrapTarget, env: Record<string, string | undefined> = process.env, tempRoot: string = tmpdir()): F013RenderedIdentity {
  assertF013BootstrapCapability(target, env);
  if (!/^[a-f0-9]{64}$/.test(target.nonce)) throw new F013TargetError("F013 bootstrap nonce is invalid.");
  const template = f013PinnedPath("identity-template");
  assertF013PinnedRestoreFile("identity-template", template, target.dbUrl);
  const source = readFileSync(template, "utf8");
  assertF013IdentityTemplate(source);
  const rendered = source.replace(F013_NONCE_PLACEHOLDER, target.nonce);
  assertF013IdentitySqlNonIdempotent(rendered);
  const directory = join(tempRoot, `f013-identity-${randomBytes(8).toString("hex")}`);
  const file = join(directory, "identity-rendered.sql");
  if (process.platform === "win32") assertF013WindowsSafeSqlPath(file);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  try { writeFileSync(file, rendered, { flag: "wx", mode: 0o600 }); }
  catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
  const result: F013RenderedIdentity = Object.freeze({ kind: "identity-rendered", path: file, sourceTemplateHash: PINS["identity-template"].hash, nonce: target.nonce });
  RENDERED.set(result, { target, hash: digest(Buffer.from(rendered), "sha256"), directory });
  return result;
}

export function assertF013RenderedIdentity(value: F013RenderedIdentity, target: F013BootstrapTarget): string {
  const record = RENDERED.get(value);
  if (!record || record.target !== target || value.kind !== "identity-rendered" || value.nonce !== target.nonce || value.sourceTemplateHash !== PINS["identity-template"].hash || value.path !== join(record.directory, "identity-rendered.sql")) {
    throw new F013TargetError("Rendered identity file lacks in-process template provenance.");
  }
  assertF013PinnedRestoreFile("identity-template", f013PinnedPath("identity-template"), target.dbUrl);
  if (process.platform === "win32") assertF013WindowsSafeSqlPath(value.path);
  try {
    if (!lstatSync(value.path).isFile() || digest(readFileSync(value.path), "sha256") !== record.hash) throw new F013TargetError("Rendered identity file changed after validation.");
  } catch (error) {
    if (error instanceof F013TargetError) throw error;
    throw new F013TargetError("Rendered identity file is missing.");
  }
  assertF013IdentitySqlNonIdempotent(readFileSync(value.path, "utf8"));
  return value.path;
}

export function discardF013RenderedIdentity(value: F013RenderedIdentity): void {
  const record = RENDERED.get(value);
  if (record) { RENDERED.delete(value); rmSync(record.directory, { recursive: true, force: true }); }
}
