-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 20260919130000_feature_010_db_open_22_compliance_organization_read.sql
-- Restores `organizations_member_select` to its baseline USING and removes the compliance update
-- guard. No data is touched. (After rollback DB-OPEN-22 is open again: a pure COMPLIANCE operator
-- can neither read nor update organizations.)
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'organizations' and policyname = 'organizations_member_select'
      and qual = '(is_org_member(id) OR is_platform_admin() OR is_compliance_operator())'
  ) then
    raise exception 'feature_010_db_open_22 rollback refused — organizations_member_select is not the migrated definition; nothing changed';
  end if;
end
$guard$;

alter policy organizations_member_select
  on public.organizations
  using (public.is_org_member(id) or public.is_platform_admin());

drop trigger if exists trg_organizations_compliance_guard on public.organizations;
drop function if exists public.guard_organization_compliance_update();

commit;
