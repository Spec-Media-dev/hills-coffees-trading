import { F013_LOCAL_PROJECT_ID, F013_PRODUCTION_REF, resolveF013Mode } from "@/scripts/f013-local-target";
import { f013ProofEnv, runF013ProofSqlFile, verifiedF013ProofRef } from "./f013-proof-cli";

/** Shared T056 live plumbing: runs SQL on the linked project from a temp file (multi-line args do not survive Windows). */
export const LINKED_REF = resolveF013Mode().kind === "local" ? F013_LOCAL_PROJECT_ID : F013_PRODUCTION_REF;

export type CaseResult = { case: string; relation: string; role: string; expected: string; got: string; ok: boolean };

/**
 * Where the suites stand: "PRE_M3" pins the exact baseline (every case outside the pinned set passes, every pinned case
 * still fails); "POST_M3" (T062) requires every case to pass. Set F013_RLS_PHASE=POST_M3 once M3 is applied.
 */
export const RLS_PHASE: "PRE_M3" | "POST_M3" = process.env.F013_RLS_PHASE === "POST_M3" ? "POST_M3" : "PRE_M3";

export function runSqlFile(sql: string): string {
  return runF013ProofSqlFile(sql, "t056-", 300_000);
}
export function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = runSqlFile(sql);
  const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { rows?: T[] };
  if (!json.rows) throw new Error(`query failed: ${out.slice(0, 500)}`);
  return json.rows;
}
export function decodeResult(raw: string, tag: string): CaseResult[] {
  const match = new RegExp(`${tag}:([A-Za-z0-9+/=]+)`).exec(raw);
  if (!match) throw new Error(raw.slice(0, 2000));
  return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf8")) as CaseResult[];
}
export function env(name: string): string {
  return f013ProofEnv(name);
}
export const linkedRef = verifiedF013ProofRef;

/** Read-only production state the proofs must leave exactly as found. */
export const T056_STATE_SQL = `select
  (select count(*) from public.orders)::int as orders,
  (select count(*) from public.order_items)::int as order_items,
  (select count(*) from public.organizations)::int as organizations,
  (select count(*) from public.organization_members)::int as memberships,
  (select count(*) from public.platform_admins)::int as platform_admins,
  (select count(*) from public.coffee_offers)::int as offers,
  (select md5(string_agg(id::text || status || reserved_quantity_kg::text, '|' order by id)) from public.coffee_offers) as offers_fingerprint,
  (select count(*) from public.inventory_positions)::int as positions,
  (select md5(string_agg(id::text || available_quantity_kg::text || reserved_quantity_kg::text, '|' order by id)) from public.inventory_positions) as positions_fingerprint,
  (select count(*) from public.payments)::int as payments,
  (select count(*) from public.payouts)::int as payouts,
  (select count(*) from public.proforma_invoices)::int as proformas,
  (select count(*) from public.delivery_destinations)::int as destinations,
  (select count(*) from public.reconciliation_cases)::int as recon_cases,
  (select count(*) from public.tax_invoices)::int as tax_invoices,
  (select count(*) from public.order_shipments)::int as shipments,
  (select count(*) from public.inventory_reservations)::int as reservations,
  (select count(*) from public.file_assets)::int as file_assets,
  (select count(*) from public.audit_logs)::int as audit_logs,
  (select max(id) from public.audit_logs)::text as audit_max_id,
  (select count(*) from public.notification_events)::int as outbox,
  (select md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, ''), '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace) as function_acl_fingerprint,
  (select md5(string_agg(tablename || policyname || coalesce(qual, '') || coalesce(with_check, ''), '|' order by tablename, policyname)) from pg_policies where schemaname = 'public') as policy_fingerprint,
  (select bank_transfer_checkout_enabled from public.commerce_settings) as checkout_enabled`;

/** Asserts the phase rule for a result set against its pinned PRE-M3 failure list. */
export function phaseProblems(results: CaseResult[], pinnedFailures: readonly string[]): string[] {
  const problems: string[] = [];
  const names = new Set(results.map((r) => r.case));
  for (const pinned of pinnedFailures) if (!names.has(pinned)) problems.push(`pinned case not produced: ${pinned}`);
  for (const r of results) {
    const pinned = pinnedFailures.includes(r.case);
    if (RLS_PHASE === "POST_M3" || !pinned) {
      if (!r.ok) problems.push(`FAIL ${r.case}: expected [${r.expected}] got [${r.got}]`);
    } else if (r.ok) {
      problems.push(`pinned PRE-M3 failure now passes (update the baseline only together with M3): ${r.case} → [${r.got}]`);
    }
  }
  return problems;
}
