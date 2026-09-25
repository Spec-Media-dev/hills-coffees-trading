import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T021 (MP-2) — static and security tests for M1
 * `supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql`, its rollback and its postflight.
 * No database access. The live proof is T025 (`tests/commerce/schema-m1.live.test.ts`, after the OPERATOR apply).
 *
 * Accept (tasks.md T021): MP-2 rules + CHECK sets equal data-model; `offer_code` backfill present; the legacy transition
 * graph is textually preserved; `REVIEW_HOLD` is in the open-reservation index. Baselines come from the T006 evidence
 * files, never from memory.
 */

const FILE = "20260925100000_feature_013_commerce_state_vocabulary.sql";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8");
const postflightRaw = readFileSync("supabase/maintenance/20260925_feature_013_commerce_state_vocabulary_postflight.sql", "utf8");
const baselineSchema = readFileSync("supabase/trading_schema.sql", "utf8").replace(/\r/g, "");

const migration = normalize(stripComments(migrationRaw));
const migrationTop = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
const rollback = normalize(stripComments(rollbackRaw));

// ── T006 evidence ────────────────────────────────────────────────────────────────────────────────────────────────
function csvRows(file: string): Record<string, string>[] {
  const text = readFileSync(`specs/013-bank-transfer-commerce-core/preflight-evidence/${file}`, "utf8").replace(/^\s+/, "");
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
const constraints = Object.fromEntries(csvRows("section9-constraints.csv").map((r) => [r.conname!, r.definition!]));
const indexes = Object.fromEntries(csvRows("section9-indexes.csv").map((r) => [r.indexname!, r.indexdef!]));
const valuesOf = (definition: string) => [...definition.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);

// ── data-model expectations ──────────────────────────────────────────────────────────────────────────────────────
const ADDED_VALUES: Record<string, string[]> = {
  orders_status_check: ["PROFORMA_ISSUED", "CANCELLED", "PAYMENT_REJECTED"], // §2.1
  inventory_reservations_status_check: ["REVIEW_HOLD"], // §4.1
  payouts_status_check: ["ACCRUED"], // §5.7
  payment_reviews_decision_check: ["SENT_TO_RECONCILIATION"], // §5.3
};
const M1_COLUMNS: Record<string, string[]> = {
  orders: ["commerce_flow", "cancelled_at", "cancelled_by", "cancel_reason", "has_manual_adjustment"],
  inventory_reservations: ["proforma_id", "confirmed_by", "review_hold_at", "release_reason"],
  payments: ["proforma_id", "expected_amount", "observed_amount", "observed_currency", "observed_value_date", "observed_bank_reference", "observed_bank_reference_normalized", "rejected_by", "rejected_at"],
  payment_proofs: ["claimed_amount", "claimed_currency", "transfer_date", "bank_reference", "submitted_at", "submission_kind", "request_id", "status"],
  payment_reviews: ["request_id"],
  payouts: ["proforma_id", "eligible_at", "recorded_amount", "recorded_currency", "request_id"],
  payment_accounts: ["is_default_for_currency"],
  coffee_offers: ["offer_code"],
};
/** data-model §7.1 — BANK_TRANSFER_V1 graph (status changes only; PROFORMA_ISSUED → PROFORMA_ISSUED is a replacement, not a status change). */
const V1_GRAPH: Record<string, string[]> = {
  DRAFT: ["PROFORMA_ISSUED", "CANCELLED", "VOID"],
  PROFORMA_ISSUED: ["HOLD", "CANCELLED", "VOID"],
  HOLD: ["PAYMENT_UNDER_REVIEW", "EXPIRED", "CANCELLED", "VOID"],
  PAYMENT_UNDER_REVIEW: ["PAID", "PAYMENT_REJECTED", "VOID"],
  PAID: ["FULFILLMENT_IN_PROGRESS", "PARTIALLY_DELIVERED", "COMPLETED", "DISPUTED"],
  FULFILLMENT_IN_PROGRESS: ["PARTIALLY_DELIVERED", "COMPLETED", "DISPUTED"],
  PARTIALLY_DELIVERED: ["COMPLETED", "DISPUTED"],
};
const V1_TERMINAL = ["COMPLETED", "EXPIRED", "CANCELLED", "PAYMENT_REJECTED", "VOID"];

/** Body of `create or replace function public.<name>()` between its dollar-quote delimiters (CR removed). */
function functionBody(sql: string, name: string): string {
  const match = new RegExp(`create or replace function public\\.${name}\\(\\)[\\s\\S]*?as \\$([A-Za-z_]*)\\$([\\s\\S]*?)\\$\\1\\$;`, "i").exec(sql.replace(/\r/g, ""));
  if (!match) throw new Error(`${name} not found`);
  return match[2]!;
}
const md5 = (text: string) => createHash("md5").update(text).digest("hex");
const baselineBody = functionBody(baselineSchema, "validate_order_transition");
const v2Body = functionBody(migrationRaw, "validate_order_transition");
const rollbackBody = functionBody(rollbackRaw, "validate_order_transition");

describe("T021 — M1 satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, transaction, grants, SECURITY DEFINER hygiene, no config-table policy/trigger, sanctioned DML only", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
  });

  it("the postflight is a single read-only query that ends in an ALL CHECKS PASSED summary", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
  });
});

