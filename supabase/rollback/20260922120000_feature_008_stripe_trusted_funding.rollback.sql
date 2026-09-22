-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql
-- Every addition in that migration is strictly additive (new nullable/NOT-NULL columns on existing
-- tables, one new table, one new precondition inserted into an otherwise-unchanged function, three new
-- functions) — this rollback removes exactly those additions and restores admin_review_payment() to its
-- pre-migration body. No existing row, column, or constraint predating that migration is altered.
-- Apply path: run this file, then re-run the paired postflight's "before" shape checks if in doubt.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- Restore admin_review_payment() to its exact pre-migration body (byte-for-byte reproduction of the
-- function captured from docs/database/database-schema-report.json before this migration touched it —
-- i.e. WITHOUT the trusted_funding_required precondition).
create or replace function public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'auth'
as $function$
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

revoke all on function public.admin_review_payment(uuid, boolean, text) from public;
revoke all on function public.admin_review_payment(uuid, boolean, text) from anon;
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;

-- Drop the three new functions.
drop function if exists public.record_payment_transfer(uuid, text, text, text);
drop function if exists public.record_stripe_payment_intent(uuid, text, text);
drop function if exists public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean);

-- Drop the new table (also drops its indexes/policies).
drop table if exists public.payment_transfers;

-- Drop the new FK before the columns it references.
alter table public.payments drop constraint if exists payments_trusted_funding_event_id_fkey;

-- Restore payment_events' original nullability. Safe: this migration's own preflight refused to apply
-- unless the table was empty, so rollback cannot be undoing a NOT NULL that a real row now depends on
-- unless a row was written by ingest_stripe_event() after this migration was applied and BEFORE this
-- rollback runs — which is exactly the scenario an operator should check for before rolling back.
alter table public.payment_events
  alter column provider drop not null,
  alter column external_event_id drop not null;

-- Drop the new payments columns.
alter table public.payments
  drop column if exists trusted_funding_event_id,
  drop column if exists trusted_funding_confirmed_at;

commit;
