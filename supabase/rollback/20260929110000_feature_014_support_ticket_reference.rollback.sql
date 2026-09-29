-- Rollback: 20260929110000_feature_014_support_ticket_reference.rollback.sql
-- Restores baseline validate_support_ticket() definition

drop trigger if exists trg_support_message_validate on public.support_messages;
drop function if exists public.validate_support_message();

drop policy if exists messages_insert_access on public.support_messages;
create policy messages_insert_access on public.support_messages for insert to public
with check ((author_user_id = auth.uid()) and exists (
  select 1 from public.support_tickets st where st.id = ticket_id
    and (public.is_platform_admin() or st.requester_user_id = auth.uid()
      or (st.requester_organization_id is not null and public.is_org_member(st.requester_organization_id)))));

drop policy if exists messages_ticket_access on public.support_messages;
create policy messages_ticket_access on public.support_messages for select to public
using (exists (select 1 from public.support_tickets st where st.id = ticket_id
  and (public.is_platform_admin() or st.requester_user_id = auth.uid()
    or (st.requester_organization_id is not null and public.is_org_member(st.requester_organization_id)))));

drop policy if exists tickets_view_own_or_admin on public.support_tickets;
create policy tickets_view_own_or_admin on public.support_tickets for select to public
using (public.is_platform_admin() or requester_user_id = auth.uid()
  or (requester_organization_id is not null and public.is_org_member(requester_organization_id)));

drop policy if exists tickets_insert_own on public.support_tickets;
create policy tickets_insert_own on public.support_tickets for insert to public
with check (requester_user_id = auth.uid() and not public.is_blocked_user());

-- Keep the new nullable columns and their data for a non-destructive rollback.

create or replace function public.validate_support_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.order_id is not null then
    if not public.can_view_order(new.order_id) and not public.is_platform_admin() then
      raise exception 'order_not_accessible';
    end if;
    select coalesce(new.requester_organization_id, o.buyer_organization_id), o.order_code
    into new.requester_organization_id, new.order_code_snapshot
    from public.orders o
    where o.id = new.order_id;
  end if;
  return new;
end;
$$;
