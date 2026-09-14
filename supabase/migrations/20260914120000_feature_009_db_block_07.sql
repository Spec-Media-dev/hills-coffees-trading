-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLIED — Feature 009 DB-BLOCK-07 (delivery reservation + settlement-eligibility gate), copied
-- verbatim from the reviewed, human-approved DRAFT at
-- supabase/maintenance/20260914_feature_009_db_block_07_migration.DRAFT.sql (T010 approval recorded
-- in specs/009-delivery-shipments/tasks.md). The executable SQL below (begin; ... commit;) is
-- byte-for-byte identical to that DRAFT's own executable body -- only this header/path framing and
-- the rollback filename reference near the end of this comment block differ, since this file IS now
-- the applied destination the DRAFT's own header described. Full design rationale, defect history,
-- and the RUN A1/A2-PRE/A2-PRE2/A2-PRE3 review trail remain in the DRAFT file and in
-- specs/009-delivery-shipments/DB-BLOCK-07-DESIGN.md (see especially §20/§21). This comment block only
-- orients a reader of supabase/migrations/ directly; it does not re-derive that history.
-- Rollback: 20260914120000_feature_009_db_block_07.rollback.sql (paired, same convention as
-- 20260913100000_feature_007_db_blockers.sql/.rollback.sql).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Feature 009 — DB-BLOCK-07 (delivery reservation + settlement-eligibility gate). Two related
-- database gaps, closed together:
--
-- 1. A delivery request does not reserve inventory (SRS DEL-01/AC-04): quantity requested for
--    delivery remains available for listing/resale/another delivery request.
-- 2. Physical-fulfillment progression is not gated on order settlement at all (SRS MKT-04 applied to
--    release): a warehouse operator could progress an unpaid order's shipment to DELIVERED today.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- INVENTORY SEMANTICS (proven from live evidence, not assumed — RUN A2-PRE Issue 1/2):
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- `inventory_positions.available_quantity_kg` is the GROSS/ON-HAND quantity at a position — NOT
-- "free to reserve" by itself. Proof: the live CHECK constraint `inventory_reserved_within_available_
-- check` is `reserved_quantity_kg <= available_quantity_kg` (reserved is a SUBSET of the gross
-- figure, never larger); `checkout_order()`'s own reservation step ONLY increments
-- `reserved_quantity_kg`, never touches `available_quantity_kg`; `admin_review_payment()`'s title
-- transfer DECREMENTS BOTH columns together on the seller's position when the goods (and the
-- reservation covering them) leave that position entirely. "Free to reserve" is always the COMPUTED
-- value `available_quantity_kg - reserved_quantity_kg`, never a stored column.
--
-- Consequence for this migration's own arithmetic:
--   RESERVE (gated-set entry, OR settlement of an already-READY shipment — see below):
--     reserved_quantity_kg += planned. available_quantity_kg UNCHANGED (goods have not moved; only
--     the earmark changes).
--   CANCEL/FAIL (release, goods stay in custody): reserved_quantity_kg -= released amount.
--     available_quantity_kg UNCHANGED — NEVER incremented. Releasing an earmark does not create
--     physical quantity.
--   DELIVERY (goods physically leave custody): BOTH reserved_quantity_kg AND available_quantity_kg
--     decrease by the delivered amount — the same "quantity leaves the position entirely" arithmetic
--     `admin_review_payment()` already uses for a full title transfer.
--   `storage_allocations.released_quantity_kg`/`status` (Feature 005's own existing custody ledger,
--     NOT a second/competing model) is incremented/transitioned in the SAME statement, so Feature
--     005's presentation stays consistent with what actually happened — not invented, just wired up.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ONE SHARED RESERVATION PRIMITIVE (RUN A2-PRE3): `apply_delivery_reservation(...)` — a new, narrow,
-- internal (no authenticated/anon/PUBLIC EXECUTE — see its REVOKE below) helper implementing the
-- exact-once reserve arithmetic ONCE. It is called from TWO places, never duplicated:
--   a. `validate_shipment_transition()`'s own reserve loop, when a shipment transitions INTO the
--      gated set (or into READY) while its order is ALREADY settled — the original DB-BLOCK-07 path.
--   b. `reserve_ready_deliveries_for_settlement(...)` (new), called from `admin_review_payment()`
--      AFTER that function has established the buyer's `storage_allocations`/`inventory_positions`
--      custody for the order, closing the "shipment already READY while order is unsettled, THEN
--      order becomes PAID while the shipment stays READY with no shipment UPDATE to trigger a
--      reserve" window a human review found in the RUN A2-PRE2 package. This is the SAME seam the
--      future, still-unbuilt, approved Feature 008 Stripe settlement path MUST call — see §20 of the
--      design doc for the exact integration point. No second commercial truth; one authority.
-- Both call sites pass their own already-locked `shipment_items` row id and rely on the SAME
-- exact-once `GET DIAGNOSTICS`-proven guarded child UPDATE, coupled to the SAME `inventory_positions`
-- increment, inside `apply_delivery_reservation(...)` itself — not re-implemented per caller.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- READY-PATH RULE (RUN A2-PRE Issue 8, extended by RUN A2-PRE3 — state-aware, not a global gate):
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- `READY` is gated at the moment of the shipment TRANSITION only when the order is ALREADY in the
-- settled family at that exact transition (unchanged from RUN A2-PRE — Feature 007's own pre-payment
-- `REQUESTED -> READY` path, live-proven at `tests/finance/read.test.ts#markShipmentReadyAsWarehouse`,
-- is never gated by this rule, because the order is never settled at that point).
--
-- RUN A2-PRE3 adds the SETTLEMENT-time counterpart: a shipment that reached READY *before* its order
-- settled is reserved automatically, atomically, in the SAME transaction that settles the order (see
-- `reserve_ready_deliveries_for_settlement(...)` above) — so there is NO post-settlement window where
-- an approved, already-READY delivery sits unreserved and its buyer-custody quantity is tradable.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- COLUMN-TAMPER PROTECTION (RUN A2-PRE Issues 3/4, extended by RUN A2-PRE3): both new columns are
-- TRIGGER-OWNED. RLS is row authorization, not a column allowlist — `authenticated` holds a blanket
-- table-level UPDATE grant on both `order_shipments` and `shipment_items` (confirmed live), so a
-- warehouse-role client could otherwise set `settlement_verified_at`/`reserved_quantity_kg` directly
-- in the SAME UPDATE that flips status, bypassing the gate entirely. `validate_shipment_item()`
-- unconditionally overwrites `reserved_quantity_kg` with its OLD value at the very top, exactly like
-- `new.is_visible := ...` already overwrites client input in `validate_offer_transition()`.
-- `validate_shipment_transition()` does the same for `settlement_verified_at`, with ONE narrow,
-- explicit exception: a trusted transaction-local marker (`app.delivery_settlement_mutation`, set only
-- by `reserve_ready_deliveries_for_settlement(...)`, itself unreachable by any client — see its own
-- REVOKE below) permits a settlement-time stamp UPDATE that changes `settlement_verified_at` ALONE —
-- every other locked column, INCLUDING `status`, must stay byte-identical or the write is rejected.
-- The child reservation column keeps the RUN A2-PRE2 marker pattern (`app.delivery_reservation_
-- mutation`), now issued from inside the shared `apply_delivery_reservation(...)` primitive instead
-- of being duplicated inline per caller.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- EXACT-ONCE / FAIL-CLOSED (RUN A2-PRE2, now centralized in `apply_delivery_reservation(...)`): the
-- caller first locks the shipment item (and, for the settlement path, the order_shipments row and
-- every sibling item), then the shared primitive locks the inventory position, sets the local
-- `app.delivery_reservation_mutation` marker only around a guarded child UPDATE, and only mutates
-- `inventory_positions` after `GET DIAGNOSTICS ROW_COUNT` proves that guard genuinely fired — so the
-- two ledgers cannot diverge under retry/concurrency, and cannot diverge BETWEEN the two call sites
-- either, because both call the identical function. A missing `storage_allocations`/
-- `inventory_positions` row, or more than one matching `storage_allocations` row (ambiguous — no
-- uniqueness constraint exists on that table, unlike `inventory_positions`, which IS
-- schema-uniqueness-guaranteed by `inventory_positions_lot_id_owner_organization_id_warehouse__key`),
-- RAISES a controlled exception and rolls back the WHOLE statement (for the settlement path: the whole
-- `admin_review_payment()` call, including payment confirmation and order settlement — settlement
-- never completes while leaving an approved delivery unreserved; see "SETTLEMENT FAILURE SEMANTICS"
-- below). It never silently skips or clamps with `greatest()` alone.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- SETTLEMENT FAILURE SEMANTICS (RUN A2-PRE3):
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- `reserve_ready_deliveries_for_settlement(...)` is called from inside `admin_review_payment()` AFTER
-- that function has already established every `order_items` row's buyer `storage_allocations`/
-- `inventory_positions` custody in the SAME transaction, and BEFORE the reservation is marked
-- CONSUMED / the payment CONFIRMED / the order moved to `PAID`. If it raises for ANY reason
-- (insufficient inventory, an ambiguous/missing allocation or position, or a ledger inconsistency),
-- the exception propagates out of `admin_review_payment()` uncaught — the ENTIRE payment review rolls
-- back: no payment confirmation, no order-status change, no reservation consumption. The order remains
-- exactly as it was before the review was attempted, and the finance operator sees the review fail
-- with the same controlled exception vocabulary this migration already maps.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- MULTIPLE SHIPMENTS / OVER-RESERVATION (RUN A2-PRE3): an order MAY have more than one shipment for
-- the same or different `order_items` (already true today — `validate_shipment_item()`'s own
-- `v_other_planned` sum-across-shipments check already bounds total PLANNED quantity per order_item
-- to the ordered quantity, across every non-CANCELLED/FAILED shipment). `reserve_ready_deliveries_for_
-- settlement(...)` iterates every qualifying READY shipment for the order in ascending `id` order,
-- and within each shipment every item in ascending `id` order, calling the SAME
-- `apply_delivery_reservation(...)` primitive per item — which re-reads the live, locked
-- `inventory_positions` availability for EVERY call. A second READY shipment drawing on the same
-- position therefore sees the FIRST shipment's already-applied reservation and is refused
-- (`delivery_reservation_insufficient_inventory`) if the position cannot cover both — no
-- over-reservation is possible, and no shipment is processed out of the deterministic order.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- LOCK ORDER, INCLUDING THE SETTLEMENT PATH (RUN A2-PRE3 — see design doc §20 for the full proof):
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Shipment-transition path (unchanged): order_shipments (implicit, from the triggering UPDATE) ->
-- shipment_items (ascending id) -> orders -> inventory_positions.
-- Settlement path (new): payments -> orders (both already at the TOP of `admin_review_payment()`,
-- unrelated to delivery) -> coffee_offers/inventory_positions (seller title transfer, unrelated,
-- unchanged) -> order_shipments (ascending id) -> shipment_items (ascending id) -> inventory_positions
-- (via the shared primitive).
-- These two paths lock {orders, order_shipments} in OPPOSITE relative order, because each path's
-- FIRST lock is dictated by something outside DB-BLOCK-07's own scope (the row a triggering UPDATE
-- targets is always locked before its BEFORE trigger body runs; `admin_review_payment()`'s existing,
-- already-relied-upon payment-idempotency logic already locks `orders` before anything shipment-
-- related exists). This IS a genuine, narrow lock-order inversion between "a warehouse operator
-- transitions a shipment's status" and "a finance operator settles the same order", concurrently, on
-- the SAME order. It is NOT a silent-corruption risk: PostgreSQL's own deadlock detector finds this
-- cycle and aborts ONE of the two transactions with a clean, retryable `deadlock_detected` error
-- (SQLSTATE 40P01) — no partial write, no divergent ledger. This is documented here rather than
-- eliminated because eliminating it would require reordering `admin_review_payment()`'s own existing,
-- already-relied-upon payment-first lock sequence for reasons outside this migration's scope. T013/
-- T028 must add a live test that deliberately provokes this exact collision and asserts: (a) no
-- corruption under either commit order, (b) exactly one side aborts with a deadlock error, (c) a retry
-- succeeds cleanly.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- DISPUTED = FREEZE (RUN A2-PRE Issue 12, still a recorded human decision, not self-approved here):
-- entering DISPUTED does not release the reservation. Recommended safe default; the human approver
-- may override.
--
-- FAILED/DISPUTED recovery (RUN A2-PRE2): forward re-entry is fail-closed with
-- `delivery_recovery_requires_dedicated_workflow`. This prevents a partially delivered shipment
-- from reserving its full planned quantity after a release/freeze. A future recovery workflow must
-- explicitly prove remaining quantity, custody and dispute semantics before it can widen this graph.
--
-- Scope — additive only; no existing table, column, constraint, RLS policy or table grant is removed:
--   - Two new columns: `shipment_items.reserved_quantity_kg` (with two new CHECK constraints:
--     `>= 0` and `<= planned_quantity_kg`), `order_shipments.settlement_verified_at`.
--   - Two new internal-only functions (no authenticated/anon/PUBLIC EXECUTE):
--     `apply_delivery_reservation(...)`, `reserve_ready_deliveries_for_settlement(...)`.
--   - `validate_shipment_transition()` gains the settlement gate, the reservation/release logic
--     above (now delegating its reserve arithmetic to the shared primitive), and the live re-check on
--     further gated progression.
--   - `validate_shipment_item()` gains the delivery-release logic above (inventory + storage
--     allocation + the trigger-owned reservation column) — UNCHANGED since RUN A2-PRE2; no edit was
--     needed for RUN A2-PRE3 (its existing settlement-gate read already becomes correct once the
--     settlement-time hook stamps `settlement_verified_at`).
--   - `admin_review_payment()` gains exactly ONE new statement — a call to
--     `reserve_ready_deliveries_for_settlement(...)` — inserted after buyer custody
--     (`storage_allocations`/`inventory_positions`) is established and before the reservation is
--     marked CONSUMED. No other line of its existing, already-approved body is touched.
--   - `shipments_buyer_draft_update`'s `WITH CHECK` is widened to also permit `CANCELLED` (DB-OPEN-18).
--
-- No change to `checkout_order()` or `expire_order_hold()`. No new
-- `order_shipments`/`shipment_items` status value is added. No `PROOF_SUBMITTED`/`UNDER_REVIEW`/
-- `REJECTED` status is repurposed for delivery — those strings that legitimately appear below belong
-- entirely to `admin_review_payment()`'s own pre-existing, unmodified payment-status vocabulary.
--
-- Baseline body fingerprints (md5 of prosrc with CR removed) — the TRUE current live database state,
-- unchanged since before any RUN A1/A2-PRE/A2-PRE2/A2-PRE3 work, since nothing has ever been applied —
-- see the preflight file's guard for the live-read values this migration was authored against:
--   validate_shipment_transition  93102472a7bdcdce52f645c1edb07a25
--   validate_shipment_item        ab0d35de1718d58d46f8c71cbbf95b4f
--   admin_review_payment          f94544de4180eaba90725a02c1677fb6
-- Post-migration body fingerprints, computed from THIS FILE's own text (RE-VERIFY against the real
-- live prosrc once actually applied — the rollback script's own guard will refuse to run if they
-- differ, so this is a safety net, not a silent risk):
--   validate_shipment_transition             27148260ac07d2d5e7f2e3e61c2d21aa
--   validate_shipment_item                   3ec3db2cd692958b2ad6d9ec5d15eb88   (unchanged this run)
--   admin_review_payment                     6c4141a33ac07b564a8f3b0c82a10232
--   apply_delivery_reservation (new)         4aa0a7c7dd8e39bc12a1d36b63dc21cc
--   reserve_ready_deliveries_for_settlement (new) 12226e365e405185845fc4561b87db85
--
-- Not re-applicable by design: on a second run the guard finds the new columns already present and
-- aborts. Rollback: 20260914120000_feature_009_db_block_07.rollback.sql.

