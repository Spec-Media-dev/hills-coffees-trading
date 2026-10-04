/** Local-only PostgreSQL policy capture. No URL, socket, or remote runner is used. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { parse } from "@pgsql/parser/v17";

export const POLICY_BASELINE_START = "  -- BEGIN F017 POSTGRESQL POLICY BASELINE";
export const POLICY_BASELINE_END = "  -- END F017 POSTGRESQL POLICY BASELINE";
export const POLICY_POSTFLIGHT_PATH = resolve("supabase/maintenance/20261003_feature_017_stripe_runtime_retirement_postflight.sql");

export interface CanonicalPolicy {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  cmd: string;
  roles: string[];
  using_expr: string | null;
  check_expr: string | null;
}

export const POLICY_CATALOG_SQL = `
select schemaname, tablename, policyname, permissive, cmd, roles, qual as using_expr,
  case when cmd in ('UPDATE','ALL') and with_check is null then qual else with_check end as check_expr
from pg_catalog.pg_policies
where (schemaname = 'public' and tablename = 'payment_proofs')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname`;

const isPolicyTable = (schema: string | undefined, table: string | undefined) =>
  (schema === "public" && table === "payment_proofs") || (schema === "storage" && table === "objects");

/** PostgreSQL AST locations are UTF-8 byte offsets, including multibyte comments.
 * Retain the complete effective CREATE POLICY statement, not predicate fragments.
 * A historical DROP removes its predecessor; unsupported ALTER fails closed.
 */
export async function historicalPolicyStatements(): Promise<string[]> {
  const effective = new Map<string, string>();
  const directory = resolve("supabase/migrations");
  for (const filename of readdirSync(directory).filter(name => name.endsWith(".sql") && name < "20261003100000_feature_017").sort()) {
    const bytes = readFileSync(resolve(directory, filename));
    const ast = await parse(bytes.toString("utf8"));
    for (const statement of ast.stmts ?? []) {
      const create = statement.stmt?.CreatePolicyStmt;
      if (create && isPolicyTable(create.table?.schemaname, create.table?.relname)) {
        const start = statement.stmt_location ?? 0;
        const end = statement.stmt_len ? start + statement.stmt_len : bytes.length;
        effective.set(`${create.table?.schemaname}.${create.table?.relname}.${create.policy_name}`, bytes.subarray(start, end).toString("utf8") + ";");
      }
      const drop = statement.stmt?.DropStmt;
      if (drop?.removeType === "OBJECT_POLICY") {
        for (const object of drop.objects ?? []) {
          const names = object.List?.items?.map((item: { String?: { sval?: string } }) => item.String?.sval);
          if (names && isPolicyTable(names[0], names[1])) effective.delete(names.join("."));
        }
      }
      const alter = statement.stmt?.AlterPolicyStmt;
      if (alter && isPolicyTable(alter.table?.schemaname, alter.table?.relname)) {
        throw new Error(`Historical ALTER POLICY requires explicit replay support: ${filename}`);
      }
    }
  }
  return [...effective.values()];
}

/** Only the schema/types needed for PostgreSQL to bind the historical policies.
 * Helper bodies are stubs: these contracts verify policy definitions, not RPC business logic.
 */
