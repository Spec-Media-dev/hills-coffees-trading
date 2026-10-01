-- Rollback for Feature 015: Manual Bank Transfer & Private Payment Proof
-- Reverts forward migration 20260930100000_feature_015_atomic_checkout_and_payment_proof.sql

begin;

-- 1. Drop Feature 015 RPCs and functions
drop function if exists public.cleanup_orphan_payment_proof_upload(uuid);
drop function if exists public.finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid);
drop function if exists public.checkout_bank_transfer_v1(uuid, uuid, uuid);
drop function if exists public.prepare_payment_proof_upload(uuid, uuid, text);

-- 2. Drop storage policies and helper
drop policy if exists payment_proof_storage_insert on storage.objects;
drop policy if exists payment_proof_storage_select on storage.objects;
drop function if exists public.payment_proof_storage_object_authorized(text, boolean);

-- 3. Revert file_assets policies
drop policy if exists payment_proof_file_assets_read on public.file_assets;

-- Restore pre-Feature-015 catalog_admin_files without payment-proofs carve-out
drop policy if exists catalog_admin_files on public.file_assets;
create policy catalog_admin_files on public.file_assets
for all using (
  public.is_platform_admin()
  or uploaded_by = auth.uid()
  or public.is_org_member(organization_id)
)
with check (
  public.is_platform_admin()
  or uploaded_by = auth.uid()
  or public.is_org_member(organization_id)
);

-- 4. Revert payment_proofs policies
drop policy if exists payment_proofs_read on public.payment_proofs;
create policy payment_proofs_read on public.payment_proofs
  for select to authenticated
  using (
    (exists (
      select 1 from public.payments p
      where p.id = payment_proofs.payment_id
        and public.is_order_buyer_member(p.order_id)
    ))
    or public.is_finance_operator()
  );

