-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M2b (T032) — proforma versioning and frozen economics. Bank Transfer Commerce Core, Batch B.
-- Rollback:  supabase/rollback/20260925106000_feature_013_proforma_versioning_snapshots.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260925_feature_013_proforma_versioning_snapshots_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human review (T035), then OPERATOR apply (T036).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (specs/013-bank-transfer-commerce-core/data-model.md §3.1–§3.7, research R-3/R-4/R-5/R-6):
--   1. proforma_invoices: versioning (proforma_invoices_order_id_key → UNIQUE(order_id, version) + one open proforma per
--      order), the widened status set, header totals, tax/party/destination/masked-bank snapshots, lifecycle columns.
--   2. orders.current_proforma_id (the open proforma; deferred here from M2a, T029 D3).
--   3. proforma_fulfillment_groups, proforma_line_economics, proforma_seller_settlements, proforma_bank_instructions (new).
--   4. proforma_invoice_items: the buyer-facing Feature 013 line fields.
--   5. order_financials: proforma pointer, discount split and Hills share; frozen once the order leaves PROFORMA_ISSUED.
--   6. Integrity: protect_proforma_snapshot, prevent_snapshot_mutation, the deferred check_seller_settlement_totals and
--      check_proforma_snapshot_totals, freeze_order_financials, the order proforma-pointer guard, and two REDACTED audit
--      functions (no destination, party or full bank value ever reaches audit_logs — AUD-006, T029 R2).
--   7. checkout_order(uuid): ONE statement changed (owner decision 2026-09-25, T032). The legacy proforma upsert used
--      `on conflict (order_id)`, whose arbiter was proforma_invoices_order_id_key; it becomes an UPDATE, then an INSERT
--      when no row exists, under the order FOR UPDATE lock the function already takes. Everything else is byte-identical
--      to the T006 body (md5 75e07c357ea33a980fd695a271d8e708), which the rollback restores.
--
-- LEGACY vs FEATURE 013 ROWS (owner decision 2026-09-25):
--   * A proforma is a Feature 013 row iff its snapshot marker is set: validity_hours_snapshot, tax_rule_id,
--     tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked and issued_by are
--     all present (all-or-none CHECK). Legacy rows have none of them, and every other M2b column holds its placeholder.
--   * The NOT NULL DEFAULT 0 header money columns are a LEGACY COMPATIBILITY PLACEHOLDER only (the legacy checkout inserts
--     (order_id, valid_until)). A Feature 013 header is never valid because its values are zero: at commit, the deferred
--     check_proforma_snapshot_totals() requires every header total to equal the sum of its frozen lines and groups, and the
--     snapshot to be complete (lines, economics, groups, seller settlements, bank instructions, order_financials).
--     Legacy-facing readers must present a legacy header total as not applicable, never as a zero-value order.
--   * Items: seller_type_snapshot marks a Feature 013 line (all-or-none). order_financials: proforma_id marks it.
--   * Legacy rows keep their behaviour: legacy writers (checkout_order, admin_review_payment) and the fixture cleanup's
--     deletes still work on them; only the M2b columns are frozen at their placeholders.
--
-- WHAT IT DOES NOT DO: no RPC (issue_proforma is M4b), no RLS policy on the new tables (M3 adds the rls-storage §1
-- policies; until then only the table owner and service_role (read) see them), no change to any existing policy, no
-- foreign key into a Feature 010 configuration table (the commission/tax/shipping/bank ids are plain snapshots), no data
-- backfill, no row rewritten. bank_transfer_checkout_enabled stays false.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unmappable state ----------------------------------
do $guard$
declare
  v_problems text := '';
  v_count bigint;
  v_list text;
  v_def text;
  v_oid oid;
begin
  -- 0.1 M1 and M2a applied and unchanged.
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.validate_order_transition()')), '')
     <> '603d04c58bbcf987c38e2aa6f7d73d9b' then
    v_problems := v_problems || 'validate_order_transition() differs from the M1 v2 body; ';
  end if;
  if to_regclass('public.commerce_settings') is null or to_regclass('public.delivery_destinations') is null
     or to_regprocedure('public.guard_order_destination_fields()') is null then
    v_problems := v_problems || 'M1/M2a (20260925100000, 20260925103000) are not both applied; ';
  end if;

  -- 0.2 The legacy writers of proforma_invoices this migration relies on (T006 §5 fingerprints). checkout_order is
  --     replaced below (one statement); admin_review_payment's `set status = 'PAID'` must stay a legacy-only write.
  select p.oid into v_oid from pg_proc p where p.oid = to_regprocedure('public.checkout_order(uuid)');
  if coalesce((select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = v_oid), '') <> '75e07c357ea33a980fd695a271d8e708' then
    v_problems := v_problems || 'checkout_order(uuid) differs from the T006 fingerprint; ';
  elsif not (select prosecdef from pg_proc where oid = v_oid)
     or has_function_privilege('anon', v_oid, 'EXECUTE')
     or not has_function_privilege('authenticated', v_oid, 'EXECUTE')
     or not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    v_problems := v_problems || 'checkout_order(uuid) is not SECURITY DEFINER with the T006 EXECUTE list; ';
  end if;
  if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
               where p.oid = to_regprocedure('public.admin_review_payment(uuid,boolean,text)')), '')
     <> 'c0ef5f06b8ee47788825480cf56cfc03' then
    v_problems := v_problems || 'admin_review_payment(uuid,boolean,text) differs from the T006 fingerprint; ';
  end if;

  -- 0.3 The definitions this migration replaces (T006 §9, exact pg_get_constraintdef text).
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.proforma_invoices') and c.conname = 'proforma_invoices_order_id_key';
  if v_def is distinct from 'UNIQUE (order_id)' then
    v_problems := v_problems || 'proforma_invoices_order_id_key differs from T006; ';
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
  where c.conrelid = to_regclass('public.proforma_invoices') and c.conname = 'proforma_invoices_status_check';
  if v_def is distinct from $d$CHECK ((status = ANY (ARRAY['ISSUED'::text, 'PAID'::text, 'VOID'::text])))$d$ then
    v_problems := v_problems || 'proforma_invoices_status_check differs from T006; ';
  end if;

  -- 0.4 Unmappable legacy/proforma state (tasks.md T032; PREFLIGHT-REPORT T009 / §2 follow-up).
  select count(*) into v_count from (select order_id from public.proforma_invoices group by order_id having count(*) > 1) d;
  if v_count <> 0 then
    v_problems := v_problems || v_count || ' order(s) hold more than one proforma; ';
  end if;
  -- A non-terminal LEGACY order holding an ISSUED proforma must be drained first (expire_order_hold / T147), unless it is
  -- one of the orders the T009 drain list already names.
  select string_agg(o.order_code, ', ' order by o.order_code) into v_list
  from public.orders o join public.proforma_invoices pi on pi.order_id = o.id
  where o.commerce_flow = 'LEGACY' and pi.status = 'ISSUED'
    and o.status not in ('COMPLETED', 'EXPIRED', 'VOID', 'CANCELLED', 'PAYMENT_REJECTED')
    and o.order_code not in ('ORD-20260924-0006142', 'ORD-20260924-0006143');
  if v_list is not null then
    v_problems := v_problems || 'non-terminal LEGACY order(s) hold an ISSUED proforma and are not in the T009 drain list (drain them first): ' || v_list || '; ';
  end if;
  -- No Feature 013 order can have left DRAFT yet (there is no V1 workflow before M4b), so no row needs a snapshot.
  if exists (select 1 from public.orders where commerce_flow = 'BANK_TRANSFER_V1' and status <> 'DRAFT') then
    v_problems := v_problems || 'a BANK_TRANSFER_V1 order has left DRAFT; ';
  end if;
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true; ';
  end if;

  -- 0.5 Trigger baseline of the three extended tables (T006 §8; and no generic audit path exists that M2b's snapshot
  --     columns could reach — T029 R2).
  select string_agg(t.tgname, ', ' order by t.tgname) into v_list from pg_trigger t
  where t.tgrelid = to_regclass('public.proforma_invoices') and not t.tgisinternal;
  if v_list is distinct from 'trg_proforma_invoices_updated_at' then
    v_problems := v_problems || 'proforma_invoices triggers differ from T006 (' || coalesce(v_list, 'none') || '); ';
  end if;
  if exists (select 1 from pg_trigger t where t.tgrelid in (to_regclass('public.proforma_invoice_items'), to_regclass('public.order_financials'))
             and not t.tgisinternal) then
    v_problems := v_problems || 'proforma_invoice_items/order_financials unexpectedly carry a user trigger; ';
  end if;

  -- 0.6 Nothing this migration creates may exist yet.
  if to_regclass('public.proforma_fulfillment_groups') is not null or to_regclass('public.proforma_line_economics') is not null
     or to_regclass('public.proforma_seller_settlements') is not null or to_regclass('public.proforma_bank_instructions') is not null
     or to_regclass('public.uq_open_proforma_per_order') is not null
     or to_regprocedure('public.protect_proforma_snapshot()') is not null or to_regprocedure('public.prevent_snapshot_mutation()') is not null
     or to_regprocedure('public.check_seller_settlement_totals()') is not null or to_regprocedure('public.check_proforma_snapshot_totals()') is not null
     or to_regprocedure('public.freeze_order_financials()') is not null or to_regprocedure('public.guard_order_proforma_pointer()') is not null
     or to_regprocedure('public.write_audit_log_proforma_invoices()') is not null
     or to_regprocedure('public.write_audit_log_proforma_bank_instructions()') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public' and (
          (table_name = 'proforma_invoices' and column_name in ('version', 'supersedes_proforma_id', 'buyer_total', 'validity_hours_snapshot'))
       or (table_name = 'proforma_invoice_items' and column_name in ('offer_id', 'seller_type_snapshot', 'gross_amount'))
       or (table_name = 'order_financials' and column_name in ('proforma_id', 'hills_share_amount'))
       or (table_name = 'orders' and column_name = 'current_proforma_id'))) then
    v_problems := v_problems || 'an M2b object already exists; ';
  end if;

  -- 0.7 Required helpers and referenced tables; audit_logs has the columns the redacted audit functions write.
  if to_regprocedure('public.is_internal_transition()') is null or to_regprocedure('public.set_updated_at()') is null
     or to_regclass('public.coffee_offers') is null or to_regclass('public.warehouses') is null
     or to_regclass('public.organizations') is null or to_regclass('public.profiles') is null then
    v_problems := v_problems || 'a required helper function or table is missing; ';
  end if;
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'audit_logs'
    and column_name in ('actor_user_id', 'entity_type', 'entity_id', 'action', 'old_data', 'new_data', 'metadata', 'correlation_id');
  if v_count <> 8 then
    v_problems := v_problems || 'audit_logs: expected 8 audit columns, found ' || v_count || '; ';
  end if;

  -- 0.8 As in M1/M2a: FORCE ROW LEVEL SECURITY and the SECURITY DEFINER checks need an owner that bypasses RLS.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_proforma_versioning_snapshots preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. proforma_invoices (data-model §3.1, research R-3) ----------------------------------------------------------------
