-- Feature 018 M3: unified, resumable Admin Coffee orchestration.
--
-- Controlled, idempotent, CAS-protected routines over the EXISTING normalized records (coffees, translations, media,
-- offers). Nothing here creates stock or widens a role: every routine re-checks Platform Admin + MFA in the database,
-- coordinated publication additionally needs the installed offer-publication authority (is_compliance_operator), and
-- no routine writes inventory_positions. Request binding reuses the M2 payload-aware request log.
--
-- Revision counters are monotonic integers bumped by triggers, because `updated_at` is a now()-based value that is not
-- collision-safe. A raw DRAFT -> PUBLISHED Coffee update (the old direct-write path) is gated by the same readiness
-- check; historical PUBLISHED Coffees are never re-evaluated or rewritten.

begin;

do $guard$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.f018_request_begin(uuid,text,uuid,jsonb)', 'public.f018_request_complete(uuid,jsonb)',
    'public.attach_coffee_media(uuid,text,text,text,bigint)', 'public.remove_coffee_media(uuid)',
    'public.set_catalogue_translation(text,uuid,text,text,text)', 'public.next_offer_code()',
    'public.is_platform_admin()', 'public.is_compliance_operator()', 'public.mfa_satisfied()', 'public.is_blocked_user()',
    'public.validate_offer_transition()'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'feature_018_m3_prerequisite_missing: %', v_signature;
    end if;
  end loop;
  if to_regclass('public.coffees') is null or to_regclass('public.coffee_offers') is null or to_regclass('public.listing_reviews') is null
     or to_regclass('public.coffee_translations') is null or to_regclass('public.coffee_media') is null then
    raise exception 'feature_018_m3_prerequisite_missing: catalogue relations';
  end if;
  if to_regprocedure('public.record_stripe_payment_intent(uuid,text,text)') is not null
     and (has_function_privilege('anon', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')
          or has_function_privilege('service_role', 'public.record_stripe_payment_intent(uuid,text,text)', 'EXECUTE')) then
    raise exception 'feature_018_m3_feature_017_not_retired';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.coffees'::regclass and a.attname = 'revision' and not a.attisdropped
             and (a.atttypid <> 'integer'::regtype or not a.attnotnull)) then
    raise exception 'feature_018_m3_coffee_revision_nonconforming';
  end if;
  if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = 'public.coffee_offers'::regclass and a.attname = 'revision' and not a.attisdropped
             and (a.atttypid <> 'integer'::regtype or not a.attnotnull)) then
    raise exception 'feature_018_m3_offer_revision_nonconforming';
  end if;
end
$guard$;

-- 1. Monotonic revision counters (collision-safe edit tokens).
alter table public.coffees add column if not exists revision integer not null default 1;
alter table public.coffee_offers add column if not exists revision integer not null default 1;
do $revision_checks$
begin
  if not exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = 'public.coffees'::regclass and k.conname = 'coffees_revision_positive_check') then
    alter table public.coffees add constraint coffees_revision_positive_check check (revision >= 1);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint k where k.conrelid = 'public.coffee_offers'::regclass and k.conname = 'coffee_offers_revision_positive_check') then
    alter table public.coffee_offers add constraint coffee_offers_revision_positive_check check (revision >= 1);
  end if;
end
$revision_checks$;

create or replace function public.f018_bump_coffee_revision_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.revision = old.revision
     and (to_jsonb(new) - 'revision' - 'updated_at') is distinct from (to_jsonb(old) - 'revision' - 'updated_at') then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_f018_coffee_revision on public.coffees;
create trigger trg_f018_coffee_revision
  before update on public.coffees
  for each row execute function public.f018_bump_coffee_revision_row();

create or replace function public.f018_bump_parent_coffee_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.coffees set revision = revision + 1
  where id = case when tg_op = 'DELETE' then old.coffee_id else new.coffee_id end;
  return null;
end;
$function$;

drop trigger if exists trg_f018_translation_revision on public.coffee_translations;
create trigger trg_f018_translation_revision
  after insert or update or delete on public.coffee_translations
  for each row execute function public.f018_bump_parent_coffee_revision();

drop trigger if exists trg_f018_media_revision on public.coffee_media;
create trigger trg_f018_media_revision
  after insert or update or delete on public.coffee_media
  for each row execute function public.f018_bump_parent_coffee_revision();

