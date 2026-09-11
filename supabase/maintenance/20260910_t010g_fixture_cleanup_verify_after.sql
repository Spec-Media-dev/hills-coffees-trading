-- T010g fixture cleanup — FINAL POST-CLEANUP VERIFICATION.
-- Run only after, in order:
--   1. 20260910_t010g_fixture_cleanup.sql commits successfully.
--   2. 20260910_t010g_auth_user_cleanup.mjs bans two retained Auth principals and deletes the one
--      audit-unreferenced Auth user successfully.
--
-- READ-ONLY: this script performs no writes. It fails closed on any residue or foundation drift.
-- Audit policy:
--   business fixture residue = zero;
--   two disabled synthetic audit principals intentionally retained for immutable audit integrity

do $$
declare
  fixture_tag constant text := 't010g-verify-1789077219872';
  expected_org_ids constant uuid[] := array[
    '73934c48-569c-4b7d-ac40-3ee850bdcc07',
    '235de6ec-2de9-43f4-9154-6282cbfbc58c'
  ]::uuid[];
  expected_app_ids constant uuid[] := array[
    '62ead548-c611-46e3-848e-ed6fcffb117d',
    'dd90f13f-13dc-4c9d-88d3-8396859c66be'
  ]::uuid[];
  expected_doc_ids constant uuid[] := array[
    'e41f8cbb-7c46-4749-9653-7512f3b5cd37',
    '4d18b2df-f4fd-46c0-9693-645357a361b9',
    'bb2d40bb-e19a-45fd-aae0-55afbec51ad3',
    'a5ffa0cf-4fe4-4ad7-afeb-faeb08469eef'
  ]::uuid[];
  expected_file_asset_ids constant uuid[] := array[
    '2a8ef7ce-b654-4854-8c40-61155f74f6df',
    '46424bce-bd08-4e30-8067-802fbea7b35c',
    'd670a15b-bca3-4671-b536-c98e8fab6dcf',
    'ffe81aa5-e545-4587-b8f7-685188ec825a'
  ]::uuid[];
  expected_review_ids constant uuid[] := array[
    'ca77be98-5f46-4919-b5b0-3eef45c94f83'
  ]::uuid[];
  expected_user_ids constant uuid[] := array[
    'eb4dac8e-7fc3-4e0c-a090-17552046e536',
    '237cf526-339f-4063-bda8-a40f28364e2b',
    'b74ebe9f-080d-4b20-a509-22f841ec1736'
  ]::uuid[];
  retained_audit_user_ids constant uuid[] := array[
    '237cf526-339f-4063-bda8-a40f28364e2b',
    'b74ebe9f-080d-4b20-a509-22f841ec1736'
  ]::uuid[];
  deleted_user_ids constant uuid[] := array[
    'eb4dac8e-7fc3-4e0c-a090-17552046e536'
  ]::uuid[];

  foundation_signatures constant text[] := array[
    'public.start_organization_onboarding(text,text,text,text,text,text,text,text)',
    'public.create_kyb_draft(uuid)',
    'public.transition_kyb_application(uuid,text[])',
    'public.submit_kyb_application(uuid)',
    'public.resubmit_kyb_application(uuid)',
    'public.validate_kyb_document_lineage()',
    'public.validate_review_item_document()',
    'public.apply_kyb_review_item_decision()',
    'public.prevent_kyb_review_item_mutation()',
    'public.create_kyb_review(uuid,uuid,text,text)',
    'public.list_kyb_document_reviews(uuid)',
    'public.kyb_storage_object_authorized(text,boolean)',
    'public.attach_kyb_document(uuid,text,text,text,text,bigint,date,uuid)'
  ]::text[];
  protected_authz_signatures constant text[] := array[
    'public.organization_can_buy(uuid)',
    'public.organization_can_sell(uuid)',
    'public.is_authorized_member()'
  ]::text[];
  expected_audit_trigger_keys text[] := array[
    'public.kyb_applications:trg_audit_kyb',
    'public.kyb_documents:trg_audit_kyb_documents',
    'public.kyb_review_items:trg_audit_kyb_review_items',
    'public.organizations:trg_audit_organizations'
  ]::text[];

  remaining bigint;
  expected_cleanup_audit_delta bigint;
  actual_audit_trigger_keys text[];
  missing_signatures text[];
  non_definer_signatures text[];
  trigger_state "char";
  bucket_public boolean;
  bucket_size bigint;
  bucket_mimes text[];
  retained_user_id uuid;
  profile_fk record;
  has_surviving_profile_reference boolean;
