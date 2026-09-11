# Contract: KYB DB + Private Storage Foundation (RUN DB — T010b–T010g)

**Status**: Repository-side contract, migration written and NOT applied. DB-BLOCK-01 and
DB-BLOCK-03 remain OPEN until this migration is reviewed, applied, and live-verified (see T010g).

This document fixes the exact security contract that
`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql` implements, so the migration is
reviewable against a stated intent rather than reverse-engineered from SQL.

## Revision (post-security-review)

A migration security review of the first draft found ten issues. Every section below already
describes the REVISED behaviour; this list is the map from finding to fix, for reviewers comparing
against the earlier draft:

1. **Immutable/trusted document reviews** — `kyb_review_items` is no longer `FOR ALL` for
   Compliance. It is SELECT-only on the base table; the only write path is `create_kyb_review(...)`
   (§5), which derives `reviewer_user_id`/`created_at` itself and never accepts them as input. A new
   trigger (`prevent_kyb_review_item_mutation`) unconditionally refuses UPDATE/DELETE — the ledger is
   append-only even for a trusted-looking caller.
2. **Document version/replacement integrity** — the lineage trigger now also requires
   `document_type` to match between a document and the one it supersedes, and a new partial unique
   index (`uq_kyb_documents_supersedes_document_id`) makes replacement branching (two documents
   superseding the same prior one) structurally impossible. There is no longer any RLS-granted direct
   UPDATE path to `kyb_documents` at all (see #3), so there is nothing left to validate at UPDATE time.
3. **No destructive evidence admin policy** — `kyb_documents_admin_write` (compliance/admin `ALL`)
   and `kyb_evidence_admin_all` (storage `ALL`) are both **removed**, not narrowed. Compliance/Admin
   keep read access (`kyb_documents_member_select` already includes them; `kyb_evidence_member_select`
   grants them unconditional read via `kyb_storage_object_authorized`). No runtime caller — staff
   included — can UPDATE or DELETE stored evidence or review history.
4. **Storage object → metadata integrity** — `attach_kyb_document` now requires the exact
   `(bucket_id, name)` row to exist in `storage.objects` before it will create `file_assets` /
   `kyb_documents` rows, and cross-checks caller-provided MIME/size against `storage.objects.metadata`
   when that metadata is present (tolerant when absent — see the inline comment on why, and the
   explicit residual T010g live-verification note).
5. **Safe resubmission** — `resubmit_kyb_application` now refuses to transition while any current
   (non-superseded) document is `REJECTED`.
6. **create_kyb_draft concurrency** — confirmed the authoritative guard is a pre-existing partial
   unique index on `kyb_applications(organization_id)` already in `supabase/trading_schema.sql`
   (unrelated to this migration). Added a per-organization advisory lock plus a graceful
   `unique_violation` catch so a race never surfaces a raw constraint error to a caller.
7. **Multi-org onboarding** — `start_organization_onboarding`'s existing-membership check is now a
   plain `EXISTS`, never an `ORDER BY ... LIMIT 1` pick. The conflict response names no organization
   at all; picking among a multi-org caller's memberships is left entirely to the existing
   acting-organization resolver.
8. **Blocked admin/member storage behaviour** — `kyb_storage_object_authorized` now checks
   `is_blocked_user()` **before** the admin/compliance short-circuit, so a blocked identity cannot
   bypass the block by also holding a `platform_admins` row.
9. **Rollback safety** — the rollback file now refuses to run (raises before any `DROP`/`DELETE`) if
   it detects real review history, real document version/status state, or any real object in the
   `kyb-evidence` bucket.
10. **Regression** — 36 new/revised static tests across `tests/auth/controlled-onboarding.test.ts`,
    `tests/auth/kyb-storage.test.ts`, `tests/auth/kyb-review-items.test.ts`, and the new
    `tests/auth/kyb-rollback-safety.test.ts` cover every finding above.

## 0. Hard constraints carried over unmodified

The migration does **not** create, replace, or alter:

- `public.organization_can_buy(uuid)`
- `public.organization_can_sell(uuid)`
- `public.is_authorized_member()`

Their live, audited bodies (confirmed against `docs/database/database-schema-report.json`) are
unchanged. All new capability below is additive and reads/writes tables these functions already
depend on (`organizations.status`, `.can_buy`, `.can_sell`, `kyb_applications.status`) without
touching their logic.

No historical migration file is edited. This is one new additive file.

No Realtime publication is touched. No Supabase dashboard automation is used. Nothing in this
migration is applied to the live project by this run.

## 1. Controlled organization onboarding — `start_organization_onboarding(...)`

```
start_organization_onboarding(
  p_legal_name text,
  p_display_name text,
  p_account_type text,      -- 'BUYER' | 'SELLER' only
  p_country_code text,
  p_tax_number text,
  p_registration_number text,
  p_email text,
  p_phone text
) returns jsonb
```

**Caller**: any `authenticated` role member. `SECURITY DEFINER`, fixed
`search_path = pg_catalog, public, auth`, `EXECUTE` revoked from `PUBLIC`/`anon`, granted to
`authenticated` and `service_role` only.

**Preconditions checked inside the function (fail closed, `raise exception` on violation)**:

1. `auth.uid()` must exist (`forbidden`).
2. Caller must not be `is_blocked_user()` (`forbidden`).
3. Caller's `auth.users.email_confirmed_at` must be non-null — checked directly against `auth.users`
   since the function's `search_path` includes `auth` and it runs as the (superuser-owned) function
   definer (`email_not_verified`). This is the DB-side email-verification check the task requires
   "wherever technically available."
4. `p_account_type` must be exactly `'BUYER'` or `'SELLER'` (`invalid_account_type`). `HILLS_INTERNAL`
   is never accepted from this path.
5. `p_legal_name` must be non-empty (`legal_name_required`).
6. `p_country_code`, if provided, must be exactly 2 characters (`invalid_country_code`).

**Idempotency / retry / existing-membership rule**:

- An advisory transaction lock keyed on the caller (`pg_advisory_xact_lock(hashtext(auth.uid()::text))`)
  serializes concurrent calls from the *same* user, so a double-submit (double-click, retried POST)
  cannot race past the membership check below.
- If the caller already has at least one **active** `organization_members` row (any organization),
  the function does **not** create a second organization. It returns
  `{"ok": false, "conflict": "already_member"}` and creates nothing. The check is a plain `EXISTS` —
  it never ranks or names a specific organization for a multi-org caller (revision fix #7: an earlier
  draft used `ORDER BY ... LIMIT 1`, which implicitly picked "the first" organization, exactly the
  acting-organization anti-pattern T002's resolver exists to prevent). Which organization is relevant
  for a multi-org caller is entirely the existing acting-organization resolver's job
  (`lib/auth/dal.ts`), never this RPC's. This is the explicit, safe "existing membership" behavior the
  spec requires — never a silent second company, never an error that looks like a crash.
- Because the check is scoped to `auth.uid()`, a genuine retry of the *same* caller after a
  successful first call always lands on this same branch and returns the same existing organization
  — the operation is naturally idempotent per caller. A different caller replaying the same payload
  gets evaluated against **their own** membership state, never someone else's, so no cross-caller
  replay can reuse another user's result.
- Otherwise, the function atomically:
  - `insert into organizations (legal_name, display_name, account_type, country_code, tax_number,
    registration_number, email, phone, status, is_hills_internal, created_by, can_buy, can_sell)`
    with `status = 'PENDING_KYB'`, `is_hills_internal = false`, `created_by = auth.uid()`, and
    `can_buy`/`can_sell` **derived server-side only**: `BUYER → (true, false)`,
    `SELLER → (true, true)`.
  - `insert into organization_members (organization_id, user_id, member_role, is_active)` with
    `user_id = auth.uid()`, `member_role = 'OWNER'`, `is_active = true` — **only** the caller, never
    an arbitrary member/user id.
  - A duplicate `tax_number` (existing `uq_organizations_tax_number` unique index) is caught and
    re-raised as the friendlier `tax_number_already_registered` rather than a raw constraint error.
  - Returns `{"ok": true, "organization_id": <new>, "organization_status": "PENDING_KYB"}`.

**Never caller-controlled, anywhere in this function**: `status`/`ACTIVE`, `APPROVED`, `can_buy`,
`can_sell`, `created_by`, `is_hills_internal`, the membership `user_id`, `member_role`, any platform
role, or any Compliance/Admin field. No direct `organizations`/`organization_members` INSERT exists
outside this function's own body; the existing `organizations_admin_all` /
`members_admin_write` admin-only RLS policies are untouched, so the platform-admin fallback path
described in spec.md's Open Items remains available unchanged.

## 2. Constrained KYB mutations

```
create_kyb_draft(p_organization_id uuid) returns uuid
submit_kyb_application(p_application_id uuid) returns void
resubmit_kyb_application(p_application_id uuid) returns void
```

All three: `SECURITY DEFINER`, fixed `search_path`, `EXECUTE` to `authenticated`/`service_role` only,
fail closed on `auth.uid() is null`, `is_blocked_user()`, or the caller not being
`is_org_member(<the application's organization>)`.

- **`create_kyb_draft`**: idempotent against a PRE-EXISTING partial unique index on
  `kyb_applications(organization_id)` (already present in `supabase/trading_schema.sql`, scoped to the
  four "open" statuses — this migration does not recreate it). If the organization already has an
  open application (`DRAFT`/`SUBMITTED`/`UNDER_REVIEW`/`RESUBMISSION_REQUIRED`), its id is returned
  unchanged — no duplicate is created. Otherwise a new `DRAFT` row is inserted with
  `submitted_by = auth.uid()` as a placeholder (overwritten by whoever actually submits, per below).
  Revision fix #6 added a per-organization `pg_advisory_xact_lock` before the check plus a graceful
  `unique_violation` catch around the INSERT — the pre-existing index remains the actual correctness
  guarantee; the lock/catch only avoid a raw constraint error reaching a caller under a genuine race.
- **`submit_kyb_application`**: allowed source state is `DRAFT` only (`invalid_transition` otherwise).
  Sets `status = 'SUBMITTED'`, `submitted_by = auth.uid()`, `submitted_at = now()`.
- **`resubmit_kyb_application`**: allowed source state is `RESUBMISSION_REQUIRED` only. Same target
  state and server-owned fields as above. Revision fix #5: it FIRST checks that no current
  (non-`SUPERSEDED`) document on the application is still `REJECTED` (`unresolved_rejected_document`
  otherwise) — a resubmission cannot silently return uncorrected evidence to review.
- Neither function accepts or writes `decided_by`, `decided_at`, `rejection_reason`, or any other
  compliance-owned field — those remain reachable only through the existing
  `kyb_compliance_all` policy (`is_compliance_operator()`), unchanged.
- **`update_kyb_draft` is intentionally NOT implemented in this run.** `kyb_applications` currently
  has no member-editable business-data column (company/ownership/banking/evidence fields are Phase 4
  scope per `lib/validation/kyb-application.ts`, T014). Implementing a draft-content update function
  today would mean inventing fields that do not exist yet — explicitly forbidden by this run's
  instructions ("do not invent fake KYB business data"). Phase 4 (T016) adds the real columns and the
  matching `update_kyb_draft` capability in the *same* SECURITY DEFINER style established here.
- **Completeness validation boundary**: this run's `submit_kyb_application`/`resubmit_kyb_application`
  validate only *state-transition* safety (source state, membership, blocked status). Evidence
  *completeness* (which documents are required, which are missing) is Phase 4's
  `lib/kyb/completeness.ts` (T015) responsibility, called by the application layer **before** it
  invokes `submit_kyb_application`. This DB layer is not the completeness authority and does not
  pretend to be.

## 3. Private KYB Storage bucket

- Bucket id/name: `kyb-evidence`. `public = false`.
- `file_size_limit = 10485760` (10 MiB). No authoritative limit exists in the SRS or capability map;
  this is the same conservative MVP default already recorded in `plan.md` §4, chosen so it is easy to
  raise later without a schema change (just a bucket-config update).
- `allowed_mime_types = {application/pdf, image/jpeg, image/png}` — the SRS's minimum evidence formats
  (photo IDs, scanned documents), nothing broader.
- Object path contract (enforced by policy, not by convention alone):
  `org/{organization_id}/application/{application_id}/{generated_object_name}`. The generated name
  carries no semantic meaning the policy trusts — only the `organization_id`/`application_id`
  segments are authoritative, and both are re-verified against `kyb_applications` server-side (see
  §5), so a caller cannot gain access by guessing or fabricating a path with someone else's ids
  unless that combination is a real row they're already a member of.
- Storage policies (`storage.objects`, scoped to `bucket_id = 'kyb-evidence'`, `TO authenticated`
  only — no `anon` policy exists at all):
  - **SELECT**: caller is not blocked, AND EITHER `is_platform_admin()`/`is_compliance_operator()`, OR
    is an active member of the organization the path's `application_id` genuinely belongs to (§5
    helper, `p_require_editable = false`). Revision fix #8: the blocked-user check now runs BEFORE the
    admin/compliance short-circuit, so a blocked identity that also happens to hold a
    `platform_admins` row is still denied — matching every other blocked-aware function in this
    schema, which never lets a role check bypass `is_blocked_user()`.
  - **INSERT**: same organization/application check, but additionally requires the referenced
    application's status to be in `('DRAFT', 'RESUBMISSION_REQUIRED')` (§5 helper,
    `p_require_editable = true`) — matching "member upload only in member-editable states."
  - **No UPDATE, no DELETE policy for anyone, staff included (revision fix #3).** Replacing evidence
    means uploading a new object (a new path) and linking it via
    `attach_kyb_document(..., p_supersedes_document_id => ...)` (§4) — the prior object is never
    overwritten or removed by anyone. There is no separate admin `ALL` policy either: the SELECT
    policy above already grants Compliance/Admin unconditional read via the `kyb_storage_object_
    authorized(..)` helper's role short-circuit, and that is the only access they have. Any future
    approved retention/redaction deletion capability (KYB-02) must be its own narrow, audited RPC —
    not a blanket policy.
- No public URL is ever generated by anything in this migration. No browser code receives or needs
  the service-role key for any of this — access is entirely through the `authenticated`-scoped
  policies above plus the RPCs in §4/§6.

## 4. Storage/metadata write seam — `attach_kyb_document(...)`

```
attach_kyb_document(
  p_application_id uuid,
  p_document_type text,
  p_object_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_expires_at date default null,
  p_supersedes_document_id uuid default null
) returns uuid
```

`SECURITY DEFINER`, fixed `search_path`, `authenticated`/`service_role` only. This is the **only**
sanctioned way for a member to create `file_assets` + `kyb_documents` rows for KYB evidence — it does
not rely on either table's own RLS to enforce cross-organization isolation, because it derives and
validates every ownership fact itself rather than trusting the caller:

1. Resolves the application's `organization_id` server-side from `p_application_id` (never trusts a
   client-supplied org id). Fails (`application_not_found`) if the application doesn't exist.
