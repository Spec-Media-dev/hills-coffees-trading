-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 016 — Finance Confirmation & Delivery Handoff
-- Rollback:  supabase/rollback/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql
-- Postflight: supabase/maintenance/20261002_feature_016_review_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT:
--   1. Transaction-wrapped duplicate logical-key preflight and migration to null-safe uniqueness:
--      uq_inventory_positions_null_safe UNIQUE NULLS NOT DISTINCT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id).
--   2. Preserve September 22 admin_review_payment(uuid, boolean, text) body and ACLs with read-only BANK_TRANSFER_V1 pre-lock fence.
--   3. Unified atomic RPC public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) for CONFIRMED and REJECTED decisions:
--      - Exact proof binding (via payment_proof_upload_intents.finalized_proof_id)
--      - Authoritative CONFIRMED proforma four-pointer binding
--      - Deterministic locking and signed inventory conservation (Δseller_available = -q, Δseller_reserved = -q, Δbuyer_available = +q)
--      - Feature 009 FULFILLMENT shipment creation (1 per fulfillment group, filtered lines, address_lines mapping, frozen delivery method)
--      - Tax invoice exact-once issuance on CONFIRM; title transfer ownership events
--      - Terminal rejection with backing position before offer release
--      - Same-key and different-key replay integrity validation
--      - Feature 016 audit log writes
--   4. Notification triggers:
--      - Extend commerce_notify_order_status_change for PAYMENT_PROOF_SUBMITTED, PAID (PAYMENT_CONFIRMED), and PAYMENT_REJECTED
--      - Create commerce_notify_shipment_status_change() / trg_notify_shipment_status_change for FULFILLMENT DRAFT -> REQUESTED
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Preflight & Null-Safe Unique Constraint (T007) ─────────────────────────────────────────

do $preflight$
declare
  v_dup_count int;
  v_details text;
begin
  select count(*), coalesce(string_agg(
    format('(lot=%s, owner=%s, wh=%s, loc=%s, count=%s)', lot_id, owner_organization_id, warehouse_id, coalesce(warehouse_location_id::text, 'null'), c),
    '; '
  ), 'none')
  into v_dup_count, v_details
  from (
    select lot_id, owner_organization_id, warehouse_id, warehouse_location_id, count(*) as c
    from public.inventory_positions
    group by lot_id, owner_organization_id, warehouse_id, warehouse_location_id
    having count(*) > 1
  ) dups;

  if v_dup_count > 0 then
    raise exception 'migration_aborted: duplicate logical inventory positions detected. Manual reconciliation required: %', v_details;
  end if;
end $preflight$;

do $replace_constraint$
declare
  v_conname text;
begin
  select con.conname into v_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'inventory_positions'
    and con.contype = 'u'
    and array(
      select att.attname::text
      from unnest(con.conkey) with ordinality as k(attnum, ord)
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k.attnum
      order by k.ord
    ) = array['lot_id', 'owner_organization_id', 'warehouse_id', 'warehouse_location_id'];

  if v_conname is not null then
    execute format('alter table public.inventory_positions drop constraint %I;', v_conname);
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'inventory_positions'
      and con.conname = 'uq_inventory_positions_null_safe'
  ) then
    alter table public.inventory_positions
      add constraint uq_inventory_positions_null_safe
      unique nulls not distinct (lot_id, owner_organization_id, warehouse_id, warehouse_location_id);
  end if;
end $replace_constraint$;

-- Persist warehouse provenance on the ownership ledger. Legacy events remain NULL; every
-- Feature 016 FINANCE_CONFIRMATION event carries the source reservation position exactly.
alter table public.inventory_ownership_events
  add column warehouse_id uuid references public.warehouses(id),
  add column warehouse_location_id uuid references public.warehouse_locations(id);

-- ── 2. Legacy admin_review_payment Pre-Lock Fence (T008) ──────────────────────────────────────

create or replace function public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_commerce_flow text;
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_reservation public.inventory_reservations%rowtype;

  v_item record;
  v_position public.inventory_positions%rowtype;

  v_rate numeric(7,4) := 0;
  v_line_base numeric(14,2);
  v_line_commission numeric(14,2);

  v_correlation_id uuid;
