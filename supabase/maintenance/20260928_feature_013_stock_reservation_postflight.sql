-- Read-only postflight for the Feature 013 stock/inventory reservation migration. Every row must return passed = true.
with checks as (
  select 1 as ordinal, 'reservation functions exist' as invariant,
    to_regprocedure('public.confirm_proforma(uuid,uuid)') is not null
      and to_regprocedure('public.expire_reservation(uuid)') is not null
      and to_regprocedure('public.sweep_expired_reservations(int)') is not null
      and to_regprocedure('public.commerce_release_reservation(uuid)') is not null as passed
  union all
  select 2, 'confirm_proforma/expire_reservation grants are narrow (authenticated only; commerce_release_reservation is owner-only, no API role)',
    not has_function_privilege('anon', 'public.confirm_proforma(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.confirm_proforma(uuid,uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.confirm_proforma(uuid,uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.expire_reservation(uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.expire_reservation(uuid)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.expire_reservation(uuid)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.commerce_release_reservation(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.commerce_release_reservation(uuid)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.commerce_release_reservation(uuid)', 'EXECUTE')
  union all
  select 3, 'sweep_expired_reservations EXECUTE = service_role only',
    not has_function_privilege('anon', 'public.sweep_expired_reservations(int)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.sweep_expired_reservations(int)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.sweep_expired_reservations(int)', 'EXECUTE')
  union all
  select 4, 'global checkout remains off',
    exists (select 1 from public.commerce_settings where id and not bank_transfer_checkout_enabled)
  union all
  select 5, 'no orphaned ACTIVE reservation without an ACTIVE unique-open-slot match (schema invariant intact)',
    (select count(*) from public.inventory_reservations where status = 'ACTIVE')
      = (select count(*) from public.orders o where o.status = 'HOLD'
         and exists (select 1 from public.inventory_reservations r where r.order_id = o.id and r.status = 'ACTIVE'))
  union all
  select 6, 'no confirm_proforma/expire_reservation source references payments or notification_events (M5a steps dropped)',
    pg_get_functiondef('public.confirm_proforma(uuid,uuid)'::regprocedure) !~* 'payments|notification_events|emit_notification_event'
      and pg_get_functiondef('public.expire_reservation(uuid)'::regprocedure) !~* 'payments|notification_events|emit_notification_event'
      and pg_get_functiondef('public.commerce_release_reservation(uuid)'::regprocedure) !~* 'payments|notification_events|emit_notification_event'
  union all
  select 7, 'reservation lock order matches data-model.md §8 (offers ascending then positions ascending, by source text)',
    position('order by pii.offer_id' in pg_get_functiondef('public.confirm_proforma(uuid,uuid)'::regprocedure)) > 0
      and position('order by ip.id' in pg_get_functiondef('public.confirm_proforma(uuid,uuid)'::regprocedure)) >
          position('order by pii.offer_id' in pg_get_functiondef('public.confirm_proforma(uuid,uuid)'::regprocedure))
)
select ordinal, invariant, passed from checks order by ordinal;
