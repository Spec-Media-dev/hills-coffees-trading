-- Feature 009 DB-BLOCK-07 — READ-ONLY PREFLIGHT for the (DRAFT, NOT YET APPLIED, RUN A2-PRE3
-- extended) migration at
-- supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql.
--
-- Performs NO writes: SELECT statements over the system catalogs and application tables only (no
-- INSERT/UPDATE/DELETE/DDL, no GRANT/REVOKE, no set_config). Safe to run any number of times.
--
-- HOW TO READ IT: the Supabase SQL Editor shows the result of the LAST statement — the summary query
-- (section 4). Every row must report ok = true before the migration is applied. A settled READY row,
-- ANY operational gated-set row (CAPACITY_CONFIRMED/RESERVED/PICKING/BOOKED/DISPATCHED/
-- PARTIALLY_DELIVERED, regardless of settlement), and their remaining shipment items are MANDATORY
-- STOP conditions: this no-backfill draft must not silently grandfather a row whose reservation
-- identity would be unknown. An UNSETTLED READY row is DELIBERATELY NOT a stop condition — RUN
-- A2-PRE3 added a settlement-time reservation hook (reserve_ready_deliveries_for_settlement, called
-- from admin_review_payment) that makes it authoritative automatically, atomically, the moment its
-- order settles; treating it as a blocker would repeat the "blanket zero unsettled READY" mistake a
-- human review rejected. It is still reported below so a reviewer can see exactly which rows exist.
-- A false row in any MANDATORY check means STOP and send the rows back for a separately reviewed
-- reconciliation. Sections 1-3 are optional detail queries: select and run each one on its own to see
-- its result.

-- ============================================================================
-- 1. (optional detail) Current full definitions of the affected functions
-- ============================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('validate_shipment_transition', 'validate_shipment_item', 'admin_review_payment', 'sync_shipment_ready', 'apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement')
order by p.proname;

-- ============================================================================
-- 1b. (optional detail) Actual trigger bindings/timing/enabled state. Function source alone is NOT
--     proof: the transition binding must be BEFORE UPDATE-only before this draft changes it, while
--     the item validator must already be BEFORE INSERT OR UPDATE.
-- ============================================================================
select t.tgname as trigger_name, c.relname as table_name, t.tgenabled::text as enabled,
       pg_get_triggerdef(t.oid) as trigger_definition, p.proname as bound_function
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and t.tgname in ('trg_shipment_transition', 'trg_shipment_item_validate')
order by t.tgname;

-- ============================================================================
-- 2. (optional detail) order_shipments / shipment_items / inventory_positions / storage_allocations
--    policies and table privileges — confirms the exact shape the migration's guard/design assumes.
--    Both UNION branches must return the SAME column count (7) — a prior version of this file did
--    not (BUG A, found by running this file in the real SQL Editor) and failed with a UNION column-
--    count mismatch; regression-tested in tests/delivery/db-block-07-migration.test.ts.
-- ============================================================================
select 'policy' as kind, pol.tablename, pol.policyname as name, pol.cmd as command, array_to_string(pol.roles, ',') as roles, pol.qual as using_expression, pol.with_check
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename in ('order_shipments', 'shipment_items', 'inventory_positions', 'storage_allocations')
union all
select 'table_privilege', g.table_name, g.grantee, g.privilege_type, null, null, null
from information_schema.role_table_grants g
where g.table_schema = 'public' and g.table_name in ('order_shipments', 'shipment_items') and g.privilege_type = 'UPDATE'
union all
select 'function_privilege', g.routine_name, g.grantee, g.privilege_type, null, null, null
from information_schema.role_routine_grants g
where g.routine_schema = 'public'
  and g.routine_name in ('apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement')
order by 1, 2, 3;

-- ============================================================================
-- 3. (optional detail) Existing rows classified for the no-backfill STOP gate. A settled READY row,
--    or ANY row already in the operational gated set, is mandatory-zero (see section 4). Unsettled
--    READY rows are listed here for visibility only — they are NOT a stop condition (see the header
--    note above).
-- ============================================================================
select os.id as shipment_id, os.shipment_code, os.status as shipment_status, os.order_id, o.status as order_status, o.order_code,
       case
         when os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED') then 'SETTLED_READY — MANDATORY STOP'
         when os.status = 'READY' then 'UNSETTLED_READY — permitted, will be reserved at settlement'
         else 'OPERATIONAL_GATED — MANDATORY STOP regardless of settlement'
       end as classification
