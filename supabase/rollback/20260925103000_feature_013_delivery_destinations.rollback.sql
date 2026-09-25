-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925103000_feature_013_delivery_destinations.sql (Feature 013 M2a).
-- Removes exactly what M2a added: the orders destination guard trigger and function, the two orders columns with
-- their constraints and index, and public.delivery_destinations with its index, policy and trigger. No object that
-- existed before M2a is altered (M1 stays applied).
-- Safe ONLY before real destinations exist: the guard refuses (changing nothing) if any destination row exists, if any
-- order carries a destination, or if a later Feature 013 migration is still applied (roll those back first).
-- After running it: `supabase migration repair --status reverted 20260925103000` (OPERATOR); the M2a postflight is
-- then expected to FAIL and the M1 postflight to still pass.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.delivery_destinations') is null then
    v_problems := v_problems || 'M2a is not applied (delivery_destinations missing); ';
  end if;
  if to_regclass('public.proforma_line_economics') is not null or to_regclass('public.reconciliation_cases') is not null
     or to_regclass('public.offer_price_tiers') is not null or to_regclass('public.notification_events') is not null then
    v_problems := v_problems || 'a later Feature 013 migration (M2b–M2e) is still applied; ';
  end if;
  if exists (select 1 from public.delivery_destinations) then
    v_problems := v_problems || 'delivery_destinations has rows; ';
  end if;
  if exists (select 1 from public.orders where delivery_destination_id is not null or destination_snapshot is not null) then
    v_problems := v_problems || 'orders carry a destination; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_delivery_destinations rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

drop trigger trg_orders_destination_fields_guard on public.orders;
drop function public.guard_order_destination_fields();

drop index public.idx_orders_delivery_destination;
alter table public.orders
  drop constraint orders_destination_snapshot_shape_check,
  drop constraint orders_destination_pair_check,
  drop column destination_snapshot,
  drop column delivery_destination_id;

drop table public.delivery_destinations;

commit;
