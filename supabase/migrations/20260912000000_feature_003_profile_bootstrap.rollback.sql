-- Rollback for 20260912000000_feature_003_profile_bootstrap.sql.
--
-- Removes the trigger/function only. Deliberately does NOT delete any `profiles` row the trigger or
-- backfill created — a profile row is a real, potentially-in-use record (it may already be
-- referenced by `organizations.created_by`, KYB applications, or simply be a real user's identity)
-- the instant it exists, and this migration has no way to distinguish "created by this bootstrap and
-- safe to remove" from "since edited/relied upon by the real product." Guarded refusal, same
-- pattern as 20260911010000's rollback: if any real onboarding likely happened since this migration
-- applied, resolve manually before relying on this rollback.

do $$
begin
  if exists (select 1 from public.profiles limit 1) then
    raise notice 'rollback_note: profiles rows exist; this rollback does not delete any profiles row (no data loss), but a fresh signup will again get no profile row until this migration is re-applied';
  end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
