-- Feature 013 T005 — READ-ONLY commerce preflight (research.md R-21, tasks.md T005/T006/T007/T008/T009).
--
-- Run by an OPERATOR in the Supabase SQL editor of project `hillscoffees-trading` (ref mxejnutukgxyccnohglo).
-- The whole script runs inside a READ ONLY transaction and ends in ROLLBACK: it cannot change anything.
-- It prints counts, statuses, masked values and catalog fingerprints only. No bank identifier is printed in full.
-- Paste every result grid into specs/013-bank-transfer-commerce-core/PREFLIGHT-REPORT.md (§Operator evidence).

begin;
set transaction read only;

-- 0. Identity and migration head (T001) -------------------------------------------------------------------
select current_database() as database, now() as captured_at;
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 10;

-- 1. Legacy orders by status and buyer organization (T009) -----------------------------------------------------
select o.status, org.display_name as buyer_org, count(*) as orders
from public.orders o
join public.organizations org on org.id = o.buyer_organization_id
group by o.status, org.display_name
order by org.display_name, o.status;

-- Organizations with more than one DRAFT order.
select org.display_name as buyer_org, count(*) as draft_orders
from public.orders o
join public.organizations org on org.id = o.buyer_organization_id
where o.status = 'DRAFT'
group by org.display_name
having count(*) > 1;

-- DRAFT orders carrying a legacy buyer shipment plan (non-CANCELLED shipment) vs plan-free DRAFTs (H1 drain split).
select
  count(*) filter (where exists (select 1 from public.order_shipments s where s.order_id = o.id and s.status <> 'CANCELLED')) as drafts_with_shipment_plan,
  count(*) filter (where not exists (select 1 from public.order_shipments s where s.order_id = o.id and s.status <> 'CANCELLED')) as drafts_plan_free
from public.orders o
where o.status = 'DRAFT';

-- 2. Reservations, payments, proofs, payouts, proformas, invoices ---------------------------------------------
select status, count(*) as reservations,
       count(*) filter (where status = 'ACTIVE' and expires_at <= now()) as active_past_expiry
from public.inventory_reservations group by status order by status;

select status, payment_method, coalesce(provider, '∅') as provider, count(*) as payments,
       count(*) filter (where trusted_funding_confirmed_at is not null or trusted_funding_event_id is not null) as trusted_funding_set
from public.payments group by status, payment_method, provider order by status;

select 'payment_proofs' as table_name, count(*) from public.payment_proofs
union all select 'payment_reviews', count(*) from public.payment_reviews
union all select 'payment_events', count(*) from public.payment_events
union all select 'payment_transfers', count(*) from public.payment_transfers
union all select 'tax_invoices', count(*) from public.tax_invoices
union all select 'notifications', count(*) from public.notifications;

select status, count(*) as payouts from public.payouts group by status order by status;
select status, count(*) as proformas from public.proforma_invoices group by status order by status;
select count(*) as orders_with_more_than_one_proforma
from (select order_id from public.proforma_invoices group by order_id having count(*) > 1) x;

-- 3. Commercial configuration (FR-042 fail-closed inputs) -------------------------------------------------------
select country_code, tax_name, rate_percentage, taxable_base, is_active, effective_from, effective_until
from public.tax_rules order by effective_from desc;

select country_code, delivery_method, flat_fee, currency, is_active, effective_from, effective_until
from public.shipping_rules order by effective_from desc;

select distinct delivery_method from public.shipping_rules
union
select distinct delivery_method from public.order_shipments;

select cp.name, cp.status, cp.effective_from, cp.effective_until,
       ct.min_quantity_kg, ct.max_quantity_kg, ct.percentage
from public.commission_policies cp
left join public.commission_tiers ct on ct.policy_id = cp.id
order by cp.effective_from desc, ct.min_quantity_kg;

