-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 012 T004 / DB-OPEN-23 — append-only dispute status history + database-authoritative
-- dispute transitions. Human-approved direction (Feature 012 RUN E, 2026-09-19): satisfy FR-002 /
-- T004 literally — EVERY approved dispute status transition persists actor, previous status, new
-- status, reason, timestamp and correlation id, and the DATABASE (not only application code) enforces
-- the approved transition graph.
-- Rollback: supabase/rollback/20260919120000_feature_012_dispute_status_history.rollback.sql (paired; kept OUTSIDE
-- supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Apply: Supabase SQL Editor (repository convention — no CLI/DB URL in this environment), then run
-- supabase/maintenance/20260919_feature_012_dispute_status_history_postflight.sql (every row ok).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP (DB-OPEN-23, docs/architecture/DATABASE-CAPABILITY-MAP.md): `disputes` had NO trigger (no
-- transition guard, no audit), no status-history table existed, and `disputes_ops_update` (USING +
-- WITH CHECK `is_compliance_operator()`) let a compliance session write ANY status or column. Only
-- RESOLVED/REJECTED persisted an actor (`resolved_by`) and reason (`resolution`).
--
-- THE DESIGN — the repository's own established pattern (`validate_order_transition` +
-- `app.internal_transition`; `prevent_ownership_event_mutation`), with a DISPUTE-SPECIFIC flag so no
-- other workflow's flag can unlock disputes:
--
--   1. `dispute_status_history` — append-only: one row per transition (dispute, from, to, actor =
--      `auth.uid()`, reason, correlation id, timestamp). RLS SELECT mirrors `dispute_evidence_view`
--      exactly (the parent dispute's own three visibility branches); NO insert/update/delete policy;
--      `anon` has no grant at all; `authenticated` has SELECT only.
--   2. `transition_dispute(p_dispute_id, p_expected_status, p_to_status, p_reason)` — the ONLY way a
--      dispute's status can change. SECURITY DEFINER, and in ONE transaction it: (a) requires
--      `is_compliance_operator()` and `mfa_satisfied()`; (b) requires a non-empty reason; (c) locks
--      the dispute row (FOR UPDATE); (d) refuses unless the CURRENT status equals the status the
--      caller saw (`dispute_stale` — compare-and-set, also serialising concurrent callers); (e)
--      refuses any pair outside the approved graph (below); (f) writes the resolution/actor/time
--      exactly once for RESOLVED/REJECTED; (g) updates the dispute; (h) appends the history row.
--      It is NOT a generic setter: the target must be an approved successor of the current status.
--   3. `validate_dispute_transition()` (BEFORE INSERT OR UPDATE on `disputes`) — a new dispute must
--      start OPEN with no resolution fields; ANY update outside `transition_dispute` is refused
--      (`dispute_changes_only_through_workflow`), even for a compliance session holding the existing
--      UPDATE policy; intake columns stay immutable even inside the workflow.
--   4. `prevent_dispute_status_history_mutation()` — INSERT only from inside `transition_dispute`;
--      UPDATE always refused; DELETE refused except as the FK cascade of deleting the parent dispute
--      (which no authenticated role can do — there is no DELETE grant/policy on `disputes`; only
--      approved maintenance/fixture tooling removes disposable test disputes).
--
-- THE APPROVED TRANSITION GRAPH — identical to `lib/disputes/compliance.ts#DISPUTE_TRANSITIONS`
-- (Feature 012 RUN A); no second vocabulary:
--   OPEN         -> UNDER_REVIEW | FROZEN | REJECTED
--   UNDER_REVIEW -> FROZEN | RESOLVED | REJECTED
--   FROZEN       -> UNDER_REVIEW | RESOLVED | REJECTED
--   RESOLVED     -> CLOSED
--   REJECTED     -> CLOSED
--   CLOSED       -> (terminal)
--
-- NOT CHANGED (explicitly): DB-OPEN-09 — `FROZEN` remains a label on the dispute record only; this
-- migration adds NO effect on orders, shipments, payments, inventory or settlement. DB-BLOCK-01,
-- DB-BLOCK-04 and DB-OPEN-06 are untouched. The existing `disputes_create`, `disputes_view`,
-- `disputes_ops_update` policies and all grants on `disputes` are unchanged (the UPDATE policy is
-- simply no longer sufficient on its own — the guard trigger refuses any direct update).
--
-- BACKFILL: none. No authoritative record of past transitions' actors/reasons exists, so no history
-- is fabricated for disputes that already exist; their history begins with their first transition
-- after this migration. The preflight below records how many such disputes exist.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — refuse to change anything unless the live schema is exactly what this
--    migration was written against.
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  if to_regclass('public.disputes') is null then
    v_problems := v_problems || 'public.disputes missing; ';
  end if;
  if to_regclass('public.dispute_status_history') is not null then
    v_problems := v_problems || 'public.dispute_status_history already exists; ';
  end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'disputes'
    and column_name in ('id', 'order_id', 'opened_by_user_id', 'opened_by_organization_id', 'status', 'reason', 'resolution', 'correlation_id', 'opened_at', 'resolved_at', 'resolved_by', 'created_at', 'updated_at');
  if v_count <> 13 then
    v_problems := v_problems || 'disputes: expected 13 known columns, found ' || v_count || '; ';
  end if;

  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.disputes'::regclass and c.conname = 'disputes_status_check'
      and pg_get_constraintdef(c.oid) like '%OPEN%UNDER_REVIEW%FROZEN%RESOLVED%REJECTED%CLOSED%'
  ) then
    v_problems := v_problems || 'disputes_status_check missing or changed; ';
  end if;

  select count(*) into v_count from pg_trigger t where t.tgrelid = 'public.disputes'::regclass and not t.tgisinternal;
  if v_count <> 0 then
    v_problems := v_problems || 'disputes already has ' || v_count || ' user trigger(s); ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('transition_dispute', 'validate_dispute_transition', 'prevent_dispute_status_history_mutation');
  if v_count <> 0 then
    v_problems := v_problems || 'a Feature 012 dispute-transition function already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_compliance_operator', 'is_auditor', 'can_view_order', 'mfa_satisfied');
  if v_count <> 4 then
    v_problems := v_problems || 'expected role/visibility helpers (is_compliance_operator, is_auditor, can_view_order, mfa_satisfied), found ' || v_count || '; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_012_dispute_status_history preflight failed — nothing applied: %', v_problems;
  end if;

  select count(*) into v_count from public.disputes;
  raise notice 'feature_012_dispute_status_history: % existing dispute(s); no history is backfilled for them (no authoritative source).', v_count;
