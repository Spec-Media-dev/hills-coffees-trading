-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Database hygiene RUN M2 — `updated_at` consistency for genuinely MUTABLE tables.
-- Rollback: supabase/rollback/20260920140000_database_hygiene_updated_at.rollback.sql (paired; kept OUTSIDE
-- supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only, every row must be ok): supabase/maintenance/20260920_database_hygiene_updated_at_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS DOES (and nothing else): for each of the 13 confirmed mutable tables below it makes sure the row
-- carries `updated_at timestamptz NOT NULL DEFAULT now()` and attaches the EXISTING shared BEFORE UPDATE trigger
-- function `public.set_updated_at()` (trigger `trg_<table>_updated_at`), so the DATABASE — not application code,
-- not "nothing" — owns the value. It adds no `updated_by`, no audit trigger, and changes no business logic, RLS
-- policy, grant, enum or status. `created_at` is never touched.
--
--   A. mutable, column MISSING  (column added, then the trigger)                    9 tables
--        kyb_documents        status/expiry move through the KYB document lifecycle (DB functions + triggers)
--        order_items          DRAFT quantity edits (update_order_item_quantity) and order-time snapshots
--        coffee_media         sort_order / is_primary edited by the catalogue console
--        warehouse_locations  code / name edited by the catalogue console
--        coffee_types, coffee_varieties, processing_methods, packaging_types, tags
--                             taxonomy entries edited by the catalogue console (updateTaxonomyEntry)
--   B. mutable, column PRESENT but nothing maintains it  (trigger only)             4 tables
--        origins, regions, warehouses   edited by the console, yet `updated_at` stayed at its insert time
--        offer_sensory_notes            sellers may edit their listing's sensory notes (policy offer_details_owner_or_admin)
--
-- EXISTING VALUES: a table that already has `updated_at` (group B) keeps every value untouched. A table that gets the
-- column (group A) is backfilled WITHOUT running any UPDATE (an UPDATE would fire the tables' own triggers — e.g.
-- kyb_documents' audit trigger and order_items' validate_order_item_offer): the column is added as a STORED generated
-- copy of `created_at` and then converted to an ordinary column (`DROP EXPRESSION`), so existing rows carry their
-- `created_at` — a LOWER BOUND ("tracking starts here"; a document already reviewed before this migration still shows
-- its creation time, not its review time). `warehouse_locations` has no `created_at`, so its existing rows carry THIS
-- MIGRATION'S TIME.
--
-- EXPLICITLY EXCLUDED (never receive `updated_at`; unchanged by this file):
--   append-only history / audit / event tables — audit_logs, account_status_history, listing_status_history,
--   order_status_history, dispute_status_history, inventory_ownership_events, kyb_reviews, kyb_review_items,
--   listing_reviews, payment_reviews, payment_events, dispute_evidence, support_messages, notifications;
--   immutable records — agreement_acceptances, file_assets, payment_proofs, tax_invoices, proforma_invoices,
--   proforma_invoice_items, order_financials, price_observations, coffee_certifications, coffee_documents,
--   offer_documents, coffee_translations, origin_translations, coffee_tags, offer_tags, inventory_reservation_items;
--   ambiguous / decision needed (left untouched, M3): inventory_reservations, storage_allocations, shipment_items,
--   payouts, notification_preferences, notification_deliveries, organization_members, disputes (its `updated_at` is
--   already owned by transition_dispute() and guarded by Feature 012's trigger).
--
-- SELF-CHECKING: the guard below refuses unless every table is in its expected pre-state, and records fingerprints
-- (all RLS policies, all grants, user-trigger and audit-trigger counts, every M2 row, the excluded tables' columns).
-- A final check inside the same transaction raises — rolling everything back — unless those fingerprints are exactly
-- unchanged apart from the 13 new triggers and the 9 new columns.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard + fingerprints -------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
  v_count int;
  v_table text;
  v_fp text := '';
  v_one text;
  v_a text[] := array['kyb_documents', 'order_items', 'coffee_media', 'warehouse_locations', 'coffee_types', 'coffee_varieties', 'processing_methods', 'packaging_types', 'tags'];
  v_b text[] := array['origins', 'regions', 'warehouses', 'offer_sensory_notes'];
  v_excluded text[] := array[
    'audit_logs', 'account_status_history', 'listing_status_history', 'order_status_history', 'dispute_status_history',
    'inventory_ownership_events', 'kyb_reviews', 'kyb_review_items', 'listing_reviews', 'payment_reviews', 'payment_events',
    'dispute_evidence', 'support_messages', 'notifications', 'agreement_acceptances', 'file_assets', 'payment_proofs',
    'tax_invoices', 'proforma_invoices', 'proforma_invoice_items', 'order_financials', 'price_observations',
    'coffee_certifications', 'coffee_documents', 'offer_documents', 'coffee_translations', 'origin_translations',
    'coffee_tags', 'offer_tags', 'inventory_reservation_items'];
begin
  -- the shared trigger function this migration reuses
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'set_updated_at' and p.prosrc ~ 'new\.updated_at\s*=\s*now\(\)';
  if v_count <> 1 then
    v_problems := v_problems || 'public.set_updated_at() missing or not the expected definition; ';
  end if;

  foreach v_table in array v_a || v_b loop
    if to_regclass('public.' || v_table) is null then
      v_problems := v_problems || v_table || ' missing; ';
      continue;
    end if;
    select count(*) into v_count from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = ('public.' || v_table)::regclass and not t.tgisinternal and p.proname = 'set_updated_at';
    if v_count <> 0 then
      v_problems := v_problems || v_table || ' already has a set_updated_at trigger; ';
    end if;
    select count(*) into v_count from pg_trigger t where t.tgrelid = ('public.' || v_table)::regclass and t.tgname = 'trg_' || v_table || '_updated_at';
    if v_count <> 0 then
      v_problems := v_problems || 'trg_' || v_table || '_updated_at already exists; ';
    end if;
  end loop;

  -- group A: updated_at must be ABSENT; created_at must exist wherever the backfill copies it
  foreach v_table in array v_a loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'updated_at') then
      v_problems := v_problems || v_table || '.updated_at already exists; ';
    end if;
    if v_table <> 'warehouse_locations' and not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'created_at'
        and data_type = 'timestamp with time zone' and is_nullable = 'NO') then
      v_problems := v_problems || v_table || '.created_at (timestamptz NOT NULL) missing; ';
    end if;
  end loop;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'warehouse_locations' and column_name = 'created_at') then
    v_problems := v_problems || 'warehouse_locations unexpectedly has created_at; ';
  end if;

  -- group B: updated_at must already be timestamptz NOT NULL DEFAULT now()
  foreach v_table in array v_b loop
    if not exists (
      select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'updated_at'
        and data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default = 'now()') then
      v_problems := v_problems || v_table || '.updated_at is not timestamptz NOT NULL DEFAULT now(); ';
    end if;
  end loop;

  -- excluded (append-only / immutable / ambiguous) tables must not already be maintained by set_updated_at
  foreach v_table in array v_excluded loop
    if to_regclass('public.' || v_table) is not null then
      select count(*) into v_count from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = ('public.' || v_table)::regclass and not t.tgisinternal and p.proname = 'set_updated_at';
      if v_count <> 0 then
        v_problems := v_problems || 'excluded table ' || v_table || ' has a set_updated_at trigger; ';
      end if;
    end if;
  end loop;

  if v_problems <> '' then
    raise exception 'database_hygiene_updated_at preflight failed — nothing applied: %', v_problems;
  end if;

  -- fingerprints, taken BEFORE any change and re-checked at the end (transaction-local settings)
  perform set_config('app.m2_policies', (select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none') from pg_policies where schemaname = 'public'), true);
  perform set_config('app.m2_grants', (select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none') from information_schema.role_table_grants where table_schema = 'public'), true);
  perform set_config('app.m2_user_triggers', (select count(*)::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal), true);
  perform set_config('app.m2_audit_triggers', (select count(*)::text from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal and p.proname like 'write_audit_log%'), true);
  perform set_config('app.m2_excluded_columns', (select coalesce(md5(string_agg(table_name || '|' || column_name || '|' || data_type, E'\n' order by table_name, column_name)), 'none') from information_schema.columns where table_schema = 'public' and table_name = any (v_excluded)), true);

  -- row fingerprints: group A ignores the (absent) updated_at; group B includes it (existing values must be preserved)
  foreach v_table in array v_a loop
    execute format('select coalesce(md5(string_agg((to_jsonb(t) - %L)::text, E''\n'' order by (to_jsonb(t) - %L)::text)), %L) from public.%I t', 'updated_at', 'updated_at', 'empty', v_table) into v_one;
    v_fp := v_fp || v_table || '=' || v_one || ';';
  end loop;
  foreach v_table in array v_b loop
    execute format('select coalesce(md5(string_agg(to_jsonb(t)::text, E''\n'' order by to_jsonb(t)::text)), %L) from public.%I t', 'empty', v_table) into v_one;
    v_fp := v_fp || v_table || '=' || v_one || ';';
  end loop;
  perform set_config('app.m2_rows', md5(v_fp), true);
end
$guard$;

-- 1. Group A: add the column (existing rows keep created_at — no UPDATE, so no table trigger fires) ----------------
alter table public.kyb_documents        add column updated_at timestamptz generated always as (created_at) stored;
alter table public.order_items          add column updated_at timestamptz generated always as (created_at) stored;
alter table public.coffee_media         add column updated_at timestamptz generated always as (created_at) stored;
alter table public.coffee_types         add column updated_at timestamptz generated always as (created_at) stored;
alter table public.coffee_varieties     add column updated_at timestamptz generated always as (created_at) stored;
alter table public.processing_methods   add column updated_at timestamptz generated always as (created_at) stored;
alter table public.packaging_types      add column updated_at timestamptz generated always as (created_at) stored;
alter table public.tags                 add column updated_at timestamptz generated always as (created_at) stored;

alter table public.kyb_documents        alter column updated_at drop expression;
alter table public.order_items          alter column updated_at drop expression;
alter table public.coffee_media         alter column updated_at drop expression;
alter table public.coffee_types         alter column updated_at drop expression;
alter table public.coffee_varieties     alter column updated_at drop expression;
alter table public.processing_methods   alter column updated_at drop expression;
alter table public.packaging_types      alter column updated_at drop expression;
alter table public.tags                 alter column updated_at drop expression;

alter table public.kyb_documents        alter column updated_at set default now(), alter column updated_at set not null;
alter table public.order_items          alter column updated_at set default now(), alter column updated_at set not null;
alter table public.coffee_media         alter column updated_at set default now(), alter column updated_at set not null;
alter table public.coffee_types         alter column updated_at set default now(), alter column updated_at set not null;
alter table public.coffee_varieties     alter column updated_at set default now(), alter column updated_at set not null;
alter table public.processing_methods   alter column updated_at set default now(), alter column updated_at set not null;
alter table public.packaging_types      alter column updated_at set default now(), alter column updated_at set not null;
alter table public.tags                 alter column updated_at set default now(), alter column updated_at set not null;

-- warehouse_locations has no created_at: existing rows get THIS MIGRATION'S TIME ("tracking starts here").
alter table public.warehouse_locations  add column updated_at timestamptz not null default now();

-- 2. The DB-owned trigger on all thirteen tables (group B keeps its existing values; the trigger only acts on future UPDATEs) --
create trigger trg_kyb_documents_updated_at       before update on public.kyb_documents       for each row execute function public.set_updated_at();
create trigger trg_order_items_updated_at         before update on public.order_items         for each row execute function public.set_updated_at();
create trigger trg_coffee_media_updated_at        before update on public.coffee_media        for each row execute function public.set_updated_at();
create trigger trg_warehouse_locations_updated_at before update on public.warehouse_locations for each row execute function public.set_updated_at();
create trigger trg_coffee_types_updated_at        before update on public.coffee_types        for each row execute function public.set_updated_at();
create trigger trg_coffee_varieties_updated_at    before update on public.coffee_varieties    for each row execute function public.set_updated_at();
create trigger trg_processing_methods_updated_at  before update on public.processing_methods  for each row execute function public.set_updated_at();
create trigger trg_packaging_types_updated_at     before update on public.packaging_types     for each row execute function public.set_updated_at();
create trigger trg_tags_updated_at                before update on public.tags                for each row execute function public.set_updated_at();
create trigger trg_origins_updated_at             before update on public.origins             for each row execute function public.set_updated_at();
create trigger trg_regions_updated_at             before update on public.regions             for each row execute function public.set_updated_at();
create trigger trg_warehouses_updated_at          before update on public.warehouses          for each row execute function public.set_updated_at();
create trigger trg_offer_sensory_notes_updated_at before update on public.offer_sensory_notes for each row execute function public.set_updated_at();

-- 3. Self-check: nothing but the 13 triggers and 9 columns changed. Raising here rolls the WHOLE migration back. ------
do $verify$
declare
  v_problems text := '';
  v_table text;
  v_fp text := '';
  v_one text;
  v_count int;
  v_a text[] := array['kyb_documents', 'order_items', 'coffee_media', 'warehouse_locations', 'coffee_types', 'coffee_varieties', 'processing_methods', 'packaging_types', 'tags'];
  v_b text[] := array['origins', 'regions', 'warehouses', 'offer_sensory_notes'];
  v_excluded text[] := array[
    'audit_logs', 'account_status_history', 'listing_status_history', 'order_status_history', 'dispute_status_history',
    'inventory_ownership_events', 'kyb_reviews', 'kyb_review_items', 'listing_reviews', 'payment_reviews', 'payment_events',
    'dispute_evidence', 'support_messages', 'notifications', 'agreement_acceptances', 'file_assets', 'payment_proofs',
    'tax_invoices', 'proforma_invoices', 'proforma_invoice_items', 'order_financials', 'price_observations',
    'coffee_certifications', 'coffee_documents', 'offer_documents', 'coffee_translations', 'origin_translations',
    'coffee_tags', 'offer_tags', 'inventory_reservation_items'];
begin
  if (select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none') from pg_policies where schemaname = 'public') is distinct from current_setting('app.m2_policies') then
    v_problems := v_problems || 'an RLS policy changed; ';
  end if;
  if (select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none') from information_schema.role_table_grants where table_schema = 'public') is distinct from current_setting('app.m2_grants') then
    v_problems := v_problems || 'a grant changed; ';
  end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal) <> current_setting('app.m2_user_triggers')::int + 13 then
    v_problems := v_problems || 'the user-trigger count is not exactly +13; ';
  end if;
  if (select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal and p.proname like 'write_audit_log%') <> current_setting('app.m2_audit_triggers')::int then
    v_problems := v_problems || 'an audit trigger was added or removed; ';
  end if;
  if (select coalesce(md5(string_agg(table_name || '|' || column_name || '|' || data_type, E'\n' order by table_name, column_name)), 'none') from information_schema.columns where table_schema = 'public' and table_name = any (v_excluded)) is distinct from current_setting('app.m2_excluded_columns') then
    v_problems := v_problems || 'an excluded (append-only / immutable / ambiguous) table changed shape; ';
  end if;
  foreach v_table in array v_excluded loop
    if to_regclass('public.' || v_table) is not null then
      select count(*) into v_count from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = ('public.' || v_table)::regclass and not t.tgisinternal and p.proname = 'set_updated_at';
      if v_count <> 0 then v_problems := v_problems || 'excluded table ' || v_table || ' got a set_updated_at trigger; '; end if;
    end if;
  end loop;
  foreach v_table in array v_a || v_b loop
    select count(*) into v_count from pg_trigger t join pg_proc p on p.oid = t.tgfoid
    where t.tgrelid = ('public.' || v_table)::regclass and not t.tgisinternal and p.proname = 'set_updated_at' and t.tgname = 'trg_' || v_table || '_updated_at'
      and (t.tgtype & 2) = 2 and (t.tgtype & 16) = 16 and (t.tgtype & 1) = 1 and (t.tgtype & 4) = 0 and (t.tgtype & 8) = 0;
    if v_count <> 1 then v_problems := v_problems || v_table || ' lacks exactly one BEFORE UPDATE FOR EACH ROW set_updated_at trigger; '; end if;
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table and column_name = 'updated_at'
        and data_type = 'timestamp with time zone' and is_nullable = 'NO' and column_default = 'now()') then
      v_problems := v_problems || v_table || '.updated_at is not timestamptz NOT NULL DEFAULT now(); ';
    end if;
  end loop;
  foreach v_table in array v_a loop
    execute format('select coalesce(md5(string_agg((to_jsonb(t) - %L)::text, E''\n'' order by (to_jsonb(t) - %L)::text)), %L) from public.%I t', 'updated_at', 'updated_at', 'empty', v_table) into v_one;
    v_fp := v_fp || v_table || '=' || v_one || ';';
  end loop;
  foreach v_table in array v_b loop
    execute format('select coalesce(md5(string_agg(to_jsonb(t)::text, E''\n'' order by to_jsonb(t)::text)), %L) from public.%I t', 'empty', v_table) into v_one;
    v_fp := v_fp || v_table || '=' || v_one || ';';
  end loop;
  if md5(v_fp) is distinct from current_setting('app.m2_rows') then
    v_problems := v_problems || 'a row of an M2 table changed (or the count did; group B values must be preserved); ';
  end if;
  if v_problems <> '' then
    raise exception 'database_hygiene_updated_at self-check failed — everything rolled back: %', v_problems;
  end if;
end
$verify$;

commit;
