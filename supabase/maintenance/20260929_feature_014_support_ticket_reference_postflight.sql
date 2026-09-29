-- Postflight verification: 20260929_feature_014_support_ticket_reference_postflight.sql
-- Run after applying 20260929110000_feature_014_support_ticket_reference.sql
-- Checks ticket reference and message authorization invariants.

do $$
declare
  v_seq_exists boolean;
  v_fn_def text;
  v_trg_def text;
  v_idx_exists boolean;
begin
  -- 1. Check sequence exists
  select exists (
    select 1 from pg_sequences
    where schemaname = 'public' and sequencename = 'support_ticket_code_seq'
  ) into v_seq_exists;

  if not v_seq_exists then
    raise exception 'POSTFLIGHT FAILED: public.support_ticket_code_seq missing';
  end if;

  -- 2. Inspect the generator without advancing the production sequence.
  select pg_get_functiondef(p.oid) into v_fn_def from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'next_support_ticket_code';
  if v_fn_def is null or v_fn_def not like '%HLP-%'
     or v_fn_def not like '%nextval%'
     or v_fn_def not like '%lpad%' then
    raise exception 'POSTFLIGHT FAILED: next_support_ticket_code definition invalid';
  end if;
  if has_function_privilege('anon', 'public.next_support_ticket_code()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.next_support_ticket_code()', 'EXECUTE') then
    raise exception 'POSTFLIGHT FAILED: HLP generator callable by client roles';
  end if;

  -- 3. Check unique index on support_tickets(ticket_code)
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'support_tickets' and indexname = 'idx_support_tickets_ticket_code'
      and indexdef like 'CREATE UNIQUE INDEX%'
  ) into v_idx_exists;

  if not v_idx_exists then
    raise exception 'POSTFLIGHT FAILED: idx_support_tickets_ticket_code missing';
  end if;

  -- 4. Check trigger function has immutability checks
  select prosrc into v_trg_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'validate_support_ticket';

  if v_trg_def is null or v_trg_def !~ 'ticket_code_immutable' then
    raise exception 'POSTFLIGHT FAILED: validate_support_ticket does not contain ticket_code_immutable guard';
  end if;

  if v_trg_def !~ 'ticket_requester_user_immutable' or v_trg_def !~ 'ticket_requester_org_immutable' then
    raise exception 'POSTFLIGHT FAILED: validate_support_ticket does not contain requester immutability guard';
  end if;

  -- 5. Check trigger is attached to support_tickets
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'support_tickets'
      and t.tgname = 'trg_support_ticket_validate' and t.tgenabled <> 'D'
  ) then
    raise exception 'POSTFLIGHT FAILED: trg_support_ticket_validate trigger not attached';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'support_messages'
      and t.tgname = 'trg_support_message_validate' and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception 'POSTFLIGHT FAILED: support message authorization trigger missing';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_member_support_ticket'
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public, auth']
  ) then
    raise exception 'POSTFLIGHT FAILED: atomic member ticket RPC missing or unhardened';
  end if;
  if has_function_privilege('anon', 'public.create_member_support_ticket(text,text,text,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.create_member_support_ticket(text,text,text,uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.create_member_support_ticket(text,text,text,uuid,uuid)', 'EXECUTE') then
    raise exception 'POSTFLIGHT FAILED: member ticket RPC execution grants incorrect';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'support_messages' and column_name = 'is_staff_reply'
  ) then
    raise exception 'POSTFLIGHT FAILED: is_staff_reply column missing';
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'support_messages' and policyname = 'messages_insert_access'
      and with_check like '%status <>%CLOSED%'
  ) then
    raise exception 'POSTFLIGHT FAILED: closed ticket insert policy missing';
  end if;

  raise notice 'POSTFLIGHT SUCCESS: support ticket reference and message authorization checks passed';
end;
$$;
