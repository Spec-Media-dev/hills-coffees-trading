import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 009 RUN A2-PRE3 — STATIC review of the settlement-time-hook-extended DB-BLOCK-07 migration,
 * its rollback and the read-only preflight/postflight (no database access — these files are NOT
 * applied anywhere). Supersedes RUN A2-PRE2's own suite: a live RUN A2 preflight execution against the
 * real Supabase project found two real SQL-Editor-only execution bugs (a UNION column-count mismatch;
 * an implicit `"char"`-to-`text` concatenation failure) plus a genuine settlement-to-READY reservation
 * gap, all fixed here. See `specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md` §20/§21.
 */
const MIGRATION = "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql";
const ROLLBACK = "supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql";
const PREFLIGHT = "supabase/maintenance/20260914_feature_009_db_block_07_preflight.sql";
const POSTFLIGHT = "supabase/maintenance/20260914_feature_009_db_block_07_postflight.sql";

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

/** Every `CREATE OR REPLACE FUNCTION public.<name>(...) … $function$…$function$` in a script, by name. */
function functionsIn(sql: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\([^)]*\)[\s\S]*?AS \$function\$[\s\S]*?\$function\$/g)) {
    expect(found.has(match[1]!), `duplicate definition of ${match[1]}`).toBe(false);
    found.set(match[1]!, match[0]);
  }
  return found;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, "");
}

/** Neutralizes single-quoted string literals (commas/parens/keywords inside them must not confuse a
 * structural scan) into fixed-width placeholders of `x`, preserving every other character's position. */
function neutralizeStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, (match) => "x".repeat(match.length));
}

/** Every top-level `select ... union all select ...` statement's branches, split on bare `union all`. */
function unionBranches(statement: string): string[] {
  return statement.split(/\bunion all\b/i);
}

/** Column count of a single `select <a>, <b>, ...` branch: top-level commas in the projection list,
 * outside parens and string literals (the caller passes an already string-neutralized branch). */
function columnCount(branch: string): number {
  const body = branch.trim().replace(/^select\s+/i, "");
  let depth = 0;
  let count = 1;
  for (const ch of body) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) count += 1;
  }
  return count;
}

const migration = read(MIGRATION);
const rollback = read(ROLLBACK);
const preflight = read(PREFLIGHT);
const postflight = read(POSTFLIGHT);
const migrated = functionsIn(migration);
const restored = functionsIn(rollback);

const NEW_EXCEPTIONS = ["delivery_reservation_requires_settled_order", "delivery_reservation_insufficient_inventory", "delivery_reservation_position_missing", "delivery_release_position_missing", "delivery_reservation_ledger_inconsistent", "delivery_reservation_position_ambiguous", "shipment_must_start_draft", "delivery_recovery_requires_dedicated_workflow"] as const;

