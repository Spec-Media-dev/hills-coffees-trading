-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 013 M4a (T066) — cart and destination RPCs, commerce settings, default payment account, legacy-draft
-- conversion, and the H1 new-order flow switch. Bank Transfer Commerce Core, Batch C.
-- Rollback:  supabase/rollback/20260926100000_feature_013_cart_destination_rpcs.rollback.sql
--            (paired; outside supabase/migrations/ so the CLI never treats it as a migration).
-- Postflight (read-only): supabase/maintenance/20260926_feature_013_cart_destination_rpcs_postflight.sql
-- NOT APPLIED BY THE RUN THAT WROTE IT — MP-4 human review (T069), then OPERATOR apply (T070).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT (contracts/database-rpc.md "Member — cart and destinations", "Admin", "Triggers"; data-model §1.1, §1.2,
-- §2.1–§2.4, §8; research R-21, R-25, R-27; ROLLOUT-FLAGS.md; tasks.md T066 incl. the T023 F1 condition):
--   1. get_or_create_cart(p_org_id) → uuid: can-buy, unblocked, MFA-satisfied member; per-organization advisory lock
--      pg_advisory_xact_lock(hashtextextended(org::text, 13)); returns the latest BANK_TRANSFER_V1 DRAFT order of the
--      organization, else creates one. No reservation, no offer/position change.
--   2. add_cart_line(p_org_id, p_offer_id, p_quantity_kg, p_request_id) → jsonb {order_id, line_id, quantity_kg}:
--      explicitly organization-scoped (owner decision A3, T069): can-buy, unblocked, MFA-satisfied member of p_org_id;
--      resolves THAT organization's cart (same per-organization advisory lock as get_or_create_cart), then inserts the
--      line or adds to the existing line of that offer (UNIQUE(order_id, offer_id)).
--      validate_order_item_offer() (unchanged, BEFORE INSERT OR UPDATE) enforces eligibility for the new total.
--      NEVER touches coffee_offers.reserved_quantity_kg, inventory_positions or inventory_reservations (FR-003).
--   3. upsert_delivery_destination(p_id, p_org_id, p_fields, p_request_id) → uuid and
--      retire_delivery_destination(p_id, p_request_id): the only writers of delivery_destinations (M2a). A foreign,
--      retired or nonexistent destination id raises the same destination_not_found (non-enumeration). Retire is soft,
--      never touches orders (they read their frozen snapshot).
--   4. update_commerce_settings(p_validity_hours, p_checkout_enabled, p_proof_enabled, p_request_id,
--      p_pilot_organization_ids default null): platform admin + MFA; NULL = unchanged; audited (old/new, actor).
--      THIS MIGRATION DOES NOT CHANGE ANY SETTING: bank_transfer_checkout_enabled stays false (flipped only at T235).
--   5. set_default_payment_account(p_account_id, p_request_id) → jsonb: makes one ACTIVE USD account the default
--      (uq_payment_account_default_currency). Platform admin + MFA (contract; owner decision A2, T069). Narrow
--      SECURITY DEFINER path: no payment_accounts grant changes. Audited by the existing redacted
--      trg_audit_payment_accounts; no bank value is read into the response.
--   6. admin_convert_legacy_draft(p_order_id, p_request_id) → jsonb: platform admin + MFA; LEGACY + DRAFT + no
--      non-CANCELLED shipment → commerce_flow = BANK_TRANSFER_V1 through the M1 internal-transition path (the only
--      permitted flow change); lines untouched; audited; any other state → legacy_draft_not_convertible.
--   7. H1: orders.commerce_flow default → 'BANK_TRANSFER_V1' + BEFORE INSERT trigger enforce_new_order_flow: every
--      insert whose role is not service_role is forced to commerce_flow = BANK_TRANSFER_V1, has_manual_adjustment =
--      false, cancelled_at/cancelled_by/cancel_reason = NULL (T023 F1). service_role inserts (test fixtures) are kept.
--   8. Idempotency (R-25, literally; owner decision A6): every mutating RPC takes p_request_id and INSERTS the
--      commerce_request_log row FIRST (INSERT … ON CONFLICT (request_id) DO NOTHING). On conflict, the same actor,
--      operation and scope (target) get the stored response; anything else raises request_id_conflict. A concurrent
--      duplicate waits on the uncommitted row, so a replay only ever sees a committed, completed response; the response
--      is written in the same transaction before commit, and a failure rolls the log row back with everything else.
--
-- WHAT IT DOES NOT DO: no policy, grant or column change on orders or any other table (the M3 column boundary is
-- untouched); no quote/proforma/reservation/cancellation RPC (M4b/M4c); no notification event (none of these
-- operations is in the notification-provider §1 catalogue); no change to validate_order_transition, checkout_order,
-- validate_order_item_offer, update_order_item_quantity or remove_order_item; no data change; no setting change.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — aborts, changing nothing, on drift or on an unexpected state ----------------------------------
do $guard$
declare
  v_problems text := '';
  v_pins jsonb := $json${
    "validate_order_transition()": "603d04c58bbcf987c38e2aa6f7d73d9b",
    "checkout_order(uuid)": "54810aadbcb05915d49374d5ceae738e",
    "prevent_snapshot_mutation()": "286e02091213c1be4236b144dff1f383",
    "can_view_order(uuid)": "eef50520051e17d1f16985517158b825",
    "validate_order_item_offer()": "52786a92f9cd03ae54aad8c60e020a6f",
    "update_order_item_quantity(uuid,numeric)": "c71ace4675941ac29668b3d1b8f525e2",
    "remove_order_item(uuid)": "9601dc0af97c5a80e1d86ad29375270b",
    "organization_can_buy(uuid)": "43d27cbd23b7a69db404806205209a3e",
    "is_org_member(uuid)": "696877b4b7ba36b23ed586c952e05468",
    "is_blocked_user()": "31afcbd22502f1104218d1550c3e65f6",
    "is_platform_admin()": "4c166ebfb69af74c26234fecf16ad78b",
    "mfa_satisfied()": "a78cfc6c462a0af5cec582234b118134"
  }$json$;
  v_pin record;
  c_order_columns constant text[] := array['id', 'order_code', 'buyer_organization_id', 'status', 'currency', 'shipping_ready_at', 'hold_started_at',
    'hold_expires_at', 'confirmed_at', 'paid_at', 'completed_at', 'created_by', 'created_at', 'updated_at', 'idempotency_key', 'correlation_id',
    'commerce_flow', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'has_manual_adjustment', 'current_proforma_id',
    'delivery_destination_id', 'destination_snapshot'];
