-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for supabase/migrations/20260923120000_catalogue_media_and_translations.sql
-- Reverses exactly what that migration added and restores the two grants it narrowed.
-- NOTE: dropping the five taxonomy translation tables discards any Arabic taxonomy names entered after
-- apply. `coffee_translations`/`origin_translations` rows are KEPT (those tables predate the
-- migration). Catalogue images uploaded after apply stay in `public-assets` and in coffee_media/
-- file_assets — they simply lose their public view and removal RPC; nothing is deleted here.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop function if exists public.set_catalogue_translation(text, uuid, text, text, text);

drop table if exists public.packaging_type_translations;
drop table if exists public.processing_method_translations;
drop table if exists public.coffee_variety_translations;
drop table if exists public.coffee_type_translations;
drop table if exists public.region_translations;

drop policy if exists coffee_translations_admin_read on public.coffee_translations;
drop policy if exists origin_translations_admin_read on public.origin_translations;
grant insert, update on table public.coffee_translations to authenticated;
grant insert, update on table public.origin_translations to authenticated;

drop view if exists public.public_coffee_images;

drop function if exists public.remove_coffee_media(uuid);
drop function if exists public.attach_coffee_media(uuid, text, text, text, bigint);

drop index if exists public.coffee_media_one_primary_per_coffee_idx;

-- Restore the Storage helper to its 20260922130000 body (avatars + branding only).
create or replace function public.public_asset_object_authorized(
  p_object_name text,
  p_operation text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_parts text[];
begin
  if p_operation = 'select' then
    return true;
  end if;

  if auth.uid() is null or public.is_blocked_user() then
    return false;
  end if;

  v_parts := string_to_array(p_object_name, '/');
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2 then
    return false;
  end if;

  if v_parts[1] = 'avatars' then
    return v_parts[2] = auth.uid()::text;
  end if;

  if v_parts[1] = 'branding' then
    return public.is_platform_admin();
  end if;

  return false;
end;
$$;

revoke all on function public.public_asset_object_authorized(text, text) from public;
grant execute on function public.public_asset_object_authorized(text, text) to authenticated, service_role;

commit;
