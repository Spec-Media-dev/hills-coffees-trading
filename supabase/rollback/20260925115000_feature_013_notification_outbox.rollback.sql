-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925115000_feature_013_notification_outbox.sql (Feature 013 M2e).
-- Removes exactly what M2e added: notification_events (with its index, immutability trigger and constraints),
-- protect_notification_event() and emit_notification_event(). No object that existed before M2e is altered
-- (M1–M2d stay applied).
-- Safe ONLY before any event is queued: the guard refuses (changing nothing) while any outbox row exists, while any other
-- function body references emit_notification_event / notification_events (a caller from M3+), or while a later Feature 013
-- migration is applied (roll those back first).
-- After running it: `supabase migration repair --status reverted 20260925115000` (OPERATOR); the M2e postflight is then
-- expected to FAIL and the M2d postflight to pass again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
  v_has_rows boolean;
begin
  if to_regclass('public.notification_events') is null
     or to_regprocedure('public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)') is null then
    v_problems := v_problems || 'M2e is not applied (notification_events or emit_notification_event missing); ';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('is_order_buyer_member', 'is_order_line_seller', 'order_seller_org_ids',
                                                          'validate_promotion_scope', 'upsert_seller_promotion', 'upsert_platform_promotion',
                                                          'compute_order_quote')) then
    v_problems := v_problems || 'a later Feature 013 migration (M3+) is still applied; ';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname not in ('emit_notification_event', 'protect_notification_event')
               and (p.prosrc like '%emit_notification_event%' or p.prosrc like '%notification_events%')) then
    v_problems := v_problems || 'another function references the outbox; ';
  end if;
  if exists (select 1 from pg_views where schemaname = 'public' and definition like '%notification_events%') then
    v_problems := v_problems || 'a view references the outbox; ';
  end if;
  if to_regclass('public.notification_events') is not null then
    execute 'select exists (select 1 from public.notification_events)' into v_has_rows;
    if v_has_rows then
      v_problems := v_problems || 'an outbox event exists; ';
    end if;
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_notification_outbox rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

drop table public.notification_events;
drop function public.protect_notification_event();
drop function public.emit_notification_event(text, text, uuid, text, jsonb, text, jsonb);

commit;
