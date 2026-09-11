# Implementation Plan: Authentication, Membership & KYB

**Feature**: `003-auth-membership-kyb` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)
**Status**: Phase 1 + Phase 2 (T001–T010) COMPLETE / VERIFIED; planning aligned; RUN DB and Phase 3+ NOT STARTED

## Summary

Feature 003 extends 001's verified authentication foundation into the approved journey:

```text
Sign Up → Verify Email → choose Buy or Buy + Sell → company basics
→ controlled organization onboarding → caller becomes OWNER
→ PENDING_KYB → private KYB evidence → Submit
→ SUBMITTED / UNDER_REVIEW → Admin/Compliance decision
→ APPROVED | REJECTED | SUSPENDED | RESUBMISSION_REQUIRED
```

The user-facing journey must remain truthful and server/DB-enforced. A new account gets no
organization, membership, capability, marketplace access, buying, selling, inventory, orders, or
business-dashboard access from Auth sign-up alone. BUYER means `can_buy = true` and
`can_sell = false`; SELLER means `can_buy = true` and `can_sell = true`. There is no seller-only
dashboard.

The completed preflight confirmed two implementation prerequisites. DB-BLOCK-03 still prevents an
ordinary verified user from creating an organization or membership, and DB-BLOCK-01 still has no
approved private Storage bucket or object policies. The next implementation must therefore be a
dedicated additive DB/Storage foundation before the real Phase 4 KYB upload/submit flow. No planning
decision below authorizes a production migration or changes an existing migration.

## Authority and current baseline

Apply this order when artifacts disagree: SRS → database capability report/map → design guidance →
this feature's spec → code. The current baseline is:

- `organizations` has `account_type` BUYER/SELLER/HILLS_INTERNAL, lifecycle statuses including
  `PENDING_KYB`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `CLOSED`, plus `created_by` and
  capability columns represented in the capability documentation.
- `organization_members` models OWNER/MEMBER and active membership, but ordinary member writes are
  not approved; the current member path is admin-mediated.
- The current approved fallback is a platform admin with an active `platform_admins` row (the
  checked-in roles are `ADMIN` and `SUPER_ADMIN`) creating the organization and then the membership;
  no public user action may promise self-service success until the controlled capability is verified.
- `kyb_applications` supports member INSERT and member/admin SELECT under current RLS, but the
  checked-in SQL does not provide member UPDATE; current member submit/resubmit is therefore not an
  approved capability.
- `kyb_documents` and `file_assets` model private document metadata, not document bytes.
- `kyb_reviews` records application-level decisions, reason, reviewer identity, and timestamp, but
  does not identify a specific rejected item/document or document version lineage.
- Any future Compliance workflow must use an approved platform-admin authority or an explicitly
  approved role mapping; planning must not invent a client-side `COMPLIANCE` privilege.
- The database report currently shows zero Storage buckets and zero Storage object policies.
- `lib/auth/dal.ts` consumes approved authorization functions, but no checked-in organization-creation
  RPC exists. The capability report/map and the checked-in canonical SQL also need post-migration
  reconciliation because the report lists some approved-function names whose definitions are not
  present in the current SQL snapshot.

## Approved target journey and hard boundary

1. Auth creates the account through real Supabase `signUp`; verification remains required.
2. A verified, non-blocked user chooses BUYER or SELLER intent and submits company basics.
3. A narrowly scoped database capability creates or obtains the organization context atomically,
   creates only the caller's OWNER membership, and leaves the organization in `PENDING_KYB`.
4. The user completes a DRAFT KYB application and uploads evidence only through the approved private
   Storage path.
5. Server/DB completeness checks allow `DRAFT → SUBMITTED → UNDER_REVIEW`; Admin/Compliance owns all
   decisions and protected fields.
6. Only the approved authorization functions can grant trading capability after the organization and
   KYB state are approved.

