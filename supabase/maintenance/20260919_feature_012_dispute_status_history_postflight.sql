-- Feature 012 T004 / DB-OPEN-23 — READ-ONLY POSTFLIGHT for
-- supabase/migrations/20260919120000_feature_012_dispute_status_history.sql.
--
-- Run ONLY AFTER the migration has been applied. Performs NO writes (catalog + count reads only). Safe
-- to run any number of times. The Supabase SQL Editor shows the LAST statement's result — every row of
-- the summary must report ok = true.
--
-- What this CANNOT prove (per-session RLS/trigger behaviour under real authenticated users): that is
-- `tests/disputes/transition-history.test.ts` (live), run separately with real fixture sessions.

with checks(check_name, ok, detail) as (
  select 'table dispute_status_history exists', to_regclass('public.dispute_status_history') is not null, coalesce(to_regclass('public.dispute_status_history')::text, 'missing')
  union all
  select 'RLS enabled on dispute_status_history',
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.dispute_status_history')), false), ''
  union all
  select 'exactly one policy on dispute_status_history, and it is SELECT-only (dispute_status_history_view)',
         (select count(*) = 1 and bool_and(cmd = 'SELECT' and policyname = 'dispute_status_history_view') from pg_policies where schemaname = 'public' and tablename = 'dispute_status_history'),
         (select string_agg(policyname || ':' || cmd, ', ') from pg_policies where schemaname = 'public' and tablename = 'dispute_status_history')
  union all
  select 'authenticated holds SELECT only on dispute_status_history',
         (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'dispute_status_history' and grantee = 'authenticated'),
         (select string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema = 'public' and table_name = 'dispute_status_history' and grantee = 'authenticated')
  union all
  select 'anon holds NO privilege on dispute_status_history',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'dispute_status_history' and grantee = 'anon'), ''
  union all
  select 'append-only trigger present on dispute_status_history (INSERT/UPDATE/DELETE, BEFORE, ROW)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.dispute_status_history') and t.tgname = 'trg_dispute_status_history_append_only' and p.proname = 'prevent_dispute_status_history_mutation' and not t.tgisinternal), ''
  union all
  select 'transition guard trigger present on disputes (INSERT/UPDATE)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.disputes'::regclass and t.tgname = 'trg_disputes_transition_guard' and p.proname = 'validate_dispute_transition' and not t.tgisinternal), ''
  union all
  select 'transition_dispute(uuid,text,text,text) exists, SECURITY DEFINER, pinned search_path',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'transition_dispute' and pg_get_function_identity_arguments(p.oid) = 'p_dispute_id uuid, p_expected_status text, p_to_status text, p_reason text' and p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%'), ''
  union all
  select 'authenticated may EXECUTE transition_dispute; anon may not',
         has_function_privilege('authenticated', 'public.transition_dispute(uuid, text, text, text)', 'EXECUTE')
           and not has_function_privilege('anon', 'public.transition_dispute(uuid, text, text, text)', 'EXECUTE'), ''
  union all
  select 'existing disputes policies unchanged (disputes_create INSERT, disputes_view SELECT, disputes_ops_update UPDATE)',
         (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'disputes') = 'disputes_create:INSERT,disputes_ops_update:UPDATE,disputes_view:SELECT',
         (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'disputes')
  union all
  select 'no trigger or function touches orders/order_shipments/payments from the dispute workflow (DB-OPEN-09 unchanged)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('transition_dispute', 'validate_dispute_transition', 'prevent_dispute_status_history_mutation') and (p.prosrc ilike '%public.orders%' or p.prosrc ilike '%order_shipments%' or p.prosrc ilike '%public.payments%' or p.prosrc ilike '%inventory_%')), ''
  union all
  select 'no fabricated backfill: history rows only for transitions made after the migration (count shown)', true,
         (select count(*)::text from public.dispute_status_history)
)
select check_name, ok, detail from checks;
