-- Hills Coffee Trading Platform
-- Baseline Supabase/PostgreSQL schema for the private trading product.
--
-- Business decisions encoded:
--   * Public visitors can browse published coffee and prices.
--   * Buyer and Seller are separate organization accounts.
--   * KYB approval is required before buying or listing.
--   * Admin/Super Admin create the catalog; Sellers create Listings from
--     coffee they already bought from Hills.
--   * A Listing is bought in full. Delivery may happen in parts, with the
--     remainder stored at Hills.
--   * Confirm Order -> complete Shipment details -> Checkout.
--   * MVP payment is manual Bank Transfer with an uploaded proof.
--   * No Sample Request flow. Help Center messages use a support code and
--     can be linked to an Order Code.
--   * No real third-party money escrow is assumed. The 20-minute hold is an
--     inventory reservation only.
--
-- Fresh baseline. Review existing objects before applying to a legacy project.
-- Catalog names intentionally match the old Hills database.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_id()
returns uuid language sql stable security definer
set search_path = pg_catalog, public, auth
as $$ select auth.uid(); $$;

create or replace function public.is_internal_transition()
returns boolean language sql stable
as $$
  select coalesce(current_setting('app.internal_transition', true), 'false') = 'true';
$$;

-- Identity and accounts

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  company_name text,
  avatar_path text,
  is_blocked boolean not null default false,
  blocked_at timestamptz,
  blocked_by uuid,
  block_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists blocked_at timestamptz;
alter table public.profiles add column if not exists blocked_by uuid;
alter table public.profiles add column if not exists block_reason text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text,
  account_type text not null check (account_type in ('BUYER', 'SELLER', 'HILLS_INTERNAL')),
  country_code char(2),
  tax_number text,
  registration_number text,
  email text,
  phone text,
  status text not null default 'PENDING_KYB'
    check (status in ('PENDING_KYB', 'UNDER_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED')),
  is_hills_internal boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_type = 'HILLS_INTERNAL') = is_hills_internal)
);

create unique index if not exists uq_organizations_tax_number
  on public.organizations (lower(tax_number))
  where tax_number is not null;

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'MEMBER' check (member_role in ('OWNER', 'MEMBER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'SUPER_ADMIN')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kyb_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'SUSPENDED')),
  rejection_reason text,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_one_open_kyb_application
  on public.kyb_applications (organization_id)
  where status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED');

create table if not exists public.file_assets (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  bucket_name text not null,
  object_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  is_private boolean not null default true,
  created_at timestamptz not null default now(),
  unique (bucket_name, object_path)
);

create table if not exists public.kyb_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.kyb_applications(id) on delete cascade,
  document_type text not null,
  file_asset_id uuid not null references public.file_assets(id),
  expires_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.kyb_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.kyb_applications(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED', 'SUSPENDED')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.account_status_history (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

-- Catalog matching the old project

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_code char(2),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.origins (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references public.regions(id),
  parent_origin_id uuid references public.origins(id),
  name text not null,
  slug text not null unique,
  country_code char(2),
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.origin_translations (
  origin_id uuid not null references public.origins(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null,
  description text,
  primary key (origin_id, locale)
);

create table if not exists public.coffee_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_varieties (
  id uuid primary key default gen_random_uuid(),
  coffee_type_id uuid references public.coffee_types(id),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.processing_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.packaging_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.coffees (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references public.origins(id),
  coffee_type_id uuid references public.coffee_types(id),
  variety_id uuid references public.coffee_varieties(id),
  processing_method_id uuid references public.processing_methods(id),
  packaging_type_id uuid references public.packaging_types(id),
  name text not null,
  slug text not null unique,
  description text,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coffee_translations (
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  locale text not null check (locale in ('en', 'ar')),
  name text not null,
  description text,
  primary key (coffee_id, locale)
);

create table if not exists public.coffee_lots (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id),
  lot_code text not null unique,
  crop_year text,
  quality_grade text,
  cup_score numeric(5,2),
  total_quantity_kg numeric(14,3) not null check (total_quantity_kg > 0),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'SOLD_OUT', 'ARCHIVED')),
  source_organization_id uuid not null references public.organizations(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  owner_organization_id uuid not null references public.organizations(id),
  code text not null unique,
  name text not null,
  country_code char(2),
  city text,
  address text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_locations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  code text not null,
  name text,
  unique (warehouse_id, code)
);

create table if not exists public.coffee_media (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_documents (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  document_type text not null,
  file_asset_id uuid not null references public.file_assets(id),
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_certifications (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  name text not null,
  certificate_number text,
  file_asset_id uuid references public.file_assets(id),
  expires_at date,
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.coffee_tags (
  coffee_id uuid not null references public.coffees(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (coffee_id, tag_id)
);

-- Listings and source data

create table if not exists public.coffee_offers (
  id uuid primary key default gen_random_uuid(),
  coffee_id uuid not null references public.coffees(id),
  lot_id uuid not null references public.coffee_lots(id),
  seller_organization_id uuid not null references public.organizations(id),
  seller_type text not null check (seller_type in ('HILLS', 'MEMBER_SELLER')),
  source_purchase_order_item_id uuid,
  warehouse_id uuid references public.warehouses(id),
  warehouse_location_id uuid references public.warehouse_locations(id),
  title text,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  reserved_quantity_kg numeric(14,3) not null default 0 check (reserved_quantity_kg >= 0),
  price_per_kg numeric(14,4) not null check (price_per_kg >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'SUSPENDED', 'SOLD_OUT', 'ARCHIVED')),
  is_visible boolean not null default false,
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (reserved_quantity_kg <= quantity_kg),
  check ((status = 'PUBLISHED') = is_visible)
);

create unique index if not exists uq_active_offer_per_lot_owner
  on public.coffee_offers (lot_id, seller_organization_id)
  where deleted_at is null and status not in ('ARCHIVED', 'REJECTED', 'SOLD_OUT');

create table if not exists public.offer_sensory_notes (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  aroma text,
  flavor text,
  acidity text,
  body text,
  finish text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offer_tags (
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (offer_id, tag_id)
);

create table if not exists public.offer_documents (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  document_type text not null,
  file_asset_id uuid not null references public.file_assets(id),
  created_at timestamptz not null default now()
);

create table if not exists public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('APPROVED', 'REJECTED', 'SUSPENDED')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.listing_status_history (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.coffee_offers(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

-- Inventory ownership and reservations

create table if not exists public.inventory_positions (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  owner_organization_id uuid not null references public.organizations(id),
  warehouse_id uuid references public.warehouses(id),
  warehouse_location_id uuid references public.warehouse_locations(id),
  available_quantity_kg numeric(14,3) not null default 0 check (available_quantity_kg >= 0),
  reserved_quantity_kg numeric(14,3) not null default 0 check (reserved_quantity_kg >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)
);

create table if not exists public.inventory_ownership_events (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.coffee_lots(id),
  from_organization_id uuid references public.organizations(id),
  to_organization_id uuid not null references public.organizations(id),
  order_item_id uuid,
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  event_type text not null check (event_type in ('INITIAL_ALLOCATION', 'SALE', 'RESALE', 'ADJUSTMENT', 'VOID')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.storage_allocations (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid,
  owner_organization_id uuid not null references public.organizations(id),
  lot_id uuid not null references public.coffee_lots(id),
  warehouse_id uuid not null references public.warehouses(id),
  warehouse_location_id uuid references public.warehouse_locations(id),
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  status text not null default 'STORED' check (status in ('STORED', 'RELEASED', 'DELIVERED')),
  started_at timestamptz not null default now(),
  released_at timestamptz
);

-- CHUNK 1 END
-- Orders, mandatory shipment step and fulfillment

create sequence if not exists public.order_code_seq;
create sequence if not exists public.proforma_code_seq;
create sequence if not exists public.support_ticket_code_seq;

create or replace function public.next_order_code()
returns text language sql
as $$ select 'ORD-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.order_code_seq')::text, 7, '0'); $$;

create or replace function public.next_proforma_code()
returns text language sql
as $$ select 'PI-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.proforma_code_seq')::text, 7, '0'); $$;

create or replace function public.next_support_ticket_code()
returns text language sql
as $$ select 'HLP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_code_seq')::text, 7, '0'); $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique default public.next_order_code(),
  buyer_organization_id uuid not null references public.organizations(id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'CONFIRMED', 'HOLD', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW', 'PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'EXPIRED', 'VOID', 'DISPUTED')),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  shipping_ready_at timestamptz,
  hold_started_at timestamptz,
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  offer_id uuid not null references public.coffee_offers(id),
  lot_id uuid not null references public.coffee_lots(id),
  seller_organization_id uuid not null references public.organizations(id),
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  unit_price_per_kg numeric(14,4) not null check (unit_price_per_kg >= 0),
  product_name_snapshot text not null,
  origin_name_snapshot text,
  variant_name_snapshot text,
  lot_code_snapshot text not null,
  seller_type_snapshot text not null check (seller_type_snapshot in ('HILLS', 'MEMBER_SELLER')),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  created_at timestamptz not null default now(),
  unique (order_id, offer_id)
);

create table if not exists public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  shipment_code text not null unique default ('SHP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED')),
  delivery_method text not null,
  country_code char(2) not null,
  city text,
  address_line text not null,
  contact_name text not null,
  contact_phone text not null,
  shipping_fee numeric(14,2) not null default 0 check (shipping_fee >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  ready_at timestamptz,
  delivered_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.order_shipments(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  planned_quantity_kg numeric(14,3) not null check (planned_quantity_kg > 0),
  delivered_quantity_kg numeric(14,3) not null default 0 check (delivered_quantity_kg >= 0),
  unique (shipment_id, order_item_id)
);

create table if not exists public.proforma_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  proforma_code text not null unique default public.next_proforma_code(),
  status text not null default 'ISSUED' check (status in ('ISSUED', 'PAID', 'VOID')),
  issued_at timestamptz not null default now(),
  valid_until timestamptz,
  file_asset_id uuid references public.file_assets(id)
);

create table if not exists public.proforma_invoice_items (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.proforma_invoices(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id),
  description text not null,
  quantity_kg numeric(14,3),
  unit_price numeric(14,4),
  amount numeric(14,2) not null,
  unique (proforma_id, order_item_id)
);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED')),
  expires_at timestamptz not null,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_active_inventory_reservation_order
  on public.inventory_reservations(order_id)
  where status = 'ACTIVE';

create table if not exists public.inventory_reservation_items (
  reservation_id uuid not null references public.inventory_reservations(id) on delete cascade,
  offer_id uuid not null references public.coffee_offers(id),
  quantity_kg numeric(14,3) not null check (quantity_kg > 0),
  primary key (reservation_id, offer_id)
);

-- Financial rules, payment and payout

create table if not exists public.commission_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.commission_tiers (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.commission_policies(id) on delete cascade,
  min_quantity_kg numeric(14,3) not null check (min_quantity_kg >= 0),
  max_quantity_kg numeric(14,3),
  percentage numeric(7,4) not null check (percentage >= 0 and percentage <= 100),
  check (max_quantity_kg is null or max_quantity_kg > min_quantity_kg),
  unique (policy_id, min_quantity_kg)
);

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null,
  tax_name text not null default 'VAT',
  rate_percentage numeric(7,4) not null check (rate_percentage >= 0 and rate_percentage <= 100),
  taxable_base text not null default 'MERCHANDISE_ONLY'
    check (taxable_base in ('MERCHANDISE_ONLY', 'MERCHANDISE_AND_SHIPPING')),
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid references public.profiles(id),
  unique (country_code, tax_name, effective_from)
);

insert into public.tax_rules(country_code, tax_name, rate_percentage, taxable_base)
values ('AE', 'VAT', 5, 'MERCHANDISE_ONLY')
on conflict do nothing;

create table if not exists public.shipping_rules (
  id uuid primary key default gen_random_uuid(),
  country_code char(2),
  delivery_method text not null,
  flat_fee numeric(14,2) not null default 0 check (flat_fee >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  is_active boolean not null default true,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid references public.profiles(id)
);

create table if not exists public.order_financials (
  order_id uuid primary key references public.orders(id) on delete cascade,
  base_subtotal numeric(14,2) not null default 0,
  shipping_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  seller_net_amount numeric(14,2) not null default 0,
  buyer_total_amount numeric(14,2) not null default 0,
  total_quantity_kg numeric(14,3) not null default 0,
  currency char(3) not null default 'USD' check (currency = 'USD'),
  commission_policy_id uuid references public.commission_policies(id),
  commission_percentage_snapshot numeric(7,4),
  tax_rule_id uuid references public.tax_rules(id),
  tax_percentage_snapshot numeric(7,4),
  tax_base_snapshot text,
  calculated_at timestamptz not null default now()
);

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  bank_name text not null,
  account_number text,
  iban text,
  swift_code text,
  currency char(3) not null default 'USD' check (currency = 'USD'),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  payment_method text not null default 'BANK_TRANSFER' check (payment_method in ('BANK_TRANSFER', 'PROVIDER')),
  provider text,
  external_reference text,
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROOF_SUBMITTED', 'UNDER_REVIEW', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'VOID')),
  payment_account_id uuid references public.payment_accounts(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  file_asset_id uuid not null references public.file_assets(id),
  reference_text text,
  submitted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  decision text not null check (decision in ('CONFIRMED', 'REJECTED')),
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade,
  provider text,
  external_event_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id)
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  seller_organization_id uuid not null references public.organizations(id),
  amount numeric(14,2) not null check (amount >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  status text not null default 'PENDING_PAYOUT'
    check (status in ('PENDING_PAYOUT', 'PROCESSING', 'PAID', 'VOID')),
  paid_by uuid references public.profiles(id),
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  unique (order_id, seller_organization_id)
);

create table if not exists public.tax_invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  invoice_number text not null unique,
  file_asset_id uuid not null references public.file_assets(id),
  uploaded_by uuid not null references public.profiles(id),
  issued_at date,
  created_at timestamptz not null default now()
);

-- Help Center: no samples

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique default public.next_support_ticket_code(),
  requester_user_id uuid not null references public.profiles(id),
  requester_organization_id uuid references public.organizations(id),
  order_id uuid references public.orders(id),
  order_code_snapshot text,
  subject text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED')),
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id),
  body text not null check (length(btrim(body)) > 0),
  attachment_file_id uuid references public.file_assets(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  notification_type text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP')),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'DELIVERED')),
  provider_message_id text,
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'SMS', 'WHATSAPP')),
  notification_type text not null,
  is_enabled boolean not null default true,
  primary key (user_id, channel, notification_type)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- CHUNK 2 END
-- Integrity functions

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.is_active = true
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.role = 'SUPER_ADMIN'
      and pa.is_active = true
  );
