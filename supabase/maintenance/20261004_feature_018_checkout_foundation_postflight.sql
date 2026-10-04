-- Feature 018 M2 postflight. READ-ONLY: one SELECT, one JSON row per check. Run after 20261004110000_feature_018_checkout_foundation.sql
-- (and after its rollback with the retained-state expectations of the rollback contract: the checks below tagged [applied] are
-- the applied state; rollback verification uses the retained subset listed in tests/commerce/f018-m2-migration.test.ts).
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('tables exist with RLS enabled and forced',
   (select count(*) = 2 and bool_and(r.relrowsecurity and r.relforcerowsecurity) from pg_catalog.pg_class r
    where r.oid in (to_regclass('public.cart_line_checkout_receipts'), to_regclass('public.f018_checkout_permits'))), null::text),
  ('receipts and permits grant no table privilege to any application role',
   not exists (select 1 from (values ('anon'), ('authenticated'), ('service_role'), ('public')) as ro(name),
                      (values ('public.cart_line_checkout_receipts'), ('public.f018_checkout_permits')) as t(name),
                      (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(name)
               where pg_catalog.has_table_privilege(ro.name, t.name, p.name)), null::text),
  ('receipt uniqueness: request, source item, transaction order, transaction item and child request',
   (select count(*) = 5 from (values ('request_id'), ('source_order_item_id'), ('transaction_order_id'), ('transaction_order_item_id'), ('child_request_id')) as u(col)
    where exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.cart_line_checkout_receipts') and k.contype = 'u'
                  and pg_catalog.pg_get_constraintdef(k.oid) = 'UNIQUE (' || u.col || ')')), null::text),
  ('receipt foreign keys never cascade (history is retained)',
   (select count(*) >= 8 and bool_and(k.confdeltype in ('r', 'a')) from pg_catalog.pg_constraint k
    where k.conrelid = to_regclass('public.cart_line_checkout_receipts') and k.contype = 'f'), null::text),
  ('receipt rows are append-only (BEFORE UPDATE OR DELETE trigger enabled)',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.cart_line_checkout_receipts') and t.tgname = 'trg_f018_receipt_immutable'
           and t.tgenabled = 'O' and pg_catalog.pg_get_triggerdef(t.oid) like '%BEFORE DELETE OR UPDATE%'), null::text),
  ('permit cannot survive commit (deferred constraint trigger)',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.f018_checkout_permits') and t.tgname = 'trg_f018_permit_not_surviving'
           and t.tgenabled = 'O' and t.tgdeferrable and t.tginitdeferred), null::text),
  ('zero durable permits', (select count(*) = 0 from public.f018_checkout_permits), null::text),
  ('request log carries a nullable object-typed bound_payload and no application-role privilege',
   exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.commerce_request_log') and a.attname = 'bound_payload' and not a.attnotnull and not a.attisdropped)
   and exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.commerce_request_log') and k.conname = 'commerce_request_log_bound_payload_check')
   and not (pg_catalog.has_table_privilege('authenticated', 'public.commerce_request_log', 'SELECT') or pg_catalog.has_table_privilege('anon', 'public.commerce_request_log', 'SELECT')), null::text),
  ('new public entry points exist, are SECURITY DEFINER with a pinned search_path and are authenticated-only',
   (select count(*) = 3 and bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public, auth%'
            and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))
    from pg_catalog.pg_proc p
    where p.oid in (to_regprocedure('public.checkout_cart_line_bank_transfer_v1(uuid,uuid,uuid,uuid,numeric,uuid,uuid)'),
                    to_regprocedure('public.estimate_cart_line_bank_transfer_v1(uuid,uuid,uuid,uuid,numeric,uuid)'),
                    to_regprocedure('public.recover_cart_line_checkout(uuid,uuid,uuid,uuid,uuid,numeric,uuid)'))), null::text),
  ('private helpers exist and have no application-role EXECUTE',
   (select count(*) = 10 and bool_and(not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE')
            and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public%')
    from (values ('f018_request_begin(uuid,text,uuid,jsonb)'), ('f018_request_complete(uuid,jsonb)'), ('f018_canonical_cart(uuid)'), ('f018_stage_checkout_locks(uuid)'),
                 ('f018_compute_quote_core(uuid,uuid,text,uuid[])'), ('f018_checkout_kernel(uuid,uuid,uuid)'), ('f018_receipt_integrity(uuid)'),
                 ('f018_receipt_response(uuid,boolean)'), ('f018_guard_order_item_canonical_cart()'), ('f018_receipt_immutable()')) as f(sig)
    join pg_catalog.pg_proc p on p.oid = to_regprocedure('public.' || f.sig)), null::text),
  ('replaced Add/update/remove keep their signatures and prior ACLs',
   (select pg_catalog.has_function_privilege('authenticated', to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)'), 'EXECUTE')
       and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)'), 'EXECUTE')
       and pg_catalog.has_function_privilege('authenticated', to_regprocedure('public.update_order_item_quantity(uuid,numeric)'), 'EXECUTE')
       and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.update_order_item_quantity(uuid,numeric)'), 'EXECUTE')
       and pg_catalog.has_function_privilege('authenticated', to_regprocedure('public.remove_order_item(uuid)'), 'EXECUTE')
       and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.remove_order_item(uuid)'), 'EXECUTE')), null::text),
  ('Add/update/remove take the organization key and enforce the canonical cart',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)')) like '%f018_request_begin%hashtextextended%'
        or pg_catalog.pg_get_functiondef(to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)')) like '%hashtextextended%f018_request_begin%'), null::text),
  ('update and remove reject a non-canonical V1 cart after the organization lock',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.update_order_item_quantity(uuid,numeric)')) like '%f018_canonical_cart%cart_not_canonical%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.remove_order_item(uuid)')) like '%f018_canonical_cart%cart_not_canonical%'), null::text),
  ('direct order_items INSERT is guarded by the canonical-cart trigger (BEFORE INSERT, enabled)',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.order_items') and t.tgname = 'trg_f018_order_item_canonical_cart'
           and t.tgenabled = 'O' and pg_catalog.pg_get_triggerdef(t.oid) like '%BEFORE INSERT%'), null::text),
  ('public checkout is fenced: a DRAFT needs a permit and the private kernel does the work',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')) like '%f018_checkout_permits%checkout_requires_selected_line%f018_checkout_kernel%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)')) not like '%v_reclaim_order%'
       and pg_catalog.has_function_privilege('authenticated', to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)'), 'EXECUTE')
       and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)'), 'EXECUTE')), null::text),
  ('kernel requires staged locks, has no second reclamation scan and freezes Arabic snapshots',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.f018_checkout_kernel(uuid,uuid,uuid)')) like '%checkout_locks_not_staged%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.f018_checkout_kernel(uuid,uuid,uuid)')) not like '%v_reclaim_order%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.f018_checkout_kernel(uuid,uuid,uuid)')) like '%product_name_ar_snapshot%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.f018_checkout_kernel(uuid,uuid,uuid)')) like '%origin_name_ar_snapshot%'), null::text),
  ('historical quote signature retained as a delegating wrapper',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.compute_order_quote(uuid,uuid,text)')) like '%f018_compute_quote_core%null%'
       and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.compute_order_quote(uuid,uuid,text)'), 'EXECUTE')
       and not pg_catalog.has_function_privilege('authenticated', to_regprocedure('public.compute_order_quote(uuid,uuid,text)'), 'EXECUTE')), null::text),
  ('legacy issue_proforma and confirm_proforma fences retained',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)')) like '%endpoint_deprecated_use_checkout_v1%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.confirm_proforma(uuid,uuid)')) like '%endpoint_deprecated_use_checkout_v1%'), null::text),
  ('Feature 017 provider functions still executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text),
  ('Feature 015 proof functions and Feature 016 finance review remain present and application-fenced',
   to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)') is not null
   and to_regprocedure('public.prepare_payment_proof_upload(uuid,uuid,text)') is not null
   and to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is not null
   and not pg_catalog.has_function_privilege('anon', to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)'), 'EXECUTE'), null::text)
) as c(name, ok, detail)
order by c.name
