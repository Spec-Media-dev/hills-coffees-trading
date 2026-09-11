-- T010g fixture residue — READ-ONLY verification.
--
-- Purpose: report the exact residual synthetic rows left by the T010g live-verification run
-- (2026-09-10), and prove every one of them is tag-derivable from `t010g-verify-1789077219872%` —
-- never a broad production match. This file performs NO writes. Safe to run any number of times,
-- in any environment, at any time.
--
-- Expected result, per the live inventory captured immediately before writing this file:
--   2 organizations, 2 kyb_applications, 4 kyb_documents, 4 file_assets, 1 kyb_review_items,
--   3 auth.users / profiles, 0 organization_members, 0 platform_admins, 0 storage.objects.
--
-- If any query below returns a DIFFERENT row than expected, or any "safety check" query returns a
-- non-empty result, STOP — do not proceed to the guarded cleanup script.

-- ============================================================================
-- 1. Exact fixture organization IDs
-- ============================================================================
select id, legal_name, display_name, account_type, status, created_by, can_buy, can_sell, created_at
from public.organizations
where legal_name like 't010g-verify-%'
order by created_at;

-- ============================================================================
-- 2. Exact fixture application IDs
-- ============================================================================
select ka.id, ka.organization_id, ka.submitted_by, ka.status, ka.rejection_reason, ka.created_at
from public.kyb_applications ka
join public.organizations o on o.id = ka.organization_id
where o.legal_name like 't010g-verify-%'
order by ka.created_at;

-- ============================================================================
-- 3. Exact fixture document IDs (+ their file_assets)
-- ============================================================================
select kd.id as document_id, kd.application_id, kd.document_type, kd.version, kd.status,
       kd.supersedes_document_id, kd.file_asset_id, fa.object_path
from public.kyb_documents kd
join public.kyb_applications ka on ka.id = kd.application_id
join public.organizations o on o.id = ka.organization_id
left join public.file_assets fa on fa.id = kd.file_asset_id
where o.legal_name like 't010g-verify-%'
order by kd.created_at;

-- ============================================================================
-- 4. Exact fixture review item IDs
-- ============================================================================
select kri.id as review_id, kri.application_id, kri.document_id, kri.decision, kri.reviewer_user_id,
       kri.created_at
from public.kyb_review_items kri
join public.kyb_applications ka on ka.id = kri.application_id
join public.organizations o on o.id = ka.organization_id
where o.legal_name like 't010g-verify-%'
order by kri.created_at;

-- ============================================================================
-- 5. Exact fixture profile / auth user IDs
-- ============================================================================
select u.id, u.email, u.created_at
from auth.users u
where u.email like 't010g-verify-%'
order by u.created_at;

-- ============================================================================
-- 6. Exact fixture storage objects, if any
-- ============================================================================
select so.id, so.bucket_id, so.name, so.created_at
from storage.objects so
where so.bucket_id = 'kyb-evidence'
  and so.name like '%t010g-verify-%'
order by so.created_at;

-- ============================================================================
-- 7. Safety checks — every one of these MUST return ZERO rows before cleanup proceeds.
-- Each checks that a fixture-linked row's OWNING IDENTITY is also tag-derivable, so a row can
-- never be targeted merely for sitting next to a fixture — its own actor must be tagged too.
-- ============================================================================

-- 7a. Any fixture organization whose creator is NOT a tagged auth user.
select o.id, o.legal_name, o.created_by
from public.organizations o
where o.legal_name like 't010g-verify-%'
  and not exists (select 1 from auth.users u where u.id = o.created_by and u.email like 't010g-verify-%');

-- 7b. Any fixture application whose submitter is NOT a tagged auth user.
select ka.id, ka.submitted_by
from public.kyb_applications ka
join public.organizations o on o.id = ka.organization_id
where o.legal_name like 't010g-verify-%'
  and not exists (select 1 from auth.users u where u.id = ka.submitted_by and u.email like 't010g-verify-%');

-- 7c. Any fixture review whose reviewer is NOT a tagged auth user.
select kri.id, kri.reviewer_user_id
from public.kyb_review_items kri
join public.kyb_applications ka on ka.id = kri.application_id
join public.organizations o on o.id = ka.organization_id
where o.legal_name like 't010g-verify-%'
  and not exists (select 1 from auth.users u where u.id = kri.reviewer_user_id and u.email like 't010g-verify-%');

-- 7d. Any fixture file_asset whose uploader is NOT a tagged auth user, OR whose object_path does
-- not itself contain the fixture tag (defense in depth: path AND uploader must both be tagged).
select fa.id, fa.uploaded_by, fa.object_path
from public.file_assets fa
join public.kyb_documents kd on kd.file_asset_id = fa.id
join public.kyb_applications ka on ka.id = kd.application_id
join public.organizations o on o.id = ka.organization_id
where o.legal_name like 't010g-verify-%'
  and (
    not exists (select 1 from auth.users u where u.id = fa.uploaded_by and u.email like 't010g-verify-%')
    or fa.object_path not like '%t010g-verify-%'
  );

-- 7e. Any tagged auth user who ALSO owns a real (non-tagged) organization, membership, or platform
-- admin role — if this returns any row, that user is NOT purely a throwaway fixture and must NOT be
-- deleted. (Expected: zero rows for all three tagged users.)
select u.id, u.email, 'organizations' as via, o.id as real_row_id
from auth.users u
join public.organizations o on o.created_by = u.id
where u.email like 't010g-verify-%'
  and o.legal_name not like 't010g-verify-%'
union all
select u.id, u.email, 'organization_members', om.organization_id::text
from auth.users u
join public.organization_members om on om.user_id = u.id
where u.email like 't010g-verify-%'
union all
select u.id, u.email, 'platform_admins', pa.user_id::text
from auth.users u
join public.platform_admins pa on pa.user_id = u.id
where u.email like 't010g-verify-%';

-- ============================================================================
-- 8. Append-only trigger currently enabled? ('O' = origin/enabled, 'D' = disabled)
-- ============================================================================
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.kyb_review_items'::regclass
  and tgname = 'trg_prevent_kyb_review_item_mutation';
-- Expected: exactly one row, tgenabled = 'O'.
