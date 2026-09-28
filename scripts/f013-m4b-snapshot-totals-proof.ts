/**
 * Feature 013 M4b MP-6 (T077/T082 acceptance, T081 step 10) — applied-state snapshot/totals proof on the pinned LOCAL
 * database, through the REAL `issue_proforma` (not hand-written snapshot rows).
 *
 * Why not the T037 proof: T037 is the M2b proof. It references production-generated identities (the Foundation buyer
 * user and the production AE tax rule) that do not exist in the retained T071 LOCAL state. It also asserts the
 * pre-M3 ACL "authenticated cannot read a snapshot table", which M3 legitimately changed, and it hand-inserts the
 * snapshot instead of exercising M4b. Swapping identities would therefore require weakening an assertion.
 *
 * ONE transaction that always ends in ROLLBACK. The fixture is minimal, synthetic and in-transaction: tax, shipping,
 * commission and bank configuration, one AE destination, and V1 orders on the retained T071 listings (S1 W1/W2,
 * S2 W2, Hills W1). Nothing touches row 94 or the historical order `…1f01`, and nothing re-creates a destination
 * snapshot outside `issue_proforma`. Only check names, error codes and PASS/FAIL are printed (no bank or destination
 * values).
 */
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();

const U = { buyer: "debffa4e-5105-400d-b6a5-6d9c4887250a", admin: "e50e4106-41f4-44f5-891a-46ec8ffb1abe" } as const;
const ORG = "13000000-0000-4000-8000-000000000001";
const OFFER = {
  s1w1: "13000000-0000-4000-8000-000000000061", // S1 member, W1, 11.40/kg
  s2w2: "13000000-0000-4000-8000-000000000062", // S2 member, W2, 9.85/kg
  hillsW1: "13000000-0000-4000-8000-000000000063", // Hills, W1, 12.20/kg
  s1w2: "13000000-0000-4000-8000-000000000064", // S1 member, W2, 10.05/kg
} as const;
const id = (n: number) => `13000000-0000-4000-8000-00000000b5${n.toString(16).padStart(2, "0")}`;
const ID = {
  taxMerch: id(1), taxMerchShip: id(2), shipExact: id(3), shipFallback: id(4), policy: id(5), tierLow: id(6),
  tierHigh: id(7), account: id(8), destination: id(9),
  matrix: id(16), basis: id(17), fallback: id(18), noTax: id(19), noBank: id(20), noCommission: id(21), noShipping: id(22),
  reqMatrix: id(32), reqMatrix2: id(33), reqBasis: id(34), reqFallback: id(35), reqNoTax: id(36), reqNoBank: id(37),
  reqNoCommission: id(38), reqNoShipping: id(39),
} as const;
const SYNTHETIC_ACCOUNT = "F013B5-SYNTHETIC-ACCOUNT-00001234";

