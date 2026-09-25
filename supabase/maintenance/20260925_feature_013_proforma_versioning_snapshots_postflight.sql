-- Read-only postflight for 20260925106000_feature_013_proforma_versioning_snapshots.sql (Feature 013 M2b, T036).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED'. Run right after the apply.
with new_tables(t) as (
  values ('proforma_fulfillment_groups'), ('proforma_line_economics'), ('proforma_seller_settlements'), ('proforma_bank_instructions')
),
snapshot_tables(t) as (
  select t from new_tables union all select 'proforma_invoices' union all select 'proforma_invoice_items' union all select 'order_financials'
),
m2b_functions(sig, definer) as (
  values ('public.protect_proforma_snapshot()', true), ('public.prevent_snapshot_mutation()', false),
         ('public.check_seller_settlement_totals()', true), ('public.check_proforma_snapshot_totals()', true),
         ('public.freeze_order_financials()', true), ('public.guard_order_proforma_pointer()', false),
         ('public.write_audit_log_proforma_invoices()', true), ('public.write_audit_log_proforma_bank_instructions()', true)
),
checks(seq, check_name, ok) as (
  select 1, 'proforma versioning: proforma_invoices_order_id_key gone; UNIQUE (order_id, version); one open proforma per order',
    not exists (select 1 from pg_constraint where conrelid = 'public.proforma_invoices'::regclass and conname = 'proforma_invoices_order_id_key')
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.proforma_invoices'::regclass
           and conname = 'proforma_invoices_order_version_key') = 'UNIQUE (order_id, version)'
    and (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = to_regclass('public.uq_open_proforma_per_order'))
        = 'CREATE UNIQUE INDEX uq_open_proforma_per_order ON public.proforma_invoices USING btree (order_id) WHERE (status = ANY (ARRAY[''ISSUED''::text, ''CONFIRMED''::text, ''PAID''::text]))'
  union all
  select 2, 'proforma status CHECK = {ISSUED, CONFIRMED, PAID, EXPIRED, SUPERSEDED, CANCELLED, VOID}',
    coalesce((select array_agg(m[1] order by m[1]) from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') m
              where c.conrelid = 'public.proforma_invoices'::regclass and c.conname = 'proforma_invoices_status_check')
             = array['CANCELLED', 'CONFIRMED', 'EXPIRED', 'ISSUED', 'PAID', 'SUPERSEDED', 'VOID'], false)
  union all
  select 3, 'proforma_invoices: the 24 §3.1 columns; the six header totals numeric(14,2) NOT NULL DEFAULT 0',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_invoices'
       and column_name in ('version', 'supersedes_proforma_id', 'validity_hours_snapshot', 'currency', 'merchandise_gross', 'discount_total',
                           'merchandise_net', 'shipping_total', 'vat_total', 'buyer_total', 'tax_rule_id', 'tax_rate_snapshot',
                           'tax_base_snapshot', 'promotion_code_snapshot', 'buyer_snapshot', 'destination_snapshot', 'bank_account_masked',
                           'confirmed_at', 'confirmed_by', 'expired_at', 'cancelled_at', 'voided_at', 'issued_by', 'updated_at')) = 24
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_invoices'
           and column_name in ('merchandise_gross', 'discount_total', 'merchandise_net', 'shipping_total', 'vat_total', 'buyer_total')
           and data_type = 'numeric' and numeric_precision = 14 and numeric_scale = 2 and is_nullable = 'NO' and column_default = '0') = 6
  union all
  select 4, 'proforma header CHECK identities, snapshot marker, legacy placeholder, validity, masked-bank and lifecycle CHECKs present',
    (select count(*) from pg_constraint where conrelid = 'public.proforma_invoices'::regclass and contype = 'c'
       and conname in ('proforma_invoices_version_check', 'proforma_invoices_supersedes_check', 'proforma_invoices_currency_check',
                       'proforma_invoices_amounts_nonnegative_check', 'proforma_invoices_merchandise_net_check', 'proforma_invoices_buyer_total_check',
                       'proforma_invoices_snapshot_marker_check', 'proforma_invoices_legacy_placeholder_check', 'proforma_invoices_validity_check',
                       'proforma_invoices_tax_snapshot_check', 'proforma_invoices_promotion_code_check', 'proforma_invoices_buyer_snapshot_shape_check',
                       'proforma_invoices_destination_snapshot_shape_check', 'proforma_invoices_bank_account_masked_check',
                       'proforma_invoices_lifecycle_check')) = 15
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.proforma_invoices'::regclass
           and conname = 'proforma_invoices_buyer_total_check') = 'CHECK ((buyer_total = ((merchandise_net + shipping_total) + vat_total)))'
    and (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.proforma_invoices'::regclass
           and conname = 'proforma_invoices_merchandise_net_check') = 'CHECK ((merchandise_net = (merchandise_gross - discount_total)))'
  union all
  select 5, 'every existing proforma is a LEGACY row with placeholder values (no Feature 013 proforma yet), ≤ 1 per order',
    not exists (select 1 from public.proforma_invoices where validity_hours_snapshot is not null or version <> 1 or buyer_total <> 0)
    and not exists (select 1 from public.proforma_invoices group by order_id having count(*) > 1)
  union all
  select 6, 'proforma_invoice_items: the 24 §3.2 columns, the marker/identity/promotion/cap CHECKs and the same-group foreign key',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_invoice_items'
       and column_name in ('offer_id', 'offer_code_snapshot', 'seller_organization_id', 'seller_type_snapshot', 'warehouse_id', 'fulfillment_group_id',
                           'list_unit_price', 'price_tier_id', 'gross_amount', 'promotion_id', 'promotion_scope_snapshot', 'promotion_funding_source',
                           'promotion_code_applied', 'promotion_rule_snapshot', 'promotion_raw_amount', 'discount_amount', 'discount_capped',
                           'discount_cap_reason', 'net_amount', 'vat_amount', 'line_total', 'product_name_snapshot', 'origin_name_snapshot',
                           'lot_code_snapshot')) = 24
    and (select count(*) from pg_constraint where conrelid = 'public.proforma_invoice_items'::regclass
           and conname in ('proforma_invoice_items_snapshot_marker_check', 'proforma_invoice_items_seller_type_check', 'proforma_invoice_items_unit_price_check',
                           'proforma_invoice_items_gross_check', 'proforma_invoice_items_discount_check', 'proforma_invoice_items_net_check',
                           'proforma_invoice_items_line_total_check', 'proforma_invoice_items_promotion_fields_check',
                           'proforma_invoice_items_promotion_discount_check', 'proforma_invoice_items_promotion_values_check',
                           'proforma_invoice_items_funding_scope_check', 'proforma_invoice_items_hills_line_funding_check',
                           'proforma_invoice_items_cap_check', 'proforma_invoice_items_economics_key',
                           'proforma_invoice_items_fulfillment_group_fkey')) = 15
    and not exists (select 1 from public.proforma_invoice_items where seller_type_snapshot is not null)
  union all
  select 7, 'the four snapshot tables exist with their data-model column counts (groups 10, economics 17, settlements 15, bank 9)',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_fulfillment_groups') = 10
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_line_economics') = 17
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_seller_settlements') = 15
    and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'proforma_bank_instructions') = 9
  union all
  select 8, 'seller commission assignment snapshotted per line AND per settlement (policy, tier, rate, Q_s); no override table',
    (select count(*) from information_schema.columns where table_schema = 'public'
       and table_name in ('proforma_line_economics', 'proforma_seller_settlements')
       and column_name in ('commission_policy_id', 'commission_tier_id', 'commission_rate_snapshot', 'seller_qualifying_quantity_kg')) = 8
    and not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                    and c.relname like '%commission%' and c.relname not in ('commission_policies', 'commission_tiers'))
  union all
  select 9, 'FIN-006/007/011/012 line-economics CHECKs + the line foreign key (proforma, seller, type, gross, net) present',
    (select count(*) from pg_constraint where conrelid = 'public.proforma_line_economics'::regclass
       and conname in ('proforma_line_economics_amounts_nonnegative_check', 'proforma_line_economics_single_funder_check',
                       'proforma_line_economics_buyer_net_check', 'proforma_line_economics_member_check', 'proforma_line_economics_hills_check',
                       'proforma_line_economics_item_fkey', 'proforma_line_economics_seller_type_check')) = 7
    and (select count(*) from pg_constraint where conrelid = 'public.proforma_seller_settlements'::regclass
           and conname in ('proforma_seller_settlements_amounts_nonnegative_check', 'proforma_seller_settlements_buyer_net_check',
                           'proforma_seller_settlements_member_check', 'proforma_seller_settlements_hills_check',
                           'proforma_seller_settlements_pkey')) = 5
  union all
  select 10, 'new tables: RLS enabled + forced, no policy; anon/authenticated/PUBLIC nothing; service_role SELECT only',
    (select count(*) from pg_class c join new_tables n on c.oid = ('public.' || n.t)::regclass where c.relrowsecurity and c.relforcerowsecurity) = 4
    and not exists (select 1 from pg_policies p join new_tables n on p.tablename = n.t where p.schemaname = 'public')
    and not exists (select 1 from new_tables n
                    where has_table_privilege('anon', 'public.' || n.t, 'select, insert, update, delete, truncate, references, trigger')
                       or has_table_privilege('authenticated', 'public.' || n.t, 'select, insert, update, delete, truncate, references, trigger')
                       or has_table_privilege('public', 'public.' || n.t, 'select, insert, update, delete, truncate')
                       or has_table_privilege('service_role', 'public.' || n.t, 'insert, update, delete, truncate, references, trigger')
                       or not has_table_privilege('service_role', 'public.' || n.t, 'select'))
  union all
  select 11, 'the new snapshot tables are empty',
    not exists (select 1 from public.proforma_fulfillment_groups) and not exists (select 1 from public.proforma_line_economics)
    and not exists (select 1 from public.proforma_seller_settlements) and not exists (select 1 from public.proforma_bank_instructions)
  union all
  select 12, 'immutability: protect_proforma_snapshot BEFORE INSERT/UPDATE/DELETE; prevent_snapshot_mutation BEFORE UPDATE/DELETE on 5 tables',
    exists (select 1 from pg_trigger where tgrelid = 'public.proforma_invoices'::regclass and tgname = 'trg_proforma_invoices_protect_snapshot'
            and tgfoid = 'public.protect_proforma_snapshot()'::regprocedure and tgenabled = 'O' and tgtype = 31)
    and (select count(*) from pg_trigger where tgfoid = 'public.prevent_snapshot_mutation()'::regprocedure and tgenabled = 'O' and tgtype = 27
           and tgrelid in ('public.proforma_invoice_items'::regclass, 'public.proforma_line_economics'::regclass,
                           'public.proforma_fulfillment_groups'::regclass, 'public.proforma_seller_settlements'::regclass,
                           'public.proforma_bank_instructions'::regclass)) = 5
  union all
  select 13, 'deferred checks: check_seller_settlement_totals ×2 and check_proforma_snapshot_totals ×7, all DEFERRABLE INITIALLY DEFERRED',
    (select count(*) from pg_trigger where tgfoid = 'public.check_seller_settlement_totals()'::regprocedure
       and tgdeferrable and tginitdeferred and tgconstraint <> 0 and tgenabled = 'O') = 2
    and (select count(*) from pg_trigger where tgfoid = 'public.check_proforma_snapshot_totals()'::regprocedure
           and tgdeferrable and tginitdeferred and tgconstraint <> 0 and tgenabled = 'O') = 7
  union all
  select 14, 'freeze_order_financials BEFORE INSERT/UPDATE/DELETE on order_financials; order pointer guard on orders',
    exists (select 1 from pg_trigger where tgrelid = 'public.order_financials'::regclass and tgname = 'trg_order_financials_freeze'
            and tgfoid = 'public.freeze_order_financials()'::regprocedure and tgenabled = 'O' and tgtype = 31)
    and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_orders_proforma_pointer_guard'
                and tgfoid = 'public.guard_order_proforma_pointer()'::regprocedure and tgenabled = 'O')
  union all
  select 15, 'AUD-006 / T029 R2: no generic write_audit_log trigger on any proforma table or order_financials; only the two redacted ones',
    not exists (select 1 from pg_trigger t join snapshot_tables s on t.tgrelid = ('public.' || s.t)::regclass
                where t.tgfoid = 'public.write_audit_log()'::regprocedure)
    and exists (select 1 from pg_trigger where tgrelid = 'public.proforma_invoices'::regclass and tgname = 'trg_audit_proforma_invoices'
                and tgfoid = 'public.write_audit_log_proforma_invoices()'::regprocedure)
    and exists (select 1 from pg_trigger where tgrelid = 'public.proforma_bank_instructions'::regclass and tgname = 'trg_audit_proforma_bank_instructions'
                and tgfoid = 'public.write_audit_log_proforma_bank_instructions()'::regprocedure)
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_proforma_invoices()'::regprocedure) not like '%to_jsonb(new)%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_proforma_invoices()'::regprocedure) not like '%new.destination_snapshot%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_proforma_invoices()'::regprocedure) not like '%new.buyer_snapshot%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_proforma_bank_instructions()'::regprocedure) not like '%''account_number'', new.account_number%'
    and (select prosrc from pg_proc where oid = 'public.write_audit_log_proforma_bank_instructions()'::regprocedure) not like '%''iban'', new.iban%'
  union all
 select 16, 'M2b functions: SECURITY DEFINER as designed, search_path pinned, no anon/PUBLIC EXECUTE',
  (
    select count(*)
    from m2b_functions f
    join pg_proc p on p.oid = to_regprocedure(f.sig)
    where p.prosecdef = f.definer
      and exists (
        select 1
        from unnest(p.proconfig) c
        where c like 'search_path=%'
      )
      and not has_function_privilege('anon', p.oid, 'execute')
      and not exists (
        select 1
        from unnest(coalesce(p.proacl, acldefault('f', p.proowner))) acl_item
        where acl_item::text like '=%'
          and acl_item::text like '%X%'
      )
  ) = 8
