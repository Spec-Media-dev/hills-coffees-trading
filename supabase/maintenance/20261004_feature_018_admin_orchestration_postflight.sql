-- Feature 018 M3 postflight. READ-ONLY: one SELECT, one JSON row per check. Run after 20261004120000_feature_018_admin_orchestration.sql.
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('revision counters are NOT NULL integers on Coffee and offer with positive checks',
   (select count(*) = 2 and bool_and(a.atttypid = 'integer'::regtype and a.attnotnull and a.atthasdef) from pg_catalog.pg_attribute a
    where a.attname = 'revision' and not a.attisdropped and a.attrelid in (to_regclass('public.coffees'), to_regclass('public.coffee_offers')))
   and exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.coffees') and k.conname = 'coffees_revision_positive_check')
   and exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.coffee_offers') and k.conname = 'coffee_offers_revision_positive_check'), null::text),
  ('revision and readiness triggers are bound and enabled',
   (select count(*) = 5 from pg_catalog.pg_trigger t
    where t.tgenabled = 'O' and t.tgname in ('trg_f018_coffee_revision', 'trg_f018_translation_revision', 'trg_f018_media_revision', 'trg_f018_offer_revision', 'trg_f018_coffee_publication_readiness')
      and t.tgrelid in (to_regclass('public.coffees'), to_regclass('public.coffee_translations'), to_regclass('public.coffee_media'), to_regclass('public.coffee_offers'))), null::text),
  ('publication readiness gate fires only on a transition into PUBLISHED (AFTER UPDATE OF status WHEN)',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.coffees') and t.tgname = 'trg_f018_coffee_publication_readiness'
           and pg_catalog.pg_get_triggerdef(t.oid) like '%AFTER UPDATE OF status%' and pg_catalog.pg_get_triggerdef(t.oid) like '%WHEN%PUBLISHED%'), null::text),
  ('public routines exist, are SECURITY DEFINER with a pinned search_path and are authenticated-only',
   (select count(*) = 14 and bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=pg_catalog, public, auth%'
            and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE'))
    from (values ('create_catalogue_coffee_intent(uuid,jsonb)'), ('save_catalogue_step(uuid,uuid,text,integer,jsonb)'),
                 ('attach_catalogue_media(uuid,uuid,integer,text,text,text,bigint)'), ('remove_catalogue_media(uuid,uuid,integer,uuid)'),
                 ('set_catalogue_media_primary(uuid,uuid,integer,uuid)'), ('list_catalogue_backing_positions(uuid)'),
                 ('create_backed_offer_intent(uuid,uuid,integer,uuid,numeric,numeric,text)'), ('save_offer_commercials(uuid,uuid,integer,numeric,numeric,text)'),
                 ('set_coffee_featured(uuid,boolean,integer,uuid)'), ('get_catalogue_readiness(uuid)'), ('publish_coffee_catalogue_only(uuid,integer,uuid)'),
                 ('publish_coffee_with_approved_offer(uuid,uuid,integer,integer,uuid)'), ('record_listing_review_decision(uuid,text,text,uuid)'), ('recover_catalogue_operation(uuid)')) as f(sig)
    join pg_catalog.pg_proc p on p.oid = to_regprocedure('public.' || f.sig)), null::text),
  ('private helpers exist with no application-role EXECUTE',
   (select count(*) = 7 and bool_and(not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') and not pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
    from (values ('f018_bump_coffee_revision_row()'), ('f018_bump_parent_coffee_revision()'), ('f018_bump_offer_revision_row()'), ('f018_assert_catalogue_admin()'),
                 ('f018_cas_coffee(uuid,integer)'), ('f018_catalogue_readiness(uuid)'), ('f018_enforce_publication_readiness()')) as f(sig)
    join pg_catalog.pg_proc p on p.oid = to_regprocedure('public.' || f.sig)), null::text),
  ('every mutating routine binds a protected request and checks Platform Admin plus MFA in the database',
   (select count(*) = 11 and bool_and(pg_catalog.pg_get_functiondef(p.oid) like '%f018_request_begin%' and pg_catalog.pg_get_functiondef(p.oid) like '%f018_request_complete%'
            and (pg_catalog.pg_get_functiondef(p.oid) like '%f018_assert_catalogue_admin%' or pg_catalog.pg_get_functiondef(p.oid) like '%mfa_step_up_required%'))
    from (values ('create_catalogue_coffee_intent(uuid,jsonb)'), ('save_catalogue_step(uuid,uuid,text,integer,jsonb)'), ('attach_catalogue_media(uuid,uuid,integer,text,text,text,bigint)'),
                 ('remove_catalogue_media(uuid,uuid,integer,uuid)'), ('set_catalogue_media_primary(uuid,uuid,integer,uuid)'), ('create_backed_offer_intent(uuid,uuid,integer,uuid,numeric,numeric,text)'),
                 ('save_offer_commercials(uuid,uuid,integer,numeric,numeric,text)'), ('set_coffee_featured(uuid,boolean,integer,uuid)'), ('publish_coffee_catalogue_only(uuid,integer,uuid)'),
                 ('publish_coffee_with_approved_offer(uuid,uuid,integer,integer,uuid)'), ('record_listing_review_decision(uuid,text,text,uuid)')) as f(sig)
    join pg_catalog.pg_proc p on p.oid = to_regprocedure('public.' || f.sig)), null::text),
  ('role split: coordinated publication also needs offer-publication authority, Compliance decisions never use the catalogue role',
   (select pg_catalog.pg_get_functiondef(to_regprocedure('public.publish_coffee_with_approved_offer(uuid,uuid,integer,integer,uuid)')) like '%publication_authority_required%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.publish_coffee_with_approved_offer(uuid,uuid,integer,integer,uuid)')) like '%is_compliance_operator%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.record_listing_review_decision(uuid,text,text,uuid)')) like '%is_compliance_operator%'
       and pg_catalog.pg_get_functiondef(to_regprocedure('public.record_listing_review_decision(uuid,text,text,uuid)')) not like '%is_platform_admin%'), null::text),
  ('no routine can write inventory (stock is never created or changed by the catalogue workflow)',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('create_catalogue_coffee_intent', 'save_catalogue_step', 'attach_catalogue_media', 'remove_catalogue_media', 'set_catalogue_media_primary',
                     'list_catalogue_backing_positions', 'create_backed_offer_intent', 'save_offer_commercials', 'set_coffee_featured', 'get_catalogue_readiness', 'publish_coffee_catalogue_only',
                     'publish_coffee_with_approved_offer', 'record_listing_review_decision', 'recover_catalogue_operation')
                 and pg_catalog.pg_get_functiondef(p.oid) ~* '(insert\s+into|update|delete\s+from)\s+public\.(inventory_positions|inventory_reservations|inventory_reservation_items|inventory_ownership_events|storage_allocations)'), null::text),
  ('role policies are unchanged: Coffee writes Platform Admin, offer status Compliance, stock Warehouse',
   exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffees') and p.polname = 'catalog_admin_coffees' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_platform_admin()')
   and exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffee_offers') and p.polname = 'offers_compliance_update' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_compliance_operator()')
   and exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.inventory_positions') and p.polname = 'inventory_warehouse_write' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'is_warehouse_operator()')
   and exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffees') and p.polname = 'public_read_coffees' and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = '(status = ''PUBLISHED''::text)'), null::text),
  ('Feature 017 provider functions still executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text)
) as c(name, ok, detail)
order by c.name
