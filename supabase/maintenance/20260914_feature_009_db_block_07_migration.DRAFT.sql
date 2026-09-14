-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- DRAFT — NOT YET APPLIED. Authored during Feature 009 RUN A1 (T007) for RUN A2's T010 human
-- approval gate. Do NOT run this against any database — including a test/staging Supabase project —
-- without first running the read-only preflight (supabase/maintenance/
-- 20260914_feature_009_db_block_07_preflight.sql) and obtaining explicit recorded approval per
-- specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md §13's checklist. Once approved, this file's
-- content is copied into a real supabase/migrations/<timestamp>_feature_009_db_block_07.sql (this
-- project's own convention keeps supabase/migrations/ as APPLIED history only — see 20260913100000_
-- feature_007_db_blockers.sql for precedent).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Feature 009 — DB-BLOCK-07 (delivery reservation + settlement-eligibility gate). Full design at
-- specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md. Two related database gaps, closed together:
--
-- 1. A delivery request does not reserve inventory (SRS DEL-01/AC-04): quantity requested for
--    delivery remains available for listing/resale/another delivery request.
-- 2. Physical-fulfillment progression is not gated on order settlement at all (SRS MKT-04 applied to
--    release): a warehouse operator could progress an unpaid order's shipment to DELIVERED today.
--
-- Scope — additive only; no existing table, column, constraint, RLS policy or table grant is removed:
--   - Two new nullable/defaulted columns: shipment_items.reserved_quantity_kg,
--     order_shipments.settlement_verified_at.
--   - validate_shipment_transition() gains: (a) a settlement-eligibility check and (b) the
--     reservation effect, both firing ONLY on the FIRST transition into the "gated set"
--     {CAPACITY_CONFIRMED, RESERVED, PICKING, BOOKED, DISPATCHED, PARTIALLY_DELIVERED, DELIVERED}
--     from outside it; and (c) full reservation release on a transition into CANCELLED/FAILED from an
--     already-reserved state. DESIGN §9's recommended DISPUTED policy is "freeze" — entering DISPUTED
--     does NOT release the reservation; this migration implements that recommendation.
--   - validate_shipment_item() gains: partial release of reserved_quantity_kg by exactly the
--     newly-delivered amount whenever delivered_quantity_kg increases.
--   - shipments_buyer_draft_update's WITH CHECK is widened to also permit CANCELLED as a target
--     (DB-OPEN-18) — the buyer-cancel-from-DRAFT RLS gap plan.md recommended bundling here.
--
-- No change to admin_review_payment(), checkout_order(), expire_order_hold(), or any payment/
-- settlement/finance table (design §12 — confirmed neither needs modification).
--
-- No PROOF_SUBMITTED/UNDER_REVIEW/REJECTED status is repurposed. No new order_shipments/shipment_items
-- status value is added — the existing 13/enum vocabularies are used verbatim.
--
-- Baseline body fingerprints (md5 of prosrc with CR removed) — see the preflight file's guard for the
-- live-read values this migration was authored against:
--   validate_shipment_transition  93102472a7bdcdce52f645c1edb07a25
--   validate_shipment_item        ab0d35de1718d58d46f8c71cbbf95b4f
-- Post-migration body fingerprints, computed from THIS FILE's own text (RE-VERIFY against the real
-- live prosrc once actually applied — the rollback script's own guard will refuse to run if they
-- differ, so this is a safety net, not a silent risk):
--   validate_shipment_transition  661a7f98b977aaebd8cab8b46540a09b
--   validate_shipment_item        90308102933bb6569ae24094c209578d
--
-- Not re-applicable by design: on a second run the guard finds the new columns already present and
-- aborts. Rollback: 20260914_feature_009_db_block_07_migration.DRAFT.rollback.sql.

begin;

do $guard$
declare
  v_problems text := '';
  v_fp text;
  v_count int;
