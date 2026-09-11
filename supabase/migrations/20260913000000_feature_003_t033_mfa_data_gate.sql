-- Feature 003 — T033 remediation: MFA/AAL server-data boundary.
--
-- WHY THIS MIGRATION EXISTS: Phase 8/9's own live verification (`tests/auth/session.test.ts`)
-- proved, against the real database, that an authenticated session which has enrolled a verified
-- TOTP factor but has NOT yet completed its `aal2` step-up can still read `profiles`/`organizations`/
-- other protected tables directly — grepping every RLS policy and function in the live schema
-- report for `aal`/`mfa`/`assurance` returned zero matches. `sign-in/actions.ts`'s existing
-- redirect to `/mfa/` is a routing nudge, not a data-layer boundary, and this run's own Next.js
-- application-layer guard (`lib/auth/dal.ts#resolveMfaStepUpRequired`, `dashboard/layout.tsx`,
-- `dashboard-admin/layout.tsx`, and the Feature 003 mutation Server Actions) is real but is NOT a
-- substitute for RLS: any authenticated caller who constructs their own request against this
-- project's public REST endpoint with their own valid JWT bypasses the Next.js application entirely,
-- and RLS is therefore the only boundary that can genuinely enforce this for such a caller.
--
-- POLICY THIS ENFORCES (not invented here — Supabase's own documented AAL semantics, already relied
-- on by `sign-in/actions.ts`/`admin/sign-in/actions.ts`/`(auth)/mfa/page.tsx`): a session is
-- "challenge-required" only when the caller has at least one VERIFIED MFA factor AND this session's
-- own JWT has not reached `aal2`. An account with no enrolled factor at all is NEVER gated by this —
-- `mfa_satisfied()` returns `true` unconditionally for it. This is not a new "everyone must use MFA"
-- product rule; it is the existing, narrow, already-relied-upon contract, now enforced at the one
-- place a browser-held JWT cannot route around.
--
-- ARCHITECTURE: one small, reusable SECURITY DEFINER helper (`public.mfa_satisfied()`), new
-- RESTRICTIVE policies on protected Feature 003 data (including the private Storage object rows),
-- and MFA-checking wrappers around every browser-callable Feature 003 SECURITY DEFINER RPC. The
-- wrappers are necessary because a table owner's SECURITY DEFINER function can bypass RLS; an
-- application guard plus table policy alone would therefore leave a direct RPC mutation bypass.
-- A RESTRICTIVE policy is ANDed with every PERMISSIVE policy
-- Postgres already evaluates for a table — this migration touches, redefines, drops or weakens NONE
-- of the existing permissive policies (`profiles_select_own`, `profiles_update_own`,
-- `organizations_member_select`, `organizations_member_update`, `organizations_admin_all`,
-- `members_own_org`, `members_admin_write`, `kyb_own_or_admin`, `kyb_member_insert`, `kyb_admin_all`,
-- `kyb_documents_own_or_admin`, `kyb_documents_member_select`, `catalog_admin_files`,
-- `agreement_read`, `agreement_accept`) and requires none of their SQL text to be known or
-- reproduced. It also does not touch, replace, or weaken `public.organization_can_buy(uuid)`,
-- `public.organization_can_sell(uuid)`, or `public.is_authorized_member()` — this is a session
-- ASSURANCE-LEVEL gate, layered ON TOP of that existing, unmodified authorization truth, never a
-- rewrite of it.
--
-- HARD CONSTRAINTS CARRIED OVER UNMODIFIED (unchanged by this migration):
--   public.organization_can_buy(uuid), public.organization_can_sell(uuid), public.is_authorized_member()
-- No historical migration file is edited. This is one new additive file. No `service_role` runtime
-- workaround is introduced; `service_role` already bypasses RLS entirely and needs no grant here.
-- `authenticated` receives EXECUTE on the helper and the original public RPC names only; the
-- renamed implementation functions have no browser-callable grants. No PUBLIC/anonymous grant.

begin;

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select
    case
      -- The helper is not an authentication substitute. Its policies target `authenticated`, but
      -- fail closed if it is ever called without a user-bearing JWT. The service role remains
      -- usable by approved maintenance/fixture tooling and already bypasses RLS independently.
      when auth.role() = 'service_role' then true
      when auth.uid() is null then false
      -- No verified factor at all: this account has never opted into MFA, so it is never gated.
      when not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      ) then true
      -- A verified factor exists: the CURRENT session's own JWT must already reflect aal2. `auth.jwt()`
      -- reads the per-request `request.jwt.claims` GUC Supabase's own PostgREST layer sets from the
      -- caller's presented JWT — the same request-scoped mechanism `auth.uid()` already relies on
      -- throughout this schema, unaffected by this function's own SECURITY DEFINER ownership.
      else coalesce((auth.jwt() ->> 'aal') = 'aal2', false)
    end;