alter table public.proforma_invoices
  drop constraint proforma_invoices_order_id_key,
  drop constraint proforma_invoices_status_check,
  add constraint proforma_invoices_status_check
    check (status in ('ISSUED', 'CONFIRMED', 'PAID', 'EXPIRED', 'SUPERSEDED', 'CANCELLED', 'VOID')),
  add column version int not null default 1,
  add column supersedes_proforma_id uuid references public.proforma_invoices(id),
  add column validity_hours_snapshot int,
  add column currency char(3) not null default 'USD',
  add column merchandise_gross numeric(14,2) not null default 0,
  add column discount_total numeric(14,2) not null default 0,
  add column merchandise_net numeric(14,2) not null default 0,
  add column shipping_total numeric(14,2) not null default 0,
  add column vat_total numeric(14,2) not null default 0,
  add column buyer_total numeric(14,2) not null default 0,
  add column tax_rule_id uuid,
  add column tax_rate_snapshot numeric(7,4),
  add column tax_base_snapshot text,
  add column promotion_code_snapshot text,
  add column buyer_snapshot jsonb,
  add column destination_snapshot jsonb,
  add column bank_account_masked jsonb,
  add column confirmed_at timestamptz,
  add column confirmed_by uuid references public.profiles(id),
  add column expired_at timestamptz,
  add column cancelled_at timestamptz,
  add column voided_at timestamptz,
  add column issued_by uuid references public.profiles(id),
  add constraint proforma_invoices_order_version_key unique (order_id, version),
  -- Composite targets for the same-order foreign keys of orders.current_proforma_id and order_financials.proforma_id.
  add constraint proforma_invoices_id_order_key unique (id, order_id),
  add constraint proforma_invoices_version_check check (version >= 1),
  add constraint proforma_invoices_supersedes_check check (
    (version = 1) = (supersedes_proforma_id is null) and supersedes_proforma_id is distinct from id),
  add constraint proforma_invoices_currency_check check (currency = 'USD'),
  add constraint proforma_invoices_amounts_nonnegative_check check (
    merchandise_gross >= 0 and discount_total >= 0 and merchandise_net >= 0 and shipping_total >= 0 and vat_total >= 0 and buyer_total >= 0),
  add constraint proforma_invoices_merchandise_net_check check (merchandise_net = merchandise_gross - discount_total),
  add constraint proforma_invoices_buyer_total_check check (buyer_total = merchandise_net + shipping_total + vat_total),
  -- Feature 013 snapshot marker: all present or all absent.
  add constraint proforma_invoices_snapshot_marker_check check (
    num_nulls(validity_hours_snapshot, tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot,
              destination_snapshot, bank_account_masked, issued_by) in (0, 8)),
  -- Legacy rows: every M2b value is its placeholder (so a legacy row can never look like frozen economics).
  add constraint proforma_invoices_legacy_placeholder_check check (
    validity_hours_snapshot is not null
    or (status in ('ISSUED', 'PAID', 'VOID') and version = 1 and supersedes_proforma_id is null
        and merchandise_gross = 0 and discount_total = 0 and merchandise_net = 0 and shipping_total = 0 and vat_total = 0 and buyer_total = 0
        and promotion_code_snapshot is null and confirmed_at is null and confirmed_by is null
        and expired_at is null and cancelled_at is null and voided_at is null)),
  -- Feature 013 rows: the confirmation deadline is issued_at + the validity read once at issuance (clarification, R-3).
  add constraint proforma_invoices_validity_check check (
    validity_hours_snapshot is null
    or (validity_hours_snapshot between 1 and 720 and valid_until = issued_at + make_interval(hours => validity_hours_snapshot))),
  add constraint proforma_invoices_tax_snapshot_check check (
    (tax_rate_snapshot is null or tax_rate_snapshot between 0 and 100)
    and (tax_base_snapshot is null or tax_base_snapshot in ('MERCHANDISE_ONLY', 'MERCHANDISE_AND_SHIPPING'))),
  add constraint proforma_invoices_promotion_code_check check (
    promotion_code_snapshot is null or promotion_code_snapshot ~ '^[A-Z0-9-]{1,40}$'),
  add constraint proforma_invoices_buyer_snapshot_shape_check check (
    buyer_snapshot is null
    or (jsonb_typeof(buyer_snapshot) = 'object' and buyer_snapshot ?& array['legal_name', 'display_name', 'tax_number', 'country_code'])),
  add constraint proforma_invoices_destination_snapshot_shape_check check (
    destination_snapshot is null
    or (jsonb_typeof(destination_snapshot) = 'object'
        and destination_snapshot ?& array['label', 'country_code', 'city', 'address_lines', 'contact_name', 'contact_phone', 'delivery_method']
        and jsonb_typeof(destination_snapshot -> 'address_lines') = 'array')),
  -- Masked bank account: names, SWIFT and the last four characters only (`****` + ≤ 4), never a full number.
  add constraint proforma_invoices_bank_account_masked_check check (
    bank_account_masked is null
    or (jsonb_typeof(bank_account_masked) = 'object'
        and bank_account_masked ?& array['bank_name', 'account_name', 'swift_code', 'account_number_last4', 'iban_last4']
        and (bank_account_masked - array['bank_name', 'account_name', 'swift_code', 'account_number_last4', 'iban_last4']) = '{}'::jsonb
        and coalesce(bank_account_masked ->> 'account_number_last4', '****') ~ '^\*{4}[A-Za-z0-9]{0,4}$'
        and coalesce(bank_account_masked ->> 'iban_last4', '****') ~ '^\*{4}[A-Za-z0-9]{0,4}$')),
  -- Lifecycle of Feature 013 rows (data-model §7.2): each terminal timestamp is set exactly in its status; confirmation
  -- is paired and survives the later states. (LEGACY rows keep every lifecycle column NULL: placeholder check above.)
  add constraint proforma_invoices_lifecycle_check check (
    (confirmed_at is null) = (confirmed_by is null)
    and (validity_hours_snapshot is null
         or ((status not in ('CONFIRMED', 'PAID') or confirmed_at is not null)
             and (confirmed_at is null or status not in ('ISSUED', 'SUPERSEDED'))
             and (expired_at is null) = (status <> 'EXPIRED')
             and (cancelled_at is null) = (status <> 'CANCELLED')
             and (voided_at is null) = (status <> 'VOID'))));

-- At most one open proforma per order (R-3); replaces the dropped UNIQUE(order_id).
create unique index uq_open_proforma_per_order on public.proforma_invoices (order_id)
  where status in ('ISSUED', 'CONFIRMED', 'PAID');
create index idx_proforma_invoices_supersedes on public.proforma_invoices (supersedes_proforma_id)
  where supersedes_proforma_id is not null;

comment on column public.proforma_invoices.buyer_total is
  'Feature 013 frozen buyer total (= merchandise_net + shipping_total + vat_total, and = the sum of the frozen lines and groups, checked at commit). On LEGACY rows (validity_hours_snapshot IS NULL) every header total is a 0 placeholder meaning NOT APPLICABLE — legacy economics live in order_financials; never present it as a zero-value order.';
comment on column public.proforma_invoices.validity_hours_snapshot is
  'Feature 013 snapshot marker (with tax_rule_id, tax_rate_snapshot, tax_base_snapshot, buyer_snapshot, destination_snapshot, bank_account_masked, issued_by: all present or all absent). NULL = a LEGACY proforma.';
comment on column public.proforma_invoices.bank_account_masked is
  'Feature 013: {bank_name, account_name, swift_code, account_number_last4, iban_last4}; last four characters only. The full instruction is proforma_bank_instructions (buyer + finance only).';
comment on column public.proforma_invoices.tax_rule_id is
  'Feature 013 snapshot of the applied tax_rules.id. Deliberately not a foreign key: no constraint trigger is added to a Feature 010 configuration table, and the frozen rate/base are in this row.';

-- 2. orders.current_proforma_id (data-model §2.1) ---------------------------------------------------------------------
-- The composite key makes the pointer reference a proforma OF THE SAME ORDER.
alter table public.orders
  add column current_proforma_id uuid,
  add constraint orders_current_proforma_fkey foreign key (current_proforma_id, id)
    references public.proforma_invoices (id, order_id);
comment on column public.orders.current_proforma_id is
  'Feature 013: the order''s open proforma (a proforma of this order). Written only by internal transitions, only on BANK_TRANSFER_V1 orders.';
