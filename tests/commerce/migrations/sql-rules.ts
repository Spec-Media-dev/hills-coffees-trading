/**
 * Feature 013 T019 — shared static SQL rules for Feature 013 migrations (tasks.md "Migration protocol", MP-2).
 * Used by `conventions.test.ts` (every migration) and each migration's own static test (e.g. m1-state-vocabulary).
 */

export const CONFIG_TABLES = ["platform_admins", "commission_policies", "commission_tiers", "tax_rules", "shipping_rules", "payment_accounts"];
export const FINANCIAL_TABLES = [
  "orders", "order_items", "order_financials", "proforma_invoices", "proforma_invoice_items", "payments", "payment_proofs",
  "payment_reviews", "payouts", "tax_invoices", "inventory_reservations", "inventory_reservation_items", "inventory_positions",
  "inventory_ownership_events", "storage_allocations", "payment_events", "payment_transfers", "coffee_offers",
];
/** Backfills a migration is explicitly allowed to run against financial rows (exact, whitespace-normalized text). */
export const SANCTIONED_DML: Record<string, readonly string[]> = {
  // data-model §5.2 / analysis L3: historical proofs keep their true submission time before NOT NULL.
  "20260925100000_feature_013_commerce_state_vocabulary.sql": ["update public.payment_proofs set submitted_at = created_at where submitted_at is null"],
};

export const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");
/** Removes every dollar-quoted body ($tag$ … $tag$), i.e. function bodies and DO blocks. */
export const stripDollarBodies = (sql: string) => sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "$$$$");
export const maskStrings = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''");
export const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim().toLowerCase();

export type SecurityDefinerFunction = { name: string; header: string };
/** Every `create [or replace] function public.<name>(…) … as $tag$` header (the text before the body). */
export function functionHeaders(sql: string): SecurityDefinerFunction[] {
  const out: SecurityDefinerFunction[] = [];
  for (const m of stripComments(sql).matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\bas\s+\$([A-Za-z_]*)\$/gi)) {
    out.push({ name: m[1]!.toLowerCase(), header: m[0].toLowerCase() });
  }
  return out;
}

/** Violations of the generic MP-2 rules for one forward migration's SQL text. Exported so the mutation tests can prove each rule bites. */
export function conventionViolations(file: string, raw: string): string[] {
  const problems: string[] = [];
  const noComments = stripComments(raw);
  const topLevel = normalize(maskStrings(stripDollarBodies(noComments)));

  // One explicit transaction, guard first.
  if (!/^begin;/.test(topLevel)) problems.push("does not start with begin;");
  if (!/commit;$/.test(topLevel)) problems.push("does not end with commit;");
  const guard = /do\s+\$guard\$([\s\S]*?)\$guard\$\s*;/i.exec(noComments);
  if (!guard) problems.push("no do $guard$ block");
  else {
    if (!/raise\s+exception/i.test(guard[1]!)) problems.push("guard never raises");
    const firstChange = noComments.search(/\b(alter\s+table|create\s+(unique\s+)?index|create\s+table|create\s+(or\s+replace\s+)?function|create\s+sequence|drop\s+)/i);
    if (firstChange !== -1 && firstChange < guard.index) problems.push("a schema change precedes the guard");
  }

  // New tables: RLS enabled + forced, revoked from public/anon.
  for (const m of topLevel.matchAll(/create table (?:if not exists )?public\.(\w+)/g)) {
    const table = m[1]!;
    if (!topLevel.includes(`alter table public.${table} enable row level security`)) problems.push(`${table}: RLS not enabled`);
    if (!topLevel.includes(`alter table public.${table} force row level security`)) problems.push(`${table}: RLS not forced`);
    if (!new RegExp(`revoke all on table public\\.${table} from public, anon\\b`).test(topLevel)) problems.push(`${table}: not revoked from public, anon`);
  }

  // Grants.
  for (const m of topLevel.matchAll(/grant ([^;]*?) on ([^;]*?) to ([^;]*?);/g)) {
    const [privileges, object, roles] = [m[1]!, m[2]!, m[3]!];
    if (/\banon\b/.test(roles)) problems.push(`grant to anon: ${m[0]}`);
    const isTable = !/^(function|sequence|schema|all\s+(functions|sequences))\b/.test(object);
    if (isTable && /\bauthenticated\b/.test(roles) && !/^select$/.test(privileges.trim())) problems.push(`table write grant to authenticated: ${m[0]}`);
  }

  // SECURITY DEFINER functions.
  for (const fn of functionHeaders(raw)) {
    if (!/security\s+definer/.test(fn.header)) continue;
    if (!/set\s+search_path\s*(=|to)/.test(fn.header)) problems.push(`${fn.name}: SECURITY DEFINER without pinned search_path`);
    if (!new RegExp(`revoke all on function public\\.${fn.name}\\([^)]*\\) from public, anon\\b`).test(topLevel)) problems.push(`${fn.name}: no revoke from public, anon`);
    if (!new RegExp(`grant execute on function public\\.${fn.name}\\([^)]*\\) to `).test(topLevel)) problems.push(`${fn.name}: no explicit EXECUTE grant`);
  }

  // Feature 010 configuration tables: no policy or trigger change.
  const config = CONFIG_TABLES.join("|");
  if (new RegExp(`\\b(create|alter|drop) (policy|trigger) [^;]*\\bon public\\.(${config})\\b`).test(topLevel)) problems.push("policy/trigger change on a Feature 010 configuration table");
  if (new RegExp(`alter table public\\.(${config}) [^;]*\\b(enable|disable) trigger\\b`).test(topLevel)) problems.push("trigger enable/disable on a Feature 010 configuration table");

  // DML against financial rows outside function bodies / DO blocks.
  const sanctioned = (SANCTIONED_DML[file] ?? []).map(normalize);
  const dmlSource = normalize(stripDollarBodies(noComments));
  const financial = FINANCIAL_TABLES.join("|");
  for (const m of dmlSource.matchAll(new RegExp(`(?:^|;)\\s*((?:insert into|update|delete from) public\\.(?:${financial})\\b[^;]*)`, "g"))) {
    if (!sanctioned.includes(m[1]!.trim())) problems.push(`unsanctioned DML on a financial table: ${m[1]}`);
  }
  if (/\btruncate\b/.test(topLevel)) problems.push("truncate");
  return problems;
}

/** A postflight must be a single read-only query. */
export function postflightViolations(raw: string): string[] {
  const sql = normalize(maskStrings(stripComments(raw)));
  const problems: string[] = [];
  if (!/^(select|with)\b/.test(sql)) problems.push("does not start with select/with");
  for (const keyword of ["insert", "update", "delete", "merge", "alter", "create", "drop", "grant", "revoke", "truncate", "comment on", "do", "call", "copy", "set_config", "nextval", "setval"]) {
    if (new RegExp(`(^|[;\\s(])${keyword.replace(" ", "\\s+")}\\b`).test(sql)) problems.push(`contains ${keyword}`);
  }
  if ((sql.match(/;/g) ?? []).length > 1) problems.push("more than one statement");
  return problems;
}
