import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { C15_BODY_MD5 } from "../t056-rls-proof";
import { CONFIG_TABLES, conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T058 (MP-2) — static and security tests for M3 `supabase/migrations/20260925120000_feature_013_rls_realignment.sql`,
 * its rollback and its postflight. No database access. The live proof is T062 (the T056 suites with F013_RLS_PHASE=POST_M3).
 *
 * Accept (tasks.md T057/T058): every replaced policy name/expression is pinned (against the T006 §7 capture); no policy on a
 * finance table references can_view_order; no config-table policy is touched; the C15 `revoke … from public, anon` statements
 * are pinned and nothing revokes them from authenticated/service_role; helper bodies/search_path unchanged; R1 column
 * boundary; §2 views security_invoker; MFA gates; rollback symmetry.
 */

const FILE = "20260925120000_feature_013_rls_realignment.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_rls_realignment_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollback = normalize(stripComments(rollbackRaw));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
const contains = (haystack: string, needle: string, label?: string) => expect(haystack, label ?? needle).toContain(normalize(needle));
/** Whitespace-insensitive, case-insensitive, unqualified-name comparison of two SQL expressions. */
const expr = (s: string | null) => (s ?? "").replace(/public\./g, "").replace(/\s+/g, "").toLowerCase();

// ── the T006 §7 policy baseline (authoritative rollback text) ─────────────────────────────────────────────────────
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c; }
    else if (c === '"') quoted = true; else if (c === ",") { row.push(field); field = ""; } else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.filter((r) => r.length === header!.length).map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i]!])));
}
const BASELINE = parseCsv(readFileSync(`${SPEC}/preflight-evidence/section7-policies.csv`, "utf8").replace(/\r/g, ""));
const REPLACED = ["order_items_view", "financials_view", "financials_finance_read", "proforma_view", "proforma_items_view", "payments_view", "payments_finance_read",
  "payment_proofs_view", "payment_proofs_finance_read", "payment_reviews_finance", "tax_invoice_view", "tax_invoice_finance", "payouts_finance", "shipments_view", "shipment_items_view"];
const baseline = (name: string) => BASELINE.find((p) => p.policyname === name)!;
const nullable = (v: string | undefined) => (v === undefined || v === "" || v === "null" ? null : v);

