/**
 * Feature 018 live-schema capture (T001-T009).
 *
 * READ-ONLY. The remote runner executes only fixed SELECT sections inside
 * `BEGIN TRANSACTION READ ONLY ... ROLLBACK` against the single approved
 * TEST/DEMO project. It never prints credentials, never accepts caller SQL and
 * never mutates schema, data, Auth, Storage or secrets.
 *
 *   npx tsx scripts/f018-capture-schema.ts --target-check
 *   F018_REMOTE_READONLY_CAPTURE_APPROVED=1 npx tsx scripts/f018-capture-schema.ts --remote
 *   npx tsx scripts/f018-capture-schema.ts --local --database hills_f018_local
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertF018ReadOnlyCaptureSql } from "./f018-readonly-sql.mjs";

// ---------------------------------------------------------------------------
// T001 - manifest and expected-object inventory
// ---------------------------------------------------------------------------

export const F018_TARGET_REF = "mxejnutukgxyccnohglo";
export const F018_FORBIDDEN_REFS: readonly string[] = ["qfzvehrzwaheppuxqkjo"];
export const F018_PROJECT_NAME = "hillscoffees-trading";
export const F018_APPROVAL_ENV = "F018_REMOTE_READONLY_CAPTURE_APPROVED";
export const F018_SQL_TIMEOUT_MS = 30_000;
export const F018_PROCESS_TIMEOUT_MS = 180_000;
export const F018_EVIDENCE_DIR = "specs/018-marketplace-catalogue-checkout-completion/evidence";
export const F018_LOCAL_CONTAINER = "supabase_db_hills-f013-local";
export const F018_LOCAL_DATABASE = "hills_f018_local";
export const F018_LOCAL_BASE_DATABASE = "hills_f018_base";

export class F018CaptureError extends Error {}

export interface F018CaptureGroup {
  id: string;
  task: string;
  title: string;
  /** Every overload of each name is captured; absence is recorded explicitly. */
  functions: readonly string[];
  relations: readonly string[];
  triggers: readonly string[];
  policies: readonly string[];
}

export const F018_CAPTURE_GROUPS: readonly F018CaptureGroup[] = [
  {
    id: "cart", task: "T003", title: "Cart resolver, Add, update/remove, request-log and destination RPCs",
    functions: [
      "commerce_request_begin", "commerce_request_complete", "commerce_assert_buyer_member", "commerce_resolve_cart",
      "get_or_create_cart", "add_cart_line", "update_order_item_quantity", "remove_order_item",
      "admin_convert_legacy_draft", "upsert_delivery_destination", "retire_delivery_destination",
    ],
    relations: ["orders", "order_items", "delivery_destinations", "commerce_request_log"],
    triggers: [], policies: [],
  },
  {
    id: "checkout", task: "T004", title: "Checkout, quote, order-item validator, order transition and reservation/reclamation",
    functions: [
      "checkout_bank_transfer_v1", "compute_order_quote", "estimate_cart", "validate_order_item_offer",
      "validate_order_transition", "enforce_new_order_flow", "commerce_release_reservation", "expire_reservation",
      "sweep_expired_reservations", "issue_proforma", "confirm_proforma", "checkout_order",
      "protect_proforma_snapshot", "prevent_snapshot_mutation", "check_seller_settlement_totals",
      "check_proforma_snapshot_totals", "freeze_order_financials", "guard_order_proforma_pointer",
    ],
    relations: [
      "orders", "order_items", "inventory_reservations", "inventory_reservation_items", "proforma_invoices",
      "proforma_invoice_items", "proforma_line_economics", "proforma_fulfillment_groups",
      "proforma_seller_settlements", "proforma_bank_instructions", "order_financials",
    ],
    triggers: [
      "trg_orders_enforce_new_order_flow", "trg_proforma_invoices_protect_snapshot", "trg_audit_proforma_invoices",
      "trg_proforma_invoice_items_immutable", "trg_proforma_line_economics_immutable",
      "trg_proforma_fulfillment_groups_immutable", "trg_proforma_seller_settlements_immutable",
      "trg_proforma_bank_instructions_immutable", "trg_audit_proforma_bank_instructions",
      "trg_order_financials_freeze", "trg_orders_proforma_pointer_guard",
    ],
    policies: [],
  },
  {
    id: "offer_inventory", task: "T005", title: "Offer, inventory, position, catalogue/media/translation constraints, indexes, policies, grants and trigger bindings",
    functions: [
      "validate_offer_transition", "guard_offer_inventory_hold", "record_listing_status_history",
      "attach_coffee_media", "remove_coffee_media", "set_catalogue_translation", "public_asset_object_authorized",
    ],
    relations: [
      "coffees", "coffee_translations", "coffee_types", "coffee_type_translations", "coffee_varieties",
      "coffee_variety_translations", "origins", "origin_translations", "regions", "region_translations",
      "processing_methods", "processing_method_translations", "coffee_media", "file_assets", "coffee_offers",
      "coffee_offer_media", "listing_reviews", "listing_status_history", "coffee_lots", "inventory_positions",
      "inventory_position_holds", "inventory_variance_events", "public_coffee_images", "v_seller_order_lines",
    ],
    triggers: [], policies: [],
  },
  {
    id: "support", task: "T006", title: "Feature 014 ticket/message functions, policies, history/audit bindings and notifications",
    functions: [
      "next_support_ticket_code", "validate_support_ticket", "validate_support_message", "create_member_support_ticket",
      "create_support_ticket", "mark_notification_read", "mark_all_notifications_read", "get_unread_notification_count",
      "commerce_notify_order_status_change", "commerce_notify_shipment_status_change",
    ],
    relations: ["support_tickets", "support_messages", "notifications", "notification_events", "notification_deliveries", "notification_preferences"],
    triggers: ["trg_support_ticket_validate", "trg_support_message_validate", "trg_support_updated_at", "trg_audit_tickets", "trg_notify_order_status_change"],
    policies: ["tickets_insert_own", "tickets_view_own_or_admin", "tickets_admin_update", "messages_ticket_access", "messages_insert_access"],
  },
  {
    id: "payment_finance", task: "T007", title: "Payment-account/default, proforma snapshot/immutability, proof Storage and Feature 016 Finance/handoff",
    functions: [
      "set_default_payment_account", "update_commerce_settings", "finance_review_bank_transfer_v1",
      "finance_terminal_review_integrity", "finance_payment_proof_projection", "finance_payment_proof_asset_projection",
      "prepare_payment_proof_upload", "finalize_payment_proof", "payment_proof_storage_object_authorized",
      "submit_payment_proof", "admin_review_payment",
    ],
    relations: [
      "payment_accounts", "payments", "payment_proofs", "payment_reviews", "payment_proof_upload_intents",
      "tax_invoices", "inventory_ownership_events", "storage_allocations", "order_shipments", "shipment_items",
      "commerce_settings",
    ],
    triggers: [],
    policies: ["payment_proof_storage_insert", "payment_proof_storage_select", "payment_proofs_read", "catalog_admin_files", "payment_proof_file_assets_read"],
  },
  {
    id: "f017_retired", task: "T008", title: "Feature 017 retired functions and application-role ACL denials",
    functions: ["admin_review_payment", "record_stripe_payment_intent", "record_payment_transfer", "ingest_stripe_event"],
    relations: [], triggers: [], policies: [],
  },
  {
    id: "authority", task: "T003-T008", title: "Authority, audit and notification helpers called by captured functions/policies",
    functions: [
      "can_view_order", "is_org_member", "is_authorized_member", "is_platform_admin", "is_blocked_user",
      "organization_can_buy", "organization_can_sell", "write_audit_log", "set_updated_at",
    ],
    relations: ["organizations", "organization_members", "platform_admins", "audit_logs"],
    triggers: [], policies: [],
  },
];

