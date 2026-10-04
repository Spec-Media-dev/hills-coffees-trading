-- Rollback for Feature 018 M1 (featured_arabic_snapshots).
--
-- Retains populated history. Nothing that holds data is dropped: a Featured selection or a frozen Arabic snapshot is
-- immutable commerce/editorial history. Unpopulated additions are removed cleanly, except that the Arabic columns are
-- kept while the M2 checkout kernel (which inserts them) is still installed - M2 rollback deliberately retains it.
-- M3 (Admin RPCs that write featured_at) must be rolled back first; this file refuses otherwise.

begin;

do $guard$
begin
  if to_regprocedure('public.set_coffee_featured(uuid,boolean,integer,uuid)') is not null then
    raise exception 'feature_018_m1_rollback_requires_m3_rolled_back_first';
  end if;
end
$guard$;

do $retire$
declare
  v_featured_rows bigint := 0;
  v_arabic_rows bigint := 0;
  v_kernel_installed boolean := to_regprocedure('public.f018_checkout_kernel(uuid,uuid,uuid)') is not null;
begin
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.coffees'::regclass and a.attname = 'featured_at' and not a.attisdropped) then
    execute 'select count(*) from public.coffees where featured_at is not null' into v_featured_rows;
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.proforma_invoice_items'::regclass and a.attname = 'product_name_ar_snapshot' and not a.attisdropped) then
    execute 'select count(*) from public.proforma_invoice_items where product_name_ar_snapshot is not null or origin_name_ar_snapshot is not null' into v_arabic_rows;
  end if;

  if v_featured_rows = 0 then
    drop index if exists public.idx_coffees_featured_published;
    alter table public.coffees drop column if exists featured_at;
  else
    raise notice 'feature_018_m1_rollback: retained coffees.featured_at (% populated rows)', v_featured_rows;
  end if;

  if v_arabic_rows = 0 and not v_kernel_installed then
    alter table public.proforma_invoice_items drop constraint if exists proforma_invoice_items_ar_snapshot_v1_only_check;
    alter table public.proforma_invoice_items
      drop column if exists product_name_ar_snapshot,
      drop column if exists origin_name_ar_snapshot;
  else
    raise notice 'feature_018_m1_rollback: retained Arabic proforma snapshot columns and their v1-only check (% populated rows, kernel installed: %)', v_arabic_rows, v_kernel_installed;
  end if;
end
$retire$;

commit;
