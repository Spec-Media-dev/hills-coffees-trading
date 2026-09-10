# Tasks: Authentication, Membership & KYB (003)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md),
`docs/architecture/DATABASE-CAPABILITY-MAP.md`, `.specify/memory/constitution.md` (v2.0.0),
SRS §3, §4, §13.2–13.3.

**Status**: all tasks unchecked — implementation NOT started.
**Prerequisite**: 001 implemented (identity DAL, Supabase clients, server-action contract, state
components, i18n, test tooling + fixtures).

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Eligibility layer (the gate everything else uses)

- [x] T001 [PS6] Create `lib/auth/eligibility.ts` translating 001's `RequestIdentity` into
  presentation answers (`canReachTrading`, `canBuy`, `canSell`, `blockingReason`, `nextAction`)
  using only the approved DB functions — no re-derivation of "ACTIVE + approved KYB".
  - Req: FR-005, FR-006, SC-001 | Depends: —
  - Verify: `grep -n "status ===\|kyb" lib/auth/eligibility.ts` shows no hand-rolled eligibility rule; all answers trace to `organization_can_buy/sell` / `is_authorized_member`
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single translation point between the database's authorization truth and every UI gate; a wrong abstraction here propagates into every later feature.

- [x] T002 [PS6] Add acting-organization resolution for multi-membership users (explicit selection,
  implicit when exactly one) in `lib/auth/eligibility.ts` + identity extension.
  - Req: FR-005, Edge Cases | Depends: T001
  - Verify: a user seeded into two organizations must choose; every mutation records the acting org id
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: ambiguous acting context is a real authorization hazard (acting for the wrong org).

- [x] T003 [P] Create `lib/auth/agreements.ts` — current agreement types/versions/hashes registry and
  a gate check for "has this org accepted the current version?".
  - Req: FR-014, PS5 | Depends: —
  - Verify: bumping a version in the registry causes the gate to report unaccepted for previously-accepted orgs
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: small module, but the version-bump semantics must be exactly right.

---

## Phase 2 — Authentication experience

- [x] T004 Create the public, non-indexable `src/app/(auth)/layout.tsx` shell.
  - Req: FR-018, FR-019 | Depends: —
  - Verify: route emits non-indexable metadata; renders 001's state components
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small layout with an explicit metadata requirement.

- [x] T005 [PS1] Implement sign-in (`src/app/(auth)/sign-in/page.tsx` + `actions.ts`) with Zod
  validation, generic failure messaging, and post-sign-in routing based on `eligibility.ts`.
  - Req: FR-001, FR-002, SC-005 | Depends: T001, T004
  - Verify: wrong password and unknown email produce byte-identical responses; a member with no org lands on the onboarding state, not a broken dashboard
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: authentication entry point; the non-disclosure requirement is easy to violate accidentally.

- [x] T006 [PS1] Implement sign-out (`src/app/(auth)/sign-out/actions.ts`) clearing the session
  server-side.
  - Req: FR-003 | Depends: T004
  - Verify: after sign-out, the next `/dashboard` request is denied server-side with no cache purge
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: small, but session-teardown correctness is security-relevant.

- [x] T007 [P] [PS7] Implement email verification handling (`verify-email/page.tsx`) and the gated-
  action prompt for unverified users.
  - Req: FR-001, PS7 | Depends: T004
  - Verify: an unverified user attempting a gated action is prompted to verify first
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard provider flow wiring.

- [x] T008 [P] [PS7] Implement password reset request + completion (`reset-password/`) with identical
  responses regardless of account existence.
  - Req: FR-002, PS7, SC-005 | Depends: T004
  - Verify: responses for existing and non-existing addresses are indistinguishable
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: enumeration-resistance is a security property that must be verified, not assumed.

- [x] T009 [PS7] Implement MFA enrolment and challenge (`mfa/page.tsx` + `actions.ts`) using Supabase
  Auth factors; enforcement flag left configurable pending the policy decision.
  - Req: FR-001, SEC-005 | Depends: T005
  - Verify: an enrolled user cannot reach protected data before completing the challenge
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: MFA bypass is a critical failure mode; the challenge must gate data, not just UI.

