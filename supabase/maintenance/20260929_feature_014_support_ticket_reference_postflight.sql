-- Postflight verification: 20260929_feature_014_support_ticket_reference_postflight.sql
-- Run after applying 20260929110000_feature_014_support_ticket_reference.sql
-- Checks ticket reference and message authorization invariants.

do $$
declare
  v_seq_exists boolean;
  v_fn_def text;
  v_trg_def text;
  v_idx_exists boolean;
  v_code_sample text;
begin
  -- 1. Check sequence exists
  select exists (
    select 1 from pg_sequences
    where schemaname = 'public' and sequencename = 'support_ticket_code_seq'
  ) into v_seq_exists;

  if not v_seq_exists then
    raise exception 'POSTFLIGHT FAILED: public.support_ticket_code_seq missing';
  end if;

  -- 2. Check next_support_ticket_code() exists and produces valid HLP format
  select public.next_support_ticket_code() into v_code_sample;
  if v_code_sample !~ '^HLP-[0-9]{8}-[0-9]{7}$' then
    raise exception 'POSTFLIGHT FAILED: next_support_ticket_code format invalid: %', v_code_sample;
  end if;

  -- 3. Check unique index on support_tickets(ticket_code)
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'support_tickets' and indexname = 'idx_support_tickets_ticket_code'
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
    select 1 from pg_trigger
    where tgname = 'trg_support_ticket_validate'
  ) then
    raise exception 'POSTFLIGHT FAILED: trg_support_ticket_validate trigger not attached';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_support_message_validate' and not tgisinternal
  ) then
    raise exception 'POSTFLIGHT FAILED: support message authorization trigger missing';
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
