/** Read-only, PII-free inventory of the retained F013 LOCAL orders-audit leak. */
import { runF013DockerPsqlStdin } from "./f013-docker-identity";
import { requireF013LocalTarget } from "./f013-local-target";

requireF013LocalTarget();
const sql = `begin read only;
select 'audit_column' as kind, column_name as name
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_logs'
order by ordinal_position;
select 'audit_trigger' as kind, t.tgname as name
from pg_trigger t where t.tgrelid = 'public.audit_logs'::regclass and not t.tgisinternal
order by t.tgname;
select 'audit_policy' as kind, policyname as name, cmd, roles::text
from pg_policies where schemaname = 'public' and tablename = 'audit_logs'
order by policyname;
select count(*) as affected_rows,
  count(*) filter (where old_data -> 'destination_snapshot' is not null and old_data -> 'destination_snapshot' <> 'null'::jsonb) as old_payloads,
  count(*) filter (where new_data -> 'destination_snapshot' is not null and new_data -> 'destination_snapshot' <> 'null'::jsonb) as new_payloads,
  count(*) filter (where metadata -> 'destination_snapshot' is not null) as metadata_payloads
from public.audit_logs
where entity_type = 'orders' and (
  (old_data -> 'destination_snapshot' is not null and old_data -> 'destination_snapshot' <> 'null'::jsonb)
  or (new_data -> 'destination_snapshot' is not null and new_data -> 'destination_snapshot' <> 'null'::jsonb)
  or metadata -> 'destination_snapshot' is not null);
select count(*) as all_entity_rows_with_snapshot
from public.audit_logs
where (old_data -> 'destination_snapshot' is not null and old_data -> 'destination_snapshot' <> 'null'::jsonb)
   or (new_data -> 'destination_snapshot' is not null and new_data -> 'destination_snapshot' <> 'null'::jsonb)
   or metadata -> 'destination_snapshot' is not null;
select a.id as audit_id, a.entity_type, a.entity_id, a.action, a.created_at,
  (a.actor_user_id is not null) as has_actor, (a.correlation_id is not null) as has_correlation,
  jsonb_typeof(a.old_data) as old_type, jsonb_typeof(a.new_data) as new_type,
  coalesce(a.old_data ? 'destination_snapshot', false) as old_has_key,
  coalesce(a.new_data ? 'destination_snapshot', false) as new_has_key,
  coalesce(a.metadata ? 'destination_snapshot', false) as metadata_has_key,
  coalesce((select array_agg(key order by key) from jsonb_object_keys(a.new_data) as keys(key)), array[]::text[]) as new_data_key_names,
  coalesce((select array_agg(key order by key) from jsonb_object_keys(a.new_data -> 'destination_snapshot') as keys(key)), array[]::text[]) as destination_key_names,
  coalesce((select array_agg(key order by key) from jsonb_object_keys(a.metadata) as keys(key)), array[]::text[]) as metadata_key_names
from public.audit_logs a
where a.entity_type = 'orders' and (
  (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
  or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
  or a.metadata -> 'destination_snapshot' is not null)
order by a.id;
select o.id as order_id, o.status, o.commerce_flow,
  (o.destination_snapshot is not null) as has_destination_snapshot
from public.orders o where o.id = '13000000-0000-4000-8000-000000001f01'::uuid;
commit;`;
const result = runF013DockerPsqlStdin(Buffer.from(sql, "utf8"), process.env.F013_DOCKER_PATH, process.env);
console.log(result.stdout);
