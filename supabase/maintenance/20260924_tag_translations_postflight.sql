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
select 'anon cannot execute the writer', not has_function_privilege('anon', 'public.set_catalogue_translation(text,uuid,text,text,text)', 'execute');
