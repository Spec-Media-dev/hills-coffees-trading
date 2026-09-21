-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 005 T014 / DB-OPEN-19 — append-only inventory variance / hold / quarantine record, and the
-- database-enforced rule that AN AFFECTED POSITION IS NOT ACTIONABLE (SRS LOT-04, AC-05).
-- PREPARED FOR HUMAN APPROVAL — NOT APPLIED. Do not run `supabase db push` / the SQL Editor without approval.
-- Rollback: supabase/rollback/20260921120000_feature_005_db_open_19_inventory_variance_hold.rollback.sql
--           (paired; kept OUTSIDE supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260921_feature_005_db_open_19_postflight.sql — every row ok.
-- Apply path: repository convention (`supabase db push --linked` or the SQL Editor), then the postflight, then
-- `F005_LIVE_PROOF=1 npx vitest run tests/inventory` for the per-session behaviour the catalogue cannot prove.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP (docs/architecture/DATABASE-CAPABILITY-MAP.md → DB-OPEN-19). LOT-04 says an unresolved variance must
-- block affected trading and unsafe release/delivery, and must be "recorded and resolved operationally". The
-- approved schema had NO representation of variance / hold / quarantine / count, and NO authorised path that
-- adjusts a position: `inventory_warehouse_write` lets a warehouse session run a raw UPDATE on
-- `inventory_positions` that no approved operation owns, and `inventory_ownership_events` (which lists an
-- ADJUSTMENT type) is written only by `admin_review_payment()`.
--
-- THE MODEL — the repository's own established patterns (`inventory_ownership_events` append-only trigger;
-- Feature 012's `transition_dispute` + `dispute_status_history`), with an inventory-specific transaction flag so
-- no other workflow's flag can unlock it. ONE new append-only table, TWO operator functions, THREE guards:
--
--   1. `inventory_variance_events` — append-only. A case is a `RECORDED` row (kind VARIANCE | HOLD | QUARANTINE)
--      and, once resolved, exactly ONE `RESOLVED` row (outcome RELEASED | ADJUSTED) that points at it. Nothing
--      is ever updated: the original observation is preserved verbatim and "open" is DERIVED (a RECORDED row
--      with no RESOLVED sibling), so it can never drift from the history. A UNIQUE index makes a second
--      resolution impossible at the database level, whatever the callers do.
--   2. `inventory_open_cases` — an INTERNAL owner-run VIEW = the ONE definition of "open" (no client grant). The guards
--      and the two operator functions read it; the two client-facing views below select from it and add only a filter:
--      `inventory_position_holds` (warehouse operators + auditors, full columns) and `inventory_position_hold_notices`
--      (an owning member, reason-free).
--   3. `record_inventory_variance(...)` — warehouse-operator only (is_warehouse_operator() + mfa_satisfied()).
--      Locks the position (FOR UPDATE), compare-and-sets the quantity the operator saw, refuses a second open
--      case on the same position, appends the RECORDED row. It changes NO quantity — recording only freezes.
--   4. `resolve_inventory_variance(...)` — same actor rule. Locks the position, refuses a stale or already
--      resolved case, and either RELEASES (no quantity change) or ADJUSTS `available_quantity_kg` to the
--      counted quantity (never below what is reserved), appending the RESOLVED row and — for an adjustment —
--      one `inventory_ownership_events` ADJUSTMENT row (LOT-03), all in ONE transaction.
--   5. `guard_inventory_position_hold()` (BEFORE UPDATE on inventory_positions) — while a position has an open
--      case, NO write may increase `reserved_quantity_kg` (new checkout / new delivery reservation) or change
--      `available_quantity_kg` (settlement / delivery consumption / title transfer in) — except the
--      resolution's own adjustment. DECREASING `reserved_quantity_kg` stays allowed, so expiry, cancellation
--      and release still free stock instead of trapping it. This one trigger covers every existing writer
--      (`checkout_order`, `apply_delivery_reservation`, the shipment-item consumption, `admin_review_payment`)
--      WITHOUT rewriting any of them, and it applies to service_role and to raw warehouse UPDATEs alike.
--   6. `guard_offer_inventory_hold()` (BEFORE INSERT OR UPDATE on coffee_offers) — a listing cannot be CREATED,
--      or moved to PENDING_REVIEW / APPROVED / PUBLISHED, on a position with an open case. Withdrawals,
--      rejections and suspensions stay allowed (they only reduce exposure).
--   7. `guard_shipment_inventory_hold()` (BEFORE UPDATE on order_shipments) — a delivery cannot be requested or
--      progressed (REQUESTED … DISPATCHED) while the buyer's position for any of its items has an open case.
--      CANCELLED / FAILED / DISPUTED stay allowed.
--
-- WHO: the existing `is_warehouse_operator()` role (WAREHOUSE, ADMIN, SUPER_ADMIN) — no new role. Warehouse
-- operators and auditors read the case history (including the operator's free-text reason); an owning MEMBER reads only
-- the reason-free view `inventory_position_hold_notices` (SPEC PS5: the member sees "an explicit hold/variance state",
-- not the operator's working notes). There is NO insert/update/delete policy or grant for anyone; the only writers
-- are the two SECURITY DEFINER functions.
--
-- PRE-MIGRATION HARDENING (2026-09-21), four decisions recorded here so the SQL and its reasons stay together:
--   H1 DIRECT WRITES. `inventory_warehouse_write` (FOR ALL, is_warehouse_operator()) plus the table grants let a warehouse
--      SESSION raw INSERT/UPDATE `inventory_positions` — changing on-hand / reserved quantity or creating stock with NO
--      ledger event, NO variance case and NO reason (LOT-03 / LOT-04). Every legitimate writer (`checkout_order`,
--      `expire_order_hold`, `admin_review_payment`, `apply_delivery_reservation`, `validate_shipment_transition`,
--      `validate_shipment_item`, and this migration's `resolve_inventory_variance`) is SECURITY DEFINER and runs as the
--      function owner, and no application code issues a raw write (test-pinned), so section 8 revokes INSERT and UPDATE
--      on `inventory_positions` from `authenticated`. `service_role` (fixture / maintenance tooling) keeps its grants; the
--      open-case freeze still applies to it. `authenticated` already has NO DELETE grant.
--   H2 HISTORY IS NEVER ERASED. The case history's foreign keys are ON DELETE RESTRICT (not CASCADE): a position that has
--      ever had a case can never be hard-deleted, by any role, and no row of the history can be deleted, updated or
--      truncated by anyone (service_role's write privileges on the table are revoked as well). SRS OPS-02.
--   H3 REASON VISIBILITY. The operator's free text is readable by warehouse operators and auditors only. Members read the
--      reason-free notices view, and the member-visible ledger ADJUSTMENT event carries a fixed, member-safe reason (the
--      full reason stays in the case history, linked by the shared correlation id).
--   H4 HELD POSITIONS ARE FROZEN BOTH WAYS. While a case is open the position's on-hand quantity is pinned — including
--      against an INCOMING title transfer. SRS Appendix D guardrail 17 ("do not allow a warehouse mismatch or unresolved reconciliation variance
--      to continue trading as normal") + AC-05 (physical totals reconcile to ALL custody positions) + the design invariant that a case
--      is resolved against exactly the quantity it recorded (`available == recorded_quantity_kg`), so that a count
--      difference is applied once and can never drift. An incoming settlement is refused whole (its transaction rolls
--      back, the seller's side included) and succeeds after the case is resolved.
--
-- NOT CHANGED (explicitly): every existing table, column, policy and function. `checkout_order`, `expire_order_hold`,
-- `admin_review_payment`, `validate_offer_transition`, `validate_shipment_transition`, `validate_shipment_item`,
-- `apply_delivery_reservation` are untouched. The only pre-existing grant touched is `authenticated`'s INSERT/UPDATE on
-- `inventory_positions` (H1). `storage_allocations` / `inventory_warehouse_write`'s policy row are untouched. OPS-01
-- (maker-checker) is NOT simulated: one operator may record and resolve a case.
--
-- BACKFILL: none — no authoritative record of past variances exists, so none is fabricated.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — refuse to change anything unless the live schema is exactly what this migration was
--    written against.
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inventory_positions'
    and column_name in ('id', 'lot_id', 'owner_organization_id', 'warehouse_id', 'warehouse_location_id', 'available_quantity_kg', 'reserved_quantity_kg', 'created_at', 'updated_at');
  if v_count <> 9 then
    v_problems := v_problems || 'inventory_positions: expected 9 known columns, found ' || v_count || '; ';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.inventory_positions') and c.conname = 'inventory_reserved_within_available_check'
  ) then
    v_problems := v_problems || 'inventory_reserved_within_available_check missing; ';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.inventory_ownership_events') and c.conname = 'inventory_ownership_events_event_type_check'
      and pg_get_constraintdef(c.oid) like '%ADJUSTMENT%'
  ) then
    v_problems := v_problems || 'inventory_ownership_events event_type check missing ADJUSTMENT; ';
  end if;

  if to_regclass('public.warehouses') is null or to_regclass('public.profiles') is null or to_regclass('public.coffee_offers') is null
     or to_regclass('public.order_shipments') is null or to_regclass('public.shipment_items') is null or to_regclass('public.order_items') is null
     or to_regclass('public.orders') is null or to_regclass('public.storage_allocations') is null then
    v_problems := v_problems || 'a required table is missing; ';
  end if;

  if to_regclass('public.inventory_variance_events') is not null or to_regclass('public.inventory_position_holds') is not null
     or to_regclass('public.inventory_open_cases') is not null or to_regclass('public.inventory_position_hold_notices') is not null then
    v_problems := v_problems || 'the variance table/view already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_warehouse_operator', 'is_auditor', 'is_org_member', 'mfa_satisfied');
  if v_count <> 4 then
    v_problems := v_problems || 'expected role helpers (is_warehouse_operator, is_auditor, is_org_member, mfa_satisfied), found ' || v_count || '; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('record_inventory_variance', 'resolve_inventory_variance', 'guard_inventory_position_hold', 'guard_offer_inventory_hold', 'guard_shipment_inventory_hold', 'prevent_inventory_variance_mutation');
  if v_count <> 0 then
    v_problems := v_problems || 'a Feature 005 variance function already exists; ';
  end if;

  select count(*) into v_count from pg_trigger t
  where t.tgrelid = to_regclass('public.inventory_positions') and not t.tgisinternal
    and t.tgname in ('trg_audit_inventory_positions', 'trg_inventory_location', 'trg_positions_updated_at');
  if v_count <> 3 then
    v_problems := v_problems || 'inventory_positions: expected its 3 known triggers, found ' || v_count || '; ';
  end if;

  if exists (select 1 from pg_trigger t where t.tgname in ('trg_inventory_positions_hold_guard', 'trg_coffee_offers_inventory_hold_guard', 'trg_order_shipments_inventory_hold_guard') and not t.tgisinternal) then
    v_problems := v_problems || 'a hold-guard trigger already exists; ';
  end if;

  -- H1 changes exactly these two pre-existing grants; refuse to run against a schema where they are already different
  -- (the paired rollback re-grants them, which would otherwise widen access it never took away).
  if not has_table_privilege('authenticated', 'public.inventory_positions', 'INSERT')
     or not has_table_privilege('authenticated', 'public.inventory_positions', 'UPDATE') then
    v_problems := v_problems || 'authenticated no longer holds INSERT and UPDATE on inventory_positions (already tightened?); ';
  end if;
  if has_table_privilege('authenticated', 'public.inventory_positions', 'DELETE') then
    v_problems := v_problems || 'authenticated unexpectedly holds DELETE on inventory_positions; ';
  end if;

  -- H1 is only safe if EVERY function that writes inventory_positions is SECURITY DEFINER (runs as its owner, so it does not need
  -- the privilege being revoked). Refuse to revoke if any public function writes the table as its INVOKER.
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not p.prosecdef
    and p.prosrc ~* '(update|insert\s+into)\s+(public\.)?inventory_positions';
  if v_count <> 0 then
    v_problems := v_problems || v_count || ' SECURITY INVOKER function(s) write inventory_positions and would break when the privilege is revoked; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_005_db_open_19 preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. The append-only case history ---------------------------------------------------------------------
create table public.inventory_variance_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  -- The id of the RECORDED row this row belongs to (a RECORDED row points at itself).
  variance_id uuid not null references public.inventory_variance_events(id) on delete restrict,
  -- RESTRICT (H2): deleting a position can never erase its case history — a position that ever had a case is undeletable.
  inventory_position_id uuid not null references public.inventory_positions(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id),
  kind text not null,
  -- `inventory_positions.available_quantity_kg` when the case was recorded (the LOT-02 gross/on-hand figure).
  recorded_quantity_kg numeric not null,
  -- What the operator observed. Equal to the recorded quantity for a HOLD / QUARANTINE (no count difference).
  counted_quantity_kg numeric not null,
  -- The difference is computed by the database itself — never supplied, never re-derived in application code.
  variance_quantity_kg numeric generated always as (counted_quantity_kg - recorded_quantity_kg) stored,
  -- RESOLVED rows only.
  outcome text,
  resolved_quantity_kg numeric,
  reason text not null,
  actor_user_id uuid not null references public.profiles(id),
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  constraint inventory_variance_events_event_type_check check (event_type in ('RECORDED', 'RESOLVED')),
  constraint inventory_variance_events_kind_check check (kind in ('VARIANCE', 'HOLD', 'QUARANTINE')),
  constraint inventory_variance_events_outcome_check check (outcome is null or outcome in ('RELEASED', 'ADJUSTED')),
  constraint inventory_variance_events_recorded_quantity_check check (recorded_quantity_kg >= 0),
  constraint inventory_variance_events_counted_quantity_check check (counted_quantity_kg >= 0),
  constraint inventory_variance_events_resolved_quantity_check check (resolved_quantity_kg is null or resolved_quantity_kg >= 0),
  constraint inventory_variance_events_reason_check check (char_length(btrim(reason)) between 1 and 2000),
  constraint inventory_variance_events_shape_check check (
    (event_type = 'RECORDED' and variance_id = id and outcome is null and resolved_quantity_kg is null)
    or (event_type = 'RESOLVED' and variance_id <> id and outcome is not null and resolved_quantity_kg is not null)
  ),
  -- A VARIANCE is a real count difference; a HOLD / QUARANTINE carries none.
  constraint inventory_variance_events_kind_quantities_check check (
    (kind = 'VARIANCE' and counted_quantity_kg <> recorded_quantity_kg)
    or (kind <> 'VARIANCE' and counted_quantity_kg = recorded_quantity_kg)
  ),
  -- Only a count difference can be adjusted, and the adjusted quantity is exactly the counted one.
  constraint inventory_variance_events_adjusted_check check (
    outcome is distinct from 'ADJUSTED' or (kind = 'VARIANCE' and resolved_quantity_kg = counted_quantity_kg)
  )
);

-- One resolution per case, enforced by the database whatever the callers do (double-resolution / retry safety).
create unique index inventory_variance_events_single_resolution_idx
  on public.inventory_variance_events (variance_id)
  where event_type = 'RESOLVED';

-- The hot lookup the guards use: a position's RECORDED rows.
create index inventory_variance_events_position_recorded_idx
  on public.inventory_variance_events (inventory_position_id, created_at)
  where event_type = 'RECORDED';

create index inventory_variance_events_position_created_idx
  on public.inventory_variance_events (inventory_position_id, created_at, id);

comment on table public.inventory_variance_events is
  'Feature 005 T014 / DB-OPEN-19: append-only inventory variance / hold / quarantine history. A case is a RECORDED row and (once resolved) exactly one RESOLVED row; nothing is ever updated. Written ONLY by record_inventory_variance() / resolve_inventory_variance(); never updated, deleted or truncated by anyone (FKs are ON DELETE RESTRICT, so a position with history cannot be deleted either).';

alter table public.inventory_variance_events enable row level security;

revoke all on table public.inventory_variance_events from public;
revoke all on table public.inventory_variance_events from anon;
revoke all on table public.inventory_variance_events from authenticated;
grant select on table public.inventory_variance_events to authenticated;
-- The history is written only by the two SECURITY DEFINER functions (which run as the owner). service_role's default
-- write privileges are removed too, so not even maintenance tooling can rewrite or truncate it (H2).
revoke insert, update, delete, truncate on table public.inventory_variance_events from service_role;

-- H3: the full history — INCLUDING the operator's free-text reason — is for warehouse operators and auditors only.
-- An owning member reads its own positions' cases through `inventory_position_hold_notices` (section 3), which has no
-- reason / actor / correlation column. No insert/update/delete policy exists for anyone.
create policy inventory_variance_events_view
  on public.inventory_variance_events
  for select
  to authenticated
  using (public.is_warehouse_operator() or public.is_auditor());

-- 2. Append-only guard --------------------------------------------------------------------------------
create or replace function public.prevent_inventory_variance_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if tg_op = 'INSERT' then
    -- Only record_inventory_variance() / resolve_inventory_variance() raise this transaction-local flag.
    if coalesce(current_setting('app.inventory_variance_write', true), 'false') <> 'true' then
      raise exception 'inventory_variance_events_is_append_only';
    end if;
    return new;
  end if;

  -- UPDATE, DELETE and TRUNCATE are refused for every role, always (H2). The parent-position FK is ON DELETE RESTRICT,
  -- so there is no cascade path either: deleting a position that has case history fails at the foreign key.
  raise exception 'inventory_variance_events_is_append_only';
end;
$function$;

revoke all on function public.prevent_inventory_variance_mutation() from public;
revoke all on function public.prevent_inventory_variance_mutation() from anon;
revoke all on function public.prevent_inventory_variance_mutation() from authenticated;

create trigger trg_inventory_variance_events_append_only
  before insert or update or delete on public.inventory_variance_events
  for each row execute function public.prevent_inventory_variance_mutation();

-- TRUNCATE fires no row trigger, so it needs its own statement-level refusal.
create trigger trg_inventory_variance_events_no_truncate
  before truncate on public.inventory_variance_events
  for each statement execute function public.prevent_inventory_variance_mutation();

-- Same audit pattern as inventory_ownership_events (actor, entity, correlation).
create trigger trg_audit_inventory_variance_events
  after insert on public.inventory_variance_events
  for each row execute function public.write_audit_log();

-- 3. The ONE definition of "open", and the two filtered views over it ------------------------------------------------------
-- INTERNAL — no client privilege. Owner-run and unfiltered, so the guards (SECURITY DEFINER, and possibly called with no
-- `auth.uid()` at all, e.g. from a service_role fixture) always see every open case.
create view public.inventory_open_cases
as
select
  v.variance_id,
  v.inventory_position_id,
  v.warehouse_id,
  v.kind,
  v.recorded_quantity_kg,
  v.counted_quantity_kg,
  v.variance_quantity_kg,
  v.reason,
  v.created_at as recorded_at
from public.inventory_variance_events v
where v.event_type = 'RECORDED'
  and not exists (
    select 1
    from public.inventory_variance_events r
    where r.variance_id = v.variance_id
      and r.event_type = 'RESOLVED'
  );

revoke all on table public.inventory_open_cases from public;
revoke all on table public.inventory_open_cases from anon;
revoke all on table public.inventory_open_cases from authenticated;

comment on view public.inventory_open_cases is
  'Feature 005 T014 / DB-OPEN-19: INTERNAL — the one definition of an open case (a RECORDED inventory_variance_events row with no RESOLVED sibling). No client privilege; the guards and the operator functions read it, and inventory_position_holds / inventory_position_hold_notices filter it for warehouse operators / owning members. An open case makes its position NON-ACTIONABLE.';

-- OPERATOR-facing (warehouse operators and auditors only; full columns incl. the reason). Owner-run with an explicit filter and
-- security_barrier — the same audience as the history table's policy.
create view public.inventory_position_holds
with (security_barrier = true)
as
select c.*
from public.inventory_open_cases c
where public.is_warehouse_operator() or public.is_auditor();

revoke all on table public.inventory_position_holds from public;
revoke all on table public.inventory_position_holds from anon;
revoke all on table public.inventory_position_holds from authenticated;
grant select on table public.inventory_position_holds to authenticated;

comment on view public.inventory_position_holds is
  'Feature 005 T014 / DB-OPEN-19: the open cases, full columns including the operator''s reason — for warehouse operators and auditors only (explicit filter, security_barrier).';

-- The MEMBER-facing view (H3, PS5): only an owning organization's open cases, only reason-free columns. It is
-- Owner-run (members have no privilege on the history table), applying the ownership filter itself (`is_org_member`), with
-- security_barrier so no caller-supplied function can see a row before that filter has run. It reads
-- `inventory_open_cases`, so "open" still has ONE definition.
create view public.inventory_position_hold_notices
with (security_barrier = true)
as
select
  h.variance_id,
  h.inventory_position_id,
  h.kind,
  h.recorded_quantity_kg,
  h.counted_quantity_kg,
  h.variance_quantity_kg,
  h.recorded_at
from public.inventory_open_cases h
join public.inventory_positions ip on ip.id = h.inventory_position_id
where public.is_org_member(ip.owner_organization_id);

revoke all on table public.inventory_position_hold_notices from public;
revoke all on table public.inventory_position_hold_notices from anon;
revoke all on table public.inventory_position_hold_notices from authenticated;
grant select on table public.inventory_position_hold_notices to authenticated;

comment on view public.inventory_position_hold_notices is
  'Feature 005 T014 / DB-OPEN-19: what an owning member may see of an open case — kind, quantities and time; never the operator''s reason, actor or correlation id. Owner-run with an explicit is_org_member filter and security_barrier.';

-- 4. Guard: an affected position cannot be reserved from, consumed, or re-quantified -------------------
create or replace function public.guard_inventory_position_hold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if not exists (select 1 from public.inventory_open_cases h where h.inventory_position_id = old.id) then
    return new;
  end if;

  -- H4: the position's on-hand quantity is PINNED while a case is open — against outgoing writes (settlement, delivery
  -- consumption) AND incoming ones (a title transfer into a held buyer position). The case is resolved against exactly
  -- the quantity it recorded, so nothing may move it in between; an incoming settlement is refused whole and succeeds
  -- after resolution. Only the resolution's own adjustment may change a held position's quantity.
  if coalesce(current_setting('app.inventory_variance_resolution', true), 'false') = 'true' then
    return new;
  end if;

  -- Allowed while held: anything that only RELEASES a reservation (expiry, cancellation) or touches
  -- bookkeeping columns. Refused: a larger reservation (new checkout / delivery reservation), any change to
  -- the on-hand quantity (settlement, delivery consumption, title transfer in) and any change of identity.
  if new.reserved_quantity_kg > old.reserved_quantity_kg
     or new.available_quantity_kg <> old.available_quantity_kg
     or new.lot_id <> old.lot_id
     or new.owner_organization_id <> old.owner_organization_id
     or new.warehouse_id <> old.warehouse_id
     or new.warehouse_location_id is distinct from old.warehouse_location_id
  then
    raise exception 'inventory_position_held';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_inventory_position_hold() from public;
revoke all on function public.guard_inventory_position_hold() from anon;
revoke all on function public.guard_inventory_position_hold() from authenticated;

create trigger trg_inventory_positions_hold_guard
  before update on public.inventory_positions
  for each row execute function public.guard_inventory_position_hold();

-- 5. Guard: no new / advancing listing on an affected position -----------------------------------------
create or replace function public.guard_offer_inventory_hold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if tg_op = 'UPDATE' and (new.status = old.status or new.status not in ('PENDING_REVIEW', 'APPROVED', 'PUBLISHED')) then
    return new;
  end if;

  if exists (
    select 1
    from public.inventory_positions ip
    join public.inventory_open_cases h on h.inventory_position_id = ip.id
    where ip.lot_id = new.lot_id
      and ip.owner_organization_id = new.seller_organization_id
      and ip.warehouse_id = new.warehouse_id
      and ip.warehouse_location_id is not distinct from new.warehouse_location_id
  ) then
    raise exception 'inventory_position_held';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_offer_inventory_hold() from public;
revoke all on function public.guard_offer_inventory_hold() from anon;
revoke all on function public.guard_offer_inventory_hold() from authenticated;

create trigger trg_coffee_offers_inventory_hold_guard
  before insert or update on public.coffee_offers
  for each row execute function public.guard_offer_inventory_hold();

-- 6. Guard: no delivery request / progression against an affected position ------------------------------
create or replace function public.guard_shipment_inventory_hold()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if new.status = old.status
     or new.status not in ('REQUESTED', 'CAPACITY_CONFIRMED', 'READY', 'RESERVED', 'PICKING', 'BOOKED', 'DISPATCHED') then
    return new;
  end if;

  if exists (
    select 1
    from public.shipment_items si
    join public.order_items oi on oi.id = si.order_item_id
    join public.orders o on o.id = oi.order_id
    join public.storage_allocations sa on sa.order_item_id = oi.id and sa.owner_organization_id = o.buyer_organization_id
    join public.inventory_positions ip
      on ip.lot_id = sa.lot_id
     and ip.owner_organization_id = sa.owner_organization_id
     and ip.warehouse_id = sa.warehouse_id
     and ip.warehouse_location_id is not distinct from sa.warehouse_location_id
    join public.inventory_open_cases h on h.inventory_position_id = ip.id
    where si.shipment_id = new.id
  ) then
    raise exception 'inventory_position_held';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_shipment_inventory_hold() from public;
revoke all on function public.guard_shipment_inventory_hold() from anon;
revoke all on function public.guard_shipment_inventory_hold() from authenticated;

create trigger trg_order_shipments_inventory_hold_guard
  before update on public.order_shipments
  for each row execute function public.guard_shipment_inventory_hold();

-- 7. The two authorised operator paths ------------------------------------------------------------------
create or replace function public.record_inventory_variance(
  p_position_id uuid,
  p_kind text,
  p_expected_available_quantity_kg numeric,
  p_counted_quantity_kg numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_position public.inventory_positions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_correlation uuid := gen_random_uuid();
  v_counted numeric;
  v_now timestamptz := now();
begin
  if not public.is_warehouse_operator() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
  if p_kind is null or p_kind not in ('VARIANCE', 'HOLD', 'QUARANTINE') then
    raise exception 'variance_kind_invalid';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'variance_reason_required';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'variance_reason_too_long';
  end if;
  if p_expected_available_quantity_kg is null or p_expected_available_quantity_kg < 0 then
    raise exception 'variance_quantity_invalid';
  end if;

  select * into v_position from public.inventory_positions where id = p_position_id for update;
  if v_position.id is null then
    raise exception 'variance_position_not_found';
  end if;

  -- Compare-and-set on the on-hand quantity the operator saw. Concurrent callers serialise on the row lock
  -- above; the loser re-reads the committed state here and is refused rather than recording against a stale one.
  if v_position.available_quantity_kg <> p_expected_available_quantity_kg then
    raise exception 'variance_stale_position';
  end if;

  if exists (select 1 from public.inventory_open_cases h where h.inventory_position_id = v_position.id) then
    raise exception 'variance_already_open';
  end if;

  if p_kind = 'VARIANCE' then
    if p_counted_quantity_kg is null or p_counted_quantity_kg < 0 then
      raise exception 'variance_quantity_invalid';
    end if;
    if p_counted_quantity_kg = v_position.available_quantity_kg then
      raise exception 'variance_quantity_zero';
    end if;
    v_counted := p_counted_quantity_kg;
  else
    if p_counted_quantity_kg is not null then
      raise exception 'variance_quantity_not_applicable';
    end if;
    v_counted := v_position.available_quantity_kg;
  end if;

  perform set_config('app.correlation_id', v_correlation::text, true);
  perform set_config('app.inventory_variance_write', 'true', true);

  insert into public.inventory_variance_events (
    id, event_type, variance_id, inventory_position_id, warehouse_id, kind,
    recorded_quantity_kg, counted_quantity_kg, reason, actor_user_id, correlation_id, created_at
  )
  values (
    v_id, 'RECORDED', v_id, v_position.id, v_position.warehouse_id, p_kind,
    v_position.available_quantity_kg, v_counted, v_reason, v_actor, v_correlation, v_now
  );

  perform set_config('app.inventory_variance_write', 'false', true);

  return jsonb_build_object(
    'variance_id', v_id,
    'inventory_position_id', v_position.id,
    'kind', p_kind,
    'recorded_quantity_kg', v_position.available_quantity_kg,
    'counted_quantity_kg', v_counted,
    'correlation_id', v_correlation,
    'recorded_at', v_now
  );
end;
$function$;

revoke all on function public.record_inventory_variance(uuid, text, numeric, numeric, text) from public;
revoke all on function public.record_inventory_variance(uuid, text, numeric, numeric, text) from anon;
grant execute on function public.record_inventory_variance(uuid, text, numeric, numeric, text) to authenticated;

comment on function public.record_inventory_variance(uuid, text, numeric, numeric, text) is
  'Feature 005 T014 / DB-OPEN-19: warehouse-operator-only. Locks the position, compare-and-sets the on-hand quantity the operator saw, refuses a second open case, appends one RECORDED row. Changes NO quantity — it only makes the position non-actionable (guard_inventory_position_hold / guard_offer_inventory_hold / guard_shipment_inventory_hold).';

create or replace function public.resolve_inventory_variance(
  p_variance_id uuid,
  p_outcome text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_case public.inventory_variance_events%rowtype;
  v_position public.inventory_positions%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_resolved numeric;
  v_now timestamptz := now();
begin
  if not public.is_warehouse_operator() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
  if p_outcome is null or p_outcome not in ('RELEASED', 'ADJUSTED') then
    raise exception 'variance_outcome_invalid';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'variance_reason_required';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'variance_reason_too_long';
  end if;

  select * into v_case from public.inventory_variance_events where id = p_variance_id and event_type = 'RECORDED';
  if v_case.id is null then
    raise exception 'variance_not_found';
  end if;

  -- Lock order matches the other inventory writers (position row). Concurrent resolvers serialise here.
  select * into v_position from public.inventory_positions where id = v_case.inventory_position_id for update;
  if v_position.id is null then
    raise exception 'variance_position_not_found';
  end if;

  if exists (select 1 from public.inventory_variance_events r where r.variance_id = v_case.id and r.event_type = 'RESOLVED') then
    raise exception 'variance_already_resolved';
  end if;

  -- The on-hand quantity is frozen while a case is open, so it must still be what was recorded.
  if v_position.available_quantity_kg <> v_case.recorded_quantity_kg then
    raise exception 'variance_stale_position';
  end if;

  perform set_config('app.correlation_id', v_case.correlation_id::text, true);

  if p_outcome = 'ADJUSTED' then
    if v_case.kind <> 'VARIANCE' then
      raise exception 'variance_adjustment_not_applicable';
    end if;
    -- Never adjust below what is already reserved (that would strand an active reservation).
    if v_case.counted_quantity_kg < v_position.reserved_quantity_kg then
      raise exception 'variance_adjustment_below_reserved';
    end if;

    v_resolved := v_case.counted_quantity_kg;

    perform set_config('app.inventory_variance_resolution', 'true', true);
    update public.inventory_positions
    set available_quantity_kg = v_resolved,
        updated_at = v_now
    where id = v_position.id;
    perform set_config('app.inventory_variance_resolution', 'false', true);

    -- LOT-03: every inventory change is an immutable ledger event. quantity_kg > 0 by constraint, so the
    -- direction is carried by the endpoints: a surplus enters from no organization; a shortage leaves the owner.
    insert into public.inventory_ownership_events (
      lot_id, from_organization_id, to_organization_id, order_item_id, quantity_kg, event_type, created_by, correlation_id, reason
    )
    values (
      v_position.lot_id,
      case when v_case.variance_quantity_kg < 0 then v_position.owner_organization_id else null end,
      v_position.owner_organization_id,
      null,
      abs(v_case.variance_quantity_kg),
      'ADJUSTMENT',
      v_actor,
      v_case.correlation_id,
      -- The ledger is member-visible (spec PS3), so it carries a fixed, member-safe reason — never the operator's free
      -- text, which stays in the case history (same correlation id) for warehouse operators and auditors (H3).
      'Warehouse stock count adjustment (' || case when v_case.variance_quantity_kg < 0 then 'shortage' else 'surplus' end || ', recorded ' || v_case.recorded_quantity_kg::text || ' kg, counted ' || v_case.counted_quantity_kg::text || ' kg)'
    );
  else
    v_resolved := v_position.available_quantity_kg;
  end if;

  perform set_config('app.inventory_variance_write', 'true', true);

  insert into public.inventory_variance_events (
    id, event_type, variance_id, inventory_position_id, warehouse_id, kind,
    recorded_quantity_kg, counted_quantity_kg, outcome, resolved_quantity_kg, reason, actor_user_id, correlation_id, created_at
  )
  values (
    v_id, 'RESOLVED', v_case.id, v_case.inventory_position_id, v_case.warehouse_id, v_case.kind,
    v_case.recorded_quantity_kg, v_case.counted_quantity_kg, p_outcome, v_resolved, v_reason, v_actor, v_case.correlation_id, v_now
  );

  perform set_config('app.inventory_variance_write', 'false', true);

  return jsonb_build_object(
    'variance_id', v_case.id,
    'resolution_id', v_id,
    'inventory_position_id', v_case.inventory_position_id,
    'outcome', p_outcome,
    'recorded_quantity_kg', v_case.recorded_quantity_kg,
    'resolved_quantity_kg', v_resolved,
    'correlation_id', v_case.correlation_id,
    'resolved_at', v_now
  );
end;
$function$;

revoke all on function public.resolve_inventory_variance(uuid, text, text) from public;
revoke all on function public.resolve_inventory_variance(uuid, text, text) from anon;
grant execute on function public.resolve_inventory_variance(uuid, text, text) to authenticated;

comment on function public.resolve_inventory_variance(uuid, text, text) is
  'Feature 005 T014 / DB-OPEN-19: warehouse-operator-only. Locks the position, refuses a stale or already-resolved case, then RELEASES (no quantity change) or ADJUSTS available_quantity_kg to the counted quantity (never below what is reserved), appending one RESOLVED row and — for an adjustment — one ADJUSTMENT ownership event, in one transaction. The original observation is never edited.';

-- 8. H1 — no raw INSERT/UPDATE of a custody position by any product session --------------------------------------------
-- Positions change ONLY through the SECURITY DEFINER operations (checkout / expiry / settlement / delivery reservation and
-- consumption / this migration's resolution), each of which appends its own history. A raw `inventory_warehouse_write`
-- UPDATE could change quantity with no ledger event, no case and no reason. `authenticated` has no DELETE grant (unchanged).
-- The `inventory_warehouse_write` policy row is left in place (untouched, now inert for writes); SELECT is unchanged.
revoke insert, update on table public.inventory_positions from authenticated;

commit;