-- Only editor-owned offer fields move the revision; checkout reservation counters must never cause an edit conflict.
create or replace function public.f018_bump_offer_revision_row()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.revision = old.revision
     and (new.title, new.price_per_kg, new.quantity_kg, new.status, new.warehouse_id, new.warehouse_location_id, new.lot_id, new.coffee_id,
          new.seller_organization_id, new.rejection_reason, new.deleted_at)
         is distinct from
         (old.title, old.price_per_kg, old.quantity_kg, old.status, old.warehouse_id, old.warehouse_location_id, old.lot_id, old.coffee_id,
          old.seller_organization_id, old.rejection_reason, old.deleted_at) then
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_f018_offer_revision on public.coffee_offers;
create trigger trg_f018_offer_revision
  before update on public.coffee_offers
  for each row execute function public.f018_bump_offer_revision_row();

-- 2. Authority and edit-conflict helpers (private).
create or replace function public.f018_assert_catalogue_admin()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if auth.uid() is null or public.is_blocked_user() or not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
end;
$function$;

create or replace function public.f018_cas_coffee(p_coffee_id uuid, p_expected_revision integer)
returns public.coffees
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_coffee public.coffees%rowtype;
begin
  if p_expected_revision is null then
    raise exception 'expected_revision_required';
  end if;
  select * into v_coffee from public.coffees where id = p_coffee_id for update;
  if v_coffee.id is null then
    raise exception 'coffee_not_found';
  end if;
  if v_coffee.revision <> p_expected_revision then
    raise exception 'revision_conflict' using detail = jsonb_build_object('current_revision', v_coffee.revision)::text;
  end if;
  return v_coffee;
end;
$function$;

-- 3. Publication readiness: ONE definition used by the controlled routines, the preview and the raw-update gate.
create or replace function public.f018_catalogue_readiness(p_coffee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_coffee public.coffees%rowtype;
  v_ar_name text;
  v_ar_description text;
  v_origin_status text;
  v_missing text[] := '{}'::text[];
  v_primary_ok boolean;
begin
  select * into v_coffee from public.coffees where id = p_coffee_id;
  if v_coffee.id is null then
    return null;
  end if;
  if nullif(btrim(coalesce(v_coffee.name, '')), '') is null then v_missing := array_append(v_missing, 'english_name'::text); end if;
  if nullif(btrim(coalesce(v_coffee.description, '')), '') is null then v_missing := array_append(v_missing, 'english_description'::text); end if;
  select nullif(btrim(coalesce(t.name, '')), ''), nullif(btrim(coalesce(t.description, '')), '') into v_ar_name, v_ar_description
  from public.coffee_translations t where t.coffee_id = p_coffee_id and t.locale = 'ar';
  if v_ar_name is null then v_missing := array_append(v_missing, 'arabic_name'::text); end if;
  if v_ar_description is null then v_missing := array_append(v_missing, 'arabic_description'::text); end if;
  if v_coffee.origin_id is null then
    v_missing := array_append(v_missing, 'origin_missing'::text);
  else
    select o.status into v_origin_status from public.origins o where o.id = v_coffee.origin_id;
    if v_origin_status is distinct from 'ACTIVE' then v_missing := array_append(v_missing, 'origin_inactive'::text); end if;
  end if;
  select exists (
    select 1 from public.coffee_media m
    join public.file_assets fa on fa.id = m.file_asset_id
    where m.coffee_id = p_coffee_id and m.is_primary and fa.bucket_name = 'public-assets' and not fa.is_private
      and exists (select 1 from storage.objects so where so.bucket_id = 'public-assets' and so.name = fa.object_path)
  ) into v_primary_ok;
  if not v_primary_ok then v_missing := array_append(v_missing, 'primary_image'::text); end if;
  return jsonb_build_object(
    'coffee_id', p_coffee_id, 'revision', v_coffee.revision, 'status', v_coffee.status,
    'ready', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing),
    'checks', jsonb_build_object(
      'english', jsonb_build_object('ok', not ('english_name' = any (v_missing) or 'english_description' = any (v_missing))),
      'arabic', jsonb_build_object('ok', not ('arabic_name' = any (v_missing) or 'arabic_description' = any (v_missing))),
      'origin', jsonb_build_object('ok', not ('origin_missing' = any (v_missing) or 'origin_inactive' = any (v_missing))),
      'primary_image', jsonb_build_object('ok', v_primary_ok)));
end;
$function$;

