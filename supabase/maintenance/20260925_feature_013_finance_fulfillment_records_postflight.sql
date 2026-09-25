-- Read-only postflight for 20260925109000_feature_013_finance_fulfillment_records.sql (Feature 013 M2c, T042).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED'. Run right after the apply:
--   npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_finance_fulfillment_records_postflight.sql
with new_tables(t) as (
  values ('reconciliation_cases'), ('reconciliation_case_events'), ('manual_financial_adjustments')
),
m2c_functions(sig, definer) as (
  values ('public.next_tax_invoice_code()', false), ('public.next_reconciliation_case_code()', false),
         ('public.guard_reconciliation_case()', true), ('public.record_reconciliation_case_event()', true),
         ('public.validate_manual_financial_adjustment()', true), ('public.protect_tax_invoice()', true),
         ('public.guard_fulfillment_shipment_fields()', true)
),
checks(seq, check_name, ok) as (
  select 1, 'reconciliation_cases: the data-model §5.4 columns (18) with kind/status/resolution CHECK sets',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'reconciliation_cases') = 18
    and (select count(*) from pg_constraint where conrelid = 'public.reconciliation_cases'::regclass and contype = 'c'
           and conname in ('reconciliation_cases_kind_check', 'reconciliation_cases_status_check', 'reconciliation_cases_resolution_type_check',
                           'reconciliation_cases_resolved_pair_check', 'reconciliation_cases_closed_check', 'reconciliation_cases_resolution_check',
                           'reconciliation_cases_linked_order_check', 'reconciliation_cases_observed_amount_check',
                           'reconciliation_cases_observed_currency_check')) = 9
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.reconciliation_cases'::regclass and c.conname = 'reconciliation_cases_status_check')
                 = array['CLOSED_NO_ACTION', 'IN_REVIEW', 'OPEN', 'RESOLVED'], false)
  union all
  select 2, 'reconciliation_cases: REC- case codes from their own sequence; queue index (status, opened_at)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reconciliation_cases'
            and column_name = 'case_code' and column_default = 'next_reconciliation_case_code()')
    and to_regclass('public.reconciliation_case_code_seq') is not null
    and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_reconciliation_cases_queue' and indexdef like '%(status, opened_at)%')
  union all
  select 3, 'no inventory column on the reconciliation tables (AC-009)',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('reconciliation_cases', 'reconciliation_case_events')
                and (column_name like '%quantity%' or column_name like '%inventory%' or column_name like '%reservation%' or column_name like '%lot%'))
  union all
  select 4, 'reconciliation_case_events and manual_financial_adjustments exist (7 and 11 columns)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'reconciliation_case_events') = 7
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'manual_financial_adjustments') = 11
    and coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
                  where c.conrelid = 'public.manual_financial_adjustments'::regclass and c.conname = 'manual_financial_adjustments_kind_check')
                 = array['CORRECTION', 'REFUND_EXTERNAL', 'REVERSAL'], false)
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'manual_financial_adjustments'
                and column_name = 'reason' and is_nullable = 'NO')
  union all
  select 5, 'append-only: prevent_snapshot_mutation BEFORE UPDATE OR DELETE on the events and the adjustments',
    (select count(*) from pg_trigger where tgfoid = 'public.prevent_snapshot_mutation()'::regprocedure and tgenabled = 'O' and tgtype = 27
       and tgrelid in ('public.reconciliation_case_events'::regclass, 'public.manual_financial_adjustments'::regclass)) = 2
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.prevent_snapshot_mutation()'::regprocedure) = '286e02091213c1be4236b144dff1f383'
  union all
  select 6, 'reconciliation case guard (BEFORE INSERT/UPDATE/DELETE), history trigger (AFTER INSERT/UPDATE OF status), adjustment validator',
    exists (select 1 from pg_trigger where tgrelid = 'public.reconciliation_cases'::regclass and tgname = 'trg_reconciliation_cases_guard'
            and tgfoid = 'public.guard_reconciliation_case()'::regprocedure and tgenabled = 'O' and tgtype = 31)
    and exists (select 1 from pg_trigger where tgrelid = 'public.reconciliation_cases'::regclass and tgname = 'trg_reconciliation_cases_history'
                and tgfoid = 'public.record_reconciliation_case_event()'::regprocedure and tgenabled = 'O')
    and exists (select 1 from pg_trigger where tgrelid = 'public.manual_financial_adjustments'::regclass and tgname = 'trg_manual_financial_adjustments_validate'
                and tgfoid = 'public.validate_manual_financial_adjustment()'::regprocedure and tgenabled = 'O')
  union all
  select 7, 'new tables: RLS enabled + forced, no policy; anon/authenticated/PUBLIC nothing; service_role SELECT only',
    (select count(*) from pg_class c join new_tables n on c.oid = ('public.' || n.t)::regclass where c.relrowsecurity and c.relforcerowsecurity) = 3
    and not exists (select 1 from pg_policies p join new_tables n on p.tablename = n.t where p.schemaname = 'public')
    and not exists (select 1 from new_tables n
                    where has_table_privilege('anon', 'public.' || n.t, 'select, insert, update, delete, truncate, references, trigger')
                       or has_table_privilege('authenticated', 'public.' || n.t, 'select, insert, update, delete, truncate, references, trigger')
                       or has_table_privilege('public', 'public.' || n.t, 'select, insert, update, delete, truncate')
                       or has_table_privilege('service_role', 'public.' || n.t, 'insert, update, delete, truncate, references, trigger')
                       or not has_table_privilege('service_role', 'public.' || n.t, 'select'))
  union all
  select 8, 'the new tables are empty',
    not exists (select 1 from public.reconciliation_cases) and not exists (select 1 from public.reconciliation_case_events)
    and not exists (select 1 from public.manual_financial_adjustments)
  union all
  select 9, 'tax_invoices §5.6: file_asset_id/uploaded_by nullable; status/proforma_id/issued_by/issued_at_ts/snapshot added; UNIQUE(order_id) kept',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices'
       and column_name in ('file_asset_id', 'uploaded_by') and is_nullable = 'YES') = 2
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices'
           and column_name in ('status', 'proforma_id', 'issued_by', 'issued_at_ts', 'snapshot')) = 5
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices') = 12
    and exists (select 1 from pg_constraint where conrelid = 'public.tax_invoices'::regclass and conname = 'tax_invoices_order_id_key'
                and pg_get_constraintdef(oid) = 'UNIQUE (order_id)')
  union all
  select 10, 'tax_invoices: INV- numbers from tax_invoice_code_seq; status {ISSUED, VOID}; same-order proforma FK; legacy/F013 shape and no-bank CHECKs',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices'
            and column_name = 'invoice_number' and column_default = 'next_tax_invoice_code()')
    and to_regclass('public.tax_invoice_code_seq') is not null
    and (select count(*) from pg_constraint where conrelid = 'public.tax_invoices'::regclass
           and conname in ('tax_invoices_status_check', 'tax_invoices_proforma_fkey', 'tax_invoices_legacy_shape_check',
                           'tax_invoices_feature_013_shape_check', 'tax_invoices_snapshot_no_bank_check')) = 5
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.tax_invoices'::regclass and conname = 'tax_invoices_proforma_fkey')
        = 'FOREIGN KEY (proforma_id, order_id) REFERENCES proforma_invoices(id, order_id)'
  union all
  select 11, 'tax_invoices: protect_tax_invoice BEFORE INSERT/UPDATE/DELETE; existing policies unchanged; every existing invoice LEGACY-shaped',
    exists (select 1 from pg_trigger where tgrelid = 'public.tax_invoices'::regclass and tgname = 'trg_tax_invoices_protect'
            and tgfoid = 'public.protect_tax_invoice()'::regprocedure and tgenabled = 'O' and tgtype = 31)
    and (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'tax_invoices')
        = 'tax_invoice_finance, tax_invoice_view'
    and not exists (select 1 from public.tax_invoices where proforma_id is not null or snapshot is not null or file_asset_id is null or uploaded_by is null)
  union all
  select 12, 'order_shipments R-13: shipment_kind (DELIVERY_REQUEST default | FULFILLMENT) + group seller/warehouse/group columns + fields CHECK',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments'
            and column_name = 'shipment_kind' and is_nullable = 'NO' and column_default = '''DELIVERY_REQUEST''::text')
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments'
           and column_name in ('fulfillment_seller_organization_id', 'fulfillment_warehouse_id', 'proforma_fulfillment_group_id')) = 3
    and (select count(*) from pg_constraint where conrelid = 'public.order_shipments'::regclass
           and conname in ('order_shipments_shipment_kind_check', 'order_shipments_fulfillment_fields_check')) = 2
  union all
  select 13, 'one FULFILLMENT shipment per order × seller × warehouse (unique partial index, AC-012)',
    (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = to_regclass('public.uq_order_shipment_fulfillment_group'))
      = 'CREATE UNIQUE INDEX uq_order_shipment_fulfillment_group ON public.order_shipments USING btree (order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id) WHERE (shipment_kind = ''FULFILLMENT''::text)'
  union all
  select 14, 'every existing shipment is a DELIVERY_REQUEST (no FULFILLMENT row yet); the Feature 009 triggers are unchanged + the fulfillment guard',
    not exists (select 1 from public.order_shipments where shipment_kind <> 'DELIVERY_REQUEST' or proforma_fulfillment_group_id is not null)
    and (select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgrelid = 'public.order_shipments'::regclass and not tgisinternal)
        = 'trg_order_shipments_fulfillment_guard, trg_order_shipments_inventory_hold_guard, trg_shipment_ready, trg_shipment_transition, trg_shipments_updated_at'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_shipment_transition()'::regprocedure) = '27148260ac07d2d5e7f2e3e61c2d21aa'
  union all
  select 15, 'existing order_shipments policies unchanged (buyer insert/draft update, view, warehouse manage)',
    (select string_agg(policyname, ', ' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'order_shipments')
      = 'shipments_buyer_draft_update, shipments_buyer_insert, shipments_view, shipments_warehouse_manage'
  union all
  select 16, 'M2c functions: SECURITY DEFINER as designed, search_path pinned, no anon/PUBLIC EXECUTE',
    (select count(*) from m2c_functions f join pg_proc p on p.oid = to_regprocedure(f.sig)
       where p.prosecdef = f.definer
         and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
         and not has_function_privilege('anon', p.oid, 'execute')
         and not exists (select 1 from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
                         where acl_item::text like '=%' and acl_item::text like '%X%')) = 7
  union all
  select 17, 'no generic write_audit_log trigger on any M2c table (AUD-006)',
    not exists (select 1 from pg_trigger where tgfoid = 'public.write_audit_log()'::regprocedure
                and tgrelid in ('public.reconciliation_cases'::regclass, 'public.reconciliation_case_events'::regclass,
                                'public.manual_financial_adjustments'::regclass, 'public.tax_invoices'::regclass))
  union all
  select 18, 'M1/M2a/M2b untouched: validate_order_transition v2, checkout_order M2b body, M2b snapshot tables empty, checkout disabled',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.checkout_order(uuid)'::regprocedure) = '54810aadbcb05915d49374d5ceae738e'
    and not exists (select 1 from public.proforma_invoices where validity_hours_snapshot is not null)
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
  union all
  select 19, 'no Feature 013 object beyond M2c exists yet (M2d+ not applied)',
    to_regclass('public.offer_price_tiers') is null and to_regclass('public.promotions') is null and to_regclass('public.notification_events') is null
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
