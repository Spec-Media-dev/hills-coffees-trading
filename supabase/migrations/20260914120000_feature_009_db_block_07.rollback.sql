-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLIED — rollback for 20260914120000_feature_009_db_block_07.sql, copied verbatim from the reviewed, human-approved DRAFT at
-- supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql (T010 approval
-- recorded in specs/009-delivery-shipments/tasks.md). The executable SQL below (begin; ... commit;)
-- is byte-for-byte identical to that DRAFT rollback's own executable body -- only this header/path
-- framing differs. Full design rationale remains in the DRAFT rollback file and in
-- specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Rollback for 20260914120000_feature_009_db_block_07.sql.

--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- SCHEMA ROLLBACK ≠ BUSINESS DATA REVERSAL (RUN A2-PRE Issue 16 — read before running this)
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- This script is MECHANICALLY SAFE ONLY BEFORE any genuine delivery-reservation effect has occurred
-- — i.e., before any `shipment_items.reserved_quantity_kg` row is nonzero and before any
-- `order_shipments.settlement_verified_at` is set (by EITHER the shipment-transition reserve path OR
-- the RUN A2-PRE3 settlement-time hook — the guard below checks the columns themselves, not how they
-- were set, so it is exhaustive over both paths). Dropping the new columns/functions does NOT, and
-- CANNOT, reverse the `inventory_positions.reserved_quantity_kg`/`available_quantity_kg` and
-- `storage_allocations.released_quantity_kg`/`status` effects the forward migration's trigger/helper
-- logic already applied to LIVE rows while it was active — those effects live in EXISTING columns
-- this rollback does not touch at all, and dropping the guard columns merely destroys the RECORD of
-- what was reserved/released, making any later manual reconciliation far harder, not easier. The
-- guard below therefore REFUSES to run if it finds any row with real reservation history — this is
-- not overcaution, it is the literal difference between "undo an unused feature" and "silently
-- corrupt financial/inventory history." If real reservation history exists and a rollback is still
-- required, it needs a separately authored, reviewed, COMPENSATING migration that reasons about the
-- actual affected `inventory_positions`/`storage_allocations` rows — not this mechanical script.
--
-- Exact reversal of the forward migration, and nothing else (once the guard below passes):
--   * drops shipment_items.reserved_quantity_kg (with its two CHECK constraints) and
--     order_shipments.settlement_verified_at;
--   * drops the two RUN A2-PRE3 internal-only functions apply_delivery_reservation(...) and
--     reserve_ready_deliveries_for_settlement(...);
--   * restores the verified pre-migration baseline bodies of validate_shipment_transition(),
--     validate_shipment_item(), and admin_review_payment() — fingerprints (md5 of prosrc, CR removed)
--     return to:
--       validate_shipment_transition  93102472a7bdcdce52f645c1edb07a25
--       validate_shipment_item        ab0d35de1718d58d46f8c71cbbf95b4f
--       admin_review_payment          f94544de4180eaba90725a02c1677fb6
--   * restores shipments_buyer_draft_update's original WITH CHECK (status IN ('DRAFT','REQUESTED')
--     only — CANCELLED removed again).
--   * restores trg_shipment_transition's exact baseline BEFORE UPDATE-only binding (the forward
--     draft widened it to INSERT OR UPDATE solely to neutralize INSERT tampering).
--
-- The guard aborts (nothing reverted) unless all three functions carry exactly the migrated
-- (hardened) bodies (proof the forward migration is actually what is currently live, not something
-- else), both new helper functions exist with the migrated fingerprint (proof they were actually
-- created by this same migration, not something unrelated using the same name), AND no row shows
-- real reservation history.

begin;

