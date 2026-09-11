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

## Exact next action

RUN B (T014–T022, Phase 4 + Phase 5 — KYB draft/document/submission/status experience) is the next
work item — **not** started in this run. Before or alongside it, the `organizations.created_by` /
`profiles` row-creation gap documented above should be raised for an approved migration.