create index idx_orders_current_proforma on public.orders (current_proforma_id) where current_proforma_id is not null;

-- 3. proforma_fulfillment_groups (data-model §3.4) --------------------------------------------------------------------
create table public.proforma_fulfillment_groups (
  id uuid primary key default gen_random_uuid(),
  proforma_id uuid not null references public.proforma_invoices(id),
  seller_organization_id uuid not null references public.organizations(id),
  warehouse_id uuid not null references public.warehouses(id),
  group_key text not null,
  shipping_rule_id uuid not null,
  delivery_method text not null
    constraint proforma_fulfillment_groups_delivery_method_check check (delivery_method in ('Courier')),
  shipping_amount numeric(14,2) not null,
  shipping_vat_amount numeric(14,2) not null,
  merchandise_net_amount numeric(14,2) not null,
  constraint proforma_fulfillment_groups_group_key_check check (group_key = seller_organization_id::text || ':' || warehouse_id::text),
  constraint proforma_fulfillment_groups_amounts_check check (shipping_amount >= 0 and shipping_vat_amount >= 0 and merchandise_net_amount >= 0),
  constraint proforma_fulfillment_groups_group_key unique (proforma_id, seller_organization_id, warehouse_id),
  -- Composite target so each line's group is the group of the same proforma, seller and warehouse.
  constraint proforma_fulfillment_groups_line_key unique (id, proforma_id, seller_organization_id, warehouse_id)
);
comment on table public.proforma_fulfillment_groups is
  'Feature 013: shipping frozen per seller × warehouse group of a proforma (FIN-005). Immutable. shipping_rule_id is a snapshot, not a foreign key (Feature 010 configuration table).';

-- 4. proforma_invoice_items — Feature 013 buyer-facing line fields (data-model §3.2) ---------------------------------
alter table public.proforma_invoice_items
  add column offer_id uuid references public.coffee_offers(id),
  add column offer_code_snapshot text,
  add column seller_organization_id uuid references public.organizations(id),
  add column seller_type_snapshot text,
  add column warehouse_id uuid references public.warehouses(id),
  add column fulfillment_group_id uuid,
  add column list_unit_price numeric(14,4),
  add column price_tier_id uuid,
  add column gross_amount numeric(14,2),
  add column promotion_id uuid,
  add column promotion_scope_snapshot text,
  add column promotion_funding_source text,
  add column promotion_code_applied boolean,
  add column promotion_rule_snapshot jsonb,
  add column promotion_raw_amount numeric(14,2),
  add column discount_amount numeric(14,2),
  add column discount_capped boolean,
  add column discount_cap_reason text,
  add column net_amount numeric(14,2),
  add column vat_amount numeric(14,2),
  add column line_total numeric(14,2),
  add column product_name_snapshot text,
  add column origin_name_snapshot text,
  add column lot_code_snapshot text,
  add constraint proforma_invoice_items_fulfillment_group_fkey foreign key (fulfillment_group_id, proforma_id, seller_organization_id, warehouse_id)
    references public.proforma_fulfillment_groups (id, proforma_id, seller_organization_id, warehouse_id),
  -- Composite target of proforma_line_economics: an economics row matches its line's proforma, seller, type, gross and net.
  add constraint proforma_invoice_items_economics_key unique (id, proforma_id, seller_organization_id, seller_type_snapshot, gross_amount, net_amount),
  -- Legacy lines carry none of the Feature 013 fields; Feature 013 lines carry every required one.
  add constraint proforma_invoice_items_snapshot_marker_check check (
    (seller_type_snapshot is null
     and num_nonnulls(offer_id, offer_code_snapshot, seller_organization_id, warehouse_id, fulfillment_group_id, list_unit_price,
                      price_tier_id, gross_amount, promotion_id, promotion_scope_snapshot, promotion_funding_source, promotion_code_applied,
                      promotion_rule_snapshot, promotion_raw_amount, discount_amount, discount_capped, discount_cap_reason, net_amount,
                      vat_amount, line_total, product_name_snapshot, origin_name_snapshot, lot_code_snapshot) = 0)
    or (seller_type_snapshot is not null
        and num_nulls(offer_id, offer_code_snapshot, seller_organization_id, warehouse_id, fulfillment_group_id, list_unit_price,
                      gross_amount, discount_amount, discount_capped, net_amount, vat_amount, line_total, product_name_snapshot,
                      lot_code_snapshot, quantity_kg, unit_price) = 0
        and quantity_kg > 0 and unit_price >= 0 and list_unit_price >= 0 and amount = net_amount)),
  add constraint proforma_invoice_items_seller_type_check check (seller_type_snapshot in ('HILLS', 'MEMBER_SELLER')),
  -- R-5 step 1–2: the tier price, else the list price; gross = round(qty × unit price, 2).
  add constraint proforma_invoice_items_unit_price_check check (price_tier_id is not null or unit_price = list_unit_price),
  add constraint proforma_invoice_items_gross_check check (gross_amount >= 0 and gross_amount = round(quantity_kg * unit_price, 2)),
  add constraint proforma_invoice_items_discount_check check (
    discount_amount between 0 and gross_amount and discount_amount <= promotion_raw_amount),
  add constraint proforma_invoice_items_net_check check (net_amount = gross_amount - discount_amount),
  add constraint proforma_invoice_items_line_total_check check (vat_amount >= 0 and line_total = net_amount + vat_amount),
  -- One promotion per line: all promotion fields present or all absent, and a promotion applies iff a discount does.
  add constraint proforma_invoice_items_promotion_fields_check check (
    num_nulls(promotion_id, promotion_scope_snapshot, promotion_funding_source, promotion_code_applied,
              promotion_rule_snapshot, promotion_raw_amount) in (0, 6)),
  add constraint proforma_invoice_items_promotion_discount_check check (
    (promotion_id is null) = (discount_amount = 0) and (promotion_id is null) = (promotion_funding_source is null)),
  add constraint proforma_invoice_items_promotion_values_check check (
    promotion_scope_snapshot in ('PLATFORM', 'SELLER') and promotion_funding_source in ('HILLS', 'SELLER')
    and promotion_raw_amount > 0 and jsonb_typeof(promotion_rule_snapshot) = 'object'),
  -- FIN-011: platform promotions are Hills-funded, seller promotions seller-funded; R-18: never seller funding on a Hills line.
  add constraint proforma_invoice_items_funding_scope_check check ((promotion_funding_source = 'HILLS') = (promotion_scope_snapshot = 'PLATFORM')),
  add constraint proforma_invoice_items_hills_line_funding_check check (seller_type_snapshot <> 'HILLS' or promotion_funding_source is distinct from 'SELLER'),
  -- FIN-012: the cap is recorded (capped iff effective < raw), with its reason.
  add constraint proforma_invoice_items_cap_check check (
    (discount_capped is not true) = (discount_cap_reason is null)
    and discount_cap_reason in ('LINE_GROSS', 'HILLS_COMMISSION')
    and (discount_cap_reason is distinct from 'HILLS_COMMISSION' or (promotion_funding_source = 'HILLS' and seller_type_snapshot = 'MEMBER_SELLER'))
    and (seller_type_snapshot is null or (promotion_id is null and discount_capped = false)
         or (promotion_id is not null and discount_capped = (discount_amount < promotion_raw_amount))));

create unique index uq_proforma_invoice_items_offer on public.proforma_invoice_items (proforma_id, offer_id) where offer_id is not null;
create index idx_proforma_invoice_items_group on public.proforma_invoice_items (fulfillment_group_id) where fulfillment_group_id is not null;
comment on column public.proforma_invoice_items.seller_type_snapshot is
  'Feature 013 line marker: NULL = a LEGACY line (every Feature 013 field NULL); set = a frozen Feature 013 line (every required field set, immutable). price_tier_id/promotion_id are snapshots (their tables arrive in M2d).';
comment on column public.proforma_invoice_items.promotion_code_applied is
  'Feature 013: true when the buyer''s explicit code (proforma_invoices.promotion_code_snapshot) is the promotion applied to this line (R-5 step 5).';

