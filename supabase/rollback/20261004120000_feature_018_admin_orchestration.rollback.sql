-- Rollback for Feature 018 M3 (admin_orchestration): a SAFE DOWNGRADE.
--
-- Drops only the controlled public routines (creation, step saves, media, offers, Featured, publication, compliance
-- decision, readiness, recovery). RETAINED on purpose: every Coffee, translation, media row, offer, Featured selection,
-- review and request-log row created through them; the revision columns and their bump triggers (edit tokens stay
-- collision-safe for direct edits); and the publication-readiness trigger, so the old raw DRAFT -> PUBLISHED update
-- path does NOT reopen as an unchecked bypass. Roles, policies and inventory authority are never touched.
-- M1 (Featured column) must not be rolled back while these routines exist; re-apply 20261004120000 to restore them.

begin;

drop function if exists public.create_catalogue_coffee_intent(uuid, jsonb);
drop function if exists public.save_catalogue_step(uuid, uuid, text, integer, jsonb);
drop function if exists public.attach_catalogue_media(uuid, uuid, integer, text, text, text, bigint);
drop function if exists public.remove_catalogue_media(uuid, uuid, integer, uuid);
drop function if exists public.set_catalogue_media_primary(uuid, uuid, integer, uuid);
drop function if exists public.list_catalogue_backing_positions(uuid);
drop function if exists public.create_backed_offer_intent(uuid, uuid, integer, uuid, numeric, numeric, text);
drop function if exists public.save_offer_commercials(uuid, uuid, integer, numeric, numeric, text);
drop function if exists public.set_coffee_featured(uuid, boolean, integer, uuid);
drop function if exists public.get_catalogue_readiness(uuid);
drop function if exists public.publish_coffee_catalogue_only(uuid, integer, uuid);
drop function if exists public.publish_coffee_with_approved_offer(uuid, uuid, integer, integer, uuid);
drop function if exists public.record_listing_review_decision(uuid, text, text, uuid);
drop function if exists public.recover_catalogue_operation(uuid);

commit;
