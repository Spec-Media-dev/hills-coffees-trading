# Feature Specification: Authentication, Membership & KYB

**Feature Directory**: `specs/003-auth-membership-kyb`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surfaces**: Public entry routes (`/`-level auth routes) + Member Portal (`/dashboard`)
**Depends on**: 001 (identity resolution, Supabase clients, server-action contract, states),
002 (entry points into this feature)

## Purpose

Turn an interested visitor into an **authorized member of an approved organization**. This feature
owns the complete authentication experience, the membership application, organization onboarding and
membership, KYB submission and status, agreement acceptance with evidence, and every member-facing
account state.

It enforces the platform's foundational rule: **registration is not authorization** (SRS AUTH-01,
Appendix D #2). Only an `ACTIVE` organization with an `APPROVED` KYB application may trade — a fact
the database already encodes in `organization_can_buy()` / `organization_can_sell()` and which this
feature must surface, never re-derive.

## Scope

### In scope

- Sign-in, sign-out, session lifecycle, email verification, password recovery, MFA enrolment/challenge.
- Membership application entry and organization onboarding hand-off.
- Organization membership context (which organization the signed-in user acts for).
- KYB application creation, draft editing, document attachment, submission.
- KYB status tracking, resubmission-required handling, rejection and suspension states.
- Agreement presentation and acceptance with version/time/IP/user-agent evidence.
- Member-facing account/organization state screens (pending, under review, more info, approved,
  rejected, suspended).
- Profile/organization contact self-service (via the approved functions).

### Out of scope

- The compliance **reviewer** experience — KYB queue, decisions, screening disposition (010).
- Buying, listing, inventory, orders, payments (005–009).
- The member dashboard shell itself (004) — this feature contributes the eligibility gate it uses.
- Sanctions/PEP/adverse-media screening integration (policy-gated; see Open items).
- Organization *record creation* where the database does not permit it (see DB-BLOCK-03).

## Actors

| Actor | Interest |
|---|---|
| **Visitor / applicant** | Create an account, apply for membership, submit company evidence, track status. |
| **Authenticated user (unattached)** | Signed in but not yet a member of any organization. |
| **Organization member (`OWNER` / `MEMBER`)** | Act for an organization; submit/track KYB; accept agreements. |
| **Compliance operator** (adjacent) | Consumes what this feature produces; decides in 010. |

## Business journeys owned

Owns Buyer-flow stages **Authentication / Membership → KYB / approval**, and the seller flow's
prerequisite ("approved seller-capable organization" — the `can_sell` capability itself is granted
by compliance in 010, surfaced here).

## Prioritized stories

### PS1 — Sign in, stay signed in safely, sign out (P1)

A user authenticates with email/password (plus MFA where enrolled), gets a server-verified session,
and can end it deliberately.

**Why P1**: everything private depends on it; 001 shipped only a minimal proof.
**Independent test**: sign in, confirm a protected route renders; sign out, confirm the same route
denies access on the very next request.

**Acceptance scenarios**

1. Given valid credentials, when submitted, then a session is established and the user lands on the
   correct destination for their eligibility state.
2. Given invalid credentials, when submitted, then a generic failure message appears that does not
   reveal whether the email exists.
3. Given a signed-in user who signs out, when they request a protected route, then access is denied
   server-side on the next request without needing a cache purge.
4. Given a user with MFA enrolled, when they sign in, then the second factor is required before any
   protected data is reachable.

### PS2 — Apply for membership and be attached to an organization (P1)

An applicant expresses intent to become a member and is attached to an organization record so that
KYB can begin.

**Why P1**: the entire member funnel blocks on this step.
**Independent test**: complete the application entry and confirm the applicant reaches a truthful
status state showing exactly what happens next and who acts.

> **Constrained by DB-BLOCK-03**: the approved baseline permits organization creation and member
> attachment **only** to platform admins. Self-service organization registration is therefore not
> implementable without an approved database change. See FR-008 and Open items.

**Acceptance scenarios**

