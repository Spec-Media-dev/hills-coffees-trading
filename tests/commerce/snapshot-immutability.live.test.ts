import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { T037, T037_SECRETS, buildT037ProofSql } from "./t037-snapshot-proof";

/**
 * Feature 013 T037 (MP-6) — LIVE proof of M2b against the linked project (gated: F013_LIVE=1; nothing else runs).
 *
 * The whole proof is ONE rolled-back transaction (see `t037-snapshot-proof.ts`): fixtures are created, every M2b rule is
 * exercised (frozen snapshot, deferred totals, immutability, legacy checkout, audit redaction), and the block always
 * ends in `raise exception 'T037_RESULT:<base64 json>'`, so nothing it wrote survives. Afterwards read-only queries prove that
 * production is exactly as before (no T037 id anywhere, snapshot tables empty, no Feature 013 proforma, no M2b audit).
 * Execution: `supabase db query --linked` (Management API, role `postgres`); the linked ref is verified first.
 */

const LIVE = process.env.F013_LIVE === "1";
const LINKED_REF = "mxejnutukgxyccnohglo";
const IDS = Object.values(T037);

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
  const dir = mkdtempSync(path.join(tmpdir(), "t037-"));
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
const STATE_SQL = `select
  (select count(*) from public.orders where id in (${IDS.map((id) => `'${id}'`).join(", ")}) or correlation_id = '${T037.marker}')::int as t037_orders,
  (select count(*) from public.proforma_invoices where id in (${IDS.map((id) => `'${id}'`).join(", ")}) or validity_hours_snapshot is not null)::int as f013_proformas,
  ((select count(*) from public.proforma_line_economics) + (select count(*) from public.proforma_fulfillment_groups)
    + (select count(*) from public.proforma_seller_settlements) + (select count(*) from public.proforma_bank_instructions))::int as snapshot_rows,
  (select count(*) from public.proforma_invoice_items where seller_type_snapshot is not null)::int as f013_lines,
  (select count(*) from public.order_financials where proforma_id is not null)::int as f013_financials,
  (select count(*) from public.orders where current_proforma_id is not null)::int as order_pointers,
  (select count(*) from public.audit_logs where entity_type in ('proforma_invoices', 'proforma_bank_instructions')
     or entity_id in (${IDS.map((id) => `'${id}'`).join(", ")}))::int as t037_audit_rows,
  (select count(*) from public.orders)::int as orders,
  (select count(*) from public.proforma_invoices)::int as proformas,
  (select count(*) from public.payments)::int as payments,
  (select count(*) from public.inventory_reservations where status = 'ACTIVE')::int as active_reservations,
  (select reserved_quantity_kg::text from public.coffee_offers where id = '05000000-0000-4000-8000-000000000005') as offer_reserved,
  (select reserved_quantity_kg::text from public.inventory_positions where id = '05000000-0000-4000-8000-000000000007') as position_reserved,
  (select bank_transfer_checkout_enabled from public.commerce_settings) as checkout_enabled`;

describe.skipIf(!LIVE)("T037 — M2b live proof (one rolled-back transaction; F013_LIVE=1)", () => {
  let before: Record<string, unknown>;
  let after: Record<string, unknown>;
  let results: CaseResult[] = [];
  let raw = "";

  it("runs against the verified linked project and leaves production unchanged", () => {
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim()).toBe(LINKED_REF);
    before = query(STATE_SQL)[0]!;
    expect(before).toMatchObject({ t037_orders: 0, f013_proformas: 0, snapshot_rows: 0, f013_lines: 0, f013_financials: 0, order_pointers: 0, t037_audit_rows: 0, checkout_enabled: false });

    raw = runSqlFile(buildT037ProofSql());
    const match = /T037_RESULT:([A-Za-z0-9+/=]+)/.exec(raw);
    expect(match, raw.slice(0, 2000)).not.toBeNull();
    results = JSON.parse(Buffer.from(match![1]!, "base64").toString("utf8")) as CaseResult[];

    after = query(STATE_SQL)[0]!;
    expect(after, "production state after the proof equals the state before it").toEqual(before);
  }, 400_000);

  it("every proof case passed (frozen snapshot, deferred totals, immutability, legacy checkout, audit redaction)", () => {
    expect(results.length).toBeGreaterThanOrEqual(45);
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 1)).toEqual([]);
    const names = results.map((r) => r.case);
    for (const fragment of ["FROZEN: header totals", "deferred: a zero-placeholder", "FIN-007", "FIN-013", "UPDATE proforma_bank_instructions is refused", "DELETE proforma_line_economics is refused",
                            "LEGACY checkout: order → HOLD", "LEGACY re-checkout", "AUDIT: no audit row"]) {
      expect(names.some((n) => n.includes(fragment)), fragment).toBe(true);
    }
  });

  it("the audit redaction list covers every raw value the proof wrote into snapshots", () => {
    expect(T037_SECRETS).toEqual(expect.arrayContaining(["T037-ACC-1234567890", "AE07T037000000001234567890", "T037 Harbour Road 17", "+971500000037", "T037-TRN-100200300"]));
  });
});
