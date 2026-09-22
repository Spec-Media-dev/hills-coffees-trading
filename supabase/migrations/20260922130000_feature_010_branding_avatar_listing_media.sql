-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 010 T047 + approved scope additions (RUN F010-ACCOUNT-MEDIA, 2026-09-22) — platform branding
-- (logo), self-service avatars, and seller-owned listing media. PREPARED FOR HUMAN APPROVAL — NOT
-- APPLIED. Do not run `supabase db push` / the SQL Editor without approval. Does NOT create or modify
-- any Storage bucket remotely by itself running this file requires human review first, same as every
-- other migration in this repository.
-- Rollback: supabase/rollback/20260922130000_feature_010_branding_avatar_listing_media.rollback.sql
-- Postflight (read-only): supabase/maintenance/20260922_feature_010_branding_avatar_listing_media_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- APPROVED PRODUCT DECISION THIS MIGRATION IMPLEMENTS (RUN F010-ACCOUNT-MEDIA, recorded verbatim in
-- `specs/010-admin-operations-console/tasks.md` T047): a platform-ADMIN-controlled site logo, reusing
-- the "generic `file_assets` + one bucket + one metadata-write RPC" shape `DB-BLOCK-01` already
-- established for KYB evidence (`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`) —
-- never reusing the `kyb-evidence` bucket itself (that migration's own explicit rule, "the KYB bucket
-- is not reused"). Two APPROVED SCOPE ADDITIONS beyond T047's original wording, explicitly recorded as
-- additions rather than pretended to be original Feature 010 tasks: (1) self-service avatar upload for
-- every role (the run directive's Part 4 — `profiles.avatar_path` already exists as a column with zero
-- writer; Feature 003 T027's own comment already named this exact gap: "no approved avatar upload
-- workflow exists ... rather than fabricate one"); (2) seller-owned listing media (Part 6) — a
-- GENUINELY NEW capability, not a completion of the existing `coffee_media` table, because that table's
-- own foreign key and RLS (`coffee_media.coffee_id -> coffees.id`, `coffees` has no seller/organization
-- column at all, `catalog_admin_coffees: ALL is_platform_admin()`) prove it is admin-curated CATALOGUE
-- reference media, not per-seller LISTING media — structurally incompatible with "a seller owns their
-- own listing's images", which this migration's new `coffee_offer_media` table (attached to
-- `coffee_offers`, which already has `seller_organization_id` and the established `offers_owner_or_admin`
-- ownership pattern) is built to satisfy instead. `coffee_media`/`coffees` are UNTOUCHED by this
-- migration.
--
-- THE MODEL — three additive, narrowly-scoped capabilities, each following the SAME
-- bucket+path-authorization-helper+SECURITY-DEFINER-RPC shape `attach_kyb_document`/
-- `kyb_storage_object_authorized` already established, reused deliberately rather than reinvented:
--
--   1. `platform_settings` — a genuine singleton table (`id boolean primary key default true check
--      (id)`, the standard Postgres one-row-table trick) holding ONLY `logo_object_path` (nullable —
--      null means "use the static default logo", never a broken reference) plus attribution/timestamp
--      columns. Public SELECT (the public site header needs to know the configured path to render it);
--      writes ONLY through `set_platform_logo()`/`remove_platform_logo()`, both `is_platform_admin()`-
--      only. No general CMS: exactly one column of actual content.
--   2. `public-assets` bucket (PUBLIC — avatars and the platform logo carry no sensitive data, and
--      public, CDN-servable URLs are the simplest, most consistent way to render them anywhere,
--      including the unauthenticated public site header). Path-prefixed: `avatars/{auth.uid()}/...`
--      (self-service, one user's own path only) and `branding/...` (admin-only). ONE bucket, not two,
--      because both purposes are equally low-sensitivity and the path prefix already separates
--      authorization cleanly — avoiding unjustified bucket proliferation.
--   3. `set_my_avatar(p_object_path)` / `remove_my_avatar()` — self-only (`auth.uid()`), validate the
--      path's own `avatars/{auth.uid()}/` prefix (defense in depth on top of the Storage policy below),
--      update `profiles.avatar_path` (the EXISTING column, unchanged type/meaning), return the OLD path
--      so the calling Server Action can delete the superseded Storage object (RPCs cannot call the
--      Storage API themselves — this mirrors the SAME DB-writes-bookkeeping / application-does-I/O split
--      Feature 008's `record_stripe_payment_intent` already established this run).
--   4. `set_platform_logo(p_object_path)` / `remove_platform_logo()` — the exact same shape, admin-only,
--      for the one `platform_settings.logo_object_path` value.
--   5. `coffee_offer_media` — one row per (offer, image), mirroring `coffee_media`'s own exact column
--      shape (`sort_order`, `is_primary`) for a familiar, reviewable pattern, but keyed to
--      `coffee_offers` instead. Reuses `file_assets` for the byte metadata (bucket/path/mime/size) —
--      NOT a new asset table, only the ONE new linking table the existing architecture structurally
--      lacked for this ownership model. Member-read only when the parent offer is genuinely visible
--      to members (`is_authorized_member() AND is_visible = true` — the EXACT same audience
--      `member_read_published_offers` already admits; `coffee_offers` itself has no anonymous/public
--      grant at all, so this table does not invent a wider one for its images); seller-of-record and
--      admin read everything, including draft.
--   6. `listing-media` bucket (PRIVATE — a DRAFT listing's images must never leak, and even a
--      PUBLISHED listing's images are member-only, matching `coffee_offers`' own boundary — a
--      public/anonymous bucket could express neither, since a public bucket's direct URL bypasses RLS
--      entirely for everyone, including anonymous visitors). Path: `offers/{offerId}/{filename}`. The
--      SAME "member read only when the parent row says so" RLS shape as `coffee_offer_media`'s own
--      table policy, implemented at the Storage layer too — an authorized member can fetch a
--      published offer's image bytes directly via the authenticated client (no signed-URL machinery
--      needed), while a draft offer's bytes, and every offer's bytes for an anonymous caller, are
--      unreachable by anyone but the seller org or an admin.
--   7. `attach_offer_media()` / `remove_offer_media()` / `set_primary_offer_media()` /
--      `reorder_offer_media()` — seller-of-record (`is_org_member(seller_organization_id)`, and only
--      while the offer is in one of the SAME `EDITABLE_STATUSES` `src/app/dashboard/listings/[offerId]/
--      actions.ts` already uses for every other field: DRAFT/PENDING_REVIEW/APPROVED/PUBLISHED/
--      PARTIALLY_FILLED) or admin. A per-offer image-count limit (8) is enforced in `attach_offer_media`.
--      The first image attached becomes primary automatically; removing the primary image promotes the
--      next-lowest `sort_order` survivor automatically, so an offer with any images always has exactly
--      one primary (or zero, only when it has zero images) — never a broken/absent-primary state.
--
-- WHO: no new role. `is_platform_admin()`/`is_org_member()`/`is_blocked_user()` are the SAME existing
-- helpers every other function in this schema already uses.
--
-- NOT CHANGED: `coffee_media`, `coffees`, `file_assets`' own existing columns/policies, `profiles`'
-- own existing columns/policies (only its already-nullable `avatar_path` VALUE is written, by a new
-- RPC — no schema change to `profiles` itself), `kyb-evidence` bucket/policies, `update_my_profile()`.
--
-- BACKFILL: none. No historical avatar/logo/listing-image data exists to backfill.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard ------------------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  if to_regclass('public.platform_settings') is not null
     or to_regclass('public.coffee_offer_media') is not null then
    v_problems := v_problems || 'a Feature 010 branding/media table already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'set_platform_logo', 'remove_platform_logo', 'set_my_avatar', 'remove_my_avatar',
    'attach_offer_media', 'remove_offer_media', 'set_primary_offer_media', 'reorder_offer_media',
    'offer_media_object_authorized', 'public_asset_object_authorized'
  );
  if v_count <> 0 then
    v_problems := v_problems || 'a Feature 010 branding/media function already exists; ';
  end if;

  if exists (select 1 from storage.buckets where id in ('public-assets', 'listing-media')) then
    v_problems := v_problems || 'a Feature 010 branding/media bucket already exists; ';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_path'
  ) then
    v_problems := v_problems || 'profiles.avatar_path is missing; ';
  end if;

  if to_regclass('public.coffee_offers') is null or to_regclass('public.file_assets') is null
     or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a required table is missing; ';
  end if;

  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'coffee_offers'
    and column_name in ('id', 'seller_organization_id', 'status', 'is_visible', 'deleted_at');
  if v_count <> 5 then
    v_problems := v_problems || 'coffee_offers: expected 5 known columns, found ' || v_count || '; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_platform_admin', 'is_org_member', 'is_blocked_user', 'is_authorized_member');
  if v_count <> 4 then
    v_problems := v_problems || 'expected role helpers (is_platform_admin, is_org_member, is_blocked_user, is_authorized_member), found ' || v_count || '; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_010_branding_avatar_listing_media preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Platform branding — singleton settings row ---------------------------------------------------
