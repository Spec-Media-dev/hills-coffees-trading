-- Read-only postflight for 20260925103000_feature_013_delivery_destinations.sql (Feature 013 M2a, T030).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED'. Run right after the apply.
with checks(seq, check_name, ok) as (
  select 1, 'delivery_destinations exists with the data-model §2.3 columns (16)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'delivery_destinations'
       and column_name in ('id', 'organization_id', 'label', 'country_code', 'city', 'address_line_1', 'address_line_2', 'contact_name',
                           'contact_phone', 'delivery_method', 'is_default', 'retired_at', 'retired_by', 'created_by', 'created_at', 'updated_at')) = 16
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'delivery_destinations') = 16
  union all
  select 2, 'NOT NULL: organization_id, label, country_code, city, address_line_1, contact_name, contact_phone, delivery_method, is_default, created_by',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'delivery_destinations' and is_nullable = 'NO'
       and column_name in ('organization_id', 'label', 'country_code', 'city', 'address_line_1', 'contact_name', 'contact_phone',
                           'delivery_method', 'is_default', 'created_by')) = 10
  union all
  select 3, 'delivery_method CHECK = the T006 value set {Courier}',
    coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
              where c.conrelid = 'public.delivery_destinations'::regclass and c.conname = 'delivery_destinations_delivery_method_check')
             = array['Courier'], false)
  union all
  select 4, 'every delivery method in use is in the CHECK set (shipping_rules and order_shipments)',
    not exists (select 1 from public.shipping_rules where delivery_method <> 'Courier')
    and not exists (select 1 from public.order_shipments where delivery_method <> 'Courier')
  union all
  select 5, 'country ISO-2 / E.164 phone / field-length / retired-pair / retired-not-default CHECKs present',
    (select count(*) from pg_constraint where conrelid = 'public.delivery_destinations'::regclass and contype = 'c'
       and conname in ('delivery_destinations_label_check', 'delivery_destinations_country_code_check', 'delivery_destinations_city_check',
                       'delivery_destinations_address_line_1_check', 'delivery_destinations_address_line_2_check',
                       'delivery_destinations_contact_name_check', 'delivery_destinations_contact_phone_check',
                       'delivery_destinations_retired_pair_check', 'delivery_destinations_retired_not_default_check')) = 9
  union all
  select 6, 'one non-retired default per organization (unique partial index)',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.uq_delivery_destination_default_per_org') and i.indisunique
            and pg_get_indexdef(i.indexrelid) like '%(organization_id)%' and pg_get_indexdef(i.indexrelid) like '%is_default%'
            and pg_get_indexdef(i.indexrelid) like '%retired_at IS NULL%')
    and to_regclass('public.idx_delivery_destinations_active_org') is not null
  union all
  select 7, 'RLS enabled + forced; exactly one policy: SELECT to authenticated for org members or platform admin',
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.delivery_destinations'::regclass)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'delivery_destinations') = 1
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'delivery_destinations'
                and policyname = 'delivery_destinations_member_read' and cmd = 'SELECT' and roles = '{authenticated}'
                and qual like '%is_org_member(organization_id)%' and qual like '%is_platform_admin()%')
  union all
  select 8, 'no client write path: anon nothing; authenticated SELECT only; PUBLIC nothing',
    not has_table_privilege('anon', 'public.delivery_destinations', 'select, insert, update, delete, truncate, references, trigger')
    and has_table_privilege('authenticated', 'public.delivery_destinations', 'select')
    and not has_table_privilege('authenticated', 'public.delivery_destinations', 'insert, update, delete, truncate, references, trigger')
    and not has_table_privilege('public', 'public.delivery_destinations', 'insert, update, delete, truncate')
  union all
  select 9, 'updated_at maintained by set_updated_at',
    exists (select 1 from pg_trigger where tgrelid = 'public.delivery_destinations'::regclass and tgname = 'trg_delivery_destinations_updated_at'
            and tgfoid = 'public.set_updated_at()'::regprocedure)
  union all
  select 10, 'orders.delivery_destination_id (FK → delivery_destinations) and orders.destination_snapshot (jsonb) exist; pair + shape CHECKs',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'delivery_destination_id' and data_type = 'uuid')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'destination_snapshot' and data_type = 'jsonb')
    and exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and contype = 'f'
                and confrelid = 'public.delivery_destinations'::regclass)
    and exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_destination_pair_check')
    and exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_destination_snapshot_shape_check')
  union all
  select 11, 'no order carries a destination yet and no destination row exists (no backfill)',
    not exists (select 1 from public.orders where delivery_destination_id is not null or destination_snapshot is not null)
    and not exists (select 1 from public.delivery_destinations)
  union all
  select 12, 'orders destination guard trigger bound (BEFORE INSERT OR UPDATE OF the two columns)',
    exists (select 1 from pg_trigger t where t.tgrelid = 'public.orders'::regclass and t.tgname = 'trg_orders_destination_fields_guard'
            and t.tgfoid = 'public.guard_order_destination_fields()'::regprocedure and t.tgenabled = 'O')
    and not has_function_privilege('anon', 'public.guard_order_destination_fields()', 'execute')
    and not has_function_privilege('public', 'public.guard_order_destination_fields()', 'execute')
  union all
  select 13, 'M1 untouched: validate_order_transition v2 fingerprint and trg_order_transition binding',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_order_transition')
  union all
  select 14, 'existing orders policies unchanged (orders_create_buyer, orders_update_buyer_or_admin, orders_view; 3 total)',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'orders') = 3
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'orders'
           and policyname in ('orders_create_buyer', 'orders_update_buyer_or_admin', 'orders_view')) = 3
  union all
  select 15, 'every order is still LEGACY and checkout is still disabled',
    not exists (select 1 from public.orders where commerce_flow <> 'LEGACY')
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
  union all
  select 16, 'no Feature 013 object beyond M2a exists yet (M2b+ not applied)',
    to_regclass('public.proforma_line_economics') is null and to_regclass('public.reconciliation_cases') is null
    and to_regclass('public.offer_price_tiers') is null and to_regclass('public.notification_events') is null
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