-- 5. proforma_line_economics (data-model §3.3; FIN-006/007/011/012/013) --------------------------------------------
create table public.proforma_line_economics (
  proforma_item_id uuid primary key,
  proforma_id uuid not null references public.proforma_invoices(id),
  seller_organization_id uuid not null references public.organizations(id),
  seller_type_snapshot text not null
    constraint proforma_line_economics_seller_type_check check (seller_type_snapshot in ('HILLS', 'MEMBER_SELLER')),
  commission_policy_id uuid,
  commission_tier_id uuid,
  commission_rate_snapshot numeric(7,4),
  seller_qualifying_quantity_kg numeric(14,3),
  gross_amount numeric(14,2) not null,
  seller_funded_discount numeric(14,2) not null,
  hills_funded_discount numeric(14,2) not null,
  commission_on_gross numeric(14,2) not null,
  commission_basis numeric(14,2) not null,
  commission_amount numeric(14,2) not null,
  seller_net_amount numeric(14,2) not null,
  hills_share_amount numeric(14,2) not null,
  buyer_net_amount numeric(14,2) not null,
  -- The economics of exactly its line: same proforma, seller, seller type, gross and buyer net.
  constraint proforma_line_economics_item_fkey foreign key (proforma_item_id, proforma_id, seller_organization_id, seller_type_snapshot, gross_amount, buyer_net_amount)
    references public.proforma_invoice_items (id, proforma_id, seller_organization_id, seller_type_snapshot, gross_amount, net_amount),
  constraint proforma_line_economics_amounts_nonnegative_check check (
    gross_amount >= 0 and seller_funded_discount >= 0 and hills_funded_discount >= 0 and commission_on_gross >= 0
    and commission_basis >= 0 and commission_amount >= 0 and seller_net_amount >= 0 and hills_share_amount >= 0 and buyer_net_amount >= 0),
  constraint proforma_line_economics_single_funder_check check (seller_funded_discount = 0 or hills_funded_discount = 0),
  constraint proforma_line_economics_buyer_net_check check (buyer_net_amount = gross_amount - seller_funded_discount - hills_funded_discount),
  constraint proforma_line_economics_member_check check (
    seller_type_snapshot <> 'MEMBER_SELLER'
    or (num_nulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0
        and commission_rate_snapshot between 0 and 100 and seller_qualifying_quantity_kg > 0
        and commission_on_gross = round(gross_amount * commission_rate_snapshot / 100, 2)
        and commission_basis = gross_amount - seller_funded_discount
        and commission_amount = round(commission_basis * commission_rate_snapshot / 100, 2)
        and seller_net_amount + commission_amount = commission_basis
        and hills_share_amount = commission_amount - hills_funded_discount
        and hills_funded_discount <= commission_on_gross
        and seller_net_amount + hills_share_amount = buyer_net_amount)),
  constraint proforma_line_economics_hills_check check (
    seller_type_snapshot <> 'HILLS'
    or (num_nonnulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0
        and seller_funded_discount = 0 and commission_on_gross = 0 and commission_basis = 0 and commission_amount = 0
        and seller_net_amount = 0 and hills_share_amount = buyer_net_amount and buyer_net_amount = gross_amount - hills_funded_discount))
);
create index idx_proforma_line_economics_seller on public.proforma_line_economics (proforma_id, seller_organization_id);
comment on table public.proforma_line_economics is
  'Feature 013: per-line seller/Hills economics (seller and finance only; buyers excluded, UX-003). The seller commission assignment is the snapshot commission_policy_id, commission_tier_id, commission_rate_snapshot and seller_qualifying_quantity_kg (Q_s, FIN-013); no seller-specific override exists. Immutable.';

-- 6. proforma_seller_settlements (data-model §3.5) --------------------------------------------------------------------
create table public.proforma_seller_settlements (
  proforma_id uuid not null references public.proforma_invoices(id),
  seller_organization_id uuid not null references public.organizations(id),
  seller_type_snapshot text not null
    constraint proforma_seller_settlements_seller_type_check check (seller_type_snapshot in ('HILLS', 'MEMBER_SELLER')),
  seller_qualifying_quantity_kg numeric(14,3),
  commission_policy_id uuid,
  commission_tier_id uuid,
  commission_rate_snapshot numeric(7,4),
  gross_amount numeric(14,2) not null,
  seller_funded_discount numeric(14,2) not null,
  hills_funded_discount numeric(14,2) not null,
  commission_basis numeric(14,2) not null,
  commission_amount numeric(14,2) not null,
  seller_net_amount numeric(14,2) not null,
  hills_share_amount numeric(14,2) not null,
  buyer_net_amount numeric(14,2) not null,
  primary key (proforma_id, seller_organization_id),
  constraint proforma_seller_settlements_amounts_nonnegative_check check (
    gross_amount >= 0 and seller_funded_discount >= 0 and hills_funded_discount >= 0 and commission_basis >= 0
    and commission_amount >= 0 and seller_net_amount >= 0 and hills_share_amount >= 0 and buyer_net_amount >= 0),
  constraint proforma_seller_settlements_buyer_net_check check (buyer_net_amount = gross_amount - seller_funded_discount - hills_funded_discount),
  constraint proforma_seller_settlements_member_check check (
    seller_type_snapshot <> 'MEMBER_SELLER'
    or (num_nulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0
        and commission_rate_snapshot between 0 and 100 and seller_qualifying_quantity_kg > 0
        and commission_basis = gross_amount - seller_funded_discount
        and seller_net_amount + commission_amount = commission_basis
        and hills_share_amount = commission_amount - hills_funded_discount
        and seller_net_amount + hills_share_amount = buyer_net_amount)),
  constraint proforma_seller_settlements_hills_check check (
    seller_type_snapshot <> 'HILLS'
    or (num_nonnulls(commission_policy_id, commission_tier_id, commission_rate_snapshot, seller_qualifying_quantity_kg) = 0
        and seller_funded_discount = 0 and commission_basis = 0 and commission_amount = 0 and seller_net_amount = 0
        and hills_share_amount = buyer_net_amount))
);
comment on table public.proforma_seller_settlements is
  'Feature 013: per-seller totals = the sums of that seller''s proforma_line_economics (deferred check at commit, FIN-007). The payout amount is seller_net_amount, so a Hills-funded discount never changes it. Immutable.';

-- 7. proforma_bank_instructions (data-model §3.6) — buyer + finance only, never generically audited -----------------
create table public.proforma_bank_instructions (
  proforma_id uuid primary key references public.proforma_invoices(id),
  payment_account_id uuid not null,
  account_name text not null,
  bank_name text not null,
  account_number text,
  iban text,
  swift_code text,
  currency char(3) not null
    constraint proforma_bank_instructions_currency_check check (currency = 'USD'),
  payment_reference text not null
    constraint proforma_bank_instructions_payment_reference_check check (char_length(btrim(payment_reference)) between 1 and 80),
  constraint proforma_bank_instructions_account_identifier_check check (account_number is not null or iban is not null)
);
comment on table public.proforma_bank_instructions is
  'Feature 013: the full receiving-bank snapshot the buyer must use (buyer + finance only). NO generic write_audit_log trigger (AUD-006); the redacted audit records ids and last four characters only. payment_account_id is a snapshot, not a foreign key (Feature 010 configuration table).';

-- 8. order_financials (data-model §3.7) --------------------------------------------------------------------------------
alter table public.order_financials
  add column proforma_id uuid,
  add column discount_amount numeric(14,2) not null default 0,
  add column seller_funded_discount numeric(14,2) not null default 0,
  add column hills_funded_discount numeric(14,2) not null default 0,
  add column hills_share_amount numeric(14,2) not null default 0,
  add constraint order_financials_proforma_fkey foreign key (proforma_id, order_id) references public.proforma_invoices (id, order_id),
  add constraint order_financials_discounts_check check (
    discount_amount >= 0 and seller_funded_discount >= 0 and hills_funded_discount >= 0 and hills_share_amount >= 0
    and discount_amount = seller_funded_discount + hills_funded_discount),
  -- Legacy rows (no proforma pointer): the four new amounts are 0 placeholders (not applicable).
  add constraint order_financials_legacy_placeholder_check check (
    proforma_id is not null
    or (discount_amount = 0 and seller_funded_discount = 0 and hills_funded_discount = 0 and hills_share_amount = 0));
comment on column public.order_financials.proforma_id is
  'Feature 013: the proforma this summary was rewritten from (same order). NULL = a LEGACY summary; its discount/Hills-share columns are 0 placeholders (not applicable).';

-- 9. Integrity and redacted audit functions ---------------------------------------------------------------------------

