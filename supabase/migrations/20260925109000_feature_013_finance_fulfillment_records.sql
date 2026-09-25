-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M2c (T038) — finance and fulfillment records. Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925109000_feature_013_finance_fulfillment_records.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_finance_fulfillment_records_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human review (T041), then OPERATOR apply (T042).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §5.4–§5.6, §7.6; research R-13, R-23, R-24):
--   1. public.reconciliation_cases (+ `REC-YYYYMMDD-<7>` codes) — late/partial/wrong-currency/duplicate transfers. No
--      column or function here touches inventory (AC-009). Lifecycle = data-model §7.6 exactly, enforced by a trigger;
--      identity and observed values are frozen once opened; never deleted.
--   2. public.reconciliation_case_events — append-only history, written automatically on open and on every status change.
--   3. public.manual_financial_adjustments — append-only (FIN-010, FR-044): refund/reversal/correction records with a
--      mandatory reason; the referenced payment/payout must belong to the referenced order.
--   4. public.tax_invoices — the final-invoice record: file_asset_id/uploaded_by become nullable; status, proforma_id,
--      issued_by, issued_at_ts and a bank-free snapshot; invoice_number defaults to `INV-YYYYMMDD-<7>` from
--      tax_invoice_code_seq. UNIQUE(order_id) kept (one final invoice per order). Feature 013 invoices are frozen except
--      ISSUED → VOID and a one-time file attachment; LEGACY invoices keep their behaviour.
--   5. public.order_shipments fulfillment columns (R-13): shipment_kind (DELIVERY_REQUEST default | FULFILLMENT), the
--      group seller/warehouse and the proforma fulfillment group; one FULFILLMENT shipment per order × seller × warehouse
--      (unique partial index, AC-012). FULFILLMENT values are set only by internal (workflow) transitions and must match
--      the frozen group of that order's proforma.
--
-- WHAT IT DOES NOT DO: no RPC (M5b/M5c), no RLS policy on the new tables (M3 adds rls-storage §1 policies and the MFA
-- gates; until then only the table owner and service_role (read) see them), no change to any existing policy, to the
-- Feature 009 shipment functions or to any M1/M2a/M2b object (prevent_snapshot_mutation is reused unchanged), no data
-- backfill, no row rewritten (existing shipments read DELIVERY_REQUEST through the column default).
-- bank_transfer_checkout_enabled stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------------
do $guard$
declare
  v_problems text := '';
  v_count bigint;
  v_list text;
