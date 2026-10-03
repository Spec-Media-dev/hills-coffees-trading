-- Feature 016 read-only postflight. Run only after the Feature 016 forward migration.
do $postflight$
declare
  v_problems text := '';
  v_finance_oid oid;
  v_admin_oid oid;
  v_src text;
  v_config text[];
  v_secdef boolean;
  v_count integer;
  v_columns text[];
  v_nulls_not_distinct boolean;
  v_fence_at integer;
  v_first_lock_at integer;
begin
  -- Exact finance RPC signature, SECURITY DEFINER, configured search_path, and ACLs.
  select p.oid, p.prosecdef, p.prosrc, p.proconfig
    into v_finance_oid, v_secdef, v_src, v_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'finance_review_bank_transfer_v1'
    and pg_get_function_identity_arguments(p.oid) =
      'p_order_id uuid, p_payment_id uuid, p_decision text, p_notes text, p_request_id uuid';

  if v_finance_oid is null then
    v_problems := v_problems || 'finance_review_bank_transfer_v1 exact signature missing; ';
  else
    if not v_secdef then v_problems := v_problems || 'finance_review_bank_transfer_v1 is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'finance_review_bank_transfer_v1 search_path mismatch; ';
    end if;
    if not has_function_privilege('authenticated', v_finance_oid, 'EXECUTE') then
      v_problems := v_problems || 'finance_review_bank_transfer_v1 missing authenticated EXECUTE; ';
    end if;
    if has_function_privilege('public', v_finance_oid, 'EXECUTE')
       or has_function_privilege('anon', v_finance_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_finance_oid, 'EXECUTE') then
      v_problems := v_problems || 'finance_review_bank_transfer_v1 unexpected PUBLIC/anon/service_role EXECUTE; ';
    end if;
    if v_src !~ 'p_decision is null or p_decision not in' then
      v_problems := v_problems || 'finance_review_bank_transfer_v1 does not reject NULL decision; ';
    end if;
  end if;

  -- The exact current Feature 008 function must retain its provider protection plus the one F016 fence.
  select p.oid, p.prosecdef, p.prosrc, p.proconfig
    into v_admin_oid, v_secdef, v_src, v_config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'admin_review_payment'
    and pg_get_function_identity_arguments(p.oid) = 'p_payment_id uuid, p_approved boolean, p_reason text';

  if v_admin_oid is null then
    v_problems := v_problems || 'admin_review_payment exact signature missing; ';
  else
    if not v_secdef then v_problems := v_problems || 'admin_review_payment is not SECURITY DEFINER; '; end if;
    if not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[]))) then
      v_problems := v_problems || 'admin_review_payment search_path mismatch; ';
    end if;
    -- Retain the exact Feature 008 grant boundary: authenticated only; no inherited PUBLIC,
    -- anon, or service-role execute. The function itself remains SECURITY DEFINER.
    if not has_function_privilege('authenticated', v_admin_oid, 'EXECUTE')
       or has_function_privilege('public', v_admin_oid, 'EXECUTE')
       -- Feature 008 revokes PUBLIC/anon only; preserve any existing service_role ACL.
       or has_function_privilege('anon', v_admin_oid, 'EXECUTE') then
      v_problems := v_problems || 'admin_review_payment Feature 008 ACL contract drifted; ';
    end if;
    -- Check the actual conditional and its location, not merely the error string. `prosrc` is
    -- the parsed routine body catalog value, so this fails if the guard is deleted or moved below
    -- the legacy payment/order FOR UPDATE locks.
    v_fence_at := strpos(v_src, 'if v_commerce_flow = ''BANK_TRANSFER_V1'' then');
    v_first_lock_at := strpos(v_src, 'for update');
    if v_fence_at = 0 or v_first_lock_at = 0 or v_fence_at > v_first_lock_at
       or strpos(v_src, 'endpoint_deprecated_use_finance_review_bank_transfer_v1') < v_fence_at then
      v_problems := v_problems || 'admin_review_payment BANK_TRANSFER_V1 conditional pre-lock fence missing or ordered incorrectly; ';
    end if;
    if v_src !~ 'payment_method = ''PROVIDER'''
       or v_src !~ 'trusted_funding_confirmed_at is null'
       or v_src !~ 'raise exception ''trusted_funding_required''' then
      v_problems := v_problems || 'admin_review_payment missing Feature 008 trusted_funding_required behavior; ';
    end if;
  end if;

  -- Narrow proof projection seams must retain the same hardened function boundary.
  foreach v_src in array array[
    'finance_payment_proof_projection(uuid)',
    'finance_payment_proof_asset_projection(uuid)'
  ] loop
    select p.oid, p.prosecdef, p.proconfig into v_finance_oid, v_secdef, v_config
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.oid = to_regprocedure('public.' || v_src);
    if v_finance_oid is null or not v_secdef
       or not ('search_path=pg_catalog, public, auth' = any(coalesce(v_config, array[]::text[])))
       or not has_function_privilege('authenticated', v_finance_oid, 'EXECUTE')
       or has_function_privilege('public', v_finance_oid, 'EXECUTE')
       or has_function_privilege('anon', v_finance_oid, 'EXECUTE')
       or has_function_privilege('service_role', v_finance_oid, 'EXECUTE') then
      v_problems := v_problems || v_src || ' security/ACL contract mismatch; ';
    end if;
  end loop;

  -- The named uniqueness must use the exact logical key and PostgreSQL NULLS NOT DISTINCT semantics.
  select array_agg(att.attname order by k.ord), idx.indnullsnotdistinct
    into v_columns, v_nulls_not_distinct
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_index idx on idx.indexrelid = con.conindid
  join unnest(con.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
  where nsp.nspname = 'public'
    and rel.relname = 'inventory_positions'
    and con.conname = 'uq_inventory_positions_null_safe'
    and con.contype = 'u'
  group by idx.indnullsnotdistinct;

  if v_columns is distinct from array['lot_id', 'owner_organization_id', 'warehouse_id', 'warehouse_location_id']
     or coalesce(v_nulls_not_distinct, false) is not true then
    v_problems := v_problems || 'uq_inventory_positions_null_safe columns or NULLS NOT DISTINCT semantics mismatch; ';
  end if;

  -- Feature 016 confirmation events retain exact warehouse provenance for fail-closed replay.
  select array_agg(column_name order by column_name) into v_columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inventory_ownership_events'
    and column_name in ('warehouse_id', 'warehouse_location_id');
  if v_columns is distinct from array['warehouse_id', 'warehouse_location_id'] then
    v_problems := v_problems || 'Feature 016 ownership warehouse provenance columns missing; ';
  end if;

  -- Trigger-to-function bindings are checked by both trigger and routine identity.
  select count(*) into v_count
  from pg_trigger tg
  join pg_class rel on rel.oid = tg.tgrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_proc fn on fn.oid = tg.tgfoid
  where not tg.tgisinternal and nsp.nspname = 'public' and rel.relname = 'orders'
    and tg.tgname = 'trg_notify_order_status_change' and fn.proname = 'commerce_notify_order_status_change';
  if v_count <> 1 then v_problems := v_problems || 'order notification trigger/function binding missing; '; end if;

  select count(*) into v_count
  from pg_trigger tg
  join pg_class rel on rel.oid = tg.tgrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_proc fn on fn.oid = tg.tgfoid
  where not tg.tgisinternal and nsp.nspname = 'public' and rel.relname = 'order_shipments'
    and tg.tgname = 'trg_notify_shipment_status_change' and fn.proname = 'commerce_notify_shipment_status_change';
  if v_count <> 1 then v_problems := v_problems || 'Feature 016 shipment notification trigger/function binding missing; '; end if;

  -- Feature 009 handoff and Feature 015 fences are required baselines, not rewritten by Feature 016.
  select count(*) into v_count
  from pg_trigger tg join pg_class rel on rel.oid = tg.tgrelid join pg_namespace nsp on nsp.oid = rel.relnamespace
  where not tg.tgisinternal and nsp.nspname = 'public' and rel.relname = 'order_shipments'
    and tg.tgname in ('trg_order_shipments_fulfillment_guard', 'trg_shipment_transition');
  if v_count <> 2 then v_problems := v_problems || 'Feature 009 shipment guard bindings missing; '; end if;

  select p.prosrc into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'validate_order_transition'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_src is null or v_src !~ 'PAYMENT_PROOF_SUBMITTED' or v_src !~ 'PAYMENT_REJECTED' or v_src !~ 'is_internal_transition' then
    v_problems := v_problems || 'Feature 015 validate_order_transition fence missing; ';
  end if;

  -- Feature 016 must not alter payout schema or create payout effects.
  select count(*) into v_count
  from pg_class rel join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'payouts'; -- public.payouts baseline remains present
  if v_count <> 1 then v_problems := v_problems || 'public.payouts baseline missing; '; end if;

  if v_problems <> '' then raise exception 'feature_016_postflight_failed: %', v_problems; end if;
  raise notice 'Feature 016 postflight verification PASSED.';
end $postflight$;