begin

  if not public.is_finance_operator() then
    raise exception 'forbidden';
  end if;


  -- Feature 016: read-only BANK_TRANSFER_V1 fence. This precedes the legacy workflow locks and mutates nothing.
  select o.commerce_flow into v_commerce_flow
  from public.payments p
  join public.orders o on o.id = p.order_id
  where p.id = p_payment_id;

  if v_commerce_flow = 'BANK_TRANSFER_V1' then
    raise exception 'endpoint_deprecated_use_finance_review_bank_transfer_v1';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;

  select *
  into v_order
  from public.orders
  where id = v_payment.order_id
  for update;

  -- Idempotent payment review.
  if v_payment.status = 'CONFIRMED'
     and v_order.status in (
       'PAID',
       'FULFILLMENT_IN_PROGRESS',
       'PARTIALLY_DELIVERED',
       'COMPLETED',
       'DISPUTED'
     )
  then
    return;
  end if;

  v_correlation_id :=
    coalesce(
      v_payment.correlation_id,
      v_order.correlation_id,
      gen_random_uuid()
    );

  perform set_config(
    'app.correlation_id',
    v_correlation_id::text,
    true
  );

  insert into public.payment_reviews(
    payment_id,
    reviewer_user_id,
    decision,
    reason
  )
  values (
    p_payment_id,
    auth.uid(),
    case
      when p_approved
      then 'CONFIRMED'
      else 'REJECTED'
    end,
    p_reason
  );

  if not p_approved then

    update public.payments
    set
      status = 'REJECTED',
      rejected_reason = p_reason
    where id = p_payment_id;

    perform set_config(
      'app.internal_transition',
      'true',
      true
    );

    update public.orders
    set status = 'HOLD'
    where id = v_order.id
      and status in (
        'PAYMENT_PROOF_SUBMITTED',
        'PAYMENT_UNDER_REVIEW'
      );

    return;

  end if;

  -- ═══ Feature 008 T009/T017 (RUN E — Stripe provider decision) — Option A's trusted-funding gate. ═══
  -- Applies ONLY to the Stripe/provider path (payment_method = 'PROVIDER'). Every pre-existing and
  -- currently-live settlement path has payment_method = NULL (nothing has ever set it), so this
  -- comparison is NULL, not TRUE, under SQL's three-valued logic and the condition never fires for them
  -- — a complete no-op for every existing caller. `p_approved = true` (the finance operator's own
  -- "Approve Settlement" decision) remains necessary but is no longer SUFFICIENT on its own for a
  -- provider-funded payment: verified Stripe funding evidence must already exist.
  if v_payment.payment_method = 'PROVIDER' and v_payment.trusted_funding_confirmed_at is null then
    raise exception 'trusted_funding_required';
  end if;

  select *
  into v_reservation
  from public.inventory_reservations
  where order_id = v_order.id
    and status = 'ACTIVE'
  for update;

  if v_reservation.id is null then
    raise exception 'active_reservation_missing';
  end if;

  if v_reservation.expires_at <= now() then
    raise exception 'reservation_expired';
  end if;

  select coalesce(
    ofn.commission_percentage_snapshot,
    0
  )
  into v_rate
  from public.order_financials ofn
  where ofn.order_id = v_order.id;

  for v_item in

    select
      oi.*,

      iri.quantity_kg
        as reserved_quantity,

      iri.inventory_position_id,

      co.seller_type,

      co.seller_organization_id
        as offer_seller,

      co.warehouse_id
        as offer_warehouse_id,

      co.warehouse_location_id
        as offer_warehouse_location_id

    from public.order_items oi

    join public.inventory_reservation_items iri
      on iri.offer_id = oi.offer_id

    join public.inventory_reservations ir
      on ir.id = iri.reservation_id
     and ir.order_id = oi.order_id

    join public.coffee_offers co
      on co.id = oi.offer_id

    where oi.order_id = v_order.id
      and ir.id = v_reservation.id

    order by oi.id

  loop

    -- Consistent lock order:
    -- Offer then inventory.
    perform 1
    from public.coffee_offers
    where id = v_item.offer_id
    for update;

    if v_item.inventory_position_id
       is not null
    then

      select *
      into v_position
      from public.inventory_positions
      where id = v_item.inventory_position_id
      for update;

    else

      select *
      into v_position
      from public.inventory_positions ip
      where ip.lot_id = v_item.lot_id
        and ip.owner_organization_id =
            v_item.offer_seller
        and ip.warehouse_id =
            v_item.offer_warehouse_id
        and ip.warehouse_location_id
            is not distinct from
            v_item.offer_warehouse_location_id
      order by ip.created_at
      limit 1
      for update;

    end if;

    if v_position.id is null
       or v_position.available_quantity_kg
          < v_item.reserved_quantity
       or v_position.reserved_quantity_kg
          < v_item.reserved_quantity
    then
      raise exception
        'seller_inventory_position_invalid';
    end if;

    -- Seller loses quantity AND active reservation.
    update public.inventory_positions
    set
      available_quantity_kg =
        available_quantity_kg
        - v_item.reserved_quantity,

      reserved_quantity_kg =
        reserved_quantity_kg
        - v_item.reserved_quantity,

      updated_at = now()
    where id = v_position.id;

    -- Buyer receives title/custody at same warehouse.
    insert into public.inventory_positions(
      lot_id,
      owner_organization_id,
      warehouse_id,
      warehouse_location_id,
      available_quantity_kg,
      reserved_quantity_kg
    )
    values (
      v_item.lot_id,
      v_order.buyer_organization_id,
      v_position.warehouse_id,
      v_position.warehouse_location_id,
      v_item.reserved_quantity,
      0
    )
    on conflict (
      lot_id,
      owner_organization_id,
      warehouse_id,
      warehouse_location_id
    )
    do update set
      available_quantity_kg =
        public.inventory_positions.available_quantity_kg
        + excluded.available_quantity_kg,

      updated_at = now();

    insert into public.inventory_ownership_events(
      lot_id,
      from_organization_id,
      to_organization_id,
      order_item_id,
      quantity_kg,
      event_type,
      created_by,
      correlation_id,
      reason
    )
    values (
      v_item.lot_id,
      v_item.offer_seller,
      v_order.buyer_organization_id,
      v_item.id,
      v_item.reserved_quantity,

      case
        when v_item.seller_type_snapshot = 'HILLS'
        then 'SALE'
        else 'RESALE'
      end,

      auth.uid(),
      v_correlation_id,
      'SETTLEMENT_CONFIRMED'
    );

    -- Listing remains available after partial fill.
    update public.coffee_offers
    set
      filled_quantity_kg =
        filled_quantity_kg
        + v_item.reserved_quantity,

      reserved_quantity_kg =
        reserved_quantity_kg
        - v_item.reserved_quantity,

      status =
        case
          when (
            filled_quantity_kg
            + v_item.reserved_quantity
          ) >= quantity_kg
          then 'SOLD_OUT'
          else 'PARTIALLY_FILLED'
        end,

      is_visible =
        case
          when (
            filled_quantity_kg
            + v_item.reserved_quantity
          ) >= quantity_kg
          then false
          else true
        end,

      updated_at = now()

    where id = v_item.offer_id;

    -- Purchased inventory remains in Hills-approved custody
    -- until delivered/released.
    insert into public.storage_allocations(
      order_item_id,
      owner_organization_id,
      lot_id,
      warehouse_id,
      warehouse_location_id,
      quantity_kg,
      released_quantity_kg,
      status
    )
    values (
      v_item.id,
      v_order.buyer_organization_id,
      v_item.lot_id,
      v_position.warehouse_id,
      v_position.warehouse_location_id,
      v_item.reserved_quantity,
      0,
      'STORED'
    )
    on conflict do nothing;

    if v_item.seller_type_snapshot =
       'MEMBER_SELLER'
    then

      v_line_base :=
        round(
          v_item.reserved_quantity
          * v_item.unit_price_per_kg,
          2
        );

      v_line_commission :=
        round(
          v_line_base
          * v_rate
          / 100,
          2
        );

      insert into public.payouts(
        order_id,
        seller_organization_id,
        amount
      )
      values (
        v_order.id,
        v_item.seller_organization_id,
        v_line_base
        - v_line_commission
      )
      on conflict (
        order_id,
        seller_organization_id
      )
      do update set
        amount =
          public.payouts.amount
          + excluded.amount;

    end if;

  end loop;

  update public.inventory_reservations
  set
    status = 'CONSUMED',
    consumed_at = now()
  where id = v_reservation.id;

  update public.payments
  set
    status = 'CONFIRMED',
    correlation_id = v_correlation_id,
    confirmed_by = auth.uid(),
    confirmed_at = now()
  where id = p_payment_id;

  update public.proforma_invoices
  set status = 'PAID'
  where order_id = v_order.id;

  perform set_config(
    'app.internal_transition',
    'true',
    true
  );

  update public.orders
  set
    status = 'PAID',
    correlation_id = v_correlation_id
  where id = v_order.id;

end;
$function$;

-- Grants unchanged from the live function (reproduced for completeness/clarity, not a behavior change).
revoke all on function public.admin_review_payment(uuid, boolean, text) from public;
revoke all on function public.admin_review_payment(uuid, boolean, text) from anon;
grant execute on function public.admin_review_payment(uuid, boolean, text) to authenticated;

comment on function public.admin_review_payment(uuid, boolean, text) is
  'Feature 007/008: finance-operator-only settlement decision. Feature 008 T009/T017 (RUN E) added ONE precondition — a PROVIDER-method payment additionally requires trusted_funding_confirmed_at before p_approved=true is honored (Option A: trusted event + human decision, both required). NULL-method (every existing/manual-flow) payment is completely unaffected. Every other line is unchanged from the pre-Feature-008 function body.';

-- ── 3. Single RPC: public.finance_review_bank_transfer_v1 (T009-T012) ─────────────────────────

create or replace function public.finance_review_bank_transfer_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_decision text,
  p_notes text default null,
  p_request_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_request_id uuid;
  v_review_id uuid;
  v_existing_review public.payment_reviews%rowtype;
  v_original_review public.payment_reviews%rowtype;
  v_review_count integer;

  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_reservation public.inventory_reservations%rowtype;
  v_proforma public.proforma_invoices%rowtype;
  v_intent public.payment_proof_upload_intents%rowtype;
  v_proof public.payment_proofs%rowtype;

  v_group record;
  v_group_count integer := 0;
  v_shipment_id uuid;
  v_shipment_ids uuid[] := array[]::uuid[];
  v_address_line text;
  v_invoice_number text;
  v_order_item_id uuid;

  v_iri record;
  v_seller_pos public.inventory_positions%rowtype;
  v_buyer_key text;
  v_buyer_keys text[] := array[]::text[];
  v_all_position_ids uuid[] := array[]::uuid[];
  v_lot_id uuid;
  v_wh_id uuid;
  v_loc_id uuid;

  v_expected_lines_count integer;
  v_actual_lines_count integer;
  v_expected_shipment_count integer;
  v_actual_shipment_count integer;
  v_tax_invoice record;

  v_result jsonb;