create table public.platform_settings (
  id boolean primary key default true,
  logo_object_path text null,
  logo_updated_at timestamptz null,
  logo_updated_by uuid null references public.profiles(id),
  constraint platform_settings_single_row check (id),
  constraint platform_settings_logo_object_path_check check (logo_object_path is null or char_length(btrim(logo_object_path)) > 0)
);

insert into public.platform_settings (id) values (true);

comment on table public.platform_settings is
  'Feature 010 T047: platform-wide branding config. Genuinely singleton (id boolean primary key default true, CHECK(id)) — exactly one row ever exists. logo_object_path NULL means "use the static default logo", never a broken reference. Written ONLY by set_platform_logo()/remove_platform_logo() (is_platform_admin()-only). Not a general CMS — exactly one column of actual content.';

alter table public.platform_settings enable row level security;

revoke all on table public.platform_settings from public;
revoke all on table public.platform_settings from anon;
revoke all on table public.platform_settings from authenticated;
grant select on table public.platform_settings to anon, authenticated;
revoke insert, update, delete, truncate on table public.platform_settings from service_role;

-- Public read: the public site header needs to know the configured logo path to render it, including
-- for an anonymous visitor.
create policy platform_settings_public_read
  on public.platform_settings
  for select
  to anon, authenticated
  using (true);

