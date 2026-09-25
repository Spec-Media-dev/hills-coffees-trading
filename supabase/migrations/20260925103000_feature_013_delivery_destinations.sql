-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M2a (T026) — delivery destinations. Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925103000_feature_013_delivery_destinations.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_delivery_destinations_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human security review (T029), then OPERATOR apply (T030).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §2.3 and §2.1; contracts/rls-storage.md):
--   1. public.delivery_destinations — a buyer organization's saved delivery addresses. Soft-retired, never deleted.
--      `delivery_method` CHECK = the production value set captured at T006 §3 ({Courier}; re-verified read-only on
--      2026-09-25: shipping_rules 0 rows, order_shipments 'Courier' only). One non-retired default per organization.
--      RLS enabled + forced. SELECT for members of the owning organization or a platform admin. NO client write
--      grant: writes arrive only through upsert_delivery_destination()/retire_delivery_destination() (M4a).
--   2. orders.delivery_destination_id (FK) + orders.destination_snapshot (jsonb, frozen at issuance by M4b).
--      Both are NULL for every existing order. They are written only by internal (workflow) transitions: a small
--      BEFORE INSERT/UPDATE trigger refuses any other write, so the existing buyer INSERT/UPDATE order policies cannot
--      set them (same rule as the M1 fields, T023 decision 3).
--
-- WHAT IT DOES NOT DO: no RPC (M4a), no change to validate_order_transition or any existing policy/trigger/function,
-- no `current_proforma_id` (M2b, it references the versioned proforma), no data backfill, no row rewritten.
-- bank_transfer_checkout_enabled stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------
do $guard$
declare
  v_problems text := '';
  v_methods text;
begin
  -- 0.1 M1 must be applied and unchanged (its validate_order_transition v2 body fingerprint).
  if to_regclass('public.commerce_settings') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'commerce_flow') then
    v_problems := v_problems || 'M1 (20260925100000) is not applied; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;

  -- 0.2 The delivery-method vocabulary in production must still be {Courier} (T006 §3).
  select string_agg(distinct m, ', ' order by m) into v_methods
  from (select delivery_method as m from public.shipping_rules
        union select delivery_method from public.order_shipments) s
  where m is distinct from 'Courier';
  if v_methods is not null then
    v_problems := v_problems || 'delivery methods other than Courier are in use (' || v_methods || '): re-author the CHECK; ';
  end if;

  -- 0.3 Checkout must still be disabled (M2a changes nothing about it; stop if the kill switch moved).
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;

  -- 0.4 Nothing this migration creates may exist yet.
  if to_regclass('public.delivery_destinations') is not null
     or to_regprocedure('public.guard_order_destination_fields()') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders'
                and column_name in ('delivery_destination_id', 'destination_snapshot')) then
    v_problems := v_problems || 'an M2a object already exists; ';
  end if;

  -- 0.5 Required helpers and referenced tables.
  if to_regprocedure('public.is_org_member(uuid)') is null or to_regprocedure('public.is_platform_admin()') is null
     or to_regprocedure('public.is_internal_transition()') is null or to_regprocedure('public.set_updated_at()') is null
     or to_regclass('public.organizations') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a required helper function or table is missing; ';
  end if;

  -- 0.6 As in M1: FORCE ROW LEVEL SECURITY is safe only if the owning role bypasses RLS.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_delivery_destinations preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. delivery_destinations (data-model §2.3) ---------------------------------------------------------------------
create table public.delivery_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  label text not null
    constraint delivery_destinations_label_check check (char_length(btrim(label)) between 1 and 80),
  country_code char(2) not null
    constraint delivery_destinations_country_code_check check (country_code ~ '^[A-Z]{2}$'),
  city text not null
    constraint delivery_destinations_city_check check (char_length(btrim(city)) between 1 and 120),
  address_line_1 text not null
    constraint delivery_destinations_address_line_1_check check (char_length(btrim(address_line_1)) between 1 and 200),
  address_line_2 text
    constraint delivery_destinations_address_line_2_check check (char_length(btrim(address_line_2)) between 1 and 200),
  contact_name text not null
    constraint delivery_destinations_contact_name_check check (char_length(btrim(contact_name)) between 1 and 120),
  contact_phone text not null
    constraint delivery_destinations_contact_phone_check check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  delivery_method text not null
    constraint delivery_destinations_delivery_method_check check (delivery_method in ('Courier')),
  is_default boolean not null default false,
  retired_at timestamptz,
  retired_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_destinations_retired_pair_check check ((retired_at is null) = (retired_by is null)),
  constraint delivery_destinations_retired_not_default_check check (retired_at is null or not is_default)
);
comment on table public.delivery_destinations is
  'Feature 013: a buyer organization''s saved delivery destinations. Soft-retired, never deleted. Orders read the frozen orders.destination_snapshot, so later edits never change an order (FR-006, AC-007). Written only by upsert_delivery_destination()/retire_delivery_destination() (M4a).';

-- One non-retired default per organization.
create unique index uq_delivery_destination_default_per_org on public.delivery_destinations (organization_id)
  where is_default and retired_at is null;
create index idx_delivery_destinations_active_org on public.delivery_destinations (organization_id)
  where retired_at is null;

create trigger trg_delivery_destinations_updated_at before update on public.delivery_destinations
  for each row execute function public.set_updated_at();

alter table public.delivery_destinations enable row level security;
alter table public.delivery_destinations force row level security;
revoke all on table public.delivery_destinations from public, anon, authenticated;
grant select on table public.delivery_destinations to authenticated;
create policy delivery_destinations_member_read on public.delivery_destinations
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

-- 2. orders destination fields (data-model §2.1) -----------------------------------------------------------------
alter table public.orders
  add column delivery_destination_id uuid references public.delivery_destinations(id),
  add column destination_snapshot jsonb,
  add constraint orders_destination_pair_check check ((delivery_destination_id is null) = (destination_snapshot is null)),
  add constraint orders_destination_snapshot_shape_check check (
    destination_snapshot is null
    or (jsonb_typeof(destination_snapshot) = 'object'
        and destination_snapshot ?& array['label', 'country_code', 'city', 'address_lines', 'contact_name', 'contact_phone', 'delivery_method']
        and jsonb_typeof(destination_snapshot -> 'address_lines') = 'array'));
comment on column public.orders.destination_snapshot is
  'Feature 013: {label, country_code, city, address_lines[], contact_name, contact_phone, delivery_method}, frozen at proforma issuance (M4b). Written only by internal transitions.';

create index idx_orders_delivery_destination on public.orders (delivery_destination_id)
  where delivery_destination_id is not null;

-- Only internal (workflow) transitions may set or change the destination fields.
create or replace function public.guard_order_destination_fields()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if public.is_internal_transition() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.delivery_destination_id is not null or new.destination_snapshot is not null then
      raise exception 'order_field_not_client_writable';
    end if;
  elsif (new.delivery_destination_id, new.destination_snapshot) is distinct from (old.delivery_destination_id, old.destination_snapshot) then
    raise exception 'order_field_not_client_writable';
  end if;
  return new;
end;
$function$;
-- Same EXECUTE list as the existing orders trigger functions (a trigger function cannot be called directly).
revoke all on function public.guard_order_destination_fields() from public, anon;
grant execute on function public.guard_order_destination_fields() to authenticated, service_role;

create trigger trg_orders_destination_fields_guard
  before insert or update of delivery_destination_id, destination_snapshot on public.orders
  for each row execute function public.guard_order_destination_fields();

commit;
