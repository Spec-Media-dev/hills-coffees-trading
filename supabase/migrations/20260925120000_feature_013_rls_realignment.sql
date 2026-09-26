-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M3 (T057) — RLS realignment: SECURITY-FIRST seller data-leak fix (C2) + DB-OPEN-C15.
-- Rollback:  supabase/rollback/20260925120000_feature_013_rls_realignment.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_rls_realignment_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 DEDICATED security review (T060), then OPERATOR apply (T061).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (contracts/rls-storage.md §1/§2/§4; plan.md M3; tasks.md T057 incl. T029 R1 and DB-OPEN-C15; the M2b F1, M2c F1
-- and M2d F3 conditions; the T056 PRE-M3 baseline):
--   1. Helpers (SECURITY DEFINER, search_path pinned): is_order_buyer_member(order) = B; is_order_line_seller(seller org)
--      = S; order_seller_org_ids(order) (internal: service_role only). can_view_order() is NOT changed.
--   2. Policy replacements (§1). Every dropped policy's text is checked against the T006 §7 baseline by the guard and
--      recreated verbatim by the rollback:
--        order_items          order_items_view (can_view_order)          → order_items_read: B ∨ S(own lines) ∨ F ∨ PA
--        order_financials     financials_view + financials_finance_read   → order_financials_read: B ∨ F ∨ A ∨ PA
--        proforma_invoices    proforma_view                               → proforma_invoices_read: B ∨ F ∨ PA
--        proforma_invoice_items proforma_items_view                       → proforma_items_read: B ∨ S(own lines) ∨ F ∨ PA
--        payments             payments_view + payments_finance_read       → payments_read: B ∨ F ∨ PA (auditors: v_audit_payments)
--        payment_proofs       payment_proofs_view + _finance_read         → payment_proofs_read: B ∨ F
--        payment_reviews      payment_reviews_finance (ALL)               → payment_reviews_finance_read: F (SELECT)
--        tax_invoices         tax_invoice_view + tax_invoice_finance (ALL) → tax_invoices_read: B ∨ F ∨ PA (SELECT)
--        payouts              payouts_finance (ALL)                        → payouts_finance_read: F (SELECT); payouts_view kept
--        order_shipments      shipments_view                               → shipments_read: DELIVERY_REQUEST unchanged
--                             (can_view_order ∨ W); FULFILLMENT: B ∨ S(fulfillment seller) ∨ W ∨ F
--        shipment_items       shipment_items_view                          → shipment_items_read: follows its shipment
--   3. New policies + SELECT grants for the M2b/M2c tables: proforma_line_economics S(own) ∨ F ∨ PA;
--      proforma_fulfillment_groups B ∨ S(own group) ∨ F ∨ W ∨ PA; proforma_seller_settlements S(own org) ∨ F ∨ PA;
--      proforma_bank_instructions B ∨ F; reconciliation_cases / _events F ∨ PA; manual_financial_adjustments F ∨ PA ∨ A.
--   4. T029 R1: sellers keep `orders` row visibility (can_view_order, unchanged — seller status/sales pages), but NO
--      client role may read orders.delivery_destination_id / destination_snapshot: authenticated's table-level SELECT on
--      orders becomes a column-level SELECT of every other column. (Not row-level RLS: a column boundary.)
--   5. §2 redacted views: v_seller_order_lines is a plain security_invoker view over tables whose M3 policies restrict
--      rows (own lines/economics/shipments/payouts only; no buyer totals, bank data or proofs). v_audit_payments,
--      v_audit_proformas, v_buyer_reconciliation and v_finance_review_queue are security_invoker views over one SECURITY
--      DEFINER row function each: their audiences hold NO row access to the base tables (auditors are removed from
--      payments/proofs, buyers never read reconciliation notes, finance cannot read `orders`), so the function
--      re-checks the audience (+ MFA) and projects only the §2 columns. Views: SELECT to authenticated only.
--   6. Restrictive MFA gates (`mfa_gate_<table>`, AS RESTRICTIVE FOR SELECT TO authenticated USING mfa_satisfied()) on
--      the 24 §1 tables holding buyer, seller or finance data (incl. M2d F3: offer_price_tiers, promotions,
--      promotion_targets). No other table is gated.
--   7. DB-OPEN-C15: revoke EXECUTE on mfa_satisfied() and kyb_storage_object_authorized(text, boolean) from public, anon.
--      Bodies, SECURITY DEFINER and search_path unchanged (guard + postflight pin the md5s); authenticated and
--      service_role keep EXECUTE.
--
-- WHAT IT DOES NOT DO: no change to can_view_order(), orders policies, config tables (Feature 010), disputes, order
-- history, reservations' PA-only policy, delivery_destinations/commerce_settings/pricing read policies, or any function
-- body; no data change; no UI. bank_transfer_checkout_enabled stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------------
do $guard$
declare
  v_problems text := '';
  v_expected jsonb := $json${
    "order_items_view":            ["order_items", "PERMISSIVE", "{public}", "SELECT", "can_view_order(order_id)", null],
    "financials_view":             ["order_financials", "PERMISSIVE", "{public}", "SELECT", "can_view_order(order_id)", null],
    "financials_finance_read":     ["order_financials", "PERMISSIVE", "{authenticated}", "SELECT", "(is_finance_operator() OR is_auditor())", null],
    "proforma_view":               ["proforma_invoices", "PERMISSIVE", "{public}", "SELECT", "can_view_order(order_id)", null],
    "proforma_items_view":         ["proforma_invoice_items", "PERMISSIVE", "{public}", "SELECT", "(EXISTS ( SELECT 1\n   FROM proforma_invoices pi\n  WHERE ((pi.id = proforma_invoice_items.proforma_id) AND can_view_order(pi.order_id))))", null],
    "payments_view":               ["payments", "PERMISSIVE", "{public}", "SELECT", "(is_platform_admin() OR can_view_order(order_id))", null],
    "payments_finance_read":       ["payments", "PERMISSIVE", "{authenticated}", "SELECT", "(is_finance_operator() OR is_auditor())", null],
    "payment_proofs_view":         ["payment_proofs", "PERMISSIVE", "{public}", "SELECT", "(is_platform_admin() OR (EXISTS ( SELECT 1\n   FROM payments p\n  WHERE ((p.id = payment_proofs.payment_id) AND can_view_order(p.order_id)))))", null],
    "payment_proofs_finance_read": ["payment_proofs", "PERMISSIVE", "{authenticated}", "SELECT", "(is_finance_operator() OR is_auditor())", null],
    "payment_reviews_finance":     ["payment_reviews", "PERMISSIVE", "{authenticated}", "ALL", "is_finance_operator()", "is_finance_operator()"],
    "tax_invoice_view":            ["tax_invoices", "PERMISSIVE", "{public}", "SELECT", "can_view_order(order_id)", null],
    "tax_invoice_finance":         ["tax_invoices", "PERMISSIVE", "{authenticated}", "ALL", "is_finance_operator()", "is_finance_operator()"],
    "payouts_finance":             ["payouts", "PERMISSIVE", "{authenticated}", "ALL", "is_finance_operator()", "is_finance_operator()"],
    "shipments_view":              ["order_shipments", "PERMISSIVE", "{authenticated}", "SELECT", "(can_view_order(order_id) OR is_warehouse_operator())", null],
    "shipment_items_view":         ["shipment_items", "PERMISSIVE", "{authenticated}", "SELECT", "(is_warehouse_operator() OR (EXISTS ( SELECT 1\n   FROM order_items oi\n  WHERE ((oi.id = shipment_items.order_item_id) AND can_view_order(oi.order_id)))))", null]
  }$json$;
  v_policy record;
  v_row jsonb;
  c_order_columns constant text[] := array['id', 'order_code', 'buyer_organization_id', 'status', 'currency', 'shipping_ready_at', 'hold_started_at',
    'hold_expires_at', 'confirmed_at', 'paid_at', 'completed_at', 'created_by', 'created_at', 'updated_at', 'idempotency_key', 'correlation_id',
    'commerce_flow', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'has_manual_adjustment', 'current_proforma_id',
    'delivery_destination_id', 'destination_snapshot'];
