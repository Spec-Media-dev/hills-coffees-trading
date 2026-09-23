-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 20260924120000_tag_translations.sql — restores set_catalogue_translation EXACTLY as
-- 20260923120000 defined it (no `tag` kind) and drops tag_translations (its rows are lost).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

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

drop table if exists public.tag_translations;

commit;
