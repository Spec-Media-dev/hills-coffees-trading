-- Read-only postflight for 20260924120000_tag_translations.sql — every row must be ok = true.
select 'tag_translations exists' as check_name, to_regclass('public.tag_translations') is not null as ok
union all
select 'tag_translations RLS enabled', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.tag_translations')), false)
union all
select 'anon may only SELECT tag_translations',
  has_table_privilege('anon', 'public.tag_translations', 'select')
  and not has_table_privilege('anon', 'public.tag_translations', 'insert')
  and not has_table_privilege('anon', 'public.tag_translations', 'update')
  and not has_table_privilege('anon', 'public.tag_translations', 'delete')
union all
select 'authenticated may only SELECT tag_translations',
  has_table_privilege('authenticated', 'public.tag_translations', 'select')
  and not has_table_privilege('authenticated', 'public.tag_translations', 'insert')
  and not has_table_privilege('authenticated', 'public.tag_translations', 'update')
  and not has_table_privilege('authenticated', 'public.tag_translations', 'delete')
union all
select 'public read policy present', exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tag_translations' and policyname = 'tag_translations_public_read' and cmd = 'SELECT')
union all
select 'writer knows the tag kind', position('p_kind = ''tag''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
union all
select 'writer still SECURITY DEFINER + pinned search_path',
  (select prosecdef from pg_proc where oid = 'public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)
  and exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = 'public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure and c like 'search_path=%')
union all
select 'writer still admin-gated', position('is_platform_admin()' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
union all
select 'anon cannot execute the writer', not has_function_privilege('anon', 'public.set_catalogue_translation(text,uuid,text,text,text)', 'execute')
union all
select 'PUBLIC cannot execute the writer', not has_function_privilege('public', 'public.set_catalogue_translation(text,uuid,text,text,text)', 'execute')
union all
select 'PUBLIC holds no write privilege on tag_translations',
  not has_table_privilege('public', 'public.tag_translations', 'insert')
  and not has_table_privilege('public', 'public.tag_translations', 'update')
  and not has_table_privilege('public', 'public.tag_translations', 'delete')
union all
select 'tag translation integrity: foreign key valid and no invalid rows',
  not exists (select 1 from public.tag_translations tt left join public.tags t on t.id = tt.tag_id where t.id is null)
  and not exists (select 1 from public.tag_translations where locale not in ('en', 'ar') or char_length(btrim(name)) < 1 or char_length(btrim(name)) > 200)
union all
select 'existing translation branches remain valid',
  position('p_kind = ''coffee''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''origin''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''region''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''coffee_type''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''variety''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''processing''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0
  and position('p_kind = ''packaging''' in pg_get_functiondef('public.set_catalogue_translation(text,uuid,text,text,text)'::regprocedure)) > 0;