begin
  select array(select unnest(expected_audit_trigger_keys) order by 1) into expected_audit_trigger_keys;
  expected_cleanup_audit_delta :=
      cardinality(expected_doc_ids)
    + cardinality(expected_review_ids)
    + cardinality(expected_app_ids)
    + cardinality(expected_org_ids);

  select count(*) into remaining from public.organizations where id = any (expected_org_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g organization(s) remain.', remaining; end if;

  select count(*) into remaining from public.kyb_applications where id = any (expected_app_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g application(s) remain.', remaining; end if;

  select count(*) into remaining from public.kyb_documents where id = any (expected_doc_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g document(s) remain.', remaining; end if;

  select count(*) into remaining from public.file_assets where id = any (expected_file_asset_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g file asset(s) remain.', remaining; end if;

  select count(*) into remaining from public.kyb_review_items where id = any (expected_review_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g review item(s) remain.', remaining; end if;

  select count(*) into remaining
  from public.organization_members
  where organization_id = any (expected_org_ids) or user_id = any (expected_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g membership row(s) remain.', remaining; end if;

  select count(*) into remaining
  from public.platform_admins
  where user_id = any (expected_user_ids) or created_by = any (expected_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: % exact T010g platform-admin row(s) remain.', remaining; end if;

  select count(*) into remaining
  from public.profiles
  where id = any (retained_audit_user_ids)
    and is_blocked = true
    and blocked_at is not null
    and blocked_by is null
    and block_reason = 'T010g retained audit principal — test identity disabled';
  if remaining <> cardinality(retained_audit_user_ids) then
    raise exception 'VERIFY FAILED: both retained audit-principal profiles must exist and be disabled.';
  end if;

  select count(*) into remaining from public.profiles where id = any (deleted_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: audit-unreferenced T010g profile remains.'; end if;

  select count(*) into remaining
  from auth.users
  where id = any (retained_audit_user_ids)
    and email like fixture_tag || '%'
    and banned_until > now();
  if remaining <> cardinality(retained_audit_user_ids) then
    raise exception 'VERIFY FAILED: both retained Auth audit principals must exist, remain tagged, and be banned.';
  end if;

  select count(*) into remaining from auth.users where id = any (deleted_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: audit-unreferenced T010g Auth user remains.'; end if;

  select count(*) into remaining
  from storage.objects
  where bucket_id = 'kyb-evidence' and name like '%' || fixture_tag || '%';
  if remaining <> 0 then raise exception 'VERIFY FAILED: % tagged T010g Storage object(s) remain.', remaining; end if;

  select count(*) into remaining
  from public.account_status_history
  where organization_id = any (expected_org_ids) or changed_by = any (expected_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: unexpected T010g account-status history exists.'; end if;

  -- Existing + cleanup audit rows remain. Cleanup adds exactly one DELETE event for each of the four
  -- documents, one review item, two applications, and two organizations.
  select count(*) into remaining
  from public.audit_logs al
  where al.action = 'DELETE'
    and (
      (al.entity_type = 'kyb_documents' and al.entity_id = any (expected_doc_ids))
      or (al.entity_type = 'kyb_review_items' and al.entity_id = any (expected_review_ids))
      or (al.entity_type = 'kyb_applications' and al.entity_id = any (expected_app_ids))
      or (al.entity_type = 'organizations' and al.entity_id = any (expected_org_ids))
    );
  if remaining <> expected_cleanup_audit_delta then
    raise exception 'VERIFY FAILED: expected exactly % retained T010g cleanup audit events; found %.',
      expected_cleanup_audit_delta, remaining;
  end if;

  -- Total equality alone could hide one missing event and one duplicate. Require exactly one retained
  -- DELETE event for every exact audited fixture entity ID.
  with expected_cleanup_events(entity_type, entity_id) as (
    select 'kyb_documents'::text, unnest(expected_doc_ids)
    union all
    select 'kyb_review_items'::text, unnest(expected_review_ids)
    union all
    select 'kyb_applications'::text, unnest(expected_app_ids)
    union all
    select 'organizations'::text, unnest(expected_org_ids)
  )
  select count(*) into remaining
  from expected_cleanup_events expected_event
  where (
    select count(*)
    from public.audit_logs al
    where al.action = 'DELETE'
      and al.entity_type = expected_event.entity_type
      and al.entity_id = expected_event.entity_id
  ) <> 1;
  if remaining <> 0 then
    raise exception 'VERIFY FAILED: % exact audited fixture entity ID(s) do not have exactly one retained DELETE event.', remaining;
  end if;

  select count(*) into remaining
  from public.audit_logs
  where actor_user_id = '237cf526-339f-4063-bda8-a40f28364e2b'::uuid;
  if remaining <> 3 then raise exception 'VERIFY FAILED: first retained audit principal must keep exactly 3 audit references; found %.', remaining; end if;

  select count(*) into remaining
  from public.audit_logs
  where actor_user_id = 'b74ebe9f-080d-4b20-a509-22f841ec1736'::uuid;
  if remaining <> 9 then raise exception 'VERIFY FAILED: second retained audit principal must keep exactly 9 audit references; found %.', remaining; end if;

  select count(*) into remaining
  from public.audit_logs
  where actor_user_id = any (deleted_user_ids);
  if remaining <> 0 then raise exception 'VERIFY FAILED: deleted principal unexpectedly has an audit reference.'; end if;

  -- Prove retained identities have no surviving FK footprint except immutable audit_logs.actor_user_id.
  foreach retained_user_id in array retained_audit_user_ids
  loop
    for profile_fk in
      select
        c.conname,
        c.conrelid::regclass as referencing_table,
        source_attribute.attname as referencing_column
      from pg_constraint c
      join lateral unnest(c.conkey) with ordinality
        as source_key(attnum, position) on true
      join lateral unnest(c.confkey) with ordinality
        as target_key(attnum, position) on target_key.position = source_key.position
      join pg_attribute source_attribute
        on source_attribute.attrelid = c.conrelid
       and source_attribute.attnum = source_key.attnum
      join pg_attribute target_attribute
        on target_attribute.attrelid = c.confrelid
       and target_attribute.attnum = target_key.attnum
      where c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and target_attribute.attname = 'id'
        and not (
          c.conrelid = 'public.audit_logs'::regclass
          and source_attribute.attname = 'actor_user_id'
        )
    loop
      execute format(
        'select exists (select 1 from %s where %I = $1)',
        profile_fk.referencing_table,
        profile_fk.referencing_column
      )
      into has_surviving_profile_reference
      using retained_user_id;

      if has_surviving_profile_reference then
        raise exception 'VERIFY FAILED: retained audit principal has non-audit reference via constraint % on %.%.',
          profile_fk.conname, profile_fk.referencing_table, profile_fk.referencing_column;
      end if;
    end loop;
  end loop;

  select tgenabled into trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_prevent_kyb_review_item_mutation';
  if trigger_state is distinct from 'O' then
    raise exception 'VERIFY FAILED: append-only review trigger is not enabled (state=%).', trigger_state;
  end if;

  select coalesce(
    array_agg(
      format('%I.%I:%I', table_namespace.nspname, table_class.relname, t.tgname)
      order by table_namespace.nspname, table_class.relname, t.tgname
    ),
    '{}'::text[]
  ) into actual_audit_trigger_keys
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace function_namespace on function_namespace.oid = p.pronamespace
  join pg_class table_class on table_class.oid = t.tgrelid
  join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
  where not t.tgisinternal
    and t.tgrelid = any (array[
      'public.organizations'::regclass,
      'public.kyb_applications'::regclass,
      'public.kyb_documents'::regclass,
      'public.kyb_review_items'::regclass,
      'public.file_assets'::regclass,
      'public.profiles'::regclass
    ])
    and function_namespace.nspname = 'public'
    and p.proname = 'write_audit_log';
  if actual_audit_trigger_keys != expected_audit_trigger_keys then
    raise exception 'VERIFY FAILED: write_audit_log trigger coverage drifted. actual=% expected=%',
      actual_audit_trigger_keys, expected_audit_trigger_keys;
  end if;

  select tgenabled into trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_applications'::regclass
    and tgname = 'trg_audit_kyb'
    and tgtype = 29; -- AFTER ROW INSERT OR DELETE OR UPDATE
  if trigger_state is distinct from 'O' then
    raise exception 'VERIFY FAILED: KYB-application audit trigger is missing, disabled, or has incorrect event coverage (state=%).', trigger_state;
  end if;

  select tgenabled into trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_documents'::regclass
    and tgname = 'trg_audit_kyb_documents'
    and tgtype = 29;
  if trigger_state is distinct from 'O' then
    raise exception 'VERIFY FAILED: KYB-document audit trigger is missing, disabled, or has incorrect event coverage (state=%).', trigger_state;
  end if;

  select tgenabled into trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_audit_kyb_review_items'
    and tgtype = 29;
  if trigger_state is distinct from 'O' then
    raise exception 'VERIFY FAILED: KYB-review audit trigger is missing, disabled, or has incorrect event coverage (state=%).', trigger_state;
  end if;

  select tgenabled into trigger_state
  from pg_trigger
  where tgrelid = 'public.organizations'::regclass
    and tgname = 'trg_audit_organizations'
    and tgtype = 29;
  if trigger_state is distinct from 'O' then
    raise exception 'VERIFY FAILED: organization audit trigger is missing, disabled, or has incorrect event coverage (state=%).', trigger_state;
  end if;

  select array_agg(signature order by signature) into missing_signatures
  from unnest(foundation_signatures || protected_authz_signatures) as signature
  where to_regprocedure(signature) is null;
  if missing_signatures is not null then
    raise exception 'VERIFY FAILED: required function signature(s) missing: %.', missing_signatures;
  end if;

  select array_agg(signature order by signature) into non_definer_signatures
  from unnest(foundation_signatures || protected_authz_signatures) as signature
  where not (
    select p.prosecdef from pg_proc p where p.oid = to_regprocedure(signature)
  );
  if non_definer_signatures is not null then
    raise exception 'VERIFY FAILED: required SECURITY DEFINER function(s) drifted: %.', non_definer_signatures;
  end if;

  select b.public, b.file_size_limit, b.allowed_mime_types
  into bucket_public, bucket_size, bucket_mimes
  from storage.buckets b
  where b.id = 'kyb-evidence';
  if not found then
    raise exception 'VERIFY FAILED: kyb-evidence bucket is missing.';
  end if;
  if bucket_public is distinct from false
     or bucket_size is distinct from 10485760
     or bucket_mimes is distinct from array['application/pdf', 'image/jpeg', 'image/png']::text[] then
    raise exception 'VERIFY FAILED: kyb-evidence bucket privacy/limits drifted.';
  end if;

  raise notice 'Final verification passed: business fixture residue = zero; nine cleanup DELETE audit events and two disabled synthetic audit principals intentionally retained for immutable audit integrity.';
end $$;

select
  'PASS'::text as result,
  'T010g business cleanup verified; nine cleanup DELETE audit events and two disabled audit principals retained; KYB foundation intact'::text as detail;
