-- Feature 018 M1 preflight. READ-ONLY: one SELECT, one JSON row per check. Run before 20261004100000_feature_018_featured_arabic_snapshots.sql.
select jsonb_build_object('check', c.name, 'ok', coalesce(c.ok, false), 'detail', c.detail)
from (values
  ('coffees exists with a text status column',
   (select a.atttypid = 'text'::regtype from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.coffees') and a.attname = 'status' and not a.attisdropped), null::text),
  ('proforma_invoice_items exists with seller_type_snapshot',
   (select true from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.proforma_invoice_items') and a.attname = 'seller_type_snapshot' and not a.attisdropped), null::text),
  ('Feature 015 checkout_bank_transfer_v1 present', to_regprocedure('public.checkout_bank_transfer_v1(uuid,uuid,uuid)') is not null, null::text),
  ('Feature 016 finance_review_bank_transfer_v1 present', to_regprocedure('public.finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)') is not null, null::text),
  ('Feature 017 provider functions executable by no application role',
   not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname in ('record_stripe_payment_intent', 'record_payment_transfer', 'ingest_stripe_event')
                 and (pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
                      or pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))), null::text),
  ('snapshot immutability trigger bound and enabled on proforma_invoice_items',
   exists (select 1 from pg_catalog.pg_trigger t where t.tgrelid = to_regclass('public.proforma_invoice_items') and t.tgname = 'trg_proforma_invoice_items_immutable' and t.tgenabled = 'O'), null::text),
  ('public_coffee_images view present and not writable by anon',
   to_regclass('public.public_coffee_images') is not null and not pg_catalog.has_table_privilege('anon', 'public.public_coffee_images', 'INSERT'), null::text),
  ('no unreviewed pre-existing featured_at',
   not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.coffees') and a.attname = 'featured_at' and not a.attisdropped
               and (a.atttypid <> 'timestamptz'::regtype or a.attnotnull or a.atthasdef)), null::text),
  ('no unreviewed pre-existing Arabic snapshot columns',
   not exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = to_regclass('public.proforma_invoice_items')
               and a.attname in ('product_name_ar_snapshot', 'origin_name_ar_snapshot') and not a.attisdropped
               and (a.atttypid <> 'text'::regtype or a.attnotnull or a.atthasdef)), null::text),
  ('anon holds no privilege on proforma_invoice_items',
   not (pg_catalog.has_table_privilege('anon', 'public.proforma_invoice_items', 'SELECT') or pg_catalog.has_table_privilege('anon', 'public.proforma_invoice_items', 'INSERT')), null::text)
) as c(name, ok, detail)
order by c.name