begin
  -- 1. Actor & authorization checks
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  if not public.mfa_satisfied() then
    raise exception 'mfa_required';
  end if;

  if not (public.is_finance_operator() or public.is_platform_admin()) then
    raise exception 'forbidden';
  end if;

  if p_decision is null or p_decision not in ('CONFIRMED', 'REJECTED') then
    raise exception 'invalid_decision';
  end if;

  if p_decision = 'REJECTED' and nullif(trim(p_notes), '') is null then
    raise exception 'rejection_notes_required';
  end if;

  v_request_id := coalesce(p_request_id, gen_random_uuid());

  -- 2. Lock orders then payments in strict order
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;

  if v_payment.order_id <> v_order.id then
    raise exception 'proof_payment_mismatch';
  end if;

  if v_order.commerce_flow <> 'BANK_TRANSFER_V1' then
    raise exception 'invalid_commerce_flow';
  end if;

  -- 3. Replay-first inspection
  select * into v_existing_review from public.payment_reviews where request_id = v_request_id;

  -- Case A: Same request ID replay
  if v_existing_review.id is not null then
    if v_existing_review.payment_id <> p_payment_id
       or v_existing_review.decision <> p_decision
       or v_existing_review.reviewer_user_id <> auth.uid() then
      raise exception 'request_id_conflict';
    end if;

    if not public.finance_terminal_review_integrity(p_order_id, p_payment_id, p_decision) then
      raise exception 'persisted_review_integrity_error';
    end if;

    if p_decision = 'CONFIRMED' then
      -- Complete CONFIRMED persisted terminal validator
      if v_order.status <> 'PAID' or v_payment.status <> 'CONFIRMED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_reservation from public.inventory_reservations where order_id = p_order_id;
      if v_reservation.id is null or v_reservation.status <> 'CONSUMED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_intent from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED';
      if v_intent.id is null or v_intent.finalized_proof_id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_proof from public.payment_proofs where id = v_intent.finalized_proof_id and payment_id = p_payment_id;
      if v_proof.id is null or v_proof.status <> 'ACCEPTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_tax_invoice from public.tax_invoices where order_id = p_order_id and proforma_id = v_order.current_proforma_id;
      if v_tax_invoice.id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select count(*) into v_expected_lines_count from public.inventory_reservation_items where reservation_id = v_reservation.id;
      select count(*) into v_actual_lines_count from public.inventory_ownership_events where correlation_id = p_order_id;
      if v_expected_lines_count = 0 or v_actual_lines_count < v_expected_lines_count then
        raise exception 'persisted_review_integrity_error';
      end if;

      select count(*) into v_expected_shipment_count from public.proforma_fulfillment_groups where proforma_id = v_order.current_proforma_id;
      select count(*), array_agg(id) into v_actual_shipment_count, v_shipment_ids from public.order_shipments where order_id = p_order_id and shipment_kind = 'FULFILLMENT' and status = 'REQUESTED';
      if v_expected_shipment_count = 0 or v_actual_shipment_count <> v_expected_shipment_count then
        raise exception 'persisted_review_integrity_error';
      end if;

      return jsonb_build_object(
        'orderId', v_order.id,
        'order_id', v_order.id,
        'orderCode', v_order.order_code,
        'order_code', v_order.order_code,
        'paymentId', v_payment.id,
        'payment_id', v_payment.id,
        'decision', 'CONFIRMED',
        'orderStatus', 'PAID',
        'order_status', 'PAID',
        'paymentStatus', 'CONFIRMED',
        'payment_status', 'CONFIRMED',
        'reservationStatus', 'CONSUMED',
        'reservation_status', 'CONSUMED',
        'taxInvoiceNumber', v_tax_invoice.invoice_number,
        'tax_invoice_number', v_tax_invoice.invoice_number,
        'shipmentIds', v_shipment_ids,
        'shipment_ids', v_shipment_ids,
        'confirmedAt', v_existing_review.created_at,
        'confirmed_at', v_existing_review.created_at,
        'requestId', v_request_id,
        'request_id', v_request_id
      );
    else
      -- Complete REJECTED persisted terminal validator
      if v_order.status <> 'PAYMENT_REJECTED' or v_payment.status <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_reservation from public.inventory_reservations where order_id = p_order_id;
      if v_reservation.id is null or v_reservation.status <> 'RELEASED' or v_reservation.release_reason <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_intent from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED';
      if v_intent.id is null or v_intent.finalized_proof_id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_proof from public.payment_proofs where id = v_intent.finalized_proof_id and payment_id = p_payment_id;
      if v_proof.id is null or v_proof.status <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      if exists (select 1 from public.tax_invoices where order_id = p_order_id)
         or exists (select 1 from public.inventory_ownership_events where correlation_id = p_order_id)
         or exists (select 1 from public.order_shipments where order_id = p_order_id and shipment_kind = 'FULFILLMENT') then
        raise exception 'persisted_review_integrity_error';
      end if;

      return jsonb_build_object(
        'orderId', v_order.id,
        'order_id', v_order.id,
        'orderCode', v_order.order_code,
        'order_code', v_order.order_code,
        'paymentId', v_payment.id,
        'payment_id', v_payment.id,
        'decision', 'REJECTED',
        'orderStatus', 'PAYMENT_REJECTED',
        'order_status', 'PAYMENT_REJECTED',
        'paymentStatus', 'REJECTED',
        'payment_status', 'REJECTED',
        'reservationStatus', 'RELEASED',
        'reservation_status', 'RELEASED',
        'rejectedAt', v_existing_review.created_at,
        'rejected_at', v_existing_review.created_at,
        'requestId', v_request_id,
        'request_id', v_request_id
      );
    end if;
  end if;

  -- Case B: Different request ID on a terminal order
  if v_order.status in ('PAID', 'PAYMENT_REJECTED') then
    select count(*) into v_review_count from public.payment_reviews where payment_id = p_payment_id;
    if v_review_count <> 1 then
      raise exception 'persisted_review_integrity_error';
    end if;

    select * into v_original_review from public.payment_reviews where payment_id = p_payment_id order by created_at asc limit 1;
    if v_original_review.id is null then
      raise exception 'persisted_review_integrity_error';
    end if;

    if v_original_review.decision <> p_decision then
      raise exception 'order_already_finalized';
    end if;

    if not public.finance_terminal_review_integrity(p_order_id, p_payment_id, p_decision) then
      raise exception 'persisted_review_integrity_error';
    end if;

    if p_decision = 'CONFIRMED' then
      if v_order.status <> 'PAID' or v_payment.status <> 'CONFIRMED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_reservation from public.inventory_reservations where order_id = p_order_id;
      if v_reservation.id is null or v_reservation.status <> 'CONSUMED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_intent from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED';
      if v_intent.id is null or v_intent.finalized_proof_id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_proof from public.payment_proofs where id = v_intent.finalized_proof_id and payment_id = p_payment_id;
      if v_proof.id is null or v_proof.status <> 'ACCEPTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_tax_invoice from public.tax_invoices where order_id = p_order_id and proforma_id = v_order.current_proforma_id;
      if v_tax_invoice.id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select count(*) into v_expected_lines_count from public.inventory_reservation_items where reservation_id = v_reservation.id;
      select count(*) into v_actual_lines_count from public.inventory_ownership_events where correlation_id = p_order_id;
      if v_expected_lines_count = 0 or v_actual_lines_count < v_expected_lines_count then
        raise exception 'persisted_review_integrity_error';
      end if;

      select count(*), array_agg(id) into v_actual_shipment_count, v_shipment_ids from public.order_shipments where order_id = p_order_id and shipment_kind = 'FULFILLMENT' and status = 'REQUESTED';
      select count(*) into v_expected_shipment_count from public.proforma_fulfillment_groups where proforma_id = v_order.current_proforma_id;
      if v_expected_shipment_count = 0 or v_actual_shipment_count <> v_expected_shipment_count then
        raise exception 'persisted_review_integrity_error';
      end if;

      return jsonb_build_object(
        'orderId', v_order.id,
        'order_id', v_order.id,
        'orderCode', v_order.order_code,
        'order_code', v_order.order_code,
        'paymentId', v_payment.id,
        'payment_id', v_payment.id,
        'decision', 'CONFIRMED',
        'orderStatus', 'PAID',
        'order_status', 'PAID',
        'paymentStatus', 'CONFIRMED',
        'payment_status', 'CONFIRMED',
        'reservationStatus', 'CONSUMED',
        'reservation_status', 'CONSUMED',
        'taxInvoiceNumber', v_tax_invoice.invoice_number,
        'tax_invoice_number', v_tax_invoice.invoice_number,
        'shipmentIds', v_shipment_ids,
        'shipment_ids', v_shipment_ids,
        'confirmedAt', v_original_review.created_at,
        'confirmed_at', v_original_review.created_at,
        'requestId', v_original_review.request_id,
        'request_id', v_original_review.request_id
      );
    else
      if v_order.status <> 'PAYMENT_REJECTED' or v_payment.status <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_reservation from public.inventory_reservations where order_id = p_order_id;
      if v_reservation.id is null or v_reservation.status <> 'RELEASED' or v_reservation.release_reason <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_intent from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED';
      if v_intent.id is null or v_intent.finalized_proof_id is null then
        raise exception 'persisted_review_integrity_error';
      end if;

      select * into v_proof from public.payment_proofs where id = v_intent.finalized_proof_id and payment_id = p_payment_id;
      if v_proof.id is null or v_proof.status <> 'REJECTED' then
        raise exception 'persisted_review_integrity_error';
      end if;

      if exists (select 1 from public.tax_invoices where order_id = p_order_id)
         or exists (select 1 from public.inventory_ownership_events where correlation_id = p_order_id)
         or exists (select 1 from public.order_shipments where order_id = p_order_id and shipment_kind = 'FULFILLMENT') then
        raise exception 'persisted_review_integrity_error';
      end if;

      return jsonb_build_object(
        'orderId', v_order.id,
        'order_id', v_order.id,
        'orderCode', v_order.order_code,
        'order_code', v_order.order_code,
        'paymentId', v_payment.id,
        'payment_id', v_payment.id,
        'decision', 'REJECTED',
        'orderStatus', 'PAYMENT_REJECTED',
        'order_status', 'PAYMENT_REJECTED',
        'paymentStatus', 'REJECTED',
        'payment_status', 'REJECTED',
        'reservationStatus', 'RELEASED',
        'reservation_status', 'RELEASED',
        'rejectedAt', v_original_review.created_at,
        'rejected_at', v_original_review.created_at,
        'requestId', v_original_review.request_id,
        'request_id', v_original_review.request_id
      );
    end if;
  end if;

  -- 4. Initial Mutation Path — Eligibility & Snapshot Assertions
  perform public.commerce_request_begin(v_request_id, 'finance_review_bank_transfer_v1', p_order_id);

  if v_order.status <> 'PAYMENT_PROOF_SUBMITTED' then
    raise exception 'reservation_not_review_hold';
  end if;

  if v_payment.status <> 'PROOF_SUBMITTED' then
    raise exception 'invalid_payment_status';
  end if;

  select * into v_reservation
  from public.inventory_reservations
  where order_id = p_order_id;

  if v_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  if v_reservation.status <> 'REVIEW_HOLD' then
    raise exception 'reservation_not_review_hold';
  end if;

  -- Four-pointer equality check:
  -- payments.proforma_id = orders.current_proforma_id = inventory_reservations.proforma_id = proforma_invoices.id
  if v_payment.proforma_id is null
     or v_order.current_proforma_id is null
     or v_reservation.proforma_id is null
     or v_payment.proforma_id is distinct from v_order.current_proforma_id
     or v_payment.proforma_id is distinct from v_reservation.proforma_id then
    raise exception 'authoritative_proforma_mismatch';
  end if;

  select * into v_proforma
  from public.proforma_invoices
  where id = v_payment.proforma_id
    and order_id = p_order_id;

  if v_proforma.id is null then
    raise exception 'proforma_not_found';
  end if;

  if v_proforma.status <> 'CONFIRMED' then
    raise exception 'proforma_not_confirmed';
  end if;

  -- Exact upload intent and proof binding
  select * into v_intent
  from public.payment_proof_upload_intents
  where order_id = p_order_id
    and status = 'FINALIZED';

  if v_intent.id is null or v_intent.finalized_proof_id is null then
    raise exception 'finalized_upload_intent_not_found';
  end if;

  select * into v_proof
  from public.payment_proofs
  where id = v_intent.finalized_proof_id
    and payment_id = p_payment_id;

  if v_proof.id is null then
    raise exception 'finalized_proof_not_found';
  end if;

  if v_proof.status <> 'SUBMITTED' then
    raise exception 'proof_payment_mismatch';
  end if;

  -- 5. Set transaction-local transition context BEFORE first business write
  perform set_config('app.internal_transition', 'true', true);

  if p_decision = 'CONFIRMED' then
    -- Exact proof mutation: status = 'ACCEPTED' (no updated_at column on payment_proofs)
    update public.payment_proofs
    set status = 'ACCEPTED'
    where id = v_intent.finalized_proof_id;

    -- Payment review record
    insert into public.payment_reviews (
      payment_id, reviewer_user_id, decision, reason, request_id, created_at
    ) values (
      p_payment_id, auth.uid(), 'CONFIRMED', p_notes, v_request_id, clock_timestamp()
    ) returning id into v_review_id;

    -- Inventory Reservation Consumed
    update public.inventory_reservations
    set status = 'CONSUMED', consumed_at = clock_timestamp()
    where id = v_reservation.id;

    -- Inventory conservation and locking protocol
    -- Derive all distinct buyer keys and lock them in sorted order
    -- Deduplicate logical buyer keys first, then order by expressions available to the outer query.
    -- This is valid PostgreSQL and preserves NULL-location serialization via the sentinel UUID.
    for v_iri in
      select buyer_keys.lot_id, buyer_keys.warehouse_id, buyer_keys.warehouse_location_id
      from (
        select distinct ip.lot_id, ip.warehouse_id, ip.warehouse_location_id
        from public.inventory_reservation_items iri
        join public.inventory_positions ip on ip.id = iri.inventory_position_id
        where iri.reservation_id = v_reservation.id
      ) as buyer_keys
      order by buyer_keys.lot_id, buyer_keys.warehouse_id,
        coalesce(buyer_keys.warehouse_location_id, '00000000-0000-0000-0000-000000000000'::uuid)
    loop
      v_buyer_key := format('%s:%s:%s:%s', v_iri.lot_id, v_order.buyer_organization_id, v_iri.warehouse_id, coalesce(v_iri.warehouse_location_id::text, '00000000-0000-0000-0000-000000000000'));
      perform pg_advisory_xact_lock(hashtext(v_buyer_key)::bigint);
    end loop;

    -- Compatible global hierarchy with checkout: lock all offers first, then inventory positions.
    perform 1
    from public.coffee_offers co
    join public.inventory_reservation_items iri on iri.offer_id = co.id
    where iri.reservation_id = v_reservation.id
    order by co.id asc
    for update;

    -- Collect all position IDs (source and existing buyer) and lock globally in ascending order
    select array_agg(id order by id asc) into v_all_position_ids
    from (
      select iri.inventory_position_id as id
      from public.inventory_reservation_items iri
      where iri.reservation_id = v_reservation.id
      union
      select bp.id
      from public.inventory_reservation_items iri
      join public.inventory_positions sp on sp.id = iri.inventory_position_id
      join public.inventory_positions bp
        on bp.lot_id = sp.lot_id
       and bp.owner_organization_id = v_order.buyer_organization_id
       and bp.warehouse_id = sp.warehouse_id
       and bp.warehouse_location_id is not distinct from sp.warehouse_location_id
      where iri.reservation_id = v_reservation.id
    ) pos_ids;

    if v_all_position_ids is not null and array_length(v_all_position_ids, 1) > 0 then
      perform id from public.inventory_positions where id = any(v_all_position_ids) order by id asc for update;
    end if;

    -- Mutate positions, record ownership events, and update offers
    for v_iri in
      select
        iri.offer_id,
        iri.inventory_position_id,
        iri.quantity_kg,
        pii.order_item_id,
        pii.seller_type_snapshot
      from public.inventory_reservation_items iri
      join public.proforma_invoice_items pii
        on pii.proforma_id = v_proforma.id
       and pii.offer_id = iri.offer_id
      where iri.reservation_id = v_reservation.id
      order by iri.offer_id
    loop
      select * into v_seller_pos from public.inventory_positions where id = v_iri.inventory_position_id for update;
      if v_seller_pos.id is null then
        raise exception 'seller_available_insufficient';
      end if;

      if v_seller_pos.available_quantity_kg < v_iri.quantity_kg then
        raise exception 'seller_available_insufficient';
      end if;

      if v_seller_pos.reserved_quantity_kg < v_iri.quantity_kg then
        raise exception 'seller_reserved_insufficient';
      end if;

      -- Seller position: available -= q, reserved -= q
      update public.inventory_positions
      set available_quantity_kg = available_quantity_kg - v_iri.quantity_kg,
          reserved_quantity_kg = reserved_quantity_kg - v_iri.quantity_kg,
          updated_at = clock_timestamp()
      where id = v_seller_pos.id;

      -- Buyer position: null-safe upsert available += q
      insert into public.inventory_positions (
        lot_id, owner_organization_id, warehouse_id, warehouse_location_id,
        available_quantity_kg, reserved_quantity_kg, updated_at
      ) values (
        v_seller_pos.lot_id, v_order.buyer_organization_id, v_seller_pos.warehouse_id, v_seller_pos.warehouse_location_id,
        v_iri.quantity_kg, 0, clock_timestamp()
      )
      on conflict (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)
      do update set
        available_quantity_kg = public.inventory_positions.available_quantity_kg + excluded.available_quantity_kg,
        updated_at = clock_timestamp();

      -- Ownership title transfer event
      insert into public.inventory_ownership_events (
        lot_id, from_organization_id, to_organization_id, order_item_id,
        warehouse_id, warehouse_location_id, quantity_kg, event_type, created_by, correlation_id, reason
      ) values (
        v_seller_pos.lot_id,
        v_seller_pos.owner_organization_id,
        v_order.buyer_organization_id,
        v_iri.order_item_id,
        v_seller_pos.warehouse_id,
        v_seller_pos.warehouse_location_id,
        v_iri.quantity_kg,
        case when v_iri.seller_type_snapshot = 'HILLS' then 'SALE' else 'RESALE' end,
        auth.uid(),
        p_order_id,
        'FINANCE_CONFIRMATION'
      );

      -- Buyer custody must exist before Feature 009 delivery reservation can progress.
      insert into public.storage_allocations (
        order_item_id, owner_organization_id, lot_id, warehouse_id, warehouse_location_id,
        quantity_kg, released_quantity_kg, status
      ) values (
        v_iri.order_item_id, v_order.buyer_organization_id, v_seller_pos.lot_id,
        v_seller_pos.warehouse_id, v_seller_pos.warehouse_location_id,
        v_iri.quantity_kg, 0, 'STORED'
      ) on conflict do nothing;

      -- Preserve effective offer semantics: final consumption must leave no empty published listing.
      update public.coffee_offers
      set reserved_quantity_kg = reserved_quantity_kg - v_iri.quantity_kg,
          filled_quantity_kg = filled_quantity_kg + v_iri.quantity_kg,
          status = case
            when filled_quantity_kg + v_iri.quantity_kg >= quantity_kg then 'SOLD_OUT'
            else 'PARTIALLY_FILLED'
          end,
          is_visible = case
            when filled_quantity_kg + v_iri.quantity_kg >= quantity_kg then false
            else true
          end,
          updated_at = clock_timestamp()
      where id = v_iri.offer_id;
    end loop;

    -- Issue Final Tax Invoice
    v_invoice_number := public.next_tax_invoice_code();
    insert into public.tax_invoices (
      order_id, proforma_id, invoice_number, status, snapshot, issued_by, issued_at_ts
    ) values (
      p_order_id,
      v_proforma.id,
      v_invoice_number,
      'ISSUED',
      jsonb_build_object(
        'merchandise_gross', v_proforma.merchandise_gross,
        'discount_total', v_proforma.discount_total,
        'merchandise_net', v_proforma.merchandise_net,
        'shipping_total', v_proforma.shipping_total,
        'vat_total', v_proforma.vat_total,
        'buyer_total', v_proforma.buyer_total,
        'currency', v_proforma.currency,
        'destination_snapshot', v_proforma.destination_snapshot,
        'confirmed_at', clock_timestamp()
      ),
      auth.uid(),
      clock_timestamp()
    );

    -- Automatic Feature 009 FULFILLMENT Shipment Handoff (one per fulfillment group)
    for v_group in
      select * from public.proforma_fulfillment_groups
      where proforma_id = v_proforma.id
      order by id asc
    loop
      v_group_count := v_group_count + 1;

      v_address_line := array_to_string(ARRAY(
        select jsonb_array_elements_text(coalesce(v_proforma.destination_snapshot->'address_lines', '[]'::jsonb))
      ), ', ');
      if nullif(trim(v_address_line), '') is null then
        v_address_line := coalesce(v_proforma.destination_snapshot->>'address_line', 'Standard Delivery');
      end if;

      insert into public.order_shipments (
        order_id, status, shipment_kind, fulfillment_seller_organization_id,
        fulfillment_warehouse_id, proforma_fulfillment_group_id, delivery_method,
        country_code, city, address_line, contact_name, contact_phone,
        shipping_fee, currency, created_by
      ) values (
        p_order_id,
        'DRAFT',
        'FULFILLMENT',
        v_group.seller_organization_id,
        v_group.warehouse_id,
        v_group.id,
        v_group.delivery_method,
        coalesce(v_proforma.destination_snapshot->>'country_code', 'AE'),
        coalesce(v_proforma.destination_snapshot->>'city', 'Dubai'),
        v_address_line,
        coalesce(v_proforma.destination_snapshot->>'contact_name', 'Customer'),
        coalesce(v_proforma.destination_snapshot->>'contact_phone', '+9710000000'),
        v_group.shipping_amount,
        coalesce(v_proforma.currency, 'USD'),
        auth.uid()
      ) returning id into v_shipment_id;

      v_shipment_ids := array_append(v_shipment_ids, v_shipment_id);

      -- Line items strictly belonging to this fulfillment group
      insert into public.shipment_items (
        shipment_id, order_item_id, planned_quantity_kg, delivered_quantity_kg, reserved_quantity_kg
      )
      select v_shipment_id, pii.order_item_id, pii.quantity_kg, 0, 0
      from public.proforma_invoice_items pii
      where pii.proforma_id = v_proforma.id
        and pii.fulfillment_group_id = v_group.id;

      -- Transition FULFILLMENT shipment DRAFT -> REQUESTED
      update public.order_shipments
      set status = 'REQUESTED', updated_at = clock_timestamp()
      where id = v_shipment_id;
    end loop;

    -- Transition payment to CONFIRMED
    update public.payments
    set status = 'CONFIRMED',
        confirmed_by = auth.uid(),
        confirmed_at = clock_timestamp()
    where id = p_payment_id;

    -- Transition order to PAID
    update public.orders
    set status = 'PAID',
        paid_at = clock_timestamp()
    where id = p_order_id;

    -- Build return DTO
    v_result := jsonb_build_object(
      'orderId', v_order.id,
      'order_id', v_order.id,
      'orderCode', v_order.order_code,
      'order_code', v_order.order_code,
      'paymentId', v_payment.id,
      'payment_id', v_payment.id,
      'decision', 'CONFIRMED',
      'orderStatus', 'PAID',
      'order_status', 'PAID',
      'paymentStatus', 'CONFIRMED',
      'payment_status', 'CONFIRMED',
      'reservationStatus', 'CONSUMED',
      'reservation_status', 'CONSUMED',
      'taxInvoiceNumber', v_invoice_number,
      'tax_invoice_number', v_invoice_number,
      'shipmentIds', v_shipment_ids,
      'shipment_ids', v_shipment_ids,
      'confirmedAt', clock_timestamp(),
      'confirmed_at', clock_timestamp(),
      'requestId', v_request_id,
      'request_id', v_request_id
    );

  else
    -- REJECTED branch
    update public.payment_proofs
    set status = 'REJECTED'
    where id = v_intent.finalized_proof_id;

    insert into public.payment_reviews (
      payment_id, reviewer_user_id, decision, reason, request_id, created_at
    ) values (
      p_payment_id, auth.uid(), 'REJECTED', p_notes, v_request_id, clock_timestamp()
    ) returning id into v_review_id;

    -- Compatible global hierarchy with checkout: lock all offers before backing positions.
    perform 1
    from public.coffee_offers co
    join public.inventory_reservation_items iri on iri.offer_id = co.id
    where iri.reservation_id = v_reservation.id
    order by co.id asc
    for update;

    perform 1
    from public.inventory_positions ip
    join public.inventory_reservation_items iri on iri.inventory_position_id = ip.id
    where iri.reservation_id = v_reservation.id
    order by ip.id asc
    for update;

    -- Decrement backing positions before coffee offers
    for v_iri in
      select iri.offer_id, iri.inventory_position_id, iri.quantity_kg
      from public.inventory_reservation_items iri
      where iri.reservation_id = v_reservation.id
      order by iri.offer_id
    loop
      update public.inventory_positions
      set reserved_quantity_kg = reserved_quantity_kg - v_iri.quantity_kg,
          updated_at = clock_timestamp()
      where id = v_iri.inventory_position_id;

      update public.coffee_offers
      set reserved_quantity_kg = reserved_quantity_kg - v_iri.quantity_kg,
          updated_at = clock_timestamp()
      where id = v_iri.offer_id;
    end loop;

    update public.inventory_reservations
    set status = 'RELEASED',
        release_reason = 'REJECTED',
        released_at = clock_timestamp()
    where id = v_reservation.id;

    update public.payments
    set status = 'REJECTED',
        rejected_by = auth.uid(),
        rejected_at = clock_timestamp(),
        rejected_reason = p_notes
    where id = p_payment_id;

    update public.orders
    set status = 'PAYMENT_REJECTED'
    where id = p_order_id;

    v_result := jsonb_build_object(
      'orderId', v_order.id,
      'order_id', v_order.id,
      'orderCode', v_order.order_code,
      'order_code', v_order.order_code,
      'paymentId', v_payment.id,
      'payment_id', v_payment.id,
      'decision', 'REJECTED',
      'orderStatus', 'PAYMENT_REJECTED',
      'order_status', 'PAYMENT_REJECTED',
      'paymentStatus', 'REJECTED',
      'payment_status', 'REJECTED',
      'reservationStatus', 'RELEASED',
      'reservation_status', 'RELEASED',
      'rejectedAt', clock_timestamp(),
      'rejected_at', clock_timestamp(),
      'requestId', v_request_id,
      'request_id', v_request_id
    );
  end if;

  -- Approved live-suite failpoint is transaction-local and proves rollback before commit.
  if current_setting('app.f016_test_failpoint', true) = 'after_review_mutations' then
    raise exception 'f016_test_failpoint_after_review_mutations';
  end if;

  -- 6. Audit log write (T012)
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, new_data
  ) values (
    auth.uid(),
    'FINANCE_PAYMENT_REVIEW',
    'orders',
    p_order_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'decision', p_decision,
      'request_id', v_request_id,
      'notes', p_notes
    )
  );

  perform public.commerce_request_complete(v_request_id, v_result);

  return v_result;
