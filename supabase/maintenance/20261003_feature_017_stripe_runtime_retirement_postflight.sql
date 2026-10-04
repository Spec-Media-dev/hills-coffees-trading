-- ============================================================================
-- Feature 017: Production Closure & Stripe Runtime Retirement
-- Postflight: 20261003_feature_017_stripe_runtime_retirement_postflight.sql
--
-- PURPOSE:
-- Deterministic, read-only postflight verification asserting:
-- 1. All four historical function definitions still exist with owner postgres,
--    SECURITY DEFINER, and safe search_path.
-- 2. PUBLIC, anon, authenticated, and service_role have NO execution on them.
-- 3. Active V1 bank-transfer functions exist with exact signatures, owner postgres,
--    SECURITY DEFINER, search_path, and authenticated-only grants.
-- 4. Legacy fences on checkout_order and submit_payment_proof remain intact.
-- 5. Feature 015 proof seams and Feature 016 finance seams remain intact.
-- 6. Historical provider schema (payment_events, payment_transfers) remains preserved.
-- ============================================================================

do $f017_postflight$
declare
  v_problems text := '';
  v_admin_oid oid;
  v_intent_oid oid;
  v_transfer_oid oid;
  v_ingest_oid oid;
  v_checkout_oid oid;
  v_proof_oid oid;
  v_fn_oid oid;
  v_owner text;
  v_secdef boolean;
  v_config text[];
  v_src text;
  v_proof_policy_mismatches integer;
  v_storage_policy_mismatches integer;
  v_sig text;
  v_prior_search_path text := current_setting('search_path');
