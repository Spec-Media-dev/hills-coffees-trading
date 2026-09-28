-- Feature 013 stock/inventory reservation rollback. Never run while any reservation is ACTIVE: dropping these
-- functions would strand it with no way to expire or release it (research.md R-9's expiry paths ARE these functions).
begin;

do $guard$
begin
  if exists (select 1 from public.inventory_reservations where status = 'ACTIVE') then
    raise exception 'feature_013_reservation_rollback_requires_no_active_reservation';
  end if;
end;
$guard$;

drop function public.sweep_expired_reservations(int);
drop function public.expire_reservation(uuid);
drop function public.confirm_proforma(uuid, uuid);
drop function public.commerce_release_reservation(uuid);

commit;
