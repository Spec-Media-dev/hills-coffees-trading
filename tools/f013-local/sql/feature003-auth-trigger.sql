-- Exact trigger DDL from 20260912000000_feature_003_profile_bootstrap.sql.
-- Reapply the reviewed function and trigger after the schema-only dump. Local only.
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
