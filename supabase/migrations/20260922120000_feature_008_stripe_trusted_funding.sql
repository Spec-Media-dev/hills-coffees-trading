-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 008 T009/T011/T017 — Stripe trusted-funding gate, provider-event idempotency, and per-seller
-- transfer correlation. PREPARED FOR HUMAN APPROVAL — NOT APPLIED. Do not run `supabase db push` / the
-- SQL Editor without approval.
-- Rollback: supabase/rollback/20260922120000_feature_008_stripe_trusted_funding.rollback.sql
--           (paired; kept OUTSIDE supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260922_feature_008_stripe_trusted_funding_postflight.sql
-- Apply path: repository convention (`supabase db push --linked` or the SQL Editor), then the postflight,
-- then `F008_LIVE_PROOF=1 npx vitest run tests/finance` for the live-gated proofs this migration unblocks.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- APPROVED PRODUCT DECISION THIS MIGRATION IMPLEMENTS (RUN E — Stripe provider decision run,
-- 2026-09-22, recorded verbatim in `specs/008-payments-settlement-invoices-payouts/tasks.md` T007-T009):
--   Provider: Stripe. Platform model: Stripe Connect, "separate charges and transfers" (one PaymentIntent
--   on the platform account per order, N later Transfers to connected accounts — `STRIPE-PREPARATION.md`
--   §4). Settlement-gate option: **Option A** — trusted funding (a verified Stripe webhook event) PLUS
--   finance-operator approval, NOT automatic settlement (`STRIPE-PREPARATION.md` §6 Option A). The
--   owner/admin action is "Approve Settlement" / "Release Seller Funds" — never "confirm the buyer paid".
--
-- THE MODEL — additive only, reusing every existing table/column/function it can (Section 7/9 of
-- `STRIPE-PREPARATION.md`, now implemented rather than drafted):
--
--   1. `payments.trusted_funding_confirmed_at` / `trusted_funding_event_id` — set ONLY by
--      `ingest_stripe_event()` after a Stripe webhook signature has ALREADY been verified by the Edge
--      Function boundary (T012/T013, not this migration). Never set by client code, never set by the
--      finance operator's own review input, never backdated by a replayed/duplicate event (idempotent
--      via `coalesce`, so the FIRST confirming event wins and a later duplicate cannot move it).
--   2. `admin_review_payment()` gains exactly ONE new precondition: when `p_approved = true` AND the
--      payment's `payment_method = 'PROVIDER'`, trusted funding must already be confirmed, or the whole
--      transaction is refused (`trusted_funding_required`). This is Option A's literal "trusted event +
--      human decision, both required" shape — the finance operator's own manual decision is preserved as
--      an ADDITIONAL layer, never replaced. **Every other line of the function is reproduced verbatim,
--      unchanged, from the live database** (captured directly from `docs/database/database-schema-report
--      .json`, not reconstructed from memory). `payment_method` is NULL for every pre-existing payment
--      row (nothing has ever set it — `checkout_order()` never does, and `submit_payment_proof()`/T024's
--      manual fallback is still blocked and unbuilt) and NULL for every disposable row Features 005/006/
--      007/009/010/012's own live-chain tests create today, so `payment_method = 'PROVIDER'` evaluates to
--      NULL (not TRUE) under SQL's three-valued logic for every one of them — **this precondition is a
--      complete no-op for every existing settlement path**, live-proven by re-running those same suites
--      after this migration is applied (not fabricated here).
--   3. `payment_events.provider` / `external_event_id` become `NOT NULL` — Phase 1 found these nullable
--      and flagged it as the one thing standing between the existing `UNIQUE(provider, external_event_id)`
--      constraint and genuine duplicate-delivery safety (`STRIPE-PREPARATION.md` §9). Zero rows exist in
--      this table today (Phase 1 confirmed zero writers; this migration adds the only two: section 5/6
--      below), so this is a safe, non-breaking tightening, not a backfill.
--   4. `ingest_stripe_event(...)` — the ONLY writer of `payment_events`, and the only writer of the new
--      `trusted_funding_*` columns. SECURITY DEFINER, callable ONLY by `service_role` (the Edge Function's
--      own trust boundary — by the time this is called, the Edge Function has already verified the raw
--      Stripe-Signature HMAC itself; this function does not re-verify a signature, it only persists an
--      ALREADY-TRUSTED event, idempotently). Deduplicates on `(provider, external_event_id)` via
--      `ON CONFLICT ... DO NOTHING` — Stripe's own documented guidance (dedupe on `event.id`, never
--      `created`, since timestamps can collide) — and refuses an event whose `payment_id` does not
--      already carry a matching `provider` value (anti-tamper: a forged event naming a real order id
--      cannot mark a BANK_TRANSFER/never-Stripe-initiated payment as funded).
--   5. `record_stripe_payment_intent(...)` — the ONLY writer of `payments.payment_method` /
--      `provider` / `external_reference` / `idempotency_key` for the Stripe path. Callable by
--      `authenticated`, but internally requires the caller to be a member of the order's OWN buyer
--      organization (`is_org_member`) — the Edge Function that calls it forwards the real buyer's own
--      JWT, never a service-role bypass, so `auth.uid()` inside this function is genuinely the buyer.
--      Refuses a second, different PaymentIntent id for the same order (race/duplicate-create safety);
--      the SAME id is a safe no-op (idempotent retry).
--   6. `record_payment_transfer(...)` — the ONLY writer of the new `payment_transfers` table.
--      `is_finance_operator()`-only. One row per `payouts` row (`payout_id` is UNIQUE) — a second
--      transfer for the same payout is refused at the database level whatever the caller does
--      ("no duplicate seller transfer"). Requires the payout's own payment to already carry trusted
--      funding (belt-and-braces; the payout row itself can only exist via `admin_review_payment()`,
--      which by point 2 above already required this).
--   7. `payment_transfers` — new, additive table (Section 9's draft, implemented). One row per Stripe
--      Transfer, i.e. per `(order, seller)` pair, mirroring `payouts`' own granularity exactly. Append-
--      only (no UPDATE/DELETE policy or grant for anyone, including `service_role` — same discipline as
--      `inventory_variance_events`). RLS mirrors `payouts` exactly: the seller org (via its own payout)
--      and platform admin get SELECT; `is_finance_operator()` gets ALL (read only in practice, since
--      nothing but `record_payment_transfer()` ever writes a row).
--
-- WHO: no new role. `service_role` is the Edge Function's own trust boundary for event ingestion (point
-- 4); `is_org_member()`/`is_finance_operator()` are the SAME existing helpers every other Feature 008
-- function already uses — no new authorization primitive is introduced.
--
-- NOT CHANGED (explicitly): `checkout_order()`, `expire_order_hold()`, every inventory/delivery/listing
-- function, every existing RLS policy on `payments`/`payouts`/`order_financials`/`proforma_invoices`/
-- `tax_invoices`, and `admin_review_payment()`'s entire existing transaction body — reproduced verbatim
-- except for the single inserted precondition (point 2). `payouts`' own columns, its
-- `UNIQUE(order_id, seller_organization_id)` constraint, and what a `payouts` row means (an accounting
-- record, not proof of money movement — FR-017) are untouched; `payment_transfers` is the provider-
-- evidence field that row was missing, added alongside it, never inside it.
--
-- BACKFILL: none. No historical Stripe event or transfer exists to backfill.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — refuse to change anything unless the live schema is exactly what this migration
--    was written against.
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'payments'
    and column_name in ('id', 'order_id', 'payment_method', 'provider', 'external_reference', 'amount',
      'currency', 'status', 'payment_account_id', 'confirmed_by', 'confirmed_at', 'rejected_reason',
      'created_at', 'updated_at', 'idempotency_key', 'correlation_id');
  if v_count <> 16 then
    v_problems := v_problems || 'payments: expected 16 known columns, found ' || v_count || '; ';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments'
      and column_name in ('trusted_funding_confirmed_at', 'trusted_funding_event_id')
  ) then
    v_problems := v_problems || 'payments already carries a trusted_funding_* column; ';
  end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'payment_events'
    and column_name in ('id', 'payment_id', 'provider', 'external_event_id', 'event_type', 'payload', 'created_at', 'correlation_id');
  if v_count <> 8 then
    v_problems := v_problems || 'payment_events: expected 8 known columns, found ' || v_count || '; ';
  end if;

  -- This migration tightens provider/external_event_id to NOT NULL. Only safe if the table is still
  -- genuinely empty (Phase 1's own documented finding: zero writers exist before this migration).
  select count(*) into v_count from public.payment_events;
  if v_count <> 0 then
    v_problems := v_problems || 'payment_events already has ' || v_count || ' row(s) — NOT NULL tightening would need a backfill decision this migration does not make; ';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.payments') and c.conname = 'payments_payment_method_check'
      and pg_get_constraintdef(c.oid) like '%BANK_TRANSFER%' and pg_get_constraintdef(c.oid) like '%PROVIDER%'
  ) then
    v_problems := v_problems || 'payments_payment_method_check missing or unexpected; ';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.payment_events') and c.conname = 'payment_events_provider_external_event_id_key'
  ) then
    v_problems := v_problems || 'payment_events_provider_external_event_id_key missing; ';
  end if;

  if to_regclass('public.payouts') is null or to_regclass('public.orders') is null or to_regclass('public.payments') is null
     or to_regclass('public.payment_events') is null or to_regclass('public.order_financials') is null then
    v_problems := v_problems || 'a required table is missing; ';
  end if;

  if to_regclass('public.payment_transfers') is not null then
    v_problems := v_problems || 'payment_transfers already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_finance_operator', 'is_org_member', 'is_platform_admin', 'is_auditor');
  if v_count <> 4 then
    v_problems := v_problems || 'expected role helpers (is_finance_operator, is_org_member, is_platform_admin, is_auditor), found ' || v_count || '; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('ingest_stripe_event', 'record_stripe_payment_intent', 'record_payment_transfer');
  if v_count <> 0 then
    v_problems := v_problems || 'a Feature 008 Stripe function already exists; ';
  end if;

  -- admin_review_payment() must still be exactly the function this migration was written against — a
  -- byte-for-byte check would be brittle across whitespace-only reformatting, so this checks its
  -- documented invariants instead: SECURITY DEFINER, the exact argument signature, and that it still
  -- raises the specific exception names this migration's precondition is inserted next to.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_review_payment' and p.prosecdef
      and pg_get_function_identity_arguments(p.oid) = 'p_payment_id uuid, p_approved boolean, p_reason text'
      and p.prosrc like '%active_reservation_missing%'
      and p.prosrc like '%reservation_expired%'
      and p.prosrc like '%forbidden%'
  ) then
    v_problems := v_problems || 'admin_review_payment() does not match the expected signature/body this migration was written against; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_008_stripe_trusted_funding preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Trusted-funding evidence on payments ---------------------------------------------------------------