-- 9.1 proforma_invoices: Feature 013 rows are frozen except their lifecycle, along data-model §7.2 only; legacy rows keep
--     their pre-M2b behaviour but can never acquire Feature 013 values.
create or replace function public.protect_proforma_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_flow text;
  v_order_status text;
  v_prev public.proforma_invoices%rowtype;
  -- The only columns a Feature 013 row may change after insert.
  c_lifecycle constant text[] := array['status', 'confirmed_at', 'confirmed_by', 'expired_at', 'cancelled_at', 'voided_at', 'updated_at'];
  -- The pre-M2b columns, which legacy writers keep changing as before.
  c_legacy constant text[] := array['id', 'order_id', 'proforma_code', 'status', 'issued_at', 'valid_until', 'file_asset_id', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    select o.commerce_flow, o.status into v_flow, v_order_status from public.orders o where o.id = new.order_id;
    if not found then
      return new; -- the order foreign key rejects the row
    end if;
    if v_flow = 'LEGACY' then
      if new.validity_hours_snapshot is not null then
        raise exception 'proforma_snapshot_invalid' using detail = 'a LEGACY order cannot hold a Feature 013 proforma';
      end if;
      return new;
    end if;
    if new.validity_hours_snapshot is null then
      raise exception 'proforma_snapshot_invalid' using detail = 'a BANK_TRANSFER_V1 proforma must carry the full snapshot marker';
    end if;
    if v_order_status not in ('DRAFT', 'PROFORMA_ISSUED') then
      raise exception 'proforma_snapshot_invalid' using detail = 'a proforma is issued only while the order is DRAFT or PROFORMA_ISSUED';
    end if;
    if new.status <> 'ISSUED' then
      raise exception 'proforma_snapshot_invalid' using detail = 'a Feature 013 proforma is inserted ISSUED';
    end if;
    if new.version > 1 then
      select * into v_prev from public.proforma_invoices where id = new.supersedes_proforma_id;
      if not found or v_prev.order_id <> new.order_id or v_prev.version <> new.version - 1
         or v_prev.status in ('ISSUED', 'CONFIRMED', 'PAID') then
        raise exception 'proforma_snapshot_invalid' using detail = 'a replacement supersedes the closed previous version of the same order';
      end if;
    end if;
    return new;
  end if;

  if old.validity_hours_snapshot is null then
    -- LEGACY row.
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (to_jsonb(new) - c_legacy) is distinct from (to_jsonb(old) - c_legacy) then
      raise exception 'proforma_snapshot_immutable' using detail = 'the Feature 013 columns of a LEGACY proforma are fixed placeholders';
    end if;
    return new;
  end if;

  -- Feature 013 row.
  if tg_op = 'DELETE' then
    raise exception 'proforma_snapshot_immutable' using detail = 'a Feature 013 proforma is never deleted';
  end if;
  if (to_jsonb(new) - c_lifecycle) is distinct from (to_jsonb(old) - c_lifecycle) then
    raise exception 'proforma_snapshot_immutable' using detail = 'money, party and snapshot columns are frozen at issuance';
  end if;
  if new.status is distinct from old.status then
    if not public.is_internal_transition() then
      raise exception 'proforma_snapshot_immutable' using detail = 'proforma status changes only through the commerce workflow';
    end if;
    if not ((old.status = 'ISSUED' and new.status in ('CONFIRMED', 'EXPIRED', 'CANCELLED', 'VOID', 'SUPERSEDED'))
            or (old.status = 'CONFIRMED' and new.status in ('PAID', 'EXPIRED', 'CANCELLED', 'VOID'))) then
      raise exception 'proforma_transition_invalid' using detail = old.status || ' -> ' || new.status;
    end if;
  end if;
  -- Lifecycle stamps are written once, by their own transition.
  if (new.confirmed_at, new.confirmed_by) is distinct from (old.confirmed_at, old.confirmed_by)
     and not (old.confirmed_at is null and old.status = 'ISSUED' and new.status = 'CONFIRMED') then
    raise exception 'proforma_snapshot_immutable' using detail = 'confirmed_at/confirmed_by are set once, on ISSUED -> CONFIRMED';
  end if;
  if new.expired_at is distinct from old.expired_at and not (old.expired_at is null and new.status = 'EXPIRED') then
    raise exception 'proforma_snapshot_immutable' using detail = 'expired_at is set once, on -> EXPIRED';
  end if;
  if new.cancelled_at is distinct from old.cancelled_at and not (old.cancelled_at is null and new.status = 'CANCELLED') then
    raise exception 'proforma_snapshot_immutable' using detail = 'cancelled_at is set once, on -> CANCELLED';
  end if;
  if new.voided_at is distinct from old.voided_at and not (old.voided_at is null and new.status = 'VOID') then
    raise exception 'proforma_snapshot_immutable' using detail = 'voided_at is set once, on -> VOID';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_proforma_snapshot() from public, anon;
grant execute on function public.protect_proforma_snapshot() to authenticated, service_role;

-- 9.2 Append-only snapshot rows. proforma_invoice_items: Feature 013 lines are immutable; LEGACY lines keep their
--     behaviour (the fixture cleanup deletes them) but can never acquire Feature 013 values. Every other table: always.
create or replace function public.prevent_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_table_name = 'proforma_invoice_items' and (to_jsonb(old) ->> 'seller_type_snapshot') is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if (to_jsonb(new) ->> 'seller_type_snapshot') is null then
      return new;
    end if;
  end if;
  raise exception 'snapshot_immutable' using detail = tg_table_name || ' rows are append-only (' || tg_op || ' refused)';
end;
$function$;
revoke all on function public.prevent_snapshot_mutation() from public, anon;
grant execute on function public.prevent_snapshot_mutation() to authenticated, service_role;

-- 9.3 FIN-007/FIN-012/FIN-013 at commit: each seller settlement equals the sum of that seller's line economics, carries
--     the same commission assignment as every one of its lines, and Q_s is that seller's own member-line quantity.
create or replace function public.check_seller_settlement_totals()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_proforma_id uuid := new.proforma_id;
  v_seller uuid := new.seller_organization_id;
  s public.proforma_seller_settlements%rowtype;
  v_lines bigint;
  v_problems text := '';
  v_sum record;
begin
  select * into s from public.proforma_seller_settlements where proforma_id = v_proforma_id and seller_organization_id = v_seller;
  select count(*) into v_lines from public.proforma_line_economics where proforma_id = v_proforma_id and seller_organization_id = v_seller;
  if s.proforma_id is null and v_lines = 0 then
    return null;
  end if;
  if s.proforma_id is null then
    raise exception 'seller_settlement_unbalanced' using detail = 'seller ' || v_seller || ' has line economics but no settlement row';
  end if;
  if v_lines = 0 then
    raise exception 'seller_settlement_unbalanced' using detail = 'seller ' || v_seller || ' has a settlement row but no line economics';
  end if;

  select coalesce(sum(e.gross_amount), 0) as gross, coalesce(sum(e.seller_funded_discount), 0) as sf,
         coalesce(sum(e.hills_funded_discount), 0) as hf, coalesce(sum(e.commission_basis), 0) as basis,
         coalesce(sum(e.commission_amount), 0) as commission, coalesce(sum(e.seller_net_amount), 0) as seller_net,
         coalesce(sum(e.hills_share_amount), 0) as hills_share, coalesce(sum(e.buyer_net_amount), 0) as buyer_net,
         count(*) filter (where e.seller_type_snapshot is distinct from s.seller_type_snapshot
                             or e.commission_policy_id is distinct from s.commission_policy_id
                             or e.commission_tier_id is distinct from s.commission_tier_id
                             or e.commission_rate_snapshot is distinct from s.commission_rate_snapshot
                             or e.seller_qualifying_quantity_kg is distinct from s.seller_qualifying_quantity_kg) as mismatched,
         coalesce(sum(i.quantity_kg) filter (where e.seller_type_snapshot = 'MEMBER_SELLER'), 0) as member_quantity
  into v_sum
  from public.proforma_line_economics e
  join public.proforma_invoice_items i on i.id = e.proforma_item_id
  where e.proforma_id = v_proforma_id and e.seller_organization_id = v_seller;

  if (s.gross_amount, s.seller_funded_discount, s.hills_funded_discount, s.commission_basis, s.commission_amount,
      s.seller_net_amount, s.hills_share_amount, s.buyer_net_amount)
     is distinct from (v_sum.gross, v_sum.sf, v_sum.hf, v_sum.basis, v_sum.commission, v_sum.seller_net, v_sum.hills_share, v_sum.buyer_net) then
    v_problems := v_problems || 'settlement amounts differ from the sum of the line economics; ';
  end if;
  if v_sum.mismatched <> 0 then
    v_problems := v_problems || v_sum.mismatched || ' line(s) carry a different seller type or commission assignment than the settlement; ';
  end if;
  if s.seller_type_snapshot = 'MEMBER_SELLER' and s.seller_qualifying_quantity_kg is distinct from v_sum.member_quantity then
    v_problems := v_problems || 'seller_qualifying_quantity_kg is not the seller''s own member-line quantity (FIN-013); ';
  end if;
  if s.seller_net_amount < 0 or s.hills_share_amount < 0 then
    v_problems := v_problems || 'negative seller net or Hills share (FIN-012); ';
  end if;
  if v_problems <> '' then
    raise exception 'seller_settlement_unbalanced' using detail = 'proforma ' || v_proforma_id || ', seller ' || v_seller || ': ' || v_problems;
  end if;
  return null;
end;
$function$;
revoke all on function public.check_seller_settlement_totals() from public, anon;
grant execute on function public.check_seller_settlement_totals() to authenticated, service_role;

-- 9.4 At commit: a Feature 013 proforma is complete and its header totals ARE the sum of its frozen lines and groups
--     (so the NOT NULL DEFAULT 0 placeholders can never pass as frozen economics); LEGACY proformas hold no Feature 013 row.
create or replace function public.check_proforma_snapshot_totals()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_id uuid := coalesce(to_jsonb(new) ->> 'proforma_id', to_jsonb(new) ->> 'id')::uuid;
  h public.proforma_invoices%rowtype;
  o public.orders%rowtype;
  bi public.proforma_bank_instructions%rowtype;
  f public.order_financials%rowtype;
  v_problems text := '';
  v_items record;
  v_groups record;
  v_settle record;
  v_n bigint;
begin
  if v_id is null then
    return null;
  end if;
  select * into h from public.proforma_invoices where id = v_id;
  if not found then
    return null;
  end if;

  if h.validity_hours_snapshot is null then
    if exists (select 1 from public.proforma_invoice_items where proforma_id = v_id and seller_type_snapshot is not null)
       or exists (select 1 from public.proforma_line_economics where proforma_id = v_id)
       or exists (select 1 from public.proforma_fulfillment_groups where proforma_id = v_id)
       or exists (select 1 from public.proforma_seller_settlements where proforma_id = v_id)
       or exists (select 1 from public.proforma_bank_instructions where proforma_id = v_id)
       or exists (select 1 from public.order_financials where proforma_id = v_id) then
      raise exception 'proforma_snapshot_unbalanced' using detail = 'a LEGACY proforma cannot hold Feature 013 snapshot rows';
    end if;
    return null;
  end if;

  select * into o from public.orders where id = h.order_id;

  -- Lines: at least one, all Feature 013, each with its economics; VAT per line after discount (FIN-002/FIN-004).
  select count(*) as n, count(*) filter (where i.seller_type_snapshot is null) as legacy_lines,
         count(*) filter (where i.seller_type_snapshot is not null and e.proforma_item_id is null) as without_economics,
         count(*) filter (where i.vat_amount is distinct from round(i.net_amount * h.tax_rate_snapshot / 100, 2)) as vat_mismatch,
         count(*) filter (where (e.seller_funded_discount > 0 and i.promotion_funding_source is distinct from 'SELLER')
                             or (e.hills_funded_discount > 0 and i.promotion_funding_source is distinct from 'HILLS')) as funding_mismatch,
         coalesce(sum(i.gross_amount), 0) as gross, coalesce(sum(i.discount_amount), 0) as discount,
         coalesce(sum(i.net_amount), 0) as net, coalesce(sum(i.vat_amount), 0) as vat, coalesce(sum(i.quantity_kg), 0) as qty
  into v_items
  from public.proforma_invoice_items i
  left join public.proforma_line_economics e on e.proforma_item_id = i.id
  where i.proforma_id = v_id;
  if v_items.n = 0 then
    v_problems := v_problems || 'no lines; ';
  end if;
  if v_items.legacy_lines <> 0 then
    v_problems := v_problems || v_items.legacy_lines || ' line(s) without the Feature 013 snapshot; ';
  end if;
  if v_items.without_economics <> 0 then
    v_problems := v_problems || v_items.without_economics || ' line(s) without line economics; ';
  end if;
  if v_items.vat_mismatch <> 0 then
    v_problems := v_problems || v_items.vat_mismatch || ' line VAT amount(s) differ from round(net × rate, 2); ';
  end if;
  if v_items.funding_mismatch <> 0 then
    v_problems := v_problems || v_items.funding_mismatch || ' line(s) split a discount against its funding source (FIN-011); ';
  end if;

  -- Groups: at least one; each has lines, its merchandise equals its lines, shipping VAT follows the tax base (FIN-005).
  select count(*) as n,
         count(*) filter (where not exists (select 1 from public.proforma_invoice_items i where i.fulfillment_group_id = g.id)) as empty_groups,
         count(*) filter (where g.merchandise_net_amount is distinct from
                            (select coalesce(sum(i.net_amount), 0) from public.proforma_invoice_items i where i.fulfillment_group_id = g.id)) as net_mismatch,
         count(*) filter (where g.shipping_vat_amount is distinct from
                            case when h.tax_base_snapshot = 'MERCHANDISE_AND_SHIPPING' then round(g.shipping_amount * h.tax_rate_snapshot / 100, 2) else 0 end) as vat_mismatch,
         coalesce(sum(g.shipping_amount), 0) as shipping, coalesce(sum(g.shipping_vat_amount), 0) as shipping_vat
  into v_groups
  from public.proforma_fulfillment_groups g
  where g.proforma_id = v_id;
  if v_groups.n = 0 then
    v_problems := v_problems || 'no fulfillment group; ';
  end if;
  if v_groups.empty_groups <> 0 then
    v_problems := v_problems || v_groups.empty_groups || ' fulfillment group(s) without lines; ';
  end if;
  if v_groups.net_mismatch <> 0 then
    v_problems := v_problems || v_groups.net_mismatch || ' group merchandise amount(s) differ from their lines; ';
  end if;
  if v_groups.vat_mismatch <> 0 then
    v_problems := v_problems || v_groups.vat_mismatch || ' group shipping VAT amount(s) differ from the tax base/rate; ';
  end if;

  -- Header = sums (FIN-009); the NOT NULL DEFAULT 0 placeholders cannot satisfy this for a real order.
  if (h.merchandise_gross, h.discount_total, h.merchandise_net, h.shipping_total, h.vat_total)
     is distinct from (v_items.gross, v_items.discount, v_items.net, v_groups.shipping, v_items.vat + v_groups.shipping_vat) then
    v_problems := v_problems || 'header totals differ from the frozen lines and groups; ';
  end if;

  -- Seller settlements: exactly one per seller of the lines, with the lines' seller type.
  select count(*) filter (where s.proforma_id is null) as missing, count(*) filter (where l.seller_organization_id is null) as orphan,
         count(*) filter (where s.proforma_id is not null and l.seller_organization_id is not null and s.seller_type_snapshot <> l.seller_type_snapshot) as type_mismatch,
         coalesce(sum(s.commission_amount), 0) as commission, coalesce(sum(s.seller_net_amount), 0) as seller_net,
         coalesce(sum(s.hills_share_amount), 0) as hills_share, coalesce(sum(s.seller_funded_discount), 0) as sf,
         coalesce(sum(s.hills_funded_discount), 0) as hf
  into v_settle
  from (select distinct seller_organization_id, seller_type_snapshot from public.proforma_invoice_items
        where proforma_id = v_id and seller_type_snapshot is not null) l
  full join (select * from public.proforma_seller_settlements where proforma_id = v_id) s
    on s.seller_organization_id = l.seller_organization_id;
  select count(*) into v_n from (select seller_organization_id from public.proforma_invoice_items
                                 where proforma_id = v_id and seller_type_snapshot is not null
                                 group by seller_organization_id having count(distinct seller_type_snapshot) > 1) x;
  if v_settle.missing <> 0 or v_settle.orphan <> 0 or v_settle.type_mismatch <> 0 or v_n <> 0 then
    v_problems := v_problems || 'seller settlements do not match the sellers of the lines; ';
  end if;

  -- Bank instructions: present, quoting the order and proforma codes, and consistent with the masked header copy.
  select * into bi from public.proforma_bank_instructions where proforma_id = v_id;
  if bi.proforma_id is null then
    v_problems := v_problems || 'no bank instructions; ';
  else
    if position(o.order_code in bi.payment_reference) = 0 or position(h.proforma_code in bi.payment_reference) = 0 then
      v_problems := v_problems || 'payment_reference does not quote the order code and the proforma code; ';
    end if;
    if (h.bank_account_masked ->> 'bank_name', h.bank_account_masked ->> 'account_name', h.bank_account_masked ->> 'swift_code',
        h.bank_account_masked ->> 'account_number_last4', h.bank_account_masked ->> 'iban_last4')
       is distinct from
       (bi.bank_name, bi.account_name, bi.swift_code,
        case when bi.account_number is null then null when char_length(bi.account_number) < 8 then '****' else '****' || right(bi.account_number, 4) end,
        case when bi.iban is null then null when char_length(bi.iban) < 8 then '****' else '****' || right(bi.iban, 4) end) then
      v_problems := v_problems || 'bank_account_masked does not match the bank instructions; ';
    end if;
  end if;

  -- The open order carries the same destination snapshot.
  if o.current_proforma_id = v_id and h.destination_snapshot is distinct from o.destination_snapshot then
    v_problems := v_problems || 'destination_snapshot differs from the order''s; ';
  end if;

  -- order_financials is the order-level summary of the newest version (base_subtotal = merchandise gross).
  if not exists (select 1 from public.proforma_invoices p where p.order_id = h.order_id and p.version > h.version) then
    select * into f from public.order_financials where order_id = h.order_id;
    if f.order_id is null or f.proforma_id is distinct from v_id then
      v_problems := v_problems || 'order_financials does not summarize this proforma; ';
    elsif (f.base_subtotal, f.discount_amount, f.shipping_amount, f.vat_amount, f.buyer_total_amount, f.total_quantity_kg,
           f.commission_amount, f.seller_net_amount, f.hills_share_amount, f.seller_funded_discount, f.hills_funded_discount,
           f.tax_rule_id, f.tax_percentage_snapshot, f.tax_base_snapshot)
          is distinct from
          (h.merchandise_gross, h.discount_total, h.shipping_total, h.vat_total, h.buyer_total, v_items.qty,
           v_settle.commission, v_settle.seller_net, v_settle.hills_share, v_settle.sf, v_settle.hf,
           h.tax_rule_id, h.tax_rate_snapshot, h.tax_base_snapshot) then
      v_problems := v_problems || 'order_financials differs from the frozen proforma; ';
    end if;
  end if;

  if v_problems <> '' then
    raise exception 'proforma_snapshot_unbalanced' using detail = 'proforma ' || v_id || ': ' || v_problems;
  end if;
  return null;
end;
$function$;
revoke all on function public.check_proforma_snapshot_totals() from public, anon;
grant execute on function public.check_proforma_snapshot_totals() to authenticated, service_role;

-- 9.5 order_financials: LEGACY rows unchanged; BANK_TRANSFER_V1 rows are written only by the workflow while the order is
--     DRAFT/PROFORMA_ISSUED, always point to the proforma they summarize, and are never deleted.
create or replace function public.freeze_order_financials()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_order_id uuid;
  v_flow text;
  v_status text;
begin
  if tg_op = 'INSERT' then
    v_order_id := new.order_id;
  else
    v_order_id := old.order_id;
  end if;
  select o.commerce_flow, o.status into v_flow, v_status from public.orders o where o.id = v_order_id;
  if not found then
    -- The parent order is being deleted in this statement (cascade), or the order foreign key rejects the row.
    if tg_op = 'DELETE' and old.proforma_id is not null then
      raise exception 'order_financials_frozen' using detail = 'a Feature 013 financial summary is never deleted';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_flow = 'LEGACY' then
    if tg_op <> 'DELETE' and new.proforma_id is not null then
      raise exception 'order_financials_frozen' using detail = 'a LEGACY order''s financials cannot reference a Feature 013 proforma';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'order_financials_frozen' using detail = 'a BANK_TRANSFER_V1 financial summary is never deleted';
  end if;
  if v_status not in ('DRAFT', 'PROFORMA_ISSUED') then
    raise exception 'order_financials_frozen' using detail = 'the order has left PROFORMA_ISSUED (' || v_status || ')';
  end if;
  if not public.is_internal_transition() then
    raise exception 'order_financials_frozen' using detail = 'BANK_TRANSFER_V1 financials are written only by issue_proforma';
  end if;
  if new.proforma_id is null then
    raise exception 'order_financials_frozen' using detail = 'BANK_TRANSFER_V1 financials must reference the issued proforma';
  end if;
  return new;
end;
$function$;
revoke all on function public.freeze_order_financials() from public, anon;
grant execute on function public.freeze_order_financials() to authenticated, service_role;

-- 9.6 orders.current_proforma_id: only internal transitions, only on BANK_TRANSFER_V1 orders (T023 decision 3).
create or replace function public.guard_order_proforma_pointer()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'UPDATE' and new.current_proforma_id is not distinct from old.current_proforma_id then
    return new;
  end if;
  if tg_op = 'INSERT' and new.current_proforma_id is null then
    return new;
  end if;
  if not public.is_internal_transition() then
    raise exception 'order_field_not_client_writable';
  end if;
  if new.current_proforma_id is not null and new.commerce_flow <> 'BANK_TRANSFER_V1' then
    raise exception 'order_field_not_client_writable' using detail = 'only a BANK_TRANSFER_V1 order points to a proforma';
  end if;
  return new;
end;
$function$;
revoke all on function public.guard_order_proforma_pointer() from public, anon;
grant execute on function public.guard_order_proforma_pointer() to authenticated, service_role;

-- 9.7 Redacted audit of Feature 013 proforma headers. ALLOW-LIST only: no buyer, destination or bank snapshot and no
--     promotion code is copied (AUD-006, T029 R2); a column added later is not copied automatically. LEGACY rows are not
--     audited here (unchanged behaviour: proforma_invoices had no audit trigger).
create or replace function public.write_audit_log_proforma_invoices()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_correlation_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;
  if tg_op = 'UPDATE' then
    v_old := jsonb_build_object('status', old.status, 'confirmed_at', old.confirmed_at, 'expired_at', old.expired_at,
                                'cancelled_at', old.cancelled_at, 'voided_at', old.voided_at);
  end if;
  v_new := jsonb_build_object(
    'id', new.id, 'order_id', new.order_id, 'proforma_code', new.proforma_code, 'version', new.version,
    'supersedes_proforma_id', new.supersedes_proforma_id, 'status', new.status, 'currency', new.currency,
    'merchandise_gross', new.merchandise_gross, 'discount_total', new.discount_total, 'merchandise_net', new.merchandise_net,
    'shipping_total', new.shipping_total, 'vat_total', new.vat_total, 'buyer_total', new.buyer_total,
    'tax_rule_id', new.tax_rule_id, 'tax_rate_snapshot', new.tax_rate_snapshot, 'tax_base_snapshot', new.tax_base_snapshot,
    'issued_at', new.issued_at, 'valid_until', new.valid_until, 'validity_hours_snapshot', new.validity_hours_snapshot,
    'issued_by', new.issued_by, 'confirmed_at', new.confirmed_at, 'confirmed_by', new.confirmed_by,
    'expired_at', new.expired_at, 'cancelled_at', new.cancelled_at, 'voided_at', new.voided_at,
    'promotion_code_present', new.promotion_code_snapshot is not null);
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), tg_table_name, new.id, tg_op, v_old, v_new,
          jsonb_build_object('redacted_fields', jsonb_build_array('buyer_snapshot', 'destination_snapshot', 'bank_account_masked', 'promotion_code_snapshot'),
                             'redaction', 'allow_list'),
          coalesce(v_correlation_id, gen_random_uuid()));
  return new;
