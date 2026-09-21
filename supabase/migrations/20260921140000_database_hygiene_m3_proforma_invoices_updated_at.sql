-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Database hygiene RUN M3 — `updated_at` consistency for proforma_invoices.
-- Rollback: supabase/rollback/20260921140000_database_hygiene_m3_proforma_invoices_updated_at.rollback.sql (paired; kept OUTSIDE
-- supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only, every row must be ok): supabase/maintenance/20260921_database_hygiene_m3_proforma_invoices_updated_at_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- SCOPE (and nothing else):
--   proforma_invoices was previously grouped under IMMUTABLE during M2, but is updated during
--   order settlement (admin_review_payment() sets status = 'PAID'). Under the project convention
--   (Constitution / M2), genuinely mutable workflow entities must carry a DB-owned
--   `updated_at timestamptz NOT NULL DEFAULT now()` maintained by the shared `set_updated_at()`
--   BEFORE UPDATE trigger (`trg_proforma_invoices_updated_at`).
--
--   Existing rows: backfilled WITHOUT running an UPDATE statement (to avoid trigger firings):
--   the column is added as a STORED generated copy of `issued_at` (the lower bound — "tracking starts here")
--   and then converted to an ordinary column (`DROP EXPRESSION`) with default `now()`.
--
--   No other table is changed. RLS, grants, and foreign keys are untouched.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard -----------------------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  -- 1. proforma_invoices must exist
  if to_regclass('public.proforma_invoices') is null then
    raise exception 'database_hygiene_m3 preflight failed: public.proforma_invoices missing';
  end if;

  -- 2. updated_at must be absent
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'updated_at'
  ) then
    v_problems := v_problems || 'proforma_invoices.updated_at already exists; ';
  end if;

  -- 3. issued_at must exist (timestamptz NOT NULL)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'issued_at'
      and data_type = 'timestamp with time zone' and is_nullable = 'NO'
  ) then
    v_problems := v_problems || 'proforma_invoices.issued_at missing or not timestamptz NOT NULL; ';
  end if;

  -- 4. public.set_updated_at() must exist
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_updated_at';
  if v_count <> 1 then
    v_problems := v_problems || 'public.set_updated_at() missing; ';
  end if;

  -- 5. trg_proforma_invoices_updated_at must not already exist
  select count(*) into v_count from pg_trigger t
  where t.tgrelid = 'public.proforma_invoices'::regclass and t.tgname = 'trg_proforma_invoices_updated_at';
  if v_count <> 0 then
    v_problems := v_problems || 'trg_proforma_invoices_updated_at already exists; ';
  end if;

  if v_problems <> '' then
    raise exception 'database_hygiene_m3 preflight failed — nothing applied: %', v_problems;
  end if;

  -- Fingerprints taken before migration
  perform set_config('app.m3_policies', (select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none') from pg_policies where schemaname = 'public'), true);
  perform set_config('app.m3_grants', (select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none') from information_schema.role_table_grants where table_schema = 'public'), true);
  perform set_config('app.m3_row_count', (select count(*)::text from public.proforma_invoices), true);
  perform set_config('app.m3_row_fp', (select coalesce(md5(string_agg((to_jsonb(t) - 'updated_at')::text, E'\n' order by id::text)), 'none') from public.proforma_invoices t), true);
  perform set_config('app.m3_user_triggers', (select count(*)::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal), true);
end
$guard$;

-- 1. Add column and backfill from issued_at without running an UPDATE statement -----------------------
alter table public.proforma_invoices add column updated_at timestamptz generated always as (issued_at) stored;
alter table public.proforma_invoices alter column updated_at drop expression;
alter table public.proforma_invoices alter column updated_at set default now(), alter column updated_at set not null;

-- 2. Attach set_updated_at BEFORE UPDATE trigger ------------------------------------------------------
create trigger trg_proforma_invoices_updated_at
  before update on public.proforma_invoices
  for each row execute function public.set_updated_at();

-- 3. In-transaction self-check ------------------------------------------------------------------------
do $check$
declare
  v_problems text := '';
  v_count int;
  v_fp text;
begin
  -- Column verification
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'proforma_invoices' and column_name = 'updated_at'
      and data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default = 'now()'
  ) then
    v_problems := v_problems || 'proforma_invoices.updated_at not timestamptz NOT NULL DEFAULT now(); ';
  end if;

  -- Trigger verification
  select count(*) into v_count from pg_trigger t join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.proforma_invoices'::regclass
    and t.tgname = 'trg_proforma_invoices_updated_at'
    and t.tgtype & 2 = 2 -- BEFORE
    and t.tgtype & 16 = 16 -- UPDATE
    and p.proname = 'set_updated_at'
    and not t.tgisinternal;
  if v_count <> 1 then
    v_problems := v_problems || 'trg_proforma_invoices_updated_at trigger not correctly attached; ';
  end if;

  -- Verify total triggers increased by exactly 1
  select count(*) into v_count from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal;
  if v_count <> current_setting('app.m3_user_triggers')::int + 1 then
    v_problems := v_problems || 'unexpected trigger count change; ';
  end if;

  -- Verify row count unchanged
  select count(*) into v_count from public.proforma_invoices;
  if v_count <> current_setting('app.m3_row_count')::int then
    v_problems := v_problems || 'proforma_invoices row count changed; ';
  end if;

  -- Verify row data unchanged (ignoring updated_at)
  select coalesce(md5(string_agg((to_jsonb(t) - 'updated_at')::text, E'\n' order by id::text)), 'none') into v_fp from public.proforma_invoices t;
  if v_fp <> current_setting('app.m3_row_fp') then
    v_problems := v_problems || 'proforma_invoices row contents mutated; ';
  end if;

  -- Verify policies and grants unchanged
  select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none') into v_fp from pg_policies where schemaname = 'public';
  if v_fp <> current_setting('app.m3_policies') then
    v_problems := v_problems || 'pg_policies changed; ';
  end if;

  select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none') into v_fp from information_schema.role_table_grants where table_schema = 'public';
  if v_fp <> current_setting('app.m3_grants') then
    v_problems := v_problems || 'role_table_grants changed; ';
  end if;

  if v_problems <> '' then
    raise exception 'database_hygiene_m3 post-verification failed: %', v_problems;
  end if;
end
$check$;

commit;
