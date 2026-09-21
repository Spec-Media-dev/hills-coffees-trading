-- Feature 005 T014 / DB-OPEN-19 — SCRATCH database bootstrap (NEVER production).
--
-- A minimal, faithful stand-in for exactly the objects the migration
-- `supabase/migrations/20260921120000_feature_005_db_open_19_inventory_variance_hold.sql` touches, so the migration can
-- be DRY-RUN and its behaviour proven (including real concurrency) BEFORE it is approved for the live database.
-- Table/constraint/trigger/policy/function definitions are copied from `docs/database/database-schema-report.json`
-- (the live schema of record) and the migrations that changed them — only columns this feature does not read are omitted.
-- The existing WRITERS of `inventory_positions` (checkout_order, apply_delivery_reservation, the shipment-item
-- consumption, admin_review_payment, expire_order_hold) are NOT re-created here; `behavior.sql` issues the exact UPDATE
-- statement each one issues (verbatim shapes, read from their migrations) — the live proof
-- (`F005_LIVE_PROOF=1 npx vitest run tests/inventory`) exercises the real functions after approval.

-- Supabase roles and the auth surface the policies rely on ---------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant all on tables to anon;

-- Shared helpers (verbatim from the schema report) -----------------------------------------------------------------
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, is_blocked boolean not null default false);
create table public.organizations (id uuid primary key, display_name text);
create table public.organization_members (organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id), is_active boolean not null default true, primary key (organization_id, user_id));
create table public.platform_admins (user_id uuid primary key references public.profiles(id), role text not null, is_active boolean not null default true);

create function public.is_warehouse_operator() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.role in ('WAREHOUSE', 'ADMIN', 'SUPER_ADMIN') and pa.is_active = true); $function$;
create function public.is_auditor() returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$ select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid() and pa.role in ('AUDITOR', 'ADMIN', 'SUPER_ADMIN') and pa.is_active = true); $function$;
create function public.is_org_member(p_organization_id uuid) returns boolean language sql stable security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$ select exists (select 1 from public.organization_members om where om.organization_id = p_organization_id and om.user_id = auth.uid() and om.is_active = true); $function$;
-- Feature 003 T033's data gate: true unless the session owes an MFA step-up. The scratch database has no factors, so true.
create function public.mfa_satisfied() returns boolean language sql stable as $$ select true $$;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create function public.write_audit_log() returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$
declare v_correlation_id uuid;
begin
  begin v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then v_correlation_id := null; end;
  insert into public.audit_logs(actor_user_id, entity_type, entity_id, action, old_data, new_data, correlation_id)
  values (auth.uid(), tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, tg_op,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end, case when tg_op = 'DELETE' then null else to_jsonb(new) end, v_correlation_id);
  return case when tg_op = 'DELETE' then old else new end;
end; $function$;

-- Catalogue / custody tables ---------------------------------------------------------------------------------------
create table public.coffee_lots (id uuid primary key default gen_random_uuid(), lot_code text);
create table public.warehouses (id uuid primary key default gen_random_uuid(), code text);
create table public.warehouse_locations (id uuid primary key default gen_random_uuid(), warehouse_id uuid not null references public.warehouses(id));

create table public.inventory_positions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  owner_organization_id uuid not null references public.organizations(id),
  warehouse_id uuid not null references public.warehouses(id),
  warehouse_location_id uuid references public.warehouse_locations(id),
  available_quantity_kg numeric not null default 0,
  reserved_quantity_kg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_positions_available_quantity_kg_check check (available_quantity_kg >= 0),
  constraint inventory_positions_reserved_quantity_kg_check check (reserved_quantity_kg >= 0),
  constraint inventory_reserved_within_available_check check (reserved_quantity_kg <= available_quantity_kg),
  constraint inventory_positions_lot_id_owner_organization_id_warehouse__key unique (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)
);
create unique index uq_inventory_position_null_safe on public.inventory_positions (lot_id, owner_organization_id, warehouse_id, warehouse_location_id) nulls not distinct;