describe("T021 — the drift guard is the T006 baseline", () => {
  it.each(["validate_order_transition", "admin_review_payment", "checkout_order", "expire_order_hold"])("pins %s to its T006 §5 body fingerprint", (name) => {
    const baseline = fingerprints[name]?.body_md5;
    expect(baseline).toMatch(/^[0-9a-f]{32}$/);
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(migration)![0];
    expect(guard).toContain(`to_regprocedure('public.${name}(`);
    expect(guard).toContain(`'${baseline}'`);
  });

  it("uses the same fingerprint expression as the T006 preflight (md5 of prosrc with CR removed)", () => {
    expect(migration).toContain("md5(replace(p.prosrc, chr(13), ''))");
    expect(readFileSync("supabase/maintenance/20260925_feature_013_preflight.sql", "utf8")).toContain("md5(replace(p.prosrc, chr(13), ''))");
  });

  it.each(["orders_status_check", "inventory_reservations_status_check", "payouts_status_check", "payment_reviews_decision_check", "payments_status_check"])(
    "compares %s to its exact T006 §9 definition", (name) => {
      expect(constraints[name]).toBeTruthy();
      expect(migrationRaw).toContain(`$d$${constraints[name]}$d$`);
    });

  it("compares uq_active_inventory_reservation_order to its exact T006 §9 definition", () => {
    expect(migrationRaw).toContain(`$d$${indexes.uq_active_inventory_reservation_order}$d$`);
  });

  it("the repository baseline body reproduces the live T006 fingerprint (so the rollback can restore it byte-for-byte)", () => {
    expect(md5(baselineBody)).toBe(fingerprints.validate_order_transition!.body_md5);
  });

  it("refuses unmappable rows (PAID payouts without paid fields) and a partial earlier apply", () => {
    expect(migration).toMatch(/status = 'paid' and \(paid_by is null or paid_at is null or payment_reference is null\)/i);
    expect(migration).toContain("an m1 column already exists");
  });
});