export const F018_RETIRED_FUNCTIONS: readonly string[] = ["record_stripe_payment_intent", "record_payment_transfer", "ingest_stripe_event"];
export const F018_APPLICATION_ROLES: readonly string[] = ["anon", "authenticated", "service_role"];

export function manifestFunctionNames(): string[] {
  return [...new Set(F018_CAPTURE_GROUPS.flatMap((group) => group.functions))].sort();
}
export function manifestRelationNames(): string[] {
  return [...new Set(F018_CAPTURE_GROUPS.flatMap((group) => group.relations))].sort();
}

// ---------------------------------------------------------------------------
// T002 - effective HTTP and PostgreSQL target identity pinning (no network, no secrets)
// ---------------------------------------------------------------------------

type Env = Record<string, string | undefined>;

export interface F018VerifiedTarget {
  ref: typeof F018_TARGET_REF;
  projectName: string;
  httpOrigin: string;
  poolerHost: string;
  poolerPort: "5432";
  poolerUser: string;
}

export interface F018TargetFiles { projectRef: string; linkedProject: string; poolerUrl: string; envLocalUrl?: string }

const MIXED_APPROVALS = ["F013_TARGET", "F013_LOCAL_APPROVED", "F013_LOCAL_BOOTSTRAP_APPROVED", "F013_LIVE", "F015_REMOTE_LIVE_DB_APPROVED", "F016_REMOTE_LIVE_DB_APPROVED"];

function refsInUrl(value: string): string[] {
  let url: URL;
  try { url = new URL(value); } catch { return []; }
  const found: string[] = [];
  for (const part of [url.username, url.hostname]) {
    for (const token of part.split(/[.@:]/)) if (/^[a-z0-9]{20}$/.test(token)) found.push(token);
  }
  return found;
}

