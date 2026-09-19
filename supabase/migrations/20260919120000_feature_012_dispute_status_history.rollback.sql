-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for 20260919120000_feature_012_dispute_status_history.sql (Feature 012 T004 / DB-OPEN-23).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MECHANICALLY SAFE ONLY BEFORE ANY TRANSITION HAS BEEN RECORDED. Dropping `dispute_status_history`
-- would destroy the attribution record (actor / reason / time of every transition) — an append-only
-- accountability record the SRS says must never be destructively edited (OPS-02, §13.5). The guard
-- below therefore refuses to run while the table holds any row. It does NOT, and cannot, restore any
-- dispute status: dispute rows are left exactly as they are.
--
-- After a rollback, `disputes` reverts to the pre-migration state recorded as DB-OPEN-23 (no
-- transition guard, only resolve/reject attributable) and `lib/disputes/compliance.ts` — which now
-- calls `transition_dispute` — would refuse every transition until the application is reverted too.

begin;

do $guard$
declare
  v_rows bigint;
begin
  if to_regclass('public.dispute_status_history') is null then
    raise exception 'feature_012_dispute_status_history rollback: dispute_status_history does not exist — nothing to roll back';
  end if;
  select count(*) into v_rows from public.dispute_status_history;
  if v_rows > 0 then
    raise exception 'feature_012_dispute_status_history rollback refused: % recorded transition(s) would be destroyed. Export and approve their retention first.', v_rows;
  end if;
end
$guard$;

drop trigger if exists trg_disputes_transition_guard on public.disputes;
drop function if exists public.validate_dispute_transition();
drop function if exists public.transition_dispute(uuid, text, text, text);
drop table if exists public.dispute_status_history;
drop function if exists public.prevent_dispute_status_history_mutation();

commit;
