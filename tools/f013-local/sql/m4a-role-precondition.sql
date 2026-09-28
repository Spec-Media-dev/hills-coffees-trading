-- Read-only local precondition matching M4a's rolbypassrls/rolsuper guard.
select case when exists (
         select 1 from pg_roles
         where rolname = current_user and (rolbypassrls or rolsuper)
       ) then 'F013_ROLE_OK' else 'F013_ROLE_DENIED' end as f013_role_status;