do $guard$
declare
  v_problems text := '';
  v_fp text;
  v_reserved_rows int;
  v_gated_rows int;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  if v_fp is distinct from '27148260ac07d2d5e7f2e3e61c2d21aa' then
    v_problems := v_problems || 'validate_shipment_transition: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 27148260ac07d2d5e7f2e3e61c2d21aa); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  if v_fp is distinct from '3ec3db2cd692958b2ad6d9ec5d15eb88' then
    v_problems := v_problems || 'validate_shipment_item: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 3ec3db2cd692958b2ad6d9ec5d15eb88); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment';
  if v_fp is distinct from '6c4141a33ac07b564a8f3b0c82a10232' then
    v_problems := v_problems || 'admin_review_payment: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 6c4141a33ac07b564a8f3b0c82a10232); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation';
  if v_fp is distinct from '4aa0a7c7dd8e39bc12a1d36b63dc21cc' then
    v_problems := v_problems || 'apply_delivery_reservation: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 4aa0a7c7dd8e39bc12a1d36b63dc21cc); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement';
  if v_fp is distinct from '12226e365e405185845fc4561b87db85' then
    v_problems := v_problems || 'reserve_ready_deliveries_for_settlement: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 12226e365e405185845fc4561b87db85); ';
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg') then
    v_problems := v_problems || 'shipment_items.reserved_quantity_kg already absent; ';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at') then
    v_problems := v_problems || 'order_shipments.settlement_verified_at already absent; ';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and c.relname = 'order_shipments' and t.tgname = 'trg_shipment_transition'
      and t.tgenabled = 'O' and not t.tgisinternal and (t.tgtype & 2) <> 0
      and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and p.proname = 'validate_shipment_transition'
  ) then
    v_problems := v_problems || 'trg_shipment_transition is not enabled BEFORE INSERT OR UPDATE and bound to the migrated validate_shipment_transition; ';
  end if;

  -- REAL-USAGE GUARD (Issue 16, exhaustive over BOTH the shipment-transition reserve path and the
  -- RUN A2-PRE3 settlement-time hook — both write the same two columns, so checking the columns
  -- themselves covers either origin) — refuse to run if any row shows genuine reservation history.
  select count(*) into v_reserved_rows from public.shipment_items where reserved_quantity_kg > 0;
  select count(*) into v_gated_rows from public.order_shipments where settlement_verified_at is not null;
  if v_reserved_rows > 0 or v_gated_rows > 0 then
    v_problems := v_problems || format(
      'REAL RESERVATION HISTORY EXISTS (shipment_items.reserved_quantity_kg > 0: %s row(s); order_shipments.settlement_verified_at set: %s row(s)) — this is a BUSINESS DATA reversal, not a mechanical schema rollback; a separately authored compensating migration is required, not this script; ',
      v_reserved_rows, v_gated_rows
    );
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

-- 3. Restore admin_review_payment() to its pre-migration body (removes the RUN A2-PRE3 settlement-
--    time reservation hook call; every other line reverts to the pre-DB-BLOCK-07 baseline) ----------
CREATE OR REPLACE FUNCTION public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;

  v_item record;
  v_position public.inventory_positions%rowtype;

  v_rate numeric(7,4) := 0;
  v_line_base numeric(14,2);
  v_line_commission numeric(14,2);

  v_correlation_id uuid;
