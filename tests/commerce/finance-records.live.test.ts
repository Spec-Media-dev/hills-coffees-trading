import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { T037 } from "./t037-snapshot-proof";
import { T043, buildT043ProofSql } from "./t043-finance-records-proof";

/**
 * Feature 013 T043 (MP-6) — LIVE proof of M2c against the linked project (gated: F013_LIVE=1; nothing else runs).
 *
 * The whole proof is ONE rolled-back transaction (see `t043-finance-records-proof.ts`, the T037 method): reconciliation
 * cases/events, manual adjustments, Feature 013 invoices and FULFILLMENT shipments are exercised live, and the block always
 * ends in `raise exception 'T043_RESULT:<base64 json>'`, so nothing it wrote survives. Read-only queries before and after
 * prove production is exactly as before. Execution: `supabase db query --linked` (role `postgres`).
 */

const LIVE = process.env.F013_LIVE === "1";
const LINKED_REF = "mxejnutukgxyccnohglo";
const IDS = [...Object.values(T037), ...Object.values(T043)].map((id) => `'${id}'`).join(", ");

function cli(args: string[]): string {
  try {
    return execFileSync("npx", ["supabase", ...args], { encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"], timeout: 180_000 });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}\n${e.stderr ?? ""}`;
  }
}
/** Runs SQL from a temp file (a multi-line argument does not survive the Windows shell). */
function runSqlFile(sql: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "t043-"));
  const file = path.join(dir, "query.sql");
  try {
    writeFileSync(file, sql);
    return cli(["db", "query", "--linked", "-f", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
function query<T = Record<string, unknown>>(sql: string): T[] {
  const out = runSqlFile(sql);
  const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as { rows?: T[] };
  if (!json.rows) throw new Error(`query failed: ${out.slice(0, 500)}`);
  return json.rows;
}

type CaseResult = { case: string; ok: boolean; got: string | null };
const T043_STATE_SQL = `select
  (select count(*) from public.orders where id in (${IDS}) or correlation_id in ('${T037.marker}', '${T043.marker}'))::int as proof_orders,
  (select count(*) from public.reconciliation_cases)::int as reconciliation_cases,
  (select count(*) from public.reconciliation_case_events)::int as reconciliation_case_events,
  (select count(*) from public.manual_financial_adjustments)::int as manual_financial_adjustments,
  (select count(*) from public.tax_invoices)::int as tax_invoices,
  (select coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by id)), 'none') from public.tax_invoices t) as tax_invoices_fingerprint,
  (select count(*) from public.tax_invoices where proforma_id is not null)::int as f013_invoices,
  (select count(*) from public.order_shipments)::int as order_shipments,
  (select count(*) from public.order_shipments where shipment_kind <> 'DELIVERY_REQUEST')::int as fulfillment_shipments,
  (select md5(string_agg(id::text || status || shipment_kind, '|' order by id)) from public.order_shipments) as shipments_fingerprint,
  (select count(*) from public.payments where id in (${IDS}))::int as proof_payments,
  (select count(*) from public.payouts where id in (${IDS}))::int as proof_payouts,
  (select count(*) from public.payment_proofs where id in (${IDS}))::int as proof_proofs,
  (select count(*) from public.file_assets where id in (${IDS}) or bucket_name = 't043-proof-fixture')::int as proof_files,
  (select count(*) from public.proforma_invoices where validity_hours_snapshot is not null)::int as f013_proformas,
  ((select count(*) from public.proforma_line_economics) + (select count(*) from public.proforma_fulfillment_groups)
    + (select count(*) from public.proforma_seller_settlements) + (select count(*) from public.proforma_bank_instructions))::int as snapshot_rows,
  (select count(*) from public.audit_logs where entity_id in (${IDS}) or entity_type in ('reconciliation_cases', 'manual_financial_adjustments', 'proforma_invoices', 'proforma_bank_instructions'))::int as proof_audit_rows,
  (select count(*) from public.orders)::int as orders,
  (select count(*) from public.payments)::int as payments,
  (select bank_transfer_checkout_enabled from public.commerce_settings) as checkout_enabled`;

describe.skipIf(!LIVE)("T043 — M2c live proof (one rolled-back transaction; F013_LIVE=1)", () => {
  let before: Record<string, unknown>;
  let after: Record<string, unknown>;
  let results: CaseResult[] = [];

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim()).toBe(LINKED_REF);
    before = query(T043_STATE_SQL)[0]!;
    expect(before).toMatchObject({ proof_orders: 0, reconciliation_cases: 0, reconciliation_case_events: 0, manual_financial_adjustments: 0, f013_invoices: 0,
                                   fulfillment_shipments: 0, proof_payments: 0, proof_payouts: 0, proof_proofs: 0, proof_files: 0, f013_proformas: 0, snapshot_rows: 0,
                                   proof_audit_rows: 0, checkout_enabled: false });
    const raw = runSqlFile(buildT043ProofSql());
    const match = /T043_RESULT:([A-Za-z0-9+/=]+)/.exec(raw);
    expect(match, raw.slice(0, 2000)).not.toBeNull();
    results = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf8")) as CaseResult[];
    after = query(T043_STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 400_000);

  it("every proof case passed (reconciliation, adjustments, invoices, fulfillment shipments, grants, legacy rows intact)", () => {
    expect(results.length).toBeGreaterThanOrEqual(40);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    const names = results.map((r) => r.case);
    for (const fragment of ["RECON EVENTS: UPDATE is refused", "RECON EVENTS: DELETE is refused", "ADJUSTMENT: UPDATE is refused", "ADJUSTMENT: DELETE is refused",
                            "ADJUSTMENT: a payment of another order", "ADJUSTMENT: a payout of another order", "F013 INVOICE: the snapshot is frozen",
                            "F013 INVOICE: ISSUED → VOID", "LEGACY INVOICE: every pre-existing", "unique index", "FULFILLMENT: a buyer member cannot"]) {
      expect(names.some((n) => n.includes(fragment)), fragment).toBe(true);
    }
  });
});
