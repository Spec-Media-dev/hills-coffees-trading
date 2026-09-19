-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- POSTFLIGHT (read-only) for supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql
-- Run in the Supabase SQL Editor after `supabase db push`. Every row must report ok = true.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

with
cfg(t) as (values ('platform_admins'), ('commission_policies'), ('commission_tiers'), ('tax_rules'), ('shipping_rules'), ('payment_accounts')),
trg as (
  select c.relname as tbl, t.tgname, t.tgtype, p.proname as fn, p.prosecdef, p.proconfig, p.oid as fn_oid
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
),
audit_owner as (select relowner from pg_class where oid = 'public.audit_logs'::regclass),
sib as (
  select p.proname, p.oid, p.prosecdef, p.proconfig, p.proowner, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('write_audit_log_platform_admins', 'write_audit_log_payment_accounts')
),
checks as (
  select 1 as n, 'updated_at is timestamptz NOT NULL DEFAULT now() on all six tables' as check_name,
    (select count(*) = 6 from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'updated_at' and c.table_name in (select t from cfg)
         and c.data_type = 'timestamp with time zone' and c.is_nullable = 'NO' and c.column_default = 'now()') as ok,
    null::text as detail
  union all
  select 2, 'BEFORE UPDATE FOR EACH ROW set_updated_at() trigger trg_<table>_updated_at on all six',
    (select count(*) = 6 from trg where fn = 'set_updated_at' and tgname = 'trg_' || tbl || '_updated_at'
        and tbl in (select t from cfg) and (tgtype & 2) = 2 and (tgtype & 16) = 16 and (tgtype & 1) = 1), null
  union all
  select 3, 'AFTER INSERT+UPDATE+DELETE FOR EACH ROW audit trigger trg_audit_<table> on all six',
    (select count(*) = 6 from trg where tgname = 'trg_audit_' || tbl and tbl in (select t from cfg)
        and (tgtype & 2) = 0 and (tgtype & 4) = 4 and (tgtype & 8) = 8 and (tgtype & 16) = 16 and (tgtype & 1) = 1),
    (select string_agg(tbl || '→' || fn, ', ' order by tbl) from trg where tgname like 'trg_audit_%' and tbl in (select t from cfg))
  union all
  select 4, 'audit functions: commission_policies / commission_tiers / tax_rules / shipping_rules use write_audit_log; platform_admins and payment_accounts use their siblings',
    (select count(*) = 6 from trg where
        (tbl in ('commission_policies', 'commission_tiers', 'tax_rules', 'shipping_rules') and tgname = 'trg_audit_' || tbl and fn = 'write_audit_log')
     or (tbl = 'platform_admins'  and tgname = 'trg_audit_platform_admins'  and fn = 'write_audit_log_platform_admins')
     or (tbl = 'payment_accounts' and tgname = 'trg_audit_payment_accounts' and fn = 'write_audit_log_payment_accounts')), null
  union all
  select 5, 'the two sibling functions are SECURITY DEFINER with search_path pinned; anon and authenticated cannot execute them',
    (select count(*) = 2 and bool_and(prosecdef and proconfig @> array['search_path=pg_catalog, public, auth']
        and not has_function_privilege('anon', oid, 'EXECUTE') and not has_function_privilege('authenticated', oid, 'EXECUTE')) from sib), null
  union all
  select 6, 'the sibling functions are owned by the owner of audit_logs (so their inserts pass RLS) — not by a short-lived login role',
    (select count(*) = 2 and bool_and(s.proowner = (select relowner from audit_owner)) from sib s),
    (select string_agg(proname || ' owner=' || proowner::regrole::text, ', ') from sib)
  union all
  select 7, 'platform_admins sibling keys the record on user_id (never .id)',
    (select bool_and(prosrc ~ 'new\.user_id' and prosrc ~ 'old\.user_id' and prosrc !~ '(new|old)\.id\b') from sib where proname = 'write_audit_log_platform_admins'), null
  union all
  select 8, 'payment_accounts sibling is redacted: no to_jsonb(new|old), no raw account_number / iban in a payload, last4 fields present',
    (select bool_and(prosrc !~* 'to_jsonb\s*\(\s*(new|old)' and prosrc ~ 'account_number_last4' and prosrc ~ 'iban_last4'
        and prosrc !~ '''account_number'',\s*(new|old)\.account_number' and prosrc !~ '''iban'',\s*(new|old)\.iban') from sib where proname = 'write_audit_log_payment_accounts'), null
  union all
  select 9, 'payment_accounts has NO generic write_audit_log trigger (only the redacting one)',
    (select count(*) = 0 from trg where tbl = 'payment_accounts' and fn = 'write_audit_log'), null
  union all
  select 10, 'RLS unchanged: the six authorization policies keep their baseline USING / WITH CHECK',
    (select count(*) = 6 from pg_policies where schemaname = 'public' and (
        (tablename = 'platform_admins'     and policyname = 'platform_admins_admin'  and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
     or (tablename = 'commission_policies' and policyname = 'commission_admin'       and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
     or (tablename = 'commission_tiers'    and policyname = 'tiers_admin'            and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
     or (tablename = 'tax_rules'           and policyname = 'tax_admin'              and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
     or (tablename = 'shipping_rules'      and policyname = 'shipping_admin'         and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
     or (tablename = 'payment_accounts'    and policyname = 'payment_accounts_admin' and qual = 'is_platform_admin()' and with_check = 'is_super_admin()'))), null
  union all
  select 11, 'no extra policy on the six tables (exactly 6 policies)',
    (select count(*) = 6 from pg_policies where schemaname = 'public' and tablename in (select t from cfg)), null
  union all
  select 12, 'grants unchanged: anon holds no privilege on the six tables; authenticated holds no DELETE',
    not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in (select t from cfg)
        and (g.grantee = 'anon' or (g.grantee = 'authenticated' and g.privilege_type = 'DELETE'))), null
  union all
  select 13, 'audit_logs policies unchanged (only audit_admin_read, SELECT)',
    (select count(*) = 1 and bool_and(policyname = 'audit_admin_read' and cmd = 'SELECT' and qual = 'is_platform_admin()') from pg_policies where schemaname = 'public' and tablename = 'audit_logs'), null
  union all
  select 14, 'shared functions still the originals (set_updated_at, write_audit_log) and no other table gained an audit trigger (12 existing + 6 new = 18 audit triggers in total)',
    (select count(*) = 2 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('set_updated_at', 'write_audit_log'))
      and (select count(*) = 18 from trg where tgname like 'trg_audit_%'),
    (select count(*)::text from trg where tgname like 'trg_audit_%')
  union all
  select 15, 'row counts of the six tables (informational — the migration changes no configuration row)', true,
    'platform_admins=' || (select count(*) from public.platform_admins) || ', commission_policies=' || (select count(*) from public.commission_policies)
    || ', commission_tiers=' || (select count(*) from public.commission_tiers) || ', tax_rules=' || (select count(*) from public.tax_rules)
    || ', shipping_rules=' || (select count(*) from public.shipping_rules) || ', payment_accounts=' || (select count(*) from public.payment_accounts)
)
select n, check_name, coalesce(ok, false) as ok, detail from checks order by n;
