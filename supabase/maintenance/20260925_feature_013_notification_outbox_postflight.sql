-- Read-only postflight for 20260925115000_feature_013_notification_outbox.sql (Feature 013 M2e, T054).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED' (13 rows). Run right after the apply:
--   npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_notification_outbox_postflight.sql
with emitter(oid) as (
  select to_regprocedure('public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)')::oid
),
checks(seq, check_name, ok) as (
  select 1, 'notification_events: the §6.1 columns (16)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notification_events') = 16
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'notification_events'
           and column_name in ('id', 'event_type', 'aggregate_type', 'aggregate_id', 'dedupe_key', 'audience', 'template_key', 'params', 'status',
                               'attempts', 'next_attempt_at', 'claimed_at', 'claimed_by', 'processed_at', 'last_error', 'created_at')) = 16
  union all
  select 2, 'UNIQUE(event_type, aggregate_id, dedupe_key); queue index (status, next_attempt_at)',
    (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.notification_events'::regclass and conname = 'notification_events_dedupe_key')
      = 'UNIQUE (event_type, aggregate_id, dedupe_key)'
    and (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = to_regclass('public.idx_notification_events_queue'))
      = 'CREATE INDEX idx_notification_events_queue ON public.notification_events USING btree (status, next_attempt_at)'
  union all
  select 3, 'status {PENDING, PROCESSING, PROCESSED, FAILED} default PENDING; attempts >= 0 default 0',
    coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
              where c.conrelid = 'public.notification_events'::regclass and c.conname = 'notification_events_status_check')
             = array['FAILED', 'PENDING', 'PROCESSED', 'PROCESSING'], false)
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notification_events'
                and column_name = 'status' and column_default = '''PENDING''::text')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'notification_events'
                and column_name = 'attempts' and column_default = '0')
  union all
  select 4, 'catalogue CHECKs: 17 event types, 18 template keys, 7 aggregate types',
    (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
       where c.conrelid = 'public.notification_events'::regclass and c.conname = 'notification_events_event_type_check') = 17
    and (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
           where c.conrelid = 'public.notification_events'::regclass and c.conname = 'notification_events_template_key_check') = 18
    and (select count(*) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
           where c.conrelid = 'public.notification_events'::regclass and c.conname = 'notification_events_aggregate_type_check') = 7
  union all
  select 5, 'params allow-list + scalar-only CHECK; audience object; dedupe/claim/error length and lifecycle CHECKs',
    (select count(*) from pg_constraint where conrelid = 'public.notification_events'::regclass
       and conname in ('notification_events_params_check', 'notification_events_audience_check', 'notification_events_dedupe_key_check',
                       'notification_events_attempts_check', 'notification_events_claimed_by_check', 'notification_events_last_error_check',
                       'notification_events_claim_pair_check', 'notification_events_lifecycle_check')) = 8
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.notification_events'::regclass and conname = 'notification_events_params_check')
        like '%order_code%proforma_code%case_code%shipment_code%status_key%deadline%amount%currency%'
  union all
  select 6, 'RLS enabled + forced; no policy',
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.notification_events'::regclass)
    and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_events')
  union all
  select 7, 'no client role can read or write the outbox: anon, authenticated, service_role and PUBLIC hold no privilege',
    not exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) r
                where has_table_privilege(r, 'public.notification_events', 'select, insert, update, delete, truncate, references, trigger'))
    and not exists (select 1 from unnest(coalesce((select relacl from pg_class where oid = 'public.notification_events'::regclass), '{}'::aclitem[])) a
                    where a::text like '=%')
    and not exists (select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = 'notification_events'
                    and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC'))
  union all
  select 8, 'emit_notification_event: exists, SECURITY INVOKER, search_path pinned, returns uuid',
    (select oid from emitter) is not null
    and not (select prosecdef from pg_proc where oid = (select oid from emitter))
    and exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = (select oid from emitter) and c like 'search_path=%')
    and (select prorettype from pg_proc where oid = (select oid from emitter)) = 'uuid'::regtype
  union all
  select 9, 'emit_notification_event: no EXECUTE for anon, authenticated, service_role or PUBLIC (internal only)',
    not has_function_privilege('anon', (select oid from emitter), 'execute')
    and not has_function_privilege('authenticated', (select oid from emitter), 'execute')
    and not has_function_privilege('service_role', (select oid from emitter), 'execute')
    and not exists (select 1 from pg_proc p, unnest(coalesce(p.proacl, acldefault('f', p.proowner))) a
                    where p.oid = (select oid from emitter) and a::text like '=%')
  union all
  select 10, 'emit_notification_event: INSERT … ON CONFLICT (event_type, aggregate_id, dedupe_key) DO NOTHING',
    (select prosrc from pg_proc where oid = (select oid from emitter)) like '%on conflict (event_type, aggregate_id, dedupe_key) do nothing%'
  union all
  select 11, 'identity/content immutability trigger (protect_notification_event, BEFORE UPDATE, enabled)',
    exists (select 1 from pg_trigger where tgrelid = 'public.notification_events'::regclass and tgname = 'trg_notification_events_immutable'
            and tgfoid = 'public.protect_notification_event()'::regprocedure and tgenabled = 'O')
    and not has_function_privilege('anon', 'public.protect_notification_event()', 'execute')
  union all
  select 12, 'the outbox is empty; nothing else calls the emitter yet; no delivery/claim function or cron job',
    not exists (select 1 from public.notification_events)
    and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                    and p.proname not in ('emit_notification_event', 'protect_notification_event')
                    and (p.prosrc like '%emit_notification_event%' or p.prosrc like '%notification_events%'))
    and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                    and p.proname in ('process_notification_events', 'claim_notification_deliveries', 'complete_notification_delivery', 'dispatch_due_campaigns', 'admin_process_outbox_now'))
  union all
  select 13, 'M1–M2d untouched: validate_order_transition v2, prevent_snapshot_mutation (M2b), M2c/M2d tables present; checkout disabled',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.prevent_snapshot_mutation()'::regprocedure) = '286e02091213c1be4236b144dff1f383'
    and to_regclass('public.reconciliation_cases') is not null and to_regclass('public.promotions') is not null
    and to_regclass('public.offer_price_tiers') is not null
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
