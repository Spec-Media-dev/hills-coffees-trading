-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M1 (T020) — commerce state vocabulary. Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925100000_feature_013_commerce_state_vocabulary.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_commerce_state_vocabulary_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human security review (T023), then OPERATOR apply (T024).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §1.1, §1.2, §2.1, §2.4, §4.1, §5.1, §5.2, §5.3, §5.7, §7.1;
-- plan.md §4 row M1). Structure only, plus two sanctioned backfills; NO behaviour change for any existing order:
--   1. Status vocabularies widened (legacy values all kept): orders + PROFORMA_ISSUED/CANCELLED/PAYMENT_REJECTED;
--      inventory_reservations + REVIEW_HOLD; payouts + ACCRUED; payment_reviews.decision + SENT_TO_RECONCILIATION.
--      payments.status is unchanged (its set already covers Feature 013). Proforma/notification sets are M2b/M7.
--   2. orders.commerce_flow ('LEGACY' | 'BANK_TRANSFER_V1'), NOT NULL, default 'LEGACY' → every existing and every new
--      row stays LEGACY until M4a switches the default. Plus cancelled_at/by, cancel_reason, has_manual_adjustment.
--   3. commerce_settings (singleton; bank_transfer_checkout_enabled = false) and commerce_request_log (idempotency).
--   4. Reservation, payment, proof, review and payout columns; the open-reservation index swap (ACTIVE → ACTIVE or
--      REVIEW_HOLD) plus the sweeper's expiry index; the confirmed-bank-reference and on-time-proof unique indexes.
--   5. payment_accounts.is_default_for_currency + its partial unique index (column + index ONLY: no policy, trigger or
--      grant change on this Feature 010 configuration table).
--   6. coffee_offers.offer_code (`LST-<7 digits>`) from offer_code_seq via next_offer_code(), backfilled for every
--      existing offer.
--   7. validate_order_transition() v2: the LEGACY graph is reproduced line for line for LEGACY rows; the §7.1 graph
--      applies to BANK_TRANSFER_V1 rows (reachable only after M4a). No assert_order_checkout_ready() on HOLD for v1 rows.
--
-- WHAT IT DOES NOT DO: no RLS policy change (M3), no RPC (M4a+), no commerce_flow default switch or insert guard
-- (M4a), no proforma/notification vocabulary (M2b/M7), no change to any Feature 008 object, no row rewritten except
-- the two backfills below.
--
-- BACKFILLS (both trigger-free):
--   - payment_proofs.submitted_at := created_at for existing rows, before NOT NULL (analysis L3). payment_proofs has no
--     triggers; production had 0 rows at preflight.
--   - coffee_offers.offer_code: added WITH a volatile default, so PostgreSQL rewrites the table and evaluates the default
--     once per existing row. An UPDATE backfill is deliberately NOT used: it would fire the offer audit, updated_at,
--     status-history, Feature 005 inventory-hold and validate_offer_transition triggers (which refuse writes to some
--     offer states). Codes are assigned in physical row order.
--
-- DRIFT GUARD BASELINE: Feature 013 T006 preflight (specs/013-bank-transfer-commerce-core/preflight-evidence/):
--   §5 body fingerprints md5(replace(prosrc, chr(13), '')) and §9 constraint/index definitions, reproduced below.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on any drift from the T006 baseline ------------------------------
do $guard$
declare
  v_problems text := '';
  v_count bigint;
  v_def text;
