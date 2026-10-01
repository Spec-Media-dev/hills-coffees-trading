-- Postflight validation query for Feature 015: Manual Bank Transfer & Private Payment Proof
-- READ-ONLY verification of PostgreSQL catalogs, information schema, storage buckets,
-- function properties, RLS configurations, grants, indexes, and legacy fences (HIGH 1).
-- PostgreSQL 17 compatible: uses pg_get_constraintdef() instead of removed pg_constraint.consrc.

do $$
declare
  v_errors text := '';
  v_rec record;
  v_def text;
  v_func_oid oid;
  v_fn_names text[] := array[
    'checkout_bank_transfer_v1(uuid,uuid,uuid)',
    'prepare_payment_proof_upload(uuid,uuid,text)',
    'finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)',
    'payment_proof_storage_object_authorized(text,boolean)',
    'cleanup_orphan_payment_proof_upload(uuid)',
    'issue_proforma(uuid,uuid,text,uuid)',
    'confirm_proforma(uuid,uuid)'
  ];
  v_fn_sig text;
begin
  -- 1. Storage bucket structural check: payment-proofs
  select * into v_rec from storage.buckets where id = 'payment-proofs';
  if v_rec.id is null then
    v_errors := v_errors || 'storage bucket payment-proofs missing; ';
  elsif v_rec.public is distinct from false then
    v_errors := v_errors || 'storage bucket payment-proofs must be private (public=false); ';
  elsif v_rec.file_size_limit is distinct from 10485760 then
    v_errors := v_errors || 'storage bucket payment-proofs file_size_limit must be 10485760; ';
  elsif v_rec.allowed_mime_types is distinct from array['application/pdf', 'image/jpeg', 'image/png']::text[] then
    v_errors := v_errors || 'storage bucket payment-proofs allowed_mime_types mismatch; ';
  end if;

  -- 2. Table structure check: payment_proof_upload_intents
  if to_regclass('public.payment_proof_upload_intents') is null then
    v_errors := v_errors || 'table payment_proof_upload_intents missing; ';
  else
    -- RLS enabled and forced
    select c.relrowsecurity, c.relforcerowsecurity into v_rec
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'payment_proof_upload_intents';
    if not coalesce(v_rec.relrowsecurity, false) then
      v_errors := v_errors || 'table payment_proof_upload_intents RLS not enabled; ';
    end if;
    if not coalesce(v_rec.relforcerowsecurity, false) then
      v_errors := v_errors || 'table payment_proof_upload_intents RLS not forced; ';
    end if;

    -- Ensure no direct anon/public permissions
    if has_table_privilege('anon', 'public.payment_proof_upload_intents', 'SELECT')
       or has_table_privilege('anon', 'public.payment_proof_upload_intents', 'INSERT') then
      v_errors := v_errors || 'table payment_proof_upload_intents unexpectedly accessible to anon; ';
    end if;
  end if;

  -- 3. Functions check: SECURITY DEFINER, search_path, and exact EXECUTE grants
  foreach v_fn_sig in array v_fn_names loop
    v_func_oid := to_regprocedure('public.' || v_fn_sig);
    if v_func_oid is null then
      v_errors := v_errors || 'function ' || v_fn_sig || ' missing; ';
    else
      select p.prosecdef, array_to_string(p.proconfig, ',') as config into v_rec
      from pg_proc p where p.oid = v_func_oid;

      if not coalesce(v_rec.prosecdef, false) then
        v_errors := v_errors || 'function ' || v_fn_sig || ' is not SECURITY DEFINER; ';
      end if;

      if v_rec.config is null or v_rec.config not like '%search_path=pg_catalog, public, auth%' then
        v_errors := v_errors || 'function ' || v_fn_sig || ' missing safe search_path; ';
      end if;

      -- Check EXECUTE grants against exact expected privilege matrix:
      -- Role           | Expected Privilege
      -- ---------------+-------------------
      -- anon           | false (revoked)
      -- public         | false (revoked)
      -- service_role   | false (revoked)
      -- authenticated  | true (granted)

      -- 1. Check anon (must be revoked)
      if has_function_privilege('anon', v_func_oid, 'EXECUTE') then
        v_errors := v_errors || 'function ' || v_fn_sig || ' EXECUTE unexpectedly granted to anon; ';
      end if;

      -- 2. Check public (must be revoked)
      if has_function_privilege('public', v_func_oid, 'EXECUTE') then
        v_errors := v_errors || 'function ' || v_fn_sig || ' EXECUTE unexpectedly granted to public; ';
      end if;

      -- 3. Check service_role (must be revoked - detects unexpected service_role grant drift)
      if has_function_privilege('service_role', v_func_oid, 'EXECUTE') then
        v_errors := v_errors || 'function ' || v_fn_sig || ' EXECUTE unexpectedly granted to service_role; ';
      end if;

      -- 4. Check authenticated (must be granted - detects missing required authenticated grant)
      if not has_function_privilege('authenticated', v_func_oid, 'EXECUTE') then
        v_errors := v_errors || 'function ' || v_fn_sig || ' EXECUTE missing required grant to authenticated; ';
      end if;
    end if;
  end loop;

  -- 4. Order transition trigger and graph checks
  if to_regprocedure('public.validate_order_transition()') is null then
    v_errors := v_errors || 'function validate_order_transition missing; ';
  else
    select p.prosecdef, array_to_string(p.proconfig, ',') as config, p.prosrc into v_rec
    from pg_proc p where p.oid = to_regprocedure('public.validate_order_transition()');
    if not coalesce(v_rec.prosecdef, false) then
      v_errors := v_errors || 'validate_order_transition is not SECURITY DEFINER; ';
    end if;

    -- Check DRAFT -> HOLD and HOLD -> PAYMENT_PROOF_SUBMITTED behavior in transition trigger
    if v_rec.prosrc not like '%HOLD%' or v_rec.prosrc not like '%PAYMENT_PROOF_SUBMITTED%' then
      v_errors := v_errors || 'validate_order_transition missing required transition vocabulary; ';
    end if;
  end if;

  -- Ensure validate_order_transition trigger is attached to public.orders
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgfoid = to_regprocedure('public.validate_order_transition()')
  ) then
    v_errors := v_errors || 'trigger on public.orders for validate_order_transition missing; ';
  end if;

  -- Check orders status check constraint includes HOLD and PAYMENT_PROOF_SUBMITTED (PG17: pg_get_constraintdef)
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'orders' and con.conname = 'orders_status_check';
  if v_def is not null then
    if v_def not like '%HOLD%' or v_def not like '%PAYMENT_PROOF_SUBMITTED%' then
      v_errors := v_errors || 'orders_status_check constraint missing HOLD or PAYMENT_PROOF_SUBMITTED; ';
    end if;
  end if;

  -- 5. RLS Policies structural checks
  -- storage.objects policies
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'payment_proof_storage_insert'
      and cmd = 'INSERT' and 'authenticated' = any(roles)
  ) then
    v_errors := v_errors || 'storage policy payment_proof_storage_insert missing or misconfigured; ';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'payment_proof_storage_select'
      and cmd = 'SELECT' and 'authenticated' = any(roles)
  ) then
    v_errors := v_errors || 'storage policy payment_proof_storage_select missing or misconfigured; ';
  end if;

  -- public.payment_proofs policies
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payment_proofs' and policyname = 'payment_proofs_read'
      and cmd = 'SELECT' and 'authenticated' = any(roles)
  ) then
    v_errors := v_errors || 'table policy payment_proofs_read missing or misconfigured; ';
  end if;

  -- public.file_assets proof-specific policy: payment_proof_file_assets_read
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'file_assets' and policyname = 'payment_proof_file_assets_read'
      and cmd = 'SELECT' and 'authenticated' = any(roles)
  ) then
    v_errors := v_errors || 'policy payment_proof_file_assets_read missing or misconfigured; ';
  end if;

  -- public.file_assets catalog_admin_files carve-out
  select qual into v_def from pg_policies
  where schemaname = 'public' and tablename = 'file_assets' and policyname = 'catalog_admin_files';
  if v_def is null or v_def not like '%payment-proofs%' then
    v_errors := v_errors || 'catalog_admin_files missing payment-proofs carve-out; ';
  end if;

  -- 6. REVIEW_HOLD status and index behavior
  -- PG17: pg_get_constraintdef
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'inventory_reservations' and con.conname = 'inventory_reservations_status_check';
  if v_def is not null and v_def not like '%REVIEW_HOLD%' then
    v_errors := v_errors || 'inventory_reservations_status_check missing REVIEW_HOLD; ';
  end if;

  -- REVIEW_HOLD-related open reservation uniqueness index
  select pg_get_indexdef(c.oid) into v_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'uq_open_inventory_reservation_order';
  if v_def is null then
    v_errors := v_errors || 'unique index uq_open_inventory_reservation_order missing; ';
  elsif v_def not like '%order_id%' or v_def not like '%REVIEW_HOLD%' then
    v_errors := v_errors || 'unique index uq_open_inventory_reservation_order does not index order_id or include REVIEW_HOLD; ';
  end if;

  -- ACTIVE expiry/sweeper index
  select pg_get_indexdef(c.oid) into v_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'idx_inventory_reservations_active_expiry';
  if v_def is null then
    v_errors := v_errors || 'index idx_inventory_reservations_active_expiry missing; ';
  elsif v_def not like '%expires_at%' or v_def not like '%ACTIVE%' then
    v_errors := v_errors || 'index idx_inventory_reservations_active_expiry does not index expires_at or filter ACTIVE; ';
  end if;

  -- active upload-intent uniqueness index
  select pg_get_indexdef(c.oid) into v_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'uq_active_proof_upload_intent';
  if v_def is null then
    v_errors := v_errors || 'unique index uq_active_proof_upload_intent missing; ';
  elsif v_def not like '%order_id%' or v_def not like '%PREPARED%' then
    v_errors := v_errors || 'unique index uq_active_proof_upload_intent does not index order_id or filter PREPARED; ';
  end if;

  -- 7. Payment derivation columns contract (amount, expected_amount, proforma_id)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'amount'
  ) then
    v_errors := v_errors || 'column payments.amount missing; ';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'expected_amount'
  ) then
    v_errors := v_errors || 'column payments.expected_amount missing; ';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'proforma_id'
  ) then
    v_errors := v_errors || 'column payments.proforma_id missing; ';
  end if;

  -- 8. Legacy RPC fence active check
  select p.prosrc into v_def from pg_proc p where p.oid = to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)');
  if v_def is null or v_def not like '%endpoint_deprecated_use_checkout_v1%' then
    v_errors := v_errors || 'issue_proforma legacy fence not active; ';
  end if;

  select p.prosrc into v_def from pg_proc p where p.oid = to_regprocedure('public.confirm_proforma(uuid,uuid)');
  if v_def is null or v_def not like '%endpoint_deprecated_use_checkout_v1%' then
    v_errors := v_errors || 'confirm_proforma legacy fence not active; ';
  end if;

  select p.prosrc into v_def from pg_proc p where p.oid = to_regprocedure('public.submit_payment_proof(uuid,uuid,text)');
  if v_def is null or v_def not like '%endpoint_deprecated_use_finalize_payment_proof%' then
    v_errors := v_errors || 'submit_payment_proof legacy fence not active; ';
  end if;

  -- 9. Feature 014 notification compatibility objects
  if to_regclass('public.notifications') is null then
    v_errors := v_errors || 'table public.notifications missing; ';
  end if;

  -- PG17: pg_get_constraintdef
  select pg_get_constraintdef(con.oid) into v_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  where c.relname = 'notifications' and con.conname = 'notifications_notification_type_check';
  if v_def is not null then
    if v_def not like '%ORDER_PROFORMA_ISSUED%' or v_def not like '%RESERVATION_CONFIRMED%' then
      v_errors := v_errors || 'notifications_notification_type_check missing ORDER_PROFORMA_ISSUED or RESERVATION_CONFIRMED; ';
    end if;
  end if;

  if length(v_errors) > 0 then
    raise exception 'Postflight structural validation failed: %', v_errors;
  end if;

  raise notice 'Feature 015 postflight structural validation passed cleanly.';
end;
$$;

select 'Feature 015 postflight structural validation passed cleanly.' as result;
