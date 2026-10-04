-- Feature 018 M3 preflight. READ-ONLY: one SELECT, one JSON row per check. Run before 20261004120000_feature_018_admin_orchestration.sql.
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('M2 request binding applied (f018_request_begin and f018_request_complete exist)',
   to_regprocedure('public.f018_request_begin(uuid,text,uuid,jsonb)') is not null and to_regprocedure('public.f018_request_complete(uuid,jsonb)') is not null, null::text),
  ('existing media, translation and offer-code routines present',
   to_regprocedure('public.attach_coffee_media(uuid,text,text,text,bigint)') is not null and to_regprocedure('public.remove_coffee_media(uuid)') is not null
   and to_regprocedure('public.set_catalogue_translation(text,uuid,text,text,text)') is not null and to_regprocedure('public.next_offer_code()') is not null, null::text),
  ('Coffee write policy is Platform Admin only (catalog_admin_coffees unchanged)',
   exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffees') and p.polname = 'catalog_admin_coffees'
           and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_platform_admin()'), null::text),
  ('offer review and status authority is Compliance (policies unchanged)',
   exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffee_offers') and p.polname = 'offers_compliance_update' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_compliance_operator()')
   and exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.listing_reviews') and p.polname = 'offer_reviews_compliance' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_compliance_operator()'), null::text),
  ('offer transition guard requires Compliance or an internal transition',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.validate_offer_transition()')) like '%compliance_required_for_listing_state%'), null::text),
  ('inventory write authority is Warehouse only and authenticated holds no write privilege on positions',
   exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.inventory_positions') and p.polname = 'inventory_warehouse_write' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_warehouse_operator()')
   and not (pg_catalog.has_table_privilege('authenticated', 'public.inventory_positions', 'INSERT') or pg_catalog.has_table_privilege('authenticated', 'public.inventory_positions', 'UPDATE')), null::text),
  ('one active offer per lot and owner and one primary image per Coffee are enforced',
   exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public' and i.indexname = 'uq_active_offer_per_lot_owner')
   and exists (select 1 from pg_catalog.pg_indexes i where i.schemaname = 'public' and i.indexname = 'coffee_media_one_primary_per_coffee_idx'), null::text),
  ('Coffee and offer audit triggers present',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.coffees') and t.tgname = 'trg_audit_coffees' and t.tgenabled = 'O')
   and exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.coffee_offers') and t.tgname = 'trg_audit_offers' and t.tgenabled = 'O'), null::text),
  ('no unreviewed pre-existing revision columns',
   not exists (select 1 from pg_catalog.pg_attribute a where a.attname = 'revision' and not a.attisdropped and a.attrelid in (to_regclass('public.coffees'), to_regclass('public.coffee_offers'))
               and (a.atttypid <> 'integer'::regtype or not a.attnotnull)), null::text),
  ('Feature 017 provider functions executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text),
  ('informational: Coffees currently PUBLISHED (never re-evaluated by M3)',
   true, (select count(*)::text from public.coffees where status = 'PUBLISHED'))
) as c(name, ok, detail)
order by c.name