begin
  -- Fixed deparser visibility, matching the captured PostgreSQL baseline.
  perform set_config('search_path', 'pg_catalog', true);
  -- --------------------------------------------------------------------------
  -- 1. admin_review_payment(uuid, boolean, text)
  -- --------------------------------------------------------------------------
  v_admin_oid := to_regprocedure('public.admin_review_payment(uuid, boolean, text)')::oid;
  if v_admin_oid is null then
    v_problems := v_problems || 'admin_review_payment definition missing; ';
  else
    select pg_get_userbyid(p.proowner), p.prosecdef, p.prosrc, p.proconfig
      into v_owner, v_secdef, v_src, v_config
    from pg_proc p where p.oid = v_admin_oid;
    if v_owner <> 'postgres' then
      v_problems := v_problems || 'admin_review_payment owner is not postgres; ';
    end if;
    if not v_secdef then
      v_problems := v_problems || 'admin_review_payment is not SECURITY DEFINER; ';
    end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'admin_review_payment search_path mismatch; ';
    end if;
    if v_src !~ 'endpoint_deprecated_use_finance_review_bank_transfer_v1' then
      v_problems := v_problems || 'admin_review_payment missing BANK_TRANSFER_V1 fence; ';
    end if;
    if has_function_privilege('public', v_admin_oid, 'EXECUTE')
       or has_function_privilege('anon', v_admin_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_admin_oid, 'EXECUTE') then
      v_problems := v_problems || 'admin_review_payment has unexpected application EXECUTE; ';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 2. record_stripe_payment_intent(uuid, text, text)
  -- --------------------------------------------------------------------------
  v_intent_oid := to_regprocedure('public.record_stripe_payment_intent(uuid, text, text)')::oid;
  if v_intent_oid is null then
    v_problems := v_problems || 'record_stripe_payment_intent definition missing; ';
  else
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_secdef, v_config
    from pg_proc p where p.oid = v_intent_oid;
    if v_owner <> 'postgres' then
      v_problems := v_problems || 'record_stripe_payment_intent owner is not postgres; ';
    end if;
    if not v_secdef then
      v_problems := v_problems || 'record_stripe_payment_intent is not SECURITY DEFINER; ';
    end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'record_stripe_payment_intent search_path mismatch; ';
    end if;
    if has_function_privilege('public', v_intent_oid, 'EXECUTE')
       or has_function_privilege('anon', v_intent_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_intent_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_intent_oid, 'EXECUTE') then
      v_problems := v_problems || 'record_stripe_payment_intent has unexpected application EXECUTE; ';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 3. record_payment_transfer(uuid, text, text, text)
  -- --------------------------------------------------------------------------
  v_transfer_oid := to_regprocedure('public.record_payment_transfer(uuid, text, text, text)')::oid;
  if v_transfer_oid is null then
    v_problems := v_problems || 'record_payment_transfer definition missing; ';
  else
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_secdef, v_config
    from pg_proc p where p.oid = v_transfer_oid;
    if v_owner <> 'postgres' then
      v_problems := v_problems || 'record_payment_transfer owner is not postgres; ';
    end if;
    if not v_secdef then
      v_problems := v_problems || 'record_payment_transfer is not SECURITY DEFINER; ';
    end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'record_payment_transfer search_path mismatch; ';
    end if;
    if has_function_privilege('public', v_transfer_oid, 'EXECUTE')
       or has_function_privilege('anon', v_transfer_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_transfer_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_transfer_oid, 'EXECUTE') then
      v_problems := v_problems || 'record_payment_transfer has unexpected application EXECUTE; ';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 4. ingest_stripe_event(text, text, text, uuid, jsonb, boolean)
  -- --------------------------------------------------------------------------
  v_ingest_oid := to_regprocedure('public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean)')::oid;
  if v_ingest_oid is null then
    v_problems := v_problems || 'ingest_stripe_event definition missing; ';
  else
    select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
      into v_owner, v_secdef, v_config
    from pg_proc p where p.oid = v_ingest_oid;
    if v_owner <> 'postgres' then
      v_problems := v_problems || 'ingest_stripe_event owner is not postgres; ';
    end if;
    if not v_secdef then
      v_problems := v_problems || 'ingest_stripe_event is not SECURITY DEFINER; ';
    end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'ingest_stripe_event search_path mismatch; ';
    end if;
    if has_function_privilege('public', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('anon', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_ingest_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_ingest_oid, 'EXECUTE') then
      v_problems := v_problems || 'ingest_stripe_event has unexpected application EXECUTE; ';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 5. Active V1 bank-transfer RPCs (exact signatures, owner postgres, SECURITY DEFINER, search_path, authenticated-only)
  -- --------------------------------------------------------------------------
  foreach v_sig in array array[
    'checkout_bank_transfer_v1(uuid, uuid, uuid)',
    'issue_proforma(uuid, uuid, text, uuid)',
    'confirm_proforma(uuid, uuid)',
    'prepare_payment_proof_upload(uuid, uuid, text)',
    'finalize_payment_proof(uuid, uuid, numeric, date, text, text, uuid)',
    'finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid)'
  ] loop
    v_fn_oid := to_regprocedure('public.' || v_sig)::oid;
    if v_fn_oid is null then
      v_problems := v_problems || 'active V1 function ' || v_sig || ' missing; ';
    else
      select pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
        into v_owner, v_secdef, v_config
      from pg_proc p where p.oid = v_fn_oid;
      if v_owner <> 'postgres' then
        v_problems := v_problems || v_sig || ' owner is not postgres; ';
      end if;
      if not v_secdef then
        v_problems := v_problems || v_sig || ' is not SECURITY DEFINER; ';
      end if;
      if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
        v_problems := v_problems || v_sig || ' search_path mismatch; ';
      end if;
      if not has_function_privilege('authenticated', v_fn_oid, 'EXECUTE') then
        v_problems := v_problems || v_sig || ' missing authenticated EXECUTE; ';
      end if;
      if has_function_privilege('public', v_fn_oid, 'EXECUTE')
         or has_function_privilege('anon', v_fn_oid, 'EXECUTE')
         or has_function_privilege('service_role', v_fn_oid, 'EXECUTE') then
        v_problems := v_problems || v_sig || ' unexpected public/anon/service_role EXECUTE; ';
      end if;
    end if;
  end loop;

  -- --------------------------------------------------------------------------
  -- 6. Legacy compatibility fences: checkout_order & submit_payment_proof
  -- --------------------------------------------------------------------------
  v_checkout_oid := to_regprocedure('public.checkout_order(uuid)')::oid;
  if v_checkout_oid is null then
    v_problems := v_problems || 'checkout_order(uuid) missing; ';
  else
    if not has_function_privilege('authenticated', v_checkout_oid, 'EXECUTE') then
      v_problems := v_problems || 'checkout_order missing authenticated EXECUTE; ';
    end if;
    if has_function_privilege('public', v_checkout_oid, 'EXECUTE')
       or has_function_privilege('anon', v_checkout_oid, 'EXECUTE') then
      v_problems := v_problems || 'checkout_order has unexpected public/anon EXECUTE; ';
    end if;
  end if;

  v_proof_oid := to_regprocedure('public.submit_payment_proof(uuid, uuid, text)')::oid;
  if v_proof_oid is null then
    v_problems := v_problems || 'submit_payment_proof(uuid, uuid, text) missing; ';
  else
    select pg_get_userbyid(p.proowner), p.prosecdef, p.prosrc, p.proconfig
      into v_owner, v_secdef, v_src, v_config
    from pg_proc p where p.oid = v_proof_oid;
    if v_owner <> 'postgres' then
      v_problems := v_problems || 'submit_payment_proof owner is not postgres; ';
    end if;
    if not v_secdef then
      v_problems := v_problems || 'submit_payment_proof is not SECURITY DEFINER; ';
    end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'submit_payment_proof search_path mismatch; ';
    end if;
    if not has_function_privilege('authenticated', v_proof_oid, 'EXECUTE') then
      v_problems := v_problems || 'submit_payment_proof missing authenticated EXECUTE; ';
    end if;
    if has_function_privilege('public', v_proof_oid, 'EXECUTE')
       or has_function_privilege('anon', v_proof_oid, 'EXECUTE') then
      v_problems := v_problems || 'submit_payment_proof has unexpected public/anon EXECUTE; ';
    end if;
    if v_src !~ 'endpoint_deprecated_use_finalize_payment_proof' then
      v_problems := v_problems || 'submit_payment_proof missing finalize_payment_proof fence; ';
    end if;
  end if;

  -- --------------------------------------------------------------------------
  -- 7. Feature 015 / Feature 016 security seams
  -- --------------------------------------------------------------------------
  -- Proof projection helper functions
  foreach v_sig in array array[
    'finance_payment_proof_projection(uuid)',
    'finance_payment_proof_asset_projection(uuid)'
  ] loop
    v_fn_oid := to_regprocedure('public.' || v_sig)::oid;
    if v_fn_oid is null then
      v_problems := v_problems || v_sig || ' missing; ';
    else
      select p.prosecdef, p.proconfig into v_secdef, v_config
      from pg_proc p where p.oid = v_fn_oid;
      if not v_secdef or not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[])))
         or not has_function_privilege('authenticated', v_fn_oid, 'EXECUTE')
         or has_function_privilege('public', v_fn_oid, 'EXECUTE')
         or has_function_privilege('anon', v_fn_oid, 'EXECUTE')
         or has_function_privilege('service_role', v_fn_oid, 'EXECUTE') then
        v_problems := v_problems || v_sig || ' security/ACL contract mismatch; ';
      end if;
    end if;
  end loop;

  -- Authorization functions
  if to_regprocedure('public.is_finance_operator()') is null then
    v_problems := v_problems || 'is_finance_operator() function missing; ';
  end if;
  if to_regprocedure('public.is_platform_admin()') is null then
    v_problems := v_problems || 'is_platform_admin() function missing; ';
  end if;

  select c.relrowsecurity into v_secdef
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'payment_proofs';
  if v_secdef is not true then v_problems := v_problems || 'payment_proofs RLS is not enabled; '; end if;
  if to_regclass('storage.buckets') is null then
    v_problems := v_problems || 'storage.buckets missing; ';
  elsif not exists (select 1 from storage.buckets where id = 'payment-proofs' and public is false) then
    v_problems := v_problems || 'storage bucket payment-proofs missing or not private; ';
  end if;

  -- BEGIN F017 POSTGRESQL POLICY BASELINE
  -- Generated from effective historical CREATE POLICY statements by PostgreSQL.
  -- Regenerate with captureCanonicalPolicies/renderCanonicalPolicyManifest in
  -- scripts/f017-policy-baseline.ts; the independent tests enforce exact capture.
  with expected(schemaname, tablename, policyname, permissive, cmd, roles, using_expr, check_expr) as (
    values
      (E'public',E'payment_proofs',E'mfa_gate_payment_proofs',E'RESTRICTIVE',E'SELECT',array[E'authenticated']::name[],E'public.mfa_satisfied()',null::text),
      (E'public',E'payment_proofs',E'payment_proofs_read',E'PERMISSIVE',E'SELECT',array[E'authenticated']::name[],E'(public.is_platform_admin() OR public.is_finance_operator() OR ((NOT public.is_blocked_user()) AND public.mfa_satisfied() AND public.is_authorized_member() AND (EXISTS ( SELECT 1\n   FROM (public.payments p\n     JOIN public.orders o ON ((o.id = p.order_id)))\n  WHERE ((p.id = payment_proofs.payment_id) AND public.is_org_member(o.buyer_organization_id) AND public.organization_can_buy(o.buyer_organization_id))))))',null::text),
      (E'storage',E'objects',E'kyb_evidence_member_insert',E'PERMISSIVE',E'INSERT',array[E'authenticated']::name[],null::text,E'((bucket_id = ''kyb-evidence''::text) AND public.kyb_storage_object_authorized(name, true))'),
      (E'storage',E'objects',E'kyb_evidence_member_select',E'PERMISSIVE',E'SELECT',array[E'authenticated']::name[],E'((bucket_id = ''kyb-evidence''::text) AND public.kyb_storage_object_authorized(name, false))',null::text),
      (E'storage',E'objects',E'listing_media_delete',E'PERMISSIVE',E'DELETE',array[E'authenticated']::name[],E'((bucket_id = ''listing-media''::text) AND public.offer_media_object_authorized(name, true))',null::text),
      (E'storage',E'objects',E'listing_media_insert',E'PERMISSIVE',E'INSERT',array[E'authenticated']::name[],null::text,E'((bucket_id = ''listing-media''::text) AND public.offer_media_object_authorized(name, true))'),
      (E'storage',E'objects',E'listing_media_select',E'PERMISSIVE',E'SELECT',array[E'authenticated']::name[],E'((bucket_id = ''listing-media''::text) AND public.offer_media_object_authorized(name, false))',null::text),
      (E'storage',E'objects',E'mfa_gate_kyb_evidence',E'RESTRICTIVE',E'ALL',array[E'authenticated']::name[],E'((bucket_id <> ''kyb-evidence''::text) OR public.mfa_satisfied())',E'((bucket_id <> ''kyb-evidence''::text) OR public.mfa_satisfied())'),
      (E'storage',E'objects',E'payment_proof_storage_insert',E'PERMISSIVE',E'INSERT',array[E'authenticated']::name[],null::text,E'((bucket_id = ''payment-proofs''::text) AND public.payment_proof_storage_object_authorized(name, true))'),
      (E'storage',E'objects',E'payment_proof_storage_select',E'PERMISSIVE',E'SELECT',array[E'authenticated']::name[],E'((bucket_id = ''payment-proofs''::text) AND public.payment_proof_storage_object_authorized(name, false))',null::text),
      (E'storage',E'objects',E'public_assets_delete',E'PERMISSIVE',E'DELETE',array[E'authenticated']::name[],E'((bucket_id = ''public-assets''::text) AND public.public_asset_object_authorized(name, ''write''::text))',null::text),
      (E'storage',E'objects',E'public_assets_select',E'PERMISSIVE',E'SELECT',array[E'anon',E'authenticated']::name[],E'(bucket_id = ''public-assets''::text)',null::text),
      (E'storage',E'objects',E'public_assets_update',E'PERMISSIVE',E'UPDATE',array[E'authenticated']::name[],E'((bucket_id = ''public-assets''::text) AND public.public_asset_object_authorized(name, ''write''::text))',E'((bucket_id = ''public-assets''::text) AND public.public_asset_object_authorized(name, ''write''::text))'),
      (E'storage',E'objects',E'public_assets_write',E'PERMISSIVE',E'INSERT',array[E'authenticated']::name[],null::text,E'((bucket_id = ''public-assets''::text) AND public.public_asset_object_authorized(name, ''write''::text))')
  ), actual as (
    select schemaname, tablename, policyname, permissive, cmd, roles, qual as using_expr,
      case when cmd in ('UPDATE','ALL') and with_check is null then qual else with_check end as check_expr
    from pg_catalog.pg_policies
    where (schemaname = 'public' and tablename = 'payment_proofs')
       or (schemaname = 'storage' and tablename = 'objects')
  ), mismatches as (
    select coalesce(e.schemaname, a.schemaname) as schemaname
    from expected e full join actual a using (schemaname, tablename, policyname)
    where e.policyname is null or a.policyname is null
      or e.permissive is distinct from a.permissive or e.cmd is distinct from a.cmd
      or e.roles is distinct from a.roles
      or e.using_expr is distinct from a.using_expr
      or e.check_expr is distinct from a.check_expr
  ) select count(*) filter (where schemaname = 'public'), count(*) filter (where schemaname = 'storage')
    into v_proof_policy_mismatches, v_storage_policy_mismatches from mismatches;
  if v_proof_policy_mismatches <> 0 then v_problems := v_problems || 'payment_proofs policy manifest mismatch; '; end if;
  if v_storage_policy_mismatches <> 0 then v_problems := v_problems || 'Storage policy manifest mismatch; '; end if;
  -- END F017 POSTGRESQL POLICY BASELINE

  -- 8. Historical schema presence
  -- --------------------------------------------------------------------------
  if to_regclass('public.payment_events') is null then
    v_problems := v_problems || 'historical table payment_events missing; ';
  end if;
  if to_regclass('public.payment_transfers') is null then
    v_problems := v_problems || 'historical table payment_transfers missing; ';
  end if;

  if v_problems <> '' then
    raise exception 'Feature 017 postflight failed: %', v_problems;
  end if;
  perform set_config('search_path', v_prior_search_path, true);
end $f017_postflight$;
