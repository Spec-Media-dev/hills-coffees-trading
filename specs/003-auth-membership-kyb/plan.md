# Implementation Plan: Authentication, Membership & KYB

**Feature**: `003-auth-membership-kyb` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Extend 001's minimal auth proof into the full authentication experience, then build the membership
and KYB layer on top of it: application entry, KYB draft/submit/status, agreement acceptance with
evidence, and honest eligibility surfacing everywhere. All authorization decisions delegate to the
approved database functions. Two approved-baseline gaps (organization self-creation, Storage
buckets) bound what can actually ship; both are recorded rather than worked around.

## Technical Context

**Auth**: Supabase Auth (email/password + MFA), `@supabase/ssr` session cookies, server-verified via
001's `getRequestIdentity()`.
**Data**: `profiles`, `organizations`, `organization_members`, `kyb_applications`, `kyb_documents`,
`kyb_reviews` (read), `agreement_acceptances`, `file_assets`, `account_status_history` (read).
**Mutations**: `update_my_profile()`, `update_organization_contact()`, direct RLS-permitted inserts
on `kyb_applications`, `kyb_documents`, `agreement_acceptances`.
**Caching**: none for authorization-sensitive state — resolved per request (Constitution XI).
**Testing**: Vitest integration tests against seeded fixtures, extending 001's fixture script with
KYB-state variants.

## Database capabilities consumed

Per `docs/architecture/DATABASE-CAPABILITY-MAP.md`:

| Need | Approved mechanism |
|---|---|
| Is this user authorized to trade? | `organization_can_buy/sell()`, `is_authorized_member()` |
| Which organization does this user belong to? | `organization_members` SELECT (`members_own_org`) |
| Create KYB application | `kyb_applications` INSERT (`is_org_member` + `submitted_by = auth.uid()` + not blocked) |
| Attach KYB documents | `kyb_documents` ALL (org member of the application's org) |
| Record agreement acceptance | `agreement_acceptances` INSERT (`user_id = auth.uid()` + org member) |
| Update own profile | `update_my_profile()` |
| Update org contact | `update_organization_contact()` |
| Read review outcomes | `kyb_reviews` (via compliance/admin-visible policies), `kyb_applications.status` |

**Not available**: creating `organizations` / `organization_members` (DB-BLOCK-03); storing document
bytes (DB-BLOCK-01).

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| II Source priority | PASS | SRS §3, §4, §13.2–13.3 → DB baseline → design system state vocabulary |
| III Database authority | PASS | Zero schema change; both blockers recorded, neither bypassed |
| IV Locked root files | PASS | No change to the three locked files |
| V Surface separation | PASS | Auth entry routes are public; member KYB surfaces live under `/dashboard` |
| VI Buyer/Seller model | PASS | `can_sell` is additive and compliance-granted; never self-asserted |
| VIII Server/DB-side authorization | PASS | FR-005, FR-016, SEC-004; RLS + functions are the boundary |
| IX Postgres transactional authority | PASS | All state transitions owned by DB constraints/triggers |
| XI Caching / rate limiting | PASS | FR-017 (no cached authorization), FR-004 (Supabase-native auth protection, no global limiter) |
| XIV Security & secrets | PASS | SEC-001..005; no service-role; private documents isolated |
| XV Ambiguity rule | PASS | DB-BLOCK-01/03, screening policy and MFA enforcement surfaced, not guessed |

## Architecture decisions

1. **Auth routes are public, member KYB surfaces are protected.** Sign-in/reset/verify live at
   `src/app/(auth)/…` (public, non-indexable). KYB submission/status lives under
   `/dashboard/onboarding` and `/dashboard/organization`, behind 001's dashboard guard.
2. **One eligibility helper, derived from the DAL.** `lib/auth/eligibility.ts` turns 001's
   `RequestIdentity` into presentation-level answers (`canReachTrading`, `blockingReason`,
   `nextAction`) without introducing a second authorization model. Every gate calls it; no page
   re-implements the rule.
3. **Acting-organization context.** Because a user may belong to more than one organization, the
   acting organization is explicit in the request identity and every mutation records it. If exactly
   one membership exists, it is selected implicitly.
4. **KYB is a draft-then-submit aggregate.** Draft edits are ordinary RLS-permitted writes;
   submission is a Server Action that validates completeness server-side, then flips status. The
   database's own status CHECK and history trigger remain the source of truth.
5. **Document handling is modelled but not activated.** The `file_assets`/`kyb_documents` shape,
   private classification and access-logging expectations are implemented; the actual upload/download
   transport is deferred behind a single, clearly-marked seam so it can be enabled the day a bucket
   is approved — with no other code change.
6. **Agreements are versioned gates.** A small registry of current agreement types/versions/hashes
   drives both the acceptance UI and the gate check; a version bump automatically re-gates.
7. **No self-onboarding fabrication.** Where DB-BLOCK-03 stops the flow, the UI states the truth and
   routes to the approved human path; no shadow organization record is created anywhere.

## Project structure (files this feature adds/edits)

```text
src/app/
├── (auth)/                          # NEW — public, non-indexable
│   ├── layout.tsx
│   ├── sign-in/page.tsx + actions.ts
│   ├── sign-out/actions.ts
│   ├── verify-email/page.tsx
│   ├── reset-password/page.tsx + actions.ts
│   └── mfa/page.tsx + actions.ts
└── dashboard/
    ├── onboarding/page.tsx + actions.ts      # NEW — application entry + status
    ├── organization/page.tsx + actions.ts    # NEW — org contact, membership, agreements
    └── kyb/page.tsx + actions.ts             # NEW — KYB draft, documents, submit, status

lib/auth/
├── eligibility.ts                   # NEW — RequestIdentity → gate answers
└── agreements.ts                    # NEW — current versions/hashes + gate check

lib/validation/
├── sign-in.ts · reset-password.ts · kyb-application.ts · membership-application.ts   # NEW

lib/kyb/
├── documents.ts                     # NEW — file_assets/kyb_documents modelling + upload seam
└── completeness.ts                  # NEW — required-evidence rules → specific missing items

components/account/                  # NEW — auth forms, state screens, KYB wizard steps,
                                     #       agreement acceptance, status timeline

tests/auth/                          # NEW — session, eligibility, isolation, KYB state tests
```

## Testing strategy

- **Authorization negatives (highest value)**: org A cannot read org B's KYB application/documents/
  agreements; blocked user refused; suspended org loses capability on the next request.
- **Eligibility freshness**: flip `organizations.status` and KYB status between two resolutions and
  assert the second reflects reality.
- **State coverage**: every KYB and organization status renders its approved label and next action.
- **Submission completeness**: missing required evidence produces a specific item list, not a generic
  message.
- **Agreement evidence**: acceptance records all five evidence fields; version bump re-gates.
- **Auth behaviour**: identical responses for existent/non-existent accounts; sign-out denies the
  next protected request; MFA challenge required when enrolled.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-03** — no self-service organization creation | PS2 cannot fully ship | Build application entry + truthful status; route to the admin-mediated path; escalate the decision |
| **DB-BLOCK-01** — no Storage bucket | PS3 document upload cannot ship | Model records + isolate a single upload seam; ship nothing that stores bytes elsewhere |
| Screening policy unapproved | KYB-03 unimplementable | Out of scope until counsel-approved; recorded in spec |
| MFA enforcement policy undecided | Cannot hard-enforce for members | Ship enrolment + challenge; enforcement flag awaits the decision |
| Multi-organization users | Ambiguous acting context | Explicit acting-organization in identity + recorded on every mutation |