export function readF018TargetFiles(cwd = process.cwd()): F018TargetFiles {
  const temp = resolve(cwd, "supabase", ".temp");
  const read = (name: string) => {
    try { return readFileSync(join(temp, name), "utf8").trim(); } catch { throw new F018CaptureError(`f018_linked_metadata_unavailable:${name}`); }
  };
  let envLocalUrl: string | undefined;
  try {
    for (const raw of readFileSync(resolve(cwd, ".env.local"), "utf8").split(/\r?\n/)) {
      const match = /^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/.exec(raw);
      if (match) envLocalUrl = match[1]!.trim().replace(/^["']|["']$/g, "");
    }
  } catch { /* .env.local optional; process env may supply the HTTP URL */ }
  return { projectRef: read("project-ref"), linkedProject: read("linked-project.json"), poolerUrl: read("pooler-url"), envLocalUrl };
}

/**
 * Verifies the effective HTTP origin, the linked project metadata and the PostgreSQL session-pooler identity all
 * name exactly the approved TEST/DEMO project and nothing else. Any disagreement, forbidden ref, local override or
 * mixed approval fails closed. Returns no secret value.
 */
export function assertF018Target(env: Env = process.env, files: F018TargetFiles = readF018TargetFiles()): F018VerifiedTarget {
  if (env[F018_APPROVAL_ENV] !== "1") throw new F018CaptureError(`f018_capture_requires_${F018_APPROVAL_ENV}=1`);
  const mixed = MIXED_APPROVALS.find((name) => env[name] !== undefined);
  if (mixed) throw new F018CaptureError(`f018_capture_refuses_mixed_mode:${mixed}`);
  if (!env.SUPABASE_DB_PASSWORD) throw new F018CaptureError("f018_capture_requires_SUPABASE_DB_PASSWORD");

  const httpValue = env.NEXT_PUBLIC_SUPABASE_URL ?? files.envLocalUrl;
  let http: URL;
  try { http = new URL(httpValue ?? ""); } catch { throw new F018CaptureError("f018_http_target_missing_or_malformed"); }
  if (http.protocol !== "https:" || http.hostname !== `${F018_TARGET_REF}.supabase.co` ||
      http.username || http.password || http.port || http.pathname !== "/" || http.search || http.hash) {
    throw new F018CaptureError("f018_http_target_mismatch");
  }

  let linked: { ref?: string; name?: string };
  try { linked = JSON.parse(files.linkedProject) as { ref?: string; name?: string }; } catch { throw new F018CaptureError("f018_linked_project_malformed"); }
  if (files.projectRef !== linked.ref) throw new F018CaptureError("f018_linked_project_ref_disagreement");
  if (linked.ref !== F018_TARGET_REF || linked.name !== F018_PROJECT_NAME) throw new F018CaptureError("f018_linked_project_identity_mismatch");

  let pooler: URL;
  try { pooler = new URL(files.poolerUrl); } catch { throw new F018CaptureError("f018_pooler_url_malformed"); }
  const expectedUser = `postgres.${F018_TARGET_REF}`;
  if (pooler.protocol !== "postgresql:" || pooler.username !== expectedUser ||
      !/^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(pooler.hostname) || (pooler.port && pooler.port !== "5432")) {
    throw new F018CaptureError("f018_pooler_identity_mismatch");
  }

  // Never silently trust another database variable that disagrees with the pinned target.
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (!/(?:^|_)(?:DB|DATABASE|POSTGRES|SUPABASE)(?:_|$)/i.test(name) && !/_URL$/i.test(name)) continue;
    const refs = refsInUrl(value);
    if (refs.some((ref) => F018_FORBIDDEN_REFS.includes(ref))) throw new F018CaptureError(`f018_forbidden_project_in_env:${name}`);
    if (refs.some((ref) => ref !== F018_TARGET_REF)) throw new F018CaptureError(`f018_target_disagreement_in_env:${name}`);
  }
  for (const text of [httpValue ?? "", files.projectRef, files.linkedProject, files.poolerUrl]) {
    if (F018_FORBIDDEN_REFS.some((ref) => text.includes(ref))) throw new F018CaptureError("f018_forbidden_project_identity");
  }

  return {
    ref: F018_TARGET_REF, projectName: F018_PROJECT_NAME, httpOrigin: `https://${F018_TARGET_REF}.supabase.co`,
    poolerHost: pooler.hostname, poolerPort: "5432", poolerUser: expectedUser,
  };
}

const CHILD_ENV_KEYS = ["PATH", "Path", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"];

/** Environment for the runner child: no ambient database/credential variable crosses over except the pinned set. */
export function buildF018RemoteChildEnv(target: F018VerifiedTarget, parent: Env = process.env, cwd = process.cwd()): NodeJS.ProcessEnv {
  const child: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const key of CHILD_ENV_KEYS) if (parent[key] !== undefined) child[key] = parent[key];
  child[F018_APPROVAL_ENV] = "1";
  child.F018_SQL_TIMEOUT_MS = String(F018_SQL_TIMEOUT_MS);
  child.PGHOST = target.poolerHost;
  child.PGPORT = target.poolerPort;
  child.PGUSER = target.poolerUser;
  child.SUPABASE_DB_PASSWORD = parent.SUPABASE_DB_PASSWORD;
  const rootCa = resolve(cwd, "supabase", ".temp", "supabase-root-ca.pem");
  const ca = parent.NODE_EXTRA_CA_CERTS ?? (existsSync(rootCa) ? rootCa : undefined);
  if (ca) child.NODE_EXTRA_CA_CERTS = ca;
  return child;
}

// ---------------------------------------------------------------------------
// T003-T008 - fixed read-only capture sections (one SELECT each, JSON row per object)
// ---------------------------------------------------------------------------

const PUBLIC_OR_STORAGE_REL = `(n.nspname = 'public' or (n.nspname = 'storage' and c.relname in ('objects', 'buckets')))`;
const ACL_JSON = (alias: string, column: string) => `(select coalesce(jsonb_agg(jsonb_build_object('grantee', case when a.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(a.grantee)::text end, 'privilege', a.privilege_type, 'grantable', a.is_grantable) order by a.grantee, a.privilege_type), '[]'::jsonb) from pg_catalog.aclexplode(${alias}.${column}) a)`;

export interface F018Section {
  id: string;
  task: string;
  /** Optional sections may legitimately be unavailable (relation/extension absent or not permitted). */
  optional: boolean;
  sql: string;
}

export const F018_SECTIONS: readonly F018Section[] = [
  {
    id: "meta", task: "T003-T008", optional: false,
    sql: `select jsonb_build_object(
      'server_version', pg_catalog.current_setting('server_version'),
      'server_version_num', pg_catalog.current_setting('server_version_num'),
      'database', pg_catalog.current_database()::text,
      'session_user', session_user::text,
      'current_user', current_user::text,
      'transaction_read_only', pg_catalog.current_setting('transaction_read_only'),
      'extensions', (select coalesce(jsonb_agg(jsonb_build_object('name', e.extname::text, 'version', e.extversion) order by e.extname), '[]'::jsonb) from pg_catalog.pg_extension e),
      'application_roles', (select coalesce(jsonb_agg(r.rolname::text order by r.rolname), '[]'::jsonb) from pg_catalog.pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator'))
    )`,
  },
  {
    id: "migration_history", task: "T003-T008", optional: true,
    sql: `select jsonb_build_object('version', m.version::text, 'name', m.name::text) from supabase_migrations.schema_migrations m order by m.version`,
  },
  {
    id: "functions", task: "T003-T008", optional: false,
    sql: `select jsonb_build_object(
      'schema', n.nspname::text,
      'name', p.proname::text,
      'identity_args', pg_catalog.pg_get_function_identity_arguments(p.oid),
      'regprocedure', p.oid::pg_catalog.regprocedure::text,
      'kind', p.prokind::text,
      'owner', pg_catalog.pg_get_userbyid(p.proowner)::text,
      'language', l.lanname::text,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile::text,
      'strict', p.proisstrict,
      'leakproof', p.proleakproof,
      'config', pg_catalog.to_jsonb(p.proconfig),
      'result', case when p.prokind in ('f', 'p') then pg_catalog.pg_get_function_result(p.oid) end,
      'acl_is_default', p.proacl is null,
      'acl', ${ACL_JSON("p", "proacl")},
      'effective_execute', jsonb_build_object(
        'PUBLIC', pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'),
        'anon', pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'service_role', pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')),
      'definition', case when p.prokind in ('f', 'p') then pg_catalog.pg_get_functiondef(p.oid) end
    ) from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and not exists (select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.oid::pg_catalog.regprocedure::text`,
  },
  {
    id: "triggers", task: "T004-T006", optional: false,
    sql: `select jsonb_build_object(
      'relation', t.tgrelid::pg_catalog.regclass::text,
      'name', t.tgname::text,
      'enabled', t.tgenabled::text,
      'function', t.tgfoid::pg_catalog.regprocedure::text,
      'is_constraint', t.tgconstraint <> 0,
      'deferrable', t.tgdeferrable,
      'initially_deferred', t.tginitdeferred,
      'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
    ) from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and (${PUBLIC_OR_STORAGE_REL} or (n.nspname = 'auth' and c.relname = 'users'))
    order by t.tgrelid::pg_catalog.regclass::text, t.tgname`,
  },
  {
    id: "policies", task: "T005-T007", optional: false,
    sql: `select jsonb_build_object(
      'relation', c.oid::pg_catalog.regclass::text,
      'name', pol.polname::text,
      'command', pol.polcmd::text,
      'permissive', pol.polpermissive,
      'roles', (select coalesce(jsonb_agg(case when r = 0 then 'public' else pg_catalog.pg_get_userbyid(r)::text end order by r), '[]'::jsonb) from pg_catalog.unnest(pol.polroles) r),
      'using', pg_catalog.pg_get_expr(pol.polqual, pol.polrelid),
      'check', pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid)
    ) from pg_catalog.pg_policy pol
    join pg_catalog.pg_class c on c.oid = pol.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where ${PUBLIC_OR_STORAGE_REL}
    order by c.oid::pg_catalog.regclass::text, pol.polname`,
  },
  {
    id: "relations", task: "T005-T007", optional: false,
    sql: `select jsonb_build_object(
      'relation', c.oid::pg_catalog.regclass::text,
      'kind', c.relkind::text,
      'owner', pg_catalog.pg_get_userbyid(c.relowner)::text,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'options', pg_catalog.to_jsonb(c.reloptions),
      'acl_is_default', c.relacl is null,
      'acl', ${ACL_JSON("c", "relacl")},
      'view_definition', case when c.relkind = 'v' then pg_catalog.pg_get_viewdef(c.oid, true) end,
      'columns', (select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname::text,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
          'generated', a.attgenerated::text,
          'identity', a.attidentity::text,
          'column_acl', case when a.attacl is null then null else ${ACL_JSON("a", "attacl")} end) order by a.attnum), '[]'::jsonb)
        from pg_catalog.pg_attribute a
        left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
    ) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and ${PUBLIC_OR_STORAGE_REL}
    order by c.oid::pg_catalog.regclass::text`,
  },
  {
    id: "constraints", task: "T005", optional: false,
    sql: `select jsonb_build_object(
      'relation', k.conrelid::pg_catalog.regclass::text,
      'name', k.conname::text,
      'type', k.contype::text,
      'validated', k.convalidated,
      'deferrable', k.condeferrable,
      'deferred', k.condeferred,
      'definition', pg_catalog.pg_get_constraintdef(k.oid, true)
    ) from pg_catalog.pg_constraint k
    join pg_catalog.pg_namespace n on n.oid = k.connamespace
    where n.nspname = 'public' and k.conrelid <> 0
    order by k.conrelid::pg_catalog.regclass::text, k.conname`,
  },
  {
    id: "indexes", task: "T005", optional: false,
    sql: `select jsonb_build_object(
      'relation', i.indrelid::pg_catalog.regclass::text,
      'name', ic.relname::text,
      'unique', i.indisunique,
      'valid', i.indisvalid,
      'nulls_not_distinct', i.indnullsnotdistinct,
      'predicate', pg_catalog.pg_get_expr(i.indpred, i.indrelid),
      'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
    ) from pg_catalog.pg_index i
    join pg_catalog.pg_class ic on ic.oid = i.indexrelid
    join pg_catalog.pg_namespace n on n.oid = ic.relnamespace
    where n.nspname = 'public'
    order by i.indrelid::pg_catalog.regclass::text, ic.relname`,
  },
  {
    id: "enums", task: "T005", optional: false,
    sql: `select jsonb_build_object(
      'type', t.typname::text,
      'labels', (select coalesce(jsonb_agg(e.enumlabel::text order by e.enumsortorder), '[]'::jsonb) from pg_catalog.pg_enum e where e.enumtypid = t.oid)
    ) from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where t.typtype = 'e' and n.nspname = 'public'
    order by t.typname`,
  },
  {
    id: "default_privileges", task: "T008", optional: false,
    sql: `select jsonb_build_object(
      'role', pg_catalog.pg_get_userbyid(d.defaclrole)::text,
      'schema', case when d.defaclnamespace = 0 then null else d.defaclnamespace::pg_catalog.regnamespace::text end,
      'object_type', d.defaclobjtype::text,
      'acl', ${ACL_JSON("d", "defaclacl")}
    ) from pg_catalog.pg_default_acl d
    order by d.defaclrole, d.defaclnamespace, d.defaclobjtype`,
  },
  {
    id: "storage_buckets", task: "T007", optional: true,
    sql: `select jsonb_build_object('id', b.id::text, 'name', b.name::text, 'public', b.public, 'file_size_limit', b.file_size_limit, 'allowed_mime_types', pg_catalog.to_jsonb(b.allowed_mime_types)) from storage.buckets b order by b.id`,
  },
  {
    id: "vault_secret_names", task: "T008", optional: true,
    sql: `select jsonb_build_object('name', s.name::text) from vault.secrets s order by s.name`,
  },
];

/** Wraps one section in the only transaction shape the read-only runner accepts. */
export function wrapReadOnly(section: F018Section): string {
  const sql = `begin transaction read only;\n${section.sql.trim()};\nrollback;\n`;
  assertF018ReadOnlyCaptureSql(sql);
  return sql;
}

// ---------------------------------------------------------------------------
// Runners (remote read-only pooler, or the local Docker PostgreSQL used for reconciliation)
// ---------------------------------------------------------------------------

export type SectionRows = { ok: true; rows: Record<string, unknown>[] } | { ok: false; code: string; message: string };
export interface SectionRunner { description: string; run(section: F018Section): SectionRows }

/** Parses runner stdout. pg-simple-exec prints one JSON array of cell texts per row; psql -A -t prints the cell itself. */
export function parseRunnerRows(stdout: string, format: "pg-simple-exec" | "psql"): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (format === "pg-simple-exec") {
      if (!line.startsWith("[")) continue;
      let cells: unknown;
      try { cells = JSON.parse(line); } catch { continue; }
      if (!Array.isArray(cells) || typeof cells[0] !== "string") continue;
      rows.push(JSON.parse(cells[0]) as Record<string, unknown>);
    } else {
      if (!line.startsWith("{")) continue;
      rows.push(JSON.parse(line) as Record<string, unknown>);
    }
  }
  return rows;
}

