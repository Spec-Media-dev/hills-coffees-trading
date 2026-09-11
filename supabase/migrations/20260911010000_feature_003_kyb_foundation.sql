-- Feature 003 — RUN DB — KYB database + private Storage foundation (T010b-T010f).
--
-- ============================================================================
-- WHY
-- ============================================================================
--
-- DB-BLOCK-03: ordinary verified users cannot create an organization or attach themselves to one —
-- `organizations`/`organization_members` writes are platform-admin-only. DB-BLOCK-01: zero Supabase
-- Storage buckets/object policies exist, so KYB document bytes have nowhere to live. This migration
-- closes both gaps additively: one narrowly scoped controlled-onboarding capability, one private
-- Storage bucket with organization/application-scoped object policies, constrained KYB state-machine
-- mutations, and a minimum document-level review/version model. See
-- `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` for the full contract this file
-- implements.
--
-- REVISION (this file): a migration security review found several integrity/authorization gaps in
-- the first draft. This revision closes them — see the contract doc's "Revision" section for the
-- full list; each fix is also called out inline at its exact location below.
--
-- ============================================================================
-- WHAT THIS DOES NOT DO
-- ============================================================================
--
-- Does NOT modify, replace, or redefine `organization_can_buy`, `organization_can_sell`, or
-- `is_authorized_member` — their live audited bodies are untouched. Does NOT transition any
-- organization to ACTIVE or any KYB application to APPROVED — those remain exclusively reachable
-- through the existing, unchanged Compliance/Admin RLS. Does NOT edit any historical migration file.
-- Does NOT enable Realtime on anything. Is NOT applied to production by this migration file's mere
-- existence — DB-BLOCK-01/03 remain OPEN until a human reviews and applies this file and live
-- behaviour is verified (T010g).
--
-- ============================================================================
-- SECTION 1 — CONTROLLED ORGANIZATION ONBOARDING (closes DB-BLOCK-03)
-- ============================================================================

create or replace function public.start_organization_onboarding(
  p_legal_name text,
  p_display_name text,
  p_account_type text,
  p_country_code text default null,
  p_tax_number text default null,
  p_registration_number text default null,
  p_email text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_can_buy boolean;
  v_can_sell boolean;
  v_new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  ) then
    raise exception 'email_not_verified';
  end if;

  if p_account_type not in ('BUYER', 'SELLER') then
    raise exception 'invalid_account_type';
  end if;

  if p_legal_name is null or length(trim(p_legal_name)) = 0 then
    raise exception 'legal_name_required';
  end if;

  if p_country_code is not null and length(p_country_code) <> 2 then
    raise exception 'invalid_country_code';
  end if;

  -- Serialize concurrent calls from the SAME caller so a double-submit cannot race past the
  -- existing-membership check below and create two organizations for one user.
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  -- REVIEW FIX #7 (multi-org onboarding): an earlier draft ranked the caller's memberships and
  -- returned the top one, implicitly picking "the first" organization for a multi-org user — exactly
  -- the acting-organization anti-pattern T002's resolver exists to prevent. This function now only
  -- ever asks EXISTS: it never names, ranks, or picks any specific organization. A caller who already
  -- has ANY active membership is refused onboarding outright; which organization(s) are relevant is
  -- entirely the existing acting-organization resolver's job (`lib/auth/dal.ts`), never this RPC's.
  if exists (
    select 1 from public.organization_members om
    where om.user_id = auth.uid()
      and om.is_active = true
  ) then
    return jsonb_build_object('ok', false, 'conflict', 'already_member');
  end if;

  -- Server-owned capability derivation. BUYER = buy-only; SELLER = buy AND sell (never sell-only).
  -- Neither flag alone grants trading — organization_can_buy/sell also require ACTIVE + APPROVED KYB.
  if p_account_type = 'SELLER' then
    v_can_buy := true;
    v_can_sell := true;
  else
    v_can_buy := true;
    v_can_sell := false;
  end if;

  begin
    insert into public.organizations (
      legal_name, display_name, account_type, country_code, tax_number, registration_number,
      email, phone, status, is_hills_internal, created_by, can_buy, can_sell
    )
    values (
      trim(p_legal_name), p_display_name, p_account_type, p_country_code, p_tax_number,
      p_registration_number, p_email, p_phone, 'PENDING_KYB', false, auth.uid(), v_can_buy, v_can_sell
    )
    returning id into v_new_org_id;
  exception
    when unique_violation then
      raise exception 'tax_number_already_registered';
  end;

  insert into public.organization_members (organization_id, user_id, member_role, is_active)
  values (v_new_org_id, auth.uid(), 'OWNER', true);

  return jsonb_build_object(
    'ok', true,
    'organization_id', v_new_org_id,
    'organization_status', 'PENDING_KYB'
  );