end;
$function$;

revoke all on function public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) from public;
revoke all on function public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) from anon;
revoke all on function public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) from service_role;
grant execute on function public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) to authenticated;

comment on function public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid) is
  'Feature 016: Authoritative finance review RPC for bank transfers. Executes CONFIRMED or REJECTED decision with signed inventory conservation, title transfer, tax invoice, and automatic Feature 009 fulfillment handoff.';

-- One shared fail-closed terminal validator prevents replay from treating counts alone as truth.
create or replace function public.finance_terminal_review_integrity(p_order_id uuid, p_payment_id uuid, p_decision text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public, auth as $function$
declare v_order public.orders%rowtype; v_payment public.payments%rowtype; v_res public.inventory_reservations%rowtype;
declare v_proforma public.proforma_invoices%rowtype; v_intent public.payment_proof_upload_intents%rowtype; v_proof public.payment_proofs%rowtype;
declare v_expected integer; v_actual integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  select * into v_payment from public.payments where id = p_payment_id;
  select * into v_res from public.inventory_reservations where order_id = p_order_id;
  if v_order.id is null or v_payment.id is null or v_payment.order_id <> p_order_id or v_res.id is null
     or (select count(*) from public.inventory_reservations where order_id = p_order_id) <> 1 then return false; end if;
  if v_payment.proforma_id is null or v_payment.proforma_id is distinct from v_order.current_proforma_id
     or v_payment.proforma_id is distinct from v_res.proforma_id then return false; end if;
  select * into v_proforma from public.proforma_invoices where id = v_payment.proforma_id and order_id = p_order_id;
  if v_proforma.id is null or v_proforma.status <> 'CONFIRMED' then return false; end if;
  -- A terminal payment has exactly one authoritative review total, not merely one matching decision.
  select count(*) into v_actual from public.payment_reviews where payment_id = p_payment_id;
  if v_actual <> 1 then return false; end if;
  if not exists (select 1 from public.payment_reviews where payment_id = p_payment_id and decision = p_decision) then return false; end if;
  select * into v_intent from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED';
  if v_intent.id is null or v_intent.finalized_proof_id is null
     or (select count(*) from public.payment_proof_upload_intents where order_id = p_order_id and status = 'FINALIZED') <> 1 then return false; end if;
  select * into v_proof from public.payment_proofs where id = v_intent.finalized_proof_id and payment_id = p_payment_id;
  if v_proof.id is null or v_proof.status is distinct from (case when p_decision = 'CONFIRMED' then 'ACCEPTED' else 'REJECTED' end) then return false; end if;
  if p_decision = 'REJECTED' then
    return v_order.status = 'PAYMENT_REJECTED' and v_payment.status = 'REJECTED'
      and v_res.status = 'RELEASED' and v_res.release_reason = 'REJECTED'
      and not exists (select 1 from public.tax_invoices where order_id = p_order_id)
      and not exists (select 1 from public.inventory_ownership_events where correlation_id = p_order_id)
      and not exists (select 1 from public.storage_allocations sa join public.order_items oi on oi.id = sa.order_item_id where oi.order_id = p_order_id)
      and not exists (select 1 from public.order_shipments where order_id = p_order_id and shipment_kind = 'FULFILLMENT');
  end if;
  if v_order.status <> 'PAID' or v_payment.status <> 'CONFIRMED' or v_res.status <> 'CONSUMED' then return false; end if;
  select count(*) into v_actual from public.tax_invoices ti
    where ti.order_id = p_order_id and ti.proforma_id = v_proforma.id and ti.status = 'ISSUED'
      and (ti.snapshot->>'merchandise_gross')::numeric = v_proforma.merchandise_gross
      and (ti.snapshot->>'discount_total')::numeric = v_proforma.discount_total
      and (ti.snapshot->>'merchandise_net')::numeric = v_proforma.merchandise_net
      and (ti.snapshot->>'shipping_total')::numeric = v_proforma.shipping_total
      and (ti.snapshot->>'vat_total')::numeric = v_proforma.vat_total
      and (ti.snapshot->>'buyer_total')::numeric = v_proforma.buyer_total
      and ti.snapshot->>'currency' = v_proforma.currency
      and ti.snapshot->'destination_snapshot' = v_proforma.destination_snapshot;
  if v_actual <> 1 then return false; end if;
  select count(*) into v_expected from public.inventory_reservation_items where reservation_id = v_res.id;
  select count(*) into v_actual from public.inventory_ownership_events e
    join public.inventory_reservation_items iri on iri.reservation_id = v_res.id
    join public.proforma_invoice_items pii on pii.proforma_id = v_proforma.id and pii.offer_id = iri.offer_id
    join public.coffee_offers co on co.id = iri.offer_id
    where e.correlation_id = p_order_id and e.reason = 'FINANCE_CONFIRMATION'
      and e.order_item_id = pii.order_item_id and e.lot_id = co.lot_id
      and e.from_organization_id = co.seller_organization_id and e.to_organization_id = v_order.buyer_organization_id
      and e.event_type = case when pii.seller_type_snapshot = 'HILLS' then 'SALE' else 'RESALE' end
      and e.quantity_kg = iri.quantity_kg
      and exists (select 1 from public.inventory_positions sp where sp.id = iri.inventory_position_id
        and sp.lot_id = co.lot_id
        and e.warehouse_id = sp.warehouse_id
        and e.warehouse_location_id is not distinct from sp.warehouse_location_id);
  if v_expected = 0 or v_actual <> v_expected
     or (select count(*) from public.inventory_ownership_events where correlation_id = p_order_id and reason = 'FINANCE_CONFIRMATION') <> v_expected then return false; end if;
  select count(*) into v_actual from public.storage_allocations sa
    join public.inventory_reservation_items iri on iri.reservation_id = v_res.id
    join public.proforma_invoice_items pii on pii.proforma_id = v_proforma.id and pii.offer_id = iri.offer_id
    join public.inventory_positions ip on ip.id = iri.inventory_position_id
    where sa.order_item_id = pii.order_item_id and sa.owner_organization_id = v_order.buyer_organization_id
      and sa.lot_id = ip.lot_id and sa.warehouse_id = ip.warehouse_id and sa.warehouse_location_id is not distinct from ip.warehouse_location_id
      and sa.quantity_kg = iri.quantity_kg and sa.status = 'STORED';
  if v_actual <> v_expected then return false; end if;
  select count(*) into v_expected from public.proforma_fulfillment_groups where proforma_id = v_proforma.id;
  select count(*) into v_actual from public.order_shipments s join public.proforma_fulfillment_groups g on g.id = s.proforma_fulfillment_group_id
    where s.order_id = p_order_id and s.shipment_kind = 'FULFILLMENT' and s.status = 'REQUESTED'
      and g.proforma_id = v_proforma.id and s.fulfillment_seller_organization_id = g.seller_organization_id
      and s.fulfillment_warehouse_id = g.warehouse_id and s.delivery_method = g.delivery_method
      and s.shipping_fee = g.shipping_amount and s.currency = v_proforma.currency
      and s.country_code = coalesce(v_proforma.destination_snapshot->>'country_code', 'AE')::char(2)
      and s.city is not distinct from coalesce(v_proforma.destination_snapshot->>'city', 'Dubai')
      and s.address_line = coalesce(nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(v_proforma.destination_snapshot->'address_lines', '[]'::jsonb))), ', '), ''), v_proforma.destination_snapshot->>'address_line', 'Standard Delivery')
      and s.contact_name = coalesce(v_proforma.destination_snapshot->>'contact_name', 'Customer')
      and s.contact_phone = coalesce(v_proforma.destination_snapshot->>'contact_phone', '+9710000000');
  if v_expected = 0 or v_actual <> v_expected then return false; end if;
  if exists (select 1 from public.order_shipments s where s.order_id = p_order_id and s.shipment_kind = 'FULFILLMENT' and not exists (
    select 1 from public.proforma_fulfillment_groups g where g.id = s.proforma_fulfillment_group_id and g.proforma_id = v_proforma.id)) then return false; end if;
  if exists (select 1 from public.order_shipments s join public.proforma_fulfillment_groups g on g.id = s.proforma_fulfillment_group_id
    where s.order_id = p_order_id and s.shipment_kind = 'FULFILLMENT' and (
      (select count(*) from public.shipment_items si where si.shipment_id = s.id) <> (select count(*) from public.proforma_invoice_items pii where pii.proforma_id = v_proforma.id and pii.fulfillment_group_id = g.id)
      or exists (select 1 from public.shipment_items si where si.shipment_id = s.id and (not exists (select 1 from public.proforma_invoice_items pii where pii.proforma_id = v_proforma.id and pii.fulfillment_group_id = g.id and pii.order_item_id = si.order_item_id and pii.quantity_kg = si.planned_quantity_kg) or si.reserved_quantity_kg <> 0 or si.delivered_quantity_kg <> 0))
    )) then return false; end if;
  return true;
