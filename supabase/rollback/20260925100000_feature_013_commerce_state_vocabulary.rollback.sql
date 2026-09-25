-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql (Feature 013 M1).
-- Restores the exact T006 baseline:
--   - validate_order_transition(): byte-for-byte pre-M1 body (md5(replace(prosrc, chr(13), '')) =
--     8cb857495ac7bd3333f0b81236ca2ee2, T006 §5), same SECURITY DEFINER / search_path / EXECUTE list;
--   - orders / inventory_reservations / payouts / payment_reviews CHECK constraints and
--     uq_active_inventory_reservation_order with their exact T006 §9 definitions;
--   - drops every column, index, table, sequence and function M1 added.
-- Safe ONLY before real Feature 013 rows exist: the guard refuses (changing nothing) if any row uses an M1 value or
-- column, or if a later Feature 013 migration is still applied (roll those back first, newest first).
-- Data lost by design: the offer_code values (no reader exists before M8) and the commerce_settings singleton.
-- After running it: `supabase migration repair --status reverted 20260925100000` (OPERATOR), then the M1 postflight
-- is expected to FAIL and the T006 preflight §5/§9 checks to match again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.commerce_settings') is null then
    v_problems := v_problems || 'M1 is not applied (commerce_settings missing); ';
  end if;
  -- Later Feature 013 migrations must be rolled back first.
  if to_regclass('public.delivery_destinations') is not null or to_regclass('public.proforma_line_economics') is not null
     or to_regclass('public.reconciliation_cases') is not null or to_regclass('public.offer_price_tiers') is not null
     or to_regclass('public.notification_events') is not null then
    v_problems := v_problems || 'a later Feature 013 migration (M2a–M2e) is still applied; ';
  end if;
  if exists (select 1 from public.orders where commerce_flow <> 'LEGACY' or status in ('PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED')
             or cancelled_at is not null or cancelled_by is not null or cancel_reason is not null or has_manual_adjustment) then
    v_problems := v_problems || 'orders use M1 values; ';
  end if;
  if exists (select 1 from public.inventory_reservations where status = 'REVIEW_HOLD'
             or proforma_id is not null or confirmed_by is not null or review_hold_at is not null or release_reason is not null) then
    v_problems := v_problems || 'inventory_reservations use M1 values; ';
  end if;
  if exists (select 1 from public.payments where proforma_id is not null or expected_amount is not null or observed_amount is not null
             or observed_currency is not null or observed_value_date is not null or observed_bank_reference is not null
             or observed_bank_reference_normalized is not null or rejected_by is not null or rejected_at is not null) then
    v_problems := v_problems || 'payments use M1 columns; ';
  end if;
  if exists (select 1 from public.payment_proofs where claimed_amount is not null or claimed_currency is not null or transfer_date is not null
             or bank_reference is not null or submission_kind is not null or request_id is not null or status is not null) then
    v_problems := v_problems || 'payment_proofs use M1 columns; ';
  end if;
  if exists (select 1 from public.payment_reviews where decision = 'SENT_TO_RECONCILIATION' or request_id is not null) then
    v_problems := v_problems || 'payment_reviews use M1 values; ';
  end if;
  if exists (select 1 from public.payouts where status = 'ACCRUED' or proforma_id is not null or eligible_at is not null
             or recorded_amount is not null or recorded_currency is not null or request_id is not null) then
    v_problems := v_problems || 'payouts use M1 values; ';
  end if;
  if exists (select 1 from public.payment_accounts where is_default_for_currency) then
    v_problems := v_problems || 'a payment account is flagged default; ';
  end if;
  if exists (select 1 from public.commerce_request_log) then
    v_problems := v_problems || 'commerce_request_log has rows; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_commerce_state_vocabulary rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

-- 1. validate_order_transition(): exact pre-M1 body (T006 §5 fingerprint 8cb857495ac7bd3333f0b81236ca2ee2) -----------
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
revoke all on function public.validate_order_transition() from public, anon;
grant execute on function public.validate_order_transition() to authenticated, service_role;

-- 2. coffee_offers.offer_code ------------------------------------------------------------------------------------
alter table public.coffee_offers
  drop constraint coffee_offers_offer_code_key,
  drop column offer_code;
drop function public.next_offer_code();
drop sequence public.offer_code_seq;

-- 3. payment_accounts --------------------------------------------------------------------------------------------
drop index public.uq_payment_account_default_currency;
alter table public.payment_accounts drop column is_default_for_currency;

-- 4. payouts (exact T006 §9 status set) --------------------------------------------------------------------------
alter table public.payouts
  drop constraint payouts_paid_fields_check,
  drop column proforma_id,
  drop column eligible_at,
  drop column recorded_amount,
  drop column recorded_currency,
  drop column request_id,
  drop constraint payouts_status_check,
  add constraint payouts_status_check check (status = any (array['PENDING_PAYOUT'::text, 'PROCESSING'::text, 'PAID'::text, 'VOID'::text]));

-- 5. payment_reviews (exact T006 §9 decision set) ----------------------------------------------------------------
alter table public.payment_reviews
  drop column request_id,
  drop constraint payment_reviews_decision_check,
  add constraint payment_reviews_decision_check check (decision = any (array['CONFIRMED'::text, 'REJECTED'::text]));

-- 6. payment_proofs ----------------------------------------------------------------------------------------------
drop index public.uq_payment_proof_on_time;
alter table public.payment_proofs
  drop column claimed_amount,
  drop column claimed_currency,
  drop column transfer_date,
  drop column bank_reference,
  drop column submitted_at,
  drop column submission_kind,
  drop column request_id,
  drop column status;

-- 7. payments ----------------------------------------------------------------------------------------------------
drop index public.uq_confirmed_bank_reference;
alter table public.payments
  drop column proforma_id,
  drop column expected_amount,
  drop column observed_amount,
  drop column observed_currency,
  drop column observed_value_date,
  drop column observed_bank_reference,
  drop column observed_bank_reference_normalized,
  drop column rejected_by,
  drop column rejected_at;

-- 8. inventory_reservations (exact T006 §9 index and status set) -------------------------------------------------
drop index public.idx_inventory_reservations_active_expiry;
drop index public.uq_open_inventory_reservation_order;
create unique index uq_active_inventory_reservation_order on public.inventory_reservations using btree (order_id) where (status = 'ACTIVE'::text);
alter table public.inventory_reservations
  drop column proforma_id,
  drop column confirmed_by,
  drop column review_hold_at,
  drop column release_reason,
  drop constraint inventory_reservations_status_check,
  add constraint inventory_reservations_status_check check (status = any (array['ACTIVE'::text, 'CONSUMED'::text, 'RELEASED'::text, 'EXPIRED'::text]));

-- 9. commerce_settings / commerce_request_log --------------------------------------------------------------------
drop table public.commerce_request_log;
drop table public.commerce_settings;

-- 10. orders (exact T006 §9 status set) --------------------------------------------------------------------------
alter table public.orders
  drop column commerce_flow,
  drop column cancelled_at,
  drop column cancelled_by,
  drop column cancel_reason,
  drop column has_manual_adjustment,
  drop constraint orders_status_check,
  add constraint orders_status_check check (status = any (array['DRAFT'::text, 'CONFIRMED'::text, 'HOLD'::text, 'PAYMENT_PROOF_SUBMITTED'::text, 'PAYMENT_UNDER_REVIEW'::text, 'PAID'::text, 'FULFILLMENT_IN_PROGRESS'::text, 'PARTIALLY_DELIVERED'::text, 'COMPLETED'::text, 'EXPIRED'::text, 'VOID'::text, 'DISPUTED'::text]));

commit;
