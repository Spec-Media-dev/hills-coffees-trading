-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- DRAFT — pairs with 20260914_feature_009_db_block_07_migration.DRAFT.sql. Not yet applicable to any
-- database (the forward migration has not been applied anywhere). Once the forward migration is
-- actually applied (RUN A2), RE-VERIFY the two `expected migrated` fingerprints below against the
-- REAL live `prosrc` (the guard will simply refuse to run if they do not match, so this is a safety
-- net, not a silent risk) before relying on this rollback.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Rollback for 20260914_feature_009_db_block_07_migration.DRAFT.sql.
--
-- Exact reversal of the forward migration, and nothing else:
--   * drops shipment_items.reserved_quantity_kg and order_shipments.settlement_verified_at;
--   * restores the verified pre-migration baseline bodies of validate_shipment_transition() and
--     validate_shipment_item() — fingerprints (md5 of prosrc, CR removed) return to:
--       validate_shipment_transition  93102472a7bdcdce52f645c1edb07a25
--       validate_shipment_item        ab0d35de1718d58d46f8c71cbbf95b4f
--   * restores shipments_buyer_draft_update's original WITH CHECK (status IN ('DRAFT','REQUESTED')
--     only — CANCELLED removed again).
--
-- The guard aborts (nothing reverted) unless both functions carry exactly the migrated bodies (proof
-- the forward migration is actually what is currently live, not something else).
--
-- No data is changed. `shipment_items.reserved_quantity_kg` values existing at rollback time are
-- simply dropped along with the column — this is acceptable ONLY because rollback is intended for
-- use before this capability has any real operational history; rolling back a migration that has
-- already produced genuine reservation effects in production is a business decision, not a mechanical
-- one, and is out of scope for this DRAFT rollback script.

begin;

do $guard$
declare
  v_problems text := '';
  v_fp text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  if v_fp is distinct from '661a7f98b977aaebd8cab8b46540a09b' then
    v_problems := v_problems || 'validate_shipment_transition: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 661a7f98b977aaebd8cab8b46540a09b); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  if v_fp is distinct from '90308102933bb6569ae24094c209578d' then
    v_problems := v_problems || 'validate_shipment_item: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 90308102933bb6569ae24094c209578d); ';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg') then
    v_problems := v_problems || 'shipment_items.reserved_quantity_kg already absent; ';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at') then
    v_problems := v_problems || 'order_shipments.settlement_verified_at already absent; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_009_db_block_07 rollback guard failed — nothing reverted: %', v_problems;
  end if;
end;
$guard$;

