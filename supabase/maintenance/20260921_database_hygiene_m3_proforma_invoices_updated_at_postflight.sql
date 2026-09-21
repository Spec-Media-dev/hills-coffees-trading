-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- POSTFLIGHT (read-only) for supabase/migrations/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.sql
-- Run in the Supabase SQL Editor after `supabase db push`. Every row must report ok = true.
-- (RLS policies, grants, user triggers and row fingerprints were also checked INSIDE the migration transaction.)
-- ══════════════════════════════════════════════════════════════════════════════════════════════

with
checks(check_name, ok, detail) as (
  -- 1. Table exists
  select 'table proforma_invoices exists',
         to_regclass('public.proforma_invoices') is not null,
         coalesce(to_regclass('public.proforma_invoices')::text, 'missing')

  union all

  -- 2. updated_at column exists with expected type, nullability and default
  select 'column updated_at: timestamptz NOT NULL DEFAULT now()',
         exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'updated_at'
             and data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default = 'now()'
         ),
         coalesce((
           select data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, 'none')
           from information_schema.columns
           where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'updated_at'
         ), 'missing')

  union all

  -- 3. Trigger trg_proforma_invoices_updated_at exists and active
  select 'trigger trg_proforma_invoices_updated_at is active BEFORE UPDATE',
         exists (
           select 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'proforma_invoices'
             and t.tgname = 'trg_proforma_invoices_updated_at'
             and t.tgtype & 2 = 2   -- BEFORE
             and t.tgtype & 16 = 16 -- UPDATE
             and not t.tgisinternal
             and t.tgenabled = 'O'  -- session_replication_role origin (enabled)
         ),
         coalesce((
           select 'enabled=' ||  t.tgenabled::text || ' type=' || t.tgtype::text
           from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'proforma_invoices' and t.tgname = 'trg_proforma_invoices_updated_at'
         ), 'missing')

  union all

  -- 4. Trigger function is public.set_updated_at()
  select 'trigger function is public.set_updated_at()',
         exists (
           select 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'proforma_invoices'
             and t.tgname = 'trg_proforma_invoices_updated_at'
             and p.proname = 'set_updated_at'
         ),
         coalesce((
           select p.proname
           from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'proforma_invoices' and t.tgname = 'trg_proforma_invoices_updated_at'
         ), 'missing')

  union all

  -- 5. Exactly one set_updated_at trigger on proforma_invoices (no duplicates)
  select 'no duplicate set_updated_at trigger on proforma_invoices',
         (
           select count(*) = 1 from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'proforma_invoices'
             and p.proname = 'set_updated_at' and not t.tgisinternal
         ),
         (
           select count(*)::text from pg_trigger t
           join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace
           join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'proforma_invoices'
             and p.proname = 'set_updated_at' and not t.tgisinternal
         )

  union all

  -- 6. No NULL updated_at in existing rows
  select 'no NULL updated_at values across existing rows',
         (
           select count(*) = 0 from public.proforma_invoices where updated_at is null
         ),
         (
           select count(*)::text || ' null(s)' from public.proforma_invoices where updated_at is null
         )

  union all

  -- 7. RLS unchanged on proforma_invoices (proforma_view only)
  select 'RLS policies on proforma_invoices unchanged (proforma_view only)',
         (
           select count(*) = 1 and bool_and(policyname = 'proforma_view')
           from pg_policies
           where schemaname = 'public' and tablename = 'proforma_invoices'
         ),
         (
           select coalesce(string_agg(policyname, ', '), 'none')
           from pg_policies
           where schemaname = 'public' and tablename = 'proforma_invoices'
         )

  union all

  -- 8. Append-only tables untouched (no updated_at column added)
  select 'append-only tables untouched (audit_logs, status histories, ownership events)',
         not exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name in ('audit_logs', 'order_status_history', 'listing_status_history', 'account_status_history', 'dispute_status_history', 'inventory_ownership_events', 'inventory_variance_events')
             and column_name = 'updated_at'
         ),
         coalesce((
           select string_agg(table_name, ', ')
           from information_schema.columns
           where table_schema = 'public'
             and table_name in ('audit_logs', 'order_status_history', 'listing_status_history', 'account_status_history', 'dispute_status_history', 'inventory_ownership_events', 'inventory_variance_events')
             and column_name = 'updated_at'
         ), 'none (all clean)')

  union all

  -- 9. Other candidate tables untouched (no updated_at column or trigger added)
  select 'other M3 candidates untouched (inventory_reservations, storage_allocations, shipment_items, payouts, notification_preferences, notification_deliveries, organization_members)',
         not exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name in ('inventory_reservations', 'storage_allocations', 'shipment_items', 'payouts', 'notification_preferences', 'notification_deliveries', 'organization_members')
             and column_name = 'updated_at'
         ),
         coalesce((
           select string_agg(table_name, ', ')
           from information_schema.columns
           where table_schema = 'public'
             and table_name in ('inventory_reservations', 'storage_allocations', 'shipment_items', 'payouts', 'notification_preferences', 'notification_deliveries', 'organization_members')
             and column_name = 'updated_at'
         ), 'none (all clean)')

  union all

  -- 10. disputes updated_at column still intact
  select 'disputes updated_at intact (managed by transition_dispute)',
         exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'disputes' and column_name = 'updated_at'
             and data_type = 'timestamp with time zone' and is_nullable = 'NO'
         ),
         'disputes.updated_at intact'
)
select check_name,
       case when ok then 'PASS' else 'FAIL' end as status,
       detail
from checks;