end;
$function$;
revoke all on function public.write_audit_log_proforma_invoices() from public, anon, authenticated;
grant execute on function public.write_audit_log_proforma_invoices() to service_role;

-- 9.8 Redacted audit of bank-instruction snapshots: ids, currency and the last four characters only (AUD-006).
create or replace function public.write_audit_log_proforma_bank_instructions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_correlation_id uuid;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), tg_table_name, new.proforma_id, tg_op, null,
          jsonb_build_object(
            'proforma_id', new.proforma_id, 'payment_account_id', new.payment_account_id, 'currency', new.currency,
            'account_number_last4', case when new.account_number is null then null when char_length(new.account_number) < 8 then '****' else '****' || right(new.account_number, 4) end,
            'iban_last4', case when new.iban is null then null when char_length(new.iban) < 8 then '****' else '****' || right(new.iban, 4) end),
          jsonb_build_object('redacted_fields', jsonb_build_array('account_name', 'bank_name', 'account_number', 'iban', 'swift_code', 'payment_reference'),
                             'redaction', 'last4_only'),
          coalesce(v_correlation_id, gen_random_uuid()));
  return new;
end;
$function$;
revoke all on function public.write_audit_log_proforma_bank_instructions() from public, anon, authenticated;
grant execute on function public.write_audit_log_proforma_bank_instructions() to service_role;

