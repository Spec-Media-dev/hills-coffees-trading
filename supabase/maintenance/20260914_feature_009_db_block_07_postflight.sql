-- Feature 009 DB-BLOCK-07 — READ-ONLY POSTFLIGHT for
-- 20260914_feature_009_db_block_07_migration.DRAFT.sql (RUN A2-PRE3 extended).
--
-- Run this ONLY AFTER the migration has actually been applied (RUN A2, following T010's human
-- approval). Performs NO writes: SELECT statements over the system catalogs and application tables
-- only. Safe to run any number of times.
--
-- HOW TO READ IT: the Supabase SQL Editor shows the result of the LAST statement — the summary query
-- (section 2). Every row must report ok = true.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- SQL-ONLY vs. SEEDED-INTEGRATION-TEST SPLIT (RUN A2-PRE Issue 15)
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- This file proves everything a read-only catalog/data query CAN prove: schema shape, fingerprints,
-- policy text, grant scope, and static data-health invariants. It CANNOT prove BEHAVIOR that requires
-- an authenticated session attempting a real write (RLS/trigger enforcement is evaluated per-session,
-- not visible to a superuser catalog query) — those items are listed in section 3 below and belong to
-- `tests/delivery/*` live suites (T012/T013/T027-T029 in `tasks.md`), run separately with real
-- buyer/warehouse fixture sessions, never here.

-- ============================================================================
-- 1. (optional detail) Current full definitions of the affected functions, for human diffing
--    against the migration file's own CREATE OR REPLACE bodies
-- ============================================================================
select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('validate_shipment_transition', 'validate_shipment_item', 'admin_review_payment', 'apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement')
order by p.proname;