describe("T021 — CHECK sets equal the data-model (legacy values kept)", () => {
  const redefined = (name: string) => {
    const match = new RegExp(`add constraint ${name} check \\((?:status|decision) in \\(([^)]*)\\)\\)`).exec(migration);
    return match ? [...match[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!.toUpperCase()) : null;
  };

  it.each(Object.keys(ADDED_VALUES))("%s = T006 values + the data-model additions, same name", (name) => {
    const legacy = valuesOf(constraints[name]!);
    expect(legacy.length).toBeGreaterThan(0);
    expect(redefined(name)?.sort()).toEqual([...legacy, ...ADDED_VALUES[name]!].sort());
    expect(migration).toContain(`drop constraint ${name},`);
  });

  it("payments.status and proforma_invoices.status are NOT redefined by M1 (data-model §5.1; proforma set is M2b)", () => {
    expect(migration).not.toMatch(/drop constraint payments_status_check/);
    expect(migration).not.toMatch(/proforma_invoices_status_check/);
    expect(migration).not.toMatch(/alter table public\.proforma_invoices/);
  });

  it("release_reason / submission_kind / proof status / commerce_flow value sets match the data-model", () => {
    expect(migration).toContain("check (release_reason in ('expired', 'cancelled', 'rejected', 'admin_void', 'exception'))");
    expect(migration).toContain("check (submission_kind in ('on_time', 'late_report'))");
    expect(migration).toContain("check (status in ('submitted', 'accepted', 'rejected', 'in_reconciliation'))");
    expect(migration).toContain("check (commerce_flow in ('legacy', 'bank_transfer_v1'))");
  });
});

describe("T021 — no behaviour change for existing orders (commerce_flow stays LEGACY)", () => {
  it("commerce_flow is NOT NULL with default 'LEGACY'; M1 has no BANK_TRANSFER_V1 default and no insert guard", () => {
    expect(migration).toContain("add column commerce_flow text not null default 'legacy'");
    expect(migration).not.toMatch(/commerce_flow\s+set\s+default/);
    expect(migration).not.toMatch(/default 'bank_transfer_v1'/);
    expect(migration).not.toContain("enforce_new_order_flow");
  });

  it("checkout stays disabled: commerce_settings.bank_transfer_checkout_enabled defaults to false, validity 24 h (1–720), singleton row", () => {
    expect(migration).toContain("bank_transfer_checkout_enabled boolean not null default false");
    expect(migration).toContain("proforma_validity_hours integer not null default 24");
    expect(migration).toContain("check (proforma_validity_hours between 1 and 720)");
    expect(migration).toContain("constraint commerce_settings_singleton check (id)");
    expect(migration).toContain("insert into public.commerce_settings (id) values (true);");
    expect(migration).not.toMatch(/bank_transfer_checkout_enabled\)?\s*values\s*\(\s*true/);
  });

  it("does not create any RPC, change any policy other than the new commerce_settings read policy, or touch Feature 008 objects", () => {
    const functions = [...migrationTop.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(functions.sort()).toEqual(["next_offer_code", "validate_order_transition"]);
    expect([...migrationTop.matchAll(/create policy (\w+)/g)].map((m) => m[1])).toEqual(["commerce_settings_staff_read"]);
    expect(migrationTop).not.toMatch(/\b(drop|alter) policy\b/);
    for (const name of ["ingest_stripe_event", "record_stripe_payment_intent", "record_payment_transfer", "payment_events", "payment_transfers", "trusted_funding"]) {
      expect(migrationTop, name).not.toContain(name);
    }
  });

  it("payment_accounts (Feature 010 config table): one column + one index, nothing else", () => {
    const statements = migrationTop.split(";").map((s) => s.trim()).filter((s) => /\bpayment_accounts\b/.test(s));
    expect(statements).toEqual([
      "alter table public.payment_accounts add column is_default_for_currency boolean not null default false",
      "create unique index uq_payment_account_default_currency on public.payment_accounts (currency) where is_default_for_currency and is_active",
    ]);
  });
});

describe("T021 — columns, indexes and backfills", () => {
  it("adds exactly the data-model M1 columns (34), each dropped again by the rollback", () => {
    let total = 0;
    for (const [table, columns] of Object.entries(M1_COLUMNS)) {
      const block = new RegExp(`alter table public\\.${table}\\b([^;]*);`, "g");
      const added = [...migration.matchAll(block)].flatMap((m) => [...m[1]!.matchAll(/add column (\w+)/g)].map((c) => c[1]));
      expect(added.sort(), table).toEqual([...columns].sort());
      total += added.length;
      for (const column of columns) expect(rollback, `${table}.${column}`).toMatch(new RegExp(`drop column ${column}\\b`));
    }
    expect(total).toBe(34);
    expect(postflightRaw).toContain("'every M1 column exists (34)'");
  });

  it("REVIEW_HOLD is in the open-reservation unique index; the ACTIVE-only index is dropped; the sweeper index exists", () => {
    expect(migration).toContain("drop index public.uq_active_inventory_reservation_order;");
    expect(migration).toContain("create unique index uq_open_inventory_reservation_order on public.inventory_reservations (order_id) where status in ('active', 'review_hold');");
    expect(migration).toContain("create index idx_inventory_reservations_active_expiry on public.inventory_reservations (expires_at) where status = 'active';");
  });

  it("duplicate-transfer and single on-time proof indexes exist (R-11, §5.2)", () => {
    expect(migration).toContain("create unique index uq_confirmed_bank_reference on public.payments (observed_bank_reference_normalized) where status = 'confirmed';");
    expect(migration).toContain("create unique index uq_payment_proof_on_time on public.payment_proofs (payment_id) where submission_kind = 'on_time';");
  });

  it("payment_proofs.submitted_at is backfilled from created_at BEFORE it becomes NOT NULL (analysis L3)", () => {
    const backfill = migration.indexOf("update public.payment_proofs set submitted_at = created_at where submitted_at is null;");
    const notNull = migration.indexOf("alter column submitted_at set not null");
    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(backfill);
    expect(migration).toContain("alter column submitted_at set default clock_timestamp()");
  });

  it("offer_code is backfilled for every existing offer by a volatile default (no UPDATE, so no offer trigger fires), unique and LST-formatted", () => {
    expect(migration).toContain("add column offer_code text not null default public.next_offer_code()");
    expect(migration).toContain("add constraint coffee_offers_offer_code_key unique (offer_code)");
    expect(migration).toContain("check (offer_code ~ '^lst-[0-9]{7,}$')");
    expect(migration).toContain("select 'lst-' || lpad(nextval('public.offer_code_seq')::text, 7, '0');");
    expect(migration).not.toMatch(/update public\.coffee_offers/);
  });

  it("payouts: PAID requires paid_by, paid_at and payment_reference (§5.7)", () => {
    expect(migration).toContain("add constraint payouts_paid_fields_check check ( status <> 'paid' or (paid_by is not null and paid_at is not null and payment_reference is not null))");
  });
});

describe("T021 — security of the new objects", () => {
  it("commerce_settings: RLS enabled + forced, revoked from public/anon/authenticated, SELECT only, admin/finance read policy", () => {
    expect(migration).toContain("alter table public.commerce_settings enable row level security;");
    expect(migration).toContain("alter table public.commerce_settings force row level security;");
    expect(migration).toContain("revoke all on table public.commerce_settings from public, anon, authenticated;");
    expect(migration).toContain("grant select on table public.commerce_settings to authenticated;");
    expect(migration).toContain("create policy commerce_settings_staff_read on public.commerce_settings for select to authenticated using (public.is_platform_admin() or public.is_finance_operator());");
  });

  it("commerce_request_log: RLS enabled + forced, no client grant, no policy", () => {
    expect(migration).toContain("alter table public.commerce_request_log force row level security;");
    expect(migration).toContain("revoke all on table public.commerce_request_log from public, anon, authenticated;");
    expect(migrationTop).not.toMatch(/grant [^;]* on table public\.commerce_request_log/);
    expect(migrationTop).not.toMatch(/create policy [^;]* on public\.commerce_request_log/);
  });

  it("next_offer_code(): SECURITY DEFINER, pinned search_path, EXECUTE authenticated + service_role; the sequence has no client grant", () => {
    expect(migration).toMatch(/create or replace function public\.next_offer_code\(\) returns text language sql volatile security definer set search_path = pg_catalog, public as/);
    expect(migration).toContain("revoke all on function public.next_offer_code() from public, anon;");
    expect(migration).toContain("grant execute on function public.next_offer_code() to authenticated, service_role;");
    expect(migration).toContain("revoke all on sequence public.offer_code_seq from public, anon, authenticated;");
    expect(migrationTop).not.toMatch(/grant [^;]* on sequence public\.offer_code_seq/);
  });

  it("validate_order_transition(): EXECUTE list equals the T006 ACL (authenticated + service_role, not anon)", () => {
    const acl = fingerprints.validate_order_transition!.acl!;
    expect(acl).toContain("authenticated=X");
    expect(acl).toContain("service_role=X");
    expect(acl).not.toContain("anon=");
    expect(migration).toContain("revoke all on function public.validate_order_transition() from public, anon;");
    expect(migration).toContain("grant execute on function public.validate_order_transition() to authenticated, service_role;");
  });

  it("M1 fields and commerce_flow are never client-writable (only internal transitions change them)", () => {
    const body = normalize(v2Body);
    expect(body).toContain("raise exception 'order_commerce_flow_immutable'");
    expect(body).toContain("(new.cancelled_at, new.cancelled_by, new.cancel_reason, new.has_manual_adjustment) is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason, old.has_manual_adjustment) and not public.is_internal_transition() then raise exception 'order_field_not_client_writable'");
    expect(body).toContain("old.commerce_flow = 'legacy' and new.commerce_flow = 'bank_transfer_v1' and old.status = 'draft' and new.status = 'draft'");
  });
});

describe("T021 — validate_order_transition v2: the legacy graph is textually preserved", () => {
  const baselineLines = baselineBody.split("\n").map((line) => line.trim()).filter(Boolean);
  const v2Lines = v2Body.split("\n").map((line) => line.trim()).filter(Boolean);
  const legacyStart = v2Lines.indexOf("if new.commerce_flow = 'LEGACY' then");
  const v1Start = v2Lines.indexOf("else", legacyStart);

  it("every line of the pre-M1 body appears, in order, inside the LEGACY branch (plus the shared PAID/COMPLETED tail)", () => {
    expect(legacyStart).toBeGreaterThan(-1);
    expect(v1Start).toBeGreaterThan(legacyStart);
    const statusBlock = baselineLines.slice(baselineLines.indexOf("if new.status <> old.status then"), baselineLines.indexOf("if new.status = 'PAID' and new.paid_at is null then new.paid_at := now(); end if;"));
    let cursor = legacyStart;
    for (const line of statusBlock) {
      const found = v2Lines.indexOf(line, cursor);
      expect(found, `legacy line missing or out of order: ${line}`).toBeGreaterThan(-1);
      expect(found, `legacy line outside the LEGACY branch: ${line}`).toBeLessThan(v1Start);
      cursor = found + 1;
    }
    for (const tail of ["if new.status = 'PAID' and new.paid_at is null then new.paid_at := now(); end if;", "if new.status = 'COMPLETED' and new.completed_at is null then new.completed_at := now(); end if;"]) {
      expect(v2Lines.lastIndexOf(tail)).toBeGreaterThan(v1Start);
    }
  });

  it("the only addition to the legacy branch is the fence keeping PROFORMA_ISSUED/CANCELLED/PAYMENT_REJECTED out", () => {
    const branch = v2Lines.slice(legacyStart + 1, v1Start);
    const extra = branch.filter((line) => !baselineLines.includes(line) && !line.startsWith("--"));
    expect(extra).toEqual(["if new.status in ('PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED') then raise exception 'invalid_order_transition'; end if;"]);
  });

  it("assert_order_checkout_ready() still runs on HOLD for LEGACY rows and never for BANK_TRANSFER_V1 rows (DB-OPEN-15 fix for v1)", () => {
    const occurrences = v2Lines.map((line, index) => (line.includes("assert_order_checkout_ready") ? index : -1)).filter((index) => index >= 0);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]!).toBeGreaterThan(legacyStart);
    expect(occurrences[0]!).toBeLessThan(v1Start);
  });
});