-- 2. `public-assets` bucket (avatars + branding) ----------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-assets',
  'public-assets',
  true,
  5242880, -- 5 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path-authorization helper, mirroring kyb_storage_object_authorized()'s exact shape. Two path
-- prefixes, two different authorization rules, one function (avoids two near-duplicate policies).
create or replace function public.public_asset_object_authorized(
  p_object_name text,
  p_operation text -- 'select' | 'write' — SELECT is allowed for everyone on this PUBLIC bucket; only WRITE is authorization-gated
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
    return true; -- public bucket: read is open to everyone, matching its own public=true bucket flag
  end if;

  if auth.uid() is null or public.is_blocked_user() then
    return false;
  end if;

  v_parts := string_to_array(p_object_name, '/');
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2 then
    return false;
  end if;

  if v_parts[1] = 'avatars' then
    -- avatars/{auth.uid()}/{filename} — self-service, one user's own path only.
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

drop policy if exists public_assets_select on storage.objects;
create policy public_assets_select on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'public-assets');

drop policy if exists public_assets_write on storage.objects;
create policy public_assets_write on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'public-assets'
    and public.public_asset_object_authorized(name, 'write')
  );

drop policy if exists public_assets_update on storage.objects;
create policy public_assets_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'public-assets'
    and public.public_asset_object_authorized(name, 'write')
  );

drop policy if exists public_assets_delete on storage.objects;
create policy public_assets_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'public-assets'
    and public.public_asset_object_authorized(name, 'write')
  );