end;
$$;

revoke all on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) from public;
grant execute on function public.start_organization_onboarding(text, text, text, text, text, text, text, text) to authenticated, service_role;

-- ============================================================================
-- SECTION 2 — CONSTRAINED KYB STATE-MACHINE MUTATIONS
-- ============================================================================

-- REVIEW FIX #6 (create_kyb_draft concurrency): the authoritative duplicate-open-application
-- guarantee is a PRE-EXISTING partial unique index on `kyb_applications(organization_id)`, scoped to
-- the four "open" statuses (DRAFT/SUBMITTED/UNDER_REVIEW/RESUBMISSION_REQUIRED) — confirmed present
-- in the current checked-in baseline, `supabase/trading_schema.sql` (search there for
-- "one open kyb application" to find its exact `create unique index` statement). This migration does
-- not (and must not) recreate that index — it already exists. What this function adds
-- on top is (a) an advisory lock so concurrent callers for the SAME organization usually never even
-- reach the index, and (b) a graceful catch of the `unique_violation` the index still guarantees if
-- two transactions somehow race past the lock (e.g. a lock-acquisition-order edge case) — instead of
-- surfacing a raw constraint error, the loser simply re-reads and returns the winner's row. The
-- index is the correctness guarantee; the lock and exception handler are UX, not the security
-- boundary.
create or replace function public.create_kyb_draft(p_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_application_id uuid;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));

  select id into v_application_id
  from public.kyb_applications
  where organization_id = p_organization_id
    and status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED')
  order by created_at desc
  limit 1;

  if v_application_id is not null then
    return v_application_id;
  end if;

  begin
    insert into public.kyb_applications (organization_id, submitted_by, status)
    values (p_organization_id, auth.uid(), 'DRAFT')
    returning id into v_application_id;
  exception
    when unique_violation then
      select id into v_application_id
      from public.kyb_applications
      where organization_id = p_organization_id
        and status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RESUBMISSION_REQUIRED')
      order by created_at desc
      limit 1;
  end;

  return v_application_id;
end;
$$;

revoke all on function public.create_kyb_draft(uuid) from public;
grant execute on function public.create_kyb_draft(uuid) to authenticated, service_role;