describe("T021 — validate_order_transition v2: the BANK_TRANSFER_V1 graph equals data-model §7.1", () => {
  const v1Section = normalize(v2Body.slice(v2Body.indexOf("\n  else\n")));

  it("every v1 edge list matches §7.1 exactly", () => {
    const edges: Record<string, string[]> = {};
    for (const m of v1Section.matchAll(/if old\.status = '(\w+)' and new\.status not in \(([^)]*)\) then raise exception 'invalid_order_transition'/g)) {
      edges[m[1]!.toUpperCase()] = [...m[2]!.matchAll(/'(\w+)'/g)].map((v) => v[1]!.toUpperCase());
    }
    expect(edges).toEqual(V1_GRAPH);
  });

  it("v1 terminal states, legacy-only states and DISPUTED (no exit defined) all fail closed", () => {
    expect(v1Section).toContain(`if old.status in (${V1_TERMINAL.map((s) => `'${s.toLowerCase()}'`).join(", ")}) then raise exception 'terminal_order_cannot_change'`);
    expect(v1Section).toContain("if old.status in ('confirmed', 'payment_proof_submitted') then raise exception 'invalid_order_transition'");
    expect(v1Section).toContain("if old.status = 'disputed' then raise exception 'invalid_order_transition'");
  });

  it("v1 moves require an internal transition; only the platform-admin path into DISPUTED is exempt", () => {
    expect(v1Section).toContain("if not public.is_internal_transition() and not (new.status = 'disputed' and public.is_platform_admin()) then raise exception 'order_status_can_only_change_through_workflow'");
  });

  it("entering HOLD requires the reservation window to be supplied (never defaulted to 20 minutes for v1)", () => {
    expect(v1Section).toContain("if new.hold_expires_at is null then raise exception 'order_hold_window_required'");
    expect(v1Section).not.toContain("interval '20 minutes'");
  });
});