create function public.validate_inventory_location() returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$
begin
  if new.warehouse_id is null then raise exception 'inventory_requires_warehouse'; end if;
  if new.warehouse_location_id is not null and not exists (select 1 from public.warehouse_locations wl where wl.id = new.warehouse_location_id and wl.warehouse_id = new.warehouse_id) then raise exception 'warehouse_location_mismatch'; end if;
  return new;
end; $function$;
create trigger trg_audit_inventory_positions after insert or delete or update on public.inventory_positions for each row execute function public.write_audit_log();
create trigger trg_inventory_location before insert or update on public.inventory_positions for each row execute function public.validate_inventory_location();
create trigger trg_positions_updated_at before update on public.inventory_positions for each row execute function public.set_updated_at();

-- Faithful to the live grants (docs/database/database-schema-report.json table_grants): authenticated holds INSERT / REFERENCES /
-- SELECT / TRIGGER / UPDATE on inventory_positions (no DELETE, no TRUNCATE) and anon holds nothing; service_role holds everything.
revoke delete, truncate on table public.inventory_positions from authenticated;
revoke all on table public.inventory_positions from anon;
alter table public.inventory_positions enable row level security;
create policy inventory_owner_read on public.inventory_positions for select to authenticated using (public.is_org_member(owner_organization_id) or public.is_warehouse_operator() or public.is_auditor());
create policy inventory_warehouse_write on public.inventory_positions for all to authenticated using (public.is_warehouse_operator()) with check (public.is_warehouse_operator());

create table public.inventory_ownership_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  from_organization_id uuid references public.organizations(id),
  to_organization_id uuid not null references public.organizations(id),
  order_item_id uuid,
  quantity_kg numeric not null,
  event_type text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  correlation_id uuid,
  reason text,
  source_document_id uuid,
  constraint inventory_ownership_events_event_type_check check (event_type in ('INITIAL_ALLOCATION', 'SALE', 'RESALE', 'ADJUSTMENT', 'VOID')),
  constraint inventory_ownership_events_quantity_kg_check check (quantity_kg > 0)
);
create function public.prevent_ownership_event_mutation() returns trigger language plpgsql security definer set search_path to 'pg_catalog', 'public', 'auth' as
$function$ begin raise exception 'inventory_ownership_events_is_append_only'; end; $function$;
create trigger trg_audit_ownership_events after insert on public.inventory_ownership_events for each row execute function public.write_audit_log();
create trigger trg_ownership_events_append_only before delete or update on public.inventory_ownership_events for each row execute function public.prevent_ownership_event_mutation();
alter table public.inventory_ownership_events enable row level security;
create policy ownership_admin on public.inventory_ownership_events for select using (public.is_org_member(to_organization_id) or public.is_org_member(from_organization_id));

-- Listings / orders / shipments (only the columns the guards read, plus the statuses they compare) -----------------
create table public.coffee_offers (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  seller_organization_id uuid not null references public.organizations(id),
  warehouse_id uuid,
  warehouse_location_id uuid,
  title text,
  quantity_kg numeric not null default 1,
  status text not null default 'DRAFT'
);
create table public.orders (id uuid primary key default gen_random_uuid(), buyer_organization_id uuid not null references public.organizations(id));
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, lot_id uuid not null references public.coffee_lots(id), quantity_kg numeric not null default 1);
create table public.order_shipments (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, status text not null default 'DRAFT');
create table public.shipment_items (id uuid primary key default gen_random_uuid(), shipment_id uuid not null references public.order_shipments(id) on delete cascade, order_item_id uuid not null references public.order_items(id) on delete cascade);
create table public.storage_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid references public.order_items(id),
  owner_organization_id uuid not null references public.organizations(id),
  lot_id uuid not null references public.coffee_lots(id),
  warehouse_id uuid not null references public.warehouses(id),
  warehouse_location_id uuid references public.warehouse_locations(id),
  quantity_kg numeric not null default 0
);
