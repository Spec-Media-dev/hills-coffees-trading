-- Feature 015: Manual Bank Transfer & Private Payment Proof
-- Forward migration: atomic checkout, dedicated payment-proofs bucket,
-- persisted upload intents, exact storage RLS, and finalize lifecycle.
-- Paired rollback and read-only postflight live in supabase/rollback and supabase/maintenance.

begin;

do $guard$
begin
  if to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.prepare_payment_proof_upload(uuid,uuid,text)') is not null
     or to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)') is not null
     or to_regprocedure('public.payment_proof_storage_object_authorized(text,boolean)') is not null
     or to_regprocedure('public.cleanup_orphan_payment_proof_upload(uuid)') is not null
     or to_regclass('public.payment_proof_upload_intents') is not null then
    raise exception 'feature_015_objects_already_exist';
  end if;
  if exists (select 1 from storage.buckets where id = 'payment-proofs') then
    raise exception 'feature_015_storage_bucket_already_exists';
  end if;
  if to_regprocedure('public.commerce_release_reservation(uuid)') is null
     or to_regprocedure('public.commerce_request_begin(uuid,text,uuid)') is null
     or to_regprocedure('public.commerce_request_complete(uuid,jsonb)') is null
     or to_regprocedure('public.commerce_assert_buyer_member(uuid)') is null
     or to_regprocedure('public.compute_order_quote(uuid,uuid,text)') is null
     or to_regclass('public.payment_proofs') is null
     or to_regclass('public.file_assets') is null then
    raise exception 'feature_015_prerequisites_missing';
  end if;
end;
$guard$;

-- ============================================================================
-- 1. Dedicated Private Storage Bucket Configuration (T022, HIGH 1)
-- ============================================================================
-- Bucket is owned and created exclusively by Feature 015.
-- Preflight above guarantees bucket does not pre-exist; no ON CONFLICT DO UPDATE.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
);

-- ============================================================================
-- 2. Persisted Proof-Upload Intent Table (T023)
-- ============================================================================
create table public.payment_proof_upload_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_organization_id uuid not null references public.organizations(id),
  prepared_by uuid not null references public.profiles(id),
  bucket_id text not null check (bucket_id = 'payment-proofs'),
  object_path text not null unique,
  display_filename text,
  expires_at timestamptz not null,
  status text not null default 'PREPARED'
    check (status in ('PREPARED', 'FINALIZED', 'EXPIRED', 'CLEANED')),
  finalized_proof_id uuid references public.payment_proofs(id),
  prepare_request_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  cleaned_at timestamptz,
  constraint uq_intent_bucket_object unique (bucket_id, object_path)
);

create unique index uq_active_proof_upload_intent
  on public.payment_proof_upload_intents(order_id)
  where status = 'PREPARED';

alter table public.payment_proof_upload_intents enable row level security;
alter table public.payment_proof_upload_intents force row level security;
revoke all on table public.payment_proof_upload_intents from public, anon, authenticated, service_role;
grant select on table public.payment_proof_upload_intents to service_role;

-- ============================================================================
-- 3. Storage Authorization Helper & Policies (T025)
-- ============================================================================
create or replace function public.payment_proof_storage_object_authorized(
  p_object_name text,
  p_for_write boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_intent public.payment_proof_upload_intents%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.is_blocked_user() then
    return false;
  end if;

  if not public.mfa_satisfied() then
    return false;
  end if;

  select * into v_intent
  from public.payment_proof_upload_intents
  where bucket_id = 'payment-proofs' and object_path = p_object_name;

  if v_intent.id is null then
    return false;
  end if;

  select * into v_order from public.orders where id = v_intent.order_id;
  if v_order.id is null then
    return false;
  end if;

  if p_for_write then
    if v_intent.status <> 'PREPARED' then
      return false;
    end if;
    if not (public.is_authorized_member() and public.is_org_member(v_intent.buyer_organization_id) and public.organization_can_buy(v_intent.buyer_organization_id)) then
      return false;
    end if;
    if v_order.status <> 'HOLD' then
      return false;
    end if;
    select * into v_reservation from public.inventory_reservations
    where order_id = v_intent.order_id and status = 'ACTIVE';
    if v_reservation.id is null or v_reservation.expires_at <= clock_timestamp() then
      return false;
    end if;
    return true;
  else
    if public.is_platform_admin() or public.is_finance_operator() then
      return true;
    end if;
    if public.is_authorized_member() and public.is_org_member(v_intent.buyer_organization_id) and public.organization_can_buy(v_intent.buyer_organization_id) then
      return true;
    end if;
    return false;
  end if;
end;
$function$;

revoke all on function public.payment_proof_storage_object_authorized(text, boolean) from public, anon, service_role;
grant execute on function public.payment_proof_storage_object_authorized(text, boolean) to authenticated;

drop policy if exists payment_proof_storage_insert on storage.objects;
create policy payment_proof_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and public.payment_proof_storage_object_authorized(name, true)
  );