end;
$function$;
revoke all on function public.finance_terminal_review_integrity(uuid, uuid, text) from public, anon, authenticated, service_role;

-- Narrow Finance/Admin-only read seam. Feature 015 deliberately grants no authenticated SELECT on
-- payment_proof_upload_intents; this function exposes only the exact FINALIZED proof projection.
create or replace function public.finance_payment_proof_projection(p_order_id uuid)
returns table (
  finalized_proof_id uuid, payment_id uuid, file_asset_id uuid, proof_status text,
  claimed_amount numeric, claimed_currency text, transfer_date date, bank_reference text, submitted_at timestamptz
)
language plpgsql security definer set search_path = pg_catalog, public, auth as $function$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if public.is_blocked_user() or not public.mfa_satisfied()
     or not (public.is_finance_operator() or public.is_platform_admin()) then raise exception 'forbidden'; end if;
  return query
    select pp.id, pp.payment_id, pp.file_asset_id, pp.status::text, pp.claimed_amount::numeric,
      pp.claimed_currency::text, pp.transfer_date::date, pp.bank_reference::text, pp.submitted_at::timestamptz
    from public.payment_proof_upload_intents i
    join public.payment_proofs pp on pp.id = i.finalized_proof_id
    where i.order_id = p_order_id and i.status = 'FINALIZED' and i.finalized_proof_id is not null;