alter table public.payments
  add column trusted_funding_confirmed_at timestamptz null,
  add column trusted_funding_event_id uuid null;

comment on column public.payments.trusted_funding_confirmed_at is
  'Feature 008 T009/T011: set ONLY by ingest_stripe_event() after a verified Stripe webhook event proves funding. Never set by client code or the finance operator''s own review input. Additive/orthogonal to payments.status — does not replace or alias PROOF_SUBMITTED/UNDER_REVIEW/REJECTED.';
comment on column public.payments.trusted_funding_event_id is
  'Feature 008 T009/T011: which specific verified payment_events row established funding (audit pointer, not a data duplicate).';

-- 2. payment_events — the real gap was an optional constraint, not a missing column (STRIPE-PREPARATION.md §9).
alter table public.payment_events
  alter column provider set not null,
  alter column external_event_id set not null;

-- Added after the columns are NOT NULL, so payments can reference a genuinely-identified event.
alter table public.payments
  add constraint payments_trusted_funding_event_id_fkey
  foreign key (trusted_funding_event_id) references public.payment_events(id);

-- 3. Per-seller transfer correlation (the "payout/transfer correlation" + "outbound API idempotency" gap
--    STRIPE-PREPARATION.md §7/§9 flagged) --------------------------------------------------------------
create table public.payment_transfers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  payout_id uuid not null references public.payouts(id) on delete restrict,
  provider_transfer_id text not null,
  transfer_group text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint payment_transfers_payout_id_key unique (payout_id),
  constraint payment_transfers_provider_transfer_id_key unique (provider_transfer_id),
  constraint payment_transfers_idempotency_key_key unique (idempotency_key),
  constraint payment_transfers_provider_transfer_id_check check (char_length(btrim(provider_transfer_id)) > 0),
  constraint payment_transfers_transfer_group_check check (char_length(btrim(transfer_group)) > 0),
  constraint payment_transfers_idempotency_key_check check (char_length(btrim(idempotency_key)) > 0)
);