/** The exact USING text of every M3 read policy (pg_policies form), pinned. */
const NEW_POLICIES: Record<string, [table: string, using: string]> = {
  order_items_read: ["order_items", "(is_order_buyer_member(order_id) or is_order_line_seller(seller_organization_id) or is_finance_operator() or is_platform_admin())"],
  order_financials_read: ["order_financials", "(is_order_buyer_member(order_id) or is_finance_operator() or is_auditor() or is_platform_admin())"],
  proforma_invoices_read: ["proforma_invoices", "(is_order_buyer_member(order_id) or is_finance_operator() or is_platform_admin())"],
  proforma_items_read: ["proforma_invoice_items", "(exists (select 1 from proforma_invoices pi where pi.id = proforma_invoice_items.proforma_id and is_order_buyer_member(pi.order_id)) or is_order_line_seller(seller_organization_id) or is_finance_operator() or is_platform_admin())"],
  payments_read: ["payments", "(is_order_buyer_member(order_id) or is_finance_operator() or is_platform_admin())"],
  payment_proofs_read: ["payment_proofs", "(exists (select 1 from payments p where p.id = payment_proofs.payment_id and is_order_buyer_member(p.order_id)) or is_finance_operator())"],
  payment_reviews_finance_read: ["payment_reviews", "(is_finance_operator())"],
  tax_invoices_read: ["tax_invoices", "(is_order_buyer_member(order_id) or is_finance_operator() or is_platform_admin())"],
  payouts_finance_read: ["payouts", "(is_finance_operator())"],
  shipments_read: ["order_shipments", "((shipment_kind = 'DELIVERY_REQUEST' and (can_view_order(order_id) or is_warehouse_operator())) or (shipment_kind = 'FULFILLMENT' and (is_order_buyer_member(order_id) or is_order_line_seller(fulfillment_seller_organization_id) or is_warehouse_operator() or is_finance_operator())))"],
  shipment_items_read: ["shipment_items", "(exists (select 1 from order_shipments s where s.id = shipment_items.shipment_id))"],
  proforma_line_economics_read: ["proforma_line_economics", "(is_order_line_seller(seller_organization_id) or is_finance_operator() or is_platform_admin())"],
  proforma_fulfillment_groups_read: ["proforma_fulfillment_groups", "(exists (select 1 from proforma_invoices pi where pi.id = proforma_fulfillment_groups.proforma_id and is_order_buyer_member(pi.order_id)) or is_order_line_seller(seller_organization_id) or is_finance_operator() or is_warehouse_operator() or is_platform_admin())"],
  proforma_seller_settlements_read: ["proforma_seller_settlements", "(is_order_line_seller(seller_organization_id) or is_finance_operator() or is_platform_admin())"],
  proforma_bank_instructions_read: ["proforma_bank_instructions", "(exists (select 1 from proforma_invoices pi where pi.id = proforma_bank_instructions.proforma_id and is_order_buyer_member(pi.order_id)) or is_finance_operator())"],
  reconciliation_cases_read: ["reconciliation_cases", "(is_finance_operator() or is_platform_admin())"],
  reconciliation_case_events_read: ["reconciliation_case_events", "(is_finance_operator() or is_platform_admin())"],
  manual_financial_adjustments_read: ["manual_financial_adjustments", "(is_finance_operator() or is_platform_admin() or is_auditor())"],
};
const FINANCE_TABLES = ["order_items", "order_financials", "proforma_invoices", "proforma_invoice_items", "proforma_line_economics", "proforma_fulfillment_groups",
  "proforma_seller_settlements", "proforma_bank_instructions", "payments", "payment_proofs", "payment_reviews", "reconciliation_cases", "reconciliation_case_events",
  "manual_financial_adjustments", "tax_invoices", "payouts"];
const M2_TABLES = ["proforma_line_economics", "proforma_fulfillment_groups", "proforma_seller_settlements", "proforma_bank_instructions", "reconciliation_cases",
  "reconciliation_case_events", "manual_financial_adjustments"];
const VIEWS = ["v_audit_payments", "v_audit_proformas", "v_buyer_reconciliation", "v_finance_review_queue", "v_seller_order_lines"];
const ROW_FUNCTIONS: Record<string, [view: string, audience: string]> = {
  audit_payment_rows: ["v_audit_payments", "public.is_auditor()"], audit_proforma_rows: ["v_audit_proformas", "public.is_auditor()"],
  buyer_reconciliation_rows: ["v_buyer_reconciliation", "public.is_order_buyer_member(c.order_id)"], finance_review_queue_rows: ["v_finance_review_queue", "public.is_finance_operator()"],
};
const ORDER_COLUMNS_KEPT = ["id", "order_code", "buyer_organization_id", "status", "currency", "shipping_ready_at", "hold_started_at", "hold_expires_at", "confirmed_at",
  "paid_at", "completed_at", "created_by", "created_at", "updated_at", "idempotency_key", "correlation_id", "commerce_flow", "cancelled_at", "cancelled_by", "cancel_reason",
  "has_manual_adjustment", "current_proforma_id"];

// rls-storage §1 tables; the ones that carry no gate hold no buyer/seller/finance data for clients (outbox/log: no client access;
// notifications: own-user messages; campaigns: PA; settings: PA/F configuration).
const rlsStorage = readFileSync(`${SPEC}/contracts/rls-storage.md`, "utf8").replace(/\r/g, "");
const s1 = rlsStorage.slice(rlsStorage.indexOf("## 1."), rlsStorage.indexOf("Every new table"));
const S1_TABLES = [...new Set(s1.split("\n").filter((l) => l.startsWith("| `")).flatMap((l) => [...l.split("|")[1]!.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!)))];
const UNGATED = ["notification_events", "notifications", "notification_deliveries", "notification_campaigns", "commerce_settings", "commerce_request_log", "_recipients"];