Until the final approval boundary is true, every route and mutation must deny or honestly explain:
marketplace access, buying, selling, inventory, orders, business dashboard modules, and all other
protected trading actions. The only member-facing areas before approval are account, onboarding,
KYB, status, profile and sign-out experiences. UI hiding is never the security boundary. The audited
`organization_can_buy(...)`, `organization_can_sell(...)`, and `is_authorized_member(...)`
implementations remain the only trading authority and require the genuine `ACTIVE` + `APPROVED`
boundary.

## Organization semantics

In the database, an `organization` is the internal representation of the customer's company or legal
entity. Member-facing copy should say company/business when that is clearer. `BUYER` means buying
only after approval; `SELLER` means buying and selling after approval (`can_buy = true`,
`can_sell = true`). SELLER is never sell-only, and the product has no separate Buyer and Seller
dashboards.

## Technical context

**Auth**: Supabase Auth email/password + MFA, `@supabase/ssr` session cookies, and 001's
`getRequestIdentity()`/Server Action contract.

**Data**: `profiles`, `organizations`, `organization_members`, `kyb_applications`, `kyb_documents`,
`kyb_reviews`, `agreement_acceptances`, `file_assets`, and `account_status_history`.

**Authorization**: server-side identity resolution plus approved DB functions/RLS. No client-side
role or status re-derivation, no public service-role key, and no runtime service-role workaround.

**Caching**: no authorization-sensitive cache. Resolve current membership, organization, KYB and
capability state per request.

**Status updates**: Realtime is not part of RUN DB, RUN A, or RUN B. Refresh from the server after
mutations and resolve fresh state on navigation; add only narrow polling while `SUBMITTED` or
`UNDER_REVIEW` if later needed. Realtime remains a separate security-reviewed enhancement after
policies and publication rules are proven.

## Execution order

The dependency-safe order is:

```text
RUN DB — T010b → T010c → T010d → T010e → T010f → T010g
                         │
                         ├── RUN A — T010a → T011 → T012 → T013
                         │
                         └── RUN B — T014 → T015 → T016 → T017 → T018
                                      → T019 → T020 → T021 → T022
                                      → Phase 6 (T023–T025) and later Feature 003 work
```

`T010a` may be implemented in parallel with the DB work because it must not create an organization
or membership. RUN A cannot truthfully close its live onboarding path until the controlled capability
from RUN DB exists. Real KYB upload and submit work must not begin against the current metadata-only
baseline.

## Architecture decisions

### 1. Sign-Up

Add non-renumbering `T010a` after T010. The sequence is Create Account → real Supabase
`auth.signUp` → Verify Email → authenticated verified unattached user → onboarding → choose BUYER
(Buy Coffee) or SELLER (Buy + Sell Coffee) → company details → controlled onboarding capability →
`PENDING_KYB` organization and caller `OWNER` membership → KYB. `auth.signUp` itself must never
create organization rows, membership rows, capabilities, or trading access. Password confirmation,
generic failures, and the existing email-verification gate remain required.

### 2. Controlled organization onboarding (RUN DB)

The new additive migration should expose one narrowly scoped, audited capability such as
`start_organization_onboarding(...)`. The exact public signature is finalized in T010b, but the
contract must require:

- `auth.uid()` as the caller and a verified identity established by the approved server-side
  auth/session contract before invocation (with a database-side check wherever technically available);
- refusal for blocked users and invalid/unknown account types;
- only BUYER or SELLER input, never HILLS_INTERNAL;
- strict validation of legal/display name, country, tax/registration and contact fields;
- server-owned `created_by`, `PENDING_KYB`, non-internal classification, and capability defaults;
- creation of exactly one OWNER membership for the authenticated caller;
- explicit, safe behavior for an existing active membership or a retried idempotency key;
- one transaction with uniqueness/locking or an equivalent retry-safe strategy;
- no caller-controlled `ACTIVE`, `APPROVED`, role, status, `can_buy`, `can_sell`, approval, reviewer,
  decision, arbitrary member/user ID, platform role, or Compliance/Admin role fields;
