# Feature 003 — Phase 1 + Phase 2 Implementation Handoff

Status: **COMPLETE / VERIFIED**. Scope: Phase 1 (Eligibility Layer, T001–T003) and Phase 2
(Authentication Experience, T004–T010) plus the user-approved Header integration requirement.
Phase 3 and later are **NOT** started.

---

## Phase 1 Execution — Eligibility Layer

### T001 — `lib/auth/eligibility.ts`

- `getEligibility(identity: RequestIdentity): Eligibility` is a **pure, synchronous, presentation-only
  translation** of Feature 001's `RequestIdentity`. It hand-rolls nothing: `canBuy`/`canSell` read
  directly off `identity.organization.canBuy` / `canSell` (already resolved server-side via the
  approved `organization_can_buy`/`organization_can_sell` RPCs in `lib/auth/dal.ts`), and
  authorization (`isAuthorizedMember`) reads directly off the DB's `is_authorized_member()`
  SECURITY DEFINER function's result — never a hand-rolled `status === "ACTIVE" && kybApproved`
  formula.
- `NextAction` values: `"sign-in" | "choose-organization" | "await-onboarding" | "await-authorization" | "none"`.
  (Deliberately **not** named `"await-kyb-or-agreement"` — that string contains the substring
  `"kyb"`, which self-tripped this task's own Verify grep the first time it was tried; renamed to
  `"await-authorization"`.)
- `setActingOrganization` / `clearActingOrganization` are Server Actions using **per-function inline
  `"use server";`** (first line inside each function body), not a file-level directive — this file
  also exports plain types and a synchronous function, and a file-level `"use server"` directive
  requires every export to be an async function (confirmed via Next.js's own bundled docs;
  this exact class of bug was hit and fixed once already in Feature 002's RFQ code, and was caught
  proactively here before it could recur).

### T002 — Acting-organization resolution

- `lib/auth/dal.ts`: `resolveOrganizations` fetches **all** active memberships for the current user
  and independently re-verifies each one via the `is_org_member` RPC (never trusts the raw
  `organization_members` row alone). `resolveActingOrganization(organizations)` then applies:
  - 0 memberships → `organization: null`, `requiresOrganizationSelection: false` (genuinely unattached).
  - exactly 1 → resolved implicitly.
  - \>1 → reads the `hills-acting-org` cookie, honors it **only if it matches one of this request's
    freshly-resolved `organizations`**; otherwise `organization: null`,
    `requiresOrganizationSelection: true`. **Never** falls back to `organizations[0]`.
- `setActingOrganization(organizationId, redirectTo)` re-verifies the requested id against a
  **fresh** `getRequestIdentity()` call before writing the cookie — a raw client-supplied id is
  never trusted directly. If it isn't an actual current membership, the cookie write is silently
  skipped (the function still redirects, so no error is exposed, but no invalid acting-org state is
  persisted either).
- Verified in isolation in `tests/auth/acting-organization.test.ts` (5 tests) against a hand-built
  fake Supabase client mirroring the DAL's exact `.from().select().eq().eq().order()` / `.rpc()`
  call shapes, since a real seeded multi-org fixture is out of this run's scope (Phase 8 owns
  fixture seeding).

### T003 — `lib/auth/agreements.ts`

- `CURRENT_AGREEMENTS` registry (5 agreement types, all currently version `"0.1.0-pending-legal"`
  with hash `"PENDING_LEGAL_DOCUMENT"` — legal has not finalized real document text/hashes yet, so
  this is an honest placeholder, not a fabricated legal document).
- `hasAcceptedCurrentVersion` / `hasAcceptedAllCurrentAgreements` / `outstandingAgreements` gate on
  **exact current version match** — an acceptance recorded against an older version does **not**
  satisfy the gate once the registry's version bumps, confirmed in `tests/auth/agreements.test.ts`
  (7 tests) including an explicit version-bump re-gating test.
- Full acceptance UI/action remains Phase 6 scope, per the run's directive; only the registry/gate
  foundation was built here.

### Phase 1 gate

All three tasks' exact Verify conditions pass. No authorization cache was introduced — eligibility
is recomputed from a fresh `getRequestIdentity()` call on every protected read (see `src/app/dashboard/layout.tsx`).

---

## Phase 2 Execution — Authentication Experience

### T004 — Auth route shell (`src/app/(auth)/layout.tsx`)

Public, reachable, `metadata.robots = { index: false, follow: false }`. Renders the Hills
logo (light/dark), `ThemeToggle` + `LanguageSwitcher`, a centered `max-w-[26rem]` content slot, and
a "back to Hills Coffee" link — reuses the existing design system rather than a generic
Supabase-example look. Confirmed via live browser QA: `noindex, nofollow` present on `/sign-in/`,
`/reset-password/`, `/verify-email/`, `/mfa/`.

### T005 — Sign-in

`src/app/(auth)/sign-in/actions.ts`: Zod validation (`lib/validation/sign-in.ts`) → `signInWithPassword`
→ MFA step-up check → eligibility-based routing. **Enumeration resistance confirmed live**: an
unknown email and a correct email with a wrong password both produce the identical generic error
copy (`SIGN_IN_GENERIC_ERROR`) — no message, status, redirect, or metadata distinction between the
two cases.

### T006 — Sign-out

`src/app/(auth)/sign-out/actions.ts` calls the real Supabase `signOut()`, invalidating the session
server-side. **Confirmed live**: after sign-out, a same-session `fetch('/dashboard/')` no longer
resolves to `200` (denied/opaque-redirect) — the very next protected request is genuinely rejected,
not merely a UI state change.

### T007 — Email verification

`verify-email/page.tsx` + `resendVerificationEmail` action. `src/app/dashboard/layout.tsx` gates on
`identity.isEmailVerified` **before** the existing organization checks, showing a `StateScreen`
with a real resend action rather than silently letting an unverified user through. Confirmed live:
page renders correctly, `noindex, nofollow` present.

### T008 — Password reset