-- 3. Avatar / logo metadata-write RPCs ---------------------------------------------------------------
create or replace function public.set_my_avatar(p_object_path text)
returns text -- the OLD path (for the caller to delete from Storage), or null if there was none
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_old_path text;
  v_expected_prefix text := 'avatars/' || auth.uid()::text || '/';
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;
  if p_object_path is null or left(p_object_path, char_length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'avatar_object_path_invalid';
  end if;

  select avatar_path into v_old_path from public.profiles where id = auth.uid();

  update public.profiles set avatar_path = p_object_path, updated_at = now() where id = auth.uid();

  return v_old_path;
end;
$function$;

revoke all on function public.set_my_avatar(text) from public;
revoke all on function public.set_my_avatar(text) from anon;
grant execute on function public.set_my_avatar(text) to authenticated;

create or replace function public.remove_my_avatar()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_old_path text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select avatar_path into v_old_path from public.profiles where id = auth.uid();

  update public.profiles set avatar_path = null, updated_at = now() where id = auth.uid();

  return v_old_path;
end;
$function$;

revoke all on function public.remove_my_avatar() from public;
revoke all on function public.remove_my_avatar() from anon;
grant execute on function public.remove_my_avatar() to authenticated;

create or replace function public.set_platform_logo(p_object_path text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_old_path text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if p_object_path is null or left(p_object_path, 9) <> 'branding/' then
    raise exception 'logo_object_path_invalid';
  end if;

  select logo_object_path into v_old_path from public.platform_settings where id = true;

  update public.platform_settings
  set logo_object_path = p_object_path, logo_updated_at = now(), logo_updated_by = auth.uid()
  where id = true;

  return v_old_path;
end;
$function$;

revoke all on function public.set_platform_logo(text) from public;
revoke all on function public.set_platform_logo(text) from anon;
grant execute on function public.set_platform_logo(text) to authenticated;

create or replace function public.remove_platform_logo()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_old_path text;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  select logo_object_path into v_old_path from public.platform_settings where id = true;

  update public.platform_settings
  set logo_object_path = null, logo_updated_at = now(), logo_updated_by = auth.uid()
  where id = true;

  return v_old_path;
end;
$function$;

revoke all on function public.remove_platform_logo() from public;
revoke all on function public.remove_platform_logo() from anon;
grant execute on function public.remove_platform_logo() to authenticated;

-- 4. Seller-owned listing media ----------------------------------------------------------------------
create table public.coffee_offer_media (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id) on delete restrict,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coffee_offer_media_file_asset_id_key unique (file_asset_id)
);

create index coffee_offer_media_offer_id_idx on public.coffee_offer_media (offer_id, sort_order);
-- One primary image per offer, enforced at the database level.
create unique index coffee_offer_media_one_primary_per_offer_idx on public.coffee_offer_media (offer_id) where is_primary;

comment on table public.coffee_offer_media is
  'Feature 010 approved scope addition (2026-09-22): seller-owned listing images, keyed to coffee_offers (NOT coffee_media/coffees, which are admin-curated catalogue reference media — see this migration''s own header). Reuses file_assets for byte metadata. Written ONLY by attach_offer_media()/remove_offer_media()/set_primary_offer_media()/reorder_offer_media() (seller-of-record or admin). "Public" SELECT here means the SAME audience member_read_published_offers already admits (is_authorized_member() AND is_visible) — coffee_offers itself has no anon/unauthenticated grant, so this table does not invent a wider one either.';

alter table public.coffee_offer_media enable row level security;

revoke all on table public.coffee_offer_media from public;
revoke all on table public.coffee_offer_media from anon;
revoke all on table public.coffee_offer_media from authenticated;
grant select on table public.coffee_offer_media to authenticated;
revoke insert, update, delete, truncate on table public.coffee_offer_media from service_role;

create policy coffee_offer_media_owner_or_admin_read
  on public.coffee_offer_media
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.coffee_offers o
      where o.id = coffee_offer_media.offer_id
        and public.is_org_member(o.seller_organization_id)
    )
  );

-- "Public" = the SAME audience coffee_offers' own member_read_published_offers policy already admits
-- (is_authorized_member() AND is_visible) — coffee_offers has no anon grant at all, so this table
-- does not invent a more permissive one for its images.
create policy coffee_offer_media_member_read
  on public.coffee_offer_media
  for select
  to authenticated
  using (
    public.is_authorized_member()
    and exists (
      select 1 from public.coffee_offers o
      where o.id = coffee_offer_media.offer_id
        and o.is_visible = true
        and o.deleted_at is null
    )
  );

-- 5. `listing-media` bucket (private) -----------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media',
  'listing-media',
  false,
  8388608, -- 8 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create or replace function public.offer_media_object_authorized(
  p_object_name text,
  p_require_editable boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_parts text[];
  v_offer_id uuid;
  v_seller_org uuid;
  v_status text;
  v_is_visible boolean;
  v_deleted_at timestamptz;
begin
  v_parts := string_to_array(p_object_name, '/');
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 3 or v_parts[1] <> 'offers' then
    return false;
  end if;

  begin
    v_offer_id := v_parts[2]::uuid;
  exception
    when others then
      return false;
  end;

  select seller_organization_id, status, is_visible, deleted_at
  into v_seller_org, v_status, v_is_visible, v_deleted_at
  from public.coffee_offers where id = v_offer_id;

  if v_seller_org is null then
    return false;
  end if;

  if auth.uid() is null then
    return false;
  end if;
  if public.is_blocked_user() then
    return false;
  end if;
  if public.is_platform_admin() then
    return true;
  end if;

  -- "Member" read: the SAME audience coffee_offers' own member_read_published_offers policy already
  -- admits (is_authorized_member() AND is_visible) — never a wider grant than the underlying listing
  -- data itself has. A draft/suspended/deleted offer's images stay unreachable by anyone but its own
  -- seller org or an admin, even by direct Storage path guess.
  if not p_require_editable and public.is_authorized_member() and v_is_visible = true and v_deleted_at is null then
    return true;
  end if;

  if not public.is_org_member(v_seller_org) then
    return false;
  end if;

  if p_require_editable and v_status not in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'PARTIALLY_FILLED') then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.offer_media_object_authorized(text, boolean) from public;
