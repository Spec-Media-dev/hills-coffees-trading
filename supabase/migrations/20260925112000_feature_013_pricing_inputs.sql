-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M2d (T044) — pricing inputs: offer quantity price tiers and the promotion data model.
-- Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925112000_feature_013_pricing_inputs.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_pricing_inputs_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human review (T047), then OPERATOR apply (T048).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §3.8; research R-17, R-18; contracts/rls-storage.md §1):
--   1. public.offer_price_tiers — quantity price tiers per listing (UNIQUE(offer_id, min_quantity_kg), threshold > 0,
--      price ≥ 0, USD). Read by authorized members for published/visible listings (the coffee_offers
--      member_read_published_offers predicate), by the listing's own seller organization and by platform admins.
--      NEVER by anon (RLS-001/002, AC-014).
--   2. public.promotions — PLATFORM (Hills-funded) and SELLER (seller-funded) promotions: PERCENT | AMOUNT_PER_KG, value > 0,
--      PERCENT ≤ 100, starts_at < ends_at, scope ↔ seller, funding_source GENERATED from scope (FIN-011), optional
--      `[A-Z0-9-]{1,40}` code unique (case-insensitive) among non-archived rows, `PRM-<7>` references. Eligibility is derived,
--      never cron-driven. Read: authorized members see eligible (SCHEDULED/ACTIVE, in-window) PLATFORM promotions; a seller
--      organization sees its own SELLER promotions; platform admins see all. The `code` column is NOT granted to any client
--      role: code values stay hidden (read only through the M8 RPCs for the creating scope and platform admins). Audited by
--      a redacted allow-list trigger that never copies the code.
--   3. public.promotion_targets — OFFER | COFFEE | ALL_SELLER_OFFERS | ALL_OFFERS, readable exactly when the promotion is.
--
-- WHAT IT DOES NOT DO (tables only, per tasks.md T044): no RPC and no client write grant (upsert_*_promotion,
-- tier writes and validate_promotion_scope — the cross-table "own offers only / ALL_OFFERS platform-only / AMOUNT_PER_KG below
-- the lowest price" rules — arrive in M8); no change to coffee_offers, any existing table, policy or function; no MFA gate
-- (M3 adds the restrictive MFA gates on every commerce table); no data. bank_transfer_checkout_enabled stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------------
do $guard$
declare
  v_problems text := '';
begin
  -- 0.1 M1–M2c applied and unchanged (fingerprints of the functions later Feature 013 objects rely on).
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.prevent_snapshot_mutation()')), '')
     <> '286e02091213c1be4236b144dff1f383' then
    v_problems := v_problems || 'prevent_snapshot_mutation() differs from the M2b body; ';
  end if;
  if to_regclass('public.delivery_destinations') is null or to_regclass('public.proforma_line_economics') is null
     or to_regclass('public.reconciliation_cases') is null or to_regclass('public.manual_financial_adjustments') is null then
    v_problems := v_problems || 'M2a/M2b/M2c are not all applied; ';
  end if;

  -- 0.2 The tier read policy mirrors coffee_offers.member_read_published_offers: that policy must be exactly as recorded.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'coffee_offers' and policyname = 'member_read_published_offers'
                 and cmd = 'SELECT' and roles = '{authenticated}'
                 and qual = '(is_authorized_member() AND (status = ANY (ARRAY[''PUBLISHED''::text, ''PARTIALLY_FILLED''::text])) AND (is_visible = true) AND (deleted_at IS NULL) AND (((quantity_kg - filled_quantity_kg) - reserved_quantity_kg) > (0)::numeric))') then
    v_problems := v_problems || 'coffee_offers.member_read_published_offers differs from the recorded predicate (re-author the tier policy); ';
  end if;

  -- 0.3 Nothing this migration creates may exist yet.
  if to_regclass('public.offer_price_tiers') is not null or to_regclass('public.promotions') is not null
     or to_regclass('public.promotion_targets') is not null or to_regclass('public.promotion_code_ref_seq') is not null
     or to_regprocedure('public.next_promotion_code_ref()') is not null or to_regprocedure('public.write_audit_log_promotions()') is not null then
    v_problems := v_problems || 'an M2d object already exists; ';
  end if;

  -- 0.4 Required helpers and referenced tables; checkout still disabled; the migration role bypasses RLS.
  if to_regprocedure('public.is_authorized_member()') is null or to_regprocedure('public.is_org_member(uuid)') is null
     or to_regprocedure('public.is_platform_admin()') is null or to_regprocedure('public.set_updated_at()') is null
     or to_regclass('public.coffee_offers') is null or to_regclass('public.coffees') is null
     or to_regclass('public.organizations') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a required helper function or table is missing; ';
  end if;
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_pricing_inputs preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. offer_price_tiers (data-model §3.8, research R-17) ----------------------------------------------------------------
create table public.offer_price_tiers (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.coffee_offers(id),
  min_quantity_kg numeric(14,3) not null
    constraint offer_price_tiers_min_quantity_check check (min_quantity_kg > 0),
  price_per_kg numeric(14,2) not null
    constraint offer_price_tiers_price_check check (price_per_kg >= 0),
  currency char(3) not null default 'USD'
    constraint offer_price_tiers_currency_check check (currency = 'USD'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint offer_price_tiers_offer_threshold_key unique (offer_id, min_quantity_kg)
);
comment on table public.offer_price_tiers is
  'Feature 013 (R-17): quantity price tiers of a listing. Selection = the highest min_quantity_kg ≤ line quantity, else coffee_offers.price_per_kg. Frozen on the proforma line, so edits affect only future proformas (FIN-001). Written only by the seller listing RPCs (M8). Never readable by anon.';

-- 2. promotions (data-model §3.8, research R-18; FIN-011/FIN-012) ------------------------------------------------------
create sequence public.promotion_code_ref_seq;
revoke all on sequence public.promotion_code_ref_seq from public, anon, authenticated;

create or replace function public.next_promotion_code_ref()
returns text
language sql
set search_path = pg_catalog, public
as $function$ select 'PRM-' || lpad(nextval('public.promotion_code_ref_seq')::text, 7, '0'); $function$;
revoke all on function public.next_promotion_code_ref() from public, anon, authenticated;
grant execute on function public.next_promotion_code_ref() to service_role;

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  promotion_code_ref text not null default public.next_promotion_code_ref()
    constraint promotions_promotion_code_ref_key unique
    constraint promotions_promotion_code_ref_check check (promotion_code_ref ~ '^PRM-[0-9]{7,}$'),
  scope text not null
    constraint promotions_scope_check check (scope in ('PLATFORM', 'SELLER')),
  seller_organization_id uuid references public.organizations(id),
  -- FIN-011: the funding can never be mislabelled — it is derived from the scope.
  funding_source text generated always as (case scope when 'PLATFORM' then 'HILLS' else 'SELLER' end) stored
    constraint promotions_funding_source_check check (funding_source in ('HILLS', 'SELLER')),
  code text
    constraint promotions_code_check check (code ~ '^[A-Z0-9-]{1,40}$'),
  discount_type text not null
    constraint promotions_discount_type_check check (discount_type in ('PERCENT', 'AMOUNT_PER_KG')),
  value numeric(14,4) not null
    constraint promotions_value_check check (value > 0),
  min_quantity_kg numeric(14,3)
    constraint promotions_min_quantity_check check (min_quantity_kg > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'DRAFT'
    constraint promotions_status_check check (status in ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED')),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_percent_check check (discount_type <> 'PERCENT' or value <= 100),
  constraint promotions_window_check check (starts_at < ends_at),
  constraint promotions_scope_seller_check check ((scope = 'SELLER') = (seller_organization_id is not null))
);
comment on table public.promotions is
  'Feature 013 (R-18): PLATFORM (Hills-funded) or SELLER (seller-funded) promotions. Eligible iff status IN (SCHEDULED, ACTIVE) AND starts_at <= clock_timestamp() < ends_at — derived, never cron-driven. The code column is never granted to a client role. Written only by the M8 RPCs; cross-table target rules by validate_promotion_scope (M8).';
comment on column public.promotions.code is
  'Optional explicit promotion code, upper-case [A-Z0-9-]{1,40}, unique case-insensitively among non-archived rows. HIDDEN: no client role holds SELECT on this column (read through M8 RPCs by the creating scope and platform admins only).';

-- One live code per value, case-insensitive (archived promotions may reuse a retired code).
create unique index uq_promotions_code_live on public.promotions (lower(code)) where code is not null and status <> 'ARCHIVED';
create index idx_promotions_eligibility on public.promotions (scope, status, starts_at, ends_at);
create index idx_promotions_seller on public.promotions (seller_organization_id) where seller_organization_id is not null;

create trigger trg_promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

-- 3. promotion_targets (data-model §3.8) -------------------------------------------------------------------------------
create table public.promotion_targets (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id),
  target_kind text not null
    constraint promotion_targets_kind_check check (target_kind in ('OFFER', 'COFFEE', 'ALL_SELLER_OFFERS', 'ALL_OFFERS')),
  offer_id uuid references public.coffee_offers(id),
  coffee_id uuid references public.coffees(id),
  constraint promotion_targets_reference_check check (
    (target_kind = 'OFFER') = (offer_id is not null)
    and (target_kind = 'COFFEE') = (coffee_id is not null)),
  constraint promotion_targets_unique_key unique nulls not distinct (promotion_id, target_kind, offer_id, coffee_id)
);
comment on table public.promotion_targets is
  'Feature 013 (R-18): what a promotion applies to. ALL_OFFERS is platform-only and a SELLER promotion may target only its own MEMBER_SELLER listings — enforced by validate_promotion_scope and the upsert RPCs (M8).';
create index idx_promotion_targets_offer on public.promotion_targets (offer_id) where offer_id is not null;
create index idx_promotion_targets_coffee on public.promotion_targets (coffee_id) where coffee_id is not null;

-- 4. Redacted promotion audit (data-model §3.8 "audited"; the code value never reaches audit_logs) --------------------
create or replace function public.write_audit_log_promotions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_correlation_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;
  -- Allow-list only: a column added later is not copied automatically; the code is represented by booleans only.
  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'id', old.id, 'promotion_code_ref', old.promotion_code_ref, 'scope', old.scope, 'seller_organization_id', old.seller_organization_id,
      'funding_source', old.funding_source, 'discount_type', old.discount_type, 'value', old.value, 'min_quantity_kg', old.min_quantity_kg,
      'starts_at', old.starts_at, 'ends_at', old.ends_at, 'status', old.status, 'created_by', old.created_by, 'updated_by', old.updated_by,
      'created_at', old.created_at, 'updated_at', old.updated_at, 'code_present', old.code is not null);
  end if;
  if tg_op <> 'DELETE' then
    v_new := jsonb_build_object(
      'id', new.id, 'promotion_code_ref', new.promotion_code_ref, 'scope', new.scope, 'seller_organization_id', new.seller_organization_id,
      'funding_source', new.funding_source, 'discount_type', new.discount_type, 'value', new.value, 'min_quantity_kg', new.min_quantity_kg,
      'starts_at', new.starts_at, 'ends_at', new.ends_at, 'status', new.status, 'created_by', new.created_by, 'updated_by', new.updated_by,
      'created_at', new.created_at, 'updated_at', new.updated_at, 'code_present', new.code is not null);
    if tg_op = 'UPDATE' then
      v_new := v_new || jsonb_build_object('code_changed', new.code is distinct from old.code);
    end if;
  end if;
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), tg_table_name, case when tg_op = 'DELETE' then old.id else new.id end, tg_op, v_old, v_new,
          jsonb_build_object('redacted_fields', jsonb_build_array('code'), 'redaction', 'allow_list'),
          coalesce(v_correlation_id, gen_random_uuid()));
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
revoke all on function public.write_audit_log_promotions() from public, anon, authenticated;
grant execute on function public.write_audit_log_promotions() to service_role;

