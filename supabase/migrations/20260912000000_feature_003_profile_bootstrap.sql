-- Feature 003 — PART 0: fresh-signup profile bootstrap (RUN B pre-work).
--
-- DEFECT THIS CLOSES: a genuinely fresh Supabase Auth signup creates `auth.users` but no approved
-- mechanism creates that user's initial `public.profiles` row. Confirmed live (RUN A Full Name
-- Persistence fix, 2026-09-11) via direct RPC verification against the intended Supabase
-- environment: a caller with no `profiles` row causes `update_my_profile()` (UPDATE-only) to be a
-- silent no-op, and `start_organization_onboarding()` to fail with PostgreSQL 23503
-- (`organizations_created_by_fkey`, "Key (created_by)=(...) is not present in table \"profiles\"").
-- Re-confirmed again immediately before writing this migration via a read-only, service-role-only,
-- standalone verification script (deleted after use, never committed): of 7 real `auth.users` rows
-- in the intended environment, exactly 1 (`shadyshref2001@gmail.com`) has no matching `profiles` row.
--
-- HARD CONSTRAINTS CARRIED OVER UNMODIFIED (unchanged by this migration):
--   public.organization_can_buy(uuid), public.organization_can_sell(uuid), public.is_authorized_member()
-- No historical migration file is edited. This is one new additive file.

-- ============================================================================
-- SECTION 1 — auth.users -> profiles bootstrap trigger
-- ============================================================================
--
-- Fires once, AFTER a new row is inserted into `auth.users` (i.e. at Sign-Up, before email
-- verification and before any session exists — matching the observed defect exactly). Creates
-- exactly one corresponding `public.profiles` row.
--
-- SCOPE: profile/presentation data only. Reads NOTHING from `raw_user_meta_data` except the single
-- `full_name` key already used by the approved Sign-Up flow (`src/app/(auth)/sign-up/actions.ts`,
-- RUN A). It NEVER reads or trusts (and this function does not even reference) any of:
-- `account_type`, `organization_id`, `member_role`, a platform/compliance role, `can_buy`,
-- `can_sell`, organization status, KYB status, approval state, or `is_blocked` — none of those are
-- profile columns and none of them are read from metadata here. `is_blocked` on the new profile row
-- always takes its column default (`false`); this trigger cannot set it to anything else.
--
-- IDEMPOTENT / CONFLICT-SAFE: `on conflict (id) do nothing` — if a profile row already exists for
-- this id (should not happen for a genuinely new `auth.users` row, but defends against any future
-- caller that inserts into `auth.users` for an id that already has a profile), the existing row is
-- left completely untouched. This function never creates an organization, a membership, or any
-- capability — it inserts into `public.profiles` only.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;

  return new;
end;  
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
  revoke all on function public.handle_new_user() from public;

-- ============================================================================
-- SECTION 2 — guarded backfill for existing auth.users with no profiles row
-- ============================================================================
--
-- Scoped exclusively to users who are genuinely missing a profile row (`not exists` — never a bulk
-- upsert over all users). Never overwrites an existing profile: the `where not exists` clause means
-- a user who already has a `profiles` row (whatever its current values) is not touched by this
-- statement at all. Same `full_name`-only sourcing as the trigger above, and the same conflict-safe
-- guard as a second line of defense in case of a race between this backfill and a concurrent signup.
insert into public.profiles (id, full_name)
select
  u.id,
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;