describe("HARDENED migration — guard, scope, and additive-only shape", () => {
  it("opens a transaction and runs the abort-on-mismatch guard BEFORE any function/column/policy change, and defines exactly the approved functions", () => {
    const body = stripSqlComments(migration);
    const begin = body.indexOf("begin;");
    const guard = body.indexOf("do $guard$");
    const firstAlter = body.indexOf("alter table");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(begin);
    expect(firstAlter).toBeGreaterThan(guard);
    expect(body).toMatch(/raise exception 'feature_009_db_block_07 preflight failed — nothing applied: %'/);
    expect(body.trimEnd().endsWith("commit;")).toBe(true);

    expect([...migrated.keys()].sort()).toEqual(["admin_review_payment", "apply_delivery_reservation", "reserve_ready_deliveries_for_settlement", "validate_shipment_item", "validate_shipment_transition"]);

    expect(body.match(/\balter table\b/gi)).toHaveLength(4); // 1 column + 2 CHECK constraints on shipment_items, 1 column on order_shipments
    expect(body).toContain("add column reserved_quantity_kg numeric(14, 3) not null default 0");
    expect(body).toContain("add column settlement_verified_at timestamptz");
    expect(body).toContain("add constraint shipment_items_reserved_quantity_kg_check check (reserved_quantity_kg >= 0)");
    expect(body).toContain("add constraint shipment_items_reserved_within_planned_check check (reserved_quantity_kg <= planned_quantity_kg)");
    expect(body).not.toMatch(/\bdrop\s+(table|column)\b/i);
    expect(body).not.toMatch(/\bcreate\s+table\b/i);

    expect(body.match(/drop policy if exists/gi)).toHaveLength(1);
    expect(body.match(/create policy/gi)).toHaveLength(1);
    expect(body).toContain("drop trigger trg_shipment_transition on public.order_shipments;");
    expect(body).toContain("before insert or update on public.order_shipments");
    expect(body).toContain("shipments_buyer_draft_update");

    expect(body).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
    expect(body).not.toMatch(/service_role/i);
  });

  it("the two new internal helper functions have NO GRANT statement widening access, and REVOKE explicitly from PUBLIC/authenticated/anon", () => {
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.apply_delivery_reservation(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, authenticated, anon;");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.reserve_ready_deliveries_for_settlement(uuid, uuid) FROM PUBLIC, authenticated, anon;");
    expect(stripSqlComments(migration)).not.toMatch(/\bgrant\s+execute\b/i);
  });

  it("the guard's baseline fingerprints are the md5 of the CURRENT live baseline bodies (schema report), matching the preflight file, for every function this migration reads/replaces", () => {
    for (const name of ["validate_shipment_transition", "validate_shipment_item", "admin_review_payment"]) {
      const fingerprint = md5(prosrcOf(baselineDefinition(name)));
      expect(migration, name).toContain(`'${fingerprint}'`);
      expect(preflight, name).toContain(`'${fingerprint}'`);
    }
  });

  it("no PROOF_SUBMITTED/UNDER_REVIEW/REJECTED status is repurposed and no invented escrow-style status vocabulary is introduced in the SHIPMENT logic specifically; only the eight drafted exception strings are new there (admin_review_payment's own pre-existing, unmodified payment-status vocabulary — including its legitimate 'REJECTED'/'PAYMENT_UNDER_REVIEW' literals — is scoped OUT of this check since that function is intentionally included verbatim, not new)", () => {
    const shipmentLogic = prosrcOf(migrated.get("validate_shipment_transition")!) + prosrcOf(migrated.get("validate_shipment_item")!);
    for (const forbidden of ["PROOF_SUBMITTED", "UNDER_REVIEW", "REJECTED", "FUNDED", "ESCROW_FUNDED", "AUTHORIZED", "CAPTURED", "AWAITING_ESCROW", "RELEASED_STATUS_FICTION"]) {
      expect(shipmentLogic).not.toContain(forbidden);
    }
    for (const exception of NEW_EXCEPTIONS) {
      expect(migration).toContain(`'${exception}'`);
    }
  });

  it("checkout_order and expire_order_hold are not referenced or modified anywhere in this migration; admin_review_payment IS intentionally modified, and removing EXACTLY the new inserted block yields the byte-identical pre-migration baseline (proves nothing else changed)", () => {
    const body = stripSqlComments(migration);
    expect(body).not.toMatch(/CREATE OR REPLACE FUNCTION public\.(checkout_order|expire_order_hold)/);
    expect(body).not.toContain("checkout_order(");
    expect(body).not.toContain("expire_order_hold(");

    const baselineAdmin = prosrcOf(baselineDefinition("admin_review_payment"));
    const migratedAdmin = prosrcOf(migrated.get("admin_review_payment")!);
    const insertStart = migratedAdmin.indexOf("\n\n\n  -- Feature 009 DB-BLOCK-07 (RUN A2-PRE3): buyer storage_allocations");
    const insertEnd = migratedAdmin.indexOf("\n\n\n  update public.inventory_reservations");
    expect(insertStart).toBeGreaterThan(0);
    expect(insertEnd).toBeGreaterThan(insertStart);
    const withoutInsertion = migratedAdmin.slice(0, insertStart) + migratedAdmin.slice(insertEnd);
    expect(withoutInsertion).toBe(baselineAdmin);
    expect(migratedAdmin).toContain("perform public.reserve_ready_deliveries_for_settlement(v_order.id, v_order.buyer_organization_id);");
  });

  it("admin_review_payment's single new statement is inserted AFTER the buyer custody loop and BEFORE the reservation is consumed (custody must exist before the shared primitive can resolve a position)", () => {
    const body = prosrcOf(migrated.get("admin_review_payment")!);
    const loopEnd = body.lastIndexOf("end loop;");
    const hookCall = body.indexOf("perform public.reserve_ready_deliveries_for_settlement(");
    const consumed = body.indexOf("status = 'CONSUMED'");
    expect(loopEnd).toBeGreaterThan(0);
    expect(hookCall).toBeGreaterThan(loopEnd);
    expect(consumed).toBeGreaterThan(hookCall);
  });

  it("admin_review_payment keeps its existing table/function scope — every public.<identifier> it references was already in its pre-migration baseline, EXCEPT the one new call to the settlement-time hook itself (the shared primitive's own table scope is proven separately, not duplicated inline here)", () => {
    const baselineIdentifiers = new Set([...prosrcOf(baselineDefinition("admin_review_payment")).matchAll(/\bpublic\.([a-z_]+)\b/gi)].map((m) => m[1]!.toLowerCase()));
    const migratedIdentifiers = new Set([...prosrcOf(migrated.get("admin_review_payment")!).matchAll(/\bpublic\.([a-z_]+)\b/gi)].map((m) => m[1]!.toLowerCase()));
    for (const identifier of migratedIdentifiers) {
      if (identifier === "reserve_ready_deliveries_for_settlement") continue; // the one intentional new reference this run adds
      expect(baselineIdentifiers.has(identifier), identifier).toBe(true);
    }
  });
});

describe("HARDENED migration — one shared reservation primitive, called from two places, never duplicated", () => {
  it("apply_delivery_reservation exists as a single function performing the exact-once guarded reserve arithmetic", () => {
    const body = prosrcOf(migrated.get("apply_delivery_reservation")!);
    expect(body).toContain("select count(*) into v_alloc_count");
    expect(body).toContain("raise exception 'delivery_reservation_position_missing';");
    expect(body).toContain("raise exception 'delivery_reservation_position_ambiguous';");
    expect(body).toContain("raise exception 'delivery_reservation_insufficient_inventory';");
    expect(body).toContain("set_config('app.delivery_reservation_mutation', 'true', true)");
    expect(body).toContain("set_config('app.delivery_reservation_mutation', 'false', true)");
    expect(body).toContain("get diagnostics v_rows = row_count;");
    expect(body).toContain("reserved_quantity_kg = reserved_quantity_kg + p_planned_quantity_kg");
    expect(body).toContain("raise exception 'delivery_reservation_ledger_inconsistent';");
  });

  it("validate_shipment_transition's own reserve loop calls the shared primitive instead of inlining the arithmetic (no duplication)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("perform public.apply_delivery_reservation(");
    expect(body).not.toContain("select count(*) into v_alloc_count\n          from public.storage_allocations"); // the old inline reserve-path lookup is gone
    const reserveBlockStart = body.indexOf("if v_unreserved_count = v_item_count then");
    const reserveBlockEnd = body.indexOf("new.settlement_verified_at := now();");
    const reserveBlock = body.slice(reserveBlockStart, reserveBlockEnd);
    expect(reserveBlock).toContain("apply_delivery_reservation");
    expect(reserveBlock).not.toContain("set_config('app.delivery_reservation_mutation'"); // the marker is now set INSIDE the primitive, not inlined here
  });

  it("reserve_ready_deliveries_for_settlement calls the SAME shared primitive per item, never re-implementing the arithmetic", () => {
    const body = prosrcOf(migrated.get("reserve_ready_deliveries_for_settlement")!);
    expect(body).toContain("perform public.apply_delivery_reservation(");
    expect(body).not.toContain("update public.inventory_positions"); // never writes inventory_positions directly; only the shared primitive does
    expect(body).not.toContain("update public.shipment_items\n    set reserved_quantity_kg"); // never writes the child reservation column directly
  });

  it("both call sites pass their already-locked shipment item's own id/order_item_id/lot_id, never a client-suppliable value", () => {
    const transition = prosrcOf(migrated.get("validate_shipment_transition")!);
    const settlement = prosrcOf(migrated.get("reserve_ready_deliveries_for_settlement")!);
    expect(transition).toMatch(/apply_delivery_reservation\(\s*v_item\.id, v_item\.order_item_id, v_item\.lot_id, v_order\.buyer_organization_id, v_item\.planned_quantity_kg\s*\)/);
    expect(settlement).toMatch(/apply_delivery_reservation\(\s*v_item\.id, v_item\.order_item_id, v_item\.lot_id, p_buyer_organization_id, v_item\.planned_quantity_kg\s*\)/);
  });
});

