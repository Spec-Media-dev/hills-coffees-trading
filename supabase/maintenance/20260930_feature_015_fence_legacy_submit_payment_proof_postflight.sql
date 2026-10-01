-- Postflight validation query for Feature 015 Closure Fix: Fence legacy submit_payment_proof
-- READ-ONLY verification of submit_payment_proof fence, permissions, and validate_order_transition graph.

do $$
declare
  v_errors text := '';
  v_rec record;
  v_def text;
  v_func_oid oid;
begin
  -- 1. Check submit_payment_proof function properties
  v_func_oid := to_regprocedure('public.submit_payment_proof(uuid,uuid,text)');
  if v_func_oid is null then
    v_errors := v_errors || 'function submit_payment_proof(uuid,uuid,text) missing; ';
  else
    select p.prosecdef, array_to_string(p.proconfig, ',') as config, p.prosrc into v_rec
    from pg_proc p where p.oid = v_func_oid;

    if not coalesce(v_rec.prosecdef, false) then
      v_errors := v_errors || 'submit_payment_proof is not SECURITY DEFINER; ';
    end if;

    if v_rec.config is null or v_rec.config not like '%search_path=pg_catalog, public, auth%' then
      v_errors := v_errors || 'submit_payment_proof missing safe search_path; ';
    end if;

    if v_rec.prosrc not like '%endpoint_deprecated_use_finalize_payment_proof%' then
      v_errors := v_errors || 'submit_payment_proof missing legacy fence endpoint_deprecated_use_finalize_payment_proof; ';
    end if;

    -- Grants check
    if not has_function_privilege('authenticated', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'submit_payment_proof missing EXECUTE grant for authenticated; ';
    end if;

    if has_function_privilege('anon', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'submit_payment_proof unexpectedly granted to anon; ';
    end if;

    if has_function_privilege('public', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'submit_payment_proof unexpectedly granted to public; ';
    end if;
  end if;

  -- 2. Check validate_order_transition transition graph
  v_func_oid := to_regprocedure('public.validate_order_transition()');
  if v_func_oid is null then
    v_errors := v_errors || 'function validate_order_transition missing; ';
  else
    select p.prosecdef, array_to_string(p.proconfig, ',') as config, p.prosrc into v_rec
    from pg_proc p where p.oid = v_func_oid;

    if v_rec.prosrc like '%old.status = ''HOLD'' and new.status not in (''PAYMENT_PROOF_SUBMITTED'', ''PAYMENT_UNDER_REVIEW''%' then
      v_errors := v_errors || 'validate_order_transition still permits direct HOLD -> PAYMENT_UNDER_REVIEW bypass; ';
    end if;

    if v_rec.prosrc not like '%old.status = ''HOLD'' and new.status not in (''PAYMENT_PROOF_SUBMITTED'', ''EXPIRED'', ''CANCELLED'', ''VOID'')%' then
      v_errors := v_errors || 'validate_order_transition missing closed HOLD transition vocabulary; ';
    end if;
  end if;

  -- 3. Check finalize_payment_proof remains available and valid
  v_func_oid := to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)');
  if v_func_oid is null then
    v_errors := v_errors || 'function finalize_payment_proof missing; ';
  else
    if not has_function_privilege('authenticated', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'finalize_payment_proof missing EXECUTE grant for authenticated; ';
    end if;
    if has_function_privilege('anon', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'finalize_payment_proof unexpectedly granted to anon; ';
    end if;
    if has_function_privilege('public', v_func_oid, 'EXECUTE') then
      v_errors := v_errors || 'finalize_payment_proof unexpectedly granted to public; ';
    end if;
  end if;

  if length(v_errors) > 0 then
    raise exception 'Closure postflight validation failed: %', v_errors;
  end if;

  raise notice 'Feature 015 closure postflight validation passed cleanly.';
end;
$$;

select 'Feature 015 closure postflight validation passed cleanly.' as result;
