-- T010g fixture residue — ONE-TIME GUARDED PUBLIC-SCHEMA CLEANUP.
--
-- NOT A MIGRATION. This file is prepared for manual review/execution only and has not been run.
-- It deletes only the one audit-unreferenced profile. Auth identities are handled afterward by the
-- separate Auth Admin maintenance script: two are banned/retained, one is deleted.
--
-- Audit-retention policy (project fixture contract):
--   business fixture residue = zero;
--   two disabled synthetic audit principals intentionally retained for immutable audit integrity
--
-- `audit_logs` and `account_status_history` are never deleted or updated here. The T010g operations
-- already generated synthetic `audit_logs` rows through `write_audit_log()`. Live FK/audit inventory
-- confirms that two fixture profiles are immutable audit principals (3 and 9 references); both their
-- profiles and Auth identities are retained. Deleting the four exact KYB documents, one exact review
-- item, two exact KYB applications, and two exact organizations generates nine additional DELETE
-- audit events because all four tables have live `write_audit_log()` DELETE coverage; those events
-- are intentionally retained too.
-- `account_status_history` has an ON DELETE CASCADE reference
-- to organizations, so this cleanup aborts unless the exact fixture organizations/users have ZERO
-- account-status-history rows. That prevents an organization delete from silently erasing history.
--
-- Safety model:
--   1. Exact hardcoded IDs captured by the read-only T010g inventory.
--   2. Fresh tag-derived sets must equal those IDs exactly before any mutation.
--   3. Any Storage object, legacy review, account-history row, organization membership, platform-admin
--      row, or audit-reference count outside the confirmed exact sets aborts the whole transaction.
--   4. The append-only review trigger is disabled only around deletion of the one exact synthetic
--      review row, then immediately re-enabled and verified before any other deletion.
--   5. Audit triggers remain enabled throughout. Every mismatch raises and rolls back the transaction.
--
-- Does NOT touch organization_can_buy(), organization_can_sell(), or is_authorized_member(). Their
-- exact definitions are captured before cleanup and compared again before commit.

begin;

do $$
declare
  fixture_tag constant text := 't010g-verify-1789077219872';

  expected_org_ids uuid[] := array[
    '73934c48-569c-4b7d-ac40-3ee850bdcc07',
    '235de6ec-2de9-43f4-9154-6282cbfbc58c'
  ]::uuid[];
  expected_app_ids uuid[] := array[
    '62ead548-c611-46e3-848e-ed6fcffb117d',
    'dd90f13f-13dc-4c9d-88d3-8396859c66be'
  ]::uuid[];
  expected_doc_ids uuid[] := array[
    'e41f8cbb-7c46-4749-9653-7512f3b5cd37',
    '4d18b2df-f4fd-46c0-9693-645357a361b9',
    'bb2d40bb-e19a-45fd-aae0-55afbec51ad3',
    'a5ffa0cf-4fe4-4ad7-afeb-faeb08469eef'
  ]::uuid[];
  expected_file_asset_ids uuid[] := array[
    '2a8ef7ce-b654-4854-8c40-61155f74f6df',
    '46424bce-bd08-4e30-8067-802fbea7b35c',
    'd670a15b-bca3-4671-b536-c98e8fab6dcf',
    'ffe81aa5-e545-4587-b8f7-685188ec825a'
  ]::uuid[];
  expected_review_ids uuid[] := array[
    'ca77be98-5f46-4919-b5b0-3eef45c94f83'
  ]::uuid[];
  expected_user_ids uuid[] := array[
    'eb4dac8e-7fc3-4e0c-a090-17552046e536',
    '237cf526-339f-4063-bda8-a40f28364e2b',
    'b74ebe9f-080d-4b20-a509-22f841ec1736'
  ]::uuid[];
  expected_profile_ids uuid[];
  retained_audit_user_ids uuid[] := array[
    '237cf526-339f-4063-bda8-a40f28364e2b',
    'b74ebe9f-080d-4b20-a509-22f841ec1736'
  ]::uuid[];
  deleted_user_ids uuid[] := array[
    'eb4dac8e-7fc3-4e0c-a090-17552046e536'
  ]::uuid[];

  fresh_org_ids uuid[];
  fresh_app_ids uuid[];
  fresh_doc_ids uuid[];
  fresh_file_asset_ids uuid[];
  fresh_review_ids uuid[];
  fresh_user_ids uuid[];
  fresh_profile_ids uuid[];

  unexpected_member_keys text[];
  unexpected_admin_ids uuid[];
  unexpected_history_ids bigint[];
  unexpected_storage_names text[];
  unexpected_legacy_review_ids uuid[];

  protected_authz_before text[];
  protected_authz_after text[];
  expected_audit_trigger_keys text[] := array[
    'public.kyb_applications:trg_audit_kyb',
    'public.kyb_documents:trg_audit_kyb_documents',
    'public.kyb_review_items:trg_audit_kyb_review_items',
    'public.organizations:trg_audit_organizations'
  ]::text[];
  actual_audit_trigger_keys text[];
  expected_cleanup_audit_delta bigint;
  audit_fixture_before bigint;
  audit_fixture_after bigint;
  retained_audit_user_one_count bigint;
  retained_audit_user_two_count bigint;
  deleted_user_audit_count bigint;
  affected_rows integer;
  profile_fk record;
  retained_user_id uuid;
  has_surviving_profile_reference boolean;
  append_only_trigger_state "char";
  application_audit_trigger_state "char";
  document_audit_trigger_state "char";
  organization_audit_trigger_state "char";
  review_audit_trigger_state "char";
