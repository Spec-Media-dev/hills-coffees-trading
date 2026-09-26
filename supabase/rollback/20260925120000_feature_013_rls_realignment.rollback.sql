-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260925120000_feature_013_rls_realignment.sql (Feature 013 M3).
-- Removes exactly what M3 added and restores the T006 §7 policy baseline verbatim:
--   - drops the 5 §2 views, their 4 row functions, the 18 replacement/new read policies, the 24 mfa_gate_* policies on
--     the commerce tables and the 3 helpers;
--   - recreates the 15 replaced policies with their exact T006 text (roles, command, USING, WITH CHECK);
--   - restores authenticated's table-level SELECT on orders (drops the R1 column grant) and removes the SELECT grants M3
--     gave authenticated on the 7 M2b/M2c tables (service_role SELECT stays, as applied by M2b/M2c);
--   - restores the §5 C15 ACL: EXECUTE for anon on mfa_satisfied() and kyb_storage_object_authorized(text, boolean)
--     (PUBLIC held none before M3). Bodies were never changed.
-- WARNING: the rollback re-opens the C2 seller data leak and the C15 anon EXECUTE. Run only on an M3 failure.
-- The guard refuses (changing nothing) while a later Feature 013 migration is applied or anything else depends on an M3
-- object. After running it: `supabase migration repair --status reverted 20260925120000` (OPERATOR); the M3 postflight is
-- then expected to FAIL and the M2e postflight to pass again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regclass('public.v_seller_order_lines') is null or to_regprocedure('public.is_order_buyer_member(uuid)') is null
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_read') then
    v_problems := v_problems || 'M3 is not applied; ';
  end if;
  -- later Feature 013 migrations (M4a+) must be rolled back first (names that exist only from M4a on: contracts/database-rpc.md;
  -- never a legacy name such as submit_payment_proof, which production already has)
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('get_or_create_cart', 'add_cart_line', 'estimate_cart',
               'upsert_delivery_destination', 'retire_delivery_destination', 'admin_convert_legacy_draft', 'compute_order_quote', 'finance_confirm_payment',
               'finance_reject_payment', 'open_reconciliation_case')) then
    v_problems := v_problems || 'a later Feature 013 migration (M4a+) is still applied; ';
  end if;
  -- nothing outside M3 may depend on an M3 helper, row function or view
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
               and p.proname not in ('is_order_buyer_member', 'is_order_line_seller', 'order_seller_org_ids', 'audit_payment_rows', 'audit_proforma_rows',
                                     'buyer_reconciliation_rows', 'finance_review_queue_rows')
               and p.prosrc ~ '(is_order_buyer_member|is_order_line_seller|order_seller_org_ids|audit_payment_rows|audit_proforma_rows|buyer_reconciliation_rows|finance_review_queue_rows|v_seller_order_lines|v_audit_payments|v_audit_proformas|v_buyer_reconciliation|v_finance_review_queue)') then
    v_problems := v_problems || 'another function references an M3 object; ';
  end if;
  if exists (select 1 from pg_policies where (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_order_buyer_member|is_order_line_seller)'
               and policyname not in ('order_items_read', 'proforma_invoices_read', 'proforma_items_read', 'order_financials_read', 'payments_read',
                                      'payment_proofs_read', 'tax_invoices_read', 'shipments_read', 'proforma_line_economics_read',
                                      'proforma_fulfillment_groups_read', 'proforma_seller_settlements_read', 'proforma_bank_instructions_read')) then
    v_problems := v_problems || 'another policy references an M3 helper; ';
  end if;
  if exists (select 1 from pg_views where schemaname = 'public'
               and viewname not in ('v_audit_payments', 'v_audit_proformas', 'v_buyer_reconciliation', 'v_finance_review_queue', 'v_seller_order_lines')
               and definition ~ '(is_order_buyer_member|is_order_line_seller|v_seller_order_lines|v_audit_payments|v_audit_proformas|v_buyer_reconciliation|v_finance_review_queue|_rows\()') then
    v_problems := v_problems || 'another view references an M3 object; ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_rls_realignment rollback refused — nothing changed: %', v_problems;
  end if;
end
$guard$;

-- 1. Views and their row functions
drop view public.v_seller_order_lines;
drop view public.v_finance_review_queue;
drop view public.v_buyer_reconciliation;
drop view public.v_audit_proformas;
drop view public.v_audit_payments;
drop function public.finance_review_queue_rows();
drop function public.buyer_reconciliation_rows();
drop function public.audit_proforma_rows();
drop function public.audit_payment_rows();

-- 2. MFA gates added by M3
drop policy mfa_gate_orders on public.orders;
drop policy mfa_gate_order_items on public.order_items;
drop policy mfa_gate_order_financials on public.order_financials;
drop policy mfa_gate_proforma_invoices on public.proforma_invoices;
drop policy mfa_gate_proforma_invoice_items on public.proforma_invoice_items;
drop policy mfa_gate_proforma_line_economics on public.proforma_line_economics;
drop policy mfa_gate_proforma_fulfillment_groups on public.proforma_fulfillment_groups;
drop policy mfa_gate_proforma_seller_settlements on public.proforma_seller_settlements;
drop policy mfa_gate_proforma_bank_instructions on public.proforma_bank_instructions;
drop policy mfa_gate_payments on public.payments;
drop policy mfa_gate_payment_proofs on public.payment_proofs;
drop policy mfa_gate_payment_reviews on public.payment_reviews;
drop policy mfa_gate_reconciliation_cases on public.reconciliation_cases;
drop policy mfa_gate_reconciliation_case_events on public.reconciliation_case_events;
drop policy mfa_gate_manual_financial_adjustments on public.manual_financial_adjustments;
drop policy mfa_gate_tax_invoices on public.tax_invoices;
drop policy mfa_gate_payouts on public.payouts;
drop policy mfa_gate_inventory_reservations on public.inventory_reservations;
drop policy mfa_gate_order_shipments on public.order_shipments;
drop policy mfa_gate_shipment_items on public.shipment_items;
drop policy mfa_gate_delivery_destinations on public.delivery_destinations;
drop policy mfa_gate_offer_price_tiers on public.offer_price_tiers;
drop policy mfa_gate_promotions on public.promotions;
drop policy mfa_gate_promotion_targets on public.promotion_targets;