-- Shared transition guard used by submit/resubmit below. Not exposed to callers directly.
create or replace function public.transition_kyb_application(
  p_application_id uuid,
  p_allowed_source_states text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
  v_status text;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id, status into v_organization_id, v_status
  from public.kyb_applications
  where id = p_application_id
  for update;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if not (v_status = any (p_allowed_source_states)) then
    raise exception 'invalid_transition';
  end if;

  update public.kyb_applications
  set status = 'SUBMITTED',
      submitted_by = auth.uid(),
      submitted_at = now()
  where id = p_application_id;
end;
$$;

revoke all on function public.transition_kyb_application(uuid, text[]) from public;
-- Internal helper only — no EXECUTE grant to authenticated/anon. Callable solely by the two
-- SECURITY DEFINER wrappers below, which run as the same trusted function owner.

create or replace function public.submit_kyb_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  perform public.transition_kyb_application(p_application_id, array['DRAFT']);
end;
$$;

revoke all on function public.submit_kyb_application(uuid) from public;
grant execute on function public.submit_kyb_application(uuid) to authenticated, service_role;

-- REVIEW FIX #5 (safe resubmission): a resubmit must not silently return an application to review
-- while a current, non-superseded document is still REJECTED — that would resubmit evidence the
-- member never actually corrected. This is a state-transition safety check only (are there any
-- unresolved REJECTED documents right now?), not an invented Phase-4 completeness rule: it reads
-- only `kyb_documents.status`, a column this same migration adds, never a not-yet-existing
-- application-content field.
create or replace function public.resubmit_kyb_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id into v_organization_id
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if exists (
    select 1 from public.kyb_documents
    where application_id = p_application_id
      and status = 'REJECTED'
  ) then
    raise exception 'unresolved_rejected_document';
  end if;

  perform public.transition_kyb_application(p_application_id, array['RESUBMISSION_REQUIRED']);
end;
$$;

revoke all on function public.resubmit_kyb_application(uuid) from public;
grant execute on function public.resubmit_kyb_application(uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 3 — DOCUMENT-LEVEL REVIEW + VERSION MODEL (schema additions, T010f)
-- ============================================================================

alter table public.kyb_documents add column if not exists version integer not null default 1;
alter table public.kyb_documents add column if not exists supersedes_document_id uuid references public.kyb_documents(id);
alter table public.kyb_documents add column if not exists status text not null default 'PENDING'
  check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'));

-- REVIEW FIX #2 (replacement branching): at most ONE document may ever supersede a given prior
-- document — this is what makes "the" lineage of a document a straight line rather than a tree.
create unique index if not exists uq_kyb_documents_supersedes_document_id
  on public.kyb_documents (supersedes_document_id)
  where supersedes_document_id is not null;

create table if not exists public.kyb_review_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.kyb_applications(id) on delete cascade,
  document_id uuid not null references public.kyb_documents(id) on delete cascade,
  decision text not null check (decision in ('ACCEPTED', 'REJECTED')),
  reason text,
  reviewer_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists ix_kyb_review_items_application on public.kyb_review_items (application_id);
create index if not exists ix_kyb_review_items_document on public.kyb_review_items (document_id);

-- REVIEW FIX #2 (document version/replacement integrity): now also enforces that a replacement
-- shares the SAME document_type as the document it supersedes (a passport scan may only ever be
-- superseded by another passport scan, never re-typed into a different evidence category).
create or replace function public.validate_kyb_document_lineage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_prev_application_id uuid;
  v_prev_version integer;
  v_prev_status text;
  v_prev_document_type text;
begin
  if new.supersedes_document_id is not null then
    if new.supersedes_document_id = new.id then
      raise exception 'self_replacement_not_allowed';
    end if;

    select application_id, version, status, document_type
    into v_prev_application_id, v_prev_version, v_prev_status, v_prev_document_type
    from public.kyb_documents
    where id = new.supersedes_document_id;

    if v_prev_application_id is null then
      raise exception 'superseded_document_not_found';
    end if;

    if v_prev_application_id <> new.application_id then
      raise exception 'cross_application_document_replacement';
    end if;

    if v_prev_document_type <> new.document_type then
      raise exception 'cross_document_type_replacement';
    end if;

    if new.version <> v_prev_version + 1 then
      raise exception 'invalid_document_version';
    end if;

    if v_prev_status <> 'SUPERSEDED' then
      update public.kyb_documents
      set status = 'SUPERSEDED'
      where id = new.supersedes_document_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_kyb_document_lineage on public.kyb_documents;
create trigger trg_validate_kyb_document_lineage
  before insert on public.kyb_documents
  for each row execute function public.validate_kyb_document_lineage();

-- REVIEW FIX #2 (no direct-write bypass): there is deliberately NO "before update" counterpart to
-- the lineage trigger above, because after this revision there is no RLS-granted direct UPDATE path
-- to `kyb_documents` for anyone at all (see the dropped `kyb_documents_admin_write` policy below) —
-- every write is either this trigger's own INSERT-time validation, or the status-only UPDATE
-- performed by `apply_kyb_review_item_decision()`, which runs as this migration's own SECURITY
-- DEFINER trigger function and touches only the `status` column. Removing the direct-write policy
-- is the chosen fix over adding a second trigger: less code, and it also closes finding #3 (no
-- destructive admin ALL policy) in the same stroke.

create or replace function public.validate_review_item_document()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not exists (
    select 1 from public.kyb_documents kd
    where kd.id = new.document_id
      and kd.application_id = new.application_id
  ) then
    raise exception 'review_item_document_application_mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_review_item_document on public.kyb_review_items;
create trigger trg_validate_review_item_document
  before insert on public.kyb_review_items
  for each row execute function public.validate_review_item_document();

create or replace function public.apply_kyb_review_item_decision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  update public.kyb_documents
  set status = new.decision
  where id = new.document_id
    and status <> 'SUPERSEDED';

  return new;
end;
$$;

drop trigger if exists trg_apply_kyb_review_item_decision on public.kyb_review_items;
create trigger trg_apply_kyb_review_item_decision
  after insert on public.kyb_review_items
  for each row execute function public.apply_kyb_review_item_decision();

-- REVIEW FIX #1 (immutable/trusted document reviews): `kyb_review_items` is an append-only ledger,
-- the same shape as this schema's existing `inventory_ownership_events` (guarded by the existing
-- `prevent_ownership_event_mutation()` trigger). No runtime caller — not even a Compliance
-- operator — may UPDATE or DELETE a historical review event.
create or replace function public.prevent_kyb_review_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  raise exception 'kyb_review_items_is_append_only';
end;
$$;