function policyBlock(name: string, sql = migrationRaw): string {
  const m = new RegExp(`create policy ${name} on public\\.(\\w+)\\s+([\\s\\S]*?);`).exec(sql);
  if (!m) throw new Error(`no policy ${name}`);
  return m[0];
}
const usingOf = (block: string) => { const m = /using \(([\s\S]*?)\)(?: with check \(|;\s*$)/.exec(block.replace(/\n/g, " ")); return m ? `(${m[1]})` : ""; };

/** M3-specific invariants (the mutation cases prove each bites). */
function m3Violations(raw: string): string[] {
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const problems: string[] = [];
  for (const [name, [table, using]] of Object.entries(NEW_POLICIES)) {
    const m = new RegExp(`create policy ${name} on public\\.${table} for select to authenticated using ([\\s\\S]*?);`).exec(normalize(stripComments(raw)));
    if (!m) { problems.push(`${name}: not a SELECT policy TO authenticated on ${table}`); continue; }
    if (expr(m[1]!) !== expr(using)) problems.push(`${name}: USING drifted`);
  }
  for (const m of top.matchAll(/create policy (\w+) on public\.(\w+) ([^;]*);/g)) {
    if (FINANCE_TABLES.includes(m[2]!) && /can_view_order/.test(m[3]!)) problems.push(`${m[1]}: can_view_order on finance table ${m[2]}`);
    if (/\bfor (all|insert|update|delete)\b/.test(m[3]!)) problems.push(`${m[1]}: a client write policy`);
    if (!/\bto authenticated\b/.test(m[3]!)) problems.push(`${m[1]}: not TO authenticated`);
  }
  if (!/revoke execute on function public\.mfa_satisfied\(\) from public, anon;/.test(top)) problems.push("C15: mfa_satisfied not revoked from public, anon");
  if (!/revoke execute on function public\.kyb_storage_object_authorized\(text, boolean\) from public, anon;/.test(top)) problems.push("C15: kyb helper not revoked from public, anon");
  if (/revoke [^;]* on function public\.(mfa_satisfied|kyb_storage_object_authorized)\([^)]*\) from [^;]*\b(authenticated|service_role)\b/.test(top)) problems.push("C15: revoked from authenticated/service_role");
  if (/create (or replace )?function public\.(mfa_satisfied|kyb_storage_object_authorized|can_view_order)\b/.test(top)) problems.push("a protected helper body is replaced");
  if (/(alter|drop) function public\.(mfa_satisfied|kyb_storage_object_authorized|can_view_order)\b/.test(top)) problems.push("a protected helper is altered/dropped");
  if (!/revoke select on table public\.orders from authenticated;/.test(top)) problems.push("R1: authenticated keeps table-level SELECT on orders");
  const grant = /grant select \(([^)]*)\) on table public\.orders to authenticated;/.exec(top);
  if (!grant || /destination/.test(grant[1]!)) problems.push("R1: the orders column grant is missing or includes a destination column");
  for (const v of VIEWS) if (!new RegExp(`create view public\\.${v} with \\(security_invoker = true\\) as`).test(top)) problems.push(`${v}: not security_invoker`);
  if (/grant [^;]* on table public\.v_\w+ to [^;]*\b(anon|service_role|public)\b/.test(top)) problems.push("a view granted beyond authenticated");
  if (/grant (insert|update|delete|all)[^;]* on table public\.v_/.test(top)) problems.push("a view write grant");
  if (/drop policy (orders_view|orders_create_buyer|orders_update_buyer_or_admin|payouts_view|reservations_admin|delivery_destinations_member_read)\b/.test(top)) problems.push("an unchanged policy was dropped");
  return problems;
}