begin;

do $guard$
declare
  v_problems text := '';
  v_fp text;
  v_count int;
  v_existing_settled_ready int;
  v_existing_gated_rows int;
  v_existing_reconcile_items int;
begin
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_transition';
  if v_count <> 1 or v_fp is distinct from '93102472a7bdcdce52f645c1edb07a25' then
    v_problems := v_problems || 'validate_shipment_transition: overloads=' || v_count || ' body_md5=' || coalesce(v_fp, 'missing') || ' (expected 93102472a7bdcdce52f645c1edb07a25); ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'validate_shipment_item';
  if v_count <> 1 or v_fp is distinct from 'ab0d35de1718d58d46f8c71cbbf95b4f' then
    v_problems := v_problems || 'validate_shipment_item: overloads=' || v_count || ' body_md5=' || coalesce(v_fp, 'missing') || ' (expected ab0d35de1718d58d46f8c71cbbf95b4f); ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment';
  select md5(replace(p.prosrc, chr(13), '')) into v_fp from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'admin_review_payment';
  if v_count <> 1 or v_fp is distinct from 'f94544de4180eaba90725a02c1677fb6' then
    v_problems := v_problems || 'admin_review_payment: overloads=' || v_count || ' body_md5=' || coalesce(v_fp, 'missing') || ' (expected f94544de4180eaba90725a02c1677fb6); ';
  end if;

  -- Function text is insufficient: correctness depends on these exact baseline trigger bindings
  -- and their timing.  The migration will deliberately widen only the shipment transition binding
  -- to INSERT OR UPDATE after this guard passes.
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and c.relname = 'order_shipments'
      and t.tgname = 'trg_shipment_transition' and t.tgenabled = 'O' and not t.tgisinternal
      and (t.tgtype & 2) <> 0 and (t.tgtype & 16) <> 0 and (t.tgtype & 4) = 0
      and p.proname = 'validate_shipment_transition'
  ) then
    v_problems := v_problems || 'trg_shipment_transition is not enabled BEFORE UPDATE-only on order_shipments bound to validate_shipment_transition; ';
  end if;
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public' and c.relname = 'shipment_items'
      and t.tgname = 'trg_shipment_item_validate' and t.tgenabled = 'O' and not t.tgisinternal
      and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0
      and p.proname = 'validate_shipment_item'
  ) then
    v_problems := v_problems || 'trg_shipment_item_validate is not enabled BEFORE INSERT OR UPDATE on shipment_items bound to validate_shipment_item; ';
  end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_items' and column_name = 'reserved_quantity_kg') then
    v_problems := v_problems || 'shipment_items.reserved_quantity_kg already exists; ';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_shipments' and column_name = 'settlement_verified_at') then
    v_problems := v_problems || 'order_shipments.settlement_verified_at already exists; ';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_delivery_reservation') then
    v_problems := v_problems || 'apply_delivery_reservation already exists; ';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reserve_ready_deliveries_for_settlement') then
    v_problems := v_problems || 'reserve_ready_deliveries_for_settlement already exists; ';
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosrc like '%delivery_reservation_requires_settled_order%'
        or p.prosrc like '%delivery_reservation_insufficient_inventory%'
        or p.prosrc like '%delivery_reservation_position_missing%'
        or p.prosrc like '%delivery_release_position_missing%'
        or p.prosrc like '%delivery_reservation_ledger_inconsistent%'
        or p.prosrc like '%delivery_reservation_position_ambiguous%'
        or p.prosrc like '%shipment_must_start_draft%'
        or p.prosrc like '%delivery_recovery_requires_dedicated_workflow%')
  ) then
    v_problems := v_problems || 'draft exception strings already referenced by an existing function; ';
  end if;

  -- No silent grandfathering/backfill for the categories that remain DANGEROUS after RUN A2-PRE3's
  -- settlement-time hook: a settled READY row without a reservation (would have to have been
  -- reserved by a hook this database has never had), or ANY row already in the operational gated set
  -- (CAPACITY_CONFIRMED/RESERVED/PICKING/BOOKED/DISPATCHED/PARTIALLY_DELIVERED) regardless of
  -- settlement, since those states imply physical progression the pre-migration database could not
  -- have gated correctly. An UNSETTLED READY row is EXPLICITLY EXCLUDED from this stop condition —
  -- RUN A2-PRE3's `reserve_ready_deliveries_for_settlement(...)` guarantees it will be reserved
  -- atomically the moment its order settles; treating it as a blocker would be exactly the "blanket
  -- zero unsettled READY" mistake a human review rejected. See the preflight file's own summary for
  -- the full, separately-reported category breakdown.
  select count(*) into v_existing_settled_ready
  from public.order_shipments os
  join public.orders o on o.id = os.order_id
  where os.status = 'READY'
    and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED');
  select count(*) into v_existing_gated_rows
  from public.order_shipments
  where status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED');
  select count(*) into v_existing_reconcile_items
  from public.shipment_items si
  join public.order_shipments os on os.id = si.shipment_id
  left join public.orders o on o.id = os.order_id
  where si.planned_quantity_kg > si.delivered_quantity_kg
    and (
      (os.status = 'READY' and o.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED'))
      or os.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED')
    );
  if v_existing_settled_ready <> 0 or v_existing_gated_rows <> 0 or v_existing_reconcile_items <> 0 then
    v_problems := v_problems || 'existing settled-READY or operational-gated shipment rows (or their remaining items) require an approved reconciliation before this no-backfill draft can apply (settled_ready=' || v_existing_settled_ready || ', gated=' || v_existing_gated_rows || ', items=' || v_existing_reconcile_items || '); ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_009_db_block_07 preflight failed — nothing applied: %', v_problems;
  end if;
end;
$guard$;

-- 1. New columns + CHECK constraints -----------------------------------------------------------------
alter table public.shipment_items
  add column reserved_quantity_kg numeric(14, 3) not null default 0;

alter table public.shipment_items
  add constraint shipment_items_reserved_quantity_kg_check check (reserved_quantity_kg >= 0);

alter table public.shipment_items
  add constraint shipment_items_reserved_within_planned_check check (reserved_quantity_kg <= planned_quantity_kg);

alter table public.order_shipments
  add column settlement_verified_at timestamptz;

-- 2. apply_delivery_reservation() — the ONE shared reservation primitive (RUN A2-PRE3) -----------------
-- Internal only: no authenticated/anon/PUBLIC EXECUTE (see the REVOKE immediately below). The caller
-- MUST already hold the target shipment_items row locked FOR UPDATE with reserved_quantity_kg = 0.
CREATE OR REPLACE FUNCTION public.apply_delivery_reservation(p_shipment_item_id uuid, p_order_item_id uuid, p_lot_id uuid, p_buyer_organization_id uuid, p_planned_quantity_kg numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_alloc_count int;
  v_alloc public.storage_allocations%rowtype;
  v_position public.inventory_positions%rowtype;
  v_rows int;
begin
  select count(*) into v_alloc_count
  from public.storage_allocations
  where order_item_id = p_order_item_id
    and owner_organization_id = p_buyer_organization_id;
  if v_alloc_count = 0 then
    raise exception 'delivery_reservation_position_missing';
  elsif v_alloc_count > 1 then
    raise exception 'delivery_reservation_position_ambiguous';
  end if;

  select * into v_alloc from public.storage_allocations
  where order_item_id = p_order_item_id
    and owner_organization_id = p_buyer_organization_id
  limit 1;

  select * into v_position from public.inventory_positions ip
  where ip.lot_id = p_lot_id
    and ip.owner_organization_id = p_buyer_organization_id
    and ip.warehouse_id = v_alloc.warehouse_id
    and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
  for update;
  if v_position.id is null
     or (v_position.available_quantity_kg - v_position.reserved_quantity_kg) < p_planned_quantity_kg then
    raise exception 'delivery_reservation_insufficient_inventory';
  end if;

  -- The only permitted child-column mutation is bracketed by this transaction-local marker. It is set
  -- by this SECURITY DEFINER function immediately around an exact guarded UPDATE; clients cannot
  -- supply it through normal table DML, and the child trigger rejects every other changed business
  -- column while the marker is present.
  perform set_config('app.delivery_reservation_mutation', 'true', true);
  update public.shipment_items
  set reserved_quantity_kg = p_planned_quantity_kg
  where id = p_shipment_item_id and reserved_quantity_kg = 0;
  perform set_config('app.delivery_reservation_mutation', 'false', true);
  get diagnostics v_rows = row_count;
  if v_rows = 1 then
    update public.inventory_positions
    set reserved_quantity_kg = reserved_quantity_kg + p_planned_quantity_kg,
        updated_at = now()
    where id = v_position.id;
  else
    raise exception 'delivery_reservation_ledger_inconsistent';
  end if;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_delivery_reservation(uuid, uuid, uuid, uuid, numeric) FROM PUBLIC, authenticated, anon;

-- 3. reserve_ready_deliveries_for_settlement() — the settlement-time hook (RUN A2-PRE3) ---------------
-- Internal only: no authenticated/anon/PUBLIC EXECUTE (see the REVOKE immediately below). Called ONLY
-- from a trusted settlement authority (currently admin_review_payment(); the future approved
-- Feature 008 settlement path must call this SAME function) AFTER that caller has already established
-- the buyer's storage_allocations/inventory_positions custody for every order_item, in the SAME
-- transaction.
CREATE OR REPLACE FUNCTION public.reserve_ready_deliveries_for_settlement(p_order_id uuid, p_buyer_organization_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_shipment record;
  v_item record;
begin
  for v_shipment in
    select id
    from public.order_shipments
    where order_id = p_order_id
      and status = 'READY'
      and settlement_verified_at is null
    order by id
    for update
  loop
    for v_item in
      select si.id, si.order_item_id, si.planned_quantity_kg, si.delivered_quantity_kg, si.reserved_quantity_kg, oi.lot_id
      from public.shipment_items si
      join public.order_items oi on oi.id = si.order_item_id
      where si.shipment_id = v_shipment.id
      order by si.id
      for update of si
    loop
      if v_item.reserved_quantity_kg <> 0 then
        raise exception 'delivery_reservation_ledger_inconsistent';
      end if;
      if v_item.planned_quantity_kg > v_item.delivered_quantity_kg then
        perform public.apply_delivery_reservation(
          v_item.id, v_item.order_item_id, v_item.lot_id, p_buyer_organization_id, v_item.planned_quantity_kg
        );
      end if;
    end loop;

    -- Trusted settlement stamp: the ONLY UPDATE this function issues against order_shipments itself,
    -- guarded by the same transaction-local-marker pattern used for the child reservation column, so
    -- validate_shipment_transition's tamper-protection reset does not discard this trusted write.
    perform set_config('app.delivery_settlement_mutation', 'true', true);
    update public.order_shipments
    set settlement_verified_at = now()
    where id = v_shipment.id;
    perform set_config('app.delivery_settlement_mutation', 'false', true);
    if not found then
      raise exception 'delivery_reservation_ledger_inconsistent';
    end if;
  end loop;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_ready_deliveries_for_settlement(uuid, uuid) FROM PUBLIC, authenticated, anon;

-- 4. validate_shipment_transition() — settlement gate + reservation/release, now delegating its own
--    reserve arithmetic to the shared primitive, and accepting the trusted settlement-time stamp -----
CREATE OR REPLACE FUNCTION public.validate_shipment_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_alloc_count int;
  v_settled boolean := false;
  v_newly_gated boolean := false;
  v_already_gated boolean := false;
  v_releasing boolean := false;
  v_item_count int := 0;
  v_unreserved_count int := 0;
  v_reserved_count int := 0;
  v_remaining_quantity numeric(14,3);
  v_rows int;
  v_trusted_settlement_mutation boolean := coalesce(current_setting('app.delivery_settlement_mutation', true), 'false') = 'true';
  v_alloc public.storage_allocations%rowtype;
  v_position public.inventory_positions%rowtype;
begin

  -- The baseline binding is UPDATE-only.  This draft replaces it with BEFORE INSERT OR UPDATE so a
  -- buyer's permitted DRAFT insert cannot pre-seed the diagnostic gate.  Operational insertion is
  -- deliberately fail-closed: a shipment must first exist as DRAFT with its plan before a later,
  -- separately validated transition can reserve inventory.
  if tg_op = 'INSERT' then
    new.settlement_verified_at := null;
    if new.status <> 'DRAFT' then
      raise exception 'shipment_must_start_draft';
    end if;
    return new;
  end if;

  -- UPDATE tamper protection: no caller may pre-populate or alter this trigger-owned value, EXCEPT
  -- the trusted settlement-time stamp issued by reserve_ready_deliveries_for_settlement() under its
  -- own transaction-local marker, which may ONLY change this one column — status and every locked
  -- detail field must stay byte-identical, or the write is rejected outright.
  if v_trusted_settlement_mutation then
    if new.status is distinct from old.status
       or new.delivery_method is distinct from old.delivery_method
       or new.country_code is distinct from old.country_code
       or new.city is distinct from old.city
       or new.address_line is distinct from old.address_line
       or new.contact_name is distinct from old.contact_name
       or new.contact_phone is distinct from old.contact_phone
       or new.shipping_fee is distinct from old.shipping_fee
    then
      raise exception 'delivery_reservation_ledger_inconsistent';
    end if;
  else
    new.settlement_verified_at := old.settlement_verified_at;
  end if;

  if new.status <> old.status then

    -- Buyer can only request/cancel draft.
    if not public.is_warehouse_operator()
       and not public.is_internal_transition()
       and not (
         old.status = 'DRAFT'
         and new.status in (
           'REQUESTED',
           'CANCELLED'
         )
       )
    then
      raise exception
        'warehouse_required_for_operational_shipment_status';
    end if;


    if old.status = 'DRAFT'
       and new.status not in (
         'REQUESTED',
         'READY',
         'CANCELLED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'REQUESTED'
       and new.status not in (
         'CAPACITY_CONFIRMED',
         'READY',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'CAPACITY_CONFIRMED'
       and new.status not in (
         'RESERVED',
         'READY',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'READY'
       and new.status not in (
         'RESERVED',
         'BOOKED',
         'PICKING',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'RESERVED'
       and new.status not in (
         'PICKING',
         'BOOKED',
         'CANCELLED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status in (
      'PICKING',
      'BOOKED'
    )
    and new.status not in (
      'DISPATCHED',
      'CANCELLED',
      'FAILED',
      'DISPUTED'
    )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'DISPATCHED'
       and new.status not in (
         'PARTIALLY_DELIVERED',
         'DELIVERED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status = 'PARTIALLY_DELIVERED'
       and new.status not in (
         'DELIVERED',
         'FAILED',
         'DISPUTED'
       )
    then
      raise exception 'invalid_shipment_transition';

    elsif old.status in (
      'DELIVERED',
      'CANCELLED'
    )
    then
      raise exception 'terminal_shipment_cannot_change';

    -- Recovery after failure/dispute needs an explicit future workflow.  A permissive re-entry
    -- would have to prove the remaining (not planned) quantity and custody invariants; this draft
    -- intentionally does neither silently.
    elsif old.status in ('FAILED', 'DISPUTED') then
      raise exception 'delivery_recovery_requires_dedicated_workflow';

    end if;


    -- Lock every child row before the order/position. The original shipment UPDATE has already
    -- locked order_shipments. A direct delivery UPDATE implicitly locks its item first and then
    -- takes the same item -> order -> position suffix below, preventing an order/item inversion.
    for v_item in
      select si.id, si.planned_quantity_kg, si.delivered_quantity_kg, si.reserved_quantity_kg
      from public.shipment_items si
      where si.shipment_id = new.id
      order by si.id
      for update
    loop
      v_item_count := v_item_count + 1;
      v_remaining_quantity := v_item.planned_quantity_kg - v_item.delivered_quantity_kg;
      if v_item.reserved_quantity_kg = 0 then
        v_unreserved_count := v_unreserved_count + 1;
      elsif v_item.reserved_quantity_kg = v_remaining_quantity then
        v_reserved_count := v_reserved_count + 1;
      else
        raise exception 'delivery_reservation_ledger_inconsistent';
      end if;
    end loop;

    -- Only after the fixed-id item lock set is held, lock the order. This same order lock is taken
    -- by direct delivered-quantity writes in validate_shipment_item(), preserving one protocol.
    select * into v_order from public.orders where id = new.order_id for update;
    v_settled := v_order.status in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED');
    v_already_gated := old.settlement_verified_at is not null;
    v_newly_gated :=
      (new.status in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED')
       and old.status not in ('CAPACITY_CONFIRMED', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED', 'PARTIALLY_DELIVERED', 'DELIVERED'))
      or (new.status = 'READY' and old.status <> 'READY' and v_settled);

    if v_newly_gated then
      if not v_settled then
        raise exception 'delivery_reservation_requires_settled_order';
      end if;
      if v_item_count = 0 or (v_unreserved_count > 0 and v_reserved_count > 0) then
        raise exception 'delivery_reservation_ledger_inconsistent';
      end if;

      -- A READY re-entry or frozen reservation is ALREADY covered.  Do not repeat availability
      -- checks against its own earmark and do not attempt another reserve.
      if v_unreserved_count = v_item_count then
        for v_item in
          select si.id, si.order_item_id, si.planned_quantity_kg, oi.lot_id
          from public.shipment_items si
          join public.order_items oi on oi.id = si.order_item_id
          where si.shipment_id = new.id
          order by si.id
          for update of si
        loop
          perform public.apply_delivery_reservation(
            v_item.id, v_item.order_item_id, v_item.lot_id, v_order.buyer_organization_id, v_item.planned_quantity_kg
          );
        end loop;
      end if;
      new.settlement_verified_at := now();

    elsif v_already_gated
       and new.status <> old.status
       and new.status not in ('CANCELLED', 'FAILED', 'DISPUTED')
    then
      if not v_settled then
        raise exception 'delivery_reservation_requires_settled_order';
      end if;
    end if;

    -- Full cancel/fail release: after locking and proving the child guard first, subtract the exact
    -- same amount from the position.  Any mismatch aborts the statement; no clamp/silent skip exists.
    v_releasing := new.status in ('CANCELLED', 'FAILED') and v_already_gated;
    if v_releasing then
      for v_item in
        select si.id, si.order_item_id, si.reserved_quantity_kg, oi.lot_id
        from public.shipment_items si
        join public.order_items oi on oi.id = si.order_item_id
        where si.shipment_id = new.id and si.reserved_quantity_kg > 0
        order by si.id
        for update of si
      loop
        select count(*) into v_alloc_count from public.storage_allocations
        where order_item_id = v_item.order_item_id and owner_organization_id = v_order.buyer_organization_id;
        if v_alloc_count = 0 then
          raise exception 'delivery_release_position_missing';
        elsif v_alloc_count > 1 then
          raise exception 'delivery_reservation_position_ambiguous';
        end if;
        select * into v_alloc from public.storage_allocations
        where order_item_id = v_item.order_item_id and owner_organization_id = v_order.buyer_organization_id
        limit 1;
        select * into v_position from public.inventory_positions ip
        where ip.lot_id = v_item.lot_id
          and ip.owner_organization_id = v_order.buyer_organization_id
          and ip.warehouse_id = v_alloc.warehouse_id
          and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
        for update;
        if v_position.id is null then
          raise exception 'delivery_release_position_missing';
        end if;
        if v_position.reserved_quantity_kg < v_item.reserved_quantity_kg then
          raise exception 'delivery_reservation_ledger_inconsistent';
        end if;

        perform set_config('app.delivery_reservation_mutation', 'true', true);
        update public.shipment_items
        set reserved_quantity_kg = 0
        where id = v_item.id and reserved_quantity_kg = v_item.reserved_quantity_kg;
        perform set_config('app.delivery_reservation_mutation', 'false', true);
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          raise exception 'delivery_reservation_ledger_inconsistent';
        end if;

        -- available_quantity_kg is NEVER incremented here: cancel/fail releases only an earmark.
        update public.inventory_positions
        set reserved_quantity_kg = reserved_quantity_kg - v_item.reserved_quantity_kg,
            updated_at = now()
        where id = v_position.id;
      end loop;
    end if;

  end if;


  if old.status <> 'DRAFT'
     and (
       new.delivery_method
         is distinct from old.delivery_method
       or new.country_code
         is distinct from old.country_code
       or new.city
         is distinct from old.city
       or new.address_line
         is distinct from old.address_line
       or new.contact_name
         is distinct from old.contact_name
       or new.contact_phone
         is distinct from old.contact_phone
       or new.shipping_fee
         is distinct from old.shipping_fee
     )
  then
    raise exception 'shipment_details_are_locked';
  end if;


  return new;
end;
$function$;
-- validate_shipment_transition is a trigger function; CREATE OR REPLACE keeps its existing ACL/trigger binding unchanged.

-- 5. validate_shipment_item() — UNCHANGED this run (RUN A2-PRE3 needed no edit here: its existing
--    settlement-gate read already becomes correct the moment the new settlement-time hook stamps
--    settlement_verified_at). Re-declared only so this file's own fingerprint guard/rollback can
--    prove the live body still matches byte-for-byte after RUN A2-PRE2. -------------------------------
CREATE OR REPLACE FUNCTION public.validate_shipment_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_item_order_id uuid;
  v_shipment_order_id uuid;
  v_shipment_status text;
  v_shipment_settlement_verified_at timestamptz;
  v_order_status text;
  v_ordered_quantity numeric(14,3);
  v_other_planned numeric(14,3);
  v_newly_delivered numeric(14,3);
  v_buyer_organization_id uuid;
  v_lot_id uuid;
  v_alloc public.storage_allocations%rowtype;
  v_alloc_count int;
  v_position public.inventory_positions%rowtype;
  v_internal_reservation_mutation boolean := coalesce(current_setting('app.delivery_reservation_mutation', true), 'false') = 'true';
begin

  -- The only exception to the client-tamper reset is the exact guarded child mutation emitted by
  -- validate_shipment_transition() under its transaction-local SECURITY DEFINER marker.  It may
  -- alter reserved_quantity_kg only; all ordinary UPDATEs still discard client input here.
  if tg_op = 'INSERT' then
    new.reserved_quantity_kg := 0;
  elsif tg_op = 'UPDATE' then
    if v_internal_reservation_mutation then
      if new.order_item_id is distinct from old.order_item_id
         or new.shipment_id is distinct from old.shipment_id
         or new.planned_quantity_kg is distinct from old.planned_quantity_kg
         or new.delivered_quantity_kg is distinct from old.delivered_quantity_kg
      then
        raise exception 'delivery_reservation_ledger_inconsistent';
      end if;
    else
      new.reserved_quantity_kg := old.reserved_quantity_kg;
    end if;
  end if;

  select
    oi.order_id,
    oi.quantity_kg,
    oi.lot_id
  into
    v_item_order_id,
    v_ordered_quantity,
    v_lot_id
  from public.order_items oi
  where oi.id = new.order_item_id;


  select
    os.order_id,
    os.status,
    os.settlement_verified_at
  into
    v_shipment_order_id,
    v_shipment_status,
    v_shipment_settlement_verified_at
  from public.order_shipments os
  where os.id = new.shipment_id;


  if v_item_order_id is null
     or v_shipment_order_id is null
  then
    raise exception 'shipment_or_order_item_missing';
  end if;


  if v_item_order_id <> v_shipment_order_id then
    raise exception 'shipment_order_item_mismatch';
  end if;


  -- The triggering item UPDATE already owns the item lock.  Lock the parent order next, matching
  -- validate_shipment_transition's item -> order -> position protocol before making any custody
  -- reduction decision.
  select status
  into v_order_status
  from public.orders
  where id = v_item_order_id
  for update;


  if tg_op = 'INSERT' then

    if v_shipment_status <> 'DRAFT' then
      raise exception 'shipment_plan_is_closed';
    end if;

    if new.delivered_quantity_kg <> 0 then
      raise exception 'delivery_reservation_requires_settled_order';
    end if;

  elsif tg_op = 'UPDATE' then

    if new.planned_quantity_kg
       is distinct from old.planned_quantity_kg
       and v_shipment_status <> 'DRAFT'
    then
      raise exception 'shipment_plan_is_closed';
    end if;


    if new.delivered_quantity_kg
       is distinct from old.delivered_quantity_kg
    then

      if not public.is_warehouse_operator()
         and not public.is_internal_transition()
      then
        raise exception
          'only_warehouse_can_record_delivery';
      end if;

      if v_shipment_settlement_verified_at is null
         or v_order_status not in ('PAID', 'FULFILLMENT_IN_PROGRESS', 'PARTIALLY_DELIVERED', 'COMPLETED')
      then
        raise exception 'delivery_reservation_requires_settled_order';
      end if;

      if new.delivered_quantity_kg <
         old.delivered_quantity_kg
      then
        raise exception
          'delivered_quantity_cannot_decrease';
      end if;

      -- Feature 009 DB-BLOCK-07 (Issues 1/2/6/7/9, hardened) — release exactly the newly-delivered
      -- amount. Goods LEAVE custody entirely: both reserved_quantity_kg AND available_quantity_kg
      -- decrease together (see the migration file's own header for the proof this is the correct
      -- arithmetic). storage_allocations (Feature 005's OWN existing custody ledger) is updated in
      -- the same statement, never a second/competing model. Fails closed on a missing/ambiguous
      -- allocation/position or an inconsistent ledger.
      v_newly_delivered := new.delivered_quantity_kg - old.delivered_quantity_kg;

      if v_newly_delivered > 0 then

        if old.reserved_quantity_kg < v_newly_delivered then
          raise exception 'delivery_reservation_ledger_inconsistent';
        end if;

        select buyer_organization_id into v_buyer_organization_id from public.orders where id = v_item_order_id;

        select count(*) into v_alloc_count
        from public.storage_allocations
        where order_item_id = new.order_item_id
          and owner_organization_id = v_buyer_organization_id;

        if v_alloc_count = 0 then
          raise exception 'delivery_release_position_missing';
        elsif v_alloc_count > 1 then
          raise exception 'delivery_reservation_position_ambiguous';
        end if;

        select * into v_alloc
        from public.storage_allocations
        where order_item_id = new.order_item_id
          and owner_organization_id = v_buyer_organization_id
        limit 1;

        select * into v_position
        from public.inventory_positions ip
        where ip.lot_id = v_lot_id
          and ip.owner_organization_id = v_buyer_organization_id
          and ip.warehouse_id = v_alloc.warehouse_id
          and ip.warehouse_location_id is not distinct from v_alloc.warehouse_location_id
        for update;

        if v_position.id is null then
          raise exception 'delivery_release_position_missing';
        end if;

        if v_position.reserved_quantity_kg < v_newly_delivered
           or v_position.available_quantity_kg < v_newly_delivered
        then
          raise exception 'delivery_reservation_ledger_inconsistent';
        end if;

        update public.inventory_positions
        set available_quantity_kg = available_quantity_kg - v_newly_delivered,
            reserved_quantity_kg = reserved_quantity_kg - v_newly_delivered,
            updated_at = now()
        where id = v_position.id;

        update public.storage_allocations
        set released_quantity_kg = released_quantity_kg + v_newly_delivered,
            status = case when released_quantity_kg + v_newly_delivered >= quantity_kg then 'DELIVERED' else 'RELEASED' end
        where id = v_alloc.id;

        new.reserved_quantity_kg := old.reserved_quantity_kg - v_newly_delivered;

      end if;

    end if;

  end if;


  if new.delivered_quantity_kg >
     new.planned_quantity_kg
  then
    raise exception 'delivered_quantity_exceeds_plan';
  end if;


  select coalesce(
    sum(si.planned_quantity_kg),
    0
  )
  into v_other_planned
  from public.shipment_items si
  join public.order_shipments os
    on os.id = si.shipment_id
  where si.order_item_id =
        new.order_item_id
    and si.id <> new.id
    and os.status not in (
      'CANCELLED',
      'FAILED'
    );


  if v_other_planned +
     new.planned_quantity_kg >
     v_ordered_quantity
  then
    raise exception
      'shipment_plan_exceeds_order_item';
  end if;


  return new;
end;
$function$;
-- validate_shipment_item is a trigger function; CREATE OR REPLACE keeps its existing ACL/trigger binding unchanged.

-- 6. Bind validate_shipment_transition on INSERT as well as UPDATE.  This is required for the
-- trigger-owned INSERT reset above; the guard/preflight prove the exact baseline binding first.
drop trigger trg_shipment_transition on public.order_shipments;
create trigger trg_shipment_transition
before insert or update on public.order_shipments
for each row execute function public.validate_shipment_transition();

-- 7. admin_review_payment() — RUN A2-PRE3: ONE new statement (the settlement-time reservation hook
--    call) inserted after buyer custody is established and before the reservation is consumed. Every
--    other line is byte-for-byte the pre-migration baseline (proven by the guard above and by
--    tests/delivery/db-block-07-migration.test.ts) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
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


  -- Feature 009 DB-BLOCK-07 (RUN A2-PRE3): buyer storage_allocations/inventory_positions custody now
  -- exists for every order_item above. Make any already-READY-but-unreserved shipment for this order
  -- authoritative in the SAME transaction as settlement — closing the window where a shipment reached
  -- READY before payment and no shipment UPDATE would otherwise fire the reservation. Raises and rolls
  -- back this entire review (no payment confirmation, no order-status change) if a reservation cannot
  -- be established.
  perform public.reserve_ready_deliveries_for_settlement(v_order.id, v_order.buyer_organization_id);


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
-- admin_review_payment keeps its existing ACL/EXECUTE grants unchanged; CREATE OR REPLACE does not
-- alter them.

-- 8. DB-OPEN-18 (bundled per plan.md's recommendation) — permit buyer-initiated DRAFT -> CANCELLED --
drop policy if exists shipments_buyer_draft_update on public.order_shipments;
create policy shipments_buyer_draft_update
  on public.order_shipments
  for update
  to authenticated
  using (
    status = 'DRAFT'
    and exists (
      select 1
      from public.orders o
      join public.organization_members om on om.organization_id = o.buyer_organization_id
      where o.id = order_shipments.order_id
        and om.user_id = auth.uid()
        and om.is_active = true
    )
  )
  with check (status in ('DRAFT', 'REQUESTED', 'CANCELLED'));

commit;