begin
  -- 0.1 M1, M2a and M2b applied and unchanged (their fingerprints; prevent_snapshot_mutation is reused below).
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;
  if to_regclass('public.delivery_destinations') is null or to_regclass('public.proforma_fulfillment_groups') is null
     or to_regclass('public.proforma_line_economics') is null then
    v_problems := v_problems || 'M2a/M2b (20260925103000, 20260925106000) are not both applied; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.prevent_snapshot_mutation()')), '')
     <> '286e02091213c1be4236b144dff1f383' then
    v_problems := v_problems || 'prevent_snapshot_mutation() differs from the M2b body; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.checkout_order(uuid)')), '')
     <> '54810aadbcb05915d49374d5ceae738e' then
    v_problems := v_problems || 'checkout_order(uuid) differs from the M2b body; ';
  end if;

  -- 0.2 The Feature 009 shipment machinery this migration coexists with (T006 §5 fingerprints) and its trigger set.
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.validate_shipment_transition()')), '')
       <> '27148260ac07d2d5e7f2e3e61c2d21aa'
     or coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.sync_shipment_ready()')), '')
       <> '07166e5e01629f65663a1d5937b130be' then
    v_problems := v_problems || 'validate_shipment_transition()/sync_shipment_ready() differ from T006; ';
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname) into v_list from pg_trigger t
  where t.tgrelid = to_regclass('public.order_shipments') and not t.tgisinternal;
  if v_list is distinct from 'trg_order_shipments_inventory_hold_guard, trg_shipment_ready, trg_shipment_transition, trg_shipments_updated_at' then
    v_problems := v_problems || 'order_shipments triggers differ from T006 (' || coalesce(v_list, 'none') || '); ';
  end if;

  -- 0.3 tax_invoices is still the pre-Feature 013 shape: 7 columns, file/uploader NOT NULL, the two policies, no trigger.
  select count(*) into v_count from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices';
  if v_count <> 7 then
    v_problems := v_problems || 'tax_invoices has ' || v_count || ' columns (expected 7); ';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tax_invoices'
             and column_name in ('file_asset_id', 'uploaded_by') and is_nullable = 'YES') then
    v_problems := v_problems || 'tax_invoices.file_asset_id/uploaded_by are already nullable; ';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.tax_invoices') and conname = 'tax_invoices_order_id_key'
                 and pg_get_constraintdef(oid) = 'UNIQUE (order_id)') then
    v_problems := v_problems || 'tax_invoices_order_id_key is not UNIQUE (order_id); ';
  end if;
  select string_agg(policyname, ', ' order by policyname) into v_list from pg_policies where schemaname = 'public' and tablename = 'tax_invoices';
  if v_list is distinct from 'tax_invoice_finance, tax_invoice_view' then
    v_problems := v_problems || 'tax_invoices policies differ (' || coalesce(v_list, 'none') || '); ';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = to_regclass('public.tax_invoices') and not tgisinternal) then
    v_problems := v_problems || 'tax_invoices unexpectedly carries a user trigger; ';
  end if;

  -- 0.4 Nothing this migration creates may exist yet.
  if to_regclass('public.reconciliation_cases') is not null or to_regclass('public.reconciliation_case_events') is not null
     or to_regclass('public.manual_financial_adjustments') is not null or to_regclass('public.tax_invoice_code_seq') is not null
     or to_regclass('public.reconciliation_case_code_seq') is not null or to_regclass('public.uq_order_shipment_fulfillment_group') is not null
     or to_regprocedure('public.next_tax_invoice_code()') is not null or to_regprocedure('public.next_reconciliation_case_code()') is not null
     or to_regprocedure('public.guard_reconciliation_case()') is not null or to_regprocedure('public.record_reconciliation_case_event()') is not null
     or to_regprocedure('public.validate_manual_financial_adjustment()') is not null or to_regprocedure('public.protect_tax_invoice()') is not null
     or to_regprocedure('public.guard_fulfillment_shipment_fields()') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and (
          (table_name = 'tax_invoices' and column_name in ('status', 'proforma_id', 'issued_by', 'issued_at_ts', 'snapshot'))
       or (table_name = 'order_shipments' and column_name in ('shipment_kind', 'fulfillment_seller_organization_id', 'fulfillment_warehouse_id', 'proforma_fulfillment_group_id')))) then
    v_problems := v_problems || 'an M2c object already exists; ';
  end if;

  -- 0.5 Required helpers and referenced tables; checkout still disabled; the migration role bypasses RLS.
  if to_regprocedure('public.is_internal_transition()') is null or to_regclass('public.payments') is null
     or to_regclass('public.payment_proofs') is null or to_regclass('public.payouts') is null or to_regclass('public.file_assets') is null
     or to_regclass('public.warehouses') is null or to_regclass('public.organizations') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a required helper function or table is missing; ';
  end if;
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_finance_fulfillment_records preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Code sequences and generators (same shape as next_proforma_code) ----------------------------------------------
create sequence public.tax_invoice_code_seq;
create sequence public.reconciliation_case_code_seq;
revoke all on sequence public.tax_invoice_code_seq from public, anon, authenticated;
revoke all on sequence public.reconciliation_case_code_seq from public, anon, authenticated;