- [x] T010 Confirm no global rate limiter was introduced and Supabase-native auth protections are
  relied upon.
  - Req: FR-004 | Depends: T005–T009
  - Verify: `grep -rniE "ratelimit|redis|upstash" src/app/\(auth\) lib/auth` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional check.

---

## Phase 3 — Membership application entry (bounded by DB-BLOCK-03)

- [ ] T011 [PS2] Create `lib/validation/membership-application.ts` (company identity, contact,
  intended activity buy | buy+sell, consent).
  - Req: FR-008 | Depends: —
  - Verify: schema rejects missing consent and unknown activity values
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical schema.

- [ ] T012 [PS2] Implement `src/app/dashboard/onboarding/page.tsx` — the truthful state screen for a
  signed-in user with no organization: what happens next, who acts, how to follow up.
  - Req: FR-007, FR-019 | Depends: T001, T011
  - Verify: the screen names a specific next step and owner; it never implies self-service org creation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the copy must be honest about a blocked capability without looking broken — a judgment call.

- [ ] T013 [PS2] Implement the application-entry Server Action
  (`src/app/dashboard/onboarding/actions.ts`) that validates and routes to the approved
  admin-mediated path. **It MUST NOT create `organizations` or `organization_members` rows by any
  mechanism** (DB-BLOCK-03).
  - Req: FR-008, SEC-001, SC-007-adjacent | Depends: T011, T012
  - Verify: `grep -n "from('organizations')\|from('organization_members')\|SERVICE_ROLE" src/app/dashboard/onboarding/actions.ts` returns nothing; a code comment cites DB-BLOCK-03
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the temptation to "just insert the org" here would silently break the approved authorization model.

---

## Phase 4 — KYB draft & evidence model

- [ ] T014 [P] Create `lib/validation/kyb-application.ts` — company, ownership/control, users,
  banking and agreement evidence field schemas per SRS §4.1.
  - Req: FR-009, FR-010 | Depends: —
  - Verify: schema mirrors the SRS §4.1 evidence table; no invented required field
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: schema must match an external requirements table exactly.

- [ ] T015 Create `lib/kyb/completeness.ts` — maps a draft to the specific list of missing evidence
  items (never a generic message).
  - Req: FR-010 | Depends: T014
  - Verify: a draft missing two documents returns exactly those two named items
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused rule module with a clear contract.

- [ ] T016 [PS3] Implement KYB draft create/edit (`src/app/dashboard/kyb/page.tsx` + actions) writing
  `kyb_applications` in `DRAFT` under RLS.
  - Req: FR-009, FR-016 | Depends: T014, T001
  - Verify: a member of the owning org can edit; a member of another org is refused by RLS
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: first real member-scoped write; RLS behaviour must be confirmed, not assumed.

- [ ] T017 [PS3] Implement `lib/kyb/documents.ts` — `file_assets` + `kyb_documents` record modelling
  with private classification, and a **single isolated upload seam** that is inert until a Storage
  bucket is approved (DB-BLOCK-01).
  - Req: FR-012, FR-013, SEC-001, SC-007 | Depends: T016
  - Verify: no code path writes bytes anywhere (no public bucket, no base64 column, no third-party store); the seam is one clearly-marked function with a comment citing DB-BLOCK-01
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: private-document handling is the highest-consequence area in this feature (AC-08) and the blocker must be respected precisely.

- [ ] T018 [PS3] Implement KYB submission Server Action: server-side completeness validation → status
  `DRAFT → SUBMITTED` with `submitted_by`/`submitted_at`; refuse blocked users.
  - Req: FR-010, FR-011, FR-016 | Depends: T015, T016
  - Verify: incomplete submission returns the specific missing list and does not change status; a blocked user is refused server-side
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: a state transition gating all trading; must fail closed and must not bypass the DB's own constraints.