const sql = `begin;
set local lock_timeout = '5s';
do $identity$ begin
  if to_regclass('f013_local.identity') is null then raise exception 'f013_snapshot_proof_not_local_target'; end if;
  if to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null then raise exception 'f013_snapshot_proof_m4b_not_applied'; end if;
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then raise exception 'f013_snapshot_proof_checkout_not_off'; end if;
end $identity$;

create temp table r (name text, ok boolean, got text) on commit drop;
create temp table baseline (k text primary key, v text) on commit drop;

create function pg_temp.as_buyer() returns void language plpgsql as $f$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${U.buyer}', 'role', 'authenticated', 'aal', 'aal2')::text, true);
  perform set_config('role', 'authenticated', true);
end $f$;
create function pg_temp.as_owner() returns void language plpgsql as $f$ begin
  perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true);
end $f$;
create function pg_temp.issue(p_order uuid, p_request uuid) returns text language plpgsql as $f$
declare v jsonb; begin
  perform pg_temp.as_buyer();
  begin v := public.issue_proforma(p_order, '${ID.destination}', null, p_request);
  exception when others then perform pg_temp.as_owner(); return 'ERR:' || sqlerrm; end;
  perform pg_temp.as_owner();
  return v::text;
end $f$;
create function pg_temp.estimate(p_order uuid) returns jsonb language plpgsql as $f$
declare v jsonb; begin
  perform pg_temp.as_buyer();
  v := public.estimate_cart(p_order, '${ID.destination}', null);
  perform pg_temp.as_owner();
  return v;
end $f$;
create function pg_temp.try_sql(p_sql text) returns text language plpgsql as $f$
declare v text := 'accepted'; begin begin execute p_sql; exception when others then v := sqlerrm; end; return v; end $f$;
create function pg_temp.check(p_name text, p_ok boolean, p_got text default null) returns void language sql as $f$
  insert into r values (p_name, coalesce(p_ok, false), p_got);
$f$;
-- Every frozen artefact of an order's current proforma, byte-for-byte (AC-007).
create function pg_temp.fp(p_order uuid) returns text language sql as $f$
  with p as (select current_proforma_id id from public.orders where id = p_order)
  select md5(concat_ws('#',
    (select to_jsonb(x)::text from public.proforma_invoices x where x.id = (select id from p)),
    (select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.proforma_invoice_items x where x.proforma_id = (select id from p)),
    (select string_agg(to_jsonb(x)::text, ',' order by x.proforma_item_id) from public.proforma_line_economics x where x.proforma_id = (select id from p)),
    (select string_agg(to_jsonb(x)::text, ',' order by x.id) from public.proforma_fulfillment_groups x where x.proforma_id = (select id from p)),
    (select string_agg(to_jsonb(x)::text, ',' order by x.seller_organization_id) from public.proforma_seller_settlements x where x.proforma_id = (select id from p)),
    (select string_agg(to_jsonb(x)::text, ',') from public.proforma_bank_instructions x where x.proforma_id = (select id from p)),
    (select to_jsonb(x)::text from public.order_financials x where x.order_id = p_order),
    (select coalesce(destination_snapshot::text, 'null') || delivery_destination_id::text from public.orders where id = p_order)));
$f$;
-- Nothing was written for a refused order: no proforma, financials, snapshot, request-log row or notification.
create function pg_temp.untouched(p_order uuid, p_request uuid) returns boolean language sql as $f$
  select not exists (select 1 from public.proforma_invoices where order_id = p_order)
     and not exists (select 1 from public.order_financials where order_id = p_order)
     and not exists (select 1 from public.commerce_request_log where request_id = p_request)
     and not exists (select 1 from public.notification_events where audience ->> 'order_id' = p_order::text)
     and (select status = 'DRAFT' and destination_snapshot is null and current_proforma_id is null from public.orders where id = p_order);
$f$;
create function pg_temp.missing_case(p_name text, p_toggle text, p_order uuid, p_request uuid, p_code text) returns void language plpgsql as $f$
declare v text; w boolean;
begin
  begin
    execute p_toggle;
    v := pg_temp.issue(p_order, p_request);
    w := pg_temp.untouched(p_order, p_request);
    raise exception 'F013_UNDO';
  exception when others then
    if sqlerrm <> 'F013_UNDO' then v := 'SETUP:' || sqlerrm; w := false; end if;
  end;
  perform pg_temp.check(p_name, v = 'ERR:' || p_code and w, v);
end $f$;

-- AC-001 baseline: every reserved quantity and every reservation row before any issuance.
insert into baseline values
  ('offers', (select md5(coalesce(string_agg(id::text || ':' || reserved_quantity_kg::text, ',' order by id), '')) from public.coffee_offers)),
  ('positions', (select md5(coalesce(string_agg(id::text || ':' || reserved_quantity_kg::text, ',' order by id), '')) from public.inventory_positions)),
  ('reservations', (select count(*)::text from public.inventory_reservations)),
  ('audit_start', (select coalesce(max(id), 0)::text from public.audit_logs));

-- Cart AC-001 (M4a, applied state): real cart RPCs as the buyer (add, update, remove) reserve nothing; the ledger baseline
-- above is compared once at the end, after the cart operations AND every issuance.
create function pg_temp.cart_ops() returns text language plpgsql as $f$
declare v jsonb; v_line uuid; begin
  perform pg_temp.as_buyer();
  begin
    v := public.add_cart_line('${ORG}', '${OFFER.s2w2}', 3, gen_random_uuid());
    v_line := (v ->> 'line_id')::uuid;
    perform public.add_cart_line('${ORG}', '${OFFER.hillsW1}', 2, gen_random_uuid());
    perform public.update_order_item_quantity(v_line, 4);
    perform public.remove_order_item(v_line);
  exception when others then perform pg_temp.as_owner(); return 'ERR:' || sqlerrm; end;
  perform pg_temp.as_owner();
  return 'OK';
end $f$;
select pg_temp.check('cart: add_cart_line ×2, update_order_item_quantity and remove_order_item succeed as the buyer', pg_temp.cart_ops() = 'OK');
select pg_temp.check('cart: the operations touched only the organization''s V1 DRAFT cart (no new reservation, no status change)',
  (select count(*) = 1 and bool_and(status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1') from public.orders
   where buyer_organization_id = '${ORG}' and commerce_flow = 'BANK_TRANSFER_V1' and status = 'DRAFT' and id not in (
     '${ID.matrix}', '${ID.basis}', '${ID.fallback}', '${ID.noTax}', '${ID.noBank}', '${ID.noCommission}', '${ID.noShipping}')));

-- Synthetic in-transaction configuration.
insert into public.tax_rules (id, country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from)
  values ('${ID.taxMerch}', 'AE', 'VAT', 5, 'MERCHANDISE_ONLY', true, now() - interval '1 hour');
insert into public.shipping_rules (id, country_code, delivery_method, flat_fee, currency, is_active, effective_from) values
  ('${ID.shipExact}', 'AE', 'Courier', 7.00, 'USD', true, now() - interval '1 hour'),
  ('${ID.shipFallback}', null, 'Courier', 99.00, 'USD', true, now() - interval '1 minute');
insert into public.commission_policies (id, name, status, effective_from, created_by)
  values ('${ID.policy}', 'F013 B5 synthetic', 'ACTIVE', now() - interval '1 hour', '${U.admin}');
insert into public.commission_tiers (id, policy_id, min_quantity_kg, max_quantity_kg, percentage) values
  ('${ID.tierLow}', '${ID.policy}', 0, 100, 5), ('${ID.tierHigh}', '${ID.policy}', 100, null, 3);
update public.payment_accounts set is_default_for_currency = false where currency = 'USD' and is_default_for_currency;
insert into public.payment_accounts (id, account_name, bank_name, account_number, swift_code, currency, is_active, is_default_for_currency, created_by)
  values ('${ID.account}', 'SYNTHETIC', 'SYNTHETIC', '${SYNTHETIC_ACCOUNT}', 'SYNTHXXX', 'USD', true, true, '${U.admin}');
insert into public.delivery_destinations (id, organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, created_by)
  values ('${ID.destination}', '${ORG}', 'SYNTHETIC-B5', 'AE', 'Dubai', 'SYNTHETIC', 'SYNTHETIC', '+97140000001', 'Courier', '${U.buyer}');
update public.commerce_settings set bank_transfer_checkout_enabled = true, pilot_organization_ids = '{}';

insert into public.orders (id, buyer_organization_id, created_by) values
  ('${ID.matrix}', '${ORG}', '${U.buyer}'), ('${ID.basis}', '${ORG}', '${U.buyer}'), ('${ID.fallback}', '${ORG}', '${U.buyer}'),
  ('${ID.noTax}', '${ORG}', '${U.buyer}'), ('${ID.noBank}', '${ORG}', '${U.buyer}'), ('${ID.noCommission}', '${ORG}', '${U.buyer}'),
  ('${ID.noShipping}', '${ORG}', '${U.buyer}');
-- Matrix: S1 60 kg (W1) + S1 45 kg (W2) → Q_S1 = 105 (tier ≥ 100 → 3 %); S2 20 kg → Q_S2 = 20 (5 %, NOT the 135 kg order
-- total); Hills 10 kg. Four seller×warehouse groups.
insert into public.order_items (order_id, offer_id, quantity_kg) values
  ('${ID.matrix}', '${OFFER.s1w1}', 60), ('${ID.matrix}', '${OFFER.s1w2}', 45), ('${ID.matrix}', '${OFFER.s2w2}', 20), ('${ID.matrix}', '${OFFER.hillsW1}', 10),
  ('${ID.basis}', '${OFFER.hillsW1}', 5), ('${ID.fallback}', '${OFFER.hillsW1}', 1),
  ('${ID.noTax}', '${OFFER.hillsW1}', 1), ('${ID.noBank}', '${OFFER.hillsW1}', 1), ('${ID.noCommission}', '${OFFER.s2w2}', 1),
  ('${ID.noShipping}', '${OFFER.hillsW1}', 1);
select pg_temp.check('fixture: every order is a BANK_TRANSFER_V1 DRAFT and carries no snapshot yet',
  (select bool_and(commerce_flow = 'BANK_TRANSFER_V1' and status = 'DRAFT' and destination_snapshot is null) from public.orders
   where id in ('${ID.matrix}', '${ID.basis}', '${ID.fallback}', '${ID.noTax}', '${ID.noBank}', '${ID.noCommission}', '${ID.noShipping}')));

-- Fail-closed configuration (FR-042): named error, nothing written. compute_order_quote order: tax, bank, commission, shipping.
select pg_temp.missing_case('missing tax rule → tax_rule_missing, nothing written',
  'update public.tax_rules set is_active = false where country_code = ''AE''', '${ID.noTax}', '${ID.reqNoTax}', 'tax_rule_missing');
select pg_temp.missing_case('missing default bank account → bank_account_missing, nothing written',
  'update public.payment_accounts set is_default_for_currency = false where currency = ''USD''', '${ID.noBank}', '${ID.reqNoBank}', 'bank_account_missing');
select pg_temp.missing_case('missing commission rule for a member line → commission_rule_missing, nothing written',
  'update public.commission_policies set status = ''ARCHIVED'' where id = ''${ID.policy}''', '${ID.noCommission}', '${ID.reqNoCommission}', 'commission_rule_missing');
select pg_temp.missing_case('missing shipping rule → shipping_rule_missing, nothing written',
  'update public.shipping_rules set is_active = false where delivery_method = ''Courier''', '${ID.noShipping}', '${ID.reqNoShipping}', 'shipping_rule_missing');

-- Buyer-facing estimate equals the later issued total and carries no internal economics.
insert into baseline select 'estimate_basis', pg_temp.estimate('${ID.matrix}')::text;
select pg_temp.check('estimate_cart: buyer-facing keys only (no commission, seller net, Hills share, bank or destination contact)',
  not ((select v from baseline where k = 'estimate_basis')::jsonb::text ~ '(commission|seller_net|hills_share|bank_|account_number|iban|contact_phone|tax_number)'),
  (select string_agg(k, ',' order by k) from jsonb_object_keys((select v from baseline where k = 'estimate_basis')::jsonb) k));

-- Issue the matrix proforma (MERCHANDISE_ONLY 5 %).
insert into baseline select 'matrix_result', pg_temp.issue('${ID.matrix}', '${ID.reqMatrix}');
select pg_temp.check('matrix: issue_proforma succeeds', (select v not like 'ERR:%' from baseline where k = 'matrix_result'),
  (select case when v like 'ERR:%' then v else 'ok' end from baseline where k = 'matrix_result'));
select pg_temp.check('deferred snapshot-balance checks pass at commit time (SET CONSTRAINTS ALL IMMEDIATE)',
  pg_temp.try_sql('set constraints all immediate') = 'accepted', pg_temp.try_sql('set constraints all immediate'));
set constraints all deferred;

select pg_temp.check('matrix header to the cent: gross 1455.25, discount 0, net 1455.25, shipping 28.00, VAT 72.76, total 1556.01',
  (select merchandise_gross = 1455.25 and discount_total = 0 and merchandise_net = 1455.25 and shipping_total = 28.00
      and vat_total = 72.76 and buyer_total = 1556.01 and version = 1 and status = 'ISSUED' and tax_rule_id = '${ID.taxMerch}'
      and tax_rate_snapshot = 5 and tax_base_snapshot = 'MERCHANDISE_ONLY' and validity_hours_snapshot = 24
      and valid_until = issued_at + interval '24 hours'
   from public.proforma_invoices where id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('matrix lines to the cent (gross / VAT / commission / seller net / Hills share, with half-cent rounding)',
  (select count(*) = 4 and bool_and(case i.offer_id
      when '${OFFER.s1w1}' then i.gross_amount = 684.00 and i.vat_amount = 34.20 and e.commission_rate_snapshot = 3 and e.seller_qualifying_quantity_kg = 105
        and e.commission_amount = 20.52 and e.seller_net_amount = 663.48 and e.hills_share_amount = 20.52 and e.commission_tier_id = '${ID.tierHigh}'
      when '${OFFER.s1w2}' then i.gross_amount = 452.25 and i.vat_amount = 22.61 and e.commission_rate_snapshot = 3 and e.seller_qualifying_quantity_kg = 105
        and e.commission_amount = 13.57 and e.seller_net_amount = 438.68 and e.hills_share_amount = 13.57 and e.commission_tier_id = '${ID.tierHigh}'
      when '${OFFER.s2w2}' then i.gross_amount = 197.00 and i.vat_amount = 9.85 and e.commission_rate_snapshot = 5 and e.seller_qualifying_quantity_kg = 20
        and e.commission_amount = 9.85 and e.seller_net_amount = 187.15 and e.hills_share_amount = 9.85 and e.commission_tier_id = '${ID.tierLow}'
      when '${OFFER.hillsW1}' then i.gross_amount = 122.00 and i.vat_amount = 6.10 and e.commission_rate_snapshot is null and e.commission_amount = 0
        and e.seller_net_amount = 0 and e.hills_share_amount = 122.00 and e.seller_type_snapshot = 'HILLS'
      else false end and i.discount_amount = 0 and i.net_amount = i.gross_amount and i.line_total = i.net_amount + i.vat_amount)
   from public.proforma_invoice_items i join public.proforma_line_economics e on e.proforma_item_id = i.id
   where i.proforma_id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('FIN-013: S1 tier uses only S1''s own 105 kg; S2 stays on the 5 % tier although the order holds 135 kg',
  (select bool_and(case seller_organization_id
      when '13000000-0000-4000-8000-000000000003' then seller_qualifying_quantity_kg = 105 and commission_rate_snapshot = 3
      when '13000000-0000-4000-8000-000000000004' then seller_qualifying_quantity_kg = 20 and commission_rate_snapshot = 5
      else seller_type_snapshot = 'HILLS' end)
   from public.proforma_seller_settlements where proforma_id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('FIN-007: seller settlements to the cent (S1 1136.25/34.09/1102.16, S2 197.00/9.85/187.15, Hills 122.00/0/0/122.00)',
  (select count(*) = 3 and bool_and(case seller_organization_id
      when '13000000-0000-4000-8000-000000000003' then gross_amount = 1136.25 and commission_amount = 34.09 and seller_net_amount = 1102.16 and hills_share_amount = 34.09 and buyer_net_amount = 1136.25
      when '13000000-0000-4000-8000-000000000004' then gross_amount = 197.00 and commission_amount = 9.85 and seller_net_amount = 187.15 and hills_share_amount = 9.85 and buyer_net_amount = 197.00
      when '13000000-0000-4000-8000-000000000005' then gross_amount = 122.00 and commission_amount = 0 and seller_net_amount = 0 and hills_share_amount = 122.00 and buyer_net_amount = 122.00
      else false end)
   from public.proforma_seller_settlements where proforma_id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('shipping groups: four seller×warehouse groups, exact AE rule 7.00 each (not the newer 99.00 fallback), merchandise per group to the cent',
  (select count(*) = 4 and bool_and(shipping_rule_id = '${ID.shipExact}' and shipping_amount = 7.00 and shipping_vat_amount = 0)
      and sum(merchandise_net_amount) = 1455.25
      and bool_or(seller_organization_id = '13000000-0000-4000-8000-000000000003' and merchandise_net_amount = 684.00)
      and bool_or(seller_organization_id = '13000000-0000-4000-8000-000000000003' and merchandise_net_amount = 452.25)
      and bool_or(seller_organization_id = '13000000-0000-4000-8000-000000000004' and merchandise_net_amount = 197.00)
      and bool_or(seller_organization_id = '13000000-0000-4000-8000-000000000005' and merchandise_net_amount = 122.00)
   from public.proforma_fulfillment_groups where proforma_id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('order_financials summarize the proforma to the cent (commission 43.94, seller net 1289.31, Hills share 165.94, 135 kg)',
  (select f.proforma_id = o.current_proforma_id and f.base_subtotal = 1455.25 and f.shipping_amount = 28.00 and f.vat_amount = 72.76
      and f.buyer_total_amount = 1556.01 and f.commission_amount = 43.94 and f.seller_net_amount = 1289.31 and f.hills_share_amount = 165.94
      and f.total_quantity_kg = 135 and f.seller_net_amount + f.hills_share_amount = f.base_subtotal
   from public.order_financials f join public.orders o on o.id = f.order_id where f.order_id = '${ID.matrix}'));
select pg_temp.check('buyer estimate before issuance equals the issued buyer total (1556.01)',
  (select (v::jsonb ->> 'buyer_total')::numeric = 1556.01 from baseline where k = 'estimate_basis'));
select pg_temp.check('order moved to PROFORMA_ISSUED with the frozen destination snapshot and pointer',
  (select o.status = 'PROFORMA_ISSUED' and o.delivery_destination_id = '${ID.destination}' and o.destination_snapshot = p.destination_snapshot
      and o.destination_snapshot ->> 'city' = 'Dubai' and p.destination_snapshot ?& array['label','country_code','city','address_lines','contact_name','contact_phone','delivery_method']
   from public.orders o join public.proforma_invoices p on p.id = o.current_proforma_id where o.id = '${ID.matrix}'));
select pg_temp.check('bank snapshot: full instructions stored once; header holds only the masked last-4',
  (select count(*) = 1 and bool_and(b.account_number = '${SYNTHETIC_ACCOUNT}' and b.payment_account_id = '${ID.account}') from public.proforma_bank_instructions b
   where b.proforma_id = (select current_proforma_id from public.orders where id = '${ID.matrix}'))
  and (select bank_account_masked ->> 'account_number_last4' = '****1234' and bank_account_masked::text not like '%${SYNTHETIC_ACCOUNT}%'
   from public.proforma_invoices where id = (select current_proforma_id from public.orders where id = '${ID.matrix}')));
select pg_temp.check('proforma.issued notification emitted once for the matrix proforma',
  (select count(*) = 1 and bool_and(event_type = 'proforma.issued' and aggregate_id = (select current_proforma_id from public.orders where id = '${ID.matrix}')) from public.notification_events where audience ->> 'order_id' = '${ID.matrix}'));

-- Idempotency after issuance: same request id → identical stored response; a new request id → proforma_still_valid.
select pg_temp.check('same request id replays the identical stored response',
  pg_temp.issue('${ID.matrix}', '${ID.reqMatrix}') = (select v from baseline where k = 'matrix_result'));
select pg_temp.check('a second issuance while v1 is valid is refused (proforma_still_valid)',
  pg_temp.issue('${ID.matrix}', '${ID.reqMatrix2}') = 'ERR:proforma_still_valid');

-- AC-007: edit every input after issue; every snapshot artefact stays byte-identical. valid_until never moves.
insert into baseline select 'fp_matrix', pg_temp.fp('${ID.matrix}');
insert into baseline select 'valid_until', valid_until::text from public.proforma_invoices where id = (select current_proforma_id from public.orders where id = '${ID.matrix}');
select pg_temp.check('AC-007 edit applied: tax rate 5 → 10', pg_temp.try_sql('update public.tax_rules set rate_percentage = 10 where id = ''${ID.taxMerch}''') = 'accepted');
select pg_temp.check('AC-007 edit applied: shipping fee 7.00 → 8.00', pg_temp.try_sql('update public.shipping_rules set flat_fee = 8.00 where id = ''${ID.shipExact}''') = 'accepted');
select pg_temp.check('AC-007 edit applied: commission tier 3 % → 4 %', pg_temp.try_sql('update public.commission_tiers set percentage = 4 where id = ''${ID.tierHigh}''') = 'accepted');
select pg_temp.check('AC-007 edit applied: bank account number', pg_temp.try_sql('update public.payment_accounts set account_number = ''F013B5-CHANGED-99999999'' where id = ''${ID.account}''') = 'accepted');
select pg_temp.check('AC-007 edit applied: listing price 12.20 → 13.00', pg_temp.try_sql('update public.coffee_offers set price_per_kg = 13.00 where id = ''${OFFER.hillsW1}''') = 'accepted',
  pg_temp.try_sql('update public.coffee_offers set price_per_kg = 13.00 where id = ''${OFFER.hillsW1}'''));
select pg_temp.check('AC-007 edit applied: saved destination city', pg_temp.try_sql('update public.delivery_destinations set city = ''Sharjah'' where id = ''${ID.destination}''') = 'accepted');
select pg_temp.check('validity setting change applied: 24 h → 48 h', pg_temp.try_sql('update public.commerce_settings set proforma_validity_hours = 48') = 'accepted');
select pg_temp.check('AC-007: every snapshot artefact is byte-identical after all edits',
  pg_temp.fp('${ID.matrix}') = (select v from baseline where k = 'fp_matrix'));
select pg_temp.check('valid_until did not move after the validity setting change',
  (select valid_until::text from public.proforma_invoices where id = (select current_proforma_id from public.orders where id = '${ID.matrix}')) = (select v from baseline where k = 'valid_until'));
select pg_temp.check('frozen destination snapshot still says Dubai after the saved destination was edited',
  (select destination_snapshot ->> 'city' = 'Dubai' from public.orders where id = '${ID.matrix}'));
update public.tax_rules set rate_percentage = 5, is_active = false where id = '${ID.taxMerch}';
update public.shipping_rules set flat_fee = 7.00 where id = '${ID.shipExact}';
select pg_temp.try_sql('update public.coffee_offers set price_per_kg = 12.20 where id = ''${OFFER.hillsW1}''');

-- Second VAT basis: MERCHANDISE_AND_SHIPPING 5 %. Hills 5 kg: 61.00 + VAT 3.05 + shipping 7.00 + shipping VAT 0.35 = 71.40.
insert into public.tax_rules (id, country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from)
  values ('${ID.taxMerchShip}', 'AE', 'VAT', 5, 'MERCHANDISE_AND_SHIPPING', true, now() - interval '30 minutes');
select pg_temp.check('VAT basis MERCHANDISE_AND_SHIPPING: issue succeeds', pg_temp.issue('${ID.basis}', '${ID.reqBasis}') not like 'ERR:%');
select pg_temp.check('VAT basis MERCHANDISE_AND_SHIPPING to the cent: 61.00 + 7.00 + VAT 3.40 (3.05 + 0.35) = 71.40',
  (select p.merchandise_net = 61.00 and p.shipping_total = 7.00 and p.vat_total = 3.40 and p.buyer_total = 71.40 and p.tax_base_snapshot = 'MERCHANDISE_AND_SHIPPING'
      and p.validity_hours_snapshot = 48 and g.shipping_vat_amount = 0.35 and g.shipping_rule_id = '${ID.shipExact}'
   from public.proforma_invoices p join public.proforma_fulfillment_groups g on g.proforma_id = p.id
   where p.id = (select current_proforma_id from public.orders where id = '${ID.basis}')));

-- R-8 fallback: with the exact AE rule inactive, the NULL-country fallback is used. 12.20 + VAT 0.61 + 99.00 + 4.95 = 116.76.
update public.shipping_rules set is_active = false where id = '${ID.shipExact}';
select pg_temp.check('R-8: fallback-only issue succeeds', pg_temp.issue('${ID.fallback}', '${ID.reqFallback}') not like 'ERR:%');
select pg_temp.check('R-8: with only the fallback active, its id and fee are snapshotted (total 116.76 to the cent)',
  (select g.shipping_rule_id = '${ID.shipFallback}' and g.shipping_amount = 99.00 and g.shipping_vat_amount = 4.95 and p.buyer_total = 116.76
   from public.proforma_invoices p join public.proforma_fulfillment_groups g on g.proforma_id = p.id
   where p.id = (select current_proforma_id from public.orders where id = '${ID.fallback}')));

select pg_temp.check('deferred snapshot-balance checks pass for all three issued proformas', pg_temp.try_sql('set constraints all immediate') = 'accepted');
set constraints all deferred;

-- Immutability of the issued snapshot (spot checks across the append-only tables and the frozen financials).
select pg_temp.check('issued header is immutable', pg_temp.try_sql(format('update public.proforma_invoices set buyer_total = 0 where id = %L', (select current_proforma_id from public.orders where id = '${ID.matrix}'))) like '%proforma_snapshot_immutable%');
select pg_temp.check('line economics are append-only', pg_temp.try_sql(format('update public.proforma_line_economics set commission_amount = 0 where proforma_id = %L', (select current_proforma_id from public.orders where id = '${ID.matrix}'))) like '%snapshot_immutable%');
select pg_temp.check('seller settlements are append-only', pg_temp.try_sql(format('delete from public.proforma_seller_settlements where proforma_id = %L', (select current_proforma_id from public.orders where id = '${ID.matrix}'))) like '%snapshot_immutable%');
select pg_temp.check('bank instructions are append-only', pg_temp.try_sql(format('update public.proforma_bank_instructions set account_number = ''X'' where proforma_id = %L', (select current_proforma_id from public.orders where id = '${ID.matrix}'))) like '%snapshot_immutable%');
select pg_temp.check('issued order_financials are frozen', pg_temp.try_sql('update public.order_financials set vat_amount = 0 where order_id = ''${ID.matrix}''') like '%order_financials_frozen%');
select pg_temp.check('the order destination snapshot is not client-writable', pg_temp.try_sql('update public.orders set destination_snapshot = ''{}''::jsonb where id = ''${ID.matrix}''') like '%order_field_not_client_writable%');

-- AC-001: issuance reserved nothing anywhere.
select pg_temp.check('AC-001: cart operations + every issuance changed no offer reserved quantity',
  (select md5(coalesce(string_agg(id::text || ':' || reserved_quantity_kg::text, ',' order by id), '')) from public.coffee_offers) = (select v from baseline where k = 'offers'));
select pg_temp.check('AC-001: cart operations + every issuance changed no inventory position reserved quantity',
  (select md5(coalesce(string_agg(id::text || ':' || reserved_quantity_kg::text, ',' order by id), '')) from public.inventory_positions) = (select v from baseline where k = 'positions'));
select pg_temp.check('AC-001: cart operations + every issuance created no reservation row', (select count(*)::text from public.inventory_reservations) = (select v from baseline where k = 'reservations'));

-- AUD-006 / T029 R2: nothing written by this proof puts destination PII or a raw bank value into audit_logs.
select pg_temp.check('audit: orders rows written by issuance use the redacted allow-list',
  (select count(*) > 0 and bool_and(metadata ->> 'redaction' = 'allow_list' and not (coalesce(new_data, '{}'::jsonb) ? 'destination_snapshot'))
   from public.audit_logs where id > (select v::bigint from baseline where k = 'audit_start') and entity_type = 'orders'));
select pg_temp.check('audit: no destination PII key and no raw account number in any audit row written by this proof',
  not exists (select 1 from public.audit_logs a where a.id > (select v::bigint from baseline where k = 'audit_start')
    and ((a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
      or (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
      or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
      or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
      or (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '') || a.metadata::text) like '%${SYNTHETIC_ACCOUNT}%'
      or (coalesce(a.old_data::text, '') || coalesce(a.new_data::text, '') || a.metadata::text) like '%F013B5-CHANGED-99999999%')));

\\pset format unaligned
\\pset tuples_only on
select 'RESULT', ok, name, coalesce(case when ok then null else got end, '') from r order by name;
rollback;
`;

const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
if (!/ROLLBACK\s*$/m.test(result.stdout)) throw new Error("M4b snapshot/totals proof did not roll back");
const rows = result.stdout.split(/\r?\n/).filter((line) => line.startsWith("RESULT|")).map((line) => line.split("|"));
let failed = 0;
for (const [, ok, name, got] of rows) {
  const passed = ok === "t";
  if (!passed) failed += 1;
  // `got` is only an error code / key list / diagnostic for failures; never a bank or destination value.
  console.log(`${passed ? "PASS" : "FAIL"} ${name}${passed || !got ? "" : ` — ${got.slice(0, 160)}`}`);
}
const EXPECTED = 48;
if (rows.length !== EXPECTED) throw new Error(`M4b snapshot/totals proof returned ${rows.length}/${EXPECTED} results`);
if (failed > 0) throw new Error(`M4b snapshot/totals proof: ${failed} failure(s)`);
console.log(`M4b snapshot/totals proven on applied LOCAL through issue_proforma: ${rows.length}/${EXPECTED} checks passed; transaction rolled back.`);
