-- Feature 007 DB blockers — READ-ONLY PREFLIGHT for 20260913100000_feature_007_db_blockers.sql.
--
-- Performs NO writes: SELECT statements over the system catalogs only (no INSERT/UPDATE/DELETE/DDL,
-- no GRANT/REVOKE, no set_config). Safe to run any number of times.
--
-- HOW TO READ IT: the Supabase SQL Editor shows the result of the LAST statement — the summary query
-- (section 3). Every row must report ok = true before the migration is applied. Any false row means the
-- live database differs from the baseline this migration was written against: STOP and send the rows
-- back so the migration can be revised. (The migration's own guard would abort in that case anyway.)
-- Sections 1 and 2 are optional detail queries: select and run each one on its own to see its result.

-- ============================================================================
-- 1. (optional detail) Current full definitions of the affected functions
-- ============================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('checkout_order', 'expire_order_hold', 'validate_offer_transition', 'update_order_item_quantity', 'remove_order_item')
order by p.proname;

-- ============================================================================
-- 2. (optional detail) coffee_offers UPDATE policies and table privileges
-- ============================================================================
select 'policy' as kind, pol.policyname as name, pol.cmd as command, array_to_string(pol.roles, ',') as roles, pol.qual as using_expression, pol.with_check
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename = 'coffee_offers' and pol.cmd in ('UPDATE', 'ALL')
union all
select 'table_privilege', g.grantee, g.privilege_type, null, null, null
from information_schema.role_table_grants g
where g.table_schema = 'public' and g.table_name = 'coffee_offers' and g.privilege_type = 'UPDATE'
order by 1, 2;

-- ============================================================================
-- 3. SUMMARY — every row must be ok = true
-- ============================================================================
with checks(check_name, ok, expected, actual) as (

  select 'checkout_order: exactly one overload with signature (p_order_id uuid)' as check_name,
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order') = 1
         and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid') as ok,
         '1 overload, (p_order_id uuid)' as expected,
         (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order') as actual
  union all
  select 'checkout_order: body matches the baseline this migration was written against',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid') = '22a0a7b060dd9b8687382d665eff8e56',
         '22a0a7b060dd9b8687382d665eff8e56',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all
  select 'checkout_order: SECURITY DEFINER with search_path pg_catalog, public, auth',
         (select p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid'),
         'prosecdef=true; search_path=pg_catalog, public, auth',
         (select 'prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all

  select 'expire_order_hold: exactly one overload with signature (p_order_id uuid)' as check_name,
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold') = 1
         and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid') as ok,
         '1 overload, (p_order_id uuid)' as expected,
         (select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold') as actual
  union all
  select 'expire_order_hold: body matches the baseline this migration was written against',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid') = 'b5b132f67e440555c0948a8ed4c50783',
         'b5b132f67e440555c0948a8ed4c50783',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all
  select 'expire_order_hold: SECURITY DEFINER with search_path pg_catalog, public, auth',
         (select p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid'),
         'prosecdef=true; search_path=pg_catalog, public, auth',
         (select 'prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all
  select 'validate_offer_transition: exactly one overload with no arguments',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition') = 1,
         '1 overload, ()',
         (select string_agg('(' || pg_get_function_identity_arguments(p.oid) || ')', ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition')
  union all
  select 'validate_offer_transition: body matches the baseline this migration was written against',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition') = '7c5180384b5f0948945bd87c7c168201',
         '7c5180384b5f0948945bd87c7c168201',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition')
  union all

  select 'checkout_order: EXECUTE ACL (no PUBLIC, no anon; authenticated + service_role)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid' and a.grantee = 0 and a.privilege_type = 'EXECUTE')
         and not has_function_privilege('anon', 'public.checkout_order(uuid)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.checkout_order(uuid)', 'EXECUTE')
         and has_function_privilege('service_role', 'public.checkout_order(uuid)', 'EXECUTE'),
         'no PUBLIC/anon; authenticated, service_role',
         (select coalesce(p.proacl::text, '(null = default ACL, PUBLIC EXECUTE)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'checkout_order' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all

  select 'expire_order_hold: EXECUTE ACL (no PUBLIC, no anon; authenticated + service_role)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid' and a.grantee = 0 and a.privilege_type = 'EXECUTE')
         and not has_function_privilege('anon', 'public.expire_order_hold(uuid)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.expire_order_hold(uuid)', 'EXECUTE')
         and has_function_privilege('service_role', 'public.expire_order_hold(uuid)', 'EXECUTE'),
         'no PUBLIC/anon; authenticated, service_role',
         (select coalesce(p.proacl::text, '(null = default ACL, PUBLIC EXECUTE)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'expire_order_hold' and pg_get_function_identity_arguments(p.oid) = 'p_order_id uuid')
  union all

  select 'validate_offer_transition: EXECUTE ACL (informational — trigger function, ACL left unchanged)',
         true,
         '(any)',
         (select coalesce(p.proacl::text, '(null = default ACL, PUBLIC EXECUTE)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_offer_transition' and pg_get_function_identity_arguments(p.oid) = '')
  union all
  select 'update_order_item_quantity does not exist yet',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_order_item_quantity'),
         'absent',
         (select coalesce(string_agg('(' || pg_get_function_identity_arguments(p.oid) || ')', ' | '), 'absent') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'update_order_item_quantity')
  union all
  select 'remove_order_item does not exist yet',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'remove_order_item'),
         'absent',
         (select coalesce(string_agg('(' || pg_get_function_identity_arguments(p.oid) || ')', ' | '), 'absent') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'remove_order_item')
  union all
  select 'marker app.checkout_reservation is not referenced by any existing function',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%app.checkout_reservation%'),
         'unreferenced',
         (select coalesce(string_agg(p.proname, ', '), 'unreferenced') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc like '%app.checkout_reservation%')
  union all
  select 'trigger trg_offer_transition on coffee_offers → validate_offer_transition, enabled',
         exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
                 where n.nspname = 'public' and c.relname = 'coffee_offers' and t.tgname = 'trg_offer_transition' and p.proname = 'validate_offer_transition' and t.tgenabled <> 'D' and not t.tgisinternal),
         'present, enabled',
         (select coalesce(string_agg(pg_get_triggerdef(t.oid) || ' [enabled=' || t.tgenabled::text || ']', ' | '), 'missing') from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'coffee_offers' and t.tgname = 'trg_offer_transition')
  union all
  select 'trigger trg_order_item_offer on order_items → validate_order_item_offer, enabled',
         exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
                 where n.nspname = 'public' and c.relname = 'order_items' and t.tgname = 'trg_order_item_offer' and p.proname = 'validate_order_item_offer' and t.tgenabled <> 'D' and not t.tgisinternal),
         'present, enabled',
         (select coalesce(string_agg(pg_get_triggerdef(t.oid) || ' [enabled=' || t.tgenabled::text || ']', ' | '), 'missing') from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'order_items' and t.tgname = 'trg_order_item_offer')
  union all
  select 'helpers is_org_member(uuid), organization_can_buy(uuid), is_platform_admin(), auth.uid() exist',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
           and ((p.proname = 'is_org_member' and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid')
             or (p.proname = 'organization_can_buy' and pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid')
             or (p.proname = 'is_platform_admin' and pg_get_function_identity_arguments(p.oid) = ''))) = 3
         and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'auth' and p.proname = 'uid'),
         'all present',
         (select string_agg(n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'public' and p.proname in ('is_org_member', 'organization_can_buy', 'is_platform_admin')) or (n.nspname = 'auth' and p.proname = 'uid'))
  union all
  select 'shipment_items.order_item_id FK is ON DELETE CASCADE (remove_order_item relies on it)',
         exists (select 1 from pg_constraint k where k.conname = 'shipment_items_order_item_id_fkey' and k.contype = 'f' and k.confdeltype = 'c'),
         'confdeltype = c',
         (select coalesce(string_agg(pg_get_constraintdef(k.oid), ' | '), 'missing') from pg_constraint k where k.conname = 'shipment_items_order_item_id_fkey')
  union all
  select 'coffee_offers UPDATE policies (informational: seller/admin ALL + compliance UPDATE expected)',
         true,
         'offers_compliance_update (UPDATE), offers_owner_or_admin (ALL)',
         (select string_agg(pol.policyname || ' (' || pol.cmd || ')', ', ' order by pol.policyname) from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'coffee_offers' and pol.cmd in ('UPDATE', 'ALL'))
  union all
  select 'coffee_offers table UPDATE privilege (informational)',
         true,
         'authenticated, service_role',
         (select string_agg(distinct g.grantee, ', ') from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'coffee_offers' and g.privilege_type = 'UPDATE')
)
select check_name, ok, expected, actual from checks;