---

## Phase 5 — KYB status & member-facing states

- [ ] T019 [PS4] Build the status timeline/state screens for all seven KYB statuses using the approved
  vocabulary and 001's state components.
  - Req: FR-006, FR-019, SC-003 | Depends: T016
  - Verify: each of the seven statuses renders its exact label and a correct next action
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: repetitive but must match a closed vocabulary exactly.

- [ ] T020 [PS4] Implement `RESUBMISSION_REQUIRED` handling: show the specific outstanding items plus
  a direct action to fix them.
  - Req: FR-010, PS4 | Depends: T015, T019
  - Verify: the screen lists named items ("Certified trade licence — expired") and links to the exact step
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's hardest content rule ("name what is missing") applied to real data.

- [ ] T021 [PS4] Surface `REJECTED` / `SUSPENDED` with the compliance-recorded reason and no trading
  entry point.
  - Req: FR-006, PS4, SC-004 | Depends: T019, T001
  - Verify: with a suspended org, no trading CTA renders and protected actions refuse server-side
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: UI-and-server agreement on a denial state is security-relevant.

- [ ] T022 Surface expired KYB documents (`kyb_documents.expires_at` past) as an authorization problem
  with a clear remediation path.
  - Req: FR-013, Edge Cases | Depends: T019
  - Verify: a seeded expired document produces a visible, actionable warning rather than silence
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: straightforward once the status layer exists.

---

## Phase 6 — Agreements

- [ ] T023 [PS5] Build the agreement presentation + acceptance UI (`components/account/agreements/`).
  - Req: FR-014, PS5 | Depends: T003
  - Verify: each required agreement type renders with its version and is individually acceptable
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard component work over an explicit registry.

- [ ] T024 [PS5] Implement the acceptance Server Action recording type, version, document hash,
  timestamp, IP and user agent into `agreement_acceptances`.
  - Req: FR-014, SC-006 | Depends: T003, T023
  - Verify: a recorded acceptance contains all five evidence fields; a blocked user is refused
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: legal-evidence capture; a missing field undermines the record's purpose.

- [ ] T025 [PS5] Wire the agreement gate into trading entry points (unaccepted current version blocks,
  with the reason shown).
  - Req: FR-014, PS5 | Depends: T003, T024, T001
  - Verify: bumping a version re-gates a previously-accepted organization on its next request
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: a cross-cutting gate that later features inherit.

---

## Phase 7 — Organization & profile self-service

- [ ] T026 [P] Implement organization contact self-service via `update_organization_contact()`.
  - Req: FR-015, FR-016 | Depends: T001
  - Verify: the action calls the approved function; direct table writes to `organizations` are absent
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused action over an existing DB function.

