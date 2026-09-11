-- Feature 003 — RUN B (T014/T016): the smallest additive schema the member-facing KYB draft screen
-- genuinely needs.
--
-- WHY THIS MIGRATION EXISTS: `specs/003-auth-membership-kyb/contracts/kyb-foundation.md` §2 states
-- explicitly that `update_kyb_draft` was NOT implemented by RUN DB because `kyb_applications` had no
-- member-editable business-data column yet, and that "Phase 4 (T016) adds the real columns and the
-- matching `update_kyb_draft` capability in the *same* SECURITY DEFINER style established here." This
-- migration is exactly that pre-authorized, previously-deferred step — nothing more.
--
-- SCOPE DECISION (per this run's explicit instruction not to invent JSON blobs or fabricate business
-- requirements beyond repository authority): SRS §4.1's "Required organization and user evidence"
-- table lists Company / Ownership-control / Users / Banking / Agreements / Review. Company identity
-- fields (legal name, tax number, registration number, country, email, phone) already exist on
-- `organizations`, captured at onboarding (`start_organization_onboarding`). Agreements are Phase 6's
-- scope (tasks.md: "Phase 6 — Agreements (after RUN B)"), explicitly out of this run. Ownership/
-- control, Banking, and the remaining Company evidence (trade licence, proof of incorporation) are,
-- per SRS §4.1's own wording ("authority evidence", document-style entries), evidence — i.e.
-- DOCUMENTS, which the already-applied `kyb_documents`/`attach_kyb_document` model already handles
-- with no new schema (document types are free-text and defined at the application layer in
-- `lib/validation/kyb-application.ts`, not a DB enum). The only genuinely new SCALAR company-detail
-- text this run's draft screen collects, that is not already captured anywhere, is a registered
-- business address and a short business-activity description — both plain presentation/business text,
-- never authorization data. That is the entire schema surface this migration adds: two nullable text
-- columns and one UPDATE-only RPC to write them.
--
-- HARD CONSTRAINTS CARRIED OVER UNMODIFIED (unchanged by this migration):
--   public.organization_can_buy(uuid), public.organization_can_sell(uuid), public.is_authorized_member()
-- No historical migration file is edited. This is one new additive file.

alter table public.kyb_applications
  add column if not exists registered_address text;

alter table public.kyb_applications
  add column if not exists business_activity text;

-- `update_kyb_draft` — the member-scoped write path for the two columns above. Same SECURITY DEFINER
-- shape as `create_kyb_draft`/`submit_kyb_application` (contract §2): fixed search_path, fails closed
-- on missing/blocked caller, on non-membership, and on a non-editable application state. Accepts and
-- writes ONLY `registered_address`/`business_activity` — no status, decision, or membership field is
-- a parameter of this function, so none can be supplied through it under any input.
create or replace function public.update_kyb_draft(
  p_application_id uuid,
  p_registered_address text,
  p_business_activity text
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

  -- Same editable-state rule the Storage INSERT policy already enforces for document uploads
  -- (contract §3): a draft is editable in DRAFT or RESUBMISSION_REQUIRED, never once SUBMITTED,
  -- UNDER_REVIEW, APPROVED, REJECTED, or SUSPENDED.
  if not (v_status = any (array['DRAFT', 'RESUBMISSION_REQUIRED'])) then
    raise exception 'invalid_transition';
  end if;

  update public.kyb_applications
  set
    registered_address = nullif(btrim(p_registered_address), ''),
    business_activity = nullif(btrim(p_business_activity), ''),
    updated_at = now()
  where id = p_application_id;
end;
$$;

revoke all on function public.update_kyb_draft(uuid, text, text)
from public, anon;

grant execute on function public.update_kyb_draft(uuid, text, text)
to authenticated, service_role;