-- PROPOSED — Feature 013 M4b T080 independent review (2026-09-28). NOT APPLIED. NOT A MIGRATION.
-- Scope: LOCAL `hills-f013-local` ONLY. Must never run against Production or any hosted project, and must never be
-- copied into supabase/migrations or supabase/maintenance: audit id 94 is a LOCAL identity and may name an
-- unrelated row elsewhere.
--
-- Purpose: remove exactly one JSON key, `new_data.destination_snapshot`, from audit row 94. That row is the generic
-- write_audit_log() INSERT copy of the T071 LOCAL fixture order 13000000-0000-4000-8000-000000001f01
-- (prepareF013T071SnapshotOrder, synthetic destination data). The order keeps its own frozen destination_snapshot.
-- Nothing is deleted. A separate PII-free correction event records the remediation.
--
-- Execution ONLY through `scripts/f013-m4b-row94-redaction.ts` (nonce-verified LOCAL identity, SHA-256 pin of this
-- exact file). As written, this file is the DRY RUN: it ends in ROLLBACK. The operator-authorized T081 apply is the
-- runner's `--apply` mode: this exact file with the final `rollback;` replaced by `commit;`, whose SHA-256 is pinned
-- separately and must also be supplied by the operator. A rerun after a successful apply fails safely at guard 2
-- (0 leaks found) and changes nothing.
--
-- NULL discipline (review B4): every comparison that could meet SQL NULL, JSON null or a missing key uses
-- IS DISTINCT FROM / IS NOT TRUE, and each structural guard is a separate IF, so no UNKNOWN result can pass.
begin;
set local lock_timeout = '5s';

do $identity$
begin
  if to_regclass('f013_local.identity') is null then
    raise exception 'f013_redaction_not_local_target';
  end if;
end
$identity$;

-- Blocks concurrent audit writes for the transaction; reads stay available.
lock table public.audit_logs in share row exclusive mode;

do $redact$
declare
  c_audit_id constant bigint := 94;
  c_order_id constant uuid := '13000000-0000-4000-8000-000000001f01';
  c_created_at constant timestamptz := '2026-09-27 12:43:29.347782+00';
  c_new_keys constant text[] := array['buyer_organization_id','cancel_reason','cancelled_at','cancelled_by','commerce_flow',
    'completed_at','confirmed_at','correlation_id','created_at','created_by','currency','current_proforma_id',
    'delivery_destination_id','destination_snapshot','has_manual_adjustment','hold_expires_at','hold_started_at','id',
    'idempotency_key','order_code','paid_at','shipping_ready_at','status','updated_at'];
  c_snapshot_keys constant text[] := array['address_lines','city','contact_name','contact_phone','country_code',
    'delivery_method','label'];
  v_row public.audit_logs%rowtype;
  v_after public.audit_logs%rowtype;
  v_order_hash text;
  v_order_hash_after text;
  v_others_hash text;
  v_others_hash_after text;
  v_max_id bigint;
  v_leaks bigint;
  v_updated bigint;
  v_appended bigint;
  v_event public.audit_logs%rowtype;
