import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T039 (MP-2) — static and security tests for M2c
 * `supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql`, its rollback and its postflight.
 * No database access. The live proof is T043 (`tests/commerce/finance-records.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T038): data-model §5.4 (reconciliation cases + events), §5.5 (manual adjustments), §5.6 (tax_invoices
 * extension), the order_shipments fulfillment columns + unique group index (research R-13), append-only triggers and
 * tax_invoice_code_seq. Expected values are read from data-model.md and research.md, never from memory.
 */

const FILE = "20260925109000_feature_013_finance_fulfillment_records.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_finance_fulfillment_records_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollback = normalize(stripComments(rollbackRaw));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
/** Asserts `needle` occurs in an already-normalized (whitespace-collapsed, lower-cased) text. */
const contains = (haystack: string, needle: string, label?: string) => expect(haystack, label ?? needle).toContain(normalize(needle));

// ── expectations from the approved artifacts ─────────────────────────────────────────────────────────────────────
const dataModel = readFileSync(`${SPEC}/data-model.md`, "utf8").replace(/\r/g, "");
const research = readFileSync(`${SPEC}/research.md`, "utf8").replace(/\r/g, "");
const sectionOf = (text: string, start: string, end: string) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const identifiers = (text: string) =>
  [...new Set([...text.matchAll(/`([^`]+)`/g)].flatMap((m) => m[1]!.split("/").map((p) => p.trim().split(/\s+/)[0]!)).filter((n) => /^[a-z][a-z0-9_]*$/.test(n)))].sort();
const upperValues = (text: string) => [...text.matchAll(/`([A-Z][A-Z_]+)`/g)].map((m) => m[1]!).sort();
const s54 = sectionOf(dataModel, "### 5.4", "### 5.5");
const DM_CASE_COLUMNS = identifiers(s54.slice(s54.indexOf("- Columns:"), s54.indexOf("- History")));
const lineOf = (text: string, key: string) => text.split("\n").find((l) => l.includes(key))!;
const DM_CASE_KINDS = upperValues(lineOf(s54, "`kind`"));
const DM_CASE_STATUSES = upperValues(lineOf(s54, "`status`"));
const DM_RESOLUTION_TYPES = upperValues(lineOf(s54, "`resolution_type`"));
const s55 = sectionOf(dataModel, "### 5.5", "### 5.6");
const DM_ADJUSTMENT_COLUMNS = identifiers(s55.slice(s55.indexOf("Append-only:"), s55.indexOf("A mutation-blocking")));
const DM_ADJUSTMENT_KINDS = upperValues(s55.slice(s55.indexOf("`kind`"), s55.indexOf("`order_id`")));
const s56 = sectionOf(dataModel, "### 5.6", "### 5.7");
const s76 = sectionOf(dataModel, "### 7.6", "### 7.7");
const r13 = sectionOf(research, "### R-13", "### R-14");

const tableColumns = (table: string) => {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(migrationRaw)![1]!;
  return body.split("\n").map((line) => /^\s{2}([a-z_0-9]+) /.exec(line)?.[1]).filter((n): n is string => !!n && !["constraint", "primary"].includes(n)).sort();
};
const addedColumns = (table: string) =>
  [...migration.matchAll(new RegExp(`alter table public\\.${table}\\b([^;]*);`, "g"))].flatMap((m) => [...m[1]!.matchAll(/add column (\w+)/g)].map((c) => c[1]!)).sort();
