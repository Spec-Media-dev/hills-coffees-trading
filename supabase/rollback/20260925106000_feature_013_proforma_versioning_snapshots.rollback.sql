-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql (Feature 013 M2b).
-- Removes exactly what M2b added and restores what it replaced:
--   * checkout_order(uuid) → the exact T006 body (md5 75e07c357ea33a980fd695a271d8e708), same flags and EXECUTE list;
--   * proforma_invoices_status_check → {ISSUED, PAID, VOID}; proforma_invoices_order_id_key → UNIQUE (order_id);
--   * drops the four new tables, the new columns/constraints/indexes of proforma_invoices, proforma_invoice_items,
--     order_financials and orders, the M2b triggers and functions.
-- M1 and M2a stay applied. Safe ONLY before Feature 013 proformas exist: the guard refuses (changing nothing) while any
-- snapshot row, Feature 013 proforma/line, new status value, second version, order pointer or order_financials pointer
-- exists, or while a later Feature 013 migration is applied (roll those back first).
-- After running it: `supabase migration repair --status reverted 20260925106000` (OPERATOR); the M2b postflight is then
-- expected to FAIL and the M1/M2a postflights to pass (their point-in-time "no later migration" rows included).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.proforma_line_economics') is null then
    v_problems := v_problems || 'M2b is not applied (proforma_line_economics missing); ';
  end if;
  if to_regclass('public.reconciliation_cases') is not null or to_regclass('public.offer_price_tiers') is not null
     or to_regclass('public.notification_events') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('is_order_buyer_member', 'is_order_line_seller', 'order_seller_org_ids', 'issue_proforma')) then
    v_problems := v_problems || 'a later Feature 013 migration (M2c+) is still applied; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.checkout_order(uuid)')), '')
     <> '54810aadbcb05915d49374d5ceae738e' then
    v_problems := v_problems || 'checkout_order(uuid) differs from the M2b body; ';
  end if;
  if exists (select 1 from public.proforma_fulfillment_groups) or exists (select 1 from public.proforma_line_economics)
     or exists (select 1 from public.proforma_seller_settlements) or exists (select 1 from public.proforma_bank_instructions) then
    v_problems := v_problems || 'a proforma snapshot table has rows; ';
  end if;
  if exists (select 1 from public.proforma_invoices
             where validity_hours_snapshot is not null or version <> 1 or status not in ('ISSUED', 'PAID', 'VOID')) then
    v_problems := v_problems || 'a Feature 013 proforma, a second version or a new status value exists; ';
  end if;
  if exists (select 1 from public.proforma_invoices group by order_id having count(*) > 1) then
    v_problems := v_problems || 'an order holds more than one proforma (UNIQUE (order_id) cannot be restored); ';
  end if;
  if exists (select 1 from public.proforma_invoice_items where seller_type_snapshot is not null) then
    v_problems := v_problems || 'a Feature 013 proforma line exists; ';
  end if;
  if exists (select 1 from public.orders where current_proforma_id is not null)
     or exists (select 1 from public.order_financials where proforma_id is not null) then
    v_problems := v_problems || 'an order or order_financials row points to a proforma; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_proforma_versioning_snapshots rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

-- Triggers.
drop trigger trg_orders_proforma_pointer_guard on public.orders;
drop trigger trg_order_financials_freeze on public.order_financials;
drop trigger trg_order_financials_snapshot_totals on public.order_financials;
drop trigger trg_proforma_invoice_items_snapshot_totals on public.proforma_invoice_items;
drop trigger trg_proforma_invoice_items_immutable on public.proforma_invoice_items;
drop trigger trg_proforma_invoices_snapshot_totals on public.proforma_invoices;
drop trigger trg_audit_proforma_invoices on public.proforma_invoices;
drop trigger trg_proforma_invoices_protect_snapshot on public.proforma_invoices;

-- checkout_order(uuid): the exact T006 body.
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
    -- Feature 007 DB blocker run (DB-OPEN-16): the transaction-local marker below is the ONLY way the listing trigger
    -- (validate_offer_transition) accepts a reservation that leaves a published listing with zero
    -- unreserved quantity. It is set by this SECURITY DEFINER function immediately before this one
    -- UPDATE — after this function's own locked `quantity - filled - reserved` check above — and
    -- cleared immediately after it. No client input reaches it.
    perform set_config('app.checkout_reservation', 'true', true);

    update public.coffee_offers
    set
      reserved_quantity_kg =
        reserved_quantity_kg
        + v_order_item.quantity_kg
    where id = v_offer.id;

    perform set_config('app.checkout_reservation', 'false', true);


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

-- New tables (their own triggers go with them).
drop table public.proforma_bank_instructions;
drop table public.proforma_seller_settlements;
drop table public.proforma_line_economics;

