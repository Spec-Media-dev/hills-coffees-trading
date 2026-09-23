-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Catalogue coffee images + bilingual (EN/AR) catalogue content — RUN CONTENT-MEDIA-ACCOUNT (2026-09-23).
-- PREPARED FOR HUMAN SECURITY REVIEW — NOT APPLIED. Do not run `supabase db push` / the SQL Editor
-- without approval.
-- Rollback: supabase/rollback/20260923120000_catalogue_media_and_translations.rollback.sql
-- Postflight (read-only): supabase/maintenance/20260923_catalogue_media_and_translations_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHAT EXISTS TODAY (audited before writing this file — nothing below duplicates it):
--   * `coffee_media` (coffee_id, file_asset_id, sort_order, is_primary) + `file_assets` — the catalogue
--     media model. RLS already admits `is_platform_admin()` for ALL and publishes rows of PUBLISHED
--     coffees. What is missing is (a) somewhere for the bytes to live and (b) a removal path: the
--     console holds NO DELETE grant on any table it touches, by design (Feature 010 T033,
--     `tests/admin/no-hard-delete.test.ts`), and this migration keeps it that way.
--   * `public-assets` bucket (public, 5 MiB, JPEG/PNG/WebP) — created by
--     20260922130000_feature_010_branding_avatar_listing_media.sql for avatars and the platform logo.
--     Catalogue photography is the same kind of asset: public marketing imagery with no private data.
--     It is REUSED under a new `catalogue/{coffee_id}/` prefix — no new bucket.
--   * `coffee_translations(coffee_id, locale, name, description)` and `origin_translations(origin_id,
--     locale, name, description)` — normalized translation tables (locale ∈ en|ar). They carry ONLY a
--     public-read policy for PUBLISHED/ACTIVE parents: an admin can neither write them nor read the
--     translation of a DRAFT coffee. This migration adds the missing admin read + a single audited
--     write path; it does not add `name_ar`/`name_en` columns anywhere.
--   * Region / coffee type / variety / processing method / packaging type have NO translation layer.
--     Five translation tables are added with the SAME normalized shape as the two above.
--
-- LANGUAGE MODEL (documented, not implied): the base row's `name`/`description` columns remain the
-- canonical ENGLISH text they already are (no existing row changes). The `ar` translation row carries
-- Arabic. An `en` translation row is permitted by the existing `locale` CHECK but is not used by the
-- application. Missing Arabic → the public site shows the English text marked `lang="en" dir="ltr"`
-- (the same honest fallback `EnglishCopy` already applies to interface copy) — never a guessed or
-- machine translation.
--
-- WHAT THIS ADDS
--   1. `public_asset_object_authorized()` — reproduced verbatim + one new branch: `catalogue/...` is
--      writable by `is_platform_admin()` only.
--   2. `coffee_media_one_primary_per_coffee_idx` — at most one primary image per coffee, enforced by
--      the database (the existing `setCoffeeMediaPrimary` already demotes before it promotes).
--   3. `attach_coffee_media()` / `remove_coffee_media()` — platform-admin only, SECURITY DEFINER,
--      path-prefix validated against the coffee id (the pre-apply-review lesson from
--      `attach_offer_media`), 12-image cap, first image becomes primary, removal promotes the next.
--   4. `public_coffee_images` — an owner-run, security_barrier VIEW exposing ONLY (coffee slug,
--      object path, sort order, primary flag) for PUBLISHED coffees whose bytes live in the public
--      bucket. `file_assets` stays unreadable to `anon` (no grant, no new policy) — uploader and
--      organization ids are never published.
--   5. Admin SELECT policies on `coffee_translations` / `origin_translations`.
--   6. `region_translations`, `coffee_type_translations`, `coffee_variety_translations`,
--      `processing_method_translations`, `packaging_type_translations` — public read (their parent
--      tables are already publicly readable with a literal `true` predicate), no client write grant.
--   7. `set_catalogue_translation()` — the ONLY writer of every translation table. Platform-admin
--      only. Static SQL per entity kind (no dynamic SQL). A blank name REMOVES the translation (so an
--      admin can clear Arabic without the console ever holding a DELETE grant).
--
-- NOT CHANGED: `coffees`, `origins`, taxonomy base tables, `coffee_offer_media`, `listing-media`,
-- avatars/branding branches of the Storage helper, every existing policy and grant. No backfill.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard -----------------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  if not exists (select 1 from storage.buckets where id = 'public-assets' and public = true) then
    v_problems := v_problems || 'public-assets bucket missing (apply 20260922130000 first); ';
  end if;

  if to_regprocedure('public.public_asset_object_authorized(text,text)') is null then
    v_problems := v_problems || 'public_asset_object_authorized(text,text) missing; ';
  end if;

  if to_regclass('public.coffee_media') is null or to_regclass('public.coffees') is null
     or to_regclass('public.file_assets') is null or to_regclass('public.coffee_translations') is null
     or to_regclass('public.origin_translations') is null or to_regclass('public.regions') is null
     or to_regclass('public.coffee_types') is null or to_regclass('public.coffee_varieties') is null
     or to_regclass('public.processing_methods') is null or to_regclass('public.packaging_types') is null
     or to_regclass('public.origins') is null then
    v_problems := v_problems || 'a required catalogue table is missing; ';
  end if;

  if to_regclass('public.region_translations') is not null or to_regclass('public.coffee_type_translations') is not null
     or to_regclass('public.coffee_variety_translations') is not null or to_regclass('public.processing_method_translations') is not null
     or to_regclass('public.packaging_type_translations') is not null or to_regclass('public.public_coffee_images') is not null
     or to_regclass('public.coffee_media_one_primary_per_coffee_idx') is not null then
    v_problems := v_problems || 'an object this migration creates already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('attach_coffee_media', 'remove_coffee_media', 'set_catalogue_translation');
  if v_count <> 0 then
    v_problems := v_problems || 'a function this migration creates already exists; ';
  end if;

  -- The one-primary index would fail on existing duplicates; refuse rather than silently demote.
  select count(*) into v_count from (
    select coffee_id from public.coffee_media where is_primary group by coffee_id having count(*) > 1
  ) dupes;
  if v_count <> 0 then
    v_problems := v_problems || v_count || ' coffee(s) already have more than one primary image — resolve first; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_platform_admin', 'is_blocked_user');
  if v_count <> 2 then
    v_problems := v_problems || 'expected role helpers is_platform_admin/is_blocked_user; ';
  end if;

  if v_problems <> '' then
    raise exception 'catalogue_media_and_translations preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Storage path authorization — verbatim + `catalogue/` -----------------------------------------
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

  -- catalogue/{coffee_id}/{file} — catalogue photography, platform admins only.
  if v_parts[1] = 'catalogue' then
    return array_length(v_parts, 1) >= 3 and public.is_platform_admin();
  end if;

  return false;
