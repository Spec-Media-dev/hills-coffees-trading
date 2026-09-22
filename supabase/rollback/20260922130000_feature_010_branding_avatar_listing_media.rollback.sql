-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for supabase/migrations/20260922130000_feature_010_branding_avatar_listing_media.sql
-- Every addition in that migration is strictly additive (two new tables, two new Storage buckets,
-- their policies, and eight new functions) — this rollback removes exactly those additions. No
-- existing table/column/policy/function predating that migration is altered.
-- NOTE: dropping a Storage bucket also deletes every object inside it. If any avatar/logo/listing
-- image was genuinely uploaded after the migration was applied and before this rollback runs, those
-- bytes are permanently lost — confirm nothing real exists in `public-assets`/`listing-media` first.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- Storage policies (must drop before the buckets, and before the functions they call).
drop policy if exists listing_media_delete on storage.objects;
drop policy if exists listing_media_insert on storage.objects;
drop policy if exists listing_media_select on storage.objects;
drop policy if exists public_assets_delete on storage.objects;
drop policy if exists public_assets_update on storage.objects;
drop policy if exists public_assets_write on storage.objects;
drop policy if exists public_assets_select on storage.objects;

-- Listing-media RPCs.
drop function if exists public.reorder_offer_media(uuid, uuid[]);
drop function if exists public.set_primary_offer_media(uuid);
drop function if exists public.remove_offer_media(uuid);
drop function if exists public.attach_offer_media(uuid, text, text, text, bigint);
drop function if exists public.offer_media_object_authorized(text, boolean);

-- Avatar/logo RPCs.
drop function if exists public.remove_platform_logo();
drop function if exists public.set_platform_logo(text);
drop function if exists public.remove_my_avatar();
drop function if exists public.set_my_avatar(text);
drop function if exists public.public_asset_object_authorized(text, text);

-- Buckets (deletes their objects — see the header warning above).
delete from storage.buckets where id in ('public-assets', 'listing-media');

-- Tables.
drop table if exists public.coffee_offer_media;
drop table if exists public.platform_settings;

commit;