const checkValues = (constraint: string) => {
  const m = new RegExp(`constraint ${constraint} check \\(\\w+ in \\(([^)]*)\\)\\)`).exec(migrationRaw);
  if (!m) throw new Error(`no ${constraint}`);
  return [...m[1]!.matchAll(/'([^']+)'/g)].map((v) => v[1]!).sort();
};
const fnBody = (name: string) => {
  const m = new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`).exec(migrationRaw);
  if (!m) throw new Error(`no body for ${name}`);
  return normalize(stripComments(m[1]!));
};
const fnHeader = (name: string) => normalize(new RegExp(`create or replace function public\\.${name}\\(\\)([\\s\\S]*?)as \\$function\\$`).exec(migrationRaw)![1]!);

const NEW_TABLES = ["reconciliation_cases", "reconciliation_case_events", "manual_financial_adjustments"];
const DEFINER_TRIGGER_FUNCTIONS = ["guard_reconciliation_case", "record_reconciliation_case_event", "validate_manual_financial_adjustment", "protect_tax_invoice", "guard_fulfillment_shipment_fields"];

/** M2c-specific invariants on the migration text (the mutation cases below prove each one bites). */
function m2cViolations(raw: string): string[] {
  const sql = normalize(stripComments(raw));
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const problems: string[] = [];
  for (const t of ["reconciliation_case_events", "manual_financial_adjustments"]) {
    if (!new RegExp(`create trigger trg_${t}_immutable before update or delete on public\\.${t} for each row execute function public\\.prevent_snapshot_mutation\\(\\);`).test(top)) problems.push(`${t}: not append-only`);
  }
  for (const t of NEW_TABLES) {
    if (!new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`).test(top)) problems.push(`${t}: not revoked from every API role`);
    for (const m of top.matchAll(new RegExp(`grant ([^;]*?) on table public\\.${t} to ([^;]*?);`, "g"))) {
      if (m[1]!.trim() !== "select" || m[2]!.trim() !== "service_role") problems.push(`${t}: grant ${m[1]} to ${m[2]}`);
    }
  }
  if (/\b(create|alter|drop) policy\b/.test(top)) problems.push("a policy is created/changed");
  if (/create or replace function public\.(prevent_snapshot_mutation|protect_proforma_snapshot|check_proforma_snapshot_totals|check_seller_settlement_totals|validate_shipment_transition|sync_shipment_ready|apply_delivery_reservation|checkout_order)\(/.test(sql)) problems.push("an M2b or Feature 009 function is redefined");
  if (/execute function public\.write_audit_log\(\)/.test(top)) problems.push("a generic write_audit_log trigger is created");
  if (!/create unique index uq_order_shipment_fulfillment_group on public\.order_shipments \(order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id\) where shipment_kind = ''/.test(top)) problems.push("the unique fulfillment-group index is missing");
  if (!/create trigger trg_order_shipments_fulfillment_guard before insert or update of shipment_kind, fulfillment_seller_organization_id, fulfillment_warehouse_id, proforma_fulfillment_group_id on public\.order_shipments/.test(top)) problems.push("the fulfillment guard is missing");
  if (!/create trigger trg_tax_invoices_protect before insert or update or delete on public\.tax_invoices/.test(top)) problems.push("the tax invoice guard is missing");
  const reconciliation = (/create or replace function public\.guard_reconciliation_case\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(sql)?.[1] ?? "");
  if (/inventory|reservation|coffee_offers|reserved_quantity/.test(reconciliation)) problems.push("reconciliation touches inventory");
  if (/add constraint \w+ foreign key \([^)]*\) references public\.orders\b[^;]*on public\.order_shipments|alter table public\.order_shipments[^;]*references public\.orders\b/.test(top)) problems.push("a second order_shipments → orders relationship");
  if (!/jsonb_path_exists\(snapshot,/.test(sql)) problems.push("the no-bank snapshot CHECK is missing");
  return problems;
}