comment on table public.payment_transfers is
  'Feature 008 T009/T011: one row per Stripe Transfer (one per order/seller pair, mirroring payouts'' own granularity). The provider-evidence field payouts itself does not carry. Append-only — written ONLY by record_payment_transfer(); a payout can never receive a second transfer (payout_id is UNIQUE). Does not change what a payouts row means (FR-017: an accounting record, not proof of money movement) — that proof lives here instead.';

create index payment_transfers_payment_id_idx on public.payment_transfers (payment_id);

alter table public.payment_transfers enable row level security;

revoke all on table public.payment_transfers from public;
revoke all on table public.payment_transfers from anon;
revoke all on table public.payment_transfers from authenticated;
grant select on table public.payment_transfers to authenticated;
-- Append-only, like inventory_variance_events: not even service_role's default write privileges survive.
-- The only writer is record_payment_transfer() (SECURITY DEFINER, runs as the function owner).
revoke insert, update, delete, truncate on table public.payment_transfers from service_role;

-- Mirrors payouts_view / payouts_finance exactly (same audience, same shape).
create policy payment_transfers_view
  on public.payment_transfers
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.payouts p
      where p.id = payment_transfers.payout_id
        and public.is_org_member(p.seller_organization_id)
    )
  );

create policy payment_transfers_finance
  on public.payment_transfers
  for all
  to authenticated
  using (public.is_finance_operator());

