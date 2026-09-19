-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 010 T027 / T029 / DB-OPEN-21 — every change to a platform configuration table is dated
-- (DB-owned `updated_at`) and attributable (actor recorded in `audit_logs`).
-- Human-approved decisions (Database hygiene RUN 1 / M1, 2026-09-20):
--   1. `payment_accounts` is audited with a REDACTED payload — full `account_number` / `iban` never
--      reach `audit_logs`.
--   2. `platform_admins` (primary key `user_id`, no `id` column) gets a SIBLING audit function keyed by
--      `user_id`; its primary key is NOT reshaped to suit `write_audit_log()`.
--   3. Scope is exactly these six tables. M2 (other `updated_at` hygiene) and M3 are NOT part of this file.
--   4. Delivered as a normal forward migration (CLI workflow: `supabase db push --linked`).
-- Rollback: supabase/rollback/20260920120000_feature_010_db_open_21_config_attribution.rollback.sql (paired; kept OUTSIDE
-- supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only, every row must be ok): supabase/maintenance/20260920_feature_010_db_open_21_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP (DB-OPEN-21, docs/architecture/DATABASE-CAPABILITY-MAP.md): `platform_admins`,
-- `commission_policies`, `commission_tiers`, `tax_rules`, `shipping_rules` and `payment_accounts` carry no
-- audit trigger and no `updated_by`. A role change, an operator deactivation, a tier/rule edit or a
-- bank-account edit therefore persisted no actor, so T027 ("changes are attributable") and T029 stayed
-- PARTIAL. Auditing was already solved once for 12 other tables: the AFTER trigger
-- `public.write_audit_log()` records `auth.uid()` as the actor, the old and new row and a correlation id in
-- `audit_logs` (readable under the existing `audit_admin_read` policy). This migration reuses it where it
-- is safe and adds two narrow siblings where it is not:
--
--   commission_policies, commission_tiers, tax_rules, shipping_rules
--       -> AFTER INSERT OR UPDATE OR DELETE ... write_audit_log()      (each has `id uuid`; existing function)
--   platform_admins
--       -> AFTER INSERT OR UPDATE OR DELETE ... write_audit_log_platform_admins()
--          `write_audit_log()` reads `new.id` / `old.id`; this table has NO `id` column, so attaching the
--          existing function would make EVERY grant, role change and deactivation raise
--          (`record "new" has no field "id"`). The sibling is identical except the record identity
--          (`audit_logs.entity_id`) is `user_id`.
--   payment_accounts
--       -> AFTER INSERT OR UPDATE OR DELETE ... write_audit_log_payment_accounts()
--          `write_audit_log()` copies `to_jsonb(row)`, i.e. the full `account_number` and `iban`, into
--          `audit_logs` for good. The sibling builds each payload from an explicit ALLOW-LIST
--          (a column added later is NOT copied automatically): id, account_name, bank_name, swift_code,
--          currency, is_active, created_by, created_at, updated_at, `account_number_last4`, `iban_last4`
--          (the last four characters only, prefixed `****`; a value shorter than eight characters is shown as
--          `****`, and NULL stays NULL) and, on UPDATE, booleans `account_number_changed` / `iban_changed` — so a change of
--          the number is still visible without storing any of it (a hash would be brute-forceable, so none
--          is kept). `audit_logs.metadata` states which fields were redacted.
--
-- `updated_at` (DB-OWNED, via the existing shared `public.set_updated_at()`):
--   * ADDED (timestamptz NOT NULL DEFAULT now()) to commission_policies, commission_tiers, tax_rules,
--     shipping_rules, payment_accounts. Existing rows are backfilled from `created_at` where the table has
--     it (commission_policies, payment_accounts). commission_tiers / tax_rules / shipping_rules have no
--     `created_at`, so their existing rows carry THIS MIGRATION'S TIME — "tracking starts here", not a
--     claim about when the row last changed. The backfill runs BEFORE the triggers exist, so it writes no
--     audit rows.
--   * `platform_admins.updated_at` already exists but was only ever set by application code
--     (`lib/admin/roles.ts`); it now gets the trigger, and the application stops setting it.
--   * BEFORE UPDATE FOR EACH ROW triggers `trg_<table>_updated_at` on all six tables.
--
-- NOT CHANGED (explicitly): every RLS policy, every grant, `write_audit_log()` and `set_updated_at()`
-- themselves, `audit_logs`, and every other table. No business or configuration row is modified (the only
-- UPDATE is the `updated_at` backfill of the five newly-added columns).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — refuse to change anything unless the live schema is exactly what this
--    migration was written against.
do $guard$
declare
  v_problems text := '';
  v_count int;
  v_table text;
  v_owner oid;
