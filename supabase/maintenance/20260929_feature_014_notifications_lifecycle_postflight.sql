-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Postflight Verification: Feature 014 Notifications Lifecycle
-- Migration: 20260929100000_feature_014_notifications_lifecycle.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- Check 1: Partial unread index exists on public.notifications
select
  case
    when count(*) = 1 then 'PASS: idx_notifications_unread exists'
    else 'FAIL: idx_notifications_unread missing'
  end as check_1_index
from pg_indexes
where schemaname = 'public'
  and tablename = 'notifications'
  and indexname = 'idx_notifications_unread';

-- Check 2: mark_notification_read exists, is SECURITY DEFINER, and has search_path set
select
  case
    when count(*) = 1 then 'PASS: mark_notification_read function valid'
    else 'FAIL: mark_notification_read function invalid'
  end as check_2_mark_read
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'mark_notification_read'
  and p.prosecdef = true
  and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public%';

-- Check 3: mark_all_notifications_read exists, is SECURITY DEFINER, and has search_path set
select
  case
    when count(*) = 1 then 'PASS: mark_all_notifications_read function valid'
    else 'FAIL: mark_all_notifications_read function invalid'
  end as check_3_mark_all_read
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'mark_all_notifications_read'
  and p.prosecdef = true
  and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public%';

-- Check 4: get_unread_notification_count exists, is SECURITY DEFINER, and has search_path set
select
  case
    when count(*) = 1 then 'PASS: get_unread_notification_count function valid'
    else 'FAIL: get_unread_notification_count function invalid'
  end as check_4_unread_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_unread_notification_count'
  and p.prosecdef = true
  and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public%';

-- Check 5: trg_notify_order_status_change trigger attached to orders
select
  case
    when count(*) = 1 then 'PASS: trg_notify_order_status_change exists on public.orders'
    else 'FAIL: trg_notify_order_status_change missing'
  end as check_5_order_trigger
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'orders'
  and t.tgname = 'trg_notify_order_status_change';

-- A SELECT returning 'FAIL' does not stop psql; make postflight a strict gate.
do $$
declare
  v_name text;
  v_oid oid;
  v_source text;
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and tablename = 'notifications' and indexname = 'idx_notifications_unread'
    and indexdef like '%WHERE (read_at IS NULL)%') then
    raise exception 'POSTFLIGHT FAILED: unread partial index missing';
  end if;
  foreach v_name in array array['mark_notification_read','mark_all_notifications_read','get_unread_notification_count'] loop
    select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_name and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog, public'];
    if v_oid is null then raise exception 'POSTFLIGHT FAILED: % missing or unhardened', v_name; end if;
    if has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_oid, 'EXECUTE')
       or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
      raise exception 'POSTFLIGHT FAILED: % execution grants incorrect', v_name;
    end if;
  end loop;
  select p.prosrc into v_source from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'commerce_notify_order_status_change';
  if v_source is null or v_source not like '%BANK_TRANSFER_V1%'
     or v_source not like '%PROFORMA_ISSUED%'
     or v_source not like '%HOLD%'
     or v_source not like '%EXPIRED%'
     or v_source like '%PAYMENT_PROOF_SUBMITTED%'
     or v_source like '%SETTLEMENT%' then
    raise exception 'POSTFLIGHT FAILED: order notification event scope incorrect';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'orders'
      and t.tgname = 'trg_notify_order_status_change' and t.tgenabled <> 'D') then
    raise exception 'POSTFLIGHT FAILED: order notification trigger missing';
  end if;
end;
$$;