begin
  -- 0.1 Function bodies this migration replaces or depends on (T006 §5 fingerprints).
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '8cb857495ac7bd3333f0b81236ca2ee2' then
    v_problems := v_problems || 'validate_order_transition() differs from the T006 fingerprint; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.admin_review_payment(uuid,boolean,text)')), '')
     <> 'c0ef5f06b8ee47788825480cf56cfc03' then
    v_problems := v_problems || 'admin_review_payment(uuid,boolean,text) differs from the T006 fingerprint; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.checkout_order(uuid)')), '')
     <> '75e07c357ea33a980fd695a271d8e708' then
    v_problems := v_problems || 'checkout_order(uuid) differs from the T006 fingerprint; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.expire_order_hold(uuid)')), '')
     <> 'e5b8f4ee0c35948c6e582f2a9d3c0288' then
    v_problems := v_problems || 'expire_order_hold(uuid) differs from the T006 fingerprint; ';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = to_regprocedure('public.validate_order_transition()') and p.prosecdef) then
    v_problems := v_problems || 'validate_order_transition() is not SECURITY DEFINER; ';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = to_regclass('public.orders') and t.tgname = 'trg_order_transition' and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.validate_order_transition()')
  ) then
    v_problems := v_problems || 'trg_order_transition is not bound to validate_order_transition(); ';
  end if;
  if to_regprocedure('public.is_internal_transition()') is null or to_regprocedure('public.is_platform_admin()') is null
     or to_regprocedure('public.is_finance_operator()') is null or to_regprocedure('public.assert_order_checkout_ready(uuid)') is null then
    v_problems := v_problems || 'a required helper function is missing; ';
  end if;

  -- 0.2 Constraint and index definitions this migration replaces (T006 §9, exact pg_get_*def text).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.orders') and c.conname = 'orders_status_check';
  if v_def is distinct from $d$CHECK ((status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text, 'HOLD'::text, 'PAYMENT_PROOF_SUBMITTED'::text, 'PAYMENT_UNDER_REVIEW'::text, 'PAID'::text, 'FULFILLMENT_IN_PROGRESS'::text, 'PARTIALLY_DELIVERED'::text, 'COMPLETED'::text, 'EXPIRED'::text, 'VOID'::text, 'DISPUTED'::text])))$d$ then
    v_problems := v_problems || 'orders_status_check differs from T006; ';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.inventory_reservations') and c.conname = 'inventory_reservations_status_check';
  if v_def is distinct from $d$CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CONSUMED'::text, 'RELEASED'::text, 'EXPIRED'::text])))$d$ then
    v_problems := v_problems || 'inventory_reservations_status_check differs from T006; ';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.payouts') and c.conname = 'payouts_status_check';
  if v_def is distinct from $d$CHECK ((status = ANY (ARRAY['PENDING_PAYOUT'::text, 'PROCESSING'::text, 'PAID'::text, 'VOID'::text])))$d$ then
    v_problems := v_problems || 'payouts_status_check differs from T006; ';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.payment_reviews') and c.conname = 'payment_reviews_decision_check';
  if v_def is distinct from $d$CHECK ((decision = ANY (ARRAY['CONFIRMED'::text, 'REJECTED'::text])))$d$ then
    v_problems := v_problems || 'payment_reviews_decision_check differs from T006; ';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.payments') and c.conname = 'payments_status_check';
  if v_def is distinct from $d$CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROOF_SUBMITTED'::text, 'UNDER_REVIEW'::text, 'CONFIRMED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'VOID'::text])))$d$ then
    v_problems := v_problems || 'payments_status_check differs from T006 (M1 relies on its set, unchanged); ';
  end if;
  select pg_get_indexdef(i.indexrelid) into v_def from pg_index i
  where i.indexrelid = to_regclass('public.uq_active_inventory_reservation_order');
  if v_def is distinct from $d$CREATE UNIQUE INDEX uq_active_inventory_reservation_order ON public.inventory_reservations USING btree (order_id) WHERE (status = 'ACTIVE'::text)$d$ then
    v_problems := v_problems || 'uq_active_inventory_reservation_order differs from T006; ';
  end if;

  -- 0.3 Unmappable rows. The payout PAID-fields CHECK added below must hold for every existing row.
  select count(*) into v_count from public.payouts
  where status = 'PAID' and (paid_by is null or paid_at is null or payment_reference is null);
  if v_count <> 0 then
    v_problems := v_problems || v_count || ' PAID payout(s) lack paid_by/paid_at/payment_reference; ';
  end if;

  -- 0.4 Nothing this migration creates may exist yet (no partial earlier apply).
  if exists (select 1 from information_schema.columns where table_schema = 'public' and (
       (table_name = 'orders' and column_name in ('commerce_flow', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'has_manual_adjustment'))
    or (table_name = 'inventory_reservations' and column_name in ('proforma_id', 'confirmed_by', 'review_hold_at', 'release_reason'))
    or (table_name = 'payments' and column_name in ('proforma_id', 'expected_amount', 'observed_amount', 'observed_currency', 'observed_value_date', 'observed_bank_reference', 'observed_bank_reference_normalized', 'rejected_by', 'rejected_at'))
    or (table_name = 'payment_proofs' and column_name in ('claimed_amount', 'claimed_currency', 'transfer_date', 'bank_reference', 'submitted_at', 'submission_kind', 'request_id', 'status'))
    or (table_name = 'payment_reviews' and column_name = 'request_id')
    or (table_name = 'payouts' and column_name in ('proforma_id', 'eligible_at', 'recorded_amount', 'recorded_currency', 'request_id'))
    or (table_name = 'payment_accounts' and column_name = 'is_default_for_currency')
    or (table_name = 'coffee_offers' and column_name = 'offer_code'))) then
    v_problems := v_problems || 'an M1 column already exists; ';
  end if;
  if to_regclass('public.commerce_settings') is not null or to_regclass('public.commerce_request_log') is not null
     or to_regclass('public.offer_code_seq') is not null or to_regprocedure('public.next_offer_code()') is not null
     or to_regclass('public.uq_open_inventory_reservation_order') is not null then
    v_problems := v_problems || 'an M1 table, sequence, function or index already exists; ';
  end if;
  if to_regclass('public.proforma_invoices') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a referenced table is missing; ';
  end if;

  -- 0.5 Feature 013 tables use FORCE ROW LEVEL SECURITY; the owning role (which later SECURITY DEFINER functions run
  --     as) must bypass RLS, or those functions would see no rows.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_commerce_state_vocabulary preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Status vocabularies (legacy values kept; same constraint names) ---------------------------------------------
