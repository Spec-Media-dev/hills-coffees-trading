-- Feature 013 M4b (T077): quote and proforma issuance.
-- The orders audit replacement MUST precede any destination-snapshot write in this transaction.
-- Paired rollback and read-only postflight live outside supabase/migrations.
begin;

do $guard$
begin
  if to_regprocedure('public.compute_order_quote(uuid,uuid,text)') is not null
     or to_regprocedure('public.estimate_cart(uuid,uuid,text)') is not null
     or to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is not null
     or to_regprocedure('public.write_audit_log_orders_redacted()') is not null
     or to_regprocedure('public.buyer_order_financial_rows()') is not null
     or to_regprocedure('public.internal_order_financial_rows()') is not null
     or to_regclass('public.v_buyer_order_financials') is not null
     or to_regclass('public.v_internal_order_financials') is not null then
    raise exception 'feature_013_m4b_objects_already_exist';
  end if;
  if to_regprocedure('public.commerce_request_begin(uuid,text,uuid)') is null
     or to_regprocedure('public.commerce_assert_buyer_member(uuid)') is null
     or to_regprocedure('public.check_proforma_snapshot_totals()') is null
     or to_regprocedure('public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                    and tgname = 'trg_audit_orders'
                    and tgfoid = 'public.write_audit_log()'::regprocedure and tgenabled = 'O')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_bank_instructions'
                    and policyname = 'proforma_bank_instructions_read' and cmd = 'SELECT'
                    and roles = '{authenticated}'::name[] and permissive = 'PERMISSIVE') then
    raise exception 'feature_013_m4b_prerequisites_missing';
  end if;
  if not exists (select 1 from public.commerce_settings where id and not bank_transfer_checkout_enabled)
     or exists (select 1 from public.orders where commerce_flow = 'BANK_TRANSFER_V1' and status <> 'DRAFT') then
    raise exception 'feature_013_m4b_checkout_state_unexpected';
  end if;
  -- T071 retained LOCAL state already holds one historical generic orders-audit
  -- row with a non-null destination snapshot. Do not silently erase audit data,
  -- and do not declare M4b postflight green while that PII remains. Independent
  -- review must authorize an exact-scope redaction before operator apply.
  if exists (select 1 from public.audit_logs a where a.entity_type = 'orders'
      and ((a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
        or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
        or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
        or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines'])) then
    raise exception 'feature_013_m4b_existing_order_audit_pii_requires_review';
  end if;
end;
$guard$;

-- The historical trg_audit_orders used write_audit_log(), which copies the complete
-- row with to_jsonb(old/new). An issued order contains destination address and phone.
-- Use a fixed allow-list: newly added order columns cannot silently enter audit_logs.
create or replace function public.write_audit_log_orders_redacted()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_correlation_id uuid;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;

  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'id', old.id, 'order_code', old.order_code,
      'buyer_organization_id', old.buyer_organization_id,
      'status', old.status, 'commerce_flow', old.commerce_flow,
      'currency', old.currency, 'current_proforma_id', old.current_proforma_id,
      'delivery_destination_id', old.delivery_destination_id,
      'shipping_ready_at', old.shipping_ready_at, 'hold_started_at', old.hold_started_at,
      'hold_expires_at', old.hold_expires_at, 'confirmed_at', old.confirmed_at,
      'paid_at', old.paid_at, 'completed_at', old.completed_at,
      'cancelled_at', old.cancelled_at, 'cancelled_by', old.cancelled_by,
      'has_manual_adjustment', old.has_manual_adjustment,
      'created_by', old.created_by, 'created_at', old.created_at,
      'updated_at', old.updated_at, 'correlation_id', old.correlation_id);
  end if;
  if tg_op <> 'DELETE' then
    v_new := jsonb_build_object(
      'id', new.id, 'order_code', new.order_code,
      'buyer_organization_id', new.buyer_organization_id,
      'status', new.status, 'commerce_flow', new.commerce_flow,
      'currency', new.currency, 'current_proforma_id', new.current_proforma_id,
      'delivery_destination_id', new.delivery_destination_id,
      'shipping_ready_at', new.shipping_ready_at, 'hold_started_at', new.hold_started_at,
      'hold_expires_at', new.hold_expires_at, 'confirmed_at', new.confirmed_at,
      'paid_at', new.paid_at, 'completed_at', new.completed_at,
      'cancelled_at', new.cancelled_at, 'cancelled_by', new.cancelled_by,
      'has_manual_adjustment', new.has_manual_adjustment,
      'created_by', new.created_by, 'created_at', new.created_at,
      'updated_at', new.updated_at, 'correlation_id', new.correlation_id);
  end if;

  insert into public.audit_logs
    (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values
    (auth.uid(), tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end,
     tg_op, v_old, v_new,
     jsonb_build_object('redaction', 'allow_list',
                        'redacted_fields', jsonb_build_array('destination_snapshot', 'cancel_reason', 'idempotency_key')),
     coalesce(v_correlation_id, gen_random_uuid()));
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function public.write_audit_log_orders_redacted() from public, anon, authenticated;
grant execute on function public.write_audit_log_orders_redacted() to service_role;

drop trigger trg_audit_orders on public.orders;
create trigger trg_audit_orders
  after insert or update or delete on public.orders
  for each row execute function public.write_audit_log_orders_redacted();

-- RLS-008 (review B2): issuance writes the full receiving-account snapshot while the proforma is only ISSUED. The
-- buyer may read it only once that proforma is confirmed (CONFIRMED, then PAID); finance keeps full access
-- (rls-storage: B ∨ F, ADMIN is F). The M3 restrictive MFA gate on this table is unchanged.
drop policy proforma_bank_instructions_read on public.proforma_bank_instructions;
create policy proforma_bank_instructions_read on public.proforma_bank_instructions
  for select to authenticated
  using (exists (select 1 from public.proforma_invoices pi
                 where pi.id = proforma_bank_instructions.proforma_id
                   and pi.status in ('CONFIRMED', 'PAID')
                   and public.is_order_buyer_member(pi.order_id))
         or public.is_finance_operator());

-- Owner decision H1 (2026-09-28): recognising a request id never authorizes a caller. These safe
-- redefinitions supersede only M4a's insert-first replay order; they keep the applied migration
-- intact and preserve request-log idempotency after fresh authorization succeeds.
create or replace function public.add_cart_line(p_org_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_order_id uuid; v_line_id uuid; v_quantity numeric; v_result jsonb;
begin
  perform public.commerce_assert_buyer_member(p_org_id);
  v_replay := public.commerce_request_begin(p_request_id, 'add_cart_line', p_org_id);
  if v_replay is not null then return v_replay; end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then raise exception 'requested_quantity_not_available'; end if;
  v_order_id := public.commerce_resolve_cart(p_org_id);
  perform 1 from public.orders where id = v_order_id for update;
  insert into public.order_items (order_id, offer_id, quantity_kg) values (v_order_id, p_offer_id, p_quantity_kg)
  on conflict (order_id, offer_id) do update set quantity_kg = public.order_items.quantity_kg + excluded.quantity_kg
  returning id, quantity_kg into v_line_id, v_quantity;
  v_result := jsonb_build_object('order_id', v_order_id, 'line_id', v_line_id, 'quantity_kg', v_quantity);
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;

create or replace function public.upsert_delivery_destination(p_id uuid, p_org_id uuid, p_fields jsonb, p_request_id uuid)
returns uuid language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_id uuid; v_default boolean;
begin
  perform public.commerce_assert_buyer_member(p_org_id);
  v_replay := public.commerce_request_begin(p_request_id, 'upsert_delivery_destination', p_org_id);
  if v_replay is not null then return (v_replay ->> 'destination_id')::uuid; end if;
  if p_id is not null then
    select d.id into v_id from public.delivery_destinations d
    where d.id = p_id and d.organization_id = p_org_id and d.retired_at is null for update;
    if v_id is null then raise exception 'destination_not_found'; end if;
  end if;
  begin
    if jsonb_typeof(p_fields) is distinct from 'object' then raise exception using errcode = '23514'; end if;
    v_default := coalesce((p_fields ->> 'is_default')::boolean, false);
    if v_default then update public.delivery_destinations set is_default = false
      where organization_id = p_org_id and is_default and retired_at is null and id is distinct from v_id; end if;
    if v_id is null then
      insert into public.delivery_destinations (organization_id, label, country_code, city, address_line_1, address_line_2,
        contact_name, contact_phone, delivery_method, is_default, created_by)
      values (p_org_id, p_fields ->> 'label', p_fields ->> 'country_code', p_fields ->> 'city', p_fields ->> 'address_line_1',
        nullif(p_fields ->> 'address_line_2', ''), p_fields ->> 'contact_name', p_fields ->> 'contact_phone',
        coalesce(p_fields ->> 'delivery_method', 'Courier'), v_default, auth.uid()) returning id into v_id;
    else
      update public.delivery_destinations set label = p_fields ->> 'label', country_code = p_fields ->> 'country_code',
        city = p_fields ->> 'city', address_line_1 = p_fields ->> 'address_line_1',
        address_line_2 = nullif(p_fields ->> 'address_line_2', ''), contact_name = p_fields ->> 'contact_name',
        contact_phone = p_fields ->> 'contact_phone', delivery_method = coalesce(p_fields ->> 'delivery_method', 'Courier'),
        is_default = v_default where id = v_id;
    end if;
  exception when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
    raise exception 'destination_invalid';
  end;
  perform public.commerce_request_complete(p_request_id, jsonb_build_object('destination_id', v_id));
  return v_id;
end;
$function$;

create or replace function public.retire_delivery_destination(p_id uuid, p_request_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_destination public.delivery_destinations%rowtype;
begin
  -- Resolve only through the caller's current membership before the replay lookup, preserving non-enumeration.
  select d.* into v_destination from public.delivery_destinations d where d.id = p_id and public.is_org_member(d.organization_id) for update;
  if v_destination.id is null then raise exception 'destination_not_found'; end if;
  perform public.commerce_assert_buyer_member(v_destination.organization_id);
  v_replay := public.commerce_request_begin(p_request_id, 'retire_delivery_destination', p_id);
  if v_replay is not null then return; end if;
  if v_destination.retired_at is null then update public.delivery_destinations
    set retired_at = clock_timestamp(), retired_by = auth.uid(), is_default = false where id = p_id; end if;
  perform public.commerce_request_complete(p_request_id, jsonb_build_object('destination_id', p_id));
end;
$function$;

create or replace function public.update_commerce_settings(p_validity_hours int, p_checkout_enabled boolean, p_proof_enabled boolean,
                                                           p_request_id uuid, p_pilot_organization_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_old public.commerce_settings%rowtype; v_new public.commerce_settings%rowtype; v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required'; end if;
  v_replay := public.commerce_request_begin(p_request_id, 'update_commerce_settings', null);
  if v_replay is not null then return v_replay; end if;
  if p_validity_hours is not null and p_validity_hours not between 1 and 720 then raise exception 'invalid_validity_hours'; end if;
  select * into v_old from public.commerce_settings where id for update;
  update public.commerce_settings set proforma_validity_hours = coalesce(p_validity_hours, proforma_validity_hours),
    bank_transfer_checkout_enabled = coalesce(p_checkout_enabled, bank_transfer_checkout_enabled),
    proof_submission_enabled = coalesce(p_proof_enabled, proof_submission_enabled),
    pilot_organization_ids = case when p_pilot_organization_ids is null then pilot_organization_ids else
      coalesce((select array_agg(distinct x order by x) from unnest(p_pilot_organization_ids) x where x is not null), '{}'::uuid[]) end,
    updated_by = auth.uid() where id returning * into v_new;
  v_result := jsonb_build_object('proforma_validity_hours', v_new.proforma_validity_hours,
    'bank_transfer_checkout_enabled', v_new.bank_transfer_checkout_enabled, 'proof_submission_enabled', v_new.proof_submission_enabled,
    'pilot_organization_ids', to_jsonb(v_new.pilot_organization_ids));
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), 'commerce_settings', null, 'UPDATE', jsonb_build_object('proforma_validity_hours', v_old.proforma_validity_hours,
    'bank_transfer_checkout_enabled', v_old.bank_transfer_checkout_enabled, 'proof_submission_enabled', v_old.proof_submission_enabled,
    'pilot_organization_ids', to_jsonb(v_old.pilot_organization_ids)), v_result,
    jsonb_build_object('operation', 'update_commerce_settings', 'request_id', p_request_id), p_request_id);
  perform public.commerce_request_complete(p_request_id, v_result); return v_result;
end;
$function$;

create or replace function public.set_default_payment_account(p_account_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_account_id uuid; v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required'; end if;
  v_replay := public.commerce_request_begin(p_request_id, 'set_default_payment_account', p_account_id);
  if v_replay is not null then return v_replay; end if;
  select a.id into v_account_id from public.payment_accounts a where a.id = p_account_id and a.is_active and a.currency = 'USD' for update;
  if v_account_id is null then raise exception 'payment_account_not_found'; end if;
  update public.payment_accounts set is_default_for_currency = false where currency = 'USD' and is_default_for_currency and id <> v_account_id;
  update public.payment_accounts set is_default_for_currency = true where id = v_account_id and not is_default_for_currency;
  v_result := jsonb_build_object('payment_account_id', v_account_id, 'currency', 'USD');
  perform public.commerce_request_complete(p_request_id, v_result); return v_result;
end;
$function$;

create or replace function public.admin_convert_legacy_draft(p_order_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare v_replay jsonb; v_order public.orders%rowtype; v_result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required'; end if;
  v_replay := public.commerce_request_begin(p_request_id, 'admin_convert_legacy_draft', p_order_id);
  if v_replay is not null then return v_replay; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.commerce_flow <> 'LEGACY' or v_order.status <> 'DRAFT'
     or exists (select 1 from public.order_shipments s where s.order_id = p_order_id and s.status <> 'CANCELLED') then
    raise exception 'legacy_draft_not_convertible';
  end if;
  perform set_config('app.internal_transition', 'true', true);
  update public.orders set commerce_flow = 'BANK_TRANSFER_V1' where id = p_order_id;
  perform set_config('app.internal_transition', 'false', true);
  v_result := jsonb_build_object('order_id', p_order_id, 'commerce_flow', 'BANK_TRANSFER_V1');
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), 'orders', p_order_id, 'CONVERT_LEGACY_DRAFT', jsonb_build_object('commerce_flow', 'LEGACY', 'status', 'DRAFT'),
    jsonb_build_object('commerce_flow', 'BANK_TRANSFER_V1', 'status', 'DRAFT'),
    jsonb_build_object('operation', 'admin_convert_legacy_draft', 'request_id', p_request_id), p_request_id);
  perform public.commerce_request_complete(p_request_id, v_result); return v_result;
end;
$function$;

-- Re-state the M4a API ACLs beside these replacement bodies. CREATE OR REPLACE preserves them,
-- but the current migration must make the public/anon boundary and authenticated audience explicit.
revoke all on function public.add_cart_line(uuid, uuid, numeric, uuid) from public, anon, service_role;
revoke all on function public.upsert_delivery_destination(uuid, uuid, jsonb, uuid) from public, anon, service_role;
revoke all on function public.retire_delivery_destination(uuid, uuid) from public, anon, service_role;
revoke all on function public.update_commerce_settings(integer, boolean, boolean, uuid, uuid[]) from public, anon, service_role;
revoke all on function public.set_default_payment_account(uuid, uuid) from public, anon, service_role;
revoke all on function public.admin_convert_legacy_draft(uuid, uuid) from public, anon, service_role;
grant execute on function public.add_cart_line(uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.upsert_delivery_destination(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function public.retire_delivery_destination(uuid, uuid) to authenticated;
grant execute on function public.update_commerce_settings(integer, boolean, boolean, uuid, uuid[]) to authenticated;
grant execute on function public.set_default_payment_account(uuid, uuid) to authenticated;
grant execute on function public.admin_convert_legacy_draft(uuid, uuid) to authenticated;

-- Owner decision H2 (2026-09-28): PostgreSQL RLS filters rows, not columns. Buyers lose direct table access and
-- receive a fixed buyer-safe projection; finance, platform admins and auditors use a separate full-snapshot projection.
drop policy order_financials_read on public.order_financials;
create policy order_financials_internal_read on public.order_financials for select to authenticated
  using (public.is_finance_operator() or public.is_platform_admin() or public.is_auditor());
revoke select on table public.order_financials from public, anon, authenticated;
grant select on table public.order_financials to service_role;

create function public.buyer_order_financial_rows()
returns table (order_id uuid, base_subtotal numeric, shipping_amount numeric, vat_amount numeric,
               buyer_total_amount numeric, total_quantity_kg numeric, currency char(3), calculated_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public, auth
as $function$
  select f.order_id, f.base_subtotal, f.shipping_amount, f.vat_amount,
         f.buyer_total_amount, f.total_quantity_kg, f.currency, f.calculated_at
  from public.order_financials f
  where public.is_order_buyer_member(f.order_id) and public.mfa_satisfied();
$function$;
revoke all on function public.buyer_order_financial_rows() from public, anon, service_role;
grant execute on function public.buyer_order_financial_rows() to authenticated;

create function public.internal_order_financial_rows()
returns setof public.order_financials
language sql stable security definer set search_path = pg_catalog, public, auth
as $function$
  select f.* from public.order_financials f
  where public.mfa_satisfied()
    and (public.is_finance_operator() or public.is_platform_admin() or public.is_auditor());
$function$;
revoke all on function public.internal_order_financial_rows() from public, anon, service_role;
grant execute on function public.internal_order_financial_rows() to authenticated;

create view public.v_buyer_order_financials with (security_invoker = true) as
  select * from public.buyer_order_financial_rows();
create view public.v_internal_order_financials with (security_invoker = true) as
  select * from public.internal_order_financial_rows();
revoke all on table public.v_buyer_order_financials, public.v_internal_order_financials from public, anon, authenticated, service_role;
grant select on table public.v_buyer_order_financials, public.v_internal_order_financials to authenticated;

-- Internal calculation shared by the estimate and the issued, frozen version.
-- Launch overlay: base offer price; no promotion or price-tier selection.
create or replace function public.compute_order_quote(
  p_order_id uuid, p_destination_id uuid, p_promo_code text default null)
returns jsonb
language plpgsql stable security definer
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
    where oi.order_id = p_order_id
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
      where oi2.order_id = p_order_id and o2.seller_organization_id = v_item.seller_organization_id
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
revoke all on function public.compute_order_quote(uuid,uuid,text) from public, anon, authenticated, service_role;
-- Explicit owner-only grant satisfies the migration convention without exposing
-- the private economics function to an API role.
grant execute on function public.compute_order_quote(uuid,uuid,text) to postgres;

-- The wrapper is the only buyer-facing view of a live quote. No seller economics,
-- bank identifiers, private destination contact, or tax-number snapshot is returned.
create or replace function public.estimate_cart(
  p_order_id uuid, p_destination_id uuid default null, p_promo_code text default null)
returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_org_id uuid;
  v_quote jsonb;
  v_lines jsonb;
begin
  select buyer_organization_id into v_org_id from public.orders
  where id = p_order_id and commerce_flow = 'BANK_TRANSFER_V1' and status = 'DRAFT';
  if not found or not public.is_org_member(v_org_id) then raise exception 'order_not_found'; end if;
  perform public.commerce_assert_buyer_member(v_org_id);
  v_quote := public.compute_order_quote(p_order_id, p_destination_id, p_promo_code);
  select coalesce(jsonb_agg(jsonb_build_object(
    'offer_code', x.value -> 'offer_code', 'product_name', x.value -> 'product_name',
    'quantity_kg', x.value -> 'quantity_kg', 'unit_price', x.value -> 'unit_price',
    'gross', x.value -> 'gross', 'discount', x.value -> 'discount',
    'net', x.value -> 'net', 'vat', x.value -> 'vat') order by x.ordinality), '[]'::jsonb)
  into v_lines from jsonb_array_elements(v_quote -> 'lines') with ordinality as x(value, ordinality);
  return jsonb_build_object(
    'is_estimate', true, 'reason', case when p_destination_id is null then 'destination_required' else null end,
    'order_id', p_order_id, 'currency', 'USD', 'lines', v_lines,
    'groups', v_quote -> 'groups', 'merchandise_gross', v_quote -> 'merchandise_gross',
    'discount_total', v_quote -> 'discount_total', 'merchandise_net', v_quote -> 'merchandise_net',
    'shipping_total', v_quote -> 'shipping_total', 'vat_total', v_quote -> 'vat_total',
    'buyer_total', v_quote -> 'buyer_total');
end;
$function$;
revoke all on function public.estimate_cart(uuid,uuid,text) from public, anon, service_role;
grant execute on function public.estimate_cart(uuid,uuid,text) to authenticated;

create or replace function public.issue_proforma(
  p_order_id uuid, p_destination_id uuid, p_promo_code text, p_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_replay jsonb;
  v_order public.orders%rowtype;
  v_settings public.commerce_settings%rowtype;
  v_prior public.proforma_invoices%rowtype;
  v_quote jsonb;
  v_line jsonb;
  v_group jsonb;
  v_proforma_id uuid;
  v_item_id uuid;
  v_group_id uuid;
  v_code text;
  v_version int;
  v_issued_at timestamptz;
  v_valid_until timestamptz;
  v_account_last4 text;
  v_iban_last4 text;
  v_masked jsonb;
  v_result jsonb;
  v_settlement record;
begin
  -- Review B3: current authorization is re-evaluated under the order lock BEFORE the request log can return a stored
  -- response, so a replay never outlives the caller's membership, can-buy status or MFA. A non-member receives the
  -- same code as a missing order (non-enumeration). The request log then still precedes every write, and its
  -- transaction rolls back with every later failure.
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.commerce_flow <> 'BANK_TRANSFER_V1'
     or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);
  v_replay := public.commerce_request_begin(p_request_id, 'issue_proforma', p_order_id);
  if v_replay is not null then return v_replay; end if;

  select * into v_settings from public.commerce_settings where id;
  if not found or not v_settings.bank_transfer_checkout_enabled
     or (cardinality(v_settings.pilot_organization_ids) > 0
         and not v_order.buyer_organization_id = any(v_settings.pilot_organization_ids)) then
    raise exception 'checkout_disabled';
  end if;
  if v_order.status not in ('DRAFT', 'PROFORMA_ISSUED') then
    raise exception 'order_not_editable';
  end if;
  if p_destination_id is null then raise exception 'destination_required'; end if;
  if exists (select 1 from public.order_shipments
             where order_id = p_order_id and status <> 'CANCELLED') then
    raise exception 'legacy_shipment_plan_present';
  end if;

  select * into v_prior from public.proforma_invoices
  where order_id = p_order_id order by version desc limit 1 for update;
  if v_prior.id is not null then
    if v_order.current_proforma_id is distinct from v_prior.id
       or v_order.status <> 'PROFORMA_ISSUED' then
      raise exception 'order_not_editable';
    end if;
    if v_prior.status <> 'ISSUED' then raise exception 'order_not_editable'; end if;
    if v_prior.valid_until > clock_timestamp() then raise exception 'proforma_still_valid'; end if;
    perform set_config('app.internal_transition', 'true', true);
    update public.proforma_invoices set status = 'EXPIRED', expired_at = clock_timestamp()
    where id = v_prior.id and status = 'ISSUED';
    perform set_config('app.internal_transition', 'false', true);
    v_version := v_prior.version + 1;
  else
    if v_order.status <> 'DRAFT' then raise exception 'order_not_editable'; end if;
    v_version := 1;
  end if;

  -- A non-AE destination is rejected here before any payable snapshot, bank
  -- instruction, or reservation write. The entire transaction is atomic.
  v_quote := public.compute_order_quote(p_order_id, p_destination_id, p_promo_code);
  v_issued_at := clock_timestamp();
  v_valid_until := v_issued_at + make_interval(hours => v_settings.proforma_validity_hours);
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

  insert into public.proforma_invoices (
    order_id, version, supersedes_proforma_id, status, issued_at, valid_until,
    validity_hours_snapshot, currency, merchandise_gross, discount_total,
    merchandise_net, shipping_total, vat_total, buyer_total, tax_rule_id,
    tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot,
    bank_account_masked, issued_by)
  values (
    p_order_id, v_version, v_prior.id, 'ISSUED', v_issued_at, v_valid_until,
    v_settings.proforma_validity_hours, 'USD',
    (v_quote ->> 'merchandise_gross')::numeric, 0,
    (v_quote ->> 'merchandise_net')::numeric,
    (v_quote ->> 'shipping_total')::numeric, (v_quote ->> 'vat_total')::numeric,
    (v_quote ->> 'buyer_total')::numeric, (v_quote ->> 'tax_rule_id')::uuid,
    (v_quote ->> 'tax_rate')::numeric, v_quote ->> 'tax_base',
    v_quote -> 'buyer_snapshot', v_quote -> 'destination_snapshot', v_masked, auth.uid())
  returning id, proforma_code into v_proforma_id, v_code;

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
    insert into public.proforma_invoice_items (
      proforma_id, order_item_id, description, quantity_kg, unit_price, amount,
      offer_id, offer_code_snapshot, seller_organization_id, seller_type_snapshot,
      warehouse_id, fulfillment_group_id, list_unit_price, price_tier_id,
      gross_amount, discount_amount, discount_capped, net_amount, vat_amount,
      line_total, product_name_snapshot, origin_name_snapshot, lot_code_snapshot)
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
      v_line ->> 'product_name', v_line ->> 'origin_name', v_line ->> 'lot_code')
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
    v_quote ->> 'bank_swift', 'USD', v_order.order_code || ' / ' || v_code);

  perform set_config('app.internal_transition', 'true', true);
  update public.orders set status = 'PROFORMA_ISSUED',
    delivery_destination_id = p_destination_id,
    destination_snapshot = v_quote -> 'destination_snapshot',
    current_proforma_id = v_proforma_id
  where id = p_order_id;
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
    currency = excluded.currency, commission_policy_id = null,
    commission_percentage_snapshot = null, tax_rule_id = excluded.tax_rule_id,
    tax_percentage_snapshot = excluded.tax_percentage_snapshot,
    tax_base_snapshot = excluded.tax_base_snapshot,
    calculated_at = excluded.calculated_at;
  perform set_config('app.internal_transition', 'false', true);

  perform public.emit_notification_event('proforma.issued', 'proforma', v_proforma_id,
    'proforma-issued:' || v_version,
    jsonb_build_object('rule', 'buyer_org_members', 'order_id', p_order_id),
    'proforma_issued',
    jsonb_build_object('order_code', v_order.order_code, 'proforma_code', v_code,
      'deadline', v_valid_until, 'amount', (v_quote ->> 'buyer_total')::numeric,
      'currency', 'USD'));

  v_result := jsonb_build_object('order_id', p_order_id,
    'proforma_id', v_proforma_id, 'proforma_code', v_code, 'version', v_version,
    'valid_until', v_valid_until, 'buyer_total', v_quote -> 'buyer_total');
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.issue_proforma(uuid,uuid,text,uuid) from public, anon, service_role;
grant execute on function public.issue_proforma(uuid,uuid,text,uuid) to authenticated;

commit;