drop trigger if exists trg_prevent_kyb_review_item_mutation on public.kyb_review_items;
create trigger trg_prevent_kyb_review_item_mutation
  before update or delete on public.kyb_review_items
  for each row execute function public.prevent_kyb_review_item_mutation();

-- Extend the existing append-only audit mechanism to the two places this run adds meaningful
-- mutable/reviewable state. No new audit mechanism is invented.
drop trigger if exists trg_audit_kyb_documents on public.kyb_documents;
create trigger trg_audit_kyb_documents
  after insert or delete or update on public.kyb_documents
  for each row execute function public.write_audit_log();

drop trigger if exists trg_audit_kyb_review_items on public.kyb_review_items;
create trigger trg_audit_kyb_review_items
  after insert or delete or update on public.kyb_review_items
  for each row execute function public.write_audit_log();

alter table public.kyb_review_items enable row level security;

-- REVIEW FIX #1: the base table's policy is now SELECT-only (read-only) for Compliance/Admin — it
-- is no longer `FOR ALL`. There is no RLS-granted INSERT path at all; every review event is created
-- exclusively through `create_kyb_review(...)` below, which derives `reviewer_user_id`/`created_at`
-- itself and never accepts them as caller input.
drop policy if exists kyb_review_items_compliance on public.kyb_review_items;
create policy kyb_review_items_compliance_select on public.kyb_review_items
  for select to authenticated
  using (public.is_compliance_operator() or public.is_platform_admin());