alter table public.orders
  drop constraint orders_status_check,
  add constraint orders_status_check check (status in (
    'DRAFT', 'CONFIRMED', 'HOLD', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW', 'PAID', 'FULFILLMENT_IN_PROGRESS',
    'PARTIALLY_DELIVERED', 'COMPLETED', 'EXPIRED', 'VOID', 'DISPUTED', 'PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED'));

alter table public.inventory_reservations
  drop constraint inventory_reservations_status_check,
  add constraint inventory_reservations_status_check check (status in ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED', 'REVIEW_HOLD'));

alter table public.payouts
  drop constraint payouts_status_check,
  add constraint payouts_status_check check (status in ('PENDING_PAYOUT', 'PROCESSING', 'PAID', 'VOID', 'ACCRUED'));

alter table public.payment_reviews
  drop constraint payment_reviews_decision_check,
  add constraint payment_reviews_decision_check check (decision in ('CONFIRMED', 'REJECTED', 'SENT_TO_RECONCILIATION'));

-- 2. orders (data-model §2.1 — M1 columns only; destination/proforma pointers are M2) ------------------------------
alter table public.orders
  add column commerce_flow text not null default 'LEGACY'
    constraint orders_commerce_flow_check check (commerce_flow in ('LEGACY', 'BANK_TRANSFER_V1')),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles(id),
  add column cancel_reason text
    constraint orders_cancel_reason_check check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 500),
  add column has_manual_adjustment boolean not null default false;

comment on column public.orders.commerce_flow is
  'Feature 013: LEGACY = pre-013 checkout graph (kept until terminal); BANK_TRANSFER_V1 = data-model §7.1. Default stays LEGACY until M4a. Changed only LEGACY→BANK_TRANSFER_V1 on a DRAFT by an internal transition (admin_convert_legacy_draft, M4a).';
comment on column public.orders.has_manual_adjustment is
  'Feature 013 R-24: set by record_manual_adjustment(); never client-writable.';

