-- Feature 013 — stock/inventory reservation (owner scope reduction, 2026-09-28: M5a bank-transfer proof, M5b finance
-- settlement, Feature 009 delivery integration and M9 Stripe retirement are out of current product scope; only the
-- reservation step of the originally-authored M4c survives). Paired rollback and read-only postflight live outside
-- supabase/migrations.
--
-- Implements exactly `confirm_proforma`/`expire_reservation`/`sweep_expired_reservations` as already documented in
-- contracts/database-rpc.md and research.md R-9, minus the two steps that exist only to feed the now-cancelled M5a/M5b
-- workflow: no `payments` row is written (nothing reads it without M5a/M5b), and no `order.awaiting_transfer`/
-- `order.expired` notification is emitted (no buyer-facing next action exists to notify about in this reduced scope).
-- Every locking, authorization, error-vocabulary and state-machine detail below is otherwise exactly the documented
-- contract; nothing here is invented. `cancel_order` and `admin_void_order` are intentionally NOT authored: the
-- 20-minute expiry already provides a complete, self-releasing lifecycle (PROFORMA_ISSUED -> HOLD -> EXPIRED) with no
-- downstream step to protect against in this reduced scope, and neither function appears in the owner's required
-- reservation-invariant list.
begin;

do $guard$
begin
  if to_regprocedure('public.confirm_proforma(uuid,uuid)') is not null
     or to_regprocedure('public.expire_reservation(uuid)') is not null
     or to_regprocedure('public.sweep_expired_reservations(int)') is not null
     or to_regprocedure('public.commerce_release_reservation(uuid)') is not null then
    raise exception 'feature_013_reservation_objects_already_exist';
  end if;
  if to_regprocedure('public.commerce_request_begin(uuid,text,uuid)') is null
     or to_regprocedure('public.commerce_assert_buyer_member(uuid)') is null
     or to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is null
     or to_regprocedure('public.organization_can_sell(uuid)') is null
     or not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'inventory_reservations'
                    and indexname = 'uq_open_inventory_reservation_order') then
    raise exception 'feature_013_reservation_prerequisites_missing';
  end if;
  if exists (select 1 from public.commerce_settings where id and bank_transfer_checkout_enabled) then
    raise exception 'feature_013_reservation_checkout_state_unexpected';
  end if;
end;
$guard$;

