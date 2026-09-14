import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN A1 (T009) — STATIC review of the DRAFT DB-BLOCK-07 migration, its rollback and the
 * read-only preflight (no database access — these files are NOT applied anywhere). Mirrors
 * `tests/orders/db-blockers-migration.test.ts`'s established convention exactly: abort-on-mismatch
 * guard first, minimal/traceable diffs against the verified baseline bodies, an exact guarded
 * rollback, and a write-free preflight.
 */
const MIGRATION = "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql";
const ROLLBACK = "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql";
const PREFLIGHT = "supabase/maintenance/20260914_feature_009_db_block_07_preflight.sql";

const lf = (text: string) => text.replace(/\r/g, "");
const md5 = (text: string) => createHash("md5").update(lf(text), "utf8").digest("hex");
const read = (path: string) => lf(readFileSync(path, "utf8"));

function baselineDefinition(name: string): string {
  const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as { functions: Array<{ function_name: string; definition: string }> };
  const matches = report.functions.filter((fn) => fn.function_name === name);
  expect(matches, name).toHaveLength(1);
  return lf(matches[0]!.definition);
}

/** prosrc: text between the first `AS $function$` and the following `$function$`. */
function prosrcOf(definition: string): string {
  const open = definition.indexOf("AS $function$");
  const close = definition.indexOf("$function$", open + "AS $function$".length);
  return definition.slice(open + "AS $function$".length, close);
}

/** Every `CREATE OR REPLACE FUNCTION public.<name>() … $function$…$function$` in a script, by name. */
function functionsIn(sql: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(\)[\s\S]*?AS \$function\$[\s\S]*?\$function\$/g)) {
    expect(found.has(match[1]!), `duplicate definition of ${match[1]}`).toBe(false);
    found.set(match[1]!, match[0]);
  }
  return found;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

const migration = read(MIGRATION);
const rollback = read(ROLLBACK);
const preflight = read(PREFLIGHT);
const migrated = functionsIn(migration);
const restored = functionsIn(rollback);

const NEW_EXCEPTIONS = ["delivery_reservation_requires_settled_order", "delivery_reservation_insufficient_inventory", "delivery_reservation_position_missing"] as const;

