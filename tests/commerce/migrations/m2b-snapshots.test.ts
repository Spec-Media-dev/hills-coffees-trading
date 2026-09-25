import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T033 (MP-2) — static and security tests for M2b
 * `supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql`, its rollback and its postflight.
 * No database access. The live proof is T037 (`tests/commerce/snapshot-immutability.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T032/T033): data-model §3.1–§3.7 incl. the funding/cap columns and every FIN-006/007/011/012 CHECK
 * identity; the seller commission assignment snapshot (policy, tier, rate, Q_s) per line and per settlement, no override
 * table; protect_proforma_snapshot / prevent_snapshot_mutation / deferred check_seller_settlement_totals /
 * freeze_order_financials; snapshot tables have no UPDATE/DELETE path; proforma_bank_instructions has no generic
 * write_audit_log trigger (AUD-006) and no M2b audit path can copy destination/party/bank values (T029 R2); the guard
 * refuses > 1 proforma per order and non-drained non-terminal LEGACY ISSUED proformas (T009).
 * Owner decisions 2026-09-25: checkout_order gets ONE behaviour-preserving statement change; the header money columns
 * are NOT NULL DEFAULT 0 LEGACY placeholders, never valid Feature 013 economics.
 * Expected values are read from data-model.md, the T006 evidence files, PREFLIGHT-REPORT.md and the 007/M1 files.
 */

const FILE = "20260925106000_feature_013_proforma_versioning_snapshots.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_proforma_versioning_snapshots_postflight.sql", "utf8");
const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollback = normalize(stripComments(rollbackRaw));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
/** Asserts `needle` occurs in an already-normalized (whitespace-collapsed, lower-cased) text. */
const contains = (haystack: string, needle: string, label?: string) => expect(haystack, label ?? needle).toContain(normalize(needle));

// ── T006 evidence ────────────────────────────────────────────────────────────────────────────────────────────────
function csvRows(file: string): Record<string, string>[] {
  const text = readFileSync(`${SPEC}/preflight-evidence/${file}`, "utf8").replace(/^\s+/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((cells) => Object.fromEntries(header!.map((key, index) => [key, cells[index] ?? ""])));
}
const fingerprints = Object.fromEntries(csvRows("section5-function-fingerprints.csv").map((r) => [r.proname!, r]));
const t006Constraints = Object.fromEntries(csvRows("section9-constraints.csv").map((r) => [r.conname!, r.definition!]));
const t006Triggers = csvRows("section8-triggers.csv");

// ── data-model §3 expectations ───────────────────────────────────────────────────────────────────────────────────
const dataModel = readFileSync(`${SPEC}/data-model.md`, "utf8").replace(/\r/g, "");
const sectionOf = (start: string, end: string) => dataModel.slice(dataModel.indexOf(start), dataModel.indexOf(end));
const afterHeading = (text: string) => text.slice(text.indexOf("\n") + 1);
const namesIn = (text: string) =>
  [...new Set([...text.matchAll(/`([^`]+)`/g)].map((m) => m[1]!.split(/\s+/)[0]!).filter((name) => /^[a-z][a-z0-9_]*$/.test(name)))].sort();