-- 3. commerce_settings (data-model §1.1) and commerce_request_log (§2.4) ---------------------------------------
create table public.commerce_settings (
  id boolean primary key default true constraint commerce_settings_singleton check (id),
  proforma_validity_hours integer not null default 24
    constraint commerce_settings_validity_hours_check check (proforma_validity_hours between 1 and 720),
  bank_transfer_checkout_enabled boolean not null default false,
  proof_submission_enabled boolean not null default true,
  pilot_organization_ids uuid[] not null default '{}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
comment on table public.commerce_settings is
  'Feature 013 singleton. bank_transfer_checkout_enabled is the checkout kill switch (R-27; flipped only at T235). Written only by update_commerce_settings() (M4a). The 20-minute reservation is a locked product rule, not a setting.';

alter table public.commerce_settings enable row level security;
alter table public.commerce_settings force row level security;
revoke all on table public.commerce_settings from public, anon, authenticated;
grant select on table public.commerce_settings to authenticated;
create policy commerce_settings_staff_read on public.commerce_settings
  for select to authenticated
  using (public.is_platform_admin() or public.is_finance_operator());
create trigger trg_commerce_settings_updated_at before update on public.commerce_settings
  for each row execute function public.set_updated_at();

insert into public.commerce_settings (id) values (true);

create table public.commerce_request_log (
  request_id uuid primary key,
  actor_user_id uuid not null,
  operation text not null constraint commerce_request_log_operation_check check (char_length(operation) between 1 and 80),
  target_id uuid,
  response jsonb not null,
  created_at timestamptz not null default now()
);
comment on table public.commerce_request_log is
  'Feature 013 R-25 idempotency log: one row per p_request_id, written only by SECURITY DEFINER RPCs; purged after 30 days. No client grants.';

alter table public.commerce_request_log enable row level security;
alter table public.commerce_request_log force row level security;
revoke all on table public.commerce_request_log from public, anon, authenticated;
create index idx_commerce_request_log_created_at on public.commerce_request_log (created_at);

-- 4. inventory_reservations (data-model §4.1) --------------------------------------------------------------------
alter table public.inventory_reservations
  add column proforma_id uuid references public.proforma_invoices(id),
  add column confirmed_by uuid references public.profiles(id),
  add column review_hold_at timestamptz,
  add column release_reason text
    constraint inventory_reservations_release_reason_check check (release_reason in ('EXPIRED', 'CANCELLED', 'REJECTED', 'ADMIN_VOID', 'EXCEPTION'));

-- One OPEN reservation per order: ACTIVE or REVIEW_HOLD. A superset of the old ACTIVE-only index; checkout_order()
-- inserts without ON CONFLICT, so it keeps its exact behaviour (no REVIEW_HOLD row exists before M5a).
drop index public.uq_active_inventory_reservation_order;
create unique index uq_open_inventory_reservation_order on public.inventory_reservations (order_id)
  where status in ('ACTIVE', 'REVIEW_HOLD');
create index idx_inventory_reservations_active_expiry on public.inventory_reservations (expires_at)
  where status = 'ACTIVE';

-- 5. payments (data-model §5.1; status set unchanged) ------------------------------------------------------------
alter table public.payments
  add column proforma_id uuid references public.proforma_invoices(id),
  add column expected_amount numeric(14,2)
    constraint payments_expected_amount_check check (expected_amount >= 0),
  add column observed_amount numeric(14,2)
    constraint payments_observed_amount_check check (observed_amount >= 0),
  add column observed_currency char(3)
    constraint payments_observed_currency_check check (observed_currency ~ '^[A-Z]{3}$'),
  add column observed_value_date date,
  add column observed_bank_reference text
    constraint payments_observed_bank_reference_check check (char_length(btrim(observed_bank_reference)) between 1 and 80),
  add column observed_bank_reference_normalized text
    constraint payments_observed_bank_reference_normalized_check check (char_length(observed_bank_reference_normalized) between 1 and 80),
  add column rejected_by uuid references public.profiles(id),
  add column rejected_at timestamptz;

-- Duplicate-transfer detection (R-11): one CONFIRMED payment per normalized bank reference.
create unique index uq_confirmed_bank_reference on public.payments (observed_bank_reference_normalized)
  where status = 'CONFIRMED';

-- 6. payment_proofs (data-model §5.2) ----------------------------------------------------------------------------
-- NULL submission_kind / status = a pre-Feature-013 (legacy) proof.
alter table public.payment_proofs
  add column claimed_amount numeric(14,2)
    constraint payment_proofs_claimed_amount_check check (claimed_amount >= 0),
  add column claimed_currency char(3)
    constraint payment_proofs_claimed_currency_check check (claimed_currency = 'USD'),
  add column transfer_date date,
  add column bank_reference text
    constraint payment_proofs_bank_reference_check check (char_length(btrim(bank_reference)) between 1 and 80),
  add column submitted_at timestamptz,
  add column submission_kind text
    constraint payment_proofs_submission_kind_check check (submission_kind in ('ON_TIME', 'LATE_REPORT')),
  add column request_id uuid constraint payment_proofs_request_id_key unique,
  add column status text
    constraint payment_proofs_status_check check (status in ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'IN_RECONCILIATION'));

update public.payment_proofs set submitted_at = created_at where submitted_at is null;

alter table public.payment_proofs
  alter column submitted_at set default clock_timestamp(),
  alter column submitted_at set not null;

-- Exactly one authoritative on-time submission per payment.
create unique index uq_payment_proof_on_time on public.payment_proofs (payment_id)
  where submission_kind = 'ON_TIME';

-- 7. payment_reviews (data-model §5.3) ---------------------------------------------------------------------------
alter table public.payment_reviews
  add column request_id uuid constraint payment_reviews_request_id_key unique;

-- 8. payouts (data-model §5.7) -----------------------------------------------------------------------------------
alter table public.payouts
  add column proforma_id uuid references public.proforma_invoices(id),
  add column eligible_at timestamptz,
  add column recorded_amount numeric(14,2)
    constraint payouts_recorded_amount_check check (recorded_amount >= 0),
  add column recorded_currency char(3)
    constraint payouts_recorded_currency_check check (recorded_currency = 'USD'),
  add column request_id uuid constraint payouts_request_id_key unique,
  add constraint payouts_paid_fields_check check (
    status <> 'PAID' or (paid_by is not null and paid_at is not null and payment_reference is not null));

