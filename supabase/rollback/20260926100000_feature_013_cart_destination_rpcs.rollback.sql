-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260926100000_feature_013_cart_destination_rpcs.sql (Feature 013 M4a).
-- Removes exactly what M4a added: the enforce_new_order_flow trigger and function, the seven M4a RPCs and the four internal
-- helpers, and restores the M1 orders.commerce_flow default 'LEGACY'. No object that existed before M4a is altered
-- (M1–M3 stay applied).
-- DATA IS KEPT, NEVER REWRITTEN: BANK_TRANSFER_V1 carts and their lines, delivery_destinations rows, commerce_request_log
-- rows, the commerce_settings values and the payment_accounts default flag written through the M4a RPCs all stay as they
-- are (a V1 DRAFT is inert without M4b; the M1 CHECK admits it). The guard reports their counts.
-- The guard refuses (changing nothing) while a later Feature 013 migration (M4b+) is applied (roll those back first),
-- while another function references an M4a RPC, or while checkout is enabled.
-- After running it: `supabase migration repair --status reverted 20260926100000` (OPERATOR); the M4a postflight is then
-- expected to FAIL and the M3 postflight to pass again.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
begin
  if to_regprocedure('public.get_or_create_cart(uuid)') is null
     or to_regprocedure('public.add_cart_line(uuid,uuid,numeric,uuid)') is null
     or to_regprocedure('public.upsert_delivery_destination(uuid,uuid,jsonb,uuid)') is null
     or to_regprocedure('public.retire_delivery_destination(uuid,uuid)') is null
     or to_regprocedure('public.update_commerce_settings(integer,boolean,boolean,uuid,uuid[])') is null
     or to_regprocedure('public.set_default_payment_account(uuid,uuid)') is null
     or to_regprocedure('public.admin_convert_legacy_draft(uuid,uuid)') is null
     or to_regprocedure('public.enforce_new_order_flow()') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_orders_enforce_new_order_flow') then
    v_problems := v_problems || 'M4a is not (fully) applied; ';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('estimate_cart', 'compute_order_quote', 'issue_proforma', 'confirm_proforma', 'cancel_order', 'expire_reservation',
                               'sweep_expired_reservations', 'admin_void_order', 'finance_confirm_payment', 'finance_reject_payment',
                               'open_reconciliation_case', 'report_late_transfer', 'search_member_listings')) then
    v_problems := v_problems || 'a later Feature 013 migration (M4b+) is still applied; ';
  end if;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname not in ('get_or_create_cart', 'add_cart_line', 'upsert_delivery_destination', 'retire_delivery_destination',
                                   'update_commerce_settings', 'set_default_payment_account', 'admin_convert_legacy_draft',
                                   'commerce_request_begin', 'commerce_request_complete', 'commerce_assert_buyer_member', 'commerce_resolve_cart')
             and (p.prosrc ~ '\m(get_or_create_cart|add_cart_line|commerce_resolve_cart|commerce_request_begin|commerce_request_complete|commerce_assert_buyer_member)\M')) then
    v_problems := v_problems || 'another function references an M4a function; ';
  end if;
  if exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'bank_transfer_checkout_enabled is true (disable it first); ';
  end if;
  if v_problems <> '' then
    raise exception 'feature_013_cart_destination_rpcs rollback refused — nothing changed: %', v_problems;
  end if;
  raise notice 'M4a rollback keeps: % BANK_TRANSFER_V1 order(s), % delivery destination(s), % request-log row(s)',
    (select count(*) from public.orders where commerce_flow = 'BANK_TRANSFER_V1'),
    (select count(*) from public.delivery_destinations),
    (select count(*) from public.commerce_request_log);
end
$guard$;

alter table public.orders alter column commerce_flow set default 'LEGACY';
drop trigger trg_orders_enforce_new_order_flow on public.orders;
drop function public.enforce_new_order_flow();

drop function public.admin_convert_legacy_draft(uuid, uuid);
drop function public.set_default_payment_account(uuid, uuid);
drop function public.update_commerce_settings(integer, boolean, boolean, uuid, uuid[]);
drop function public.retire_delivery_destination(uuid, uuid);
drop function public.upsert_delivery_destination(uuid, uuid, jsonb, uuid);
drop function public.add_cart_line(uuid, uuid, numeric, uuid);
drop function public.get_or_create_cart(uuid);

drop function public.commerce_resolve_cart(uuid);
drop function public.commerce_assert_buyer_member(uuid);
drop function public.commerce_request_complete(uuid, jsonb);
drop function public.commerce_request_begin(uuid, text, uuid);

commit;