end
$guard$;

-- 1. The append-only history table ------------------------------------------------------------------
create table public.dispute_status_history (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes(id) on delete cascade,
  from_status text not null,
  to_status text not null,
  actor_user_id uuid not null references public.profiles(id),
  reason text not null,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  constraint dispute_status_history_from_status_check check (from_status in ('OPEN', 'UNDER_REVIEW', 'FROZEN', 'RESOLVED', 'REJECTED', 'CLOSED')),
  constraint dispute_status_history_to_status_check check (to_status in ('OPEN', 'UNDER_REVIEW', 'FROZEN', 'RESOLVED', 'REJECTED', 'CLOSED')),
  constraint dispute_status_history_changes_status_check check (from_status <> to_status),
  constraint dispute_status_history_reason_check check (char_length(btrim(reason)) between 1 and 2000)
);

create index dispute_status_history_dispute_id_created_at_idx
  on public.dispute_status_history (dispute_id, created_at, id);

comment on table public.dispute_status_history is
  'Feature 012 T004 / DB-OPEN-23: append-only record of every dispute status transition (actor = auth.uid(), from/to, reason, correlation id, time). Written ONLY by public.transition_dispute(); never updated; deleted only by FK cascade when a (disposable) parent dispute is removed.';

alter table public.dispute_status_history enable row level security;

revoke all on table public.dispute_status_history from public;
revoke all on table public.dispute_status_history from anon;
revoke all on table public.dispute_status_history from authenticated;
grant select on table public.dispute_status_history to authenticated;

-- Same visibility as `dispute_evidence_view`: whoever may see the parent dispute (its order's
-- participants, compliance, auditors) may see its history. No insert/update/delete policy exists.
create policy dispute_status_history_view
  on public.dispute_status_history
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.disputes d
      where d.id = dispute_status_history.dispute_id
        and (public.can_view_order(d.order_id) or public.is_compliance_operator() or public.is_auditor())
    )
  );

-- 2. Append-only guard on the history ---------------------------------------------------------------
create or replace function public.prevent_dispute_status_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if tg_op = 'INSERT' then
    -- Only public.transition_dispute() raises this transaction-local flag.
    if coalesce(current_setting('app.dispute_transition', true), 'false') <> 'true' then
      raise exception 'dispute_status_history_is_append_only';
    end if;
    return new;
  end if;

  -- The ONLY permitted delete: the FK cascade from deleting the parent dispute (nested inside the
  -- referential-action trigger, so depth > 1). A direct DELETE — by any role — is refused.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  raise exception 'dispute_status_history_is_append_only';
end;
$function$;

revoke all on function public.prevent_dispute_status_history_mutation() from public;
revoke all on function public.prevent_dispute_status_history_mutation() from anon;
revoke all on function public.prevent_dispute_status_history_mutation() from authenticated;

