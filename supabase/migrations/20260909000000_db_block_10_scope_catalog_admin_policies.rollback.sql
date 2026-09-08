-- Rollback for 20260909000000_db_block_10_scope_catalog_admin_policies.sql
--
-- Restores the five `catalog_admin_*` policies to their recorded pre-migration scope, `TO public`.
--
-- Recorded before-state (source: docs/database/database-schema-report.json, generated
-- 2026-09-07T19:03:53Z) — all five were identical in shape:
--
--   command   : ALL
--   roles     : {public}
--   using     : is_platform_admin()
--   with check: (none)
--
-- Applying this rollback reinstates DB-BLOCK-10: anonymous SELECT on `coffees`, `origins`,
-- `coffee_tags`, `coffee_certifications`, `coffee_media`, `coffee_translations` and
-- `origin_translations` will again abort with `42501 permission denied for function
-- is_platform_admin`. Only roll back if the forward migration itself caused a regression.
--
-- This is a metadata-only change: instant, no data movement, no lock beyond the catalog update.

alter policy catalog_admin_coffees            on public.coffees               to public;
alter policy catalog_admin_origins            on public.origins               to public;
alter policy catalog_admin_coffee_tags        on public.coffee_tags           to public;
alter policy catalog_admin_certifications     on public.coffee_certifications to public;
alter policy catalog_admin_coffee_media       on public.coffee_media          to public;