end;
$$;

revoke all on function public.public_asset_object_authorized(text, text) from public;
grant execute on function public.public_asset_object_authorized(text, text) to authenticated, service_role;

-- 2. At most one primary image per coffee ---------------------------------------------------------
create unique index coffee_media_one_primary_per_coffee_idx on public.coffee_media (coffee_id) where is_primary;

-- 3. Catalogue media write/remove RPCs ------------------------------------------------------------
create or replace function public.attach_coffee_media(
  p_coffee_id uuid,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_coffee uuid;
  v_count int;
  v_file_asset_id uuid;
  v_media_id uuid;
  v_next_order int;
  v_prefix text := 'catalogue/' || p_coffee_id::text || '/';
begin
  if auth.uid() is null or public.is_blocked_user() or not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  select id into v_coffee from public.coffees where id = p_coffee_id for update;
  if v_coffee is null then
    raise exception 'coffee_not_found';
  end if;

  if p_object_path is null or left(p_object_path, char_length(v_prefix)) <> v_prefix
     or char_length(p_object_path) <= char_length(v_prefix) or position('..' in p_object_path) > 0 then
    raise exception 'coffee_media_object_path_invalid';
  end if;
  if p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'coffee_media_type_invalid';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 5242880 then
    raise exception 'coffee_media_size_invalid';
  end if;

  select count(*) into v_count from public.coffee_media where coffee_id = p_coffee_id;
  if v_count >= 12 then
    raise exception 'coffee_media_limit_reached';
  end if;

  insert into public.file_assets (uploaded_by, organization_id, bucket_name, object_path, original_name, mime_type, size_bytes, is_private)
  values (auth.uid(), null, 'public-assets', p_object_path, left(coalesce(p_original_name, ''), 255), p_mime_type, p_size_bytes, false)
  returning id into v_file_asset_id;

  select coalesce(max(sort_order), -1) + 1 into v_next_order from public.coffee_media where coffee_id = p_coffee_id;

  insert into public.coffee_media (coffee_id, file_asset_id, sort_order, is_primary)
  values (p_coffee_id, v_file_asset_id, v_next_order, v_count = 0)
  returning id into v_media_id;

  return v_media_id;
end;
$function$;

revoke all on function public.attach_coffee_media(uuid, text, text, text, bigint) from public;
revoke all on function public.attach_coffee_media(uuid, text, text, text, bigint) from anon;
grant execute on function public.attach_coffee_media(uuid, text, text, text, bigint) to authenticated;

create or replace function public.remove_coffee_media(p_media_id uuid)
returns text -- the removed object path (public-assets), for the caller to delete from Storage; null if none
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_coffee_id uuid;
  v_file_asset_id uuid;
  v_was_primary boolean;
  v_bucket text;
  v_path text;
  v_next uuid;
begin
  if auth.uid() is null or public.is_blocked_user() or not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  select m.coffee_id, m.file_asset_id, m.is_primary, fa.bucket_name, fa.object_path
  into v_coffee_id, v_file_asset_id, v_was_primary, v_bucket, v_path
  from public.coffee_media m
  join public.file_assets fa on fa.id = m.file_asset_id
  where m.id = p_media_id
  for update of m;

  if v_coffee_id is null then
    raise exception 'coffee_media_not_found';
  end if;

  delete from public.coffee_media where id = p_media_id;
  -- Only a public catalogue asset is removed with its record. A legacy file_assets row in any other
  -- bucket (e.g. a metadata-only fixture) is left untouched rather than orphaning some other owner.
  if v_bucket = 'public-assets' then
    delete from public.file_assets where id = v_file_asset_id
      and not exists (select 1 from public.coffee_media where file_asset_id = v_file_asset_id);
  end if;

  if v_was_primary then
    select id into v_next from public.coffee_media where coffee_id = v_coffee_id order by sort_order, created_at limit 1;
    if v_next is not null then
      update public.coffee_media set is_primary = true where id = v_next;
    end if;
  end if;

  return case when v_bucket = 'public-assets' then v_path else null end;
end;
$function$;

revoke all on function public.remove_coffee_media(uuid) from public;
revoke all on function public.remove_coffee_media(uuid) from anon;
grant execute on function public.remove_coffee_media(uuid) to authenticated;

-- 4. Public catalogue images — a narrow view, never file_assets itself ----------------------------
create view public.public_coffee_images
with (security_barrier = true)
as
select
  c.slug as coffee_slug,
  fa.object_path,
  cm.sort_order,
  cm.is_primary
from public.coffee_media cm
join public.coffees c on c.id = cm.coffee_id and c.status = 'PUBLISHED'
join public.file_assets fa on fa.id = cm.file_asset_id and fa.bucket_name = 'public-assets' and fa.is_private = false;

revoke all on table public.public_coffee_images from public;
revoke all on table public.public_coffee_images from anon;
revoke all on table public.public_coffee_images from authenticated;
grant select on table public.public_coffee_images to anon, authenticated;

comment on view public.public_coffee_images is
  'Catalogue photography of PUBLISHED coffees stored in the public-assets bucket: slug, object path, order, primary flag only. Owner-run with its filter embedded, so file_assets (uploader/organization ids) is never exposed to anon.';

-- 5. Admin read of the two existing translation tables ---------------------------------------------
create policy coffee_translations_admin_read on public.coffee_translations
  for select to authenticated using (public.is_platform_admin());
create policy origin_translations_admin_read on public.origin_translations
  for select to authenticated using (public.is_platform_admin());

-- The single write path is set_catalogue_translation(); no client write is needed on these tables.
revoke insert, update on table public.coffee_translations from authenticated;
revoke insert, update on table public.origin_translations from authenticated;

-- 6. Taxonomy translation tables (same normalized shape) ------------------------------------------
create table public.region_translations (
  region_id uuid not null references public.regions(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (region_id, locale)
);
create table public.coffee_type_translations (
  coffee_type_id uuid not null references public.coffee_types(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (coffee_type_id, locale)
);
create table public.coffee_variety_translations (
  coffee_variety_id uuid not null references public.coffee_varieties(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (coffee_variety_id, locale)
);
create table public.processing_method_translations (
  processing_method_id uuid not null references public.processing_methods(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (processing_method_id, locale)
);
create table public.packaging_type_translations (
  packaging_type_id uuid not null references public.packaging_types(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (packaging_type_id, locale)
);

do $grants$
declare
  t text;
begin
  foreach t in array array['region_translations', 'coffee_type_translations', 'coffee_variety_translations', 'processing_method_translations', 'packaging_type_translations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to anon, authenticated', t);
    -- Parents are public reference data (public_read_* predicate is literal true), so are their names.
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_public_read', t);
  end loop;
end
$grants$;

-- 7. The single translation writer ----------------------------------------------------------------
create or replace function public.set_catalogue_translation(
  p_kind text,
  p_entity_id uuid,
  p_locale text,
  p_name text,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if auth.uid() is null or public.is_blocked_user() or not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_locale is null or p_locale not in ('en', 'ar') then
    raise exception 'translation_locale_invalid';
  end if;
  if v_name is not null and char_length(v_name) > 200 then
    raise exception 'translation_name_too_long';
  end if;
  if v_description is not null and char_length(v_description) > 4000 then
    raise exception 'translation_description_too_long';
  end if;
  if v_description is not null and p_kind not in ('coffee', 'origin') then
    raise exception 'translation_description_not_applicable';
  end if;

  if p_kind = 'coffee' then
    if v_name is null then
      delete from public.coffee_translations where coffee_id = p_entity_id and locale = p_locale;
    else
      insert into public.coffee_translations (coffee_id, locale, name, description) values (p_entity_id, p_locale, v_name, v_description)
      on conflict (coffee_id, locale) do update set name = excluded.name, description = excluded.description;
    end if;
  elsif p_kind = 'origin' then
    if v_name is null then
      delete from public.origin_translations where origin_id = p_entity_id and locale = p_locale;
    else
      insert into public.origin_translations (origin_id, locale, name, description) values (p_entity_id, p_locale, v_name, v_description)
      on conflict (origin_id, locale) do update set name = excluded.name, description = excluded.description;
    end if;
  elsif p_kind = 'region' then
    if v_name is null then
      delete from public.region_translations where region_id = p_entity_id and locale = p_locale;
    else
      insert into public.region_translations (region_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (region_id, locale) do update set name = excluded.name;
    end if;
  elsif p_kind = 'coffee_type' then
    if v_name is null then
      delete from public.coffee_type_translations where coffee_type_id = p_entity_id and locale = p_locale;
    else
      insert into public.coffee_type_translations (coffee_type_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (coffee_type_id, locale) do update set name = excluded.name;
    end if;
  elsif p_kind = 'variety' then
    if v_name is null then
      delete from public.coffee_variety_translations where coffee_variety_id = p_entity_id and locale = p_locale;
    else
      insert into public.coffee_variety_translations (coffee_variety_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (coffee_variety_id, locale) do update set name = excluded.name;
    end if;
  elsif p_kind = 'processing' then
    if v_name is null then
      delete from public.processing_method_translations where processing_method_id = p_entity_id and locale = p_locale;
    else
      insert into public.processing_method_translations (processing_method_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (processing_method_id, locale) do update set name = excluded.name;
    end if;
  elsif p_kind = 'packaging' then
    if v_name is null then
      delete from public.packaging_type_translations where packaging_type_id = p_entity_id and locale = p_locale;
    else
      insert into public.packaging_type_translations (packaging_type_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (packaging_type_id, locale) do update set name = excluded.name;
    end if;
  else
    raise exception 'translation_kind_invalid';
  end if;
end;
$function$;

revoke all on function public.set_catalogue_translation(text, uuid, text, text, text) from public;
revoke all on function public.set_catalogue_translation(text, uuid, text, text, text) from anon;
grant execute on function public.set_catalogue_translation(text, uuid, text, text, text) to authenticated;

commit;