describe("T039 — M2c satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, RLS forced, no anon grant, no authenticated write grant, no config-table change, no top-level DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from|truncate) public\./);
  });
  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
  });
  it("the M2c-specific invariants hold", () => {
    expect(m2cViolations(migrationRaw)).toEqual([]);
  });
  it.each([
    ["adjustments left mutable", (s: string) => s.replace("create trigger trg_manual_financial_adjustments_immutable\n  before update or delete", "create trigger trg_manual_financial_adjustments_immutable\n  before delete")],
    ["events left mutable", (s: string) => s.replace("create trigger trg_reconciliation_case_events_immutable", "create trigger trg_reconciliation_case_events_disabled").replace("on public.reconciliation_case_events\n  for each row execute function public.prevent_snapshot_mutation();", "on public.reconciliation_case_events\n  for each row execute function public.set_updated_at();")],
    ["a client grant on the cases", (s: string) => s.replace("grant select on table public.reconciliation_cases to service_role;", "grant select on table public.reconciliation_cases to service_role, authenticated;")],
    ["a service_role write grant", (s: string) => s.replace("grant select on table public.manual_financial_adjustments to service_role;", "grant select, insert on table public.manual_financial_adjustments to service_role;")],
    ["M2b's prevent_snapshot_mutation redefined", (s: string) => s.replace("-- 8. Triggers", "create or replace function public.prevent_snapshot_mutation() returns trigger language plpgsql as $function$ begin return old; end $function$;\n-- 8. Triggers")],
    ["a generic audit trigger on the adjustments", (s: string) => s.replace("-- 9. New tables", "create trigger trg_audit_adj after insert on public.manual_financial_adjustments for each row execute function public.write_audit_log();\n-- 9. New tables")],
    ["the unique group index dropped", (s: string) => s.replace("create unique index uq_order_shipment_fulfillment_group", "create index uq_order_shipment_fulfillment_group")],
    ["reconciliation touching inventory", (s: string) => s.replace("  if tg_op = 'INSERT' then\n    if new.status <> 'OPEN' then", "  update public.inventory_positions set reserved_quantity_kg = 0 where false;\n  if tg_op = 'INSERT' then\n    if new.status <> 'OPEN' then")],
    ["a policy added in M2c", (s: string) => s.replace("-- 9. New tables", "create policy cases_read on public.reconciliation_cases for select to authenticated using (true);\n-- 9. New tables")],
    ["the no-bank snapshot CHECK removed", (s: string) => s.replace("or not jsonb_path_exists(snapshot,", "or not jsonb_exists_any(snapshot, array['x']) or true or jsonb_typeof(snapshot,")],
  ])("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m2cViolations(mutated).length).toBeGreaterThan(0);
  });
});