-- 4. Hills receiving bank accounts — MASKED (Batch A bank-account inventory; T105/T106 input) ------------------
select account_name,
       bank_name,
       currency,
       is_active,
       case when account_number is null then null else '…' || right(account_number, 4) end as account_number_masked,
       case when iban is null then null else '…' || right(iban, 4) end as iban_masked,
       swift_code is not null as has_swift,
       created_at
from public.payment_accounts
order by created_at;

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'payment_accounts'
order by ordinal_position;

-- 5. Function fingerprints for every object Feature 013 migrations will touch (rollback capture) --------------
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       p.proconfig as config,
       md5(replace(p.prosrc, chr(13), '')) as body_md5,
       p.proacl::text as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'validate_order_transition', 'assert_order_checkout_ready', 'checkout_order', 'expire_order_hold',
    'submit_payment_proof', 'admin_review_payment', 'validate_order_item_offer', 'validate_offer_transition',
    'update_order_item_quantity', 'remove_order_item', 'validate_shipment_transition', 'validate_shipment_item',
    'apply_delivery_reservation', 'reserve_ready_deliveries_for_settlement', 'sync_shipment_ready',
    'can_view_order', 'write_audit_log', 'write_audit_log_payment_accounts', 'record_order_status_history',
    'is_platform_admin', 'is_finance_operator', 'is_warehouse_operator', 'is_auditor', 'is_authorized_member',
    'organization_can_buy', 'organization_can_sell', 'is_org_member', 'is_blocked_user', 'mfa_satisfied',
    'kyb_storage_object_authorized', 'next_order_code', 'next_proforma_code',
    'ingest_stripe_event', 'record_stripe_payment_intent', 'record_payment_transfer')
order by p.proname, args;

-- 6. C1 — Feature 009 settlement hook inside the LIVE admin_review_payment (T008) -------------------------------
select p.proname,
       p.prosrc like '%reserve_ready_deliveries_for_settlement%' as has_009_settlement_hook,
       p.prosrc like '%trusted_funding_required%' as has_008_trusted_funding_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_review_payment';

-- Full live body of admin_review_payment for the rollback capture (copy the text verbatim into the report appendix).
select pg_get_functiondef(p.oid) as admin_review_payment_definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'admin_review_payment';

-- 7. Policy definitions on every table Feature 013 M3 will realign (rollback capture) --------------------------
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orders', 'order_items', 'order_financials', 'proforma_invoices', 'proforma_invoice_items', 'payments',
    'payment_proofs', 'payment_reviews', 'payouts', 'tax_invoices', 'order_shipments', 'shipment_items',
    'inventory_reservations', 'notifications', 'notification_deliveries', 'notification_preferences',
    'payment_accounts', 'payment_events', 'payment_transfers')
order by tablename, policyname;

-- 8. Triggers on commerce tables ---------------------------------------------------------------------------------
select c.relname as table_name, t.tgname, p.proname as function_name, t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('orders', 'order_items', 'order_shipments', 'shipment_items', 'payments', 'payouts',
                    'proforma_invoices', 'coffee_offers', 'inventory_positions', 'payment_accounts')
order by c.relname, t.tgname;

-- 9. Constraints and indexes Feature 013 will widen or replace ----------------------------------------------------
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and conname in ('orders_status_check', 'inventory_reservations_status_check', 'proforma_invoices_status_check',
                  'proforma_invoices_order_id_key', 'payments_status_check', 'payouts_status_check',
                  'payment_reviews_decision_check', 'notification_deliveries_channel_check',
                  'notification_deliveries_status_check', 'notification_preferences_channel_check')
order by conname;

select indexname, indexdef from pg_indexes
where schemaname = 'public'
  and indexname in ('uq_active_inventory_reservation_order', 'uq_payment_proof_file', 'payments_order_id_key');

-- 10. Storage buckets, extensions, table grants to anon ---------------------------------------------------------
select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;
select extname, extversion from pg_extension where extname in ('pg_cron', 'pgcrypto', 'pg_net') order by extname;
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
  and table_name in ('orders', 'payments', 'payment_proofs', 'payment_accounts', 'payouts', 'proforma_invoices')
order by table_name, privilege_type;

rollback;