1. Given a signed-in user with no organization, when they open the member portal, then they see an
   accurate "not yet attached to an organization" state naming the next step and its owner.
2. Given an applicant who submits the application entry, when it is recorded, then it captures
   company identity, contact, intended activity (buy / buy+sell) and consent.
3. Given the applicant, when they return later, then they can see the current state of their
   application without contacting anyone.

### PS3 — Submit a KYB application with documents (P1)

An organization member assembles company, ownership/control, user, banking and agreement evidence,
attaches documents, and submits for review.

**Why P1**: KYB approval is the gate on all trading (SRS KYB-01).
**Independent test**: create a draft, attach a document, submit, and confirm the application moves
`DRAFT → SUBMITTED` with the submitter recorded and the documents linked.

> **Constrained by DB-BLOCK-01**: no Supabase Storage bucket exists, so document **bytes** cannot be
> stored. `kyb_documents` rows and `file_assets` metadata can be modelled, but upload/download
> cannot be completed. See FR-012 and Open items.

**Acceptance scenarios**

1. Given a `DRAFT` application, when the member edits it, then changes persist and the application
   remains `DRAFT` until explicitly submitted.
2. Given a submission attempt missing a required document type, when submitted, then it is rejected
   with a specific list of what is missing — never "additional information required".
3. Given a successful submission, when it completes, then status is `SUBMITTED`, `submitted_by` is
   the acting user, and `submitted_at` is recorded.
4. Given a blocked user, when they attempt submission, then it is rejected server-side.

### PS4 — Track KYB status and respond to "resubmission required" (P2)

The member sees exactly where the application stands and, when more information is required, exactly
which items to fix and a direct route to fix them.

**Why P2**: essential to the experience, but only after submission exists.
**Independent test**: move a seeded application through each status and confirm the member-facing
state screen and its call-to-action are correct for every one.

**Acceptance scenarios**

1. Given each of `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `RESUBMISSION_REQUIRED`, `APPROVED`,
   `REJECTED`, `SUSPENDED`, when the member views status, then the correct state screen renders with
   the approved closed-vocabulary label.
2. Given `RESUBMISSION_REQUIRED`, when displayed, then the specific outstanding items and a direct
   action to resolve them are shown.
3. Given `REJECTED` or `SUSPENDED`, when displayed, then the reason recorded by compliance is shown
   and no trading entry point is offered.

### PS5 — Accept required agreements with evidence (P2)

Before trading capability is usable, the organization's authorized user accepts the platform,
purchase, storage/custody, marketplace and privacy terms, and the acceptance is evidenced.

**Why P2**: legally required before trading, and cheap to build once membership exists.
**Independent test**: accept an agreement and confirm a durable record with version, timestamp, IP
and user agent; confirm re-acceptance is required when the version changes.

**Acceptance scenarios**

1. Given an unaccepted current agreement version, when the member reaches a gated action, then they
   are prompted to accept before proceeding.
2. Given acceptance, when recorded, then agreement type, version, document hash, timestamp, IP and
   user agent are stored.
3. Given a newer agreement version, when published, then prior acceptance does not satisfy the gate.

### PS6 — Eligibility is surfaced honestly everywhere (P1)

Every member-facing surface reflects the true, database-derived eligibility of the organization —
never a cached or optimistic assumption.

**Why P1**: this is the security contract the rest of the platform inherits.
**Independent test**: with a seeded organization, flip status/KYB state in the database and confirm
the next request reflects it without sign-out.

**Acceptance scenarios**

1. Given an organization whose status becomes `SUSPENDED`, when the member makes their next request,
   then trading entry points disappear and protected actions are refused server-side.
2. Given `organization_can_buy()` is false, when the member attempts any buying action, then it is
   refused by the server regardless of what the UI showed.
3. Given a user who is a member of an approved organization, when they sign in, then capability is
   resolved from the database functions, not from a token claim.

### PS7 — Account recovery and verification (P3)

Email verification, password reset and MFA enrolment/recovery work end to end.

**Why P3**: important for real operation, but not blocking the trading funnel's first pass.
**Independent test**: run each flow to completion against the real auth provider.

**Acceptance scenarios**

1. Given a password reset request, when submitted for any address, then the response is identical
   whether or not the account exists.
2. Given an unverified email, when the user attempts a gated action, then verification is required
   first.
3. Given MFA enrolment, when completed, then subsequent sign-ins require the second factor.

## Functional Requirements

- **FR-001**: The feature MUST provide sign-in, sign-out, email verification, password reset and MFA
  enrolment/challenge using Supabase Auth, with all session verification server-side via 001's
  `getRequestIdentity()` (`getUser()`, never `getSession()`).
- **FR-002**: Authentication failures MUST return a generic message that does not disclose account
  existence.
- **FR-003**: Sign-out MUST invalidate the session such that the very next protected request is
  denied server-side.
- **FR-004**: The feature MUST rely on Supabase Auth's native protections for authentication
  endpoints and MUST NOT introduce a global application rate limiter (Constitution XI).
- **FR-005**: Eligibility MUST be derived exclusively from the approved database functions
  (`organization_can_buy`, `organization_can_sell`, `is_authorized_member`, `is_org_member`) and
  organization/KYB status — never from a JWT claim, cached snapshot, or client state.
- **FR-006**: Every member-facing account/organization state MUST render the approved closed
  vocabulary from the database (`PENDING_KYB`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`, `REJECTED`,
  `CLOSED` for organizations; `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`,
  `RESUBMISSION_REQUIRED`, `SUSPENDED` for KYB) with no invented synonyms.
