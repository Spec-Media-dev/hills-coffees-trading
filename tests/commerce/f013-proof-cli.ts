import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const defaultCa = path.resolve(process.cwd(), "supabase/.temp/supabase-root-ca.pem");
if (!process.env.NODE_EXTRA_CA_CERTS && existsSync(defaultCa)) {
  process.env.NODE_EXTRA_CA_CERTS = defaultCa;
}

/**
 * Synchronous sleep using a no-op spawnSync call (avoids async/await in synchronous proof-cli).
 * Used exclusively for retry backoff in inspectFeature015State when the Supabase CLI
 * login-role endpoint is rate-limited (HTTP 403).
 */
function sleepMs(ms: number): void {
  // spawnSync with a timeout acts as a synchronous pause; the command times out immediately
  // but the parent blocks for exactly `ms` milliseconds before the ETIMEDOUT resolves.
  // We use a short-lived Node process that calls setTimeout as a cross-platform synchronous sleep.
  spawnSync(
    process.execPath,
    ["-e", `setTimeout(()=>{},${ms})`],
    { timeout: ms + 5000, stdio: "ignore", shell: false },
  );
}

import {
  F013_PRODUCTION_REF,
  requireF013LocalTarget,
  resolveF013Mode,
  supabaseCli,
} from "@/scripts/f013-local-target";
import { productionEnvValue } from "@/scripts/f013-production-env.mjs";

export interface SqlExecutionResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type Feature015State = "ABSENT" | "APPLIED" | "INCONSISTENT";

/**
 * Underlying command execution runner capturing process exit status, stdout, and stderr.
 */
export function executeProofSqlCommand(
  sql: string,
  prefix: string,
  timeout = 180_000,
): SqlExecutionResult {
  const mode = resolveF013Mode();
  const target = mode.kind === "local" ? requireF013LocalTarget() : mode;
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const file = path.join(dir, "query.sql");
  try {
    writeFileSync(file, sql);
    const command = supabaseCli(target, ["db", "query", "-f", file]);
    const res = spawnSync(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      encoding: "utf8",
      shell: command.command === "npx" && process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });
    return {
      status: res.status,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      error: res.error,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Executes a SQL query asynchronously in a separate process/session.
 * Used for genuine database concurrency and locking tests where two sessions overlap.
 */
export function runSqlSessionAsync(
  sql: string,
  prefix: string,
  timeout = 180_000,
): Promise<SqlExecutionResult> {
  return new Promise((resolve, reject) => {
    const mode = resolveF013Mode();
    const target = mode.kind === "local" ? requireF013LocalTarget() : mode;
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    const file = path.join(dir, "query.sql");
    try {
      writeFileSync(file, sql);
    } catch (err) {
      rmSync(dir, { recursive: true, force: true });
      return reject(err);
    }

    let command: ReturnType<typeof supabaseCli>;
    try { command = supabaseCli(target, ["db", "query", "-f", file]); }
    catch (error) {
      rmSync(dir, { recursive: true, force: true });
      return reject(error);
    }
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      env: command.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: command.command === "npx" && process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
    }

    const timer = setTimeout(() => {
      child.kill();
      rmSync(dir, { recursive: true, force: true });
      reject(
        new Error(
          `runSqlSessionAsync timed out after ${timeout}ms (${prefix})`,
        ),
      );
    }, timeout);

    child.on("error", (err) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      reject(err);
    });

    child.on("close", (status) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      resolve({ status, stdout, stderr });
    });
  });
}

/** Single execution path for historical Batch B and future verified local proof queries. */
export function runF013ProofSqlFile(
  sql: string,
  prefix: string,
  timeout = 180_000,
): string {
  const result = executeProofSqlCommand(sql, prefix, timeout);
  if (result.error) {
    return `${result.stdout}\n${result.stderr}\n${result.error.message}`;
  }
  return result.status === 0
    ? result.stdout
    : `${result.stdout}\n${result.stderr}`;
}

/**
 * Strict SQL execution helper for Feature 015 live verification.
 * Captures process exit status, stdout, and stderr.
 * Throws an Error on process spawn/system error, non-zero exit code,
 * or Postgres ERROR/FATAL/PANIC messages.
 * Does NOT swallow or ignore errors.
 */
