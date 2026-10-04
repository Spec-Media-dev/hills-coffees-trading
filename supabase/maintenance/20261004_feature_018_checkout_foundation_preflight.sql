-- Feature 018 M2 preflight. READ-ONLY: one SELECT, one JSON row per check. Run before 20261004110000_feature_018_checkout_foundation.sql.
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('M1 applied: featured_at and both Arabic snapshot columns exist',
   (select count(*) = 3 from pg_catalog.pg_attribute a
    where not a.attisdropped and ((a.attrelid = to_regclass('public.coffees') and a.attname = 'featured_at')
       or (a.attrelid = to_regclass('public.proforma_invoice_items') and a.attname in ('product_name_ar_snapshot', 'origin_name_ar_snapshot')))), null::text),
  ('lock-graph functions present',
   to_regprocedure('public.commerce_release_reservation(uuid)') is not null and to_regprocedure('public.validate_order_item_offer()') is not null
   and to_regprocedure('public.commerce_resolve_cart(uuid)') is not null and to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is not null, null::text),
  ('checkout function is the reviewed Feature 015 kernel or an applied Feature 018 fence',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')) like '%v_reclaim_order%'
        or pg_catalog.pg_get_functiondef(to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')) like '%f018_checkout_kernel%'), null::text),
  ('order item offer validator bound BEFORE INSERT OR UPDATE on order_items',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.order_items') and t.tgname = 'trg_order_item_offer' and t.tgenabled = 'O'
           and pg_catalog.pg_get_triggerdef(t.oid) like '%BEFORE INSERT OR UPDATE%'), null::text),
  ('unique order_items (order_id, offer_id) for merge-on-Add',
   exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.order_items') and k.contype = 'u' and pg_catalog.pg_get_constraintdef(k.oid) = 'UNIQUE (order_id, offer_id)'), null::text),
  ('one open reservation per order index present',
   exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public' and i.indexname = 'uq_open_inventory_reservation_order'), null::text),
  ('legacy checkout fences retained (issue_proforma and confirm_proforma refuse)',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)')) like '%endpoint_deprecated_use_checkout_v1%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.confirm_proforma(uuid,uuid)')) like '%endpoint_deprecated_use_checkout_v1%'), null::text),
  ('Feature 017 provider functions executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text),
  ('receipt namespace free or already conforming',
   (to_regclass('public.cart_line_checkout_receipts') is null) or exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.cart_line_checkout_receipts') and a.attname = 'bound_payload' and not a.attisdropped), null::text),
  ('request log has no application-role privilege',
   not (pg_catalog.has_table_privilege('anon', 'public.commerce_request_log', 'SELECT') or pg_catalog.has_table_privilege('authenticated', 'public.commerce_request_log', 'SELECT')
        or pg_catalog.has_table_privilege('authenticated', 'public.commerce_request_log', 'INSERT')), null::text),
  ('informational: direct order_items INSERT is an authenticated table privilege (closed by the M2 trigger)',
   true, (select pg_catalog.has_table_privilege('authenticated', 'public.order_items', 'INSERT')::text)),
  ('informational: organizations with more than one V1 DRAFT (kept, never consolidated)',
   true, (select count(*)::text from (select o.buyer_organization_id from public.orders o where o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT' group by o.buyer_organization_id having count(*) > 1) s))
) as c(name, ok, detail)
order by c.name
