-- Read-only postflight for 20260926100000_feature_013_cart_destination_rpcs.sql (Feature 013 M4a, T070).
-- One query; every row must be ok = true and the last row must read 'ALL CHECKS PASSED' (12 rows). Run right after the apply:
--   npx supabase db query --linked -f supabase/maintenance/20260926_feature_013_cart_destination_rpcs_postflight.sql
-- Expected after M4a (point-in-time checks of earlier postflights): the M1 postflight rows "commerce_flow default LEGACY" /
-- "no non-LEGACY order" and the M2a "no non-LEGACY order" row now FAIL by design; the M2e and M3 postflights still pass.
with rpcs(sig) as (
  values ('public.get_or_create_cart(uuid)'), ('public.add_cart_line(uuid,uuid,numeric,uuid)'),
         ('public.upsert_delivery_destination(uuid,uuid,jsonb,uuid)'), ('public.retire_delivery_destination(uuid,uuid)'),
         ('public.update_commerce_settings(integer,boolean,boolean,uuid,uuid[])'), ('public.set_default_payment_account(uuid,uuid)'),
         ('public.admin_convert_legacy_draft(uuid,uuid)')
),
helpers(sig) as (
  values ('public.commerce_request_begin(uuid,text,uuid)'), ('public.commerce_request_complete(uuid,jsonb)'),
         ('public.commerce_assert_buyer_member(uuid)'), ('public.commerce_resolve_cart(uuid)'), ('public.enforce_new_order_flow()')
),
checks(seq, check_name, ok) as (
  select 1, 'the seven M4a RPCs exist, SECURITY DEFINER, search_path pinned to pg_catalog, public, auth',
    (select count(*) from rpcs r join pg_proc p on p.oid = to_regprocedure(r.sig)
       where p.prosecdef and 'search_path=pg_catalog, public, auth' = any(p.proconfig)) = 7
  union all
  select 2, 'RPC EXECUTE: authenticated only (no PUBLIC, anon or service_role)',
    not exists (select 1 from rpcs r where to_regprocedure(r.sig) is null
                  or not has_function_privilege('authenticated', to_regprocedure(r.sig), 'execute')
                  or has_function_privilege('anon', to_regprocedure(r.sig), 'execute')
                  or has_function_privilege('service_role', to_regprocedure(r.sig), 'execute'))
    and not exists (select 1 from rpcs r, pg_proc p, unnest(coalesce(p.proacl, '{}'::aclitem[])) a
                    where p.oid = to_regprocedure(r.sig) and a::text like '=%')
  union all
  select 3, 'internal helpers + enforce_new_order_flow: SECURITY INVOKER, search_path pinned, no EXECUTE for any API role',
    (select count(*) from helpers h join pg_proc p on p.oid = to_regprocedure(h.sig)
       where not p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) = 5
    and not exists (select 1 from helpers h, unnest(array['anon', 'authenticated', 'service_role']) r
                    where has_function_privilege(r, to_regprocedure(h.sig), 'execute'))
  union all
  select 4, 'H1: orders.commerce_flow default BANK_TRANSFER_V1; BEFORE INSERT trigger trg_orders_enforce_new_order_flow enabled',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'commerce_flow'
            and is_nullable = 'NO' and column_default = '''BANK_TRANSFER_V1''::text')
    and exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_orders_enforce_new_order_flow'
                and tgfoid = 'public.enforce_new_order_flow()'::regprocedure and tgenabled = 'O'
                and (tgtype & 2) = 2 and (tgtype & 4) = 4 and (tgtype & 1) = 1 and (tgtype & (8 | 16)) = 0)
  union all
  select 5, 'T023 F1: enforce_new_order_flow forces V1, has_manual_adjustment false and cancel_* NULL unless service_role',
    (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%current_user <> ''service_role''%'
    and (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%new.commerce_flow := ''BANK_TRANSFER_V1''%'
    and (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%new.has_manual_adjustment := false%'
    and (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%new.cancelled_at := null%'
    and (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%new.cancelled_by := null%'
    and (select prosrc from pg_proc where oid = 'public.enforce_new_order_flow()'::regprocedure) like '%new.cancel_reason := null%'
  union all
  select 6, 'cart: per-organization advisory lock (key 13); add_cart_line org-scoped, never touches reservations; R-25 log row inserted first',
    (select prosrc from pg_proc where oid = 'public.commerce_resolve_cart(uuid)'::regprocedure) like '%pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13))%'
    and (select prosrc from pg_proc where oid = 'public.add_cart_line(uuid,uuid,numeric,uuid)'::regprocedure) not similar to
        '%(reserved_quantity_kg|inventory_positions|inventory_reservations|coffee_offers)%'
    and (select prosrc from pg_proc where oid = 'public.add_cart_line(uuid,uuid,numeric,uuid)'::regprocedure)
        like '%commerce_request_begin(p_request_id, ''add_cart_line'', p_org_id)%commerce_assert_buyer_member(p_org_id)%commerce_resolve_cart(p_org_id)%'
    and (select prosrc from pg_proc where oid = 'public.commerce_request_begin(uuid,text,uuid)'::regprocedure) like '%on conflict (request_id) do nothing%'
  union all
  select 7, 'no client write path: commerce_request_log/commerce_settings/delivery_destinations writes and orders column boundary unchanged',
    not has_table_privilege('authenticated', 'public.commerce_request_log', 'select, insert, update, delete')
    and not has_table_privilege('authenticated', 'public.delivery_destinations', 'insert, update, delete')
    and not has_table_privilege('authenticated', 'public.commerce_settings', 'insert, update, delete')
    and not has_table_privilege('authenticated', 'public.orders', 'select')
    and not has_column_privilege('authenticated', 'public.orders', 'destination_snapshot', 'select')
    and not has_column_privilege('authenticated', 'public.orders', 'delivery_destination_id', 'select')
  union all
  select 8, 'M1–M3 bodies untouched: validate_order_transition v2, checkout_order (M2b), validate_order_item_offer, can_view_order',
    (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_transition()'::regprocedure) = '603d04c58bbcf987c38e2aa6f7d73d9b'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.checkout_order(uuid)'::regprocedure) = '54810aadbcb05915d49374d5ceae738e'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.validate_order_item_offer()'::regprocedure) = '52786a92f9cd03ae54aad8c60e020a6f'
    and (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.can_view_order(uuid)'::regprocedure) = 'eef50520051e17d1f16985517158b825'
  union all
  select 9, 'M3 read policies intact (orders_view, order_items_read) and M2e outbox untouched (no M4a emitter call)',
    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_view' and qual = 'can_view_order(id)')
    and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_read')
    and not exists (select 1 from rpcs r join pg_proc p on p.oid = to_regprocedure(r.sig) where p.prosrc like '%emit_notification_event%')
  union all
  select 10, 'checkout still disabled (kill switch OFF)',
    exists (select 1 from public.commerce_settings) and not exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled)
  union all
  select 11, 'orders shape unchanged: 24 columns; authenticated keeps exactly the 22 M3 column SELECT grants and no new column',
    (select count(*) from pg_attribute where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped) = 24
    and (select count(*) from pg_attribute a where a.attrelid = 'public.orders'::regclass and a.attnum > 0 and not a.attisdropped
           and has_column_privilege('authenticated', 'public.orders', a.attname, 'select')) = 22
  union all
  select 12, 'no M4b+ object yet',
    not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                and p.proname in ('estimate_cart', 'compute_order_quote', 'issue_proforma', 'confirm_proforma', 'cancel_order', 'expire_reservation',
                                  'sweep_expired_reservations', 'admin_void_order', 'finance_confirm_payment', 'finance_reject_payment',
                                  'open_reconciliation_case', 'report_late_transfer', 'search_member_listings'))
)
select seq, check_name, coalesce(ok, false) as ok from checks
union all
select 999,
  case when bool_and(coalesce(ok, false)) then 'ALL CHECKS PASSED'
       else 'CHECKS FAILED: ' || count(*) filter (where not coalesce(ok, false)) || ' of ' || count(*) end,
  bool_and(coalesce(ok, false))
from checks
order by seq;
