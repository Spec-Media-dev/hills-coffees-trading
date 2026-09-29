import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { C15_BODY_MD5 } from "../t056-rls-proof";
import { CONFIG_TABLES, conventionViolations, maskStrings, normalize, postflightViolations, stripComments, stripDollarBodies } from "./sql-rules";

/**
 * Feature 013 T067 (MP-2) — static and security tests for M4a `supabase/migrations/20260926100000_feature_013_cart_destination_rpcs.sql`,
 * its rollback and its postflight. No database access. Runtime behaviour is exercised by the supplementary PGlite run (T068)
 * and proven live in T071.
 *
 * Accept (tasks.md T066/T067): cart RPCs (advisory lock per org, V1 DRAFT reuse, merge per offer, request-log replay, no
 * reservation); destination RPCs (non-enumerating, soft retire); settings (platform admin + MFA, audited, checkout never
 * switched on by the migration); default payment account (super admin + MFA, no bank data); legacy conversion (LEGACY +
 * DRAFT + no non-CANCELLED shipment, exactly once, audited); the H1 default switch and the T023 F1 condition
 * (enforce_new_order_flow clears has_manual_adjustment and cancel_* for every non-service_role INSERT); M3 boundary intact.
 */

const FILE = "20260926100000_feature_013_cart_destination_rpcs.sql";
const SPEC = "specs/013-bank-transfer-commerce-core";
const migrationRaw = readFileSync(`supabase/migrations/${FILE}`, "utf8").replace(/\r/g, "");
const rollbackRaw = readFileSync(`supabase/rollback/${FILE.replace(/\.sql$/, ".rollback.sql")}`, "utf8").replace(/\r/g, "");
const postflightRaw = readFileSync("supabase/maintenance/20260926_feature_013_cart_destination_rpcs_postflight.sql", "utf8").replace(/\r/g, "");
const rollback = normalize(stripComments(rollbackRaw));
const rollbackTop = normalize(maskStrings(stripDollarBodies(stripComments(rollbackRaw))));
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

const RPCS: Record<string, string> = {
  get_or_create_cart: "uuid",
  add_cart_line: "uuid, uuid, numeric, uuid",
  upsert_delivery_destination: "uuid, uuid, jsonb, uuid",
  retire_delivery_destination: "uuid, uuid",
  update_commerce_settings: "int, boolean, boolean, uuid, uuid[]",
  set_default_payment_account: "uuid, uuid",
  admin_convert_legacy_draft: "uuid, uuid",
};
const HELPERS: Record<string, string> = {
  commerce_request_begin: "uuid, text, uuid",
  commerce_request_complete: "uuid, jsonb",
  commerce_assert_buyer_member: "uuid",
  commerce_resolve_cart: "uuid",
  enforce_new_order_flow: "",
};
/** Each mutating RPC and the R-25 scope (target) its request-log row is bound to. */
const MUTATING: Record<string, string> = {
  add_cart_line: "p_org_id",
  upsert_delivery_destination: "p_org_id",
  retire_delivery_destination: "p_id",
  update_commerce_settings: "null",
  set_default_payment_account: "p_account_id",
  admin_convert_legacy_draft: "p_order_id",
};
const LATER = ["estimate_cart", "compute_order_quote", "issue_proforma", "confirm_proforma", "cancel_order", "expire_reservation", "sweep_expired_reservations",
  "admin_void_order", "finance_confirm_payment", "finance_reject_payment", "open_reconciliation_case", "report_late_transfer", "search_member_listings"];

/** The full `create … function public.<name>(…) … as $tag$ body $tag$` statement and its body, from raw SQL (last definition wins). */
function fn(sql: string, name: string): { header: string; body: string } | null {
  let found: { header: string; body: string } | null = null;
  for (const m of sql.matchAll(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "gi"))) {
    const rest = sql.slice(m.index);
    const open = /\bas\s+\$([A-Za-z_]*)\$/i.exec(rest)!;
    const tag = `$${open[1]}$`;
    const start = m.index + open.index + open[0].length;
    found = { header: normalize(rest.slice(0, open.index)), body: sql.slice(start, sql.indexOf(tag, start)) };
  }
  return found;
}
/** Whitespace-normalized, comment-free, CASE-PRESERVING body. */
const ws = (s: string) => s.replace(/\s+/g, " ").trim();
const bodyOf = (sql: string, name: string) => ws(stripComments(fn(sql, name)?.body ?? ""));