begin
  -- 1. Global leak inventory, every entity type (M4b preflight predicate, widened). Exactly one leak must exist.
  select count(*) into v_leaks from public.audit_logs a
  where (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
     or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
     or a.metadata ? 'destination_snapshot'
     or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
     or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines'];
  -- 2. Fail safe on rerun (0) or on any new/unknown leak (>1).
  if v_leaks is distinct from 1 then
    raise exception 'f013_redaction_expected_exactly_one_leak (found %)', v_leaks;
  end if;
  raise notice 'F013_ROW94|leaks_before|1';

  -- 3. Pin row 94 on every identifying field and on its exact payload shape. Sequential guards: a later guard may
  --    assume every earlier one held (no reliance on OR evaluation order).
  select * into v_row from public.audit_logs where id = c_audit_id for update;
  if not found or v_row.id is distinct from c_audit_id then
    raise exception 'f013_redaction_row_pin_mismatch (row)';
  end if;
  if v_row.entity_type is distinct from 'orders' or v_row.action is distinct from 'INSERT'
     or v_row.entity_id is distinct from c_order_id or v_row.created_at is distinct from c_created_at
     or v_row.actor_user_id is not null or v_row.correlation_id is null
     or v_row.old_data is not null or v_row.metadata is distinct from '{}'::jsonb then
    raise exception 'f013_redaction_row_pin_mismatch (columns)';
  end if;
  if jsonb_typeof(v_row.new_data) is distinct from 'object' then
    raise exception 'f013_redaction_row_pin_mismatch (new_data type)';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_row.new_data) k) is distinct from c_new_keys then
    raise exception 'f013_redaction_row_pin_mismatch (new_data keys)';
  end if;
  if jsonb_typeof(v_row.new_data -> 'destination_snapshot') is distinct from 'object' then
    raise exception 'f013_redaction_row_pin_mismatch (snapshot type)';
  end if;
  if (select array_agg(k order by k) from jsonb_object_keys(v_row.new_data -> 'destination_snapshot') k)
       is distinct from c_snapshot_keys then
    raise exception 'f013_redaction_row_pin_mismatch (snapshot keys)';
  end if;
  if jsonb_typeof(v_row.new_data -> 'id') is distinct from 'string'
     or (v_row.new_data ->> 'id') is distinct from c_order_id::text
     or jsonb_typeof(v_row.new_data -> 'order_code') is distinct from 'string'
     or ((v_row.new_data ->> 'order_code') like 'F013-T071-SNAPSHOT-%') is not true
     or jsonb_typeof(v_row.new_data -> 'commerce_flow') is distinct from 'string'
     or (v_row.new_data ->> 'commerce_flow') is distinct from 'LEGACY' then
    raise exception 'f013_redaction_row_pin_mismatch (identity values)';
  end if;
  raise notice 'F013_ROW94|target_row_shape_pinned|t';

  -- 4. The leaked value must be an exact copy of the fixture order's retained snapshot. The order is the source of
  --    truth and is not modified. (A NULL/absent order snapshot matches nothing, so the guard fails closed.)
  if not exists (select 1 from public.orders o where o.id = c_order_id
                 and o.destination_snapshot is not null
                 and o.destination_snapshot = v_row.new_data -> 'destination_snapshot') then
    raise exception 'f013_redaction_not_fixture_order_copy';
  end if;
  raise notice 'F013_ROW94|leak_is_fixture_order_copy|t';

  -- 5. Fingerprint everything that must not change.
  select md5(o::text) into v_order_hash from public.orders o where o.id = c_order_id;
  select max(id) into v_max_id from public.audit_logs;
  select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) into v_others_hash
  from public.audit_logs a where a.id <> c_audit_id;
  if v_order_hash is null or v_max_id is null or v_others_hash is null then
    raise exception 'f013_redaction_fingerprint_unavailable';
  end if;

  -- 6. The single mutation: remove one key only. Absence reads as "not recorded", so no key is set to null, which
  --    would falsely assert that the order had no destination.
  update public.audit_logs set new_data = new_data - 'destination_snapshot'
  where id = c_audit_id and new_data ? 'destination_snapshot';
  get diagnostics v_updated = row_count;
  if v_updated is distinct from 1 then
    raise exception 'f013_redaction_expected_one_row (updated %)', v_updated;
  end if;

  -- 7. Post-conditions on row 94. Every other column and key must be byte-identical.
  select * into v_after from public.audit_logs where id = c_audit_id;
  if not found
     or v_after.new_data is distinct from (v_row.new_data - 'destination_snapshot')
     or (v_after.new_data ? 'destination_snapshot') is not false
     or (select array_agg(k order by k) from jsonb_object_keys(v_after.new_data) k)
          is distinct from array_remove(c_new_keys, 'destination_snapshot')
     or v_after.old_data is distinct from v_row.old_data
     or v_after.metadata is distinct from v_row.metadata
     or v_after.entity_type is distinct from v_row.entity_type or v_after.entity_id is distinct from v_row.entity_id
     or v_after.action is distinct from v_row.action or v_after.actor_user_id is distinct from v_row.actor_user_id
     or v_after.created_at is distinct from v_row.created_at
     or v_after.correlation_id is distinct from v_row.correlation_id then
    raise exception 'f013_redaction_postcondition_row_changed';
  end if;
  raise notice 'F013_ROW94|only_forbidden_key_removed|t';
  raise notice 'F013_ROW94|other_row94_fields_preserved|t';

  -- 8. Append a separate PII-free correction event. It carries no destination content and no value from the payload.
  insert into public.audit_logs (actor_user_id, entity_type, entity_id, action, old_data, new_data, metadata, correlation_id)
  values (null, 'audit_logs', null, 'PII_REDACTION', null, null,
          jsonb_build_object(
            'audit_log_id', c_audit_id,
            'audited_entity_type', 'orders',
            'audited_entity_id', c_order_id,
            'audited_action', 'INSERT',
            'redacted_paths', jsonb_build_array('new_data.destination_snapshot'),
            'reason', 'AUD-006: destination personal data copied by the pre-M4b generic orders audit trigger',
            'data_origin', 'T071 LOCAL synthetic fixture (prepareF013T071SnapshotOrder)',
            'authorization', 'Feature 013 T080 independent review 2026-09-28; operator apply under T081',
            'scope', 'LOCAL hills-f013-local only'),
          gen_random_uuid());

  -- 9. Global post-conditions: zero leaks, no other audit row changed, exactly one PII-free row appended, order unchanged.
  select count(*) into v_leaks from public.audit_logs a
  where (a.old_data -> 'destination_snapshot' is not null and a.old_data -> 'destination_snapshot' <> 'null'::jsonb)
     or (a.new_data -> 'destination_snapshot' is not null and a.new_data -> 'destination_snapshot' <> 'null'::jsonb)
     or a.metadata ? 'destination_snapshot'
     or coalesce(a.old_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines']
     or coalesce(a.new_data, '{}'::jsonb) ?| array['contact_phone', 'address_lines'];
  if v_leaks is distinct from 0 then
    raise exception 'f013_redaction_leak_remains (found %)', v_leaks;
  end if;
  select md5(coalesce(string_agg(a::text, '|' order by a.id), '')) into v_others_hash_after
  from public.audit_logs a where a.id <> c_audit_id and a.id <= v_max_id;
  if v_others_hash_after is distinct from v_others_hash then
    raise exception 'f013_redaction_other_audit_rows_changed';
  end if;
  select count(*) into v_appended from public.audit_logs where id > v_max_id;
  if v_appended is distinct from 1 then
    raise exception 'f013_redaction_expected_one_correction_event';
  end if;
  select * into v_event from public.audit_logs where id > v_max_id;
  if v_event.action is distinct from 'PII_REDACTION' or v_event.entity_type is distinct from 'audit_logs'
     or v_event.old_data is not null or v_event.new_data is not null
     or (v_event.metadata::text like '%contact_%' or v_event.metadata::text like '%address%'
         or v_event.metadata ? 'destination_snapshot') is not false then
    raise exception 'f013_redaction_correction_event_not_pii_free';
  end if;
  select md5(o::text) into v_order_hash_after from public.orders o where o.id = c_order_id;
  if v_order_hash_after is distinct from v_order_hash then
    raise exception 'f013_redaction_order_changed';
  end if;
  raise notice 'F013_ROW94|unrelated_audit_rows_unchanged|t';
  raise notice 'F013_ROW94|order_row_unchanged|t';
  raise notice 'F013_ROW94|one_pii_free_correction_event|t';
  raise notice 'F013_ROW94|leaks_after|0';

  raise notice 'f013 row-94 redaction checks passed (1 key removed, 1 correction event, 0 leaks remaining).';
end
$redact$;

rollback;
