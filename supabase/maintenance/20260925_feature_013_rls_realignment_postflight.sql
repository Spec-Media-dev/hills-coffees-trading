-- Read-only postflight for 20260925120000_feature_013_rls_realignment.sql (Feature 013 M3, T061).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED' (23 rows). Run right after the apply:
--   npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_rls_realignment_postflight.sql
with pol as (
  select tablename, policyname, permissive, roles::text as roles, cmd, coalesce(qual, '') as q, coalesce(with_check, '') as w
  from pg_policies where schemaname = 'public'
),
m2 as (
  select unnest(array['proforma_line_economics', 'proforma_fulfillment_groups', 'proforma_seller_settlements', 'proforma_bank_instructions',
                      'reconciliation_cases', 'reconciliation_case_events', 'manual_financial_adjustments']) as t
),
gated as (
  select unnest(array['orders', 'order_items', 'order_financials', 'proforma_invoices', 'proforma_invoice_items', 'proforma_line_economics',
                      'proforma_fulfillment_groups', 'proforma_seller_settlements', 'proforma_bank_instructions', 'payments', 'payment_proofs',
                      'payment_reviews', 'reconciliation_cases', 'reconciliation_case_events', 'manual_financial_adjustments', 'tax_invoices', 'payouts',
                      'inventory_reservations', 'order_shipments', 'shipment_items', 'delivery_destinations', 'offer_price_tiers', 'promotions',
                      'promotion_targets']) as t
),
views(v) as (
  values ('v_audit_payments'), ('v_audit_proformas'), ('v_buyer_reconciliation'), ('v_finance_review_queue'), ('v_seller_order_lines')
),
rowfns(f) as (
  values ('public.audit_payment_rows()'), ('public.audit_proforma_rows()'), ('public.buyer_reconciliation_rows()'), ('public.finance_review_queue_rows()')
),
checks(seq, check_name, ok) as (
  select 1, 'helpers: is_order_buyer_member / is_order_line_seller (definer, search_path pinned, authenticated+service_role, not anon); order_seller_org_ids internal (service_role only)',
    (select count(*) from pg_proc p where p.oid in ('public.is_order_buyer_member(uuid)'::regprocedure, 'public.is_order_line_seller(uuid)'::regprocedure, 'public.order_seller_org_ids(uuid)'::regprocedure)
       and p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=pg_catalog, public')) = 3
    and has_function_privilege('authenticated', 'public.is_order_buyer_member(uuid)', 'execute') and has_function_privilege('authenticated', 'public.is_order_line_seller(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.is_order_buyer_member(uuid)', 'execute') and not has_function_privilege('anon', 'public.is_order_line_seller(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.order_seller_org_ids(uuid)', 'execute') and has_function_privilege('service_role', 'public.order_seller_org_ids(uuid)', 'execute')
  union all
  select 2, 'the 15 replaced T006 policies are gone',
    not exists (select 1 from pol where policyname in ('order_items_view', 'financials_view', 'financials_finance_read', 'proforma_view', 'proforma_items_view', 'payments_view',
      'payments_finance_read', 'payment_proofs_view', 'payment_proofs_finance_read', 'payment_reviews_finance', 'tax_invoice_view', 'tax_invoice_finance', 'payouts_finance',
      'shipments_view', 'shipment_items_view'))
  union all
  select 3, 'the 18 M3 read policies exist: PERMISSIVE SELECT TO authenticated; none on a finance/snapshot table references can_view_order',
    (select count(*) from pol where policyname in ('order_items_read', 'order_financials_read', 'proforma_invoices_read', 'proforma_items_read', 'payments_read', 'payment_proofs_read',
       'payment_reviews_finance_read', 'tax_invoices_read', 'payouts_finance_read', 'shipments_read', 'shipment_items_read', 'proforma_line_economics_read',
       'proforma_fulfillment_groups_read', 'proforma_seller_settlements_read', 'proforma_bank_instructions_read', 'reconciliation_cases_read', 'reconciliation_case_events_read',
       'manual_financial_adjustments_read') and permissive = 'PERMISSIVE' and cmd = 'SELECT' and roles = '{authenticated}') = 18
    and not exists (select 1 from pol where tablename in ('order_items', 'order_financials', 'proforma_invoices', 'proforma_invoice_items', 'proforma_line_economics',
       'proforma_fulfillment_groups', 'proforma_seller_settlements', 'proforma_bank_instructions', 'payments', 'payment_proofs', 'payment_reviews', 'reconciliation_cases',
       'reconciliation_case_events', 'manual_financial_adjustments', 'tax_invoices', 'payouts') and q || w like '%can_view_order%')
  union all
  select 4, 'order_items: B ∨ S(own lines) ∨ F ∨ PA',
    exists (select 1 from pol where policyname = 'order_items_read'
            and q = '(is_order_buyer_member(order_id) OR is_order_line_seller(seller_organization_id) OR is_finance_operator() OR is_platform_admin())')
  union all
  select 5, 'order_financials: B ∨ F ∨ A ∨ PA (sellers removed); proforma_invoices: B ∨ F ∨ PA (sellers, auditors removed)',
    exists (select 1 from pol where policyname = 'order_financials_read' and q = '(is_order_buyer_member(order_id) OR is_finance_operator() OR is_auditor() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'proforma_invoices_read' and q = '(is_order_buyer_member(order_id) OR is_finance_operator() OR is_platform_admin())')
  union all
  select 6, 'proforma_invoice_items: B (via own header) ∨ S(own lines) ∨ F ∨ PA',
    exists (select 1 from pol where policyname = 'proforma_items_read' and q like '%is_order_buyer_member(pi.order_id)%'
            and q like '%is_order_line_seller(seller_organization_id)%' and q like '%is_finance_operator()%' and q like '%is_platform_admin()%')
  union all
  select 7, 'payments: B ∨ F ∨ PA (auditors via v_audit_payments); payment_proofs: B ∨ F (sellers, warehouse, auditors excluded)',
    exists (select 1 from pol where policyname = 'payments_read' and q = '(is_order_buyer_member(order_id) OR is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'payment_proofs_read' and q like '%is_order_buyer_member(p.order_id)%' and q like '%is_finance_operator()%'
                and q not like '%is_auditor%' and q not like '%is_platform_admin%' and q not like '%warehouse%')
  union all
  select 8, 'finance direct writes removed (C6): payment_reviews, tax_invoices, payouts carry no client write policy; payouts_view unchanged',
    not exists (select 1 from pol where tablename in ('payment_reviews', 'tax_invoices', 'payouts') and cmd <> 'SELECT')
    and exists (select 1 from pol where policyname = 'payouts_view' and q = '(is_platform_admin() OR is_org_member(seller_organization_id))')
    and exists (select 1 from pol where policyname = 'tax_invoices_read' and q = '(is_order_buyer_member(order_id) OR is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'payment_reviews_finance_read' and q = 'is_finance_operator()')
    and exists (select 1 from pol where policyname = 'payouts_finance_read' and q = 'is_finance_operator()')
  union all
  select 9, 'order_shipments: DELIVERY_REQUEST keeps (can_view_order ∨ W); FULFILLMENT = B ∨ S(fulfillment seller) ∨ W ∨ F; shipment_items follow their shipment',
    exists (select 1 from pol where policyname = 'shipments_read' and q like '%DELIVERY_REQUEST%can_view_order(order_id)%is_warehouse_operator()%'
            and q like '%FULFILLMENT%is_order_buyer_member(order_id)%is_order_line_seller(fulfillment_seller_organization_id)%is_warehouse_operator()%is_finance_operator()%')
    and exists (select 1 from pol where policyname = 'shipment_items_read' and q like '%FROM order_shipments s%s.id = shipment_items.shipment_id%' and q not like '%can_view_order%')
  union all
  select 10, 'M2b/M2c tables: economics S∨F∨PA, groups B∨S∨F∨W∨PA, settlements S∨F∨PA, bank B∨F, cases/events F∨PA, adjustments F∨PA∨A',
    exists (select 1 from pol where policyname = 'proforma_line_economics_read' and q = '(is_order_line_seller(seller_organization_id) OR is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'proforma_fulfillment_groups_read' and q like '%is_order_buyer_member(pi.order_id)%is_order_line_seller(seller_organization_id)%is_finance_operator()%is_warehouse_operator()%is_platform_admin()%')
    and exists (select 1 from pol where policyname = 'proforma_seller_settlements_read' and q = '(is_order_line_seller(seller_organization_id) OR is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'proforma_bank_instructions_read' and q like '%is_order_buyer_member(pi.order_id)%is_finance_operator()%'
                and q not like '%is_platform_admin%' and q not like '%is_auditor%' and q not like '%is_order_line_seller%')
    and exists (select 1 from pol where policyname = 'reconciliation_cases_read' and q = '(is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'reconciliation_case_events_read' and q = '(is_finance_operator() OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'manual_financial_adjustments_read' and q = '(is_finance_operator() OR is_platform_admin() OR is_auditor())')
  union all
  select 11, 'M2b/M2c tables: authenticated SELECT only (no write); anon nothing; service_role SELECT only; RLS forced',
    not exists (select 1 from m2 where not has_table_privilege('authenticated', 'public.' || t, 'select')
                   or has_table_privilege('authenticated', 'public.' || t, 'insert, update, delete, truncate, references, trigger')
                   or has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')
                   or has_table_privilege('service_role', 'public.' || t, 'insert, update, delete, truncate, references, trigger')
                   or not (select relforcerowsecurity from pg_class where oid = ('public.' || t)::regclass))
  union all
  select 12, 'T029 R1: no client role can read orders.delivery_destination_id / destination_snapshot; every other orders column stays readable',
    not has_table_privilege('authenticated', 'public.orders', 'select')
    and not has_column_privilege('authenticated', 'public.orders', 'delivery_destination_id', 'select')
    and not has_column_privilege('authenticated', 'public.orders', 'destination_snapshot', 'select')
    and not has_column_privilege('anon', 'public.orders', 'delivery_destination_id', 'select')
    and not has_column_privilege('anon', 'public.orders', 'destination_snapshot', 'select')
    and (select count(*) from pg_attribute a where a.attrelid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped
           and a.attname not in ('delivery_destination_id', 'destination_snapshot') and has_column_privilege('authenticated', 'public.orders', a.attname, 'select')) = 22
    and has_table_privilege('authenticated', 'public.orders', 'insert, update')
  union all
  select 13, 'orders row policy and can_view_order() unchanged (sellers keep status visibility of their orders)',
    exists (select 1 from pol where policyname = 'orders_view' and q = 'can_view_order(id)' and roles = '{public}')
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.can_view_order(uuid)'::regprocedure) = 'eef50520051e17d1f16985517158b825'
  union all
  select 14, '§2 views: the 5 exist, security_invoker = true, SELECT for authenticated only (no anon/PUBLIC/service_role, no write)',
    (select count(*) from pg_class c join views on views.v = c.relname where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
       and c.reloptions @> array['security_invoker=true']) = 5
    and not exists (select 1 from views where not has_table_privilege('authenticated', 'public.' || v, 'select')
                      or has_table_privilege('authenticated', 'public.' || v, 'insert, update, delete, truncate, references, trigger')
                      or has_table_privilege('anon', 'public.' || v, 'select')
                      or has_table_privilege('service_role', 'public.' || v, 'select, insert, update, delete'))
  union all
  select 15, 'view row functions: definer, search_path pinned, authenticated only, each re-checks its audience and MFA',
    (select count(*) from rowfns join pg_proc p on p.oid = rowfns.f::regprocedure where p.prosecdef and p.proconfig = array['search_path=pg_catalog, public']
       and has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute') and p.prosrc like '%mfa_satisfied()%') = 4
    and (select prosrc from pg_proc where oid = 'public.audit_payment_rows()'::regprocedure) like '%is_auditor()%'
    and (select prosrc from pg_proc where oid = 'public.audit_proforma_rows()'::regprocedure) like '%is_auditor()%'
    and (select prosrc from pg_proc where oid = 'public.buyer_reconciliation_rows()'::regprocedure) like '%is_order_buyer_member(c.order_id)%'
    and (select prosrc from pg_proc where oid = 'public.finance_review_queue_rows()'::regprocedure) like '%is_finance_operator()%'
  union all
  select 16, 'redaction: v_audit_payments masks the bank reference (last 4); no view exposes a proof path, bank account/IBAN or finance note',
    (select prosrc from pg_proc where oid = 'public.audit_payment_rows()'::regprocedure) like '%''****'' || right(p.observed_bank_reference, 4)%'
    and not exists (select 1 from views join pg_views pv on pv.viewname = views.v and pv.schemaname = 'public'
                    where pv.definition ~* '(object_path|file_asset|iban|account_number|swift|resolution_note|reason|observed_bank_reference)')
    and not exists (select 1 from rowfns join pg_proc p on p.oid = rowfns.f::regprocedure where p.prosrc ~* '(object_path|file_asset|iban|account_number|swift|resolution_note)')
    and (select prosrc from pg_proc where oid = 'public.buyer_reconciliation_rows()'::regprocedure) not like '%observed%'
  union all
  select 17, 'v_seller_order_lines: own rows only (is_order_line_seller), no buyer totals, bank, proof or destination data',
    exists (select 1 from pg_views where schemaname = 'public' and viewname = 'v_seller_order_lines' and definition like '%is_order_line_seller(oi.seller_organization_id)%'
            and definition !~* '(buyer_total|buyer_net|bank|proof|destination|payments|hills_share|order_financials|proforma_invoices )')
  union all
  select 18, 'MFA: the 24 commerce tables carry a RESTRICTIVE SELECT mfa_gate TO authenticated USING mfa_satisfied(); no other table gained one',
    (select count(*) from gated join pol on pol.tablename = gated.t and pol.policyname = 'mfa_gate_' || gated.t
       where pol.permissive = 'RESTRICTIVE' and pol.cmd = 'SELECT' and pol.roles = '{authenticated}' and pol.q = 'mfa_satisfied()') = 24
    and not exists (select 1 from pg_policies where policyname like 'mfa_gate_%'
                    and not (schemaname = 'public' and tablename in (select t from gated))
                    and not (schemaname = 'public' and tablename in ('profiles', 'organizations', 'organization_members', 'kyb_applications', 'file_assets',
                                                                     'kyb_documents', 'kyb_reviews', 'account_status_history', 'agreement_acceptances', 'kyb_review_items'))
                    and not (schemaname = 'storage' and tablename = 'objects' and policyname = 'mfa_gate_kyb_evidence'))
  union all
  select 19, 'C15: anon and PUBLIC cannot EXECUTE mfa_satisfied() or kyb_storage_object_authorized(text, boolean); authenticated and service_role still can',
    not has_function_privilege('anon', 'public.mfa_satisfied()', 'execute') and not has_function_privilege('anon', 'public.kyb_storage_object_authorized(text,boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.mfa_satisfied()', 'execute') and has_function_privilege('authenticated', 'public.kyb_storage_object_authorized(text,boolean)', 'execute')
    and has_function_privilege('service_role', 'public.mfa_satisfied()', 'execute') and has_function_privilege('service_role', 'public.kyb_storage_object_authorized(text,boolean)', 'execute')
    and (select proacl::text from pg_proc where oid = 'public.mfa_satisfied()'::regprocedure) = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
    and (select proacl::text from pg_proc where oid = 'public.kyb_storage_object_authorized(text,boolean)'::regprocedure) = '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  union all
  select 20, 'C15: both helper bodies, SECURITY DEFINER and search_path unchanged (T006/T056 md5 pins)',
    (select md5(replace(prosrc, chr(13), '')) || prosecdef || proconfig::text from pg_proc where oid = 'public.mfa_satisfied()'::regprocedure)
      = 'a78cfc6c462a0af5cec582234b118134true{"search_path=pg_catalog, public, auth"}'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.kyb_storage_object_authorized(text,boolean)'::regprocedure) = '8d4ac2b14f278ba705f6bed72059b60c'
    and (select prosecdef and proconfig = array['search_path=pg_catalog, public, auth'] from pg_proc where oid = 'public.kyb_storage_object_authorized(text,boolean)'::regprocedure)
  union all
  select 21, 'untouched: Feature 010 config-table policies, orders write policies, delivery_destinations / commerce_settings / reservations / pricing read policies',
    exists (select 1 from pol where policyname = 'payment_accounts_admin' and q = 'is_platform_admin()' and w = 'is_super_admin()')
    and not exists (select 1 from pol where tablename in ('platform_admins', 'commission_policies', 'commission_tiers', 'tax_rules', 'shipping_rules', 'payment_accounts')
                    and (q || w) ~ '(is_order_buyer_member|is_order_line_seller|mfa_satisfied)')
    and (select count(*) from pol where tablename = 'orders') = 4
    and exists (select 1 from pol where policyname = 'delivery_destinations_member_read' and q = '(is_org_member(organization_id) OR is_platform_admin())')
    and exists (select 1 from pol where policyname = 'reservations_admin' and q = 'is_platform_admin()')
    and exists (select 1 from pol where policyname = 'commerce_settings_staff_read')
    and exists (select 1 from pol where policyname = 'offer_price_tiers_read') and exists (select 1 from pol where policyname = 'promotions_read')
  union all
  select 22, 'anon: nothing on the M3 views, the M2b/M2c tables, or any orders destination column; notification_events still closed',
    not exists (select 1 from views where has_table_privilege('anon', 'public.' || v, 'select'))
    and not exists (select 1 from m2 where has_table_privilege('anon', 'public.' || t, 'select'))
    and not has_table_privilege('authenticated', 'public.notification_events', 'select') and not has_table_privilege('anon', 'public.notification_events', 'select')
  union all
  select 23, 'M1–M2e untouched: validate_order_transition v2, prevent_snapshot_mutation (M2b), outbox present; checkout disabled',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.prevent_snapshot_mutation()'::regprocedure) = '286e02091213c1be4236b144dff1f383'
    and to_regclass('public.notification_events') is not null
    and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
