-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for 20260921120000_feature_005_db_open_19_inventory_variance_hold.sql (Feature 005 T014 / DB-OPEN-19).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MECHANICALLY SAFE ONLY BEFORE ANY CASE HAS BEEN RECORDED. `inventory_variance_events` is an append-only
-- accountability record (actor / reason / time of every hold and every resolution — SRS LOT-03, OPS-02, §13.5);
-- dropping it would destroy that record, and dropping the guards while a case is open would silently make
-- quarantined stock actionable again. The guard below therefore refuses to run while the table holds ANY row.
-- It does NOT, and cannot, undo a quantity adjustment a resolution already applied to a position (nor the
-- immutable ADJUSTMENT ownership event that recorded it): those rows are left exactly as they are.
--
-- The `authenticated` INSERT/UPDATE grants on inventory_positions that the migration revoked (hardening H1) are re-granted.
--
-- After a rollback the schema returns to the pre-migration state recorded as DB-OPEN-19 (no variance model, no
-- hold enforcement) and the application's `lib/inventory/variances.ts` reads (which query the dropped view) would
-- fail closed until the application is reverted too.

begin;

do $guard$
declare
  v_rows bigint;
begin
  if to_regclass('public.inventory_variance_events') is null then
    raise exception 'feature_005_db_open_19 rollback: inventory_variance_events does not exist — nothing to roll back';
  end if;
  select count(*) into v_rows from public.inventory_variance_events;
  if v_rows > 0 then
    raise exception 'feature_005_db_open_19 rollback refused: % recorded variance event(s) would be destroyed (and any open case would silently stop blocking). Export and approve their retention first.', v_rows;
  end if;
end
$guard$;

drop trigger if exists trg_order_shipments_inventory_hold_guard on public.order_shipments;
drop trigger if exists trg_coffee_offers_inventory_hold_guard on public.coffee_offers;
drop trigger if exists trg_inventory_positions_hold_guard on public.inventory_positions;

drop function if exists public.guard_shipment_inventory_hold();
drop function if exists public.guard_offer_inventory_hold();
drop function if exists public.guard_inventory_position_hold();
drop function if exists public.resolve_inventory_variance(uuid, text, text);
drop function if exists public.record_inventory_variance(uuid, text, numeric, numeric, text);

drop view if exists public.inventory_position_hold_notices;
drop view if exists public.inventory_position_holds;
drop view if exists public.inventory_open_cases;
drop table if exists public.inventory_variance_events; -- its triggers (append-only, no-truncate, audit) go with it
drop function if exists public.prevent_inventory_variance_mutation();

-- Restore the two pre-existing grants the migration tightened (H1). The migration's preflight refused to run unless
-- `authenticated` held exactly these, so this returns the grant to its original state — nothing wider.
grant insert, update on table public.inventory_positions to authenticated;

commit;