begin
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  if v_count <> 1 or v_fp is distinct from '93102472a7bdcdce52f645c1edb07a25' then
    v_problems := v_problems || 'validate_shipment_transition: overloads=' || v_count || ' body_md5=' || coalesce(v_fp, 'missing') || ' (expected 93102472a7bdcdce52f645c1edb07a25); ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  if v_count <> 1 or v_fp is distinct from 'ab0d35de1718d58d46f8c71cbbf95b4f' then
    v_problems := v_problems || 'validate_shipment_item: overloads=' || v_count || ' body_md5=' || coalesce(v_fp, 'missing') || ' (expected ab0d35de1718d58d46f8c71cbbf95b4f); ';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg') then
    v_problems := v_problems || 'shipment_items.reserved_quantity_kg already exists; ';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at') then
    v_problems := v_problems || 'order_shipments.settlement_verified_at already exists; ';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosrc like '%delivery_reservation_requires_settled_order%'
        or p.prosrc like '%delivery_reservation_insufficient_inventory%'
        or p.prosrc like '%delivery_reservation_position_missing%')
  ) then
    v_problems := v_problems || 'draft exception strings already referenced by an existing function; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_009_db_block_07 preflight failed — nothing applied: %', v_problems;
  end if;
end;
$guard$;

-- 1. New columns ------------------------------------------------------------------------------------
alter table public.shipment_items
  add column reserved_quantity_kg numeric(14, 3) not null default 0;

alter table public.order_shipments
  add column settlement_verified_at timestamptz;

