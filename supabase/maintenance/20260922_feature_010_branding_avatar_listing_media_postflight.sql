-- Feature 010 T047 + approved scope additions — READ-ONLY POSTFLIGHT for
-- supabase/migrations/20260922130000_feature_010_branding_avatar_listing_media.sql.
--
-- Run ONLY AFTER the migration has been applied. Performs NO writes. Safe to run any number of times.
-- Every row must report ok = true.

with checks(check_name, ok, detail) as (
  select 'platform_settings exists with exactly one row', to_regclass('public.platform_settings') is not null and (select count(*) from public.platform_settings) = 1, ''
  union all
  select 'platform_settings RLS enabled, public SELECT only', coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.platform_settings')), false)
           and (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings')
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'platform_settings' and policyname = 'platform_settings_public_read' and cmd = 'SELECT'), ''
  union all
  select 'authenticated/anon hold SELECT only on platform_settings',
         (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'platform_settings' and grantee = 'authenticated')
           and (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'platform_settings' and grantee = 'anon'), ''
  union all
  select 'bucket public-assets exists, public=true, 5MiB, image mimetypes',
         exists (select 1 from storage.buckets where id = 'public-assets' and public = true and file_size_limit = 5242880
           and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']), ''
  union all
  select 'bucket listing-media exists, public=false, 8MiB, image mimetypes',
         exists (select 1 from storage.buckets where id = 'listing-media' and public = false and file_size_limit = 8388608
           and allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']), ''
  union all
  select 'coffee_offer_media exists with exactly one primary per offer enforced (unique partial index)',
         to_regclass('public.coffee_offer_media') is not null
           and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'coffee_offer_media' and indexname = 'coffee_offer_media_one_primary_per_offer_idx'), ''
  union all
  select 'coffee_offer_media RLS enabled, exactly two SELECT policies (owner/admin + member-when-visible)',
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.coffee_offer_media')), false)
           and (select count(*) = 2 from pg_policies where schemaname = 'public' and tablename = 'coffee_offer_media')
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coffee_offer_media' and policyname = 'coffee_offer_media_member_read' and qual ilike '%is_visible%' and qual ilike '%is_authorized_member%')
           and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coffee_offer_media' and policyname = 'coffee_offer_media_owner_or_admin_read' and qual ilike '%is_org_member%'), ''
  union all
  select 'authenticated holds SELECT only on coffee_offer_media; anon holds NONE (matches coffee_offers'' own member-only boundary)',
         (select coalesce(array_agg(privilege_type::text order by privilege_type) = array['SELECT'], false) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'coffee_offer_media' and grantee = 'authenticated')
           and not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'coffee_offer_media' and grantee = 'anon'), ''
  union all
  select 'all eight new functions exist as SECURITY DEFINER',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname in (
              'set_platform_logo', 'remove_platform_logo', 'set_my_avatar', 'remove_my_avatar',
              'attach_offer_media', 'remove_offer_media', 'set_primary_offer_media', 'reorder_offer_media'
            )) = 8, ''
  union all
  select 'set_my_avatar/remove_my_avatar/attach_offer_media/etc. EXECUTE granted to authenticated only (not anon)',
         not exists (
           select 1 from information_schema.role_routine_grants
           where routine_schema = 'public' and grantee = 'anon' and routine_name in (
             'set_platform_logo', 'remove_platform_logo', 'set_my_avatar', 'remove_my_avatar',
             'attach_offer_media', 'remove_offer_media', 'set_primary_offer_media', 'reorder_offer_media'
           )
         ), ''
  union all
  select 'storage.objects policies exist for both new buckets (select/write coverage)',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public_assets_select')
           and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public_assets_write')
           and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'listing_media_select')
           and exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'listing_media_insert'), ''
  union all
  select 'coffee_media / coffees / file_assets (existing tables) are structurally untouched',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'file_assets') = 10
           and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'coffee_media') = 7, ''
  union all
  select 'zero existing coffee_offer_media rows reference a deleted/private offer publicly (integrity spot-check)',
         not exists (
           select 1 from public.coffee_offer_media m
           join public.coffee_offers o on o.id = m.offer_id
           where o.deleted_at is not null and o.is_visible = true
         ), ''
  union all
  select 'every coffee_offer_media row''s file_assets.object_path is genuinely scoped to its own offer_id (no cross-offer reference)',
         not exists (
           select 1 from public.coffee_offer_media m
           join public.file_assets fa on fa.id = m.file_asset_id
           where fa.object_path <> ('offers/' || m.offer_id::text || '/' || split_part(fa.object_path, '/', 3))
         ), ''
)
select
  check_name,
  ok,
  detail,
  case when bool_and(ok) over () then 'ALL CHECKS PASSED' else 'AT LEAST ONE CHECK FAILED — DO NOT PROCEED' end as overall_status
from checks
order by check_name;