export function createRemoteReadOnlyRunner(target: F018VerifiedTarget, parent: Env = process.env, cwd = process.cwd()): SectionRunner {
  const env = buildF018RemoteChildEnv(target, parent, cwd);
  const runner = resolve(cwd, "scripts", "pg-simple-exec.mjs");
  return {
    description: `remote read-only ${target.ref}`,
    run(section) {
      const directory = mkdtempSync(join(tmpdir(), `f018-${randomBytes(4).toString("hex")}-`));
      const file = join(directory, `${section.id}.sql`);
      try {
        writeFileSync(file, wrapReadOnly(section), { mode: 0o600 });
        const result = spawnSync(process.execPath, [runner, file], { env, encoding: "utf8", shell: false, timeout: F018_PROCESS_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
        if (result.error) return { ok: false, code: "TRANSPORT", message: result.error.message.slice(0, 200) };
        if (result.status !== 0) {
          const first = (result.stderr || "").split(/\r?\n/).find((line) => line.trim()) ?? "unknown";
          return { ok: false, code: result.status === 1 ? "SQL_ERROR" : "TRANSPORT", message: first.slice(0, 300) };
        }
        return { ok: true, rows: parseRunnerRows(result.stdout, "pg-simple-exec") };
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  };
}

/** Local reconciliation target: a database inside the existing local Supabase container. Never a remote host. */
export function createLocalDockerRunner(database = F018_LOCAL_DATABASE, container = F018_LOCAL_CONTAINER): SectionRunner {
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(database)) throw new F018CaptureError("f018_local_database_name_invalid");
  return {
    description: `local docker ${container}/${database}`,
    run(section) {
      const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
        { input: wrapReadOnly(section), encoding: "utf8", shell: false, timeout: F018_PROCESS_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 });
      if (result.error) return { ok: false, code: "TRANSPORT", message: result.error.message.slice(0, 200) };
      if (result.status !== 0) {
        const first = (result.stderr || "").split(/\r?\n/).find((line) => line.trim()) ?? "unknown";
        return { ok: false, code: "SQL_ERROR", message: first.slice(0, 300) };
      }
      return { ok: true, rows: parseRunnerRows(result.stdout, "psql") };
    },
  };
}

// ---------------------------------------------------------------------------
// Capture orchestration, sanitization and evidence
// ---------------------------------------------------------------------------

export interface F018SectionCapture { id: string; task: string; optional: boolean; status: "captured" | "unavailable"; rows: Record<string, unknown>[]; error?: { code: string; message: string } }
export interface F018Capture {
  version: 1;
  source: string;
  target?: { ref: string; project: string };
  sections: Record<string, F018SectionCapture>;
  redactions: number;
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /postgres(?:ql)?:\/\/[^\s'"]+/gi,
  /\bsk_(?:live|test)_[A-Za-z0-9]+/g,
  /\bwhsec_[A-Za-z0-9]+/g,
  /-----BEGIN [A-Z ]+-----/g,
  /(?<=password\s*(?:=|:)\s*')[^']{4,}(?=')/gi,
];

export function sanitizeValue(value: unknown, counter = { count: 0 }): unknown {
  if (typeof value === "string") {
    let text = value;
    for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, () => { counter.count += 1; return "[redacted]"; });
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, counter));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeValue(item, counter)]));
  }
  return value;
}

