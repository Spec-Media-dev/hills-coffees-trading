/** Applied-state UAE quote/issuance proof. All synthetic configuration and orders roll back. */
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const ID = {
  buyer: "debffa4e-5105-400d-b6a5-6d9c4887250a", org: "13000000-0000-4000-8000-000000000001",
  offer: "13000000-0000-4000-8000-000000000063", factor: "13000000-0000-4000-8000-00000000b421",
  tax: "13000000-0000-4000-8000-00000000b422", exactShipping: "13000000-0000-4000-8000-00000000b423",
  fallbackShipping: "13000000-0000-4000-8000-00000000b424", uaeOrder: "13000000-0000-4000-8000-00000000b425",
  nonUaeOrder: "13000000-0000-4000-8000-00000000b426", uaeDestination: "13000000-0000-4000-8000-00000000b427",
  nonUaeDestination: "13000000-0000-4000-8000-00000000b428", uaeRequest: "13000000-0000-4000-8000-00000000b429",
  nonUaeRequest: "13000000-0000-4000-8000-00000000b430",
  paymentAccount: "13000000-0000-4000-8000-00000000b431",
} as const;
const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_quote_proof_not_local_target'; end if;
  if to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null then raise exception 'f013_quote_proof_m4b_not_applied'; end if;
end $identity$;
create temp table quote_results (check_name text, passed boolean) on commit drop;
create temp table quote_outcomes (name text, outcome text) on commit drop;
create function pg_temp.issue(p_order uuid, p_destination uuid, p_request uuid) returns text language plpgsql as $f$
declare v jsonb; begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${ID.buyer}', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
  begin v := public.issue_proforma(p_order, p_destination, null, p_request); exception when others then
    perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); return sqlerrm;
  end;
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
  return 'OK';
end $f$;
create function pg_temp.try_sql(p_sql text) returns text language plpgsql as $f$
declare v text := 'accepted'; begin begin execute p_sql; exception when others then v := sqlerrm; end; return v; end $f$;

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
  values ('${ID.factor}', '${ID.buyer}', 'f013-quote-proof', 'totp', 'verified', now(), now());
insert into public.tax_rules (id, country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from)
  values ('${ID.tax}', 'AE', 'VAT', 5, 'MERCHANDISE_AND_SHIPPING', true, now() - interval '2 seconds');
-- The NULL-country fallback is deliberately newer. Exact AE must still win.
insert into public.shipping_rules (id, country_code, delivery_method, flat_fee, currency, is_active, effective_from) values
  ('${ID.exactShipping}', 'AE', 'Courier', 7.00, 'USD', true, now() - interval '2 seconds'),
  ('${ID.fallbackShipping}', null, 'Courier', 99.00, 'USD', true, now() - interval '1 second');
update public.payment_accounts set is_default_for_currency = false where currency = 'USD' and is_default_for_currency;
insert into public.payment_accounts (id, account_name, bank_name, account_number, swift_code, currency, is_active, is_default_for_currency, created_by)
  values ('${ID.paymentAccount}', 'SYNTHETIC', 'SYNTHETIC', 'SYNTHETIC-ACCOUNT-1234', 'SYNTHXXX', 'USD', true, true, '${ID.buyer}');
insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, created_by) values
  ('${ID.uaeDestination}', '${ID.org}', 'SYNTHETIC-UAE', 'AE', 'Dubai', 'SYNTHETIC', 'SYNTHETIC', '+97140000001', 'Courier', '${ID.buyer}'),
  ('${ID.nonUaeDestination}', '${ID.org}', 'SYNTHETIC-NON-UAE', 'SA', 'Riyadh', 'SYNTHETIC', 'SYNTHETIC', '+97140000001', 'Courier', '${ID.buyer}');
insert into public.orders (id, buyer_organization_id, created_by, commerce_flow) values
  ('${ID.uaeOrder}', '${ID.org}', '${ID.buyer}', 'BANK_TRANSFER_V1'),
  ('${ID.nonUaeOrder}', '${ID.org}', '${ID.buyer}', 'BANK_TRANSFER_V1');
insert into public.order_items (order_id, offer_id, quantity_kg) values
  ('${ID.uaeOrder}', '${ID.offer}', 1), ('${ID.nonUaeOrder}', '${ID.offer}', 1);
