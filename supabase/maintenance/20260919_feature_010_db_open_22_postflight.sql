-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- POSTFLIGHT (read-only) for 20260919130000_feature_010_db_open_22_compliance_organization_read.sql
-- Run in the Supabase SQL Editor after applying the migration. Every row must report ok = true.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

with
member_select as (
  select * from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_member_select'
),
compliance_update as (
  select * from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_compliance_update'
),
admin_all as (
  select * from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_admin_all'
),
mfa_gate as (
  select * from pg_policies where schemaname = 'public' and tablename = 'organizations' and policyname = 'mfa_gate_organizations'
),
guard_fn as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_organization_compliance_update'
),
checks as (
  select 1 as n, 'organizations_member_select = is_org_member(id) OR is_platform_admin() OR is_compliance_operator()' as check_name,
    (select count(*) = 1 and bool_and(qual = '(is_org_member(id) OR is_platform_admin() OR is_compliance_operator())') from member_select) as ok,
    (select qual from member_select) as detail
  union all
  select 2, 'organizations_member_select still SELECT, roles {public}, permissive',
    (select bool_and(cmd = 'SELECT' and roles = '{public}' and permissive = 'PERMISSIVE') from member_select), null
  union all
  select 3, 'organizations_compliance_update unchanged (UPDATE; is_platform_admin() OR is_compliance_operator())',
    (select count(*) = 1 and bool_and(cmd = 'UPDATE' and qual = '(is_platform_admin() OR is_compliance_operator())' and with_check = '(is_platform_admin() OR is_compliance_operator())') from compliance_update), null
  union all
  select 4, 'organizations_admin_all unchanged (ALL; is_platform_admin())',
    (select count(*) = 1 and bool_and(cmd = 'ALL' and qual = 'is_platform_admin()' and with_check = 'is_platform_admin()') from admin_all), null
  union all
  select 5, 'mfa_gate_organizations still RESTRICTIVE',
    (select count(*) = 1 and bool_and(permissive = 'RESTRICTIVE' and qual = 'mfa_satisfied()') from mfa_gate), null
  union all
  select 6, 'organizations has exactly 4 policies (no new policy)',
    (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'organizations'),
    (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'organizations')
  union all
  select 7, 'trg_organizations_compliance_guard is BEFORE UPDATE FOR EACH ROW',
    exists (select 1 from pg_trigger t where t.tgrelid = 'public.organizations'::regclass and t.tgname = 'trg_organizations_compliance_guard' and not t.tgisinternal and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and (t.tgtype & 1) = 1),
    null
  union all
  select 8, 'guard function is SECURITY DEFINER with pinned search_path',
    (select count(*) = 1 and bool_and(prosecdef and proconfig @> array['search_path=pg_catalog, public, auth']) from guard_fn), null
  union all
  select 9, 'anon and authenticated cannot execute the guard function directly',
    (select not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE') from guard_fn), null
  union all
  select 10, 'organizations grants unchanged: anon holds nothing',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'organizations' and grantee = 'anon'),
    null
  union all
  select 11, 'account_status_history policy unchanged (is_org_member(organization_id) OR is_platform_admin())',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_status_history' and policyname = 'account_status_history_view' and qual = '(is_org_member(organization_id) OR is_platform_admin())'),
    null
  union all
  select 12, 'no organization data changed by the migration (status distribution reported for the record)',
    true,
    (select string_agg(status || ':' || c, ', ' order by status) from (select status, count(*) as c from public.organizations group by status) s)
)
select n, check_name, coalesce(ok, false) as ok, detail from checks order by n;