create or replace function public.next_tax_invoice_code()
returns text
language sql
set search_path = pg_catalog, public
as $function$ select 'INV-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.tax_invoice_code_seq')::text, 7, '0'); $function$;
revoke all on function public.next_tax_invoice_code() from public, anon, authenticated;
grant execute on function public.next_tax_invoice_code() to service_role;

create or replace function public.next_reconciliation_case_code()
returns text
language sql
set search_path = pg_catalog, public
as $function$ select 'REC-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.reconciliation_case_code_seq')::text, 7, '0'); $function$;
revoke all on function public.next_reconciliation_case_code() from public, anon, authenticated;
grant execute on function public.next_reconciliation_case_code() to service_role;

-- 2. reconciliation_cases (data-model §5.4, §7.6) ------------------------------------------------------------------
create table public.reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  case_code text not null default public.next_reconciliation_case_code()
    constraint reconciliation_cases_case_code_key unique,
  kind text not null
    constraint reconciliation_cases_kind_check check (kind in ('LATE', 'PARTIAL', 'WRONG_CURRENCY', 'DUPLICATE', 'OTHER')),
  order_id uuid not null references public.orders(id),
  payment_id uuid not null references public.payments(id),
  proof_id uuid references public.payment_proofs(id),
  observed_amount numeric(14,2)
    constraint reconciliation_cases_observed_amount_check check (observed_amount >= 0),
  observed_currency char(3)
    constraint reconciliation_cases_observed_currency_check check (observed_currency ~ '^[A-Z]{3}$'),
  observed_value_date date,
  observed_bank_reference text
    constraint reconciliation_cases_observed_bank_reference_check check (char_length(btrim(observed_bank_reference)) between 1 and 80),
  status text not null default 'OPEN'
    constraint reconciliation_cases_status_check check (status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED_NO_ACTION')),
  resolution_type text
    constraint reconciliation_cases_resolution_type_check check (resolution_type in ('REFUNDED_EXTERNALLY', 'APPLIED_TO_NEW_ORDER', 'NO_FUNDS_RECEIVED', 'OTHER')),
  resolution_note text
    constraint reconciliation_cases_resolution_note_check check (char_length(btrim(resolution_note)) between 1 and 2000),
  linked_order_id uuid references public.orders(id),
  opened_by uuid not null references public.profiles(id),
  opened_at timestamptz not null default now(),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  -- §7.6: a closed case records who closed it and when; RESOLVED requires a resolution type; open cases carry none.
  constraint reconciliation_cases_resolved_pair_check check ((resolved_at is null) = (resolved_by is null)),
  constraint reconciliation_cases_closed_check check ((resolved_at is not null) = (status in ('RESOLVED', 'CLOSED_NO_ACTION'))),
  constraint reconciliation_cases_resolution_check check (
    (status <> 'RESOLVED' or resolution_type is not null)
    and (status in ('RESOLVED', 'CLOSED_NO_ACTION') or (resolution_type is null and resolution_note is null and linked_order_id is null))),
  constraint reconciliation_cases_linked_order_check check (
    linked_order_id is null or (resolution_type = 'APPLIED_TO_NEW_ORDER' and linked_order_id <> order_id))
);
comment on table public.reconciliation_cases is
  'Feature 013 (R-24): late, partial, wrong-currency or duplicate transfers. Never touches inventory (AC-009). Lifecycle data-model §7.6 (OPEN → IN_REVIEW → RESOLVED | CLOSED_NO_ACTION; OPEN → CLOSED_NO_ACTION) through the workflow only; identity/observed values frozen; never deleted.';
create index idx_reconciliation_cases_queue on public.reconciliation_cases (status, opened_at);
create index idx_reconciliation_cases_order on public.reconciliation_cases (order_id);
create index idx_reconciliation_cases_payment on public.reconciliation_cases (payment_id);