$$;

revoke all on function public.mfa_satisfied() from public;
grant execute on function public.mfa_satisfied() to authenticated;

comment on function public.mfa_satisfied() is
  'Feature 003 T033 remediation. True when the caller has no verified MFA factor, or when one exists '
  'and this session has already reached aal2. Used by the mfa_gate_* RESTRICTIVE RLS policies and '
  'the protected Feature 003 RPC wrappers — never a replacement for organization_can_buy/sell or '
  'is_authorized_member.';

-- ============================================================================
-- SECURITY DEFINER RPC wrappers.
--
-- Each existing implementation is renamed in-place (preserving its exact body, owner and OID),
-- stripped of every non-owner EXECUTE grant, and exposed again under its original API name through
-- a fixed-search-path wrapper that checks the request-scoped MFA state first. This avoids copying
-- or subtly changing the already-live authorization/state-machine implementation. The rollback
-- drops the wrappers and renames these exact implementations back.
-- ============================================================================

alter function public.update_my_profile(text, text, text, text)
  rename to t033_internal_update_my_profile;
revoke all on function public.t033_internal_update_my_profile(text, text, text, text)
  from public, anon, authenticated, service_role;
create function public.update_my_profile(
  p_full_name text default null,
  p_phone text default null,
  p_company_name text default null,
  p_avatar_path text default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  perform public.t033_internal_update_my_profile(p_full_name, p_phone, p_company_name, p_avatar_path);
end; $$;
revoke all on function public.update_my_profile(text, text, text, text) from public, anon;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated, service_role;

alter function public.update_organization_contact(uuid, text, text, text)
  rename to t033_internal_update_organization_contact;
revoke all on function public.t033_internal_update_organization_contact(uuid, text, text, text)
  from public, anon, authenticated, service_role;
create function public.update_organization_contact(
  p_organization_id uuid,
  p_display_name text default null,
  p_email text default null,
  p_phone text default null
)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  perform public.t033_internal_update_organization_contact(p_organization_id, p_display_name, p_email, p_phone);
end; $$;
revoke all on function public.update_organization_contact(uuid, text, text, text) from public, anon;
grant execute on function public.update_organization_contact(uuid, text, text, text) to authenticated, service_role;

alter function public.start_organization_onboarding(text, text, text, text, text, text, text, text)
  rename to t033_internal_start_organization_onboarding;
revoke all on function public.t033_internal_start_organization_onboarding(text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
create function public.start_organization_onboarding(
  p_legal_name text,
  p_display_name text,
  p_account_type text,
  p_country_code text default null,
  p_tax_number text default null,
  p_registration_number text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  return public.t033_internal_start_organization_onboarding(
    p_legal_name, p_display_name, p_account_type, p_country_code, p_tax_number,
    p_registration_number, p_email, p_phone
  );
end; $$;
revoke all on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) to authenticated, service_role;

alter function public.create_kyb_draft(uuid) rename to t033_internal_create_kyb_draft;
revoke all on function public.t033_internal_create_kyb_draft(uuid) from public, anon, authenticated, service_role;
create function public.create_kyb_draft(p_organization_id uuid)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  return public.t033_internal_create_kyb_draft(p_organization_id);
end; $$;
revoke all on function public.create_kyb_draft(uuid) from public, anon;
grant execute on function public.create_kyb_draft(uuid) to authenticated, service_role;

alter function public.update_kyb_draft(uuid, text, text) rename to t033_internal_update_kyb_draft;
revoke all on function public.t033_internal_update_kyb_draft(uuid, text, text) from public, anon, authenticated, service_role;
create function public.update_kyb_draft(p_application_id uuid, p_registered_address text, p_business_activity text)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  perform public.t033_internal_update_kyb_draft(p_application_id, p_registered_address, p_business_activity);
end; $$;
revoke all on function public.update_kyb_draft(uuid, text, text) from public, anon;
grant execute on function public.update_kyb_draft(uuid, text, text) to authenticated, service_role;

alter function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid)
  rename to t033_internal_attach_kyb_document;
revoke all on function public.t033_internal_attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid)
  from public, anon, authenticated, service_role;
create function public.attach_kyb_document(
  p_application_id uuid,
  p_document_type text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expires_at date default null,
  p_supersedes_document_id uuid default null
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  return public.t033_internal_attach_kyb_document(
    p_application_id, p_document_type, p_object_path, p_original_name, p_mime_type,
    p_size_bytes, p_expires_at, p_supersedes_document_id
  );
end; $$;
revoke all on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) from public, anon;
grant execute on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) to authenticated, service_role;

