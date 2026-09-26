-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M2e (T050) — notification outbox. Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925115000_feature_013_notification_outbox.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_notification_outbox_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human review (T053), then OPERATOR apply (T054).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §6.1; research R-16; contracts/notification-provider.md;
-- contracts/database-rpc.md; contracts/rls-storage.md §1/§4):
--   1. public.notification_events — the transactional outbox. Events are written inside the committing commerce
--      transaction; UNIQUE(event_type, aggregate_id, dedupe_key) makes a retried emit a no-op (AC-013). event_type and
--      template_key are CHECK-bound to the notification-provider §1 catalogue; params are CHECK-bound to the §1 allow-list
--      (codes, status key, deadline, amount/currency) so no bank identifier, proof path or free-text note can be queued.
--      Identity/content columns are frozen once written; only the processing columns change (status, attempts, claims).
--      NO client role can read it: RLS forced, no policy, no table privilege for anon, authenticated or service_role
--      (the M7 worker and admin outbox view will reach it only through owner-run functions).
--   2. public.emit_notification_event(...) — the internal emitter: INSERT … ON CONFLICT DO NOTHING, returning the event id
--      (the existing one on a duplicate). SECURITY INVOKER and EXECUTE revoked from every API role: only the table owner —
--      i.e. the SECURITY DEFINER commerce functions of M4+ — can call it.
--
-- WHAT IT DOES NOT DO: no fan-out/claim/delivery function, provider, campaign or notifications change (M7), no pg_cron
-- (M7b), no admin outbox view (M3/M7), no UI, no change to any existing object, no data. bank_transfer_checkout_enabled
-- stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------------
do $guard$
declare
  v_problems text := '';
begin
  -- 0.1 M1–M2d applied and unchanged.
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.prevent_snapshot_mutation()')), '')
     <> '286e02091213c1be4236b144dff1f383' then
    v_problems := v_problems || 'prevent_snapshot_mutation() differs from the M2b body; ';
  end if;
  if to_regclass('public.delivery_destinations') is null or to_regclass('public.proforma_line_economics') is null
     or to_regclass('public.reconciliation_cases') is null or to_regclass('public.promotions') is null
     or to_regclass('public.offer_price_tiers') is null then
    v_problems := v_problems || 'M2a–M2d are not all applied; ';
  end if;

  -- 0.2 Nothing this migration creates may exist yet.
  if to_regclass('public.notification_events') is not null
     or to_regprocedure('public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)') is not null
     or to_regprocedure('public.protect_notification_event()') is not null then
    v_problems := v_problems || 'an M2e object already exists; ';
  end if;

  -- 0.3 Checkout still disabled; the migration role bypasses RLS (the owner-run emitter writes a FORCE-RLS table).
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_notification_outbox preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. notification_events — the outbox (data-model §6.1) --------------------------------------------------------------
create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    constraint notification_events_event_type_check check (event_type in (
      'proforma.issued', 'proforma.expiring_soon', 'order.awaiting_transfer', 'order.reservation_expiring',
      'payment.proof_submitted', 'finance.review_pending', 'payment.confirmed', 'payment.rejected',
      'order.expired', 'order.cancelled', 'finance.reconciliation_opened', 'fulfillment.created',
      'fulfillment.progressed', 'order.completed', 'payout.eligible', 'payout.paid', 'campaign.message')),
  aggregate_type text not null
    constraint notification_events_aggregate_type_check check (aggregate_type in ('proforma', 'order', 'payment', 'case', 'shipment', 'payout', 'campaign')),
  aggregate_id uuid not null,
  dedupe_key text not null
    constraint notification_events_dedupe_key_check check (char_length(btrim(dedupe_key)) between 1 and 200),
  -- resolution rules (e.g. {"rule": "buyer_org_members", "order_id": …}), never a list of users
  audience jsonb not null
    constraint notification_events_audience_check check (jsonb_typeof(audience) = 'object'),
  template_key text not null
    constraint notification_events_template_key_check check (template_key in (
      'proforma_issued', 'proforma_expiring', 'awaiting_transfer', 'reservation_expiring', 'proof_submitted',
      'finance_review_pending', 'payment_confirmed', 'seller_order_paid', 'payment_rejected', 'order_expired',
      'order_cancelled', 'reconciliation_opened', 'fulfillment_created', 'fulfillment_status', 'order_completed',
      'payout_eligible', 'payout_paid', 'campaign')),
  -- notification-provider §1 allow-list only; scalar values only (no nested payload can smuggle data). The path is
  -- strict: lax mode would unwrap an array value into its elements and let it through.
  params jsonb not null default '{}'::jsonb
    constraint notification_events_params_check check (
      jsonb_typeof(params) = 'object'
      and (params - array['order_code', 'proforma_code', 'case_code', 'shipment_code', 'status_key', 'deadline', 'amount', 'currency']) = '{}'::jsonb
      and not jsonb_path_exists(params, 'strict $.* ? (@.type() == "object" || @.type() == "array")')),
  status text not null default 'PENDING'
    constraint notification_events_status_check check (status in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
  attempts int not null default 0
    constraint notification_events_attempts_check check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text
    constraint notification_events_claimed_by_check check (char_length(claimed_by) between 1 and 200),
  processed_at timestamptz,
  -- sanitized error code/message only (never a provider payload)
  last_error text
    constraint notification_events_last_error_check check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  constraint notification_events_dedupe_key unique (event_type, aggregate_id, dedupe_key),
  constraint notification_events_claim_pair_check check ((claimed_at is null) = (claimed_by is null)),
  constraint notification_events_lifecycle_check check (
    (status <> 'PROCESSING' or claimed_at is not null)
    and ((processed_at is not null) = (status = 'PROCESSED')))
);
comment on table public.notification_events is
  'Feature 013 (R-16) transactional outbox: written by emit_notification_event() inside the committing commerce transaction; UNIQUE(event_type, aggregate_id, dedupe_key) makes retries harmless (AC-013). Fan-out is M7. No client role can read it.';