begin
  -- 0.1 Every function M4a calls or relies on still has its recorded body (T006 §5; checkout_order = the M2b body,
  --     T035 F3; validate_order_transition = the M1 v2 body; can_view_order = the M3-reviewed body).
  for v_pin in select key, value #>> '{}' as md5 from jsonb_each(v_pins) loop
    if coalesce((select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.' || v_pin.key)), '') <> v_pin.md5 then
      v_problems := v_problems || format('%s differs from its recorded body; ', v_pin.key);
    end if;
  end loop;
  if to_regprocedure('public.emit_notification_event(text,text,uuid,text,jsonb,text,jsonb)') is null then
    v_problems := v_problems || 'the M2e emitter is missing; ';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.commerce_request_log') and contype = 'p'
                   and pg_get_constraintdef(oid) = 'PRIMARY KEY (request_id)') then
    v_problems := v_problems || 'commerce_request_log is not keyed by request_id (R-25 insert-first relies on it); ';
  end if;

  -- 0.2 M1–M3 applied in the reviewed form.
  if to_regclass('public.commerce_request_log') is null or to_regclass('public.delivery_destinations') is null
     or to_regclass('public.v_seller_order_lines') is null or to_regclass('public.notification_events') is null
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'order_items_read')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'orders_view' and qual = 'can_view_order(id)') then
    v_problems := v_problems || 'M1–M3 are not all applied as reviewed; ';
  end if;
  if (select array_agg(attname::text order by attname) from pg_attribute where attrelid = 'public.orders'::regclass and attnum > 0 and not attisdropped)
     <> (select array_agg(c order by c) from unnest(c_order_columns) c)
     or has_table_privilege('authenticated', 'public.orders', 'select')
     or has_column_privilege('authenticated', 'public.orders', 'destination_snapshot', 'select')
     or has_column_privilege('authenticated', 'public.orders', 'delivery_destination_id', 'select') then
    v_problems := v_problems || 'orders columns or the M3 column boundary differ; ';
  end if;
  if (select pg_get_expr(adbin, adrelid) from pg_attrdef where adrelid = 'public.orders'::regclass
        and adnum = (select attnum from pg_attribute where attrelid = 'public.orders'::regclass and attname = 'commerce_flow'))
     is distinct from '''LEGACY''::text' then
    v_problems := v_problems || 'orders.commerce_flow default is not the M1 LEGACY default; ';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.order_items'::regclass and contype = 'u'
                   and pg_get_constraintdef(oid) = 'UNIQUE (order_id, offer_id)')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.order_items'::regclass and tgname = 'trg_order_item_offer'
                      and tgfoid = 'public.validate_order_item_offer()'::regprocedure and tgenabled = 'O')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_order_transition'
                      and tgfoid = 'public.validate_order_transition()'::regprocedure and tgenabled = 'O')
     or not exists (select 1 from pg_trigger where tgrelid = 'public.payment_accounts'::regclass and tgname = 'trg_audit_payment_accounts' and tgenabled = 'O')
     or to_regclass('public.uq_payment_account_default_currency') is null then
    v_problems := v_problems || 'a trigger or constraint M4a relies on is missing; ';
  end if;
  if has_table_privilege('authenticated', 'public.commerce_request_log', 'select, insert, update, delete')
     or has_table_privilege('authenticated', 'public.delivery_destinations', 'insert, update, delete')
     or has_table_privilege('authenticated', 'public.commerce_settings', 'insert, update, delete') then
    v_problems := v_problems || 'a client write/read grant exists where M1/M2a allow none; ';
  end if;

  -- 0.3 Nothing this migration creates may exist yet (and no M4b+ object either).
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
               'get_or_create_cart', 'add_cart_line', 'upsert_delivery_destination', 'retire_delivery_destination',
               'update_commerce_settings', 'set_default_payment_account', 'admin_convert_legacy_draft', 'enforce_new_order_flow',
               'commerce_request_begin', 'commerce_request_complete', 'commerce_resolve_cart', 'commerce_assert_buyer_member',
               'estimate_cart', 'compute_order_quote', 'issue_proforma', 'confirm_proforma', 'cancel_order', 'expire_reservation',
               'sweep_expired_reservations', 'admin_void_order', 'finance_confirm_payment', 'finance_reject_payment',
               'open_reconciliation_case', 'report_late_transfer', 'search_member_listings'))
     or exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass and tgname = 'trg_orders_enforce_new_order_flow') then
    v_problems := v_problems || 'an M4a (or later) object already exists; ';
  end if;

  -- 0.4 Checkout still disabled; the migration role bypasses RLS.
  if not exists (select 1 from public.commerce_settings) or exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    v_problems := v_problems || 'commerce_settings is missing or bank_transfer_checkout_enabled is true; ';
  end if;
  if not exists (select 1 from pg_roles where rolname = current_user and (rolbypassrls or rolsuper)) then
    v_problems := v_problems || 'the migration role does not bypass RLS; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_013_cart_destination_rpcs preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. Internal helpers (SECURITY INVOKER; no EXECUTE for any API role; called only inside the RPCs below) ------------

-- R-25: the request-log row is inserted FIRST. Returns NULL for a new request (the caller then does its work and
-- completes the row), or the stored response for a replay by the same actor, operation and scope (target). Any other
-- reuse raises request_id_conflict. A concurrent duplicate blocks on the uncommitted row until that transaction commits
-- (then: replay of the completed response) or rolls back (then: this call proceeds as new).
create or replace function public.commerce_request_begin(p_request_id uuid, p_operation text, p_target_id uuid)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_inserted integer;
  v_log public.commerce_request_log%rowtype;
begin
  if p_request_id is null then
    raise exception 'request_id_required';
  end if;
  insert into public.commerce_request_log (request_id, actor_user_id, operation, target_id, response)
  values (p_request_id, auth.uid(), p_operation, p_target_id, '{}'::jsonb)
  on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    -- a new request: every write below (and every trigger audit row) carries this correlation and reason
    perform set_config('app.correlation_id', p_request_id::text, true);
    perform set_config('app.transition_reason', p_operation, true);
    return null;
  end if;
  select * into v_log from public.commerce_request_log where request_id = p_request_id;
  if v_log.actor_user_id is distinct from auth.uid() or v_log.operation <> p_operation
     or v_log.target_id is distinct from p_target_id then
    raise exception 'request_id_conflict';
  end if;
  return v_log.response;
end;
$function$;
revoke all on function public.commerce_request_begin(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Stores the response of the request begun above, in the same transaction (never visible before commit).
create or replace function public.commerce_request_complete(p_request_id uuid, p_response jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
begin
  update public.commerce_request_log set response = p_response
  where request_id = p_request_id and actor_user_id = auth.uid();
end;
$function$;
revoke all on function public.commerce_request_complete(uuid, jsonb) from public, anon, authenticated, service_role;

-- A can-buy, unblocked, MFA-satisfied active member of p_org_id (SEC-001: re-evaluated inside every member RPC).
create or replace function public.commerce_assert_buyer_member(p_org_id uuid)
returns void
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
begin
  if auth.uid() is null or p_org_id is null or not public.is_org_member(p_org_id) or public.is_blocked_user()
     or not public.organization_can_buy(p_org_id) then
    raise exception 'buyer_not_authorized';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
end;
$function$;
revoke all on function public.commerce_assert_buyer_member(uuid) from public, anon, authenticated, service_role;

-- The organization's cart: its latest BANK_TRANSFER_V1 DRAFT order, else a new one. Creation is serialized per
-- organization (data-model §2.1/§8: the advisory lock is taken before any order row lock).
create or replace function public.commerce_resolve_cart(p_org_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog, public, auth
as $function$
declare
  v_order_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text, 13));
  select o.id into v_order_id
  from public.orders o
  where o.buyer_organization_id = p_org_id and o.commerce_flow = 'BANK_TRANSFER_V1' and o.status = 'DRAFT'
  order by o.created_at desc, o.id desc
  limit 1;
  if v_order_id is null then
    if nullif(current_setting('app.correlation_id', true), '') is null then
      perform set_config('app.correlation_id', gen_random_uuid()::text, true);
    end if;
    perform set_config('app.transition_reason', coalesce(nullif(current_setting('app.transition_reason', true), ''), 'get_or_create_cart'), true);
    insert into public.orders (buyer_organization_id, created_by, status, commerce_flow)
    values (p_org_id, auth.uid(), 'DRAFT', 'BANK_TRANSFER_V1')
    returning id into v_order_id;
  end if;
  return v_order_id;
end;
$function$;
revoke all on function public.commerce_resolve_cart(uuid) from public, anon, authenticated, service_role;

-- 2. Member RPCs — cart ---------------------------------------------------------------------------------------------
create or replace function public.get_or_create_cart(p_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
begin
  perform public.commerce_assert_buyer_member(p_org_id);
  return public.commerce_resolve_cart(p_org_id);
end;
$function$;
revoke all on function public.get_or_create_cart(uuid) from public, anon, service_role;
grant execute on function public.get_or_create_cart(uuid) to authenticated;

create or replace function public.add_cart_line(p_org_id uuid, p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_order_id uuid;
  v_line_id uuid;
  v_quantity numeric;
  v_result jsonb;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'add_cart_line', p_org_id);
  if v_replay is not null then
    return v_replay;
  end if;
  -- the explicitly selected organization (A3): a non-member, a non-can-buy and a nonexistent organization are
  -- indistinguishable (buyer_not_authorized)
  perform public.commerce_assert_buyer_member(p_org_id);
  if p_quantity_kg is null or p_quantity_kg <= 0 then
    raise exception 'requested_quantity_not_available';
  end if;

  v_order_id := public.commerce_resolve_cart(p_org_id);
  perform 1 from public.orders where id = v_order_id for update;

  -- validate_order_item_offer() runs BEFORE INSERT (for the added quantity) and BEFORE UPDATE (for the merged total):
  -- eligibility and sellable quantity are checked, and nothing is reserved.
  insert into public.order_items (order_id, offer_id, quantity_kg)
  values (v_order_id, p_offer_id, p_quantity_kg)
  on conflict (order_id, offer_id) do update set quantity_kg = public.order_items.quantity_kg + excluded.quantity_kg
  returning id, quantity_kg into v_line_id, v_quantity;

  v_result := jsonb_build_object('order_id', v_order_id, 'line_id', v_line_id, 'quantity_kg', v_quantity);
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.add_cart_line(uuid, uuid, numeric, uuid) from public, anon, service_role;
grant execute on function public.add_cart_line(uuid, uuid, numeric, uuid) to authenticated;

-- 3. Member RPCs — delivery destinations (data-model §2.3; the only writers) ------------------------------------------
create or replace function public.upsert_delivery_destination(p_id uuid, p_org_id uuid, p_fields jsonb, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_id uuid;
  v_default boolean;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'upsert_delivery_destination', p_org_id);
  if v_replay is not null then
    return (v_replay ->> 'destination_id')::uuid;
  end if;
  perform public.commerce_assert_buyer_member(p_org_id);

  if p_id is not null then
    -- non-enumerating: another organization's, a retired and a nonexistent destination are indistinguishable
    select d.id into v_id from public.delivery_destinations d
    where d.id = p_id and d.organization_id = p_org_id and d.retired_at is null
    for update;
    if v_id is null then
      raise exception 'destination_not_found';
    end if;
  end if;

  -- §2.3 field rules are the M2a CHECK constraints (label/city/address lengths, upper-case ISO-2 country, E.164-shaped
  -- phone, the approved delivery methods). Any violation is reported as the stable destination_invalid; no constraint
  -- name or submitted value reaches the caller (SEC-004).
  begin
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception using errcode = '23514';
  end if;
  v_default := coalesce((p_fields ->> 'is_default')::boolean, false);
  if v_default then
    update public.delivery_destinations set is_default = false
    where organization_id = p_org_id and is_default and retired_at is null and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.delivery_destinations (organization_id, label, country_code, city, address_line_1, address_line_2,
      contact_name, contact_phone, delivery_method, is_default, created_by)
    values (p_org_id, p_fields ->> 'label', p_fields ->> 'country_code', p_fields ->> 'city', p_fields ->> 'address_line_1',
      nullif(p_fields ->> 'address_line_2', ''), p_fields ->> 'contact_name', p_fields ->> 'contact_phone',
      coalesce(p_fields ->> 'delivery_method', 'Courier'), v_default, auth.uid())
    returning id into v_id;
  else
    update public.delivery_destinations set
      label = p_fields ->> 'label', country_code = p_fields ->> 'country_code', city = p_fields ->> 'city',
      address_line_1 = p_fields ->> 'address_line_1', address_line_2 = nullif(p_fields ->> 'address_line_2', ''),
      contact_name = p_fields ->> 'contact_name', contact_phone = p_fields ->> 'contact_phone',
      delivery_method = coalesce(p_fields ->> 'delivery_method', 'Courier'), is_default = v_default
    where id = v_id;
  end if;
  exception when check_violation or not_null_violation or string_data_right_truncation or invalid_text_representation then
    raise exception 'destination_invalid';
  end;

  perform public.commerce_request_complete(p_request_id, jsonb_build_object('destination_id', v_id));
  return v_id;
end;
$function$;
revoke all on function public.upsert_delivery_destination(uuid, uuid, jsonb, uuid) from public, anon, service_role;
grant execute on function public.upsert_delivery_destination(uuid, uuid, jsonb, uuid) to authenticated;

create or replace function public.retire_delivery_destination(p_id uuid, p_request_id uuid)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_destination public.delivery_destinations%rowtype;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'retire_delivery_destination', p_id);
  if v_replay is not null then
    return;
  end if;
  -- non-enumerating: found only for an active member of the owning organization
  select d.* into v_destination from public.delivery_destinations d
  where d.id = p_id and public.is_org_member(d.organization_id)
  for update;
  if v_destination.id is null then
    raise exception 'destination_not_found';
  end if;
  perform public.commerce_assert_buyer_member(v_destination.organization_id);

  if v_destination.retired_at is null then
    update public.delivery_destinations set retired_at = clock_timestamp(), retired_by = auth.uid(), is_default = false
    where id = p_id;
  end if;
  -- orders are never touched: they read their frozen destination_snapshot (FR-006, AC-007)
  perform public.commerce_request_complete(p_request_id, jsonb_build_object('destination_id', p_id));
end;
$function$;
revoke all on function public.retire_delivery_destination(uuid, uuid) from public, anon, service_role;
grant execute on function public.retire_delivery_destination(uuid, uuid) to authenticated;

-- 4. Admin RPCs ------------------------------------------------------------------------------------------------------
create or replace function public.update_commerce_settings(p_validity_hours int, p_checkout_enabled boolean, p_proof_enabled boolean,
                                                           p_request_id uuid, p_pilot_organization_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_old public.commerce_settings%rowtype;
  v_new public.commerce_settings%rowtype;
  v_result jsonb;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'update_commerce_settings', null);
  if v_replay is not null then
    return v_replay;
  end if;
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;
  if p_validity_hours is not null and p_validity_hours not between 1 and 720 then
    raise exception 'invalid_validity_hours';
  end if;

  select * into v_old from public.commerce_settings where id for update;
  -- NULL = unchanged. Issued proformas froze their own deadline and are never altered (ROLLOUT-FLAGS).
  update public.commerce_settings set
    proforma_validity_hours = coalesce(p_validity_hours, proforma_validity_hours),
    bank_transfer_checkout_enabled = coalesce(p_checkout_enabled, bank_transfer_checkout_enabled),
    proof_submission_enabled = coalesce(p_proof_enabled, proof_submission_enabled),
    pilot_organization_ids = case when p_pilot_organization_ids is null then pilot_organization_ids
      else coalesce((select array_agg(distinct x order by x) from unnest(p_pilot_organization_ids) x where x is not null), '{}'::uuid[]) end,
    updated_by = auth.uid()
  where id
  returning * into v_new;

  v_result := jsonb_build_object('proforma_validity_hours', v_new.proforma_validity_hours,
    'bank_transfer_checkout_enabled', v_new.bank_transfer_checkout_enabled, 'proof_submission_enabled', v_new.proof_submission_enabled,
    'pilot_organization_ids', to_jsonb(v_new.pilot_organization_ids));
  -- no secret lives in these settings; the audit keeps old/new values, actor and correlation
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), 'commerce_settings', null, 'UPDATE',
    jsonb_build_object('proforma_validity_hours', v_old.proforma_validity_hours, 'bank_transfer_checkout_enabled', v_old.bank_transfer_checkout_enabled,
                       'proof_submission_enabled', v_old.proof_submission_enabled, 'pilot_organization_ids', to_jsonb(v_old.pilot_organization_ids)),
    v_result, jsonb_build_object('operation', 'update_commerce_settings', 'request_id', p_request_id), p_request_id);
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.update_commerce_settings(int, boolean, boolean, uuid, uuid[]) from public, anon, service_role;
grant execute on function public.update_commerce_settings(int, boolean, boolean, uuid, uuid[]) to authenticated;

create or replace function public.set_default_payment_account(p_account_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_account_id uuid;
  v_result jsonb;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'set_default_payment_account', p_account_id);
  if v_replay is not null then
    return v_replay;
  end if;
  -- platform admin + MFA (contract; owner decision A2). This definer RPC is the only path; no table grant changes.
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;

  select a.id into v_account_id from public.payment_accounts a
  where a.id = p_account_id and a.is_active and a.currency = 'USD'
  for update;
  if v_account_id is null then
    raise exception 'payment_account_not_found';
  end if;
  -- clear the previous default first (partial unique index uq_payment_account_default_currency)
  update public.payment_accounts set is_default_for_currency = false
  where currency = 'USD' and is_default_for_currency and id <> v_account_id;
  update public.payment_accounts set is_default_for_currency = true where id = v_account_id and not is_default_for_currency;

  -- identifiers only: no account name, number, IBAN or SWIFT is returned (the redacted trg_audit_payment_accounts audits)
  v_result := jsonb_build_object('payment_account_id', v_account_id, 'currency', 'USD');
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.set_default_payment_account(uuid, uuid) from public, anon, service_role;
grant execute on function public.set_default_payment_account(uuid, uuid) to authenticated;

create or replace function public.admin_convert_legacy_draft(p_order_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  v_replay jsonb;
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  v_replay := public.commerce_request_begin(p_request_id, 'admin_convert_legacy_draft', p_order_id);
  if v_replay is not null then
    return v_replay;
  end if;
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;
  if not public.mfa_satisfied() then
    raise exception 'mfa_step_up_required';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'order_not_found';
  end if;
  -- R-21: LEGACY + DRAFT + no non-CANCELLED shipment is the only convertible state; converts exactly once
  if v_order.commerce_flow <> 'LEGACY' or v_order.status <> 'DRAFT'
     or exists (select 1 from public.order_shipments s where s.order_id = p_order_id and s.status <> 'CANCELLED') then
    raise exception 'legacy_draft_not_convertible';
  end if;

  -- the M1 validate_order_transition() admits LEGACY → BANK_TRANSFER_V1 only as an internal DRAFT → DRAFT transition
  perform set_config('app.internal_transition', 'true', true);
  update public.orders set commerce_flow = 'BANK_TRANSFER_V1' where id = p_order_id;
  perform set_config('app.internal_transition', 'false', true);

  v_result := jsonb_build_object('order_id', p_order_id, 'commerce_flow', 'BANK_TRANSFER_V1');
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (auth.uid(), 'orders', p_order_id, 'CONVERT_LEGACY_DRAFT', jsonb_build_object('commerce_flow', 'LEGACY', 'status', 'DRAFT'),
          jsonb_build_object('commerce_flow', 'BANK_TRANSFER_V1', 'status', 'DRAFT'),
          jsonb_build_object('operation', 'admin_convert_legacy_draft', 'request_id', p_request_id), p_request_id);
  perform public.commerce_request_complete(p_request_id, v_result);
  return v_result;
end;
$function$;
revoke all on function public.admin_convert_legacy_draft(uuid, uuid) from public, anon, service_role;
grant execute on function public.admin_convert_legacy_draft(uuid, uuid) to authenticated;

-- 5. H1 — the new-order flow switch (analysis H1; T023 F1) -----------------------------------------------------------
-- SECURITY INVOKER on purpose: the decision is made on the INSERTING role (current_user), which a SECURITY DEFINER
-- function would replace by its owner. It assigns NEW fields only and reads no table.
create or replace function public.enforce_new_order_flow()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if current_user <> 'service_role' then
    new.commerce_flow := 'BANK_TRANSFER_V1';
    new.has_manual_adjustment := false;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancel_reason := null;
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_new_order_flow() from public, anon, authenticated, service_role;

create trigger trg_orders_enforce_new_order_flow before insert on public.orders
  for each row execute function public.enforce_new_order_flow();

alter table public.orders alter column commerce_flow set default 'BANK_TRANSFER_V1';

commit;
