-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- POSTFLIGHT (read-only) for supabase/migrations/20260920140000_database_hygiene_updated_at.sql
-- Run in the Supabase SQL Editor after `supabase db push`. Every row must report ok = true.
-- (RLS policies, grants, audit-trigger count, excluded-table shape and every M2 row were also fingerprinted and
-- re-checked INSIDE the migration's transaction — a mismatch would have rolled it back.)
-- ══════════════════════════════════════════════════════════════════════════════════════════════

with
m2(t, grp) as (values
    ('kyb_documents', 'A'),
    ('order_items', 'A'),
    ('coffee_media', 'A'),
    ('warehouse_locations', 'A'),
    ('coffee_types', 'A'),
    ('coffee_varieties', 'A'),
    ('processing_methods', 'A'),
    ('packaging_types', 'A'),
    ('tags', 'A'),
    ('origins', 'B'),
    ('regions', 'B'),
    ('warehouses', 'B'),
    ('offer_sensory_notes', 'B')),
excluded(t) as (values ('audit_logs'), ('account_status_history'), ('listing_status_history'), ('order_status_history'), ('dispute_status_history'), ('inventory_ownership_events'), ('kyb_reviews'), ('kyb_review_items'), ('listing_reviews'), ('payment_reviews'), ('payment_events'), ('dispute_evidence'), ('support_messages'), ('notifications'), ('agreement_acceptances'), ('file_assets'), ('payment_proofs'), ('tax_invoices'), ('proforma_invoices'), ('proforma_invoice_items'), ('order_financials'), ('price_observations'), ('coffee_certifications'), ('coffee_documents'), ('offer_documents'), ('coffee_translations'), ('origin_translations'), ('coffee_tags'), ('offer_tags'), ('inventory_reservation_items')),
trg as (
  select c.relname as tbl, t.tgname, t.tgtype, p.proname as fn
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_proc p on p.oid = t.tgfoid
  where not t.tgisinternal
),
expected_policies(t, policy) as (values
    ('kyb_documents', 'kyb_documents_member_select'),
    ('kyb_documents', 'mfa_gate_kyb_documents'),
    ('order_items', 'order_items_admin'),
    ('order_items', 'order_items_create_buyer'),
    ('order_items', 'order_items_view'),
    ('coffee_media', 'catalog_admin_coffee_media'),
    ('coffee_media', 'public_read_coffee_media'),
    ('warehouse_locations', 'warehouse_locations_admin'),
    ('warehouse_locations', 'warehouse_locations_authenticated_read'),
    ('coffee_types', 'catalog_admin_types'),
    ('coffee_types', 'public_read_types'),
    ('coffee_varieties', 'catalog_admin_varieties'),
    ('coffee_varieties', 'public_read_varieties'),
    ('processing_methods', 'catalog_admin_processing'),
    ('processing_methods', 'public_read_processing'),
    ('packaging_types', 'catalog_admin_packaging'),
    ('packaging_types', 'public_read_packaging'),
    ('tags', 'catalog_admin_tags'),
    ('tags', 'public_read_tags'),
    ('origins', 'catalog_admin_origins'),
    ('origins', 'public_read_origins'),
    ('regions', 'catalog_admin_regions'),
    ('regions', 'public_read_regions'),
    ('warehouses', 'catalog_admin_warehouses'),
    ('warehouses', 'public_read_warehouses'),
    ('offer_sensory_notes', 'member_read_offer_sensory_notes'),
    ('offer_sensory_notes', 'offer_details_owner_or_admin')),
expected_grants(t, grantee, privilege) as (values
    ('kyb_documents', 'authenticated', 'INSERT'),
    ('kyb_documents', 'authenticated', 'REFERENCES'),
    ('kyb_documents', 'authenticated', 'SELECT'),
    ('kyb_documents', 'authenticated', 'TRIGGER'),
    ('kyb_documents', 'authenticated', 'UPDATE'),
    ('kyb_documents', 'service_role', 'DELETE'),
    ('kyb_documents', 'service_role', 'INSERT'),
    ('kyb_documents', 'service_role', 'REFERENCES'),
    ('kyb_documents', 'service_role', 'SELECT'),
    ('kyb_documents', 'service_role', 'TRIGGER'),
    ('kyb_documents', 'service_role', 'TRUNCATE'),
    ('kyb_documents', 'service_role', 'UPDATE'),
    ('order_items', 'authenticated', 'INSERT'),
    ('order_items', 'authenticated', 'REFERENCES'),
    ('order_items', 'authenticated', 'SELECT'),
    ('order_items', 'authenticated', 'TRIGGER'),
    ('order_items', 'authenticated', 'UPDATE'),
    ('order_items', 'service_role', 'DELETE'),
    ('order_items', 'service_role', 'INSERT'),
    ('order_items', 'service_role', 'REFERENCES'),
    ('order_items', 'service_role', 'SELECT'),
    ('order_items', 'service_role', 'TRIGGER'),
    ('order_items', 'service_role', 'TRUNCATE'),
    ('order_items', 'service_role', 'UPDATE'),
    ('coffee_media', 'anon', 'SELECT'),
    ('coffee_media', 'authenticated', 'INSERT'),
    ('coffee_media', 'authenticated', 'REFERENCES'),
    ('coffee_media', 'authenticated', 'SELECT'),
    ('coffee_media', 'authenticated', 'TRIGGER'),
    ('coffee_media', 'authenticated', 'UPDATE'),
    ('coffee_media', 'service_role', 'DELETE'),
    ('coffee_media', 'service_role', 'INSERT'),
    ('coffee_media', 'service_role', 'REFERENCES'),
    ('coffee_media', 'service_role', 'SELECT'),
    ('coffee_media', 'service_role', 'TRIGGER'),
    ('coffee_media', 'service_role', 'TRUNCATE'),
    ('coffee_media', 'service_role', 'UPDATE'),
    ('warehouse_locations', 'authenticated', 'INSERT'),
    ('warehouse_locations', 'authenticated', 'REFERENCES'),
    ('warehouse_locations', 'authenticated', 'SELECT'),
    ('warehouse_locations', 'authenticated', 'TRIGGER'),
    ('warehouse_locations', 'authenticated', 'UPDATE'),
    ('warehouse_locations', 'service_role', 'DELETE'),
    ('warehouse_locations', 'service_role', 'INSERT'),
    ('warehouse_locations', 'service_role', 'REFERENCES'),
    ('warehouse_locations', 'service_role', 'SELECT'),
    ('warehouse_locations', 'service_role', 'TRIGGER'),
    ('warehouse_locations', 'service_role', 'TRUNCATE'),
    ('warehouse_locations', 'service_role', 'UPDATE'),
    ('coffee_types', 'anon', 'SELECT'),
    ('coffee_types', 'authenticated', 'INSERT'),
    ('coffee_types', 'authenticated', 'REFERENCES'),
    ('coffee_types', 'authenticated', 'SELECT'),
    ('coffee_types', 'authenticated', 'TRIGGER'),
    ('coffee_types', 'authenticated', 'UPDATE'),
    ('coffee_types', 'service_role', 'DELETE'),
    ('coffee_types', 'service_role', 'INSERT'),
    ('coffee_types', 'service_role', 'REFERENCES'),
    ('coffee_types', 'service_role', 'SELECT'),
    ('coffee_types', 'service_role', 'TRIGGER'),
    ('coffee_types', 'service_role', 'TRUNCATE'),
    ('coffee_types', 'service_role', 'UPDATE'),
    ('coffee_varieties', 'anon', 'SELECT'),
    ('coffee_varieties', 'authenticated', 'INSERT'),
    ('coffee_varieties', 'authenticated', 'REFERENCES'),
    ('coffee_varieties', 'authenticated', 'SELECT'),
    ('coffee_varieties', 'authenticated', 'TRIGGER'),
    ('coffee_varieties', 'authenticated', 'UPDATE'),
    ('coffee_varieties', 'service_role', 'DELETE'),
    ('coffee_varieties', 'service_role', 'INSERT'),
    ('coffee_varieties', 'service_role', 'REFERENCES'),
    ('coffee_varieties', 'service_role', 'SELECT'),
    ('coffee_varieties', 'service_role', 'TRIGGER'),
    ('coffee_varieties', 'service_role', 'TRUNCATE'),
    ('coffee_varieties', 'service_role', 'UPDATE'),
    ('processing_methods', 'anon', 'SELECT'),
    ('processing_methods', 'authenticated', 'INSERT'),
    ('processing_methods', 'authenticated', 'REFERENCES'),
    ('processing_methods', 'authenticated', 'SELECT'),
    ('processing_methods', 'authenticated', 'TRIGGER'),
    ('processing_methods', 'authenticated', 'UPDATE'),
    ('processing_methods', 'service_role', 'DELETE'),
    ('processing_methods', 'service_role', 'INSERT'),
    ('processing_methods', 'service_role', 'REFERENCES'),
    ('processing_methods', 'service_role', 'SELECT'),
    ('processing_methods', 'service_role', 'TRIGGER'),
    ('processing_methods', 'service_role', 'TRUNCATE'),
    ('processing_methods', 'service_role', 'UPDATE'),
    ('packaging_types', 'anon', 'SELECT'),
    ('packaging_types', 'authenticated', 'INSERT'),
    ('packaging_types', 'authenticated', 'REFERENCES'),
    ('packaging_types', 'authenticated', 'SELECT'),
    ('packaging_types', 'authenticated', 'TRIGGER'),
    ('packaging_types', 'authenticated', 'UPDATE'),
    ('packaging_types', 'service_role', 'DELETE'),
    ('packaging_types', 'service_role', 'INSERT'),
    ('packaging_types', 'service_role', 'REFERENCES'),
    ('packaging_types', 'service_role', 'SELECT'),
    ('packaging_types', 'service_role', 'TRIGGER'),
    ('packaging_types', 'service_role', 'TRUNCATE'),
    ('packaging_types', 'service_role', 'UPDATE'),
    ('tags', 'anon', 'SELECT'),
    ('tags', 'authenticated', 'INSERT'),
    ('tags', 'authenticated', 'REFERENCES'),
    ('tags', 'authenticated', 'SELECT'),
    ('tags', 'authenticated', 'TRIGGER'),
    ('tags', 'authenticated', 'UPDATE'),
    ('tags', 'service_role', 'DELETE'),
    ('tags', 'service_role', 'INSERT'),
    ('tags', 'service_role', 'REFERENCES'),
    ('tags', 'service_role', 'SELECT'),
    ('tags', 'service_role', 'TRIGGER'),
    ('tags', 'service_role', 'TRUNCATE'),
    ('tags', 'service_role', 'UPDATE'),
    ('origins', 'anon', 'SELECT'),
    ('origins', 'authenticated', 'INSERT'),
    ('origins', 'authenticated', 'REFERENCES'),
    ('origins', 'authenticated', 'SELECT'),
    ('origins', 'authenticated', 'TRIGGER'),
    ('origins', 'authenticated', 'UPDATE'),
    ('origins', 'service_role', 'DELETE'),
    ('origins', 'service_role', 'INSERT'),
    ('origins', 'service_role', 'REFERENCES'),
    ('origins', 'service_role', 'SELECT'),
    ('origins', 'service_role', 'TRIGGER'),
    ('origins', 'service_role', 'TRUNCATE'),
    ('origins', 'service_role', 'UPDATE'),
    ('regions', 'anon', 'SELECT'),
    ('regions', 'authenticated', 'INSERT'),
    ('regions', 'authenticated', 'REFERENCES'),
    ('regions', 'authenticated', 'SELECT'),
    ('regions', 'authenticated', 'TRIGGER'),
    ('regions', 'authenticated', 'UPDATE'),
    ('regions', 'service_role', 'DELETE'),
    ('regions', 'service_role', 'INSERT'),
    ('regions', 'service_role', 'REFERENCES'),
    ('regions', 'service_role', 'SELECT'),
    ('regions', 'service_role', 'TRIGGER'),
    ('regions', 'service_role', 'TRUNCATE'),
    ('regions', 'service_role', 'UPDATE'),
    ('warehouses', 'anon', 'SELECT'),
    ('warehouses', 'authenticated', 'INSERT'),
    ('warehouses', 'authenticated', 'REFERENCES'),
    ('warehouses', 'authenticated', 'SELECT'),
    ('warehouses', 'authenticated', 'TRIGGER'),
    ('warehouses', 'authenticated', 'UPDATE'),
    ('warehouses', 'service_role', 'DELETE'),
    ('warehouses', 'service_role', 'INSERT'),
    ('warehouses', 'service_role', 'REFERENCES'),
    ('warehouses', 'service_role', 'SELECT'),
    ('warehouses', 'service_role', 'TRIGGER'),
    ('warehouses', 'service_role', 'TRUNCATE'),
    ('warehouses', 'service_role', 'UPDATE'),
    ('offer_sensory_notes', 'authenticated', 'INSERT'),
    ('offer_sensory_notes', 'authenticated', 'REFERENCES'),
    ('offer_sensory_notes', 'authenticated', 'SELECT'),
    ('offer_sensory_notes', 'authenticated', 'TRIGGER'),
    ('offer_sensory_notes', 'authenticated', 'UPDATE'),
    ('offer_sensory_notes', 'service_role', 'DELETE'),
    ('offer_sensory_notes', 'service_role', 'INSERT'),
    ('offer_sensory_notes', 'service_role', 'REFERENCES'),
    ('offer_sensory_notes', 'service_role', 'SELECT'),
    ('offer_sensory_notes', 'service_role', 'TRIGGER'),
    ('offer_sensory_notes', 'service_role', 'TRUNCATE'),
    ('offer_sensory_notes', 'service_role', 'UPDATE')),
checks as (
  select 1 as n, 'updated_at exists, is timestamptz, NOT NULL, DEFAULT now() on all 13 M2 tables' as check_name,
    (select count(*) = 13 from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'updated_at' and c.table_name in (select t from m2)
         and c.data_type = 'timestamp with time zone' and c.is_nullable = 'NO' and c.column_default = 'now()') as ok,
    null::text as detail
  union all
  select 2, 'each M2 table has exactly ONE set_updated_at trigger, named trg_<table>_updated_at, BEFORE UPDATE FOR EACH ROW',
    (select count(*) = 13 and bool_and(cnt = 1) from (
        select m.t, count(*) filter (where trg.fn = 'set_updated_at') as cnt from m2 m left join trg on trg.tbl = m.t group by m.t) x)
    and (select count(*) = 13 from trg where fn = 'set_updated_at' and tgname = 'trg_' || tbl || '_updated_at' and tbl in (select t from m2)
        and (tgtype & 2) = 2 and (tgtype & 16) = 16 and (tgtype & 1) = 1 and (tgtype & 4) = 0 and (tgtype & 8) = 0), null
  union all
  select 3, 'set_updated_at() is still the original (new.updated_at = now())',
    (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_updated_at' and p.prosrc ~ 'new\.updated_at\s*=\s*now\(\)'), null
  union all
  select 4, 'append-only / immutable / ambiguous tables were NOT given updated_at or a set_updated_at trigger',
    not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'updated_at' and c.table_name in (select t from excluded))
      and not exists (select 1 from trg where fn = 'set_updated_at' and tbl in (select t from excluded)),
    (select string_agg(t, ', ') from excluded e where exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = e.t and c.column_name = 'updated_at'))
  union all
  select 5, 'set_updated_at triggers exist on exactly 32 tables (13 M2 + 13 baseline + 6 M1) — no other table was given one',
    (select count(distinct tbl) = 32 from trg where fn = 'set_updated_at'), (select count(distinct tbl)::text from trg where fn = 'set_updated_at')
  union all
  select 6, 'no audit trigger was added (18 write_audit_log* triggers in total: 12 baseline+KYB, 6 from M1); the M2 tables have none except kyb_documents (its existing one)',
    (select count(*) = 18 from trg where fn like 'write_audit_log%')
      and (select count(*) = 1 from trg where fn like 'write_audit_log%' and tbl in (select t from m2)) and exists (select 1 from trg where fn = 'write_audit_log' and tbl = 'kyb_documents'),
    (select count(*)::text from trg where fn like 'write_audit_log%')
  union all
  select 7, 'RLS unchanged on the M2 tables: exactly the expected policy names, no more, no fewer',
    not exists (select 1 from expected_policies e where not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = e.t and p.policyname = e.policy))
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename in (select t from m2) and not exists (select 1 from expected_policies e where e.t = p.tablename and e.policy = p.policyname)),
    (select count(*)::text from pg_policies p where p.schemaname = 'public' and p.tablename in (select t from m2))
  union all
  select 8, 'grants unchanged on the M2 tables: exactly the expected (grantee, privilege) set for anon / authenticated / service_role',
    not exists (select 1 from expected_grants e where not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = e.t and g.grantee = e.grantee and g.privilege_type = e.privilege))
      and not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in (select t from m2) and g.grantee in ('anon', 'authenticated', 'service_role') and not exists (select 1 from expected_grants e where e.t = g.table_name and e.grantee = g.grantee and e.privilege = g.privilege_type)),
    null
  union all
  select 9, 'no M2 table lost or gained a user trigger other than its set_updated_at one (order_items keeps trg_order_item_offer; kyb_documents keeps its lineage + audit triggers)',
    (select count(*) = 1 from trg where tbl = 'order_items' and fn = 'validate_order_item_offer')
      and (select count(*) = 2 from trg where tbl = 'kyb_documents' and fn in ('validate_kyb_document_lineage', 'write_audit_log'))
      and (select count(*) = 3 from trg where tbl in ('order_items', 'kyb_documents') and fn <> 'set_updated_at'), null
  union all
  select 10, 'created_at untouched: every M2 table that has it still has it as timestamptz NOT NULL',
    (select count(*) = 12 from information_schema.columns c where c.table_schema = 'public' and c.column_name = 'created_at' and c.table_name in (select t from m2)
        and c.data_type = 'timestamp with time zone' and c.is_nullable = 'NO'), null
  union all
  select 11, 'row counts of the 13 M2 tables (informational — the migration changes no row)', true,
    'kyb_documents=' || (select count(*) from public.kyb_documents)
    || ', ' || 'order_items=' || (select count(*) from public.order_items)
    || ', ' || 'coffee_media=' || (select count(*) from public.coffee_media)
    || ', ' || 'warehouse_locations=' || (select count(*) from public.warehouse_locations)
    || ', ' || 'coffee_types=' || (select count(*) from public.coffee_types)
    || ', ' || 'coffee_varieties=' || (select count(*) from public.coffee_varieties)
    || ', ' || 'processing_methods=' || (select count(*) from public.processing_methods)
    || ', ' || 'packaging_types=' || (select count(*) from public.packaging_types)
    || ', ' || 'tags=' || (select count(*) from public.tags)
    || ', ' || 'origins=' || (select count(*) from public.origins)
    || ', ' || 'regions=' || (select count(*) from public.regions)
    || ', ' || 'warehouses=' || (select count(*) from public.warehouses)
    || ', ' || 'offer_sensory_notes=' || (select count(*) from public.offer_sensory_notes)
  union all
  select 12, 'no NULL updated_at anywhere in the 13 tables (NOT NULL held; existing rows carry created_at, warehouse_locations the migration time)',
    not exists (select 1 from public.kyb_documents where updated_at is null)
    and not exists (select 1 from public.order_items where updated_at is null)
    and not exists (select 1 from public.coffee_media where updated_at is null)
    and not exists (select 1 from public.warehouse_locations where updated_at is null)
    and not exists (select 1 from public.coffee_types where updated_at is null)
    and not exists (select 1 from public.coffee_varieties where updated_at is null)
    and not exists (select 1 from public.processing_methods where updated_at is null)
    and not exists (select 1 from public.packaging_types where updated_at is null)
    and not exists (select 1 from public.tags where updated_at is null)
    and not exists (select 1 from public.origins where updated_at is null)
    and not exists (select 1 from public.regions where updated_at is null)
    and not exists (select 1 from public.warehouses where updated_at is null)
    and not exists (select 1 from public.offer_sensory_notes where updated_at is null), null
)
select n, check_name, coalesce(ok, false) as ok, detail from checks order by n;