- **FR-007**: A signed-in user with no organization membership MUST reach a truthful, actionable
  state screen — not an error, and not a fabricated onboarding path.
- **FR-008**: The membership application entry MUST capture company identity, contact, intended
  activity (buy, or buy + sell) and consent. **Because organization creation and member attachment
  are admin-only in the approved baseline (DB-BLOCK-03), this feature MUST NOT self-create
  `organizations` or `organization_members` rows** by any means, including service-role. It routes
  the applicant to the approved admin-mediated path and shows honest status.
- **FR-009**: A KYB application MUST be creatable in `DRAFT` and editable by any member of the owning
  organization, with `submitted_by = auth.uid()` on submission.
- **FR-010**: KYB submission MUST validate required evidence completeness server-side and, on
  failure, name the specific missing items (never a generic "additional information required").
- **FR-011**: A blocked user (`is_blocked_user()`) MUST be refused KYB submission and agreement
  acceptance server-side.
- **FR-012**: KYB document handling MUST create `kyb_documents` + `file_assets` records with private
  classification and restricted access. **Because no Storage bucket exists (DB-BLOCK-01), actual
  upload/download MUST NOT be implemented via any improvised path** (no public bucket, no
  base64-in-database, no third-party store) — the feature stops at the documented boundary.
- **FR-013**: Documents belonging to one organization MUST never be reachable by another
  organization, and access MUST be logged (SRS KYB-02, AC-08).
- **FR-014**: Agreement acceptance MUST record agreement type, version, document hash, timestamp, IP
  address and user agent, and MUST be re-required when the version changes.
- **FR-015**: Profile and organization contact self-service MUST use the approved functions
  (`update_my_profile`, `update_organization_contact`) rather than direct table writes.
- **FR-016**: All mutations MUST follow 001's Server Action contract (validate → authenticate →
  authorize → controlled data access → safe error → revalidate).
- **FR-017**: No authorization-sensitive state (identity, membership, capability, KYB status) MUST
  be placed in a shared cache; it is resolved per request.
- **FR-018**: Auth and KYB routes MUST be excluded from search indexation.
- **FR-019**: All screens MUST provide the approved states — loading, empty, error, unauthorized,
  suspended, rejected, pending — reusing 001's shared state components.
