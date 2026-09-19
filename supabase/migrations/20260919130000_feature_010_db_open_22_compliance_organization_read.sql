-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Feature 010 T010 / DB-OPEN-22 — COMPLIANCE may read organizations; its (already existing) update
-- path is narrowed to exactly the approved compliance status operations.
-- Human-approved direction (Feature 010 RUN J, 2026-09-19): "SELECT + narrow guard".
-- Rollback: supabase/rollback/20260919130000_feature_010_db_open_22_compliance_organization_read.rollback.sql (paired; kept
-- OUTSIDE supabase/migrations/ so the Supabase CLI never treats it as a migration).
-- Apply: Supabase SQL Editor (repository convention — no CLI/DB URL in this environment), then run
-- supabase/maintenance/20260919_feature_010_db_open_22_postflight.sql (every row ok).
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP (DB-OPEN-22, docs/architecture/DATABASE-CAPABILITY-MAP.md): `organizations` is readable
-- only through `organizations_member_select` = `is_org_member(id) OR is_platform_admin()`. A pure
-- COMPLIANCE operator therefore cannot read an organization, and — because an UPDATE only reaches
-- rows its caller can SELECT — the existing `organizations_compliance_update` policy
-- (`is_platform_admin() OR is_compliance_operator()`) affects ZERO rows for that role (live-proven,
-- Feature 010 RUN B). Suspension/reinstatement (T010, SRS §3.1 "approvals and suspensions") and the
-- KYB decision follow-through cannot land for the COMPLIANCE role.
--
-- THIS MIGRATION (two parts, nothing else):
--   1. `organizations_member_select` USING gains `OR public.is_compliance_operator()` (roles and
--      command unchanged). Resulting read rule:
--        is_org_member(id) OR is_platform_admin() OR is_compliance_operator()
--      Anonymous, members of other organizations, WAREHOUSE, FINANCE and AUDITOR gain nothing
--      (`is_compliance_operator()` is true only for an active COMPLIANCE / ADMIN / SUPER_ADMIN row).
--   2. Making the rows readable would make `organizations_compliance_update` EFFECTIVE, and that
--      policy restricts no column and no status transition. The human decision was to narrow it to
--      what the console actually does, in the database: a BEFORE UPDATE trigger that, for a caller
--      who is a compliance operator but NOT a platform admin, refuses any change to a column other
--      than `status`, and any status change outside the approved compliance transitions:
--        PENDING_KYB  -> UNDER_REVIEW | ACTIVE | REJECTED   (KYB review start / decision follow-through)
--        UNDER_REVIEW -> ACTIVE | REJECTED                  (KYB decision follow-through)
--        ACTIVE       -> SUSPENDED                          (suspension, T010)
--        SUSPENDED    -> ACTIVE                             (reinstatement, T010 / KYB re-approval)
--      Platform admins (`organizations_admin_all`), the service role (no JWT) and members (no update
--      policy) are unaffected.
--
-- NOT CHANGED (explicitly): `organizations_compliance_update`, `organizations_admin_all`,
-- `mfa_gate_organizations`, every grant, `account_status_history` / `file_assets` policies, every
-- other table. No data is modified. The trigger writes nothing.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- 0. Preflight guard — refuse to change anything unless the live schema is exactly what this
--    migration was written against.
do $guard$
declare
  v_problems text := '';
  v_count int;
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_member_select'
      and cmd = 'SELECT' and roles = '{public}' and qual = '(is_org_member(id) OR is_platform_admin())'
  ) then
    v_problems := v_problems || 'organizations_member_select missing or not the baseline definition; ';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_compliance_update'
      and cmd = 'UPDATE' and qual = '(is_platform_admin() OR is_compliance_operator())' and with_check = '(is_platform_admin() OR is_compliance_operator())'
  ) then
    v_problems := v_problems || 'organizations_compliance_update missing or changed; ';
  end if;

  select count(*) into v_count from pg_policies where schemaname = 'public' and tablename = 'organizations';
  if v_count <> 4 then
    v_problems := v_problems || 'organizations: expected 4 policies (admin_all, compliance_update, member_select, mfa_gate), found ' || v_count || '; ';
  end if;

  select count(*) into v_count from pg_trigger t where t.tgrelid = 'public.organizations'::regclass and not t.tgisinternal and t.tgname = 'trg_organizations_compliance_guard';
  if v_count <> 0 then
    v_problems := v_problems || 'trg_organizations_compliance_guard already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_organization_compliance_update';
  if v_count <> 0 then
    v_problems := v_problems || 'guard_organization_compliance_update already exists; ';
  end if;

  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_org_member', 'is_platform_admin', 'is_compliance_operator');
  if v_count <> 3 then
    v_problems := v_problems || 'expected helpers is_org_member, is_platform_admin, is_compliance_operator, found ' || v_count || '; ';
  end if;

  if v_problems <> '' then
    raise exception 'feature_010_db_open_22 preflight failed — nothing applied: %', v_problems;
  end if;
end
$guard$;

-- 1. COMPLIANCE read path on organizations (roles/command unchanged) ----------------------------
alter policy organizations_member_select
  on public.organizations
  using (public.is_org_member(id) or public.is_platform_admin() or public.is_compliance_operator());

-- 2. Narrow the now-effective compliance update to the approved status operations ---------------
create or replace function public.guard_organization_compliance_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  -- Only a compliance operator who is NOT a platform admin is narrowed. Platform admins keep
  -- `organizations_admin_all`; the service role (no JWT) and definer maintenance are unaffected;
  -- members hold no UPDATE policy at all.
  if auth.uid() is null or public.is_platform_admin() or not public.is_compliance_operator() then
    return new;
  end if;

  -- No column other than `status` may change (`updated_at` is maintained by its own trigger).
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    raise exception 'organization_compliance_update_scope';
  end if;

  if new.status is distinct from old.status and not (
    (old.status = 'PENDING_KYB' and new.status in ('UNDER_REVIEW', 'ACTIVE', 'REJECTED'))
    or (old.status = 'UNDER_REVIEW' and new.status in ('ACTIVE', 'REJECTED'))
    or (old.status = 'ACTIVE' and new.status = 'SUSPENDED')
    or (old.status = 'SUSPENDED' and new.status = 'ACTIVE')
  ) then
    raise exception 'organization_compliance_transition_refused';
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_organization_compliance_update() from public;
revoke all on function public.guard_organization_compliance_update() from anon;
revoke all on function public.guard_organization_compliance_update() from authenticated;

comment on function public.guard_organization_compliance_update() is
  'Feature 010 T010 / DB-OPEN-22: for a compliance operator who is not a platform admin, an organizations UPDATE may change only status, and only along the approved compliance transitions (KYB follow-through, ACTIVE<->SUSPENDED). Writes nothing.';

create trigger trg_organizations_compliance_guard
  before update on public.organizations
  for each row execute function public.guard_organization_compliance_update();

commit;