describe("T058 — M3 satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, no anon grant, no authenticated table write grant, definer functions pinned + explicit grants, no config-table change, no DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from|truncate) public\./);
  });
  it("no config-table (Feature 010) policy, trigger or grant is touched", () => {
    const config = CONFIG_TABLES.join("|");
    expect(migrationTop).not.toMatch(new RegExp(`\\bon (table )?public\\.(${config})\\b`));
    expect(rollbackTop).not.toMatch(new RegExp(`\\bon (table )?public\\.(${config})\\b`));
  });
  it("the postflight is a single read-only query ending in ALL CHECKS PASSED (23 checks)", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
    expect([...postflightRaw.matchAll(/^\s*select (\d+), '/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 23 }, (_, i) => i + 1));
  });
  it("the M3-specific invariants hold", () => {
    expect(m3Violations(migrationRaw)).toEqual([]);
  });
  it.each([
    ["a seller branch re-added to payments", (s: string) => s.replace("using (public.is_order_buyer_member(order_id) or public.is_finance_operator() or public.is_platform_admin());\n\ndrop policy payment_proofs_view",
      "using (public.is_order_buyer_member(order_id) or public.can_view_order(order_id) or public.is_finance_operator() or public.is_platform_admin());\n\ndrop policy payment_proofs_view")],
    ["the auditor re-added to payment_proofs", (s: string) => s.replace("and public.is_order_buyer_member(p.order_id))\n         or public.is_finance_operator());", "and public.is_order_buyer_member(p.order_id))\n         or public.is_finance_operator() or public.is_auditor());")],
    ["a finance FOR ALL write policy kept", (s: string) => s.replace("create policy payouts_finance_read on public.payouts\n  for select to authenticated", "create policy payouts_finance_read on public.payouts\n  for all to authenticated")],
    ["C15: anon revoke removed", (s: string) => s.replace("revoke execute on function public.mfa_satisfied() from public, anon;", "")],
    ["C15: authenticated revoked too", (s: string) => s.replace("revoke execute on function public.kyb_storage_object_authorized(text, boolean) from public, anon;", "revoke execute on function public.kyb_storage_object_authorized(text, boolean) from public, anon, authenticated;")],
    ["C15: a helper body replaced", (s: string) => s.replace("\ncommit;", "\ncreate or replace function public.mfa_satisfied() returns boolean language sql as $function$ select true $function$;\ncommit;")],
    ["R1: destination column granted", (s: string) => s.replace("cancel_reason, has_manual_adjustment, current_proforma_id)", "cancel_reason, has_manual_adjustment, current_proforma_id, destination_snapshot)")],
    ["R1: table-level SELECT kept", (s: string) => s.replace("revoke select on table public.orders from authenticated;", "")],
    ["a view without security_invoker", (s: string) => s.replace("create view public.v_seller_order_lines with (security_invoker = true) as", "create view public.v_seller_order_lines as")],
    ["a view granted to anon", (s: string) => s.replace("grant select on table public.v_audit_payments to authenticated;", "grant select on table public.v_audit_payments to authenticated, anon;")],
    ["orders_view dropped", (s: string) => s.replace("-- 2. Policy replacements", "drop policy orders_view on public.orders;\n-- 2. Policy replacements")],
  ])("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m3Violations(mutated).length).toBeGreaterThan(0);
  });
});