- **FR-020**: All copy MUST be externalised (001's i18n foundation) and all layouts RTL-safe.

## Security Requirements

- **SEC-001**: No service-role key usage anywhere in this feature — including for organization
  creation, document handling, or any workaround to DB-BLOCK-03/DB-BLOCK-01.
- **SEC-002**: Cross-organization isolation MUST be enforced by RLS and verified by negative tests
  (member of org A cannot read org B's KYB application, documents or agreements).
- **SEC-003**: No KYB content, document contents, tokens or credentials may appear in logs, error
  messages, analytics or client bundles.
- **SEC-004**: Session verification MUST be server-side on every protected request; UI state is never
  the boundary.
- **SEC-005**: MFA MUST be available and required for staff-adjacent accounts per SRS §13.2; the
  policy for member MFA enforcement is recorded, not invented.

## Edge Cases

- User signs in while their organization is suspended → authenticated, but every trading entry point
  is absent and protected actions refuse.
- Organization is approved while the user has a stale page open → next request reflects approval.
- Two members of the same organization edit the KYB draft simultaneously → last write wins with a
  visible "updated by" signal; no silent data loss of submitted evidence.
- A KYB application is `APPROVED` but a required agreement version is unaccepted → trading gate still
  closed, with the reason shown.
- User belongs to more than one organization → the acting organization must be explicit and
  switchable; every action records which organization it acted for.
- KYB document expires (`kyb_documents.expires_at` in the past) → surfaced as an authorization
  problem, not silently ignored (SRS KYB-01).
- Password reset requested for a non-existent account → identical response to the existing-account case.
- User attempts KYB submission with no organization → refused server-side with a truthful state.

## Success Criteria

- **SC-001**: 100% of protected requests resolve eligibility from the database on that request; zero
  rely on a cached or token-embedded capability.
- **SC-002**: A member of organization A can never read organization B's KYB application, documents,
  or agreement records — verified by automated negative tests.
- **SC-003**: Every organization and KYB status renders its approved vocabulary label with a
  correct, specific next action.
- **SC-004**: A suspended organization loses trading entry points within one request of suspension.
- **SC-005**: Zero authentication error messages disclose account existence.
- **SC-006**: Every agreement acceptance record contains version, hash, timestamp, IP and user agent.
- **SC-007**: No document byte is stored anywhere until an approved Storage bucket exists.

## Assumptions

- Supabase Auth is the identity provider (already configured in 001's environment contract).
- Manual KYB approval is the approved MVP model (SRS §16), so an admin-mediated onboarding path is
  consistent with business intent — but the exact path still needs the DB-BLOCK-03 decision.
- Agreement documents/versions are supplied by legal; this feature presents and evidences them.
- Screening (sanctions/PEP/adverse media) is policy-gated and out of scope until counsel-approved
  (SRS KYB-03).

## Open items / blockers

- **DB-BLOCK-03 (blocks PS2/FR-008)**: `organizations` has no non-admin INSERT policy and
  `organization_members` writes are admin-only, so an applicant cannot self-create an organization or
  attach themselves — yet `kyb_applications` INSERT requires `is_org_member`. A product decision is
  required: (a) admin-mediated onboarding (staff create org + attach user after an off-platform
  application), (b) an approved database change adding a controlled self-service path, or (c) a
  `SECURITY DEFINER` onboarding function approved through the database-change process.
- **DB-BLOCK-01 (blocks PS3/FR-012)**: no Storage bucket exists for private KYB documents; bucket
  provisioning plus private-access policies must be approved and audited before upload can ship.
- **KYB-03 screening**: provider, policy and refresh cadence are not approved; no screening
  integration may be invented.
- **Member MFA enforcement policy**: SRS requires MFA for members and staff; the enforcement point
  (all members vs. trading-capable members only) needs a business decision before hard enforcement.

## Dependencies

| Depends on | Why |
|---|---|
| 001-platform-foundation | Identity resolution, Supabase clients, server-action contract, state components, i18n |
| 002-public-website | Provides the entry points into this feature |
| 010-admin-operations-console | Owns the compliance reviewer side that decides these applications |
| 004-member-dashboard | Consumes the eligibility gate this feature surfaces |
