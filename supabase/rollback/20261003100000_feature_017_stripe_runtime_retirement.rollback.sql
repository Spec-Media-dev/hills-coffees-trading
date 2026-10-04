-- ============================================================================
-- Feature 017: Production Closure & Stripe Runtime Retirement
-- Rollback: 20261003100000_feature_017_stripe_runtime_retirement.rollback.sql
--
-- PURPOSE:
-- Restore the exact verified pre-Feature-017 database ACL baseline for the four
-- historical functions. Database ACL rollback only.
-- Application source, packages, and Edge deployments are NOT restored by this file.
--
-- PRE-FEATURE-017 CAPTURED BASELINE:
-- - admin_review_payment(uuid, boolean, text): authenticated, service_role
-- - record_stripe_payment_intent(uuid, text, text): authenticated, service_role
-- - record_payment_transfer(uuid, text, text, text): authenticated, service_role
-- - ingest_stripe_event(text, text, text, uuid, jsonb, boolean): service_role
-- - PUBLIC and anon have NO execution.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. ROLLBACK PREFLIGHT: Verify forward retired state is present
-- ----------------------------------------------------------------------------
do $rollback_preflight$
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
    raise exception 'Feature 017 rollback aborted: one or more function definitions are missing.';
  end if;

  -- Assert that starting state has NO application execute privileges (must be currently retired)
  if has_function_privilege('public', v_admin_oid, 'EXECUTE')
     or has_function_privilege('anon', v_admin_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_admin_oid, 'EXECUTE') then
    v_problems := v_problems || 'admin_review_payment is not in retired state; ';
  end if;

  if has_function_privilege('public', v_intent_oid, 'EXECUTE')
     or has_function_privilege('anon', v_intent_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_intent_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_intent_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_stripe_payment_intent is not in retired state; ';
  end if;

  if has_function_privilege('public', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('anon', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_transfer_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_payment_transfer is not in retired state; ';
  end if;

  if has_function_privilege('public', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('anon', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_ingest_oid, 'EXECUTE') then
    v_problems := v_problems || 'ingest_stripe_event is not in retired state; ';
  end if;

  if v_problems <> '' then
    raise exception 'Feature 017 rollback aborted: unexpected starting ACL state: %', v_problems;
  end if;
end $rollback_preflight$;

-- ----------------------------------------------------------------------------
-- 2. RESTORE EXACT CAPTURED PRE-017 ACLs
-- ----------------------------------------------------------------------------

-- admin_review_payment: authenticated, service_role
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated, service_role;

-- record_stripe_payment_intent: authenticated, service_role
grant execute on function public.record_stripe_payment_intent(uuid, text, text) to authenticated, service_role;

-- record_payment_transfer: authenticated, service_role
grant execute on function public.record_payment_transfer(uuid, text, text, text) to authenticated, service_role;

-- ingest_stripe_event: service_role only
grant execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) to service_role;

-- Ensure PUBLIC and anon never hold execution
revoke all on function public.admin_review_payment(uuid, boolean, text) from public, anon;
revoke all on function public.record_stripe_payment_intent(uuid, text, text) from public, anon;
revoke all on function public.record_payment_transfer(uuid, text, text, text) from public, anon;
revoke all on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) to service_role;

-- ----------------------------------------------------------------------------
-- 3. ROLLBACK VERIFICATION: Assert exact restored grants
-- ----------------------------------------------------------------------------
do $rollback_verify$
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
    raise exception 'Feature 017 rollback verification aborted: one or more function definitions are missing.';
  end if;

  -- Assert authenticated grants
  if not has_function_privilege('authenticated', v_admin_oid, 'EXECUTE') then
    v_problems := v_problems || 'admin_review_payment missing authenticated; ';
  end if;
  if not has_function_privilege('authenticated', v_intent_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_stripe_payment_intent missing authenticated; ';
  end if;
  if not has_function_privilege('authenticated', v_transfer_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_payment_transfer missing authenticated; ';
  end if;
  if has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE') then
    v_problems := v_problems || 'ingest_stripe_event unexpected authenticated; ';
  end if;

  -- Assert service_role grants
  if not has_function_privilege('service_role', v_admin_oid, 'EXECUTE') then
    v_problems := v_problems || 'admin_review_payment missing service_role; ';
  end if;
  if not has_function_privilege('service_role', v_intent_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_stripe_payment_intent missing service_role; ';
  end if;
  if not has_function_privilege('service_role', v_transfer_oid, 'EXECUTE') then
    v_problems := v_problems || 'record_payment_transfer missing service_role; ';
  end if;
  if not has_function_privilege('service_role', v_ingest_oid, 'EXECUTE') then
    v_problems := v_problems || 'ingest_stripe_event missing service_role; ';
  end if;

  -- Assert no public / anon grants
  if has_function_privilege('public', v_admin_oid, 'EXECUTE') or has_function_privilege('anon', v_admin_oid, 'EXECUTE')
     or has_function_privilege('public', v_intent_oid, 'EXECUTE') or has_function_privilege('anon', v_intent_oid, 'EXECUTE')
     or has_function_privilege('public', v_transfer_oid, 'EXECUTE') or has_function_privilege('anon', v_transfer_oid, 'EXECUTE')
     or has_function_privilege('public', v_ingest_oid, 'EXECUTE') or has_function_privilege('anon', v_ingest_oid, 'EXECUTE') then
    v_problems := v_problems || 'broadened public or anon execute detected; ';
  end if;

  if v_problems <> '' then
    raise exception 'Feature 017 rollback verification failed: %', v_problems;
  end if;
end $rollback_verify$;

commit;