-- 1. Restore validate_shipment_transition() to its pre-migration body -------------------------------
CREATE OR REPLACE FUNCTION public.validate_shipment_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
begin

  if new.status <> old.status then

    -- Buyer can only request/cancel draft.
    if not public.is_warehouse_operator()
       and not public.is_internal_transition()
       and not (
         old.status = 'DRAFT'
         and new.status in (
           'REQUESTED',
           'CANCELLED'
         )
       )
    then
      raise exception
        'warehouse_required_for_operational_shipment_status';
    end if;


    if old.status = 'DRAFT'
       and new.status not in (
         'REQUESTED',
         'READY',
         'CANCELLED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'REQUESTED'
       and new.status not in (
         'CAPACITY_CONFIRMED',
         'READY',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'CAPACITY_CONFIRMED'
       and new.status not in (
         'RESERVED',
         'READY',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'READY'
       and new.status not in (
         'RESERVED',
         'BOOKED',
         'PICKING',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'RESERVED'
       and new.status not in (
         'PICKING',
         'BOOKED',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status in (
      'PICKING',
      'BOOKED'
    )
    and new.status not in (
      'DISPATCHED',
      'CANCELLED',
      'FAILED',
      'DISPUTED'
    )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'DISPATCHED'
       and new.status not in (
         'PARTIALLY_DELIVERED',
         'DELIVERED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'PARTIALLY_DELIVERED'
       and new.status not in (
         'DELIVERED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status in (
      'DELIVERED',
      'CANCELLED'
    )
    then
      raise exception 'terminal_shipment_cannot_change';

    end if;

  end if;


  if old.status <> 'DRAFT'
     and (
       new.delivery_method
         is distinct from old.delivery_method
       or new.country_code
         is distinct from old.country_code
       or new.city
         is distinct from old.city
       or new.address_line
         is distinct from old.address_line
       or new.contact_name
         is distinct from old.contact_name
       or new.contact_phone
         is distinct from old.contact_phone
       or new.shipping_fee
         is distinct from old.shipping_fee
     )
  then
    raise exception 'shipment_details_are_locked';
  end if;


  return new;
end;
$function$;

-- 2. Restore validate_shipment_item() to its pre-migration body -------------------------------------
CREATE OR REPLACE FUNCTION public.validate_shipment_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_item_order_id uuid;
  v_shipment_order_id uuid;
  v_shipment_status text;
  v_order_status text;
  v_ordered_quantity numeric(14,3);
  v_other_planned numeric(14,3);
begin

  select
    oi.order_id,
    oi.quantity_kg
  into
    v_item_order_id,
    v_ordered_quantity
  from public.order_items oi
  where oi.id = new.order_item_id;


  select
    os.order_id,
    os.status
  into
    v_shipment_order_id,
    v_shipment_status
  from public.order_shipments os
  where os.id = new.shipment_id;


  if v_item_order_id is null
     or v_shipment_order_id is null
  then
    raise exception 'shipment_or_order_item_missing';
  end if;


  if v_item_order_id <> v_shipment_order_id then
    raise exception 'shipment_order_item_mismatch';
  end if;


  select status
  into v_order_status
  from public.orders
  where id = v_item_order_id;


  if tg_op = 'INSERT' then

    if v_shipment_status <> 'DRAFT' then
      raise exception 'shipment_plan_is_closed';
    end if;

    if new.delivered_quantity_kg <> 0
       and not public.is_warehouse_operator()
    then
      raise exception
        'only_warehouse_can_record_delivery';
    end if;

  elsif tg_op = 'UPDATE' then

    if new.planned_quantity_kg
       is distinct from old.planned_quantity_kg
       and v_shipment_status <> 'DRAFT'
    then
      raise exception 'shipment_plan_is_closed';
    end if;


    if new.delivered_quantity_kg
       is distinct from old.delivered_quantity_kg
    then

      if not public.is_warehouse_operator()
         and not public.is_internal_transition()
      then
        raise exception
          'only_warehouse_can_record_delivery';
      end if;

      if new.delivered_quantity_kg <
         old.delivered_quantity_kg
      then
        raise exception
          'delivered_quantity_cannot_decrease';
      end if;

    end if;

  end if;


  if new.delivered_quantity_kg >
     new.planned_quantity_kg
  then
    raise exception 'delivered_quantity_exceeds_plan';
  end if;


  select coalesce(
    sum(si.planned_quantity_kg),
    0
  )
  into v_other_planned
  from public.shipment_items si
  join public.order_shipments os
    on os.id = si.shipment_id
  where si.order_item_id =
        new.order_item_id
    and si.id <> new.id
    and os.status not in (
      'CANCELLED',
      'FAILED'
    );


  if v_other_planned +
     new.planned_quantity_kg >
     v_ordered_quantity
  then
    raise exception
      'shipment_plan_exceeds_order_item';
  end if;


  return new;
end;
$function$;

-- 3. Drop the new columns ----------------------------------------------------------------------------
alter table public.shipment_items
  drop column reserved_quantity_kg;

alter table public.order_shipments
  drop column settlement_verified_at;

-- 4. Restore shipments_buyer_draft_update's original WITH CHECK ---------------------------------------
drop policy if exists shipments_buyer_draft_update on public.order_shipments;
create policy shipments_buyer_draft_update
  on public.order_shipments
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and exists (
      select 1
      from public.orders o
      join public.organization_members om on om.organization_id = o.buyer_organization_id
      where o.id = order_shipments.order_id
        and om.user_id = auth.uid()
        and om.is_active = true
    )
  )
  with check (status in ('DRAFT', 'REQUESTED'));

commit;
