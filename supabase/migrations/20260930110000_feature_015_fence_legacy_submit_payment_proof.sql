-- Feature 015 Closure Fix: Fence legacy submit_payment_proof & Close Transition Bypass
-- Prevents authenticated bypass of prepare_payment_proof_upload -> private Storage -> finalize_payment_proof.
-- Fails closed deterministically before any mutation on BANK_TRANSFER_V1 orders.
-- Closes direct HOLD -> PAYMENT_UNDER_REVIEW transition bypass in validate_order_transition.

do $$
begin
  -- Guard: Feature 015 base migration must be applied
  if to_regprocedure('public.finalize_payment_proof(uuid,uuid,numeric,date,text,text,uuid)') is null then
    raise exception 'feature_015_prerequisites_missing';
  end if;
end;
$$;

-- 1. Redefine submit_payment_proof to fence BANK_TRANSFER_V1 before any mutation
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
  v_flow text;
begin
  -- Inspect order commerce flow
  select o.commerce_flow into v_flow
  from public.orders o
  where o.id = p_order_id;

  -- FENCE: BANK_TRANSFER_V1 orders MUST use finalize_payment_proof.
  -- Fail closed immediately before any mutation, counter change, or transition.
  if v_flow = 'BANK_TRANSFER_V1' or (v_flow is not null and v_flow <> 'LEGACY') then
    raise exception 'endpoint_deprecated_use_finalize_payment_proof';
  end if;

  -- Documented legacy flow (commerce_flow = 'LEGACY') callers only:
  if not exists (
    select 1
    from public.orders o
    join public.organization_members om on om.organization_id = o.buyer_organization_id
    where o.id = p_order_id
      and om.user_id = auth.uid()
      and om.is_active
      and o.status in ('HOLD', 'PAYMENT_PROOF_SUBMITTED')
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

revoke all on function public.submit_payment_proof(uuid, uuid, text) from public, anon;
grant execute on function public.submit_payment_proof(uuid, uuid, text) to authenticated;

-- 2. Close transition bypass in validate_order_transition
-- Defense-in-depth: Remove direct HOLD -> PAYMENT_UNDER_REVIEW for BANK_TRANSFER_V1.
-- The only valid proof path from HOLD is PAYMENT_PROOF_SUBMITTED via finalize_payment_proof.
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

      if old.status = 'DRAFT' and new.status not in ('HOLD', 'PROFORMA_ISSUED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PROFORMA_ISSUED' and new.status not in ('HOLD', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      -- Direct HOLD -> PAYMENT_UNDER_REVIEW is strictly forbidden. HOLD can only advance to PAYMENT_PROOF_SUBMITTED.
      if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'EXPIRED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_PROOF_SUBMITTED' and new.status not in ('PAYMENT_UNDER_REVIEW', 'PAID', 'PAYMENT_REJECTED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAYMENT_UNDER_REVIEW' and new.status not in ('PAID', 'PAYMENT_REJECTED', 'VOID') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PAID' and new.status not in ('FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'FULFILLMENT_IN_PROGRESS' and new.status not in ('PARTIALLY_DELIVERED', 'COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      if old.status = 'PARTIALLY_DELIVERED' and new.status not in ('COMPLETED', 'DISPUTED') then raise exception 'invalid_order_transition'; end if;
      -- data-model §7.1 defines no exit from DISPUTED for v1 rows: fail closed until one is specified.
      if old.status = 'DISPUTED' then raise exception 'invalid_order_transition'; end if;
      if old.status = 'CONFIRMED' then raise exception 'invalid_order_transition'; end if;
      if old.status in ('COMPLETED', 'EXPIRED', 'CANCELLED', 'PAYMENT_REJECTED', 'VOID') then raise exception 'terminal_order_cannot_change'; end if;

      -- The hold window is the reservation's own (copied expires_at); never defaulted here.
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