describe("T058 — the 15 replaced policies are pinned to the T006 §7 capture", () => {
  it("the §7 capture holds all 15 (the authoritative rollback text)", () => {
    for (const name of REPLACED) expect(baseline(name), name).toBeDefined();
  });
  it("the guard's expected text for each policy equals the §7 capture exactly (table, permissive, roles, cmd, USING, WITH CHECK)", () => {
    const json = JSON.parse(/v_expected jsonb := \$json\$([\s\S]*?)\$json\$;/.exec(migrationRaw)![1]!) as Record<string, (string | null)[]>;
    expect(Object.keys(json).sort()).toEqual([...REPLACED].sort());
    for (const name of REPLACED) {
      const b = baseline(name);
      expect(json[name], name).toEqual([b.tablename, b.permissive, b.roles, b.cmd, nullable(b.qual), nullable(b.with_check)]);
    }
  });
  it("the migration drops exactly those 15 (and no other pre-existing policy)", () => {
    const dropped = [...migrationTop.matchAll(/drop policy (\w+) on public\.(\w+);/g)].map((m) => m[1]!).sort();
    expect(dropped).toEqual([...REPLACED].sort());
  });
  it("the rollback recreates each of the 15 with the §7 roles, command, USING and WITH CHECK", () => {
    for (const name of REPLACED) {
      const b = baseline(name);
      const block = policyBlock(name, rollbackRaw);
      expect(block, name).toContain(`on public.${b.tablename}`);
      expect(block, name).toContain(`for ${b.cmd.toLowerCase()}`);
      if (b.roles === "{authenticated}") expect(block, name).toContain("to authenticated"); else expect(block, name).not.toMatch(/\bto \w+/);
      // the rollback writes `using (<§7 text>)`, so the clause equals the §7 text wrapped once
      expect(expr(usingOf(block)), name).toBe(expr(`(${b.qual!})`));
      const check = /with check \(([\s\S]*)\);/.exec(block.replace(/\n/g, " "));
      expect(check ? expr(`(${check[1]})`) : null, name).toBe(nullable(b.with_check) === null ? null : expr(`(${b.with_check})`));
    }
  });
});