from public.order_shipments os
join public.orders o on o.id = os.order_id
where os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'READY')
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
  select 'validate_shipment_transition: SECURITY DEFINER with search_path pg_catalog, public, auth',
         (select p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition'),
         'prosecdef=true; search_path=pg_catalog, public, auth',
         (select 'prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition')
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
  select 'validate_shipment_item: SECURITY DEFINER with search_path pg_catalog, public, auth',
         (select p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item'),
         'prosecdef=true; search_path=pg_catalog, public, auth',
         (select 'prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item')
  union all
  select 'admin_review_payment: exactly one overload, body matches the baseline this migration was written against (RUN A2-PRE3)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment') = 1
         and (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment') = 'f94544de4180eaba90725a02c1677fb6',
         '1 overload; f94544de4180eaba90725a02c1677fb6',
         (select 'overloads=' || count(*) || '; body_md5=' || coalesce((select md5(replace(p2.prosrc, chr(13), '')) from pg_proc p2 join pg_namespace n2 on n2.oid = p2.pronamespace where n2.nspname = 'public' and p2.proname = 'admin_review_payment' limit 1), 'missing') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment')
  union all
  select 'admin_review_payment: SECURITY DEFINER with search_path pg_catalog, public, auth',
         (select p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment'),
         'prosecdef=true; search_path=pg_catalog, public, auth',
         (select 'prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment')
  union all
  select 'sync_shipment_ready: body matches the baseline this migration was written against (unmodified — informational)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sync_shipment_ready') = '07166e5e01629f65663a1d5937b130be',
         '07166e5e01629f65663a1d5937b130be',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'sync_shipment_ready')
  union all

  select 'apply_delivery_reservation does not exist yet (RUN A2-PRE3 new internal helper — no-backfill guard)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation'),
         'absent',
         (select coalesce('present, overloads=' || count(*)::text, 'absent') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation')
  union all
  select 'reserve_ready_deliveries_for_settlement does not exist yet (RUN A2-PRE3 new settlement-time hook — no-backfill guard)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement'),
         'absent',
         (select coalesce('present, overloads=' || count(*)::text, 'absent') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement')
  union all

  select 'trg_shipment_transition: exact enabled BEFORE UPDATE-only baseline binding on order_shipments to validate_shipment_transition',
         exists (
           select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'order_shipments' and t.tgname = 'trg_shipment_transition'
             and t.tgenabled = 'O' and not t.tgisinternal and (t.tgtype & 2) <> 0
             and (t.tgtype & 16) <> 0 and (t.tgtype & 4) = 0 and p.proname = 'validate_shipment_transition'
         ),
         'enabled BEFORE UPDATE only, validate_shipment_transition',
         coalesce((select pg_get_triggerdef(t.oid) || '; enabled=' || t.tgenabled::text
           from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'order_shipments' and t.tgname = 'trg_shipment_transition'), 'MISSING')
  union all
  select 'trg_shipment_item_validate: exact enabled BEFORE INSERT OR UPDATE baseline binding on shipment_items to validate_shipment_item',
         exists (
           select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'shipment_items' and t.tgname = 'trg_shipment_item_validate'
             and t.tgenabled = 'O' and not t.tgisinternal and (t.tgtype & 2) <> 0
             and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and p.proname = 'validate_shipment_item'
         ),
         'enabled BEFORE INSERT OR UPDATE, validate_shipment_item',
         coalesce((select pg_get_triggerdef(t.oid) || '; enabled=' || t.tgenabled::text
           from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'shipment_items' and t.tgname = 'trg_shipment_item_validate'), 'MISSING')
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
  select 'no CHECK constraint named shipment_items_reserved_quantity_kg_check or shipment_items_reserved_within_planned_check exists yet',
         not exists (select 1 from pg_constraint where conname in ('shipment_items_reserved_quantity_kg_check', 'shipment_items_reserved_within_planned_check')),
         'absent',
         (select coalesce(string_agg(conname, ', '), 'absent') from pg_constraint where conname in ('shipment_items_reserved_quantity_kg_check', 'shipment_items_reserved_within_planned_check'))
  union all

  select 'inventory_positions has the expected available_quantity_kg/reserved_quantity_kg columns',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inventory_positions' and column_name in ('available_quantity_kg', 'reserved_quantity_kg')) = 2,
         '2 columns present',
         (select coalesce(string_agg(column_name, ', '), 'missing') from information_schema.columns where table_schema = 'public' and table_name = 'inventory_positions' and column_name in ('available_quantity_kg', 'reserved_quantity_kg'))
  union all
  select 'inventory_positions carries the live inventory_reserved_within_available_check CHECK (reserved <= available) — confirms available_quantity_kg is the GROSS on-hand figure, not "free to reserve"',
         exists (select 1 from pg_constraint where conname = 'inventory_reserved_within_available_check'),
         'present',
         (select coalesce(pg_get_constraintdef(oid), 'MISSING — inventory semantics assumption is WRONG, stop and re-derive') from pg_constraint where conname = 'inventory_reserved_within_available_check')
  union all
  select 'inventory_positions has the live UNIQUE constraint proving at most one row per (lot, owner, warehouse, location) — no ambiguity guard is needed for it (unlike storage_allocations)',
         exists (select 1 from pg_constraint where conname = 'inventory_positions_lot_id_owner_organization_id_warehouse__key' and contype = 'u'),
         'present, UNIQUE',
         (select coalesce(pg_get_constraintdef(oid), 'MISSING — inventory_positions ambiguity guard would be REQUIRED, migration must be revised') from pg_constraint where conname = 'inventory_positions_lot_id_owner_organization_id_warehouse__key')
  union all
  select 'storage_allocations has the expected lot/warehouse/location/released_quantity_kg/status columns (used to resolve and update the buyer custody position)',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'storage_allocations' and column_name in ('order_item_id', 'owner_organization_id', 'lot_id', 'warehouse_id', 'warehouse_location_id', 'released_quantity_kg', 'status')) = 7,
         '7 columns present',
         (select coalesce(string_agg(column_name, ', '), 'missing') from information_schema.columns where table_schema = 'public' and table_name = 'storage_allocations' and column_name in ('order_item_id', 'owner_organization_id', 'lot_id', 'warehouse_id', 'warehouse_location_id', 'released_quantity_kg', 'status'))
  union all
  select 'storage_allocations has NO unique constraint on (order_item_id, owner_organization_id) — confirms the migration''s explicit COUNT-based ambiguity guard is genuinely required (not redundant)',
         not exists (select 1 from pg_constraint c where c.conrelid = 'public.storage_allocations'::regclass and c.contype in ('u','p') and pg_get_constraintdef(c.oid) ilike '%order_item_id%' and pg_get_constraintdef(c.oid) ilike '%owner_organization_id%'),
         'no such unique constraint',
         (select coalesce(string_agg(conname, ', '), 'none') from pg_constraint c where c.conrelid = 'public.storage_allocations'::regclass and c.contype in ('u','p') and pg_get_constraintdef(c.oid) ilike '%order_item_id%' and pg_get_constraintdef(c.oid) ilike '%owner_organization_id%')
  union all

  select 'authenticated holds a blanket table-level UPDATE grant on shipment_items (no column list) — confirms the column-tamper guard in the migration is genuinely required, not redundant',
         exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'shipment_items' and g.grantee = 'authenticated' and g.privilege_type = 'UPDATE'),
         'present (blanket grant)',
         (select coalesce(string_agg(g.privilege_type, ', '), 'none') from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'shipment_items' and g.grantee = 'authenticated')
  union all
  select 'authenticated holds a blanket table-level UPDATE grant on order_shipments (no column list) — confirms the column-tamper guard in the migration is genuinely required, not redundant',
         exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'order_shipments' and g.grantee = 'authenticated' and g.privilege_type = 'UPDATE'),
         'present (blanket grant)',
         (select coalesce(string_agg(g.privilege_type, ', '), 'none') from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name = 'order_shipments' and g.grantee = 'authenticated')
  union all

  select 'shipments_buyer_insert permits authenticated DRAFT inserts today — INSERT protection for settlement_verified_at is therefore mandatory',
         exists (select 1 from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'order_shipments'
           and pol.policyname = 'shipments_buyer_insert' and pol.cmd = 'INSERT'),
         'present INSERT policy',
         (select coalesce(string_agg(pol.policyname || ':' || pol.cmd, ', '), 'MISSING') from pg_policies pol
           where pol.schemaname = 'public' and pol.tablename = 'order_shipments' and pol.policyname = 'shipments_buyer_insert')
  union all

  select 'no existing function references the planned draft exception strings (they are not already in use for something else)',
         not exists (
           select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.prosrc like '%delivery_reservation_requires_settled_order%'
               or p.prosrc like '%delivery_reservation_insufficient_inventory%'
               or p.prosrc like '%delivery_reservation_position_missing%'
               or p.prosrc like '%delivery_release_position_missing%'
               or p.prosrc like '%delivery_reservation_ledger_inconsistent%'
               or p.prosrc like '%delivery_reservation_position_ambiguous%'
               or p.prosrc like '%shipment_must_start_draft%'
               or p.prosrc like '%delivery_recovery_requires_dedicated_workflow%')
         ),
         'unreferenced',
         (select coalesce(string_agg(distinct p.proname, ', '), 'unreferenced') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and (p.prosrc like '%delivery_reservation_requires_settled_order%'
               or p.prosrc like '%delivery_reservation_insufficient_inventory%'
               or p.prosrc like '%delivery_reservation_position_missing%'
               or p.prosrc like '%delivery_release_position_missing%'
               or p.prosrc like '%delivery_reservation_ledger_inconsistent%'
               or p.prosrc like '%delivery_reservation_position_ambiguous%'
               or p.prosrc like '%shipment_must_start_draft%'
               or p.prosrc like '%delivery_recovery_requires_dedicated_workflow%'))
  union all

  select 'no inventory_positions row currently has a negative available_quantity_kg or reserved_quantity_kg, or reserved > available (pre-existing data health)',
         not exists (select 1 from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0 or reserved_quantity_kg > available_quantity_kg),
         'none violating',
         (select coalesce(count(*)::text || ' row(s) violating', 'none violating') from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0 or reserved_quantity_kg > available_quantity_kg)
  union all
  select 'no storage_allocations row currently has released_quantity_kg > quantity_kg or negative (pre-existing data health)',
         not exists (select 1 from public.storage_allocations where released_quantity_kg < 0 or released_quantity_kg > quantity_kg),
         'none violating',
         (select coalesce(count(*)::text || ' row(s) violating', 'none violating') from public.storage_allocations where released_quantity_kg < 0 or released_quantity_kg > quantity_kg)
  union all
  select 'no duplicate/ambiguous storage_allocations rows exist today for any single (order_item_id, owner_organization_id) pair (the migration fails closed on this going forward, but preflight confirms today''s data is already clean)',
         not exists (
           select 1 from public.storage_allocations
           group by order_item_id, owner_organization_id
           having count(*) > 1
         ),
         'none ambiguous',
         (select coalesce(count(*)::text || ' ambiguous group(s)', 'none ambiguous') from (
           select order_item_id, owner_organization_id from public.storage_allocations
           group by order_item_id, owner_organization_id
           having count(*) > 1
         ) t)
  union all

  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  -- EXISTING-ROW GATE (RUN A2-PRE3 revised policy — see the header note and design doc §20/§21):
  -- ══════════════════════════════════════════════════════════════════════════════════════════════
  select 'MANDATORY — zero existing settled READY rows (no authoritative reservation could exist pre-migration; no silent no-backfill grandfathering)',
         not exists (select 1 from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')),
         '0 rows',
         (select count(*)::text || ' row(s)' from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
  union all
  select 'MANDATORY — zero existing operational gated-set rows (CAPACITY_CONFIRMED/RESERVED/PICKING/BOOKED/DISPATCHED/PARTIALLY_DELIVERED), REGARDLESS of settlement — these states imply physical progression the pre-migration database could not have gated correctly',
         not exists (select 1 from public.order_shipments
           where status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED')),
         '0 rows',
         (select count(*)::text || ' row(s)' from public.order_shipments
           where status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED'))
  union all
  select 'MANDATORY — zero shipment_items requiring reconciliation (belonging to a settled-READY or operational-gated-set shipment above; EXCLUDES items belonging to a legitimate unsettled READY shipment, which the settlement-time hook will reserve automatically — not backfill)',
         not exists (select 1 from public.shipment_items si join public.order_shipments os on os.id = si.shipment_id left join public.orders o on o.id = os.order_id
           where si.planned_quantity_kg > si.delivered_quantity_kg
             and (
               (os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
               or os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED')
             )),
         '0 rows',
         (select count(*)::text || ' row(s)' from public.shipment_items si join public.order_shipments os on os.id = si.shipment_id left join public.orders o on o.id = os.order_id
           where si.planned_quantity_kg > si.delivered_quantity_kg
             and (
               (os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
               or os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED')
             ))
  union all
  select 'INFORMATIONAL (NOT a stop condition) — existing unsettled READY rows: permitted because reserve_ready_deliveries_for_settlement(...), called from admin_review_payment(), will reserve them atomically the moment their order settles; always ok=true, reported for reviewer visibility only',
         true,
         'reported, not gated',
         (select count(*)::text || ' row(s): ' || coalesce(string_agg(os.shipment_code || ' (order ' || o.order_code || ')', ', '), '') from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status = 'READY' and o.status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
)
select check_name, ok, expected, actual from checks;
