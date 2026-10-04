-- ============================================================================
-- Feature 017: Production Closure & Stripe Runtime Retirement
-- Migration: 20261003100000_feature_017_stripe_runtime_retirement.sql
--
-- PURPOSE:
-- Retire database application execution for all historical Stripe/provider
-- functions while preserving function definitions, bodies, and historical data.
-- Hills Coffee Trading is bank-transfer only going forward.
--
-- RETIRED FUNCTIONS (Definitions retained, application execution revoked):
-- 1. admin_review_payment(uuid, boolean, text)
-- 2. record_stripe_payment_intent(uuid, text, text)
-- 3. record_payment_transfer(uuid, text, text, text)
-- 4. ingest_stripe_event(text, text, text, uuid, jsonb, boolean)
--
-- COMPATIBILITY (Fences and active V1 grants preserved):
-- - checkout_order(uuid)
-- - submit_payment_proof(uuid, uuid, text)
-- - finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)
--
-- FAIL-CLOSED PREFLIGHT:
-- Verifies exact signatures, search paths, ACL baseline, and absence of
-- active provider payments, nonterminal provider rows, or unreviewed legacy data.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. READ-ONLY FAIL-CLOSED PREFLIGHT
-- ----------------------------------------------------------------------------
do $preflight$
declare
  v_problems text := '';
  v_admin_oid oid;
  v_intent_oid oid;
  v_transfer_oid oid;
  v_ingest_oid oid;
  v_checkout_oid oid;
  v_proof_oid oid;
  v_v1_review_oid oid;
  v_secdef boolean;
  v_config text[];
  v_count integer;
