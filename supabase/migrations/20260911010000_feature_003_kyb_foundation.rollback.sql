-- Rollback for 20260911010000_feature_003_kyb_foundation.sql.
--
-- REVIEW FIX #9 (rollback safety): this rollback is intended for undoing a JUST-APPLIED migration
-- during initial review — BEFORE any real onboarding, KYB draft, document upload, or review has
-- happened. It is NOT a safe "uninstall this feature at any later time" script. The guard below
-- refuses to run at all if it detects any sign the feature has genuinely been used, so it cannot
-- silently destroy real KYB evidence or review history. If it refuses, resolve the referenced data
-- manually (export/archive it, or decide the feature is staying) before rolling back the schema.
--
-- Does NOT touch `organization_can_buy`, `organization_can_sell`, or `is_authorized_member` — this
-- migration never touched them either.

do $$
begin
  if exists (select 1 from public.kyb_review_items limit 1) then
    raise exception 'rollback_refused: kyb_review_items contains real review history — resolve manually before rolling back this migration';
  end if;

  if exists (
    select 1 from public.kyb_documents
    where version > 1
       or status <> 'PENDING'
       or supersedes_document_id is not null
    limit 1
  ) then
    raise exception 'rollback_refused: kyb_documents contains real version/review state — resolve manually before rolling back this migration';
  end if;

  if exists (select 1 from storage.objects where bucket_id = 'kyb-evidence' limit 1) then
    raise exception 'rollback_refused: the kyb-evidence bucket contains real uploaded objects — resolve manually before rolling back this migration';
  end if;

  if exists (
    select 1 from public.organizations
    where created_by is not null
      and created_at >= (select min(created_at) from public.kyb_applications)
  ) then
    -- Best-effort heuristic only (organizations created via the admin-only fallback path also match
    -- this shape) — not a hard guarantee, which is exactly why the three checks above are the real
    -- guards. This one is deliberately non-fatal: it does not raise.
    raise notice 'rollback_note: organizations exist that may have been created via start_organization_onboarding; verify before relying on this rollback in a used environment';
  end if;
end $$;

drop policy if exists kyb_evidence_admin_all on storage.objects;
drop policy if exists kyb_evidence_member_insert on storage.objects;
drop policy if exists kyb_evidence_member_select on storage.objects;

delete from storage.buckets where id = 'kyb-evidence';

drop function if exists public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid);
drop function if exists public.kyb_storage_object_authorized(text, boolean);
drop function if exists public.list_kyb_document_reviews(uuid);
drop function if exists public.create_kyb_review(uuid, uuid, text, text);

drop policy if exists kyb_documents_admin_write on public.kyb_documents;
drop policy if exists kyb_documents_member_select on public.kyb_documents;

create policy kyb_documents_own_or_admin on public.kyb_documents
  for all to public
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.kyb_applications ka
      where ka.id = kyb_documents.application_id
        and public.is_org_member(ka.organization_id)
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.kyb_applications ka
      where ka.id = kyb_documents.application_id
        and public.is_org_member(ka.organization_id)
    )
  );

drop policy if exists kyb_review_items_compliance_select on public.kyb_review_items;
drop policy if exists kyb_review_items_compliance on public.kyb_review_items;

drop trigger if exists trg_prevent_kyb_review_item_mutation on public.kyb_review_items;
drop trigger if exists trg_audit_kyb_review_items on public.kyb_review_items;
drop trigger if exists trg_audit_kyb_documents on public.kyb_documents;
drop trigger if exists trg_apply_kyb_review_item_decision on public.kyb_review_items;
drop trigger if exists trg_validate_review_item_document on public.kyb_review_items;
drop trigger if exists trg_validate_kyb_document_lineage on public.kyb_documents;

drop function if exists public.prevent_kyb_review_item_mutation();
drop function if exists public.apply_kyb_review_item_decision();
drop function if exists public.validate_review_item_document();
drop function if exists public.validate_kyb_document_lineage();

drop table if exists public.kyb_review_items;

drop index if exists public.uq_kyb_documents_supersedes_document_id;

alter table public.kyb_documents drop column if exists status;
alter table public.kyb_documents drop column if exists supersedes_document_id;
alter table public.kyb_documents drop column if exists version;

drop function if exists public.resubmit_kyb_application(uuid);
drop function if exists public.submit_kyb_application(uuid);
drop function if exists public.transition_kyb_application(uuid, text[]);
drop function if exists public.create_kyb_draft(uuid);
drop function if exists public.start_organization_onboarding(text, text, text, text, text, text, text, text);