-- 9. payment_accounts (data-model §1.2 — column + index only) ----------------------------------------------------
alter table public.payment_accounts
  add column is_default_for_currency boolean not null default false;
create unique index uq_payment_account_default_currency on public.payment_accounts (currency)
  where is_default_for_currency and is_active;

-- 10. coffee_offers.offer_code (FR-041, research §Marketplace) --------------------------------------------------
create sequence public.offer_code_seq;
revoke all on sequence public.offer_code_seq from public, anon, authenticated;

create or replace function public.next_offer_code()
returns text
language sql
volatile
security definer
set search_path = pg_catalog, public
as $function$
  select 'LST-' || lpad(nextval('public.offer_code_seq')::text, 7, '0');
$function$;
revoke all on function public.next_offer_code() from public, anon;
grant execute on function public.next_offer_code() to authenticated, service_role;

-- The volatile default fills every existing row during the rewrite (no UPDATE, no trigger); new offers get one too.
alter table public.coffee_offers
  add column offer_code text not null default public.next_offer_code()
    constraint coffee_offers_offer_code_check check (offer_code ~ '^LST-[0-9]{7,}$'),
  add constraint coffee_offers_offer_code_key unique (offer_code);

-- 11. validate_order_transition() v2 (data-model §7.1) -----------------------------------------------------------
-- LEGACY rows: the pre-013 body, line for line, plus one fence that keeps the three new values out of the legacy
-- graph. BANK_TRANSFER_V1 rows: the §7.1 graph, internal transitions only (the one exception is the unchanged
-- platform-admin path into DISPUTED). The fields M1 adds are never client-writable.
create or replace function public.validate_order_transition()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.commerce_flow is distinct from old.commerce_flow then
    if not (public.is_internal_transition() and old.commerce_flow = 'LEGACY' and new.commerce_flow = 'BANK_TRANSFER_V1'
            and old.status = 'DRAFT' and new.status = 'DRAFT') then
      raise exception 'order_commerce_flow_immutable';
    end if;
  end if;

  if (new.cancelled_at, new.cancelled_by, new.cancel_reason, new.has_manual_adjustment)
       is distinct from (old.cancelled_at, old.cancelled_by, old.cancel_reason, old.has_manual_adjustment)
     and not public.is_internal_transition() then
    raise exception 'order_field_not_client_writable';
  end if;

  if new.commerce_flow = 'LEGACY' then
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
      -- Feature 013 fence: the values M1 adds belong to the BANK_TRANSFER_V1 graph only.
      if new.status in ('PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED') then raise exception 'invalid_order_transition'; end if;
    end if;

    if new.status = 'HOLD' then
      perform public.assert_order_checkout_ready(new.id);
      new.hold_started_at := coalesce(new.hold_started_at, now());
      new.hold_expires_at := coalesce(new.hold_expires_at, now() + interval '20 minutes');
    end if;
  else
    if new.status <> old.status then
      if not public.is_internal_transition()
         and not (new.status = 'DISPUTED' and public.is_platform_admin()) then
        raise exception 'order_status_can_only_change_through_workflow';
      end if;

      if old.status = 'DRAFT' and new.status not in ('PROFORMA_ISSUED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PROFORMA_ISSUED' and new.status not in ('HOLD', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'HOLD' and new.status not in ('PAYMENT_UNDER_REVIEW', 'EXPIRED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'PAYMENT_REJECTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PARTIALLY_DELIVERED' and new.status not in ('COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      -- data-model §7.1 defines no exit from DISPUTED for v1 rows: fail closed until one is specified.
      if old.status = 'DISPUTED' then raise exception 'invalid_order_transition'; end if;
      if old.status in ('CONFIRMED', 'PAYMENT_PROOF_SUBMITTED') then raise exception 'invalid_order_transition'; end if;
      if old.status in ('COMPLETED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REJECTED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;

      -- The hold window is the reservation's own (confirm_proforma copies expires_at); never defaulted here.
      if new.status = 'HOLD' then
        if new.hold_expires_at is null then raise exception 'order_hold_window_required'; end if;
        new.hold_started_at := coalesce(new.hold_started_at, clock_timestamp());
      end if;
      if new.status = 'CANCELLED' then new.cancelled_at := coalesce(new.cancelled_at, clock_timestamp()); end if;
    end if;
  end if;

  if new.status = 'PAID' and new.paid_at is null then new.paid_at := now(); end if;
  if new.status = 'COMPLETED' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end;
$$;
revoke all on function public.validate_order_transition() from public, anon;
grant execute on function public.validate_order_transition() to authenticated, service_role;

commit;
