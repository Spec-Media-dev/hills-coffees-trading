-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for supabase/migrations/20260920160000_feature_011_db_block_10_price_policy_scope.sql
-- Restores the three `price_*_admin` policies to `TO public` (their pre-migration role scope). Nothing else is touched
-- — no expression, grant, row or other policy — and the anonymous role goes back to receiving
-- `42501 permission denied for function is_platform_admin` on the three pricing tables (the DB-BLOCK-10 fault).
-- Not part of `supabase/migrations/` on purpose (the Supabase CLI would read it as a migration).
-- ══════════════════════════════════════════════════════════════════════════════════════════════

begin;

do $guard$
declare
  v_problems text := '';
  v_rec record;
  v_name text;
begin
  for v_name in select unnest(array['price_sources_admin', 'price_observations_admin', 'price_differentials_admin']) loop
    select * into v_rec from pg_policies where schemaname = 'public' and policyname = v_name;
    if not found then
      v_problems := v_problems || v_name || ' missing; ';
    elsif v_rec.roles::text <> '{authenticated}' then
      v_problems := v_problems || v_name || ' is not scoped TO authenticated (' || v_rec.roles::text || '); ';
    end if;
  end loop;
  if v_problems <> '' then
    raise exception 'feature_011_price_policy_scope rollback refused — the migrated shape is not in place; nothing changed: %', v_problems;
  end if;
end
$guard$;

alter policy price_sources_admin       on public.price_sources       to public;
alter policy price_observations_admin  on public.price_observations  to public;
alter policy price_differentials_admin on public.price_differentials to public;

commit;