describe("DRAFT migration — guard, scope, and additive-only shape", () => {
  it("opens a transaction and runs the abort-on-mismatch guard BEFORE any function/column/policy change, and touches exactly the approved objects", () => {
    const body = stripSqlComments(migration);
    const begin = body.indexOf("begin;");
    const guard = body.indexOf("do $guard$");
    const firstAlter = body.indexOf("alter table");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(begin);
    expect(firstAlter).toBeGreaterThan(guard);
    expect(body).toMatch(/raise exception 'feature_009_db_block_07 preflight failed — nothing applied: %'/);
    expect(body.trimEnd().endsWith("commit;")).toBe(true);

    expect([...migrated.keys()].sort()).toEqual(["validate_shipment_item", "validate_shipment_transition"]);

    // Exactly two ALTER TABLE ADD COLUMN statements, no other DDL shape.
    expect(body.match(/\balter table\b/gi)).toHaveLength(2);
    expect(body).toContain("add column reserved_quantity_kg numeric(14, 3) not null default 0");
    expect(body).toContain("add column settlement_verified_at timestamptz");
    expect(body).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(body).not.toMatch(/\bcreate\s+table\b/i);

    // Exactly one policy touched (drop+recreate of the SAME buyer policy) — no new table, no new RLS policy shape.
    expect(body.match(/drop policy if exists/gi)).toHaveLength(1);
    expect(body.match(/create policy/gi)).toHaveLength(1);
    expect(body).toContain("shipments_buyer_draft_update");

    // No table-level GRANT/REVOKE, no RLS disabling, no service-role grant anywhere.
    expect(body).not.toMatch(/\bon\s+(table\s+)?public\.[a-z_]+\s+(to|from)\b/i);
    expect(body).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
    expect(body).not.toMatch(/service_role/i);

    // Only order_shipments / shipment_items / inventory_positions / storage_allocations / orders /
    // order_items are referenced as TABLES (from/join/update/into/alter table) — no unrelated table
    // (payments, order_financials, etc.) is touched. Function calls like public.is_warehouse_operator()
    // are deliberately excluded — this checks table access, not helper-function usage.
    const referencedTables = new Set([...body.matchAll(/\b(?:from|join|update|into|alter\s+table)\s+public\.([a-z_]+)\b/gi)].map((m) => m[1]!.toLowerCase()));
    // organization_members is read-only, inside the RLS policy's own USING clause (ownership check) —
    // the same join the LIVE baseline policy already performs, not a new table dependency.
    for (const table of referencedTables) {
      expect(["order_shipments", "shipment_items", "inventory_positions", "storage_allocations", "orders", "order_items", "organization_members"], table).toContain(table);
    }
  });

  it("the guard's baseline fingerprints are the md5 of the CURRENT live baseline bodies (schema report), matching the preflight file", () => {
    for (const name of ["validate_shipment_transition", "validate_shipment_item"]) {
      const fingerprint = md5(prosrcOf(baselineDefinition(name)));
      expect(migration, name).toContain(`v_fp is distinct from '${fingerprint}'`);
      expect(preflight, name).toContain(`'${fingerprint}'`);
    }
  });

  it("no PROOF_SUBMITTED/UNDER_REVIEW/REJECTED status is repurposed; no invented escrow-style status vocabulary is introduced; only the three drafted exception strings are new", () => {
    const body = stripSqlComments(migration);
    for (const forbidden of ["PROOF_SUBMITTED", "UNDER_REVIEW", "REJECTED", "FUNDED", "ESCROW_FUNDED", "AUTHORIZED", "CAPTURED", "AWAITING_ESCROW", "RELEASED"]) {
      expect(body).not.toContain(forbidden);
    }
    for (const exception of NEW_EXCEPTIONS) {
      expect(body).toContain(`'${exception}'`);
    }
  });

  it("admin_review_payment, checkout_order, and expire_order_hold are not referenced or modified anywhere in this migration", () => {
    const body = stripSqlComments(migration);
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(admin_review_payment|checkout_order|expire_order_hold)/);
    expect(body).not.toContain("admin_review_payment(");
  });
});