end;
$function$;
revoke all on function public.finance_payment_proof_projection(uuid) from public, anon, service_role;
grant execute on function public.finance_payment_proof_projection(uuid) to authenticated;

create or replace function public.finance_payment_proof_asset_projection(p_file_asset_id uuid)
returns table (file_asset_id uuid, bucket_name text, object_path text, mime_type text, original_name text)
language plpgsql security definer set search_path = pg_catalog, public, auth as $function$
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  if public.is_blocked_user() or not public.mfa_satisfied()
     or not (public.is_finance_operator() or public.is_platform_admin()) then raise exception 'forbidden'; end if;
  return query
    select fa.id, fa.bucket_name, fa.object_path, fa.mime_type, fa.original_name
    from public.payment_proof_upload_intents i
    join public.payment_proofs pp on pp.id = i.finalized_proof_id
    join public.file_assets fa on fa.id = pp.file_asset_id
    where i.status = 'FINALIZED' and pp.file_asset_id = p_file_asset_id and fa.bucket_name = 'payment-proofs';
end;
$function$;
revoke all on function public.finance_payment_proof_asset_projection(uuid) from public, anon, service_role;
grant execute on function public.finance_payment_proof_asset_projection(uuid) to authenticated;

-- ── 4. Notification Triggers (T013, T014) ─────────────────────────────────────────────────────

