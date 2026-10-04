-- Feature 018 M1 postflight. READ-ONLY: one SELECT, one JSON row per check. Run after 20261004100000_feature_018_featured_arabic_snapshots.sql.
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('coffees.featured_at is nullable timestamptz without a default',
   (select a.atttypid = 'timestamptz'::regtype and not a.attnotnull and not a.atthasdef from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('public.coffees') and a.attname = 'featured_at' and not a.attisdropped), null::text),
  ('Featured index definition, order and predicate',
   (select pg_catalog.pg_get_indexdef(i.indexrelid) like '%USING btree (featured_at DESC, id DESC) WHERE%'
           and pg_catalog.pg_get_expr(i.indpred, i.indrelid) like '%PUBLISHED%' and pg_catalog.pg_get_expr(i.indpred, i.indrelid) like '%featured_at IS NOT NULL%'
           and i.indisvalid and not i.indisunique
    from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid = i.indexrelid where c.relname = 'idx_coffees_featured_published' and i.indrelid = to_regclass('public.coffees')), null::text),
  ('Arabic snapshot columns are nullable text without defaults',
   (select count(*) = 2 and bool_and(a.atttypid = 'text'::regtype and not a.attnotnull and not a.atthasdef) from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('public.proforma_invoice_items') and a.attname in ('product_name_ar_snapshot', 'origin_name_ar_snapshot') and not a.attisdropped), null::text),
  ('legacy-row Arabic guard exists and is validated',
   (select k.convalidated and pg_catalog.pg_get_constraintdef(k.oid) like '%seller_type_snapshot IS NOT NULL%' and pg_catalog.pg_get_constraintdef(k.oid) like '%product_name_ar_snapshot IS NULL%'
    from pg_catalog.pg_constraint k where k.conrelid = to_regclass('public.proforma_invoice_items') and k.conname = 'proforma_invoice_items_ar_snapshot_v1_only_check'), null::text),
  ('snapshot immutability trigger still bound and enabled',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.proforma_invoice_items') and t.tgname = 'trg_proforma_invoice_items_immutable' and t.tgenabled = 'O'
           and pg_catalog.pg_get_triggerdef(t.oid) like '%BEFORE DELETE OR UPDATE%'), null::text),
  ('no legacy proforma item carries an Arabic snapshot',
   (select count(*) = 0 from public.proforma_invoice_items where seller_type_snapshot is null and (product_name_ar_snapshot is not null or origin_name_ar_snapshot is not null)), null::text),
  ('public boundary: anon has no privilege on proforma_invoice_items',
   not (pg_catalog.has_table_privilege('anon', 'public.proforma_invoice_items', 'SELECT') or pg_catalog.has_table_privilege('anon', 'public.proforma_invoice_items', 'INSERT')), null::text),
  ('public boundary: anon cannot write coffees',
   not (pg_catalog.has_table_privilege('anon', 'public.coffees', 'INSERT') or pg_catalog.has_table_privilege('anon', 'public.coffees', 'UPDATE')), null::text),
  ('public boundary: public_read_coffees policy unchanged',
   exists (select 1 from pg_catalog.pg_policy p where p.polrelid = to_regclass('public.coffees') and p.polname = 'public_read_coffees'
           and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = '(status = ''PUBLISHED''::text)'), null::text),
  ('Feature 017 provider functions still executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text)
) as c(name, ok, detail)
order by c.name