describe("T021 — the rollback restores the exact T006 baseline", () => {
  it("restores validate_order_transition() byte-for-byte (md5 = T006 fingerprint) with the same EXECUTE list", () => {
    expect(md5(rollbackBody)).toBe(fingerprints.validate_order_transition!.body_md5);
    expect(rollback).toContain("revoke all on function public.validate_order_transition() from public, anon;");
    expect(rollback).toContain("grant execute on function public.validate_order_transition() to authenticated, service_role;");
  });

  it.each(Object.keys(ADDED_VALUES))("re-creates %s with exactly its T006 value set", (name) => {
    const match = new RegExp(`add constraint ${name} check \\((?:status|decision) = any \\(array\\[([^\\]]*)\\]\\)\\)`).exec(rollback);
    expect(match, name).not.toBeNull();
    expect([...match![1]!.matchAll(/'(\w+)'::text/g)].map((m) => m[1]!.toUpperCase())).toEqual(valuesOf(constraints[name]!));
  });

  it("re-creates uq_active_inventory_reservation_order with its T006 definition and drops the M1 indexes", () => {
    expect(rollback).toContain(normalize(indexes.uq_active_inventory_reservation_order!).replace("create unique index", "create unique index") + ";");
    for (const index of ["uq_open_inventory_reservation_order", "idx_inventory_reservations_active_expiry", "uq_confirmed_bank_reference", "uq_payment_proof_on_time", "uq_payment_account_default_currency"]) {
      expect(rollback, index).toContain(`drop index public.${index};`);
    }
  });

  it("drops the new tables, sequence and function, and restores the function before dropping the orders columns it reads", () => {
    for (const statement of ["drop table public.commerce_request_log;", "drop table public.commerce_settings;", "drop function public.next_offer_code();", "drop sequence public.offer_code_seq;"]) {
      expect(rollback).toContain(statement);
    }
    expect(rollback.indexOf("create or replace function public.validate_order_transition()")).toBeLessThan(rollback.indexOf("drop column commerce_flow"));
  });

  it("refuses (changing nothing) once any M1 value is in use or a later Feature 013 migration is applied", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    expect(rollback.startsWith("begin; do $guard$")).toBe(true);
    expect(rollback.indexOf("do $guard$")).toBeLessThan(rollback.indexOf("create or replace function"));
    for (const probe of ["commerce_flow <> 'legacy'", "status = 'review_hold'", "status = 'accrued'", "decision = 'sent_to_reconciliation'", "is_default_for_currency", "from public.commerce_request_log", "to_regclass('public.delivery_destinations')"]) {
      expect(guard, probe).toContain(probe);
    }
    expect(guard).toContain("raise exception 'feature_013_commerce_state_vocabulary rollback refused");
  });
});