-- 3. New policies on the M2b/M2c tables, and their SELECT grants
drop policy proforma_line_economics_read on public.proforma_line_economics;
drop policy proforma_fulfillment_groups_read on public.proforma_fulfillment_groups;
drop policy proforma_seller_settlements_read on public.proforma_seller_settlements;
drop policy proforma_bank_instructions_read on public.proforma_bank_instructions;
drop policy reconciliation_cases_read on public.reconciliation_cases;
drop policy reconciliation_case_events_read on public.reconciliation_case_events;
drop policy manual_financial_adjustments_read on public.manual_financial_adjustments;
revoke select on table public.proforma_line_economics from authenticated;
revoke select on table public.proforma_fulfillment_groups from authenticated;
revoke select on table public.proforma_seller_settlements from authenticated;
revoke select on table public.proforma_bank_instructions from authenticated;
revoke select on table public.reconciliation_cases from authenticated;
revoke select on table public.reconciliation_case_events from authenticated;
revoke select on table public.manual_financial_adjustments from authenticated;

-- 4. Replacement policies → the exact T006 §7 policies
drop policy order_items_read on public.order_items;
create policy order_items_view on public.order_items for select using (can_view_order(order_id));

drop policy order_financials_read on public.order_financials;
create policy financials_view on public.order_financials for select using (can_view_order(order_id));
create policy financials_finance_read on public.order_financials for select to authenticated using ((is_finance_operator() OR is_auditor()));

drop policy proforma_invoices_read on public.proforma_invoices;
create policy proforma_view on public.proforma_invoices for select using (can_view_order(order_id));

drop policy proforma_items_read on public.proforma_invoice_items;
create policy proforma_items_view on public.proforma_invoice_items for select
  using ((EXISTS ( SELECT 1 FROM proforma_invoices pi WHERE ((pi.id = proforma_invoice_items.proforma_id) AND can_view_order(pi.order_id)))));

drop policy payments_read on public.payments;
create policy payments_view on public.payments for select using ((is_platform_admin() OR can_view_order(order_id)));
create policy payments_finance_read on public.payments for select to authenticated using ((is_finance_operator() OR is_auditor()));

drop policy payment_proofs_read on public.payment_proofs;
create policy payment_proofs_view on public.payment_proofs for select
  using ((is_platform_admin() OR (EXISTS ( SELECT 1 FROM payments p WHERE ((p.id = payment_proofs.payment_id) AND can_view_order(p.order_id))))));
create policy payment_proofs_finance_read on public.payment_proofs for select to authenticated using ((is_finance_operator() OR is_auditor()));

drop policy payment_reviews_finance_read on public.payment_reviews;
create policy payment_reviews_finance on public.payment_reviews for all to authenticated using (is_finance_operator()) with check (is_finance_operator());

drop policy tax_invoices_read on public.tax_invoices;
create policy tax_invoice_view on public.tax_invoices for select using (can_view_order(order_id));
create policy tax_invoice_finance on public.tax_invoices for all to authenticated using (is_finance_operator()) with check (is_finance_operator());

drop policy payouts_finance_read on public.payouts;
create policy payouts_finance on public.payouts for all to authenticated using (is_finance_operator()) with check (is_finance_operator());

drop policy shipments_read on public.order_shipments;
create policy shipments_view on public.order_shipments for select to authenticated using ((can_view_order(order_id) OR is_warehouse_operator()));

drop policy shipment_items_read on public.shipment_items;
create policy shipment_items_view on public.shipment_items for select to authenticated
  using ((is_warehouse_operator() OR (EXISTS ( SELECT 1 FROM order_items oi WHERE ((oi.id = shipment_items.order_item_id) AND can_view_order(oi.order_id))))));

-- 5. orders: back to authenticated's table-level SELECT (the pre-M3 grant)
revoke select (id, order_code, buyer_organization_id, status, currency, shipping_ready_at, hold_started_at, hold_expires_at, confirmed_at, paid_at,
               completed_at, created_by, created_at, updated_at, idempotency_key, correlation_id, commerce_flow, cancelled_at, cancelled_by,
               cancel_reason, has_manual_adjustment, current_proforma_id)
  on table public.orders from authenticated;
grant select on table public.orders to authenticated;

-- 6. Helpers
drop function public.order_seller_org_ids(uuid);
drop function public.is_order_line_seller(uuid);
drop function public.is_order_buyer_member(uuid);

-- 7. DB-OPEN-C15: restore the §5 ACL exactly, entry order included ({postgres, anon, authenticated, service_role}; PUBLIC
--    held none). A bare `grant … to anon` would append anon last, which the M3 guard (exact ACL pin) would then refuse; the
--    re-grant happens inside this one transaction, so authenticated/service_role never observe a gap.
revoke execute on function public.mfa_satisfied() from authenticated, service_role;
grant execute on function public.mfa_satisfied() to anon, authenticated, service_role;
revoke execute on function public.kyb_storage_object_authorized(text, boolean) from authenticated, service_role;
grant execute on function public.kyb_storage_object_authorized(text, boolean) to anon, authenticated, service_role;

commit;
