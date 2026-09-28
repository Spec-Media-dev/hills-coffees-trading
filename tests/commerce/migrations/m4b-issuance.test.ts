import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const forward = readFileSync("supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql", "utf8");
const rollback = readFileSync("supabase/rollback/20260926103000_feature_013_quote_and_proforma_issuance.rollback.sql", "utf8");
const postflight = readFileSync("supabase/maintenance/20260926_feature_013_quote_and_proforma_issuance_postflight.sql", "utf8");

function body(name: string): string {
  const start = forward.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const text = forward.slice(start);
  return text.slice(0, text.indexOf("$function$;"));
}

describe("Feature 013 M4b issuance static boundaries", () => {
  it("replaces only the orders audit with a fixed allow-list before defining issuance", () => {
    const audit = body("write_audit_log_orders_redacted");
    expect(audit).not.toMatch(/to_jsonb\s*\(\s*(?:old|new)\s*\)/i);
    expect(audit).not.toMatch(/(?:old|new)\.destination_snapshot/);
    expect(audit).toContain("jsonb_build_object");
    expect(forward.indexOf("create trigger trg_audit_orders")).toBeLessThan(forward.indexOf("create or replace function public.issue_proforma("));
    expect(forward).toContain("'destination_snapshot', 'cancel_reason', 'idempotency_key'");
    expect(forward).toContain("feature_013_m4b_existing_order_audit_pii_requires_review");
    expect(forward.indexOf("feature_013_m4b_existing_order_audit_pii_requires_review"))
      .toBeLessThan(forward.indexOf("drop trigger trg_audit_orders"));
    expect(forward).not.toMatch(/create trigger [\s\S]*? on public\.(?:payments|coffee_offers)/i);
  });

  it("keeps launch pricing and non-UAE issuance fail closed", () => {
    const quote = body("compute_order_quote");
    expect(quote).toContain("v_item.price_per_kg");
    expect(quote).toContain("destination_tax_unsupported");
    expect(quote).toContain("country_code = 'AE'");
    expect(quote).toContain("commission_rule_missing");
    expect(quote).toContain("shipping_rule_missing");
    expect(quote).toContain("bank_account_missing");
    expect(quote).not.toMatch(/from public\.(?:promotions|offer_price_tiers)/i);
    expect(quote).not.toMatch(/\b(?:update|insert into|delete from)\s+public\./i);
  });

  it("selects the exact-country shipping rule ahead of the NULL-country fallback (R-8, review B1)", () => {
    const quote = body("compute_order_quote");
    const start = quote.indexOf("from public.shipping_rules");
    expect(start).toBeGreaterThan(-1);
    const selection = quote.slice(start, quote.indexOf("limit 1;", start));
    const orderBy = selection.slice(selection.indexOf("order by ") + "order by ".length).trim();
    const leadingKey = orderBy.split(/,\s*effective_from\b/)[0].trim();
    // A bare `(country_code = …) desc` is NULL for the fallback, and PostgreSQL sorts NULLs first under DESC.
    const nullSafe = /^coalesce\(\s*country_code\s*=\s*v_destination\.country_code\s*,\s*false\s*\)\s+desc$/i.test(leadingKey)
      || /^\(\s*country_code\s*=\s*v_destination\.country_code\s*\)\s+desc\s+nulls\s+last$/i.test(leadingKey);
    expect(nullSafe, `unsafe shipping precedence key: ${leadingKey}`).toBe(true);
    expect(orderBy).toMatch(/,\s*effective_from desc, id desc$/);
    expect(selection).toContain("(country_code = v_destination.country_code or country_code is null)");
  });

  it("keeps issue atomic, gated, snapshot-backed and reservation-free", () => {
    const issue = body("issue_proforma");
    expect(issue).toContain("commerce_request_begin(p_request_id, 'issue_proforma', p_order_id)");
    expect(issue).toContain("bank_transfer_checkout_enabled");
    expect(issue).toContain("commerce_assert_buyer_member");
    expect(issue).toContain("compute_order_quote(p_order_id, p_destination_id, p_promo_code)");
    expect(issue).toContain("proforma_bank_instructions");
    expect(issue).toContain("order_financials");
    expect(issue).toContain("proforma.issued");
    expect(issue).not.toMatch(/\b(?:update|insert into|delete from)\s+public\.(?:coffee_offers|inventory_positions|inventory_reservations)\b/i);
  });

  it("limits buyer bank-instruction reads to a CONFIRMED/PAID proforma (RLS-008, review B2)", () => {
    const start = forward.indexOf("create policy proforma_bank_instructions_read");
    expect(start).toBeGreaterThan(-1);
    const policy = forward.slice(start, forward.indexOf("or public.is_finance_operator());", start));
    expect(forward.indexOf("drop policy proforma_bank_instructions_read on public.proforma_bank_instructions;")).toBeLessThan(start);
    expect(policy).toMatch(/for select to authenticated/);
    expect(policy).toMatch(/pi\.status in \('CONFIRMED', 'PAID'\)/);
    expect(policy).toMatch(/public\.is_order_buyer_member\(pi\.order_id\)/);
    expect(policy).not.toMatch(/'ISSUED'|is_platform_admin|is_auditor|is_order_line_seller|is_warehouse_operator/);
    // The policy is in place before any function that writes bank instructions can exist.
    expect(start).toBeLessThan(forward.indexOf("create or replace function public.issue_proforma("));
    expect(forward).toMatch(/policyname = 'proforma_bank_instructions_read' and cmd = 'SELECT'/);
    // Rollback restores the exact M3 buyer-or-finance policy; the postflight pins the new predicate and the MFA gate.
    expect(rollback).toContain("using (exists (select 1 from public.proforma_invoices pi where pi.id = proforma_bank_instructions.proforma_id and public.is_order_buyer_member(pi.order_id))\n         or public.is_finance_operator());");
    expect(postflight).toContain("select 7, 'RLS-008");
    expect(postflight).toContain("mfa_gate_proforma_bank_instructions");
  });

  it("keeps service_role read-only on bank instructions and out of every app path (M2b baseline, plan IX, SEC-009)", () => {
    expect(postflight).toContain("has_table_privilege('service_role', 'public.proforma_bank_instructions', 'SELECT')");
    expect(postflight).toContain("not has_table_privilege('service_role', 'public.proforma_bank_instructions', 'INSERT, UPDATE, DELETE, TRUNCATE')");
    expect(forward).not.toMatch(/grant\s+[^;]*\bon\s+(?:table\s+)?public\.proforma_bank_instructions\b/i);
    const appFiles = (execFileSync("git", ["ls-files", "-co", "--exclude-standard", "--", "lib", "src", "components", "app"], { encoding: "utf8" }))
      .split(/\r?\n/).filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
    const serviceRole = /SUPABASE_SERVICE_ROLE|service_role_key|serviceRoleKey/i;
    const offenders = appFiles.filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("proforma_bank_instructions") && serviceRole.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("exposes only the masked bank header on an issued proforma (data-model §3.1: safe for auditors)", () => {
    const issue = body("issue_proforma");
    const masked = issue.slice(issue.indexOf("v_masked := jsonb_build_object("), issue.indexOf("insert into public.proforma_invoices ("));
    expect([...masked.matchAll(/'([a-z_0-9]+)',\s*(?:v_quote|v_account|v_iban)/g)].map((m) => m[1]).sort())
      .toEqual(["account_name", "account_number_last4", "bank_name", "iban_last4", "swift_code"]);
    expect(issue).toContain("else '****' || right(v_quote ->> 'bank_account_number', 4) end;");
    expect(issue).toContain("else '****' || right(v_quote ->> 'bank_iban', 4) end;");
    expect(masked).not.toMatch(/'bank_account_number'\)|'bank_iban'\)|'account_number',|'iban',/);
  });

  it("re-authorizes the caller under the order lock before any idempotent replay (review B3)", () => {
    const issue = body("issue_proforma");
    const lock = issue.indexOf("from public.orders where id = p_order_id for update");
    const member = issue.indexOf("not public.is_org_member(v_order.buyer_organization_id)");
    const assert = issue.indexOf("perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);");
    const begin = issue.indexOf("v_replay := public.commerce_request_begin(");
    const replay = issue.indexOf("if v_replay is not null then return v_replay; end if;");
    for (const index of [lock, member, assert, begin, replay]) expect(index).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(member);
    expect(member).toBeLessThan(assert);
    expect(assert).toBeLessThan(begin);
    expect(begin).toBeLessThan(replay);
    expect(issue.match(/commerce_request_begin\(/g)).toHaveLength(1);
    expect(issue.match(/return v_replay/g)).toHaveLength(1);
    // Every write stays after the request log.
    expect(begin).toBeLessThan(issue.search(/\b(?:insert into|update)\s+public\./i));
    // Non-enumeration: a non-member gets the same code as a missing order, here and in the estimate.
    expect(body("estimate_cart")).toContain("if not found or not public.is_org_member(v_org_id) then raise exception 'order_not_found'; end if;");
  });

  it("H1 re-authorizes every protected M4a replay path before request-log lookup", () => {
    const buyerFunctions = ["add_cart_line", "upsert_delivery_destination"];
    for (const name of buyerFunctions) {
      const fn = body(name);
      expect(fn.indexOf("commerce_assert_buyer_member")).toBeLessThan(fn.indexOf("commerce_request_begin"));
    }
    const retirement = body("retire_delivery_destination");
    expect(retirement.indexOf("perform public.commerce_assert_buyer_member(v_destination.organization_id);")).toBeLessThan(retirement.indexOf("commerce_request_begin"));
    for (const name of ["update_commerce_settings", "set_default_payment_account", "admin_convert_legacy_draft"]) {
      const fn = body(name);
      expect(fn.indexOf("if not public.is_platform_admin()")).toBeLessThan(fn.indexOf("commerce_request_begin"));
      expect(fn.indexOf("if not public.mfa_satisfied()")).toBeLessThan(fn.indexOf("commerce_request_begin"));
    }
    for (const name of [...buyerFunctions, "retire_delivery_destination", "update_commerce_settings", "set_default_payment_account", "admin_convert_legacy_draft"]) {
      const fn = body(name);
      expect(fn.match(/commerce_request_begin\(/g)).toHaveLength(1);
      expect(fn.indexOf("commerce_request_begin")).toBeLessThan(fn.search(/\b(?:insert into|update)\s+public\./i));
    }
  });

  it("H2 replaces direct buyer table access with explicit safe and internal financial projections", () => {
    expect(forward).toContain("drop policy order_financials_read on public.order_financials;");
    expect(forward).toContain("create policy order_financials_internal_read on public.order_financials");
    expect(forward).toContain("revoke select on table public.order_financials from public, anon, authenticated;");
    expect(forward).toContain("create function public.buyer_order_financial_rows()");
    expect(forward).toContain("create function public.internal_order_financial_rows()");
    expect(forward).toContain("create view public.v_buyer_order_financials");
    expect(forward).toContain("create view public.v_internal_order_financials");
    const buyerStart = forward.indexOf("create function public.buyer_order_financial_rows()");
    const buyer = forward.slice(buyerStart, forward.indexOf("$function$;", buyerStart));
    expect(buyer).toContain("buyer_total_amount");
    expect(buyer).not.toMatch(/commission_amount|seller_net_amount|hills_share_amount|commission_policy_id/i);
    const internalStart = forward.indexOf("create function public.internal_order_financial_rows()");
    const internal = forward.slice(internalStart, forward.indexOf("$function$;", internalStart));
    expect(internal).toMatch(/is_finance_operator\([\s\S]*is_platform_admin\([\s\S]*is_auditor\(/);
  });

  it("revokes direct quote execution and guards rollback against PII", () => {
    expect(forward).toContain("revoke all on function public.compute_order_quote(uuid,uuid,text) from public, anon, authenticated, service_role;");
    expect(forward).toContain("grant execute on function public.issue_proforma(uuid,uuid,text,uuid) to authenticated;");
    expect(rollback).toContain("feature_013_m4b_rollback_requires_no_issued_snapshots");
    expect(rollback).toContain("destination_snapshot is not null");
    expect(postflight).toContain("no destination PII keys in orders audit payloads");
    expect(postflight).toContain("global checkout remains off");
  });
});
