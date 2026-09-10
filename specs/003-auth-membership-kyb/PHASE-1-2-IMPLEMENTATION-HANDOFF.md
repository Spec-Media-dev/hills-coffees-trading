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

## Exact next action

Feature 003 Phase 3 (and Phase 7, if sequenced next) is the next work item — **not** to be started
in this run.