begin
  -- 1a. Verify admin_review_payment(uuid, boolean, text)
  v_admin_oid := to_regprocedure('public.admin_review_payment(uuid, boolean, text)')::oid;
  if v_admin_oid is null then
    v_problems := v_problems || 'admin_review_payment(uuid, boolean, text) missing; ';
  else
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_admin_oid;
    if not v_secdef then v_problems := v_problems || 'admin_review_payment is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'admin_review_payment search_path mismatch; ';
    end if;
    -- Preflight ACL baseline verification
    if not has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_admin_oid, 'EXECUTE')
       or has_function_privilege('public', v_admin_oid, 'EXECUTE')
       or has_function_privilege('anon', v_admin_oid, 'EXECUTE') then
      v_problems := v_problems || 'admin_review_payment pre-retirement ACL baseline drifted; ';
    end if;
  end if;

  -- 1b. Verify record_stripe_payment_intent(uuid, text, text)
  v_intent_oid := to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)')::oid;
  if v_intent_oid is null then
    v_problems := v_problems || 'record_stripe_payment_intent(uuid, text, text) missing; ';
  else
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_intent_oid;
    if not v_secdef then v_problems := v_problems || 'record_stripe_payment_intent is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'record_stripe_payment_intent search_path mismatch; ';
    end if;
    -- Preflight ACL baseline verification
    if not has_function_privilege('authenticated', v_intent_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_intent_oid, 'EXECUTE')
       or has_function_privilege('public', v_intent_oid, 'EXECUTE')
       or has_function_privilege('anon', v_intent_oid, 'EXECUTE') then
      v_problems := v_problems || 'record_stripe_payment_intent pre-retirement ACL baseline drifted; ';
    end if;
  end if;

  -- 1c. Verify record_payment_transfer(uuid, text, text, text)
  v_transfer_oid := to_regprocedure('public.record_payment_transfer(uuid, text, text, text)')::oid;
  if v_transfer_oid is null then
    v_problems := v_problems || 'record_payment_transfer(uuid, text, text, text) missing; ';
  else
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_transfer_oid;
    if not v_secdef then v_problems := v_problems || 'record_payment_transfer is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'record_payment_transfer search_path mismatch; ';
    end if;
    -- Preflight ACL baseline verification
    if not has_function_privilege('authenticated', v_transfer_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_transfer_oid, 'EXECUTE')
       or has_function_privilege('public', v_transfer_oid, 'EXECUTE')
       or has_function_privilege('anon', v_transfer_oid, 'EXECUTE') then
      v_problems := v_problems || 'record_payment_transfer pre-retirement ACL baseline drifted; ';
    end if;
  end if;

  -- 1d. Verify ingest_stripe_event(text, text, text, uuid, jsonb, boolean)
  v_ingest_oid := to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)')::oid;
  if v_ingest_oid is null then
    v_problems := v_problems || 'ingest_stripe_event(text, text, text, uuid, jsonb, boolean) missing; ';
  else
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_ingest_oid;
    if not v_secdef then v_problems := v_problems || 'ingest_stripe_event is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'ingest_stripe_event search_path mismatch; ';
    end if;
    -- Preflight ACL baseline verification: service_role ONLY, no authenticated, public, or anon
    if not has_function_privilege('service_role', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('public', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('anon', v_ingest_oid, 'EXECUTE') then
      v_problems := v_problems || 'ingest_stripe_event pre-retirement ACL baseline drifted; ';
    end if;
  end if;

  -- 1e. Verify compatibility functions: checkout_order & submit_payment_proof
  v_checkout_oid := to_regprocedure('public.checkout_order(uuid)')::oid;
  if v_checkout_oid is null then
    v_problems := v_problems || 'checkout_order(uuid) missing; ';
  else
    if not has_function_privilege('authenticated', v_checkout_oid, 'EXECUTE') then
      v_problems := v_problems || 'checkout_order missing authenticated EXECUTE; ';
    end if;
  end if;

  v_proof_oid := to_regprocedure('public.submit_payment_proof(uuid, uuid, text)')::oid;
  if v_proof_oid is null then
    v_problems := v_problems || 'submit_payment_proof(uuid, uuid, text) missing; ';
  else
    if not has_function_privilege('authenticated', v_proof_oid, 'EXECUTE') then
      v_problems := v_problems || 'submit_payment_proof missing authenticated EXECUTE; ';
    end if;
  end if;

  -- 1f. Verify active V1 bank transfer review function
  v_v1_review_oid := to_regprocedure('public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)')::oid;
  if v_v1_review_oid is null then
    v_problems := v_problems || 'finance_review_bank_transfer_v1 missing; ';
  else
    if not has_function_privilege('authenticated', v_v1_review_oid, 'EXECUTE') then
      v_problems := v_problems || 'finance_review_bank_transfer_v1 missing authenticated EXECUTE; ';
    end if;
  end if;

  -- 1g. Operational data absence assertions (fail-closed, reports counts only)
  select count(*) into v_count from public.payments where payment_method = 'PROVIDER' or provider is not null;
  if v_count <> 0 then
    v_problems := v_problems || 'found ' || v_count || ' provider payment row(s); ';
  end if;

  select count(*) into v_count from public.payments where trusted_funding_confirmed_at is not null or trusted_funding_event_id is not null;
  if v_count <> 0 then
    v_problems := v_problems || 'found ' || v_count || ' trusted-funding row(s); ';
  end if;

  select count(*) into v_count from public.payment_events;
  if v_count <> 0 then
    v_problems := v_problems || 'found ' || v_count || ' payment_events row(s); ';
  end if;

  select count(*) into v_count from public.payment_transfers;
  if v_count <> 0 then
    v_problems := v_problems || 'found ' || v_count || ' payment_transfers row(s); ';
  end if;

  -- 1h. Legacy reviewability preflight. Excludes terminal states where admin_review_payment
  -- is operationally impossible or an idempotent no-op:
  -- - Confirmed/paid terminal state: payment CONFIRMED and order in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED')
  -- - Expired/cancelled/void terminal state: payment in ('EXPIRED', 'VOID') and order in ('EXPIRED', 'CANCELLED', 'VOID')
  select count(*) into v_count
  from public.payments p
  join public.orders o on o.id = p.order_id
  where coalesce(o.commerce_flow, '') <> 'BANK_TRANSFER_V1'
    and not (
      (p.status = 'CONFIRMED' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED'))
      or (p.status in ('EXPIRED', 'VOID') and o.status in ('EXPIRED', 'CANCELLED', 'VOID'))
    );
  if v_count <> 0 then
    v_problems := v_problems || 'found ' || v_count || ' reviewable legacy payment row(s); ';
  end if;

  if v_problems <> '' then
    raise exception 'Feature 017 forward preflight failed: %', v_problems;
  end if;
end $preflight$;

-- ----------------------------------------------------------------------------
-- 2. APPLICATION ROLE PRIVILEGE REVOCATIONS
--    Definitions, bodies, owners, schema, and historical data remain preserved.
-- ----------------------------------------------------------------------------

-- Revoke admin_review_payment(uuid, boolean, text)
revoke execute on function public.admin_review_payment(uuid, boolean, text) from public;
revoke execute on function public.admin_review_payment(uuid, boolean, text) from anon;
revoke execute on function public.admin_review_payment(uuid, boolean, text) from authenticated;
revoke execute on function public.admin_review_payment(uuid, boolean, text) from service_role;

-- Revoke record_stripe_payment_intent(uuid, text, text)
revoke execute on function public.record_stripe_payment_intent(uuid, text, text) from public;
revoke execute on function public.record_stripe_payment_intent(uuid, text, text) from anon;
revoke execute on function public.record_stripe_payment_intent(uuid, text, text) from authenticated;
revoke execute on function public.record_stripe_payment_intent(uuid, text, text) from service_role;

-- Revoke record_payment_transfer(uuid, text, text, text)
revoke execute on function public.record_payment_transfer(uuid, text, text, text) from public;
revoke execute on function public.record_payment_transfer(uuid, text, text, text) from anon;
revoke execute on function public.record_payment_transfer(uuid, text, text, text) from authenticated;
revoke execute on function public.record_payment_transfer(uuid, text, text, text) from service_role;

-- Revoke ingest_stripe_event(text, text, text, uuid, jsonb, boolean)
revoke execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from public;
revoke execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from anon;
revoke execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from authenticated;
revoke execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from service_role;

-- ----------------------------------------------------------------------------
-- 3. FORWARD STATE VERIFICATION ASSERTIONS
-- ----------------------------------------------------------------------------
do $verify$
declare
  v_problems text := '';
  v_admin_oid oid;
  v_intent_oid oid;
  v_transfer_oid oid;
  v_ingest_oid oid;
begin
  v_admin_oid := to_regprocedure('public.admin_review_payment(uuid, boolean, text)')::oid;
  v_intent_oid := to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)')::oid;
  v_transfer_oid := to_regprocedure('public.record_payment_transfer(uuid, text, text, text)')::oid;
  v_ingest_oid := to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)')::oid;

  if v_admin_oid is null or v_intent_oid is null or v_transfer_oid is null or v_ingest_oid is null then
    raise exception 'Feature 017 forward verification failed: one or more function definitions are missing.';
  end if;

  -- Assert all application roles have no execution on admin_review_payment
  if has_function_privilege('public', v_admin_oid, 'EXECUTE')
     or has_function_privilege('anon', v_admin_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_admin_oid, 'EXECUTE') then
    v_problems := v_problems || 'admin_review_payment retains application EXECUTE; ';
  end if;

  -- Assert all application roles have no execution on record_stripe_payment_intent
  if has_function_privilege('public', v_intent_oid, 'EXECUTE')
     or has_function_privilege('anon', v_intent_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_intent_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_intent_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_stripe_payment_intent retains application EXECUTE; ';
  end if;

  -- Assert all application roles have no execution on record_payment_transfer
  if has_function_privilege('public', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('anon', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_transfer_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_payment_transfer retains application EXECUTE; ';
  end if;

  -- Assert all application roles have no execution on ingest_stripe_event
  if has_function_privilege('public', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('anon', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_ingest_oid, 'EXECUTE') then
    v_problems := v_problems || 'ingest_stripe_event retains application EXECUTE; ';
  end if;

  if v_problems <> '' then
    raise exception 'Feature 017 forward verification failed: %', v_problems;
  end if;
end $verify$;

commit;