-- ============================================================================
-- 2. SUMMARY — every row must be ok = true
-- ============================================================================
with checks(check_name, ok, expected, actual) as (

  select 'validate_shipment_transition: body matches the migrated (RUN A2-PRE3) fingerprint' as check_name,
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition') = '27148260ac07d2d5e7f2e3e61c2d21aa' as ok,
         '27148260ac07d2d5e7f2e3e61c2d21aa' as expected,
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition') as actual
  union all
  select 'validate_shipment_item: body matches the migrated fingerprint (UNCHANGED this run — no edit was needed for RUN A2-PRE3)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item') = '3ec3db2cd692958b2ad6d9ec5d15eb88',
         '3ec3db2cd692958b2ad6d9ec5d15eb88',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item')
  union all
  select 'admin_review_payment: body matches the migrated fingerprint (ONE new statement added — the settlement-time reservation hook call)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment') = '6c4141a33ac07b564a8f3b0c82a10232',
         '6c4141a33ac07b564a8f3b0c82a10232',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment')
  union all
  select 'apply_delivery_reservation: exists with the migrated fingerprint (new shared reservation primitive)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation') = '4aa0a7c7dd8e39bc12a1d36b63dc21cc',
         '4aa0a7c7dd8e39bc12a1d36b63dc21cc',
         (select coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation'), 'MISSING'))
  union all
  select 'reserve_ready_deliveries_for_settlement: exists with the migrated fingerprint (new settlement-time hook)',
         (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement') = '12226e365e405185845fc4561b87db85',
         '12226e365e405185845fc4561b87db85',
         (select coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement'), 'MISSING'))
  union all

  select 'apply_delivery_reservation and reserve_ready_deliveries_for_settlement: SECURITY DEFINER with search_path pg_catalog, public, auth (both new helpers)',
         (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') = 'search_path=pg_catalog, public, auth') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement')),
         'both prosecdef=true; search_path=pg_catalog, public, auth',
         (select coalesce(string_agg(p.proname || ': prosecdef=' || p.prosecdef || '; ' || coalesce(array_to_string(p.proconfig, ','), '(none)'), ' | '), 'MISSING') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement'))
  union all
  select 'apply_delivery_reservation and reserve_ready_deliveries_for_settlement: NO authenticated/anon/PUBLIC EXECUTE grant (internal-only primitives — a client must never be able to call either directly, bypassing the state machine/finance-operator checks)',
         not exists (select 1 from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name in ('apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement') and g.grantee in ('authenticated', 'anon', 'PUBLIC')),
         'none',
         (select coalesce(string_agg(g.grantee || ':' || g.routine_name, ', '), 'none') from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name in ('apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement') and g.grantee in ('authenticated', 'anon', 'PUBLIC'))
  union all

  select 'trg_shipment_transition is enabled BEFORE INSERT OR UPDATE on order_shipments and bound to validate_shipment_transition',
         exists (
           select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           join pg_namespace n on n.oid = c.relnamespace join pg_proc p on p.oid = t.tgfoid
           where n.nspname = 'public' and c.relname = 'order_shipments' and t.tgname = 'trg_shipment_transition'
             and t.tgenabled = 'O' and not t.tgisinternal and (t.tgtype & 2) <> 0
             and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0 and p.proname = 'validate_shipment_transition'
         ),
         'enabled BEFORE INSERT OR UPDATE, validate_shipment_transition',
         coalesce((select pg_get_triggerdef(t.oid) || '; enabled=' || t.tgenabled::text
           from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'order_shipments' and t.tgname = 'trg_shipment_transition'), 'MISSING')
  union all
  select 'trg_shipment_item_validate remains enabled BEFORE INSERT OR UPDATE on shipment_items and bound to validate_shipment_item',
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

  select 'shipment_items.reserved_quantity_kg exists, numeric(14,3), not null, default 0',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg' and data_type = 'numeric' and is_nullable = 'NO'),
         'present, numeric, NOT NULL',
         (select coalesce((select data_type || ', nullable=' || is_nullable || ', default=' || column_default from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg'), 'MISSING'))
  union all
  select 'order_shipments.settlement_verified_at exists, timestamptz, nullable',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at'),
         'present',
         (select coalesce((select data_type from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at'), 'MISSING'))
  union all
  select 'shipment_items_reserved_quantity_kg_check (>= 0) exists',
         exists (select 1 from pg_constraint where conname = 'shipment_items_reserved_quantity_kg_check'),
         'present',
         (select coalesce((select pg_get_constraintdef(oid) from pg_constraint where conname = 'shipment_items_reserved_quantity_kg_check'), 'MISSING'))
  union all
  select 'shipment_items_reserved_within_planned_check (<= planned_quantity_kg) exists',
         exists (select 1 from pg_constraint where conname = 'shipment_items_reserved_within_planned_check'),
         'present',
         (select coalesce((select pg_get_constraintdef(oid) from pg_constraint where conname = 'shipment_items_reserved_within_planned_check'), 'MISSING'))
  union all

  select 'shipments_buyer_draft_update WITH CHECK is EXACTLY (DRAFT, REQUESTED, CANCELLED) — no broader',
         (select pol.with_check from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'order_shipments' and pol.policyname = 'shipments_buyer_draft_update') = '(status = ANY (ARRAY[''DRAFT''::text, ''REQUESTED''::text, ''CANCELLED''::text]))',
         '(status = ANY (ARRAY[''DRAFT''::text, ''REQUESTED''::text, ''CANCELLED''::text]))',
         (select coalesce((select pol.with_check from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'order_shipments' and pol.policyname = 'shipments_buyer_draft_update'), 'MISSING'))
  union all
  select 'shipments_buyer_draft_update USING is unchanged from the live baseline (ownership + DRAFT-only)',
         (select pol.qual from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'order_shipments' and pol.policyname = 'shipments_buyer_draft_update') like '%status = ''DRAFT''%organization_members%',
         'unchanged ownership/DRAFT-only shape',
         (select coalesce((select pol.qual from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'order_shipments' and pol.policyname = 'shipments_buyer_draft_update'), 'MISSING'))
  union all

  select 'grants did not broaden: no anon/public EXECUTE on validate_shipment_transition, validate_shipment_item, or admin_review_payment',
         not exists (select 1 from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name in ('validate_shipment_transition', 'validate_shipment_item', 'admin_review_payment') and g.grantee in ('anon', 'PUBLIC')),
         'none',
         (select coalesce(string_agg(g.grantee || ':' || g.routine_name, ', '), 'none') from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name in ('validate_shipment_transition', 'validate_shipment_item', 'admin_review_payment') and g.grantee in ('anon', 'PUBLIC'))
  union all
  select 'admin_review_payment: authenticated/service_role EXECUTE grants UNCHANGED (still exactly the same two roles as baseline — CREATE OR REPLACE does not alter ACLs, this confirms it)',
         (select count(*) from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name = 'admin_review_payment' and g.grantee in ('authenticated', 'service_role')) = 2,
         '2 (authenticated, service_role)',
         (select coalesce(string_agg(g.grantee, ', '), 'none') from information_schema.role_routine_grants g where g.routine_schema = 'public' and g.routine_name = 'admin_review_payment' and g.grantee in ('authenticated', 'service_role'))
  union all
  select 'no anon SELECT/UPDATE/INSERT grant exists on order_shipments or shipment_items (public/anon access did not broaden)',
         not exists (select 1 from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in ('order_shipments', 'shipment_items') and g.grantee = 'anon'),
         'none',
         (select coalesce(string_agg(g.grantee || ':' || g.table_name || ':' || g.privilege_type, ', '), 'none') from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in ('order_shipments', 'shipment_items') and g.grantee = 'anon')
  union all
  select 'authenticated table-level UPDATE grant on shipment_items/order_shipments is UNCHANGED (still blanket — the column-tamper protection is trigger-owned, not grant-based, exactly as designed)',
         (select count(*) from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in ('order_shipments', 'shipment_items') and g.grantee = 'authenticated' and g.privilege_type = 'UPDATE') = 2,
         '2 (one per table)',
         (select count(*)::text from information_schema.role_table_grants g where g.table_schema = 'public' and g.table_name in ('order_shipments', 'shipment_items') and g.grantee = 'authenticated' and g.privilege_type = 'UPDATE')
  union all

  select 'structural: no inventory_positions row currently violates available/reserved invariants (post-apply data health)',
         not exists (select 1 from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0 or reserved_quantity_kg > available_quantity_kg),
         'none violating',
         (select coalesce(count(*)::text || ' row(s) violating', 'none violating') from public.inventory_positions where available_quantity_kg < 0 or reserved_quantity_kg < 0 or reserved_quantity_kg > available_quantity_kg)
  union all
  select 'structural: no shipment_items row currently violates the new reserved-quantity invariants (post-apply data health)',
         not exists (select 1 from public.shipment_items where reserved_quantity_kg < 0 or reserved_quantity_kg > planned_quantity_kg),
         'none violating',
         (select coalesce(count(*)::text || ' row(s) violating', 'none violating') from public.shipment_items where reserved_quantity_kg < 0 or reserved_quantity_kg > planned_quantity_kg)
  union all
  select 'structural: no settled READY shipment currently lacks a settlement_verified_at stamp (proves the settlement-time hook actually ran for every order that has settled since apply — a live snapshot, not a guarantee for rows created after this query runs)',
         not exists (select 1 from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status = 'READY' and os.settlement_verified_at is null
             and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')),
         'none violating',
         (select coalesce(count(*)::text || ' row(s) violating', 'none violating') from public.order_shipments os join public.orders o on o.id = os.order_id
           where os.status = 'READY' and os.settlement_verified_at is null
             and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
)
select check_name, ok, expected, actual from checks;

-- ============================================================================
-- 3. REQUIRES A SEEDED LIVE SESSION — NOT provable by this read-only script. Each item below names
--    the exact tests/delivery/* suite (per tasks.md Phase 2/3/5) that must prove it live, with a real
--    buyer/warehouse fixture session, before Feature 009 relies on this migration in application code:
-- ============================================================================
--   a. Settlement gate REFUSES a gated-set/READY-on-settled transition when orders.status is NOT
--      settled, for a real warehouse-operator session (T012/T027).
--   b. Reservation succeeds and moves the correct inventory_positions quantity for a real, settled,
--      owned order (T012/T027).
--   c. A direct client attempt to set shipment_items.reserved_quantity_kg or
--      order_shipments.settlement_verified_at (as buyer or warehouse) is silently discarded by the
--      trigger (never reflected in the stored row), proving the column-tamper protection live, not
--      just by reading the trigger source (T027 — a NEW test this migration's approval should add).
--   d. Concurrent/duplicate reserve and release calls do not double-reserve or double-release
--      (T013/T028 — the exact-once proof).
--   e. Cancel/fail release never increments available_quantity_kg (T029 — direct regression test for
--      RUN A2-PRE Issue 1).
--   f. Full delivery decrements BOTH reserved_quantity_kg and available_quantity_kg by the delivered
--      amount, and updates storage_allocations.released_quantity_kg/status consistently (T029 — direct
--      regression test for Issue 2).
--   g. An order that becomes DISPUTED after a shipment is already reserved refuses further gated
--      progression (RESERVED -> PICKING etc.) even though settlement_verified_at is still set (T029 —
--      direct regression test for Issue 11's live re-check).
--   h. A missing/ambiguous storage_allocations or inventory_positions row FAILS CLOSED (raises,
--      touches nothing) rather than silently proceeding (T029 — direct regression test for Issues 6/9).
--   i. A real reserve and cancel/fail release prove BOTH stored ledgers change IFF: the exact
--      shipment_items.reserved_quantity_kg guard changes together with inventory_positions, not just
--      a SQL UPDATE row count (T013/T028 — required proof of the local trusted marker path).
--   j. A permitted buyer DRAFT INSERT with an attacker-supplied settlement_verified_at stores NULL;
--      a non-DRAFT INSERT is refused (T012/T027 — required INSERT-tamper proof).
--   k. Existing settled-READY/operational-gated rows make the preflight/forward guard stop before
--      DDL, and FAILED/DISPUTED operational re-entry is refused until a dedicated recovery workflow
--      exists (T012/T029).
--   l. RUN A2-PRE3: a shipment already READY while its order is unsettled becomes reserved
--      (reserved_quantity_kg set, inventory_positions decremented, settlement_verified_at stamped)
--      in the SAME admin_review_payment() call that settles the order — for a real finance-operator
--      approval on a fixture order with a pre-existing READY shipment (T012/T029, new for A2-PRE3).
--   m. RUN A2-PRE3: if reserve_ready_deliveries_for_settlement(...) cannot establish a reservation
--      (insufficient inventory / ambiguous or missing allocation), the ENTIRE admin_review_payment()
--      call rolls back — the payment stays unconfirmed, the order status unchanged, the reservation
--      still ACTIVE (T029, new for A2-PRE3, a deliberate negative-fixture test).
--   n. RUN A2-PRE3: two READY shipments drawing on the same inventory_positions row cannot both be
--      reserved by settlement beyond what is actually available — the second is refused with
--      delivery_reservation_insufficient_inventory (T013/T028, new for A2-PRE3).
--   o. RUN A2-PRE3: a deliberately provoked collision between a warehouse operator's concurrent
--      shipment-status UPDATE and a finance operator's concurrent admin_review_payment() on the SAME
--      order resolves as a clean PostgreSQL deadlock abort on exactly one side (SQLSTATE 40P01), with
--      no partial write on either side and a clean retry succeeding afterward (T013/T028, new for
--      A2-PRE3 — proves the documented lock-order inversion in the migration file's own header is
--      safe, not silently corrupting).