$$;

create or replace function public.is_blocked_user()
returns boolean language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    (select p.is_blocked from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id
      and om.user_id = auth.uid()
      and om.is_active = true
  );
$$;

create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_platform_admin()
      or exists (
        select 1
        from public.orders o
        join public.organization_members om on om.organization_id = o.buyer_organization_id
        where o.id = p_order_id and om.user_id = auth.uid() and om.is_active
      )
      or exists (
        select 1
        from public.order_items oi
        join public.coffee_offers co on co.id = oi.offer_id
        join public.organization_members om on om.organization_id = co.seller_organization_id
        where oi.order_id = p_order_id and om.user_id = auth.uid() and om.is_active
      );
$$;

create or replace function public.validate_offer_transition()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if new.seller_type = 'HILLS' then
      if not exists (
        select 1 from public.organizations o
        where o.id = new.seller_organization_id and o.is_hills_internal
      ) then
        raise exception 'hills_listing_requires_hills_owner';
      end if;
    elsif not exists (
      select 1 from public.organizations o
      where o.id = new.seller_organization_id
        and o.account_type = 'SELLER'
        and o.status = 'ACTIVE'
    ) then
      raise exception 'member_listing_requires_active_seller';
    end if;

    if not exists (
      select 1
      from public.inventory_positions ip
      where ip.lot_id = new.lot_id
        and ip.owner_organization_id = new.seller_organization_id
        and (new.warehouse_id is null or ip.warehouse_id = new.warehouse_id)
        and ip.available_quantity_kg >= new.quantity_kg
    ) then
      raise exception 'seller_does_not_own_listing_quantity';
    end if;
    return new;
  end if;

  if new.status <> old.status then
    if new.status in ('APPROVED', 'REJECTED', 'PUBLISHED', 'SUSPENDED', 'SOLD_OUT')
       and not public.is_platform_admin()
       and not public.is_internal_transition() then
      raise exception 'only_admin_can_change_listing_to_this_state';
    end if;

    if old.status = 'DRAFT' and new.status not in ('PENDING_REVIEW', 'ARCHIVED') then
      raise exception 'invalid_listing_transition';
    elsif old.status = 'PENDING_REVIEW' and new.status not in ('APPROVED', 'REJECTED', 'DRAFT') then
      raise exception 'invalid_listing_transition';
    elsif old.status = 'APPROVED' and new.status not in ('PUBLISHED', 'ARCHIVED') then
      raise exception 'invalid_listing_transition';
    elsif old.status = 'PUBLISHED' and new.status not in ('SUSPENDED', 'SOLD_OUT', 'ARCHIVED') then
      raise exception 'invalid_listing_transition';
    elsif old.status = 'REJECTED' and new.status <> 'DRAFT' then
      raise exception 'invalid_listing_transition';
    end if;
  end if;

  if new.status = 'PUBLISHED'
     and (new.quantity_kg - new.reserved_quantity_kg) <= 0 then
    raise exception 'cannot_publish_empty_listing';
  end if;

  if new.status not in ('SOLD_OUT', 'ARCHIVED', 'REJECTED')
     and not exists (
       select 1
       from public.inventory_positions ip
       where ip.lot_id = new.lot_id
         and ip.owner_organization_id = new.seller_organization_id
         and (new.warehouse_id is null or ip.warehouse_id = new.warehouse_id)
         and ip.available_quantity_kg >= new.quantity_kg
     ) then
    raise exception 'seller_does_not_own_listing_quantity';
  end if;

  if new.status = 'PUBLISHED' then
    new.is_visible := true;
  else
    new.is_visible := false;
  end if;

  return new;
end;
$$;

create or replace function public.assert_order_checkout_ready(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order_status text;
begin
  select status into v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if v_order_status is null then raise exception 'order_not_found'; end if;
  if v_order_status <> 'CONFIRMED' then
    raise exception 'order_must_be_confirmed_before_checkout';
  end if;

  if not exists (
    select 1 from public.order_shipments s
    where s.order_id = p_order_id
      and s.status = 'READY'
      and s.ready_at is not null
  ) then
    raise exception 'shipment_must_be_ready_before_checkout';
  end if;

  if exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and coalesce((
        select sum(si.planned_quantity_kg)
        from public.shipment_items si
        join public.order_shipments os on os.id = si.shipment_id
        where si.order_item_id = oi.id
          and os.status <> 'CANCELLED'
      ), 0) <> oi.quantity_kg
  ) then
    raise exception 'shipment_quantities_do_not_match_order';
  end if;
end;
$$;

