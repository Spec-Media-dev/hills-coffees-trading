-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Rollback for supabase/migrations/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.sql
-- Paired; safe to execute in the Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists trg_proforma_invoices_updated_at on public.proforma_invoices;
alter table if exists public.proforma_invoices drop column if exists updated_at;

commit;