describe("DRAFT migration — settlement gate and reservation logic", () => {
  it("validate_shipment_transition gates reservation on the FIRST entry into the gated set, checked against orders.status being in the settled family", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("v_newly_gated :=");
    expect(body).toContain("'CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED'");
    expect(body).toContain("v_order.status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')");
    expect(body).toContain("raise exception 'delivery_reservation_requires_settled_order'");
    // DISPUTED is deliberately excluded from the settled family the gate accepts.
    const gateLine = body.slice(body.indexOf("v_order.status not in"), body.indexOf("then\n        raise exception 'delivery_reservation_requires_settled_order'"));
    expect(gateLine).not.toContain("DISPUTED");
  });

  it("reservation locks the position under FOR UPDATE, checks available minus reserved, and updates both inventory_positions and shipment_items atomically with an idempotency guard", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("for update;\n\n        if v_position.id is null\n           or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_item.planned_quantity_kg");
    expect(body).toContain("raise exception 'delivery_reservation_insufficient_inventory'");
    expect(body).toContain("raise exception 'delivery_reservation_position_missing'");
    expect(body).toContain("set reserved_quantity_kg = reserved_quantity_kg + v_item.planned_quantity_kg");
    // The idempotency guard: only reserve a shipment_item that is not already reserved.
    expect(body).toContain("set reserved_quantity_kg = planned_quantity_kg\n        where id = v_item.id\n          and reserved_quantity_kg = 0;");
  });

  it("cancel/fail release is guarded by old.settlement_verified_at (only releases what was actually reserved) and is idempotent via a WHERE clause matching the value read under lock, not bare clamping alone", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("v_releasing := new.status in ('CANCELLED', 'FAILED') and old.settlement_verified_at is not null;");
    expect(body).toContain("and si.reserved_quantity_kg > 0");
    expect(body).toContain("greatest(reserved_quantity_kg - v_item.reserved_quantity_kg, 0)");
    // The exact-once mechanism: the release UPDATE's WHERE clause re-checks the SAME value just read
    // under lock, not merely a blind clamp — a second concurrent/duplicate call finds zero rows.
    expect(body).toContain("set reserved_quantity_kg = 0\n        where id = v_item.id\n          and reserved_quantity_kg = v_item.reserved_quantity_kg;");
  });

  it("FAILED and DISPUTED still have no forward-transition elsif branch (unchanged from baseline) — the application-level narrowing lives in lib/delivery/transitions.ts, not this trigger", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).not.toMatch(/elsif old\.status = 'FAILED'/);
    expect(body).not.toMatch(/elsif old\.status = 'DISPUTED'/);
  });

  it("entering DISPUTED does not release the reservation (design §9's recommended 'freeze' policy)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseCondition = body.slice(body.indexOf("v_releasing :="), body.indexOf("v_releasing :=") + 200);
    expect(releaseCondition).not.toContain("DISPUTED");
  });

  it("every branch of the transition-validity elsif chain is byte-identical to the baseline (only additions before `return new`, no existing rule altered)", () => {
    const baseline = prosrcOf(baselineDefinition("validate_shipment_transition"));
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    // The entire transition-validity chain (from the first `if old.status = 'DRAFT'` through the
    // terminal-state raise) must appear verbatim in both — this is the load-bearing proof that no
    // existing rule was altered, only new logic was inserted around it.
    const chainStart = baseline.indexOf("if old.status = 'DRAFT'");
    const chainEnd = baseline.indexOf("end if;\n\n\n  if old.status <> 'DRAFT'");
    const baselineChain = baseline.slice(chainStart, chainEnd);
    expect(body).toContain(baselineChain.trim());
  });
});

describe("DRAFT migration — delivery-write release logic", () => {
  it("validate_shipment_item releases exactly the newly-delivered amount from reserved_quantity_kg, never a computed/derived quantity beyond the stored delta", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("v_newly_delivered := new.delivered_quantity_kg - old.delivered_quantity_kg;");
    expect(body).toContain("new.reserved_quantity_kg := greatest(old.reserved_quantity_kg - v_newly_delivered, 0);");
    // Only fires when there was something reserved and a genuine increase occurred.
    expect(body).toContain("if v_newly_delivered > 0 and old.reserved_quantity_kg > 0 then");
  });

  it("every existing validate_shipment_item rule (order/shipment match, DRAFT-only edits, warehouse-only delivery, no decrease, over-plan, cross-item sum) is preserved verbatim", () => {
    const baseline = prosrcOf(baselineDefinition("validate_shipment_item"));
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    for (const exception of ["shipment_or_order_item_missing", "shipment_order_item_mismatch", "shipment_plan_is_closed", "only_warehouse_can_record_delivery", "delivered_quantity_cannot_decrease", "delivered_quantity_exceeds_plan", "shipment_plan_exceeds_order_item"]) {
      expect(baseline, exception).toContain(exception);
      expect(body, exception).toContain(exception);
    }
  });
});

describe("DRAFT migration — buyer-cancel RLS widening (DB-OPEN-18)", () => {
  it("shipments_buyer_draft_update's USING expression is unchanged; only WITH CHECK gains CANCELLED", () => {
    expect(migration).toContain("with check (status in ('DRAFT', 'REQUESTED', 'CANCELLED'));");
    // The ownership/DRAFT-only USING clause is byte-identical to the live baseline policy shape.
    expect(migration).toContain("status = 'DRAFT'\n    and exists (\n      select 1\n      from public.orders o\n      join public.organization_members om on om.organization_id = o.buyer_organization_id\n      where o.id = order_shipments.order_id\n        and om.user_id = auth.uid()\n        and om.is_active = true\n    )");
  });
});

