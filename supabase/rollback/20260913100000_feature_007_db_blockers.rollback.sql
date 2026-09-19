-- Rollback for 20260913100000_feature_007_db_blockers.sql (revised).
--
-- Exact reversal of the forward migration, and nothing else:
--   * drops update_order_item_quantity(uuid, numeric) and remove_order_item(uuid) (created by it);
--   * restores the verified baseline bodies of checkout_order(uuid), validate_offer_transition() and
--     expire_order_hold(uuid) — the same text as docs/database/database-schema-report.json with CR
--     removed; fingerprints (md5 of prosrc, CR removed) return to:
--       checkout_order            22a0a7b060dd9b8687382d665eff8e56
--       expire_order_hold         b5b132f67e440555c0948a8ed4c50783
--       validate_offer_transition 7c5180384b5f0948945bd87c7c168201
--   * restores the EXECUTE ACLs the forward guard VERIFIED before applying (no PUBLIC, no anon;
--     authenticated and service_role granted) for checkout_order and expire_order_hold. Any other
--     grantee was never touched by either script. validate_offer_transition's ACL was never changed.
--
-- The guard aborts (nothing reverted) unless all five functions carry exactly the migrated bodies.
-- No data is changed. Orders already HOLD for a listing's final kilograms stay valid rows; after this
-- rollback, expiring them still works (the trigger only validates increases of reserved quantity).

begin;

do $guard$
declare
  v_problems text := '';
  v_fp text;
begin
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order';
  if v_fp is distinct from '75e07c357ea33a980fd695a271d8e708' then
    v_problems := v_problems || 'checkout_order: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 75e07c357ea33a980fd695a271d8e708); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold';
  if v_fp is distinct from 'e5b8f4ee0c35948c6e582f2a9d3c0288' then
    v_problems := v_problems || 'expire_order_hold: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated e5b8f4ee0c35948c6e582f2a9d3c0288); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition';
  if v_fp is distinct from 'e1924325c811819baef4c4a5ea0c04f0' then
    v_problems := v_problems || 'validate_offer_transition: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated e1924325c811819baef4c4a5ea0c04f0); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_order_item_quantity';
  if v_fp is distinct from 'c71ace4675941ac29668b3d1b8f525e2' then
    v_problems := v_problems || 'update_order_item_quantity: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated c71ace4675941ac29668b3d1b8f525e2); ';
  end if;
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'remove_order_item';
  if v_fp is distinct from '9601dc0af97c5a80e1d86ad29375270b' then
    v_problems := v_problems || 'remove_order_item: body_md5=' || coalesce(v_fp, 'missing') || ' (expected migrated 9601dc0af97c5a80e1d86ad29375270b); ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_007_db_blockers rollback guard failed — nothing reverted: %', v_problems;
  end if;
end;
$guard$;

drop function public.remove_order_item(uuid);
drop function public.update_order_item_quantity(uuid, numeric);