-- REVIEW FIX #1: the trusted review-creation RPC. Requires `is_compliance_operator()`; accepts only
-- application/document/decision/reason; requires a `reason` for REJECTED; verifies the document
-- belongs to the application (also enforced by the trigger above — checked here too for a clean
-- error instead of relying solely on the trigger's exception text); derives `reviewer_user_id` and
-- `created_at` itself. The AFTER INSERT trigger already in this file
-- (`apply_kyb_review_item_decision`) then updates the document's status through the same trusted
-- path used everywhere else in this migration.
create or replace function public.create_kyb_review(
  p_application_id uuid,
  p_document_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_review_id uuid;
begin
  if auth.uid() is null then
    raise exception 'forbidden';
  end if;

  if not public.is_compliance_operator() then
    raise exception 'forbidden';
  end if;

  if p_decision not in ('ACCEPTED', 'REJECTED') then
    raise exception 'invalid_decision';
  end if;

  if p_decision = 'REJECTED' and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'reason_required_for_rejection';
  end if;

  if not exists (
    select 1 from public.kyb_documents kd
    where kd.id = p_document_id
      and kd.application_id = p_application_id
  ) then
    raise exception 'review_item_document_application_mismatch';
  end if;

  insert into public.kyb_review_items (application_id, document_id, decision, reason, reviewer_user_id)
  values (p_application_id, p_document_id, p_decision, p_reason, auth.uid())
  returning id into v_review_id;

  return v_review_id;
end;
$$;

revoke all on function public.create_kyb_review(uuid, uuid, text, text) from public;
grant execute on function public.create_kyb_review(uuid, uuid, text, text) to authenticated, service_role;

-- REVIEW FIX #1/#2/#3 (no direct-write bypass, no destructive admin policy): `kyb_documents` keeps
-- ONLY the SELECT policy below. The old `kyb_documents_own_or_admin` (member ALL) and this
-- revision's own earlier `kyb_documents_admin_write` (compliance/admin ALL) are both gone — there is
-- no RLS-granted UPDATE/DELETE path to `kyb_documents` for anyone. Compliance/Admin read through
-- this same SELECT policy; their only write path is `create_kyb_review`, which touches
-- `kyb_review_items` (never `kyb_documents` directly) and lets the existing trigger apply the
-- resulting status change.
drop policy if exists kyb_documents_own_or_admin on public.kyb_documents;
drop policy if exists kyb_documents_admin_write on public.kyb_documents;

drop policy if exists kyb_documents_member_select on public.kyb_documents;
create policy kyb_documents_member_select on public.kyb_documents
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_compliance_operator()
    or exists (
      select 1 from public.kyb_applications ka
      where ka.id = kyb_documents.application_id
        and public.is_org_member(ka.organization_id)
    )
  );

-- Member-facing review read, with reviewer identity replaced by a fixed label (spec SEC-007).
create or replace function public.list_kyb_document_reviews(p_application_id uuid)
returns table (
  document_id uuid,
  decision text,
  reason text,
  reviewed_at timestamptz,
  reviewer_label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  return query
    select
      kri.document_id,
      kri.decision,
      kri.reason,
      kri.created_at as reviewed_at,
      'Hills Compliance'::text as reviewer_label
    from public.kyb_review_items kri
    where kri.application_id = p_application_id
    order by kri.created_at desc;
end;
$$;

revoke all on function public.list_kyb_document_reviews(uuid) from public;
grant execute on function public.list_kyb_document_reviews(uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 4 — STORAGE + METADATA WRITE SEAM (closes DB-BLOCK-01)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kyb-evidence',
  'kyb-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- REVIEW FIX #8 (blocked admin/member storage behaviour): the blocked-user check now runs BEFORE
-- the admin/compliance short-circuit. Previously a blocked identity that also happened to hold a
-- `platform_admins` row would have bypassed the block entirely through the first branch; this
-- ordering makes `is_blocked_user()` an unconditional gate for every caller, matching the pattern
-- every other blocked-aware function in this schema already uses (`is_authorized_member`,
-- `update_my_profile`, `update_organization_contact`, `submit_payment_proof` all check
-- `is_blocked_user()` unconditionally, never after a role short-circuit).
create or replace function public.kyb_storage_object_authorized(
  p_object_name text,
  p_require_editable boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_parts text[];
  v_org_id uuid;
  v_application_id uuid;
  v_app_status text;
  v_app_org_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if public.is_blocked_user() then
    return false;
  end if;

  if public.is_platform_admin() or public.is_compliance_operator() then
    return true;
  end if;

  v_parts := string_to_array(p_object_name, '/');

  if array_length(v_parts, 1) is null
     or array_length(v_parts, 1) < 4
     or v_parts[1] <> 'org'
     or v_parts[3] <> 'application' then
    return false;
  end if;

  begin
    v_org_id := v_parts[2]::uuid;
    v_application_id := v_parts[4]::uuid;
  exception
    when others then
      return false;
  end;

  select organization_id, status into v_app_org_id, v_app_status
  from public.kyb_applications
  where id = v_application_id;

  if v_app_org_id is null or v_app_org_id <> v_org_id then
    return false;
  end if;

  if not public.is_org_member(v_org_id) then
    return false;
  end if;

  if p_require_editable and v_app_status not in ('DRAFT', 'RESUBMISSION_REQUIRED') then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.kyb_storage_object_authorized(text, boolean) from public;
grant execute on function public.kyb_storage_object_authorized(text, boolean) to authenticated, service_role;

drop policy if exists kyb_evidence_member_select on storage.objects;
create policy kyb_evidence_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kyb-evidence'
    and public.kyb_storage_object_authorized(name, false)
  );

drop policy if exists kyb_evidence_member_insert on storage.objects;
create policy kyb_evidence_member_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kyb-evidence'
    and public.kyb_storage_object_authorized(name, true)
  );

-- REVIEW FIX #3 (no destructive evidence admin policy): the previous `kyb_evidence_admin_all`
-- (`FOR ALL`, including UPDATE/DELETE) is REMOVED, not merely narrowed. It is not replaced with an
-- admin-specific SELECT policy either, because `kyb_evidence_member_select` above already grants
-- Compliance/Admin read access to every object in this bucket regardless of path shape — the
-- `kyb_storage_object_authorized(..)` helper it calls returns `true` for
-- `is_platform_admin()`/`is_compliance_operator()` unconditionally (once past the blocked-user
-- check), before any path parsing. No object created only through `attach_kyb_document` (the sole
-- writer) can ever fall outside that read grant. There is now no RLS-granted UPDATE/DELETE path to
-- `kyb-evidence` objects for anyone, staff included: evidence is retained, never destructively
-- overwritten or removed, and any future approved retention/redaction deletion capability (KYB-02)
-- must be its own narrow, audited RPC — not a blanket policy.
drop policy if exists kyb_evidence_admin_all on storage.objects;

create or replace function public.attach_kyb_document(
  p_application_id uuid,
  p_document_type text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expires_at date default null,
  p_supersedes_document_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_organization_id uuid;
  v_status text;
  v_expected_prefix text;
  v_new_version integer;
  v_prev_application_id uuid;
  v_prev_document_type text;
  v_file_asset_id uuid;
  v_document_id uuid;
  v_storage_mime text;
  v_storage_size bigint;
  v_allowed_mime constant text[] := array['application/pdf', 'image/jpeg', 'image/png'];
  v_max_bytes constant bigint := 10485760;
begin
  if auth.uid() is null or public.is_blocked_user() then
    raise exception 'forbidden';
  end if;

  select organization_id, status into v_organization_id, v_status
  from public.kyb_applications
  where id = p_application_id;

  if v_organization_id is null then
    raise exception 'application_not_found';
  end if;

  if not public.is_org_member(v_organization_id) then
    raise exception 'forbidden';
  end if;

  if v_status not in ('DRAFT', 'RESUBMISSION_REQUIRED') then
    raise exception 'invalid_transition';
  end if;

  if p_mime_type is null or not (p_mime_type = any (v_allowed_mime)) then
    raise exception 'invalid_mime_type';
  end if;

  if p_size_bytes is null or p_size_bytes > v_max_bytes or p_size_bytes <= 0 then
    raise exception 'object_too_large';
  end if;

  v_expected_prefix := 'org/' || v_organization_id::text || '/application/' || p_application_id::text || '/';
  if p_object_path is null or left(p_object_path, length(v_expected_prefix)) <> v_expected_prefix then
    raise exception 'cross_organization_object_path';
  end if;

  -- REVIEW FIX #4 (storage object -> metadata integrity): refuse to create canonical metadata for
  -- an object that was never actually uploaded. `bucket_id`/`name` are core, version-independent
  -- `storage.objects` columns — safe to rely on unconditionally.
  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'kyb-evidence'
      and so.name = p_object_path
  ) then
    raise exception 'storage_object_not_found';
  end if;

  -- Best-effort cross-check against the Storage object's own recorded metadata. Supabase Storage
  -- populates `storage.objects.metadata` with keys including `mimetype`/`size` at upload time —
  -- documented, stable Storage behaviour — but this repository has never introspected a live
  -- `storage.objects` row (zero buckets existed at the last schema audit, so
  -- `database-schema-report.json` has no `objects` column rows to confirm the exact key names
  -- against). This check is therefore deliberately tolerant: it rejects only when Storage-recorded
  -- metadata IS PRESENT and DISAGREES with the caller's claim, never when metadata is absent or
  -- differently shaped than expected. CONFIRMING THE EXACT `metadata` KEY NAMES AGAINST A REAL
  -- UPLOADED OBJECT IS A REQUIRED T010g LIVE-VERIFICATION STEP, not assumed here.
  select (so.metadata ->> 'mimetype'), nullif(so.metadata ->> 'size', '')::bigint
  into v_storage_mime, v_storage_size
  from storage.objects so
  where so.bucket_id = 'kyb-evidence'
    and so.name = p_object_path;

  if v_storage_mime is not null and v_storage_mime <> p_mime_type then
    raise exception 'mime_type_mismatch';
  end if;

  if v_storage_size is not null and v_storage_size <> p_size_bytes then
    raise exception 'size_mismatch';
  end if;

  v_new_version := 1;
  if p_supersedes_document_id is not null then
    select application_id, version, document_type
    into v_prev_application_id, v_new_version, v_prev_document_type
    from public.kyb_documents
    where id = p_supersedes_document_id;

    if v_prev_application_id is null then
      raise exception 'superseded_document_not_found';
    end if;

    if v_prev_application_id <> p_application_id then
      raise exception 'cross_application_document_replacement';
    end if;

    if v_prev_document_type <> p_document_type then
      raise exception 'cross_document_type_replacement';
    end if;

    v_new_version := v_new_version + 1;
  end if;

  insert into public.file_assets (
    uploaded_by, organization_id, bucket_name, object_path, original_name, mime_type, size_bytes, is_private
  )
  values (
    auth.uid(), v_organization_id, 'kyb-evidence', p_object_path, p_original_name, p_mime_type, p_size_bytes, true
  )
  returning id into v_file_asset_id;

  insert into public.kyb_documents (
    application_id, document_type, file_asset_id, expires_at, version, supersedes_document_id, status
  )
  values (
    p_application_id, p_document_type, v_file_asset_id, p_expires_at, v_new_version, p_supersedes_document_id, 'PENDING'
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

revoke all on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) from public;
grant execute on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid) to authenticated, service_role;

-- ============================================================================
-- SECTION 5 — NO REALTIME
-- ============================================================================
-- Deliberately no publication-membership statement of any kind anywhere in this file. Realtime
-- remains a separate, future, security-reviewed enhancement (spec.md "Status refresh boundary").