drop policy if exists payment_proof_storage_select on storage.objects;
create policy payment_proof_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and public.payment_proof_storage_object_authorized(name, false)
  );

-- ============================================================================
-- 4. Coordinated Proof-Specific Policies on Tables (T026)
-- ============================================================================
drop policy if exists payment_proofs_read on public.payment_proofs;
create policy payment_proofs_read on public.payment_proofs
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_finance_operator()
    or (
      not public.is_blocked_user()
      and public.mfa_satisfied()
      and public.is_authorized_member()
      and exists (
        select 1 from public.payments p
        join public.orders o on o.id = p.order_id
        where p.id = payment_proofs.payment_id
          and public.is_org_member(o.buyer_organization_id)
          and public.organization_can_buy(o.buyer_organization_id)
      )
    )
  );

-- Carve out payment-proofs from broad catalog_admin_files policy (HIGH 1)
drop policy if exists catalog_admin_files on public.file_assets;
create policy catalog_admin_files on public.file_assets
for all using (
  bucket_name <> 'payment-proofs'
  and (
    public.is_platform_admin()
    or uploaded_by = auth.uid()
    or public.is_org_member(organization_id)
  )
)
with check (
  bucket_name <> 'payment-proofs'
  and (
    public.is_platform_admin()
    or uploaded_by = auth.uid()
    or public.is_org_member(organization_id)
  )
);

drop policy if exists payment_proof_file_assets_read on public.file_assets;
create policy payment_proof_file_assets_read on public.file_assets
  for select to authenticated
  using (
    bucket_name = 'payment-proofs'
    and (
      public.is_platform_admin()
      or public.is_finance_operator()
      or (
        not public.is_blocked_user()
        and public.mfa_satisfied()
        and public.is_authorized_member()
        and exists (
          select 1 from public.payment_proofs pp
          join public.payments p on p.id = pp.payment_id
          join public.orders o on o.id = p.order_id
          where pp.file_asset_id = file_assets.id
            and public.is_org_member(o.buyer_organization_id)
            and public.organization_can_buy(o.buyer_organization_id)
        )
      )
    )
  );

-- ============================================================================
-- 5. Prepare Payment Proof Upload Operation (T024)
-- ============================================================================
create or replace function public.prepare_payment_proof_upload(
  p_order_id uuid,
  p_request_id uuid,
  p_display_filename text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_replay jsonb;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_existing_intent public.payment_proof_upload_intents%rowtype;
  v_intent_id uuid;
  v_canonical_path text;
  v_clean_filename text;
  v_result jsonb;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);

  v_replay := public.commerce_request_begin(p_request_id, 'prepare_payment_proof_upload', p_order_id);
  if v_replay is not null then
    return v_replay;
  end if;

  if v_order.status <> 'HOLD' then
    raise exception 'order_not_editable';
  end if;

  select * into v_reservation from public.inventory_reservations
  where order_id = p_order_id and status = 'ACTIVE' for update;
  if v_reservation.id is null or v_reservation.expires_at <= clock_timestamp() then
    raise exception 'reservation_expired';
  end if;

  -- Replay existing PREPARED intent if still unexpired
  select * into v_existing_intent from public.payment_proof_upload_intents
  where order_id = p_order_id and status = 'PREPARED' and expires_at > clock_timestamp()
  order by created_at desc limit 1;

  if v_existing_intent.id is not null then
    v_result := jsonb_build_object(
      'intent_id', v_existing_intent.id,
      'bucket_id', v_existing_intent.bucket_id,
      'object_path', v_existing_intent.object_path,
      'display_filename', v_existing_intent.display_filename,
      'expires_at', v_existing_intent.expires_at,
      'max_size_bytes', 10485760,
      'allowed_mime_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png')
    );
    perform public.commerce_request_complete(p_request_id, v_result);
    return v_result;
  end if;

  update public.payment_proof_upload_intents
  set status = 'EXPIRED'
  where order_id = p_order_id and status = 'PREPARED' and expires_at <= clock_timestamp();

  v_intent_id := gen_random_uuid();
  v_canonical_path := 'org/' || v_order.buyer_organization_id || '/orders/' || p_order_id || '/' || v_intent_id || '/proof';

  if p_display_filename is not null then
    v_clean_filename := substring(regexp_replace(p_display_filename, '[^a-zA-Z0-9._-]', '_', 'g') from 1 for 255);
  else
    v_clean_filename := 'proof';
  end if;

  insert into public.payment_proof_upload_intents (
    id, order_id, buyer_organization_id, prepared_by, bucket_id, object_path,
    display_filename, expires_at, status, prepare_request_id
  ) values (
    v_intent_id, p_order_id, v_order.buyer_organization_id, auth.uid(),
    'payment-proofs', v_canonical_path, v_clean_filename,
    v_reservation.expires_at, 'PREPARED', p_request_id
  );

  v_result := jsonb_build_object(
    'intent_id', v_intent_id,
    'bucket_id', 'payment-proofs',
    'object_path', v_canonical_path,
    'display_filename', v_clean_filename,
    'expires_at', v_reservation.expires_at,
    'max_size_bytes', 10485760,
    'allowed_mime_types', jsonb_build_array('application/pdf', 'image/jpeg', 'image/png')
  );

  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;