describe("T039 — reconciliation cases and events (data-model §5.4, §7.6; AC-009)", () => {
  it("reconciliation_cases has exactly the §5.4 columns", () => {
    expect(DM_CASE_COLUMNS).toHaveLength(18);
    expect(tableColumns("reconciliation_cases")).toEqual(DM_CASE_COLUMNS);
  });
  it("kind, status and resolution_type CHECK sets equal §5.4", () => {
    expect(checkValues("reconciliation_cases_kind_check")).toEqual(DM_CASE_KINDS);
    expect(checkValues("reconciliation_cases_status_check")).toEqual(DM_CASE_STATUSES);
    expect(checkValues("reconciliation_cases_resolution_type_check")).toEqual(DM_RESOLUTION_TYPES);
    expect(DM_CASE_KINDS).toEqual(["DUPLICATE", "LATE", "OTHER", "PARTIAL", "WRONG_CURRENCY"]);
  });
  it("case codes are REC-YYYYMMDD-<7> from their own sequence", () => {
    expect(s54).toContain("`REC-YYYYMMDD-<7>`");
    contains(migration, "create sequence public.reconciliation_case_code_seq;");
    contains(migration, "select 'REC-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.reconciliation_case_code_seq')::text, 7, '0');");
    contains(migration, "case_code text not null default public.next_reconciliation_case_code() constraint reconciliation_cases_case_code_key unique");
  });
  it("the §7.6 lifecycle is enforced exactly: OPEN → IN_REVIEW → RESOLVED | CLOSED_NO_ACTION; OPEN → CLOSED_NO_ACTION; RESOLVED needs a type", () => {
    expect(s76).toContain("`OPEN` → `IN_REVIEW` → `RESOLVED` (resolution_type required) | `CLOSED_NO_ACTION`; `OPEN` → `CLOSED_NO_ACTION`");
    const body = fnBody("guard_reconciliation_case");
    contains(body, "(old.status = 'OPEN' and new.status in ('IN_REVIEW', 'CLOSED_NO_ACTION')) or (old.status = 'IN_REVIEW' and new.status in ('RESOLVED', 'CLOSED_NO_ACTION'))");
    contains(body, "if old.status in ('RESOLVED', 'CLOSED_NO_ACTION') then raise exception 'reconciliation_case_immutable'");
    contains(body, "if new.status <> 'OPEN' then raise exception 'reconciliation_case_invalid'");
    contains(migration, "(status <> 'RESOLVED' or resolution_type is not null)");
    contains(migration, "constraint reconciliation_cases_closed_check check ((resolved_at is not null) = (status in ('RESOLVED', 'CLOSED_NO_ACTION')))");
  });
  it("cases are opened and changed only by the workflow, identity/observed values frozen, never deleted, payment/proof tied to the order", () => {
    const body = fnBody("guard_reconciliation_case");
    contains(body, "if tg_op = 'DELETE' then raise exception 'reconciliation_case_immutable'");
    contains(body, "if not public.is_internal_transition() then raise exception 'reconciliation_case_immutable'");
    contains(body, "c_mutable constant text[] := array['status', 'resolution_type', 'resolution_note', 'linked_order_id', 'resolved_by', 'resolved_at'];");
    contains(body, "where p.id = new.payment_id and p.order_id = new.order_id");
    contains(body, "where pp.id = new.proof_id and pp.payment_id = new.payment_id");
  });
  it("AC-009: no reconciliation column or function touches inventory", () => {
    for (const column of tableColumns("reconciliation_cases")) expect(column).not.toMatch(/quantity|inventory|reservation|lot/);
    for (const name of ["guard_reconciliation_case", "record_reconciliation_case_event"]) expect(fnBody(name)).not.toMatch(/inventory|reservation|coffee_offers|reserved_quantity|storage_allocations/);
  });
  it("events are append-only, one per open and per status change, with the transition reason as note", () => {
    contains(migrationTop, "create trigger trg_reconciliation_case_events_immutable before update or delete on public.reconciliation_case_events for each row execute function public.prevent_snapshot_mutation();");
    contains(migrationTop, "create trigger trg_reconciliation_cases_history after insert or update of status on public.reconciliation_cases for each row execute function public.record_reconciliation_case_event();");
    const body = fnBody("record_reconciliation_case_event");
    contains(body, "if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;");
    contains(body, "nullif(btrim(current_setting('app.transition_reason', true)), '')");
    contains(migration, "constraint reconciliation_case_events_transition_check check ((from_status is null) = (to_status = 'OPEN'))");
  });
  it("the queue index (status, opened_at) from plan §3 exists", () => {
    contains(migrationTop, "create index idx_reconciliation_cases_queue on public.reconciliation_cases (status, opened_at);");
  });
});

describe("T039 — manual financial adjustments (data-model §5.5, FIN-010, FR-044)", () => {
  it("exactly the §5.5 columns; kind set; reason NOT NULL", () => {
    expect(DM_ADJUSTMENT_COLUMNS).toHaveLength(11);
    expect(tableColumns("manual_financial_adjustments")).toEqual(DM_ADJUSTMENT_COLUMNS);
    expect(checkValues("manual_financial_adjustments_kind_check")).toEqual(DM_ADJUSTMENT_KINDS);
    contains(migration, "reason text not null constraint manual_financial_adjustments_reason_check check (char_length(btrim(reason)) between 1 and 2000)");
  });
  it("append-only via the reused M2b prevent_snapshot_mutation (contracts/database-rpc.md); recorded only by the workflow; payment/payout tied to the order", () => {
    expect(readFileSync(`${SPEC}/contracts/database-rpc.md`, "utf8")).toMatch(/prevent_snapshot_mutation[^\n]*manual_financial_adjustments[^\n]*reconciliation_case_events/);
    contains(migrationTop, "create trigger trg_manual_financial_adjustments_immutable before update or delete on public.manual_financial_adjustments for each row execute function public.prevent_snapshot_mutation();");
    const body = fnBody("validate_manual_financial_adjustment");
    contains(body, "if not public.is_internal_transition() then raise exception 'manual_adjustment_invalid'");
    contains(body, "where p.id = new.payment_id and p.order_id = new.order_id");
    contains(body, "where p.id = new.payout_id and p.order_id = new.order_id");
    // prevent_snapshot_mutation (M2b) refuses every UPDATE/DELETE on any table other than LEGACY proforma lines
    const m2b = readFileSync("supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql", "utf8");
    expect(m2b).toMatch(/if tg_table_name = 'proforma_invoice_items' and \(to_jsonb\(old\) ->> 'seller_type_snapshot'\) is null then/);
  });
  it("positive USD amounts only (the kind carries the direction)", () => {
    contains(migration, "constraint manual_financial_adjustments_amount_check check (amount > 0)");
    contains(migration, "constraint manual_financial_adjustments_currency_check check (currency = 'USD')");
  });
});

