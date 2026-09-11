-- Rollback for 20260912010000_feature_003_kyb_draft_fields.sql.
--
-- Guarded the same way as 20260911010000's rollback: refuses if any application has actually used
-- these fields, so it cannot silently discard real member-submitted business data.

do $$
begin
  if exists (
    select 1 from public.kyb_applications
    where registered_address is not null or business_activity is not null
    limit 1
  ) then
    raise exception 'rollback_refused: kyb_applications contains real registered_address/business_activity data — resolve manually before rolling back this migration';
  end if;
end $$;

drop function if exists public.update_kyb_draft(uuid, text, text);

alter table public.kyb_applications drop column if exists business_activity;
alter table public.kyb_applications drop column if exists registered_address;
