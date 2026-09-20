-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 011 — DB-BLOCK-10 REMAINDER: scope the three `price_*_admin` policies to `authenticated`.
-- Rollback: supabase/rollback/20260920160000_feature_011_db_block_10_price_policy_scope.rollback.sql (paired; kept
-- OUTSIDE supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Postflight (read-only, every row must be ok): supabase/maintenance/20260920_feature_011_price_policy_scope_postflight.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY (identical failure mode to DB-BLOCK-10, migration 20260909000000 — verified live 2026-09-20 with the anonymous
-- key: `select` on price_sources / price_observations / price_differentials each aborts with
-- `42501 permission denied for function is_platform_admin`):
--
--   `public.is_platform_admin()` is granted EXECUTE to `authenticated` and `service_role` only — never `anon`. Each of
--   the three pricing tables carries a `price_*_admin` policy declared `FOR ALL TO public USING (is_platform_admin())`,
--   and `TO public` includes `anon`. PostgreSQL OR-s permissive policies and evaluates each applicable one; because
--   the sibling public-read predicate is not a literal `true` (`is_active AND licence_status = 'APPROVED'`,
--   `EXISTS (...)`, `is_active`), the admin branch IS evaluated for an anonymous caller, the EXECUTE ACL check fires,
--   and the whole statement aborts instead of the policy simply evaluating to false. Result: the anonymous
--   reference-price surface Feature 011 owns cannot read a single row.
--
-- WHAT THIS CHANGES — AND WHAT IT DELIBERATELY DOES NOT
--
--   Changes: the ROLE SCOPE of exactly three policies (`ALTER POLICY … TO authenticated`), nothing else.
--
--     price_sources_admin        ON public.price_sources
--     price_observations_admin   ON public.price_observations
--     price_differentials_admin  ON public.price_differentials
--
--   * A policy whose TO clause excludes the current role is never applied, so the helper is never invoked and an
--     anonymous read falls through to the `price_*_public_read` policy alone — exactly the intended boundary
--     (Feature 011 FR-002/SEC-003: approved + active sources, their observations, active differentials).
--   * The policy expressions are untouched: the admin policy still reads `FOR ALL USING (is_platform_admin())`, so
--     administrator INSERT / UPDATE / DELETE is preserved exactly and NO write capability is granted to anyone new.
--     `is_platform_admin()` can never return true for `anon` (auth.uid() is NULL), so the anonymous role was
--     granted precisely nothing by this policy before; narrowing its applicability removes only the error.
--   * Every platform admin is authenticated by definition, so `TO authenticated` covers the entire real admin
--     population.
--   * The three `price_*_public_read` policies are NOT touched — they keep doing the gating.
--   * No EXECUTE grant is added to `anon` (least privilege; keeps the approved "anon sensitive function execute" audit
--     check passing). No table grant, column, constraint, index, function, trigger or data is altered.
--   * `warehouses` is NOT touched. The DB-BLOCK-10 note lists it, but Feature 011 does not read it (Feature 002
--     deliberately never queries it either), so changing it here would be scope creep.
--   * Other price-domain policies do not exist (the tables carry exactly these six policies) — verified by the guard.
--
-- SELF-CHECKING: the guard refuses unless the three tables are in exactly the expected pre-state and records
-- fingerprints (every policy in the schema except the three role scopes, every grant, the anon EXECUTE ACL of
-- is_platform_admin()). A final check in the same transaction raises — rolling everything back — unless only those
-- three role scopes changed.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard + fingerprints ---------------------------------------------------------------------
do $guard$
declare
  v_problems text := '';
  v_count int;
  v_rec record;
  v_expected text[][] := array[
    ['price_sources', 'price_sources_admin', 'price_sources_public_read'],
    ['price_observations', 'price_observations_admin', 'price_observations_public_read'],
    ['price_differentials', 'price_differentials_admin', 'price_differentials_public_read']];
  v_i int;
begin
  -- the helper the admin policies call must be non-executable by anon (the very cause of the fault)
  if has_function_privilege('anon', 'public.is_platform_admin()', 'execute') then
    v_problems := v_problems || 'anon can EXECUTE is_platform_admin() (the cause this migration relies on is absent); ';
  end if;

  for v_i in 1 .. array_length(v_expected, 1) loop
    select count(*) into v_count from pg_policies
    where schemaname = 'public' and tablename = v_expected[v_i][1];
    if v_count <> 2 then
      v_problems := v_problems || v_expected[v_i][1] || ' has ' || v_count || ' policies, expected exactly 2; ';
    end if;

    select * into v_rec from pg_policies
    where schemaname = 'public' and tablename = v_expected[v_i][1] and policyname = v_expected[v_i][2];
    if not found then
      v_problems := v_problems || v_expected[v_i][2] || ' missing; ';
    elsif v_rec.cmd <> 'ALL' or v_rec.roles::text <> '{public}' or v_rec.qual is distinct from 'is_platform_admin()' or coalesce(v_rec.with_check, 'is_platform_admin()') <> 'is_platform_admin()' then
      v_problems := v_problems || v_expected[v_i][2] || ' is not the expected FOR ALL TO public USING (is_platform_admin()) [WITH CHECK is_platform_admin() or implicit]; ';
    end if;

    select * into v_rec from pg_policies
    where schemaname = 'public' and tablename = v_expected[v_i][1] and policyname = v_expected[v_i][3];
    if not found then
      v_problems := v_problems || v_expected[v_i][3] || ' missing; ';
    elsif v_rec.cmd <> 'SELECT' or v_rec.roles::text <> '{public}' then
      v_problems := v_problems || v_expected[v_i][3] || ' is not the expected SELECT TO public policy; ';
    end if;
  end loop;

  if v_problems <> '' then
    raise exception 'feature_011_price_policy_scope preflight failed — nothing applied: %', v_problems;
  end if;

  -- fingerprints, taken BEFORE any change and re-checked at the end (transaction-local settings). The three admin
  -- policies' ROLES are the one thing allowed to change, so they are blanked out of the policy fingerprint.
  perform set_config('app.f011_policies', (
    select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|'
      || case when policyname in ('price_sources_admin', 'price_observations_admin', 'price_differentials_admin') then '' else roles::text end
      || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none')
    from pg_policies where schemaname = 'public'), true);
  perform set_config('app.f011_grants', (
    select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none')
    from information_schema.role_table_grants where table_schema = 'public'), true);
  perform set_config('app.f011_function_acl', (
    select coalesce(md5(string_agg(p.proname || '|' || coalesce(p.proacl::text, ''), E'\n' order by p.proname, p.oid)), 'none')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'), true);
end
$guard$;

-- 1. The whole change: the role scope of the three administrator policies -----------------------------------
alter policy price_sources_admin       on public.price_sources       to authenticated;
alter policy price_observations_admin  on public.price_observations  to authenticated;
alter policy price_differentials_admin on public.price_differentials to authenticated;

-- 2. Self-check: nothing but those three role scopes changed. Raising here rolls the WHOLE migration back. --------
do $verify$
declare
  v_problems text := '';
  v_rec record;
  v_name text;
begin
  for v_name in select unnest(array['price_sources_admin', 'price_observations_admin', 'price_differentials_admin']) loop
    select * into v_rec from pg_policies where schemaname = 'public' and policyname = v_name;
    if not found then
      v_problems := v_problems || v_name || ' missing; ';
    elsif v_rec.roles::text <> '{authenticated}' or v_rec.cmd <> 'ALL' or v_rec.qual is distinct from 'is_platform_admin()' or coalesce(v_rec.with_check, 'is_platform_admin()') <> 'is_platform_admin()' then
      v_problems := v_problems || v_name || ' is not FOR ALL TO authenticated USING (is_platform_admin()) (its WITH CHECK is covered by the policy fingerprint); ';
    end if;
  end loop;

  for v_name in select unnest(array['price_sources_public_read', 'price_observations_public_read', 'price_differentials_public_read']) loop
    select * into v_rec from pg_policies where schemaname = 'public' and policyname = v_name;
    if not found or v_rec.cmd <> 'SELECT' or v_rec.roles::text <> '{public}' then
      v_problems := v_problems || v_name || ' changed or missing; ';
    end if;
  end loop;

  if (select coalesce(md5(string_agg(tablename || '|' || policyname || '|' || cmd || '|' || permissive || '|'
      || case when policyname in ('price_sources_admin', 'price_observations_admin', 'price_differentials_admin') then '' else roles::text end
      || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''), E'\n' order by tablename, policyname)), 'none')
      from pg_policies where schemaname = 'public') is distinct from current_setting('app.f011_policies') then
    v_problems := v_problems || 'a policy other than the three role scopes changed; ';
  end if;
  if (select coalesce(md5(string_agg(table_name || '|' || grantee || '|' || privilege_type || '|' || is_grantable, E'\n' order by table_name, grantee, privilege_type)), 'none')
      from information_schema.role_table_grants where table_schema = 'public') is distinct from current_setting('app.f011_grants') then
    v_problems := v_problems || 'a table grant changed; ';
  end if;
  if (select coalesce(md5(string_agg(p.proname || '|' || coalesce(p.proacl::text, ''), E'\n' order by p.proname, p.oid)), 'none')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') is distinct from current_setting('app.f011_function_acl') then
    v_problems := v_problems || 'a function EXECUTE ACL changed; ';
  end if;
  if has_function_privilege('anon', 'public.is_platform_admin()', 'execute') then
    v_problems := v_problems || 'anon gained EXECUTE on is_platform_admin(); ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_011_price_policy_scope self-check failed — everything rolled back: %', v_problems;
  end if;
end
$verify$;

commit;
