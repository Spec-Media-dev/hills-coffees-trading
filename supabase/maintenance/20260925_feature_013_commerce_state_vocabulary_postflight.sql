-- Read-only postflight for 20260925100000_feature_013_commerce_state_vocabulary.sql (Feature 013 M1, T024).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED'. Run right after the apply.
with vocab(conname, relname, want) as (
  values
    ('orders_status_check', 'orders', array['CANCELLED', 'COMPLETED', 'CONFIRMED', 'DISPUTED', 'DRAFT', 'EXPIRED', 'FULFILLMENT_IN_PROGRESS', 'HOLD', 'PAID', 'PARTIALLY_DELIVERED', 'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_REJECTED', 'PAYMENT_UNDER_REVIEW', 'PROFORMA_ISSUED', 'VOID']),
    ('inventory_reservations_status_check', 'inventory_reservations', array['ACTIVE', 'CONSUMED', 'EXPIRED', 'RELEASED', 'REVIEW_HOLD']),
    ('payouts_status_check', 'payouts', array['ACCRUED', 'PAID', 'PENDING_PAYOUT', 'PROCESSING', 'VOID']),
    ('payment_reviews_decision_check', 'payment_reviews', array['CONFIRMED', 'REJECTED', 'SENT_TO_RECONCILIATION']),
    ('payments_status_check', 'payments', array['CONFIRMED', 'EXPIRED', 'PENDING', 'PROOF_SUBMITTED', 'REJECTED', 'UNDER_REVIEW', 'VOID']),
    ('proforma_invoices_status_check', 'proforma_invoices', array['ISSUED', 'PAID', 'VOID'])
),
new_columns(relname, attname) as (
  values
    ('orders', 'commerce_flow'), ('orders', 'cancelled_at'), ('orders', 'cancelled_by'), ('orders', 'cancel_reason'), ('orders', 'has_manual_adjustment'),
    ('inventory_reservations', 'proforma_id'), ('inventory_reservations', 'confirmed_by'), ('inventory_reservations', 'review_hold_at'), ('inventory_reservations', 'release_reason'),
    ('payments', 'proforma_id'), ('payments', 'expected_amount'), ('payments', 'observed_amount'), ('payments', 'observed_currency'), ('payments', 'observed_value_date'),
    ('payments', 'observed_bank_reference'), ('payments', 'observed_bank_reference_normalized'), ('payments', 'rejected_by'), ('payments', 'rejected_at'),
    ('payment_proofs', 'claimed_amount'), ('payment_proofs', 'claimed_currency'), ('payment_proofs', 'transfer_date'), ('payment_proofs', 'bank_reference'),
    ('payment_proofs', 'submitted_at'), ('payment_proofs', 'submission_kind'), ('payment_proofs', 'request_id'), ('payment_proofs', 'status'),
    ('payment_reviews', 'request_id'),
    ('payouts', 'proforma_id'), ('payouts', 'eligible_at'), ('payouts', 'recorded_amount'), ('payouts', 'recorded_currency'), ('payouts', 'request_id'),
    ('payment_accounts', 'is_default_for_currency'), ('coffee_offers', 'offer_code')
),
checks(seq, check_name, ok) as (
  select 1, 'status vocabularies equal data-model (' || string_agg(v.conname, ', ') || ')',
    bool_and(coalesce((
      select array_agg(m[1] order by m[1])
      from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([A-Z_]+)''::text', 'g') m
      where c.conrelid = to_regclass('public.' || v.relname) and c.conname = v.conname) = v.want, false))
  from vocab v
  union all
  select 2, 'every M1 column exists (34)',
    (select count(*) from new_columns n join pg_attribute a on a.attrelid = to_regclass('public.' || n.relname) and a.attname = n.attname and not a.attisdropped) = 34
  union all
  select 3, 'orders.commerce_flow NOT NULL, default LEGACY, CHECK LEGACY|BANK_TRANSFER_V1',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'commerce_flow'
            and is_nullable = 'NO' and column_default = '''LEGACY''::text')
    and exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_commerce_flow_check'
                and pg_get_constraintdef(oid) like '%LEGACY%' and pg_get_constraintdef(oid) like '%BANK_TRANSFER_V1%')
  union all
  select 4, 'every order is LEGACY and none uses a new status (no behaviour change)',
    not exists (select 1 from public.orders where commerce_flow <> 'LEGACY' or status in ('PROFORMA_ISSUED', 'CANCELLED', 'PAYMENT_REJECTED'))
  union all
  select 5, 'commerce_settings singleton present with the safe defaults (24 h, checkout OFF, proof ON, no pilots)',
    (select count(*) from public.commerce_settings) = 1
    and exists (select 1 from public.commerce_settings where id and proforma_validity_hours = 24 and not bank_transfer_checkout_enabled
                and proof_submission_enabled and pilot_organization_ids = '{}')
  union all
  select 6, 'commerce_settings: RLS enabled + forced; anon nothing; authenticated SELECT only; staff read policy',
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.commerce_settings'::regclass)
    and not has_table_privilege('anon', 'public.commerce_settings', 'select, insert, update, delete, truncate, references, trigger')
    and has_table_privilege('authenticated', 'public.commerce_settings', 'select')
    and not has_table_privilege('authenticated', 'public.commerce_settings', 'insert, update, delete, truncate, references, trigger')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'commerce_settings' and policyname = 'commerce_settings_staff_read' and cmd = 'SELECT')
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'commerce_settings') = 1
  union all
  select 7, 'commerce_request_log: RLS enabled + forced; no anon/authenticated privilege; no policy; created_at index',
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.commerce_request_log'::regclass)
    and not has_table_privilege('anon', 'public.commerce_request_log', 'select, insert, update, delete, truncate, references, trigger')
    and not has_table_privilege('authenticated', 'public.commerce_request_log', 'select, insert, update, delete, truncate, references, trigger')
    and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'commerce_request_log')
    and to_regclass('public.idx_commerce_request_log_created_at') is not null
  union all
  select 8, 'open-reservation index: unique (order_id) WHERE ACTIVE or REVIEW_HOLD; old ACTIVE-only index gone; expiry index present',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.uq_open_inventory_reservation_order') and i.indisunique
            and pg_get_indexdef(i.indexrelid) like '%(order_id)%' and pg_get_indexdef(i.indexrelid) like '%ACTIVE%' and pg_get_indexdef(i.indexrelid) like '%REVIEW_HOLD%')
    and to_regclass('public.uq_active_inventory_reservation_order') is null
    and exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.idx_inventory_reservations_active_expiry')
                and pg_get_indexdef(i.indexrelid) like '%(expires_at)%' and pg_get_indexdef(i.indexrelid) like '%''ACTIVE''%')
  union all
  select 9, 'at most one open reservation per order',
    not exists (select order_id from public.inventory_reservations where status in ('ACTIVE', 'REVIEW_HOLD') group by order_id having count(*) > 1)
  union all
  select 10, 'payments: uq_confirmed_bank_reference unique partial index present',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.uq_confirmed_bank_reference') and i.indisunique
            and pg_get_indexdef(i.indexrelid) like '%(observed_bank_reference_normalized)%' and pg_get_indexdef(i.indexrelid) like '%''CONFIRMED''%')
  union all
  select 11, 'payment_proofs.submitted_at NOT NULL, default clock_timestamp(), never before created_at (backfill complete)',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_proofs' and column_name = 'submitted_at'
            and is_nullable = 'NO' and column_default = 'clock_timestamp()')
    and not exists (select 1 from public.payment_proofs where submitted_at < created_at)
  union all
  select 12, 'payment_proofs: one ON_TIME submission per payment (uq_payment_proof_on_time); uq_payment_proof_file kept',
    exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.uq_payment_proof_on_time') and i.indisunique
            and pg_get_indexdef(i.indexrelid) like '%(payment_id)%' and pg_get_indexdef(i.indexrelid) like '%ON_TIME%')
    and to_regclass('public.uq_payment_proof_file') is not null
  union all
  select 13, 'payouts: PAID requires paid_by/paid_at/payment_reference; every row satisfies it',
    exists (select 1 from pg_constraint where conrelid = 'public.payouts'::regclass and conname = 'payouts_paid_fields_check' and convalidated)
    and not exists (select 1 from public.payouts where status = 'PAID' and (paid_by is null or paid_at is null or payment_reference is null))
  union all
  select 14, 'payment_accounts: is_default_for_currency NOT NULL default false; uq_payment_account_default_currency present; no account flagged yet',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_accounts' and column_name = 'is_default_for_currency'
            and is_nullable = 'NO' and column_default = 'false')
    and exists (select 1 from pg_index i where i.indexrelid = to_regclass('public.uq_payment_account_default_currency') and i.indisunique
                and pg_get_indexdef(i.indexrelid) like '%(currency)%' and pg_get_indexdef(i.indexrelid) like '%is_default_for_currency%' and pg_get_indexdef(i.indexrelid) like '%is_active%')
    and not exists (select 1 from public.payment_accounts where is_default_for_currency)
  union all
  select 15, 'payment_accounts (Feature 010 config table): triggers and policies unchanged (2 triggers, 1 policy)',
    (select count(*) from pg_trigger where tgrelid = 'public.payment_accounts'::regclass and not tgisinternal) = 2
    and exists (select 1 from pg_trigger where tgrelid = 'public.payment_accounts'::regclass and tgname = 'trg_audit_payment_accounts')
    and exists (select 1 from pg_trigger where tgrelid = 'public.payment_accounts'::regclass and tgname = 'trg_payment_accounts_updated_at')
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'payment_accounts') = 1
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_accounts' and policyname = 'payment_accounts_admin')
  union all
  select 16, 'coffee_offers.offer_code backfilled: NOT NULL, unique, LST-format for every offer',
    not exists (select 1 from public.coffee_offers where offer_code is null or offer_code !~ '^LST-[0-9]{7,}$')
    and (select count(*) from public.coffee_offers) = (select count(distinct offer_code) from public.coffee_offers)
    and exists (select 1 from pg_constraint where conrelid = 'public.coffee_offers'::regclass and conname = 'coffee_offers_offer_code_key' and contype = 'u')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coffee_offers' and column_name = 'offer_code'
                and is_nullable = 'NO' and column_default like '%next_offer_code()')
  union all
  select 17, 'next_offer_code(): SECURITY DEFINER, pinned search_path, EXECUTE authenticated + service_role only; sequence not client-usable',
    (select prosecdef from pg_proc where oid = 'public.next_offer_code()'::regprocedure)
    and exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = 'public.next_offer_code()'::regprocedure and c like 'search_path=%')
    and not has_function_privilege('anon', 'public.next_offer_code()', 'execute')
    and not has_function_privilege('public', 'public.next_offer_code()', 'execute')
    and has_function_privilege('authenticated', 'public.next_offer_code()', 'execute')
    and not has_sequence_privilege('anon', 'public.offer_code_seq', 'usage, select, update')
    and not has_sequence_privilege('authenticated', 'public.offer_code_seq', 'usage, select, update')
  union all
  select 18, 'validate_order_transition() v2: SECURITY DEFINER, pinned search_path, both graphs present, still bound to trg_order_transition',
    (select prosecdef from pg_proc where oid = 'public.validate_order_transition()'::regprocedure)
    and exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = 'public.validate_order_transition()'::regprocedure and c like 'search_path=%')
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) <> '8cb857495ac7bd3333f0b81236ca2ee2'
    and (select prosrc from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) like '%new.commerce_flow = ''LEGACY''%'
    and (select prosrc from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) like '%if old.status = ''CONFIRMED'' and new.status not in (''HOLD'', ''VOID'') then raise exception ''invalid_order_transition''; end if;%'
    and (select prosrc from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) like '%if old.status = ''PROFORMA_ISSUED'' and new.status not in (''HOLD'', ''CANCELLED'', ''VOID'')%'
    and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_order_transition'
                and tgfoid = 'public.validate_order_transition()'::regprocedure)
  union all
  select 19, 'validate_order_transition(): EXECUTE unchanged (authenticated + service_role; not anon, not PUBLIC)',
    has_function_privilege('authenticated', 'public.validate_order_transition()', 'execute')
    and has_function_privilege('service_role', 'public.validate_order_transition()', 'execute')
    and not has_function_privilege('anon', 'public.validate_order_transition()', 'execute')
    and not has_function_privilege('public', 'public.validate_order_transition()', 'execute')
  union all
  select 20, 'untouched functions keep their T006 fingerprints (admin_review_payment, checkout_order, expire_order_hold)',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.admin_review_payment(uuid,boolean,text)'::regprocedure) = 'c0ef5f06b8ee47788825480cf56cfc03'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.checkout_order(uuid)'::regprocedure) = '75e07c357ea33a980fd695a271d8e708'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.expire_order_hold(uuid)'::regprocedure) = 'e5b8f4ee0c35948c6e582f2a9d3c0288'
  union all
  select 21, 'anon holds no privilege on the M1 finance tables',
    not has_table_privilege('anon', 'public.orders', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.payments', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.payment_proofs', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.payment_reviews', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.payouts', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.inventory_reservations', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'public.payment_accounts', 'select, insert, update, delete')
  union all
  select 22, 'no Feature 013 object beyond M1 exists yet (M2a+ not applied)',
    to_regclass('public.delivery_destinations') is null and to_regclass('public.proforma_line_economics') is null
    and to_regclass('public.reconciliation_cases') is null and to_regclass('public.offer_price_tiers') is null
    and to_regclass('public.notification_events') is null
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