-- 3. reconciliation_case_events — append-only history (data-model §5.4) ------------------------------------------------
create table public.reconciliation_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.reconciliation_cases(id),
  from_status text
    constraint reconciliation_case_events_from_status_check check (from_status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED_NO_ACTION')),
  to_status text not null
    constraint reconciliation_case_events_to_status_check check (to_status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED_NO_ACTION')),
  note text
    constraint reconciliation_case_events_note_check check (char_length(btrim(note)) between 1 and 2000),
  actor_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint reconciliation_case_events_transition_check check ((from_status is null) = (to_status = 'OPEN'))
);
comment on table public.reconciliation_case_events is
  'Feature 013: append-only reconciliation case history (one row when a case opens and one per status change, written by trigger). Never updated or deleted.';
create index idx_reconciliation_case_events_case on public.reconciliation_case_events (case_id, created_at);

-- 4. manual_financial_adjustments — append-only (data-model §5.5, FIN-010, FR-044) ------------------------------------
create table public.manual_financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    constraint manual_financial_adjustments_kind_check check (kind in ('REFUND_EXTERNAL', 'REVERSAL', 'CORRECTION')),
  order_id uuid not null references public.orders(id),
  payment_id uuid references public.payments(id),
  payout_id uuid references public.payouts(id),
  amount numeric(14,2) not null
    constraint manual_financial_adjustments_amount_check check (amount > 0),
  currency char(3) not null default 'USD'
    constraint manual_financial_adjustments_currency_check check (currency = 'USD'),
  external_reference text
    constraint manual_financial_adjustments_external_reference_check check (char_length(btrim(external_reference)) between 1 and 120),
  reason text not null
    constraint manual_financial_adjustments_reason_check check (char_length(btrim(reason)) between 1 and 2000),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now()
);
comment on table public.manual_financial_adjustments is
  'Feature 013 (R-24, FIN-010, FR-044): append-only record of an external refund, reversal or correction. No automated bank action and no inventory or title effect. amount is a positive magnitude in USD; the kind carries the direction.';
create index idx_manual_financial_adjustments_order on public.manual_financial_adjustments (order_id);

-- 5. tax_invoices — the final-invoice record (data-model §5.6, R-23) ------------------------------------------------
alter table public.tax_invoices
  alter column file_asset_id drop not null,
  alter column uploaded_by drop not null,
  alter column invoice_number set default public.next_tax_invoice_code(),
  add column status text not null default 'ISSUED',
  add column proforma_id uuid,
  add column issued_by uuid references public.profiles(id),
  add column issued_at_ts timestamptz,
  add column snapshot jsonb,
  add constraint tax_invoices_status_check check (status in ('ISSUED', 'VOID')),
  -- the invoiced proforma belongs to the invoiced order
  add constraint tax_invoices_proforma_fkey foreign key (proforma_id, order_id) references public.proforma_invoices (id, order_id),
  -- LEGACY rows (no proforma) keep the pre-Feature 013 NOT NULL file/uploader and carry no Feature 013 values
  add constraint tax_invoices_legacy_shape_check check (
    proforma_id is not null
    or (file_asset_id is not null and uploaded_by is not null and issued_by is null and issued_at_ts is null and snapshot is null)),
  -- Feature 013 rows are issued by the workflow with a frozen snapshot; the signed PDF may be attached later
  add constraint tax_invoices_feature_013_shape_check check (
    proforma_id is null
    or (issued_by is not null and issued_at_ts is not null and snapshot is not null and jsonb_typeof(snapshot) = 'object'
        and (file_asset_id is null) = (uploaded_by is null))),
  -- the snapshot never carries bank identifiers (AUD-006; research R-23), at any depth
  add constraint tax_invoices_snapshot_no_bank_check check (
    snapshot is null
    or not jsonb_path_exists(snapshot, '$.** ? (@.type() == "object" && (exists(@.iban) || exists(@.account_number) || exists(@.swift_code) || exists(@.bank_account_masked) || exists(@.account_number_last4) || exists(@.iban_last4) || exists(@.payment_reference) || exists(@.bank_instructions)))'));
