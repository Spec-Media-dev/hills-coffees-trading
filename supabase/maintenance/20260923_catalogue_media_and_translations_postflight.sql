-- READ-ONLY POSTFLIGHT for supabase/migrations/20260923120000_catalogue_media_and_translations.sql.
-- Run ONLY after the migration is applied. No writes. Every row must report ok = true.

with checks(check_name, ok, detail) as (
  select 'public_asset_object_authorized carries the catalogue branch and still the avatars/branding branches',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'public_asset_object_authorized' and p.prosecdef
                   and p.prosrc like '%''catalogue''%' and p.prosrc like '%''avatars''%' and p.prosrc like '%''branding''%'), ''
  union all
  select 'one primary image per coffee is a unique partial index',
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'coffee_media_one_primary_per_coffee_idx' and indexdef ilike '%unique%' and indexdef ilike '%where is_primary%'), ''
  union all
  select 'attach_coffee_media/remove_coffee_media/set_catalogue_translation: SECURITY DEFINER, pinned search_path, admin-gated',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname in ('attach_coffee_media', 'remove_coffee_media', 'set_catalogue_translation')
              and p.prosrc like '%is_platform_admin()%'
              and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 3, ''
  union all
  select 'attach_coffee_media validates the path against the coffee id and caps the count',
         exists (select 1 from pg_proc where proname = 'attach_coffee_media' and prosrc like '%coffee_media_object_path_invalid%' and prosrc like '%coffee_media_limit_reached%'), ''
  union all
  select 'no new function is executable by anon or PUBLIC',
         not exists (select 1 from information_schema.role_routine_grants
                     where routine_schema = 'public' and grantee in ('anon', 'PUBLIC')
                       and routine_name in ('attach_coffee_media', 'remove_coffee_media', 'set_catalogue_translation')), ''
  union all
  select 'public_coffee_images: security_barrier view, SELECT-only for anon/authenticated, published + public bucket filter embedded',
         coalesce((select 'security_barrier=true' = any (c.reloptions) from pg_class c where c.oid = to_regclass('public.public_coffee_images')), false)
           and pg_get_viewdef('public.public_coffee_images'::regclass) ilike '%PUBLISHED%'
           and pg_get_viewdef('public.public_coffee_images'::regclass) ilike '%public-assets%'
           and (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'public_coffee_images' and grantee = 'anon'), ''
  union all
  select 'public_coffee_images does not expose uploader or organization ids',
         not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'public_coffee_images' and column_name in ('uploaded_by', 'organization_id', 'file_asset_id', 'coffee_id')), ''
  union all
  select 'anon still holds NO privilege on file_assets',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'file_assets' and grantee = 'anon'), ''
  union all
  select 'authenticated still holds NO DELETE grant on coffee_media, file_assets or any translation table (T033 posture)',
         not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'DELETE'
                     and table_name in ('coffee_media', 'file_assets', 'coffee_translations', 'origin_translations', 'region_translations', 'coffee_type_translations',
                                        'coffee_variety_translations', 'processing_method_translations', 'packaging_type_translations')), ''
  union all
  select 'coffee/origin translations: admin read policy present, client INSERT/UPDATE revoked (single writer = RPC)',
         exists (select 1 from pg_policies where tablename = 'coffee_translations' and policyname = 'coffee_translations_admin_read')
           and exists (select 1 from pg_policies where tablename = 'origin_translations' and policyname = 'origin_translations_admin_read')
           and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'
                           and table_name in ('coffee_translations', 'origin_translations') and privilege_type in ('INSERT', 'UPDATE')), ''
  union all
  select 'five taxonomy translation tables exist with RLS, public SELECT only',
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relrowsecurity and c.relname in ('region_translations', 'coffee_type_translations', 'coffee_variety_translations',
                                                                              'processing_method_translations', 'packaging_type_translations')) = 5
           and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
                           and privilege_type <> 'SELECT'
                           and table_name in ('region_translations', 'coffee_type_translations', 'coffee_variety_translations', 'processing_method_translations', 'packaging_type_translations')), ''
  union all
  select 'every catalogue image record points at a public-assets path scoped to its own coffee',
         not exists (select 1 from public.coffee_media cm join public.file_assets fa on fa.id = cm.file_asset_id
                     where fa.bucket_name = 'public-assets' and left(fa.object_path, char_length('catalogue/' || cm.coffee_id::text || '/')) <> 'catalogue/' || cm.coffee_id::text || '/'), ''
)
select check_name, ok, detail,
       case when bool_and(ok) over () then 'ALL CHECKS PASSED' else 'AT LEAST ONE CHECK FAILED — DO NOT PROCEED' end as overall_status
from checks
order by check_name;