union all
  select 17, 'checkout_order(uuid) = the M2b body (one statement changed); SECURITY DEFINER; EXECUTE authenticated + service_role only',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.checkout_order(uuid)'::regprocedure) = '54810aadbcb05915d49374d5ceae738e'
    and (select prosecdef from pg_proc where oid = 'public.checkout_order(uuid)'::regprocedure)
    and not has_function_privilege('anon', 'public.checkout_order(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.checkout_order(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.checkout_order(uuid)', 'execute')
  union all
  select 18, 'orders.current_proforma_id (same-order composite FK) exists; no order points to a proforma yet',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'current_proforma_id' and data_type = 'uuid')
    and exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_current_proforma_fkey'
                and confrelid = 'public.proforma_invoices'::regclass)
    and not exists (select 1 from public.orders where current_proforma_id is not null)
  union all
  select 19, 'order_financials: proforma pointer + discount/Hills-share columns; every row a LEGACY placeholder',
    (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'order_financials'
       and column_name in ('proforma_id', 'discount_amount', 'seller_funded_discount', 'hills_funded_discount', 'hills_share_amount')) = 5
    and (select count(*) from pg_constraint where conrelid = 'public.order_financials'::regclass
           and conname in ('order_financials_proforma_fkey', 'order_financials_discounts_check', 'order_financials_legacy_placeholder_check')) = 3
    and not exists (select 1 from public.order_financials where proforma_id is not null)
  union all
  select 20, 'no foreign key from a snapshot into a Feature 010 configuration table added by M2b',
    not exists (select 1 from pg_constraint c join snapshot_tables s on c.conrelid = ('public.' || s.t)::regclass
                where c.contype = 'f' and c.conname not in ('order_financials_commission_policy_id_fkey', 'order_financials_tax_rule_id_fkey')
                  and c.confrelid in ('public.commission_policies'::regclass, 'public.commission_tiers'::regclass, 'public.tax_rules'::regclass,
                                      'public.shipping_rules'::regclass, 'public.payment_accounts'::regclass))
  union all
  select 21, 'existing proforma/financial read policies unchanged (proforma_view, proforma_items_view, financials_view)',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_invoices' and policyname = 'proforma_view'
            and cmd = 'SELECT' and qual = 'can_view_order(order_id)')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_invoice_items' and policyname = 'proforma_items_view' and cmd = 'SELECT')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_financials' and policyname = 'financials_view' and cmd = 'SELECT')
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'proforma_invoices') = 1
  union all
  select 22, 'M1/M2a untouched: validate_order_transition v2 fingerprint; destination guard bound; checkout still disabled',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_orders_destination_fields_guard')
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
    and not exists (select 1 from public.orders where commerce_flow = 'BANK_TRANSFER_V1' and status <> 'DRAFT')
  union all
  select 23, 'no Feature 013 object beyond M2b exists yet (M2c+ not applied)',
    to_regclass('public.reconciliation_cases') is null and to_regclass('public.offer_price_tiers') is null
    and to_regclass('public.notification_events') is null
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