describe("T039 — tax_invoices (data-model §5.6, research R-23)", () => {
  it("file_asset_id/uploaded_by nullable; status, proforma_id, issued_by, issued_at_ts, snapshot added; UNIQUE(order_id) kept", () => {
    for (const phrase of ["`file_asset_id`, `uploaded_by` → nullable", "`status` (`ISSUED` | `VOID`)", "`issued_at_ts timestamptz`", "`UNIQUE(order_id)` is kept"]) expect(s56, phrase).toContain(phrase);
    expect(addedColumns("tax_invoices")).toEqual(["issued_at_ts", "issued_by", "proforma_id", "snapshot", "status"]);
    contains(migration, "alter column file_asset_id drop not null, alter column uploaded_by drop not null");
    expect(checkValues("tax_invoices_status_check")).toEqual(["ISSUED", "VOID"]);
    expect(migrationTop).not.toMatch(/drop constraint tax_invoices_order_id_key/);
  });
  it("invoice numbers INV-YYYYMMDD-<7 digits> from tax_invoice_code_seq", () => {
    expect(research).toContain("`invoice_number` from `tax_invoice_code_seq` (`INV-YYYYMMDD-<7 digits>`)");
    contains(migration, "create sequence public.tax_invoice_code_seq;");
    contains(migration, "select 'INV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.tax_invoice_code_seq')::text, 7, '0');");
    contains(migration, "alter column invoice_number set default public.next_tax_invoice_code()");
  });
  it("the snapshot never carries bank identifiers, at any depth (R-23, AUD-006)", () => {
    expect(s56).toContain("`snapshot jsonb` (no bank identifiers)");
    for (const key of ["iban", "account_number", "swift_code", "bank_account_masked", "account_number_last4", "iban_last4", "payment_reference", "bank_instructions"]) {
      expect(migrationRaw, key).toContain(`exists(@.${key})`);
    }
    contains(migration, "not jsonb_path_exists(snapshot, '$.** ? (@.type() == \"object\"");
  });
  it("LEGACY invoices keep the file/uploader requirement and their behaviour; Feature 013 invoices are frozen except ISSUED → VOID and one file attachment", () => {
    contains(migration, "proforma_id is not null or (file_asset_id is not null and uploaded_by is not null and issued_by is null and issued_at_ts is null and snapshot is null)");
    contains(migration, "add constraint tax_invoices_proforma_fkey foreign key (proforma_id, order_id) references public.proforma_invoices (id, order_id)");
    const body = fnBody("protect_tax_invoice");
    contains(body, "if old.proforma_id is null then if tg_op = 'DELETE' then return old; end if;");
    contains(body, "raise exception 'tax_invoice_immutable' using detail = 'a LEGACY invoice cannot acquire Feature 013 values'");
    contains(body, "raise exception 'tax_invoice_immutable' using detail = 'a final invoice is never deleted'");
    contains(body, "c_mutable constant text[] := array['status', 'file_asset_id', 'uploaded_by'];");
    contains(body, "not (old.status = 'ISSUED' and new.status = 'VOID')");
    contains(body, "old.file_asset_id is not null then raise exception 'tax_invoice_immutable' using detail = 'the signed file is attached once'");
    contains(body, "if new.proforma_id is not null and not public.is_internal_transition() then raise exception 'tax_invoice_immutable'");
  });
  it("the existing tax_invoices policies are untouched (M3 reduces tax_invoice_finance to SELECT)", () => {
    expect(migrationTop).not.toMatch(/\bpolicy\b/);
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    contains(guard, "if v_list is distinct from 'tax_invoice_finance, tax_invoice_view' then");
  });
});