update public.commerce_settings set bank_transfer_checkout_enabled = true, pilot_organization_ids = '{}';

insert into quote_outcomes select 'UAE', pg_temp.issue('${ID.uaeOrder}', '${ID.uaeDestination}', '${ID.uaeRequest}');
insert into quote_results select 'UAE issuance succeeds', outcome = 'OK' from quote_outcomes where name = 'UAE';
insert into quote_results values ('UAE exact shipping rule beats newer general fallback',
  (select shipping_rule_id = '${ID.exactShipping}'::uuid from public.proforma_fulfillment_groups where proforma_id = (select current_proforma_id from public.orders where id = '${ID.uaeOrder}')));
insert into quote_results values ('UAE VAT rule and component rounding are persisted',
  (select tax_rule_id = '${ID.tax}'::uuid and tax_rate_snapshot = 5 and tax_base_snapshot = 'MERCHANDISE_AND_SHIPPING'
    and vat_total = (select coalesce(sum(vat_amount), 0) from public.proforma_invoice_items where proforma_id = p.id)
      + (select coalesce(sum(shipping_vat_amount), 0) from public.proforma_fulfillment_groups where proforma_id = p.id)
    and (select bool_and(shipping_vat_amount = round(shipping_amount * 5 / 100, 2)) from public.proforma_fulfillment_groups where proforma_id = p.id)
   from public.proforma_invoices p where p.id = (select current_proforma_id from public.orders where id = '${ID.uaeOrder}')));
insert into quote_results values ('UAE buyer total reconciles header, groups, and persisted financials',
  (select p.buyer_total = p.merchandise_net + p.shipping_total + p.vat_total
    and f.buyer_total_amount = p.buyer_total and f.shipping_amount = p.shipping_total and f.vat_amount = p.vat_total
   from public.proforma_invoices p join public.order_financials f on f.proforma_id = p.id
   where p.id = (select current_proforma_id from public.orders where id = '${ID.uaeOrder}')));
insert into quote_results values ('issued snapshot header is immutable',
  pg_temp.try_sql(format('update public.proforma_invoices set buyer_total = 0 where id = %L', (select current_proforma_id from public.orders where id = '${ID.uaeOrder}'))) like '%proforma_snapshot_immutable%');
insert into quote_results values ('issued financial totals are immutable',
  pg_temp.try_sql(format('update public.order_financials set vat_amount = 0 where order_id = %L', '${ID.uaeOrder}')) like '%order_financials_frozen%');
insert into quote_outcomes select 'NON_UAE', pg_temp.issue('${ID.nonUaeOrder}', '${ID.nonUaeDestination}', '${ID.nonUaeRequest}');
insert into quote_results select 'non-UAE issuance safely refuses', outcome like '%destination_tax_unsupported%' from quote_outcomes where name = 'NON_UAE';
insert into quote_results values ('non-UAE refusal leaves no partial snapshot', not exists (select 1 from public.proforma_invoices where order_id = '${ID.nonUaeOrder}') and not exists (select 1 from public.order_financials where order_id = '${ID.nonUaeOrder}') and (select current_proforma_id is null from public.orders where id = '${ID.nonUaeOrder}'));
\\pset format unaligned
\\pset tuples_only on
select 'OUTCOME', name, outcome from quote_outcomes order by name;
select 'RESULT', check_name, passed from quote_results order by check_name;
rollback;
`;
const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("UAE quote proof did not roll back");
const rows = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|")).map((line) => line.split("|"));
for (const line of result.stdout.split(/\r?\n/).filter((candidate) => candidate.startsWith("OUTCOME|"))) console.log(line);
if (rows.length !== 8) throw new Error(`UAE quote proof returned ${rows.length}/8 results`);
let failed = false;
for (const [, name, passed] of rows) { const ok = passed === "t"; failed ||= !ok; console.log(`${ok ? "PASS" : "FAIL"} ${name}`); }
if (failed) throw new Error("UAE quote proof failed");
console.log("UAE VAT, exact-shipping precedence, non-UAE safe refusal, and issued snapshot/total integrity proven on applied LOCAL; transaction rolled back.");