-- T013: Extend order status notification trigger for PAYMENT_PROOF_SUBMITTED, PAID, PAYMENT_REJECTED
create or replace function public.commerce_notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_title text;
  v_body text;
  v_type text;
begin
  if new.status is not distinct from old.status or new.commerce_flow is distinct from 'BANK_TRANSFER_V1' then
    return new;
  end if;

  if new.status = 'PROFORMA_ISSUED' then
    v_type := 'ORDER_PROFORMA_ISSUED';
    v_title := 'Proforma Invoice Issued';
    v_body := 'A proforma invoice has been generated for order ' || new.order_code;
  elsif new.status = 'HOLD' then
    v_type := 'RESERVATION_CONFIRMED';
    v_title := 'Stock Reservation Confirmed';
    v_body := 'Inventory reserved for 20 minutes for order ' || new.order_code;
  elsif new.status = 'EXPIRED' then
    v_type := 'RESERVATION_EXPIRED';
    v_title := 'Stock Reservation Expired';
    v_body := 'The reservation window for order ' || new.order_code || ' has expired';
  elsif new.status = 'PAYMENT_PROOF_SUBMITTED' then
    v_type := 'PAYMENT_PROOF_SUBMITTED';
    v_title := 'Payment Proof Submitted';
    v_body := 'Payment proof submitted for order ' || new.order_code;
  elsif new.status = 'PAID' then
    v_type := 'PAYMENT_CONFIRMED';
    v_title := 'Payment Confirmed';
    v_body := 'Payment confirmed for order ' || new.order_code;
  elsif new.status = 'PAYMENT_REJECTED' then
    v_type := 'PAYMENT_REJECTED';
    v_title := 'Payment Rejected';
    v_body := 'Payment review rejected for order ' || new.order_code;
  else
    return new;
  end if;

  insert into public.notifications(
    user_id,
    organization_id,
    notification_type,
    title,
    body,
    entity_type,
    entity_id
  ) select
    new.created_by,
    new.buyer_organization_id,
    v_type,
    v_title,
    v_body,
    'orders',
    new.id
  where not exists (
    select 1 from public.notifications n
    where n.user_id = new.created_by
      and n.notification_type = v_type
      and n.entity_type = 'orders'
      and n.entity_id = new.id
  );

  return new;
