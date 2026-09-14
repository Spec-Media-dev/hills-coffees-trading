-- Feature 009 DB-BLOCK-07 — READ-ONLY PREFLIGHT for the (DRAFT, NOT YET APPLIED) migration at
-- supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql.
--
-- Performs NO writes: SELECT statements over the system catalogs and application tables only (no
-- INSERT/UPDATE/DELETE/DDL, no GRANT/REVOKE, no set_config). Safe to run any number of times.
--
-- HOW TO READ IT: the Supabase SQL Editor shows the result of the LAST statement — the summary query
-- (section 4). Every row must report ok = true before the migration is applied. A false row on the
-- "no pre-existing unpaid shipment already past the gated boundary" check (section 4, near the end)
-- is DATA, not a bug — it means at least one existing order_shipments row would newly become subject
-- to the settlement-eligibility gate once this migration lands; review those specific rows (section 3)
-- before proceeding, since the migration itself does not retroactively change their current status,
-- only what happens on their NEXT transition attempt.
-- Sections 1-3 are optional detail queries: select and run each one on its own to see its result.

-- ============================================================================
-- 1. (optional detail) Current full definitions of the affected functions
-- ============================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('validate_shipment_transition', 'validate_shipment_item', 'sync_shipment_ready')
order by p.proname;

-- ============================================================================
-- 2. (optional detail) order_shipments / shipment_items policies and table privileges
-- ============================================================================
select 'policy' as kind, pol.tablename, pol.policyname as name, pol.cmd as command, array_to_string(pol.roles, ',') as roles, pol.qual as using_expression, pol.with_check
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename in ('order_shipments', 'shipment_items')
order by pol.tablename, pol.policyname;

-- ============================================================================
-- 3. (optional detail) Any EXISTING order_shipments row already in the future "gated set"
--    (CAPACITY_CONFIRMED/RESERVED/PICKING/BOOKED/DISPATCHED/PARTIALLY_DELIVERED/DELIVERED) whose
--    parent order is NOT in the settled family — these rows are the ones design §1/§4 discusses.
--    This query is informational: the migration does not touch existing rows, only future
--    transitions on them.
-- ============================================================================
select os.id as shipment_id, os.shipment_code, os.status as shipment_status, os.order_id, o.status as order_status, o.order_code
from public.order_shipments os
join public.orders o on o.id = os.order_id
where os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED')
  and o.status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')
order by os.created_at;

-- ============================================================================
-- 4. SUMMARY — every row must be ok = true
-- ============================================================================
with checks(check_name, ok, expected, actual) as (

  select 'validate_shipment_transition: exactly one overload with no arguments' as check_name,
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition') = 1 as ok,
         '1 overload, ()' as expected,
         (select string_agg('(' || pg_get_function_identity_arguments(p.oid) || ')', ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition') as actual
  union all
  select 'validate_shipment_transition: body matches the baseline this migration was written against',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition') = '93102472a7bdcdce52f645c1edb07a25',
         '93102472a7bdcdce52f645c1edb07a25',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition')
  union all
  select 'validate_shipment_item: exactly one overload with no arguments',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item') = 1,
         '1 overload, ()',
         (select string_agg('(' || pg_get_function_identity_arguments(p.oid) || ')', ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item')
  union all
  select 'validate_shipment_item: body matches the baseline this migration was written against',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item') = 'ab0d35de1718d58d46f8c71cbbf95b4f',
         'ab0d35de1718d58d46f8c71cbbf95b4f',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item')
  union all
  select 'sync_shipment_ready: body matches the baseline this migration was written against (unmodified — informational)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sync_shipment_ready') = '07166e5e01629f65663a1d5937b130be',
         '07166e5e01629f65663a1d5937b130be',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sync_shipment_ready')
  union all

  select 'shipment_items.reserved_quantity_kg does not exist yet',
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg'),
         'absent',
         (select coalesce(string_agg(column_name, ', '), 'absent') from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg')
  union all
  select 'order_shipments.settlement_verified_at does not exist yet',
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at'),
         'absent',
         (select coalesce(string_agg(column_name, ', '), 'absent') from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at')
  union all

  select 'inventory_positions has the expected available_quantity_kg/reserved_quantity_kg columns',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inventory_positions' and column_name in ('available_quantity_kg', 'reserved_quantity_kg')) = 2,
         '2 columns present',
         (select coalesce(string_agg(column_name, ', '), 'missing') from information_schema.columns where table_schema = 'public' and table_name = 'inventory_positions' and column_name in ('available_quantity_kg', 'reserved_quantity_kg'))
  union all
  select 'storage_allocations has the expected lot/warehouse/location columns (used to resolve the buyer position)',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'storage_allocations' and column_name in ('order_item_id', 'owner_organization_id', 'lot_id', 'warehouse_id', 'warehouse_location_id')) = 5,
         '5 columns present',
         (select coalesce(string_agg(column_name, ', '), 'missing') from information_schema.columns where table_schema = 'public' and table_name = 'storage_allocations' and column_name in ('order_item_id', 'owner_organization_id', 'lot_id', 'warehouse_id', 'warehouse_location_id'))
  union all

  select 'no existing function references the planned draft exception strings (they are not already in use for something else)',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.prosrc like '%delivery_reservation_requires_settled_order%'
               or p.prosrc like '%delivery_reservation_insufficient_inventory%'
               or p.prosrc like '%delivery_reservation_position_missing%')
         ),
         'unreferenced',
         (select coalesce(string_agg(distinct p.proname, ', '), 'unreferenced') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.prosrc like '%delivery_reservation_requires_settled_order%'
               or p.prosrc like '%delivery_reservation_insufficient_inventory%'
               or p.prosrc like '%delivery_reservation_position_missing%'))
  union all

  select 'no inventory_positions row currently has a negative available_quantity_kg or reserved_quantity_kg (pre-existing data health, unrelated to this migration but worth confirming before adding logic that depends on the invariant)',
         not exists (select 1 from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0),
         'none negative',
         (select coalesce(count(*)::text || ' row(s) negative', 'none negative') from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0)
  union all

  select 'INFORMATIONAL ONLY — count of existing order_shipments rows already past the gated boundary on an unsettled order (see section 3 for the rows; does not block the migration, which only governs FUTURE transitions)',
         true,
         '(any count; review section 3 if nonzero)',
         (select count(*)::text || ' row(s)' from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED')
             and o.status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
)
select check_name, ok, expected, actual from checks;