-- 10. Triggers ----------------------------------------------------------------------------------------------------------
create trigger trg_proforma_invoices_protect_snapshot
  before insert or update or delete on public.proforma_invoices
  for each row execute function public.protect_proforma_snapshot();
create trigger trg_audit_proforma_invoices
  after insert or update on public.proforma_invoices
  for each row when (new.validity_hours_snapshot is not null) execute function public.write_audit_log_proforma_invoices();

create trigger trg_proforma_invoice_items_immutable
  before update or delete on public.proforma_invoice_items
  for each row execute function public.prevent_snapshot_mutation();
create trigger trg_proforma_line_economics_immutable
  before update or delete on public.proforma_line_economics
  for each row execute function public.prevent_snapshot_mutation();
create trigger trg_proforma_fulfillment_groups_immutable
  before update or delete on public.proforma_fulfillment_groups
  for each row execute function public.prevent_snapshot_mutation();
create trigger trg_proforma_seller_settlements_immutable
  before update or delete on public.proforma_seller_settlements
  for each row execute function public.prevent_snapshot_mutation();
create trigger trg_proforma_bank_instructions_immutable
  before update or delete on public.proforma_bank_instructions
  for each row execute function public.prevent_snapshot_mutation();
create trigger trg_audit_proforma_bank_instructions
  after insert on public.proforma_bank_instructions
  for each row execute function public.write_audit_log_proforma_bank_instructions();

create constraint trigger trg_proforma_seller_settlements_totals
  after insert on public.proforma_seller_settlements
  deferrable initially deferred
  for each row execute function public.check_seller_settlement_totals();
create constraint trigger trg_proforma_line_economics_settlement_totals
  after insert on public.proforma_line_economics
  deferrable initially deferred
  for each row execute function public.check_seller_settlement_totals();

create constraint trigger trg_proforma_invoices_snapshot_totals
  after insert on public.proforma_invoices
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_proforma_invoice_items_snapshot_totals
  after insert on public.proforma_invoice_items
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_proforma_line_economics_snapshot_totals
  after insert on public.proforma_line_economics
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_proforma_fulfillment_groups_snapshot_totals
  after insert on public.proforma_fulfillment_groups
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_proforma_seller_settlements_snapshot_totals
  after insert on public.proforma_seller_settlements
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_proforma_bank_instructions_snapshot_totals
  after insert on public.proforma_bank_instructions
  deferrable initially deferred
  for each row execute function public.check_proforma_snapshot_totals();
create constraint trigger trg_order_financials_snapshot_totals
  after insert or update on public.order_financials
  deferrable initially deferred
  for each row when (new.proforma_id is not null) execute function public.check_proforma_snapshot_totals();

create trigger trg_order_financials_freeze
  before insert or update or delete on public.order_financials
  for each row execute function public.freeze_order_financials();

create trigger trg_orders_proforma_pointer_guard
  before insert or update of current_proforma_id on public.orders
  for each row execute function public.guard_order_proforma_pointer();

-- 11. New tables: RLS enabled + forced; no client access until M3 adds the rls-storage §1 policies; service_role may read
--     but never write (snapshot/ledger precedent). Writes arrive only through SECURITY DEFINER functions (M4b+).
alter table public.proforma_fulfillment_groups enable row level security;
alter table public.proforma_fulfillment_groups force row level security;
revoke all on table public.proforma_fulfillment_groups from public, anon, authenticated, service_role;
grant select on table public.proforma_fulfillment_groups to service_role;

alter table public.proforma_line_economics enable row level security;
alter table public.proforma_line_economics force row level security;
revoke all on table public.proforma_line_economics from public, anon, authenticated, service_role;
grant select on table public.proforma_line_economics to service_role;

alter table public.proforma_seller_settlements enable row level security;
alter table public.proforma_seller_settlements force row level security;
revoke all on table public.proforma_seller_settlements from public, anon, authenticated, service_role;
grant select on table public.proforma_seller_settlements to service_role;

alter table public.proforma_bank_instructions enable row level security;
alter table public.proforma_bank_instructions force row level security;
revoke all on table public.proforma_bank_instructions from public, anon, authenticated, service_role;
grant select on table public.proforma_bank_instructions to service_role;

-- 12. checkout_order(uuid) — ONE statement changed (see header); SECURITY DEFINER, search_path and EXECUTE list as T006.
CREATE OR REPLACE FUNCTION public.checkout_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
declare
  v_order public.orders%rowtype;
  v_ship public.order_shipments%rowtype;

  v_reservation_id uuid;
  v_proforma_id uuid;

  v_base numeric(14,2);
  v_qty numeric(14,3);
  v_shipping numeric(14,2);

  v_vat_rate numeric(7,4) := 0;
  v_taxable_base text := 'MERCHANDISE_ONLY';

  v_commission_rate numeric(7,4) := 0;
  v_commission numeric(14,2);
  v_vat numeric(14,2);
  v_buyer_total numeric(14,2);

  v_policy_id uuid;
  v_tax_id uuid;

  v_order_item record;
  v_offer public.coffee_offers%rowtype;
  v_position public.inventory_positions%rowtype;

  v_correlation_id uuid;