end;
$$;

revoke all on function public.commerce_notify_order_status_change() from public, anon, authenticated, service_role;

drop trigger if exists trg_notify_order_status_change on public.orders;
create trigger trg_notify_order_status_change
  after update of status on public.orders
  for each row
  execute function public.commerce_notify_order_status_change();

-- T014: Shipment status notification trigger for FULFILLMENT DRAFT -> REQUESTED
create or replace function public.commerce_notify_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status is not distinct from old.status or new.shipment_kind is distinct from 'FULFILLMENT' then
    return new;
  end if;

  if old.status = 'DRAFT' and new.status = 'REQUESTED' then
    insert into public.notifications (
      user_id,
      organization_id,
      notification_type,
      title,
      body,
      entity_type,
      entity_id
    )
    select
      om.user_id,
      w.owner_organization_id,
      'DELIVERY_HANDOFF_REQUESTED',
      'Delivery Handoff Requested',
      'New fulfillment delivery requested for shipment ' || coalesce(new.shipment_code, new.id::text),
      'order_shipments',
      new.id
    from public.warehouses w
    join public.organization_members om
      on om.organization_id = w.owner_organization_id
     and om.is_active = true
    where w.id = new.fulfillment_warehouse_id
      and not exists (
        select 1 from public.notifications n
        where n.user_id = om.user_id
          and n.notification_type = 'DELIVERY_HANDOFF_REQUESTED'
          and n.entity_type = 'order_shipments'
          and n.entity_id = new.id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.commerce_notify_shipment_status_change() from public, anon, authenticated, service_role;

drop trigger if exists trg_notify_shipment_status_change on public.order_shipments;
create trigger trg_notify_shipment_status_change
  after update of status on public.order_shipments
  for each row
  execute function public.commerce_notify_shipment_status_change();

commit;