create index idx_notification_events_queue on public.notification_events (status, next_attempt_at);

-- Identity and content are frozen once queued; only the processing columns change (M7 worker).
create or replace function public.protect_notification_event()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  c_processing constant text[] := array['status', 'attempts', 'next_attempt_at', 'claimed_at', 'claimed_by', 'processed_at', 'last_error'];
begin
  if (to_jsonb(new) - c_processing) is distinct from (to_jsonb(old) - c_processing) then
    raise exception 'notification_event_immutable' using detail = 'an outbox event''s identity and content are frozen once queued';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_notification_event() from public, anon, authenticated;
grant execute on function public.protect_notification_event() to service_role;

create trigger trg_notification_events_immutable before update on public.notification_events
  for each row execute function public.protect_notification_event();

alter table public.notification_events enable row level security;
alter table public.notification_events force row level security;
revoke all on table public.notification_events from public, anon, authenticated, service_role;

-- 2. emit_notification_event — internal only (contracts/database-rpc.md; rls-storage §4 "Nobody") -----------------
create or replace function public.emit_notification_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_dedupe_key text,
  p_audience jsonb,
  p_template_key text,
  p_params jsonb
)
returns uuid
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_id uuid;
begin
  insert into public.notification_events (event_type, aggregate_type, aggregate_id, dedupe_key, audience, template_key, params)
  values (p_event_type, p_aggregate_type, p_aggregate_id, p_dedupe_key, p_audience, p_template_key, coalesce(p_params, '{}'::jsonb))
  on conflict (event_type, aggregate_id, dedupe_key) do nothing
  returning id into v_id;
  if v_id is null then
    select e.id into v_id from public.notification_events e
    where e.event_type = p_event_type and e.aggregate_id = p_aggregate_id and e.dedupe_key = p_dedupe_key;
  end if;
  return v_id;
end;
$function$;
comment on function public.emit_notification_event(text, text, uuid, text, jsonb, text, jsonb) is
  'Feature 013 internal outbox emitter: INSERT … ON CONFLICT DO NOTHING (a duplicate emit is a no-op and returns the existing id). SECURITY INVOKER with no EXECUTE for any API role: callable only by the table owner, i.e. inside the SECURITY DEFINER commerce functions.';
revoke all on function public.emit_notification_event(text, text, uuid, text, jsonb, text, jsonb) from public, anon, authenticated, service_role;

commit;