grant execute on function public.offer_media_object_authorized(text, boolean) to authenticated, service_role;

drop policy if exists listing_media_select on storage.objects;
create policy listing_media_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'listing-media'
    and public.offer_media_object_authorized(name, false)
  );

drop policy if exists listing_media_insert on storage.objects;
create policy listing_media_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'listing-media'
    and public.offer_media_object_authorized(name, true)
  );

-- No UPDATE/DELETE Storage policy: an object, once uploaded, is removed only through
-- remove_offer_media() deleting the DB rows first (the application then deletes the Storage object as
-- a best-effort follow-up — the same DB-then-Storage ordering `attach_kyb_document`'s own retained-
-- evidence design implies, adapted here since listing images (unlike KYB evidence) ARE meant to be
-- deletable by their own seller, just not overwritten in place).
drop policy if exists listing_media_delete on storage.objects;
create policy listing_media_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'listing-media'
    and public.offer_media_object_authorized(name, true)
  );

-- 6. Listing-media metadata-write RPCs ------------------------------------------------------------------
create or replace function public.attach_offer_media(
  p_offer_id uuid,
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
  v_seller_org uuid;
  v_status text;
  v_count int;
  v_file_asset_id uuid;
  v_media_id uuid;
  v_next_order int;
  v_is_first boolean;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select seller_organization_id, status into v_seller_org, v_status
  from public.coffee_offers where id = p_offer_id and deleted_at is null
  for update;

  if v_seller_org is null then
    raise exception 'offer_not_found';
  end if;
  if not (public.is_platform_admin() or public.is_org_member(v_seller_org)) then
    raise exception 'forbidden';
  end if;
  if v_status not in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'PARTIALLY_FILLED') then
    raise exception 'offer_media_not_editable';
  end if;

  -- REVIEW FIX (pre-apply security review, 2026-09-22): this function is otherwise the only place in
  -- this migration that accepts BOTH an ownership-scoping id (p_offer_id) and a free-form Storage path
  -- (p_object_path) without cross-validating them — unlike set_my_avatar()'s own p_object_path check
  -- against auth.uid(). Without this, a seller-of-record for SOME offer could call this function with
  -- a p_object_path belonging to a DIFFERENT offer they do not own, attaching someone else's already-
  -- uploaded image to their own listing. The existing file_assets_bucket_name_object_path_key UNIQUE
  -- constraint already blocks this once the real owner has attached that same path themselves, but
  -- does not close a path-squatting race (attaching a GUESSED path before its real owner does) or the
  -- general principle that this function should validate its own inputs, not rely on an incidental
  -- constraint elsewhere. Mirrors set_my_avatar()'s exact validation shape.
  if p_object_path is null or left(p_object_path, char_length('offers/' || p_offer_id::text || '/')) <> ('offers/' || p_offer_id::text || '/') then
    raise exception 'offer_media_object_path_invalid';
  end if;

  select count(*) into v_count from public.coffee_offer_media where offer_id = p_offer_id;
  if v_count >= 8 then
    raise exception 'offer_media_limit_reached';
  end if;
  v_is_first := v_count = 0;

  insert into public.file_assets (uploaded_by, organization_id, bucket_name, object_path, original_name, mime_type, size_bytes, is_private)
  values (auth.uid(), v_seller_org, 'listing-media', p_object_path, p_original_name, p_mime_type, p_size_bytes, true)
  returning id into v_file_asset_id;

  select coalesce(max(sort_order), -1) + 1 into v_next_order from public.coffee_offer_media where offer_id = p_offer_id;

  insert into public.coffee_offer_media (offer_id, file_asset_id, sort_order, is_primary)
  values (p_offer_id, v_file_asset_id, v_next_order, v_is_first)
  returning id into v_media_id;

  return v_media_id;
end;
$function$;

revoke all on function public.attach_offer_media(uuid, text, text, text, bigint) from public;
revoke all on function public.attach_offer_media(uuid, text, text, text, bigint) from anon;
grant execute on function public.attach_offer_media(uuid, text, text, text, bigint) to authenticated;

