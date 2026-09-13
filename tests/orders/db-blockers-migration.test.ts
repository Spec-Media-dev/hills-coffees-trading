import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 007 DB blocker run — STATIC review of the hardened migration, its rollback and the read-only
 * preflight (no database access). Proves the properties the manual reviewer relies on before anything
 * is applied: abort-on-mismatch guard first, minimal diffs against the verified baseline bodies, the
 * checkout-only reservation marker, non-enumerating RPC/expiry refusals, explicit EXECUTE ACLs, an
 * exact guarded rollback and a write-free preflight.
 */
const MIGRATION = "supabase/migrations/20260913100000_feature_007_db_blockers.sql";
const ROLLBACK = "supabase/migrations/20260913100000_feature_007_db_blockers.rollback.sql";
const PREFLIGHT = "supabase/maintenance/20260913_feature_007_db_blockers_preflight.sql";
const MARKER = "app.checkout_reservation";

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

/** Every `CREATE OR REPLACE FUNCTION public.<name>(…) … $function$…$function$` in a script, by name. */
function functionsIn(sql: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\([\s\S]*?AS \$function\$[\s\S]*?\$function\$/g)) {
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

describe("hardened migration — guard, scope and minimal diffs", () => {
  it("opens a transaction and runs the abort-on-mismatch guard BEFORE any function is created, and changes exactly five functions and no table/policy/grant on a table", () => {
    const body = stripSqlComments(migration);
    const begin = body.indexOf("begin;");
    const guard = body.indexOf("do $guard$");
    const firstCreate = body.indexOf("CREATE OR REPLACE FUNCTION");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(begin);
    expect(firstCreate).toBeGreaterThan(guard);
    expect(body).toMatch(/raise exception 'feature_007_db_blockers preflight failed — nothing applied: %'/);
    expect(body.trimEnd().endsWith("commit;")).toBe(true);

    expect([...migrated.keys()].sort()).toEqual(["checkout_order", "expire_order_hold", "remove_order_item", "update_order_item_quantity", "validate_offer_transition"]);
    expect(body).not.toMatch(/\b(create|alter|drop)\s+(table|policy|index|trigger|view)\b/i);
    expect(body).not.toMatch(/\bon\s+(table\s+)?public\.[a-z_]+\s+(to|from)\b/i); // no table-level GRANT/REVOKE
    expect(body).not.toMatch(/\bdisable\s+row\s+level\s+security\b/i);
  });

  it("the guard's baseline fingerprints are the md5 of the verified baseline bodies (report), and it also verifies triggers, helpers, the FK cascade, the unused marker, absent RPCs and the EXECUTE ACLs", () => {
    for (const name of ["checkout_order", "expire_order_hold", "validate_offer_transition"]) {
      const fingerprint = md5(prosrcOf(baselineDefinition(name)));
      expect(migration, name).toContain(`v_fp is distinct from '${fingerprint}'`);
      expect(preflight, name).toContain(`'${fingerprint}'`);
    }
    const guard = migration.slice(migration.indexOf("do $guard$"), migration.indexOf("$guard$;"));
    expect(guard).toMatch(/trg_offer_transition/);
    expect(guard).toMatch(/trg_order_item_offer/);
    expect(guard).toMatch(/shipment_items_order_item_id_fkey.*confdeltype = 'c'/);
    expect(guard).toContain(`p.prosrc like '%${MARKER}%'`);
    expect(guard).toMatch(/proname in \('update_order_item_quantity', 'remove_order_item'\)/);
    expect(guard).toMatch(/has_function_privilege\('anon', v_oid, 'EXECUTE'\)/);
    expect(guard).toMatch(/a\.grantee = 0 and a\.privilege_type = 'EXECUTE'/);
  });

  it("checkout_order differs from the baseline ONLY by setting the marker immediately before its listing-mirror UPDATE and clearing it immediately after", () => {
    const body = prosrcOf(migrated.get("checkout_order")!);
    expect(body.match(new RegExp(`set_config\\('${MARKER.replace(".", "\\.")}', 'true', true\\)`, "g"))).toHaveLength(1);
    expect(body).toMatch(
      /perform set_config\('app\.checkout_reservation', 'true', true\);\n\n    update public\.coffee_offers\n    set\n      reserved_quantity_kg =\n        reserved_quantity_kg\n        \+ v_order_item\.quantity_kg\n    where id = v_offer\.id;\n\n    perform set_config\('app\.checkout_reservation', 'false', true\);/
    );
    const withoutChange = body
      .replace(/    -- Feature 007 DB blocker run \(DB-OPEN-16\)[\s\S]*?perform set_config\('app\.checkout_reservation', 'true', true\);\n\n/, "")
      .replace(/\n\n    perform set_config\('app\.checkout_reservation', 'false', true\);/, "");
    expect(withoutChange).toBe(prosrcOf(baselineDefinition("checkout_order")));
  });

  it("validate_offer_transition's exemption requires the checkout marker AND the reservation-only shape; nothing else in the trigger changed", () => {
    const body = prosrcOf(migrated.get("validate_offer_transition")!);
    const exemption = body.slice(body.indexOf("and not ("), body.indexOf("raise exception 'cannot_publish_empty_listing'"));
    expect(exemption).toContain("tg_op = 'UPDATE'");
    expect(exemption).toContain(`coalesce(current_setting('${MARKER}', true), 'false') = 'true'`);
    expect(exemption).toContain("new.status = old.status");
    expect(exemption).toContain("new.quantity_kg = old.quantity_kg");
    expect(exemption).toContain("new.filled_quantity_kg = old.filled_quantity_kg");
    expect(exemption).toContain("new.reserved_quantity_kg > old.reserved_quantity_kg");
    expect(exemption.split(" and ").length).toBeGreaterThanOrEqual(6); // every condition is AND-ed; no OR escape
    expect(exemption).not.toMatch(/\bor\b/);

    const withoutChange = body
      .replace(/  -- Feature 007 DB blocker run \(DB-OPEN-16\)[\s\S]*?changed here — reservation is not fill\.\n/, "")
      .replace(/  and not \(\n    tg_op = 'UPDATE'[\s\S]*?new\.reserved_quantity_kg > old\.reserved_quantity_kg\n  \)\n/, "");
    expect(withoutChange).toBe(prosrcOf(baselineDefinition("validate_offer_transition")));
  });

  it("only checkout_order sets the marker to 'true'; the trigger only reads it; no other migrated function mentions it", () => {
    for (const [name, definition] of migrated) {
      const setsTrue = definition.includes(`set_config('${MARKER}', 'true'`);
      expect(setsTrue, name).toBe(name === "checkout_order");
      if (!["checkout_order", "validate_offer_transition"].includes(name)) expect(definition, name).not.toContain(MARKER);
    }
    // The trigger's own comment names set_config to explain why clients cannot reach it; CODE never calls it.
    expect(stripSqlComments(prosrcOf(migrated.get("validate_offer_transition")!))).not.toMatch(/set_config/);
  });
});

describe("hardened migration — non-enumerating refusals", () => {
  it.each(["update_order_item_quantity", "remove_order_item"])("%s resolves the item ONLY through the caller's buyer membership and raises one generic 'order_item_not_found' before any state-specific refusal; it never raises 'forbidden'", (name) => {
    const body = prosrcOf(migrated.get(name)!);
    expect(body).toMatch(/from public\.order_items oi\n  join public\.orders o on o\.id = oi\.order_id\n  where oi\.id = p_order_item_id\n    and public\.is_org_member\(o\.buyer_organization_id\);/);
    expect(body).not.toMatch(/'forbidden'/);
    const notFound = body.indexOf("raise exception 'order_item_not_found'");
    expect(notFound).toBeGreaterThan(0);
    for (const specific of ["order_items_can_only_change_in_draft", "buyer_not_authorized", "order_item_on_closed_shipment_plan", "order_item_quantity_below_shipment_plan"]) {
      const at = body.indexOf(`raise exception '${specific}'`);
      if (at >= 0) expect(at, specific).toBeGreaterThan(notFound);
    }
    // No other lookup of order_items/orders happens before the membership-scoped one.
    const beforeLookup = body.slice(0, body.indexOf("from public.order_items oi"));
    expect(beforeLookup).not.toMatch(/from public\.(order_items|orders)\b/);
  });

  it("expire_order_hold answers an end-user caller's nonexistent AND foreign order with the same 'order_not_found' before touching any reservation, and never raises 'forbidden'; the rest of the body is the baseline", () => {
    const body = prosrcOf(migrated.get("expire_order_hold")!);
    expect(body).not.toMatch(/'forbidden'/);
    expect(body).toMatch(/if auth\.uid\(\) is not null\n     and \(\n       v_buyer_organization_id is null\n       or \(\n         not public\.is_org_member\(v_buyer_organization_id\)\n         and not public\.is_platform_admin\(\)\n       \)\n     \)\n  then\n    raise exception 'order_not_found';/);
    expect(body.indexOf("raise exception 'order_not_found'")).toBeLessThan(body.indexOf("from public.inventory_reservations"));

    const withoutChange = body
      .replace("  v_buyer_organization_id uuid;\n", "")
      .replace(/\n  -- Feature 007 DB blocker run: caller authorization[\s\S]*?if v_buyer_organization_id is null then\n    return;\n  end if;\n\n/, "");
    expect(withoutChange).toBe(prosrcOf(baselineDefinition("expire_order_hold")));
  });
});

describe("hardened migration — explicit EXECUTE ACLs", () => {
  it.each([
    ["expire_order_hold", "uuid"],
    ["checkout_order", "uuid"],
    ["update_order_item_quantity", "uuid, numeric"],
    ["remove_order_item", "uuid"],
  ])("%s: REVOKE ALL from public, anon then GRANT EXECUTE to authenticated, service_role — after its CREATE", (name, args) => {
    const revoke = `revoke all on function public.${name}(${args}) from public, anon;`;
    const grant = `grant execute on function public.${name}(${args}) to authenticated, service_role;`;
    const create = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(migration.indexOf(revoke)).toBeGreaterThan(create);
    expect(migration.indexOf(grant)).toBeGreaterThan(migration.indexOf(revoke));
  });

  it("nothing is ever granted to anon or PUBLIC", () => {
    expect(stripSqlComments(migration)).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
    expect(stripSqlComments(rollback)).not.toMatch(/grant[^;]*\bto\b[^;]*\b(anon|public)\b/i);
  });
});

describe("rollback — exact, guarded reversal", () => {
  it("aborts unless all five functions carry exactly the migrated bodies (fingerprints computed from the migration itself)", () => {
    const guard = rollback.slice(rollback.indexOf("do $guard$"), rollback.indexOf("$guard$;"));
    for (const [name, definition] of migrated) {
      expect(guard, name).toContain(`p.proname = '${name}'`);
      expect(guard, name).toContain(`v_fp is distinct from '${md5(prosrcOf(definition))}'`);
    }
    expect(guard).toMatch(/raise exception 'feature_007_db_blockers rollback guard failed — nothing reverted: %'/);
    expect(stripSqlComments(rollback).indexOf("do $guard$")).toBeLessThan(stripSqlComments(rollback).indexOf("drop function"));
  });

  it("drops exactly the two new RPCs and restores the three baseline bodies byte-for-byte (CR removed) plus the verified ACLs", () => {
    const body = stripSqlComments(rollback);
    expect(body.match(/drop function/g)).toHaveLength(2);
    expect(body).toContain("drop function public.remove_order_item(uuid);");
    expect(body).toContain("drop function public.update_order_item_quantity(uuid, numeric);");
    expect([...restored.keys()].sort()).toEqual(["checkout_order", "expire_order_hold", "validate_offer_transition"]);
    for (const name of restored.keys()) {
      expect(restored.get(name), name).toBe(baselineDefinition(name).trim());
    }
    for (const name of ["checkout_order", "expire_order_hold"]) {
      expect(body).toContain(`revoke all on function public.${name}(uuid) from public, anon;`);
      expect(body).toContain(`grant execute on function public.${name}(uuid) to authenticated, service_role;`);
    }
    expect(body).not.toMatch(/validate_offer_transition\(\)\s+(from|to)\b/); // its ACL was never changed
  });
});

describe("preflight — strictly read-only", () => {
  it("contains only SELECT/WITH statements over catalogs: no DML, DDL, GRANT/REVOKE, DO blocks, transactions or set_config", () => {
    const code = stripSqlComments(preflight).replace(/'(?:[^']|'')*'/g, "''");
    expect(code).not.toMatch(/\b(insert|update|delete|merge|truncate|create|alter|drop|grant|revoke|comment|vacuum|analyze|copy|call|begin|commit|rollback|lock)\b/i);
    expect(code).not.toMatch(/\bdo\s+\$/i);
    expect(code).not.toMatch(/set_config|pg_advisory|nextval|setval/i);
    const statements = code
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements.length).toBe(3);
    for (const statement of statements) expect(statement).toMatch(/^(select|with)\b/i);
  });

  it("the summary checks every assumption the migration's guard enforces", () => {
    for (const expected of [
      "checkout_order: exactly one overload",
      "checkout_order: body matches the baseline",
      "expire_order_hold: body matches the baseline",
      "validate_offer_transition: body matches the baseline",
      "checkout_order: EXECUTE ACL",
      "expire_order_hold: EXECUTE ACL",
      "update_order_item_quantity does not exist yet",
      "remove_order_item does not exist yet",
      `marker ${MARKER} is not referenced`,
      "trigger trg_offer_transition",
      "trigger trg_order_item_offer",
      "helpers is_org_member",
      "shipment_items.order_item_id FK is ON DELETE CASCADE",
      "coffee_offers UPDATE policies",
    ]) {
      expect(preflight).toContain(expected);
    }
  });
});
