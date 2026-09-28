-- Read-only M4b postflight. Every row must return passed = true.
with checks as (
  select 1 as ordinal, 'M4b functions exist' as invariant,
    to_regprocedure('public.compute_order_quote(uuid,uuid,text)') is not null
      and to_regprocedure('public.estimate_cart(uuid,uuid,text)') is not null
      and to_regprocedure('public.issue_proforma(uuid,uuid,text,uuid)') is not null as passed
  union all
  select 2, 'orders audit uses redacted allow-list trigger',
    exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
      and tgname = 'trg_audit_orders' and tgenabled = 'O'
      and tgfoid = to_regprocedure('public.write_audit_log_orders_redacted()'))
  union all
  select 3, 'quote internal and member RPC grants are narrow',
    not has_function_privilege('anon', 'public.compute_order_quote(uuid,uuid,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.compute_order_quote(uuid,uuid,text)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.compute_order_quote(uuid,uuid,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.estimate_cart(uuid,uuid,text)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.estimate_cart(uuid,uuid,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.issue_proforma(uuid,uuid,text,uuid)', 'EXECUTE')
      and has_function_privilege('authenticated', 'public.issue_proforma(uuid,uuid,text,uuid)', 'EXECUTE')
  union all
  select 4, 'global checkout remains off',
    exists (select 1 from public.commerce_settings where id and not bank_transfer_checkout_enabled)
  union all
  select 5, 'no destination PII keys in orders audit payloads',
    not exists (select 1 from public.audit_logs a where a.entity_type = 'orders'
      and ((a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
        or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
        or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
        or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']))
  union all
  select 6, 'no issued proforma has an inconsistent order destination snapshot',
    not exists (select 1 from public.proforma_invoices pi
      join public.orders o on o.id = pi.order_id and o.current_proforma_id = pi.id
      where pi.validity_hours_snapshot is not null
        and pi.destination_snapshot is distinct from o.destination_snapshot)
  union all
  select 7, 'RLS-008: buyer bank-instruction read requires a CONFIRMED/PAID proforma; finance kept; MFA gate kept; no anon; service_role read-only (M2b)',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_bank_instructions'
      and policyname = 'proforma_bank_instructions_read' and cmd = 'SELECT' and roles = '{authenticated}'::name[]
      and permissive = 'PERMISSIVE'
      and qual like '%pi.status = ANY (ARRAY[''CONFIRMED''::text, ''PAID''::text])%is_order_buyer_member(pi.order_id)%is_finance_operator()%')
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'proforma_bank_instructions'
      and permissive = 'PERMISSIVE') = 1
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proforma_bank_instructions'
      and policyname = 'mfa_gate_proforma_bank_instructions' and permissive = 'RESTRICTIVE' and qual = 'mfa_satisfied()')
    and not has_table_privilege('anon', 'public.proforma_bank_instructions', 'SELECT')
    and not has_table_privilege('authenticated', 'public.proforma_bank_instructions', 'INSERT, UPDATE, DELETE, TRUNCATE')
    and has_table_privilege('service_role', 'public.proforma_bank_instructions', 'SELECT')
    and not has_table_privilege('service_role', 'public.proforma_bank_instructions', 'INSERT, UPDATE, DELETE, TRUNCATE')
  union all
  select 8, 'H2: buyers have only the safe financial projection; internal settlement is finance/admin/auditor-only',
    to_regclass('public.v_buyer_order_financials') is not null
    and to_regclass('public.v_internal_order_financials') is not null
    and to_regprocedure('public.buyer_order_financial_rows()') is not null
    and to_regprocedure('public.internal_order_financial_rows()') is not null
    and not has_table_privilege('anon', 'public.order_financials', 'SELECT')
    and not has_table_privilege('authenticated', 'public.order_financials', 'SELECT')
    and has_table_privilege('authenticated', 'public.v_buyer_order_financials', 'SELECT')
    and has_table_privilege('authenticated', 'public.v_internal_order_financials', 'SELECT')
    and has_table_privilege('service_role', 'public.order_financials', 'SELECT')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_financials'
      and policyname = 'order_financials_internal_read' and permissive = 'PERMISSIVE'
      and qual like '%is_finance_operator()%is_platform_admin()%is_auditor()%')
  union all
  select 9, 'H1: every protected replay function re-authorizes before commerce_request_begin',
    not exists (
      select 1 from (values
        ('public.add_cart_line(uuid,uuid,numeric,uuid)'::regprocedure, 'commerce_assert_buyer_member'),
        ('public.upsert_delivery_destination(uuid,uuid,jsonb,uuid)'::regprocedure, 'commerce_assert_buyer_member'),
        ('public.retire_delivery_destination(uuid,uuid)'::regprocedure, 'commerce_assert_buyer_member'),
        ('public.update_commerce_settings(integer,boolean,boolean,uuid,uuid[])'::regprocedure, 'is_platform_admin'),
        ('public.set_default_payment_account(uuid,uuid)'::regprocedure, 'is_platform_admin'),
        ('public.admin_convert_legacy_draft(uuid,uuid)'::regprocedure, 'is_platform_admin'),
        ('public.issue_proforma(uuid,uuid,text,uuid)'::regprocedure, 'commerce_assert_buyer_member')
      ) as required(fn, auth_marker)
      cross join lateral (select pg_get_functiondef(required.fn) as definition) d
      where position(required.auth_marker in d.definition) = 0
         or position('commerce_request_begin' in d.definition) = 0
         or position(required.auth_marker in d.definition) > position('commerce_request_begin' in d.definition)
    )
)
select ordinal, invariant, passed from checks order by ordinal;
