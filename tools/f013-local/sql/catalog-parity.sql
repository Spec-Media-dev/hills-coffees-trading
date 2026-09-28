-- Read-only minimum catalogue parity after M4a and identity bootstrap.
with checks as (select
  to_regclass('public.commerce_settings') is not null as commerce_settings_present,
  to_regclass('public.platform_settings') is not null as platform_settings_present,
  to_regclass('f013_local.identity') is not null as identity_present,
  (select count(*) = 1 and bool_and(id and proforma_validity_hours = 24 and not bank_transfer_checkout_enabled and proof_submission_enabled and pilot_organization_ids = '{}'::uuid[]) from public.commerce_settings) as commerce_settings_safe,
  (select count(*) = 1 and bool_and(id) from public.platform_settings) as platform_settings_singleton,
  (select count(*) = 1 and bool_and(id and nonce ~ '^[a-f0-9]{64}$') from f013_local.identity) as identity_singleton,
  exists (select 1 from storage.buckets where id = 'kyb-evidence' and not public and file_size_limit = 10485760) as kyb_bucket_present,
  exists (select 1 from storage.buckets where id = 'public-assets' and public and file_size_limit = 5242880) as public_assets_bucket_present,
  exists (select 1 from storage.buckets where id = 'listing-media' and not public and file_size_limit = 8388608) as listing_media_bucket_present,
  exists (select 1 from pg_trigger where tgname = 'on_auth_user_created'
    and tgrelid = 'auth.users'::regclass
    and tgfoid = 'public.handle_new_user()'::regprocedure
    and tgenabled = 'O' and not tgisinternal
    and (tgtype & 1) = 1  -- FOR EACH ROW
    and (tgtype & 2) = 0  -- AFTER
    and (tgtype & 4) = 4  -- INSERT
    and (tgtype & (8 | 16 | 32 | 64)) = 0) as auth_trigger_present)
select case when commerce_settings_present and platform_settings_present and identity_present
       and commerce_settings_safe and platform_settings_singleton and identity_singleton
       and kyb_bucket_present and public_assets_bucket_present and listing_media_bucket_present
       and auth_trigger_present then 'F013_CATALOG_OK' else 'F013_CATALOG_FAILED' end as status,
       * from checks;