export function captureSchema(runner: SectionRunner, sections: readonly F018Section[] = F018_SECTIONS, target?: F018VerifiedTarget): F018Capture {
  const counter = { count: 0 };
  const captured: Record<string, F018SectionCapture> = {};
  for (const section of sections) {
    const result = runner.run(section);
    if (result.ok) {
      captured[section.id] = { id: section.id, task: section.task, optional: section.optional, status: "captured", rows: sanitizeValue(result.rows, counter) as Record<string, unknown>[] };
    } else {
      if (!section.optional) throw new F018CaptureError(`f018_required_section_unavailable:${section.id}:${result.code}:${result.message}`);
      captured[section.id] = { id: section.id, task: section.task, optional: true, status: "unavailable", rows: [], error: { code: result.code, message: result.message } };
    }
  }
  return { version: 1, source: runner.description, target: target ? { ref: target.ref, project: target.projectName } : undefined, sections: captured, redactions: counter.count };
}

const stableStringify = (value: unknown): string => JSON.stringify(value, (_key, item) => (item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : item), 2);

export function sectionDigest(section: F018SectionCapture): string {
  return createHash("sha256").update(stableStringify(section.rows)).digest("hex");
}

// ---------------------------------------------------------------------------
// T009 - catalog comparison and fail-closed drift report
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const rowsOf = (capture: F018Capture, id: string): Row[] => capture.sections[id]?.rows ?? [];
const str = (row: Row, key: string): string => String(row[key] ?? "");

