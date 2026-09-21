-- Feature 005 T014 / DB-OPEN-19 — READ-ONLY POSTFLIGHT for
-- supabase/migrations/20260921120000_feature_005_db_open_19_inventory_variance_hold.sql.
--
-- Run ONLY AFTER the migration has been applied. Performs NO writes (catalog + count reads only). Safe to run any
-- number of times. The Supabase SQL Editor shows the LAST statement's result — every row of the summary must
-- report ok = true.
--
-- What this CANNOT prove (per-session RLS / trigger behaviour under real authenticated users, concurrency): that is
-- `F005_LIVE_PROOF=1 npx vitest run tests/inventory` (live), run separately with real fixture sessions.

with checks(check_name, ok, detail) as (
  select 'table inventory_variance_events exists', to_regclass('public.inventory_variance_events') is not null, coalesce(to_regclass('public.inventory_variance_events')::text, 'missing')
  union all
  select 'columns: exactly the 15 expected, with expected types/nullability/defaults',
         (select count(*) = 15
            and bool_and(
              case column_name
                when 'id' then data_type = 'uuid' and is_nullable = 'NO' and column_default like 'gen_random_uuid()%'
                when 'event_type' then data_type = 'text' and is_nullable = 'NO'
                when 'variance_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'inventory_position_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'warehouse_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'kind' then data_type = 'text' and is_nullable = 'NO'
                when 'recorded_quantity_kg' then data_type = 'numeric' and is_nullable = 'NO'
                when 'counted_quantity_kg' then data_type = 'numeric' and is_nullable = 'NO'
                when 'variance_quantity_kg' then data_type = 'numeric' and is_generated = 'ALWAYS'
                when 'outcome' then data_type = 'text' and is_nullable = 'YES'
                when 'resolved_quantity_kg' then data_type = 'numeric' and is_nullable = 'YES'
                when 'reason' then data_type = 'text' and is_nullable = 'NO'
                when 'actor_user_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'correlation_id' then data_type = 'uuid' and is_nullable = 'NO'
                when 'created_at' then data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default like 'now()%'
                else false
              end)
            from information_schema.columns where table_schema = 'public' and table_name = 'inventory_variance_events'),
         (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'inventory_variance_events')
  union all
  select 'RLS enabled on inventory_variance_events',
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.inventory_variance_events')), false), ''
  union all
  select 'exactly one policy, SELECT-only (inventory_variance_events_view), warehouse operators + auditors only (no member clause — H3)',
         (select count(*) = 1 and bool_and(cmd = 'SELECT' and policyname = 'inventory_variance_events_view' and qual ilike '%is_warehouse_operator%' and qual ilike '%is_auditor%' and qual not ilike '%is_org_member%' and qual not ilike '%inventory_positions%') from pg_policies where schemaname = 'public' and tablename = 'inventory_variance_events'),
         (select string_agg(policyname || ':' || cmd, ', ') from pg_policies where schemaname = 'public' and tablename = 'inventory_variance_events')
  union all
  select 'authenticated holds SELECT only on inventory_variance_events',
         (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_variance_events' and grantee = 'authenticated'),
         (select string_agg(privilege_type, ',') from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_variance_events' and grantee = 'authenticated')
  union all
  select 'anon holds NO privilege on inventory_variance_events, inventory_position_holds, inventory_position_hold_notices or inventory_open_cases',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('inventory_variance_events', 'inventory_position_holds', 'inventory_position_hold_notices', 'inventory_open_cases') and grantee = 'anon'), ''
  union all
  select 'service_role holds NO write privilege on inventory_variance_events (SELECT only) — nothing can rewrite the history (H2)',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_variance_events' and grantee = 'service_role' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')), ''
  union all
  select 'view inventory_position_holds (operators + auditors): owner-run + security_barrier, filtered by is_warehouse_operator / is_auditor, SELECT for authenticated only',
         coalesce((select 'security_barrier=true' = any (c.reloptions) and not ('security_invoker=true' = any (c.reloptions)) from pg_class c where c.oid = to_regclass('public.inventory_position_holds')), false)
           and (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_position_holds' and grantee = 'authenticated')
           and pg_get_viewdef('public.inventory_position_holds'::regclass) ilike '%is_warehouse_operator%' and pg_get_viewdef('public.inventory_position_holds'::regclass) ilike '%is_auditor%',
         (select array_to_string(c.reloptions, ',') from pg_class c where c.oid = to_regclass('public.inventory_position_holds'))
  union all
  select 'INTERNAL view inventory_open_cases (the one definition of open): exists and NO client role (authenticated / anon / PUBLIC) holds any privilege on it',
         to_regclass('public.inventory_open_cases') is not null
           and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_open_cases' and grantee in ('authenticated', 'anon', 'PUBLIC')),
         coalesce(to_regclass('public.inventory_open_cases')::text, 'missing')
  union all
  select 'member view inventory_position_hold_notices: owner-run + security_barrier, SELECT for authenticated only, and NO reason / actor / correlation column (H3)',
         coalesce((select 'security_barrier=true' = any (c.reloptions) and not ('security_invoker=true' = any (c.reloptions)) from pg_class c where c.oid = to_regclass('public.inventory_position_hold_notices')), false)
           and (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'inventory_position_hold_notices' and grantee = 'authenticated')
           and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inventory_position_hold_notices' and column_name in ('reason', 'actor_user_id', 'correlation_id')),
         (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'inventory_position_hold_notices')
  union all
  select 'both history foreign keys are ON DELETE RESTRICT — a position with case history cannot be deleted (H2)',
         (select count(*) = 2 and bool_and(c.confdeltype = 'r') from pg_constraint c where c.conrelid = to_regclass('public.inventory_variance_events') and c.contype = 'f' and c.confrelid in (to_regclass('public.inventory_variance_events'), to_regclass('public.inventory_positions'))),
         (select string_agg(c.conname || ':' || c.confdeltype::text, ',') from pg_constraint c where c.conrelid = to_regclass('public.inventory_variance_events') and c.contype = 'f')
  union all
  select 'TRUNCATE is refused by a statement-level trigger on inventory_variance_events (H2)',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.inventory_variance_events') and t.tgname = 'trg_inventory_variance_events_no_truncate' and t.tgtype & 32 = 32 and not t.tgisinternal), ''
  union all
  select 'authenticated can no longer INSERT / UPDATE / DELETE inventory_positions but can still SELECT it (H1); service_role is unchanged',
         not has_table_privilege('authenticated', 'public.inventory_positions', 'INSERT')
           and not has_table_privilege('authenticated', 'public.inventory_positions', 'UPDATE')
           and not has_table_privilege('authenticated', 'public.inventory_positions', 'DELETE')
           and has_table_privilege('authenticated', 'public.inventory_positions', 'SELECT')
           and has_table_privilege('service_role', 'public.inventory_positions', 'UPDATE'), ''
  union all
  select 'every public function that writes inventory_positions is SECURITY DEFINER (so revoking the raw grants broke none of them) (H1)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not p.prosecdef and p.prosrc ~* '(update|insert\s+into)\s+(public\.)?inventory_positions'),
         (select coalesce(string_agg(p.proname, ','), 'none') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and not p.prosecdef and p.prosrc ~* '(update|insert\s+into)\s+(public\.)?inventory_positions')
  union all
  select 'single-resolution unique index present (one RESOLVED row per case)',
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'inventory_variance_events_single_resolution_idx' and indexdef ilike '%unique%' and indexdef ilike '%event_type%RESOLVED%'), ''
  union all
  select 'the 10 check constraints present (event_type, kind, outcome, 3x quantity, reason, shape, kind_quantities, adjusted)',
         (select count(*) = 10 from pg_constraint c where c.conrelid = to_regclass('public.inventory_variance_events') and c.contype = 'c' and c.conname like 'inventory_variance_events\_%\_check' escape '\'),
         (select string_agg(conname, ',' order by conname) from pg_constraint c where c.conrelid = to_regclass('public.inventory_variance_events') and c.contype = 'c')
  union all
  select 'append-only trigger present on inventory_variance_events (INSERT/UPDATE/DELETE, BEFORE, ROW)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.inventory_variance_events') and t.tgname = 'trg_inventory_variance_events_append_only' and p.proname = 'prevent_inventory_variance_mutation' and t.tgtype & 2 = 2 and t.tgtype & 4 = 4 and t.tgtype & 8 = 8 and t.tgtype & 16 = 16 and not t.tgisinternal), ''
  union all
  select 'audit trigger present on inventory_variance_events (AFTER INSERT)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.inventory_variance_events') and t.tgname = 'trg_audit_inventory_variance_events' and p.proname = 'write_audit_log' and not t.tgisinternal), ''
  union all
  select 'hold guard on inventory_positions (BEFORE UPDATE) and the 3 pre-existing triggers untouched',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.inventory_positions') and t.tgname = 'trg_inventory_positions_hold_guard' and p.proname = 'guard_inventory_position_hold' and t.tgtype & 2 = 2 and t.tgtype & 16 = 16 and not t.tgisinternal)
           and (select count(*) = 3 from pg_trigger t where t.tgrelid = to_regclass('public.inventory_positions') and not t.tgisinternal and t.tgname in ('trg_audit_inventory_positions', 'trg_inventory_location', 'trg_positions_updated_at')), ''
  union all
  select 'hold guard on coffee_offers (BEFORE INSERT OR UPDATE)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.coffee_offers') and t.tgname = 'trg_coffee_offers_inventory_hold_guard' and p.proname = 'guard_offer_inventory_hold' and t.tgtype & 2 = 2 and t.tgtype & 4 = 4 and t.tgtype & 16 = 16 and not t.tgisinternal), ''
  union all
  select 'hold guard on order_shipments (BEFORE UPDATE)',
         exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = to_regclass('public.order_shipments') and t.tgname = 'trg_order_shipments_inventory_hold_guard' and p.proname = 'guard_shipment_inventory_hold' and t.tgtype & 2 = 2 and t.tgtype & 16 = 16 and not t.tgisinternal), ''
  union all
  select 'all six new functions are SECURITY DEFINER with a pinned search_path',
         (select count(*) = 6 and bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like 'search_path=%')
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('record_inventory_variance', 'resolve_inventory_variance', 'guard_inventory_position_hold', 'guard_offer_inventory_hold', 'guard_shipment_inventory_hold', 'prevent_inventory_variance_mutation')),
         (select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('record_inventory_variance', 'resolve_inventory_variance', 'guard_inventory_position_hold', 'guard_offer_inventory_hold', 'guard_shipment_inventory_hold', 'prevent_inventory_variance_mutation'))
  union all
  select 'authenticated may EXECUTE the two operator functions; anon and PUBLIC may not',
         has_function_privilege('authenticated', 'public.record_inventory_variance(uuid, text, numeric, numeric, text)', 'EXECUTE')
           and has_function_privilege('authenticated', 'public.resolve_inventory_variance(uuid, text, text)', 'EXECUTE')
           and not has_function_privilege('anon', 'public.record_inventory_variance(uuid, text, numeric, numeric, text)', 'EXECUTE')
           and not has_function_privilege('anon', 'public.resolve_inventory_variance(uuid, text, text)', 'EXECUTE'), ''
  union all
  select 'no client can EXECUTE the trigger functions (no direct call path)',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('guard_inventory_position_hold', 'guard_offer_inventory_hold', 'guard_shipment_inventory_hold', 'prevent_inventory_variance_mutation')
             and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))
         ), ''
  union all
  select 'operator functions do not call service_role and touch no cache / no order / payment tables',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('record_inventory_variance', 'resolve_inventory_variance') and (p.prosrc ilike '%service_role%' or p.prosrc ilike '%public.orders%' or p.prosrc ilike '%public.payments%')), ''
  union all
  select 'pre-existing inventory policy rows unchanged (inventory_owner_read SELECT, inventory_warehouse_write ALL — the latter is now inert for writes because the privilege is revoked)',
         (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'inventory_positions') = 'inventory_owner_read:SELECT,inventory_warehouse_write:ALL',
         (select string_agg(policyname || ':' || cmd, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'inventory_positions')
  union all
  select 'pre-existing ownership-ledger append-only trigger unchanged',
         exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.inventory_ownership_events') and t.tgname = 'trg_ownership_events_append_only' and not t.tgisinternal), ''
  union all
  select 'no fabricated backfill: rows exist only for cases recorded after the migration (count shown — expected 0 immediately after apply)',
         true, (select count(*)::text from public.inventory_variance_events)
  union all
  select 'no position is currently non-actionable by accident (open cases shown — expected 0 right after apply)',
         true, (select count(*)::text from public.inventory_open_cases)
  union all
  select 'no null / broken required values in any existing row (vacuously true when empty)',
         not exists (select 1 from public.inventory_variance_events where reason is null or actor_user_id is null or correlation_id is null or kind is null or recorded_quantity_kg is null or counted_quantity_kg is null), ''
  union all
  select 'unrelated row counts visible for comparison with the pre-apply snapshot (positions / offers / shipments / ownership events)',
         true,
         (select 'positions=' || (select count(*) from public.inventory_positions) || ' offers=' || (select count(*) from public.coffee_offers) || ' shipments=' || (select count(*) from public.order_shipments) || ' ownership_events=' || (select count(*) from public.inventory_ownership_events))
)
select check_name, ok, detail from checks;