-- 4. admin_review_payment() — the existing transaction core, reproduced verbatim, with exactly ONE new
--    precondition inserted (point 2 of the header). Every other line is unchanged from the live function
--    body captured from docs/database/database-schema-report.json.
create or replace function public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
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

-- 5. ingest_stripe_event() — the ONLY writer of payment_events and of the trusted_funding_* columns.
--    Callable ONLY by service_role (the Edge Function's own trust boundary): by the time this runs, the
--    caller has ALREADY verified the raw Stripe-Signature HMAC itself (T013) — this function persists an
--    already-trusted event, idempotently, and never re-verifies a signature or trusts a client value.
create or replace function public.ingest_stripe_event(
  p_provider text,
  p_external_event_id text,
  p_event_type text,
  p_payment_id uuid,
  p_payload jsonb,
  p_funding_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payment public.payments%rowtype;
  v_event_id uuid;
  v_correlation uuid;
  v_deduped boolean := false;
begin
  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'stripe_event_provider_required';
  end if;
  if p_external_event_id is null or btrim(p_external_event_id) = '' then
    raise exception 'stripe_event_id_required';
  end if;
  if p_event_type is null or btrim(p_event_type) = '' then
    raise exception 'stripe_event_type_required';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;

  -- Anti-tamper / correlation check (STRIPE-PREPARATION.md §8: "never trust a client-side redirect...
  -- only a verified server-side event... may write funding evidence"). A forged event naming a real
  -- order id cannot mark a payment that never actually initiated Stripe funding (payments.provider is
  -- only ever set by record_stripe_payment_intent(), below) as funded.
  if v_payment.provider is distinct from p_provider then
    raise exception 'stripe_event_payment_provider_mismatch';
  end if;

  v_correlation := coalesce(v_payment.correlation_id, gen_random_uuid());

  -- Dedupe on event.id (never on a timestamp — Stripe does not guarantee delivery order and two events
  -- can share a `created` value). A duplicate/replayed delivery is a safe no-op, not an error.
  insert into public.payment_events (payment_id, provider, external_event_id, event_type, payload, correlation_id)
  values (p_payment_id, p_provider, p_external_event_id, p_event_type, p_payload, v_correlation)
  on conflict (provider, external_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    v_deduped := true;
    select id into v_event_id from public.payment_events where provider = p_provider and external_event_id = p_external_event_id;
    return jsonb_build_object('deduped', true, 'event_id', v_event_id);
  end if;

  if p_funding_confirmed then
    -- coalesce: the FIRST confirming event wins. A later duplicate/out-of-order event can never move an
    -- already-confirmed timestamp or event pointer.
    update public.payments
    set
      trusted_funding_confirmed_at = coalesce(trusted_funding_confirmed_at, now()),
      trusted_funding_event_id = coalesce(trusted_funding_event_id, v_event_id)
    where id = p_payment_id;
  end if;

  return jsonb_build_object('deduped', v_deduped, 'event_id', v_event_id);
end;
$function$;

revoke all on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from public;
revoke all on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from anon;
revoke all on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) from authenticated;
grant execute on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) to service_role;

comment on function public.ingest_stripe_event(text, text, text, uuid, jsonb, boolean) is
  'Feature 008 T013/T009: the ONLY writer of payment_events and of payments.trusted_funding_*. service_role-only (the Edge Function has already verified the Stripe-Signature HMAC before calling this). Idempotent on (provider, external_event_id); refuses an event whose payment does not already carry a matching provider value.';

-- 6. record_stripe_payment_intent() — the ONLY writer of payments.payment_method/provider/
--    external_reference/idempotency_key for the Stripe path. Callable by `authenticated`, but requires
--    the caller to be a member of the order's own buyer organization — the Edge Function that calls this
--    forwards the real buyer's own JWT (never a service-role bypass), so auth.uid() here is genuinely them.
create or replace function public.record_stripe_payment_intent(
  p_order_id uuid,
  p_payment_intent_id text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_updated int;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  if not public.is_org_member(v_order.buyer_organization_id) then
    raise exception 'forbidden';
  end if;
  if v_order.status <> 'HOLD' then
    raise exception 'order_not_fundable';
  end if;
  if p_payment_intent_id is null or btrim(p_payment_intent_id) = '' then
    raise exception 'stripe_payment_intent_required';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'stripe_idempotency_key_required';
  end if;

  select * into v_payment from public.payments where order_id = p_order_id for update;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;

  -- Idempotent retry: the SAME PaymentIntent id being recorded again is a safe no-op.
  if v_payment.external_reference = p_payment_intent_id and v_payment.provider = 'STRIPE' then
    return jsonb_build_object('order_id', p_order_id, 'payment_id', v_payment.id, 'provider', 'STRIPE', 'external_reference', p_payment_intent_id, 'already_recorded', true);
  end if;

  -- Race/duplicate-create safety: a DIFFERENT PaymentIntent already recorded for this order is refused,
  -- never silently overwritten.
  if v_payment.external_reference is not null then
    raise exception 'stripe_payment_intent_already_recorded';
  end if;

  update public.payments
  set
    payment_method = 'PROVIDER',
    provider = 'STRIPE',
    external_reference = p_payment_intent_id,
    idempotency_key = p_idempotency_key
  where id = v_payment.id
    and external_reference is null;
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- Lost the race to a concurrent caller; re-check rather than assume failure.
    select * into v_payment from public.payments where id = v_payment.id;
    if v_payment.external_reference = p_payment_intent_id then
      return jsonb_build_object('order_id', p_order_id, 'payment_id', v_payment.id, 'provider', 'STRIPE', 'external_reference', p_payment_intent_id, 'already_recorded', true);
    end if;
    raise exception 'stripe_payment_intent_already_recorded';
  end if;

  return jsonb_build_object('order_id', p_order_id, 'payment_id', v_payment.id, 'provider', 'STRIPE', 'external_reference', p_payment_intent_id, 'already_recorded', false);
end;
$function$;

revoke all on function public.record_stripe_payment_intent(uuid, text, text) from public;
revoke all on function public.record_stripe_payment_intent(uuid, text, text) from anon;
grant execute on function public.record_stripe_payment_intent(uuid, text, text) to authenticated, service_role;

comment on function public.record_stripe_payment_intent(uuid, text, text) is
  'Feature 008 T012/T014: the ONLY writer of payments.payment_method/provider/external_reference/idempotency_key for the Stripe path. Buyer-org-member-only (is_org_member); called by the create-payment-intent Edge Function forwarding the buyer''s own JWT. Refuses a second, different PaymentIntent for the same order; the same id is an idempotent no-op.';

-- 7. record_payment_transfer() — the ONLY writer of payment_transfers. is_finance_operator()-only.
create or replace function public.record_payment_transfer(
  p_payout_id uuid,
  p_provider_transfer_id text,
  p_transfer_group text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_payout public.payouts%rowtype;
  v_payment public.payments%rowtype;
  v_id uuid;
begin
  if not public.is_finance_operator() then
    raise exception 'forbidden';
  end if;
  if p_provider_transfer_id is null or btrim(p_provider_transfer_id) = '' then
    raise exception 'stripe_transfer_id_required';
  end if;
  if p_transfer_group is null or btrim(p_transfer_group) = '' then
    raise exception 'stripe_transfer_group_required';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'stripe_idempotency_key_required';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;

  select * into v_payment from public.payments where order_id = v_payout.order_id;
  if v_payment.id is null then
    raise exception 'payment_not_found';
  end if;
  if v_payment.trusted_funding_confirmed_at is null then
    raise exception 'trusted_funding_required';
  end if;

  insert into public.payment_transfers (payment_id, payout_id, provider_transfer_id, transfer_group, idempotency_key)
  values (v_payment.id, p_payout_id, p_provider_transfer_id, p_transfer_group, p_idempotency_key)
  on conflict (payout_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- Already recorded — a second transfer for the same payout is refused at the database level,
    -- whatever the caller does.
    select id into v_id from public.payment_transfers where payout_id = p_payout_id;
    return jsonb_build_object('payout_id', p_payout_id, 'transfer_id', v_id, 'already_recorded', true);
  end if;

  return jsonb_build_object('payout_id', p_payout_id, 'transfer_id', v_id, 'already_recorded', false);
end;
$function$;

revoke all on function public.record_payment_transfer(uuid, text, text, text) from public;
revoke all on function public.record_payment_transfer(uuid, text, text, text) from anon;
grant execute on function public.record_payment_transfer(uuid, text, text, text) to authenticated, service_role;

comment on function public.record_payment_transfer(uuid, text, text, text) is
  'Feature 008 T017/T021: the ONLY writer of payment_transfers. is_finance_operator()-only. One transfer per payout (payout_id UNIQUE) — a duplicate is refused/idempotently reported, never double-inserted.';

commit;