const DM_31 = sectionOf("### 3.1", "### 3.2").split("\n").filter((line) => /^\| `[a-z_]/.test(line) && /\|\s*NEW\b/.test(line))
  .flatMap((line) => namesIn(line.split("|")[1]!)).sort();
const s32 = sectionOf("### 3.2", "### 3.3");
const DM_32 = namesIn(s32.slice(s32.indexOf("Adds:"), s32.indexOf("`amount` (existing"))).filter((n) => !["quantity_kg", "unit_price"].includes(n));
const DM_33 = namesIn(afterHeading(sectionOf("### 3.3", "### 3.4")).split("CHECKs")[0]!);
const s34 = afterHeading(sectionOf("### 3.4", "### 3.5"));
const DM_34 = namesIn(s34.slice(0, s34.indexOf("`UNIQUE")));
const s35 = afterHeading(sectionOf("### 3.5", "### 3.6"));
const DM_35 = namesIn(s35.slice(0, s35.indexOf("Each amount")));
const s36 = afterHeading(sectionOf("### 3.6", "### 3.7"));
const DM_36 = namesIn(s36.slice(0, s36.indexOf("Immutable")));
const s37 = sectionOf("### 3.7", "### 3.8");
const DM_37 = namesIn(s37.slice(s37.indexOf("Adds"), s37.indexOf("It is rewritten")));
// tasks.md T032: the assignment is snapshotted per line AND per seller settlement.
const ASSIGNMENT = ["commission_policy_id", "commission_tier_id", "commission_rate_snapshot", "seller_qualifying_quantity_kg"];

const tableColumns = (table: string) => {
  const body = new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(migrationRaw)![1]!;
  return body.split("\n").map((line) => /^\s{2}([a-z_0-9]+) /.exec(line)?.[1]).filter((name): name is string => !!name && !["constraint", "primary"].includes(name)).sort();
};
const addedColumns = (table: string) =>
  [...migration.matchAll(new RegExp(`alter table public\\.${table}\\b([^;]*);`, "g"))].flatMap((m) => [...m[1]!.matchAll(/add column (\w+)/g)].map((c) => c[1]!)).sort();
const fnBody = (sql: string, name: string) => {
  const m = new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$function\\$([\\s\\S]*?)\\$function\\$;`).exec(sql);
  if (!m) throw new Error(`no body for ${name}`);
  return stripComments(m[1]!);
};
const fnHeader = (name: string) => normalize(new RegExp(`create or replace function public\\.${name}\\(\\)([\\s\\S]*?)as \\$function\\$`).exec(migrationRaw)![1]!);
const checkoutBody = (sql: string) => {
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.checkout_order(p_order_id uuid)");
  const open = sql.indexOf("AS $function$", start) + "AS $function$".length;
  return sql.slice(open, sql.indexOf("$function$;", open));
};

// The one statement changed in checkout_order (owner decision 2026-09-25).
const LEGACY_UPSERT = `  insert into public.proforma_invoices(
    order_id,
    valid_until
  )
  values (
    p_order_id,
    now() + interval '20 minutes'
  )
  on conflict (order_id)
  do update set
    valid_until =
      excluded.valid_until,
    status = 'ISSUED';
`;
const M2B_UPSERT = `  -- Feature 013 M2b: proforma versioning replaced the UNIQUE (order_id) arbiter of the former upsert.
  -- Same effect, serialized by the order FOR UPDATE lock taken above.
  update public.proforma_invoices
  set
    valid_until =
      now() + interval '20 minutes',
    status = 'ISSUED'
  where order_id = p_order_id;

  if not found then
    insert into public.proforma_invoices(
      order_id,
      valid_until
    )
    values (
      p_order_id,
      now() + interval '20 minutes'
    );
  end if;
`;
const originalCheckout = checkoutBody(readFileSync("supabase/migrations/20260913100000_feature_007_db_blockers.sql", "utf8").replace(/\r/g, ""));
const m2bCheckout = checkoutBody(migrationRaw);

const NEW_TABLES = ["proforma_fulfillment_groups", "proforma_line_economics", "proforma_seller_settlements", "proforma_bank_instructions"];
const IMMUTABLE_TABLES = ["proforma_invoice_items", ...NEW_TABLES];
const CONFIG_REFERENCES = /references public\.(commission_policies|commission_tiers|tax_rules|shipping_rules|payment_accounts)\b/;

/**
 * The M2b-specific security/financial invariants on the migration text. Exported shape mirrors sql-rules so the mutation
 * cases below can prove that each rule bites.
 */
function m2bViolations(raw: string): string[] {
  const sql = normalize(stripComments(raw));
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const problems: string[] = [];
  if (/execute function public\.write_audit_log\(\)/.test(top)) problems.push("a generic write_audit_log trigger is created");
  for (const t of IMMUTABLE_TABLES) {
    if (!new RegExp(`create trigger trg_${t}_immutable before update or delete on public\\.${t} for each row execute function public\\.prevent_snapshot_mutation\\(\\);`).test(top)) problems.push(`${t}: no prevent_snapshot_mutation trigger`);
  }
  for (const t of NEW_TABLES) {
    if (!new RegExp(`revoke all on table public\\.${t} from public, anon, authenticated, service_role;`).test(top)) problems.push(`${t}: not revoked from every API role`);
    for (const m of top.matchAll(new RegExp(`grant ([^;]*?) on table public\\.${t} to ([^;]*?);`, "g"))) {
      if (m[1]!.trim() !== "select" || m[2]!.trim() !== "service_role") problems.push(`${t}: grant ${m[1]} to ${m[2]}`);
    }
    if (new RegExp(`create policy \\w+ on public\\.${t}\\b`).test(top)) problems.push(`${t}: a policy is created in M2b`);
  }
  if (!/create constraint trigger trg_proforma_seller_settlements_totals after insert on public\.proforma_seller_settlements deferrable initially deferred for each row execute function public\.check_seller_settlement_totals\(\);/.test(top)) problems.push("settlement totals check not deferred");
  if (!/create constraint trigger trg_proforma_invoices_snapshot_totals after insert on public\.proforma_invoices deferrable initially deferred for each row execute function public\.check_proforma_snapshot_totals\(\);/.test(top)) problems.push("header totals check not deferred");
  if (!/create trigger trg_proforma_invoices_protect_snapshot before insert or update or delete on public\.proforma_invoices for each row execute function public\.protect_proforma_snapshot\(\);/.test(top)) problems.push("protect_proforma_snapshot not bound");
  if (!/create trigger trg_order_financials_freeze before insert or update or delete on public\.order_financials for each row execute function public\.freeze_order_financials\(\);/.test(top)) problems.push("freeze_order_financials not bound");
  if (CONFIG_REFERENCES.test(top)) problems.push("a foreign key into a Feature 010 configuration table");
  if (/create table public\.\w*(override|commission)\w*/.test(top)) problems.push("a commission/override table is created");
  const audit = /create or replace function public\.write_audit_log_proforma_invoices\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(sql)?.[1] ?? "";
  if (/to_jsonb\(new\)|new\.(destination_snapshot|buyer_snapshot|bank_account_masked)\b|new\.promotion_code_snapshot\b(?! is not null)/.test(audit)) problems.push("header audit copies a redacted field");
  const bankAudit = /create or replace function public\.write_audit_log_proforma_bank_instructions\(\)[\s\S]*?\$function\$([\s\S]*?)\$function\$;/.exec(sql)?.[1] ?? "";
  if (/to_jsonb\(new\)|'(account_number|iban|account_name|bank_name|swift_code|payment_reference)', new\./.test(bankAudit)) problems.push("bank audit copies a bank value");
  if (!/proforma_invoices_legacy_placeholder_check/.test(top) || !/proforma_invoices_snapshot_marker_check check \( num_nulls\(/.test(top)) problems.push("legacy placeholder / snapshot marker CHECK missing");
  return problems;
}

describe("T033 — M2b satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, RLS forced, no anon grant, no authenticated write grant, no config-table change, no top-level DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
    expect(migrationTop).not.toMatch(/\b(insert into|update|delete from|truncate) public\./);
  });

  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
  });

  it("the M2b-specific invariants hold", () => {
    expect(m2bViolations(migrationRaw)).toEqual([]);
  });

  it.each([
    ["a generic audit trigger on the bank instructions", (s: string) => s.replace("create trigger trg_audit_proforma_bank_instructions\n  after insert on public.proforma_bank_instructions\n  for each row execute function public.write_audit_log_proforma_bank_instructions();", "create trigger trg_audit_proforma_bank_instructions after insert on public.proforma_bank_instructions for each row execute function public.write_audit_log();")],
    ["the settlement check made immediate", (s: string) => s.replace("create constraint trigger trg_proforma_seller_settlements_totals\n  after insert on public.proforma_seller_settlements\n  deferrable initially deferred", "create constraint trigger trg_proforma_seller_settlements_totals\n  after insert on public.proforma_seller_settlements\n  not deferrable")],
    ["a snapshot table left mutable", (s: string) => s.replace("create trigger trg_proforma_line_economics_immutable\n  before update or delete", "create trigger trg_proforma_line_economics_immutable\n  before delete")],
    ["a client grant on a snapshot table", (s: string) => s.replace("grant select on table public.proforma_bank_instructions to service_role;", "grant select on table public.proforma_bank_instructions to service_role, authenticated;")],
    ["a service_role write grant", (s: string) => s.replace("grant select on table public.proforma_line_economics to service_role;", "grant select, insert on table public.proforma_line_economics to service_role;")],
    ["a foreign key into commission_tiers", (s: string) => s.replace("  commission_tier_id uuid,\n  commission_rate_snapshot numeric(7,4),\n  seller_qualifying_quantity_kg numeric(14,3),\n  gross_amount", "  commission_tier_id uuid references public.commission_tiers(id),\n  commission_rate_snapshot numeric(7,4),\n  seller_qualifying_quantity_kg numeric(14,3),\n  gross_amount")],
    ["a seller commission override table", (s: string) => s.replace("-- 7. proforma_bank_instructions", "create table public.seller_commission_overrides (id uuid primary key);\n-- 7. proforma_bank_instructions")],
    ["the header audit copying the destination snapshot", (s: string) => s.replace("'promotion_code_present', new.promotion_code_snapshot is not null);", "'promotion_code_present', new.promotion_code_snapshot is not null, 'destination', new.destination_snapshot);")],
    ["the bank audit copying the full IBAN", (s: string) => s.replace("'proforma_id', new.proforma_id, 'payment_account_id'", "'iban', new.iban, 'proforma_id', new.proforma_id, 'payment_account_id'")],
    ["the freeze trigger dropped", (s: string) => s.replace("create trigger trg_order_financials_freeze", "create trigger trg_order_financials_freeze_disabled")],
  ])("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m2bViolations(mutated).length).toBeGreaterThan(0);
  });
});

describe("T033 — data-model §3.1–§3.7 columns", () => {
  it("§3.1 proforma_invoices: exactly the NEW columns", () => {
    expect(DM_31.length).toBe(23);
    expect(addedColumns("proforma_invoices")).toEqual(DM_31);
  });
  it("§3.2 proforma_invoice_items: exactly the added buyer-facing line fields", () => {
    expect(DM_32.length).toBe(24);
    expect(addedColumns("proforma_invoice_items")).toEqual(DM_32);
  });
  it("§3.3 proforma_line_economics / §3.4 groups / §3.6 bank instructions: exactly the data-model columns", () => {
    expect(tableColumns("proforma_line_economics")).toEqual(DM_33);
    expect(tableColumns("proforma_fulfillment_groups")).toEqual(DM_34);
    expect(tableColumns("proforma_bank_instructions")).toEqual(DM_36);
  });
  it("§3.5 proforma_seller_settlements: the data-model columns plus commission_policy_id (T032: assignment per settlement)", () => {
    expect(DM_35).not.toContain("commission_policy_id");
    expect(tableColumns("proforma_seller_settlements")).toEqual([...DM_35, "commission_policy_id"].sort());
  });
  it("§3.7 order_financials: exactly the added summary columns", () => {
    expect(addedColumns("order_financials")).toEqual(DM_37);
  });
  it("orders.current_proforma_id (§2.1, deferred from M2a by T029 D3) references a proforma of the same order", () => {
    expect(addedColumns("orders")).toEqual(["current_proforma_id"]);
    contains(migration, "add constraint orders_current_proforma_fkey foreign key (current_proforma_id, id) references public.proforma_invoices (id, order_id)");
  });
  it("money is numeric(14,2), quantities numeric(14,3), rates numeric(7,4) (data-model preamble)", () => {
    for (const fragment of ["add column buyer_total numeric(14,2) not null default 0", "commission_rate_snapshot numeric(7,4)", "seller_qualifying_quantity_kg numeric(14,3)",
                            "seller_net_amount numeric(14,2) not null", "shipping_vat_amount numeric(14,2) not null", "add column gross_amount numeric(14,2)"]) {
      contains(migration, fragment, fragment);
    }
  });
});

describe("T033 — seller commission assignment snapshot (FIN-013; no override table)", () => {
  it("the policy, tier, rate and Q_s are snapshotted per line and per settlement", () => {
    for (const table of ["proforma_line_economics", "proforma_seller_settlements"]) {
      for (const column of ASSIGNMENT) expect(tableColumns(table), `${table}.${column}`).toContain(column);
    }
  });
  it("member lines/settlements carry the full assignment; Hills lines/settlements carry none", () => {
    for (const t of ["proforma_line_economics", "proforma_seller_settlements"]) {
      contains(migration, `constraint ${t}_member_check check ( seller_type_snapshot <> 'member_seller' or (num_nulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0`.replace("'member_seller'", "'MEMBER_SELLER'"));
      contains(migration, `constraint ${t}_hills_check check ( seller_type_snapshot <> 'HILLS' or (num_nonnulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0`);
    }
  });
  it("the deferred settlement check equates the assignment on every line and Q_s to the seller's own member-line quantity", () => {
    const body = normalize(fnBody(migrationRaw, "check_seller_settlement_totals"));
    for (const column of ASSIGNMENT) contains(body, `e.${column} is distinct from s.${column}`, column);
    contains(body, "coalesce(sum(i.quantity_kg) filter (where e.seller_type_snapshot = 'MEMBER_SELLER'), 0) as member_quantity");
    contains(body, "where e.proforma_id = v_proforma_id and e.seller_organization_id = v_seller");
    contains(body, "s.seller_qualifying_quantity_kg is distinct from v_sum.member_quantity");
  });
  it("no table other than the Feature 010 commission tables carries 'commission' or 'override' in its name", () => {
    expect([...migrationTop.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]!).sort()).toEqual([...NEW_TABLES].sort());
    expect(migrationTop).not.toMatch(/override/);
  });
});

describe("T033 — FIN-006/007/011/012 CHECK identities", () => {
  const has = (fragment: string) => contains(migration, normalize(fragment), fragment);
  it("header (§3.1, FIN-009): merchandise_net = gross − discount; buyer_total = net + shipping + VAT", () => {
    has("add constraint proforma_invoices_merchandise_net_check check (merchandise_net = merchandise_gross - discount_total)");
    has("add constraint proforma_invoices_buyer_total_check check (buyer_total = merchandise_net + shipping_total + vat_total)");
  });
  it("lines (§3.2, FIN-002/011/012): discount bounds, net/line-total identities, one promotion, funding ⇔ scope, no seller funding on Hills lines, recorded cap", () => {
    has("discount_amount between 0 and gross_amount and discount_amount <= promotion_raw_amount");
    has("add constraint proforma_invoice_items_net_check check (net_amount = gross_amount - discount_amount)");
    has("line_total = net_amount + vat_amount");
    has("(promotion_id is null) = (discount_amount = 0) and (promotion_id is null) = (promotion_funding_source is null)");
    has("add constraint proforma_invoice_items_funding_scope_check check ((promotion_funding_source = 'HILLS') = (promotion_scope_snapshot = 'PLATFORM'))");
    has("add constraint proforma_invoice_items_hills_line_funding_check check (seller_type_snapshot <> 'HILLS' or promotion_funding_source is distinct from 'SELLER')");
    has("discount_cap_reason in ('LINE_GROSS', 'HILLS_COMMISSION')");
    has("(promotion_id is not null and discount_capped = (discount_amount < promotion_raw_amount))");
    has("gross_amount = round(quantity_kg * unit_price, 2)");
  });
  it("line economics (§3.3): every amount ≥ 0, one funder, MEMBER and HILLS identities", () => {
    has("seller_funded_discount >= 0 and hills_funded_discount >= 0 and commission_on_gross >= 0 and commission_basis >= 0 and commission_amount >= 0 and seller_net_amount >= 0 and hills_share_amount >= 0 and buyer_net_amount >= 0");
    has("constraint proforma_line_economics_single_funder_check check (seller_funded_discount = 0 or hills_funded_discount = 0)");
    for (const identity of [
      "commission_basis = gross_amount - seller_funded_discount",
      "seller_net_amount + commission_amount = commission_basis",
      "hills_share_amount = commission_amount - hills_funded_discount",
      "hills_funded_discount <= commission_on_gross",
      "seller_net_amount + hills_share_amount = buyer_net_amount",
      "commission_on_gross = round(gross_amount * commission_rate_snapshot / 100, 2)",
      "commission_amount = round(commission_basis * commission_rate_snapshot / 100, 2)",
    ]) {
      const member = /constraint proforma_line_economics_member_check check \(([\s\S]*?)\), constraint proforma_line_economics_hills_check/.exec(migration)![1]!;
      contains(member, identity, identity);
    }
    const hills = /constraint proforma_line_economics_hills_check check \(([\s\S]*?)\) \);/.exec(migration)![1]!;
    for (const identity of ["seller_funded_discount = 0", "commission_amount = 0", "seller_net_amount = 0", "hills_share_amount = buyer_net_amount and buyer_net_amount = gross_amount - hills_funded_discount"]) {
      contains(hills, identity, identity);
    }
  });
  it("economics match their own line (composite FK over proforma, seller, type, gross and net)", () => {
    has("constraint proforma_line_economics_item_fkey foreign key (proforma_item_id, proforma_id, seller_organization_id, seller_type_snapshot, gross_amount, buyer_net_amount) references public.proforma_invoice_items (id, proforma_id, seller_organization_id, seller_type_snapshot, gross_amount, net_amount)");
  });
  it("seller settlements (§3.5, FIN-007/012): non-negative and linearly consistent; the deferred check equates them to the line sums", () => {
    has("seller_net_amount >= 0 and hills_share_amount >= 0 and buyer_net_amount >= 0");
    const body = normalize(fnBody(migrationRaw, "check_seller_settlement_totals"));
    contains(body, "(s.gross_amount, s.seller_funded_discount, s.hills_funded_discount, s.commission_basis, s.commission_amount, s.seller_net_amount, s.hills_share_amount, s.buyer_net_amount) is distinct from (v_sum.gross, v_sum.sf, v_sum.hf, v_sum.basis, v_sum.commission, v_sum.seller_net, v_sum.hills_share, v_sum.buyer_net)");
    contains(body, "raise exception 'seller_settlement_unbalanced'");
  });
});

describe("T033 — the NOT NULL DEFAULT 0 header totals are LEGACY placeholders, never valid Feature 013 economics", () => {
  it("header totals are NOT NULL DEFAULT 0 (owner decision) and the snapshot marker is all-or-none", () => {
    for (const c of ["merchandise_gross", "discount_total", "merchandise_net", "shipping_total", "vat_total", "buyer_total"]) {
      contains(migration, `add column ${c} numeric(14,2) not null default 0`, c);
    }
    contains(migration, "num_nulls(validity_hours_snapshot, tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by) in (0, 8)");
  });
  it("a LEGACY row holds only placeholders (so it can never look like frozen economics)", () => {
    const check = /add constraint proforma_invoices_legacy_placeholder_check check \(([\s\S]*?)\), add constraint proforma_invoices_validity_check/.exec(migration)![1]!;
    contains(check, "validity_hours_snapshot is not null or (status in ('ISSUED', 'PAID', 'VOID') and version = 1 and supersedes_proforma_id is null and merchandise_gross = 0 and discount_total = 0 and merchandise_net = 0 and shipping_total = 0 and vat_total = 0 and buyer_total = 0");
  });
  it("at commit, a Feature 013 header must equal the sum of its frozen lines and groups and be complete", () => {
    const body = normalize(fnBody(migrationRaw, "check_proforma_snapshot_totals"));
    contains(body, "(h.merchandise_gross, h.discount_total, h.merchandise_net, h.shipping_total, h.vat_total) is distinct from (v_items.gross, v_items.discount, v_items.net, v_groups.shipping, v_items.vat + v_groups.shipping_vat)");
    for (const problem of ["no lines; ", "line(s) without line economics; ", "no fulfillment group; ", "no bank instructions; ", "seller settlements do not match the sellers of the lines; ",
                           "order_financials does not summarize this proforma; ", "order_financials differs from the frozen proforma; ", "split a discount against its funding source (fin-011); "]) {
      contains(body, problem);
    }
    contains(body, "round(i.net_amount * h.tax_rate_snapshot / 100, 2)");
    contains(body, "a LEGACY proforma cannot hold Feature 013 snapshot rows");
  });
  it("the header check fires deferred from the header, every snapshot table and order_financials", () => {
    for (const table of ["proforma_invoices", "proforma_invoice_items", "proforma_line_economics", "proforma_fulfillment_groups", "proforma_seller_settlements", "proforma_bank_instructions"]) {
      expect(migrationTop, table).toMatch(new RegExp(`create constraint trigger trg_${table}_snapshot_totals after insert on public\\.${table} deferrable initially deferred for each row execute function public\\.check_proforma_snapshot_totals\\(\\);`));
    }
    contains(migrationTop, "create constraint trigger trg_order_financials_snapshot_totals after insert or update on public.order_financials deferrable initially deferred for each row when (new.proforma_id is not null) execute function public.check_proforma_snapshot_totals();");
  });
  it("items and order_financials carry the same LEGACY-placeholder discipline", () => {
    contains(migration, "(seller_type_snapshot is null and num_nonnulls(offer_id, offer_code_snapshot, seller_organization_id, warehouse_id, fulfillment_group_id, list_unit_price, price_tier_id, gross_amount, promotion_id");
    contains(migration, "add constraint order_financials_legacy_placeholder_check check ( proforma_id is not null or (discount_amount = 0 and seller_funded_discount = 0 and hills_funded_discount = 0 and hills_share_amount = 0))");
  });
});

describe("T033 — immutability and freeze (protect_proforma_snapshot, prevent_snapshot_mutation, freeze_order_financials)", () => {
  it("snapshot tables have no UPDATE/DELETE path: trigger on each, no write grant to any role, no policy", () => {
    for (const t of IMMUTABLE_TABLES) contains(migrationTop, `create trigger trg_${t}_immutable before update or delete on public.${t} for each row execute function public.prevent_snapshot_mutation();`, t);
    const body = normalize(fnBody(migrationRaw, "prevent_snapshot_mutation"));
    contains(body, "raise exception 'snapshot_immutable'");
    // only LEGACY item lines pass through (fixture cleanup deletes them); every other row of every table is refused
    contains(body, "if tg_table_name = 'proforma_invoice_items' and (to_jsonb(old) ->> 'seller_type_snapshot') is null then");
    for (const t of NEW_TABLES) {
      expect(migrationTop).toContain(`revoke all on table public.${t} from public, anon, authenticated, service_role;`);
      expect(migrationTop).toContain(`grant select on table public.${t} to service_role;`);
      expect(migrationTop).toContain(`alter table public.${t} force row level security;`);
    }
    expect(migrationTop).not.toMatch(/\b(create|alter|drop) policy\b/);
  });

  it("protect_proforma_snapshot: Feature 013 rows change only their lifecycle columns, along data-model §7.2, via the workflow; never deleted", () => {
    const body = normalize(fnBody(migrationRaw, "protect_proforma_snapshot"));
    expect(body).toContain("c_lifecycle constant text[] := array['status', 'confirmed_at', 'confirmed_by', 'expired_at', 'cancelled_at', 'voided_at', 'updated_at'];");
    contains(body, "if (to_jsonb(new) - c_lifecycle) is distinct from (to_jsonb(old) - c_lifecycle) then raise exception 'proforma_snapshot_immutable'");
    contains(body, "if not public.is_internal_transition() then raise exception 'proforma_snapshot_immutable'");
    // §7.2: ISSUED → CONFIRMED | EXPIRED | CANCELLED | VOID | SUPERSEDED (admin re-issue); CONFIRMED → PAID | EXPIRED | CANCELLED | VOID.
    contains(body, "(old.status = 'ISSUED' and new.status in ('CONFIRMED', 'EXPIRED', 'CANCELLED', 'VOID', 'SUPERSEDED')) or (old.status = 'CONFIRMED' and new.status in ('PAID', 'EXPIRED', 'CANCELLED', 'VOID'))");
    contains(body, "raise exception 'proforma_snapshot_immutable' using detail = 'a Feature 013 proforma is never deleted'");
    expect(dataModel).toContain("ISSUED ──confirm──▶ CONFIRMED ──finance confirm──▶ PAID");
  });

  it("protect_proforma_snapshot: LEGACY rows keep their pre-M2b behaviour but can never acquire Feature 013 values", () => {
    const body = normalize(fnBody(migrationRaw, "protect_proforma_snapshot"));
    expect(body).toContain("c_legacy constant text[] := array['id', 'order_id', 'proforma_code', 'status', 'issued_at', 'valid_until', 'file_asset_id', 'updated_at'];");
    contains(body, "if old.validity_hours_snapshot is null then if tg_op = 'DELETE' then return old; end if;");
    contains(body, "if v_flow = 'LEGACY' then if new.validity_hours_snapshot is not null then raise exception 'proforma_snapshot_invalid'");
    contains(body, "if new.validity_hours_snapshot is null then raise exception 'proforma_snapshot_invalid' using detail = 'a BANK_TRANSFER_V1 proforma must carry the full snapshot marker'");
    // the pre-M2b columns are exactly the baseline ones plus hygiene updated_at
    const baseline = /create table if not exists public\.proforma_invoices \(([\s\S]*?)\n\);/.exec(readFileSync("supabase/trading_schema.sql", "utf8").replace(/\r/g, ""))![1]!;
    const baseColumns = baseline.split("\n").map((l) => /^\s{2}([a-z_]+) /.exec(l)?.[1]).filter(Boolean);
    expect([...baseColumns, "updated_at"].sort()).toEqual(["id", "order_id", "proforma_code", "status", "issued_at", "valid_until", "file_asset_id", "updated_at"].sort());
  });

  it("freeze_order_financials: LEGACY unchanged; BANK_TRANSFER_V1 written only by the workflow while DRAFT/PROFORMA_ISSUED, always with its proforma, never deleted", () => {
    const body = normalize(fnBody(migrationRaw, "freeze_order_financials"));
    contains(body, "if v_flow = 'LEGACY' then if tg_op <> 'DELETE' and new.proforma_id is not null then raise exception 'order_financials_frozen'");
    contains(body, "if v_status not in ('DRAFT', 'PROFORMA_ISSUED') then raise exception 'order_financials_frozen'");
    contains(body, "if not public.is_internal_transition() then raise exception 'order_financials_frozen'");
    contains(body, "if tg_op = 'DELETE' then raise exception 'order_financials_frozen' using detail = 'a BANK_TRANSFER_V1 financial summary is never deleted'");
    contains(migration, "add constraint order_financials_proforma_fkey foreign key (proforma_id, order_id) references public.proforma_invoices (id, order_id)");
  });

  it("the SECURITY DEFINER integrity functions pin search_path; trigger-only functions have an explicit EXECUTE list", () => {
    for (const name of ["protect_proforma_snapshot", "check_seller_settlement_totals", "check_proforma_snapshot_totals", "freeze_order_financials"]) {
      expect(fnHeader(name), name).toContain("security definer set search_path = pg_catalog, public");
      expect(migrationTop, name).toContain(`revoke all on function public.${name}() from public, anon;`);
      expect(migrationTop, name).toContain(`grant execute on function public.${name}() to authenticated, service_role;`);
    }
    for (const name of ["prevent_snapshot_mutation", "guard_order_proforma_pointer"]) {
      expect(fnHeader(name), name).not.toContain("security definer");
      expect(fnHeader(name), name).toContain("set search_path = pg_catalog, public");
    }
  });

  it("the order pointer is set only by internal transitions, only on BANK_TRANSFER_V1 orders", () => {
    const body = normalize(fnBody(migrationRaw, "guard_order_proforma_pointer"));
    expect(body).toContain("if not public.is_internal_transition() then raise exception 'order_field_not_client_writable'; end if;");
    contains(body, "new.commerce_flow <> 'BANK_TRANSFER_V1'");
    contains(migrationTop, "create trigger trg_orders_proforma_pointer_guard before insert or update of current_proforma_id on public.orders for each row execute function public.guard_order_proforma_pointer();");
  });
});

describe("T033 — AUD-006 and the T029 R2 condition: no M2b audit path copies destination, party or bank values", () => {
  it("no generic write_audit_log trigger on any proforma table or order_financials; proforma_bank_instructions has none", () => {
    expect(migrationTop).not.toContain("execute function public.write_audit_log()");
    expect(migrationTop).not.toMatch(/on public\.proforma_bank_instructions for each row execute function public\.write_audit_log\(\)/);
    contains(migrationTop, "create trigger trg_audit_proforma_bank_instructions after insert on public.proforma_bank_instructions for each row execute function public.write_audit_log_proforma_bank_instructions();");
  });
  it("the header audit is an allow-list without the buyer, destination and bank snapshots or the promotion code, and only for Feature 013 rows", () => {
    const body = normalize(fnBody(migrationRaw, "write_audit_log_proforma_invoices"));
    expect(body).not.toMatch(/to_jsonb\((new|old)\)/);
    for (const redacted of ["new.buyer_snapshot", "new.destination_snapshot", "new.bank_account_masked", "'promotion_code_snapshot', new"]) expect(body, redacted).not.toContain(redacted);
    contains(body, "'promotion_code_present', new.promotion_code_snapshot is not null");
    contains(migrationTop, "create trigger trg_audit_proforma_invoices after insert or update on public.proforma_invoices for each row when (new.validity_hours_snapshot is not null) execute function public.write_audit_log_proforma_invoices();");
  });
  it("the bank-instruction audit records ids, currency and the last four characters only", () => {
    const body = normalize(fnBody(migrationRaw, "write_audit_log_proforma_bank_instructions"));
    expect(body).not.toMatch(/to_jsonb\(new\)/);
    for (const value of ["new.account_name", "new.bank_name", "new.swift_code", "new.payment_reference"]) expect(body, value).not.toContain(value);
    contains(body, "'****' || right(new.account_number, 4)");
    contains(body, "'****' || right(new.iban, 4)");
    expect(body).not.toMatch(/'(account_number|iban)', new\.(account_number|iban)\b/);
  });
  it("the masked header copy can hold last-4 values only (never a full number)", () => {
    contains(migration, "coalesce(bank_account_masked ->> 'account_number_last4', '****') ~ '^\\*{4}[a-za-z0-9]{0,4}$'");
    contains(migration, "(bank_account_masked - array['bank_name', 'account_name', 'swift_code', 'account_number_last4', 'iban_last4']) = '{}'::jsonb");
  });
  it("the guard refuses if any user trigger (e.g. a generic audit) is already on proforma_invoices, proforma_invoice_items or order_financials", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    contains(guard, "if v_list is distinct from 'trg_proforma_invoices_updated_at' then");
    expect(t006Triggers.filter((r) => r.table_name === "proforma_invoices").map((r) => r.tgname)).toEqual(["trg_proforma_invoices_updated_at"]);
    contains(guard, "where t.tgrelid in (to_regclass('public.proforma_invoice_items'), to_regclass('public.order_financials')) and not t.tgisinternal");
  });
});

describe("T033 — the guard refuses unsafe legacy/proforma states (tasks.md T032)", () => {
  const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
  it("refuses any order holding more than one proforma", () => {
    expect(guard).toContain("select count(*) into v_count from (select order_id from public.proforma_invoices group by order_id having count(*) > 1) d;");
  });
  it("refuses a non-terminal LEGACY order holding an ISSUED proforma unless it is on the T009 drain list", () => {
    const preflight = readFileSync(`${SPEC}/PREFLIGHT-REPORT.md`, "utf8");
    const t009 = preflight.slice(preflight.indexOf("## T009"), preflight.indexOf("## Hills receiving"));
    const line = t009.split(/\r?\n/).find((l) => l.includes("`HOLD` orders"))!;
    const [, base, second] = /`(ORD-\d{8}-\d{7})\/(\d{4})`/.exec(line)!;
    const drained = [base!, `${base!.slice(0, -4)}${second}`];
    expect(drained).toEqual(["ORD-20260924-0006142", "ORD-20260924-0006143"]);
    contains(guard, `and o.order_code not in ('${drained[0]}', '${drained[1]}');`);
    contains(guard, "where o.commerce_flow = 'LEGACY' and pi.status = 'ISSUED' and o.status not in ('COMPLETED', 'EXPIRED', 'VOID', 'CANCELLED', 'PAYMENT_REJECTED')");
  });
  it("pins the replaced definitions to T006 §9 and the legacy writers to T006 §5; M1/M2a to their bodies", () => {
    contains(guard, `if v_def is distinct from '${normalize(t006Constraints.proforma_invoices_order_id_key!)}' then`);
    contains(guard, normalize(t006Constraints.proforma_invoices_status_check!).replace(/^/, "$d$").concat("$d$"));
    contains(guard, `'${fingerprints.checkout_order!.body_md5}'`);
    contains(guard, `'${fingerprints.admin_review_payment!.body_md5}'`);
    const m1Body = /create or replace function public\.validate_order_transition\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(readFileSync("supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql", "utf8").replace(/\r/g, ""))![1]!;
    contains(guard, `'${md5(m1Body)}'`);
    for (const probe of ["to_regclass('public.delivery_destinations') is null", "bank_transfer_checkout_enabled", "commerce_flow = 'BANK_TRANSFER_V1' and status <> 'DRAFT'", "rolbypassrls", "an M2b object already exists"]) {
      contains(guard, probe, probe);
    }
  });
  it("keeps the checkout kill switch off: M2b never writes commerce_settings", () => {
    expect(migrationTop).not.toMatch(/\b(update|insert into) public\.commerce_settings/);
    expect(stripDollarBodies(stripComments(migrationRaw))).not.toMatch(/bank_transfer_checkout_enabled\s*=\s*true/);
  });
});

describe("T033 — checkout_order: one behaviour-preserving statement changed (owner decision 2026-09-25)", () => {
  it("the 007 body is the T006 body, and the M2b body is it with exactly the proforma upsert replaced", () => {
    expect(md5(originalCheckout)).toBe(fingerprints.checkout_order!.body_md5);
    expect(originalCheckout.split(LEGACY_UPSERT).length).toBe(2);
    expect(m2bCheckout).toBe(originalCheckout.replace(LEGACY_UPSERT, M2B_UPSERT));
    expect(md5(m2bCheckout)).toBe("54810aadbcb05915d49374d5ceae738e");
  });
  it("no `on conflict (order_id)` into proforma_invoices remains; the order FOR UPDATE lock precedes the upsert", () => {
    expect(m2bCheckout).not.toMatch(/insert into public\.proforma_invoices\([\s\S]{0,120}on conflict/);
    const lock = m2bCheckout.search(/from public\.orders\s+where id = p_order_id\s+for update;/);
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(m2bCheckout.indexOf("update public.proforma_invoices"));
    // order_financials keeps its own upsert (its primary key is unchanged)
    expect(m2bCheckout).toContain("on conflict (order_id)\n  do update set\n    base_subtotal =");
  });
  it("same signature, SECURITY DEFINER, search_path and EXECUTE list as T006", () => {
    expect(migrationRaw).toContain("CREATE OR REPLACE FUNCTION public.checkout_order(p_order_id uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'auth'\nAS $function$");
    expect(migrationTop).toContain("revoke all on function public.checkout_order(uuid) from public, anon;");
    expect(migrationTop).toContain("grant execute on function public.checkout_order(uuid) to authenticated, service_role;");
    expect(fingerprints.checkout_order!.acl).toBe("{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}");
  });
  it("the rollback restores the exact T006 body; rollback and postflight pin the M2b body", () => {
    expect(md5(checkoutBody(rollbackRaw))).toBe(fingerprints.checkout_order!.body_md5);
    contains(rollback, `<> '${md5(m2bCheckout)}' then`);
    expect(postflightRaw).toContain(`'${md5(m2bCheckout)}'`);
  });
});

describe("T033 — LEGACY preservation", () => {
  it("no existing policy, no validate_order_transition/M2a function and no legacy writer other than checkout_order is redefined", () => {
    const redefined = [...migrationRaw.matchAll(/create or replace function public\.(\w+)\(/gi)].map((m) => m[1]!.toLowerCase()).sort();
    expect(redefined).toEqual(["check_proforma_snapshot_totals", "check_seller_settlement_totals", "checkout_order", "freeze_order_financials", "guard_order_proforma_pointer",
                               "prevent_snapshot_mutation", "protect_proforma_snapshot", "write_audit_log_proforma_bank_instructions", "write_audit_log_proforma_invoices"]);
    expect(migrationTop).not.toMatch(/\b(create|alter|drop) policy\b/);
    expect(migrationTop).not.toMatch(/drop trigger/);
  });
  it("the legacy readers' columns are untouched (lib/finance/read.ts and lib/orders/read.ts select lists)", () => {
    for (const file of ["lib/finance/read.ts", "lib/orders/read.ts"]) {
      const src = readFileSync(file, "utf8");
      const proforma = /const PROFORMA_SELECT = "([^"]+)"/.exec(src)![1]!.split(", ");
      const items = /const PROFORMA_ITEM_SELECT = "([^"]+)"/.exec(src)![1]!.split(", ");
      for (const column of [...proforma, ...items]) expect(migration, `${file}: ${column}`).not.toMatch(new RegExp(`drop column ${column}\\b|rename column ${column}\\b|alter column ${column}\\b`));
    }
  });
  it("no foreign key into a Feature 010 configuration table (no constraint trigger lands on them)", () => {
    expect(migrationTop).not.toMatch(CONFIG_REFERENCES);
  });
});

describe("T033 — the rollback removes exactly M2b and restores what it replaced", () => {
  it("drops the four new tables, every M2b column/constraint/index/trigger/function; restores the T006 status CHECK and UNIQUE (order_id)", () => {
    for (const t of NEW_TABLES) expect(rollbackTop, t).toContain(`drop table public.${t};`);
    for (const column of [...DM_31]) expect(rollbackTop, column).toMatch(new RegExp(`drop column ${column}\\b`));
    for (const column of [...DM_32, ...DM_37, "current_proforma_id"]) expect(rollbackTop, column).toMatch(new RegExp(`drop column ${column}\\b`));
    for (const fn of ["write_audit_log_proforma_bank_instructions", "write_audit_log_proforma_invoices", "guard_order_proforma_pointer", "freeze_order_financials",
                      "check_proforma_snapshot_totals", "check_seller_settlement_totals", "prevent_snapshot_mutation", "protect_proforma_snapshot"]) {
      contains(rollbackTop, `drop function public.${fn}();`, fn);
    }
    contains(rollback, "add constraint proforma_invoices_status_check check (status in ('ISSUED', 'PAID', 'VOID')), add constraint proforma_invoices_order_id_key unique (order_id);");
    expect(t006Constraints.proforma_invoices_status_check).toBe("CHECK ((status = ANY (ARRAY['ISSUED'::text, 'PAID'::text, 'VOID'::text])))");
    // every constraint the migration adds is dropped by the rollback
    const added = [...migration.matchAll(/add constraint (\w+)|constraint (proforma_invoice_items_\w+|order_financials_\w+|orders_current_proforma_fkey)\b/g)].map((m) => m[1] ?? m[2]!)
      .filter((name) => !["proforma_invoices_status_check"].includes(name) && !/^(proforma_line_economics|proforma_seller_settlements|proforma_fulfillment_groups|proforma_bank_instructions)_/.test(name));
    for (const name of new Set(added)) contains(rollbackTop, `drop constraint ${name}`, name);
    expect(rollbackTop).not.toMatch(/\b(commerce_settings|delivery_destinations|validate_order_transition|guard_order_destination_fields)\b/);
  });
  it("refuses (changing nothing) once any Feature 013 value is in use or a later migration is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    for (const probe of ["exists (select 1 from public.proforma_fulfillment_groups)", "validity_hours_snapshot is not null or version <> 1 or status not in ('ISSUED', 'PAID', 'VOID')",
                         "group by order_id having count(*) > 1", "seller_type_snapshot is not null", "current_proforma_id is not null", "proforma_id is not null",
                         "to_regclass('public.reconciliation_cases')"]) {
      contains(guard, probe, probe);
    }
    contains(guard, "raise exception 'feature_013_proforma_versioning_snapshots rollback refused");
  });
  it("the M2a rollback already refuses while M2b is applied (rollbacks run newest first)", () => {
    expect(normalize(readFileSync("supabase/rollback/20260925103000_feature_013_delivery_destinations.rollback.sql", "utf8"))).toContain("to_regclass('public.proforma_line_economics') is not null");
  });
});