-- A raw DRAFT -> PUBLISHED update (the pre-018 direct write) must satisfy the same readiness. Trusted maintenance
-- sessions (service role / no JWT) are not gated, and a Coffee that is already PUBLISHED is never re-evaluated.
create or replace function public.f018_enforce_publication_readiness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_ready jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return null;
  end if;
  v_ready := public.f018_catalogue_readiness(new.id);
  if (v_ready ->> 'ready')::boolean is not true then
    raise exception 'coffee_not_publish_ready' using detail = (v_ready -> 'missing')::text;
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_f018_coffee_publication_readiness on public.coffees;
create trigger trg_f018_coffee_publication_readiness
  after update of status on public.coffees
  for each row
  when (new.status = 'PUBLISHED' and old.status is distinct from 'PUBLISHED')
  execute function public.f018_enforce_publication_readiness();

-- 4. Controlled creation and step saves.
create or replace function public.create_catalogue_coffee_intent(p_request_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_name text := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  v_slug text := lower(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''));
  v_description text := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
  v_payload jsonb;
  v_replay jsonb;
  v_coffee public.coffees%rowtype;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if v_name is null or char_length(v_name) > 200 then raise exception 'catalogue_field_invalid' using detail = 'name'; end if;
  if v_slug is null or char_length(v_slug) > 100 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'catalogue_field_invalid' using detail = 'slug'; end if;
  if v_description is not null and char_length(v_description) > 4000 then raise exception 'catalogue_field_invalid' using detail = 'description'; end if;

  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_create_coffee', 'name', v_name, 'slug', v_slug, 'description', v_description);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_create_coffee', p_request_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  begin
    insert into public.coffees (name, slug, description, status, created_by, updated_by)
    values (v_name, v_slug, v_description, 'DRAFT', auth.uid(), auth.uid())
    returning * into v_coffee;
  exception when unique_violation then
    raise exception 'slug_taken';
  end;
  v_response := jsonb_build_object('coffee_id', v_coffee.id, 'revision', v_coffee.revision, 'slug', v_coffee.slug, 'status', v_coffee.status);
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.save_catalogue_step(p_request_id uuid, p_coffee_id uuid, p_step text, p_expected_revision integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_data jsonb;
  v_payload jsonb;
  v_replay jsonb;
  v_coffee public.coffees%rowtype;
  v_name text;
  v_slug text;
  v_description text;
  v_ar_name text;
  v_ar_description text;
  v_origin uuid;
  v_type uuid;
  v_variety uuid;
  v_processing uuid;
  v_packaging uuid;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_step is null or p_step not in ('identity', 'arabic', 'taxonomy') then raise exception 'catalogue_step_invalid'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'catalogue_field_invalid' using detail = 'payload'; end if;

  -- Validate and canonicalize first so the bound payload is semantic, not textual.
  if p_step = 'identity' then
    v_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
    v_slug := lower(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''));
    v_description := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
    if v_name is null or char_length(v_name) > 200 then raise exception 'catalogue_field_invalid' using detail = 'name'; end if;
    if v_slug is null or char_length(v_slug) > 100 or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'catalogue_field_invalid' using detail = 'slug'; end if;
    if v_description is not null and char_length(v_description) > 4000 then raise exception 'catalogue_field_invalid' using detail = 'description'; end if;
    v_data := jsonb_build_object('name', v_name, 'slug', v_slug, 'description', v_description);
  elsif p_step = 'arabic' then
    v_ar_name := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
    v_ar_description := nullif(btrim(coalesce(p_payload ->> 'description', '')), '');
    if v_ar_name is not null and char_length(v_ar_name) > 200 then raise exception 'catalogue_field_invalid' using detail = 'name'; end if;
    if v_ar_description is not null and char_length(v_ar_description) > 4000 then raise exception 'catalogue_field_invalid' using detail = 'description'; end if;
    v_data := jsonb_build_object('name', v_ar_name, 'description', v_ar_description);
  else
    begin
      v_origin := nullif(p_payload ->> 'origin_id', '')::uuid;
      v_type := nullif(p_payload ->> 'coffee_type_id', '')::uuid;
      v_variety := nullif(p_payload ->> 'variety_id', '')::uuid;
      v_processing := nullif(p_payload ->> 'processing_method_id', '')::uuid;
      v_packaging := nullif(p_payload ->> 'packaging_type_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'catalogue_field_invalid' using detail = 'taxonomy';
    end;
    v_data := jsonb_build_object('origin_id', v_origin, 'coffee_type_id', v_type, 'variety_id', v_variety, 'processing_method_id', v_processing, 'packaging_type_id', v_packaging);
  end if;

  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_save_step', 'coffee_id', p_coffee_id, 'step', p_step, 'expected_revision', p_expected_revision, 'data', v_data);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_save_step', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  v_coffee := public.f018_cas_coffee(p_coffee_id, p_expected_revision);

  if p_step = 'identity' then
    begin
      update public.coffees set name = v_name, slug = v_slug, description = v_description, updated_by = auth.uid() where id = p_coffee_id;
    exception when unique_violation then
      raise exception 'slug_taken';
    end;
  elsif p_step = 'arabic' then
    perform public.set_catalogue_translation('coffee', p_coffee_id, 'ar', v_ar_name, v_ar_description);
  else
    if v_origin is not null and not exists (select 1 from public.origins o where o.id = v_origin and o.status = 'ACTIVE') then
      raise exception 'origin_inactive';
    end if;
    begin
      update public.coffees set origin_id = v_origin, coffee_type_id = v_type, variety_id = v_variety, processing_method_id = v_processing,
        packaging_type_id = v_packaging, updated_by = auth.uid() where id = p_coffee_id;
    exception when foreign_key_violation then
      raise exception 'reference_invalid';
    end;
  end if;

  select jsonb_build_object('coffee_id', c.id, 'step', p_step, 'revision', c.revision, 'status', c.status, 'saved', true) into v_response from public.coffees c where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 5. Media (existing attach/remove routines wrapped with intent binding and edit-conflict protection).
create or replace function public.attach_catalogue_media(
  p_request_id uuid, p_coffee_id uuid, p_expected_revision integer, p_object_path text, p_original_name text, p_mime_type text, p_size_bytes bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_media uuid;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_attach_media', 'coffee_id', p_coffee_id, 'expected_revision', p_expected_revision,
    'object_path', p_object_path, 'original_name', left(coalesce(p_original_name, ''), 255), 'mime_type', p_mime_type, 'size_bytes', p_size_bytes);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_attach_media', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  perform public.f018_cas_coffee(p_coffee_id, p_expected_revision);
  v_media := public.attach_coffee_media(p_coffee_id, p_object_path, p_original_name, p_mime_type, p_size_bytes);
  select jsonb_build_object('coffee_id', p_coffee_id, 'media_id', v_media, 'object_path', p_object_path, 'is_primary', m.is_primary, 'revision', c.revision) into v_response
  from public.coffee_media m join public.coffees c on c.id = m.coffee_id where m.id = v_media;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.remove_catalogue_media(p_request_id uuid, p_coffee_id uuid, p_expected_revision integer, p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_path text;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_remove_media', 'coffee_id', p_coffee_id, 'expected_revision', p_expected_revision, 'media_id', p_media_id);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_remove_media', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  perform public.f018_cas_coffee(p_coffee_id, p_expected_revision);
  if not exists (select 1 from public.coffee_media m where m.id = p_media_id and m.coffee_id = p_coffee_id) then
    raise exception 'coffee_media_not_found';
  end if;
  v_path := public.remove_coffee_media(p_media_id);
  select jsonb_build_object('coffee_id', p_coffee_id, 'removed_media_id', p_media_id, 'object_path', v_path, 'revision', c.revision) into v_response from public.coffees c where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.set_catalogue_media_primary(p_request_id uuid, p_coffee_id uuid, p_expected_revision integer, p_media_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_set_primary_media', 'coffee_id', p_coffee_id, 'expected_revision', p_expected_revision, 'media_id', p_media_id);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_set_primary_media', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  perform public.f018_cas_coffee(p_coffee_id, p_expected_revision);
  if not exists (select 1 from public.coffee_media m where m.id = p_media_id and m.coffee_id = p_coffee_id) then
    raise exception 'coffee_media_not_found';
  end if;
  update public.coffee_media set is_primary = false where coffee_id = p_coffee_id and is_primary and id <> p_media_id;
  update public.coffee_media set is_primary = true where id = p_media_id and not is_primary;
  select jsonb_build_object('coffee_id', p_coffee_id, 'primary_media_id', p_media_id, 'revision', c.revision) into v_response from public.coffees c where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 6. Real backing inventory (read-only projection; the workflow selects an existing position, never creates stock).
create or replace function public.list_catalogue_backing_positions(p_coffee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  perform public.f018_assert_catalogue_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'position_id', ip.id, 'lot_id', cl.id, 'lot_code', cl.lot_code, 'warehouse_id', w.id, 'warehouse_name', w.name,
      'location_id', wl.id, 'location_code', wl.code,
      'available_kg', ip.available_quantity_kg, 'reserved_kg', ip.reserved_quantity_kg,
      'tradable_kg', ip.available_quantity_kg - ip.reserved_quantity_kg,
      'held', exists (select 1 from public.inventory_open_cases ic where ic.inventory_position_id = ip.id),
      'existing_offer_id', eo.id, 'existing_offer_status', eo.status,
      'eligible', (ip.available_quantity_kg - ip.reserved_quantity_kg) > 0 and eo.id is null
                  and not exists (select 1 from public.inventory_open_cases ic where ic.inventory_position_id = ip.id)) order by cl.lot_code, ip.id)
    from public.inventory_positions ip
    join public.coffee_lots cl on cl.id = ip.lot_id
    join public.organizations org on org.id = ip.owner_organization_id and org.is_hills_internal and org.status = 'ACTIVE'
    join public.warehouses w on w.id = ip.warehouse_id
    left join public.warehouse_locations wl on wl.id = ip.warehouse_location_id
    left join public.coffee_offers eo on eo.lot_id = ip.lot_id and eo.seller_organization_id = ip.owner_organization_id and eo.deleted_at is null
      and eo.status not in ('ARCHIVED', 'REJECTED', 'SOLD_OUT')
    where cl.coffee_id = p_coffee_id), '[]'::jsonb);