create trigger trg_audit_promotions after insert or update or delete on public.promotions
  for each row execute function public.write_audit_log_promotions();

-- 5. RLS and grants (contracts/rls-storage.md §1). No client write grant: writes arrive through the M8 RPCs. -------------
alter table public.offer_price_tiers enable row level security;
alter table public.offer_price_tiers force row level security;
revoke all on table public.offer_price_tiers from public, anon, authenticated, service_role;
grant select on table public.offer_price_tiers to authenticated;
grant select on table public.offer_price_tiers to service_role;
-- Authorized members for published/visible listings (= coffee_offers.member_read_published_offers) ∨ the listing's own
-- seller organization ∨ platform admin. Never anon (no grant, and the policy is TO authenticated only).
create policy offer_price_tiers_read on public.offer_price_tiers
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.coffee_offers o
      where o.id = offer_price_tiers.offer_id
        and (public.is_org_member(o.seller_organization_id)
             or (public.is_authorized_member()
                 and o.status in ('PUBLISHED', 'PARTIALLY_FILLED')
                 and o.is_visible = true
                 and o.deleted_at is null
                 and o.quantity_kg - o.filled_quantity_kg - o.reserved_quantity_kg > 0))));

alter table public.promotions enable row level security;
alter table public.promotions force row level security;
revoke all on table public.promotions from public, anon, authenticated, service_role;
-- Every column EXCEPT `code`: code values stay hidden from every client role (rls-storage §1).
grant select (id, promotion_code_ref, scope, seller_organization_id, funding_source, discount_type, value, min_quantity_kg,
              starts_at, ends_at, status, created_by, updated_by, created_at, updated_at)
  on table public.promotions to authenticated;
grant select on table public.promotions to service_role;
-- Authorized members see eligible platform promotions; a seller organization sees its own; platform admins see all.
create policy promotions_read on public.promotions
  for select to authenticated
  using (
    public.is_platform_admin()
    or (scope = 'SELLER' and public.is_org_member(seller_organization_id))
    or (scope = 'PLATFORM' and public.is_authorized_member()
        and status in ('SCHEDULED', 'ACTIVE') and starts_at <= now() and now() < ends_at));

alter table public.promotion_targets enable row level security;
alter table public.promotion_targets force row level security;
revoke all on table public.promotion_targets from public, anon, authenticated, service_role;
grant select on table public.promotion_targets to authenticated;
grant select on table public.promotion_targets to service_role;
-- A target is readable exactly when its promotion is (the subquery runs under the promotions policy).
create policy promotion_targets_read on public.promotion_targets
  for select to authenticated
  using (exists (select 1 from public.promotions p where p.id = promotion_targets.promotion_id));

commit;