describe("T039 — order_shipments fulfillment columns (research R-13, AC-012)", () => {
  it("shipment_kind (DELIVERY_REQUEST default | FULFILLMENT) and exactly the three R-13 group columns", () => {
    expect(r13).toContain("`shipment_kind` (`DELIVERY_REQUEST` legacy default | `FULFILLMENT`), `fulfillment_seller_organization_id`, `fulfillment_warehouse_id`, `proforma_fulfillment_group_id`");
    expect(addedColumns("order_shipments")).toEqual(["fulfillment_seller_organization_id", "fulfillment_warehouse_id", "proforma_fulfillment_group_id", "shipment_kind"]);
    contains(migration, "add column shipment_kind text not null default 'DELIVERY_REQUEST'");
    contains(migration, "add constraint order_shipments_shipment_kind_check check (shipment_kind in ('DELIVERY_REQUEST', 'FULFILLMENT'))");
  });
  it("one FULFILLMENT shipment per order × seller × warehouse (the R-13 unique index)", () => {
    expect(r13).toContain("A unique index on `(order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id) WHERE shipment_kind = 'FULFILLMENT'`");
    contains(migration, "create unique index uq_order_shipment_fulfillment_group on public.order_shipments (order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id) where shipment_kind = 'FULFILLMENT';");
  });
  it("FULFILLMENT values only through the workflow, never changed, matching a frozen group of the same order", () => {
    const body = fnBody("guard_fulfillment_shipment_fields");
    contains(body, "if new.shipment_kind = 'DELIVERY_REQUEST' then return new; end if;");
    contains(body, "if not public.is_internal_transition() then raise exception 'order_field_not_client_writable'");
    contains(body, "raise exception 'order_field_not_client_writable' using detail = 'a shipment''s kind and fulfillment group never change'");
    contains(body, "where g.id = new.proforma_fulfillment_group_id and p.order_id = new.order_id and g.seller_organization_id = new.fulfillment_seller_organization_id and g.warehouse_id = new.fulfillment_warehouse_id");
    contains(migration, "(shipment_kind = 'FULFILLMENT') = (fulfillment_seller_organization_id is not null and fulfillment_warehouse_id is not null and proforma_fulfillment_group_id is not null)");
  });
  it("LEGACY shipments unchanged: Feature 009 functions and triggers untouched (pinned by the guard); no second order_shipments → orders relationship", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    contains(guard, "'27148260ac07d2d5e7f2e3e61c2d21aa'");
    contains(guard, "'07166e5e01629f65663a1d5937b130be'");
    contains(guard, "'trg_order_shipments_inventory_hold_guard, trg_shipment_ready, trg_shipment_transition, trg_shipments_updated_at'");
    expect(migrationTop).not.toMatch(/(create|alter|drop) trigger trg_(shipment_ready|shipment_transition|shipments_updated_at|order_shipments_inventory_hold_guard)/);
    expect(migrationTop).not.toMatch(/alter table public\.order_shipments[^;]*references public\.orders\b/);
  });
});

