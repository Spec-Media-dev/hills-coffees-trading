-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- POSTFLIGHT (read-only) for supabase/migrations/20260920160000_feature_011_db_block_10_price_policy_scope.sql
-- Run in the Supabase SQL Editor after `supabase db push`. Every row must report ok = true.
-- (Every other policy, every grant and the function EXECUTE ACLs were also fingerprinted and re-checked INSIDE the
-- migration's transaction — a mismatch would have rolled it back. The anonymous READ itself is proven by
-- tests/pricing/reference-prices-live.test.ts, run after the push.)
-- ══════════════════════════════════════════════════════════════════════════════════════════════

with
tbl(t, admin_policy, read_policy) as (values
    ('price_sources', 'price_sources_admin', 'price_sources_public_read'),
    ('price_observations', 'price_observations_admin', 'price_observations_public_read'),
    ('price_differentials', 'price_differentials_admin', 'price_differentials_public_read')),
pol as (
  select p.tablename, p.policyname, p.cmd, p.roles::text as roles, p.qual, p.with_check
  from pg_policies p where p.schemaname = 'public' and p.tablename in (select t from tbl)
),
checks as (
  select 1 as n, 'the three price_*_admin policies are FOR ALL, scoped TO authenticated, USING (is_platform_admin()) (WITH CHECK, where present, is is_platform_admin())' as check_name,
    (select count(*) = 3 from pol join tbl on tbl.admin_policy = pol.policyname and tbl.t = pol.tablename
       where pol.cmd = 'ALL' and pol.roles = '{authenticated}' and pol.qual = 'is_platform_admin()' and coalesce(pol.with_check, 'is_platform_admin()') = 'is_platform_admin()') as ok,
    (select string_agg(policyname || '=' || roles, ', ' order by policyname) from pol where policyname in (select admin_policy from tbl)) as detail
  union all
  select 2, 'the three price_*_public_read policies are unchanged: SELECT TO public with their expected predicates',
    (select count(*) = 3 from pol
       where (policyname = 'price_sources_public_read' and cmd = 'SELECT' and roles = '{public}' and qual ~ 'is_active = true' and qual ~ 'licence_status = ''APPROVED''')
          or (policyname = 'price_observations_public_read' and cmd = 'SELECT' and roles = '{public}' and qual ~ 'price_sources' and qual ~ 'licence_status = ''APPROVED''' and qual ~ 'is_active = true')
          or (policyname = 'price_differentials_public_read' and cmd = 'SELECT' and roles = '{public}' and qual ~ 'is_active = true')), null
  union all
  select 3, 'each pricing table has exactly its two policies — no other policy was added or removed',
    (select bool_and(cnt = 2) and count(*) = 3 from (select t, (select count(*) from pol where pol.tablename = tbl.t) as cnt from tbl) x),
    (select string_agg(tablename || '=' || count, ', ') from (select tablename, count(*) from pol group by tablename) y)
  union all
  select 4, 'anon still has NO EXECUTE on is_platform_admin() (least privilege preserved — the fix is the role scope, not a grant)',
    not has_function_privilege('anon', 'public.is_platform_admin()', 'execute'), null
  union all
  select 5, 'authenticated and service_role can still EXECUTE is_platform_admin() (administrator write path intact)',
    has_function_privilege('authenticated', 'public.is_platform_admin()', 'execute') and has_function_privilege('service_role', 'public.is_platform_admin()', 'execute'), null
  union all
  select 6, 'grants unchanged: anon holds SELECT only; authenticated holds INSERT/REFERENCES/SELECT/TRIGGER/UPDATE (no DELETE); service_role holds all',
    (select bool_and(ok) from (
       select (
         (select array_agg(privilege_type::text order by privilege_type::text) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = tbl.t and g.grantee = 'anon') = array['SELECT']
         and (select array_agg(privilege_type::text order by privilege_type::text) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = tbl.t and g.grantee = 'authenticated') = array['INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'UPDATE']
         and (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = tbl.t and g.grantee = 'service_role') = 7
       ) as ok from tbl) z), null
  union all
  select 7, 'row-level security is still enabled on all three tables',
    (select count(*) = 3 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in (select t from tbl) and c.relrowsecurity), null
  union all
  select 8, 'the warehouses policies were NOT touched (deliberately out of scope): catalog_admin_warehouses is still TO public',
    (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'warehouses' and policyname = 'catalog_admin_warehouses' and roles::text = '{public}'), null
  union all
  select 9, 'row counts (informational — the migration changes no row)', true,
    'price_sources=' || (select count(*) from public.price_sources) || ', price_observations=' || (select count(*) from public.price_observations) || ', price_differentials=' || (select count(*) from public.price_differentials)
)
select n, check_name, coalesce(ok, false) as ok, detail from checks order by n;