export async function createHistoricalPolicyDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage; create schema auth;
      create table storage.objects (id uuid, bucket_id text, name text);
      create table public.payment_proofs (id uuid, payment_id uuid);
      create table public.payments (id uuid, order_id uuid);
      create table public.orders (id uuid, buyer_organization_id uuid);
      alter table public.payment_proofs enable row level security;
    `);
    for (const signature of [
      "is_platform_admin()", "is_finance_operator()", "is_blocked_user()", "mfa_satisfied()", "is_authorized_member()",
      "is_org_member(uuid)", "organization_can_buy(uuid)", "kyb_storage_object_authorized(text, boolean)",
      "public_asset_object_authorized(text, text)", "offer_media_object_authorized(text, boolean)",
      "payment_proof_storage_object_authorized(text, boolean)",
    ]) {
      await db.exec(`create function public.${signature} returns boolean language sql as 'select false';`);
    }
    for (const statement of await historicalPolicyStatements()) await db.exec(statement);
    // Identical pinned visibility on capture and postflight: deparse all public
    // references with their schema rather than relying on the caller's search_path.
    await db.exec("set search_path = pg_catalog;");
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function captureCanonicalPolicies(db: PGlite): Promise<CanonicalPolicy[]> {
  return (await db.query<CanonicalPolicy>(POLICY_CATALOG_SQL)).rows;
}

export function policyTextLiteral(value: string | null): string {
  if (value === null) return "null::text";
  // Escape catalog text as data, including deparser LF characters. Otherwise a
  // Windows CRLF checkout could change a multiline SQL literal's stored value.
  const encoded = value.replaceAll("\\", "\\\\").replaceAll("'", "''").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
  return `E'${encoded}'`;
}

/** The executable manifest contains PostgreSQL-produced expressions verbatim.
 * No regex, cast stripping, case folding, or boolean-tree rewriting is involved.
 */
export function renderCanonicalPolicyManifest(policies: CanonicalPolicy[]): string {
  const tuples = policies.map(policy => "      (" + [
    policyTextLiteral(policy.schemaname), policyTextLiteral(policy.tablename), policyTextLiteral(policy.policyname), policyTextLiteral(policy.permissive), policyTextLiteral(policy.cmd),
    `array[${policy.roles.map(policyTextLiteral).join(",")}]::name[]`, policyTextLiteral(policy.using_expr), policyTextLiteral(policy.check_expr),
  ].join(",") + ")").join(",\n");
  return `${POLICY_BASELINE_START}
  -- Generated from effective historical CREATE POLICY statements by PostgreSQL.
  -- Regenerate with captureCanonicalPolicies/renderCanonicalPolicyManifest in
  -- scripts/f017-policy-baseline.ts; the independent tests enforce exact capture.
  with expected(schemaname, tablename, policyname, permissive, cmd, roles, using_expr, check_expr) as (
    values
${tuples}
  ), actual as (
    select schemaname, tablename, policyname, permissive, cmd, roles, qual as using_expr,
      case when cmd in ('UPDATE','ALL') and with_check is null then qual else with_check end as check_expr
    from pg_catalog.pg_policies
    where (schemaname = 'public' and tablename = 'payment_proofs')
       or (schemaname = 'storage' and tablename = 'objects')
  ), mismatches as (
    select coalesce(e.schemaname, a.schemaname) as schemaname
    from expected e full join actual a using (schemaname, tablename, policyname)
    where e.policyname is null or a.policyname is null
      or e.permissive is distinct from a.permissive or e.cmd is distinct from a.cmd
      or e.roles is distinct from a.roles
      or e.using_expr is distinct from a.using_expr
      or e.check_expr is distinct from a.check_expr
  ) select count(*) filter (where schemaname = 'public'), count(*) filter (where schemaname = 'storage')
    into v_proof_policy_mismatches, v_storage_policy_mismatches from mismatches;
  if v_proof_policy_mismatches <> 0 then v_problems := v_problems || 'payment_proofs policy manifest mismatch; '; end if;
  if v_storage_policy_mismatches <> 0 then v_problems := v_problems || 'Storage policy manifest mismatch; '; end if;
${POLICY_BASELINE_END}`;
}

export function assertHistoricalPolicyManifest(postflight: string, policies: CanonicalPolicy[]): void {
  const start = postflight.indexOf(POLICY_BASELINE_START);
  const end = postflight.indexOf(POLICY_BASELINE_END, start) + POLICY_BASELINE_END.length;
  // Only physical file line endings are normalized; catalog expressions are
  // escaped data above and never undergo text/boolean normalization.
  if (start < 0 || end < POLICY_BASELINE_END.length || postflight.slice(start, end).replaceAll("\r\n", "\n") !== renderCanonicalPolicyManifest(policies)) {
    throw new Error("Feature 017 manifest differs from independently captured historical PostgreSQL policies");
  }
}