describe("HARDENED migration — RUN A2-PRE3: settlement-time reservation hook and its integration", () => {
  it("reserve_ready_deliveries_for_settlement locks READY, not-yet-settled shipments in ascending id order, then their items in ascending id order", () => {
    const body = prosrcOf(migrated.get("reserve_ready_deliveries_for_settlement")!);
    expect(body).toContain("status = 'READY'\n      and settlement_verified_at is null");
    expect(body).toContain("order by id\n    for update");
    expect(body).toContain("order by si.id\n      for update of si");
  });

  it("stamps settlement_verified_at under the trusted app.delivery_settlement_mutation marker, and proves the write actually affected a row", () => {
    const body = prosrcOf(migrated.get("reserve_ready_deliveries_for_settlement")!);
    expect(body).toContain("set_config('app.delivery_settlement_mutation', 'true', true)");
    expect(body).toContain("set_config('app.delivery_settlement_mutation', 'false', true)");
    expect(body).toContain("set settlement_verified_at = now()");
    expect(body).toContain("if not found then\n      raise exception 'delivery_reservation_ledger_inconsistent';");
  });

  it("validate_shipment_transition accepts the trusted settlement-time stamp ONLY when no other locked column changes, and still resets settlement_verified_at for every ordinary client UPDATE", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("v_trusted_settlement_mutation boolean := coalesce(current_setting('app.delivery_settlement_mutation', true), 'false') = 'true';");
    const guardStart = body.indexOf("if v_trusted_settlement_mutation then");
    const guardEnd = body.indexOf("if new.status <> old.status then");
    const guard = body.slice(guardStart, guardEnd);
    expect(guard).toContain("new.status is distinct from old.status");
    expect(guard).toContain("new.delivery_method is distinct from old.delivery_method");
    expect(guard).toContain("new.shipping_fee is distinct from old.shipping_fee");
    expect(guard).toContain("raise exception 'delivery_reservation_ledger_inconsistent';");
    expect(guard).toContain("else\n    new.settlement_verified_at := old.settlement_verified_at;\n  end if;");
  });

  it("settlement failure is fail-closed: the hook is called with no exception handler around it in admin_review_payment, so any raise rolls back the entire payment review", () => {
    const body = prosrcOf(migrated.get("admin_review_payment")!);
    expect(body).not.toMatch(/exception\s+when/i); // no EXCEPTION/WHEN block anywhere that could swallow the hook's raise
    expect(body).not.toContain("begin\n  perform public.reserve_ready_deliveries_for_settlement"); // not wrapped in its own sub-block either
  });

  it("multiple READY shipments cannot over-reserve: each item reservation call re-resolves the live inventory_positions row inside the shared primitive, not a value cached before the loop", () => {
    const settlementBody = prosrcOf(migrated.get("reserve_ready_deliveries_for_settlement")!);
    const primitiveBody = prosrcOf(migrated.get("apply_delivery_reservation")!);
    // the settlement hook loops shipments then items and calls the primitive once per item — it never
    // pre-computes a combined/batched availability figure across shipments itself.
    expect(settlementBody.match(/apply_delivery_reservation/g)).toHaveLength(1);
    expect(primitiveBody).toContain("for update;\n  if v_position.id is null");
  });

  it("both the shipment-transition and settlement-time authorities are documented as the single seam a future Feature 008 settlement path must also call — no second commercial truth", () => {
    expect(migration).toContain("future, still-unbuilt, approved Feature 008 Stripe settlement path MUST call");
    expect(read("specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md")).toContain("Feature 008 integration point");
  });

  it("documents the lock-order inversion between the settlement and shipment-transition paths as a PostgreSQL-deadlock-safe, non-corrupting, known race — not silently eliminated by claim", () => {
    expect(migration).toContain("deadlock_detected");
    expect(migration).toContain("40P01");
    expect(read("specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md")).toContain("Lock order — a genuine, documented, non-corrupting inversion");
  });
});

