-- Feature 018 M2: selected-line checkout foundation.
--
-- One pending cart line becomes ONE dedicated, checked-out child order in a single PostgreSQL transaction:
--   source DRAFT -> selected source item -> dedicated child order -> exactly one copied item -> Feature 015 kernel
--   -> immutable receipt -> delete ONLY the selected source line -> COMMIT.
-- Any exception rolls every effect back. The source cart keeps its ID and stays a BANK_TRANSFER_V1 DRAFT (possibly empty).
--
-- Fresh multi-line combined checkout is denied: the public checkout_bank_transfer_v1 entry point accepts a DRAFT only
-- when a protected, transaction-local permit created by checkout_cart_line_bank_transfer_v1 names that exact one-item
-- child. Historical committed orders keep their replay/read semantics. Feature 017 provider functions are untouched.
--
-- Lock order (see contracts/migrations-verification.md T012): organization advisory lock -> canonical source order ->
-- selected source item -> protected request claim -> expired-reservation discovery -> candidate expired orders
-- (SKIP LOCKED, ascending) -> union of offers (ascending) -> union of positions (ascending) -> release -> child order
-- and item -> fenced wrapper/kernel -> receipt -> source-line consumption.

begin;

do $guard$
declare
  v_def text;
  v_permits bigint;