CREATE OR REPLACE FUNCTION public.checkout_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_order public.orders%rowtype;
  v_ship public.order_shipments%rowtype;

  v_reservation_id uuid;
  v_proforma_id uuid;

  v_base numeric(14,2);
  v_qty numeric(14,3);
  v_shipping numeric(14,2);

  v_vat_rate numeric(7,4) := 0;
  v_taxable_base text := 'MERCHANDISE_ONLY';

  v_commission_rate numeric(7,4) := 0;
  v_commission numeric(14,2);
  v_vat numeric(14,2);
  v_buyer_total numeric(14,2);

  v_policy_id uuid;
  v_tax_id uuid;

  v_order_item record;
  v_offer public.coffee_offers%rowtype;
  v_position public.inventory_positions%rowtype;

  v_correlation_id uuid;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;


  if v_order.id is null then
    raise exception 'order_not_found';
  end if;


  if not (
    public.is_org_member(
      v_order.buyer_organization_id
    )
    or public.is_platform_admin()
  ) then
    raise exception 'forbidden';
  end if;


  if not public.is_platform_admin()
     and not public.organization_can_buy(
       v_order.buyer_organization_id
     )
  then
    raise exception 'buyer_not_authorized';
  end if;


  -- Idempotent retry.
  if v_order.status in (
    'HOLD',
    'PAYMENT_PROOF_SUBMITTED',
    'PAYMENT_UNDER_REVIEW'
  ) then

    select id
    into v_reservation_id
    from public.inventory_reservations
    where order_id = p_order_id
      and status = 'ACTIVE'
    limit 1;


    if v_reservation_id is not null then

      select id
      into v_proforma_id
      from public.proforma_invoices
      where order_id = p_order_id;


      select buyer_total_amount
      into v_buyer_total
      from public.order_financials
      where order_id = p_order_id;


      return jsonb_build_object(
        'order_id',
        p_order_id,

        'proforma_id',
        v_proforma_id,

        'reservation_id',
        v_reservation_id,

        'buyer_total',
        v_buyer_total,

        'hold_expires_at',
        v_order.hold_expires_at,

        'correlation_id',
        v_order.correlation_id,

        'idempotent_retry',
        true
      );

    end if;

  end if;


  perform public.assert_order_checkout_ready(
    p_order_id
  );


  v_correlation_id :=
    coalesce(
      v_order.correlation_id,
      gen_random_uuid()
    );


  perform set_config(
    'app.correlation_id',
    v_correlation_id::text,
    true
  );


  select *
  into v_ship
  from public.order_shipments
  where order_id = p_order_id
    and status in (
      'READY',
      'RESERVED'
    )
  order by created_at desc
  limit 1;


  select
    coalesce(
      sum(
        quantity_kg
        * unit_price_per_kg
      ),
      0
    ),
    coalesce(
      sum(quantity_kg),
      0
    )
  into
    v_base,
    v_qty
  from public.order_items
  where order_id = p_order_id;


  v_shipping :=
    coalesce(
      v_ship.shipping_fee,
      0
    );


  select
    cp.id,
    ct.percentage
  into
    v_policy_id,
    v_commission_rate
  from public.commission_policies cp
  join public.commission_tiers ct
    on ct.policy_id = cp.id
  where cp.status = 'ACTIVE'
    and cp.effective_from <= now()
    and (
      cp.effective_until is null
      or cp.effective_until > now()
    )
    and ct.min_quantity_kg <= v_qty
    and (
      ct.max_quantity_kg is null
      or v_qty < ct.max_quantity_kg
    )
  order by
    cp.effective_from desc,
    ct.min_quantity_kg desc
  limit 1;


  v_commission :=
    round(
      v_base
      * coalesce(
        v_commission_rate,
        0
      )
      / 100,
      2
    );


  select
    tr.id,
    tr.rate_percentage,
    tr.taxable_base
  into
    v_tax_id,
    v_vat_rate,
    v_taxable_base
  from public.tax_rules tr
  where tr.is_active = true
    and tr.country_code =
        upper(v_ship.country_code)
    and tr.effective_from <= now()
    and (
      tr.effective_until is null
      or tr.effective_until > now()
    )
  order by tr.effective_from desc
  limit 1;


  v_vat :=
    round(
      (
        case
          when v_taxable_base =
               'MERCHANDISE_AND_SHIPPING'
          then
            v_base + v_shipping
          else
            v_base
        end
      )
      * coalesce(
        v_vat_rate,
        0
      )
      / 100,
      2
    );


  v_buyer_total :=
    v_base
    + v_shipping
    + v_vat;


  insert into public.order_financials(
    order_id,
    base_subtotal,
    shipping_amount,
    vat_amount,
    commission_amount,
    seller_net_amount,
    buyer_total_amount,
    total_quantity_kg,
    commission_policy_id,
    commission_percentage_snapshot,
    tax_rule_id,
    tax_percentage_snapshot,
    tax_base_snapshot
  )
  values (
    p_order_id,
    v_base,
    v_shipping,
    v_vat,
    v_commission,
    v_base - v_commission,
    v_buyer_total,
    v_qty,
    v_policy_id,
    coalesce(v_commission_rate, 0),
    v_tax_id,
    coalesce(v_vat_rate, 0),
    v_taxable_base
  )
  on conflict (order_id)
  do update set
    base_subtotal =
      excluded.base_subtotal,

    shipping_amount =
      excluded.shipping_amount,

    vat_amount =
      excluded.vat_amount,

    commission_amount =
      excluded.commission_amount,

    seller_net_amount =
      excluded.seller_net_amount,

    buyer_total_amount =
      excluded.buyer_total_amount,

    total_quantity_kg =
      excluded.total_quantity_kg,

    commission_policy_id =
      excluded.commission_policy_id,

    commission_percentage_snapshot =
      excluded.commission_percentage_snapshot,

    tax_rule_id =
      excluded.tax_rule_id,

    tax_percentage_snapshot =
      excluded.tax_percentage_snapshot,

    tax_base_snapshot =
      excluded.tax_base_snapshot,

    calculated_at = now();


  insert into public.proforma_invoices(
    order_id,
    valid_until
  )
  values (
    p_order_id,
    now() + interval '20 minutes'
  )
  on conflict (order_id)
  do update set
    valid_until =
      excluded.valid_until,
    status = 'ISSUED';


  select id
  into v_proforma_id
  from public.proforma_invoices
  where order_id = p_order_id;


  insert into public.inventory_reservations(
    order_id,
    expires_at
  )
  values (
    p_order_id,
    now() + interval '20 minutes'
  )
  returning id
  into v_reservation_id;


  for v_order_item in
    select *
    from public.order_items
    where order_id = p_order_id
    order by id
  loop

    -- Consistent lock order:
    -- Offer first, Inventory second.

    select *
    into v_offer
    from public.coffee_offers
    where id = v_order_item.offer_id
    for update;


    if v_offer.id is null
       or v_offer.status not in (
         'PUBLISHED',
         'PARTIALLY_FILLED'
       )
       or not v_offer.is_visible
       or (
         v_offer.quantity_kg
         - v_offer.filled_quantity_kg
         - v_offer.reserved_quantity_kg
       ) < v_order_item.quantity_kg
    then
      raise exception 'listing_inventory_changed';
    end if;


    if v_offer.seller_type = 'MEMBER_SELLER'
       and not public.organization_can_sell(
         v_offer.seller_organization_id
       )
    then
      raise exception 'seller_not_authorized';
    end if;


    select *
    into v_position
    from public.inventory_positions ip
    where ip.lot_id = v_offer.lot_id
      and ip.owner_organization_id =
          v_offer.seller_organization_id
      and ip.warehouse_id =
          v_offer.warehouse_id
      and ip.warehouse_location_id
          is not distinct from
          v_offer.warehouse_location_id
    order by ip.created_at
    limit 1
    for update;


    if v_position.id is null
       or (
         v_position.available_quantity_kg
         - v_position.reserved_quantity_kg
       ) < v_order_item.quantity_kg
    then
      raise exception 'seller_inventory_changed';
    end if;


    -- Inventory source of truth reserved FIRST.
    update public.inventory_positions
    set
      reserved_quantity_kg =
        reserved_quantity_kg
        + v_order_item.quantity_kg,
      updated_at = now()
    where id = v_position.id;


    -- Listing reservation mirrors inventory reservation.
    update public.coffee_offers
    set
      reserved_quantity_kg =
        reserved_quantity_kg
        + v_order_item.quantity_kg
    where id = v_offer.id;


    insert into public.inventory_reservation_items(
      reservation_id,
      offer_id,
      inventory_position_id,
      quantity_kg
    )
    values (
      v_reservation_id,
      v_offer.id,
      v_position.id,
      v_order_item.quantity_kg
    );


    insert into public.proforma_invoice_items(
      proforma_id,
      order_item_id,
      description,
      quantity_kg,
      unit_price,
      amount
    )
    values (
      v_proforma_id,
      v_order_item.id,
      v_order_item.product_name_snapshot,
      v_order_item.quantity_kg,
      v_order_item.unit_price_per_kg,
      round(
        v_order_item.quantity_kg
        * v_order_item.unit_price_per_kg,
        2
      )
    )
    on conflict (
      proforma_id,
      order_item_id
    )
    do nothing;

  end loop;


  update public.payments
  set
    amount = v_buyer_total,
    status = 'PENDING',
    correlation_id = v_correlation_id
  where order_id = p_order_id;


  if not found then

    insert into public.payments(
      order_id,
      amount,
      correlation_id
    )
    values (
      p_order_id,
      v_buyer_total,
      v_correlation_id
    );

  end if;


  perform set_config(
    'app.internal_transition',
    'true',
    true
  );


  update public.orders
  set
    status = 'HOLD',
    correlation_id = v_correlation_id,
    hold_started_at = now(),
    hold_expires_at =
      now() + interval '20 minutes'
  where id = p_order_id;


  return jsonb_build_object(
    'order_id',
    p_order_id,

    'proforma_id',
    v_proforma_id,

    'reservation_id',
    v_reservation_id,

    'buyer_total',
    v_buyer_total,

    'hold_expires_at',
    now() + interval '20 minutes',

    'correlation_id',
    v_correlation_id,

    'idempotent_retry',
    false
  );