comment on column public.tax_invoices.snapshot is
  'Feature 013: frozen copy of the proforma header totals, destination and parties at settlement. Never carries bank identifiers (CHECK). NULL on LEGACY invoices.';
comment on column public.tax_invoices.proforma_id is
  'Feature 013 marker: the settled proforma (same order). NULL = a LEGACY uploaded invoice (file_asset_id/uploaded_by required).';
create index idx_tax_invoices_proforma on public.tax_invoices (proforma_id) where proforma_id is not null;

-- 6. order_shipments fulfillment columns (research R-13) --------------------------------------------------------------
alter table public.order_shipments
  add column shipment_kind text not null default 'DELIVERY_REQUEST',
  add column fulfillment_seller_organization_id uuid references public.organizations(id),
  add column fulfillment_warehouse_id uuid references public.warehouses(id),
  add column proforma_fulfillment_group_id uuid references public.proforma_fulfillment_groups(id),
  add constraint order_shipments_shipment_kind_check check (shipment_kind in ('DELIVERY_REQUEST', 'FULFILLMENT')),
  add constraint order_shipments_fulfillment_fields_check check (
    (shipment_kind = 'FULFILLMENT')
    = (fulfillment_seller_organization_id is not null and fulfillment_warehouse_id is not null and proforma_fulfillment_group_id is not null)
    and (shipment_kind = 'FULFILLMENT'
         or (fulfillment_seller_organization_id is null and fulfillment_warehouse_id is null and proforma_fulfillment_group_id is null)));
comment on column public.order_shipments.shipment_kind is
  'Feature 013 (R-13): DELIVERY_REQUEST = a LEGACY buyer-planned shipment (default); FULFILLMENT = one shipment per seller × warehouse group of a settled proforma, created only by the workflow.';

-- One FULFILLMENT shipment per order × seller × warehouse group (AC-012).
create unique index uq_order_shipment_fulfillment_group on public.order_shipments (order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id)
  where shipment_kind = 'FULFILLMENT';

-- 7. Integrity functions ------------------------------------------------------------------------------------------

-- 7.1 reconciliation_cases: opened by the workflow; identity/observed values frozen; §7.6 transitions only; never deleted.
create or replace function public.guard_reconciliation_case()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  -- the only columns a case may change after it is opened
  c_mutable constant text[] := array['status', 'resolution_type', 'resolution_note', 'linked_order_id', 'resolved_by', 'resolved_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'reconciliation_case_immutable' using detail = 'a reconciliation case is never deleted';
  end if;
  if not public.is_internal_transition() then
    raise exception 'reconciliation_case_immutable' using detail = 'reconciliation cases change only through the finance workflow';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'OPEN' then
      raise exception 'reconciliation_case_invalid' using detail = 'a case is opened OPEN';
    end if;
    if not exists (select 1 from public.payments p where p.id = new.payment_id and p.order_id = new.order_id) then
      raise exception 'reconciliation_case_invalid' using detail = 'the payment does not belong to the order';
    end if;
    if new.proof_id is not null and not exists (select 1 from public.payment_proofs pp where pp.id = new.proof_id and pp.payment_id = new.payment_id) then
      raise exception 'reconciliation_case_invalid' using detail = 'the proof does not belong to the payment';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception 'reconciliation_case_immutable' using detail = 'identity and observed values are frozen once a case is opened';
  end if;
  if old.status in ('RESOLVED', 'CLOSED_NO_ACTION') then
    raise exception 'reconciliation_case_immutable' using detail = 'a closed case is final';
  end if;
  if new.status is distinct from old.status
     and not ((old.status = 'OPEN' and new.status in ('IN_REVIEW', 'CLOSED_NO_ACTION'))
              or (old.status = 'IN_REVIEW' and new.status in ('RESOLVED', 'CLOSED_NO_ACTION'))) then
    raise exception 'reconciliation_case_transition_invalid' using detail = old.status || ' -> ' || new.status;
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_reconciliation_case() from public, anon;
grant execute on function public.guard_reconciliation_case() to authenticated, service_role;

-- 7.2 History: one event when a case opens and one per status change (the note comes from app.transition_reason).
create or replace function public.record_reconciliation_case_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  insert into public.reconciliation_case_events (case_id, from_status, to_status, note, actor_user_id)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status,
          nullif(btrim(current_setting('app.transition_reason', true)), ''), auth.uid());
  return null;