- [ ] T027 [P] Extend the member profile surface (from 001's proof) into the real profile screen using
  `update_my_profile()`.
  - Req: FR-015 | Depends: —
  - Verify: profile updates persist and are scoped to the caller
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: extends an already-proven pattern.

- [ ] T028 [P] Render the organization membership view (members, `member_role`, acting-org switcher).
  - Req: FR-005, T002 | Depends: T002
  - Verify: a member sees only their own organization's membership rows
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: read-only view over an RLS-protected table.

---

## Phase 8 — Test fixtures extension

- [ ] T029 Extend 001's `scripts/seed-test-fixtures.ts` with KYB-state variants: org with
  `PENDING_KYB`, org `UNDER_REVIEW`, org `ACTIVE`+`APPROVED`, org `SUSPENDED`, user with no
  organization, user in two organizations, blocked user.
  - Req: SC-001..SC-004 | Depends: —
  - Verify: `npm run test:seed` creates all variants idempotently and `--teardown` removes them
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: privileged fixture tooling whose isolation boundary (service-role only in scripts) must hold.

---

## Phase 9 — Authorization & isolation tests

- [ ] T030 [P] Write `tests/auth/isolation.test.ts`: org A member cannot read org B's
  `kyb_applications`, `kyb_documents`, or `agreement_acceptances`.
  - Req: SEC-002, SC-002, AC-08 | Depends: T029, T016
  - Verify: `npm test -- isolation` passes; each cross-org read returns empty/denied
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the release-blocking cross-tenant guarantee (SRS AC-08).

- [ ] T031 [P] Write `tests/auth/eligibility-freshness.test.ts`: flipping org status / KYB status
  between two resolutions changes the second result without re-authentication.
  - Req: FR-005, SC-001, SC-004 | Depends: T001, T029
  - Verify: `npm test -- eligibility-freshness` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: proves no stale authorization caching — the core promise of the identity layer.

- [ ] T032 [P] Write `tests/auth/kyb-transitions.test.ts`: incomplete submission blocked with named
  items; valid submission moves `DRAFT → SUBMITTED`; blocked user refused.
  - Req: FR-010, FR-011 | Depends: T018, T029
  - Verify: `npm test -- kyb-transitions` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: state-transition correctness against DB constraints.

- [ ] T033 [P] Write `tests/auth/session.test.ts`: sign-out denies the next protected request; MFA
  challenge gates data; auth errors do not disclose account existence.
  - Req: FR-002, FR-003, SC-005 | Depends: T005, T006, T009
  - Verify: `npm test -- session` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: session/MFA behaviours are security assertions, not UI assertions.

- [ ] T034 Write `tests/auth/agreements.test.ts`: acceptance evidence completeness and version-bump
  re-gating.
  - Req: FR-014, SC-006 | Depends: T024, T025
  - Verify: `npm test -- agreements` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: clear assertions over a small module.

---

## Phase 10 — Accessibility, states, RTL

- [ ] T035 Accessibility and state pass across all auth/KYB screens (labels, error association, focus,
  landmarks) plus loading/empty/error/unauthorized/suspended states.
  - Req: FR-019, FR-020 | Depends: Phases 2–7
  - Verify: automated a11y check reports no critical violations; every screen has all applicable states
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: forms + denial states need contextual judgment to be genuinely usable.

- [ ] T036 RTL/logical-property and externalised-copy pass across this feature's screens.
  - Req: FR-020 | Depends: Phases 2–7
  - Verify: `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/\(auth\) src/app/dashboard/kyb src/app/dashboard/onboarding` returns nothing; no inline hardcoded UI strings
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

---

## Phase 11 — Verification & closure

- [ ] T037 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T038 Verify no service-role usage and no document bytes stored anywhere in this feature.
  - Req: SEC-001, SC-007, FR-012 | Depends: T037
  - Verify: `grep -rn "SERVICE_ROLE" src lib components` returns nothing; no upload transport is active
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: confirming a deliberately-unbuilt capability stayed unbuilt requires judgment about what counts as a workaround.

- [ ] T039 Manual authorization sweep: suspended org, rejected org, unattached user, blocked user,
  multi-org user — confirm UI and server agree in every case.
  - Req: SC-003, SC-004 | Depends: T037
  - Verify: for each fixture, UI shows the correct state and a direct protected action is refused server-side
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: cross-cutting judgment that the whole eligibility model behaves coherently.

- [ ] T040 Update `docs/architecture/IMPLEMENTATION-ROADMAP.md` status for 003 and re-confirm
  DB-BLOCK-01/DB-BLOCK-03 remain open and unbypassed.
  - Req: spec.md Open items | Depends: T037
  - Verify: roadmap row accurate; capability-map blockers unchanged unless formally resolved
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting.

---

## Dependencies & parallelisation

- Phase 1 blocks Phases 3–7 (everything gates on `eligibility.ts`).
- Phase 2 depends only on T004 internally; T007/T008 are mutually parallel.
- Phase 8 (fixtures) may run in parallel with Phases 2–7 and blocks Phase 9.
- Phase 9's four test tasks are mutually parallel.
- Phase 11 depends on everything.

**Parallel-safe tasks**: T003, T007, T008, T014, T026, T027, T028, T030, T031, T032, T033 (11 of 40).