describe("DRAFT rollback — exact, guarded reversal", () => {
  it("aborts unless both functions carry exactly the migrated bodies (fingerprints computed from the migration itself) and the new columns are present", () => {
    const guard = rollback.slice(rollback.indexOf("do $guard$"), rollback.indexOf("$guard$;"));
    for (const [name, definition] of migrated) {
      expect(guard, name).toContain(`p.proname = '${name}'`);
      expect(guard, name).toContain(`v_fp is distinct from '${md5(prosrcOf(definition))}'`);
    }
    expect(guard).toContain("shipment_items' and column_name = 'reserved_quantity_kg'");
    expect(guard).toContain("order_shipments' and column_name = 'settlement_verified_at'");
    expect(guard).toMatch(/raise exception 'feature_009_db_block_07 rollback guard failed — nothing reverted: %'/);
    expect(stripSqlComments(rollback).indexOf("do $guard$")).toBeLessThan(stripSqlComments(rollback).indexOf("drop column"));
  });

  it("drops exactly the two new columns and restores both baseline bodies byte-for-byte (CR removed), and restores the original WITH CHECK", () => {
    const body = stripSqlComments(rollback);
    expect(body.match(/drop column/g)).toHaveLength(2);
    expect(body).toContain("drop column reserved_quantity_kg;");
    expect(body).toContain("drop column settlement_verified_at;");
    expect([...restored.keys()].sort()).toEqual(["validate_shipment_item", "validate_shipment_transition"]);
    for (const name of restored.keys()) {
      expect(restored.get(name), name).toBe(baselineDefinition(name).trim());
    }
    expect(body).toContain("with check (status in ('DRAFT', 'REQUESTED'));");
    expect(body).not.toContain("'CANCELLED'));");
  });
});

describe("DRAFT preflight — strictly read-only", () => {
  it("contains only SELECT/WITH statements over catalogs and application tables: no DML, DDL, GRANT/REVOKE, DO blocks, transactions or set_config", () => {
    const code = stripSqlComments(preflight).replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|comment|vacuum|analyze|copy|call|begin|commit|rollback|lock)\b/i);
    expect(code).not.toMatch(/\bdo\s+\$/i);
    expect(code).not.toMatch(/set_config|pg_advisory|nextval|setval/i);
    const statements = code
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) expect(statement).toMatch(/^(select|with)\b/i);
  });

  it("the summary checks every assumption the migration's guard enforces", () => {
    for (const expected of [
      "validate_shipment_transition: exactly one overload",
      "validate_shipment_transition: body matches the baseline",
      "validate_shipment_item: body matches the baseline",
      "shipment_items.reserved_quantity_kg does not exist yet",
      "order_shipments.settlement_verified_at does not exist yet",
      "no existing function references the planned draft exception strings",
      "no inventory_positions row currently has a negative",
    ]) {
      expect(preflight).toContain(expected);
    }
  });
});

describe("DRAFT files are not live migrations", () => {
  it("live under supabase/maintenance/, not supabase/migrations/ — this project's own convention keeps migrations/ as APPLIED history only", () => {
    expect(MIGRATION.startsWith("supabase/maintenance/")).toBe(true);
    expect(ROLLBACK.startsWith("supabase/maintenance/")).toBe(true);
    expect(MIGRATION).toContain(".DRAFT.");
  });

  it("both DRAFT files carry an explicit not-yet-applied warning at the top", () => {
    expect(migration.slice(0, 400)).toMatch(/DRAFT — NOT YET APPLIED/);
    expect(rollback.slice(0, 400)).toMatch(/DRAFT/);
  });
});