end;
$function$;
revoke all on function public.record_reconciliation_case_event() from public, anon;
grant execute on function public.record_reconciliation_case_event() to authenticated, service_role;

-- 7.3 manual_financial_adjustments: recorded by the workflow; the payment/payout belong to the order. (UPDATE/DELETE are
--     refused by the reused M2b prevent_snapshot_mutation().)
create or replace function public.validate_manual_financial_adjustment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if not public.is_internal_transition() then
    raise exception 'manual_adjustment_invalid' using detail = 'manual adjustments are recorded only through the finance workflow';
  end if;
  if new.payment_id is not null and not exists (select 1 from public.payments p where p.id = new.payment_id and p.order_id = new.order_id) then
    raise exception 'manual_adjustment_invalid' using detail = 'the payment does not belong to the order';
  end if;
  if new.payout_id is not null and not exists (select 1 from public.payouts p where p.id = new.payout_id and p.order_id = new.order_id) then
    raise exception 'manual_adjustment_invalid' using detail = 'the payout does not belong to the order';
  end if;
  return new;
end;
$function$;
revoke all on function public.validate_manual_financial_adjustment() from public, anon;
grant execute on function public.validate_manual_financial_adjustment() to authenticated, service_role;

-- 7.4 tax_invoices: Feature 013 invoices are issued by the workflow, then frozen except ISSUED → VOID and a one-time file
--     attachment; never deleted (FIN-010). LEGACY invoices keep their behaviour but can never acquire Feature 013 values.
create or replace function public.protect_tax_invoice()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  c_feature_013 constant text[] := array['status', 'proforma_id', 'issued_by', 'issued_at_ts', 'snapshot'];
  c_mutable constant text[] := array['status', 'file_asset_id', 'uploaded_by'];
begin
  if tg_op = 'INSERT' then
    if new.proforma_id is not null and not public.is_internal_transition() then
      raise exception 'tax_invoice_immutable' using detail = 'a Feature 013 final invoice is issued only by the settlement workflow';
    end if;
    if new.proforma_id is not null and new.status <> 'ISSUED' then
      raise exception 'tax_invoice_invalid' using detail = 'a Feature 013 final invoice is issued ISSUED';
    end if;
    return new;
  end if;
  if old.proforma_id is null then
    -- LEGACY invoice.
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(c_feature_013) k)
       is distinct from (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(c_feature_013) k) then
      raise exception 'tax_invoice_immutable' using detail = 'a LEGACY invoice cannot acquire Feature 013 values';
    end if;
    return new;
  end if;
  -- Feature 013 invoice.
  if tg_op = 'DELETE' then
    raise exception 'tax_invoice_immutable' using detail = 'a final invoice is never deleted';
  end if;
  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception 'tax_invoice_immutable' using detail = 'a final invoice is frozen at issuance';
  end if;
  if not public.is_internal_transition() then
    raise exception 'tax_invoice_immutable' using detail = 'final invoices change only through the finance workflow';
  end if;
  if new.status is distinct from old.status and not (old.status = 'ISSUED' and new.status = 'VOID') then
    raise exception 'tax_invoice_transition_invalid' using detail = old.status || ' -> ' || new.status;
  end if;
  if (new.file_asset_id, new.uploaded_by) is distinct from (old.file_asset_id, old.uploaded_by) and old.file_asset_id is not null then
    raise exception 'tax_invoice_immutable' using detail = 'the signed file is attached once';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_tax_invoice() from public, anon;
grant execute on function public.protect_tax_invoice() to authenticated, service_role;