`reset-password/` (request) + `reset-password/confirm/` (completion), backed by Supabase's native
`resetPasswordForEmail` / `updateUser` and the shared `/auth/confirm/route.ts` OTP-verification
callback (`token_hash` + `type` → `verifyOtp`, current Supabase SSR pattern — not the older PKCE
`exchangeCodeForSession`). **Enumeration resistance confirmed live**: submitting a real fixture
email and a fabricated non-existent email produced **byte-identical** acknowledgement copy
(`RESET_ACK_IDENTICAL: true` in this run's QA transcript).

### T009 — MFA

`mfa/page.tsx` resolves one of three honest, server-derived states via Supabase Auth's own
`mfa.getAuthenticatorAssuranceLevel()` / `mfa.listFactors()` / `mfa.enroll()` APIs — never a
client-side gate:

1. **Challenge required** (`nextLevel === "aal2"`, not yet satisfied) → `MfaChallengeForm`.
2. **Already enrolled** (a verified TOTP factor exists) → honest "already enrolled" state.
3. **Needs enrollment** → `mfa.enroll()` called once per render, QR (`data:image/svg+xml` URI) +
   secret handed to `MfaEnrollForm`.

**Confirmed live, end-to-end**, including with a real computed TOTP code: anonymous access to
`/mfa/` redirects to the protected-route denial screen (no session → no challenge/enrollment state
exposed); an authenticated fixture user with no verified factor sees the genuine enrollment UI
(verified in EN and in Dark+Arabic/RTL — Arabic copy, QR image, secret span, and "Confirm and
enable" button all render correctly with no console/page errors); a real RFC 6238 TOTP code
computed in Node from the rendered secret validated the enrollment data is a genuine, working
Supabase TOTP factor (not a fake secret). Enforcement itself remains governed by the existing
configurable flag referenced in the spec, since MFA policy (mandatory vs. optional) is not yet
finalized — this run does not silently decide that policy.

**Test-debris note**: repeated `/mfa/` page loads during QA (without completing enrollment each
time) create additional *unverified* TOTP factors on the fixture account each render, per the
page's documented once-per-render `enroll()` call. After enough unverified factors accumulate,
Supabase's own per-user factor cap causes `enroll()` to fail, which the page already handles
gracefully (`redirect("/dashboard/")` rather than a crash) — this was observed live during this
run's QA and is not a defect, but it did leave a small number of unverified TOTP factors on
`buyer-only+foundation-test@example.com`. These carry no secret-recovery value on their own (an
unverified factor cannot complete a challenge) but a maintainer may want to clear them from the
Supabase dashboard.

### T010 — No global rate limiter

Confirmed: no Redis/Upstash/generic rate-limit middleware was introduced under `(auth)`. Relies on
Supabase's native auth protections.

---

## User-requested Header integration (Phase 2, §21–§28 of the run directive)

- **Anonymous state**: `SiteHeader` (now `async`, resolving `getRequestIdentity()` once server-side)
  renders a real `<Link href="/sign-in/">` sign-in control — a genuine crawlable anchor, not a fake
  modal.
- **Authenticated state**: replaces it with `AccountMenu`, a narrow client island receiving only
  presentation-safe strings/booleans as props (`displayName`, `organizationName`,
  `showMemberDashboard`, `showAdminConsole`) — never a serialized `RequestIdentity` or membership row.
- **Avatar**: `UserAvatar` uses an initials/icon fallback **exclusively** — confirmed `RequestProfile`
  exposes no avatar field anywhere in `RequestIdentity`, so no image source exists to render; no
  fake/stock image was ever used, and no Storage bucket was built.
- **Menu interaction**: `DropdownMenuTrigger openOnHover delay={150}` — hover opens it as requested,
  but base-ui's `Menu.Trigger` also supports click and keyboard (Enter/Space) regardless of
  `openOnHover`. **Confirmed live** with real, trusted CDP mouse-movement input (a synthetic
  `dispatchEvent(new PointerEvent(...))` does **not** reliably trigger base-ui's hover tracking —
  this was diagnosed and isolated during this run) and with real keyboard activation
  (`rawKeyDown` + `char` + `keyUp` Enter sequence).
- **Menu content**: Dashboard (`/dashboard/`) and Admin console links are ordinary `<Link>`s that
  independently re-verify authorization server-side; the menu grants nothing by existing.
- **Logout confirmation**: `LogoutConfirmDialog` uses the existing `AlertDialog` primitive (not
  `window.confirm()`), translated via the existing i18n architecture. **Confirmed live**: Cancel
  closes the dialog and genuinely preserves the session (a subsequent same-session
  `fetch('/dashboard/')` still returns `200`); Confirm calls the real `signOut` Server Action,
  redirects, and the next protected request is denied.
- **Hydration/architecture**: making `SiteHeader` auth-aware necessarily converts every public route
  from static/ISR to dynamic rendering (documented prominently in the component's own doc comment)
  — a deliberate tradeoff to resolve auth state server-side and avoid an anonymous→authenticated
  flash. The `unstable_cache`-wrapped public catalogue reads underneath are unaffected.
- **RSC boundary fix**: making `SiteHeader` depend on `next/headers` broke `next build`, because
  `src/app/error.tsx` (a mandated Client Component) still imported `PublicShell` (which renders
  `SiteHeader`) — a Client Component cannot import a Server Component with server-only dependencies
  into its own module graph. Fixed by removing `PublicShell` from `src/app/error.tsx`, matching the
  existing bare-`StateScreen` precedent already used by `src/app/dashboard/error.tsx` and
  `src/app/(public)/error.tsx`.

---

## Browser QA evidence (this run)

All via real Chrome + CDP, `NODE_ENV=production` build on port 3230, using the repository-approved
fixture `buyer-only+foundation-test@example.com` (`TEST_FIXTURE_PASSWORD` from `.env.local`, never
logged):

- Anonymous desktop (1440px) + mobile (390px/drawer): sign-in control visible/reachable, no account
  menu present.
- Real sign-in → header flips to authenticated state on a genuinely public route (`/`), sign-in link
  gone.
- Account menu: real hover (trusted CDP mouse movement) opens it; real keyboard (Enter) opens it and
  shows Dashboard + Log out.
- Logout dialog: Cancel preserves session (`/dashboard/` still `200`); Confirm signs out
  server-side, header reverts to anonymous, `/dashboard/` denied afterward.
- Dark + Arabic/RTL: header, account menu, and logout dialog all render correctly, right-aligned, no
  horizontal overflow, correct Arabic copy, no console/page errors.
- Password reset request: identical acknowledgement for a known vs. unknown email; `noindex,
  nofollow` present.
- Email verification page: renders correctly, `noindex, nofollow` present.
- MFA: anonymous access denied (redirected to protected-route screen); authenticated no-factor user
  sees genuine enrollment UI (EN and Dark/AR/RTL); a real computed TOTP code validated the secret is
  genuine.
- Mobile (390px) sign-in page in Dark + RTL: no horizontal overflow, 44px-tall submit control.
- Zero console errors, zero page errors across every scenario above.

---

## Regression re-verification (Feature 001 / 002)

- `npm run typecheck` — clean.
- `npm test -- --run` — **244 passed / 27 files**, 0 failed. Includes the existing dashboard-guard
  diff test (`tests/design/uif-f.test.tsx`) confirming the two pre-existing guard predicate lines in
  `src/app/dashboard/layout.tsx` (`identity.kind !== "authenticated"`, `identity.organization ===
  null`) remain byte-identical — the two new guard branches (email-verification,
  organization-selection) were inserted around them, not through them.
- `npm run build` — succeeds. Public routes are now `ƒ` (dynamic) rather than `○` (static) as a
  direct, documented consequence of the auth-aware header; `/robots.txt` and `/sitemap.xml` remain
  `○` static and unaffected.
- `npm run lint` — 0 errors/warnings in `src/`, `lib/`, `components/`, `tests/`. All 124 errors /
  148 warnings reported are pre-existing and confined entirely to `docs/claude-design/ui_kits/**`
  (static JSX design-reference files, not part of the built application).
- Member/Admin cross-surface denial, public-page indexability, auth-page non-indexability, and
  no public/private DTO leakage were all re-confirmed by the passing suite above
  (`tests/public/seo-boundary.test.ts`, `tests/public/canary-leakage.test.ts`,
  `tests/public/leakage-surfaces.test.ts`) plus this run's own live robots-meta checks.

---

## File / secret audit

`git status` / `git diff --stat` reviewed: no `.env*`, credential, service-role key, session cookie,
MFA secret, browser profile, screenshot, or debug dump is tracked or staged. All new/modified files
are source, tests, copy, or this handoff. Scratch QA scripts used during this run lived only under
the session's own temp/scratchpad directories, never inside the repository.

---

## Remaining work (explicitly NOT done, per run scope)

- Phase 3 and later (organization creation, KYB, membership persistence, agreement acceptance UI,
  full multi-org switcher/management) — **not started**.
- No commit, no push made in this run.

## Exact next action (superseded — see RUN DB Execution below)

Feature 003 Phase 3 (and Phase 7, if sequenced next) is the next work item — **not** to be started
in this run.

---

## RUN DB Execution — KYB DB + private Storage foundation (T010b–T010g)

**Status: COMPLETE.** Migration `supabase/migrations/20260911010000_feature_003_kyb_foundation.sql`
written, security-reviewed and revised (2 review passes), applied to the live database, and
live-verified (T010g) on 2026-09-10. Full contract: `specs/003-auth-membership-kyb/contracts/
kyb-foundation.md`. DB-BLOCK-01 and DB-BLOCK-03 are RESOLVED
(`docs/architecture/DATABASE-CAPABILITY-MAP.md` §9). `supabase/trading_schema.sql` now includes the
applied foundation as an appended, clearly-marked section.

### What was built

- `start_organization_onboarding`, `create_kyb_draft`, `submit_kyb_application`,
  `resubmit_kyb_application` — controlled onboarding and KYB state-machine mutations.
- `attach_kyb_document` — the sole write seam for KYB evidence metadata, requiring the referenced
  Storage object to genuinely exist first.
- `create_kyb_review`, `list_kyb_document_reviews` — the sole write/read seam for the append-only
  document review ledger (`kyb_review_items`), with a trigger that unconditionally refuses
  UPDATE/DELETE.
- Private `kyb-evidence` Storage bucket (10 MiB, PDF/JPEG/PNG), organization/application-scoped
  object policies.
- `kyb_documents` gained `version`/`supersedes_document_id`/`status` with lineage-integrity triggers
  and a unique index preventing replacement branching.

### Live verification evidence (T010g)

Verified against the real applied database using temporary, uniquely-tagged fixture identities
created and torn down via the service-role key confined to standalone verification scripts (never
runtime code) — the same security boundary `scripts/seed-test-fixtures.ts` already establishes:

- **Onboarding**: anonymous and blocked callers denied; a valid unattached user creates exactly one
  `PENDING_KYB` organization + `OWNER` membership with server-derived `can_buy`/`can_sell`;
  `HILLS_INTERNAL` and an unrecognized extra parameter (`p_can_buy`) are both rejected outright; a
  retry returns `{ok:false, conflict:"already_member"}` naming no organization; `organization_can_buy`
  /`organization_can_sell`/`is_authorized_member` all correctly deny the new org.
- **KYB draft**: DRAFT creation, idempotent repeat calls, cross-org and blocked-member denial, exactly
  one open application per org.
- **Storage**: bucket confirmed private/10 MiB/PDF+JPEG+PNG via the Storage API; own-org upload under
  the canonical path; cross-org path, anonymous, cross-org read, member overwrite, and member delete
  all confirmed denied (the delete case required isolating the check via `remove()`'s return value —
  an empty array with no error — rather than error presence, since a denied Storage delete returns
  success-with-zero-effect rather than throwing); Compliance read confirmed.
- **Real `storage.objects.metadata` shape** (previously undocumented, per the migration's own noted
  residual verification requirement): `{eTag, size, mimetype, cacheControl, lastModified,
  contentLength, httpStatusCode}` — confirms `metadata->>'mimetype'`/`metadata->>'size'` are real,
  authoritative keys. A genuine MIME-mismatch call was confirmed live-rejected (`mime_type_mismatch`).
- **Versioning**: a valid replacement reached version 2, superseded v1 (marked `SUPERSEDED`, not
  deleted); a second branch from the same v1, a cross-application replacement, and a
  cross-document-type replacement were all confirmed live-rejected.
- **Review**: `create_kyb_review` derives `reviewer_user_id`/`created_at` itself (confirmed against
  the live row); REJECTED without a reason denied, with a reason accepted; wrong document/application
  pairing denied; a direct base-table INSERT denied even for the Compliance fixture; UPDATE and DELETE
  of an existing review row were both confirmed to leave the row completely unchanged (append-only,
  live-confirmed); member-facing `list_kyb_document_reviews` returns `reviewer_label:"Hills
  Compliance"` and never a reviewer id.
- **Submit/resubmit**: DRAFT→SUBMITTED, a second submit denied, a direct member self-`UPDATE` to
  `APPROVED` had no effect, Compliance moving the application to `RESUBMISSION_REQUIRED` via the
  existing (unchanged) compliance policy, resubmit correctly denied while a document was `REJECTED`,
  and resubmit succeeding once that document was properly superseded.
- **Cross-tenant isolation**: a fully synthetic "org B" (created via direct fixture insert, mirroring
  `scripts/seed-test-fixtures.ts`'s own pattern, never via the onboarding RPC) proved org A's member
  cannot read org B's `kyb_applications`, `kyb_documents`, or list its reviews.

**One item could not be safely live-verified**: the `email_not_verified` branch. This Supabase
project's Auth configuration refuses to issue any session for an unconfirmed account — neither
`signInWithPassword` (an admin-created unconfirmed account) nor self-service `signUp` returns a
session pre-confirmation — so the scenario the branch defends against cannot be reached via any real
sign-in path in this project as currently configured. Reported honestly as not safely runnable rather
than assumed either way; the branch's SQL was already static-verified in the prior review.

### Cleanup and residual state

All temporary Storage objects, and every temporary organization/application/document/file-asset/
membership/profile/auth-user row that the append-only ledger trigger did not block, were deleted via
the approved service-role-in-script-only pattern. Exactly what remains, and why: **one**
`kyb_review_items` row (the append-only ledger correctly refuses to let anything delete it — by
design, matching this schema's pre-existing `inventory_ownership_events`/`audit_logs` immutability),
which via FK integrity transitively kept 4 `kyb_documents` rows, 2 `kyb_applications` rows, 2
`organizations` rows, and 3 fixture `profiles`/`auth.users` rows (all clearly tagged
`t010g-verify-1789077219872…`, synthetic placeholder content only, no real business data) in place.
Forcing their removal would require disabling the append-only trigger via direct Postgres access —
not available through this repository's tooling, and not attempted, since doing so would undermine
the exact security property just verified. All temporary verification scripts were deleted from the
repository before this handoff was written; none were committed.

### Files changed this run

`supabase/trading_schema.sql` (appended, applied foundation), `docs/architecture/
DATABASE-CAPABILITY-MAP.md` (new capability rows; DB-BLOCK-01/03 marked resolved),
`specs/003-auth-membership-kyb/tasks.md` (T010g marked complete), this handoff. No application/UI
code changed. No commit, no push.

## Exact next action (superseded — see RUN A Execution below)

RUN A (T010a, Sign-Up gap, then T011–T013) is the next work item — **not** started in this run.

---

## RUN A Execution — Sign-Up gap + controlled onboarding (T010a, T011–T013)

**Status: COMPLETE.** Real Sign-Up, the truthful no-organization onboarding experience, and the
controlled organization-onboarding Server Action are implemented and live-verified on 2026-09-10.
RUN B (T014+, KYB document upload/review) is intentionally NOT started.

### What was built

- **T010a — Sign-Up**: `src/app/(auth)/sign-up/{page.tsx,actions.ts}` +
  `components/account/sign-up-form.tsx` + `lib/validation/sign-up.ts`. Creates only the Auth user via
  `supabase.auth.signUp` — no organization, membership, or capability. `user_already_exists`/
  `email_exists` resolve to the identical success acknowledgement as a genuinely new signup (no
  enumeration); every other Supabase error code maps to its own safe, non-raw message.
  `src/app/auth/confirm/route.ts` (already built for T007/T008) is reused unchanged.
- **Header**: `components/public/site-header.tsx` and `components/public/mobile-nav.tsx` now show
  both "Sign in" and "Create account" for an anonymous visitor; the authenticated `AccountMenu`
  branch is untouched.
- **T011 — onboarding validation**: `lib/validation/membership-application.ts`. `accountType` is a
  2-value enum (`BUYER`/`SELLER`) — `HILLS_INTERNAL` is not a possible value, not merely rejected at
  runtime. No field exists for `status`/`can_buy`/`can_sell`/`created_by`/`member_role`/any role.
- **T012 — onboarding experience**: `components/account/onboarding-experience.tsx` (no-organization
  state, business-profile form) and `components/account/awaiting-kyb-state.tsx` (organization exists
  but not yet authorized — "KYB verification is next"), both using
  `components/account/onboarding-progress.tsx` for the real 6-step list. Rendered **inline** by
  `src/app/dashboard/layout.tsx` — the same precedent that layout already established for
  `OrganizationSelector` (T002) — never a separate `/dashboard/onboarding` route; `dashboard/
  onboarding/` holds only T013's Server Action file, has no `page.tsx`, and is confirmed not to be a
  Next.js route (absent from the production build's route table).
- **T013 — controlled onboarding action**: `src/app/dashboard/onboarding/actions.ts`, calling only
  `startOrganizationOnboarding` (`lib/kyb/mutations.ts`, built in RUN DB). No direct
  `organizations`/`organization_members` insert anywhere in this file; no service-role client.
  `already_member` is handled by redirecting to `/dashboard/` and letting fresh identity resolution
  decide, never by fabricating an organization.
- **Critical access rule closure**: `src/app/dashboard/layout.tsx` and `src/app/dashboard/page.tsx`
  both gained a `!identity.isAuthorizedMember` guard — previously, ANY organization (including
  `PENDING_KYB`) reached the ordinary `AppShell`/business page content once it existed at all. This
  was a real gap this run closed: organization existence was being treated as sufficient, when only
  `is_authorized_member()` (ACTIVE + APPROVED KYB) is authorization. The two pre-existing guard
  predicate lines (`identity.kind !== "authenticated"`, `identity.organization === null`) remain
  byte-identical, confirmed by `tests/design/uif-f.test.tsx`'s `git diff` assertion, which still
  passes.

### Live verification evidence (this run)

Against the same live database, using the existing approved fixture set — no new persistent fixture
accounts were left behind:

- Anonymous header renders both Sign in and Create account links; zero console/page errors.
- `/sign-up/` renders correctly (email + 2 password fields, `noindex, nofollow`).
- A real sign-up submission reaches the server with correctly Zod-validated data (confirmed via
  Server Action wire-format inspection) and Supabase's own rate-limit error is mapped to the intended
  safe generic message — confirmed live. The plain success acknowledgement render was not
  independently observed live: repeated real `signUp` calls during this same verification window hit
  Supabase's own email-send rate limit before an unthrottled attempt could complete; the success
  branch is a single `return {ok:true}`, already exercised structurally by the passing validation and
  error-mapping tests. No throwaway signup accounts were left behind (confirmed via a read-only Auth
  listing check).
- The onboarding experience was confirmed to render correctly — BUYER/SELLER cards, progress steps,
  company fields, consent checkbox, submit control, zero console/page errors — using the existing
  approved `warehouse-admin+foundation-test@example.com` fixture (an operational-role-only account
  with genuinely no organization membership). The form was **not submitted**, to leave that fixture's
  no-org state untouched for every other test that depends on it (e.g. `tests/design/uif-fg.browser.mjs`'s
  role-independence proof).
- A genuine live proof of the `PENDING_KYB` dashboard-denial path (a real fixture with an organization
  that exists but is not yet authorized) was **not performed** — no such fixture exists among the
  three approved ones (`buyer-only`, `buyer-and-seller` are both `ACTIVE`+`APPROVED`;
  `warehouse-admin` has no organization at all). Creating one is explicitly Phase 8's job (T029,
  "org with `PENDING_KYB`" fixture variant), out of this run's scope. The guard itself is
  static-verified (`tests/auth/run-a-sign-up-onboarding.test.ts`) and follows the same
  `identity.isAuthorizedMember` field RUN DB's live verification already proved resolves correctly
  from `is_authorized_member()` for a real `PENDING_KYB` organization.

### Regression

`typecheck` clean · `test` **362/362 passed** (32 files, +34 from this run's new
`tests/auth/run-a-sign-up-onboarding.test.ts`, +1 fix to `tests/design/uif-f.test.tsx`'s
"no new dashboard route" assertion to correctly distinguish a non-routable action-only directory
from an actual route) · `build` succeeds (`/sign-up` now a real route;
`/dashboard/onboarding` correctly absent from the route table) · `lint` unchanged pre-existing
baseline (`docs/claude-design/**` only) · `git diff --check` clean.

### Files changed this run

New: `src/app/(auth)/sign-up/{page.tsx,actions.ts}`, `src/app/dashboard/onboarding/actions.ts`,
`components/account/{sign-up-form,membership-application-form,onboarding-experience,
awaiting-kyb-state,onboarding-progress}.tsx`, `lib/validation/{sign-up,membership-application}.ts`,
`tests/auth/run-a-sign-up-onboarding.test.ts`. Modified: `components/public/{site-header,
mobile-nav}.tsx`, `lib/public/copy/{en,ar}.ts` (`auth.signUp`, `account.signUp`),
`lib/app/copy/{en,ar}.ts` (`onboarding.*`), `src/app/dashboard/{layout,page}.tsx` (authorization gate
closure), `tests/design/uif-f.test.tsx`. No schema/migration change.

### Known gaps intentionally deferred to RUN B

KYB document upload/review UI, `lib/kyb/completeness.ts`, KYB draft edit/submit UI, status
timeline/state screens for the seven KYB statuses, resubmission UI — all T014–T022, not started.

## Exact next action (superseded — see RUN A UX Refinement below)

RUN B (T014–T022, Phase 4 + Phase 5 — KYB draft/document/submission/status experience) is the next
work item — **not** started in this run.

---

## RUN A UX Refinement (2026-09-11)

A focused correction pass on the already-implemented RUN A — **not** a new task, and T014+ remain
untouched/not started.

### What changed

1. **Reciprocal Sign-In ↔ Sign-Up navigation**: `/sign-in/` now has its own "Don't have an account?
   Create account" link (`src/app/(auth)/sign-in/page.tsx`), mirroring `/sign-up/`'s existing
   "Already have an account? Sign in" link — both live inside the page itself, not only in the
   header, and use the identical footer placement/style for visual symmetry.
2. **Password visibility**: new `components/ui/password-input.tsx` — a single reusable component
   (eye/eye-off icon toggle, `type="button"` so it cannot submit the form, localized
   `aria-label`/`aria-pressed`, positioned with logical `end-*` classes so it lands correctly in both
   LTR and RTL, visibility state is local `useState` only). Applied to Sign-In's password field,
   both Sign-Up password fields, and both `ResetPasswordConfirmForm` fields — no toggle logic is
   duplicated across forms.
3. **Sign-Up Full Name**: added as a required field, captured via `supabase.auth.signUp`'s own
   `options.data` (Supabase's approved user-metadata mechanism — the same one
   `scripts/seed-test-fixtures.ts` already uses). **Deliberately NOT written to
   `public.profiles.full_name` in this pass** — see the decision record below.
4. **Phone field**: confirmed, not changed. T011's `contactPhone` was already business/organization
   contact information captured at onboarding (`lib/validation/membership-application.ts`), not
   Sign-Up. No phone field exists on Sign-Up; no ambiguous double-collection exists.
5. **Sign-Up polish**: a small supporting line under the lead paragraph
   ("`auth.signUp.afterSignUpNote`") states the real sequence honestly — no fake percentage.
6. Sign-In/Sign-Up visual/structural symmetry (card, spacing, typography, footer link placement,
   password treatment) was already in place from RUN A and is unchanged; this pass only added the
   missing reciprocal link and the shared `PasswordInput`.

### Full Name persistence — decision record

**Cannot be safely written to `public.profiles` at Sign-Up time without inventing a new DB
capability**, so it was not attempted:

- No database trigger creates a `profiles` row for a new `auth.users` row.
- `profiles` RLS grants no member INSERT policy and no member UPDATE policy — the only existing
  write path is `update_my_profile()`, which performs `UPDATE ... WHERE id = auth.uid()` and
  therefore silently affects zero rows when no profile row exists yet (confirmed by reading its live
  definition again this pass).
- `supabase.auth.signUp()` returns no session in this project's Auth configuration (confirmed live
  during RUN DB), so there is no authenticated context at Sign-Up time to call `update_my_profile()`
  even if it could create rows, which it cannot.

Inventing a new INSERT policy, trigger, or RPC to close this would be exactly the "new DB bypass"
this run's instructions forbid. Full Name is captured through the one approved, already-precedented
mechanism (`auth.users.raw_user_meta_data` via `signUp`'s `options.data`) and is available via
`user.user_metadata.full_name` the moment a real session exists. Wiring it into `profiles.full_name`
is a genuine, pre-existing Feature 001 gap (no user, fixture or otherwise, has ever had a `profiles`
row created by anything other than the admin-only `scripts/seed-test-fixtures.ts`) — left for the
approved profile/onboarding path to close, not papered over here.

### Live verification evidence (this run)

Real browser (Chrome via CDP), current production build, both a desktop/light/EN pass and a
mobile (390px)/dark/Arabic-RTL pass:

- Sign-in: Create Account link, Forgot password, submit, and the auth layout's Back-to-Hills-Coffee
  link all present; no horizontal overflow.
- Password toggle: `password` → `text` on click, `aria-label` flips `"Show password"` →
  `"Hide password"`, the click does NOT submit or navigate away from `/sign-in/`, and the typed value
  is preserved across the toggle. The toggle button is keyboard-focusable.
- Sign-up: Sign-in link, Full Name field, exactly 2 password-eye buttons (password +
  confirm password), and the supporting sequence note all present; no overflow.
- Dark + Arabic/RTL: correct `dark` class and `dir="rtl"`, no horizontal overflow, the eye button's
  `aria-label` is genuinely Arabic ("إظهار كلمة المرور"), and the button visually lands on the
  correct (logical-end → visual-left in RTL) side of the field — proving the positioning is truly
  logical-property-driven, not a hardcoded LTR assumption.
- Zero console errors and zero page errors across both passes.

### Regression

`typecheck` clean · `test` **383/383 passed** (33 files: +21 new
`tests/auth/run-a-ux-refinement.test.ts`, +1 pre-existing `SignUpInput` test fixed to include the
new required `fullName` field) · `build` succeeds · `lint` unchanged pre-existing baseline
(`docs/claude-design/**` only) · `git diff --check` clean.

### Files changed this pass

New: `components/ui/password-input.tsx`, `tests/auth/run-a-ux-refinement.test.ts`. Modified:
`components/account/{sign-in-form,sign-up-form,reset-password-confirm-form}.tsx`,
`components/ui/icon.tsx` (`eye`/`eye-off` glyphs), `src/app/(auth)/{sign-in,sign-up}/page.tsx`,
`src/app/(auth)/sign-up/actions.ts` (full name via `options.data`),
`lib/validation/sign-up.ts` (`fullName` field), `lib/public/copy/{en,ar}.ts` (`auth.signIn.noAccount`
/`createAccount`, `auth.signUp.fullName`/`afterSignUpNote`, `auth.password.show`/`hide`),
`tests/auth/run-a-sign-up-onboarding.test.ts` (added `fullName` to existing `SignUpInput` test
payloads). No schema/migration/RLS change; no change to the three protected authorization functions.

## RUN A Full Name Persistence Fix (2026-09-11)

Closes the one remaining RUN A gap flagged by the UX refinement pass: "Full Name is captured but not
yet visible anywhere in the product (never persisted to `profiles`)."

### Investigation

Re-confirmed against the live schema report (`docs/database/database-schema-report.json`, triple-
unwrapped JSON) that:

- `profiles` RLS has exactly 2 policies (`profiles_admin_update`, `profiles_select_own`) — **no
  member INSERT policy of any kind**.
- No trigger creates a `profiles` row for a new `auth.users` row (the only trigger on `profiles` is
  `trg_profiles_updated_at`).
- `update_my_profile(p_full_name, p_phone, p_company_name, p_avatar_path)` is **UPDATE-only**
  (`UPDATE profiles SET ... WHERE id = auth.uid()`) — confirmed via its live `definition` in the
  schema report, since it is not captured in any migration file in this repo (a pre-existing,
  live-only function).
- `supabase.auth.signUp()` returns no session in this project (re-confirmed from RUN DB) — so there
  is no authenticated context at Sign-Up time to call any RPC even if one could create a row.

**New discovery this pass**: `organizations.created_by uuid references public.profiles(id)` is a
real, enforced foreign-key constraint (`supabase/trading_schema.sql:85`, the same pattern repeats
across 14+ tables). This means `start_organization_onboarding` will hard-fail for any genuinely
fresh real signup with no `profiles` row yet — a severe, pre-existing gap far broader than "Full Name
doesn't display." It was invisible to every prior live-verification pass because every fixture this
repository uses (`buyer-only`, `buyer-and-seller`, `warehouse-admin`, and RUN DB's own test users) was
seeded with an explicit `profiles` row via the admin-only seed script — never through a genuinely
organic signup reaching onboarding.

### A. Exact persistence mechanism

`src/app/dashboard/onboarding/actions.ts`'s `submitMembershipApplication` — the first point in the
approved flow where a real, authenticated, write-capable session exists — now reads
`user.user_metadata.full_name` (from `supabase.auth.getUser()`) and, only when
`identity.profile.fullName` is not already set, calls the existing `update_my_profile()` RPC with it.
No new RPC, no new RLS, no new migration, no service-role runtime code, no direct `profiles` write.

### B. Exact database field populated

`profiles.full_name`, via `update_my_profile`'s own `UPDATE ... WHERE id = auth.uid()` — the same RPC
and call shape `src/app/dashboard/settings/actions.ts` already uses.

### C. Verification flow behavior

Live-verified via direct authenticated RPC calls (a temporary, immediately-deleted script — no
service-role use outside that standalone script):

- **Existing-profile caller** (has a `profiles` row, `full_name` still null): after the sync call,
  `profiles.full_name` is populated with the exact `user_metadata.full_name` value, and the
  subsequent `start_organization_onboarding` call still succeeds normally — no regression.
- **Fresh caller with no `profiles` row**: the sync call is a true silent no-op (no error, confirmed
  via a before/after read — no row is created), and the subsequent `start_organization_onboarding`
  call fails with a real Postgres error: `23503`, `organizations_created_by_fkey`, "Key
  (created_by)=(...) is not present in table \"profiles\"" — exactly the predicted, pre-existing gap.

One synthetic fixture from this verification (`fullname-verify-*-with-profile@example.com`) could not
be deleted afterward because it now carries an `audit_logs` row referencing it
(`audit_logs_actor_user_id_fkey`) — the same append-only/audit-integrity pattern already documented
for the T010g fixture cleanup. It is retained: harmless (no organization, no membership, no elevated
role), uniquely tagged, and easy to identify.

### D. Security boundary

`auth.users.raw_user_meta_data` never carries anything but `full_name` (confirmed: Sign-Up's
`options.data` block contains only that key). The onboarding action forwards the metadata value only
as `update_my_profile`'s `p_full_name` argument — never as any authorization-shaped parameter — and
`update_my_profile` itself is UPDATE-only against `auth.uid()`, so it cannot create a row, grant a
role, or set a capability under any input.

### E. Tests/results

New `tests/auth/run-a-full-name-persistence.test.ts` (12 tests): the sync reads the real
authenticated user (not a client-submitted field), calls the existing `update_my_profile` RPC with
the established parameter shape, runs before the onboarding write it feeds, uses no service-role
client, carries no authorization-shaped field, and the known FK gap is honestly documented in the
action's own comment. Full regression: `typecheck` clean · full suite **395/395 passed** (34 files,
+12 new) · `build` succeeds · `lint` unchanged pre-existing baseline (`docs/claude-design/**` only) ·
`git diff --check` clean (only benign CRLF/LF warnings).

### F. Files changed

Modified: `src/app/dashboard/onboarding/actions.ts` (full-name sync + doc comment naming the FK gap).
New: `tests/auth/run-a-full-name-persistence.test.ts`. No migration, no RLS change, no change to the
three protected authorization functions, no change to Sign-Up's own actions file (already correct
from the UX refinement pass).

### G. Whether RUN A now has zero known functional gaps

**No.** The narrow Full Name wiring is complete and correct for any caller who already has a
`profiles` row. But a genuinely fresh real signup (no seed script involved) will still fail at
`start_organization_onboarding` with a foreign-key violation, because nothing in the approved,
migration-free surface available to this pass can create that caller's first `profiles` row. Closing
this requires a migration (an `auth.uid() = id`-scoped INSERT policy, an upsert-capable RPC, or a
`handle_new_user`-style trigger) and is explicitly out of this pass's scope. This is a real,
pre-existing platform gap that predates RUN A/RUN DB and should be prioritized before RUN B's KYB
document work assumes a working end-to-end onboarding path for real users.

## RUN B Execution — Profile Bootstrap + Verified-Signup Redirect + T014–T022 (2026-09-11)

Closes exactly the gap the previous section flagged, plus implements the member-facing KYB
draft/upload/submit/status experience.

### PART 0 — fresh-signup profile bootstrap

New migration `supabase/migrations/20260912000000_feature_003_profile_bootstrap.sql` (paired
`.rollback.sql`): an `on_auth_user_created` trigger (`AFTER INSERT on auth.users`) creates exactly
one `public.profiles` row per new user, reading only `raw_user_meta_data->>'full_name'` — never
`account_type`/`organization_id`/any role/`can_buy`/`can_sell`/status/`is_blocked` (none of those are
read or settable through it). Idempotent (`on conflict (id) do nothing`), creates no organization, no
membership, no capability. A guarded backfill statement in the same migration inserts a profile only
for existing `auth.users` rows that genuinely have none yet (`where not exists`, never overwrites an
existing row). Live scope check (read-only, service-role-only, standalone, deleted after use): of 7
real `auth.users` rows in the intended environment, exactly 1 (`shadyshref2001@gmail.com`) was
missing a profile — the backfill closes exactly that one row, nothing else.

**Not yet applied to the live environment** — `MIGRATION READY — MANUAL APPLY REQUIRED`.

### PART 1 — verified-signup routing

Investigation found the existing T007/T008 callback (`src/app/auth/confirm/route.ts`) already
redirects a successfully verified caller straight to `/dashboard/`, never forcing a manual re-sign-in
— this was already correct. Added `emailRedirectTo: canonicalUrl("/dashboard/")` to `signUp()`
(`(auth)/sign-up/actions.ts`), mirroring the existing `resetPasswordForEmail` precedent, so the
confirmation link's destination is explicit rather than depending on the Supabase project's default
Site URL configuration. Live-verified via a real headless-browser session: sign-in redirects straight
to `/dashboard/` with no manual re-sign-in step, landing on the correct state-aware hub.

### PART 2 — RUN B, T014–T022

**New migration** `supabase/migrations/20260912010000_feature_003_kyb_draft_fields.sql` (paired
`.rollback.sql`, guarded to refuse if real data exists): adds exactly two nullable text columns to
`kyb_applications` (`registered_address`, `business_activity`) and the previously-deferred
`update_kyb_draft(p_application_id, p_registered_address, p_business_activity)` RPC — UPDATE-only,
`auth.uid()`-scoped via `is_org_member`, editable-state-gated (`DRAFT`/`RESUBMISSION_REQUIRED` only),
same SECURITY DEFINER shape as the foundation migration's own functions. **Not yet applied to the
live environment.** Everything else SRS §4.1 requires (trade licence, proof of incorporation,
ownership/control authority evidence, banking evidence) uses the already-applied `kyb_documents`/
`attach_kyb_document` document model — no further schema was needed.

**New library layer**: `lib/validation/kyb-application.ts` (T014 — the closed 5-type document
vocabulary + the two-field draft schema), `lib/kyb/completeness.ts` (T015 — specific missing-item
messages, never generic), `lib/kyb/status.ts` + `lib/kyb/status-types.ts` (server-only vs
client-safe split — the split exists because a client component importing anything from a module that
transitively imports `lib/supabase/server` fails the Next.js build with a `next/headers`-in-client
error; discovered and fixed this run). `lib/kyb/mutations.ts` gained `updateKybDraft`.

**New Server Actions** `src/app/dashboard/kyb/actions.ts`: `startKybVerification`, `saveKybDraft`
(T016), `uploadKybDocument` (T017 — real bytes to the live `kyb-evidence` bucket, orphan cleanup if
metadata attach fails after a successful upload), `submitKyb` (T018), `resubmitKyb` (T020) — every one
resolves the acting organization/application fresh, server-side, never from a client-supplied id.

**New route** `src/app/dashboard/kyb/page.tsx` — the real draft/upload/submit workspace, reachable
only for a not-yet-authorized organization in an editable state; independently re-verifies and
redirects to `/dashboard/` otherwise.

**Dashboard architecture change**: `dashboard/layout.tsx`'s `!identity.isAuthorizedMember` branch
used to render a static `AwaitingKybState` in place of `{children}`, which structurally prevented any
real route under `/dashboard/*` from ever rendering while not-yet-authorized. It now renders
`{children}` directly (still never `AppShell`/business nav, which remain reached only after this
check, in the final `return`) — the security property ("no protected business modules pre-approval")
is unchanged; only the mechanism moved from "block all children" to "each child page renders only
KYB-appropriate content and independently re-verifies," the same rule already established for
`dashboard/page.tsx`. `AwaitingKybState` is retired; `components/account/kyb-status-screen.tsx`
(T019/T021/T022 — all seven `kyb_applications` statuses plus the implicit "no application yet" state,
plus an expiry warning surfaced regardless of status) replaces it, rendered by `dashboard/page.tsx`.

**Toasts**: `<HillsToaster />` mounted in the root layout (`src/app/layout.tsx`), made locale/RTL-aware
(`dir` follows `useLocale().direction`). Used for draft save, document upload, and submit/resubmit
failure feedback in the new client components — the pre-existing RUN A forms (sign-in/sign-up) were
deliberately left on their existing inline `role="alert"` pattern, not retrofitted, to avoid unrelated
scope/test churn.

### Live verification (this run)

Two complementary real-environment checks, both using clearly tagged synthetic fixtures, cleaned up
via the same approach as prior runs (temporary, immediately-deleted scripts; service-role key confined
to those standalone scripts only):

1. **Real headless-browser session** (after diagnosing and fixing two environment quirks unrelated to
   the product code: Next.js 16 blocks cross-origin dev resources when the browser targets
   `127.0.0.1` instead of `localhost`, silently breaking client hydration in dev mode; and a
   throwaway QA script was missing its own `.env.local` loader, silently signing in with a wrong
   fallback password): confirmed sign-in → straight to `/dashboard/` → the correct "Start your KYB
   verification" hub state renders with honest copy and the right onboarding-progress step
   highlighted → clicking through reaches `/dashboard/kyb/`.
2. **Direct authenticated RPC calls** (bypassing the browser layer for the rest of the flow — the
   same proven-reliable technique used for the RUN A Full Name Persistence fix) exercised the complete
   member-side KYB lifecycle against the real, already-applied foundation migration: idempotent draft
   creation, all 5 required documents uploaded via real Storage + `attach_kyb_document`, full
   cross-tenant isolation (a second organization could not read the first's application or documents,
   upload into its Storage path, or attach to its application), `DRAFT → SUBMITTED`, a direct
   bypass-the-RPC `UPDATE kyb_applications SET status = 'APPROVED'` attempt from the member's own
   client confirmed to affect **zero rows** (no self-approval possible even bypassing the application
   layer entirely), a real document rejection via `create_kyb_review` (confirming `reviewer_user_id`
   is never returned and `reviewer_label` is always the fixed `"Hills Compliance"` constant), a
   premature resubmit correctly refused (`unresolved_rejected_document`), a replacement upload
   correctly superseding the rejected document, and `RESUBMISSION_REQUIRED → SUBMITTED` succeeding
   only after the replacement.

`update_kyb_draft` itself returned `PGRST202` ("Could not find the function ... in the schema
cache") — honestly confirming the T016 migration has not been applied yet; not faked as a pass. The
call shape (function name, parameter names) was exercised for real and is correct.

Eleven synthetic fixture accounts from this run's debugging could not be fully deleted afterward —
each has an `audit_logs` row referencing it (`audit_logs_actor_user_id_fkey`, the same append-only/
audit-integrity pattern already documented for the T010g and RUN A Full Name fixture cleanups). All
are uniquely tagged (`kybqa-*`/`kybrpc-*@example.com`), harmless (most have no organization; the one
that does has no membership left after cleanup), and retained for audit integrity, consistent with
established precedent.

### Regression

`typecheck` clean · full suite **436/436 passed** (35 files, +41 new
`tests/auth/run-b-kyb.test.ts`) · `build` succeeds (`/dashboard/kyb` registered as a new dynamic
route) · `lint` unchanged pre-existing baseline (`docs/claude-design/**` only; one real
`react-hooks/set-state-in-effect` finding in this run's own new code was found and fixed by keying
`KybDocumentRow` on the current document's id/status instead of resetting local state from an effect)
· `git diff --check` clean (only benign CRLF/LF warnings).

### Files changed this pass

New: `supabase/migrations/20260912000000_feature_003_profile_bootstrap.{sql,rollback.sql}`,
`supabase/migrations/20260912010000_feature_003_kyb_draft_fields.{sql,rollback.sql}`,
`lib/validation/kyb-application.ts`, `lib/kyb/completeness.ts`, `lib/kyb/status.ts`,
`lib/kyb/status-types.ts`, `src/app/dashboard/kyb/{actions.ts,page.tsx}`,
`components/account/kyb-{status-screen,draft-form,document-checklist,document-row,submit-panel}.tsx`,
`tests/auth/run-b-kyb.test.ts`. Modified: `lib/kyb/mutations.ts` (+`updateKybDraft`),
`src/app/(auth)/sign-up/actions.ts` (`emailRedirectTo` + updated doc comment),
`src/app/dashboard/{layout.tsx,page.tsx}`, `src/app/layout.tsx` (+`HillsToaster`),
`components/app/toast.tsx` (locale-aware `dir`), `lib/app/copy/{en,ar}.ts` (+`kyb` section),
`tests/auth/{run-a-sign-up-onboarding,run-a-ux-refinement}.test.ts`,
`tests/design/uif-f.test.tsx` (updated for the new `/dashboard/kyb/` route). Deleted:
`components/account/awaiting-kyb-state.tsx` (superseded by `kyb-status-screen.tsx`). No change to
the three protected authorization functions, no change to the already-applied RUN DB migration or
Storage foundation.

## PreAuthHeader — theme/locale controls for pre-authorized `/dashboard/*` states (2026-09-11)

Small follow-up after RUN B: every `/dashboard/*` state rendered BEFORE the business `AppShell`
(unverified email, multi-org selection, no-org onboarding, and every not-yet-authorized KYB
status/workspace screen) had no theme toggle, no language switcher, and no way back to the public
site — `AppShell`'s own `Topbar` carries those, but none of those states reach `AppShell`. New
`components/app/pre-auth-header.tsx` (Server Component, mirrors `(auth)/layout.tsx`'s own header
exactly — same logo/home link, same `ThemeToggle`/`LanguageSwitcher` islands) is now rendered above
every one of `dashboard/layout.tsx`'s pre-`AppShell` branches. No new toggle implementation; no
change to the authorization guard itself (only the JSX wrapping around each branch's existing return
value changed). 4 new tests in `tests/auth/run-b-kyb.test.ts`; full regression re-run clean.

## RUN B Live Verification — both migrations applied (2026-09-11)

Both migrations from the RUN B pass above were manually applied to the intended Supabase environment
and independently re-confirmed post-apply (trigger exists/enabled, `handle_new_user` is
`SECURITY DEFINER`, `auth_users_missing_profile = 0`; `registered_address`/`business_activity`
columns exist, `update_kyb_draft(uuid,text,text)` exists as `SECURITY DEFINER` with `authenticated`/
`service_role` EXECUTE granted and `anon`/`PUBLIC` EXECUTE denied). This session performed a full,
real, end-to-end live verification of the entire RUN B flow against the now-fully-applied schema.

### What was live-verified (one continuous synthetic-fixture run, uniquely tagged, cleaned up after)

**Profile bootstrap**: a real `auth.users` insert (via `admin.createUser` — see the note below on why
the REAL public `signUp()` endpoint could not be used for this specific check) produced exactly one
`profiles` row automatically, `profiles.id = auth.users.id`, `full_name` correctly populated from
metadata, `is_blocked` at its safe default `false`, and zero organizations/memberships created at
signup.

**Real public signUp() endpoint — two genuine findings, reported honestly rather than worked
around**: (1) `@example.com` addresses are rejected by the live signUp() endpoint specifically
(`email_address_invalid` — `admin.createUser` does not apply this validation; this is a live
Supabase Auth-side difference between the two paths, not a codebase defect). (2) After switching to a
non-reserved synthetic domain, the attempt hit `over_email_send_rate_limit` (429) — Supabase's own
send-rate limiter, exhausted by this session's extensive prior live testing. This second finding is
itself a genuine, real-behavior re-confirmation that `sign-up/actions.ts`'s own
`error.code === "over_email_send_rate_limit"` branch is live-correct. Given both, the rest of this
verification used `admin.createUser` (an equivalent real `auth.users` INSERT, firing the identical
trigger) rather than the rate-limited public endpoint.

**Sign-in after verification**: confirming the email and signing in produced a real session.

**Business onboarding (SELLER)**: `start_organization_onboarding` created a `PENDING_KYB`
organization with the caller as `OWNER`; `organization_can_buy`/`organization_can_sell`/
`is_authorized_member` were all confirmed `false` immediately after — registration is not
authorization, live-confirmed.

**KYB draft (T016, now live)**: idempotent `create_kyb_draft` (repeat call returns the same
application id); `update_kyb_draft` persisted `registered_address`/`business_activity` for real;
blocked user denied (`forbidden`); cross-org caller denied (`forbidden`); anonymous caller denied at
the **Postgres grant layer itself** (`permission denied for function update_kyb_draft` — stronger
than the RPC's own internal check, confirming the `revoke all ... from public, anon` hardening is
genuinely live, not merely present in the migration source); attempting `update_kyb_draft` on a
`SUBMITTED` (non-editable) application correctly refused with `invalid_transition`.

**Private document upload (T017)**: bucket confirmed private (`public: false`, 10 MiB limit, exactly
the 3 allowed MIME types) via `storage.getBucket`; anonymous upload denied (RLS); all 5 required
document types uploaded as real bytes and attached via `attach_kyb_document`, producing real
`file_assets`/`kyb_documents` rows; the resulting object's public URL returned a non-200 status when
fetched directly (no public access exists); invalid MIME, oversized (`p_size_bytes` beyond the 10 MiB
limit), wrong canonical path, and a never-actually-uploaded object were each independently rejected
with their specific documented error code; a second organization was denied both uploading into the
first organization's Storage path and attaching metadata to its application, and could read neither
its application nor its documents (full cross-tenant isolation).

**Completeness + submit (T018)**: `DRAFT → SUBMITTED` succeeded; a second submit was refused
(`invalid_transition`); a direct member `UPDATE kyb_applications SET status = 'APPROVED'` bypassing
every RPC produced no error but changed **zero rows** (status remained `SUBMITTED`) — no
self-approval is possible even bypassing the application layer entirely.

**Rejection / replacement / resubmit (T020)**: a real Compliance-role review rejected the trade
licence document with a reason; the member's own `list_kyb_document_reviews` read showed the exact
reason, a real timestamp, the fixed `"Hills Compliance"` label, and confirmed `reviewer_user_id` is
never present in the returned row; a premature resubmit attempt (before replacing the rejected
document) was correctly refused (`unresolved_rejected_document`); the replacement upload correctly
superseded the prior version (old document → `SUPERSEDED` v1, new document → `PENDING` v2 with the
correct `supersedes_document_id`); resubmit then succeeded, transitioning
`RESUBMISSION_REQUIRED → SUBMITTED`.

**REJECTED / SUSPENDED (T021) + expiry (T022)**: both terminal `kyb_applications.status` values were
set (simulating Compliance decisions) and read back correctly, including the rejection reason; after
both, `organization_can_buy`/`organization_can_sell`/`is_authorized_member` were re-confirmed still
`false` — no accidental authorization leak from any of this session's state churn. The original
(now-superseded) trade licence document's `expires_at` (deliberately set in the past, `2020-01-01`)
and the replacement's `expires_at` (`2030-01-01`, not expired) both read back exactly as the T022
expiry logic (`isDocumentExpired`) expects.

**Authorization function integrity**: `git diff --stat supabase/trading_schema.sql` (the canonical
checked-in snapshot of `organization_can_buy`/`organization_can_sell`/`is_authorized_member`, among
everything else) was empty for the whole of this run before the post-verification reconciliation
below — these three functions were never touched.

### Synthetic fixture cleanup

Most of this run's synthetic organizations, memberships, and Storage objects were successfully
deleted. Three principals could not be deleted and are retained — the same append-only/audit-
integrity pattern already documented for T010g and the RUN A Full Name Persistence fix's fixtures:
one organization (`file_assets_organization_id_fkey` — it holds real uploaded evidence rows), and two
profiles (`organizations_created_by_fkey` and, newly observed this run, `kyb_applications_decided_by_fkey`
— the second profile was used as the simulated Compliance decision-maker and is now referenced by the
REJECTED application's `decided_by` column). All are uniquely tagged (`runbfinal-*@example.com`),
harmless, and retained rather than force-deleted, per the same audit-integrity discipline as every
prior run.

### Canonical reconciliation

`supabase/trading_schema.sql` — appended the two now-applied migrations' schema objects (the
`on_auth_user_created` trigger/`handle_new_user` function, the two `kyb_applications` columns, and
`update_kyb_draft`) in the same style as the RUN DB migration's own reconciliation; the one-time
guarded backfill statement is data migration, not schema, and was deliberately not reproduced.
`docs/architecture/DATABASE-CAPABILITY-MAP.md` — added **DB-BLOCK-11** (RESOLVED, 2026-09-11) for the
fresh-signup profile bootstrap gap this run closed. `docs/architecture/IMPLEMENTATION-ROADMAP.md` —
Feature 003's row and the "Exact next task" note updated to reflect RUN B complete + live-verified;
DB-BLOCK-11 added to the blocker summary table. `specs/003-auth-membership-kyb/tasks.md` — status
header and each of T014–T022 tagged `LIVE-VERIFIED 2026-09-11`.

### Regression

`typecheck` clean · full suite **440/440 passed** (35 files) · `build` succeeds · `lint` unchanged
pre-existing baseline (`docs/claude-design/**` only) · `git diff --check` clean.

### Honest remaining gaps

The REAL public `signUp()` endpoint's own fresh-account path could not be exercised end-to-end in
this pass specifically because of Supabase's own email-send rate limiter (exhausted by this session's
own extensive prior testing, not a defect) — the underlying trigger this pass exists to prove was
still verified for real via an equivalent `auth.users` INSERT. No other honest gap is known; every
other checklist item in this run's directive was live-verified against the real, now-fully-applied
database.

### Project-wide action feedback convention

The shared product convention is now explicit: validation owned by one field remains inline beside
that field; transient action, authorization, business-rule, network, upload, and server outcomes use
the single root `HillsToaster`. Server Actions return typed codes from
`lib/types/action-feedback.ts`, never provider/Postgres text. Client surfaces map those codes to the
active EN/AR dictionaries, so backend names, RPC details, stack traces, and secrets cannot become
UI copy. `useActionToast` records each result object before emitting, preventing Strict Mode,
rerender, locale, and theme changes from replaying a stale toast. A successful action uses a toast
when navigation does not already make success self-evident; redirecting terminal actions do not
manufacture a client success message. The one provider remains in `src/app/layout.tsx`, with
logical LTR/RTL positioning and the existing light/dark Sonner theme integration. Future features
must reuse this code/result/copy pattern rather than adding providers, returning raw errors, or
rendering a global action result inline.

## Phase 6 + 7 Live Verification (2026-09-11)

Phase 6 (Agreements, T023–T025) and Phase 7 (Organization & Profile Self-Service, T026–T028) are
COMPLETE and live-verified against the real, already-applied database. No migration and no
authorization-function change was required or made — `organization_can_buy`, `organization_can_sell`,
and `is_authorized_member` are byte-for-byte unchanged from RUN B.

### T023/T024 — agreement presentation + acceptance evidence

`components/account/agreements/{agreement-list,agreement-row}.tsx` render every entry in the existing
`lib/auth/agreements.ts` `CURRENT_AGREEMENTS` registry (no invented type or version), distinguishing
CURRENT+ACCEPTED, CURRENT+NOT ACCEPTED, and OLDER-ACCEPTANCE/VERSION-UPDATED. `public.
agreement_acceptances` already existed live but was uncaptured in `supabase/trading_schema.sql` and
in `docs/architecture/DATABASE-CAPABILITY-MAP.md` (same "live-only, never migrated-in-repo" situation
as `update_my_profile`/`update_organization_contact`) — its own RLS INSERT policy (`agreement_accept`:
`user_id = auth.uid() AND is_org_member(organization_id) AND NOT is_blocked_user()`) is a complete,
already-applied security boundary, so `acceptAgreement` (`src/app/dashboard/actions.ts`) writes
through it directly — no RPC, no migration, no service-role. Evidence recorded: `agreement_type`,
`agreement_version`/`document_hash` (both from the registry, never client input), `accepted_at`
(column default), `organization_id`/`user_id` (from `getRequestIdentity()`, never form input),
`ip_address` (leftmost `x-forwarded-for` hop, else `x-real-ip`, else honestly `null` — never
fabricated), `user_agent` (from request headers). A repeat acceptance of the same current version
hits the schema's own `(organization_id, user_id, agreement_type, agreement_version)` unique
constraint (`23505`), handled as an idempotent success. Live-verified end to end against the
`buyer-only+foundation-test@example.com` fixture (`tests/auth/agreement-acceptance.test.ts`); the row
this run inserted is retained rather than deleted — `authenticated` holds no DELETE grant on this
table by design, and re-running the test exercises the same idempotency path.

### T025 — current-version agreement gate

`RequestIdentity.hasAcceptedCurrentAgreements` (`lib/auth/types.ts`/`lib/auth/dal.ts`) is resolved
fresh every request, never cached beyond it. `getEligibility` (`lib/auth/eligibility.ts`) checks it
only after `canReachTrading` already passed — a PENDING_KYB/SUBMITTED/UNDER_REVIEW/REJECTED/SUSPENDED
organization is denied by the pre-existing `not-authorized` branch and never reaches the agreement
gate. `src/app/dashboard/page.tsx` renders `AgreementList` instead of `FoundationOverview` exactly
when `eligibility.nextAction === "accept-agreements"`. A registry version bump flips
`hasAcceptedCurrentAgreements` to `false` on the very next resolution with no re-login required
(`tests/auth/eligibility.test.ts`, "T025 — agreement gate" describe block).

### T026 — organization contact self-service

`updateOrganizationContact` (`src/app/dashboard/settings/actions.ts`) calls only
`public.update_organization_contact(p_organization_id, p_display_name, p_email, p_phone)` — no direct
`organizations` table UPDATE anywhere in the file. The RPC accepts no parameter for
`status`/`account_type`/`can_buy`/`can_sell`/`is_hills_internal`/`created_by`, so none of those fields
is reachable through this path, by this action or a tampered direct call. `p_organization_id` comes
from the fresh acting organization; the RPC re-verifies `is_org_member`/`NOT is_blocked_user` itself.
Live-verified against the buyer-only fixture, restoring the organization's captured original contact
row afterward (`tests/auth/organization-contact.test.ts`).

### T027 — profile self-service

`ProfileSettingsForm` now separates concerns clearly: `companyName` carries an explicit hint that it
is legacy/personal data, never the organization's legal or trading identity (that lives in the new
Organization section, T026). No avatar upload workflow exists in this repository (no Storage bucket,
no signed-URL contract) and none was fabricated; the form now shows an initials-derived
`Avatar`/`AvatarFallback` preview instead of a raw "avatar path" text field, while a hidden field
preserves the current `avatarPath` value unedited so `update_my_profile`'s full-column-replace
semantics never null it out. `full_name` persistence is unchanged from RUN A
(`tests/auth/update-my-profile.test.ts`, still passing).

### T028 — membership view + acting-organization switcher

`OrganizationMembersPanel` shows every row RLS returns for the acting organization's
`organization_members` (own-org visible, cross-org denied — reverified live in
`tests/auth/organization-membership-view.test.ts`). **Honest, named gap**: `profiles_select_own`'s
RLS (`id = auth.uid() OR is_platform_admin()`) has no `is_org_member(...)` branch, and no
member-listing RPC exists in the live database, so an ordinary member's own request cannot read a
co-member's name — only `member_role` and membership date are genuinely visible for co-members; the
panel shows the caller's own real name for their own row and a truthful generic "Team member" label
for every other row, never a fabricated name. Closing this for real needs a schema-authority decision
(a new `profiles` SELECT policy or a narrow SECURITY DEFINER RPC) outside this self-service-only run.
`ActingOrganizationSwitcher` reuses T002's exact `setActingOrganization` mechanism (per-button
Server Action bound to a server-resolved `organizationId`, re-verified against the fresh membership
list); it renders only when `identity.organizations.length > 1`, and `organizations[0]` is never used
as an implicit fallback anywhere in the new code.

### Regression

`typecheck` clean · full suite **505/505 passed** (41 files, including 6 new/modified Phase 6/7 test
files) · `build` succeeds (Turbopack) · `lint` unchanged pre-existing baseline
(`docs/claude-design/**` only — 124 errors/150 warnings, all pre-existing and outside application
code) · `git diff --check` clean (line-ending notices only, no real conflicts).

One real build-time issue was found and fixed during this pass: the client component
`agreement-list.tsx` originally imported `latestAcceptanceForType`/`AgreementAcceptanceRow` from the
same module as the server-only `getOrganizationAgreementAcceptances` (which transitively imports
`next/headers`), which Turbopack correctly rejected. Fixed by splitting
`lib/agreements/acceptance-status.ts` into a server-only fetch module and a new pure, client-safe
`lib/agreements/acceptance-records.ts` — the same pure/impure separation `lib/auth/agreements.ts`
already established, applied one level further.

### Documentation consistency note

`specs/003-auth-membership-kyb/tasks.md` T040 ("re-confirm DB-BLOCK-01/DB-BLOCK-03 remain open and
unbypassed") is now STALE wording — both blockers were formally RESOLVED by RUN DB
(2026-09-10, live-verified T010g) and the tasks.md status header has said so since. Per this run's
explicit instruction, this was flagged rather than silently rewritten; the later Feature 003 closure
pass should correct T040's wording to "re-confirm DB-BLOCK-01/DB-BLOCK-03 remain RESOLVED" (or
equivalent) rather than "remain open."

### Honest remaining gaps

Co-member real names are not shown in the T028 membership view (RLS/schema gap, documented above —
not a bug). Blocked-user and cross-organization denial for `acceptAgreement` were proven at the
source level (the action reads no client-supplied organization/user id at all) and via the
already-applied, already-verified RLS policy text, not via a live fixture — no blocked-user or
multi-organization fixture exists in `scripts/seed-test-fixtures.ts` yet (adding one is Phase 8's
T029, out of this run's scope). `lib/app/copy/ar.ts` received faithful Arabic translations for every
new key this run added; no other Arabic content gap was introduced.

## Phase 8 + 9 Live Verification (2026-09-11)

Phase 8 (Test fixtures extension, T029) and Phase 9 (Authorization & isolation tests, T030–T034) are
COMPLETE. No DB/RLS/Storage policy was touched; `organization_can_buy`, `organization_can_sell`, and
`is_authorized_member` remain byte-for-byte unchanged.

### T029 — fixtures

`scripts/seed-test-fixtures.ts` gained 8 new identities (`pending-kyb`, `complete-draft`,
`under-review`, `suspended`, `blocked-member`, `mfa-member`, `multi-org` — with two organizations —,
`no-organization`) covering exactly the 7 named T029 variants plus the multi-org case, all via direct
service-role table writes (the same pattern the existing `buyerOnly`/`buyerAndSeller` fixtures already
use — no application RPC exists to move an organization through `UNDER_REVIEW`/`SUSPENDED`, since
Compliance decisioning is Phase 10/11, out of scope, territory). Two privileged, narrowly-scoped
controls were added, mirroring the existing `--set-buyer-and-seller-can-sell=`:
`--set-suspended-organization-status=ACTIVE|SUSPENDED` (T031) and `--reset-complete-draft-application`
(T032). `npm run test:seed` is idempotent (verified via two consecutive full runs, `reused` on the
second); `npm run test:seed -- --teardown` removes everything cleanly and reports retained synthetic
audit principals explicitly.

**A real, previously-latent teardown bug was found and fixed in this pass**: any fixture whose OWN
test drives a real, RLS-respecting Server Action/RPC call (rather than this script's own
service-role writes) leaves a real, non-null `audit_logs.actor_user_id` row — discovered live via
`buyerOnly`/`buyerAndSeller` (Phase 6/7's own `agreement-acceptance.test.ts` already did this) and
the new `complete-draft`/`mfa-member` fixtures. This previously made `--teardown` abort with a raw
foreign-key error the first time anyone ran it after a live-writing test suite existed.
`deleteOrganizationsRetainingAuditEvidence`/`deleteAuthUsersRetainingAuditEvidence` now retain
exactly the blocked organization/user pair, log it by name, and let teardown complete for everything
else — the run directive's own "block/disable safely, document exactly why, do not fabricate complete
deletion" applied to a case this pass discovered rather than anticipated.

### T030 — cross-organization isolation

`tests/auth/isolation.test.ts` — AUTHENTICATED DB/RLS PROOF via real fixture sessions (never the
service-role key, never a mocked identity): a member of `buyerOnly` cannot read `buyerAndSeller`'s
`kyb_applications`, `kyb_documents`, or `agreement_acceptances` (each resolves to an empty result, the
actual RLS boundary denying it — not a UI absence). Additional negatives: a blocked user (T029's
`blocked-member`) cannot read another organization's data either; the `multi-org` fixture can read
both of its own two organizations' membership rows but not a third it does not belong to; and the
real `setActingOrganization` (`lib/auth/eligibility.ts`) refuses to write the acting-organization
cookie for an organization the caller is not a member of, while accepting one they genuinely belong to.

### T031 — eligibility freshness

`tests/auth/eligibility-freshness.test.ts` — the `suspended` fixture's organization status is
flipped server-side (`ACTIVE ↔ SUSPENDED`) mid-test via the new privileged control, and the SAME
long-lived fixture session (no sign-out, no new session) re-resolves `getRequestIdentity()`
immediately afterward. Live-proven: SUSPENDED→ACTIVE and ACTIVE→SUSPENDED both take effect on the
very next resolution; repeated resolution while still SUSPENDED never drifts toward eligible on its
own; `getEligibility`'s `blockingReason` reflects the same fresh state. A static check confirms
`lib/auth/dal.ts` never wraps its authorization reads in `unstable_cache`.

### T032 — KYB transitions

`tests/auth/kyb-transitions.test.ts` — `pending-kyb` (a genuinely incomplete DRAFT) proves
`submitKyb()` blocks submission and names every specific missing item (2 scalar fields + 5 documents),
application status unchanged. `complete-draft` (a DRAFT with both scalar fields and all 5 required
documents seeded, metadata-only, ACCEPTED) proves a real `DRAFT → SUBMITTED` transition through the
real Server Action, with `submitted_by`/`submitted_at` correctly recorded — then restored to DRAFT via
the new reset control so the fixture is reusable. Blocked-user denial is proven live via
`saveKybDraft` (the mutation this run's fixture set can actually exercise — `blocked-member`'s own
application is terminal APPROVED, so `submitKyb` on it tests "not in DRAFT," not blocking specifically)
and, for every KYB state-transition RPC, at the source (`is_blocked_user()` confirmed present in each).

### T033 — session / MFA / auth disclosure

`tests/auth/session.test.ts`. **Sign-out**: live-proven — protected access works before sign-out,
`signOut({scope:"local"})` is real, and the same client's next request is denied (no stale response
reused). **Auth disclosure**: live-proven via the real `signIn` Server Action — an unknown email and a
known email with the wrong password return the identical `invalid_credentials` code; a real admin
account's wrong password discloses nothing admin-specific either. **Member/Admin boundary**: live-proven
end-to-end with real fixture credentials through the real `signIn`/`adminSignIn` actions (a strictly
stronger proof than `auth-boundary-feedback.test.tsx`'s existing mocked-identity version) — an admin
through `/sign-in/` is rejected and signed out; a member through `/admin/sign-in/` is denied and
signed out; genuine members/admins reach their real redirect targets.

**MFA — HONEST, LIVE-VERIFIED GAP at the time of this Phase 8/9 pass; see the dedicated "T033 MFA
Remediation" section below for the focused follow-up run that closed the application-layer half of
it.** The run directive requires "UI-only challenge is not sufficient; server/data boundary must be
gated." Live-checked with a real TOTP enrollment (RFC 6238 code computed locally, no third-party
dependency — `tests/auth/totp.ts`) against the `mfa-member` fixture: the mechanism itself works
(`challengeAndVerify` genuinely promotes a session to `aal2`), but grepping the live schema report for
`aal`/`mfa`/`assurance` across every RLS policy and function returned zero matches at the time, and
`lib/auth/dal.ts` did not read the session's assurance level either. Confirmed live: a brand-new
session for an MFA-enrolled user, at `aal1` with `nextLevel: "aal2"`, could still read protected
`profiles` data — `sign-in/actions.ts`'s `/mfa/` redirect was a routing nudge only, not a data-layer
gate.

### T034 — agreement evidence + injection resistance

Extended the existing `tests/auth/agreements.test.ts` (its original T003 pure-function suite is
untouched) with live sections. **Injection resistance**, using T029 fixtures: a blocked caller's
`acceptAgreement` attempt is refused by the real Server Action; a direct cross-organization insert
attempt and a direct arbitrary-`user_id` insert attempt are both denied by RLS itself (not merely
absent from the UI); re-confirmed at the source that the action reads no client-supplied organization
id, user id, version, or document hash at all. **Version-bump re-gating**: a stale-version and a
current-version acceptance for the same type coexist as two distinct, permanent rows (real historical
retention, not an overwrite), and the fresh-resolved gate reflects only the current one — no re-login.

### Regression

`typecheck` clean · full suite **543/543 passed** (46 files, run twice consecutively for reliability)
· production build succeeds · lint: 0 errors/warnings in any touched file, pre-existing
`docs/claude-design/**`-only baseline unchanged (124 errors) · `git diff --check` clean.

**Infrastructure fix required to make the full suite reliable**: running all `tests/auth/*` files in
parallel (Vitest's default) fired enough concurrent `signInWithPassword` calls against the same small
set of live fixture accounts to trip Supabase Auth's own rate limiter, which surfaced
indistinguishably as `invalid_credentials` (the app's own generic mapping for any sign-in provider
error) rather than a real credential failure. Fixed via `vitest.config.mts`: `fileParallelism: false`
(test files now run sequentially) and `testTimeout: 20_000` (several live fixture tests legitimately
need more than the 5s unit-test default). No assertion was weakened to achieve this — confirmed via
two consecutive full-suite passes.

### Honest remaining gaps (Phase 8 + 9)

The MFA server/data-layer gate (T033) was the one substantive open gap from this pass — see "T033 MFA
Remediation" immediately below for its dedicated follow-up. `blocked-member`'s `submitKyb` proof only
reaches "application not in DRAFT," not blocking specifically (its application is deliberately
terminal APPROVED, for T030/T034's own needs) — the RPC-level blocked check is instead confirmed at
the source for every KYB state-transition function. `tasks.md` T040 remains flagged, not rewritten
(per this run's own instruction — that correction belongs to Phase 11 closure).

## T033 MFA Remediation (2026-09-11, focused follow-up run)

A dedicated, focused run closed the APPLICATION-LAYER half of the gap Phase 8/9 found and reported —
the database/RLS half remains genuinely open, prepared but not applied, and T033 is correctly marked
OPEN in `tasks.md`, not complete.

### A. Inspection first (no guessing)

Read before changing anything: `(auth)/mfa/page.tsx` (T009's own three-state design — CHALLENGE /
already-enrolled / ENROLLMENT, resolved from Supabase's own `getAuthenticatorAssuranceLevel()`/
`listFactors()`, never a client-side gate), `sign-in/actions.ts`/`admin/sign-in/actions.ts` (both
already redirect a `nextLevel === "aal2" && nextLevel !== currentLevel` session to `/mfa/` at sign-in
time — confirming the POLICY this remediation enforces already existed, only its DATA-layer
enforcement was missing), `lib/auth/dal.ts`/`lib/auth/types.ts`/`lib/auth/eligibility.ts`, every
Feature 003 RLS policy and SECURITY DEFINER function (`supabase/trading_schema.sql` + all
`supabase/migrations/*.sql`), and `docs/architecture/DATABASE-CAPABILITY-MAP.md` — none of the
existing policies/functions reference `aal`/`mfa`/`assurance` anywhere, confirmed by direct grep.

### B. Existing policy discovered — no new product rule invented

The repository already has an authoritative rule, just not enforced at the data layer: a session is
"challenge-required" exactly when Supabase Auth's own AAL API reports a verified factor exists
(`nextLevel === "aal2"`) AND this session has not reached it (`currentLevel !== nextLevel`). An
account with no enrolled factor is never gated — both levels are always `"aal1"` for it. This
remediation enforces exactly that existing contract; it does not invent a blanket "everyone must use
MFA" rule.

### C. AAL authority source

Supabase Auth's own session JWT/API only: `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`
(application layer, `lib/auth/dal.ts`) and `auth.jwt() ->> 'aal'` read against the live per-request
JWT claim (database layer, the new `mfa_satisfied()` function) — never factor existence alone,
frontend state, route history, or an invented cookie.

### D. Application-layer enforcement — implemented and LIVE-VERIFIED

`RequestIdentity.requiresMfaStepUp` (new field, `lib/auth/types.ts`) is resolved fresh every request
in `lib/auth/dal.ts#resolveMfaStepUpRequired`, fails CLOSED (`true`) on any AAL-read error, and is
surfaced as a new `getEligibility` blocking reason (`"mfa-step-up-required"`, checked before every
other branch). Checked independently (defence in depth, the same pattern every other Feature 003
authorization check already follows) at: `src/app/dashboard/layout.tsx` and
`src/app/dashboard-admin/layout.tsx` (redirect to `/mfa/` before any protected content renders — the
exact two pre-existing guard-predicate lines each file's own `git diff`-checked test protects are
untouched), `src/app/dashboard/kyb/actions.ts#requireOnboardingOrganization` (covers every KYB
mutation), `src/app/dashboard/actions.ts#acceptAgreement`, and
`src/app/dashboard/settings/actions.ts#updateMyProfile`/`updateOrganizationContact`. A new
`ACTION_FEEDBACK.MFA_STEP_UP_REQUIRED` code surfaces as a localized (EN/AR) Sonner warning toast with
a "Verify now" action navigating to `/mfa/` (`AgreementRow`, `ProfileSettingsForm`,
`OrganizationContactForm`) — field-specific validation is untouched, unaffected.

**Live-verified** (`tests/auth/session.test.ts`, "APPLICATION LAYER" test): a real, freshly-enrolled
fixture (`mfa-member`) signs in on a BRAND-NEW session (`aal1`, step-up pending); `getRequestIdentity()`
resolves `requiresMfaStepUp: true` and `getEligibility` reports `"mfa-step-up-required"`; the real
`updateMyProfile` Server Action is called and denied (`mfa_step_up_required`, no mutation occurs); the
SAME session then completes `challengeAndVerify`; `getRequestIdentity()` immediately (no sign-out, no
new session) resolves `requiresMfaStepUp: false`. Enrolled-factor existence alone (established on a
DIFFERENT, already-verified session) does not satisfy a fresh session — proven directly by the fresh
session's own `aal1`/`nextLevel: "aal2"` state before its own challenge completes.

### E. Database/RLS layer — PREPARED, NOT APPLIED

`supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql` (+ matching `.rollback.sql`)
adds one new SECURITY DEFINER function, `public.mfa_satisfied()` (fixed `search_path`, `STABLE`,
EXECUTE granted to `authenticated` only — no PUBLIC/anonymous grant, no runtime `service_role`
dependency), and NEW RESTRICTIVE RLS policies (`mfa_gate_*`) on `profiles`, `organizations`,
`organization_members`, `kyb_applications`, `kyb_documents`, `file_assets`,
`agreement_acceptances`, `kyb_review_items`, `kyb_reviews`, `account_status_history`, plus a
bucket-neutral restrictive policy on `storage.objects` that gates only `kyb-evidence` bytes. A
RESTRICTIVE policy is ANDed with every existing PERMISSIVE policy Postgres already evaluates, so
none of the existing permissive policies is touched, redefined, or weakened.

The independent continuation audit found that policies alone were insufficient: every current
Feature 003 mutation/read RPC is `SECURITY DEFINER`, so its table-owner execution can bypass RLS.
The corrected migration therefore renames each exact live implementation in-place, revokes all
non-owner access to that internal name, and recreates its original API name as a fixed-search-path
MFA-checking SECURITY DEFINER wrapper. This preserves each original body/OID/authorization check
without copying or changing it. Covered RPCs: `update_my_profile`, `update_organization_contact`,
`start_organization_onboarding`, `create_kyb_draft`, `update_kyb_draft`, `attach_kyb_document`,
`submit_kyb_application`, `resubmit_kyb_application`, `create_kyb_review`, and
`list_kyb_document_reviews`. The migration remains one transaction; rollback drops the wrappers,
renames the retained implementations back, and restores their prior authenticated/service-role
grants. `organization_can_buy`/`organization_can_sell`/`is_authorized_member` remain untouched.

The same audit found one missing application defence-in-depth check in
`dashboard/onboarding/actions.ts`; it now redirects a step-up-pending session before profile sync or
organization creation. The existing migration helper was also tightened to fail closed for a
missing user-bearing JWT while continuing to allow approved service-role maintenance tooling.

**THIS COULD NOT BE APPLIED IN THIS RUN.** This environment has no `DATABASE_URL`/direct Postgres
connection string, no linked Supabase CLI project, and `supabase-js` (the only Supabase access this
runtime has, via the anon/publishable and service-role REST keys) cannot execute arbitrary DDL — only
RPC calls and table operations. Applying this migration requires a human running it against the live
Supabase project (Dashboard SQL editor, or `supabase db push` with the CLI linked). Per this run's own
explicit instruction, this is reported honestly rather than fabricated as live-verified.

**Live-confirmed, honestly, that both gaps this migration closes are real**
(`tests/auth/session.test.ts`, "PENDING MIGRATION" test): the SAME fresh, step-up-pending session
that the application-layer test denies can STILL read `profiles` directly and can reach the
original `update_kyb_draft` SECURITY DEFINER guard via a direct RPC call today. The test uses an
already-APPROVED application, so that RPC returns `invalid_transition` before any write; after
migration it must instead be rejected by the wrapper as `mfa_step_up_required`/SQLSTATE 42501.

### F. Regression

Independent pre-apply audit (2026-09-11): focused T030–T034/auth-boundary regression **56/56 passed**;
T033/session **19/19 passed** (including live no-factor AAL1 allowance, live member same-session
AAL1→AAL2, live admin AAL1→`/mfa/`, current direct-table bypass, current direct-RPC bypass, and four
static migration/rollback checks); full suite **553/553 passed** across 46 files; `typecheck` clean;
production build succeeds; every changed application/test file has 0 lint errors/warnings. The
repository-wide lint command still reports only the pre-existing `docs/claude-design/**` baseline
(124 errors, 148 warnings); no finding is in a changed product file. `git diff --check` clean.

The earlier remediation run had **547/547 passed**. Two pre-existing tests needed updates for the new
`getRequestIdentity()` call this remediation adds: `tests/auth/acting-organization.test.ts`'s
hand-built fake Supabase client gained a minimal `auth.mfa.getAuthenticatorAssuranceLevel()` stub
(no factor enrolled → `aal1`/`aal1`, i.e. never gated), and `tests/auth/agreement-ui.test.tsx` gained a
`next/navigation` `useRouter` stub (`AgreementRow` now calls it for the new toast's navigation action)
— neither test's actual assertions changed. `tests/design/uif-f.test.tsx`/`uif-g.test.tsx`'s
`git diff`-based guard-predicate-preservation tests both still pass: the new MFA checks were inserted
around, never replacing, the two protected existing guard lines each file's own test diffs for.

### G. Honest status

T033 is marked OPEN in `tasks.md`, not complete. The application-layer boundary is real and
live-verified; the database table/Storage/RPC boundary — the one that actually matters against a
browser-held JWT used outside this Next.js application — is prepared and independently audited but
requires a human to apply the migration. T033 closes only after that application and live
reverification that both the direct read and direct RPC assertions flip to MFA denial.

## Exact next action

**Apply `supabase/migrations/20260913000000_feature_003_t033_mfa_data_gate.sql` to the live Supabase
project (human action required — see "T033 MFA Remediation" §E above), then re-run
`tests/auth/session.test.ts` to confirm the "PENDING MIGRATION" direct table and RPC assertions flip
to denied and promote T033 to complete.** Only after that should Phase 10 (Accessibility, states, RTL — T035) begin
— not started in this run.

## T033 Post-Apply Live Verification (2026-09-11)

`20260913000000_feature_003_t033_mfa_data_gate.sql` was subsequently applied to the live Supabase
environment. This section supersedes only the former “not applied” status above; it preserves the
pre-apply finding as the reason the data gate was necessary.

### Real authenticated AAL proof

`tests/auth/session.test.ts` now uses real fixture credentials, real Supabase Auth factor enrollment,
real TOTP challenge/verification, a browser-capable Supabase client, and live PostgREST/Storage/RPC
calls. No identity, authorization result, AAL claim, database response, or Server Action is mocked.

- **No verified factor / AAL1:** the approved `buyer-only` member stayed at `aal1` with
  `nextLevel: aal1`, `mfa_satisfied()` returned true through the live API, and its own protected
  profile remained readable. The migration does **not** make MFA mandatory for everyone.
- **Verified factor / fresh AAL1:** a complete-DRAFT member first enrolled and verified TOTP, then
  opened a brand-new session for the same account. The new session was `aal1` with `nextLevel: aal2`;
  listing factors (the read-only setup used by `/mfa/`) left it at `aal1`. Live
  `mfa_satisfied()` returned false. Direct reads against `profiles`, `organizations`,
  `organization_members`, `kyb_applications`, `kyb_documents`, `file_assets`,
  `agreement_acceptances`, `kyb_review_items`, `kyb_reviews`, and `account_status_history` emitted
  no row. A correctly-scoped DRAFT-path `kyb-evidence` upload attempt was denied before any byte was
  stored; a post-step-up listing confirmed the probe object does not exist.
- **Direct RPC bypass closed:** the same fresh AAL1 session called all ten browser-callable protected
  SECURITY DEFINER APIs directly — `update_my_profile`, `update_organization_contact`,
  `start_organization_onboarding`, `create_kyb_draft`, `update_kyb_draft`,
  `attach_kyb_document`, `submit_kyb_application`, `resubmit_kyb_application`,
  `create_kyb_review`, and `list_kyb_document_reviews`. Every call stopped at the wrapper with
  SQLSTATE `42501` and `mfa_step_up_required`, before its retained implementation could validate
  input or mutate data.
- **Same session / real AAL2:** that exact fresh client completed `challengeAndVerify` using the
  factor’s live RFC-6238 code. It became `aal2` without signing in again; live `mfa_satisfied()`
  returned true. Its otherwise-authorized organization, membership, KYB application, five document
  metadata rows, and file metadata rows were readable directly, and `update_my_profile` succeeded
  with the existing fixture values (no business-value change). This is a real DB/RPC gate proof, not
  a UI-only route proof.

The live table inventory confirmed records exist in every gated public-table surface except
`kyb_reviews`, which currently contains zero rows. Its AAL1 direct query remained empty as required;
there is no harmless real row with which to demonstrate AAL2 visibility, so no fake row was created
for verification. This does not weaken the applied restrictive policy, which is covered by the same
live `mfa_satisfied()` result and the exact AAL1 direct query.

### Regression and scope

- `npm run typecheck` passed.
- `npm test -- session` passed: **19/19**. The live DB/RPC test has an explicit 30-second test budget
  because it deliberately performs 10 table, Storage, and 10 RPC round trips against Supabase.
- The focused Phase 9/auth-boundary selection (`session`, `isolation`, `eligibility-freshness`,
  `kyb-transitions`, `agreements`, `admin-auth`, `acting-organization`) completed after the applied
  gate; no regression was reported.
- A post-change full `npm test` run completed against the current test inventory (553 tests / 46
  files); no tests were added or removed by the T033 post-apply change.
- `npm run build` passed. ESLint over every changed product/test TypeScript file passed with no
  finding; the established repository-wide docs-only baseline remains unchanged. `git diff --check`
  passed.

T030 cross-organization isolation, T031 freshness/acting-organization behavior, T032 KYB
transitions, T034 agreement evidence/versioning, sign-out, enumeration resistance, and Member/Admin
sign-in boundary were rerun as part of the focused selection. The migration did not change DB schema
shape, RLS baseline rules, Storage bucket configuration, or the protected capability functions;
it adds only the approved MFA enforcement helper/restrictive policies/wrappers. No commit or push was
made. Phase 10 (T035+) and Phase 11 remain unstarted.