begin
  -- Sort every hardcoded set once so array equality is deterministic.
  select array(select unnest(expected_org_ids) order by 1) into expected_org_ids;
  select array(select unnest(expected_app_ids) order by 1) into expected_app_ids;
  select array(select unnest(expected_doc_ids) order by 1) into expected_doc_ids;
  select array(select unnest(expected_file_asset_ids) order by 1) into expected_file_asset_ids;
  select array(select unnest(expected_review_ids) order by 1) into expected_review_ids;
  select array(select unnest(expected_user_ids) order by 1) into expected_user_ids;
  select array(select unnest(retained_audit_user_ids) order by 1) into retained_audit_user_ids;
  select array(select unnest(deleted_user_ids) order by 1) into deleted_user_ids;
  select array(select unnest(expected_audit_trigger_keys) order by 1) into expected_audit_trigger_keys;
  expected_profile_ids := expected_user_ids;

  -- Fresh tag-derived inventory. No parent is trusted from the hardcoded arrays for derivation.
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into fresh_org_ids
  from public.organizations
  where legal_name like fixture_tag || '%';

  select coalesce(array_agg(ka.id order by ka.id), '{}'::uuid[]) into fresh_app_ids
  from public.kyb_applications ka
  join public.organizations o on o.id = ka.organization_id
  where o.legal_name like fixture_tag || '%';

  select coalesce(array_agg(kd.id order by kd.id), '{}'::uuid[]) into fresh_doc_ids
  from public.kyb_documents kd
  join public.kyb_applications ka on ka.id = kd.application_id
  join public.organizations o on o.id = ka.organization_id
  where o.legal_name like fixture_tag || '%';

  select coalesce(array_agg(distinct fa.id order by fa.id), '{}'::uuid[])
  into fresh_file_asset_ids
  from public.file_assets fa
  join public.kyb_documents kd on kd.file_asset_id = fa.id
  join public.kyb_applications ka on ka.id = kd.application_id
  join public.organizations o on o.id = ka.organization_id
  where o.legal_name like fixture_tag || '%';

  select coalesce(array_agg(kri.id order by kri.id), '{}'::uuid[]) into fresh_review_ids
  from public.kyb_review_items kri
  join public.kyb_applications ka on ka.id = kri.application_id
  join public.organizations o on o.id = ka.organization_id
  where o.legal_name like fixture_tag || '%';

  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[]) into fresh_user_ids
  from auth.users u
  where u.email like fixture_tag || '%';

  select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into fresh_profile_ids
  from public.profiles p
  join auth.users u on u.id = p.id
  where u.email like fixture_tag || '%';

  if fresh_org_ids != expected_org_ids then
    raise exception 'ABORT: tagged organizations differ from the exact T010g IDs. fresh=% expected=%', fresh_org_ids, expected_org_ids;
  end if;
  if fresh_app_ids != expected_app_ids then
    raise exception 'ABORT: tagged KYB applications differ from the exact T010g IDs. fresh=% expected=%', fresh_app_ids, expected_app_ids;
  end if;
  if fresh_doc_ids != expected_doc_ids then
    raise exception 'ABORT: tagged KYB documents differ from the exact T010g IDs. fresh=% expected=%', fresh_doc_ids, expected_doc_ids;
  end if;
  if fresh_file_asset_ids != expected_file_asset_ids then
    raise exception 'ABORT: tagged file assets differ from the exact T010g IDs. fresh=% expected=%', fresh_file_asset_ids, expected_file_asset_ids;
  end if;
  if fresh_review_ids != expected_review_ids then
    raise exception 'ABORT: tagged review items differ from the exact T010g IDs. fresh=% expected=%', fresh_review_ids, expected_review_ids;
  end if;
  if fresh_user_ids != expected_user_ids then
    raise exception 'ABORT: tagged Auth users differ from the exact T010g IDs. fresh=% expected=%', fresh_user_ids, expected_user_ids;
  end if;
  if fresh_profile_ids != expected_profile_ids then
    raise exception 'ABORT: tagged profiles differ from the exact T010g IDs. fresh=% expected=%', fresh_profile_ids, expected_profile_ids;
  end if;

  -- Derive the expected audit delta from the freshly re-derived rows that this transaction will
  -- delete from every table with confirmed live write_audit_log() DELETE coverage.
  expected_cleanup_audit_delta :=
      cardinality(fresh_doc_ids)
    + cardinality(fresh_review_ids)
    + cardinality(fresh_app_ids)
    + cardinality(fresh_org_ids);

  -- Identity proof: each owning actor must itself be one of the exact tagged users.
  if exists (
    select 1 from public.organizations o
    where o.id = any (expected_org_ids) and not (o.created_by = any (expected_user_ids))
  ) then
    raise exception 'ABORT: a T010g organization has a creator outside the exact fixture-user set.';
  end if;

  if exists (
    select 1 from public.kyb_applications ka
    where ka.id = any (expected_app_ids) and not (ka.submitted_by = any (expected_user_ids))
  ) then
    raise exception 'ABORT: a T010g application has a submitter outside the exact fixture-user set.';
  end if;

  if exists (
    select 1 from public.kyb_review_items kri
    where kri.id = any (expected_review_ids) and not (kri.reviewer_user_id = any (expected_user_ids))
  ) then
    raise exception 'ABORT: the T010g review item has a reviewer outside the exact fixture-user set.';
  end if;

  if exists (
    select 1 from public.file_assets fa
    where fa.id = any (expected_file_asset_ids)
      and (
        not (fa.uploaded_by = any (expected_user_ids))
        or fa.object_path not like '%' || fixture_tag || '%'
        or fa.bucket_name <> 'kyb-evidence'
      )
  ) then
    raise exception 'ABORT: a T010g file asset fails exact uploader/path/bucket identity proof.';
  end if;

  -- These sets were captured as empty. Any current row is new/unapproved state, so abort instead of
  -- deleting it defensively.
  select coalesce(
    array_agg(om.organization_id::text || ':' || om.user_id::text order by om.organization_id, om.user_id),
    '{}'::text[]
  ) into unexpected_member_keys
  from public.organization_members om
  where om.organization_id = any (expected_org_ids) or om.user_id = any (expected_user_ids);
  if unexpected_member_keys != '{}'::text[] then
    raise exception 'ABORT: expected zero T010g organization memberships; found %.', unexpected_member_keys;
  end if;

  select coalesce(array_agg(pa.user_id order by pa.user_id), '{}'::uuid[]) into unexpected_admin_ids
  from public.platform_admins pa
  where pa.user_id = any (expected_user_ids) or pa.created_by = any (expected_user_ids);
  if unexpected_admin_ids != '{}'::uuid[] then
    raise exception 'ABORT: expected zero T010g platform-admin rows; found %.', unexpected_admin_ids;
  end if;

  select coalesce(array_agg(kr.id order by kr.id), '{}'::uuid[]) into unexpected_legacy_review_ids
  from public.kyb_reviews kr
  where kr.application_id = any (expected_app_ids) or kr.reviewer_user_id = any (expected_user_ids);
  if unexpected_legacy_review_ids != '{}'::uuid[] then
    raise exception 'ABORT: unexpected legacy kyb_reviews rows would be cascade-deleted: %.', unexpected_legacy_review_ids;
  end if;

  -- Policy A: never delete immutable account history. Since organization deletion would cascade it,
  -- require the exact fixture-linked history set to be empty before any mutation.
  select coalesce(array_agg(ash.id order by ash.id), '{}'::bigint[]) into unexpected_history_ids
  from public.account_status_history ash
  where ash.organization_id = any (expected_org_ids) or ash.changed_by = any (expected_user_ids);
  if unexpected_history_ids != '{}'::bigint[] then
    raise exception 'ABORT: account_status_history exists for T010g IDs and must be retained: %.', unexpected_history_ids;
  end if;

  -- Storage bytes must be deleted through the supported Storage API, never by direct table mutation.
  select coalesce(array_agg(so.name order by so.name), '{}'::text[]) into unexpected_storage_names
  from storage.objects so
  where so.bucket_id = 'kyb-evidence' and so.name like '%' || fixture_tag || '%';
  if unexpected_storage_names != '{}'::text[] then
    raise exception 'ABORT: tagged T010g Storage objects exist: %. Delete them through the Supabase Storage API, then rerun this cleanup.', unexpected_storage_names;
  end if;

  -- Confirm the exact live audit-principal truth before preserving/deleting any identity.
  select count(*) into retained_audit_user_one_count
  from public.audit_logs
  where actor_user_id = '237cf526-339f-4063-bda8-a40f28364e2b'::uuid;
  select count(*) into retained_audit_user_two_count
  from public.audit_logs
  where actor_user_id = 'b74ebe9f-080d-4b20-a509-22f841ec1736'::uuid;
  select count(*) into deleted_user_audit_count
  from public.audit_logs
  where actor_user_id = 'eb4dac8e-7fc3-4e0c-a090-17552046e536'::uuid;

  if retained_audit_user_one_count <> 3
     or retained_audit_user_two_count <> 9
     or deleted_user_audit_count <> 0 then
    raise exception 'ABORT: live audit-principal counts drifted (retained-one=%, retained-two=%, delete-target=%; expected 3/9/0).',
      retained_audit_user_one_count, retained_audit_user_two_count, deleted_user_audit_count;
  end if;

  select count(*) into audit_fixture_before
  from public.audit_logs al
  where (al.entity_type = 'kyb_documents' and al.entity_id = any (expected_doc_ids))
     or (al.entity_type = 'kyb_review_items' and al.entity_id = any (expected_review_ids))
     or (al.entity_type = 'kyb_applications' and al.entity_id = any (expected_app_ids))
     or (al.entity_type = 'organizations' and al.entity_id = any (expected_org_ids));

  -- Assert exact live write_audit_log() coverage for every table this transaction deletes. The
  -- expected audited deletes are 4 documents + 1 review item + 2 applications + 2 organizations.
  select coalesce(
    array_agg(
      format('%I.%I:%I', table_namespace.nspname, table_class.relname, t.tgname)
      order by table_namespace.nspname, table_class.relname, t.tgname
    ),
    '{}'::text[]
  ) into actual_audit_trigger_keys
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
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
    and pn.nspname = 'public'
    and p.proname = 'write_audit_log';

  if actual_audit_trigger_keys != expected_audit_trigger_keys then
    raise exception 'ABORT: write_audit_log trigger coverage drifted. actual=% expected=%',
      actual_audit_trigger_keys, expected_audit_trigger_keys;
  end if;

  -- Capture exact protected definitions so this transaction can prove they were not touched.
  protected_authz_before := array[
    pg_get_functiondef('public.organization_can_buy(uuid)'::regprocedure),
    pg_get_functiondef('public.organization_can_sell(uuid)'::regprocedure),
    pg_get_functiondef('public.is_authorized_member()'::regprocedure)
  ];

  select tgenabled into append_only_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_prevent_kyb_review_item_mutation';
  select tgenabled into application_audit_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_applications'::regclass
    and tgname = 'trg_audit_kyb'
    and tgtype = 29; -- AFTER ROW INSERT OR DELETE OR UPDATE
  select tgenabled into document_audit_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_documents'::regclass
    and tgname = 'trg_audit_kyb_documents'
    and tgtype = 29;
  select tgenabled into organization_audit_trigger_state
  from pg_trigger
  where tgrelid = 'public.organizations'::regclass
    and tgname = 'trg_audit_organizations'
    and tgtype = 29;
  select tgenabled into review_audit_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_audit_kyb_review_items'
    and tgtype = 29;

  if append_only_trigger_state is distinct from 'O' then
    raise exception 'ABORT: append-only review trigger is not enabled (state=%).', append_only_trigger_state;
  end if;
  if application_audit_trigger_state is distinct from 'O'
     or document_audit_trigger_state is distinct from 'O'
     or organization_audit_trigger_state is distinct from 'O'
     or review_audit_trigger_state is distinct from 'O' then
    raise exception 'ABORT: cleanup audit trigger is missing, disabled, or not AFTER ROW INSERT/UPDATE/DELETE (applications=%, documents=%, organizations=%, review_items=%).',
      application_audit_trigger_state,
      document_audit_trigger_state,
      organization_audit_trigger_state,
      review_audit_trigger_state;
  end if;

  -- ONLY the append-only mutation blocker is bypassed, ONLY for the exact synthetic review row.
  -- The review audit trigger stays enabled and records the DELETE.
  alter table public.kyb_review_items disable trigger trg_prevent_kyb_review_item_mutation;

  delete from public.kyb_review_items where id = any (expected_review_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(expected_review_ids) then
    raise exception 'ABORT: expected % review-item deletion(s), got %.', cardinality(expected_review_ids), affected_rows;
  end if;

  alter table public.kyb_review_items enable trigger trg_prevent_kyb_review_item_mutation;

  select tgenabled into append_only_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_prevent_kyb_review_item_mutation';
  if append_only_trigger_state is distinct from 'O' then
    raise exception 'ABORT: append-only review trigger was not immediately restored (state=%).', append_only_trigger_state;
  end if;

  delete from public.kyb_documents where id = any (expected_doc_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(expected_doc_ids) then
    raise exception 'ABORT: expected % KYB-document deletion(s), got %.', cardinality(expected_doc_ids), affected_rows;
  end if;

  delete from public.file_assets where id = any (expected_file_asset_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(expected_file_asset_ids) then
    raise exception 'ABORT: expected % file-asset deletion(s), got %.', cardinality(expected_file_asset_ids), affected_rows;
  end if;

  delete from public.kyb_applications where id = any (expected_app_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(expected_app_ids) then
    raise exception 'ABORT: expected % KYB-application deletion(s), got %.', cardinality(expected_app_ids), affected_rows;
  end if;

  delete from public.organizations where id = any (expected_org_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(expected_org_ids) then
    raise exception 'ABORT: expected % organization deletion(s), got %.', cardinality(expected_org_ids), affected_rows;
  end if;

  -- Inspect EVERY live FK that targets public.profiles(id), after business-row cleanup and before
  -- deleting the sole audit-unreferenced profile. Any surviving reference aborts the transaction.
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
  loop
    execute format(
      'select exists (select 1 from %s where %I = $1)',
      profile_fk.referencing_table,
      profile_fk.referencing_column
    )
    into has_surviving_profile_reference
    using deleted_user_ids[1];

    if has_surviving_profile_reference then
      raise exception 'ABORT: delete-target profile is still referenced by constraint % on %.%.',
        profile_fk.conname, profile_fk.referencing_table, profile_fk.referencing_column;
    end if;
  end loop;

  -- The retained profiles may survive only as audit principals. Prove dynamically across every
  -- live FK that no non-audit business row references either identity.
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
        raise exception 'ABORT: retained audit principal has non-audit reference via constraint % on %.%.',
          profile_fk.conname, profile_fk.referencing_table, profile_fk.referencing_column;
      end if;
    end loop;
  end loop;

  -- Preserve the two immutable audit principals but make them unusable at the application gate.
  update public.profiles
  set is_blocked = true,
      blocked_at = now(),
      blocked_by = null,
      block_reason = 'T010g retained audit principal — test identity disabled'
  where id = any (retained_audit_user_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(retained_audit_user_ids) then
    raise exception 'ABORT: expected to disable % retained profiles, got %.',
      cardinality(retained_audit_user_ids), affected_rows;
  end if;

  delete from public.profiles where id = any (deleted_user_ids);
  get diagnostics affected_rows = row_count;
  if affected_rows <> cardinality(deleted_user_ids) then
    raise exception 'ABORT: expected % audit-unreferenced profile deletion(s), got %.',
      cardinality(deleted_user_ids), affected_rows;
  end if;

  -- Auth users deliberately remain for the separate service-role Auth Admin step.
  if (
    select coalesce(array_agg(u.id order by u.id), '{}'::uuid[])
    from auth.users u
    where u.id = any (expected_user_ids) and u.email like fixture_tag || '%'
  ) != expected_user_ids then
    raise exception 'ABORT: exact Auth users are not intact for the subsequent Auth Admin cleanup.';
  end if;

  -- Exact-ID public-schema post-checks, before commit.
  if exists (select 1 from public.organizations where id = any (expected_org_ids))
     or exists (select 1 from public.kyb_applications where id = any (expected_app_ids))
     or exists (select 1 from public.kyb_documents where id = any (expected_doc_ids))
     or exists (select 1 from public.file_assets where id = any (expected_file_asset_ids))
     or exists (select 1 from public.kyb_review_items where id = any (expected_review_ids))
     or exists (select 1 from public.organization_members where organization_id = any (expected_org_ids) or user_id = any (expected_user_ids))
     or exists (select 1 from public.platform_admins where user_id = any (expected_user_ids) or created_by = any (expected_user_ids))
     or exists (select 1 from public.profiles where id = any (deleted_user_ids)) then
    raise exception 'ABORT: exact public-schema fixture residue remains after deletion.';
  end if;

  if (
    select count(*)
    from public.profiles
    where id = any (retained_audit_user_ids)
      and is_blocked = true
      and blocked_at is not null
      and blocked_by is null
      and block_reason = 'T010g retained audit principal — test identity disabled'
  ) <> cardinality(retained_audit_user_ids) then
    raise exception 'ABORT: retained audit-principal profiles are not present and fully disabled.';
  end if;

  select count(*) into audit_fixture_after
  from public.audit_logs al
  where (al.entity_type = 'kyb_documents' and al.entity_id = any (expected_doc_ids))
     or (al.entity_type = 'kyb_review_items' and al.entity_id = any (expected_review_ids))
     or (al.entity_type = 'kyb_applications' and al.entity_id = any (expected_app_ids))
     or (al.entity_type = 'organizations' and al.entity_id = any (expected_org_ids));
  if audit_fixture_after <> audit_fixture_before + expected_cleanup_audit_delta then
    raise exception 'ABORT: expected % retained cleanup audit events; audit count changed from % to %.',
      expected_cleanup_audit_delta, audit_fixture_before, audit_fixture_after;
  end if;

  protected_authz_after := array[
    pg_get_functiondef('public.organization_can_buy(uuid)'::regprocedure),
    pg_get_functiondef('public.organization_can_sell(uuid)'::regprocedure),
    pg_get_functiondef('public.is_authorized_member()'::regprocedure)
  ];
  if protected_authz_after is distinct from protected_authz_before then
    raise exception 'ABORT: a protected authorization function changed during cleanup.';
  end if;

  select tgenabled into append_only_trigger_state
  from pg_trigger
  where tgrelid = 'public.kyb_review_items'::regclass
    and tgname = 'trg_prevent_kyb_review_item_mutation';
  if append_only_trigger_state is distinct from 'O' then
    raise exception 'ABORT: append-only review trigger is not enabled before commit.';
  end if;

  raise notice 'Public cleanup passed. business fixture residue = zero; nine cleanup DELETE audit events and two disabled synthetic audit principals intentionally retained for immutable audit integrity. Run the Auth Admin cleanup next.';
end $$;

commit;