-- 5. Restore pre-Feature-015 validate_order_transition (from 20260925100000_feature_013_commerce_state_vocabulary.sql)
create or replace function public.validate_order_transition()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.commerce_flow is distinct from old.commerce_flow then
    if not (public.is_internal_transition() and old.commerce_flow = 'LEGACY' and new.commerce_flow = 'BANK_TRANSFER_V1'
            and old.status = 'DRAFT' and new.status = 'DRAFT') then
      raise exception 'order_commerce_flow_immutable';
    end if;
  end if;

  if (new.cancelled_at, new.cancelled_by, new.cancel_reason, new.has_manual_adjustment)
       is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason, old.has_manual_adjustment)
     and not public.is_internal_transition() then
    raise exception 'order_field_not_client_writable';
  end if;

  if new.commerce_flow = 'LEGACY' then
    if new.status <> old.status then
      if not public.is_internal_transition() and not public.is_platform_admin() then
        if not (old.status = 'DRAFT' and new.status = 'CONFIRMED') then
          raise exception 'order_status_can_only_change_through_workflow';
        end if;
      end if;

      if old.status = 'DRAFT' and new.status not in ('CONFIRMED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'CONFIRMED' and new.status not in ('HOLD', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'EXPIRED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_PROOF_SUBMITTED' and new.status not in ('PAYMENT_UNDER_REVIEW', 'HOLD', 'EXPIRED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'HOLD', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PARTIALLY_DELIVERED' and new.status <> 'COMPLETED' then raise exception 'invalid_order_transition'; end if;
      if old.status in ('COMPLETED', 'EXPIRED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;
      -- Feature 013 fence: the values M1 adds belong to the BANK_TRANSFER_V1 graph only.
      if new.status in ('PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED') then raise exception 'invalid_order_transition'; end if;
    end if;

    if new.status = 'HOLD' then
      perform public.assert_order_checkout_ready(new.id);
      new.hold_started_at := coalesce(new.hold_started_at, now());
      new.hold_expires_at := coalesce(new.hold_expires_at, now() + interval '20 minutes');
    end if;
  else
    if new.status <> old.status then
      if not public.is_internal_transition()
         and not (new.status = 'DISPUTED' and public.is_platform_admin()) then
        raise exception 'order_status_can_only_change_through_workflow';
      end if;

      if old.status = 'DRAFT' and new.status not in ('PROFORMA_ISSUED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PROFORMA_ISSUED' and new.status not in ('HOLD', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'HOLD' and new.status not in ('PAYMENT_UNDER_REVIEW', 'EXPIRED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'PAYMENT_REJECTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PARTIALLY_DELIVERED' and new.status not in ('COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      -- data-model §7.1 defines no exit from DISPUTED for v1 rows: fail closed until one is specified.
      if old.status = 'DISPUTED' then raise exception 'invalid_order_transition'; end if;
      if old.status in ('CONFIRMED', 'PAYMENT_PROOF_SUBMITTED') then raise exception 'invalid_order_transition'; end if;
      if old.status in ('COMPLETED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REJECTED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;

      -- The hold window is the reservation's own (confirm_proforma copies expires_at); never defaulted here.
      if new.status = 'HOLD' then
        if new.hold_expires_at is null then raise exception 'order_hold_window_required'; end if;
        new.hold_started_at := coalesce(new.hold_started_at, clock_timestamp());
      end if;
      if new.status = 'CANCELLED' then new.cancelled_at := coalesce(new.cancelled_at, clock_timestamp()); end if;
    end if;
  end if;

  if new.status = 'PAID' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status = 'COMPLETED' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end;
$$;
revoke all on function public.validate_order_transition() from public, anon;
grant execute on function public.validate_order_transition() to authenticated, service_role;

-- 6. Restore pre-Feature-015 issue_proforma (from 20260926103000_feature_013_quote_and_proforma_issuance.sql)
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

-- 7. Restore pre-Feature-015 confirm_proforma (from 20260928120000_feature_013_stock_reservation.sql)
create or replace function public.confirm_proforma(p_proforma_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_proforma public.proforma_invoices%rowtype;
  v_item record;
  v_offer public.coffee_offers%rowtype;
  v_offer_attrs record;
  v_position public.inventory_positions%rowtype;
  v_position_id uuid;
  v_reservation_id uuid;
  v_expires_at timestamptz;
  v_buyer_total numeric;
  v_result jsonb;
  v_reclaim_order uuid;
begin
  select order_id into v_order_id from public.proforma_invoices where id = p_proforma_id;
  if v_order_id is not null then
    select * into v_order from public.orders where id = v_order_id for update;
  end if;
  if v_order_id is null or v_order.id is null or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'proforma_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);

  v_replay := public.commerce_request_begin(p_request_id, 'confirm_proforma', p_proforma_id);
  if v_replay is not null then return v_replay; end if;

  select * into v_proforma from public.proforma_invoices where id = p_proforma_id for update;
  if v_order.status <> 'PROFORMA_ISSUED' or v_proforma.status <> 'ISSUED' or v_order.current_proforma_id <> v_proforma.id then
    raise exception 'proforma_not_confirmable';
  end if;
  if v_proforma.valid_until <= clock_timestamp() then
    raise exception 'proforma_expired';
  end if;

  for v_reclaim_order in
    select distinct r.order_id
    from public.inventory_reservations r
    join public.inventory_reservation_items ri on ri.reservation_id = r.id
    join public.proforma_invoice_items pii on pii.offer_id = ri.offer_id and pii.proforma_id = p_proforma_id
    where r.status = 'ACTIVE' and r.expires_at <= clock_timestamp() and r.order_id <> v_order_id
    order by r.order_id
  loop
    perform public.commerce_release_reservation(v_reclaim_order);
  end loop;

  for v_item in
    select pii.offer_id, pii.quantity_kg
    from public.proforma_invoice_items pii
    where pii.proforma_id = p_proforma_id
    order by pii.offer_id
  loop
    select * into v_offer from public.coffee_offers where id = v_item.offer_id for update;
    if v_offer.id is null or v_offer.status not in ('PUBLISHED', 'PARTIALLY_FILLED') or not v_offer.is_visible
       or (v_offer.quantity_kg - v_offer.filled_quantity_kg - v_offer.reserved_quantity_kg) < v_item.quantity_kg then
      raise exception 'listing_inventory_changed';
    end if;
    if v_offer.seller_type = 'MEMBER_SELLER' and not public.organization_can_sell(v_offer.seller_organization_id) then
      raise exception 'seller_not_authorized';
    end if;
  end loop;

  for v_item in
    select ip.id as position_id, sum(pii.quantity_kg) as total_quantity_kg
    from public.proforma_invoice_items pii
    join public.coffee_offers o on o.id = pii.offer_id
    join public.inventory_positions ip
      on ip.lot_id = o.lot_id and ip.owner_organization_id = o.seller_organization_id
      and ip.warehouse_id = o.warehouse_id
      and ip.warehouse_location_id is not distinct from o.warehouse_location_id
    where pii.proforma_id = p_proforma_id
    group by ip.id
    order by ip.id
  loop
    select * into v_position from public.inventory_positions where id = v_item.position_id for update;
    if v_position.id is null or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_item.total_quantity_kg then
      raise exception 'seller_inventory_changed';
    end if;
  end loop;

  for v_item in
    select pii.offer_id, pii.quantity_kg
    from public.proforma_invoice_items pii
    where pii.proforma_id = p_proforma_id
    order by pii.offer_id
  loop
    select o.lot_id, o.seller_organization_id, o.warehouse_id, o.warehouse_location_id
    into v_offer_attrs from public.coffee_offers o where o.id = v_item.offer_id;
    select * into v_position from public.inventory_positions ip
    where ip.lot_id = v_offer_attrs.lot_id and ip.owner_organization_id = v_offer_attrs.seller_organization_id
      and ip.warehouse_id = v_offer_attrs.warehouse_id
      and ip.warehouse_location_id is not distinct from v_offer_attrs.warehouse_location_id
    order by ip.created_at, ip.id limit 1 for update;
    if v_position.id is null or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_item.quantity_kg then
      raise exception 'seller_inventory_changed';
    end if;
  end loop;

  v_expires_at := clock_timestamp() + interval '20 minutes';
  insert into public.inventory_reservations (order_id, proforma_id, status, expires_at, confirmed_by)
  values (v_order_id, p_proforma_id, 'ACTIVE', v_expires_at, auth.uid())
  returning id into v_reservation_id;

  for v_item in
    select pii.offer_id, pii.quantity_kg
    from public.proforma_invoice_items pii
    where pii.proforma_id = p_proforma_id
    order by pii.offer_id
  loop
    select o.lot_id, o.seller_organization_id, o.warehouse_id, o.warehouse_location_id
    into v_offer_attrs from public.coffee_offers o where o.id = v_item.offer_id;
    select id into v_position_id from public.inventory_positions ip
    where ip.lot_id = v_offer_attrs.lot_id and ip.owner_organization_id = v_offer_attrs.seller_organization_id
      and ip.warehouse_id = v_offer_attrs.warehouse_id
      and ip.warehouse_location_id is not distinct from v_offer_attrs.warehouse_location_id
    order by ip.created_at, ip.id limit 1;

    update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg, updated_at = now()
    where id = v_position_id;

    perform set_config('app.checkout_reservation', 'true', true);
    update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg where id = v_item.offer_id;
    perform set_config('app.checkout_reservation', 'false', true);

    insert into public.inventory_reservation_items (reservation_id, offer_id, inventory_position_id, quantity_kg)
    values (v_reservation_id, v_item.offer_id, v_position_id, v_item.quantity_kg);
  end loop;

  perform set_config('app.internal_transition', 'true', true);
  update public.proforma_invoices set status = 'CONFIRMED', confirmed_at = clock_timestamp(), confirmed_by = auth.uid()
  where id = p_proforma_id;
  update public.orders set status = 'HOLD', hold_expires_at = v_expires_at where id = v_order_id;
  perform set_config('app.internal_transition', 'false', true);

  select buyer_total_amount into v_buyer_total from public.order_financials where order_id = v_order_id;
  v_result := jsonb_build_object('order_id', v_order_id, 'reservation_id', v_reservation_id,
    'expires_at', v_expires_at, 'buyer_total', v_buyer_total);
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.confirm_proforma(uuid, uuid) from public, anon, service_role;
grant execute on function public.confirm_proforma(uuid, uuid) to authenticated;

-- 8. Drop upload intents table
drop table if exists public.payment_proof_upload_intents cascade;

-- 9. Remove Feature-015-created bucket if safe and empty; fail safely if objects exist (HIGH 1)
do $rollback_bucket_guard$
begin
  if exists (select 1 from storage.objects where bucket_id = 'payment-proofs') then
    raise exception 'rollback_aborted_payment_proofs_bucket_not_empty';
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'payment-proofs';
end;
$rollback_bucket_guard$;

commit;
