-- Migration: 20260929110000_feature_014_support_ticket_reference.sql
-- Feature 014: Human-readable Support Ticket Reference & Immutability Guards
-- Pattern: HLP-YYYYMMDD-XXXXXXX
-- Authoritative server/database generation, client spoofing protection, and immutability trigger

begin;

-- 1. Ensure support_ticket_code_seq exists
create sequence if not exists public.support_ticket_code_seq start with 1000 increment by 1;

-- 2. Hardened generator for support ticket codes with fixed search_path
create or replace function public.next_support_ticket_code()
returns text
language sql
security definer
set search_path = pg_catalog, public
as $$
  select 'HLP-' || to_char(clock_timestamp(), 'YYYYMMDD') || '-' || lpad(nextval('public.support_ticket_code_seq')::text, 7, '0');
$$;

-- 3. Ensure unique index on ticket_code
create unique index if not exists idx_support_tickets_ticket_code on public.support_tickets(ticket_code);

alter table public.support_messages add column if not exists is_staff_reply boolean not null default false;
alter table public.support_tickets add column if not exists first_response_at timestamptz;
alter table public.support_tickets add column if not exists resolved_at timestamptz;
alter table public.support_tickets add column if not exists closed_at timestamptz;

-- 4. Replaced and hardened validate_support_ticket() trigger function
create or replace function public.validate_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or public.is_blocked_user() then raise exception 'forbidden'; end if;
    new.requester_user_id := auth.uid();
    if new.requester_organization_id is null or not public.is_org_member(new.requester_organization_id) then
      raise exception 'ticket_organization_not_accessible';
    end if;
    new.status := 'OPEN';
    -- Authoritative server/database generation: override any supplied ticket_code
    new.ticket_code := public.next_support_ticket_code();

    if new.order_id is not null then
      if not public.can_view_order(new.order_id) and not public.is_platform_admin() then
        raise exception 'order_not_accessible';
      end if;
      select coalesce(new.requester_organization_id, o.buyer_organization_id), o.order_code
      into new.requester_organization_id, new.order_code_snapshot
      from public.orders o
      where o.id = new.order_id;
      if not found or not exists (
        select 1 from public.orders o where o.id = new.order_id
          and new.requester_organization_id in (o.buyer_organization_id, o.seller_organization_id)
      ) then raise exception 'order_not_accessible'; end if;
    else
      new.order_code_snapshot := null;
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    -- Immutability invariants
    if new.ticket_code is distinct from old.ticket_code then
      raise exception 'ticket_code_immutable';
    end if;

    if new.requester_user_id is distinct from old.requester_user_id then
      raise exception 'ticket_requester_user_immutable';
    end if;

    if new.requester_organization_id is distinct from old.requester_organization_id then
      raise exception 'ticket_requester_org_immutable';
    end if;

    if new.order_id is distinct from old.order_id then
      raise exception 'ticket_order_immutable';
    end if;

    new.updated_at := clock_timestamp();
    return new;
  end if;

  return new;
end;
$$;

-- 5. Ensure trigger is attached
drop trigger if exists trg_support_ticket_validate on public.support_tickets;
create trigger trg_support_ticket_validate
  before insert or update on public.support_tickets
  for each row execute function public.validate_support_ticket();

-- 6. Grants
revoke all on function public.next_support_ticket_code() from public, anon;
grant execute on function public.next_support_ticket_code() to authenticated, service_role;

-- Replace baseline requester-only visibility and message write policies.
drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets for insert to authenticated
with check (requester_user_id = auth.uid() and requester_organization_id is not null
  and public.is_org_member(requester_organization_id) and not public.is_blocked_user());

drop policy if exists tickets_view_own_or_admin on public.support_tickets;
create policy tickets_view_own_or_admin on public.support_tickets for select to authenticated
using (public.is_platform_admin() or
  (requester_organization_id is not null and public.is_org_member(requester_organization_id)));

drop policy if exists messages_ticket_access on public.support_messages;
create policy messages_ticket_access on public.support_messages for select to authenticated
using (exists (select 1 from public.support_tickets st where st.id = ticket_id
  and (public.is_platform_admin() or public.is_org_member(st.requester_organization_id))));

drop policy if exists messages_insert_access on public.support_messages;
create policy messages_insert_access on public.support_messages for insert to authenticated
with check (author_user_id = auth.uid() and exists (
  select 1 from public.support_tickets st where st.id = ticket_id and st.status <> 'CLOSED'
    and (public.is_platform_admin() or public.is_org_member(st.requester_organization_id))));

create or replace function public.validate_support_message()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_ticket public.support_tickets%rowtype;
begin
  if auth.uid() is null or public.is_blocked_user() then raise exception 'forbidden'; end if;
  select * into v_ticket from public.support_tickets where id = new.ticket_id for update;
  if not found or v_ticket.status = 'CLOSED' then raise exception 'ticket_unavailable'; end if;
  if not (public.is_platform_admin() or public.is_org_member(v_ticket.requester_organization_id)) then
    raise exception 'ticket_unavailable';
  end if;
  new.author_user_id := auth.uid();
  new.is_staff_reply := public.is_platform_admin();
  return new;
end;
$$;

drop trigger if exists trg_support_message_validate on public.support_messages;
create trigger trg_support_message_validate before insert on public.support_messages
for each row execute function public.validate_support_message();
revoke all on function public.validate_support_message() from public, anon, authenticated;

commit;