-- Internal helper (no API grant; called only from the three RPCs below). Locks exactly one order with
-- FOR UPDATE SKIP LOCKED (safe for every caller: a direct, explicit single-order request treats "someone else has it
-- right now" as a harmless no-op/retry-later; opportunistic reclaim and the sweeper are explicitly best-effort by
-- design — research.md R-9, "correctness never depends on cron"). Releases the order's OWN ACTIVE reservation only if
-- it is genuinely past its deadline under this lock; re-verifies under lock (never trusts a caller's earlier read).
-- Idempotent: returns false and changes nothing when there is no expired ACTIVE reservation to release.
create or replace function public.commerce_release_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update skip locked;
  if v_order.id is null or v_order.status <> 'HOLD' then
    return false;
  end if;

  select * into v_reservation from public.inventory_reservations
  where order_id = p_order_id and status = 'ACTIVE' for update;
  if v_reservation.id is null or v_reservation.expires_at > clock_timestamp() then
    return false;
  end if;

  -- Lock order matches data-model.md §8: offers ascending, then positions ascending. WRITE order is the reverse of
  -- the reservation's own increment (position mirror is the source of truth): positions decremented first, then
  -- offers — a listing's tradable remainder (quantity - filled - reserved) must never exceed the backing position's
  -- (available - reserved) even transiently, or the existing `listing_exceeds_tradable_inventory` guard trips.
  for v_item in
    select ri.offer_id from public.inventory_reservation_items ri where ri.reservation_id = v_reservation.id order by ri.offer_id
  loop
    perform 1 from public.coffee_offers where id = v_item.offer_id for update;
  end loop;
  for v_item in
    select ri.inventory_position_id from public.inventory_reservation_items ri
    where ri.reservation_id = v_reservation.id and ri.inventory_position_id is not null order by ri.inventory_position_id
  loop
    perform 1 from public.inventory_positions where id = v_item.inventory_position_id for update;
  end loop;

  for v_item in
    select ri.inventory_position_id, ri.quantity_kg
    from public.inventory_reservation_items ri
    where ri.reservation_id = v_reservation.id and ri.inventory_position_id is not null
    order by ri.inventory_position_id
  loop
    update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg - v_item.quantity_kg, updated_at = now()
    where id = v_item.inventory_position_id;
  end loop;

  for v_item in
    select ri.offer_id, ri.quantity_kg
    from public.inventory_reservation_items ri
    where ri.reservation_id = v_reservation.id
    order by ri.offer_id
  loop
    update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg - v_item.quantity_kg
    where id = v_item.offer_id;
  end loop;

  update public.inventory_reservations
  set status = 'EXPIRED', release_reason = 'EXPIRED', released_at = clock_timestamp()
  where id = v_reservation.id;

  perform set_config('app.internal_transition', 'true', true);
  update public.proforma_invoices set status = 'EXPIRED', expired_at = clock_timestamp()
  where id = v_reservation.proforma_id and status = 'CONFIRMED';
  update public.orders set status = 'EXPIRED' where id = p_order_id;
  perform set_config('app.internal_transition', 'false', true);

  return true;
end;
$function$;
revoke all on function public.commerce_release_reservation(uuid) from public, anon, authenticated, service_role;
-- Explicit owner-only grant satisfies the migration convention without exposing this internal helper to any API role.
grant execute on function public.commerce_release_reservation(uuid) to postgres;

-- confirm_proforma(p_proforma_id uuid, p_request_id uuid) — contracts/database-rpc.md, steps 1-5 and 7 exactly;
-- steps 6 (payment row) and 8 (notification) are the M5a-only steps dropped by the owner scope reduction.
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
  -- Non-enumerating resolve: a nonexistent proforma and one belonging to another organization return the same code.
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
    -- A raised exception rolls back writes in this call. The deadline is authoritative; the
    -- existing issue_proforma replacement path marks this old version EXPIRED transactionally.
    raise exception 'proforma_expired';
  end if;

  -- Opportunistic reclaim (research.md R-9): release any OTHER order's logically-expired ACTIVE reservation that
  -- holds quantity on an offer this proforma needs, each under its own order lock taken with SKIP LOCKED. A skipped
  -- one (concurrently held elsewhere) is simply left for the sweeper; this confirm attempt still re-checks real
  -- availability afterward and fails cleanly (FR-017) if that specific reclaim did not land in time.
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

  -- Lock offers ascending, then positions ascending (data-model.md §8); re-check every line under lock (FR-017,
  -- SEC-002/SEC-003: fresh authoritative data, the frozen proforma price is never re-read — FIN-001).
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

  -- Different offers can map to positions in the opposite order. Acquire all position locks
  -- globally by UUID before inspecting any line, rather than acquiring them in offer order.
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

    -- Inventory source of truth reserved first, then the listing mirror (same convention as checkout_order()).
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

-- expire_reservation(p_order_id uuid) — non-enumerating buyer-member-or-admin caller check, then the shared release.
create or replace function public.expire_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_buyer_org uuid;
begin
  select buyer_organization_id into v_buyer_org from public.orders where id = p_order_id;
  if v_buyer_org is null then
    raise exception 'order_not_found';
  end if;
  if auth.role() <> 'service_role' and not (public.is_org_member(v_buyer_org) or public.is_platform_admin()) then
    raise exception 'order_not_found';
  end if;
  return public.commerce_release_reservation(p_order_id);
end;
$function$;
revoke all on function public.expire_reservation(uuid) from public, anon;
grant execute on function public.expire_reservation(uuid) to authenticated, service_role;

-- sweep_expired_reservations(p_limit int) — service_role only; applies the shared release to up to p_limit candidates.
create or replace function public.sweep_expired_reservations(p_limit int default 100)
returns int
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_order_id uuid;
  v_released int := 0;
begin
  for v_order_id in
    select r.order_id from public.inventory_reservations r
    where r.status = 'ACTIVE' and r.expires_at <= clock_timestamp()
    order by r.expires_at
    limit greatest(p_limit, 0)
  loop
    if public.commerce_release_reservation(v_order_id) then
      v_released := v_released + 1;
    end if;
  end loop;
  return v_released;
end;
$function$;
revoke all on function public.sweep_expired_reservations(int) from public, anon, authenticated;
grant execute on function public.sweep_expired_reservations(int) to service_role;

commit;
