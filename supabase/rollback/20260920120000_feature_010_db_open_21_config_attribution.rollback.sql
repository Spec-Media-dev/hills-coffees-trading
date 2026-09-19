-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260920120000_feature_010_db_open_21_config_attribution.sql
-- Removes the six updated_at triggers, the six audit triggers and the two sibling audit functions, and
-- drops the five `updated_at` columns the migration added. `platform_admins.updated_at` (which pre-dates
-- the migration) is left in place. NO audit row is deleted: `audit_logs` is append-only history, so every
-- row written while the migration was live stays. (After rollback DB-OPEN-21 is open again: configuration
-- changes persist no actor, and `updated_at` on platform_admins is application-set again.)
-- Not part of `supabase/migrations/` on purpose (the Supabase CLI would read it as a migration).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
  v_table text;
begin
  foreach v_table in array array['platform_admins', 'commission_policies', 'commission_tiers', 'tax_rules', 'shipping_rules', 'payment_accounts'] loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_table)::regclass and t.tgname = 'trg_' || v_table || '_updated_at' and not t.tgisinternal) then
      v_problems := v_problems || v_table || ' has no trg_' || v_table || '_updated_at; ';
    end if;
    if not exists (select 1 from pg_trigger t where t.tgrelid = ('public.' || v_table)::regclass and t.tgname = 'trg_audit_' || v_table and not t.tgisinternal) then
      v_problems := v_problems || v_table || ' has no trg_audit_' || v_table || '; ';
    end if;
  end loop;
  if v_problems <> '' then
    raise exception 'feature_010_db_open_21 rollback refused — the migrated shape is not in place; nothing changed: %', v_problems;
  end if;
end
$guard$;

drop trigger if exists trg_audit_platform_admins     on public.platform_admins;
drop trigger if exists trg_audit_commission_policies on public.commission_policies;
drop trigger if exists trg_audit_commission_tiers    on public.commission_tiers;
drop trigger if exists trg_audit_tax_rules           on public.tax_rules;
drop trigger if exists trg_audit_shipping_rules      on public.shipping_rules;
drop trigger if exists trg_audit_payment_accounts    on public.payment_accounts;

drop trigger if exists trg_platform_admins_updated_at     on public.platform_admins;
drop trigger if exists trg_commission_policies_updated_at on public.commission_policies;
drop trigger if exists trg_commission_tiers_updated_at    on public.commission_tiers;
drop trigger if exists trg_tax_rules_updated_at           on public.tax_rules;
drop trigger if exists trg_shipping_rules_updated_at      on public.shipping_rules;
drop trigger if exists trg_payment_accounts_updated_at    on public.payment_accounts;

drop function if exists public.write_audit_log_platform_admins();
drop function if exists public.write_audit_log_payment_accounts();

alter table public.commission_policies drop column if exists updated_at;
alter table public.commission_tiers    drop column if exists updated_at;
alter table public.tax_rules           drop column if exists updated_at;
alter table public.shipping_rules      drop column if exists updated_at;
alter table public.payment_accounts    drop column if exists updated_at;

commit;