export function runProofSqlFileStrict(
  sql: string,
  prefix: string,
  timeout = 180_000,
): string {
  // Retry up to 3 times if the Supabase CLI login-role endpoint returns a transient 403.
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 15_000;
  let result = executeProofSqlCommand(sql, prefix, timeout);
  for (let attempt = 2; attempt <= MAX_RETRIES; attempt++) {
    const combined403 = `${result.stdout}\n${result.stderr}`;
    if (result.status !== 0 && /login role status 403/i.test(combined403)) {
      sleepMs(BACKOFF_MS);
      result = executeProofSqlCommand(sql, prefix, timeout);
    } else {
      break;
    }
  }

  if (result.error) {
    const errorDetails = `STDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
    throw new Error(
      `runProofSqlFileStrict process error (${prefix}): ${result.error.message}\n${errorDetails}`,
    );
  }

  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  if (result.status !== 0) {
    throw new Error(
      `runProofSqlFileStrict failed with non-zero exit status (${prefix}, exit code ${result.status}):\n${combinedOutput.trim()}`,
    );
  }

  if (/\b(ERROR|FATAL|PANIC):\s+/i.test(combinedOutput)) {
    throw new Error(
      `runProofSqlFileStrict encountered database error output (${prefix}, exit code ${result.status}):\n${combinedOutput.trim()}`,
    );
  }

  return combinedOutput;
}


/**
 * Asserts that a SQL file execution fails with one exact causal PostgreSQL error message.
 * Used exclusively for verified negative security/guard checks like non-empty bucket rollback refusal.
 *
 * Strict requirements:
 * 1. Captures process exit status, stdout, and stderr.
 * 2. Requires a non-zero command exit.
 * 3. Rejects connection, authentication, process, FATAL, and PANIC failures.
 * 4. Parses PostgreSQL ERROR records from both stdout and stderr.
 * 5. Requires exactly one normalized ERROR message equal to the expected message.
 */
export function expectProofSqlFileFailure(
  sql: string,
  prefix: string,
  expectedMessage: string,
  timeout = 180_000,
): string {
  const result = executeProofSqlCommand(sql, prefix, timeout);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;

  if (result.error) {
    throw new Error(
      `expectProofSqlFileFailure encountered a process/spawn failure instead of the rollback guard (${prefix}): ${result.error.message}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
  if (result.status === 0) {
    throw new Error(
      `expectProofSqlFileFailure expected a non-zero database exit (${prefix}), but command succeeded:\n${combinedOutput.trim()}`,
    );
  }
  if (
    /(could not connect to server|connection refused|is the server running|connection.*failed|authentication failed|password authentication failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT)/i.test(
      combinedOutput,
    )
  ) {
    throw new Error(
      `expectProofSqlFileFailure rejected connection/authentication failure (${prefix}):\n${combinedOutput.trim()}`,
    );
  }
  if (/^\s*(?:FATAL|PANIC):/im.test(combinedOutput)) {
    throw new Error(
      `expectProofSqlFileFailure rejected Postgres FATAL/PANIC (${prefix}):\n${combinedOutput.trim()}`,
    );
  }

  // PostgreSQL emits an ERROR record at the beginning of a physical output line or inside a JSON API response.
  // Anchoring the record excludes SQL literals, comments, and echoed query fragments.
  let rawErrors: string[] = [];
  const directMatches = combinedOutput
    .split(/\r?\n/)
    .map((line) => /^\s*ERROR:\s+(.+?)\s*$/i.exec(line)?.[1])
    .filter((message): message is string => message !== undefined);

  if (directMatches.length > 0) {
    rawErrors = directMatches;
  } else {
    // When executed via Supabase Management API (--linked), error is wrapped inside a JSON message string:
    // e.g. {"_tag":"Error","error":{"code":"DbQueryUnexpectedStatusError","message":"unexpected status 400: {\"message\":\"Failed to run sql query: ERROR:  P0001: rollback_aborted...\"}"}}
    const jsonErrorRegex = /ERROR:\s+(?:[A-Z0-9]{5}:\s*)?([^\n\r\\"]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = jsonErrorRegex.exec(combinedOutput)) !== null) {
      rawErrors.push(match[1]);
    }
  }

  const databaseErrors = rawErrors
    .map((message) =>
      message
        .replace(/^[A-Z0-9]{5}:\s*/i, "")
        .replace(/\s+\(SQLSTATE\s+[A-Z0-9]{5}\)$/i, "")
        .replace(/\s+/g, " ")
        .trim(),
    );
  const normalizedExpected = expectedMessage.replace(/\s+/g, " ").trim();

  if (databaseErrors.length !== 1) {
    throw new Error(
      `expectProofSqlFileFailure requires exactly one PostgreSQL ERROR record (${prefix}); found ${databaseErrors.length}:\n${databaseErrors.join("\n") || "<none>"}`,
    );
  }
  if (databaseErrors[0] !== normalizedExpected) {
    throw new Error(
      `expectProofSqlFileFailure expected exact PostgreSQL ERROR ${JSON.stringify(normalizedExpected)} (${prefix}), received ${JSON.stringify(databaseErrors[0])}`,
    );
  }

  return combinedOutput;
}

/**
 * Complete Feature 015 Tri-State Footprint Inspector.
 * Inspects all 10 dimensions of Feature 015 in a single atomic SQL probe:
 * - 5 RPCs: checkout_bank_transfer_v1, prepare_payment_proof_upload, finalize_payment_proof,
 *           cleanup_orphan_payment_proof_upload, payment_proof_storage_object_authorized
 * - Table: public.payment_proof_upload_intents (with RLS)
 * - Bucket: payment-proofs in storage.buckets
 * - Storage policies: payment_proof_storage_insert, payment_proof_storage_select
 * - File assets policy: payment_proof_file_assets_read
 * - Carve-out: catalog_admin_files carve-out for payment-proofs
 * - Proof policies: payment_proofs_read (F015 shape vs baseline shape)
 * - Upload-intent indexes and constraints created by the migration
 * - Grants: authenticated-only execution for every Feature 015 RPC
 * - Deprecation fences: issue_proforma and confirm_proforma fences
 *
 * Returns:
 * - "APPLIED": all Feature 015 objects exist with expected shapes
 * - "ABSENT": all Feature 015-specific objects absent and baseline state coherent
 * - "INCONSISTENT": any partial/mixed state
 */
export function inspectFeature015State(): Feature015State {
  // Pin function bodies to the ACTUAL reviewed migration, not name/arity or
  // vocabulary fragments. CRLF normalization matches PostgreSQL's stored source.
  const migration = readFileSync("supabase/migrations/20260930100000_feature_015_atomic_checkout_and_payment_proof.sql", "utf8");
  const definitions = [...migration.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2;/gi)];
  if (definitions.length !== 8) throw new Error("Feature 015 inspector function definition pins missing");
  const followUpPath = "supabase/migrations/20260930110000_feature_015_fence_legacy_submit_payment_proof.sql";
  const followUpSql = existsSync(followUpPath) ? readFileSync(followUpPath, "utf8") : "";
  const followUpDefs = new Map([...followUpSql.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2;/gi)].map(m => [m[1], m[3]]));

  const definitionPins = definitions.map((match) => {
    const name = match[1]!;
    const baseMd5 = createHash("md5").update(match[3]!.replaceAll("\r", "")).digest("hex");
    const altBody = followUpDefs.get(name);
    const altMd5 = altBody ? `'${createHash("md5").update(altBody.replaceAll("\r", "")).digest("hex")}'` : "null";
    return `('${name}', '${baseMd5}', ${altMd5})`;
  }).join(",\n");
  const baselineDefinitions = [
    ["validate_order_transition", "20260925100000_feature_013_commerce_state_vocabulary.sql"],
    ["issue_proforma", "20260926103000_feature_013_quote_and_proforma_issuance.sql"],
    ["confirm_proforma", "20260928120000_feature_013_stock_reservation.sql"],
  ].map(([name, file]) => {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    const body = [...sql.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2;/gi)].find((match) => match[1] === name)?.[3];
    if (!body) throw new Error(`Missing historical function pin: ${name}`);
    // Rollback preserves these bodies but differs in comments/formatting.
    return `('${name}', '${createHash("md5").update(body.replace(/--[^\n]*/g, "").replace(/\s+/g, "")).digest("hex")}')`;
  }).join(",\n");
  const normalizePolicy = (expression: string) => expression.toLowerCase().replace(/public\.|::text|[\s()]/g, "");
  const buyerProof = `not public.is_blocked_user() and public.mfa_satisfied() and public.is_authorized_member() and exists (
    select 1 from public.payments p join public.orders o on o.id = p.order_id
    where p.id = payment_proofs.payment_id and public.is_org_member(o.buyer_organization_id) and public.organization_can_buy(o.buyer_organization_id))`;
  const proofRead = `public.is_platform_admin() or public.is_finance_operator() or (${buyerProof})`;
  const fileRead = `bucket_name = 'payment-proofs' and (public.is_platform_admin() or public.is_finance_operator() or (
    not public.is_blocked_user() and public.mfa_satisfied() and public.is_authorized_member() and exists (
    select 1 from public.payment_proofs pp join public.payments p on p.id = pp.payment_id
    join public.orders o on o.id = p.order_id where pp.file_asset_id = file_assets.id
    and public.is_org_member(o.buyer_organization_id) and public.organization_can_buy(o.buyer_organization_id))))`;
  const catalogBaseline = `public.is_platform_admin() or uploaded_by = auth.uid() or public.is_org_member(organization_id)`;
  const baselineRead = `exists (select 1 from public.payments p where p.id = payment_proofs.payment_id and public.is_order_buyer_member(p.order_id)) or public.is_finance_operator()`;
  const policyLiteral = (expression: string) => `'${normalizePolicy(expression).replaceAll("'", "''")}'`;
  const policyPins = [
    ["storage", "objects", "payment_proof_storage_insert", "INSERT", null, "bucket_id = 'payment-proofs' and public.payment_proof_storage_object_authorized(name, true)", "authenticated"],
    ["storage", "objects", "payment_proof_storage_select", "SELECT", "bucket_id = 'payment-proofs' and public.payment_proof_storage_object_authorized(name, false)", null, "authenticated"],
    ["public", "payment_proofs", "payment_proofs_read", "SELECT", proofRead, null, "authenticated"],
    ["public", "file_assets", "payment_proof_file_assets_read", "SELECT", fileRead, null, "authenticated"],
    ["public", "file_assets", "catalog_admin_files", "ALL", `bucket_name <> 'payment-proofs' and (${catalogBaseline})`, `bucket_name <> 'payment-proofs' and (${catalogBaseline})`, "public"],
  ].map(([schema, table, name, command, using, check, role]) =>
    `('${schema}', '${table}', '${name}', '${command}', ${using === null ? "null" : policyLiteral(using!)}, ${check === null ? "null" : policyLiteral(check!)}, '${role}')`
  ).join(",\n");
  const inspectSql = `
    do $inspector$
    declare
      v_f015_rpcs_cnt int;
      v_f015_table boolean;
      v_f015_bucket boolean;
      v_f015_storage_pol_cnt int;
      v_f015_file_pol boolean;
      v_catalog_carveout boolean;
      v_proofs_read_f015 boolean;
      v_proofs_read_baseline boolean;
      v_f015_indexes_ok boolean;
      v_f015_grants_ok boolean;
      v_deprecated_fences boolean;
      v_baseline_rpcs_ok boolean;
      v_raw_rpcs_cnt int;
      v_raw_table boolean;
      v_raw_bucket boolean;
      v_raw_storage_policies int;
      v_raw_file_policy boolean;
      v_raw_indexes int;
      v_catalog_baseline boolean;
      v_definitions_ok boolean;
      v_legacy_grants_ok boolean;
      v_transition_applied boolean;
      v_transition_baseline boolean;
      v_policy_definitions_ok boolean;
      v_baseline_definitions_ok boolean;
      v_transition_attached boolean;
    begin
      -- RAW EXISTENCE: never negate validity to infer absence. Count names even
      -- if signatures, RLS, policy commands, bucket configuration or indexes drift.
      select count(*) into v_raw_rpcs_cnt from pg_proc
      where pronamespace = 'public'::regnamespace and proname in (
        'checkout_bank_transfer_v1', 'prepare_payment_proof_upload',
        'finalize_payment_proof', 'cleanup_orphan_payment_proof_upload',
        'payment_proof_storage_object_authorized');
      v_raw_table := to_regclass('public.payment_proof_upload_intents') is not null;
      select exists (select 1 from storage.buckets where id = 'payment-proofs' or name = 'payment-proofs') into v_raw_bucket;
      select count(*) into v_raw_storage_policies from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('payment_proof_storage_insert', 'payment_proof_storage_select');
      select exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_assets'
        and policyname = 'payment_proof_file_assets_read') into v_raw_file_policy;
      select count(*) into v_raw_indexes from pg_class
      where relnamespace = 'public'::regnamespace and relname in (
        'payment_proof_upload_intents_pkey', 'payment_proof_upload_intents_object_path_key',
        'payment_proof_upload_intents_prepare_request_id_key', 'uq_intent_bucket_object',
        'uq_active_proof_upload_intent');

      -- DEFINITION VALIDITY is evaluated independently below.
      -- 1. F015 core RPCs (5 exact signatures)
      select count(*) into v_f015_rpcs_cnt
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (
        p.oid = to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')
        or p.oid = to_regprocedure('public.prepare_payment_proof_upload(uuid,uuid,text)')
        or p.oid = to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)')
        or p.oid = to_regprocedure('public.cleanup_orphan_payment_proof_upload(uuid)')
        or p.oid = to_regprocedure('public.payment_proof_storage_object_authorized(text,boolean)')
      );

      -- 2. F015 table: payment_proof_upload_intents with RLS
      select exists (
        select 1 from pg_tables t
        join pg_class c on c.relname = t.tablename
        join pg_namespace n on n.oid = c.relnamespace
        where t.schemaname = 'public' and n.nspname = 'public' and t.tablename = 'payment_proof_upload_intents'
          and c.relkind = 'r'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = true
          and (select count(*) from information_schema.columns
               where table_schema = 'public' and table_name = 'payment_proof_upload_intents') = 14
          and (select count(*) from (values
            ('id', 'uuid', true), ('order_id', 'uuid', true), ('buyer_organization_id', 'uuid', true),
            ('prepared_by', 'uuid', true), ('bucket_id', 'text', true), ('object_path', 'text', true),
            ('display_filename', 'text', false), ('expires_at', 'timestamp with time zone', true),
            ('status', 'text', true), ('finalized_proof_id', 'uuid', false), ('prepare_request_id', 'uuid', true),
            ('created_at', 'timestamp with time zone', true), ('finalized_at', 'timestamp with time zone', false),
            ('cleaned_at', 'timestamp with time zone', false)
          ) expected(name, type_name, required)
          join pg_attribute a on a.attrelid = c.oid and a.attname = expected.name
            and not a.attisdropped and a.attnum > 0
            and format_type(a.atttypid, a.atttypmod) = expected.type_name and a.attnotnull = expected.required) = 14
          and (select count(*) from (values
            ('id', 'gen_random_uuid()'), ('status', '''PREPARED''::text'), ('created_at', 'clock_timestamp()')
          ) expected(name, expression)
          join pg_attribute a on a.attrelid = c.oid and a.attname = expected.name
          join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
          where pg_get_expr(d.adbin, d.adrelid) = expected.expression) = 3
          and (select count(*) from pg_constraint con where con.conrelid = c.oid) = 10
          and (select count(*) from pg_constraint con where con.conrelid = c.oid and con.convalidated
            and regexp_replace(lower(pg_get_constraintdef(con.oid)), 'public\\.|::text|[[:space:]()]', '', 'g') in (
              'primarykeyid', 'uniqueobject_path', 'uniqueprepare_request_id', 'uniquebucket_id,object_path',
              'foreignkeyorder_idreferencesordersidondeletecascade',
              'foreignkeybuyer_organization_idreferencesorganizationsid',
              'foreignkeyprepared_byreferencesprofilesid',
              'foreignkeyfinalized_proof_idreferencespayment_proofsid',
              'checkbucket_id=''payment-proofs''',
              'checkstatus=anyarray[''prepared'',''finalized'',''expired'',''cleaned'']'
            )) = 10
          and has_table_privilege('service_role', c.oid, 'SELECT')
          and not has_table_privilege('service_role', c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          and not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          and not has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          and not exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl where acl.grantee = 0)
      ) into v_f015_table;

      -- 3. F015 bucket: payment-proofs
      select exists (
        select 1 from storage.buckets
        where id = 'payment-proofs' and name = 'payment-proofs' and public = false
          and file_size_limit = 10485760
          and allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']::text[]
      ) into v_f015_bucket;

      -- 4. F015 storage policies on storage.objects (2 total)
      select count(*) into v_f015_storage_pol_cnt
      from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and (
          (policyname = 'payment_proof_storage_insert' and cmd = 'INSERT' and roles = array['authenticated']::name[])
          or (policyname = 'payment_proof_storage_select' and cmd = 'SELECT' and roles = array['authenticated']::name[])
        );

      -- 5. F015 file_assets policy: payment_proof_file_assets_read
      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'file_assets'
          and policyname = 'payment_proof_file_assets_read'
          and cmd = 'SELECT' and roles = array['authenticated']::name[]
          and qual like '%payment-proofs%'
      ) into v_f015_file_pol;

      -- 6. catalog_admin_files carve-out
      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'file_assets'
          and policyname = 'catalog_admin_files'
          and qual like '%payment-proofs%'
      ) into v_catalog_carveout;

      -- 7. payment_proofs_read policy variant
      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'payment_proofs'
          and policyname = 'payment_proofs_read'
          and cmd = 'SELECT' and roles = array['authenticated']::name[]
          and qual like '%mfa_satisfied%'
          and qual like '%is_blocked_user%'
          and qual like '%is_authorized_member%'
          and qual like '%organization_can_buy%'
      ) into v_proofs_read_f015;

      select exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'payment_proofs'
          and policyname = 'payment_proofs_read'
          and cmd = 'SELECT' and roles = array['authenticated']::name[]
          and with_check is null
          and qual not like '%mfa_satisfied%'
          and qual not like '%is_blocked_user%'
          and qual not like '%is_platform_admin%'
          and qual like '%is_order_buyer_member%'
          and permissive = 'PERMISSIVE'
          and regexp_replace(lower(qual), 'public\\.|::text|[[:space:]()]', '', 'g') = ${policyLiteral(baselineRead)}
      ) into v_proofs_read_baseline;

      -- 8. Every index actually created for payment_proof_upload_intents.
      -- The first four arise from the primary/unique constraints; only the last
      -- one is an explicit partial unique index.
      select count(*) = 5 into v_f015_indexes_ok
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = 'payment_proof_upload_intents'
        and i.indisvalid and i.indisready and i.indexprs is null
        and (
          (c.relname = 'payment_proof_upload_intents_pkey' and i.indisprimary and i.indisunique
           and i.indpred is null and (select array_agg(a.attname order by k.ordinality)
             from unnest(i.indkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['id']::name[])
          or (c.relname = 'payment_proof_upload_intents_object_path_key' and not i.indisprimary and i.indisunique
           and i.indpred is null and (select array_agg(a.attname order by k.ordinality)
             from unnest(i.indkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['object_path']::name[])
          or (c.relname = 'payment_proof_upload_intents_prepare_request_id_key' and not i.indisprimary and i.indisunique
           and i.indpred is null and (select array_agg(a.attname order by k.ordinality)
             from unnest(i.indkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['prepare_request_id']::name[])
          or (c.relname = 'uq_intent_bucket_object' and not i.indisprimary and i.indisunique
           and i.indpred is null and (select array_agg(a.attname order by k.ordinality)
             from unnest(i.indkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['bucket_id', 'object_path']::name[])
          or (c.relname = 'uq_active_proof_upload_intent' and not i.indisprimary and i.indisunique
           and pg_get_expr(i.indpred, i.indrelid) = '(status = ''PREPARED''::text)'
           and (select array_agg(a.attname order by k.ordinality)
             from unnest(i.indkey) with ordinality k(attnum, ordinality)
             join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum) = array['order_id']::name[])
        );

      -- 9. The migration grants authenticated and explicitly revokes every
      -- other API role for all five Feature 015 functions, including cleanup.
      select not exists (
        select 1
        from unnest(array[
          'checkout_bank_transfer_v1(uuid,uuid,uuid)',
          'prepare_payment_proof_upload(uuid,uuid,text)',
          'finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)',
          'cleanup_orphan_payment_proof_upload(uuid)',
          'payment_proof_storage_object_authorized(text,boolean)'
        ]) as f(signature)
        cross join lateral (select to_regprocedure('public.' || f.signature) as oid) p
        where p.oid is null
          or not exists (
            select 1 from pg_proc q
            where q.oid = p.oid and q.prosecdef
              and q.proconfig @> array['search_path=pg_catalog, public, auth']
          )
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or exists (select 1 from pg_proc q,
            lateral aclexplode(coalesce(q.proacl, acldefault('f', q.proowner))) acl
            where q.oid = p.oid and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE')
      ) into v_f015_grants_ok;

      -- Exact normalized USING/WITH CHECK expressions reject policies that only
      -- mention the right vocabulary (e.g. predicates weakened with OR true).
      select count(*) = 5 into v_policy_definitions_ok
      from (values ${policyPins}) expected(schema_name, table_name, name, command, using_expr, check_expr, role_name)
      join pg_policies p on p.schemaname = expected.schema_name and p.tablename = expected.table_name and p.policyname = expected.name
      where p.cmd = expected.command and p.permissive = 'PERMISSIVE' and p.roles = array[expected.role_name]::name[]
        and regexp_replace(lower(p.qual), 'public\\.|::text|[[:space:]()]', '', 'g') is not distinct from expected.using_expr
        and regexp_replace(lower(p.with_check), 'public\\.|::text|[[:space:]()]', '', 'g') is not distinct from expected.check_expr;

      -- Body, security configuration and return-type pins for all eight functions.
      select count(*) = 8 into v_definitions_ok
      from (values ${definitionPins}) as expected(name, source_md5, alt_md5)
      join pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = expected.name
      where (md5(replace(p.prosrc, chr(13), '')) = expected.source_md5 or (expected.alt_md5 is not null and md5(replace(p.prosrc, chr(13), '')) = expected.alt_md5))
        and p.prosecdef and p.prokind = 'f'
        and p.proconfig = array['search_path=pg_catalog, public, auth']
        and p.prorettype = (case expected.name
          when 'validate_order_transition' then 'trigger'
          when 'cleanup_orphan_payment_proof_upload' then 'boolean'
          when 'payment_proof_storage_object_authorized' then 'boolean'
          else 'jsonb' end)::regtype;

      select not exists (
        select 1 from unnest(array['issue_proforma(uuid,uuid,text,uuid)', 'confirm_proforma(uuid,uuid)', 'validate_order_transition()']) f(signature)
        cross join lateral (select to_regprocedure('public.' || f.signature) as oid) fn
        left join pg_proc p on p.oid = fn.oid
        where p.oid is null or not p.prosecdef
          or p.proconfig is distinct from array['search_path=pg_catalog, public, auth']
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('service_role', p.oid, 'EXECUTE') is distinct from (f.signature = 'validate_order_transition()')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                     where acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
      ) into v_legacy_grants_ok;

      select (
        exists (select 1 from pg_proc where oid = to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') and prosrc like '%endpoint_deprecated_use_checkout_v1%')
        and exists (select 1 from pg_proc where oid = to_regprocedure('public.confirm_proforma(uuid,uuid)') and prosrc like '%endpoint_deprecated_use_checkout_v1%')
      ) into v_deprecated_fences;
      select (
        exists (select 1 from pg_proc where oid = to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)')
          and prosrc not like '%endpoint_deprecated_use_checkout_v1%' and prosrc like '%compute_order_quote%' and prosrc like '%commerce_request_complete%')
        and exists (select 1 from pg_proc where oid = to_regprocedure('public.confirm_proforma(uuid,uuid)')
          and prosrc not like '%endpoint_deprecated_use_checkout_v1%' and prosrc like '%inventory_reservation_items%' and prosrc like '%commerce_request_complete%')
      ) into v_baseline_rpcs_ok;
      select exists (select 1 from pg_proc where oid = to_regprocedure('public.validate_order_transition()')
        and prosrc like '%if old.status = ''CONFIRMED'' then raise exception ''invalid_order_transition'';%') into v_transition_applied;
      select exists (select 1 from pg_proc where oid = to_regprocedure('public.validate_order_transition()')
        and prosrc like '%if old.status in (''CONFIRMED'', ''PAYMENT_PROOF_SUBMITTED'') then raise exception ''invalid_order_transition'';%') into v_transition_baseline;
      select count(*) = 3 into v_baseline_definitions_ok
      from (values ${baselineDefinitions}) expected(name, source_md5)
      join pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = expected.name
      where md5(regexp_replace(regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g'), '[[:space:]]', '', 'g')) = expected.source_md5;
      select exists (select 1 from pg_trigger where tgrelid = to_regclass('public.orders')
        and tgfoid = to_regprocedure('public.validate_order_transition()')
        and not tgisinternal and tgenabled = 'O') into v_transition_attached;
      -- Shared baseline policies must actually exist and be valid, not just fail
      -- the F015 validity check. Missing/changed policies are INCONSISTENT.
      select exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'file_assets'
        and policyname = 'catalog_admin_files' and cmd = 'ALL' and roles = array['public']::name[]
        and permissive = 'PERMISSIVE'
        and regexp_replace(lower(qual), 'public\\.|::text|[[:space:]()]', '', 'g') = ${policyLiteral(catalogBaseline)}
        and qual = with_check) into v_catalog_baseline;

      -- Evaluate Tri-State
      if v_raw_rpcs_cnt = 5
         and v_raw_table and v_raw_bucket
         and v_raw_storage_policies = 2 and v_raw_file_policy and v_raw_indexes = 5
         and v_f015_rpcs_cnt = 5
         and v_f015_table
         and v_f015_bucket
         and v_f015_storage_pol_cnt = 2
         and v_f015_file_pol
         and v_catalog_carveout
         and v_proofs_read_f015
         and v_f015_indexes_ok
         and v_f015_grants_ok
         and v_deprecated_fences
         and v_definitions_ok and v_policy_definitions_ok and v_legacy_grants_ok and v_transition_applied
         and v_transition_attached then
        perform set_config('f015.inspector_state', 'APPLIED', false);
      elsif v_raw_rpcs_cnt = 0
         and not v_raw_table
         and not v_raw_bucket
         and v_raw_storage_policies = 0
         and not v_raw_file_policy
         and v_raw_indexes = 0
         and v_catalog_baseline
         and v_proofs_read_baseline
         and v_baseline_rpcs_ok and v_legacy_grants_ok and v_transition_baseline
         and v_baseline_definitions_ok and v_transition_attached then
        perform set_config('f015.inspector_state', 'ABSENT', false);
      else
        perform set_config('f015.inspector_state', 'INCONSISTENT', false);
      end if;
    end $inspector$;
    select 'STATE: ' || current_setting('f015.inspector_state') as f015_inspector_state;
  `;

  // The Supabase CLI login-role endpoint is rate-limited after many calls; retry with backoff.
  const MAX_RETRIES = 3;
  const BACKOFF_MS = 15_000;
  let lastResult: SqlExecutionResult | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    lastResult = executeProofSqlCommand(inspectSql, "f015-inspect-footprint");
    const combined403 = `${lastResult.stdout}\n${lastResult.stderr}`;
    // Detect transient rate-limit 403 from the Management API login-role endpoint.
    // This is NOT a database error — retry with backoff.
    if (
      lastResult.status !== 0 &&
      /login role status 403/i.test(combined403) &&
      attempt < MAX_RETRIES
    ) {
      sleepMs(BACKOFF_MS);
      continue;
    }
    break;
  }

  const result = lastResult!;
  if (result.error) {
    throw new Error(
      `inspectFeature015State failed due to execution/spawn error: ${result.error.message}`,
    );
  }

  const combined = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0 || /\b(ERROR|FATAL|PANIC):\s+/i.test(combined)) {
    throw new Error(
      `inspectFeature015State failed with database error: ${combined.trim()}`,
    );
  }

  const lines = combined.split(/\r?\n/);
  const states: Feature015State[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^raise\b|^select\b|'/i.test(line)) continue;
    const noticeMatch = /^NOTICE:\s*STATE:\s*(APPLIED|ABSENT|INCONSISTENT)\b/i.exec(line);
    if (noticeMatch) {
      states.push(noticeMatch[1]!.toUpperCase() as Feature015State);
      continue;
    }
    const tableMatch = /^(?:[│|]?\s*STATE:\s*(APPLIED|ABSENT|INCONSISTENT)\s*[│|]?|\["STATE:\s*(APPLIED|ABSENT|INCONSISTENT)"\])$/i.exec(line);
    if (tableMatch) {
      states.push((tableMatch[1] ?? tableMatch[2])!.toUpperCase() as Feature015State);
    }
  }

  if (states.length === 1) return states[0]!;

  throw new Error(
    `inspectFeature015State could not parse probe output:\n${combined.trim()}`,
  );
}