begin

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;


  if v_order.id is null then
    raise exception 'order_not_found';
  end if;


  if not (
    public.is_org_member(
      v_order.buyer_organization_id
    )
    or public.is_platform_admin()
  ) then
    raise exception 'forbidden';
  end if;


  if not public.is_platform_admin()
     and not public.organization_can_buy(
       v_order.buyer_organization_id
     )
  then
    raise exception 'buyer_not_authorized';
  end if;


  -- Idempotent retry.
  if v_order.status in (
    'HOLD',
    'PAYMENT_PROOF_SUBMITTED',
    'PAYMENT_UNDER_REVIEW'
  ) then

    select id
    into v_reservation_id
    from public.inventory_reservations
    where order_id = p_order_id
      and status = 'ACTIVE'
    limit 1;


    if v_reservation_id is not null then

      select id
      into v_proforma_id
      from public.proforma_invoices
      where order_id = p_order_id;


      select buyer_total_amount
      into v_buyer_total
      from public.order_financials
      where order_id = p_order_id;


      return jsonb_build_object(
        'order_id',
        p_order_id,

        'proforma_id',
        v_proforma_id,

        'reservation_id',
        v_reservation_id,

        'buyer_total',
        v_buyer_total,

        'hold_expires_at',
        v_order.hold_expires_at,

        'correlation_id',
        v_order.correlation_id,

        'idempotent_retry',
        true
      );

    end if;

  end if;


  perform public.assert_order_checkout_ready(
    p_order_id
  );


  v_correlation_id :=
    coalesce(
      v_order.correlation_id,
      gen_random_uuid()
    );


  perform set_config(
    'app.correlation_id',
    v_correlation_id::text,
    true
  );


  select *
  into v_ship
  from public.order_shipments
  where order_id = p_order_id
    and status in (
      'READY',
      'RESERVED'
    )
  order by created_at desc
  limit 1;


  select
    coalesce(
      sum(
        quantity_kg
        * unit_price_per_kg
      ),
      0
    ),
    coalesce(
      sum(quantity_kg),
      0
    )
  into
    v_base,
    v_qty
  from public.order_items
  where order_id = p_order_id;


  v_shipping :=
    coalesce(
      v_ship.shipping_fee,
      0
    );


  select
    cp.id,
    ct.percentage
  into
    v_policy_id,
    v_commission_rate
  from public.commission_policies cp
  join public.commission_tiers ct
    on ct.policy_id = cp.id
  where cp.status = 'ACTIVE'
    and cp.effective_from <= now()
    and (
      cp.effective_until is null
      or cp.effective_until > now()
    )
    and ct.min_quantity_kg <= v_qty
    and (
      ct.max_quantity_kg is null
      or v_qty < ct.max_quantity_kg
    )
  order by
    cp.effective_from desc,
    ct.min_quantity_kg desc
  limit 1;


  v_commission :=
    round(
      v_base
      * coalesce(
        v_commission_rate,
        0
      )
      / 100,
      2
    );


  select
    tr.id,
    tr.rate_percentage,
    tr.taxable_base
  into
    v_tax_id,
    v_vat_rate,
    v_taxable_base
  from public.tax_rules tr
  where tr.is_active = true
    and tr.country_code =
        upper(v_ship.country_code)
    and tr.effective_from <= now()
    and (
      tr.effective_until is null
      or tr.effective_until > now()
    )
  order by tr.effective_from desc
  limit 1;


  v_vat :=
    round(
      (
        case
          when v_taxable_base =
               'MERCHANDISE_AND_SHIPPING'
          then
            v_base + v_shipping
          else
            v_base
        end
      )
      * coalesce(
        v_vat_rate,
        0
      )
      / 100,
      2
    );


  v_buyer_total :=
    v_base
    + v_shipping
    + v_vat;


  insert into public.order_financials(
    order_id,
    base_subtotal,
    shipping_amount,
    vat_amount,
    commission_amount,
    seller_net_amount,
    buyer_total_amount,
    total_quantity_kg,
    commission_policy_id,
    commission_percentage_snapshot,
    tax_rule_id,
    tax_percentage_snapshot,
    tax_base_snapshot
  )
  values (
    p_order_id,
    v_base,
    v_shipping,
    v_vat,
    v_commission,
    v_base - v_commission,
    v_buyer_total,
    v_qty,
    v_policy_id,
    coalesce(v_commission_rate, 0),
    v_tax_id,
    coalesce(v_vat_rate, 0),
    v_taxable_base
  )
  on conflict (order_id)
  do update set
    base_subtotal =
      excluded.base_subtotal,

    shipping_amount =
      excluded.shipping_amount,

    vat_amount =
      excluded.vat_amount,

    commission_amount =
      excluded.commission_amount,

    seller_net_amount =
      excluded.seller_net_amount,

    buyer_total_amount =
      excluded.buyer_total_amount,

    total_quantity_kg =
      excluded.total_quantity_kg,

    commission_policy_id =
      excluded.commission_policy_id,

    commission_percentage_snapshot =
      excluded.commission_percentage_snapshot,

    tax_rule_id =
      excluded.tax_rule_id,

    tax_percentage_snapshot =
      excluded.tax_percentage_snapshot,

    tax_base_snapshot =
      excluded.tax_base_snapshot,

    calculated_at = now();


  -- Feature 013 M2b: proforma versioning replaced the UNIQUE (order_id) arbiter of the former upsert.
  -- Same effect, serialized by the order FOR UPDATE lock taken above.
  update public.proforma_invoices
  set
    valid_until =
      now() + interval '20 minutes',
    status = 'ISSUED'
  where order_id = p_order_id;

  if not found then
    insert into public.proforma_invoices(
      order_id,
      valid_until
    )
    values (
      p_order_id,
      now() + interval '20 minutes'
    );
  end if;


  select id
  into v_proforma_id
  from public.proforma_invoices
  where order_id = p_order_id;


  insert into public.inventory_reservations(
    order_id,
    expires_at
  )
  values (
    p_order_id,
    now() + interval '20 minutes'
  )
  returning id
  into v_reservation_id;


  for v_order_item in
    select *
    from public.order_items
    where order_id = p_order_id
    order by id
  loop

    -- Consistent lock order:
    -- Offer first, Inventory second.

    select *
    into v_offer
    from public.coffee_offers
    where id = v_order_item.offer_id
    for update;


    if v_offer.id is null
       or v_offer.status not in (
         'PUBLISHED',
         'PARTIALLY_FILLED'
       )
       or not v_offer.is_visible
       or (
         v_offer.quantity_kg
         - v_offer.filled_quantity_kg
         - v_offer.reserved_quantity_kg
       ) < v_order_item.quantity_kg
    then
      raise exception 'listing_inventory_changed';
    end if;


    if v_offer.seller_type = 'MEMBER_SELLER'
       and not public.organization_can_sell(
         v_offer.seller_organization_id
       )
    then
      raise exception 'seller_not_authorized';
    end if;


    select *
    into v_position
    from public.inventory_positions ip
    where ip.lot_id = v_offer.lot_id
      and ip.owner_organization_id =
          v_offer.seller_organization_id
      and ip.warehouse_id =
          v_offer.warehouse_id
      and ip.warehouse_location_id
          is not distinct from
          v_offer.warehouse_location_id
    order by ip.created_at
    limit 1
    for update;


    if v_position.id is null
       or (
         v_position.available_quantity_kg
         - v_position.reserved_quantity_kg
       ) < v_order_item.quantity_kg
    then
      raise exception 'seller_inventory_changed';
    end if;


    -- Inventory source of truth reserved FIRST.
    update public.inventory_positions
    set
      reserved_quantity_kg =
        reserved_quantity_kg
        + v_order_item.quantity_kg,
      updated_at = now()
    where id = v_position.id;


    -- Listing reservation mirrors inventory reservation.
    -- Feature 007 DB blocker run (DB-OPEN-16): the transaction-local marker below is the ONLY way the listing trigger
    -- (validate_offer_transition) accepts a reservation that leaves a published listing with zero
    -- unreserved quantity. It is set by this SECURITY DEFINER function immediately before this one
    -- UPDATE — after this function's own locked `quantity - filled - reserved` check above — and
    -- cleared immediately after it. No client input reaches it.
    perform set_config('app.checkout_reservation', 'true', true);

    update public.coffee_offers
    set
      reserved_quantity_kg =
        reserved_quantity_kg
        + v_order_item.quantity_kg
    where id = v_offer.id;

    perform set_config('app.checkout_reservation', 'false', true);


    insert into public.inventory_reservation_items(
      reservation_id,
      offer_id,
      inventory_position_id,
      quantity_kg
    )
    values (
      v_reservation_id,
      v_offer.id,
      v_position.id,
      v_order_item.quantity_kg
    );


    insert into public.proforma_invoice_items(
      proforma_id,
      order_item_id,
      description,
      quantity_kg,
      unit_price,
      amount
    )
    values (
      v_proforma_id,
      v_order_item.id,
      v_order_item.product_name_snapshot,
      v_order_item.quantity_kg,
      v_order_item.unit_price_per_kg,
      round(
        v_order_item.quantity_kg
        * v_order_item.unit_price_per_kg,
        2
      )
    )
    on conflict (
      proforma_id,
      order_item_id
    )
    do nothing;

  end loop;


  update public.payments
  set
    amount = v_buyer_total,
    status = 'PENDING',
    correlation_id = v_correlation_id
  where order_id = p_order_id;


  if not found then

    insert into public.payments(
      order_id,
      amount,
      correlation_id
    )
    values (
      p_order_id,
      v_buyer_total,
      v_correlation_id
    );

  end if;


  perform set_config(
    'app.internal_transition',
    'true',
    true
  );


  update public.orders
  set
    status = 'HOLD',
    correlation_id = v_correlation_id,
    hold_started_at = now(),
    hold_expires_at =
      now() + interval '20 minutes'
  where id = p_order_id;


  return jsonb_build_object(
    'order_id',
    p_order_id,

    'proforma_id',
    v_proforma_id,

    'reservation_id',
    v_reservation_id,

    'buyer_total',
    v_buyer_total,

    'hold_expires_at',
    now() + interval '20 minutes',

    'correlation_id',
    v_correlation_id,

    'idempotent_retry',
    false
  );

end;
$function$;

revoke all on function public.checkout_order(uuid) from public, anon;
grant execute on function public.checkout_order(uuid) to authenticated, service_role;

commit;