begin
  if to_regclass('public.coffees') is null
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.coffees'::regclass and a.attname = 'featured_at' and not a.attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.proforma_invoice_items'::regclass and a.attname = 'product_name_ar_snapshot' and not a.attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.proforma_invoice_items'::regclass and a.attname = 'origin_name_ar_snapshot' and not a.attisdropped) then
    raise exception 'feature_018_m2_requires_m1';
  end if;
  foreach v_def in array array[
    'public.checkout_bank_transfer_v1(uuid,uuid,uuid)', 'public.compute_order_quote(uuid,uuid,text)', 'public.commerce_request_begin(uuid,text,uuid)',
    'public.commerce_request_complete(uuid,jsonb)', 'public.commerce_assert_buyer_member(uuid)', 'public.commerce_resolve_cart(uuid)',
    'public.commerce_release_reservation(uuid)', 'public.add_cart_line(uuid,uuid,numeric,uuid)', 'public.update_order_item_quantity(uuid,numeric)',
    'public.remove_order_item(uuid)', 'public.finance_terminal_review_integrity(uuid,uuid,text)', 'public.validate_order_item_offer()'
  ] loop
    if to_regprocedure(v_def) is null then raise exception 'feature_018_m2_prerequisite_missing: %', v_def; end if;
  end loop;
  if to_regclass('public.payment_proof_upload_intents') is null or to_regclass('public.commerce_request_log') is null then
    raise exception 'feature_018_m2_prerequisite_missing: Feature 015 proof/request tables';
  end if;
  -- The checkout function must be the reviewed Feature 015 kernel or an already applied Feature 018 fence.
  select pg_catalog.pg_get_functiondef(to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')) into v_def;
  if v_def not like '%v_reclaim_order%' and v_def not like '%f018_checkout_kernel%' then
    raise exception 'feature_018_m2_checkout_definition_drift';
  end if;
  if to_regprocedure('public.record_stripe_payment_intent(uuid,text,text)') is not null
     and (has_function_privilege('anon', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('service_role', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')) then
    raise exception 'feature_018_m2_feature_017_not_retired';
  end if;
  if to_regclass('public.cart_line_checkout_receipts') is not null
     and not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.cart_line_checkout_receipts') and a.attname = 'bound_payload' and not a.attisdropped) then
    raise exception 'feature_018_m2_receipt_table_nonconforming';
  end if;
  if to_regclass('public.f018_checkout_permits') is not null then
    execute 'select count(*) from public.f018_checkout_permits' into v_permits;
    if v_permits > 0 then raise exception 'feature_018_m2_unexpected_live_permit'; end if;
  end if;
end
$guard$;

-- 1. Payload-aware request binding (nullable; legacy rows and legacy helpers are unchanged).
alter table public.commerce_request_log add column if not exists bound_payload jsonb;
do $request_payload$
begin
  if not exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = 'public.commerce_request_log'::regclass and k.conname = 'commerce_request_log_bound_payload_check') then
    alter table public.commerce_request_log
      add constraint commerce_request_log_bound_payload_check check (bound_payload is null or jsonb_typeof(bound_payload) = 'object');
  end if;
end
$request_payload$;

-- 2. Transaction-local checkout permit (never survives commit; no application access).
create table if not exists public.f018_checkout_permits (
  child_order_id uuid primary key references public.orders (id) on delete cascade,
  actor_user_id uuid not null,
  buyer_organization_id uuid not null,
  source_cart_id uuid not null,
  source_order_item_id uuid not null,
  root_request_id uuid not null,
  child_request_id uuid not null,
  offer_id uuid not null,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  destination_id uuid not null,
  staged_offer_ids uuid[] not null,
  staged_position_ids uuid[] not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.f018_checkout_permits enable row level security;
alter table public.f018_checkout_permits force row level security;
revoke all on table public.f018_checkout_permits from public, anon, authenticated, service_role;

-- 3. Immutable committed receipts (source-line intent -> transaction result).
create table if not exists public.cart_line_checkout_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  actor_user_id uuid not null,
  buyer_organization_id uuid not null references public.organizations (id) on delete restrict,
  source_cart_id uuid not null references public.orders (id) on delete restrict,
  source_order_item_id uuid not null unique,
  offer_id uuid not null references public.coffee_offers (id) on delete restrict,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  destination_id uuid not null references public.delivery_destinations (id) on delete restrict,
  bound_payload jsonb not null check (jsonb_typeof(bound_payload) = 'object'),
  source_line_snapshot jsonb not null check (jsonb_typeof(source_line_snapshot) = 'object'),
  destination_snapshot jsonb not null check (jsonb_typeof(destination_snapshot) = 'object'),
  transaction_order_id uuid not null unique references public.orders (id) on delete restrict,
  transaction_order_item_id uuid not null unique references public.order_items (id) on delete restrict,
  child_request_id uuid not null unique,
  proforma_id uuid not null references public.proforma_invoices (id) on delete restrict,
  payment_id uuid not null references public.payments (id) on delete restrict,
  reservation_id uuid not null references public.inventory_reservations (id) on delete restrict,
  committed_result jsonb not null check (jsonb_typeof(committed_result) = 'object'),
  committed_at timestamptz not null default clock_timestamp(),
  check (source_cart_id <> transaction_order_id)
);
alter table public.cart_line_checkout_receipts enable row level security;
alter table public.cart_line_checkout_receipts force row level security;
revoke all on table public.cart_line_checkout_receipts from public, anon, authenticated, service_role;

create or replace function public.f018_receipt_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'cart_line_receipt_immutable' using detail = 'cart_line_checkout_receipts rows are append-only';
end;
$function$;

drop trigger if exists trg_f018_receipt_immutable on public.cart_line_checkout_receipts;
create trigger trg_f018_receipt_immutable
  before update or delete on public.cart_line_checkout_receipts
  for each row execute function public.f018_receipt_immutable();

create or replace function public.f018_assert_permit_consumed()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if exists (select 1 from public.f018_checkout_permits p where p.child_order_id = new.child_order_id) then
    raise exception 'checkout_permit_survived_transaction';
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_f018_permit_not_surviving on public.f018_checkout_permits;
create constraint trigger trg_f018_permit_not_surviving
  after insert on public.f018_checkout_permits
  deferrable initially deferred
  for each row execute function public.f018_assert_permit_consumed();

-- 4. Payload-aware protected request helpers.
create or replace function public.f018_request_begin(p_request_id uuid, p_operation text, p_target_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_inserted integer;
  v_log public.commerce_request_log%rowtype;
begin
  if p_request_id is null then
    raise exception 'request_id_required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'request_payload_required';
  end if;
  insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response, bound_payload)
  values (p_request_id, auth.uid(), p_operation, p_target_id, '{}'::jsonb, p_payload)
  on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    perform set_config('app.correlation_id', p_request_id::text, true);
    perform set_config('app.transition_reason', p_operation, true);
    return null;
  end if;
  select * into v_log from public.commerce_request_log where request_id = p_request_id;
  if v_log.actor_user_id is distinct from auth.uid() or v_log.operation <> p_operation or v_log.target_id is distinct from p_target_id then
    raise exception 'request_id_conflict';
  end if;
  if v_log.bound_payload is distinct from p_payload then
    raise exception 'request_payload_conflict';
  end if;
  return v_log.response;
end;
$function$;

create or replace function public.f018_request_complete(p_request_id uuid, p_response jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  update public.commerce_request_log set response = p_response
  where request_id = p_request_id and actor_user_id = auth.uid() and bound_payload is not null;
  if not found then
    raise exception 'request_not_found';
  end if;
end;
$function$;

-- 5. Canonical V1 cart resolution (read-only; includes an empty DRAFT; never inserts).
create or replace function public.f018_canonical_cart(p_org_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select o.id
  from public.orders o
  where o.buyer_organization_id = p_org_id and o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT'
  order by o.created_at desc, o.id desc
  limit 1
$function$;

-- 6. Staged expired-reservation discovery, full offer/position union locking and release.
create or replace function public.f018_stage_checkout_locks(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_candidates uuid[];
  v_orders uuid[] := '{}'::uuid[];
  v_offers uuid[];
  v_positions uuid[];
  v_released uuid[] := '{}'::uuid[];
  v_order uuid;
begin
  select coalesce(array_agg(distinct r.order_id), '{}'::uuid[]) into v_candidates
  from public.inventory_reservations r
  join public.inventory_reservation_items ri on ri.reservation_id = r.id
  where ri.offer_id = p_offer_id and r.status = 'ACTIVE' and r.expires_at <= clock_timestamp();

  if cardinality(v_candidates) > 0 then
    with locked_orders as (
      select o.id from public.orders o
      where o.id = any (v_candidates) and o.status = 'HOLD'
      order by o.id
      for update skip locked
    ), locked_reservations as (
      select r.order_id from public.inventory_reservations r
      where r.order_id in (select lo.id from locked_orders lo) and r.status = 'ACTIVE' and r.expires_at <= clock_timestamp()
      order by r.order_id
      for update
    )
    select coalesce(array_agg(lr.order_id order by lr.order_id), '{}'::uuid[]) into v_orders from locked_reservations lr;
  end if;

  select coalesce(array_agg(distinct s.offer_id order by s.offer_id), '{}'::uuid[]) into v_offers
  from (
    select p_offer_id as offer_id
    union
    select ri.offer_id from public.inventory_reservation_items ri
    join public.inventory_reservations r on r.id = ri.reservation_id
    where r.order_id = any (v_orders) and r.status = 'ACTIVE'
  ) s;
  perform 1 from public.coffee_offers where id = any (v_offers) order by id for update;

  select coalesce(array_agg(distinct s.position_id order by s.position_id), '{}'::uuid[]) into v_positions
  from (
    select ip.id as position_id
    from public.coffee_offers o
    join public.inventory_positions ip
      on ip.lot_id = o.lot_id and ip.owner_organization_id = o.seller_organization_id
     and ip.warehouse_id = o.warehouse_id and ip.warehouse_location_id is not distinct from o.warehouse_location_id
    where o.id = p_offer_id
    union
    select ri.inventory_position_id from public.inventory_reservation_items ri
    join public.inventory_reservations r on r.id = ri.reservation_id
    where r.order_id = any (v_orders) and r.status = 'ACTIVE' and ri.inventory_position_id is not null
  ) s;
  perform 1 from public.inventory_positions where id = any (v_positions) order by id for update;

  foreach v_order in array v_orders loop
    if public.commerce_release_reservation(v_order) then
      v_released := v_released || v_order;
    end if;
  end loop;

  return jsonb_build_object('released_order_ids', to_jsonb(v_released), 'offer_ids', to_jsonb(v_offers), 'position_ids', to_jsonb(v_positions));
end;
$function$;

-- 7. One shared quote calculation that can be restricted to an explicit item subset.
create or replace function public.f018_compute_quote_core(p_order_id uuid, p_destination_id uuid, p_promo_code text, p_item_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_order public.orders%rowtype;
  v_destination public.delivery_destinations%rowtype;
  v_tax public.tax_rules%rowtype;
  v_bank public.payment_accounts%rowtype;
  v_buyer public.organizations%rowtype;
  v_item record;
  v_group record;
  v_policy_id uuid;
  v_tier_id uuid;
  v_rate numeric;
  v_qualifying_quantity numeric;
  v_gross numeric;
  v_vat numeric;
  v_commission numeric;
  v_shipping public.shipping_rules%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_destination_snapshot jsonb;
  v_amounts record;
  v_group_net numeric;
  v_group_shipping_vat numeric;
begin
  if nullif(btrim(p_promo_code), '') is not null then
    raise exception 'promotion_not_supported';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1' then
    raise exception 'order_not_found';
  end if;
  if v_order.currency <> 'USD' then raise exception 'currency_not_supported'; end if;
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'order_has_no_items';
  end if;
  -- Feature 018: an explicit subset must name items that all belong to this order.
  if p_item_ids is not null and (select count(*) from public.order_items where order_id = p_order_id and id = any (p_item_ids)) <> cardinality(p_item_ids) then
    raise exception 'order_item_not_found';
  end if;
  select * into v_buyer from public.organizations where id = v_order.buyer_organization_id;

  if p_destination_id is not null then
    select * into v_destination from public.delivery_destinations
    where id = p_destination_id and organization_id = v_order.buyer_organization_id and retired_at is null;
    if not found then raise exception 'destination_not_found'; end if;
    -- No approved export/non-UAE treatment exists in the launch specification.
    if v_destination.country_code <> 'AE' then raise exception 'destination_tax_unsupported'; end if;
    select * into v_tax from public.tax_rules
    where country_code = 'AE' and tax_name = 'VAT' and is_active and effective_from <= statement_timestamp()
      and (effective_until is null or effective_until > statement_timestamp())
    order by effective_from desc, id desc limit 1;
    if not found then raise exception 'tax_rule_missing'; end if;
    select * into v_bank from public.payment_accounts
    where currency = 'USD' and is_active and is_default_for_currency
    order by id limit 1;
    if not found or (v_bank.account_number is null and v_bank.iban is null) then
      raise exception 'bank_account_missing';
    end if;
    v_destination_snapshot := jsonb_build_object(
      'label', v_destination.label, 'country_code', v_destination.country_code,
      'city', v_destination.city,
      'address_lines', case when v_destination.address_line_2 is null
        then jsonb_build_array(v_destination.address_line_1)
        else jsonb_build_array(v_destination.address_line_1, v_destination.address_line_2) end,
      'contact_name', v_destination.contact_name, 'contact_phone', v_destination.contact_phone,
      'delivery_method', v_destination.delivery_method);
  end if;

  for v_item in
    select oi.id as order_item_id, oi.quantity_kg, oi.product_name_snapshot,
           oi.origin_name_snapshot, oi.lot_code_snapshot,
           o.id as offer_id, o.offer_code, o.seller_organization_id,
           o.seller_type, o.warehouse_id, o.price_per_kg, o.currency,
           o.status, o.is_visible, o.deleted_at, o.quantity_kg as offer_quantity,
           o.filled_quantity_kg as offer_filled, o.reserved_quantity_kg as offer_reserved
    from public.order_items oi
    join public.coffee_offers o on o.id = oi.offer_id
    where oi.order_id = p_order_id and (p_item_ids is null or oi.id = any (p_item_ids))
    order by oi.id
  loop
    if v_item.status not in ('PUBLISHED', 'PARTIALLY_FILLED') or not v_item.is_visible
       or v_item.deleted_at is not null or v_item.warehouse_id is null then
      raise exception 'listing_is_not_available';
    end if;
    if v_item.seller_type = 'MEMBER_SELLER'
       and not public.organization_can_sell(v_item.seller_organization_id) then
      raise exception 'listing_is_not_available';
    end if;
    if v_item.currency <> 'USD' then raise exception 'currency_not_supported'; end if;
    if v_item.seller_organization_id = v_order.buyer_organization_id then
      raise exception 'cannot_buy_own_listing';
    end if;
    if v_item.quantity_kg > v_item.offer_quantity - v_item.offer_filled - v_item.offer_reserved then
      raise exception 'requested_quantity_not_available';
    end if;

    v_policy_id := null; v_tier_id := null; v_rate := null; v_qualifying_quantity := null;
    if v_item.seller_type = 'MEMBER_SELLER' then
      select sum(oi2.quantity_kg) into v_qualifying_quantity
      from public.order_items oi2 join public.coffee_offers o2 on o2.id = oi2.offer_id
      where oi2.order_id = p_order_id and (p_item_ids is null or oi2.id = any (p_item_ids))
        and o2.seller_organization_id = v_item.seller_organization_id
        and o2.seller_type = 'MEMBER_SELLER';
      select p.id, t.id, t.percentage into v_policy_id, v_tier_id, v_rate
      from public.commission_policies p
      join public.commission_tiers t on t.policy_id = p.id
      where p.status = 'ACTIVE' and p.effective_from <= statement_timestamp()
        and (p.effective_until is null or p.effective_until > statement_timestamp())
        and t.min_quantity_kg <= v_qualifying_quantity
        and (t.max_quantity_kg is null or v_qualifying_quantity < t.max_quantity_kg)
      order by p.effective_from desc, t.min_quantity_kg desc, p.id desc, t.id desc
      limit 1;
      if not found then raise exception 'commission_rule_missing'; end if;
    end if;

    v_gross := round(v_item.quantity_kg * v_item.price_per_kg, 2);
    v_vat := case when p_destination_id is null then null
                  else round(v_gross * v_tax.rate_percentage / 100, 2) end;
    v_commission := case when v_item.seller_type = 'MEMBER_SELLER'
                         then round(v_gross * v_rate / 100, 2) else 0 end;
    if v_gross - v_commission < 0 then raise exception 'negative_economics'; end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'order_item_id', v_item.order_item_id, 'offer_id', v_item.offer_id,
      'offer_code', v_item.offer_code, 'seller_id', v_item.seller_organization_id,
      'seller_type', v_item.seller_type, 'warehouse_id', v_item.warehouse_id,
      'quantity_kg', v_item.quantity_kg, 'unit_price', v_item.price_per_kg,
      'gross', v_gross, 'discount', 0, 'net', v_gross, 'vat', v_vat,
      'commission_policy_id', v_policy_id, 'commission_tier_id', v_tier_id,
      'commission_rate', v_rate, 'seller_qualifying_quantity_kg', v_qualifying_quantity,
      'commission', v_commission,
      'seller_net', case when v_item.seller_type = 'MEMBER_SELLER' then v_gross - v_commission else 0 end,
      'hills_share', case when v_item.seller_type = 'MEMBER_SELLER' then v_commission else v_gross end,
      'product_name', v_item.product_name_snapshot, 'origin_name', v_item.origin_name_snapshot,
      'lot_code', v_item.lot_code_snapshot));
  end loop;

  if p_destination_id is not null then
    for v_group in
      select distinct x.seller_id, x.warehouse_id
      from jsonb_to_recordset(v_lines) as x(seller_id uuid, warehouse_id uuid)
      order by x.seller_id, x.warehouse_id
    loop
      select * into v_shipping from public.shipping_rules
      where delivery_method = v_destination.delivery_method and currency = 'USD' and is_active
        and (country_code = v_destination.country_code or country_code is null)
        and effective_from <= statement_timestamp()
        and (effective_until is null or effective_until > statement_timestamp())
      -- R-8: exact country beats the NULL-country fallback (a bare comparison is NULL, and NULLs sort first under DESC).
      order by coalesce(country_code = v_destination.country_code, false) desc, effective_from desc, id desc
      limit 1;
      if not found then raise exception 'shipping_rule_missing'; end if;
      select coalesce(sum(x.net), 0) into v_group_net
      from jsonb_to_recordset(v_lines) as x(seller_id uuid, warehouse_id uuid, net numeric)
      where x.seller_id = v_group.seller_id and x.warehouse_id = v_group.warehouse_id;
      v_group_shipping_vat := case when v_tax.taxable_base = 'MERCHANDISE_AND_SHIPPING'
        then round(v_shipping.flat_fee * v_tax.rate_percentage / 100, 2) else 0 end;
      v_groups := v_groups || jsonb_build_array(jsonb_build_object(
        'seller_id', v_group.seller_id, 'warehouse_id', v_group.warehouse_id,
        'shipping_rule_id', v_shipping.id, 'delivery_method', v_destination.delivery_method,
        'shipping', round(v_shipping.flat_fee, 2), 'shipping_vat', v_group_shipping_vat,
        'merchandise_net', v_group_net));
    end loop;
  end if;

  select coalesce(sum(x.gross), 0) as gross, coalesce(sum(x.net), 0) as net,
         coalesce(sum(x.vat), 0) as line_vat,
         coalesce(sum(x.commission), 0) as commission,
         coalesce(sum(x.seller_net), 0) as seller_net,
         coalesce(sum(x.hills_share), 0) as hills_share,
         coalesce(sum(x.quantity_kg), 0) as quantity
  into v_amounts
  from jsonb_to_recordset(v_lines) as x(gross numeric, net numeric, vat numeric,
    commission numeric, seller_net numeric, hills_share numeric, quantity_kg numeric);

  return jsonb_build_object(
    'order_id', v_order.id, 'order_code', v_order.order_code,
    'buyer_snapshot', jsonb_build_object('legal_name', v_buyer.legal_name,
      'display_name', v_buyer.display_name, 'tax_number', v_buyer.tax_number,
      'country_code', v_buyer.country_code),
    'destination_snapshot', v_destination_snapshot,
    'tax_rule_id', v_tax.id, 'tax_rate', v_tax.rate_percentage, 'tax_base', v_tax.taxable_base,
    'bank_account_id', v_bank.id, 'bank_account_name', v_bank.account_name,
    'bank_name', v_bank.bank_name, 'bank_account_number', v_bank.account_number,
    'bank_iban', v_bank.iban, 'bank_swift', v_bank.swift_code,
    'lines', v_lines, 'groups', v_groups, 'merchandise_gross', v_amounts.gross,
    'discount_total', 0, 'merchandise_net', v_amounts.net,
    'shipping_total', case when p_destination_id is null then null else
      (select coalesce(sum(x.shipping), 0) from jsonb_to_recordset(v_groups) as x(shipping numeric)) end,
    'vat_total', case when p_destination_id is null then null else v_amounts.line_vat +
      (select coalesce(sum(x.shipping_vat), 0) from jsonb_to_recordset(v_groups) as x(shipping_vat numeric)) end,
    'buyer_total', case when p_destination_id is null then null else v_amounts.net +
      (select coalesce(sum(x.shipping + x.shipping_vat), 0)
       from jsonb_to_recordset(v_groups) as x(shipping numeric, shipping_vat numeric)) + v_amounts.line_vat end,
    'commission_total', v_amounts.commission, 'seller_net_total', v_amounts.seller_net,
    'hills_share_total', v_amounts.hills_share, 'total_quantity_kg', v_amounts.quantity);
end;
$function$;

create or replace function public.compute_order_quote(p_order_id uuid, p_destination_id uuid, p_promo_code text default null::text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  return public.f018_compute_quote_core(p_order_id, p_destination_id, p_promo_code, null);
end;
$function$;

-- 8. Private Feature 015 checkout kernel (staged locks, no second reclamation scan, frozen Arabic snapshots).
create or replace function public.f018_checkout_kernel(p_order_id uuid, p_destination_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_replay jsonb;
  v_order public.orders%rowtype;
  v_settings public.commerce_settings%rowtype;
  v_destination public.delivery_destinations%rowtype;
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_quote jsonb;
  v_issued_at timestamptz;
  v_valid_until timestamptz;
  v_account_last4 text;
  v_iban_last4 text;
  v_masked jsonb;
  v_proforma_id uuid;
  v_proforma_code text;
  v_payment_id uuid;
  v_buyer_total numeric;
  v_item record;
  v_group jsonb;
  v_line jsonb;
  v_group_id uuid;
  v_item_id uuid;
  v_settlement record;
  v_offer public.coffee_offers%rowtype;
  v_offer_attrs record;
  v_position public.inventory_positions%rowtype;
  v_position_id uuid;
  v_result jsonb;
  v_permit public.f018_checkout_permits%rowtype;
  v_ar_product text;
  v_ar_origin text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1'
     or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);

  v_replay := public.commerce_request_begin(p_request_id, 'checkout_bank_transfer_v1', p_order_id);
  if v_replay is not null then
    return v_replay;
  end if;

  -- Replay check for already held orders with active reservation
  if v_order.status = 'HOLD' and v_order.current_proforma_id is not null then
    select r.id, r.expires_at into v_reservation_id, v_expires_at
    from public.inventory_reservations r
    where r.order_id = p_order_id and r.status = 'ACTIVE' and r.expires_at > clock_timestamp()
    limit 1;
    if v_reservation_id is not null then
      select p.id into v_payment_id from public.payments p where p.order_id = p_order_id limit 1;
      select buyer_total_amount into v_buyer_total from public.order_financials where order_id = p_order_id;
      select proforma_code into v_proforma_code from public.proforma_invoices where id = v_order.current_proforma_id;
      v_result := jsonb_build_object(
        'order_id', p_order_id,
        'order_code', v_order.order_code,
        'proforma_id', v_order.current_proforma_id,
        'proforma_code', v_proforma_code,
        'payment_id', v_payment_id,
        'reservation_id', v_reservation_id,
        'expires_at', v_expires_at,
        'buyer_total', v_buyer_total,
        'currency', v_order.currency
      );
      perform public.commerce_request_complete(p_request_id, v_result);
      return v_result;
    end if;
  end if;

  if v_order.status <> 'DRAFT' then
    raise exception 'order_not_editable';
  end if;

  -- Feature 018: a fresh checkout runs only for the dedicated one-item child whose offers and positions were
  -- staged (locked, reclaimed) by checkout_cart_line_bank_transfer_v1 before the child item existed.
  select * into v_permit from public.f018_checkout_permits where child_order_id = p_order_id;
  if v_permit.child_order_id is null then
    raise exception 'checkout_requires_selected_line';
  end if;

  select * into v_settings from public.commerce_settings where id;
  if not found or not v_settings.bank_transfer_checkout_enabled
     or (cardinality(v_settings.pilot_organization_ids) > 0
         and not v_order.buyer_organization_id = any(v_settings.pilot_organization_ids)) then
    raise exception 'checkout_disabled';
  end if;

  if p_destination_id is null then
    raise exception 'destination_required';
  end if;

  select * into v_destination from public.delivery_destinations
  where id = p_destination_id and organization_id = v_order.buyer_organization_id and retired_at is null;
  if not found then
    raise exception 'destination_not_found';
  end if;
  if v_destination.country_code <> 'AE' then
    raise exception 'destination_tax_unsupported';
  end if;

  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'order_has_no_items';
  end if;

  -- 1. Feature 018: expired-reservation reclamation is staged before the child item exists; no second scan here.

  -- 2. Deterministic locks on offers ascending UUID, re-check offer availability
  for v_item in
    select oi.offer_id, sum(oi.quantity_kg) as total_quantity_kg
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.offer_id
    order by oi.offer_id
  loop
    if not (v_item.offer_id = any (v_permit.staged_offer_ids)) then
      raise exception 'checkout_locks_not_staged';
    end if;
    select * into v_offer from public.coffee_offers where id = v_item.offer_id for update;
    if v_offer.id is null or v_offer.status not in ('PUBLISHED', 'PARTIALLY_FILLED') or not v_offer.is_visible
       or (v_offer.quantity_kg - v_offer.filled_quantity_kg - v_offer.reserved_quantity_kg) < v_item.total_quantity_kg then
      raise exception 'listing_inventory_changed';
    end if;
    if v_offer.seller_type = 'MEMBER_SELLER' and not public.organization_can_sell(v_offer.seller_organization_id) then
      raise exception 'seller_not_authorized';
    end if;
  end loop;

  -- 3. Deterministic locks on backing positions ascending UUID, re-check aggregated demand
  for v_item in
    select ip.id as position_id, sum(oi.quantity_kg) as total_quantity_kg
    from public.order_items oi
    join public.coffee_offers o on o.id = oi.offer_id
    join public.inventory_positions ip
      on ip.lot_id = o.lot_id and ip.owner_organization_id = o.seller_organization_id
      and ip.warehouse_id = o.warehouse_id
      and ip.warehouse_location_id is not distinct from o.warehouse_location_id
    where oi.order_id = p_order_id
    group by ip.id
    order by ip.id
  loop
    if not (v_item.position_id = any (v_permit.staged_position_ids)) then
      raise exception 'checkout_locks_not_staged';
    end if;
    select * into v_position from public.inventory_positions where id = v_item.position_id for update;
    if v_position.id is null or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_item.total_quantity_kg then
      raise exception 'seller_inventory_changed';
    end if;
  end loop;

  -- 4. Authoritative quote computation
  v_quote := public.compute_order_quote(p_order_id, p_destination_id, null);
  v_issued_at := clock_timestamp();
  v_valid_until := v_issued_at + make_interval(hours => v_settings.proforma_validity_hours);
  v_expires_at := v_issued_at + interval '20 minutes';

  v_account_last4 := case when v_quote ->> 'bank_account_number' is null then null
    when char_length(v_quote ->> 'bank_account_number') < 8 then '****'
    else '****' || right(v_quote ->> 'bank_account_number', 4) end;
  v_iban_last4 := case when v_quote ->> 'bank_iban' is null then null
    when char_length(v_quote ->> 'bank_iban') < 8 then '****'
    else '****' || right(v_quote ->> 'bank_iban', 4) end;
  v_masked := jsonb_build_object(
    'bank_name', v_quote ->> 'bank_name', 'account_name', v_quote ->> 'bank_account_name',
    'swift_code', v_quote ->> 'bank_swift',
    'account_number_last4', v_account_last4, 'iban_last4', v_iban_last4);

  -- 5. Insert proforma as ISSUED (satisfies Feature 013 snapshot triggers)
  insert into public.proforma_invoices (
    order_id, version, supersedes_proforma_id, status, issued_at, valid_until,
    validity_hours_snapshot, currency, merchandise_gross, discount_total,
    merchandise_net, shipping_total, vat_total, buyer_total, tax_rule_id,
    tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot,
    bank_account_masked, issued_by)
  values (
    p_order_id, 1, null, 'ISSUED', v_issued_at, v_valid_until,
    v_settings.proforma_validity_hours, 'USD',
    (v_quote ->> 'merchandise_gross')::numeric, 0,
    (v_quote ->> 'merchandise_net')::numeric,
    (v_quote ->> 'shipping_total')::numeric, (v_quote ->> 'vat_total')::numeric,
    (v_quote ->> 'buyer_total')::numeric, (v_quote ->> 'tax_rule_id')::uuid,
    (v_quote ->> 'tax_rate')::numeric, v_quote ->> 'tax_base',
    v_quote -> 'buyer_snapshot', v_quote -> 'destination_snapshot', v_masked, auth.uid())
  returning id, proforma_code into v_proforma_id, v_proforma_code;

  for v_group in select value from jsonb_array_elements(v_quote -> 'groups') loop
    insert into public.proforma_fulfillment_groups (
      proforma_id, seller_organization_id, warehouse_id, group_key,
      shipping_rule_id, delivery_method, shipping_amount, shipping_vat_amount,
      merchandise_net_amount)
    values (v_proforma_id, (v_group ->> 'seller_id')::uuid,
      (v_group ->> 'warehouse_id')::uuid,
      (v_group ->> 'seller_id') || ':' || (v_group ->> 'warehouse_id'),
      (v_group ->> 'shipping_rule_id')::uuid, v_group ->> 'delivery_method',
      (v_group ->> 'shipping')::numeric, (v_group ->> 'shipping_vat')::numeric,
      (v_group ->> 'merchandise_net')::numeric);
  end loop;

  for v_line in select value from jsonb_array_elements(v_quote -> 'lines') loop
    select id into v_group_id from public.proforma_fulfillment_groups
    where proforma_id = v_proforma_id
      and seller_organization_id = (v_line ->> 'seller_id')::uuid
      and warehouse_id = (v_line ->> 'warehouse_id')::uuid;
    if not found then raise exception 'proforma_snapshot_unbalanced'; end if;
    -- Frozen Arabic display names, captured only at issuance from the translations in this transaction.
    select nullif(btrim(ct.name), ''), nullif(btrim(ot.name), '') into v_ar_product, v_ar_origin
    from public.order_items oi_ar
    join public.coffee_lots cl_ar on cl_ar.id = oi_ar.lot_id
    join public.coffees c_ar on c_ar.id = cl_ar.coffee_id
    left join public.coffee_translations ct on ct.coffee_id = c_ar.id and ct.locale = 'ar'
    left join public.origin_translations ot on ot.origin_id = c_ar.origin_id and ot.locale = 'ar'
    where oi_ar.id = (v_line ->> 'order_item_id')::uuid;
    insert into public.proforma_invoice_items (
      proforma_id, order_item_id, description, quantity_kg, unit_price, amount,
      offer_id, offer_code_snapshot, seller_organization_id, seller_type_snapshot,
      warehouse_id, fulfillment_group_id, list_unit_price, price_tier_id,
      gross_amount, discount_amount, discount_capped, net_amount, vat_amount,
      line_total, product_name_snapshot, origin_name_snapshot, lot_code_snapshot,
      product_name_ar_snapshot, origin_name_ar_snapshot)
    values (v_proforma_id, (v_line ->> 'order_item_id')::uuid,
      v_line ->> 'product_name', (v_line ->> 'quantity_kg')::numeric,
      (v_line ->> 'unit_price')::numeric, (v_line ->> 'net')::numeric,
      (v_line ->> 'offer_id')::uuid, v_line ->> 'offer_code',
      (v_line ->> 'seller_id')::uuid, v_line ->> 'seller_type',
      (v_line ->> 'warehouse_id')::uuid, v_group_id,
      (v_line ->> 'unit_price')::numeric, null,
      (v_line ->> 'gross')::numeric, 0, false, (v_line ->> 'net')::numeric,
      (v_line ->> 'vat')::numeric,
      (v_line ->> 'net')::numeric + (v_line ->> 'vat')::numeric,
      v_line ->> 'product_name', v_line ->> 'origin_name', v_line ->> 'lot_code',
      v_ar_product, v_ar_origin)
    returning id into v_item_id;

    insert into public.proforma_line_economics (
      proforma_item_id, proforma_id, seller_organization_id, seller_type_snapshot,
      commission_policy_id, commission_tier_id, commission_rate_snapshot,
      seller_qualifying_quantity_kg, gross_amount, seller_funded_discount,
      hills_funded_discount, commission_on_gross, commission_basis,
      commission_amount, seller_net_amount, hills_share_amount, buyer_net_amount)
    values (v_item_id, v_proforma_id, (v_line ->> 'seller_id')::uuid,
      v_line ->> 'seller_type', (v_line ->> 'commission_policy_id')::uuid,
      (v_line ->> 'commission_tier_id')::uuid, (v_line ->> 'commission_rate')::numeric,
      (v_line ->> 'seller_qualifying_quantity_kg')::numeric,
      (v_line ->> 'gross')::numeric, 0, 0, (v_line ->> 'commission')::numeric,
      case when v_line ->> 'seller_type' = 'MEMBER_SELLER'
        then (v_line ->> 'gross')::numeric else 0 end,
      (v_line ->> 'commission')::numeric, (v_line ->> 'seller_net')::numeric,
      (v_line ->> 'hills_share')::numeric, (v_line ->> 'net')::numeric);
  end loop;

  for v_settlement in
    select seller_organization_id, min(seller_type_snapshot) as seller_type,
      min(commission_policy_id::text)::uuid as policy_id,
      min(commission_tier_id::text)::uuid as tier_id,
      min(commission_rate_snapshot) as rate,
      min(seller_qualifying_quantity_kg) as qualifying_quantity,
      sum(gross_amount) as gross, sum(seller_funded_discount) as seller_discount,
      sum(hills_funded_discount) as hills_discount, sum(commission_basis) as basis,
      sum(commission_amount) as commission, sum(seller_net_amount) as seller_net,
      sum(hills_share_amount) as hills_share, sum(buyer_net_amount) as buyer_net
    from public.proforma_line_economics where proforma_id = v_proforma_id
    group by seller_organization_id
  loop
    insert into public.proforma_seller_settlements (
      proforma_id, seller_organization_id, seller_type_snapshot,
      seller_qualifying_quantity_kg, commission_policy_id, commission_tier_id,
      commission_rate_snapshot, gross_amount, seller_funded_discount,
      hills_funded_discount, commission_basis, commission_amount,
      seller_net_amount, hills_share_amount, buyer_net_amount)
    values (v_proforma_id, v_settlement.seller_organization_id, v_settlement.seller_type,
      v_settlement.qualifying_quantity, v_settlement.policy_id, v_settlement.tier_id,
      v_settlement.rate, v_settlement.gross, v_settlement.seller_discount,
      v_settlement.hills_discount, v_settlement.basis, v_settlement.commission,
      v_settlement.seller_net, v_settlement.hills_share, v_settlement.buyer_net);
  end loop;

  insert into public.proforma_bank_instructions (
    proforma_id, payment_account_id, account_name, bank_name,
    account_number, iban, swift_code, currency, payment_reference)
  values (v_proforma_id, (v_quote ->> 'bank_account_id')::uuid,
    v_quote ->> 'bank_account_name', v_quote ->> 'bank_name',
    v_quote ->> 'bank_account_number', v_quote ->> 'bank_iban',
    v_quote ->> 'bank_swift', 'USD', v_order.order_code || ' / ' || v_proforma_code);

  -- 6. Insert inventory reservation and reserve quantities
  insert into public.inventory_reservations (order_id, proforma_id, status, expires_at, confirmed_by)
  values (p_order_id, v_proforma_id, 'ACTIVE', v_expires_at, auth.uid())
  returning id into v_reservation_id;

  for v_item in
    select oi.offer_id, oi.quantity_kg
    from public.order_items oi
    where oi.order_id = p_order_id
    order by oi.offer_id
  loop
    select o.lot_id, o.seller_organization_id, o.warehouse_id, o.warehouse_location_id
    into v_offer_attrs from public.coffee_offers o where o.id = v_item.offer_id;
    select id into v_position_id from public.inventory_positions ip
    where ip.lot_id = v_offer_attrs.lot_id and ip.owner_organization_id = v_offer_attrs.seller_organization_id
      and ip.warehouse_id = v_offer_attrs.warehouse_id
      and ip.warehouse_location_id is not distinct from v_offer_attrs.warehouse_location_id
    order by ip.created_at, ip.id limit 1;

    update public.inventory_positions
    set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg, updated_at = now()
    where id = v_position_id;

    perform set_config('app.checkout_reservation', 'true', true);
    update public.coffee_offers
    set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg
    where id = v_item.offer_id;
    perform set_config('app.checkout_reservation', 'false', true);

    insert into public.inventory_reservation_items (reservation_id, offer_id, inventory_position_id, quantity_kg)
    values (v_reservation_id, v_item.offer_id, v_position_id, v_item.quantity_kg);
  end loop;

  -- 7. Update proforma to CONFIRMED
  perform set_config('app.internal_transition', 'true', true);
  update public.proforma_invoices
  set status = 'CONFIRMED', confirmed_at = clock_timestamp(), confirmed_by = auth.uid()
  where id = v_proforma_id;

  -- 8. Insert order_financials (written under internal_transition while order is in DRAFT)
  insert into public.order_financials (
    order_id, proforma_id, base_subtotal, discount_amount,
    seller_funded_discount, hills_funded_discount, shipping_amount, vat_amount,
    buyer_total_amount, total_quantity_kg, commission_amount, seller_net_amount,
    hills_share_amount, currency, commission_policy_id, commission_percentage_snapshot,
    tax_rule_id, tax_percentage_snapshot, tax_base_snapshot, calculated_at)
  values (p_order_id, v_proforma_id, (v_quote ->> 'merchandise_gross')::numeric,
    0, 0, 0, (v_quote ->> 'shipping_total')::numeric, (v_quote ->> 'vat_total')::numeric,
    (v_quote ->> 'buyer_total')::numeric, (v_quote ->> 'total_quantity_kg')::numeric,
    (v_quote ->> 'commission_total')::numeric, (v_quote ->> 'seller_net_total')::numeric,
    (v_quote ->> 'hills_share_total')::numeric, 'USD', null, null,
    (v_quote ->> 'tax_rule_id')::uuid, (v_quote ->> 'tax_rate')::numeric,
    v_quote ->> 'tax_base', v_issued_at)
  on conflict (order_id) do update set
    proforma_id = excluded.proforma_id, base_subtotal = excluded.base_subtotal,
    discount_amount = excluded.discount_amount,
    seller_funded_discount = excluded.seller_funded_discount,
    hills_funded_discount = excluded.hills_funded_discount,
    shipping_amount = excluded.shipping_amount, vat_amount = excluded.vat_amount,
    buyer_total_amount = excluded.buyer_total_amount,
    total_quantity_kg = excluded.total_quantity_kg,
    commission_amount = excluded.commission_amount,
    seller_net_amount = excluded.seller_net_amount,
    hills_share_amount = excluded.hills_share_amount,
    tax_rule_id = excluded.tax_rule_id, tax_percentage_snapshot = excluded.tax_percentage_snapshot,
    tax_base_snapshot = excluded.tax_base_snapshot, calculated_at = excluded.calculated_at;

  -- 9. Update order to HOLD
  update public.orders
  set status = 'HOLD',
    delivery_destination_id = p_destination_id,
    destination_snapshot = v_quote -> 'destination_snapshot',
    current_proforma_id = v_proforma_id,
    hold_started_at = v_issued_at,
    hold_expires_at = v_expires_at,
    confirmed_at = v_issued_at
  where id = p_order_id;
  perform set_config('app.internal_transition', 'false', true);

  v_buyer_total := (v_quote ->> 'buyer_total')::numeric;

  -- 10. Insert Payment record (status = PENDING) (HIGH 2: server-derive expected_amount and link proforma_id)
  insert into public.payments (
    order_id, proforma_id, payment_method, amount, expected_amount, currency, status, payment_account_id
  ) values (
    p_order_id, v_proforma_id, 'BANK_TRANSFER', v_buyer_total, v_buyer_total, 'USD', 'PENDING',
    (v_quote ->> 'bank_account_id')::uuid
  )
  on conflict (order_id) do update set
    proforma_id = excluded.proforma_id,
    amount = excluded.amount,
    expected_amount = excluded.expected_amount,
    status = 'PENDING',
    payment_account_id = excluded.payment_account_id
  returning id into v_payment_id;

  -- 11. Notifications preservation:
  -- The order status update to HOLD triggers trg_notify_order_status_change which inserts RESERVATION_CONFIRMED.
  -- Insert ORDER_PROFORMA_ISSUED notification explicitly so Feature 014 milestone is preserved:
  insert into public.notifications (
    user_id, organization_id, notification_type, title, body, entity_type, entity_id
  ) values (
    v_order.created_by, v_order.buyer_organization_id, 'ORDER_PROFORMA_ISSUED',
    'Proforma Invoice Issued',
    'A proforma invoice has been generated for order ' || v_order.order_code,
    'orders', p_order_id
  );

  v_result := jsonb_build_object(
    'order_id', p_order_id,
    'order_code', v_order.order_code,
    'proforma_id', v_proforma_id,
    'proforma_code', v_proforma_code,
    'payment_id', v_payment_id,
    'reservation_id', v_reservation_id,
    'expires_at', v_expires_at,
    'buyer_total', v_buyer_total,
    'currency', 'USD'
  );

  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;

-- 9. Public checkout entry point: fresh DRAFT only through the protected one-item child permit.
create or replace function public.checkout_bank_transfer_v1(p_order_id uuid, p_destination_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_order public.orders%rowtype;
  v_permit public.f018_checkout_permits%rowtype;
  v_items integer;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1'
     or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);

  if v_order.status = 'DRAFT' then
    -- Fresh checkout is fenced BEFORE any request-log replay: zero-, one- and many-line source carts are refused.
    select * into v_permit from public.f018_checkout_permits where child_order_id = p_order_id;
    select count(*) into v_items from public.order_items where order_id = p_order_id;
    if v_permit.child_order_id is null or v_items <> 1
       or v_permit.actor_user_id is distinct from auth.uid()
       or v_permit.buyer_organization_id <> v_order.buyer_organization_id
       or v_permit.destination_id is distinct from p_destination_id
       or v_permit.child_request_id is distinct from p_request_id
       or not exists (select 1 from public.order_items oi where oi.order_id = p_order_id and oi.offer_id = v_permit.offer_id and oi.quantity_kg = v_permit.quantity_kg) then
      raise exception 'checkout_requires_selected_line';
    end if;
  end if;

  return public.f018_checkout_kernel(p_order_id, p_destination_id, p_request_id);
end;
$function$;

-- 10. Receipt integrity and response rendering.
create or replace function public.f018_receipt_integrity(p_receipt_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_r public.cart_line_checkout_receipts%rowtype;
  v_child public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_items integer;
begin
  select * into v_r from public.cart_line_checkout_receipts where id = p_receipt_id;
  if v_r.id is null then return false; end if;
  select * into v_child from public.orders where id = v_r.transaction_order_id;
  if v_child.id is null or v_child.commerce_flow <> 'BANK_TRANSFER_V1' or v_child.buyer_organization_id <> v_r.buyer_organization_id
     or v_child.status = 'DRAFT' or v_child.current_proforma_id is distinct from v_r.proforma_id then
    return false;
  end if;
  select count(*) into v_items from public.order_items where order_id = v_child.id;
  select * into v_item from public.order_items where id = v_r.transaction_order_item_id and order_id = v_child.id;
  if v_items <> 1 or v_item.id is null or v_item.offer_id <> v_r.offer_id or v_item.quantity_kg <> v_r.quantity_kg then return false; end if;
  if not exists (select 1 from public.proforma_invoices p where p.id = v_r.proforma_id and p.order_id = v_child.id)
     or not exists (select 1 from public.payments pay where pay.id = v_r.payment_id and pay.order_id = v_child.id and pay.proforma_id = v_r.proforma_id)
     or not exists (select 1 from public.inventory_reservations rv where rv.id = v_r.reservation_id and rv.order_id = v_child.id and rv.proforma_id = v_r.proforma_id)
     or not exists (select 1 from public.commerce_request_log l where l.request_id = v_r.child_request_id and l.target_id = v_child.id) then
    return false;
  end if;
  if v_child.status = 'PAID' then
    return public.finance_terminal_review_integrity(v_child.id, v_r.payment_id, 'CONFIRMED');
  elsif v_child.status = 'PAYMENT_REJECTED' then
    return public.finance_terminal_review_integrity(v_child.id, v_r.payment_id, 'REJECTED');
  end if;
  return true;
end;
$function$;

create or replace function public.f018_receipt_response(p_receipt_id uuid, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select r.committed_result || jsonb_build_object(
    'receipt_id', r.id, 'source_cart_id', r.source_cart_id, 'source_item_id', r.source_order_item_id,
    'child_order_id', r.transaction_order_id, 'committed_at', r.committed_at, 'replayed', p_replayed)
  from public.cart_line_checkout_receipts r where r.id = p_receipt_id
$function$;

-- 11. Selected-line estimate (read-only; no reservation, no temporary order).
create or replace function public.estimate_cart_line_bank_transfer_v1(p_org_id uuid, p_cart_id uuid, p_item_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_destination_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_item public.order_items%rowtype;
  v_quote jsonb;
  v_lines jsonb;
begin
  if p_org_id is null or p_cart_id is null or p_item_id is null or p_offer_id is null or p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'invalid_checkout_input';
  end if;
  perform public.commerce_assert_buyer_member(p_org_id);
  if not exists (select 1 from public.orders o where o.id = p_cart_id and o.buyer_organization_id = p_org_id and o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT')
     or p_cart_id is distinct from public.f018_canonical_cart(p_org_id) then
    raise exception 'cart_not_canonical';
  end if;
  select * into v_item from public.order_items where id = p_item_id and order_id = p_cart_id;
  if v_item.id is null then raise exception 'cart_line_not_found'; end if;
  if v_item.offer_id <> p_offer_id or v_item.quantity_kg <> p_quantity_kg then raise exception 'cart_line_changed'; end if;
  v_quote := public.f018_compute_quote_core(p_cart_id, p_destination_id, null, array[p_item_id]);
  select coalesce(jsonb_agg(jsonb_build_object(
    'offer_code', x.value -> 'offer_code', 'product_name', x.value -> 'product_name',
    'quantity_kg', x.value -> 'quantity_kg', 'unit_price', x.value -> 'unit_price',
    'gross', x.value -> 'gross', 'discount', x.value -> 'discount',
    'net', x.value -> 'net', 'vat', x.value -> 'vat') order by x.ordinality), '[]'::jsonb)
  into v_lines from jsonb_array_elements(v_quote -> 'lines') with ordinality as x(value, ordinality);
  return jsonb_build_object(
    'is_estimate', true, 'reason', case when p_destination_id is null then 'destination_required' else null end,
    'cart_id', p_cart_id, 'item_id', p_item_id, 'currency', 'USD', 'lines', v_lines,
    'groups', v_quote -> 'groups', 'merchandise_gross', v_quote -> 'merchandise_gross',
    'discount_total', v_quote -> 'discount_total', 'merchandise_net', v_quote -> 'merchandise_net',
    'shipping_total', v_quote -> 'shipping_total', 'vat_total', v_quote -> 'vat_total',
    'buyer_total', v_quote -> 'buyer_total');
end;
$function$;

-- 12. The atomic selected-line split.
create or replace function public.checkout_cart_line_bank_transfer_v1(
  p_org_id uuid, p_cart_id uuid, p_item_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_destination_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_receipt public.cart_line_checkout_receipts%rowtype;
  v_cart public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_child uuid := gen_random_uuid();
  v_child_request uuid := gen_random_uuid();
  v_stage jsonb;
  v_result jsonb;
  v_replay jsonb;
  v_receipt_id uuid;
  v_response jsonb;
  v_destination_snapshot jsonb;
begin
  if p_org_id is null or p_cart_id is null or p_item_id is null or p_offer_id is null or p_destination_id is null
     or p_request_id is null or p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'invalid_checkout_input';
  end if;
  -- Fresh authority before any replay result: membership, buy capability, blocked user and MFA.
  perform public.commerce_assert_buyer_member(p_org_id);
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));

  v_payload := jsonb_build_object('version', 1, 'operation', 'checkout_cart_line_bank_transfer_v1', 'organization_id', p_org_id,
    'cart_id', p_cart_id, 'item_id', p_item_id, 'offer_id', p_offer_id, 'quantity_kg', p_quantity_kg, 'destination_id', p_destination_id);

  select * into v_receipt from public.cart_line_checkout_receipts where request_id = p_request_id;
  if v_receipt.id is not null then
    if v_receipt.actor_user_id is distinct from auth.uid() or v_receipt.buyer_organization_id <> p_org_id then
      raise exception 'request_id_conflict';
    end if;
    if v_receipt.bound_payload is distinct from v_payload then
      raise exception 'request_payload_conflict';
    end if;
    if not public.f018_receipt_integrity(v_receipt.id) then
      raise exception 'persisted_receipt_integrity_error';
    end if;
    return public.f018_receipt_response(v_receipt.id, true);
  end if;
  if exists (select 1 from public.cart_line_checkout_receipts r where r.source_order_item_id = p_item_id) then
    raise exception 'cart_line_already_consumed';
  end if;

  select * into v_cart from public.orders
  where id = p_cart_id and buyer_organization_id = p_org_id and commerce_flow = 'BANK_TRANSFER_V1' and status = 'DRAFT'
  for update;
  if v_cart.id is null or p_cart_id is distinct from public.f018_canonical_cart(p_org_id) then
    raise exception 'cart_not_canonical';
  end if;
  select * into v_item from public.order_items where id = p_item_id and order_id = p_cart_id for update;
  if v_item.id is null then
    raise exception 'cart_line_not_found';
  end if;
  if v_item.offer_id <> p_offer_id or v_item.quantity_kg <> p_quantity_kg then
    raise exception 'cart_line_changed';
  end if;
  if not exists (select 1 from public.delivery_destinations d where d.id = p_destination_id and d.organization_id = p_org_id and d.retired_at is null) then
    raise exception 'destination_not_found';
  end if;

  v_replay := public.f018_request_begin(p_request_id, 'checkout_cart_line_bank_transfer_v1', p_cart_id, v_payload);
  if v_replay is not null then
    return v_replay;
  end if;

  v_stage := public.f018_stage_checkout_locks(p_offer_id);

  insert into public.orders (id, buyer_organization_id, created_by, status, commerce_flow)
  values (v_child, p_org_id, auth.uid(), 'DRAFT', 'BANK_TRANSFER_V1');
  insert into public.f018_checkout_permits (
    child_order_id, actor_user_id, buyer_organization_id, source_cart_id, source_order_item_id, root_request_id, child_request_id,
    offer_id, quantity_kg, destination_id, staged_offer_ids, staged_position_ids)
  values (
    v_child, auth.uid(), p_org_id, p_cart_id, p_item_id, p_request_id, v_child_request, p_offer_id, p_quantity_kg, p_destination_id,
    array(select jsonb_array_elements_text(v_stage -> 'offer_ids')::uuid), array(select jsonb_array_elements_text(v_stage -> 'position_ids')::uuid));
  insert into public.order_items (order_id, offer_id, quantity_kg) values (v_child, p_offer_id, p_quantity_kg);

  v_result := public.checkout_bank_transfer_v1(v_child, p_destination_id, v_child_request);

  select destination_snapshot into v_destination_snapshot from public.orders where id = v_child;
  insert into public.cart_line_checkout_receipts (
    request_id, actor_user_id, buyer_organization_id, source_cart_id, source_order_item_id, offer_id, quantity_kg, destination_id,
    bound_payload, source_line_snapshot, destination_snapshot, transaction_order_id, transaction_order_item_id, child_request_id,
    proforma_id, payment_id, reservation_id, committed_result)
  values (
    p_request_id, auth.uid(), p_org_id, p_cart_id, p_item_id, p_offer_id, p_quantity_kg, p_destination_id,
    v_payload, jsonb_build_object('order_item', to_jsonb(v_item), 'cart_id', p_cart_id, 'cart_created_at', v_cart.created_at),
    v_destination_snapshot, v_child, (select oi.id from public.order_items oi where oi.order_id = v_child), v_child_request,
    (v_result ->> 'proforma_id')::uuid, (v_result ->> 'payment_id')::uuid, (v_result ->> 'reservation_id')::uuid, v_result)
  returning id into v_receipt_id;

  delete from public.f018_checkout_permits where child_order_id = v_child;
  delete from public.order_items where id = p_item_id;

  if (select count(*) from public.order_items where order_id = v_child) <> 1
     or exists (select 1 from public.orders where id = v_child and status = 'DRAFT')
     or not exists (select 1 from public.orders where id = p_cart_id and status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1')
     or exists (select 1 from public.f018_checkout_permits where child_order_id = v_child)
     or not public.f018_receipt_integrity(v_receipt_id) then
    raise exception 'selected_checkout_integrity_failure';
  end if;

  v_response := public.f018_receipt_response(v_receipt_id, false);
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 13. Recovery after an unknown outcome (fresh authority; never creates a purchase).
create or replace function public.recover_cart_line_checkout(
  p_org_id uuid, p_request_id uuid, p_cart_id uuid, p_item_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_destination_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_receipt public.cart_line_checkout_receipts%rowtype;
begin
  if p_org_id is null or p_request_id is null or p_cart_id is null or p_item_id is null or p_offer_id is null
     or p_destination_id is null or p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'invalid_checkout_input';
  end if;
  perform public.commerce_assert_buyer_member(p_org_id);
  -- Serializing on the organization key waits out any in-flight selected checkout, so an absent receipt is conclusive.
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));
  v_payload := jsonb_build_object('version', 1, 'operation', 'checkout_cart_line_bank_transfer_v1', 'organization_id', p_org_id,
    'cart_id', p_cart_id, 'item_id', p_item_id, 'offer_id', p_offer_id, 'quantity_kg', p_quantity_kg, 'destination_id', p_destination_id);
  select * into v_receipt from public.cart_line_checkout_receipts where request_id = p_request_id;
  if v_receipt.id is not null then
    if v_receipt.actor_user_id is distinct from auth.uid() or v_receipt.buyer_organization_id <> p_org_id then
      raise exception 'request_id_conflict';
    end if;
    if v_receipt.bound_payload is distinct from v_payload then
      raise exception 'request_payload_conflict';
    end if;
    if not public.f018_receipt_integrity(v_receipt.id) then
      raise exception 'persisted_receipt_integrity_error';
    end if;
    return jsonb_build_object('status', 'COMMITTED') || public.f018_receipt_response(v_receipt.id, true);
  end if;
  if exists (select 1 from public.cart_line_checkout_receipts r where r.source_order_item_id = p_item_id) then
    raise exception 'cart_line_already_consumed';
  end if;
  if exists (select 1 from public.commerce_request_log l where l.request_id = p_request_id) then
    raise exception 'request_id_conflict';
  end if;
  return jsonb_build_object('status', 'NOT_COMMITTED',
    'source_line_present', exists (select 1 from public.order_items oi where oi.id = p_item_id and oi.order_id = p_cart_id));
end;
$function$;

-- 14. Canonical-cart protection for the existing Add / update / remove entry points.
create or replace function public.add_cart_line(p_org_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_replay jsonb;
  v_order_id uuid;
  v_line_id uuid;
  v_quantity numeric;
  v_result jsonb;
  v_payload jsonb;
begin
  perform public.commerce_assert_buyer_member(p_org_id);
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));
  v_payload := jsonb_build_object('version', 1, 'operation', 'add_cart_line', 'organization_id', p_org_id, 'offer_id', p_offer_id, 'quantity_kg', p_quantity_kg);
  v_replay := public.f018_request_begin(p_request_id, 'add_cart_line', p_org_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then raise exception 'requested_quantity_not_available'; end if;
  v_order_id := public.commerce_resolve_cart(p_org_id);
  perform 1 from public.orders where id = v_order_id for update;
  insert into public.order_items (order_id, offer_id, quantity_kg) values (v_order_id, p_offer_id, p_quantity_kg)
  on conflict (order_id, offer_id) do update set quantity_kg = public.order_items.quantity_kg + excluded.quantity_kg
  returning id, quantity_kg into v_line_id, v_quantity;
  v_result := jsonb_build_object('order_id', v_order_id, 'line_id', v_line_id, 'quantity_kg', v_quantity);
  perform public.f018_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;

create or replace function public.update_order_item_quantity(p_order_item_id uuid, p_quantity_kg numeric)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_org uuid;
  v_flow text;
  v_planned numeric(14,3);
begin
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'requested_quantity_not_available';
  end if;

  -- Non-enumerating resolution: only an active member of the item's buyer organization can find it.
  select o.buyer_organization_id, o.commerce_flow into v_org, v_flow
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and public.is_org_member(o.buyer_organization_id);
  if v_org is null then
    raise exception 'order_item_not_found';
  end if;

  -- V1 carts serialize on the organization key first (shared with Add and selected checkout), then re-read.
  if v_flow = 'BANK_TRANSFER_V1' then
    perform pg_advisory_xact_lock(hashtextextended(v_org::text, 13));
  end if;
  select oi.* into v_item from public.order_items oi where oi.id = p_order_item_id;
  if v_item.id is null then
    raise exception 'order_item_not_found';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;
  if v_order.status <> 'DRAFT' then
    raise exception 'order_items_can_only_change_in_draft';
  end if;
  if v_order.commerce_flow = 'BANK_TRANSFER_V1' and v_order.id is distinct from public.f018_canonical_cart(v_order.buyer_organization_id) then
    raise exception 'cart_not_canonical';
  end if;
  if not public.organization_can_buy(v_order.buyer_organization_id) then
    raise exception 'buyer_not_authorized';
  end if;
  select oi.* into v_item from public.order_items oi where oi.id = p_order_item_id for update;
  if v_item.id is null then
    raise exception 'order_item_not_found';
  end if;

  if exists (
    select 1 from public.shipment_items si join public.order_shipments os on os.id = si.shipment_id
    where si.order_item_id = v_item.id and os.status not in ('DRAFT', 'CANCELLED', 'FAILED')
  ) then
    raise exception 'order_item_on_closed_shipment_plan';
  end if;

  select coalesce(sum(si.planned_quantity_kg), 0) into v_planned
  from public.shipment_items si join public.order_shipments os on os.id = si.shipment_id
  where si.order_item_id = v_item.id and os.status not in ('CANCELLED', 'FAILED');
  if v_planned > p_quantity_kg then
    raise exception 'order_item_quantity_below_shipment_plan';
  end if;

  update public.order_items set quantity_kg = p_quantity_kg where id = v_item.id;
end;
$function$;

create or replace function public.remove_order_item(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_org uuid;
  v_flow text;
begin
  select o.buyer_organization_id, o.commerce_flow into v_org, v_flow
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and public.is_org_member(o.buyer_organization_id);
  if v_org is null then
    raise exception 'order_item_not_found';
  end if;

  if v_flow = 'BANK_TRANSFER_V1' then
    perform pg_advisory_xact_lock(hashtextextended(v_org::text, 13));
  end if;
  select oi.* into v_item from public.order_items oi where oi.id = p_order_item_id;
  if v_item.id is null then
    raise exception 'order_item_not_found';
  end if;

  select * into v_order from public.orders where id = v_item.order_id for update;
  if v_order.status <> 'DRAFT' then
    raise exception 'order_items_can_only_change_in_draft';
  end if;
  if v_order.commerce_flow = 'BANK_TRANSFER_V1' and v_order.id is distinct from public.f018_canonical_cart(v_order.buyer_organization_id) then
    raise exception 'cart_not_canonical';
  end if;
  if not public.organization_can_buy(v_order.buyer_organization_id) then
    raise exception 'buyer_not_authorized';
  end if;
  select oi.* into v_item from public.order_items oi where oi.id = p_order_item_id for update;
  if v_item.id is null then
    raise exception 'order_item_not_found';
  end if;

  if exists (
    select 1 from public.shipment_items si join public.order_shipments os on os.id = si.shipment_id
    where si.order_item_id = v_item.id and os.status not in ('DRAFT', 'CANCELLED', 'FAILED')
  ) then
    raise exception 'order_item_on_closed_shipment_plan';
  end if;

  delete from public.order_items where id = v_item.id;
end;
$function$;

-- 15. Direct order_items INSERT (a table privilege authenticated holds) must obey canonical-cart protection too.
create or replace function public.f018_guard_order_item_canonical_cart()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_order public.orders%rowtype;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order.id is null or v_order.commerce_flow <> 'BANK_TRANSFER_V1' or v_order.status <> 'DRAFT' then
    return new;
  end if;
  if exists (select 1 from public.f018_checkout_permits p where p.child_order_id = new.order_id) then
    return new;
  end if;
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_order.buyer_organization_id::text, 13));
  if v_order.id is distinct from public.f018_canonical_cart(v_order.buyer_organization_id) then
    raise exception 'cart_not_canonical';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_f018_order_item_canonical_cart on public.order_items;
create trigger trg_f018_order_item_canonical_cart
  before insert on public.order_items
  for each row execute function public.f018_guard_order_item_canonical_cart();

-- 16. Grants: new public entry points are authenticated-only; every private helper has no application-role EXECUTE.
revoke all on function public.f018_receipt_immutable() from public, anon, authenticated, service_role;
grant execute on function public.f018_receipt_immutable() to postgres;
revoke all on function public.f018_assert_permit_consumed() from public, anon, authenticated, service_role;
grant execute on function public.f018_assert_permit_consumed() to postgres;
revoke all on function public.f018_request_begin(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.f018_request_begin(uuid, text, uuid, jsonb) to postgres;
revoke all on function public.f018_request_complete(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.f018_request_complete(uuid, jsonb) to postgres;
revoke all on function public.f018_canonical_cart(uuid) from public, anon, authenticated, service_role;
grant execute on function public.f018_canonical_cart(uuid) to postgres;
revoke all on function public.f018_stage_checkout_locks(uuid) from public, anon, authenticated, service_role;
grant execute on function public.f018_stage_checkout_locks(uuid) to postgres;
revoke all on function public.f018_compute_quote_core(uuid, uuid, text, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.f018_compute_quote_core(uuid, uuid, text, uuid[]) to postgres;
revoke all on function public.f018_checkout_kernel(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.f018_checkout_kernel(uuid, uuid, uuid) to postgres;
revoke all on function public.f018_receipt_integrity(uuid) from public, anon, authenticated, service_role;
grant execute on function public.f018_receipt_integrity(uuid) to postgres;
revoke all on function public.f018_receipt_response(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.f018_receipt_response(uuid, boolean) to postgres;
revoke all on function public.f018_guard_order_item_canonical_cart() from public, anon, authenticated, service_role;
grant execute on function public.f018_guard_order_item_canonical_cart() to postgres;

-- Replaced functions: CREATE OR REPLACE preserves their ACL; it is restated explicitly so the post-state is deterministic.
revoke all on function public.compute_order_quote(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.compute_order_quote(uuid, uuid, text) to postgres;
revoke all on function public.checkout_bank_transfer_v1(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.checkout_bank_transfer_v1(uuid, uuid, uuid) to authenticated;
revoke all on function public.add_cart_line(uuid, uuid, numeric, uuid) from public, anon, service_role;
grant execute on function public.add_cart_line(uuid, uuid, numeric, uuid) to authenticated;
revoke all on function public.update_order_item_quantity(uuid, numeric) from public, anon;
grant execute on function public.update_order_item_quantity(uuid, numeric) to authenticated, service_role;
revoke all on function public.remove_order_item(uuid) from public, anon;
grant execute on function public.remove_order_item(uuid) to authenticated, service_role;

revoke all on function public.checkout_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid, uuid) from public, anon, service_role;
grant execute on function public.checkout_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid, uuid) to authenticated;
revoke all on function public.estimate_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid) from public, anon, service_role;
grant execute on function public.estimate_cart_line_bank_transfer_v1(uuid, uuid, uuid, uuid, numeric, uuid) to authenticated;
revoke all on function public.recover_cart_line_checkout(uuid, uuid, uuid, uuid, uuid, numeric, uuid) from public, anon, service_role;
grant execute on function public.recover_cart_line_checkout(uuid, uuid, uuid, uuid, uuid, numeric, uuid) to authenticated;

commit;