- no broad direct INSERT policy and no service-role dependency in browser/runtime code.

The BUYER/SELLER choice is intent captured by this controlled path; it is not a self-granted trading
permission. Approval remains a Compliance/Admin decision represented by the existing authorization
boundary.

### 3. Constrained KYB mutations

Prefer narrowly scoped server/DB capabilities such as `create_kyb_draft`, `update_kyb_draft`,
`submit_kyb_application`, and `resubmit_kyb_application`. Members may change only allowed draft or
resubmission fields for their own organization/application. They may not update status, decision,
reviewer, decision timestamp, rejection reason, organization capability, or any other compliance-
owned field. State transitions must be atomic, blocked-user aware, organization-scoped and retry-safe.

### 4. Private document bytes and Storage

Create a private bucket only in the new approved migration. The final MIME allowlist, object-size
limit, retention and scanning decisions are recorded in T010b before implementation; the conservative
planning default is PDF/JPEG/PNG and a 10 MiB per-object limit, subject to security/product approval.

Use an organization/application/document-scoped path, for example:

```text
org/{org_id}/application/{application_id}/document/{document_id}/v{version}/{safe_filename}
```

Storage policies must allow a member only within the member's own organization/application and allow
Compliance/Admin review through an approved server-mediated path. No public bucket, public URL,
browser service-role key, or fabricated Storage URL is allowed. Upload success must create/update
`file_assets` and `kyb_documents` metadata; metadata alone is never treated as proof that bytes exist.
Downloads use a server-mediated or short-lived signed path after authorization.

### 5. Document-level review and versioning

The current `kyb_reviews` application-level record is insufficient for specific rejection and
replacement workflows. Add a minimum review-item/version model in the foundation migration, proposed
as `kyb_review_items` plus version/lineage fields on `kyb_documents` (or an equivalently normalized
design approved in T010b). It must retain:

- a specific required item/document association;
- `PENDING`, `ACCEPTED`, and `REJECTED` review state;
- rejection reason, reviewer identity and review timestamp;
- real reviewer identity retained internally for audit; member-facing copy may say `Hills Compliance`
  and must not require exposing an employee's personal name;
- replacement/version number and `supersedes_document_id` lineage;
- immutable historical evidence, with old evidence marked superseded rather than overwritten;
- member replacement only while the application is in an allowed resubmission state;
- a safe transition back to review after a valid resubmission.

### 6. Honest status UX

Pending and under-review screens state that the user is waiting for Admin/Compliance. A
`RESUBMISSION_REQUIRED` screen names each rejected/missing item, reason and direct correction action.
The replacement creates new pending evidence and preserves the old review history.

## Project structure for the implementation runs

```text
supabase/migrations/<new_timestamp>_feature_003_kyb_foundation.sql  # future; not created now
src/app/(auth)/sign-up/page.tsx + actions.ts
src/app/dashboard/onboarding/page.tsx + actions.ts
src/app/dashboard/kyb/page.tsx + actions.ts
lib/validation/sign-up.ts · membership-application.ts · kyb-application.ts
lib/kyb/completeness.ts · documents.ts · mutations.ts · review-items.ts
tests/auth/controlled-onboarding.test.ts · kyb-storage.test.ts · kyb-review-items.test.ts
```

The current planning run creates none of these implementation files and does not apply SQL.

## Testing strategy

- Auth: real sign-up, verification redirect, password confirmation, generic errors, no privilege
  from Auth alone, and existing sign-in/reset/MFA regression.
- Onboarding: unverified/blocked refusal, strict field validation, BUYER/SELLER only, atomic
  OWNER creation, retry/idempotency, existing membership behavior, no self-approval and no capability
  escalation.
- Storage: private bucket, MIME/size enforcement, scoped paths, same-org authorization, cross-org
  denial, Compliance/Admin review, no public URLs, and server-mediated signed downloads.
- KYB mutation: DRAFT edit, completeness, submit, `RESUBMISSION_REQUIRED` correction/resubmit,
  decision-field protection, concurrency and blocked-user denial.