describe("HARDENED migration — Issue 1/2: inventory arithmetic is correct (available_quantity_kg is the GROSS figure)", () => {
  it("RESERVE never touches available_quantity_kg — only reserved_quantity_kg increases (now inside the shared primitive)", () => {
    const body = prosrcOf(migrated.get("apply_delivery_reservation")!);
    expect(body).toContain("reserved_quantity_kg = reserved_quantity_kg + p_planned_quantity_kg");
    expect(body).not.toMatch(/available_quantity_kg\s*=\s*available_quantity_kg/);
    expect(body).not.toMatch(/set\s+available_quantity_kg/i);
  });

  it("CANCEL/FAIL release NEVER increments available_quantity_kg — only reserved_quantity_kg decreases", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseBlock = body.slice(body.indexOf("if v_releasing then"), body.lastIndexOf("end if;\n\n  end if;\n\n\n  if old.status"));
    expect(releaseBlock).toContain("reserved_quantity_kg = reserved_quantity_kg - v_item.reserved_quantity_kg");
    expect(releaseBlock).not.toMatch(/available_quantity_kg\s*=\s*available_quantity_kg\s*\+/);
    expect(releaseBlock).toContain("NEVER incremented here");
  });

  it("DELIVERY decrements BOTH reserved_quantity_kg AND available_quantity_kg by the newly-delivered amount", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("available_quantity_kg = available_quantity_kg - v_newly_delivered");
    expect(body).toContain("reserved_quantity_kg = reserved_quantity_kg - v_newly_delivered");
  });

  it("DELIVERY also updates storage_allocations.released_quantity_kg/status (Feature 005's own existing custody ledger, not a second model)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("update public.storage_allocations");
    expect(body).toContain("released_quantity_kg = released_quantity_kg + v_newly_delivered");
    expect(body).toContain("when released_quantity_kg + v_newly_delivered >= quantity_kg then 'DELIVERED' else 'RELEASED' end");
  });
});

describe("HARDENED migration — Issue 3/4: settlement_verified_at and reserved_quantity_kg are TRIGGER-OWNED", () => {
  it("validate_shipment_item unconditionally overwrites new.reserved_quantity_kg with old.reserved_quantity_kg (or 0 on INSERT) before any lookup, except the exact guarded child mutation", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    const firstLookup = body.indexOf("select\n    oi.order_id");
    const insertReset = body.indexOf("new.reserved_quantity_kg := 0;");
    const updateReset = body.indexOf("new.reserved_quantity_kg := old.reserved_quantity_kg;");
    expect(insertReset).toBeGreaterThanOrEqual(0);
    expect(insertReset).toBeLessThan(firstLookup);
    expect(updateReset).toBeGreaterThanOrEqual(0);
    expect(updateReset).toBeLessThan(firstLookup);
  });

  it("preflight and postflight both document the blanket authenticated UPDATE grant as the reason this trigger-owned protection is required (not redundant)", () => {
    expect(preflight).toContain("blanket table-level UPDATE grant on shipment_items");
    expect(preflight).toContain("blanket table-level UPDATE grant on order_shipments");
    expect(postflight).toContain("column-tamper protection is trigger-owned, not grant-based");
  });
});

describe("HARDENED migration — A2-PRE2 blockers 1/2: trusted child mutation and IFF ledger coupling (now centralized)", () => {
  it("apply_delivery_reservation uses a transaction-local trusted marker only around the guarded child update; ordinary clients still have their value reset in validate_shipment_item", () => {
    const primitive = prosrcOf(migrated.get("apply_delivery_reservation")!);
    const item = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(primitive).toContain("set_config('app.delivery_reservation_mutation', 'true', true)");
    expect(primitive).toContain("set_config('app.delivery_reservation_mutation', 'false', true)");
    expect(item).toContain("current_setting('app.delivery_reservation_mutation', true)");
    expect(item).toContain("else\n      new.reserved_quantity_kg := old.reserved_quantity_kg;");
    expect(item).toContain("new.delivered_quantity_kg is distinct from old.delivered_quantity_kg");
  });

  it("proves the child guard transition before each inventory mutation inside the shared primitive; a guard miss raises rather than silently continuing", () => {
    const body = prosrcOf(migrated.get("apply_delivery_reservation")!);
    const itemUpdateIdx = body.indexOf("set reserved_quantity_kg = p_planned_quantity_kg");
    const diagnosticsIdx = body.indexOf("get diagnostics v_rows = row_count;");
    const positionUpdateIdx = body.indexOf("if v_rows = 1 then", diagnosticsIdx);
    expect(itemUpdateIdx).toBeGreaterThan(0);
    expect(diagnosticsIdx).toBeGreaterThan(itemUpdateIdx);
    expect(positionUpdateIdx).toBeGreaterThan(diagnosticsIdx);
    expect(body.slice(positionUpdateIdx, positionUpdateIdx + 300)).toContain("reserved_quantity_kg + p_planned_quantity_kg");
  });

  it("cancel/fail release (still inline in validate_shipment_transition — not part of the settlement path) also proves the guard before subtracting from the position", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseStart = body.indexOf("v_releasing :=");
    const release = body.slice(releaseStart);
    expect(release.indexOf("set reserved_quantity_kg = 0")).toBeLessThan(release.indexOf("reserved_quantity_kg = reserved_quantity_kg - v_item.reserved_quantity_kg"));
    expect(release).toContain("if v_rows <> 1 then\n          raise exception 'delivery_reservation_ledger_inconsistent';");
  });
});

describe("HARDENED migration — Issue 6/9: fail-closed on missing/ambiguous allocation or position (never silently skip)", () => {
  it("the shared reservation primitive COUNTs storage_allocations first and raises a distinct exception for zero vs. more-than-one match", () => {
    const body = prosrcOf(migrated.get("apply_delivery_reservation")!);
    expect(body).toMatch(/select count\(\*\) into v_alloc_count[\s\S]*?if v_alloc_count = 0 then\s+raise exception 'delivery_reservation_position_missing';\s+elsif v_alloc_count > 1 then\s+raise exception 'delivery_reservation_position_ambiguous';/);
  });

  it("the cancel/fail release path also fails closed on a missing inventory_positions row (raises, never silently continues)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseBlock = body.slice(body.indexOf("if v_releasing then"));
    expect(releaseBlock).toContain("if v_position.id is null then\n          raise exception 'delivery_release_position_missing';");
  });

  it("the delivery-write release path in validate_shipment_item also fails closed on a missing allocation or position", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("if v_alloc_count = 0 then\n          raise exception 'delivery_release_position_missing';\n        elsif v_alloc_count > 1 then\n          raise exception 'delivery_reservation_position_ambiguous';");
    expect(body).toContain("if v_position.id is null then\n          raise exception 'delivery_release_position_missing';");
  });

  it("inventory_positions lookups do NOT need a COUNT ambiguity guard (schema-unique), but storage_allocations lookups DO have one everywhere they occur (3 places: the shared primitive, cancel/fail release, and delivery-write release)", () => {
    const primitiveBody = prosrcOf(migrated.get("apply_delivery_reservation")!);
    const transitionBody = prosrcOf(migrated.get("validate_shipment_transition")!);
    const itemBody = prosrcOf(migrated.get("validate_shipment_item")!);
    const allocCountOccurrences = (primitiveBody.match(/select count\(\*\) into v_alloc_count/g) ?? []).length + (transitionBody.match(/select count\(\*\) into v_alloc_count/g) ?? []).length + (itemBody.match(/select count\(\*\) into v_alloc_count/g) ?? []).length;
    expect(allocCountOccurrences).toBe(3);
  });
});