-- 7.5 order_shipments: FULFILLMENT fields are set only by internal transitions, never changed afterwards, and must match
--     the frozen fulfillment group of a proforma of the same order (T023 decision 3 applied to the R-13 columns).
create or replace function public.guard_fulfillment_shipment_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'UPDATE' then
    if (new.shipment_kind, new.fulfillment_seller_organization_id, new.fulfillment_warehouse_id, new.proforma_fulfillment_group_id)
       is not distinct from (old.shipment_kind, old.fulfillment_seller_organization_id, old.fulfillment_warehouse_id, old.proforma_fulfillment_group_id) then
      return new;
    end if;
    raise exception 'order_field_not_client_writable' using detail = 'a shipment''s kind and fulfillment group never change';
  end if;
  if new.shipment_kind = 'DELIVERY_REQUEST' then
    return new;
  end if;
  if not public.is_internal_transition() then
    raise exception 'order_field_not_client_writable' using detail = 'FULFILLMENT shipments are created only by the settlement workflow';
  end if;
  if not exists (
    select 1
    from public.proforma_fulfillment_groups g
    join public.proforma_invoices p on p.id = g.proforma_id
    where g.id = new.proforma_fulfillment_group_id
      and p.order_id = new.order_id
      and g.seller_organization_id = new.fulfillment_seller_organization_id
      and g.warehouse_id = new.fulfillment_warehouse_id
  ) then
    raise exception 'fulfillment_group_mismatch' using detail = 'the shipment does not match a frozen fulfillment group of this order';
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_fulfillment_shipment_fields() from public, anon;
grant execute on function public.guard_fulfillment_shipment_fields() to authenticated, service_role;

-- 8. Triggers ----------------------------------------------------------------------------------------------------
create trigger trg_reconciliation_cases_guard
  before insert or update or delete on public.reconciliation_cases
  for each row execute function public.guard_reconciliation_case();
create trigger trg_reconciliation_cases_history
  after insert or update of status on public.reconciliation_cases
  for each row execute function public.record_reconciliation_case_event();
create trigger trg_reconciliation_case_events_immutable
  before update or delete on public.reconciliation_case_events
  for each row execute function public.prevent_snapshot_mutation();

create trigger trg_manual_financial_adjustments_validate
  before insert on public.manual_financial_adjustments
  for each row execute function public.validate_manual_financial_adjustment();
create trigger trg_manual_financial_adjustments_immutable
  before update or delete on public.manual_financial_adjustments
  for each row execute function public.prevent_snapshot_mutation();

create trigger trg_tax_invoices_protect
  before insert or update or delete on public.tax_invoices
  for each row execute function public.protect_tax_invoice();

create trigger trg_order_shipments_fulfillment_guard
  before insert or update of shipment_kind, fulfillment_seller_organization_id, fulfillment_warehouse_id, proforma_fulfillment_group_id
  on public.order_shipments
  for each row execute function public.guard_fulfillment_shipment_fields();

-- 9. New tables: RLS enabled + forced; no client access until M3 adds the rls-storage §1 policies (F ∨ PA, auditors for
--    adjustments, buyers via v_buyer_reconciliation) and the MFA gates; service_role may read but never write.
alter table public.reconciliation_cases enable row level security;
alter table public.reconciliation_cases force row level security;
revoke all on table public.reconciliation_cases from public, anon, authenticated, service_role;
grant select on table public.reconciliation_cases to service_role;

alter table public.reconciliation_case_events enable row level security;
alter table public.reconciliation_case_events force row level security;
revoke all on table public.reconciliation_case_events from public, anon, authenticated, service_role;
grant select on table public.reconciliation_case_events to service_role;

alter table public.manual_financial_adjustments enable row level security;
alter table public.manual_financial_adjustments force row level security;
revoke all on table public.manual_financial_adjustments from public, anon, authenticated, service_role;
grant select on table public.manual_financial_adjustments to service_role;

commit;