-- proforma_invoice_items.
drop index public.idx_proforma_invoice_items_group;
drop index public.uq_proforma_invoice_items_offer;
alter table public.proforma_invoice_items
  drop constraint proforma_invoice_items_cap_check,
  drop constraint proforma_invoice_items_hills_line_funding_check,
  drop constraint proforma_invoice_items_funding_scope_check,
  drop constraint proforma_invoice_items_promotion_values_check,
  drop constraint proforma_invoice_items_promotion_discount_check,
  drop constraint proforma_invoice_items_promotion_fields_check,
  drop constraint proforma_invoice_items_line_total_check,
  drop constraint proforma_invoice_items_net_check,
  drop constraint proforma_invoice_items_discount_check,
  drop constraint proforma_invoice_items_gross_check,
  drop constraint proforma_invoice_items_unit_price_check,
  drop constraint proforma_invoice_items_seller_type_check,
  drop constraint proforma_invoice_items_snapshot_marker_check,
  drop constraint proforma_invoice_items_economics_key,
  drop constraint proforma_invoice_items_fulfillment_group_fkey,
  drop column lot_code_snapshot,
  drop column origin_name_snapshot,
  drop column product_name_snapshot,
  drop column line_total,
  drop column vat_amount,
  drop column net_amount,
  drop column discount_cap_reason,
  drop column discount_capped,
  drop column discount_amount,
  drop column promotion_raw_amount,
  drop column promotion_rule_snapshot,
  drop column promotion_code_applied,
  drop column promotion_funding_source,
  drop column promotion_scope_snapshot,
  drop column promotion_id,
  drop column gross_amount,
  drop column price_tier_id,
  drop column list_unit_price,
  drop column fulfillment_group_id,
  drop column warehouse_id,
  drop column seller_type_snapshot,
  drop column seller_organization_id,
  drop column offer_code_snapshot,
  drop column offer_id;

drop table public.proforma_fulfillment_groups;

-- order_financials.
alter table public.order_financials
  drop constraint order_financials_legacy_placeholder_check,
  drop constraint order_financials_discounts_check,
  drop constraint order_financials_proforma_fkey,
  drop column hills_share_amount,
  drop column hills_funded_discount,
  drop column seller_funded_discount,
  drop column discount_amount,
  drop column proforma_id;

-- orders.
drop index public.idx_orders_current_proforma;
alter table public.orders
  drop constraint orders_current_proforma_fkey,
  drop column current_proforma_id;

-- proforma_invoices: M2b columns, constraints and indexes; then the T006 status CHECK and UNIQUE (order_id).
drop index public.idx_proforma_invoices_supersedes;
drop index public.uq_open_proforma_per_order;
alter table public.proforma_invoices
  drop constraint proforma_invoices_lifecycle_check,
  drop constraint proforma_invoices_bank_account_masked_check,
  drop constraint proforma_invoices_destination_snapshot_shape_check,
  drop constraint proforma_invoices_buyer_snapshot_shape_check,
  drop constraint proforma_invoices_promotion_code_check,
  drop constraint proforma_invoices_tax_snapshot_check,
  drop constraint proforma_invoices_validity_check,
  drop constraint proforma_invoices_legacy_placeholder_check,
  drop constraint proforma_invoices_snapshot_marker_check,
  drop constraint proforma_invoices_buyer_total_check,
  drop constraint proforma_invoices_merchandise_net_check,
  drop constraint proforma_invoices_amounts_nonnegative_check,
  drop constraint proforma_invoices_currency_check,
  drop constraint proforma_invoices_supersedes_check,
  drop constraint proforma_invoices_version_check,
  drop constraint proforma_invoices_id_order_key,
  drop constraint proforma_invoices_order_version_key,
  drop column issued_by,
  drop column voided_at,
  drop column cancelled_at,
  drop column expired_at,
  drop column confirmed_by,
  drop column confirmed_at,
  drop column bank_account_masked,
  drop column destination_snapshot,
  drop column buyer_snapshot,
  drop column promotion_code_snapshot,
  drop column tax_base_snapshot,
  drop column tax_rate_snapshot,
  drop column tax_rule_id,
  drop column buyer_total,
  drop column vat_total,
  drop column shipping_total,
  drop column merchandise_net,
  drop column discount_total,
  drop column merchandise_gross,
  drop column currency,
  drop column validity_hours_snapshot,
  drop column supersedes_proforma_id,
  drop column version,
  drop constraint proforma_invoices_status_check,
  add constraint proforma_invoices_status_check check (status in ('ISSUED', 'PAID', 'VOID')),
  add constraint proforma_invoices_order_id_key unique (order_id);

-- Functions.
drop function public.write_audit_log_proforma_bank_instructions();
drop function public.write_audit_log_proforma_invoices();
drop function public.guard_order_proforma_pointer();
drop function public.freeze_order_financials();
drop function public.check_proforma_snapshot_totals();
drop function public.check_seller_settlement_totals();
drop function public.prevent_snapshot_mutation();
drop function public.protect_proforma_snapshot();

commit;