2. `forbidden` unless caller is `auth.uid()`-present, not blocked, and `is_org_member(<that org>)`.
3. `invalid_transition` unless the application's status is `DRAFT` or `RESUBMISSION_REQUIRED`.
4. `invalid_mime_type` / `object_too_large` unless `p_mime_type` is in the same allowlist as the
   bucket and `p_size_bytes <= 10485760` — defense in depth alongside the bucket's own enforcement,
   not a replacement for it.
5. `cross_organization_object_path` unless `p_object_path` starts with the exact prefix this function
   derives itself (`'org/' || organization_id || '/application/' || p_application_id || '/'`) — the
   caller cannot point a metadata row at a path outside their own organization/application folder,
   independent of whatever the Storage policy already enforced on the actual upload.
6. **(Revision fix #4)** `storage_object_not_found` unless a row with this exact
   `(bucket_id = 'kyb-evidence', name = p_object_path)` already exists in `storage.objects` — canonical
   metadata is never created for bytes that were never actually uploaded. `bucket_id`/`name` are core,
   version-independent `storage.objects` columns, safe to rely on unconditionally.
7. **(Revision fix #4)** Best-effort cross-check: if that same `storage.objects` row's `metadata`
   JSON has a `mimetype`/`size` key, it must agree with `p_mime_type`/`p_size_bytes`
   (`mime_type_mismatch` / `size_mismatch` otherwise). This is deliberately tolerant of an absent or
   differently-shaped `metadata` value — this repository has never introspected a live
   `storage.objects` row (zero buckets existed at the last schema audit) to confirm the exact key
   names Supabase Storage uses in this project's version, so **confirming those key names against a
   real uploaded object is a required T010g live-verification step**, not assumed here.
8. If `p_supersedes_document_id` is given: the target must belong to the **same**
   `p_application_id` (`cross_application_document_replacement` otherwise) and share the **same**
   `document_type` (`cross_document_type_replacement` — revision fix #2), and a trigger (§5) marks
   it `SUPERSEDED` and computes `version = old.version + 1` — a member can never point a replacement
   at another application's document, nor re-type it into a different evidence category. A unique
   index (§5) additionally guarantees no other document already supersedes the same target.
9. Inserts `file_assets` (`uploaded_by = auth.uid()`, `organization_id = <server-derived>`,
   `bucket_name = 'kyb-evidence'`, `is_private = true`, plus the validated path/name/mime/size) and
   `kyb_documents` (`application_id`, `document_type`, the new `file_asset_id`, `expires_at`,
   `version`, `supersedes_document_id`, `status = 'PENDING'`), and returns the new document id.

`lib/kyb/documents.ts` is a thin, server-only wrapper that calls this RPC — it performs no direct
`file_assets`/`kyb_documents` table writes of its own.

**Scoping note**: `file_assets`' existing `catalog_admin_files` RLS policy is shared across every
feature that uses file attachments (disputes, shipments, payments, and this feature); this run does
not narrow it, since doing so is outside a KYB-only migration's authority and could affect unrelated
features. `attach_kyb_document` does not depend on that policy being narrow — it bypasses RLS as a
`SECURITY DEFINER` function and enforces the KYB-specific ownership rule itself, so the KYB path is
safe regardless of that table's broader (pre-existing, not introduced by this run) policy shape. This
is recorded, not silently worked around: any future hardening of `catalog_admin_files` is a separate,
cross-feature change.

`kyb_documents`' own `kyb_documents_own_or_admin` (`ALL`) policy **is** replaced by this migration,
since that table is fully KYB-scoped and low-risk to change: the ONLY remaining policy is
`kyb_documents_member_select` (`SELECT`), which covers members (own organization's documents) AND
Compliance/Admin (via the same `is_platform_admin() OR is_compliance_operator()` branch). There is no
`ALL`/write policy left on this table for anyone (revision fix #3) — member writes go exclusively
through `attach_kyb_document`; the only thing that changes a document's `status` afterward is the
`apply_kyb_review_item_decision` trigger, itself only reachable via `create_kyb_review` (§5).

## 5. Document-level review + version model

New columns on `kyb_documents`:

- `version integer not null default 1`
- `supersedes_document_id uuid references kyb_documents(id)`
- `status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REJECTED','SUPERSEDED'))`

New table `kyb_review_items`:

```
id uuid primary key default gen_random_uuid()
application_id uuid not null references kyb_applications(id) on delete cascade
document_id uuid not null references kyb_documents(id) on delete cascade
decision text not null check (decision in ('ACCEPTED','REJECTED'))
reason text
reviewer_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
```

A unique partial index, `uq_kyb_documents_supersedes_document_id`, additionally guarantees that at
most one document may ever supersede a given prior document — replacement lineage is always a
straight line, never a branching tree (revision fix #2).

Integrity triggers:

- `validate_kyb_document_lineage` (BEFORE INSERT on `kyb_documents`): if `supersedes_document_id` is
  set, the referenced document must belong to the **same** `application_id`
  (`cross_application_document_replacement`), must share the **same** `document_type`
  (`cross_document_type_replacement` — revision fix #2), must not equal the new row's own id
  (`self_replacement_not_allowed` — defensive; not reachable pre-insert in practice but checked), and
  `new.version` must equal `old.version + 1` (`invalid_document_version`). On success, the superseded
  row is updated to `status = 'SUPERSEDED'` (unless already `SUPERSEDED`, which is left alone) — old
  evidence is marked historical, never deleted or overwritten. There is deliberately no BEFORE UPDATE
  counterpart: after revision fix #3 there is no RLS-granted direct UPDATE path to `kyb_documents` for
  anyone at all, so there is nothing left to validate at UPDATE time.
- `validate_review_item_document` (BEFORE INSERT on `kyb_review_items`): the referenced `document_id`
  must belong to the same `application_id` given on the review item
  (`review_item_document_application_mismatch`).
- `apply_kyb_review_item_decision` (AFTER INSERT on `kyb_review_items`): sets the referenced
  `kyb_documents.status` to the review item's `decision`, unless that document's status is already
  `SUPERSEDED` (a superseded document's status is never resurrected by a later review event).
- `prevent_kyb_review_item_mutation` (BEFORE UPDATE OR DELETE on `kyb_review_items` — revision fix
  #1): unconditionally raises. `kyb_review_items` is an append-only ledger, the same shape as this
  schema's existing `inventory_ownership_events` (guarded by `prevent_ownership_event_mutation`) — no
  runtime caller, not even Compliance, may edit or remove a historical review event.

RLS: `kyb_review_items` carries **no** member policy, and its ONLY policy is
`kyb_review_items_compliance_select` (`SELECT`, `is_compliance_operator() OR is_platform_admin()`) —
not `ALL` (revision fix #1). There is no RLS-granted INSERT path at all; every review event is
created exclusively through `create_kyb_review(...)` below, which derives `reviewer_user_id` and
`created_at` itself and is the only place a review can ever be written from.

**Trusted review creation**: `create_kyb_review(p_application_id, p_document_id, p_decision,
p_reason)` — `SECURITY DEFINER`, `authenticated`/`service_role` only. Requires
`is_compliance_operator()`; accepts only application/document/decision/reason as input — never a
reviewer id or timestamp; requires a non-empty `p_reason` when `p_decision = 'REJECTED'`
(`reason_required_for_rejection`); verifies the document belongs to the application before inserting.
`reviewer_user_id` is always `auth.uid()` and `created_at` is always the column's own `default now()`
— both are structurally impossible for a caller to forge, because neither is a parameter this
function accepts.

**Member-facing read**: `list_kyb_document_reviews(p_application_id uuid)` — `SECURITY DEFINER`,
`STABLE`, `authenticated`/`service_role` only. Checks `is_org_member(<application's org>)`, then
returns `(document_id, decision, reason, reviewed_at, reviewer_label)` where `reviewer_label` is the
**literal constant** `'Hills Compliance'` — the real `reviewer_user_id` column is never selected into
this function's output. `lib/kyb/review-items.ts` wraps this RPC; it never queries `kyb_review_items`
directly.

Auditability: `kyb_documents` and the new `kyb_review_items` table both receive the existing
`write_audit_log()` trigger (the same mechanism already active on `organizations` and
`kyb_applications`) — no new audit mechanism is invented; the existing one is extended to the two
places this run adds meaningful mutable/append state.

## 6. Organization/application state boundary (unchanged, restated for this contract)

Nothing in this migration transitions an `organizations.status` row to `ACTIVE`, nor a
`kyb_applications.status` row to `APPROVED`. Those remain exclusively reachable through the existing
Compliance/Admin RLS (`organizations_compliance_update`, `kyb_compliance_all`), which this migration
does not touch. `organization_can_buy`/`organization_can_sell`/`is_authorized_member` therefore keep
returning `false` for every organization this migration's functions can create, until a real
Compliance decision changes that — exactly the "registration is not authorization" boundary the spec
requires.

## 7. Negative-contract checklist (see T010g / `tests/auth/*.test.ts` for the executable form)

Static/contract-verifiable in this run (no live database access required): anonymous callers hold no
grant path to any new function (`EXECUTE` is `authenticated`/`service_role` only, never `PUBLIC`); no
new function accepts caller-supplied `status`, `ACTIVE`, `APPROVED`, `can_buy`, `can_sell`,
`created_by`, `decided_by`, `decided_at`, `rejection_reason`, `member_role`, `user_id`
(membership target), a reviewer id, a review timestamp, or a platform-role value as an argument;
`HILLS_INTERNAL` is rejected by an explicit equality check, not merely undocumented; no historical
migration file is modified; no `SERVICE_ROLE` string appears in any new `lib/kyb/*.ts` file; no
Realtime publication statement exists in the migration; every new `SECURITY DEFINER` function pins
`search_path`; every new table (`kyb_review_items`) has RLS enabled with an explicit policy set
(never left policy-less); `kyb_review_items` and `kyb_documents` each expose zero RLS-granted
UPDATE/DELETE path to any runtime role; `kyb_review_items` additionally has a trigger that refuses
UPDATE/DELETE unconditionally; a unique index prevents two documents from superseding the same prior
document; `start_organization_onboarding`'s existing-membership check is a plain `EXISTS`, never an
`ORDER BY ... LIMIT 1`; the rollback file refuses to run (raises before any destructive statement) if
real review history, real document version/status state, or any real `kyb-evidence` Storage object
exists.

Requires a live applied database (deferred to T010g's manual-apply step, NOT run here): actual
cross-org denial under real RLS/Storage evaluation, actual atomicity/locking behavior under real
concurrent connections, actual bucket MIME/size enforcement by the Storage service, actual
audit-log rows appearing after a real insert, and confirming the exact `storage.objects.metadata`
JSON key names this project's Supabase Storage version actually uses (see §4 point 7).

## 8. Naming/migration file

`supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`, paired with
`20260911010000_feature_003_kyb_foundation.rollback.sql`, following the existing
`20260909000000_db_block_10_...` convention. Additive only; no historical migration is edited.