revoke all on function public.prepare_payment_proof_upload(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.prepare_payment_proof_upload(uuid, uuid, text) to authenticated;

-- ============================================================================
-- 5b. Order Transition Graph Alignment for Feature 015 (BLOCKER 1, T027)
-- ============================================================================
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

      if old.status = 'DRAFT' and new.status not in ('HOLD', 'PROFORMA_ISSUED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PROFORMA_ISSUED' and new.status not in ('HOLD', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW', 'EXPIRED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_PROOF_SUBMITTED' and new.status not in ('PAYMENT_UNDER_REVIEW', 'PAID', 'PAYMENT_REJECTED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'PAYMENT_REJECTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PARTIALLY_DELIVERED' and new.status not in ('COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      -- data-model §7.1 defines no exit from DISPUTED for v1 rows: fail closed until one is specified.
      if old.status = 'DISPUTED' then raise exception 'invalid_order_transition'; end if;
      if old.status = 'CONFIRMED' then raise exception 'invalid_order_transition'; end if;
      if old.status in ('COMPLETED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REJECTED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;

      -- The hold window is the reservation's own (copied expires_at); never defaulted here.
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

-- ============================================================================
-- 6. Atomic Checkout Bank Transfer RPC (T028, T029, T030)
-- ============================================================================
create or replace function public.checkout_bank_transfer_v1(
  p_order_id uuid,
  p_destination_id uuid,
  p_request_id uuid
)
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
  v_reclaim_order uuid;
  v_result jsonb;
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

  -- 1. Reclaim other expired active reservations
  for v_reclaim_order in
    select distinct r.order_id
    from public.inventory_reservations r
    join public.inventory_reservation_items ri on ri.reservation_id = r.id
    join public.order_items oi on oi.offer_id = ri.offer_id and oi.order_id = p_order_id
    where r.status = 'ACTIVE' and r.expires_at <= clock_timestamp() and r.order_id <> p_order_id
    order by r.order_id
  loop
    perform public.commerce_release_reservation(v_reclaim_order);
  end loop;

  -- 2. Deterministic locks on offers ascending UUID, re-check offer availability
  for v_item in
    select oi.offer_id, sum(oi.quantity_kg) as total_quantity_kg
    from public.order_items oi
    where oi.order_id = p_order_id
    group by oi.offer_id
    order by oi.offer_id
  loop
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

revoke all on function public.checkout_bank_transfer_v1(uuid, uuid, uuid) from public, anon, service_role;
grant execute on function public.checkout_bank_transfer_v1(uuid, uuid, uuid) to authenticated;

-- ============================================================================
-- 7. Legacy Cutover Fences (T031)
-- ============================================================================
create or replace function public.issue_proforma(
  p_order_id uuid,
  p_destination_id uuid,
  p_promo_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  raise exception 'endpoint_deprecated_use_checkout_v1';
end;
$function$;

revoke all on function public.issue_proforma(uuid, uuid, text, uuid) from public, anon, service_role;
grant execute on function public.issue_proforma(uuid, uuid, text, uuid) to authenticated;

create or replace function public.confirm_proforma(
  p_proforma_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  -- Cutover fence: existing orders are disposable test data per owner decision.
  raise exception 'endpoint_deprecated_use_checkout_v1';
end;
$function$;

revoke all on function public.confirm_proforma(uuid, uuid) from public, anon, service_role;
grant execute on function public.confirm_proforma(uuid, uuid) to authenticated;

-- ============================================================================
-- 8. Finalize Payment Proof RPC (T032, T033)
-- ============================================================================
create or replace function public.finalize_payment_proof(
  p_order_id uuid,
  p_upload_intent_id uuid,
  p_customer_claimed_amount numeric,
  p_customer_transfer_date date,
  p_customer_bank_reference text,
  p_customer_reference_text text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_replay jsonb;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_payment public.payments%rowtype;
  v_intent public.payment_proof_upload_intents%rowtype;
  v_storage_obj record;
  v_file_asset_id uuid;
  v_proof_id uuid;
  v_payment_id uuid;
  v_submitted_at timestamptz;
  v_reservation_status text;
  v_payment_status text;
  v_released boolean;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception 'request_id_required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'order_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_order.buyer_organization_id);

  v_replay := public.commerce_request_begin(p_request_id, 'finalize_payment_proof', p_order_id);
  if v_replay is not null then
    return v_replay;
  end if;

  select * into v_intent from public.payment_proof_upload_intents
  where id = p_upload_intent_id and order_id = p_order_id for update;
  if not found or v_intent.buyer_organization_id <> v_order.buyer_organization_id then
    raise exception 'intent_not_found';
  end if;

  -- Replay handling: if intent is already finalized or order already PAYMENT_PROOF_SUBMITTED
  if v_intent.status = 'FINALIZED' or v_order.status = 'PAYMENT_PROOF_SUBMITTED' then
    select pp.id, pp.payment_id, pp.submitted_at into v_proof_id, v_payment_id, v_submitted_at
    from public.payment_proofs pp
    join public.payments p on p.id = pp.payment_id
    where p.order_id = p_order_id
      and (v_intent.finalized_proof_id is null or pp.id = v_intent.finalized_proof_id)
    order by pp.submitted_at desc, pp.created_at desc limit 1;

    select p.status into v_payment_status
    from public.payments p
    where p.id = v_payment_id and p.order_id = p_order_id;

    select r.status into v_reservation_status
    from public.inventory_reservations r
    where r.order_id = p_order_id
    order by r.created_at desc limit 1;

    -- Strict persisted entity integrity assertions (zero COALESCE fallbacks):
    if v_proof_id is null
       or v_payment_id is null
       or v_submitted_at is null
       or v_payment_status is null
       or v_payment_status <> 'PROOF_SUBMITTED'
       or v_reservation_status is null
       or v_reservation_status <> 'REVIEW_HOLD'
       or v_order.status <> 'PAYMENT_PROOF_SUBMITTED' then
      v_result := jsonb_build_object(
        'ok', false,
        'code', 'finalized_state_integrity_error'
      );
      perform public.commerce_request_complete(p_request_id, v_result);
      return v_result;
    end if;

    v_result := jsonb_build_object(
      'ok', true,
      'data', jsonb_build_object(
        'order_id', p_order_id,
        'order_code', v_order.order_code,
        'proof_id', v_proof_id,
        'payment_id', v_payment_id,
        'submitted_at', v_submitted_at,
        'order_status', v_order.status,
        'payment_status', v_payment_status,
        'reservation_status', v_reservation_status,
        'idempotent_replay', true
      )
    );
    perform public.commerce_request_complete(p_request_id, v_result);
    return v_result;
  end if;

  select * into v_payment from public.payments where order_id = p_order_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  select * into v_reservation from public.inventory_reservations
  where order_id = p_order_id and status = 'ACTIVE' for update;

  -- Authoritative deadline decision under lock:
  if v_reservation.id is null or v_reservation.expires_at <= clock_timestamp() then
    v_released := public.commerce_release_reservation(p_order_id);
    update public.payment_proof_upload_intents
    set status = 'EXPIRED'
    where id = p_upload_intent_id and status = 'PREPARED';

    v_result := jsonb_build_object(
      'ok', false,
      'code', 'reservation_expired',
      'released', coalesce(v_released, false)
    );
    perform public.commerce_request_complete(p_request_id, v_result);
    return v_result;
  end if;

  -- Timely finalize: verify exact storage object in payment-proofs bucket
  select * into v_storage_obj from storage.objects
  where bucket_id = 'payment-proofs' and name = v_intent.object_path;

  if v_storage_obj.id is null then
    v_result := jsonb_build_object('ok', false, 'code', 'storage_object_not_found');
    perform public.commerce_request_complete(p_request_id, v_result);
    return v_result;
  end if;

  -- Validate actual storage object metadata (HIGH 4)
  if coalesce((v_storage_obj.metadata->>'size')::bigint, 0) > 10485760
     or coalesce(v_storage_obj.metadata->>'mimetype', '') not in ('application/pdf', 'image/jpeg', 'image/png')
     or v_storage_obj.bucket_id <> 'payment-proofs' then
    v_result := jsonb_build_object('ok', false, 'code', 'metadata_invalid');
    perform public.commerce_request_complete(p_request_id, v_result);
    return v_result;
  end if;

  -- Insert private file_assets record
  insert into public.file_assets (
    uploaded_by, organization_id, bucket_name, object_path, original_name,
    mime_type, size_bytes, is_private
  ) values (
    auth.uid(), v_order.buyer_organization_id, 'payment-proofs', v_intent.object_path,
    coalesce(v_intent.display_filename, 'proof'),
    v_storage_obj.metadata->>'mimetype',
    (v_storage_obj.metadata->>'size')::bigint,
    true
  )
  on conflict (bucket_name, object_path) do update set
    size_bytes = excluded.size_bytes
  returning id into v_file_asset_id;

  -- Insert payment_proofs record
  insert into public.payment_proofs (
    payment_id, file_asset_id, reference_text, submitted_by,
    claimed_amount, claimed_currency, transfer_date, bank_reference,
    submitted_at, submission_kind, request_id, status
  ) values (
    v_payment.id, v_file_asset_id, p_customer_reference_text, auth.uid(),
    p_customer_claimed_amount, 'USD', p_customer_transfer_date,
    p_customer_bank_reference, clock_timestamp(), 'ON_TIME', p_request_id, 'SUBMITTED'
  )
  returning id, submitted_at into v_proof_id, v_submitted_at;

  -- Update intent to FINALIZED
  update public.payment_proof_upload_intents
  set status = 'FINALIZED', finalized_proof_id = v_proof_id, finalized_at = clock_timestamp()
  where id = p_upload_intent_id;

  -- Transition reservation to REVIEW_HOLD (protects against sweeper release)
  update public.inventory_reservations
  set status = 'REVIEW_HOLD'
  where id = v_reservation.id;

  -- Transition payment to PROOF_SUBMITTED
  update public.payments
  set status = 'PROOF_SUBMITTED', updated_at = clock_timestamp()
  where id = v_payment.id;

  -- Transition order to PAYMENT_PROOF_SUBMITTED
  perform set_config('app.internal_transition', 'true', true);
  update public.orders
  set status = 'PAYMENT_PROOF_SUBMITTED', updated_at = clock_timestamp()
  where id = p_order_id;
  perform set_config('app.internal_transition', 'false', true);

  v_result := jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'order_id', p_order_id,
      'order_code', v_order.order_code,
      'proof_id', v_proof_id,
      'payment_id', v_payment.id,
      'submitted_at', v_submitted_at,
      'order_status', 'PAYMENT_PROOF_SUBMITTED',
      'payment_status', 'PROOF_SUBMITTED',
      'reservation_status', 'REVIEW_HOLD'
    )
  );

  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;

revoke all on function public.finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid) from public, anon, service_role;
grant execute on function public.finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid) to authenticated;

-- ============================================================================
-- 9. Orphan Proof Upload Cleanup Helper (T034, MEDIUM 2)
-- ============================================================================
create or replace function public.cleanup_orphan_payment_proof_upload(
  p_upload_intent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_intent public.payment_proof_upload_intents%rowtype;
begin
  select * into v_intent
  from public.payment_proof_upload_intents
  where id = p_upload_intent_id for update;

  if not found then
    return false;
  end if;

  if v_intent.status = 'FINALIZED' then
    return false;
  end if;

  if public.is_platform_admin() or public.is_finance_operator() then
    -- Admin / Finance operator authorized
    null;
  elsif v_intent.prepared_by = auth.uid()
        and public.is_authorized_member()
        and public.is_org_member(v_intent.buyer_organization_id)
        and public.organization_can_buy(v_intent.buyer_organization_id)
        and not public.is_blocked_user()
        and public.mfa_satisfied() then
    -- Authenticated intent owner authorized
    null;
  else
    return false;
  end if;

  delete from storage.objects
  where bucket_id = 'payment-proofs' and name = v_intent.object_path;

  update public.payment_proof_upload_intents
  set status = 'CLEANED', cleaned_at = clock_timestamp()
  where id = p_upload_intent_id;

  return true;
end;
$function$;

revoke all on function public.cleanup_orphan_payment_proof_upload(uuid) from public, anon, service_role;
grant execute on function public.cleanup_orphan_payment_proof_upload(uuid) to authenticated;

commit;
