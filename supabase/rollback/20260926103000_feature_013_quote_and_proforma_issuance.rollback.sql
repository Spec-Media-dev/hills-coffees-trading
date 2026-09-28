-- Feature 013 M4b rollback. Never run after a BANK_TRANSFER_V1 proforma or
-- destination snapshot exists: removing the redacted audit trigger then would
-- make the historical generic orders trigger copy private destination data.
-- H1/H2 authorization and financial-privacy hardening deliberately remain in place: reversing
-- them would restore an already-superseded replay leak and buyer settlement-data exposure.
begin;

do $guard$
begin
  if exists (select 1 from public.proforma_invoices where validity_hours_snapshot is not null)
     or exists (select 1 from public.orders where destination_snapshot is not null)
     or exists (select 1 from public.order_financials where proforma_id is not null) then
    raise exception 'feature_013_m4b_rollback_requires_no_issued_snapshots';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.orders'::regclass
                  and tgname = 'trg_audit_orders'
                  and tgfoid = 'public.write_audit_log_orders_redacted()'::regprocedure
                  and tgenabled = 'O') then
    raise exception 'feature_013_m4b_redacted_audit_missing';
  end if;
end;
$guard$;

drop function public.issue_proforma(uuid,uuid,text,uuid);
drop function public.estimate_cart(uuid,uuid,text);
drop function public.compute_order_quote(uuid,uuid,text);
drop trigger trg_audit_orders on public.orders;
drop function public.write_audit_log_orders_redacted();
create trigger trg_audit_orders
  after insert or update or delete on public.orders
  for each row execute function public.write_audit_log();
-- Restore the exact M3 policy (safe only because the guard above proves no issued bank snapshot exists).
drop policy proforma_bank_instructions_read on public.proforma_bank_instructions;
create policy proforma_bank_instructions_read on public.proforma_bank_instructions
  for select to authenticated
  using (exists (select 1 from public.proforma_invoices pi where pi.id = proforma_bank_instructions.proforma_id and public.is_order_buyer_member(pi.order_id))
         or public.is_finance_operator());

commit;
