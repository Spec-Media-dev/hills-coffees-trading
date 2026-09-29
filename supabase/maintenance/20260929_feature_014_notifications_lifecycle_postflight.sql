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