/**
 * Ensures Feature 015 is in a clean, fully-applied state.
 * Strictly adheres to tri-state rules:
 * - If "APPLIED": do NOT reapply.
 * - If "ABSENT": applies forward migration.
 * - If "INCONSISTENT": THROWS immediately (never attempts forward migration over partial state).
 */
export function ensureFeature015Applied(
  migrationSql: string,
  prefix = "f015-ensure-applied",
): void {
  const state = inspectFeature015State();
  if (state === "APPLIED") {
    return;
  }
  if (state === "ABSENT") {
    runProofSqlFileStrict(migrationSql, prefix);
    const postState = inspectFeature015State();
    if (postState !== "APPLIED") {
      throw new Error(
        `ensureFeature015Applied failed: state is ${postState} after running migration (${prefix})`,
      );
    }
    return;
  }
  throw new Error(
    `ensureFeature015Applied refused: target database is in an INCONSISTENT Feature 015 state (${prefix}). Manual intervention or clean baseline reset required.`,
  );
}

/**
 * Tri-state compatibility wrapper.
 * Inspects full Feature 015 footprint and returns true only if state is "APPLIED".
 */
export function isFeature015Applied(): boolean {
  return inspectFeature015State() === "APPLIED";
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
  if (resolveF013Mode().kind === "local")
    return requireF013LocalTarget().projectId;
  const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  if (ref !== F013_PRODUCTION_REF)
    throw new Error("Historical Batch B proof linked project ref mismatch.");
  return ref;
}