export type DriftKind =
  | "MISSING_FUNCTION" | "MISSING_RELATION" | "MISSING_TRIGGER" | "MISSING_POLICY" | "UNEXPECTED_OVERLOAD"
  | "PUBLIC_EXECUTE_EXPOSURE" | "RETIRED_FUNCTION_EXECUTABLE" | "SECDEF_UNPINNED_SEARCH_PATH"
  | "DEFINITION_MISMATCH" | "SIGNATURE_ONLY_IN_LIVE" | "SIGNATURE_ONLY_IN_BASELINE" | "ACL_MISMATCH" | "REQUIRED_SECTION_UNAVAILABLE"
  | "OBJECT_ONLY_IN_LIVE" | "OBJECT_ONLY_IN_BASELINE" | "OBJECT_MISMATCH";

export interface DriftFinding { kind: DriftKind; subject: string; material: boolean; detail: string }
export interface F018DriftReport { ok: boolean; findings: DriftFinding[]; facts: Record<string, unknown>; closure: string[] }

const finding = (kind: DriftKind, subject: string, material: boolean, detail: string): DriftFinding => ({ kind, subject, material, detail });

export function functionsByName(capture: F018Capture): Map<string, Row[]> {
  const byName = new Map<string, Row[]>();
  for (const row of rowsOf(capture, "functions")) {
    const name = str(row, "name");
    byName.set(name, [...(byName.get(name) ?? []), row]);
  }
  return byName;
}

/**
 * Seeds are the manifest functions plus every trigger function bound to a manifest relation. The closure follows
 * calls found in captured bodies (qualified or bare) to other captured functions, including dynamic-SQL text.
 */
export function computeFunctionClosure(capture: F018Capture, seeds: readonly string[]): string[] {
  const byName = functionsByName(capture);
  const known = new Set(byName.keys());
  const seen = new Set<string>();
  const queue = seeds.filter((name) => known.has(name));
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    for (const row of byName.get(name) ?? []) {
      const body = str(row, "definition");
      for (const other of known) {
        if (other !== name && !seen.has(other) && new RegExp(`(?<![A-Za-z0-9_])${other}\\s*\\(`).test(body)) queue.push(other);
      }
    }
  }
  return [...seen].sort();
}