describe("T058 — §1 seller isolation and the role matrix", () => {
  it("every M3 read policy has its pinned USING; SELECT TO authenticated", () => {
    for (const [name, [table, using]] of Object.entries(NEW_POLICIES)) {
      const block = policyBlock(name);
      expect(block, name).toContain(`on public.${table}`);
      expect(normalize(block), name).toContain("for select to authenticated");
      expect(expr(usingOf(block)), name).toBe(expr(using));
    }
  });
  it("sellers: only own-line predicates (is_order_line_seller on the row's own seller column); never on payments, proofs, financials, header, bank, cases, invoices", () => {
    const sellerTables = Object.entries(NEW_POLICIES).filter(([, [, u]]) => u.includes("is_order_line_seller")).map(([, [t]]) => t).sort();
    expect(sellerTables).toEqual(["order_items", "order_shipments", "proforma_fulfillment_groups", "proforma_invoice_items", "proforma_line_economics", "proforma_seller_settlements"]);
    for (const [, [t, u]] of Object.entries(NEW_POLICIES)) {
      if (!u.includes("is_order_line_seller")) continue;
      expect(u, t).toMatch(/is_order_line_seller\((seller_organization_id|fulfillment_seller_organization_id)\)/);
    }
  });
  it("no policy on a finance/snapshot table references can_view_order (only shipments' DELIVERY_REQUEST branch keeps it)", () => {
    for (const [name, [table, using]] of Object.entries(NEW_POLICIES)) {
      if (FINANCE_TABLES.includes(table)) expect(using, name).not.toContain("can_view_order");
    }
    expect(NEW_POLICIES.shipments_read[1]).toMatch(/shipment_kind = 'DELIVERY_REQUEST' and \(can_view_order/);
  });
  it("auditors: order_financials and adjustments only (payments/proofs via v_audit_payments); warehouse: groups and shipments only", () => {
    const audit = Object.entries(NEW_POLICIES).filter(([, [, u]]) => u.includes("is_auditor")).map(([, [t]]) => t).sort();
    expect(audit).toEqual(["manual_financial_adjustments", "order_financials"]);
    const warehouse = Object.entries(NEW_POLICIES).filter(([, [, u]]) => u.includes("is_warehouse_operator")).map(([, [t]]) => t).sort();
    expect(warehouse).toEqual(["order_shipments", "proforma_fulfillment_groups"]);
  });
  it("bank instructions: B ∨ F only (no PA or auditor bypass); payment proofs: B ∨ F only", () => {
    expect(NEW_POLICIES.proforma_bank_instructions_read[1]).not.toMatch(/is_platform_admin|is_auditor|is_order_line_seller/);
    expect(NEW_POLICIES.payment_proofs_read[1]).not.toMatch(/is_platform_admin|is_auditor|is_order_line_seller|warehouse/);
  });
  it("C6: finance direct writes reduced to SELECT (payment_reviews, tax_invoices, payouts); payouts_view kept", () => {
    for (const n of ["payment_reviews_finance_read", "tax_invoices_read", "payouts_finance_read"]) contains(normalize(policyBlock(n)), "for select to authenticated");
    expect(migrationTop).not.toMatch(/drop policy payouts_view/);
  });
  it("the M2b/M2c tables gain authenticated SELECT only; the helpers are definer, pinned and anon-free; order_seller_org_ids is internal", () => {
    for (const t of M2_TABLES) contains(migrationTop, `grant select on table public.${t} to authenticated;`);
    expect(migrationTop).not.toMatch(/grant (insert|update|delete|all)[^;]* on table public\.(proforma_|reconciliation|manual_)/);
    for (const f of ["is_order_buyer_member", "is_order_line_seller", "order_seller_org_ids"]) {
      expect(new RegExp(`create or replace function public\\.${f}\\([^)]*\\)[\\s\\S]*?security definer\\s+set search_path = pg_catalog, public`).test(migrationRaw), f).toBe(true);
    }
    contains(migrationTop, "revoke all on function public.order_seller_org_ids(uuid) from public, anon, authenticated;");
    contains(migrationTop, "grant execute on function public.order_seller_org_ids(uuid) to service_role;");
    contains(migration, "not public.is_blocked_user()");
  });
});

describe("T058 — T029 R1: the buyer destination is unreachable for sellers (column boundary, orders row policy unchanged)", () => {
  it("authenticated loses table-level SELECT on orders and gets every column except the two destination columns", () => {
    contains(migrationTop, "revoke select on table public.orders from authenticated;");
    const cols = /grant select \(([^)]*)\) on table public\.orders to authenticated;/.exec(migrationTop)![1]!.split(",").map((c) => c.trim());
    expect(cols).toEqual(ORDER_COLUMNS_KEPT);
    const guardCols = /c_order_columns constant text\[\] := array\[([\s\S]*?)\];/.exec(migrationRaw)![1]!.match(/'([a-z_]+)'/g)!.map((c) => c.replace(/'/g, ""));
    expect(guardCols.filter((c) => !["delivery_destination_id", "destination_snapshot"].includes(c))).toEqual(ORDER_COLUMNS_KEPT);
  });
  it("orders_view, can_view_order() and the orders write policies stay untouched (sellers keep status visibility)", () => {
    expect(migrationTop).not.toMatch(/(drop|alter) policy \w+ on public\.orders\b/);
    expect([...migrationTop.matchAll(/create policy (\w+) on public\.orders\b/g)].map((m) => m[1])).toEqual(["mfa_gate_orders"]);
    contains(migration, "'eef50520051e17d1f16985517158b825'");
  });
  it("the rollback restores the table-level SELECT and removes the column grant", () => {
    contains(rollbackTop, `revoke select (${ORDER_COLUMNS_KEPT.join(", ")}) on table public.orders from authenticated;`);
    contains(rollbackTop, "grant select on table public.orders to authenticated;");
  });
});

describe("T058 — §2 redacted views", () => {
  it("all 5 are security_invoker = true, SELECT to authenticated only, revoked from anon/PUBLIC/service_role", () => {
    for (const v of VIEWS) {
      contains(migrationTop, `create view public.${v} with (security_invoker = true) as`);
      contains(migrationTop, `grant select on table public.${v} to authenticated;`);
    }
    contains(migrationTop, `revoke all on table ${VIEWS.map((v) => `public.${v}`).join(", ")} from public, anon, authenticated, service_role;`);
  });
  it("the 4 audience views read one definer row function each that re-checks the audience AND MFA and is not anon-callable", () => {
    for (const [fn, [view, audience]] of Object.entries(ROW_FUNCTIONS)) {
      contains(migrationTop, `create view public.${view} with (security_invoker = true) as select * from public.${fn}();`);
      const body = new RegExp(`create or replace function public\\.${fn}\\(\\)[\\s\\S]*?security definer\\s+set search_path = pg_catalog, public\\s+as \\$function\\$([\\s\\S]*?)\\$function\\$;`).exec(migrationRaw)?.[1];
      expect(body, fn).toBeDefined();
      expect(body!, fn).toContain(audience);
      expect(body!, fn).toContain("public.mfa_satisfied()");
      contains(migrationTop, `revoke all on function public.${fn}() from public, anon;`);
    }
  });
  it("redaction: bank reference masked to last 4; no proof path, IBAN/account number, finance note or observed bank data for buyers; no buyer totals for sellers", () => {
    contains(migration, "'****' || right(p.observed_bank_reference, 4)");
    const fnBodies = Object.keys(ROW_FUNCTIONS).map((fn) => new RegExp(`function public\\.${fn}\\(\\)[\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`).exec(migrationRaw)![1]!);
    for (const b of fnBodies) expect(b).not.toMatch(/object_path|file_asset|iban|account_number|swift|resolution_note|buyer_snapshot|destination/i);
    expect(fnBodies[2]).not.toMatch(/observed|note|reason/);
    const seller = /create view public\.v_seller_order_lines[\s\S]*?where public\.is_order_line_seller\(oi\.seller_organization_id\);/.exec(migrationRaw)![0];
    expect(seller).not.toMatch(/buyer_total|buyer_net|bank|proof|destination|hills_share|order_financials|proforma_invoices\b|payments\b/);
    expect(seller).toMatch(/where public\.is_order_line_seller\(oi\.seller_organization_id\);$/);
  });
});

describe("T058 — restrictive MFA gates", () => {
  const gates = [...migrationTop.matchAll(/create policy mfa_gate_(\w+) on public\.(\w+) as restrictive for select to authenticated using \(public\.mfa_satisfied\(\)\);/g)];
  it("exactly the §1 tables holding buyer/seller/finance data are gated (RESTRICTIVE SELECT TO authenticated USING mfa_satisfied())", () => {
    expect(gates.every((m) => m[1] === m[2])).toBe(true);
    const gated = gates.map((m) => m[2]!).sort();
    const expected = S1_TABLES.filter((t) => !UNGATED.includes(t)).concat(["shipment_items"]).filter((t, i, a) => a.indexOf(t) === i).sort();
    expect(gated).toEqual(expected);
    expect(gated).toHaveLength(24);
    for (const t of ["offer_price_tiers", "promotions", "promotion_targets"]) expect(gated, `M2d F3: ${t}`).toContain(t);
  });
  it("no other table (and no pre-existing gate) is touched; the rollback drops exactly these 24", () => {
    expect([...migrationTop.matchAll(/create policy mfa_gate_/g)]).toHaveLength(24);
    expect(migrationTop).not.toMatch(/drop policy mfa_gate_/);
    const dropped = [...rollbackTop.matchAll(/drop policy mfa_gate_(\w+) on public\.(\w+);/g)].map((m) => m[2]!).sort();
    expect(dropped).toEqual(gates.map((m) => m[2]!).sort());
  });
});

describe("T058 — DB-OPEN-C15", () => {
  it("pins the anon/PUBLIC EXECUTE revocation and never revokes authenticated or service_role", () => {
    contains(migrationTop, "revoke execute on function public.mfa_satisfied() from public, anon;");
    contains(migrationTop, "revoke execute on function public.kyb_storage_object_authorized(text, boolean) from public, anon;");
    expect(migrationTop).not.toMatch(/revoke [^;]* on function public\.(mfa_satisfied|kyb_storage_object_authorized)\([^)]*\) from [^;]*\b(authenticated|service_role)\b/);
  });
  it("bodies, SECURITY DEFINER and search_path are not changed; the guard pins the T056 body md5s and the pre-M3 ACL", () => {
    expect(migrationTop).not.toMatch(/function public\.(mfa_satisfied|kyb_storage_object_authorized)\(\)?[^;]*(returns|set search_path|security)/);
    contains(migration, `kyb_storage_object_authorized:${C15_BODY_MD5.kyb}:true:{"search_path=pg_catalog, public, auth"}:{postgres=x/postgres,anon=x/postgres,authenticated=x/postgres,service_role=x/postgres}`);
    contains(migration, `mfa_satisfied:${C15_BODY_MD5.mfa}:true:{"search_path=pg_catalog, public, auth"}:{postgres=x/postgres,anon=x/postgres,authenticated=x/postgres,service_role=x/postgres}`);
  });
  it("the rollback restores the exact §5 ACL, entry order included, in the same transaction", () => {
    contains(rollbackTop, "revoke execute on function public.mfa_satisfied() from authenticated, service_role; grant execute on function public.mfa_satisfied() to anon, authenticated, service_role;");
    contains(rollbackTop, "revoke execute on function public.kyb_storage_object_authorized(text, boolean) from authenticated, service_role; grant execute on function public.kyb_storage_object_authorized(text, boolean) to anon, authenticated, service_role;");
  });
});

describe("T058 — rollback and history", () => {
  it("the rollback drops exactly the M3 objects and nothing else", () => {
    expect([...rollbackTop.matchAll(/drop view (public\.\w+);/g)].map((m) => m[1]).sort()).toEqual(VIEWS.map((v) => `public.${v}`).sort());
    expect([...rollbackTop.matchAll(/drop function (public\.\w+)\(/g)].map((m) => m[1]).sort())
      .toEqual(["public.audit_payment_rows", "public.audit_proforma_rows", "public.buyer_reconciliation_rows", "public.finance_review_queue_rows",
                "public.is_order_buyer_member", "public.is_order_line_seller", "public.order_seller_org_ids"]);
    const droppedNew = [...rollbackTop.matchAll(/drop policy (\w+) on/g)].map((m) => m[1]!).filter((n) => !n.startsWith("mfa_gate_")).sort();
    expect(droppedNew).toEqual(Object.keys(NEW_POLICIES).sort());
    for (const t of M2_TABLES) contains(rollbackTop, `revoke select on table public.${t} from authenticated;`);
    expect(rollbackTop).not.toMatch(/\bdrop table\b|\balter table\b/);
  });
  it("the rollback guard refuses while M4a+ is applied (M4a-only names, never a legacy name) or anything else depends on M3", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    for (const n of ["'get_or_create_cart'", "'upsert_delivery_destination'", "'finance_confirm_payment'", "another function references an m3 object", "another policy references an m3 helper", "another view references an m3 object"]) {
      expect(guard, n).toContain(n);
    }
    expect(guard).not.toContain("'submit_payment_proof'");
  });
  it("no applied migration, rollback, postflight or Feature 008 file differs from HEAD", () => {
    const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "supabase/migrations", "supabase/rollback", "supabase/maintenance", "specs/008-stripe-trusted-funding", "specs"], { encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean).filter((f) => !f.endsWith("specs/013-bank-transfer-commerce-core/tasks.md"));
    expect(changed).toEqual([]);
  });
});