/** M4a-specific invariants; the mutation cases prove each bites. */
function m4aViolations(raw: string): string[] {
  const problems: string[] = [];
  const top = normalize(maskStrings(stripDollarBodies(stripComments(raw))));
  const all = normalize(stripComments(raw));

  // 1. RPCs: SECURITY DEFINER, pinned search_path, EXECUTE exactly authenticated.
  for (const [name, args] of Object.entries(RPCS)) {
    const f = fn(raw, name);
    if (!f) { problems.push(`${name}: missing`); continue; }
    if (!/security definer/.test(f.header)) problems.push(`${name}: not SECURITY DEFINER`);
    if (!f.header.includes("set search_path to 'pg_catalog', 'public', 'auth'")) problems.push(`${name}: search_path not pinned to the contract value`);
    if (!top.includes(`revoke all on function public.${name}(${args}) from public, anon, service_role;`)) problems.push(`${name}: not revoked from public, anon, service_role`);
    const grants = [...top.matchAll(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to ([^;]*);`, "g"))].map((m) => m[1]!.trim());
    if (grants.join("|") !== "authenticated") problems.push(`${name}: EXECUTE is not exactly authenticated (${grants.join("|")})`);
  }
  // 2. Internal helpers + the trigger function: SECURITY INVOKER, pinned, no EXECUTE for any API role.
  for (const [name, args] of Object.entries(HELPERS)) {
    const f = fn(raw, name);
    if (!f) { problems.push(`${name}: missing`); continue; }
    if (/security definer/.test(f.header)) problems.push(`${name}: must be SECURITY INVOKER`);
    if (!/set search_path = pg_catalog, public/.test(f.header)) problems.push(`${name}: search_path not pinned`);
    if (!top.includes(`revoke all on function public.${name}(${args}) from public, anon, authenticated, service_role;`)) problems.push(`${name}: API roles not revoked`);
    if (new RegExp(`grant execute on function public\\.${name}\\(`).test(top)) problems.push(`${name}: granted to an API role`);
  }
  if (/grant [^;]* to [^;]*\banon\b/.test(top)) problems.push("a grant to anon");

  // 3. H1 + T023 F1.
  const enforce = bodyOf(raw, "enforce_new_order_flow");
  if (!/^begin if current_user <> 'service_role' then/.test(enforce)) problems.push("enforce_new_order_flow: not gated on current_user <> 'service_role'");
  for (const assignment of ["new.commerce_flow := 'bank_transfer_v1';", "new.has_manual_adjustment := false;", "new.cancelled_at := null;", "new.cancelled_by := null;", "new.cancel_reason := null;"]) {
    if (!enforce.toLowerCase().includes(assignment)) problems.push(`enforce_new_order_flow: missing ${assignment}`);
  }
  if (!top.includes("create trigger trg_orders_enforce_new_order_flow before insert on public.orders for each row execute function public.enforce_new_order_flow();")) problems.push("enforce trigger missing or not BEFORE INSERT FOR EACH ROW");
  if (!top.includes("alter table public.orders alter column commerce_flow set default ''")) problems.push("commerce_flow default not switched");
  if (!all.includes("alter table public.orders alter column commerce_flow set default 'bank_transfer_v1';")) problems.push("commerce_flow default is not 'BANK_TRANSFER_V1'");

  // 4. Cart.
  const resolve = bodyOf(raw, "commerce_resolve_cart");
  const lockAt = resolve.indexOf("perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));");
  if (lockAt === -1 || lockAt > resolve.indexOf("from public.orders o") || lockAt > resolve.indexOf("insert into public.orders")) problems.push("cart: advisory lock (key 13) missing or not taken first");
  if (!resolve.includes("o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT'")) problems.push("cart: not the V1 DRAFT reuse predicate");
  if (!resolve.includes("order by o.created_at desc, o.id desc limit 1")) problems.push("cart: not the latest cart");
  const cart = bodyOf(raw, "get_or_create_cart");
  if (!/^begin perform public\.commerce_assert_buyer_member\(p_org_id\); return public\.commerce_resolve_cart\(p_org_id\);/.test(cart)) problems.push("get_or_create_cart: membership not checked before resolution");
  const add = bodyOf(raw, "add_cart_line");
  if (/reserved_quantity_kg|inventory_positions|inventory_reservation|coffee_offers|pg_advisory_lock\b/.test(add)) problems.push("add_cart_line touches stock/reservations");
  if (!add.includes("on conflict (order_id, offer_id) do update set quantity_kg = public.order_items.quantity_kg + excluded.quantity_kg")) problems.push("add_cart_line: not merged per offer");
  // A3: explicit organization scope — the selected org is checked and its own cart resolved; no membership scan, no guess
  const assertAt = add.indexOf("perform public.commerce_assert_buyer_member(p_org_id);");
  if (assertAt === -1 || assertAt > add.indexOf("v_order_id := public.commerce_resolve_cart(p_org_id);")) problems.push("add_cart_line: the selected organization is not checked before its cart is resolved");
  if (/organization_members|buyer_organization_ambiguous|v_org_ids/.test(add)) problems.push("add_cart_line: resolves the organization implicitly");
  const assertMember = bodyOf(raw, "commerce_assert_buyer_member");
  for (const check of ["not public.is_org_member(p_org_id)", "public.is_blocked_user()", "not public.organization_can_buy(p_org_id)", "raise exception 'buyer_not_authorized'", "not public.mfa_satisfied()", "raise exception 'mfa_step_up_required'"]) {
    if (!assertMember.includes(check)) problems.push(`commerce_assert_buyer_member: missing ${check}`);
  }

  // 5. Idempotency (R-25).
  // R-25 literally (A6): the log row is INSERTED FIRST; the conflict path compares actor, operation and scope.
  const begin = bodyOf(raw, "commerce_request_begin");
  const insertAt = begin.indexOf("insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response) values (p_request_id, auth.uid(), p_operation, p_target_id, '{}'::jsonb) on conflict (request_id) do nothing;");
  if (insertAt === -1 || insertAt > begin.indexOf("select * into v_log")) problems.push("commerce_request_begin: the log row is not inserted first");
  for (const check of ["raise exception 'request_id_required'", "get diagnostics v_inserted = row_count;",
    "v_log.actor_user_id is distinct from auth.uid() or v_log.operation <> p_operation or v_log.target_id is distinct from p_target_id",
    "raise exception 'request_id_conflict'", "return v_log.response;"]) {
    if (!begin.includes(check)) problems.push(`commerce_request_begin: missing ${check}`);
  }
  if (/pg_advisory|on conflict \(request_id\) do update/.test(begin)) problems.push("commerce_request_begin: not the plain insert-first path");
  if (!bodyOf(raw, "commerce_request_complete").includes("update public.commerce_request_log set response = p_response where request_id = p_request_id and actor_user_id = auth.uid();")) problems.push("commerce_request_complete: not a same-transaction response update");
  for (const [name, scope] of Object.entries(MUTATING)) {
    const body = bodyOf(raw, name);
    if (!body.includes(`begin v_replay := public.commerce_request_begin(p_request_id, '${name}', ${scope});`)) problems.push(`${name}: the request-log insert is not the first step (scope ${scope})`);
    if (!/perform public\.commerce_request_complete\(p_request_id, [^;]+\); (return v_result; |return v_id; )?end;$/.test(body)) problems.push(`${name}: the response is not completed as the last step`);
  }

  // 6. Destinations.
  const upsert = bodyOf(raw, "upsert_delivery_destination");
  if (!upsert.includes("where d.id = p_id and d.organization_id = p_org_id and d.retired_at is null for update")) problems.push("upsert: lookup not scoped to the org's active destinations");
  if ((upsert.match(/raise exception 'destination_not_found'/g) ?? []).length !== 1 || /destination_forbidden|not_member/.test(upsert)) problems.push("upsert: non-enumeration broken");
  if (!upsert.includes("raise exception 'destination_invalid'")) problems.push("upsert: invalid fields not mapped to destination_invalid");
  const retire = bodyOf(raw, "retire_delivery_destination");
  if (!retire.includes("where d.id = p_id and public.is_org_member(d.organization_id) for update") || !retire.includes("raise exception 'destination_not_found'")) problems.push("retire: not non-enumerating");
  if (/public\.orders\b|delete from/.test(retire) || !retire.includes("set retired_at = clock_timestamp(), retired_by = auth.uid(), is_default = false")) problems.push("retire: not a soft retire or touches orders");

  // 7. Admin.
  const settings = bodyOf(raw, "update_commerce_settings");
  const adminGate = (body: string, gate: string) => body.indexOf(`if not ${gate} then raise exception 'forbidden';`) !== -1
    && body.indexOf("if not public.mfa_satisfied() then raise exception 'mfa_step_up_required';") !== -1
    && body.indexOf("if not public.mfa_satisfied()") < body.search(/\bupdate public\./);
  if (!adminGate(settings, "public.is_platform_admin()")) problems.push("update_commerce_settings: platform admin + MFA not enforced before the write");
  if (!settings.includes("bank_transfer_checkout_enabled = coalesce(p_checkout_enabled, bank_transfer_checkout_enabled)")) problems.push("update_commerce_settings: NULL must leave checkout unchanged");
  if (!settings.includes("insert into public.audit_logs") || !settings.includes("'commerce_settings'")) problems.push("update_commerce_settings: not audited");
  const setDefault = bodyOf(raw, "set_default_payment_account");
  if (!adminGate(setDefault, "public.is_platform_admin()") || /is_super_admin/.test(setDefault)) problems.push("set_default_payment_account: platform admin + MFA not enforced before the write");
  if (!setDefault.includes("where a.id = p_account_id and a.is_active and a.currency = 'USD'")) problems.push("set_default_payment_account: not restricted to an active USD account");
  if (/account_number|iban|swift_code|account_name|bank_name/.test(setDefault)) problems.push("set_default_payment_account: reads or returns bank data");
  const convert = bodyOf(raw, "admin_convert_legacy_draft");
  if (!adminGate(convert, "public.is_platform_admin()")) problems.push("admin_convert_legacy_draft: platform admin + MFA not enforced before the write");
  if (!convert.includes("if v_order.commerce_flow <> 'LEGACY' or v_order.status <> 'DRAFT' or exists (select 1 from public.order_shipments s where s.order_id = p_order_id and s.status <> 'CANCELLED') then raise exception 'legacy_draft_not_convertible';")) problems.push("admin_convert_legacy_draft: eligibility not LEGACY + DRAFT + no non-CANCELLED shipment");
  if (!convert.includes("select * into v_order from public.orders where id = p_order_id for update;")) problems.push("admin_convert_legacy_draft: order not locked");
  if (!/set_config\('app\.internal_transition', 'true', true\); update public\.orders set commerce_flow = 'BANK_TRANSFER_V1' where id = p_order_id; perform set_config\('app\.internal_transition', 'false', true\);/.test(convert)) problems.push("admin_convert_legacy_draft: not the M1 internal-transition path");
  if (/order_items/.test(convert) || !convert.includes("'CONVERT_LEGACY_DRAFT'")) problems.push("admin_convert_legacy_draft: touches lines or is not audited");

  // 8. Scope: no table/policy/column-grant change, no event, no data change, no checkout activation.
  if (/\b(create|alter|drop) policy\b|\bcreate table\b|\bgrant (select|insert|update|delete)\b|\brevoke (select|insert|update|delete)\b/.test(top)) problems.push("a table, policy or table grant change");
  if ([...top.matchAll(/alter table ([^;]*);/g)].some((m) => m[1] !== "public.orders alter column commerce_flow set default ''")) problems.push("an unexpected alter table");
  if (/emit_notification_event|notification_events/.test(stripComments(raw).replace(/do \$guard\$[\s\S]*?\$guard\$;/, ""))) problems.push("emits notification events (none in the M4a catalogue)");
  if (/(?:^|;)\s*(insert into|update|delete from|truncate) public\./.test(normalize(stripDollarBodies(stripComments(raw))))) problems.push("top-level DML");
  if (/bank_transfer_checkout_enabled\s*=\s*true/.test(stripComments(raw).toLowerCase())) problems.push("checkout activated");
  if (/\bsubmit_payment_proof\b/.test(all)) problems.push("a legacy function name in the guard");
  return problems;
}

describe("T067 — M4a satisfies the generic MP-2 rules", () => {
  it("conventions: guard first, one transaction, no anon grant, no authenticated table write grant, definer functions pinned + explicit grants, no config-table change, no DML", () => {
    expect(conventionViolations(FILE, migrationRaw)).toEqual([]);
  });
  it("no config-table (Feature 010) policy, trigger or grant is touched (payment_accounts is written only inside the RPC)", () => {
    const config = CONFIG_TABLES.join("|");
    const top = normalize(maskStrings(stripDollarBodies(stripComments(migrationRaw))));
    expect(top).not.toMatch(new RegExp(`\\bon (table )?public\\.(${config})\\b`));
    expect(rollbackTop).not.toMatch(new RegExp(`\\bon (table )?public\\.(${config})\\b`));
  });
  it("the postflight is a single read-only query ending in ALL CHECKS PASSED (12 checks)", () => {
    expect(postflightViolations(postflightRaw)).toEqual([]);
    expect(postflightRaw).toContain("'ALL CHECKS PASSED'");
    expect([...postflightRaw.matchAll(/^\s*select (\d+), '/gm)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
  it("the M4a-specific invariants hold", () => {
    expect(m4aViolations(migrationRaw)).toEqual([]);
  });
});

describe("T067 — guard pins (fail closed on drift)", () => {
  const guard = /do \$guard\$([\s\S]*?)\$guard\$;/.exec(migrationRaw)![1]!;
  const pins = JSON.parse(/v_pins jsonb := \$json\$([\s\S]*?)\$json\$;/.exec(guard)![1]!) as Record<string, string>;
  const csv = readFileSync(`${SPEC}/preflight-evidence/section5-function-fingerprints.csv`, "utf8").replace(/\r/g, "");
  const section5 = Object.fromEntries(csv.split("\n").slice(1).map((l) => [l.split(",")[0]!, /,([0-9a-f]{32}),/.exec(l)?.[1]]).filter(([, m]) => m));
  const repoBody = (file: string, name: string) => fn(readFileSync(`supabase/migrations/${file}`, "utf8").replace(/\r/g, ""), name)!.body;

  it("pins exactly the functions M4a calls or relies on", () => {
    expect(Object.keys(pins).sort()).toEqual(["can_view_order(uuid)", "checkout_order(uuid)", "is_blocked_user()", "is_org_member(uuid)", "is_platform_admin()", "mfa_satisfied()",
      "organization_can_buy(uuid)", "prevent_snapshot_mutation()", "remove_order_item(uuid)", "update_order_item_quantity(uuid,numeric)", "validate_order_item_offer()", "validate_order_transition()"]);
  });
  it("checkout_order is the post-M2b body, verified from the M2b migration (54810aad…), not the §5 pre-013 body", () => {
    const m2b = md5(repoBody("20260925106000_feature_013_proforma_versioning_snapshots.sql", "checkout_order"));
    expect(m2b).toBe("54810aadbcb05915d49374d5ceae738e");
    expect(pins["checkout_order(uuid)"]).toBe(m2b);
    expect(pins["checkout_order(uuid)"]).not.toBe(section5.checkout_order);
    expect(pins["prevent_snapshot_mutation()"]).toBe(md5(repoBody("20260925106000_feature_013_proforma_versioning_snapshots.sql", "prevent_snapshot_mutation")));
  });
  it("validate_order_transition is the M1 v2 body (M1 transition protections not weakened)", () => {
    expect(pins["validate_order_transition()"]).toBe(md5(repoBody("20260925100000_feature_013_commerce_state_vocabulary.sql", "validate_order_transition")));
    expect(migrationRaw).not.toMatch(/function\s+public\.validate_order_transition\s*\(/i);
  });
  it("every other pin equals the T006 §5 production fingerprint (mfa_satisfied also equals the T056 C15 body)", () => {
    for (const [sig, value] of Object.entries(pins)) {
      const name = sig.split("(")[0]!;
      if (["checkout_order", "prevent_snapshot_mutation", "validate_order_transition"].includes(name)) continue;
      expect(value, sig).toBe(section5[name]);
    }
    expect(pins["mfa_satisfied()"]).toBe(C15_BODY_MD5.mfa);
  });
  it("validate_order_item_offer / organization_can_buy / is_platform_admin pins equal the approved database report bodies", () => {
    const report = JSON.parse(JSON.parse(readFileSync("docs/database/database-schema-report.json", "utf8"))[0].database_schema_report) as { functions: { function_name: string; definition: string }[] };
    for (const name of ["validate_order_item_offer", "organization_can_buy", "is_platform_admin", "is_blocked_user", "is_org_member"]) {
      const def = report.functions.find((f) => f.function_name === name);
      if (!def) continue;
      const body = /\$function\$([\s\S]*?)\$function\$/.exec(def.definition)![1]!.replace(/\r/g, "");
      expect(md5(body), name).toBe(Object.entries(pins).find(([s]) => s.startsWith(`${name}(`))![1]);
    }
  });
  it("the guard verifies M1–M3, the M3 column boundary, the kill switch, the commerce_flow default and refuses existing M4a/M4b objects", () => {
    const g = normalize(guard);
    for (const needle of ["to_regclass('public.commerce_request_log') is null", "to_regclass('public.delivery_destinations') is null", "to_regclass('public.v_seller_order_lines') is null",
      "to_regclass('public.notification_events') is null", "policyname = 'orders_view' and qual = 'can_view_order(id)'", "has_table_privilege('authenticated', 'public.orders', 'select')",
      "has_column_privilege('authenticated', 'public.orders', 'destination_snapshot', 'select')", "is distinct from '''LEGACY''::text'",
      "pg_get_constraintdef(oid) = 'UNIQUE (order_id, offer_id)'", "tgname = 'trg_order_item_offer'", "bank_transfer_checkout_enabled",
      "trg_orders_enforce_new_order_flow", "rolbypassrls"]) {
      expect(g, needle).toContain(normalize(needle));
    }
    for (const name of [...Object.keys(RPCS), ...Object.keys(HELPERS), ...LATER]) expect(g, name).toContain(`'${name}'`);
    expect(guard).toMatch(/raise exception 'feature_013_cart_destination_rpcs preflight failed — nothing applied: %'/);
  });
});

describe("T067 — T023 F1 and the service_role distinction", () => {
  it("enforce_new_order_flow is SECURITY INVOKER so current_user is the inserting role (a definer would see its owner)", () => {
    expect(fn(migrationRaw, "enforce_new_order_flow")!.header).not.toContain("security definer");
    expect(bodyOf(migrationRaw, "enforce_new_order_flow")).toBe(ws(`begin if current_user <> 'service_role' then new.commerce_flow := 'BANK_TRANSFER_V1'; new.has_manual_adjustment := false;
      new.cancelled_at := null; new.cancelled_by := null; new.cancel_reason := null; end if; return new; end;`));
  });
  it("the M4a RPC inserts go through it: commerce_resolve_cart inserts only (buyer, created_by, status, commerce_flow)", () => {
    expect(bodyOf(migrationRaw, "commerce_resolve_cart")).toContain("insert into public.orders (buyer_organization_id, created_by, status, commerce_flow) values (p_org_id, auth.uid(), 'DRAFT', 'BANK_TRANSFER_V1')");
  });
});

describe("T067 — mutations prove the invariants bite", () => {
  const cases: [string, (s: string) => string][] = [
    ["F1: has_manual_adjustment not cleared", (s) => s.replace("    new.has_manual_adjustment := false;\n", "")],
    ["F1: cancelled_at not cleared", (s) => s.replace("    new.cancelled_at := null;\n", "")],
    ["F1: cancelled_by not cleared", (s) => s.replace("    new.cancelled_by := null;\n", "")],
    ["F1: cancel_reason not cleared", (s) => s.replace("    new.cancel_reason := null;\n", "")],
    ["H1: commerce_flow not forced", (s) => s.replace("    new.commerce_flow := 'BANK_TRANSFER_V1';\n", "")],
    ["H1: service_role gate inverted", (s) => s.replace("if current_user <> 'service_role' then", "if current_user = 'service_role' then")],
    ["H1: trigger function made SECURITY DEFINER", (s) => s.replace("returns trigger\nlanguage plpgsql\nset search_path = pg_catalog, public", "returns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, public")],
    ["H1: trigger AFTER INSERT", (s) => s.replace("create trigger trg_orders_enforce_new_order_flow before insert", "create trigger trg_orders_enforce_new_order_flow after insert")],
    ["H1: default not switched", (s) => s.replace("alter table public.orders alter column commerce_flow set default 'BANK_TRANSFER_V1';", "")],
    ["cart: advisory lock removed", (s) => s.replace("  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));\n", "")],
    ["cart: a LEGACY draft reused", (s) => s.replace("where o.buyer_organization_id = p_org_id and o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT'", "where o.buyer_organization_id = p_org_id and o.status = 'DRAFT'")],
    ["add_cart_line reserves stock", (s) => s.replace("  returning id, quantity_kg into v_line_id, v_quantity;\n", "  returning id, quantity_kg into v_line_id, v_quantity;\n  update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg + p_quantity_kg where id = p_offer_id;\n")],
    ["add_cart_line: second line per offer", (s) => s.replace("on conflict (order_id, offer_id) do update set quantity_kg = public.order_items.quantity_kg + excluded.quantity_kg", "")],
    ["add_cart_line: request log removed", (s) => s.replace("  v_replay := public.commerce_request_begin(p_request_id, 'add_cart_line', p_org_id);\n", "")],
    ["add_cart_line: request not scoped to the organization", (s) => s.replace("commerce_request_begin(p_request_id, 'add_cart_line', p_org_id)", "commerce_request_begin(p_request_id, 'add_cart_line', null)")],
    ["add_cart_line: selected organization not checked", (s) => s.replace("  -- indistinguishable (buyer_not_authorized)\n  perform public.commerce_assert_buyer_member(p_org_id);\n", "  -- indistinguishable (buyer_not_authorized)\n")],
    ["add_cart_line: organization guessed from memberships", (s) => s.replace("  v_order_id := public.commerce_resolve_cart(p_org_id);\n  perform 1", "  v_order_id := public.commerce_resolve_cart((select organization_id from public.organization_members where user_id = auth.uid() limit 1));\n  perform 1")],
    ["R-25: actor not compared", (s) => s.replace("if v_log.actor_user_id is distinct from auth.uid() or v_log.operation <> p_operation", "if v_log.operation <> p_operation")],
    ["R-25: scope not compared", (s) => s.replace("\n     or v_log.target_id is distinct from p_target_id", "")],
    ["R-25: log row looked up before it is inserted", (s) => s.replace("  insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response)", "  select * into v_log from public.commerce_request_log where request_id = p_request_id;\n  insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response)")],
    ["R-25: log row overwritten on conflict", (s) => s.replace("  on conflict (request_id) do nothing;", "  on conflict (request_id) do update set response = excluded.response;")],
    ["R-25: response never completed", (s) => s.replace("  perform public.commerce_request_complete(p_request_id, jsonb_build_object('destination_id', p_id));\n", "")],
    ["member MFA check removed", (s) => s.replace("  if not public.mfa_satisfied() then\n    raise exception 'mfa_step_up_required';\n  end if;\nend;\n$function$;\nrevoke all on function public.commerce_assert_buyer_member", "end;\n$function$;\nrevoke all on function public.commerce_assert_buyer_member")],
    ["anon granted an RPC", (s) => s.replace("grant execute on function public.add_cart_line(uuid, uuid, numeric, uuid) to authenticated;", "grant execute on function public.add_cart_line(uuid, uuid, numeric, uuid) to authenticated, anon;")],
    ["service_role granted an RPC", (s) => s.replace("grant execute on function public.get_or_create_cart(uuid) to authenticated;", "grant execute on function public.get_or_create_cart(uuid) to authenticated, service_role;")],
    ["authenticated granted a helper", (s) => s.replace("revoke all on function public.commerce_resolve_cart(uuid) from public, anon, authenticated, service_role;", "revoke all on function public.commerce_resolve_cart(uuid) from public, anon, authenticated, service_role;\ngrant execute on function public.commerce_resolve_cart(uuid) to authenticated;")],
    ["definer search_path unpinned", (s) => s.replace("security definer\nset search_path to 'pg_catalog', 'public', 'auth'\nas $function$\nbegin\n  perform public.commerce_assert_buyer_member(p_org_id);", "security definer\nas $function$\nbegin\n  perform public.commerce_assert_buyer_member(p_org_id);")],
    ["destination existence leaked", (s) => s.replace("    select d.id into v_id from public.delivery_destinations d\n    where d.id = p_id and d.organization_id = p_org_id and d.retired_at is null", "    select d.id into v_id from public.delivery_destinations d\n    where d.id = p_id and d.retired_at is null")],
    ["retire touches orders", (s) => s.replace("  -- orders are never touched", "  update public.orders set delivery_destination_id = null where delivery_destination_id = p_id;\n  -- orders are never touched")],
    ["settings MFA removed", (s) => s.replace("    raise exception 'forbidden';\n  end if;\n  if not public.mfa_satisfied() then\n    raise exception 'mfa_step_up_required';\n  end if;\n  if p_validity_hours", "    raise exception 'forbidden';\n  end if;\n  if p_validity_hours")],
    ["settings audit removed", (s) => s.replace("values (auth.uid(), 'commerce_settings', null, 'UPDATE',", "values (auth.uid(), 'settings', null, 'UPDATE',")],
    ["checkout activated by the migration", (s) => s.replace("\ncommit;", "\nupdate public.commerce_settings set bank_transfer_checkout_enabled = true;\ncommit;")],
    ["default account restricted to super admin (A2 reverted)", (s) => s.replace("  -- platform admin + MFA (contract; owner decision A2). This definer RPC is the only path; no table grant changes.\n  if not public.is_platform_admin() then", "  if not public.is_super_admin() then")],
    ["default account MFA removed", (s) => s.replace("  if not public.is_platform_admin() then\n    raise exception 'forbidden';\n  end if;\n  if not public.mfa_satisfied() then\n    raise exception 'mfa_step_up_required';\n  end if;\n\n  select a.id", "  if not public.is_platform_admin() then\n    raise exception 'forbidden';\n  end if;\n\n  select a.id")],
    ["default account returns bank data", (s) => s.replace("v_result := jsonb_build_object('payment_account_id', v_account_id, 'currency', 'USD');", "v_result := (select to_jsonb(a) - 'id' from public.payment_accounts a where a.id = v_account_id) || jsonb_build_object('iban', 1);")],
    ["conversion ignores the shipment plan", (s) => s.replace("\n     or exists (select 1 from public.order_shipments s where s.order_id = p_order_id and s.status <> 'CANCELLED')", "")],
    ["conversion without the internal transition", (s) => s.replace("  perform set_config('app.internal_transition', 'true', true);\n", "")],
    ["notification event emitted", (s) => s.replace("  return v_result;\nend;\n$function$;\nrevoke all on function public.admin_convert_legacy_draft", "  perform public.emit_notification_event('x', 'order', p_order_id, 'x', '{}', 'x', '{}');\n  return v_result;\nend;\n$function$;\nrevoke all on function public.admin_convert_legacy_draft")],
    ["M3 boundary broadened", (s) => s.replace("\ncommit;", "\ngrant select (destination_snapshot) on public.orders to authenticated;\ncommit;")],
    ["a policy added", (s) => s.replace("\ncommit;", "\ncreate policy x on public.orders for select to authenticated using (true);\ncommit;")],
  ];
  it.each(cases)("mutation: %s is caught", (_label, mutate) => {
    const mutated = mutate(migrationRaw);
    expect(mutated).not.toBe(migrationRaw);
    expect(m4aViolations(mutated).length + conventionViolations(FILE, mutated).length).toBeGreaterThan(0);
  });
});

describe("T067 — the migration matches the amended contract (T069 owner decisions A1–A4, A6)", () => {
  const contract = readFileSync(`${SPEC}/contracts/database-rpc.md`, "utf8").replace(/\r/g, "");
  it("signatures: add_cart_line is organization-scoped; update_commerce_settings carries the pilot list", () => {
    expect(contract).toContain("`add_cart_line(p_org_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid) → jsonb`");
    expect(contract).toContain("`update_commerce_settings(p_validity_hours int, p_checkout_enabled bool, p_proof_enabled bool, p_request_id uuid, p_pilot_organization_ids uuid[] default null)`");
    expect(contract).toContain("`set_default_payment_account(p_account_id uuid, p_request_id uuid)` | Platform admin + MFA");
    expect(migrationRaw).toContain("create or replace function public.add_cart_line(p_org_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid)");
    expect(migrationRaw).toMatch(/create or replace function public\.update_commerce_settings\(p_validity_hours int, p_checkout_enabled boolean, p_proof_enabled boolean,\s+p_request_id uuid, p_pilot_organization_ids uuid\[\] default null\)/);
  });
  it("every code M4a raises is in the contract's M4a Errors lines; nothing else (no invented code, no ambiguity code)", () => {
    const raised = [...new Set([...stripComments(migrationRaw).replace(/do \$guard\$[\s\S]*?\$guard\$;/, "").matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]!))].sort();
    const m4aLines = contract.split("\n").filter((l) => /^Errors:/.test(l) && /\(M4a /.test(l)).join("\n");
    const documented = [...m4aLines.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]!);
    for (const code of raised) expect(documented, code).toContain(code);
    expect(raised).not.toContain("buyer_organization_ambiguous");
    expect(contract).not.toContain("buyer_organization_ambiguous");
    expect(contract).toContain("current authorization always precedes a\n  request-log lookup");
  });
});

describe("T067 — A1 rollout invariant: global checkout stays OFF until T235", () => {
  it("the migration and postflight keep bank_transfer_checkout_enabled false; the guard refuses to run if it is true", () => {
    expect(stripComments(migrationRaw).toLowerCase()).not.toMatch(/bank_transfer_checkout_enabled\s*=\s*true|p_checkout_enabled\s*=>\s*true/);
    expect(migrationRaw).toContain("exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)");
    expect(postflightRaw).toContain("not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)");
  });
  it("no application runtime path calls update_commerce_settings or writes the checkout flag (pilot organizations are the only pre-T235 activation)", () => {
    let hits = "";
    try {
      hits = execFileSync("git", ["grep", "-l", "-E", "update_commerce_settings|bank_transfer_checkout_enabled", "--", "lib", "src", "app", "components"], { encoding: "utf8" });
    } catch {
      hits = ""; // git grep exits 1 when nothing matches
    }
    const authorizedCaller = "src/app/dashboard-admin/(system)/commerce-settings/actions.ts";
    const settingsPage = "src/app/dashboard-admin/(system)/commerce-settings/page.tsx";
    const settingsLibrary = "lib/admin/commerce-settings.ts";
    const paths = hits.split(/\r?\n/).filter(Boolean);
    expect(paths.filter((f) => ![authorizedCaller, settingsPage, settingsLibrary].includes(f))).toEqual([]);
    if (paths.includes(authorizedCaller)) {
      const caller = readFileSync(authorizedCaller, "utf8");
      expect(caller).toContain('checkAreaAccess("commerceSettings")');
      expect(caller).toMatch(/if \(!access\.ok\) return/);
    }
    if (paths.includes(settingsPage)) {
      const page = readFileSync(settingsPage, "utf8");
      expect(page).toContain('checkAreaAccess("commerceSettings")');
      expect(page).toMatch(/if \(!access\.ok\) return/);
    }
    if (paths.includes(settingsLibrary)) {
      expect(readFileSync(settingsLibrary, "utf8")).toContain('supabase.rpc("update_commerce_settings"');
    }
  });
});

describe("T067 — rollback symmetry and history", () => {
  it("the rollback drops exactly the 12 M4a functions and the one trigger and restores the M1 default", () => {
    expect([...rollbackTop.matchAll(/drop function public\.(\w+)\(/g)].map((m) => m[1]).sort()).toEqual([...Object.keys(RPCS), ...Object.keys(HELPERS)].sort());
    expect([...rollbackTop.matchAll(/drop trigger (\w+) on public\.orders;/g)].map((m) => m[1])).toEqual(["trg_orders_enforce_new_order_flow"]);
    expect(normalize(stripComments(rollbackRaw))).toContain("alter table public.orders alter column commerce_flow set default 'legacy';");
    expect(rollbackTop).not.toMatch(/\bdrop table\b|\bdrop policy\b|\bgrant\b|\brevoke\b|(?:^|;)\s*(insert into|update|delete from) public\./);
  });
  it("the rollback signatures match the migration's (every created function is dropped with its exact argument types)", () => {
    const created = [...Object.entries(RPCS), ...Object.entries(HELPERS)].map(([n, a]) => `${n}(${a.replace(/\bint\b/, "integer")})`).sort();
    const dropped = [...rollbackTop.matchAll(/drop function public\.(\w+\([^)]*\));/g)].map((m) => m[1]!.replace(/\s+/g, " ")).sort();
    expect(dropped).toEqual(created);
  });
  it("the rollback guard refuses while M4b+ is applied, a function depends on M4a, or checkout is enabled; data is kept, never rewritten", () => {
    const guard = /do \$guard\$[\s\S]*?\$guard\$;/.exec(rollback)![0];
    for (const name of LATER) expect(guard, name).toContain(`'${name}'`);
    for (const needle of ["another function references an m4a function", "bank_transfer_checkout_enabled is true", "m4a is not (fully) applied"]) expect(guard, needle).toContain(needle);
    expect(guard).not.toContain("'submit_payment_proof'");
  });
  it("the M3 rollback guard already refuses while M4a objects exist (M3 cannot be rolled back under M4a)", () => {
    const m3rb = readFileSync("supabase/rollback/20260925120000_feature_013_rls_realignment.rollback.sql", "utf8");
    for (const name of ["get_or_create_cart", "add_cart_line", "upsert_delivery_destination", "retire_delivery_destination", "admin_convert_legacy_draft"]) expect(m3rb).toContain(`'${name}'`);
  });
  it("no applied migration, rollback, postflight or Feature 008 file differs from HEAD", () => {
    const changed = execFileSync("git", ["diff", "--name-only", "HEAD", "--", "supabase/migrations", "supabase/rollback", "supabase/maintenance", "specs/008-stripe-trusted-funding", "specs"], { encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean).filter((f) => !f.endsWith("specs/013-bank-transfer-commerce-core/tasks.md"))
      // The current, unapplied M4b change set may supersede M4a's replay ordering and its financial-read contract.
      .filter((f) => !/^(?:supabase\/(?:migrations|rollback)\/20260926103000_feature_013_quote_and_proforma_issuance|supabase\/maintenance\/20260926_feature_013_quote_and_proforma_issuance_postflight|specs\/013-bank-transfer-commerce-core\/(?:contracts\/(?:database-rpc|rls-storage)\.md|tasks\.md))/.test(f))
      // The current, unapplied M4c-reduced (stock/inventory reservation only) change set — owner scope reduction, 2026-09-28.
      .filter((f) => !/^(?:supabase\/(?:migrations|rollback)\/20260928120000_feature_013_stock_reservation|supabase\/maintenance\/20260928_feature_013_stock_reservation_postflight|specs\/013-bank-transfer-commerce-core\/(?:spec|plan)\.md)/.test(f))
      // Feature 014 (Sprint 2) active implementation.
      .filter((f) => !/^(?:specs\/014-notifications-messaging-seo|supabase\/(?:migrations|rollback)\/20260929\d+_feature_014|supabase\/maintenance\/20260929_feature_014)/.test(f));
    expect(changed).toEqual([]);
  });
});