begin

  if not public.is_finance_operator() then
    raise exception 'forbidden';
  end if;


  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;


  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;


  select *
  into v_order
  from public.orders
  where id = v_payment.order_id
  for update;


  -- Idempotent payment review.
  if v_payment.status = 'CONFIRMED'
     and v_order.status in (
       'PAID',
       'FULFILLMENT_IN_PROGRESS',
       'PARTIALLY_DELIVERED',
       'COMPLETED',
       'DISPUTED'
     )
  then
    return;
  end if;


  v_correlation_id :=
    coalesce(
      v_payment.correlation_id,
      v_order.correlation_id,
      gen_random_uuid()
    );


  perform set_config(
    'app.correlation_id',
    v_correlation_id::text,
    true
  );


  insert into public.payment_reviews(
    payment_id,
    reviewer_user_id,
    decision,
    reason
  )
  values (
    p_payment_id,
    auth.uid(),
    case
      when p_approved
      then 'CONFIRMED'
      else 'REJECTED'
    end,
    p_reason
  );


  if not p_approved then

    update public.payments
    set
      status = 'REJECTED',
      rejected_reason = p_reason
    where id = p_payment_id;


    perform set_config(
      'app.internal_transition',
      'true',
      true
    );


    update public.orders
    set status = 'HOLD'
    where id = v_order.id
      and status in (
        'PAYMENT_PROOF_SUBMITTED',
        'PAYMENT_UNDER_REVIEW'
      );


    return;

  end if;


  select *
  into v_reservation
  from public.inventory_reservations
  where order_id = v_order.id
    and status = 'ACTIVE'
  for update;


  if v_reservation.id is null then
    raise exception 'active_reservation_missing';
  end if;


  if v_reservation.expires_at <= now() then
    raise exception 'reservation_expired';
  end if;


  select coalesce(
    ofn.commission_percentage_snapshot,
    0
  )
  into v_rate
  from public.order_financials ofn
  where ofn.order_id = v_order.id;


  for v_item in

    select
      oi.*,

      iri.quantity_kg
        as reserved_quantity,

      iri.inventory_position_id,

      co.seller_type,

      co.seller_organization_id
        as offer_seller,

      co.warehouse_id
        as offer_warehouse_id,

      co.warehouse_location_id
        as offer_warehouse_location_id

    from public.order_items oi

    join public.inventory_reservation_items iri
      on iri.offer_id = oi.offer_id

    join public.inventory_reservations ir
      on ir.id = iri.reservation_id
     and ir.order_id = oi.order_id

    join public.coffee_offers co
      on co.id = oi.offer_id

    where oi.order_id = v_order.id
      and ir.id = v_reservation.id

    order by oi.id

  loop

    -- Consistent lock order:
    -- Offer then inventory.
    perform 1
    from public.coffee_offers
    where id = v_item.offer_id
    for update;


    if v_item.inventory_position_id
       is not null
    then

      select *
      into v_position
      from public.inventory_positions
      where id = v_item.inventory_position_id
      for update;

    else

      select *
      into v_position
      from public.inventory_positions ip
      where ip.lot_id = v_item.lot_id
        and ip.owner_organization_id =
            v_item.offer_seller
        and ip.warehouse_id =
            v_item.offer_warehouse_id
        and ip.warehouse_location_id
            is not distinct from
            v_item.offer_warehouse_location_id
      order by ip.created_at
      limit 1
      for update;

    end if;


    if v_position.id is null
       or v_position.available_quantity_kg
          < v_item.reserved_quantity
       or v_position.reserved_quantity_kg
          < v_item.reserved_quantity
    then
      raise exception
        'seller_inventory_position_invalid';
    end if;


    -- Seller loses quantity AND active reservation.
    update public.inventory_positions
    set
      available_quantity_kg =
        available_quantity_kg
        - v_item.reserved_quantity,

      reserved_quantity_kg =
        reserved_quantity_kg
        - v_item.reserved_quantity,

      updated_at = now()
    where id = v_position.id;


    -- Buyer receives title/custody at same warehouse.
    insert into public.inventory_positions(
      lot_id,
      owner_organization_id,
      warehouse_id,
      warehouse_location_id,
      available_quantity_kg,
      reserved_quantity_kg
    )
    values (
      v_item.lot_id,
      v_order.buyer_organization_id,
      v_position.warehouse_id,
      v_position.warehouse_location_id,
      v_item.reserved_quantity,
      0
    )
    on conflict (
      lot_id,
      owner_organization_id,
      warehouse_id,
      warehouse_location_id
    )
    do update set
      available_quantity_kg =
        public.inventory_positions.available_quantity_kg
        + excluded.available_quantity_kg,

      updated_at = now();


    insert into public.inventory_ownership_events(
      lot_id,
      from_organization_id,
      to_organization_id,
      order_item_id,
      quantity_kg,
      event_type,
      created_by,
      correlation_id,
      reason
    )
    values (
      v_item.lot_id,
      v_item.offer_seller,
      v_order.buyer_organization_id,
      v_item.id,
      v_item.reserved_quantity,

      case
        when v_item.seller_type_snapshot = 'HILLS'
        then 'SALE'
        else 'RESALE'
      end,

      auth.uid(),
      v_correlation_id,
      'SETTLEMENT_CONFIRMED'
    );


    -- Listing remains available after partial fill.
    update public.coffee_offers
    set
      filled_quantity_kg =
        filled_quantity_kg
        + v_item.reserved_quantity,

      reserved_quantity_kg =
        reserved_quantity_kg
        - v_item.reserved_quantity,

      status =
        case
          when (
            filled_quantity_kg
            + v_item.reserved_quantity
          ) >= quantity_kg
          then 'SOLD_OUT'
          else 'PARTIALLY_FILLED'
        end,

      is_visible =
        case
          when (
            filled_quantity_kg
            + v_item.reserved_quantity
          ) >= quantity_kg
          then false
          else true
        end,

      updated_at = now()

    where id = v_item.offer_id;


    -- Purchased inventory remains in Hills-approved custody
    -- until delivered/released.
    insert into public.storage_allocations(
      order_item_id,
      owner_organization_id,
      lot_id,
      warehouse_id,
      warehouse_location_id,
      quantity_kg,
      released_quantity_kg,
      status
    )
    values (
      v_item.id,
      v_order.buyer_organization_id,
      v_item.lot_id,
      v_position.warehouse_id,
      v_position.warehouse_location_id,
      v_item.reserved_quantity,
      0,
      'STORED'
    )
    on conflict do nothing;


    if v_item.seller_type_snapshot =
       'MEMBER_SELLER'
    then

      v_line_base :=
        round(
          v_item.reserved_quantity
          * v_item.unit_price_per_kg,
          2
        );


      v_line_commission :=
        round(
          v_line_base
          * v_rate
          / 100,
          2
        );


      insert into public.payouts(
        order_id,
        seller_organization_id,
        amount
      )
      values (
        v_order.id,
        v_item.seller_organization_id,
        v_line_base
        - v_line_commission
      )
      on conflict (
        order_id,
        seller_organization_id
      )
      do update set
        amount =
          public.payouts.amount
          + excluded.amount;

    end if;

  end loop;


  update public.inventory_reservations
  set
    status = 'CONSUMED',
    consumed_at = now()
  where id = v_reservation.id;


  update public.payments
  set
    status = 'CONFIRMED',
    correlation_id = v_correlation_id,
    confirmed_by = auth.uid(),
    confirmed_at = now()
  where id = p_payment_id;


  update public.proforma_invoices
  set status = 'PAID'
  where order_id = v_order.id;


  perform set_config(
    'app.internal_transition',
    'true',
    true
  );


  update public.orders
  set
    status = 'PAID',
    correlation_id = v_correlation_id
  where id = v_order.id;

end;
$function$;

-- 4. Restore the exact pre-migration trigger binding before dropping the supporting columns. ---------
drop trigger trg_shipment_transition on public.order_shipments;
create trigger trg_shipment_transition
before update on public.order_shipments
for each row execute function public.validate_shipment_transition();

-- 5. Drop the two RUN A2-PRE3 internal-only helper functions (now unreferenced — the functions
--    restored above no longer call them). ------------------------------------------------------------
drop function public.apply_delivery_reservation(uuid, uuid, uuid, uuid, numeric);
drop function public.reserve_ready_deliveries_for_settlement(uuid, uuid);

-- 6. Drop the new columns (with their CHECK constraints, dropped automatically) ------------------------
alter table public.shipment_items
  drop column reserved_quantity_kg;

alter table public.order_shipments
  drop column settlement_verified_at;

-- 7. Restore shipments_buyer_draft_update's original WITH CHECK ---------------------------------------
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
