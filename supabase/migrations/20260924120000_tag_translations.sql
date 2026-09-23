-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Pre-Stripe hardening run (2026-09-24) — Arabic names for catalogue TAGS ("Characteristics").
-- Rollback:  supabase/rollback/20260924120000_tag_translations.rollback.sql (paired; outside migrations/).
-- Postflight (read-only): supabase/maintenance/20260924_tag_translations_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — human security review + manual apply.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: tags are public, admin-managed reference labels rendered on every public coffee detail page
--   ("Characteristics"). Migration 20260923120000 gave every OTHER catalogue taxonomy a normalized
--   `*_translations` table; tags were the one user-facing label without an Arabic store, so an Arabic
--   visitor could only ever see the English tag name.
-- WHAT (minimal, same shape as 20260923120000 — no new pattern):
--   1. `public.tag_translations (tag_id, locale, name)`: FK → tags ON DELETE CASCADE, locale ∈ (en, ar),
--      name 1..200, PK (tag_id, locale). RLS on; SELECT-only grants to anon/authenticated (tags are
--      public reference data); NO insert/update/delete grant to anyone but the definer function.
--   2. `set_catalogue_translation` re-declared VERBATIM plus ONE new branch, `p_kind = 'tag'`
--      (name only — a description on a tag is still refused by the existing guard). Admin re-check,
--      search_path, grants and every other branch are byte-for-byte unchanged.
-- WHAT IT DOES NOT DO: no change to `tags` itself, no data backfill, no other table/policy/grant.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard ------------------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.tags') is null then
    v_problems := v_problems || 'public.tags missing; ';
  end if;
  if to_regclass('public.tag_translations') is not null then
    v_problems := v_problems || 'public.tag_translations already exists; ';
  end if;
  if to_regprocedure('public.set_catalogue_translation(text,uuid,text,text,text)') is null then
    v_problems := v_problems || 'set_catalogue_translation missing (apply 20260923120000 first); ';
  end if;
  if to_regclass('public.region_translations') is null then
    v_problems := v_problems || 'region_translations missing (apply 20260923120000 first); ';
  end if;
  if v_problems <> '' then
    raise exception 'tag_translations preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. The table ------------------------------------------------------------------------------------
create table public.tag_translations (
  tag_id uuid not null references public.tags(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  primary key (tag_id, locale)
);

alter table public.tag_translations enable row level security;
revoke all on table public.tag_translations from public, anon, authenticated;
grant select on table public.tag_translations to anon, authenticated;
create policy tag_translations_public_read on public.tag_translations for select to anon, authenticated using (true);

-- 2. The single translation writer, + the `tag` kind ----------------------------------------------
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
  elsif p_kind = 'tag' then
    if v_name is null then
      delete from public.tag_translations where tag_id = p_entity_id and locale = p_locale;
    else
      insert into public.tag_translations (tag_id, locale, name) values (p_entity_id, p_locale, v_name)
      on conflict (tag_id, locale) do update set name = excluded.name;
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