create or replace function public.validate_order_transition()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status <> old.status then
    if not public.is_internal_transition() and not public.is_platform_admin() then
      if not (old.status = 'DRAFT' and new.status = 'CONFIRMED') then
        raise exception 'order_status_can_only_change_through_workflow';
      end if;
    end if;

    if old.status = 'DRAFT' and new.status not in ('CONFIRMED', 'VOID') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'CONFIRMED' and new.status not in ('HOLD', 'VOID') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'EXPIRED', 'VOID') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'PAYMENT_PROOF_SUBMITTED' and new.status not in ('PAYMENT_UNDER_REVIEW', 'HOLD', 'EXPIRED') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'HOLD', 'VOID') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED') then raise exception 'invalid_order_transition'; end if;
    if old.status = 'PARTIALLY_DELIVERED' and new.status <> 'COMPLETED' then raise exception 'invalid_order_transition'; end if;
    if old.status in ('COMPLETED', 'EXPIRED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;
  end if;

  if new.status = 'HOLD' then
    perform public.assert_order_checkout_ready(new.id);
    new.hold_started_at := coalesce(new.hold_started_at, now());
    new.hold_expires_at := coalesce(new.hold_expires_at, now() + interval '20 minutes');
  end if;

  if new.status = 'PAID' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status = 'COMPLETED' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end;
$$;

create or replace function public.sync_shipment_ready()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status = 'READY' then
    new.ready_at := coalesce(new.ready_at, now());
    update public.orders
    set shipping_ready_at = coalesce(shipping_ready_at, now())
    where id = new.order_id;
  end if;
  return new;
end;
$$;

create or replace function public.validate_order_item_offer()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_offer public.coffee_offers%rowtype;
  v_order_status text;
begin
  select status into v_order_status from public.orders where id = new.order_id;
  if v_order_status <> 'DRAFT' then
    raise exception 'order_items_can_only_change_in_draft';
  end if;

  select * into v_offer
  from public.coffee_offers
  where id = new.offer_id
  for update;

  if v_offer.id is null or v_offer.status <> 'PUBLISHED' or not v_offer.is_visible then
    raise exception 'listing_is_not_available';
  end if;

  if new.quantity_kg <> (v_offer.quantity_kg - v_offer.reserved_quantity_kg) then
    raise exception 'listing_must_be_purchased_in_full';
  end if;

  new.lot_id := v_offer.lot_id;
  new.seller_organization_id := v_offer.seller_organization_id;
  new.unit_price_per_kg := v_offer.price_per_kg;
  new.seller_type_snapshot := v_offer.seller_type;
  return new;
end;
$$;

create or replace function public.validate_shipment_item()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order_id uuid;
  v_order_status text;
begin
  select oi.order_id into v_order_id
  from public.order_items oi
  where oi.id = new.order_item_id;

  select status into v_order_status
  from public.orders
  where id = v_order_id;

  if v_order_status not in ('CONFIRMED', 'DRAFT') then
    raise exception 'shipment_plan_is_closed';
  end if;
  if new.delivered_quantity_kg > new.planned_quantity_kg then
    raise exception 'delivered_quantity_exceeds_plan';
  end if;
  return new;
end;
$$;

create or replace function public.validate_shipment_transition()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status <> old.status then
    if old.status = 'DRAFT' and new.status not in ('READY', 'CANCELLED') then raise exception 'invalid_shipment_transition'; end if;
    if old.status = 'READY' and new.status not in ('BOOKED', 'CANCELLED') then raise exception 'invalid_shipment_transition'; end if;
    if old.status = 'BOOKED' and new.status <> 'DISPATCHED' then raise exception 'invalid_shipment_transition'; end if;
    if old.status = 'DISPATCHED' and new.status not in ('PARTIALLY_DELIVERED', 'DELIVERED') then raise exception 'invalid_shipment_transition'; end if;
    if old.status in ('DELIVERED', 'CANCELLED') then raise exception 'terminal_shipment_cannot_change'; end if;
  end if;

  if old.status <> 'DRAFT' and (
    new.delivery_method is distinct from old.delivery_method or
    new.country_code is distinct from old.country_code or
    new.city is distinct from old.city or
    new.address_line is distinct from old.address_line or
    new.contact_name is distinct from old.contact_name or
    new.contact_phone is distinct from old.contact_phone or
    new.shipping_fee is distinct from old.shipping_fee
  ) then
    raise exception 'shipment_details_are_locked';
  end if;
  return new;
end;
$$;

create or replace function public.validate_support_ticket()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.order_id is not null then
    if not public.can_view_order(new.order_id) and not public.is_platform_admin() then
      raise exception 'order_not_accessible';
    end if;
    select coalesce(new.requester_organization_id, o.buyer_organization_id), o.order_code
    into new.requester_organization_id, new.order_code_snapshot
    from public.orders o
    where o.id = new.order_id;
  end if;
  return new;
end;
$$;

create or replace function public.record_order_status_history()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_status_history(order_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.record_listing_status_history()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.status is distinct from old.status then
    insert into public.listing_status_history(offer_id, old_status, new_status, changed_by, reason)
    values (new.id, old.status, new.status, auth.uid(), new.rejection_reason);
  end if;
  return new;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  insert into public.audit_logs(actor_user_id, entity_type, entity_id, action, old_data, new_data)
  values (
    auth.uid(),
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Checkout: complete shipment first, then create a 20-minute inventory hold.

create or replace function public.checkout_order(p_order_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_order public.orders%rowtype;
  v_ship public.order_shipments%rowtype;
  v_reservation_id uuid;
  v_proforma_id uuid;
  v_base numeric(14,2);
  v_qty numeric(14,3);
  v_shipping numeric(14,2);
  v_vat_rate numeric(7,4) := 0;
  v_taxable_base text := 'MERCHANDISE_ONLY';
  v_commission_rate numeric(7,4) := 0;
  v_commission numeric(14,2);
  v_vat numeric(14,2);
  v_buyer_total numeric(14,2);
  v_policy_id uuid;
  v_tax_id uuid;
  v_order_item record;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;

  if not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_order.buyer_organization_id
      and om.user_id = auth.uid()
      and om.is_active
  ) and not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  perform public.assert_order_checkout_ready(p_order_id);
  select * into v_ship
  from public.order_shipments
  where order_id = p_order_id and status = 'READY'
  order by created_at desc limit 1;

  select coalesce(sum(quantity_kg * unit_price_per_kg), 0),
         coalesce(sum(quantity_kg), 0)
  into v_base, v_qty
  from public.order_items
  where order_id = p_order_id;

  v_shipping := v_ship.shipping_fee;

  select cp.id, ct.percentage
  into v_policy_id, v_commission_rate
  from public.commission_policies cp
  join public.commission_tiers ct on ct.policy_id = cp.id
  where cp.status = 'ACTIVE'
    and cp.effective_from <= now()
    and (cp.effective_until is null or cp.effective_until > now())
    and ct.min_quantity_kg <= v_qty
    and (ct.max_quantity_kg is null or v_qty < ct.max_quantity_kg)
  order by cp.effective_from desc, ct.min_quantity_kg desc
  limit 1;

  v_commission := round(v_base * coalesce(v_commission_rate, 0) / 100, 2);

  select tr.id, tr.rate_percentage, tr.taxable_base
  into v_tax_id, v_vat_rate, v_taxable_base
  from public.tax_rules tr
  where tr.is_active
    and tr.country_code = upper(v_ship.country_code)
    and tr.effective_from <= now()
    and (tr.effective_until is null or tr.effective_until > now())
  order by tr.effective_from desc
  limit 1;

  v_vat := round(
    (case when v_taxable_base = 'MERCHANDISE_AND_SHIPPING'
          then v_base + v_shipping else v_base end)
    * coalesce(v_vat_rate, 0) / 100, 2
  );
  v_buyer_total := v_base + v_shipping + v_vat;

  insert into public.order_financials(
    order_id, base_subtotal, shipping_amount, vat_amount, commission_amount,
    seller_net_amount, buyer_total_amount, total_quantity_kg,
    commission_policy_id, commission_percentage_snapshot,
    tax_rule_id, tax_percentage_snapshot, tax_base_snapshot
  )
  values (
    p_order_id, v_base, v_shipping, v_vat, v_commission, v_base - v_commission,
    v_buyer_total, v_qty, v_policy_id, coalesce(v_commission_rate, 0),
    v_tax_id, coalesce(v_vat_rate, 0), v_taxable_base
  )
  on conflict (order_id) do update set
    base_subtotal = excluded.base_subtotal,
    shipping_amount = excluded.shipping_amount,
    vat_amount = excluded.vat_amount,
    commission_amount = excluded.commission_amount,
    seller_net_amount = excluded.seller_net_amount,
    buyer_total_amount = excluded.buyer_total_amount,
    total_quantity_kg = excluded.total_quantity_kg,
    commission_policy_id = excluded.commission_policy_id,
    commission_percentage_snapshot = excluded.commission_percentage_snapshot,
    tax_rule_id = excluded.tax_rule_id,
    tax_percentage_snapshot = excluded.tax_percentage_snapshot,
    tax_base_snapshot = excluded.tax_base_snapshot,
    calculated_at = now();

  insert into public.proforma_invoices(order_id, valid_until)
  values (p_order_id, now() + interval '20 minutes')
  on conflict (order_id) do update set valid_until = excluded.valid_until, status = 'ISSUED';

  select id into v_proforma_id from public.proforma_invoices where order_id = p_order_id;

  insert into public.inventory_reservations(order_id, expires_at)
  values (p_order_id, now() + interval '20 minutes')
  returning id into v_reservation_id;

  for v_order_item in select * from public.order_items where order_id = p_order_id loop
    update public.coffee_offers
    set reserved_quantity_kg = reserved_quantity_kg + v_order_item.quantity_kg
    where id = v_order_item.offer_id
      and status = 'PUBLISHED'
      and (quantity_kg - reserved_quantity_kg) >= v_order_item.quantity_kg;

    if not found then raise exception 'listing_inventory_changed'; end if;

    insert into public.inventory_reservation_items(reservation_id, offer_id, quantity_kg)
    values (v_reservation_id, v_order_item.offer_id, v_order_item.quantity_kg);

    insert into public.proforma_invoice_items(proforma_id, order_item_id, description, quantity_kg, unit_price, amount)
    values (
      v_proforma_id, v_order_item.id, v_order_item.product_name_snapshot,
      v_order_item.quantity_kg, v_order_item.unit_price_per_kg,
      round(v_order_item.quantity_kg * v_order_item.unit_price_per_kg, 2)
    )
    on conflict do nothing;
  end loop;

  update public.payments set amount = v_buyer_total, status = 'PENDING' where order_id = p_order_id;
  if not found then
    insert into public.payments(order_id, amount) values (p_order_id, v_buyer_total);
  end if;

  perform set_config('app.internal_transition', 'true', true);
  update public.orders
  set status = 'HOLD', hold_started_at = now(), hold_expires_at = now() + interval '20 minutes'
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'proforma_id', v_proforma_id,
    'reservation_id', v_reservation_id,
    'buyer_total', v_buyer_total,
    'hold_expires_at', now() + interval '20 minutes'
  );
end;
$$;

-- Payment proof and admin confirmation

create or replace function public.submit_payment_proof(
  p_order_id uuid,
  p_file_asset_id uuid,
  p_reference text default null
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_payment_id uuid;
begin
  if not exists (
    select 1
    from public.orders o
    join public.organization_members om on om.organization_id = o.buyer_organization_id
    where o.id = p_order_id
      and om.user_id = auth.uid()
      and om.is_active
      and o.status = 'HOLD'
  ) then
    raise exception 'order_not_payable';
  end if;

  select id into v_payment_id
  from public.payments
  where order_id = p_order_id
  for update;

  insert into public.payment_proofs(payment_id, file_asset_id, reference_text, submitted_by)
  values (v_payment_id, p_file_asset_id, p_reference, auth.uid());

  update public.payments set status = 'UNDER_REVIEW' where id = v_payment_id;
  perform set_config('app.internal_transition', 'true', true);
  update public.orders set status = 'PAYMENT_UNDER_REVIEW' where id = p_order_id;
  return v_payment_id;
end;
$$;

create or replace function public.admin_review_payment(
  p_payment_id uuid,
  p_approved boolean,
  p_reason text default null
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_item record;
  v_position public.inventory_positions%rowtype;
  v_rate numeric(7,4) := 0;
  v_line_base numeric(14,2);
  v_line_commission numeric(14,2);
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  select * into v_order from public.orders where id = v_payment.order_id for update;

  insert into public.payment_reviews(payment_id, reviewer_user_id, decision, reason)
  values (p_payment_id, auth.uid(), case when p_approved then 'CONFIRMED' else 'REJECTED' end, p_reason);

  if not p_approved then
    update public.payments set status = 'REJECTED', rejected_reason = p_reason where id = p_payment_id;
    perform set_config('app.internal_transition', 'true', true);
    update public.orders set status = 'HOLD' where id = v_order.id and status in ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW');
    return;
  end if;

  select * into v_reservation
  from public.inventory_reservations
  where order_id = v_order.id and status = 'ACTIVE'
  for update;

  if v_reservation.id is null then raise exception 'active_reservation_missing'; end if;

  select coalesce(ofn.commission_percentage_snapshot, 0)
  into v_rate
  from public.order_financials ofn
  where ofn.order_id = v_order.id;

  for v_item in
    select oi.*, co.quantity_kg as offer_quantity, co.reserved_quantity_kg,
           co.seller_organization_id as offer_seller, co.seller_type,
           co.warehouse_id as offer_warehouse_id,
           co.warehouse_location_id as offer_warehouse_location_id
    from public.order_items oi
    join public.coffee_offers co on co.id = oi.offer_id
    where oi.order_id = v_order.id
  loop
    select * into v_position
    from public.inventory_positions ip
    where ip.lot_id = v_item.lot_id
      and ip.owner_organization_id = v_item.offer_seller
      and ip.warehouse_id is not distinct from v_item.offer_warehouse_id
      and ip.warehouse_location_id is not distinct from v_item.offer_warehouse_location_id
    order by ip.created_at
    limit 1
    for update;

    if v_position.id is null or v_position.available_quantity_kg < v_item.quantity_kg then
      raise exception 'seller_inventory_position_missing';
    end if;

    update public.inventory_positions
    set available_quantity_kg = available_quantity_kg - v_item.quantity_kg
    where id = v_position.id;

    insert into public.inventory_positions(
      lot_id, owner_organization_id, warehouse_id, warehouse_location_id, available_quantity_kg
    )
    values (
      v_item.lot_id, v_order.buyer_organization_id, v_position.warehouse_id,
      v_position.warehouse_location_id, v_item.quantity_kg
    )
    on conflict (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)
    do update set available_quantity_kg = public.inventory_positions.available_quantity_kg + excluded.available_quantity_kg,
                  updated_at = now();

    insert into public.inventory_ownership_events(
      lot_id, from_organization_id, to_organization_id, order_item_id,
      quantity_kg, event_type, created_by
    )
    values (
      v_item.lot_id, v_item.offer_seller, v_order.buyer_organization_id,
      v_item.id, v_item.quantity_kg,
      case when v_item.seller_type_snapshot = 'HILLS' then 'SALE' else 'RESALE' end,
      auth.uid()
    );

    update public.coffee_offers
    set reserved_quantity_kg = greatest(reserved_quantity_kg - v_item.quantity_kg, 0),
        status = 'SOLD_OUT',
        is_visible = false
    where id = v_item.offer_id;

    if v_item.seller_type_snapshot = 'MEMBER_SELLER' then
      v_line_base := round(v_item.quantity_kg * v_item.unit_price_per_kg, 2);
      v_line_commission := round(v_line_base * v_rate / 100, 2);
      insert into public.payouts(order_id, seller_organization_id, amount)
      values (v_order.id, v_item.seller_organization_id, v_line_base - v_line_commission)
      on conflict (order_id, seller_organization_id)
      do update set amount = public.payouts.amount + excluded.amount;
    end if;
  end loop;

  update public.inventory_reservations
  set status = 'CONSUMED', consumed_at = now()
  where id = v_reservation.id;

  update public.payments
  set status = 'CONFIRMED', confirmed_by = auth.uid(), confirmed_at = now()
  where id = p_payment_id;

  update public.proforma_invoices
  set status = 'PAID'
  where order_id = v_order.id;

  perform set_config('app.internal_transition', 'true', true);
  update public.orders set status = 'PAID' where id = v_order.id;
end;
$$;

create or replace function public.expire_order_hold(p_order_id uuid)
returns void
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_res public.inventory_reservations%rowtype;
  v_item record;
begin
  select * into v_res
  from public.inventory_reservations
  where order_id = p_order_id
    and status = 'ACTIVE'
    and expires_at <= now()
  for update;

  if v_res.id is null then return; end if;

  for v_item in select * from public.inventory_reservation_items where reservation_id = v_res.id loop
    update public.coffee_offers
    set reserved_quantity_kg = greatest(reserved_quantity_kg - v_item.quantity_kg, 0)
    where id = v_item.offer_id;
  end loop;

  update public.inventory_reservations
  set status = 'EXPIRED', released_at = now()
  where id = v_res.id;

  update public.payments
  set status = 'EXPIRED'
  where order_id = p_order_id and status in ('PENDING', 'PROOF_SUBMITTED', 'UNDER_REVIEW');

  perform set_config('app.internal_transition', 'true', true);
  update public.orders
  set status = 'EXPIRED'
  where id = p_order_id and status in ('HOLD', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW');
end;
$$;

-- Help Center code: HLP-YYYYMMDD-0000001, optionally linked to ORD-YYYYMMDD-0000001.

create or replace function public.create_support_ticket(
  p_subject text,
  p_body text,
  p_order_id uuid default null,
  p_organization_id uuid default null
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_ticket public.support_tickets%rowtype;
  v_org_id uuid := p_organization_id;
begin
  if auth.uid() is null or public.is_blocked_user() then raise exception 'forbidden'; end if;

  if p_order_id is not null then
    if not public.can_view_order(p_order_id) then raise exception 'order_not_accessible'; end if;
    if v_org_id is null then
      select buyer_organization_id into v_org_id from public.orders where id = p_order_id;
    end if;
  end if;

  insert into public.support_tickets(
    requester_user_id, requester_organization_id, order_id, order_code_snapshot, subject
  )
  select auth.uid(), v_org_id, p_order_id, o.order_code, p_subject
  from public.orders o
  where o.id = p_order_id
  returning * into v_ticket;

  if not found then
    insert into public.support_tickets(
      requester_user_id, requester_organization_id, subject
    )
    values (auth.uid(), v_org_id, p_subject)
    returning * into v_ticket;
  end if;

  insert into public.support_messages(ticket_id, author_user_id, body)
  values (v_ticket.id, auth.uid(), p_body);

  return jsonb_build_object(
    'ticket_id', v_ticket.id,
    'ticket_code', v_ticket.ticket_code,
    'order_code', v_ticket.order_code_snapshot
  );
end;
$$;

-- Provenance link added after order_items exists.
alter table public.coffee_offers
  drop constraint if exists coffee_offers_source_purchase_order_item_id_fkey;
alter table public.coffee_offers
  add constraint coffee_offers_source_purchase_order_item_id_fkey
  foreign key (source_purchase_order_item_id) references public.order_items(id);

-- Triggers

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists trg_organizations_updated_at on public.organizations;
create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
drop trigger if exists trg_kyb_updated_at on public.kyb_applications;
create trigger trg_kyb_updated_at before update on public.kyb_applications for each row execute function public.set_updated_at();
drop trigger if exists trg_coffees_updated_at on public.coffees;
create trigger trg_coffees_updated_at before update on public.coffees for each row execute function public.set_updated_at();
drop trigger if exists trg_lots_updated_at on public.coffee_lots;
create trigger trg_lots_updated_at before update on public.coffee_lots for each row execute function public.set_updated_at();
drop trigger if exists trg_offers_updated_at on public.coffee_offers;
create trigger trg_offers_updated_at before update on public.coffee_offers for each row execute function public.set_updated_at();
drop trigger if exists trg_positions_updated_at on public.inventory_positions;
create trigger trg_positions_updated_at before update on public.inventory_positions for each row execute function public.set_updated_at();
drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists trg_shipments_updated_at on public.order_shipments;
create trigger trg_shipments_updated_at before update on public.order_shipments for each row execute function public.set_updated_at();
drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
drop trigger if exists trg_support_updated_at on public.support_tickets;
create trigger trg_support_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();

drop trigger if exists trg_offer_transition on public.coffee_offers;
create trigger trg_offer_transition before insert or update on public.coffee_offers for each row execute function public.validate_offer_transition();
drop trigger if exists trg_order_transition on public.orders;
create trigger trg_order_transition before update on public.orders for each row execute function public.validate_order_transition();
drop trigger if exists trg_shipment_ready on public.order_shipments;
create trigger trg_shipment_ready before insert or update on public.order_shipments for each row execute function public.sync_shipment_ready();
drop trigger if exists trg_order_item_offer on public.order_items;
create trigger trg_order_item_offer before insert or update on public.order_items for each row execute function public.validate_order_item_offer();
drop trigger if exists trg_shipment_item_validate on public.shipment_items;
create trigger trg_shipment_item_validate before insert or update on public.shipment_items for each row execute function public.validate_shipment_item();
drop trigger if exists trg_shipment_transition on public.order_shipments;
create trigger trg_shipment_transition before update on public.order_shipments for each row execute function public.validate_shipment_transition();
drop trigger if exists trg_support_ticket_validate on public.support_tickets;
create trigger trg_support_ticket_validate before insert or update on public.support_tickets for each row execute function public.validate_support_ticket();
drop trigger if exists trg_order_status_history on public.orders;
create trigger trg_order_status_history after update of status on public.orders for each row execute function public.record_order_status_history();
drop trigger if exists trg_listing_status_history on public.coffee_offers;
create trigger trg_listing_status_history after update of status on public.coffee_offers for each row execute function public.record_listing_status_history();

drop trigger if exists trg_audit_coffees on public.coffees;
create trigger trg_audit_coffees after insert or update or delete on public.coffees for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_offers on public.coffee_offers;
create trigger trg_audit_offers after insert or update or delete on public.coffee_offers for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_orders on public.orders;
create trigger trg_audit_orders after insert or update or delete on public.orders for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_payments on public.payments;
create trigger trg_audit_payments after insert or update or delete on public.payments for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_tickets on public.support_tickets;
create trigger trg_audit_tickets after insert or update or delete on public.support_tickets for each row execute function public.write_audit_log();

-- CHUNK 3 END
-- Row Level Security

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.kyb_applications enable row level security;
alter table public.kyb_documents enable row level security;
alter table public.kyb_reviews enable row level security;
alter table public.account_status_history enable row level security;
alter table public.file_assets enable row level security;
alter table public.regions enable row level security;
alter table public.origins enable row level security;
alter table public.origin_translations enable row level security;
alter table public.coffee_types enable row level security;
alter table public.coffee_varieties enable row level security;
alter table public.processing_methods enable row level security;
alter table public.packaging_types enable row level security;
alter table public.coffees enable row level security;
alter table public.coffee_translations enable row level security;
alter table public.coffee_lots enable row level security;
alter table public.warehouses enable row level security;
alter table public.warehouse_locations enable row level security;
alter table public.coffee_media enable row level security;
alter table public.coffee_documents enable row level security;
alter table public.coffee_certifications enable row level security;
alter table public.tags enable row level security;
alter table public.coffee_tags enable row level security;
alter table public.coffee_offers enable row level security;
alter table public.offer_sensory_notes enable row level security;
alter table public.offer_tags enable row level security;
alter table public.offer_documents enable row level security;
alter table public.listing_reviews enable row level security;
alter table public.listing_status_history enable row level security;
alter table public.inventory_positions enable row level security;
alter table public.inventory_ownership_events enable row level security;
alter table public.storage_allocations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_shipments enable row level security;
alter table public.shipment_items enable row level security;
alter table public.proforma_invoices enable row level security;
alter table public.proforma_invoice_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_reservation_items enable row level security;
alter table public.commission_policies enable row level security;
alter table public.commission_tiers enable row level security;
alter table public.tax_rules enable row level security;
alter table public.shipping_rules enable row level security;
alter table public.order_financials enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.payment_reviews enable row level security;
alter table public.payment_events enable row level security;
alter table public.payouts enable row level security;
alter table public.tax_invoices enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.audit_logs enable row level security;

-- Public catalogue read access. Prices remain public by the approved rule.

drop policy if exists public_read_regions on public.regions;
create policy public_read_regions on public.regions for select using (true);

drop policy if exists public_read_origins on public.origins;
create policy public_read_origins on public.origins for select using (status = 'ACTIVE');

drop policy if exists public_read_origin_translations on public.origin_translations;
create policy public_read_origin_translations on public.origin_translations
for select using (exists (select 1 from public.origins o where o.id = origin_id and o.status = 'ACTIVE'));

drop policy if exists public_read_types on public.coffee_types;
create policy public_read_types on public.coffee_types for select using (true);

drop policy if exists public_read_varieties on public.coffee_varieties;
create policy public_read_varieties on public.coffee_varieties for select using (true);

drop policy if exists public_read_processing on public.processing_methods;
create policy public_read_processing on public.processing_methods for select using (true);

drop policy if exists public_read_packaging on public.packaging_types;
create policy public_read_packaging on public.packaging_types for select using (true);

drop policy if exists public_read_coffees on public.coffees;
create policy public_read_coffees on public.coffees for select using (status = 'PUBLISHED');

drop policy if exists public_read_coffee_translations on public.coffee_translations;
create policy public_read_coffee_translations on public.coffee_translations
for select using (exists (select 1 from public.coffees c where c.id = coffee_id and c.status = 'PUBLISHED'));

drop policy if exists public_read_offers on public.coffee_offers;
create policy public_read_offers on public.coffee_offers
for select using (status = 'PUBLISHED' and is_visible and deleted_at is null and (quantity_kg - reserved_quantity_kg) > 0);

drop policy if exists public_read_lots on public.coffee_lots;
create policy public_read_lots on public.coffee_lots
for select using (exists (select 1 from public.coffee_offers co where co.lot_id = id and co.status = 'PUBLISHED' and co.is_visible and co.deleted_at is null));

drop policy if exists public_read_warehouses on public.warehouses;
create policy public_read_warehouses on public.warehouses for select using (is_active = true);

-- Identity and account policies.

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select using (id = auth.uid() or public.is_platform_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update using (id = auth.uid() and not public.is_blocked_user())
with check (id = auth.uid() and not public.is_blocked_user());

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations
for select using (public.is_org_member(id) or public.is_platform_admin());

drop policy if exists organizations_member_update on public.organizations;
create policy organizations_member_update on public.organizations
for update using (public.is_org_member(id) and not public.is_blocked_user())
with check (public.is_org_member(id) and not public.is_blocked_user());

drop policy if exists organizations_admin_all on public.organizations;
create policy organizations_admin_all on public.organizations
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists members_own_org on public.organization_members;
create policy members_own_org on public.organization_members
for select using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists members_admin_write on public.organization_members;
create policy members_admin_write on public.organization_members
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists kyb_own_or_admin on public.kyb_applications;
create policy kyb_own_or_admin on public.kyb_applications
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

drop policy if exists kyb_member_insert on public.kyb_applications;
create policy kyb_member_insert on public.kyb_applications
for insert with check (public.is_org_member(organization_id) and submitted_by = auth.uid() and not public.is_blocked_user());

drop policy if exists kyb_admin_all on public.kyb_applications;
create policy kyb_admin_all on public.kyb_applications
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists kyb_documents_own_or_admin on public.kyb_documents;
create policy kyb_documents_own_or_admin on public.kyb_documents
for all using (
  public.is_platform_admin()
  or exists (
    select 1 from public.kyb_applications ka
    where ka.id = application_id and public.is_org_member(ka.organization_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.kyb_applications ka
    where ka.id = application_id and public.is_org_member(ka.organization_id)
  )
);

drop policy if exists kyb_reviews_admin on public.kyb_reviews;
create policy kyb_reviews_admin on public.kyb_reviews
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists account_status_history_view on public.account_status_history;
create policy account_status_history_view on public.account_status_history
for select using (public.is_org_member(organization_id) or public.is_platform_admin());

-- Catalog admin writes.

drop policy if exists catalog_admin_regions on public.regions;
create policy catalog_admin_regions on public.regions
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_origins on public.origins;
create policy catalog_admin_origins on public.origins
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_types on public.coffee_types;
create policy catalog_admin_types on public.coffee_types
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_varieties on public.coffee_varieties;
create policy catalog_admin_varieties on public.coffee_varieties
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_processing on public.processing_methods;
create policy catalog_admin_processing on public.processing_methods
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_packaging on public.packaging_types;
create policy catalog_admin_packaging on public.packaging_types
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_coffees on public.coffees;
create policy catalog_admin_coffees on public.coffees
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_lots on public.coffee_lots;
create policy catalog_admin_lots on public.coffee_lots
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_warehouses on public.warehouses;
create policy catalog_admin_warehouses on public.warehouses
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_files on public.file_assets;
create policy catalog_admin_files on public.file_assets
for all using (
  public.is_platform_admin()
  or uploaded_by = auth.uid()
  or public.is_org_member(organization_id)
)
with check (
  public.is_platform_admin()
  or uploaded_by = auth.uid()
  or public.is_org_member(organization_id)
);

drop policy if exists public_read_coffee_media on public.coffee_media;
create policy public_read_coffee_media on public.coffee_media
for select using (exists (select 1 from public.coffees c where c.id = coffee_id and c.status = 'PUBLISHED'));

drop policy if exists catalog_admin_coffee_media on public.coffee_media;
create policy catalog_admin_coffee_media on public.coffee_media
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists catalog_admin_coffee_documents on public.coffee_documents;
create policy catalog_admin_coffee_documents on public.coffee_documents
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists public_read_certifications on public.coffee_certifications;
create policy public_read_certifications on public.coffee_certifications
for select using (exists (select 1 from public.coffees c where c.id = coffee_id and c.status = 'PUBLISHED'));

drop policy if exists catalog_admin_certifications on public.coffee_certifications;
create policy catalog_admin_certifications on public.coffee_certifications
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists public_read_tags on public.tags;
create policy public_read_tags on public.tags for select using (true);

drop policy if exists catalog_admin_tags on public.tags;
create policy catalog_admin_tags on public.tags
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists public_read_coffee_tags on public.coffee_tags;
create policy public_read_coffee_tags on public.coffee_tags
for select using (exists (select 1 from public.coffees c where c.id = coffee_id and c.status = 'PUBLISHED'));

drop policy if exists catalog_admin_coffee_tags on public.coffee_tags;
create policy catalog_admin_coffee_tags on public.coffee_tags
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Offers and inventory.

drop policy if exists offers_owner_or_admin on public.coffee_offers;
create policy offers_owner_or_admin on public.coffee_offers
for all using (public.is_platform_admin() or public.is_org_member(seller_organization_id))
with check (public.is_platform_admin() or (public.is_org_member(seller_organization_id) and created_by = auth.uid()));

drop policy if exists offer_details_owner_or_admin on public.offer_sensory_notes;
create policy offer_details_owner_or_admin on public.offer_sensory_notes
for all using (
  public.is_platform_admin()
  or exists (
    select 1 from public.coffee_offers co
    where co.id = offer_id and public.is_org_member(co.seller_organization_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.coffee_offers co
    where co.id = offer_id and public.is_org_member(co.seller_organization_id)
  )
);

drop policy if exists offer_documents_owner_or_admin on public.offer_documents;
create policy offer_documents_owner_or_admin on public.offer_documents
for all using (
  public.is_platform_admin()
  or exists (select 1 from public.coffee_offers co where co.id = offer_id and public.is_org_member(co.seller_organization_id))
)
with check (
  public.is_platform_admin()
  or exists (select 1 from public.coffee_offers co where co.id = offer_id and public.is_org_member(co.seller_organization_id))
);

drop policy if exists public_read_offer_sensory_notes on public.offer_sensory_notes;
create policy public_read_offer_sensory_notes on public.offer_sensory_notes
for select using (exists (select 1 from public.coffee_offers co where co.id = offer_id and co.status = 'PUBLISHED' and co.is_visible));

drop policy if exists public_read_offer_tags on public.offer_tags;
create policy public_read_offer_tags on public.offer_tags
for select using (exists (select 1 from public.coffee_offers co where co.id = offer_id and co.status = 'PUBLISHED' and co.is_visible));

drop policy if exists offer_reviews_admin on public.listing_reviews;
create policy offer_reviews_admin on public.listing_reviews
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists offer_history_view on public.listing_status_history;
create policy offer_history_view on public.listing_status_history
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.coffee_offers co
    where co.id = offer_id and public.is_org_member(co.seller_organization_id)
  )
);

drop policy if exists inventory_admin on public.inventory_positions;
create policy inventory_admin on public.inventory_positions
for all using (public.is_platform_admin() or public.is_org_member(owner_organization_id))
with check (public.is_platform_admin() or public.is_org_member(owner_organization_id));

drop policy if exists ownership_admin on public.inventory_ownership_events;
create policy ownership_admin on public.inventory_ownership_events
for select using (public.is_platform_admin() or public.is_org_member(to_organization_id) or public.is_org_member(from_organization_id));

drop policy if exists storage_owner_or_admin on public.storage_allocations;
create policy storage_owner_or_admin on public.storage_allocations
for all using (public.is_platform_admin() or public.is_org_member(owner_organization_id))
with check (public.is_platform_admin() or public.is_org_member(owner_organization_id));

-- Orders, mandatory shipments and payment.

drop policy if exists orders_view on public.orders;
create policy orders_view on public.orders
for select using (public.can_view_order(id));

drop policy if exists orders_create_buyer on public.orders;
create policy orders_create_buyer on public.orders
for insert with check (
  public.is_org_member(buyer_organization_id)
  and created_by = auth.uid()
  and status = 'DRAFT'
  and not public.is_blocked_user()
);

drop policy if exists orders_update_buyer_or_admin on public.orders;
create policy orders_update_buyer_or_admin on public.orders
for update using (
  public.is_platform_admin()
  or (public.is_org_member(buyer_organization_id) and status in ('DRAFT', 'CONFIRMED'))
)
with check (public.is_platform_admin() or public.is_org_member(buyer_organization_id));

drop policy if exists order_items_view on public.order_items;
create policy order_items_view on public.order_items
for select using (public.can_view_order(order_id));

drop policy if exists order_items_create_buyer on public.order_items;
create policy order_items_create_buyer on public.order_items
for insert with check (
  exists (
    select 1 from public.orders o
    where o.id = order_id and o.status = 'DRAFT' and public.is_org_member(o.buyer_organization_id)
  )
);

drop policy if exists order_items_admin on public.order_items;
create policy order_items_admin on public.order_items
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists order_history_view on public.order_status_history;
create policy order_history_view on public.order_status_history
for select using (public.can_view_order(order_id));

drop policy if exists shipments_view_or_manage on public.order_shipments;
create policy shipments_view_or_manage on public.order_shipments
for all using (public.is_platform_admin() or public.can_view_order(order_id))
with check (public.is_platform_admin() or public.can_view_order(order_id));

drop policy if exists shipment_items_view_or_manage on public.shipment_items;
create policy shipment_items_view_or_manage on public.shipment_items
for all using (
  public.is_platform_admin()
  or exists (
    select 1 from public.order_items oi
    where oi.id = order_item_id and public.can_view_order(oi.order_id)
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.order_items oi
    where oi.id = order_item_id and public.can_view_order(oi.order_id)
  )
);

drop policy if exists proforma_view on public.proforma_invoices;
create policy proforma_view on public.proforma_invoices
for select using (public.can_view_order(order_id));

drop policy if exists proforma_items_view on public.proforma_invoice_items;
create policy proforma_items_view on public.proforma_invoice_items
for select using (
  exists (
    select 1 from public.proforma_invoices pi
    where pi.id = proforma_id and public.can_view_order(pi.order_id)
  )
);

drop policy if exists reservations_admin on public.inventory_reservations;
create policy reservations_admin on public.inventory_reservations
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists payments_view on public.payments;
create policy payments_view on public.payments
for select using (public.is_platform_admin() or public.can_view_order(order_id));

drop policy if exists payment_proofs_view on public.payment_proofs;
create policy payment_proofs_view on public.payment_proofs
for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.payments p
    where p.id = payment_id and public.can_view_order(p.order_id)
  )
);

drop policy if exists payment_reviews_admin on public.payment_reviews;
create policy payment_reviews_admin on public.payment_reviews
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists payment_accounts_admin on public.payment_accounts;
create policy payment_accounts_admin on public.payment_accounts
for all using (public.is_platform_admin()) with check (public.is_super_admin());

drop policy if exists financials_view on public.order_financials;
create policy financials_view on public.order_financials
for select using (public.can_view_order(order_id));

drop policy if exists payouts_view on public.payouts;
create policy payouts_view on public.payouts
for select using (public.is_platform_admin() or public.is_org_member(seller_organization_id));

drop policy if exists payouts_admin on public.payouts;
create policy payouts_admin on public.payouts
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists tax_invoice_view on public.tax_invoices;
create policy tax_invoice_view on public.tax_invoices
for select using (public.can_view_order(order_id));

drop policy if exists tax_invoice_admin on public.tax_invoices;
create policy tax_invoice_admin on public.tax_invoices
for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Super Admin controls critical configuration.

drop policy if exists commission_admin on public.commission_policies;
create policy commission_admin on public.commission_policies
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tiers_admin on public.commission_tiers;
create policy tiers_admin on public.commission_tiers
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tax_admin on public.tax_rules;
create policy tax_admin on public.tax_rules
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists shipping_admin on public.shipping_rules;
create policy shipping_admin on public.shipping_rules
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists platform_admins_admin on public.platform_admins;
create policy platform_admins_admin on public.platform_admins
for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Help Center tickets and messages.

drop policy if exists tickets_view_own_or_admin on public.support_tickets;
create policy tickets_view_own_or_admin on public.support_tickets
for select using (
  public.is_platform_admin()
  or requester_user_id = auth.uid()
  or (requester_organization_id is not null and public.is_org_member(requester_organization_id))
);

drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets
for insert with check (requester_user_id = auth.uid() and not public.is_blocked_user());

drop policy if exists tickets_admin_update on public.support_tickets;
create policy tickets_admin_update on public.support_tickets
for update using (public.is_platform_admin()) with check (public.is_platform_admin());

drop policy if exists messages_ticket_access on public.support_messages;
create policy messages_ticket_access on public.support_messages
for select using (
  exists (
    select 1 from public.support_tickets st
    where st.id = ticket_id
      and (
        public.is_platform_admin()
        or st.requester_user_id = auth.uid()
        or (st.requester_organization_id is not null and public.is_org_member(st.requester_organization_id))
      )
  )
);

drop policy if exists messages_insert_access on public.support_messages;
create policy messages_insert_access on public.support_messages
for insert with check (
  author_user_id = auth.uid()
  and exists (
    select 1 from public.support_tickets st
    where st.id = ticket_id
      and (
        public.is_platform_admin()
        or st.requester_user_id = auth.uid()
        or (st.requester_organization_id is not null and public.is_org_member(st.requester_organization_id))
      )
  )
);

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
for select using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own on public.notification_preferences
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
for select using (public.is_platform_admin());

-- Grants. RLS remains the authorization boundary.

grant select on public.regions, public.origins, public.origin_translations,
  public.coffee_types, public.coffee_varieties, public.processing_methods,
  public.packaging_types, public.coffees, public.coffee_translations,
  public.coffee_lots, public.warehouses, public.coffee_offers,
  public.coffee_media, public.coffee_certifications, public.tags,
  public.coffee_tags, public.offer_sensory_notes, public.offer_tags
to anon, authenticated;

grant select, insert, update on all tables in schema public to authenticated;

revoke all on function public.checkout_order(uuid) from public;
revoke all on function public.submit_payment_proof(uuid, uuid, text) from public;
revoke all on function public.admin_review_payment(uuid, boolean, text) from public;
revoke all on function public.expire_order_hold(uuid) from public;
revoke all on function public.create_support_ticket(text, text, uuid, uuid) from public;

grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.is_super_admin() to anon, authenticated;
grant execute on function public.is_blocked_user() to anon, authenticated;
grant execute on function public.is_org_member(uuid) to anon, authenticated;
grant execute on function public.can_view_order(uuid) to anon, authenticated;
grant execute on function public.checkout_order(uuid) to authenticated;
grant execute on function public.submit_payment_proof(uuid, uuid, text) to authenticated;
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;
grant execute on function public.expire_order_hold(uuid) to service_role;
grant execute on function public.create_support_ticket(text, text, uuid, uuid) to authenticated;

commit;

-- Operational notes:
-- 1. Schedule expire_order_hold(order_id) from an Edge Function/worker or
--    pg_cron for orders whose hold_expires_at has passed.
-- 2. Seed one HILLS_INTERNAL organization and its warehouse before creating
--    Hills lots/listings.
-- 3. Create active commission policies/tiers before enabling checkout.
-- 4. Run this baseline in staging first, then inspect pg_policies and test
--    as anon, authenticated, admin and super-admin.

-- ============================================================================
-- Feature 003 RUN DB — KYB database + private Storage foundation
-- Applied and live-verified 2026-09-10 (T010g). Source migration:
-- supabase/migrations/20260911010000_feature_003_kyb_foundation.sql
-- Reconciled into this canonical snapshot per the Constitution's
-- database-change process. Do not hand-edit below this line; regenerate from
-- the migration file if it changes again.
-- ============================================================================

-- Feature 003 — RUN DB — KYB database + private Storage foundation (T010b-T010f).
--
-- ============================================================================
-- WHY
-- ============================================================================
--
-- DB-BLOCK-03: ordinary verified users cannot create an organization or attach themselves to one —
-- `organizations`/`organization_members` writes are platform-admin-only. DB-BLOCK-01: zero Supabase
-- Storage buckets/object policies exist, so KYB document bytes have nowhere to live. This migration
-- closes both gaps additively: one narrowly scoped controlled-onboarding capability, one private
-- Storage bucket with organization/application-scoped object policies, constrained KYB state-machine
-- mutations, and a minimum document-level review/version model. See
-- `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` for the full contract this file
-- implements.
--
-- REVISION (this file): a migration security review found several integrity/authorization gaps in
-- the first draft. This revision closes them — see the contract doc's "Revision" section for the
-- full list; each fix is also called out inline at its exact location below.
--
-- ============================================================================
-- WHAT THIS DOES NOT DO
-- ============================================================================
--
-- Does NOT modify, replace, or redefine `organization_can_buy`, `organization_can_sell`, or
-- `is_authorized_member` — their live audited bodies are untouched. Does NOT transition any
-- organization to ACTIVE or any KYB application to APPROVED — those remain exclusively reachable
-- through the existing, unchanged Compliance/Admin RLS. Does NOT edit any historical migration file.
-- Does NOT enable Realtime on anything. Is NOT applied to production by this migration file's mere
-- existence — DB-BLOCK-01/03 remain OPEN until a human reviews and applies this file and live
-- behaviour is verified (T010g).
--
-- ============================================================================
-- SECTION 1 — CONTROLLED ORGANIZATION ONBOARDING (closes DB-BLOCK-03)
-- ============================================================================

create or replace function public.start_organization_onboarding(
  p_legal_name text,
  p_display_name text,
  p_account_type text,
  p_country_code text default null,
  p_tax_number text default null,
  p_registration_number text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_can_buy boolean;
  v_can_sell boolean;
  v_new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  ) then
    raise exception 'email_not_verified';
  end if;

  if p_account_type not in ('BUYER', 'SELLER') then
    raise exception 'invalid_account_type';
  end if;

  if p_legal_name is null or length(trim(p_legal_name)) = 0 then
    raise exception 'legal_name_required';
  end if;

  if p_country_code is not null and length(p_country_code) <> 2 then
    raise exception 'invalid_country_code';
  end if;

  -- Serialize concurrent calls from the SAME caller so a double-submit cannot race past the
  -- existing-membership check below and create two organizations for one user.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  -- REVIEW FIX #7 (multi-org onboarding): an earlier draft ranked the caller's memberships and
  -- returned the top one, implicitly picking "the first" organization for a multi-org user — exactly
  -- the acting-organization anti-pattern T002's resolver exists to prevent. This function now only
  -- ever asks EXISTS: it never names, ranks, or picks any specific organization. A caller who already
  -- has ANY active membership is refused onboarding outright; which organization(s) are relevant is
  -- entirely the existing acting-organization resolver's job (`lib/auth/dal.ts`), never this RPC's.
  if exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'conflict', 'already_member');
  end if;

  -- Server-owned capability derivation. BUYER = buy-only; SELLER = buy AND sell (never sell-only).
  -- Neither flag alone grants trading — organization_can_buy/sell also require ACTIVE + APPROVED KYB.
  if p_account_type = 'SELLER' then
    v_can_buy := true;
    v_can_sell := true;
  else
    v_can_buy := true;
    v_can_sell := false;
  end if;

  begin
    insert into public.organizations (
      legal_name, display_name, account_type, country_code, tax_number, registration_number,
      email, phone, status, is_hills_internal, created_by, can_buy, can_sell
    )
    values (
      trim(p_legal_name), p_display_name, p_account_type, p_country_code, p_tax_number,
      p_registration_number, p_email, p_phone, 'PENDING_KYB', false, auth.uid(), v_can_buy, v_can_sell
    )
    returning id into v_new_org_id;
  exception
    when unique_violation then
      raise exception 'tax_number_already_registered';
  end;

  insert into public.organization_members (organization_id, user_id, member_role, is_active)
  values (v_new_org_id, auth.uid(), 'OWNER', true);

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_new_org_id,
    'organization_status', 'PENDING_KYB'
  );
end;
$$;

revoke all on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) from public;
grant execute on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- SECTION 2 — CONSTRAINED KYB STATE-MACHINE MUTATIONS
-- ============================================================================

-- REVIEW FIX #6 (create_kyb_draft concurrency): the authoritative duplicate-open-application
-- guarantee is a PRE-EXISTING partial unique index on `kyb_applications(organization_id)`, scoped to
-- the four "open" statuses (DRAFT/SUBMITTED/UNDER_REVIEW/RESUBMISSION_REQUIRED) — confirmed present
-- in the current checked-in baseline, `supabase/trading_schema.sql` (search there for
-- "one open kyb application" to find its exact `create unique index` statement). This migration does
-- not (and must not) recreate that index — it already exists. What this function adds
-- on top is (a) an advisory lock so concurrent callers for the SAME organization usually never even
-- reach the index, and (b) a graceful catch of the `unique_violation` the index still guarantees if
-- two transactions somehow race past the lock (e.g. a lock-acquisition-order edge case) — instead of
-- surfacing a raw constraint error, the loser simply re-reads and returns the winner's row. The
-- index is the correctness guarantee; the lock and exception handler are UX, not the security
-- boundary.
create or replace function public.create_kyb_draft(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_application_id uuid;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  select id into v_application_id
  from public.kyb_applications
  where organization_id = p_organization_id
    and status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED')
  order by created_at desc
  limit 1;

  if v_application_id is not null then
    return v_application_id;
  end if;

  begin
    insert into public.kyb_applications (organization_id, submitted_by, status)
    values (p_organization_id, auth.uid(), 'DRAFT')
    returning id into v_application_id;
  exception
    when unique_violation then
      select id into v_application_id
      from public.kyb_applications
      where organization_id = p_organization_id
        and status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED')
      order by created_at desc
      limit 1;
  end;

  return v_application_id;
end;
$$;

revoke all on function public.create_kyb_draft(uuid) from public;
grant execute on function public.create_kyb_draft(uuid) to authenticated, service_role;

-- Shared transition guard used by submit/resubmit below. Not exposed to callers directly.
create or replace function public.transition_kyb_application(
  p_application_id uuid,
  p_allowed_source_states text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
  v_status text;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id, status into v_organization_id, v_status
  from public.kyb_applications
  where id = p_application_id
  for update;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if not (v_status = any (p_allowed_source_states)) then
    raise exception 'invalid_transition';
  end if;

  update public.kyb_applications
  set status = 'SUBMITTED',
      submitted_by = auth.uid(),
      submitted_at = now()
  where id = p_application_id;
end;
$$;

revoke all on function public.transition_kyb_application(uuid, text[]) from public;
-- Internal helper only — no EXECUTE grant to authenticated/anon. Callable solely by the two
-- SECURITY DEFINER wrappers below, which run as the same trusted function owner.

create or replace function public.submit_kyb_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.transition_kyb_application(p_application_id, array['DRAFT']);
end;
$$;

revoke all on function public.submit_kyb_application(uuid) from public;
grant execute on function public.submit_kyb_application(uuid) to authenticated, service_role;

-- REVIEW FIX #5 (safe resubmission): a resubmit must not silently return an application to review
-- while a current, non-superseded document is still REJECTED — that would resubmit evidence the
-- member never actually corrected. This is a state-transition safety check only (are there any
-- unresolved REJECTED documents right now?), not an invented Phase-4 completeness rule: it reads
-- only `kyb_documents.status`, a column this same migration adds, never a not-yet-existing
-- application-content field.
create or replace function public.resubmit_kyb_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id into v_organization_id
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1 from public.kyb_documents
    where application_id = p_application_id
      and status = 'REJECTED'
  ) then
    raise exception 'unresolved_rejected_document';
  end if;

  perform public.transition_kyb_application(p_application_id, array['RESUBMISSION_REQUIRED']);
end;
$$;

revoke all on function public.resubmit_kyb_application(uuid) from public;
grant execute on function public.resubmit_kyb_application(uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 3 — DOCUMENT-LEVEL REVIEW + VERSION MODEL (schema additions, T010f)
-- ============================================================================

alter table public.kyb_documents add column if not exists version integer not null default 1;
alter table public.kyb_documents add column if not exists supersedes_document_id uuid references public.kyb_documents(id);
alter table public.kyb_documents add column if not exists status text not null default 'PENDING'
  check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'));

-- REVIEW FIX #2 (replacement branching): at most ONE document may ever supersede a given prior
-- document — this is what makes "the" lineage of a document a straight line rather than a tree.
create unique index if not exists uq_kyb_documents_supersedes_document_id
  on public.kyb_documents (supersedes_document_id)
  where supersedes_document_id is not null;

create table if not exists public.kyb_review_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.kyb_applications(id) on delete cascade,
  document_id uuid not null references public.kyb_documents(id) on delete cascade,
  decision text not null check (decision in ('ACCEPTED', 'REJECTED')),
  reason text,
  reviewer_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ix_kyb_review_items_application on public.kyb_review_items (application_id);
create index if not exists ix_kyb_review_items_document on public.kyb_review_items (document_id);

-- REVIEW FIX #2 (document version/replacement integrity): now also enforces that a replacement
-- shares the SAME document_type as the document it supersedes (a passport scan may only ever be
-- superseded by another passport scan, never re-typed into a different evidence category).
create or replace function public.validate_kyb_document_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_prev_application_id uuid;
  v_prev_version integer;
  v_prev_status text;
  v_prev_document_type text;
begin
  if new.supersedes_document_id is not null then
    if new.supersedes_document_id = new.id then
      raise exception 'self_replacement_not_allowed';
    end if;

    select application_id, version, status, document_type
    into v_prev_application_id, v_prev_version, v_prev_status, v_prev_document_type
    from public.kyb_documents
    where id = new.supersedes_document_id;

    if v_prev_application_id is null then
      raise exception 'superseded_document_not_found';
    end if;

    if v_prev_application_id <> new.application_id then
      raise exception 'cross_application_document_replacement';
    end if;

    if v_prev_document_type <> new.document_type then
      raise exception 'cross_document_type_replacement';
    end if;

    if new.version <> v_prev_version + 1 then
      raise exception 'invalid_document_version';
    end if;

    if v_prev_status <> 'SUPERSEDED' then
      update public.kyb_documents
      set status = 'SUPERSEDED'
      where id = new.supersedes_document_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_kyb_document_lineage on public.kyb_documents;
create trigger trg_validate_kyb_document_lineage
  before insert on public.kyb_documents
  for each row execute function public.validate_kyb_document_lineage();

-- REVIEW FIX #2 (no direct-write bypass): there is deliberately NO "before update" counterpart to
-- the lineage trigger above, because after this revision there is no RLS-granted direct UPDATE path
-- to `kyb_documents` for anyone at all (see the dropped `kyb_documents_admin_write` policy below) —
-- every write is either this trigger's own INSERT-time validation, or the status-only UPDATE
-- performed by `apply_kyb_review_item_decision()`, which runs as this migration's own SECURITY
-- DEFINER trigger function and touches only the `status` column. Removing the direct-write policy
-- is the chosen fix over adding a second trigger: less code, and it also closes finding #3 (no
-- destructive admin ALL policy) in the same stroke.

create or replace function public.validate_review_item_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not exists (
    select 1 from public.kyb_documents kd
    where kd.id = new.document_id
      and kd.application_id = new.application_id
  ) then
    raise exception 'review_item_document_application_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_review_item_document on public.kyb_review_items;
create trigger trg_validate_review_item_document
  before insert on public.kyb_review_items
  for each row execute function public.validate_review_item_document();

create or replace function public.apply_kyb_review_item_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  update public.kyb_documents
  set status = new.decision
  where id = new.document_id
    and status <> 'SUPERSEDED';

  return new;
end;
$$;

drop trigger if exists trg_apply_kyb_review_item_decision on public.kyb_review_items;
create trigger trg_apply_kyb_review_item_decision
  after insert on public.kyb_review_items
  for each row execute function public.apply_kyb_review_item_decision();

-- REVIEW FIX #1 (immutable/trusted document reviews): `kyb_review_items` is an append-only ledger,
-- the same shape as this schema's existing `inventory_ownership_events` (guarded by the existing
-- `prevent_ownership_event_mutation()` trigger). No runtime caller — not even a Compliance
-- operator — may UPDATE or DELETE a historical review event.
create or replace function public.prevent_kyb_review_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  raise exception 'kyb_review_items_is_append_only';
end;
$$;

drop trigger if exists trg_prevent_kyb_review_item_mutation on public.kyb_review_items;
create trigger trg_prevent_kyb_review_item_mutation
  before update or delete on public.kyb_review_items
  for each row execute function public.prevent_kyb_review_item_mutation();

-- Extend the existing append-only audit mechanism to the two places this run adds meaningful
-- mutable/reviewable state. No new audit mechanism is invented.
drop trigger if exists trg_audit_kyb_documents on public.kyb_documents;
create trigger trg_audit_kyb_documents
  after insert or delete or update on public.kyb_documents
  for each row execute function public.write_audit_log();

drop trigger if exists trg_audit_kyb_review_items on public.kyb_review_items;
create trigger trg_audit_kyb_review_items
  after insert or delete or update on public.kyb_review_items
  for each row execute function public.write_audit_log();

alter table public.kyb_review_items enable row level security;

-- REVIEW FIX #1: the base table's policy is now SELECT-only (read-only) for Compliance/Admin — it
-- is no longer `FOR ALL`. There is no RLS-granted INSERT path at all; every review event is created
-- exclusively through `create_kyb_review(...)` below, which derives `reviewer_user_id`/`created_at`
-- itself and never accepts them as caller input.
drop policy if exists kyb_review_items_compliance on public.kyb_review_items;
create policy kyb_review_items_compliance_select on public.kyb_review_items
  for select to authenticated
  using (public.is_compliance_operator() or public.is_platform_admin());

-- REVIEW FIX #1: the trusted review-creation RPC. Requires `is_compliance_operator()`; accepts only
-- application/document/decision/reason; requires a `reason` for REJECTED; verifies the document
-- belongs to the application (also enforced by the trigger above — checked here too for a clean
-- error instead of relying solely on the trigger's exception text); derives `reviewer_user_id` and
-- `created_at` itself. The AFTER INSERT trigger already in this file
-- (`apply_kyb_review_item_decision`) then updates the document's status through the same trusted
-- path used everywhere else in this migration.
create or replace function public.create_kyb_review(
  p_application_id uuid,
  p_document_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_review_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if not public.is_compliance_operator() then
    raise exception 'forbidden';
  end if;

  if p_decision not in ('ACCEPTED', 'REJECTED') then
    raise exception 'invalid_decision';
  end if;

  if p_decision = 'REJECTED' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'reason_required_for_rejection';
  end if;

  if not exists (
    select 1 from public.kyb_documents kd
    where kd.id = p_document_id
      and kd.application_id = p_application_id
  ) then
    raise exception 'review_item_document_application_mismatch';
  end if;

  insert into public.kyb_review_items (application_id, document_id, decision, reason, reviewer_user_id)
  values (p_application_id, p_document_id, p_decision, p_reason, auth.uid())
  returning id into v_review_id;

  return v_review_id;
end;
$$;

revoke all on function public.create_kyb_review(uuid, uuid, text, text) from public;
grant execute on function public.create_kyb_review(uuid, uuid, text, text) to authenticated, service_role;

-- REVIEW FIX #1/#2/#3 (no direct-write bypass, no destructive admin policy): `kyb_documents` keeps
-- ONLY the SELECT policy below. The old `kyb_documents_own_or_admin` (member ALL) and this
-- revision's own earlier `kyb_documents_admin_write` (compliance/admin ALL) are both gone — there is
-- no RLS-granted UPDATE/DELETE path to `kyb_documents` for anyone. Compliance/Admin read through
-- this same SELECT policy; their only write path is `create_kyb_review`, which touches
-- `kyb_review_items` (never `kyb_documents` directly) and lets the existing trigger apply the
-- resulting status change.
drop policy if exists kyb_documents_own_or_admin on public.kyb_documents;
drop policy if exists kyb_documents_admin_write on public.kyb_documents;

drop policy if exists kyb_documents_member_select on public.kyb_documents;
create policy kyb_documents_member_select on public.kyb_documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_compliance_operator()
    or exists (
      select 1 from public.kyb_applications ka
      where ka.id = kyb_documents.application_id
        and public.is_org_member(ka.organization_id)
    )
  );

-- Member-facing review read, with reviewer identity replaced by a fixed label (spec SEC-007).
create or replace function public.list_kyb_document_reviews(p_application_id uuid)
returns table (
  document_id uuid,
  decision text,
  reason text,
  reviewed_at timestamptz,
  reviewer_label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  return query
    select
      kri.document_id,
      kri.decision,
      kri.reason,
      kri.created_at as reviewed_at,
      'Hills Compliance'::text as reviewer_label
    from public.kyb_review_items kri
    where kri.application_id = p_application_id
    order by kri.created_at desc;
end;
$$;

revoke all on function public.list_kyb_document_reviews(uuid) from public;
grant execute on function public.list_kyb_document_reviews(uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 4 — STORAGE + METADATA WRITE SEAM (closes DB-BLOCK-01)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyb-evidence',
  'kyb-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- REVIEW FIX #8 (blocked admin/member storage behaviour): the blocked-user check now runs BEFORE
-- the admin/compliance short-circuit. Previously a blocked identity that also happened to hold a
-- `platform_admins` row would have bypassed the block entirely through the first branch; this
-- ordering makes `is_blocked_user()` an unconditional gate for every caller, matching the pattern
-- every other blocked-aware function in this schema already uses (`is_authorized_member`,
-- `update_my_profile`, `update_organization_contact`, `submit_payment_proof` all check
-- `is_blocked_user()` unconditionally, never after a role short-circuit).
create or replace function public.kyb_storage_object_authorized(
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
  v_org_id uuid;
  v_application_id uuid;
  v_app_status text;
  v_app_org_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.is_blocked_user() then
    return false;
  end if;

  if public.is_platform_admin() or public.is_compliance_operator() then
    return true;
  end if;

  v_parts := string_to_array(p_object_name, '/');

  if array_length(v_parts, 1) is null
     or array_length(v_parts, 1) < 4
     or v_parts[1] <> 'org'
     or v_parts[3] <> 'application' then
    return false;
  end if;

  begin
    v_org_id := v_parts[2]::uuid;
    v_application_id := v_parts[4]::uuid;
  exception
    when others then
      return false;
  end;

  select organization_id, status into v_app_org_id, v_app_status
  from public.kyb_applications
  where id = v_application_id;

  if v_app_org_id is null or v_app_org_id <> v_org_id then
    return false;
  end if;

  if not public.is_org_member(v_org_id) then
    return false;
  end if;

  if p_require_editable and v_app_status not in ('DRAFT', 'RESUBMISSION_REQUIRED') then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.kyb_storage_object_authorized(text, boolean) from public;
grant execute on function public.kyb_storage_object_authorized(text, boolean) to authenticated, service_role;

drop policy if exists kyb_evidence_member_select on storage.objects;
create policy kyb_evidence_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyb-evidence'
    and public.kyb_storage_object_authorized(name, false)
  );

drop policy if exists kyb_evidence_member_insert on storage.objects;
create policy kyb_evidence_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyb-evidence'
    and public.kyb_storage_object_authorized(name, true)
  );

-- REVIEW FIX #3 (no destructive evidence admin policy): the previous `kyb_evidence_admin_all`
-- (`FOR ALL`, including UPDATE/DELETE) is REMOVED, not merely narrowed. It is not replaced with an
-- admin-specific SELECT policy either, because `kyb_evidence_member_select` above already grants
-- Compliance/Admin read access to every object in this bucket regardless of path shape — the
-- `kyb_storage_object_authorized(..)` helper it calls returns `true` for
-- `is_platform_admin()`/`is_compliance_operator()` unconditionally (once past the blocked-user
-- check), before any path parsing. No object created only through `attach_kyb_document` (the sole
-- writer) can ever fall outside that read grant. There is now no RLS-granted UPDATE/DELETE path to
-- `kyb-evidence` objects for anyone, staff included: evidence is retained, never destructively
-- overwritten or removed, and any future approved retention/redaction deletion capability (KYB-02)
-- must be its own narrow, audited RPC — not a blanket policy.
drop policy if exists kyb_evidence_admin_all on storage.objects;

create or replace function public.attach_kyb_document(
  p_application_id uuid,
  p_document_type text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expires_at date default null,
  p_supersedes_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
  v_status text;
  v_expected_prefix text;
  v_new_version integer;
  v_prev_application_id uuid;
  v_prev_document_type text;
  v_file_asset_id uuid;
  v_document_id uuid;
  v_storage_mime text;
  v_storage_size bigint;
  v_allowed_mime constant text[] := array['application/pdf', 'image/jpeg', 'image/png'];
  v_max_bytes constant bigint := 10485760;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id, status into v_organization_id, v_status
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if v_status not in ('DRAFT', 'RESUBMISSION_REQUIRED') then
    raise exception 'invalid_transition';
  end if;

  if p_mime_type is null or not (p_mime_type = any (v_allowed_mime)) then
    raise exception 'invalid_mime_type';
  end if;

  if p_size_bytes is null or p_size_bytes > v_max_bytes or p_size_bytes <= 0 then
    raise exception 'object_too_large';
  end if;

  v_expected_prefix := 'org/' || v_organization_id::text || '/application/' || p_application_id::text || '/';
  if p_object_path is null or left(p_object_path, length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'cross_organization_object_path';
  end if;

  -- REVIEW FIX #4 (storage object -> metadata integrity): refuse to create canonical metadata for
  -- an object that was never actually uploaded. `bucket_id`/`name` are core, version-independent
  -- `storage.objects` columns — safe to rely on unconditionally.
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'kyb-evidence'
      and so.name = p_object_path
  ) then
    raise exception 'storage_object_not_found';
  end if;

  -- Best-effort cross-check against the Storage object's own recorded metadata. Supabase Storage
  -- populates `storage.objects.metadata` with keys including `mimetype`/`size` at upload time —
  -- documented, stable Storage behaviour — but this repository has never introspected a live
  -- `storage.objects` row (zero buckets existed at the last schema audit, so
  -- `database-schema-report.json` has no `objects` column rows to confirm the exact key names
  -- against). This check is therefore deliberately tolerant: it rejects only when Storage-recorded
  -- metadata IS PRESENT and DISAGREES with the caller's claim, never when metadata is absent or
  -- differently shaped than expected. CONFIRMING THE EXACT `metadata` KEY NAMES AGAINST A REAL
  -- UPLOADED OBJECT IS A REQUIRED T010g LIVE-VERIFICATION STEP, not assumed here.
  select (so.metadata ->> 'mimetype'), nullif(so.metadata ->> 'size', '')::bigint
  into v_storage_mime, v_storage_size
  from storage.objects so
  where so.bucket_id = 'kyb-evidence'
    and so.name = p_object_path;

  if v_storage_mime is not null and v_storage_mime <> p_mime_type then
    raise exception 'mime_type_mismatch';
  end if;

  if v_storage_size is not null and v_storage_size <> p_size_bytes then
    raise exception 'size_mismatch';
  end if;

  v_new_version := 1;
  if p_supersedes_document_id is not null then
    select application_id, version, document_type
    into v_prev_application_id, v_new_version, v_prev_document_type
    from public.kyb_documents
    where id = p_supersedes_document_id;

    if v_prev_application_id is null then
      raise exception 'superseded_document_not_found';
    end if;

    if v_prev_application_id <> p_application_id then
      raise exception 'cross_application_document_replacement';
    end if;

    if v_prev_document_type <> p_document_type then
      raise exception 'cross_document_type_replacement';
    end if;

    v_new_version := v_new_version + 1;
  end if;

  insert into public.file_assets (
    uploaded_by, organization_id, bucket_name, object_path, original_name, mime_type, size_bytes, is_private
  )
  values (
    auth.uid(), v_organization_id, 'kyb-evidence', p_object_path, p_original_name, p_mime_type, p_size_bytes, true
  )
  returning id into v_file_asset_id;

  insert into public.kyb_documents (
    application_id, document_type, file_asset_id, expires_at, version, supersedes_document_id, status
  )
  values (
    p_application_id, p_document_type, v_file_asset_id, p_expires_at, v_new_version, p_supersedes_document_id, 'PENDING'
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

revoke all on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) from public;
grant execute on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 5 — NO REALTIME
-- ============================================================================
-- Deliberately no publication-membership statement of any kind anywhere in this file. Realtime
-- remains a separate, future, security-reviewed enhancement (spec.md "Status refresh boundary").