-- 2. validate_shipment_transition() — settlement gate + reservation + release ----------------------
CREATE OR REPLACE FUNCTION public.validate_shipment_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_position public.inventory_positions%rowtype;
  v_alloc public.storage_allocations%rowtype;
  v_newly_gated boolean := false;
  v_releasing boolean := false;
  v_release_buyer_org_id uuid;
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
    -- Feature 009 DB-BLOCK-07: FAILED and DISPUTED intentionally have NO elsif branch here, exactly
    -- as in the baseline this migration was written against (docs/architecture/
    -- DATABASE-CAPABILITY-MAP.md's DB-OPEN-18) — the database does not itself limit a forward
    -- transition from either state; Feature 009's application layer narrows this itself
    -- (lib/delivery/transitions.ts). Not changed by this migration.


    -- Feature 009 DB-BLOCK-07 — settlement gate + reservation (design §0/§4). Fires ONLY on the
    -- FIRST transition into the gated set from outside it.
    v_newly_gated :=
      new.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED')
      and old.status not in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED');

    if v_newly_gated and new.settlement_verified_at is null then

      select * into v_order from public.orders where id = new.order_id for update;

      if v_order.status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED') then
        raise exception 'delivery_reservation_requires_settled_order';
      end if;

      for v_item in
        select si.id, si.order_item_id, si.planned_quantity_kg, oi.lot_id
        from public.shipment_items si
        join public.order_items oi on oi.id = si.order_item_id
        where si.shipment_id = new.id
        order by si.id
      loop

        select * into v_alloc
        from public.storage_allocations
        where order_item_id = v_item.order_item_id
          and owner_organization_id = v_order.buyer_organization_id
        order by started_at
        limit 1;

        if v_alloc.id is null then
          raise exception 'delivery_reservation_position_missing';
        end if;

        select * into v_position
        from public.inventory_positions ip
        where ip.lot_id = v_item.lot_id
          and ip.owner_organization_id = v_order.buyer_organization_id
          and ip.warehouse_id = v_alloc.warehouse_id
          and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
        order by ip.created_at
        limit 1
        for update;

        if v_position.id is null
           or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < v_item.planned_quantity_kg
        then
          raise exception 'delivery_reservation_insufficient_inventory';
        end if;

        update public.inventory_positions
        set reserved_quantity_kg = reserved_quantity_kg + v_item.planned_quantity_kg,
            updated_at = now()
        where id = v_position.id;

        update public.shipment_items
        set reserved_quantity_kg = planned_quantity_kg
        where id = v_item.id
          and reserved_quantity_kg = 0;

      end loop;

      new.settlement_verified_at := now();

    end if;


    -- Feature 009 DB-BLOCK-07 — full release on cancel/fail from an already-reserved state
    -- (design §5/§6). Idempotent: a shipment_items row already at reserved_quantity_kg = 0
    -- releases nothing (the WHERE clause on the update below is the guard).
    v_releasing := new.status in ('CANCELLED', 'FAILED') and old.settlement_verified_at is not null;

    if v_releasing then

      -- v_order is NOT reused here: it is populated only inside the `v_newly_gated` branch above,
      -- which does not run on THIS invocation (the shipment is already gated — that is exactly what
      -- `old.settlement_verified_at is not null` means). A fresh, dedicated scalar lookup avoids
      -- relying on a rowtype variable whose other fields were never set in this trigger execution.
      select buyer_organization_id into v_release_buyer_org_id from public.orders where id = new.order_id;

      for v_item in
        select si.id, si.reserved_quantity_kg, oi.lot_id
        from public.shipment_items si
        join public.order_items oi on oi.id = si.order_item_id
        where si.shipment_id = new.id
          and si.reserved_quantity_kg > 0
        order by si.id
      loop

        select * into v_alloc
        from public.storage_allocations sa
        join public.shipment_items si2 on si2.order_item_id = sa.order_item_id
        where si2.id = v_item.id
          and sa.owner_organization_id = v_release_buyer_org_id
        order by sa.started_at
        limit 1;

        if v_alloc.id is not null then
          select * into v_position
          from public.inventory_positions ip
          where ip.lot_id = v_item.lot_id
            and ip.owner_organization_id = v_release_buyer_org_id
            and ip.warehouse_id = v_alloc.warehouse_id
            and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
          order by ip.created_at
          limit 1
          for update;

          if v_position.id is not null then
            update public.inventory_positions
            set available_quantity_kg = available_quantity_kg + v_item.reserved_quantity_kg,
                reserved_quantity_kg = greatest(reserved_quantity_kg - v_item.reserved_quantity_kg, 0),
                updated_at = now()
            where id = v_position.id;
          end if;
        end if;

        update public.shipment_items
        set reserved_quantity_kg = 0
        where id = v_item.id
          and reserved_quantity_kg = v_item.reserved_quantity_kg;

      end loop;

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
-- validate_shipment_transition is a trigger function; CREATE OR REPLACE keeps its existing ACL/trigger binding unchanged.

-- 3. validate_shipment_item() — partial release on delivery recording -------------------------------
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
  v_newly_delivered numeric(14,3);
  v_buyer_organization_id uuid;
  v_lot_id uuid;
  v_alloc public.storage_allocations%rowtype;
  v_position public.inventory_positions%rowtype;
begin

  select
    oi.order_id,
    oi.quantity_kg,
    oi.lot_id
  into
    v_item_order_id,
    v_ordered_quantity,
    v_lot_id
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

      -- Feature 009 DB-BLOCK-07 — release exactly the newly-delivered amount from the reservation
      -- (design §7). Goods leaving custody entirely: reserved_quantity_kg decreases with NO
      -- corresponding available_quantity_kg increase (unlike a cancel/fail release above).
      v_newly_delivered := new.delivered_quantity_kg - old.delivered_quantity_kg;

      if v_newly_delivered > 0 and old.reserved_quantity_kg > 0 then

        select buyer_organization_id into v_buyer_organization_id from public.orders where id = v_item_order_id;

        select * into v_alloc
        from public.storage_allocations
        where order_item_id = new.order_item_id
          and owner_organization_id = v_buyer_organization_id
        order by started_at
        limit 1;

        if v_alloc.id is not null then
          select * into v_position
          from public.inventory_positions ip
          where ip.lot_id = v_lot_id
            and ip.owner_organization_id = v_buyer_organization_id
            and ip.warehouse_id = v_alloc.warehouse_id
            and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
          order by ip.created_at
          limit 1
          for update;

          if v_position.id is not null then
            update public.inventory_positions
            set reserved_quantity_kg = greatest(reserved_quantity_kg - least(v_newly_delivered, old.reserved_quantity_kg), 0),
                updated_at = now()
            where id = v_position.id;
          end if;
        end if;

        new.reserved_quantity_kg := greatest(old.reserved_quantity_kg - v_newly_delivered, 0);

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
-- validate_shipment_item is a trigger function; CREATE OR REPLACE keeps its existing ACL/trigger binding unchanged.

-- 4. DB-OPEN-18 (bundled per plan.md's recommendation) — permit buyer-initiated DRAFT -> CANCELLED --
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
  with check (status in ('DRAFT', 'REQUESTED', 'CANCELLED'));

commit;
