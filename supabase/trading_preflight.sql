-- Hills Coffee Trading
-- Read-only preflight checks before applying trading_schema.sql.
-- This file must not change data, tables, policies, or functions.

-- 1) Inventory every public base table and its RLS state.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.polname)::bigint as policy_count
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
left join pg_catalog.pg_policy p
  on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;

-- 2) Any public table without RLS must be reviewed before proceeding.
select c.relname as public_table_without_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by c.relname;

-- 3) Any RLS-enabled public table without a policy is deny-by-default,
-- but is still reported so the access design can be reviewed explicitly.
select c.relname as rls_table_without_policy
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = c.oid
  )
order by c.relname;

-- 4) The table that previously triggered Supabase's warning must be protected.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname)::bigint as policy_count
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n
  on n.oid = c.relnamespace
left join pg_catalog.pg_policy p
  on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname = 'account_status_history'
group by c.relname, c.relrowsecurity;

-- 5) List existing public tables so legacy objects can be compared with the
-- fresh trading baseline before applying CREATE TABLE IF NOT EXISTS statements.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name;