- Review/version: item-specific decisions, reasons, reviewer/timestamps, replacement lineage,
  historical retention and new pending evidence.
- Security closure: no private SSR/RSC/metadata leakage, no service-role runtime, no secrets, no
  anonymous protected access, no database-policy weakening, and no Realtime dependency.

## Constitution check

| Principle | Planned result |
|---|---|
| II — source priority | SRS and the completed database preflight govern all conflicts |
| III / IX — database authority | New behavior is additive, transactional and reviewed; no direct table workaround |
| IV — locked roots | No locked root file changes are planned |
| V / VI — surface and buyer/seller separation | One `/dashboard`; seller capability is additive, never a seller-only surface |
| VIII — server/DB authorization | Auth, membership, KYB and trading gates remain server/DB enforced |
| XI — caching/rate limiting | No auth-sensitive cache and no invented global limiter |
| XIV — security/secrets | Private Storage only, no runtime service-role, no public documents |
| XV — ambiguity | MIME/size, screening and MFA policy decisions stay explicit until approved |

## Risks and remaining blockers

| ID | Current truth | Required resolution |
|---|---|---|
| DB-BLOCK-03 | Ordinary verified users cannot create organizations/memberships; admin writes are the current approved path | T010b–T010c additive controlled onboarding capability plus negative tests |
| DB-BLOCK-01 | No private bucket/object policies; only metadata tables exist | T010b/T010d migration and real byte/policy verification |
| KYB-MUTATION-OPEN-01 | Member UPDATE/resubmit capability is not currently approved | T010e constrained mutation contract and tests |
| KYB-DOCUMENT-REVIEW-OPEN-01 | No item-level review/version lineage | T010f minimum review/version model and tests |
| Screening/MFA policy | Business/security decisions remain open | Explicit approval before enforcement or screening implementation |
| Schema/report drift | Capability report names functions absent from checked-in SQL snapshot | Reconcile canonical SQL/map/report after approved migration application |

Neither DB-BLOCK-03 nor DB-BLOCK-01 may be marked closed during planning or merely because a UI
flow exists. DB-BLOCK-03 closes only after the controlled capability is implemented, applied and
security-verified; DB-BLOCK-01 closes only after the private bucket/object policies are implemented,
applied and security-verified.

## Migration and handoff rules

- The foundation is one new additive migration named
  `supabase/migrations/<new_timestamp>_feature_003_kyb_foundation.sql`.
- Never rewrite or delete a historical migration; do not apply the migration in this planning run.
- After a reviewed application, reconcile `supabase/trading_schema.sql`,
  `docs/architecture/DATABASE-CAPABILITY-MAP.md`, and the database schema report.
- Do not mark DB-BLOCK-01/03 closed until real negative and positive capability evidence exists.
- Do not begin Feature 004 or trading modules from a UI placeholder.

## Recommended next runs

1. **RUN DB — KYB Foundation**: T010b–T010g (new RPC, private Storage, constrained mutations,
   document review/version model, security verification).
2. **RUN A — Sign-up Gap + Phase 3**: T010a, T011–T013, using only the approved capability from RUN DB.
3. **RUN B — Phase 4 + Phase 5**: T014–T022, with real private bytes and review/resubmission truth.
4. Continue Phases 6–11 after the above gates are verified.

**Recommended model/effort**:

- RUN DB — Claude Sonnet High: security-critical SQL, RLS, Storage isolation, SECURITY DEFINER
  functions, and state transitions.
- RUN A — Claude Sonnet Medium: the auth foundation exists; this is Sign-Up plus onboarding
  integration against the approved DB capability.
- RUN B — Claude Sonnet High: private file upload, KYB mutation, submission/resubmission, and
  authorization-sensitive workflow.
- Later normal UI/profile/agreement work defaults to Claude Sonnet Medium unless evidence warrants
  High. Do not reduce security verification depth.