end;
$function$;

-- 7. Offer creation/edit against an explicitly selected real position (Compliance review and stock stay with their owners).
create or replace function public.create_backed_offer_intent(
  p_request_id uuid, p_coffee_id uuid, p_expected_coffee_revision integer, p_position_id uuid, p_price_per_kg numeric, p_quantity_kg numeric, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_payload jsonb;
  v_replay jsonb;
  v_position public.inventory_positions%rowtype;
  v_lot_coffee uuid;
  v_active uuid;
  v_offer public.coffee_offers%rowtype;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_price_per_kg is null or p_price_per_kg <= 0 then raise exception 'offer_price_invalid'; end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then raise exception 'offer_quantity_invalid'; end if;
  if v_title is not null and char_length(v_title) > 200 then raise exception 'catalogue_field_invalid' using detail = 'title'; end if;

  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_create_offer', 'coffee_id', p_coffee_id, 'expected_coffee_revision', p_expected_coffee_revision,
    'position_id', p_position_id, 'price_per_kg', p_price_per_kg, 'quantity_kg', p_quantity_kg, 'title', v_title);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_create_offer', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  perform public.f018_cas_coffee(p_coffee_id, p_expected_coffee_revision);

  -- Plain read: no position lock is taken before the offer exists (offer-before-position lock order).
  select ip.* into v_position from public.inventory_positions ip where ip.id = p_position_id;
  select cl.coffee_id into v_lot_coffee from public.coffee_lots cl where cl.id = v_position.lot_id;
  if v_position.id is null or v_lot_coffee is distinct from p_coffee_id
     or not exists (select 1 from public.organizations org where org.id = v_position.owner_organization_id and org.is_hills_internal and org.status = 'ACTIVE') then
    raise exception 'backing_position_not_eligible';
  end if;
  if p_quantity_kg > v_position.available_quantity_kg - v_position.reserved_quantity_kg then
    raise exception 'offer_quantity_exceeds_inventory';
  end if;
  select eo.id into v_active from public.coffee_offers eo
  where eo.lot_id = v_position.lot_id and eo.seller_organization_id = v_position.owner_organization_id and eo.deleted_at is null
    and eo.status not in ('ARCHIVED', 'REJECTED', 'SOLD_OUT') limit 1;
  if v_active is not null then
    raise exception 'active_offer_exists' using detail = jsonb_build_object('offer_id', v_active)::text;
  end if;

  insert into public.coffee_offers (
    coffee_id, lot_id, seller_organization_id, seller_type, warehouse_id, warehouse_location_id, quantity_kg, price_per_kg, currency,
    status, created_by, offer_code, title)
  values (
    p_coffee_id, v_position.lot_id, v_position.owner_organization_id, 'HILLS', v_position.warehouse_id, v_position.warehouse_location_id,
    p_quantity_kg, p_price_per_kg, 'USD', 'DRAFT', auth.uid(), public.next_offer_code(), v_title)
  returning * into v_offer;

  v_response := jsonb_build_object('offer_id', v_offer.id, 'offer_code', v_offer.offer_code, 'status', v_offer.status, 'revision', v_offer.revision,
    'coffee_id', p_coffee_id, 'coffee_revision', (select c.revision from public.coffees c where c.id = p_coffee_id));
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.save_offer_commercials(
  p_request_id uuid, p_offer_id uuid, p_expected_revision integer, p_price_per_kg numeric, p_quantity_kg numeric, p_title text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_payload jsonb;
  v_replay jsonb;
  v_offer public.coffee_offers%rowtype;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_expected_revision is null then raise exception 'expected_revision_required'; end if;
  if p_price_per_kg is null or p_price_per_kg <= 0 then raise exception 'offer_price_invalid'; end if;
  if p_quantity_kg is null or p_quantity_kg <= 0 then raise exception 'offer_quantity_invalid'; end if;
  if v_title is not null and char_length(v_title) > 200 then raise exception 'catalogue_field_invalid' using detail = 'title'; end if;

  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_save_offer', 'offer_id', p_offer_id, 'expected_revision', p_expected_revision,
    'price_per_kg', p_price_per_kg, 'quantity_kg', p_quantity_kg, 'title', v_title);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_save_offer', p_offer_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  select * into v_offer from public.coffee_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found'; end if;
  if v_offer.revision <> p_expected_revision then
    raise exception 'revision_conflict' using detail = jsonb_build_object('current_revision', v_offer.revision)::text;
  end if;
  if v_offer.status not in ('DRAFT', 'REJECTED') then raise exception 'offer_not_editable'; end if;

  update public.coffee_offers set price_per_kg = p_price_per_kg, quantity_kg = p_quantity_kg, title = v_title where id = p_offer_id;
  select jsonb_build_object('offer_id', o.id, 'status', o.status, 'revision', o.revision) into v_response from public.coffee_offers o where o.id = p_offer_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 8. Featured: idempotent editorial selection; never implies publication.
