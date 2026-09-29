-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 014 (Sprint 2) — In-App Notifications Read Lifecycle & Event Trigger
-- Rollback:  supabase/rollback/20260929100000_feature_014_notifications_lifecycle.rollback.sql
-- Postflight: supabase/maintenance/20260929_feature_014_notifications_lifecycle_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT:
--   1. Partial index on public.notifications (user_id) WHERE read_at IS NULL for fast badge queries.
--   2. SECURITY DEFINER RPC public.mark_notification_read(p_notification_id uuid) returns boolean.
--   3. SECURITY DEFINER RPC public.mark_all_notifications_read() returns integer.
--   4. SECURITY DEFINER RPC public.get_unread_notification_count() returns integer.
--   5. Execution grants restricted to authenticated; revoked from public, anon, service_role.
--   6. Trigger trg_notify_order_status_change firing strictly on PROFORMA_ISSUED, HOLD, and EXPIRED.
--
-- SECURITY INVARIANTS:
--   - Hardened SET search_path = pg_catalog, public.
--   - auth.uid() derived internally; callers cannot supply an arbitrary target user_id.
--   - Mutations strictly confined to read_at on own rows (user_id = auth.uid()).
--   - Zero notification events for cancelled workflows (no M5a/M5b/Feature 009/M9/Stripe).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 1. Partial index on unread notifications ----------------------------------------------------
create index if not exists idx_notifications_unread
  on public.notifications (user_id)
  where read_at is null;

-- 2. RPC: Mark one notification as read -------------------------------------------------------
create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.notifications
  set read_at = coalesce(read_at, clock_timestamp())
  where id = p_notification_id
    and user_id = auth.uid()
    and read_at is null;

  return found;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated;

-- 3. RPC: Mark all unread notifications as read -----------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  with updated as (
    update public.notifications
    set read_at = clock_timestamp()
    where user_id = auth.uid()
      and read_at is null
    returning 1
  )
  select count(*)::integer into v_count from updated;

  return v_count;
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- 4. RPC: Get unread notification count -------------------------------------------------------
create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.get_unread_notification_count() from public, anon, service_role;
grant execute on function public.get_unread_notification_count() to authenticated;

-- 5. Trigger: Order status commercial milestone in-app notification ---------------------------
create or replace function public.commerce_notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_title text;
  v_body text;
  v_type text;
begin
  if new.status is not distinct from old.status or new.commerce_flow is distinct from 'BANK_TRANSFER_V1' then
    return new;
  end if;

  if new.status = 'PROFORMA_ISSUED' then
    v_type := 'ORDER_PROFORMA_ISSUED';
    v_title := 'Proforma Invoice Issued';
    v_body := 'A proforma invoice has been generated for order ' || new.order_code;
  elsif new.status = 'HOLD' then
    v_type := 'RESERVATION_CONFIRMED';
    v_title := 'Stock Reservation Confirmed';
    v_body := 'Inventory reserved for 20 minutes for order ' || new.order_code;
  elsif new.status = 'EXPIRED' then
    v_type := 'RESERVATION_EXPIRED';
    v_title := 'Stock Reservation Expired';
    v_body := 'The reservation window for order ' || new.order_code || ' has expired';
  else
    return new;
  end if;

  insert into public.notifications(
    user_id,
    organization_id,
    notification_type,
    title,
    body,
    entity_type,
    entity_id
  ) values (
    new.created_by,
    new.buyer_organization_id,
    v_type,
    v_title,
    v_body,
    'orders',
    new.id
  );

  return new;
end;
$$;

revoke all on function public.commerce_notify_order_status_change() from public, anon, authenticated, service_role;

drop trigger if exists trg_notify_order_status_change on public.orders;
create trigger trg_notify_order_status_change
  after update of status on public.orders
  for each row
  execute function public.commerce_notify_order_status_change();

commit;
