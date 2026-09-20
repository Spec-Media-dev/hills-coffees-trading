-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260920140000_database_hygiene_updated_at.sql
-- Removes the 13 `trg_<table>_updated_at` triggers and drops the `updated_at` column from the 9 tables that
-- gained it (kyb_documents, order_items, coffee_media, warehouse_locations, coffee_types, coffee_varieties,
-- processing_methods, packaging_types, tags). The 4 tables whose `updated_at` PRE-DATES the migration
-- (origins, regions, warehouses, offer_sensory_notes) keep their column and its values — only their trigger goes
-- (after rollback nothing maintains it again, as before). No policy, grant or row is touched; the dropped columns'
-- values are lost (they were only `created_at` copies / the migration time plus later DB-maintained changes).
-- Not part of `supabase/migrations/` on purpose (the Supabase CLI would read it as a migration).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
  v_table text;
begin
  foreach v_table in array array['kyb_documents', 'order_items', 'coffee_media', 'warehouse_locations', 'coffee_types', 'coffee_varieties', 'processing_methods', 'packaging_types', 'tags', 'origins', 'regions', 'warehouses', 'offer_sensory_notes'] loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_table)::regclass and t.tgname = 'trg_' || v_table || '_updated_at' and not t.tgisinternal) then
      v_problems := v_problems || v_table || ' has no trg_' || v_table || '_updated_at; ';
    end if;
  end loop;
  if v_problems <> '' then
    raise exception 'database_hygiene_updated_at rollback refused — the migrated shape is not in place; nothing changed: %', v_problems;
  end if;
end
$guard$;

drop trigger if exists trg_kyb_documents_updated_at on public.kyb_documents;
drop trigger if exists trg_order_items_updated_at on public.order_items;
drop trigger if exists trg_coffee_media_updated_at on public.coffee_media;
drop trigger if exists trg_warehouse_locations_updated_at on public.warehouse_locations;
drop trigger if exists trg_coffee_types_updated_at on public.coffee_types;
drop trigger if exists trg_coffee_varieties_updated_at on public.coffee_varieties;
drop trigger if exists trg_processing_methods_updated_at on public.processing_methods;
drop trigger if exists trg_packaging_types_updated_at on public.packaging_types;
drop trigger if exists trg_tags_updated_at on public.tags;
drop trigger if exists trg_origins_updated_at on public.origins;
drop trigger if exists trg_regions_updated_at on public.regions;
drop trigger if exists trg_warehouses_updated_at on public.warehouses;
drop trigger if exists trg_offer_sensory_notes_updated_at on public.offer_sensory_notes;

alter table public.kyb_documents drop column if exists updated_at;
alter table public.order_items drop column if exists updated_at;
alter table public.coffee_media drop column if exists updated_at;
alter table public.warehouse_locations drop column if exists updated_at;
alter table public.coffee_types drop column if exists updated_at;
alter table public.coffee_varieties drop column if exists updated_at;
alter table public.processing_methods drop column if exists updated_at;
alter table public.packaging_types drop column if exists updated_at;
alter table public.tags drop column if exists updated_at;

commit;