describe("HARDENED migration — Issue 7: explicit invariant checks before subtraction, never a bare greatest() clamp as the sole mechanism", () => {
  it("cancel/fail release asserts reserved_quantity_kg is sufficient before subtracting (no greatest() clamp used at all here)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseBlock = body.slice(body.indexOf("if v_releasing then"));
    expect(releaseBlock).toContain("if v_position.reserved_quantity_kg < v_item.reserved_quantity_kg then\n          raise exception 'delivery_reservation_ledger_inconsistent';");
    expect(releaseBlock).not.toContain("greatest(");
  });

  it("the shared reservation primitive asserts sufficient free quantity before reserving (no greatest() clamp)", () => {
    const body = prosrcOf(migrated.get("apply_delivery_reservation")!);
    expect(body).toContain("(v_position.available_quantity_kg - v_position.reserved_quantity_kg) < p_planned_quantity_kg");
    expect(body).not.toContain("greatest(");
  });

  it("delivery release asserts both the shipment-item and position reserved amounts are sufficient before subtracting (no greatest() clamp)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("if old.reserved_quantity_kg < v_newly_delivered then\n          raise exception 'delivery_reservation_ledger_inconsistent';");
    expect(body).toContain("if v_position.reserved_quantity_kg < v_newly_delivered\n           or v_position.available_quantity_kg < v_newly_delivered\n        then\n          raise exception 'delivery_reservation_ledger_inconsistent';");
    expect(body).not.toContain("greatest(");
  });
});

describe("HARDENED migration — Issue 8: READY is gated ONLY on an already-settled order (state-aware, not global)", () => {
  it("v_newly_gated includes READY only when old.status <> READY AND v_settled is true", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("or (new.status = 'READY' and old.status <> 'READY' and v_settled);");
  });

  it("v_settled is computed from a freshly-locked live read of orders.status, every invocation — never a cached/client value", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("select * into v_order from public.orders where id = new.order_id for update;");
    expect(body).toContain("v_settled := v_order.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED');");
  });

  it("Feature 007's own live-tested pre-payment path is documented as the proof this rule does not regress it", () => {
    expect(migration).toContain("markShipmentReadyAsWarehouse");
  });
});

describe("HARDENED migration — Issue 11: live re-check of settlement on every further gated progression", () => {
  it("an already-gated shipment progressing further (not into CANCELLED/FAILED) re-verifies v_settled, refusing with the same exception if the order left the settled family", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const elseBlockStart = body.indexOf("elsif v_already_gated");
    const elseBlockEnd = body.indexOf("v_releasing :=");
    const elseBlock = body.slice(elseBlockStart, elseBlockEnd);
    expect(elseBlock).toContain("new.status <> old.status");
    expect(elseBlock).toContain("new.status not in ('CANCELLED', 'FAILED', 'DISPUTED')");
    expect(elseBlock).toContain("if not v_settled then\n        raise exception 'delivery_reservation_requires_settled_order';");
  });
});

describe("HARDENED migration — A2-PRE2 blockers 4/5/7: legacy rows, READY re-entry, and recovery", () => {
  it("entering DISPUTED does not appear in the release condition (freeze — reservation is never released merely by disputing)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    const releaseCondition = body.slice(body.indexOf("v_releasing :="), body.indexOf("v_releasing :=") + 200);
    expect(releaseCondition).toContain("new.status in ('CANCELLED', 'FAILED')");
    expect(releaseCondition).not.toContain("DISPUTED");
  });

  it("FAILED and DISPUTED cannot re-enter without a future explicit recovery workflow, preventing a partial delivery from reserving its full planned quantity", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body).toContain("elsif old.status in ('FAILED', 'DISPUTED') then\n      raise exception 'delivery_recovery_requires_dedicated_workflow';");
    expect(migration).toContain("remaining (not planned) quantity");
  });

  it("preserves every former baseline transition rule and adds only the safe FAILED/DISPUTED stop", () => {
    const baseline = prosrcOf(baselineDefinition("validate_shipment_transition"));
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    for (const status of ["DRAFT", "REQUESTED", "CAPACITY_CONFIRMED", "READY", "RESERVED", "PICKING", "BOOKED", "DISPATCHED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"]) {
      expect(baseline).toContain(`'${status}'`);
      expect(body).toContain(`'${status}'`);
    }
    expect(body).toContain("delivery_recovery_requires_dedicated_workflow");
  });

  it("requires a zero-row reconciliation gate for settled-READY/operational-gated-set rows and their remaining child items, while explicitly PERMITTING unsettled READY (the corrected RUN A2-PRE3 policy, not the old blanket zero)", () => {
    expect(preflight).toContain("MANDATORY — zero existing settled READY rows");
    expect(preflight).toContain("MANDATORY — zero existing operational gated-set rows");
    expect(preflight).toContain("MANDATORY — zero shipment_items requiring reconciliation");
    expect(preflight).toContain("INFORMATIONAL (NOT a stop condition) — existing unsettled READY rows");
    expect(migration).toContain("existing settled-READY or operational-gated shipment rows");
    expect(migration).not.toContain("existing READY/gated shipment rows or remaining shipment_items require an approved reconciliation"); // the old blanket A2-PRE2 wording is gone
  });

  it("distinguishes an all-unreserved shipment from an all-reserved/frozen shipment before availability checks, so READY re-entry never double-gates itself", () => {
    const body = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(body.indexOf("if v_unreserved_count = v_item_count then")).toBeGreaterThan(body.indexOf("v_unreserved_count := v_unreserved_count + 1;"));
    expect(body).toContain("v_unreserved_count > 0 and v_reserved_count > 0");
    expect(body).toContain("Do not repeat availability");
  });
});

