-- Rollback for 20260913000000_feature_003_t033_mfa_data_gate.sql.
--
-- No data-loss risk to guard against: the migration adds RESTRICTIVE policies and one helper, then
-- interposes wrappers without changing the retained implementation bodies or any data/table
-- structure. This rollback removes the policies/wrappers and renames those exact implementations
-- back to their original API names.

begin;

drop policy if exists mfa_gate_kyb_evidence on storage.objects;
drop policy if exists mfa_gate_account_status_history on public.account_status_history;
drop policy if exists mfa_gate_kyb_reviews on public.kyb_reviews;
drop policy if exists mfa_gate_kyb_review_items on public.kyb_review_items;

drop policy if exists mfa_gate_agreement_acceptances on public.agreement_acceptances;
drop policy if exists mfa_gate_file_assets on public.file_assets;
drop policy if exists mfa_gate_kyb_documents on public.kyb_documents;
drop policy if exists mfa_gate_kyb_applications on public.kyb_applications;
drop policy if exists mfa_gate_organization_members on public.organization_members;
drop policy if exists mfa_gate_organizations on public.organizations;
drop policy if exists mfa_gate_profiles on public.profiles;

-- Remove the MFA-checking public wrappers, restore the exact original implementation functions,
-- then restore their pre-migration browser/service-role grants. The internal functions retained
-- their bodies, owners, configuration and OIDs throughout the forward migration.
drop function if exists public.list_kyb_document_reviews(uuid);
alter function public.t033_internal_list_kyb_document_reviews(uuid) rename to list_kyb_document_reviews;
grant execute on function public.list_kyb_document_reviews(uuid) to authenticated, service_role;

drop function if exists public.create_kyb_review(uuid, uuid, text, text);
alter function public.t033_internal_create_kyb_review(uuid, uuid, text, text) rename to create_kyb_review;
grant execute on function public.create_kyb_review(uuid, uuid, text, text) to authenticated, service_role;

drop function if exists public.resubmit_kyb_application(uuid);
alter function public.t033_internal_resubmit_kyb_application(uuid) rename to resubmit_kyb_application;
grant execute on function public.resubmit_kyb_application(uuid) to authenticated, service_role;

drop function if exists public.submit_kyb_application(uuid);
alter function public.t033_internal_submit_kyb_application(uuid) rename to submit_kyb_application;
grant execute on function public.submit_kyb_application(uuid) to authenticated, service_role;

drop function if exists public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid);
alter function public.t033_internal_attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid)
  rename to attach_kyb_document;
grant execute on function public.attach_kyb_document(uuid, text, text, text, text, bigint, date, uuid)
  to authenticated, service_role;

drop function if exists public.update_kyb_draft(uuid, text, text);
alter function public.t033_internal_update_kyb_draft(uuid, text, text) rename to update_kyb_draft;
grant execute on function public.update_kyb_draft(uuid, text, text) to authenticated, service_role;

drop function if exists public.create_kyb_draft(uuid);
alter function public.t033_internal_create_kyb_draft(uuid) rename to create_kyb_draft;
grant execute on function public.create_kyb_draft(uuid) to authenticated, service_role;

drop function if exists public.start_organization_onboarding(text, text, text, text, text, text, text, text);
alter function public.t033_internal_start_organization_onboarding(text, text, text, text, text, text, text, text)
  rename to start_organization_onboarding;
grant execute on function public.start_organization_onboarding(text, text, text, text, text, text, text, text)
  to authenticated, service_role;

drop function if exists public.update_organization_contact(uuid, text, text, text);
alter function public.t033_internal_update_organization_contact(uuid, text, text, text)
  rename to update_organization_contact;
grant execute on function public.update_organization_contact(uuid, text, text, text)
  to authenticated, service_role;

drop function if exists public.update_my_profile(text, text, text, text);
alter function public.t033_internal_update_my_profile(text, text, text, text) rename to update_my_profile;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated, service_role;

drop function if exists public.mfa_satisfied();

commit;