alter function public.submit_kyb_application(uuid) rename to t033_internal_submit_kyb_application;
revoke all on function public.t033_internal_submit_kyb_application(uuid) from public, anon, authenticated, service_role;
create function public.submit_kyb_application(p_application_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  perform public.t033_internal_submit_kyb_application(p_application_id);
end; $$;
revoke all on function public.submit_kyb_application(uuid) from public, anon;
grant execute on function public.submit_kyb_application(uuid) to authenticated, service_role;

alter function public.resubmit_kyb_application(uuid) rename to t033_internal_resubmit_kyb_application;
revoke all on function public.t033_internal_resubmit_kyb_application(uuid) from public, anon, authenticated, service_role;
create function public.resubmit_kyb_application(p_application_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  perform public.t033_internal_resubmit_kyb_application(p_application_id);
end; $$;
revoke all on function public.resubmit_kyb_application(uuid) from public, anon;
grant execute on function public.resubmit_kyb_application(uuid) to authenticated, service_role;

alter function public.create_kyb_review(uuid, uuid, text, text) rename to t033_internal_create_kyb_review;
revoke all on function public.t033_internal_create_kyb_review(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
create function public.create_kyb_review(
  p_application_id uuid,
  p_document_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  return public.t033_internal_create_kyb_review(p_application_id, p_document_id, p_decision, p_reason);
end; $$;
revoke all on function public.create_kyb_review(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_kyb_review(uuid, uuid, text, text) to authenticated, service_role;

alter function public.list_kyb_document_reviews(uuid) rename to t033_internal_list_kyb_document_reviews;
revoke all on function public.t033_internal_list_kyb_document_reviews(uuid)
  from public, anon, authenticated, service_role;
create function public.list_kyb_document_reviews(p_application_id uuid)
returns table (
  document_id uuid,
  decision text,
  reason text,
  reviewed_at timestamptz,
  reviewer_label text
)
language plpgsql stable security definer
set search_path = pg_catalog, public, auth
as $$ begin
  if not public.mfa_satisfied() then raise exception 'mfa_step_up_required' using errcode = '42501'; end if;
  return query select * from public.t033_internal_list_kyb_document_reviews(p_application_id);
end; $$;
revoke all on function public.list_kyb_document_reviews(uuid) from public, anon;
grant execute on function public.list_kyb_document_reviews(uuid) to authenticated, service_role;

-- ============================================================================
-- RESTRICTIVE policies — additive only, ANDed with the existing permissive policies above.
-- ============================================================================

drop policy if exists mfa_gate_profiles on public.profiles;
create policy mfa_gate_profiles on public.profiles
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

drop policy if exists mfa_gate_organizations on public.organizations;
create policy mfa_gate_organizations on public.organizations
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

drop policy if exists mfa_gate_organization_members on public.organization_members;
create policy mfa_gate_organization_members on public.organization_members
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

drop policy if exists mfa_gate_kyb_applications on public.kyb_applications;
create policy mfa_gate_kyb_applications on public.kyb_applications
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

drop policy if exists mfa_gate_kyb_documents on public.kyb_documents;
create policy mfa_gate_kyb_documents on public.kyb_documents
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

drop policy if exists mfa_gate_file_assets on public.file_assets;
create policy mfa_gate_file_assets on public.file_assets
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

-- `agreement_acceptances` is a live-only table (confirmed absent from every checked-in migration and
-- from `supabase/trading_schema.sql` — a pre-existing reconciliation gap this migration does not
-- attempt to fix, since guessing its full DDL is exactly what "do not guess" forbids). Its existing
-- `agreement_read`/`agreement_accept` policies are read from the live schema report, not reproduced
-- or altered here; only a new restrictive policy is added, by name, against the table as it already
-- exists live.
drop policy if exists mfa_gate_agreement_acceptances on public.agreement_acceptances;
create policy mfa_gate_agreement_acceptances on public.agreement_acceptances
  as restrictive
  for all
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

-- Compliance/admin review data is part of the same Feature 003 protected boundary. The first two
-- tables are read directly by operators; account status history is visible to members/operators.
drop policy if exists mfa_gate_kyb_review_items on public.kyb_review_items;
create policy mfa_gate_kyb_review_items on public.kyb_review_items
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

drop policy if exists mfa_gate_kyb_reviews on public.kyb_reviews;
create policy mfa_gate_kyb_reviews on public.kyb_reviews
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

drop policy if exists mfa_gate_account_status_history on public.account_status_history;
create policy mfa_gate_account_status_history on public.account_status_history
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

-- The document bytes are protected data too. Without this policy, the existing Storage policy's
-- SECURITY DEFINER helper could authorize an aal1 download even while metadata tables were gated.
-- The non-KYB branch makes this policy neutral for every other bucket.
drop policy if exists mfa_gate_kyb_evidence on storage.objects;
create policy mfa_gate_kyb_evidence on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'kyb-evidence' or public.mfa_satisfied())
  with check (bucket_id <> 'kyb-evidence' or public.mfa_satisfied());

commit;