begin
  -- 0.1 M1–M2e applied and unchanged; can_view_order() is the T006 body (M3 keeps it).
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.prevent_snapshot_mutation()')), '')
     <> '286e02091213c1be4236b144dff1f383' then
    v_problems := v_problems || 'prevent_snapshot_mutation() differs from the M2b body; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.can_view_order(uuid)')), '')
     <> 'eef50520051e17d1f16985517158b825' then
    v_problems := v_problems || 'can_view_order(uuid) differs from the T006 body; ';
  end if;
  if to_regclass('public.notification_events') is null or to_regclass('public.promotions') is null
     or to_regclass('public.reconciliation_cases') is null or to_regclass('public.proforma_line_economics') is null then
    v_problems := v_problems || 'M2a–M2e are not all applied; ';
  end if;

  -- 0.2 Nothing this migration creates may exist yet.
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('is_order_buyer_member', 'is_order_line_seller',
               'order_seller_org_ids', 'audit_payment_rows', 'audit_proforma_rows', 'buyer_reconciliation_rows', 'finance_review_queue_rows'))
     or exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('v_audit_payments', 'v_audit_proformas',
               'v_buyer_reconciliation', 'v_finance_review_queue', 'v_seller_order_lines'))
     or exists (select 1 from pg_policies where schemaname = 'public' and (policyname like 'mfa_gate_%' and tablename not in ('profiles', 'organizations',
               'organization_members', 'kyb_applications', 'file_assets', 'kyb_documents', 'kyb_reviews', 'account_status_history', 'agreement_acceptances', 'kyb_review_items')
               or policyname in ('order_items_read', 'order_financials_read', 'proforma_invoices_read', 'proforma_items_read', 'proforma_line_economics_read',
               'proforma_fulfillment_groups_read', 'proforma_seller_settlements_read', 'proforma_bank_instructions_read', 'payments_read', 'payment_proofs_read',
               'payment_reviews_finance_read', 'reconciliation_cases_read', 'reconciliation_case_events_read', 'manual_financial_adjustments_read',
               'tax_invoices_read', 'payouts_finance_read', 'shipments_read', 'shipment_items_read'))) then
    v_problems := v_problems || 'an M3 object already exists; ';
  end if;

  -- 0.3 Every policy M3 replaces still has its exact T006 §7 text (the rollback recreates exactly this).
  for v_policy in select key, value from jsonb_each(v_expected) loop
    select jsonb_build_array(tablename, permissive, roles::text, cmd, qual, with_check) into v_row
      from pg_policies where schemaname = 'public' and policyname = v_policy.key;
    if v_row is distinct from v_policy.value then
      v_problems := v_problems || format('policy %s differs from the T006 baseline; ', v_policy.key);
    end if;
  end loop;

  -- 0.4 orders: exactly the known columns; authenticated holds table-level SELECT and no column ACL exists yet.
  if (select array_agg(attname::text order by attname) from pg_attribute where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped)
     <> (select array_agg(c order by c) from unnest(c_order_columns) c) then
    v_problems := v_problems || 'orders has columns M3 does not know (the R1 column grant would omit them); ';
  end if;
  if not has_table_privilege('authenticated', 'public.orders', 'select')
     or exists (select 1 from pg_attribute where attrelid = 'public.orders'::regclass and attacl is not null) then
    v_problems := v_problems || 'orders privileges differ from the T006 baseline; ';
  end if;

  -- 0.5 The M2b/M2c tables still hold no authenticated privilege (service_role SELECT only).
  if exists (select 1 from unnest(array['proforma_line_economics', 'proforma_fulfillment_groups', 'proforma_seller_settlements', 'proforma_bank_instructions',
               'reconciliation_cases', 'reconciliation_case_events', 'manual_financial_adjustments']) t
             where (select relacl::text from pg_class where oid = ('public.' || t)::regclass) <> '{postgres=arwdDxtm/postgres,service_role=r/postgres}') then
    v_problems := v_problems || 'an M2b/M2c table ACL differs from its applied state; ';
  end if;

  -- 0.6 C15: the two helpers still have the T006/T056 bodies, definer flag, search_path and ACL.
  if (select string_agg(p.proname || ':' || md5(replace(p.prosrc, chr(13), '')) || ':' || p.prosecdef || ':' || coalesce(p.proconfig::text, '') || ':' || coalesce(p.proacl::text, ''), '|' order by p.proname)
        from pg_proc p where p.oid in (to_regprocedure('public.mfa_satisfied()'), to_regprocedure('public.kyb_storage_object_authorized(text,boolean)')))
     is distinct from
     'kyb_storage_object_authorized:8d4ac2b14f278ba705f6bed72059b60c:true:{"search_path=pg_catalog, public, auth"}:{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     || '|mfa_satisfied:a78cfc6c462a0af5cec582234b118134:true:{"search_path=pg_catalog, public, auth"}:{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    v_problems := v_problems || 'mfa_satisfied()/kyb_storage_object_authorized() body, flags or ACL differ from the T056 pin; ';
  end if;

  -- 0.7 Checkout still disabled; the migration role bypasses RLS.
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_rls_realignment preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Helpers --------------------------------------------------------------------------------------------------------
-- B: an active, unblocked member of the order's buyer organization.
create or replace function public.is_order_buyer_member(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select auth.uid() is not null
     and not public.is_blocked_user()
     and exists (
       select 1
       from public.orders o
       join public.organization_members om on om.organization_id = o.buyer_organization_id
       where o.id = p_order_id and om.user_id = auth.uid() and om.is_active
     );
$function$;
revoke all on function public.is_order_buyer_member(uuid) from public, anon;
grant execute on function public.is_order_buyer_member(uuid) to authenticated, service_role;

-- S: an active, unblocked member of the seller organization that owns the row's line / group / settlement / payout.
create or replace function public.is_order_line_seller(p_seller_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select auth.uid() is not null
     and p_seller_organization_id is not null
     and not public.is_blocked_user()
     and public.is_org_member(p_seller_organization_id);
$function$;
revoke all on function public.is_order_line_seller(uuid) from public, anon;
grant execute on function public.is_order_line_seller(uuid) to authenticated, service_role;

-- The seller organizations of an order's lines. Internal (M4+ server functions); never client-callable.
create or replace function public.order_seller_org_ids(p_order_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select distinct oi.seller_organization_id from public.order_items oi where oi.order_id = p_order_id and oi.seller_organization_id is not null;
$function$;
revoke all on function public.order_seller_org_ids(uuid) from public, anon, authenticated;
grant execute on function public.order_seller_org_ids(uuid) to service_role;

-- 2. Policy replacements (§1) ---------------------------------------------------------------------------------------
drop policy order_items_view on public.order_items;
create policy order_items_read on public.order_items
  for select to authenticated
  using (public.is_order_buyer_member(order_id) or public.is_order_line_seller(seller_organization_id)
         or public.is_finance_operator() or public.is_platform_admin());

drop policy financials_view on public.order_financials;
drop policy financials_finance_read on public.order_financials;
create policy order_financials_read on public.order_financials
  for select to authenticated
  using (public.is_order_buyer_member(order_id) or public.is_finance_operator() or public.is_auditor() or public.is_platform_admin());

drop policy proforma_view on public.proforma_invoices;
create policy proforma_invoices_read on public.proforma_invoices
  for select to authenticated
  using (public.is_order_buyer_member(order_id) or public.is_finance_operator() or public.is_platform_admin());

drop policy proforma_items_view on public.proforma_invoice_items;
create policy proforma_items_read on public.proforma_invoice_items
  for select to authenticated
  using (exists (select 1 from public.proforma_invoices pi where pi.id = proforma_invoice_items.proforma_id and public.is_order_buyer_member(pi.order_id))
         or public.is_order_line_seller(seller_organization_id) or public.is_finance_operator() or public.is_platform_admin());

drop policy payments_view on public.payments;
drop policy payments_finance_read on public.payments;
create policy payments_read on public.payments
  for select to authenticated
  using (public.is_order_buyer_member(order_id) or public.is_finance_operator() or public.is_platform_admin());

drop policy payment_proofs_view on public.payment_proofs;
drop policy payment_proofs_finance_read on public.payment_proofs;
create policy payment_proofs_read on public.payment_proofs
  for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_proofs.payment_id and public.is_order_buyer_member(p.order_id))
         or public.is_finance_operator());

drop policy payment_reviews_finance on public.payment_reviews;
create policy payment_reviews_finance_read on public.payment_reviews
  for select to authenticated
  using (public.is_finance_operator());

drop policy tax_invoice_view on public.tax_invoices;
drop policy tax_invoice_finance on public.tax_invoices;
create policy tax_invoices_read on public.tax_invoices
  for select to authenticated
  using (public.is_order_buyer_member(order_id) or public.is_finance_operator() or public.is_platform_admin());

drop policy payouts_finance on public.payouts;
create policy payouts_finance_read on public.payouts
  for select to authenticated
  using (public.is_finance_operator());

drop policy shipments_view on public.order_shipments;
create policy shipments_read on public.order_shipments
  for select to authenticated
  using ((shipment_kind = 'DELIVERY_REQUEST' and (public.can_view_order(order_id) or public.is_warehouse_operator()))
         or (shipment_kind = 'FULFILLMENT' and (public.is_order_buyer_member(order_id) or public.is_order_line_seller(fulfillment_seller_organization_id)
                                              or public.is_warehouse_operator() or public.is_finance_operator())));

drop policy shipment_items_view on public.shipment_items;
create policy shipment_items_read on public.shipment_items
  for select to authenticated
  using (exists (select 1 from public.order_shipments s where s.id = shipment_items.shipment_id));

-- 3. The M2b/M2c tables: policies + SELECT for authenticated (no write grant) ---------------------------------------
create policy proforma_line_economics_read on public.proforma_line_economics
  for select to authenticated
  using (public.is_order_line_seller(seller_organization_id) or public.is_finance_operator() or public.is_platform_admin());
create policy proforma_fulfillment_groups_read on public.proforma_fulfillment_groups
  for select to authenticated
  using (exists (select 1 from public.proforma_invoices pi where pi.id = proforma_fulfillment_groups.proforma_id and public.is_order_buyer_member(pi.order_id))
         or public.is_order_line_seller(seller_organization_id) or public.is_finance_operator() or public.is_warehouse_operator() or public.is_platform_admin());
create policy proforma_seller_settlements_read on public.proforma_seller_settlements
  for select to authenticated
  using (public.is_order_line_seller(seller_organization_id) or public.is_finance_operator() or public.is_platform_admin());
create policy proforma_bank_instructions_read on public.proforma_bank_instructions
  for select to authenticated
  using (exists (select 1 from public.proforma_invoices pi where pi.id = proforma_bank_instructions.proforma_id and public.is_order_buyer_member(pi.order_id))
         or public.is_finance_operator());
create policy reconciliation_cases_read on public.reconciliation_cases
  for select to authenticated
  using (public.is_finance_operator() or public.is_platform_admin());
create policy reconciliation_case_events_read on public.reconciliation_case_events
  for select to authenticated
  using (public.is_finance_operator() or public.is_platform_admin());
create policy manual_financial_adjustments_read on public.manual_financial_adjustments
  for select to authenticated
  using (public.is_finance_operator() or public.is_platform_admin() or public.is_auditor());
grant select on table public.proforma_line_economics to authenticated;
grant select on table public.proforma_fulfillment_groups to authenticated;
grant select on table public.proforma_seller_settlements to authenticated;
grant select on table public.proforma_bank_instructions to authenticated;
grant select on table public.reconciliation_cases to authenticated;
grant select on table public.reconciliation_case_events to authenticated;
grant select on table public.manual_financial_adjustments to authenticated;

-- 4. T029 R1: no client role reads the buyer destination columns of `orders` ------------------------------------------
revoke select on table public.orders from authenticated;
grant select (id, order_code, buyer_organization_id, status, currency, shipping_ready_at, hold_started_at, hold_expires_at, confirmed_at, paid_at,
              completed_at, created_by, created_at, updated_at, idempotency_key, correlation_id, commerce_flow, cancelled_at, cancelled_by,
              cancel_reason, has_manual_adjustment, current_proforma_id)
  on table public.orders to authenticated;

-- 5. §2 redacted views ----------------------------------------------------------------------------------------------
-- 5.1 Row functions for audiences that hold no base-table row access (audience + MFA re-checked inside).
create or replace function public.audit_payment_rows()
returns table (payment_id uuid, order_code text, status text, expected_amount numeric, observed_amount numeric, currency char(3),
               confirmed_at timestamptz, confirmed_by uuid, rejected_at timestamptz, rejected_by uuid, bank_reference_masked text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select p.id, o.order_code, p.status, coalesce(p.expected_amount, p.amount), p.observed_amount, p.currency,
         p.confirmed_at, p.confirmed_by, p.rejected_at, p.rejected_by,
         case when p.observed_bank_reference is null then null else '****' || right(p.observed_bank_reference, 4) end
  from public.payments p
  join public.orders o on o.id = p.order_id
  where public.is_auditor() and public.mfa_satisfied();
$function$;
revoke all on function public.audit_payment_rows() from public, anon;
grant execute on function public.audit_payment_rows() to authenticated;

create or replace function public.audit_proforma_rows()
returns table (proforma_code text, version int, status text, currency char(3), merchandise_gross numeric, discount_total numeric,
               merchandise_net numeric, shipping_total numeric, vat_total numeric, buyer_total numeric, bank_account_masked jsonb,
               issued_at timestamptz, confirmed_at timestamptz, expired_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select pi.proforma_code, pi.version, pi.status, pi.currency, pi.merchandise_gross, pi.discount_total, pi.merchandise_net, pi.shipping_total,
         pi.vat_total, pi.buyer_total, pi.bank_account_masked, pi.issued_at, pi.confirmed_at, pi.expired_at
  from public.proforma_invoices pi
  where public.is_auditor() and public.mfa_satisfied();
$function$;
revoke all on function public.audit_proforma_rows() from public, anon;
grant execute on function public.audit_proforma_rows() to authenticated;

create or replace function public.buyer_reconciliation_rows()
returns table (case_code text, order_code text, kind text, status text, resolution_type text, opened_at timestamptz, resolved_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select c.case_code, o.order_code, c.kind, c.status, c.resolution_type, c.opened_at, c.resolved_at
  from public.reconciliation_cases c
  join public.orders o on o.id = c.order_id
  where public.is_order_buyer_member(c.order_id) and public.mfa_satisfied();
$function$;
revoke all on function public.buyer_reconciliation_rows() from public, anon;
grant execute on function public.buyer_reconciliation_rows() to authenticated;

create or replace function public.finance_review_queue_rows()
returns table (order_code text, buyer_display_name text, buyer_total numeric, currency char(3), proof_submitted_at timestamptz,
               reservation_expires_at timestamptz, reservation_status text, days_in_review int, has_open_reconciliation boolean)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select o.order_code,
         coalesce(org.display_name, org.legal_name),
         coalesce(pi.buyer_total, pay.expected_amount, pay.amount),
         o.currency,
         proof.submitted_at,
         r.expires_at,
         r.status,
         case when proof.submitted_at is null then null else (current_date - proof.submitted_at::date) end,
         exists (select 1 from public.reconciliation_cases c where c.order_id = o.id and c.status in ('OPEN', 'IN_REVIEW'))
  from public.orders o
  join public.organizations org on org.id = o.buyer_organization_id
  left join public.proforma_invoices pi on pi.id = o.current_proforma_id
  left join lateral (select p.* from public.payments p where p.order_id = o.id order by p.created_at desc limit 1) pay on true
  left join lateral (select max(pp.submitted_at) as submitted_at from public.payment_proofs pp where pp.payment_id = pay.id) proof on true
  left join lateral (select ir.expires_at, ir.status from public.inventory_reservations ir where ir.order_id = o.id and ir.status in ('ACTIVE', 'REVIEW_HOLD')
                     order by ir.created_at desc limit 1) r on true
  where o.commerce_flow = 'BANK_TRANSFER_V1'
    and o.status in ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW')
    and public.is_finance_operator() and public.mfa_satisfied();
$function$;
revoke all on function public.finance_review_queue_rows() from public, anon;
grant execute on function public.finance_review_queue_rows() to authenticated;

-- 5.2 The views (security_invoker; SELECT only; no buyer totals for sellers, no bank data, no proof paths).
create view public.v_audit_payments with (security_invoker = true) as
  select * from public.audit_payment_rows();
create view public.v_audit_proformas with (security_invoker = true) as
  select * from public.audit_proforma_rows();
create view public.v_buyer_reconciliation with (security_invoker = true) as
  select * from public.buyer_reconciliation_rows();
create view public.v_finance_review_queue with (security_invoker = true) as
  select * from public.finance_review_queue_rows();
create view public.v_seller_order_lines with (security_invoker = true) as
  select o.order_code,
         o.status as order_status,
         oi.id as order_item_id,
         oi.seller_organization_id,
         oi.product_name_snapshot,
         oi.lot_code_snapshot,
         oi.quantity_kg,
         oi.currency,
         e.gross_amount as own_gross_amount,
         e.seller_funded_discount as own_seller_funded_discount,
         e.commission_amount as own_commission_amount,
         e.seller_net_amount as own_seller_net_amount,
         s.status as own_group_shipment_status,
         po.status as own_payout_status
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.proforma_invoice_items pl on pl.order_item_id = oi.id and pl.proforma_id = o.current_proforma_id
  left join public.proforma_line_economics e on e.proforma_item_id = pl.id
  left join public.order_shipments s on s.proforma_fulfillment_group_id = pl.fulfillment_group_id and s.shipment_kind = 'FULFILLMENT'
  left join public.payouts po on po.order_id = oi.order_id and po.seller_organization_id = oi.seller_organization_id
  where public.is_order_line_seller(oi.seller_organization_id);
revoke all on table public.v_audit_payments, public.v_audit_proformas, public.v_buyer_reconciliation, public.v_finance_review_queue,
  public.v_seller_order_lines from public, anon, authenticated, service_role;
grant select on table public.v_audit_payments to authenticated;
grant select on table public.v_audit_proformas to authenticated;
grant select on table public.v_buyer_reconciliation to authenticated;
grant select on table public.v_finance_review_queue to authenticated;
grant select on table public.v_seller_order_lines to authenticated;

-- 6. Restrictive MFA gates on the §1 buyer/seller/finance tables ------------------------------------------------------
create policy mfa_gate_orders on public.orders as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_order_items on public.order_items as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_order_financials on public.order_financials as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_invoices on public.proforma_invoices as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_invoice_items on public.proforma_invoice_items as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_line_economics on public.proforma_line_economics as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_fulfillment_groups on public.proforma_fulfillment_groups as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_seller_settlements on public.proforma_seller_settlements as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_proforma_bank_instructions on public.proforma_bank_instructions as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_payments on public.payments as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_payment_proofs on public.payment_proofs as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_payment_reviews on public.payment_reviews as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_reconciliation_cases on public.reconciliation_cases as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_reconciliation_case_events on public.reconciliation_case_events as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_manual_financial_adjustments on public.manual_financial_adjustments as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_tax_invoices on public.tax_invoices as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_payouts on public.payouts as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_inventory_reservations on public.inventory_reservations as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_order_shipments on public.order_shipments as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_shipment_items on public.shipment_items as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_delivery_destinations on public.delivery_destinations as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_offer_price_tiers on public.offer_price_tiers as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_promotions on public.promotions as restrictive for select to authenticated using (public.mfa_satisfied());
create policy mfa_gate_promotion_targets on public.promotion_targets as restrictive for select to authenticated using (public.mfa_satisfied());

-- 7. DB-OPEN-C15: anon / PUBLIC lose EXECUTE; authenticated and service_role keep it; bodies unchanged ---------------------
revoke execute on function public.mfa_satisfied() from public, anon;
revoke execute on function public.kyb_storage_object_authorized(text, boolean) from public, anon;

commit;
