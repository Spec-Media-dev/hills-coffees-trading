-- Feature 008 T009/T011/T017 — READ-ONLY POSTFLIGHT for
-- supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql.
--
-- Run ONLY AFTER the migration has been applied. Performs NO writes (catalog + count reads only). Safe
-- to run any number of times. The Supabase SQL Editor shows the LAST statement's result — every row of
-- the summary must report ok = true.
--
-- What this CANNOT prove (per-session RLS/idempotency behaviour under real authenticated sessions,
-- concurrency): that is `F008_LIVE_PROOF=1 npx vitest run tests/finance`, run separately with real
-- fixture sessions once this postflight is all-green.

with checks(check_name, ok, detail) as (
  select 'payments.trusted_funding_confirmed_at/trusted_funding_event_id exist, nullable',
         (select count(*) = 2 and bool_and(is_nullable = 'YES')
            from information_schema.columns
            where table_schema = 'public' and table_name = 'payments'
              and column_name in ('trusted_funding_confirmed_at', 'trusted_funding_event_id')),
         (select string_agg(column_name || ':' || data_type || ':' || is_nullable, ', ')
            from information_schema.columns
            where table_schema = 'public' and table_name = 'payments'
              and column_name in ('trusted_funding_confirmed_at', 'trusted_funding_event_id'))
  union all
  select 'payments.trusted_funding_event_id FK -> payment_events(id) exists',
         exists (select 1 from pg_constraint where conname = 'payments_trusted_funding_event_id_fkey'), ''
  union all
  select 'payment_events.provider / external_event_id are NOT NULL',
         (select bool_and(is_nullable = 'NO') from information_schema.columns
            where table_schema = 'public' and table_name = 'payment_events' and column_name in ('provider', 'external_event_id')),
         (select string_agg(column_name || ':' || is_nullable, ', ') from information_schema.columns
            where table_schema = 'public' and table_name = 'payment_events' and column_name in ('provider', 'external_event_id'))
  union all
  select 'payment_events_provider_external_event_id_key still enforces dedupe',
         exists (select 1 from pg_constraint where conname = 'payment_events_provider_external_event_id_key'), ''
  union all
  select 'table payment_transfers exists', to_regclass('public.payment_transfers') is not null, coalesce(to_regclass('public.payment_transfers')::text, 'missing')
  union all
  select 'payment_transfers: exactly the 7 expected columns, with expected types/nullability',
         (select count(*) = 7
            and bool_and(
              case column_name
                when 'id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'payment_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'payout_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'provider_transfer_id' then data_type = 'text' and is_nullable = 'NO'
                when 'transfer_group' then data_type = 'text' and is_nullable = 'NO'
                when 'idempotency_key' then data_type = 'text' and is_nullable = 'NO'
                when 'created_at' then data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default like 'now()%'
                else false
              end)
            from information_schema.columns where table_schema = 'public' and table_name = 'payment_transfers'),
         (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'payment_transfers')
  union all
  select 'payment_transfers.payout_id is UNIQUE (one transfer per payout, enforced at DB level)',
         exists (select 1 from pg_constraint where conname = 'payment_transfers_payout_id_key' and contype = 'u'), ''
  union all
  select 'payment_transfers.provider_transfer_id and idempotency_key are each UNIQUE',
         exists (select 1 from pg_constraint where conname = 'payment_transfers_provider_transfer_id_key' and contype = 'u')
           and exists (select 1 from pg_constraint where conname = 'payment_transfers_idempotency_key_key' and contype = 'u'), ''
  union all
  select 'RLS enabled on payment_transfers',
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.payment_transfers')), false), ''
  union all
  select 'exactly two policies on payment_transfers: view (seller-org-via-payout / platform-admin) + finance (ALL)',
         (select count(*) = 2 from pg_policies where schemaname = 'public' and tablename = 'payment_transfers')
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_transfers' and policyname = 'payment_transfers_view' and cmd = 'SELECT' and qual ilike '%is_org_member%' and qual ilike '%is_platform_admin%')
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_transfers' and policyname = 'payment_transfers_finance' and cmd = 'ALL' and qual ilike '%is_finance_operator%'),
         (select string_agg(policyname || ':' || cmd, ', ') from pg_policies where schemaname = 'public' and tablename = 'payment_transfers')
  union all
  select 'authenticated holds SELECT only on payment_transfers',
         (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'payment_transfers' and grantee = 'authenticated'),
         (select string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema = 'public' and table_name = 'payment_transfers' and grantee = 'authenticated')
  union all
  select 'anon holds NO privilege on payment_transfers',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'payment_transfers' and grantee = 'anon'), ''
  union all
  select 'service_role holds NO write privilege on payment_transfers (append-only via record_payment_transfer() only)',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'payment_transfers' and grantee = 'service_role' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), ''
  union all
  select 'function ingest_stripe_event exists, SECURITY DEFINER, service_role-only EXECUTE',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ingest_stripe_event' and p.prosecdef)
           and (select coalesce(array_agg(grantee::text order by grantee) = array['service_role'], false)
                  from information_schema.role_routine_grants
                  where routine_schema = 'public' and routine_name = 'ingest_stripe_event' and privilege_type = 'EXECUTE'),
         (select string_agg(grantee, ',') from information_schema.role_routine_grants where routine_schema = 'public' and routine_name = 'ingest_stripe_event' and privilege_type = 'EXECUTE')
  union all
  select 'function record_stripe_payment_intent exists, SECURITY DEFINER, EXECUTE for authenticated+service_role only',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_stripe_payment_intent' and p.prosecdef)
           and (select coalesce(array_agg(grantee::text order by grantee) = array['authenticated', 'service_role'], false)
                  from information_schema.role_routine_grants
                  where routine_schema = 'public' and routine_name = 'record_stripe_payment_intent' and privilege_type = 'EXECUTE'),
         (select string_agg(grantee, ',') from information_schema.role_routine_grants where routine_schema = 'public' and routine_name = 'record_stripe_payment_intent' and privilege_type = 'EXECUTE')
  union all
  select 'function record_payment_transfer exists, SECURITY DEFINER, EXECUTE for authenticated+service_role only',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'record_payment_transfer' and p.prosecdef)
           and (select coalesce(array_agg(grantee::text order by grantee) = array['authenticated', 'service_role'], false)
                  from information_schema.role_routine_grants
                  where routine_schema = 'public' and routine_name = 'record_payment_transfer' and privilege_type = 'EXECUTE'),
         (select string_agg(grantee, ',') from information_schema.role_routine_grants where routine_schema = 'public' and routine_name = 'record_payment_transfer' and privilege_type = 'EXECUTE')
  union all
  select 'admin_review_payment() still SECURITY DEFINER with the same signature, and now carries the trusted_funding_required precondition',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'admin_review_payment' and p.prosecdef
                     and pg_get_function_identity_arguments(p.oid) = 'p_payment_id uuid, p_approved boolean, p_reason text'
                     and p.prosrc like '%trusted_funding_required%'
                     and p.prosrc like '%active_reservation_missing%'),
         ''
  union all
  select 'admin_review_payment() EXECUTE unchanged: authenticated only (not anon, not public)',
         (select coalesce(array_agg(grantee::text order by grantee) = array['authenticated'], false)
            from information_schema.role_routine_grants
            where routine_schema = 'public' and routine_name = 'admin_review_payment' and privilege_type = 'EXECUTE'),
         (select string_agg(grantee, ',') from information_schema.role_routine_grants where routine_schema = 'public' and routine_name = 'admin_review_payment' and privilege_type = 'EXECUTE')
  union all
  select 'zero existing payment_transfers rows reference a payout whose payment lacks trusted funding (integrity, not just at insert time)',
         not exists (
           select 1 from public.payment_transfers pt
           join public.payments pm on pm.id = pt.payment_id
           where pm.trusted_funding_confirmed_at is null
         ), ''
  union all
  select 'zero payment_events rows have a null provider or external_event_id (NOT NULL holding under real traffic, if any exists yet)',
         not exists (select 1 from public.payment_events where provider is null or external_event_id is null), ''
)
select
  check_name,
  ok,
  detail,
  case when bool_and(ok) over () then 'ALL CHECKS PASSED' else 'AT LEAST ONE CHECK FAILED — DO NOT PROCEED' end as overall_status
from checks
order by check_name;