begin
  -- The six tables exist, and none of them has a user trigger yet.
  foreach v_table in array array['platform_admins', 'commission_policies', 'commission_tiers', 'tax_rules', 'shipping_rules', 'payment_accounts'] loop
    if to_regclass('public.' || v_table) is null then
      v_problems := v_problems || v_table || ' missing; ';
    else
      select count(*) into v_count from pg_trigger t where t.tgrelid = ('public.' || v_table)::regclass and not t.tgisinternal;
      if v_count <> 0 then
        v_problems := v_problems || v_table || ' already has ' || v_count || ' user trigger(s); ';
      end if;
    end if;
  end loop;

  -- Shared helpers this migration reuses must exist.
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('set_updated_at', 'write_audit_log');
  if v_count <> 2 then
    v_problems := v_problems || 'expected shared functions set_updated_at and write_audit_log, found ' || v_count || '; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('write_audit_log_platform_admins', 'write_audit_log_payment_accounts');
  if v_count <> 0 then
    v_problems := v_problems || 'a sibling audit function already exists; ';
  end if;

  -- `audit_logs` has the columns the audit functions write.
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'audit_logs'
    and column_name in ('actor_user_id', 'entity_type', 'entity_id', 'action', 'old_data', 'new_data', 'metadata', 'correlation_id');
  if v_count <> 8 then
    v_problems := v_problems || 'audit_logs: expected 8 audit columns, found ' || v_count || '; ';
  end if;

  -- The definer functions created below insert into `audit_logs` (RLS enabled, no INSERT policy): the
  -- role running this migration (which will own them) must own the table or hold BYPASSRLS.
  select relowner into v_owner from pg_class where oid = 'public.audit_logs'::regclass;
  if not (pg_has_role(current_user, v_owner, 'USAGE') or (select rolbypassrls from pg_roles where rolname = current_user)) then
    v_problems := v_problems || 'current_user (' || current_user || ') neither owns audit_logs nor bypasses RLS — the audit functions would be unable to insert; ';
  end if;

  -- platform_admins keeps its shape: PRIMARY KEY (user_id), NO id column, updated_at already present.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_admins' and column_name = 'id') then
    v_problems := v_problems || 'platform_admins unexpectedly has an id column; ';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'platform_admins' and column_name = 'updated_at' and data_type = 'timestamp with time zone') then
    v_problems := v_problems || 'platform_admins.updated_at missing; ';
  end if;

  -- The five tables get updated_at (must be absent) and have a uuid id (the existing audit function needs it).
  foreach v_table in array array['commission_policies', 'commission_tiers', 'tax_rules', 'shipping_rules', 'payment_accounts'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'updated_at') then
      v_problems := v_problems || v_table || '.updated_at already exists; ';
    end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'id' and udt_name = 'uuid') then
      v_problems := v_problems || v_table || ' has no uuid id column; ';
    end if;
  end loop;
  foreach v_table in array array['commission_policies', 'payment_accounts'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'created_at') then
      v_problems := v_problems || v_table || '.created_at missing (needed for the updated_at backfill); ';
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_accounts' and column_name = 'account_number' and udt_name = 'text')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_accounts' and column_name = 'iban' and udt_name = 'text') then
    v_problems := v_problems || 'payment_accounts.account_number / iban are not the expected text columns; ';
  end if;

  -- The six authorization policies are exactly the ones this migration promises not to touch.
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and (
       (tablename = 'platform_admins'     and policyname = 'platform_admins_admin'     and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
    or (tablename = 'commission_policies' and policyname = 'commission_admin'          and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
    or (tablename = 'commission_tiers'    and policyname = 'tiers_admin'               and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
    or (tablename = 'tax_rules'           and policyname = 'tax_admin'                 and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
    or (tablename = 'shipping_rules'      and policyname = 'shipping_admin'            and qual = 'is_super_admin()'    and with_check = 'is_super_admin()')
    or (tablename = 'payment_accounts'    and policyname = 'payment_accounts_admin'    and qual = 'is_platform_admin()' and with_check = 'is_super_admin()'));
  if v_count <> 6 then
    v_problems := v_problems || 'expected the six baseline configuration policies unchanged, found ' || v_count || '; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_010_db_open_21 preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. updated_at on the five tables that lack it (backfill BEFORE any trigger exists) ----------------
alter table public.commission_policies add column updated_at timestamptz;
alter table public.commission_tiers    add column updated_at timestamptz;
alter table public.tax_rules           add column updated_at timestamptz;
alter table public.shipping_rules      add column updated_at timestamptz;
alter table public.payment_accounts    add column updated_at timestamptz;

update public.commission_policies set updated_at = created_at;
update public.payment_accounts    set updated_at = created_at;
update public.commission_tiers    set updated_at = now();
update public.tax_rules           set updated_at = now();
update public.shipping_rules      set updated_at = now();

alter table public.commission_policies alter column updated_at set default now(), alter column updated_at set not null;
alter table public.commission_tiers    alter column updated_at set default now(), alter column updated_at set not null;
alter table public.tax_rules           alter column updated_at set default now(), alter column updated_at set not null;
alter table public.shipping_rules      alter column updated_at set default now(), alter column updated_at set not null;
alter table public.payment_accounts    alter column updated_at set default now(), alter column updated_at set not null;

-- 2. Sibling audit function: platform_admins (record identity = user_id) ---------------------------------
create or replace function public.write_audit_log_platform_admins()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_correlation_id uuid;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;

  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (
    auth.uid(),
    tg_table_name,
    case when tg_op = 'DELETE' then old.user_id else new.user_id end,
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    jsonb_build_object('identity_column', 'user_id'),
    coalesce(v_correlation_id, gen_random_uuid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- 3. Sibling audit function: payment_accounts (REDACTED payload, explicit allow-list) ------------------
create or replace function public.write_audit_log_payment_accounts()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_correlation_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  begin
    v_correlation_id := nullif(current_setting('app.correlation_id', true), '')::uuid;
  exception when others then
    v_correlation_id := null;
  end;

  -- Allow-list only: no full account number and no full IBAN is ever placed in a payload.
  if tg_op <> 'INSERT' then
    v_old := jsonb_build_object(
      'id', old.id,
      'account_name', old.account_name,
      'bank_name', old.bank_name,
      'swift_code', old.swift_code,
      'currency', old.currency,
      'is_active', old.is_active,
      'created_by', old.created_by,
      'created_at', old.created_at,
      'updated_at', old.updated_at,
      'account_number_last4', case when old.account_number is null then null when char_length(old.account_number) < 8 then '****' else '****' || right(old.account_number, 4) end,
      'iban_last4',           case when old.iban is null           then null when char_length(old.iban) < 8           then '****' else '****' || right(old.iban, 4) end
    );
  end if;
  if tg_op <> 'DELETE' then
    v_new := jsonb_build_object(
      'id', new.id,
      'account_name', new.account_name,
      'bank_name', new.bank_name,
      'swift_code', new.swift_code,
      'currency', new.currency,
      'is_active', new.is_active,
      'created_by', new.created_by,
      'created_at', new.created_at,
      'updated_at', new.updated_at,
      'account_number_last4', case when new.account_number is null then null when char_length(new.account_number) < 8 then '****' else '****' || right(new.account_number, 4) end,
      'iban_last4',           case when new.iban is null           then null when char_length(new.iban) < 8           then '****' else '****' || right(new.iban, 4) end
    );
    if tg_op = 'UPDATE' then
      v_new := v_new || jsonb_build_object(
        'account_number_changed', new.account_number is distinct from old.account_number,
        'iban_changed', new.iban is distinct from old.iban
      );
    end if;
  end if;

  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (
    auth.uid(),
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    v_old,
    v_new,
    jsonb_build_object('redacted_fields', jsonb_build_array('account_number', 'iban'), 'redaction', 'last4_only'),
    coalesce(v_correlation_id, gen_random_uuid())
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.write_audit_log_platform_admins() from public;
revoke all on function public.write_audit_log_platform_admins() from anon;
revoke all on function public.write_audit_log_platform_admins() from authenticated;
revoke all on function public.write_audit_log_payment_accounts() from public;
revoke all on function public.write_audit_log_payment_accounts() from anon;
revoke all on function public.write_audit_log_payment_accounts() from authenticated;

-- Ownership: these definer functions insert into `audit_logs` (RLS enabled, no INSERT policy), which works because the
-- function OWNER owns that table / bypasses RLS. When the migration is run by a login role that is a MEMBER of
-- `postgres` but not `postgres` itself (the Supabase CLI's temporary login role), pin the two new functions to
-- `postgres` — the owner of every other function in this schema — so they never depend on a short-lived role.
-- (No-op when run as `postgres`, e.g. from the SQL Editor.)
do $owner$
begin
  if current_user <> 'postgres' and pg_has_role(current_user, 'postgres', 'USAGE') then
    alter function public.write_audit_log_platform_admins() owner to postgres;
    alter function public.write_audit_log_payment_accounts() owner to postgres;
  end if;
end
$owner$;

comment on function public.write_audit_log_platform_admins() is
  'Feature 010 DB-OPEN-21: AFTER I/U/D audit trigger for platform_admins (identity = user_id; that table has no id column, so write_audit_log() cannot be used). Actor = auth.uid().';
comment on function public.write_audit_log_payment_accounts() is
  'Feature 010 DB-OPEN-21: AFTER I/U/D audit trigger for payment_accounts with an allow-listed, REDACTED payload (last four characters of account_number / iban only). Actor = auth.uid().';

-- 4. Triggers: DB-owned updated_at on all six; audit on all six ---------------------------------------------
create trigger trg_platform_admins_updated_at     before update on public.platform_admins     for each row execute function public.set_updated_at();
create trigger trg_commission_policies_updated_at before update on public.commission_policies for each row execute function public.set_updated_at();
create trigger trg_commission_tiers_updated_at    before update on public.commission_tiers    for each row execute function public.set_updated_at();
create trigger trg_tax_rules_updated_at           before update on public.tax_rules           for each row execute function public.set_updated_at();
create trigger trg_shipping_rules_updated_at      before update on public.shipping_rules      for each row execute function public.set_updated_at();
create trigger trg_payment_accounts_updated_at    before update on public.payment_accounts    for each row execute function public.set_updated_at();

create trigger trg_audit_platform_admins     after insert or update or delete on public.platform_admins     for each row execute function public.write_audit_log_platform_admins();
create trigger trg_audit_commission_policies after insert or update or delete on public.commission_policies for each row execute function public.write_audit_log();
create trigger trg_audit_commission_tiers    after insert or update or delete on public.commission_tiers    for each row execute function public.write_audit_log();
create trigger trg_audit_tax_rules           after insert or update or delete on public.tax_rules           for each row execute function public.write_audit_log();
create trigger trg_audit_shipping_rules      after insert or update or delete on public.shipping_rules      for each row execute function public.write_audit_log();
create trigger trg_audit_payment_accounts    after insert or update or delete on public.payment_accounts    for each row execute function public.write_audit_log_payment_accounts();

commit;