end;
$function$;

revoke all on function public.checkout_order(uuid) from public, anon;
grant execute on function public.checkout_order(uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.validate_offer_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_inventory public.inventory_positions%rowtype;
begin

  if new.warehouse_id is null then
    raise exception 'listing_requires_warehouse';
  end if;


  if not exists (
    select 1
    from public.coffee_lots cl
    where cl.id = new.lot_id
      and cl.coffee_id = new.coffee_id
  ) then
    raise exception 'offer_coffee_lot_mismatch';
  end if;


  if new.warehouse_location_id is not null
     and not exists (
       select 1
       from public.warehouse_locations wl
       where wl.id = new.warehouse_location_id
         and wl.warehouse_id = new.warehouse_id
     )
  then
    raise exception 'warehouse_location_mismatch';
  end if;


  if new.seller_type = 'HILLS' then

    if not exists (
      select 1
      from public.organizations o
      where o.id = new.seller_organization_id
        and o.is_hills_internal = true
        and o.status = 'ACTIVE'
    ) then
      raise exception
        'hills_listing_requires_active_hills_owner';
    end if;

  else

    if not public.organization_can_sell(
      new.seller_organization_id
    ) then
      raise exception
        'member_listing_requires_authorized_seller';
    end if;


    if new.source_purchase_order_item_id is null then
      raise exception
        'member_listing_requires_purchase_source';
    end if;


    if not exists (
      select 1
      from public.order_items oi
      join public.orders o
        on o.id = oi.order_id
      where oi.id = new.source_purchase_order_item_id
        and oi.lot_id = new.lot_id
        and o.buyer_organization_id =
            new.seller_organization_id
        and o.status in (
          'PAID',
          'FULFILLMENT_IN_PROGRESS',
          'PARTIALLY_DELIVERED',
          'COMPLETED'
        )
    ) then
      raise exception
        'invalid_member_listing_purchase_source';
    end if;

  end if;


  select *
  into v_inventory
  from public.inventory_positions ip
  where ip.lot_id = new.lot_id
    and ip.owner_organization_id =
        new.seller_organization_id
    and ip.warehouse_id = new.warehouse_id
    and ip.warehouse_location_id
        is not distinct from new.warehouse_location_id
  order by ip.created_at
  limit 1
  for update;


  if v_inventory.id is null then
    raise exception 'seller_inventory_position_missing';
  end if;


  if (
    new.quantity_kg
    - new.filled_quantity_kg
    - new.reserved_quantity_kg
  ) >
  (
    v_inventory.available_quantity_kg
    - v_inventory.reserved_quantity_kg
  ) then
    raise exception 'listing_exceeds_tradable_inventory';
  end if;


  -- Provenance cannot be changed after draft.
  if tg_op = 'UPDATE'
     and old.status <> 'DRAFT'
     and (
       new.lot_id is distinct from old.lot_id
       or new.coffee_id is distinct from old.coffee_id
       or new.seller_organization_id
          is distinct from old.seller_organization_id
       or new.warehouse_id
          is distinct from old.warehouse_id
       or new.warehouse_location_id
          is distinct from old.warehouse_location_id
       or new.source_purchase_order_item_id
          is distinct from old.source_purchase_order_item_id
     )
  then
    raise exception 'listing_provenance_is_locked';
  end if;


  if tg_op = 'UPDATE'
     and new.status <> old.status
  then

    if new.status in (
      'APPROVED',
      'REJECTED',
      'PUBLISHED',
      'SUSPENDED'
    )
    and not public.is_compliance_operator()
    and not public.is_internal_transition()
    then
      raise exception 'compliance_required_for_listing_state';
    end if;


    if old.status = 'DRAFT'
       and new.status not in (
         'PENDING_REVIEW',
         'ARCHIVED'
       )
    then
      raise exception 'invalid_listing_transition';

    elsif old.status = 'PENDING_REVIEW'
       and new.status not in (
         'APPROVED',
         'REJECTED',
         'DRAFT'
       )
    then
      raise exception 'invalid_listing_transition';

    elsif old.status = 'APPROVED'
       and new.status not in (
         'PUBLISHED',
         'ARCHIVED'
       )
    then
      raise exception 'invalid_listing_transition';

    elsif old.status = 'PUBLISHED'
       and new.status not in (
         'PARTIALLY_FILLED',
         'SUSPENDED',
         'SOLD_OUT',
         'ARCHIVED'
       )
    then
      raise exception 'invalid_listing_transition';

    elsif old.status = 'PARTIALLY_FILLED'
       and new.status not in (
         'SUSPENDED',
         'SOLD_OUT',
         'ARCHIVED'
       )
    then
      raise exception 'invalid_listing_transition';

    elsif old.status = 'REJECTED'
       and new.status <> 'DRAFT'
    then
      raise exception 'invalid_listing_transition';

    end if;

  end if;


  if new.status in (
    'PUBLISHED',
    'PARTIALLY_FILLED'
  )
  and (
    new.quantity_kg
    - new.filled_quantity_kg
    - new.reserved_quantity_kg
  ) <= 0
  then
    raise exception 'cannot_publish_empty_listing';
  end if;


  new.is_visible :=
    new.status in (
      'PUBLISHED',
      'PARTIALLY_FILLED'
    );


  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expire_order_hold(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_res public.inventory_reservations%rowtype;
  v_item record;
begin

  select *
  into v_res
  from public.inventory_reservations
  where order_id = p_order_id
    and status = 'ACTIVE'
    and expires_at <= now()
  for update;


  if v_res.id is null then
    return;
  end if;


  for v_item in
    select
      iri.*,
      co.lot_id,
      co.seller_organization_id,
      co.warehouse_id,
      co.warehouse_location_id
    from public.inventory_reservation_items iri
    join public.coffee_offers co
      on co.id = iri.offer_id
    where iri.reservation_id = v_res.id
    order by iri.offer_id
  loop

    -- Consistent lock order.
    perform 1
    from public.coffee_offers
    where id = v_item.offer_id
    for update;


    if v_item.inventory_position_id
       is not null
    then

      perform 1
      from public.inventory_positions
      where id = v_item.inventory_position_id
      for update;


      -- Inventory first.
      update public.inventory_positions
      set
        reserved_quantity_kg =
          greatest(
            reserved_quantity_kg
            - v_item.quantity_kg,
            0
          ),
        updated_at = now()
      where id =
            v_item.inventory_position_id;

    else

      perform 1
      from public.inventory_positions
      where lot_id = v_item.lot_id
        and owner_organization_id =
            v_item.seller_organization_id
        and warehouse_id =
            v_item.warehouse_id
        and warehouse_location_id
            is not distinct from
            v_item.warehouse_location_id
      for update;


      update public.inventory_positions
      set
        reserved_quantity_kg =
          greatest(
            reserved_quantity_kg
            - v_item.quantity_kg,
            0
          ),
        updated_at = now()
      where lot_id = v_item.lot_id
        and owner_organization_id =
            v_item.seller_organization_id
        and warehouse_id =
            v_item.warehouse_id
        and warehouse_location_id
            is not distinct from
            v_item.warehouse_location_id;

    end if;


    -- Then listing mirror.
    update public.coffee_offers
    set
      reserved_quantity_kg =
        greatest(
          reserved_quantity_kg
          - v_item.quantity_kg,
          0
        )
    where id = v_item.offer_id;

  end loop;


  update public.inventory_reservations
  set
    status = 'EXPIRED',
    released_at = now()
  where id = v_res.id;


  update public.payments
  set status = 'EXPIRED'
  where order_id = p_order_id
    and status in (
      'PENDING',
      'PROOF_SUBMITTED',
      'UNDER_REVIEW'
    );


  perform set_config(
    'app.internal_transition',
    'true',
    true
  );


  update public.orders
  set status = 'EXPIRED'
  where id = p_order_id
    and status in (
      'HOLD',
      'PAYMENT_PROOF_SUBMITTED',
      'PAYMENT_UNDER_REVIEW'
    );

end;
$function$;

revoke all on function public.expire_order_hold(uuid) from public, anon;
grant execute on function public.expire_order_hold(uuid) to authenticated, service_role;

commit;