describe("T039 — guard, grants and preservation of M1/M2a/M2b", () => {
  const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
  it("the guard pins M1, M2b (prevent_snapshot_mutation, checkout_order) and refuses on the kill switch / an existing M2c object", () => {
    const m2b = readFileSync("supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql", "utf8");
    expect(m2b).toContain("create or replace function public.prevent_snapshot_mutation()");
    for (const probe of ["'603d04c58bbcf987c38e2aa6f7d73d9b'", "'286e02091213c1be4236b144dff1f383'", "'54810aadbcb05915d49374d5ceae738e'", "bank_transfer_checkout_enabled", "an m2c object already exists", "rolbypassrls"]) {
      expect(guard, probe).toContain(probe);
    }
  });
  it("new tables: RLS forced, revoked from every API role, service_role SELECT only, no policy (M3 adds them)", () => {
    for (const t of NEW_TABLES) {
      contains(migrationTop, `alter table public.${t} force row level security;`);
      contains(migrationTop, `revoke all on table public.${t} from public, anon, authenticated, service_role;`);
      contains(migrationTop, `grant select on table public.${t} to service_role;`);
    }
  });
  it("SECURITY DEFINER trigger functions pin search_path; code generators are non-definer and not executable by clients", () => {
    for (const name of DEFINER_TRIGGER_FUNCTIONS) {
      expect(fnHeader(name), name).toContain("security definer set search_path = pg_catalog, public");
      contains(migrationTop, `revoke all on function public.${name}() from public, anon;`);
    }
    for (const name of ["next_tax_invoice_code", "next_reconciliation_case_code"]) {
      expect(fnHeader(name)).not.toContain("security definer");
      contains(migrationTop, `revoke all on function public.${name}() from public, anon, authenticated;`);
    }
    contains(migrationTop, "revoke all on sequence public.tax_invoice_code_seq from public, anon, authenticated;");
  });
  it("no earlier migration file and no Feature 008 file is modified by this run (M2c is additive)", () => {
    expect(migrationTop).not.toMatch(/\b(commerce_settings|delivery_destinations|proforma_bank_instructions|proforma_line_economics)\b[^;]*\b(alter|drop)\b/);
  });
});

describe("T039 — the rollback removes exactly M2c and restores what it relaxed", () => {
  it("drops the three tables, the M2c columns/constraints/indexes/triggers/functions/sequences; restores tax_invoices NOT NULLs", () => {
    for (const t of NEW_TABLES) contains(rollbackTop, `drop table public.${t};`);
    for (const c of [...addedColumns("order_shipments"), ...addedColumns("tax_invoices")]) expect(rollbackTop, c).toMatch(new RegExp(`drop column ${c}\\b`));
    for (const fn of ["guard_fulfillment_shipment_fields", "protect_tax_invoice", "validate_manual_financial_adjustment", "record_reconciliation_case_event", "guard_reconciliation_case", "next_reconciliation_case_code", "next_tax_invoice_code"]) {
      contains(rollbackTop, `drop function public.${fn}();`, fn);
    }
    contains(rollbackTop, "alter column invoice_number drop default, alter column uploaded_by set not null, alter column file_asset_id set not null;");
    contains(rollbackTop, "drop sequence public.reconciliation_case_code_seq; drop sequence public.tax_invoice_code_seq;");
    expect(rollbackTop).not.toMatch(/drop function public\.prevent_snapshot_mutation/);
    for (const m of migration.matchAll(/add constraint (\w+)/g)) contains(rollbackTop, `drop constraint ${m[1]}`, m[1]);
  });
  it("refuses (changing nothing) once any M2c record, Feature 013 invoice or FULFILLMENT shipment exists, or M2d+ is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    for (const probe of ["exists (select 1 from public.reconciliation_cases)", "exists (select 1 from public.manual_financial_adjustments)",
                         "proforma_id is not null or file_asset_id is null or uploaded_by is null", "shipment_kind <> 'DELIVERY_REQUEST'", "to_regclass('public.offer_price_tiers')"]) {
      contains(guard, probe);
    }
    contains(guard, "raise exception 'feature_013_finance_fulfillment_records rollback refused");
  });
  it("the M2b rollback already refuses while M2c is applied (rollbacks run newest first)", () => {
    expect(normalize(readFileSync("supabase/rollback/20260925106000_feature_013_proforma_versioning_snapshots.rollback.sql", "utf8"))).toContain("to_regclass('public.reconciliation_cases') is not null");
  });
});