describe("HARDENED migration — delivery-write release logic preserves every existing validate_shipment_item rule", () => {
  it("every existing rule (order/shipment match, DRAFT-only edits, warehouse-only delivery, no decrease, over-plan, cross-item sum) is preserved verbatim", () => {
    const baseline = prosrcOf(baselineDefinition("validate_shipment_item"));
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    for (const exception of ["shipment_or_order_item_missing", "shipment_order_item_mismatch", "shipment_plan_is_closed", "only_warehouse_can_record_delivery", "delivered_quantity_cannot_decrease", "delivered_quantity_exceeds_plan", "shipment_plan_exceeds_order_item"]) {
      expect(baseline, exception).toContain(exception);
      expect(body, exception).toContain(exception);
    }
  });

  it("cannot use a direct delivered-quantity write to bypass settlement: it locks the order after the implicit item lock and requires a stored gate plus a currently settled order", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(body).toContain("where id = v_item_order_id\n  for update;");
    expect(body).toContain("v_shipment_settlement_verified_at is null");
    expect(body).toContain("v_order_status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')");
    expect(body).toContain("raise exception 'delivery_reservation_requires_settled_order';");
  });

  it("is UNCHANGED since RUN A2-PRE2 — no edit was needed for RUN A2-PRE3 (byte-identical body)", () => {
    const body = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(md5(body)).toBe("3ec3db2cd692958b2ad6d9ec5d15eb88");
  });
});

describe("HARDENED migration — buyer-cancel RLS widening (DB-OPEN-18)", () => {
  it("shipments_buyer_draft_update's USING expression is unchanged; only WITH CHECK gains CANCELLED", () => {
    expect(migration).toContain("with check (status in ('DRAFT', 'REQUESTED', 'CANCELLED'));");
    expect(migration).toContain("status = 'DRAFT'\n    and exists (\n      select 1\n      from public.orders o\n      join public.organization_members om on om.organization_id = o.buyer_organization_id\n      where o.id = order_shipments.order_id\n        and om.user_id = auth.uid()\n        and om.is_active = true\n    )");
  });
});

describe("HARDENED migration — A2-PRE2 blocker 3: actual lock order", () => {
  it("locks the shipment row implicitly, then items in id order, order, and finally each inventory position; direct delivery uses the same item-to-order-to-position suffix", () => {
    const transition = prosrcOf(migrated.get("validate_shipment_transition")!);
    const item = prosrcOf(migrated.get("validate_shipment_item")!);
    expect(transition.indexOf("for update\n    loop\n      v_item_count")).toBeLessThan(transition.indexOf("where id = new.order_id for update;"));
    expect(transition).toContain("order by si.id\n      for update");
    expect(transition.indexOf("for update of si")).toBeLessThan(transition.indexOf("elsif v_already_gated"));
    expect(item).toContain("for update;");
    expect(migration).toContain("A direct delivery UPDATE implicitly locks its item");
    expect(read("specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md")).toContain("then locks the same order and position");
  });
});

