-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback: Feature 014 Notifications Lifecycle
-- Target:   supabase/migrations/20260929100000_feature_014_notifications_lifecycle.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists trg_notify_order_status_change on public.orders;
drop function if exists public.commerce_notify_order_status_change();

drop function if exists public.mark_notification_read(uuid);
drop function if exists public.mark_all_notifications_read();
drop function if exists public.get_unread_notification_count();

drop index if exists public.idx_notifications_unread;

commit;