create or replace function public.remove_offer_media(p_media_id uuid)
returns text -- the object_path, for the caller to delete from Storage
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_offer_id uuid;
  v_seller_org uuid;
  v_status text;
  v_file_asset_id uuid;
  v_object_path text;
  v_was_primary boolean;
  v_next_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select m.offer_id, m.file_asset_id, m.is_primary, o.seller_organization_id, o.status, fa.object_path
  into v_offer_id, v_file_asset_id, v_was_primary, v_seller_org, v_status, v_object_path
  from public.coffee_offer_media m
  join public.coffee_offers o on o.id = m.offer_id
  join public.file_assets fa on fa.id = m.file_asset_id
  where m.id = p_media_id
  for update of m;

  if v_offer_id is null then
    raise exception 'offer_media_not_found';
  end if;
  if not (public.is_platform_admin() or public.is_org_member(v_seller_org)) then
    raise exception 'forbidden';
  end if;
  if v_status not in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'PARTIALLY_FILLED') then
    raise exception 'offer_media_not_editable';
  end if;

  delete from public.coffee_offer_media where id = p_media_id;
  delete from public.file_assets where id = v_file_asset_id;

  if v_was_primary then
    select id into v_next_id from public.coffee_offer_media
    where offer_id = v_offer_id order by sort_order asc limit 1;
    if v_next_id is not null then
      update public.coffee_offer_media set is_primary = true, updated_at = now() where id = v_next_id;
    end if;
  end if;

  return v_object_path;
end;
$function$;

revoke all on function public.remove_offer_media(uuid) from public;
revoke all on function public.remove_offer_media(uuid) from anon;
grant execute on function public.remove_offer_media(uuid) to authenticated;

create or replace function public.set_primary_offer_media(p_media_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_offer_id uuid;
  v_seller_org uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select m.offer_id, o.seller_organization_id, o.status
  into v_offer_id, v_seller_org, v_status
  from public.coffee_offer_media m
  join public.coffee_offers o on o.id = m.offer_id
  where m.id = p_media_id
  for update of m;

  if v_offer_id is null then
    raise exception 'offer_media_not_found';
  end if;
  if not (public.is_platform_admin() or public.is_org_member(v_seller_org)) then
    raise exception 'forbidden';
  end if;
  if v_status not in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'PARTIALLY_FILLED') then
    raise exception 'offer_media_not_editable';
  end if;

  update public.coffee_offer_media set is_primary = false, updated_at = now() where offer_id = v_offer_id and is_primary = true;
  update public.coffee_offer_media set is_primary = true, updated_at = now() where id = p_media_id;
end;
$function$;

revoke all on function public.set_primary_offer_media(uuid) from public;
revoke all on function public.set_primary_offer_media(uuid) from anon;
grant execute on function public.set_primary_offer_media(uuid) to authenticated;

create or replace function public.reorder_offer_media(p_offer_id uuid, p_media_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_seller_org uuid;
  v_status text;
  v_existing_ids uuid[];
  v_i int;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;
  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select seller_organization_id, status into v_seller_org, v_status
  from public.coffee_offers where id = p_offer_id and deleted_at is null
  for update;

  if v_seller_org is null then
    raise exception 'offer_not_found';
  end if;
  if not (public.is_platform_admin() or public.is_org_member(v_seller_org)) then
    raise exception 'forbidden';
  end if;
  if v_status not in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'PARTIALLY_FILLED') then
    raise exception 'offer_media_not_editable';
  end if;

  select array_agg(id order by id) into v_existing_ids from public.coffee_offer_media where offer_id = p_offer_id;
  if v_existing_ids is null or array_length(v_existing_ids, 1) <> array_length(p_media_ids, 1)
     or v_existing_ids <> (select array_agg(x order by x) from unnest(p_media_ids) x) then
    raise exception 'offer_media_reorder_set_mismatch';
  end if;

  for v_i in 1 .. array_length(p_media_ids, 1) loop
    update public.coffee_offer_media set sort_order = v_i - 1, updated_at = now() where id = p_media_ids[v_i];
  end loop;
end;
$function$;

revoke all on function public.reorder_offer_media(uuid, uuid[]) from public;
revoke all on function public.reorder_offer_media(uuid, uuid[]) from anon;
grant execute on function public.reorder_offer_media(uuid, uuid[]) to authenticated;

commit;