describe("BUG A/B regressions — the two SQL-Editor-only execution failures a live preflight run found (not catchable by mere text-presence assertions)", () => {
  it("BUG A: every UNION/UNION ALL statement in preflight.sql and postflight.sql has equal column counts across all its branches (a real PostgreSQL parser rejects a mismatch; a text-pattern test alone cannot catch this)", () => {
    for (const [label, sql] of [
      ["preflight", preflight],
      ["postflight", postflight],
    ] as const) {
      // Neutralize string literals FIRST — check_name/expected/actual text routinely contains commas,
      // parens, and the word "from" inside quotes, which would otherwise corrupt a structural scan.
      const code = neutralizeStringLiterals(stripSqlComments(sql));
      // Split into individual top-level statements on ';', then within each statement look for a
      // select...union all...select chain and verify every branch has the same column count.
      for (const statement of code.split(";")) {
        if (!/\bunion\s+all\b/i.test(statement)) continue;
        const branches = unionBranches(statement).map((b) => b.trim()).filter((b) => /^select\b/i.test(b));
        if (branches.length < 2) continue;
        const counts = branches.map((b) => {
          // isolate just the projection list: text between "select" and the first top-level "from"
          const afterSelect = b.replace(/^select\s+/i, "");
          let depth = 0;
          let fromIdx = -1;
          for (let i = 0; i < afterSelect.length; i += 1) {
            const ch = afterSelect[i];
            if (ch === "(") depth += 1;
            else if (ch === ")") depth -= 1;
            else if (depth === 0 && /\bfrom\b/i.test(afterSelect.slice(i, i + 4)) && (i === 0 || /\s/.test(afterSelect[i - 1]!)) && /\s/.test(afterSelect[i + 4] ?? " ")) {
              fromIdx = i;
              break;
            }
          }
          const projection = fromIdx >= 0 ? afterSelect.slice(0, fromIdx) : afterSelect;
          return columnCount(projection);
        });
        const distinct = new Set(counts);
        expect(distinct.size, `${label}: union branch column-count mismatch (${counts.join(", ")}) in statement starting "${statement.trim().slice(0, 80)}..."`).toBe(1);
      }
    }
  });

  it("BUG A regression anchor: preflight section 2's policy/table_privilege/function_privilege branches are all 7 columns", () => {
    expect(preflight).toContain("select 'policy' as kind, pol.tablename, pol.policyname as name, pol.cmd as command, array_to_string(pol.roles, ',') as roles, pol.qual as using_expression, pol.with_check");
    expect(preflight).toContain("select 'table_privilege', g.table_name, g.grantee, g.privilege_type, null, null, null");
    expect(preflight).toContain("select 'function_privilege', g.routine_name, g.grantee, g.privilege_type, null, null, null");
  });

  it("BUG B: every reference to pg_trigger.tgenabled that is CONCATENATED with '||' carries an explicit ::text cast (a real PostgreSQL server rejects text || \"char\" with no implicit cast; a bare string-comparison use of tgenabled, e.g. \"= 'O'\", does not need the cast and is not flagged)", () => {
    for (const [label, sql] of [
      ["preflight", preflight],
      ["postflight", postflight],
      ["migration", migration],
      ["rollback", rollback],
    ] as const) {
      const code = stripSqlComments(sql);
      for (const match of code.matchAll(/\|\|\s*t\.tgenabled\b/g)) {
        const tail = code.slice(match.index!, match.index! + match[0].length + 6);
        expect(tail, `${label}: concatenated tgenabled without ::text cast near "${tail}"`).toMatch(/t\.tgenabled::text/);
      }
    }
  });

  it("BUG B regression anchor: preflight and postflight both use the exact ::text cast form at their tgenabled concatenation sites", () => {
    expect(preflight.match(/t\.tgenabled::text/g)?.length).toBeGreaterThanOrEqual(2);
    expect(postflight.match(/t\.tgenabled::text/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("HARDENED rollback — exact, guarded reversal, PLUS the Issue 16 real-usage safety guard", () => {
  it("aborts unless all three functions (validate_shipment_transition, validate_shipment_item, admin_review_payment) AND both new helper functions carry exactly their migrated fingerprints, and the new columns are present", () => {
    const guard = rollback.slice(rollback.indexOf("do $guard$"), rollback.indexOf("$guard$;"));
    for (const [name, definition] of migrated) {
      expect(guard, name).toContain(`p.proname = '${name}'`);
      expect(guard, name).toContain(`'${md5(prosrcOf(definition))}'`);
    }
    expect(guard).toContain("shipment_items' and column_name = 'reserved_quantity_kg'");
    expect(guard).toContain("order_shipments' and column_name = 'settlement_verified_at'");
    expect(guard).toMatch(/raise exception 'feature_009_db_block_07 rollback guard failed — nothing reverted: %'/);
    expect(stripSqlComments(rollback).indexOf("do $guard$")).toBeLessThan(stripSqlComments(rollback).indexOf("drop column"));
  });

  it("refuses to run if ANY row shows real reservation history (shipment_items.reserved_quantity_kg > 0 or order_shipments.settlement_verified_at set — exhaustive over BOTH the shipment-transition and settlement-time origins, since both write the same two columns) — DB-enforced, not just a comment", () => {
    const guard = rollback.slice(rollback.indexOf("do $guard$"), rollback.indexOf("$guard$;"));
    expect(guard).toContain("select count(*) into v_reserved_rows from public.shipment_items where reserved_quantity_kg > 0;");
    expect(guard).toContain("select count(*) into v_gated_rows from public.order_shipments where settlement_verified_at is not null;");
    expect(guard).toContain("v_reserved_rows > 0 or v_gated_rows > 0");
    expect(rollback).toContain("BUSINESS DATA reversal");
    expect(rollback).toContain("separately authored, reviewed, COMPENSATING migration");
  });

  it("restores validate_shipment_transition, validate_shipment_item, and admin_review_payment to their exact byte-for-byte pre-migration baselines, and drops exactly the two new helper functions AFTER those functions no longer reference them", () => {
    const body = stripSqlComments(rollback);
    expect(body.match(/drop column/g)).toHaveLength(2);
    expect(body).toContain("drop column reserved_quantity_kg;");
    expect(body).toContain("drop column settlement_verified_at;");
    expect([...restored.keys()].sort()).toEqual(["admin_review_payment", "validate_shipment_item", "validate_shipment_transition"]);
    for (const name of restored.keys()) {
      expect(restored.get(name), name).toBe(baselineDefinition(name).trim());
    }
    expect(body).toContain("with check (status in ('DRAFT', 'REQUESTED'));");
    expect(body).not.toContain("'CANCELLED'));");

    const adminRestoreIdx = body.indexOf("CREATE OR REPLACE FUNCTION public.admin_review_payment");
    const dropApplyIdx = body.indexOf("drop function public.apply_delivery_reservation");
    const dropSettleIdx = body.indexOf("drop function public.reserve_ready_deliveries_for_settlement");
    expect(adminRestoreIdx).toBeGreaterThan(0);
    expect(dropApplyIdx).toBeGreaterThan(adminRestoreIdx);
    expect(dropSettleIdx).toBeGreaterThan(adminRestoreIdx);
    expect(body).toContain("drop function public.apply_delivery_reservation(uuid, uuid, uuid, uuid, numeric);");
    expect(body).toContain("drop function public.reserve_ready_deliveries_for_settlement(uuid, uuid);");
  });
});

describe("HARDENED preflight — strictly read-only, and proves every assumption the corrected migration depends on", () => {
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

  it("proves the inventory semantics assumption (reserved <= available CHECK), the inventory_positions uniqueness guarantee, and the storage_allocations ambiguity risk that justifies the migration's own COUNT guard", () => {
    expect(preflight).toContain("inventory_reserved_within_available_check");
    expect(preflight).toContain("proving at most one row per (lot, owner, warehouse, location)");
    expect(preflight).toContain("storage_allocations has NO unique constraint");
  });

  it("proves the blanket UPDATE grants that justify the column-tamper (trigger-owned) protection", () => {
    expect(preflight).toContain("blanket table-level UPDATE grant on shipment_items");
    expect(preflight).toContain("blanket table-level UPDATE grant on order_shipments");
  });

  it("checks for pre-existing ambiguous storage_allocations groups and pre-existing ledger-health violations", () => {
    expect(preflight).toContain("no duplicate/ambiguous storage_allocations rows exist today");
    expect(preflight).toContain("no storage_allocations row currently has released_quantity_kg > quantity_kg");
  });

  it("the summary checks every assumption the migration's guard enforces, including the new admin_review_payment baseline and both new helper functions' absence", () => {
    for (const expected of ["validate_shipment_transition: exactly one overload", "validate_shipment_transition: body matches the baseline", "validate_shipment_item: body matches the baseline", "admin_review_payment: exactly one overload", "apply_delivery_reservation does not exist yet", "reserve_ready_deliveries_for_settlement does not exist yet", "trg_shipment_transition: exact enabled BEFORE UPDATE-only baseline binding", "trg_shipment_item_validate: exact enabled BEFORE INSERT OR UPDATE baseline binding", "shipment_items.reserved_quantity_kg does not exist yet", "order_shipments.settlement_verified_at does not exist yet", "no existing function references the planned draft exception strings", "no inventory_positions row currently has a negative"]) {
      expect(preflight).toContain(expected);
    }
  });

  it("proves the actual live INSERT authority and makes the forward trigger binding enforce a null diagnostic on insertion", () => {
    expect(preflight).toContain("shipments_buyer_insert");
    expect(preflight).toContain("trg_shipment_transition");
    expect(migration).toContain("before insert or update on public.order_shipments");
    const transition = prosrcOf(migrated.get("validate_shipment_transition")!);
    expect(transition).toContain("if tg_op = 'INSERT' then\n    new.settlement_verified_at := null;");
    expect(transition).toContain("raise exception 'shipment_must_start_draft';");
  });

  it("the existing-row gate is the CORRECTED RUN A2-PRE3 policy: settled-READY and operational-gated-set are mandatory zero; unsettled READY is explicitly informational, never gated", () => {
    expect(preflight).toContain("MANDATORY — zero existing settled READY rows");
    expect(preflight).toContain("MANDATORY — zero existing operational gated-set rows (CAPACITY_CONFIRMED/RESERVED/PICKING/BOOKED/DISPATCHED/PARTIALLY_DELIVERED), REGARDLESS of settlement");
    expect(preflight).toContain("INFORMATIONAL (NOT a stop condition) — existing unsettled READY rows");
    expect(preflight).toContain("reserve_ready_deliveries_for_settlement(...), called from admin_review_payment(), will reserve them atomically");
  });
});

describe("NEW postflight — strictly read-only, verifies the applied state, and documents the SQL-only vs. seeded-integration-test split", () => {
  it("contains only SELECT/WITH statements over catalogs and application tables", () => {
    const code = stripSqlComments(postflight).replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|comment|vacuum|analyze|copy|call|begin|commit|rollback|lock)\b/i);
    expect(code).not.toMatch(/\bdo\s+\$/i);
  });

  it("checks the post-apply fingerprints match the migration's own computed values for every function, including admin_review_payment and both new helpers", () => {
    for (const [name, definition] of migrated) {
      expect(postflight, name).toContain(`'${md5(prosrcOf(definition))}'`);
    }
  });

  it("checks both new helper functions carry NO authenticated/anon/PUBLIC EXECUTE grant (internal-only, matching the migration's own REVOKE)", () => {
    expect(postflight).toContain("apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement') and g.grantee in ('authenticated', 'anon', 'PUBLIC')");
  });

  it("checks the post-apply trigger binding needed for INSERT tamper protection, not function source alone", () => {
    expect(postflight).toContain("trg_shipment_transition is enabled BEFORE INSERT OR UPDATE");
    expect(postflight).toContain("trg_shipment_item_validate remains enabled BEFORE INSERT OR UPDATE");
    expect(postflight).toContain("pg_get_triggerdef");
  });

  it("documents which behaviors require a seeded live session rather than a read-only postflight query, including the RUN A2-PRE3 settlement-hook-specific items", () => {
    expect(postflight).toContain("REQUIRES A SEEDED LIVE SESSION");
    expect(postflight).toContain("column-tamper protection");
    expect(postflight).toContain("RUN A2-PRE3: a shipment already READY while its order is unsettled becomes reserved");
    expect(postflight).toContain("the ENTIRE admin_review_payment()");
    expect(postflight).toContain("call rolls back");
    expect(postflight).toContain("two READY shipments drawing on the same inventory_positions row cannot both be");
    expect(postflight).toContain("clean PostgreSQL deadlock abort on exactly one side");
  });

  it("the rollback file's own guard documents the real-usage safety check (Issue 16), not the postflight file", () => {
    expect(rollback).toContain("REAL-USAGE GUARD");
  });
});

describe("DRAFT files are not live migrations", () => {
  it("live under supabase/maintenance/, not supabase/migrations/ — this project's own convention keeps migrations/ as APPLIED history only", () => {
    expect(MIGRATION.startsWith("supabase/maintenance/")).toBe(true);
    expect(ROLLBACK.startsWith("supabase/maintenance/")).toBe(true);
    expect(POSTFLIGHT.startsWith("supabase/maintenance/")).toBe(true);
    expect(MIGRATION).toContain(".DRAFT.");
  });

  it("all DRAFT/preflight/postflight files carry an explicit not-yet-applied or read-only-only warning at the top", () => {
    expect(migration.slice(0, 400)).toMatch(/DRAFT — NOT YET APPLIED/);
    expect(rollback.slice(0, 400)).toMatch(/DRAFT/);
    expect(preflight.slice(0, 400)).toMatch(/READ-ONLY/);
    expect(postflight.slice(0, 400)).toMatch(/READ-ONLY/);
  });
});