export function triggerFunctionSeeds(capture: F018Capture, relations: readonly string[]): string[] {
  const wanted = new Set(relations);
  const seeds = new Set<string>();
  for (const row of rowsOf(capture, "triggers")) {
    const relation = str(row, "relation").replace(/^public\./, "");
    if (!wanted.has(relation)) continue;
    const match = /^(?:[A-Za-z0-9_"]+\.)?([A-Za-z0-9_]+)\(/.exec(str(row, "function"));
    if (match) seeds.add(match[1]!);
  }
  return [...seeds];
}

const hasUniqueOn = (capture: F018Capture, relation: string, columns: string[]): boolean => {
  const pattern = new RegExp(`\\(${columns.map((column) => `"?${column}"?`).join(",\\s*")}\\)`);
  return rowsOf(capture, "indexes").some((row) => str(row, "relation").replace(/^public\./, "") === relation && row.unique === true && pattern.test(str(row, "definition")))
    || rowsOf(capture, "constraints").some((row) => str(row, "relation").replace(/^public\./, "") === relation && ["u", "p"].includes(str(row, "type")) && pattern.test(str(row, "definition")));
};

/** Compares a capture against the manifest; a material finding fails closed. */
export function analyzeCapture(capture: F018Capture, groups: readonly F018CaptureGroup[] = F018_CAPTURE_GROUPS): F018DriftReport {
  const findings: DriftFinding[] = [];
  for (const section of Object.values(capture.sections)) {
    if (section.status === "unavailable" && !section.optional) findings.push(finding("REQUIRED_SECTION_UNAVAILABLE", section.id, true, section.error?.message ?? "unavailable"));
  }

  const byName = functionsByName(capture);
  const relations = new Map(rowsOf(capture, "relations").map((row) => [str(row, "relation").replace(/^public\./, ""), row] as const));
  const triggers = new Set(rowsOf(capture, "triggers").map((row) => str(row, "name")));
  const policies = new Set(rowsOf(capture, "policies").map((row) => str(row, "name")));

  for (const group of groups) {
    for (const name of group.functions) {
      if (!byName.has(name)) findings.push(finding("MISSING_FUNCTION", name, true, `${group.task}: expected function absent from live capture`));
    }
    for (const relation of group.relations) {
      if (!relations.has(relation)) findings.push(finding("MISSING_RELATION", relation, true, `${group.task}: expected relation absent from live capture`));
    }
    for (const trigger of group.triggers) if (!triggers.has(trigger)) findings.push(finding("MISSING_TRIGGER", trigger, true, `${group.task}: named trigger binding absent`));
    for (const policy of group.policies) if (!policies.has(policy)) findings.push(finding("MISSING_POLICY", policy, true, `${group.task}: named policy absent`));
  }

  const manifestNames = new Set(manifestFunctionNames());
  for (const [name, overloads] of byName) {
    if (manifestNames.has(name) && overloads.length > 1) {
      findings.push(finding("UNEXPECTED_OVERLOAD", name, false, `${overloads.length} overloads: ${overloads.map((row) => str(row, "regprocedure")).join("; ")}`));
    }
  }
  for (const [name, overloads] of byName) {
    for (const row of overloads) {
      const exposed = (role: string) => (row.effective_execute as Record<string, unknown> | undefined)?.[role] === true;
      if (F018_RETIRED_FUNCTIONS.includes(name)) {
        const open = [...F018_APPLICATION_ROLES, "PUBLIC"].filter(exposed);
        if (open.length) findings.push(finding("RETIRED_FUNCTION_EXECUTABLE", str(row, "regprocedure"), true, `retired function executable by ${open.join(",")}`));
      } else if (row.security_definer === true && exposed("PUBLIC")) {
        findings.push(finding("PUBLIC_EXECUTE_EXPOSURE", str(row, "regprocedure"), false, "SECURITY DEFINER function executable by PUBLIC"));
      }
      if (row.security_definer === true) {
        const config = Array.isArray(row.config) ? (row.config as string[]) : [];
        if (!config.some((entry) => /^search_path=/.test(entry))) {
          findings.push(finding("SECDEF_UNPINNED_SEARCH_PATH", str(row, "regprocedure"), false, "SECURITY DEFINER function has no pinned search_path"));
        }
      }
    }
  }

  const seeds = [...new Set([...manifestNames, ...triggerFunctionSeeds(capture, groups.flatMap((group) => group.relations))])];
  const closure = computeFunctionClosure(capture, seeds);

  const facts: Record<string, unknown> = {
    order_items_unique_order_offer: hasUniqueOn(capture, "order_items", ["order_id", "offer_id"]),
    orders_draft_unique_index: rowsOf(capture, "indexes").filter((row) => str(row, "relation").endsWith("orders") && row.unique === true && /DRAFT/i.test(str(row, "predicate"))).map((row) => str(row, "name")),
    payment_accounts_default_unique: rowsOf(capture, "indexes").filter((row) => str(row, "relation").endsWith("payment_accounts") && row.unique === true && /default/i.test(str(row, "definition"))).map((row) => str(row, "name")),
    inventory_positions_unique: rowsOf(capture, "indexes").filter((row) => str(row, "relation").endsWith("inventory_positions") && row.unique === true).map((row) => `${str(row, "name")} nulls_not_distinct=${String(row.nulls_not_distinct)}`),
    proforma_immutability_triggers: rowsOf(capture, "triggers").filter((row) => /proforma|order_financials/.test(str(row, "relation"))).map((row) => `${str(row, "relation")}:${str(row, "name")}`),
    functions_total: rowsOf(capture, "functions").length,
    manifest_functions_present: manifestFunctionNames().filter((name) => byName.has(name)).length,
    manifest_functions_total: manifestFunctionNames().length,
    closure_size: closure.length,
  };
  return { ok: !findings.some((item) => item.material), findings, facts, closure };
}

/** Reconciliation: live capture versus the repository-derived baseline (local PostgreSQL built from the migration chain). */
export function diffCaptures(live: F018Capture, baseline: F018Capture, subjects?: readonly string[]): DriftFinding[] {
  const findings: DriftFinding[] = [];
  const index = (capture: F018Capture) => new Map(rowsOf(capture, "functions").map((row) => [str(row, "regprocedure"), row] as const));
  const liveIndex = index(live);
  const baseIndex = index(baseline);
  const wanted = subjects ? new Set(subjects) : undefined;
  const nameOf = (signature: string) => signature.slice(0, signature.indexOf("(")).replace(/^public\./, "");
  for (const [signature, row] of liveIndex) {
    if (wanted && !wanted.has(nameOf(signature))) continue;
    const other = baseIndex.get(signature);
    if (!other) { findings.push(finding("SIGNATURE_ONLY_IN_LIVE", signature, true, "present in live, absent from repository-derived baseline")); continue; }
    if (str(row, "definition") !== str(other, "definition")) findings.push(finding("DEFINITION_MISMATCH", signature, true, `live md5 ${md5(str(row, "definition"))} vs baseline md5 ${md5(str(other, "definition"))}`));
    const liveAcl = stableStringify(row.effective_execute), baseAcl = stableStringify(other.effective_execute);
    if (liveAcl !== baseAcl) findings.push(finding("ACL_MISMATCH", signature, true, `live ${liveAcl.replace(/\s+/g, "")} vs baseline ${baseAcl.replace(/\s+/g, "")}`));
  }
  for (const [signature] of baseIndex) {
    if (wanted && !wanted.has(nameOf(signature))) continue;
    if (!liveIndex.has(signature)) findings.push(finding("SIGNATURE_ONLY_IN_BASELINE", signature, true, "present in repository-derived baseline, absent from live"));
  }
  return findings;
}

/** Catalog sections compared by key. `compare` lists the fields whose values must match exactly. */
const CATALOG_COMPARISONS: readonly { section: string; key: (row: Row) => string; compare: readonly string[] }[] = [
  { section: "triggers", key: (row) => `${str(row, "relation")}|${str(row, "name")}`, compare: ["enabled", "function", "definition"] },
  { section: "policies", key: (row) => `${str(row, "relation")}|${str(row, "name")}`, compare: ["command", "permissive", "roles", "using", "check"] },
  { section: "constraints", key: (row) => `${str(row, "relation")}|${str(row, "name")}`, compare: ["type", "validated", "definition"] },
  { section: "indexes", key: (row) => `${str(row, "relation")}|${str(row, "name")}`, compare: ["unique", "valid", "predicate", "definition"] },
  { section: "relations", key: (row) => str(row, "relation"), compare: ["kind", "owner", "rls_enabled", "rls_forced", "acl", "columns", "view_definition", "options"] },
  { section: "enums", key: (row) => str(row, "type"), compare: ["labels"] },
];

/** Full catalog reconciliation (functions plus triggers, policies, constraints, indexes, relations, enums). */
export function diffCatalogs(live: F018Capture, baseline: F018Capture): DriftFinding[] {
  const findings = diffCaptures(live, baseline);
  for (const { section, key, compare } of CATALOG_COMPARISONS) {
    const liveRows = new Map(rowsOf(live, section).map((row) => [key(row), row] as const));
    const baseRows = new Map(rowsOf(baseline, section).map((row) => [key(row), row] as const));
    for (const [id, row] of liveRows) {
      const other = baseRows.get(id);
      if (!other) { findings.push(finding("OBJECT_ONLY_IN_LIVE", `${section}:${id}`, true, "present in live, absent from repository-derived baseline")); continue; }
      const differing = compare.filter((field) => stableStringify(row[field]) !== stableStringify(other[field]));
      if (differing.length) findings.push(finding("OBJECT_MISMATCH", `${section}:${id}`, true, `fields differ: ${differing.join(", ")}`));
    }
    for (const id of baseRows.keys()) if (!liveRows.has(id)) findings.push(finding("OBJECT_ONLY_IN_BASELINE", `${section}:${id}`, true, "present in repository-derived baseline, absent from live"));
  }
  return findings;
}

const md5 = (text: string) => createHash("md5").update(text).digest("hex");

export function renderEvidenceMarkdown(capture: F018Capture, report: F018DriftReport, runInfo: { when: string; command: string }): string {
  const meta = rowsOf(capture, "meta")[0] ?? {};
  const lines: string[] = [];
  lines.push("# Feature 018 Schema Capture Evidence", "");
  lines.push(`- Captured: ${runInfo.when}`);
  lines.push(`- Source: ${capture.source}`);
  lines.push(`- Command: \`${runInfo.command}\``);
  lines.push(`- Target: ${capture.target ? `${capture.target.project} (${capture.target.ref})` : "n/a (local/reference)"}`);
  lines.push(`- Server: PostgreSQL ${String(meta.server_version ?? "unknown")}; database \`${String(meta.database ?? "?")}\`; session user \`${String(meta.session_user ?? "?")}\``);
  lines.push(`- Transaction read-only at capture: ${String(meta.transaction_read_only ?? "unknown")}`);
  lines.push(`- Secret-pattern redactions applied: ${capture.redactions}`);
  lines.push("- Mutation performed: none. Every section is a single SELECT inside BEGIN TRANSACTION READ ONLY ... ROLLBACK; no secret value or private row payload was read.", "");
  lines.push("## Sections", "", "| Section | Task | Status | Rows | SHA-256 of rows |", "| --- | --- | --- | ---: | --- |");
  for (const section of Object.values(capture.sections)) {
    lines.push(`| ${section.id} | ${section.task} | ${section.status}${section.error ? ` (${section.error.code})` : ""} | ${section.rows.length} | \`${section.status === "captured" ? sectionDigest(section).slice(0, 16) : "-"}\` |`);
  }
  lines.push("", "## Drift and expectation findings", "");
  if (!report.findings.length) lines.push("None.");
  for (const item of report.findings) lines.push(`- ${item.material ? "**MATERIAL**" : "informational"} \`${item.kind}\` ${item.subject}: ${item.detail}`);
  lines.push("", `Fail-closed verdict: ${report.ok ? "no material drift against the manifest" : "MATERIAL DRIFT PRESENT"}.`, "", "## Facts", "");
  for (const [key, value] of Object.entries(report.facts)) lines.push(`- ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  lines.push("", `## Binding/call closure (${report.closure.length} functions)`, "", report.closure.map((name) => `\`${name}\``).join(", "), "");
  return lines.join("\n");
}

export function writeEvidence(capture: F018Capture, report: F018DriftReport, outDir: string, runInfo: { when: string; command: string }, basename = "schema-capture"): { json: string; markdown: string } {
  mkdirSync(outDir, { recursive: true });
  const json = join(outDir, `${basename}.json`);
  const markdown = join(outDir, `${basename}.md`);
  writeFileSync(json, `${stableStringify(capture)}\n`);
  writeFileSync(markdown, `${renderEvidenceMarkdown(capture, report, runInfo)}\n`);
  return { json, markdown };
}

export function readCapture(path: string): F018Capture {
  return JSON.parse(readFileSync(path, "utf8")) as F018Capture;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv: string[]): number {
  const flag = (name: string) => argv.includes(name);
  const option = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
  const outDir = resolve(option("--out") ?? F018_EVIDENCE_DIR);
  if (flag("--target-check")) {
    const target = assertF018Target({ ...process.env, [F018_APPROVAL_ENV]: "1" });
    console.log(`F018 target identity verified: ${target.projectName} (${target.ref}); HTTP ${target.httpOrigin}; PostgreSQL ${target.poolerUser}@${target.poolerHost}:${target.poolerPort}; no connection opened.`);
    return 0;
  }
  const when = new Date().toISOString();
  if (flag("--remote")) {
    const target = assertF018Target(process.env);
    console.log(`F018 REMOTE READ-ONLY capture: ${target.projectName} (${target.ref})`);
    const capture = captureSchema(createRemoteReadOnlyRunner(target), F018_SECTIONS, target);
    const report = analyzeCapture(capture);
    const paths = writeEvidence(capture, report, outDir, { when, command: "npx tsx scripts/f018-capture-schema.ts --remote" });
    console.log(`Wrote ${paths.markdown} and ${paths.json}; ${report.findings.filter((item) => item.material).length} material finding(s).`);
    return report.ok ? 0 : 3;
  }
  if (flag("--local")) {
    const database = option("--database") ?? F018_LOCAL_DATABASE;
    const capture = captureSchema(createLocalDockerRunner(database));
    const report = analyzeCapture(capture);
    const paths = writeEvidence(capture, report, outDir, { when, command: `npx tsx scripts/f018-capture-schema.ts --local --database ${database}` }, `local-baseline-${database}`);
    console.log(`Wrote ${paths.markdown} and ${paths.json}`);
    return 0;
  }
  if (flag("--reconcile")) {
    const live = readCapture(resolve(option("--live") ?? `${F018_EVIDENCE_DIR}/schema-capture.json`));
    const baseline = readCapture(resolve(option("--baseline") ?? `${F018_EVIDENCE_DIR}/local-baseline-${F018_LOCAL_BASE_DATABASE}.json`));
    const findings = diffCatalogs(live, baseline);
    const byKind = new Map<string, number>();
    for (const item of findings) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
    console.log(JSON.stringify({ findings: findings.length, byKind: Object.fromEntries(byKind) }));
    for (const item of findings.slice(0, Number(option("--limit") ?? 80))) console.log(`${item.kind} ${item.subject} :: ${item.detail}`);
    return findings.length ? 4 : 0;
  }
  console.error("Usage: f018-capture-schema.ts --target-check | --remote | --local [--database name] [--out dir] | --reconcile [--live file] [--baseline file]");
  return 2;
}

if (process.argv[1] && /f018-capture-schema\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) {
    console.error(error instanceof Error ? error.message : "f018 capture failed");
    process.exitCode = 1;
  }
}