create or replace function public.set_coffee_featured(p_coffee_id uuid, p_enabled boolean, p_expected_revision integer, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_coffee public.coffees%rowtype;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_enabled is null then raise exception 'catalogue_field_invalid' using detail = 'enabled'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_set_featured', 'coffee_id', p_coffee_id, 'enabled', p_enabled, 'expected_revision', p_expected_revision);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_set_featured', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  v_coffee := public.f018_cas_coffee(p_coffee_id, p_expected_revision);
  if p_enabled and v_coffee.featured_at is null then
    update public.coffees set featured_at = clock_timestamp(), updated_by = auth.uid() where id = p_coffee_id;
  elsif not p_enabled and v_coffee.featured_at is not null then
    update public.coffees set featured_at = null, updated_by = auth.uid() where id = p_coffee_id;
  end if;
  select jsonb_build_object('coffee_id', c.id, 'featured', c.featured_at is not null, 'featured_at', c.featured_at, 'revision', c.revision) into v_response from public.coffees c where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.get_catalogue_readiness(p_coffee_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  perform public.f018_assert_catalogue_admin();
  return public.f018_catalogue_readiness(p_coffee_id);
end;
$function$;

-- 9. Publication: catalogue-only, and coordinated Coffee + APPROVED offer in one transaction.
create or replace function public.publish_coffee_catalogue_only(p_coffee_id uuid, p_expected_revision integer, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_coffee public.coffees%rowtype;
  v_ready jsonb;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  if p_request_id is null then raise exception 'request_id_required'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_publish_only', 'coffee_id', p_coffee_id, 'expected_revision', p_expected_revision);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_publish_only', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;
  v_coffee := public.f018_cas_coffee(p_coffee_id, p_expected_revision);
  if v_coffee.status <> 'DRAFT' then raise exception 'coffee_not_publishable_from_status' using detail = v_coffee.status; end if;
  v_ready := public.f018_catalogue_readiness(p_coffee_id);
  if (v_ready ->> 'ready')::boolean is not true then
    raise exception 'coffee_not_publish_ready' using detail = (v_ready -> 'missing')::text;
  end if;
  update public.coffees set status = 'PUBLISHED', updated_by = auth.uid() where id = p_coffee_id;
  select jsonb_build_object('coffee_id', c.id, 'status', c.status, 'revision', c.revision, 'slug', c.slug, 'mode', 'CATALOGUE_ONLY') into v_response from public.coffees c where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

create or replace function public.publish_coffee_with_approved_offer(
  p_coffee_id uuid, p_offer_id uuid, p_expected_coffee_revision integer, p_expected_offer_revision integer, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payload jsonb;
  v_replay jsonb;
  v_coffee public.coffees%rowtype;
  v_offer public.coffee_offers%rowtype;
  v_ready jsonb;
  v_response jsonb;
begin
  perform public.f018_assert_catalogue_admin();
  -- Both authorities are required: catalogue permission (above) and the installed offer-publication authority.
  if not public.is_compliance_operator() then raise exception 'publication_authority_required'; end if;
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_expected_offer_revision is null then raise exception 'expected_revision_required'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'catalogue_publish_with_offer', 'coffee_id', p_coffee_id, 'offer_id', p_offer_id,
    'expected_coffee_revision', p_expected_coffee_revision, 'expected_offer_revision', p_expected_offer_revision);
  v_replay := public.f018_request_begin(p_request_id, 'catalogue_publish_with_offer', p_coffee_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  -- Lock order: Coffee, then the selected offer (its backing position is locked by the existing offer triggers).
  v_coffee := public.f018_cas_coffee(p_coffee_id, p_expected_coffee_revision);
  select * into v_offer from public.coffee_offers where id = p_offer_id for update;
  if v_offer.id is null or v_offer.coffee_id <> p_coffee_id then raise exception 'coffee_offer_mismatch'; end if;
  if v_offer.revision <> p_expected_offer_revision then
    raise exception 'revision_conflict' using detail = jsonb_build_object('current_offer_revision', v_offer.revision)::text;
  end if;
  if v_offer.status <> 'APPROVED' then raise exception 'offer_not_approved' using detail = v_offer.status; end if;
  if v_coffee.status <> 'DRAFT' and v_coffee.status <> 'PUBLISHED' then raise exception 'coffee_not_publishable_from_status' using detail = v_coffee.status; end if;
  v_ready := public.f018_catalogue_readiness(p_coffee_id);
  if (v_ready ->> 'ready')::boolean is not true then
    raise exception 'coffee_not_publish_ready' using detail = (v_ready -> 'missing')::text;
  end if;

  if v_coffee.status = 'DRAFT' then
    update public.coffees set status = 'PUBLISHED', updated_by = auth.uid() where id = p_coffee_id;
  end if;
  update public.coffee_offers set status = 'PUBLISHED' where id = p_offer_id;

  select jsonb_build_object('coffee_id', c.id, 'coffee_status', c.status, 'coffee_revision', c.revision, 'offer_id', o.id, 'offer_status', o.status,
    'offer_revision', o.revision, 'mode', 'COORDINATED') into v_response
  from public.coffees c join public.coffee_offers o on o.id = p_offer_id where c.id = p_coffee_id;
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 10. Compliance decision: status transition and review history atomically, exactly once per request.
create or replace function public.record_listing_review_decision(p_offer_id uuid, p_decision text, p_reason text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_payload jsonb;
  v_replay jsonb;
  v_offer public.coffee_offers%rowtype;
  v_review uuid;
  v_response jsonb;
begin
  if auth.uid() is null or public.is_blocked_user() or not public.is_compliance_operator() then raise exception 'forbidden'; end if;
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required'; end if;
  if p_request_id is null then raise exception 'request_id_required'; end if;
  if p_decision is null or p_decision not in ('APPROVED', 'REJECTED', 'SUSPENDED') then raise exception 'listing_decision_invalid'; end if;
  if v_reason is not null and char_length(v_reason) > 2000 then raise exception 'listing_decision_reason_too_long'; end if;
  v_payload := jsonb_build_object('version', 1, 'operation', 'listing_review_decision', 'offer_id', p_offer_id, 'decision', p_decision, 'reason', v_reason);
  v_replay := public.f018_request_begin(p_request_id, 'listing_review_decision', p_offer_id, v_payload);
  if v_replay is not null then return v_replay; end if;

  select * into v_offer from public.coffee_offers where id = p_offer_id for update;
  if v_offer.id is null
     or not (case p_decision when 'APPROVED' then v_offer.status = 'PENDING_REVIEW' when 'REJECTED' then v_offer.status = 'PENDING_REVIEW'
                             else v_offer.status in ('PUBLISHED', 'PARTIALLY_FILLED') end) then
    raise exception 'listing_decision_stale';
  end if;
  update public.coffee_offers set status = p_decision, rejection_reason = v_reason where id = p_offer_id;
  insert into public.listing_reviews (offer_id, reviewer_user_id, decision, reason) values (p_offer_id, auth.uid(), p_decision, v_reason) returning id into v_review;
  v_response := jsonb_build_object('offer_id', p_offer_id, 'decision', p_decision, 'review_id', v_review, 'from_status', v_offer.status, 'to_status', p_decision);
  perform public.f018_request_complete(p_request_id, v_response);
  return v_response;
end;
$function$;

-- 11. Recovery of an uncertain operation by its original request key (authority re-checked; payload not re-sent).
create or replace function public.recover_catalogue_operation(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_log public.commerce_request_log%rowtype;
begin
  perform public.f018_assert_catalogue_admin();
  select * into v_log from public.commerce_request_log where request_id = p_request_id and actor_user_id = auth.uid() and operation like 'catalogue\_%' escape '\';
  if v_log.request_id is null then
    return jsonb_build_object('status', 'NOT_COMMITTED');
  end if;
  return jsonb_build_object('status', 'COMMITTED', 'operation', v_log.operation, 'response', v_log.response);
end;
$function$;

-- 12. Grants: public routines are authenticated-only; private helpers have no application-role EXECUTE.
revoke all on function public.f018_bump_coffee_revision_row() from public, anon, authenticated, service_role;
grant execute on function public.f018_bump_coffee_revision_row() to postgres;
revoke all on function public.f018_bump_parent_coffee_revision() from public, anon, authenticated, service_role;
grant execute on function public.f018_bump_parent_coffee_revision() to postgres;
revoke all on function public.f018_bump_offer_revision_row() from public, anon, authenticated, service_role;
grant execute on function public.f018_bump_offer_revision_row() to postgres;
revoke all on function public.f018_assert_catalogue_admin() from public, anon, authenticated, service_role;
grant execute on function public.f018_assert_catalogue_admin() to postgres;
revoke all on function public.f018_cas_coffee(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.f018_cas_coffee(uuid, integer) to postgres;
revoke all on function public.f018_catalogue_readiness(uuid) from public, anon, authenticated, service_role;
grant execute on function public.f018_catalogue_readiness(uuid) to postgres;
revoke all on function public.f018_enforce_publication_readiness() from public, anon, authenticated, service_role;
grant execute on function public.f018_enforce_publication_readiness() to postgres;

revoke all on function public.create_catalogue_coffee_intent(uuid, jsonb) from public, anon, service_role;
grant execute on function public.create_catalogue_coffee_intent(uuid, jsonb) to authenticated;
revoke all on function public.save_catalogue_step(uuid, uuid, text, integer, jsonb) from public, anon, service_role;
grant execute on function public.save_catalogue_step(uuid, uuid, text, integer, jsonb) to authenticated;
revoke all on function public.attach_catalogue_media(uuid, uuid, integer, text, text, text, bigint) from public, anon, service_role;
grant execute on function public.attach_catalogue_media(uuid, uuid, integer, text, text, text, bigint) to authenticated;
revoke all on function public.remove_catalogue_media(uuid, uuid, integer, uuid) from public, anon, service_role;
grant execute on function public.remove_catalogue_media(uuid, uuid, integer, uuid) to authenticated;
revoke all on function public.set_catalogue_media_primary(uuid, uuid, integer, uuid) from public, anon, service_role;
grant execute on function public.set_catalogue_media_primary(uuid, uuid, integer, uuid) to authenticated;
revoke all on function public.list_catalogue_backing_positions(uuid) from public, anon, service_role;
grant execute on function public.list_catalogue_backing_positions(uuid) to authenticated;
revoke all on function public.create_backed_offer_intent(uuid, uuid, integer, uuid, numeric, numeric, text) from public, anon, service_role;
grant execute on function public.create_backed_offer_intent(uuid, uuid, integer, uuid, numeric, numeric, text) to authenticated;
revoke all on function public.save_offer_commercials(uuid, uuid, integer, numeric, numeric, text) from public, anon, service_role;
grant execute on function public.save_offer_commercials(uuid, uuid, integer, numeric, numeric, text) to authenticated;
revoke all on function public.set_coffee_featured(uuid, boolean, integer, uuid) from public, anon, service_role;
grant execute on function public.set_coffee_featured(uuid, boolean, integer, uuid) to authenticated;
revoke all on function public.get_catalogue_readiness(uuid) from public, anon, service_role;
grant execute on function public.get_catalogue_readiness(uuid) to authenticated;
revoke all on function public.publish_coffee_catalogue_only(uuid, integer, uuid) from public, anon, service_role;
grant execute on function public.publish_coffee_catalogue_only(uuid, integer, uuid) to authenticated;
revoke all on function public.publish_coffee_with_approved_offer(uuid, uuid, integer, integer, uuid) from public, anon, service_role;
grant execute on function public.publish_coffee_with_approved_offer(uuid, uuid, integer, integer, uuid) to authenticated;
revoke all on function public.record_listing_review_decision(uuid, text, text, uuid) from public, anon, service_role;
grant execute on function public.record_listing_review_decision(uuid, text, text, uuid) to authenticated;
revoke all on function public.recover_catalogue_operation(uuid) from public, anon, service_role;
grant execute on function public.recover_catalogue_operation(uuid) to authenticated;

commit;
