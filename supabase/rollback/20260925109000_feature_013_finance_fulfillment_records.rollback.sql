-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql (Feature 013 M2c).
-- Removes exactly what M2c added and restores what it relaxed:
--   * drops reconciliation_cases, reconciliation_case_events, manual_financial_adjustments (with their triggers/indexes);
--   * drops the tax_invoices and order_shipments M2c columns, constraints, indexes and triggers; restores
--     tax_invoices.file_asset_id/uploaded_by NOT NULL and removes the invoice_number default;
--   * drops the M2c functions and the two code sequences.
-- M1, M2a and M2b stay applied (prevent_snapshot_mutation is M2b's and is NOT dropped).
-- Safe ONLY before Feature 013 finance records exist: the guard refuses (changing nothing) while any case, event or
-- adjustment row, any Feature 013 invoice, any invoice without a file/uploader, or any FULFILLMENT shipment exists, or while
-- a later Feature 013 migration is applied (roll those back first).
-- After running it: `supabase migration repair --status reverted 20260925109000` (OPERATOR); the M2c postflight is then
-- expected to FAIL and the M2b postflight to pass again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.reconciliation_cases') is null then
    v_problems := v_problems || 'M2c is not applied (reconciliation_cases missing); ';
  end if;
  if to_regclass('public.offer_price_tiers') is not null or to_regclass('public.promotions') is not null
     or to_regclass('public.notification_events') is not null
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname in ('is_order_buyer_member', 'is_order_line_seller', 'order_seller_org_ids', 'issue_proforma',
                                                             'finance_confirm_payment', 'open_reconciliation_case', 'record_manual_adjustment')) then
    v_problems := v_problems || 'a later Feature 013 migration (M2d+) is still applied; ';
  end if;
  if exists (select 1 from public.reconciliation_cases) or exists (select 1 from public.reconciliation_case_events)
     or exists (select 1 from public.manual_financial_adjustments) then
    v_problems := v_problems || 'a reconciliation case/event or manual adjustment exists; ';
  end if;
  if exists (select 1 from public.tax_invoices where proforma_id is not null or file_asset_id is null or uploaded_by is null
             or status <> 'ISSUED' or snapshot is not null) then
    v_problems := v_problems || 'a Feature 013 invoice (or one without a file/uploader, or VOID) exists; ';
  end if;
  if exists (select 1 from public.order_shipments where shipment_kind <> 'DELIVERY_REQUEST') then
    v_problems := v_problems || 'a FULFILLMENT shipment exists; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_finance_fulfillment_records rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

-- Triggers on existing tables.
drop trigger trg_order_shipments_fulfillment_guard on public.order_shipments;
drop trigger trg_tax_invoices_protect on public.tax_invoices;

-- New tables (their own triggers and indexes go with them).
drop table public.reconciliation_case_events;
drop table public.reconciliation_cases;
drop table public.manual_financial_adjustments;

-- order_shipments.
drop index public.uq_order_shipment_fulfillment_group;
alter table public.order_shipments
  drop constraint order_shipments_fulfillment_fields_check,
  drop constraint order_shipments_shipment_kind_check,
  drop column proforma_fulfillment_group_id,
  drop column fulfillment_warehouse_id,
  drop column fulfillment_seller_organization_id,
  drop column shipment_kind;

-- tax_invoices.
drop index public.idx_tax_invoices_proforma;
alter table public.tax_invoices
  drop constraint tax_invoices_snapshot_no_bank_check,
  drop constraint tax_invoices_feature_013_shape_check,
  drop constraint tax_invoices_legacy_shape_check,
  drop constraint tax_invoices_proforma_fkey,
  drop constraint tax_invoices_status_check,
  drop column snapshot,
  drop column issued_at_ts,
  drop column issued_by,
  drop column proforma_id,
  drop column status,
  alter column invoice_number drop default,
  alter column uploaded_by set not null,
  alter column file_asset_id set not null;

-- Functions and sequences.
drop function public.guard_fulfillment_shipment_fields();
drop function public.protect_tax_invoice();
drop function public.validate_manual_financial_adjustment();
drop function public.record_reconciliation_case_event();
drop function public.guard_reconciliation_case();
drop function public.next_reconciliation_case_code();
drop function public.next_tax_invoice_code();
drop sequence public.reconciliation_case_code_seq;
drop sequence public.tax_invoice_code_seq;

commit;