create trigger trg_dispute_status_history_append_only
  before insert or update or delete on public.dispute_status_history
  for each row execute function public.prevent_dispute_status_history_mutation();

-- 3. Guard on disputes: start OPEN; no change except through the workflow; intake immutable --------
create or replace function public.validate_dispute_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'OPEN' or new.resolution is not null or new.resolved_by is not null or new.resolved_at is not null then
      raise exception 'dispute_must_start_open';
    end if;
    return new;
  end if;

  if coalesce(current_setting('app.dispute_transition', true), 'false') <> 'true' then
    raise exception 'dispute_changes_only_through_workflow';
  end if;

  if new.id <> old.id
     or new.order_id <> old.order_id
     or new.opened_by_user_id <> old.opened_by_user_id
     or new.opened_by_organization_id is distinct from old.opened_by_organization_id
     or new.reason <> old.reason
     or new.correlation_id <> old.correlation_id
     or new.opened_at <> old.opened_at
     or new.created_at <> old.created_at
  then
    raise exception 'dispute_intake_is_immutable';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_dispute_transition() from public;
revoke all on function public.validate_dispute_transition() from anon;
revoke all on function public.validate_dispute_transition() from authenticated;

create trigger trg_disputes_transition_guard
  before insert or update on public.disputes
  for each row execute function public.validate_dispute_transition();

-- 4. The one authoritative transition path ------------------------------------------------------
create or replace function public.transition_dispute(
  p_dispute_id uuid,
  p_expected_status text,
  p_to_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_dispute public.disputes%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_now timestamptz := now();
  v_actor uuid := auth.uid();
  v_history_id uuid;
  v_outcome boolean;
begin
  if not public.is_compliance_operator() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
  if char_length(v_reason) = 0 then
    raise exception 'dispute_reason_required';
  end if;
  if char_length(v_reason) > 2000 then
    raise exception 'dispute_reason_too_long';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute.id is null then
    raise exception 'dispute_not_found';
  end if;

  -- Compare-and-set on the status the operator saw. Concurrent callers serialise on the row lock above;
  -- the loser re-reads the committed status here and is refused rather than overwriting.
  if p_expected_status is null or v_dispute.status <> p_expected_status then
    raise exception 'dispute_stale';
  end if;

  if not (
    (v_dispute.status = 'OPEN' and p_to_status in ('UNDER_REVIEW', 'FROZEN', 'REJECTED'))
    or (v_dispute.status = 'UNDER_REVIEW' and p_to_status in ('FROZEN', 'RESOLVED', 'REJECTED'))
    or (v_dispute.status = 'FROZEN' and p_to_status in ('UNDER_REVIEW', 'RESOLVED', 'REJECTED'))
    or (v_dispute.status = 'RESOLVED' and p_to_status = 'CLOSED')
    or (v_dispute.status = 'REJECTED' and p_to_status = 'CLOSED')
  ) then
    raise exception 'invalid_dispute_transition';
  end if;

  v_outcome := p_to_status in ('RESOLVED', 'REJECTED');
  if v_outcome and (v_dispute.resolution is not null or v_dispute.resolved_by is not null or v_dispute.resolved_at is not null) then
    raise exception 'dispute_resolution_already_recorded';
  end if;

  perform set_config('app.dispute_transition', 'true', true);

  update public.disputes
  set status = p_to_status,
      updated_at = v_now,
      resolution = case when v_outcome then v_reason else resolution end,
      resolved_by = case when v_outcome then v_actor else resolved_by end,
      resolved_at = case when v_outcome then v_now else resolved_at end
  where id = v_dispute.id;

  insert into public.dispute_status_history (dispute_id, from_status, to_status, actor_user_id, reason, correlation_id, created_at)
  values (v_dispute.id, v_dispute.status, p_to_status, v_actor, v_reason, v_dispute.correlation_id, v_now)
  returning id into v_history_id;

  perform set_config('app.dispute_transition', 'false', true);

  return jsonb_build_object(
    'dispute_id', v_dispute.id,
    'from_status', v_dispute.status,
    'to_status', p_to_status,
    'history_id', v_history_id,
    'recorded_at', v_now
  );
end;
$function$;

revoke all on function public.transition_dispute(uuid, text, text, text) from public;
revoke all on function public.transition_dispute(uuid, text, text, text) from anon;
grant execute on function public.transition_dispute(uuid, text, text, text) to authenticated;

comment on function public.transition_dispute(uuid, text, text, text) is
  'Feature 012 T004 / DB-OPEN-23: the only way a dispute status changes. Compliance-only, reason required, compare-and-set on the expected status, approved graph enforced, resolution written once, one dispute_status_history row appended (actor = auth.uid()). No effect on orders/shipments/payments/inventory (DB-OPEN-09 unchanged).';

commit;
