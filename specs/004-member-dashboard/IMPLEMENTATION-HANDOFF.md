# Feature 004 — Member Dashboard — Implementation Handoff

## RUN A (2026-09-12) — Phase 1 (Module Contract, T001–T003) + Phase 2 (Shell Layout, T004–T008)

**Scope of this run**: T001–T008 only. Phase 3 (acting-organization switcher, T009–T010), Phase 4
(overview page, T011–T014), Phase 5 (ineligible-member states, T015–T017), Phase 6 (account-area
entries, T018), Phase 7 (automated tests as a separate phase, T019–T022), and Phase 8
(accessibility/RTL/no-JS closure, T023–T025) are **NOT started**. Phase 9 (verification & closure,
T026–T029) is likewise not started as a formal phase, though its three mechanical checks
(`buyer-dashboard`/`seller-dashboard` grep, service-role/shared-cache grep, roadmap update) were run
and satisfied early as part of this run's own regression, because the run directive required proving
them for the code just written.

No database work was needed or performed — no migration, no new table, no new function, no new query
surface. Everything reads only what Feature 003's `getRequestIdentity()` already resolves.

### T001 — Module registration contract (`lib/dashboard/modules.ts`)

Defines `DashboardCapability` (`"member" | "buy" | "sell"` — deliberately no fourth value),
`NavEntry`, `NavGroupContribution`, `OverviewArea` (`"account" | "bought" | "owe" | "where"`),
`OverviewCard`, `ActionItem`, `DashboardModuleContext`, and `DashboardModule`.

**Declaration-vs-authorization safeguard**: the file's own header comment states, in the most
prominent position, that every `requiredCapability` is presentational only and is never consulted to
decide whether a request may proceed — every module route must independently call
`getRequestIdentity()`/the eligibility layer. `tests/dashboard/registry.test.tsx` asserts this exact
wording is present in the file and that the contract itself performs no redirect, Supabase call, or
throw.

### T002 — Static registry (`lib/dashboard/registry.tsx`)

`.tsx`, not `.ts` — `NavEntry.label` needs real `<AppBilingual>` JSX for server-rendered EN/AR, the
same reason its now-retired predecessor (`components/app/member-navigation.tsx`) was also `.tsx`.

Registers exactly ONE module, `"account"`, covering the two genuinely-live `/dashboard` destinations
(Overview, Settings) — the same two groups the old hardcoded `buildMemberNavGroups({ canSell: false
})` produced, now sourced from the registry contract instead. It contributes no `overviewCards`/
`actionItems` — see T003 for why.

### T003 — Overview composition contract (`lib/dashboard/overview.tsx`)

`composeOverview({ organization, registry })` returns `{ account, bought, owe, where, needsAction }`.
The `account` area is built DIRECTLY from the resolved `OrganizationMembership` (display name +
member role) — never through the module registry, and never re-deriving KYB/agreement status (that
truth is already fully resolved by `dashboard/layout.tsx`/`dashboard/page.tsx` before a caller ever
reaches an "overview" at all — re-summarising it here would duplicate Feature 003's own logic, which
the run directive forbids). `bought`/`owe`/`where`/`needsAction` are populated only by iterating
registered modules' contributions, filtered by capability — currently always empty, since no business
module exists yet (FR-006: absent modules contribute nothing, never a placeholder).

**NOT WIRED TO A LIVE PAGE YET.** `src/app/dashboard/page.tsx` still renders `FoundationOverview` —
Phase 4 (T011) replaces that with this composer's output in a later run. This infrastructure exists
now, proven by its own tests, so 005–009/012 have a stable contract to register against before Phase
4 lands.

### T004 — Real dashboard shell (`src/app/dashboard/layout.tsx`)

**Guard preservation**: every authorization branch above the final `return` is byte-identical to
before this run (confirmed by `tests/design/uif-f.test.tsx`'s `git diff`-based guard-predicate check,
which still passes). Only the final, already-authorized `AppShell` return changed.

**What changed**: the previously-hardcoded `buildMemberNavGroups({ canSell: false })` is replaced with
`buildDashboardNavGroups({ modules: DASHBOARD_MODULES, organization: identity.organization })` — this
now reads the ACTING organization's real, freshly-resolved `canBuy`/`canSell` (Feature 003's own
comment on this file explicitly reserved this exact change for Feature 004). A `topbarActions` prop
was also added, rendering the new `DashboardTopbarActions` (account menu + reserved notifications).

**Reuse, not rebuild**: `AppShell`/`Sidebar`/`Topbar`/`MobileAppNav` (Feature 002 Phase 5.5) already
exist as a shared, presentational, prop-driven shell used by both `/dashboard` and `/dashboard-admin`.
Rebuilding them would have been exactly the "independent second navigation truth" / "ad-hoc alternate
system" the run directive forbids. This run's new `components/dashboard/*` files are thin,
dashboard-specific COMPOSERS that feed the existing shell real data — they do not duplicate its
rendering.

### T005 — Sidebar capability rendering (`components/dashboard/sidebar.tsx`)

Exports `buildDashboardNavGroups`, a pure function (not a new visual component — see its own header
comment on why) that merges every registered module's `navGroups`, filtering individual entries by
`requiredCapability` against the organization's real `canBuy`/`canSell` (`"member"` always granted).
Two modules contributing to the same group key are merged rather than producing a duplicate group
header. Proven in `tests/design/uif-f.test.tsx`'s retargeted UIF-038 block (buyer-only renders exactly
what's granted; seller-additive adds one group without replacing buyer entries) and
`tests/dashboard/shell.test.tsx` (capability filtering produces different, non-memoised output per
call).

### T006 — Topbar (`components/dashboard/topbar.tsx`)

Two genuinely new pieces, both passed into the EXISTING `AppShell`'s `topbarActions` prop (acting-org
display already existed via `identitySubtitle`):

- `DashboardAccountMenu` — reuses `UserAvatar`/`DropdownMenu*`/`LogoutConfirmDialog` (the exact same
  primitives the public site header's `AccountMenu` already uses) rather than rebuilding them, scoped
  down to what's relevant inside `/dashboard` itself (Settings link + sign out, no "Go to Dashboard"
  link since the caller is already there).
- `DashboardNotificationsButton` — reserved, disabled, with a truthful localized accessible name
  ("Notifications — Notifications aren't available yet"). No unread count, no dropdown content, no
  mark-read action, no polling — `tests/dashboard/shell.test.tsx` asserts both the rendered `disabled`
  state and the absence of any count/polling/fake-data pattern in the source. Real notification
  delivery is Feature 012's scope, blocked on DB-BLOCK-04.

### T007 — Responsive shell (`components/dashboard/responsive/table-card-list.tsx`)

Tablet/mobile sidebar collapse to a drawer already existed (`MobileAppNav`, Phase 5.5) — genuinely
nothing new was needed there. The real gap plan.md identified was a reusable table→card-list
primitive for future modules' data tables. `TableCardList<Row>` renders a real `<table>` at `lg:` and
above and the identical `rows` as a card list below it, from one shared `columns`/`rows` prop set (no
drift between the two views possible). Proven with a minimal, generic, non-business fixture in
`tests/dashboard/responsive.test.tsx`, per the run directive's explicit allowance ("a minimal
fixture/demo... is acceptable"; no speculative business table was built).

### T008 — Noindex (dashboard routes)

`dashboard/layout.tsx`'s existing `robots: { index: false, follow: false }` already covered every
`/dashboard/*` route. `src/app/dashboard/kyb/page.tsx` carried a redundant (identical, non-conflicting)
duplicate — removed so the rule exists exactly once, per this task's requirement. No test asserted
the removed field (`tests/public/seo-boundary.test.ts` only checks the two layout files), and the
resolved metadata for `/dashboard/kyb/` is unchanged (Next merges the parent layout's `robots` when a
child doesn't declare its own).

## Cross-cutting closure items

- **EN/AR**: new copy (`notifications.label`/`.unavailable`, `dashboardAccount.cardTitle`/
  `.roleLabel`) added to both `lib/app/copy/en.ts` and `lib/app/copy/ar.ts` with real Arabic, not
  deferred. The account-menu/settings-link/sign-out copy reuses existing, already-reviewed keys
  (`t.account.menuLabel`/`.signOut`, `tApp.settings`) rather than inventing duplicates.
- **RTL/logical CSS**: `grep -rn "text-left|text-right|[^-]pl-|[^-]pr-" src/app/dashboard
  components/dashboard` returns nothing.
- **Light/Dark**: no new hardcoded colors — every new component uses existing design tokens
  (`text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, etc.) already proven
  theme-safe by Feature 002/003's own closure passes. No live-browser dual-theme screenshot pass was
  performed this run (unlike Feature 003's T035/T036 closure, which had a live browser available) —
  this is a real gap, honestly recorded below, not claimed as verified.
- **Accessibility**: the notification button has a real accessible name and `disabled` state; the
  account menu reuses an already-accessible primitive (`DropdownMenu`, Base UI); `TableCardList` uses
  genuine `<table>`/`<th scope="col">`/`<caption>` semantics, not a div grid. No live axe/browser pass
  was run this run (see gap below).
- **No shared private cache / no service-role**: `grep -rn "cacheTag|unstable_cache|SERVICE_ROLE"
  src/app/dashboard lib/dashboard components/dashboard` returns nothing; `grep -rn
  "buyer-dashboard|seller-dashboard" src components lib` returns nothing.
- **Server-vs-client**: only `components/dashboard/topbar.tsx` is `"use client"` (the account-menu
  dropdown/dialog state and the notification button's interactive-but-inert state). `sidebar.tsx`
  (a pure function, no JSX component export) and `responsive/table-card-list.tsx` are plain Server
  Components.

## Regression run this run

- Focused: `tests/dashboard/*` (19 new tests, 4 files), `tests/design/uif-f.test.tsx` (21, 2 retargeted
  from the retired `member-navigation.tsx`), `tests/auth/run-a-sign-up-onboarding.test.ts` +
  `tests/auth/run-b-kyb.test.ts` (79 — the two tests that assert `dashboard/layout.tsx`'s guard-order
  invariant, both passing).
- `npm run typecheck` — clean.
- `npm test` — **572/572 passing, 49 files** (up from Feature 003 closure's 553/46 — 19 new tests, 3
  new files, no regressions).
- `npm run build` — clean.
- `npm run lint` — 272 problems (124 errors, 148 warnings), all under the pre-existing
  `docs/claude-design/` historical baseline (confirmed by grepping the lint output's own file-header
  lines — zero hits outside that directory); zero new findings in Feature 004 code.
- `git diff --check` — clean (only benign LF→CRLF autocrlf notices on Windows).

## Honest gaps (not blockers to closing T001–T008, but real and undone)

- **No live-browser pass this run** — Feature 003's closure run had an isolated production server
  available and used it for a real axe/Chrome-CDP pass; this run relied on typecheck/unit/integration
  tests and source-level verification only. Light/dark contrast, real keyboard-drawer behaviour at
  tablet width, and true 390px overflow were reasoned about (existing tokens/primitives reused) but not
  independently re-driven through a real browser.
- `lib/dashboard/overview.ts`/`registry.ts` are not yet wired into any live page — `src/app/dashboard/
  page.tsx` still renders the Feature-003-era `FoundationOverview` placeholder. This is Phase 4's job
  (T011), explicitly out of RUN A's scope.
- The account menu's fallback display name (`fullName ?? companyName ?? "Account"`) reuses an
  existing, pre-established convention (`components/public/site-header.tsx`) that itself has an
  unlocalized `"Account"` literal fallback — a pre-existing, narrow gap this run did not introduce and
  did not fix (out of scope; flagging for whoever eventually addresses it).
- Phases 3, 4, 5, 6, 8, and formal Phase 7/9 remain entirely unstarted, as directed.

## RUN B (2026-09-12) — Phase 3 (Acting Organization, T009–T010) + Phase 4 (Overview Page, T011–T014) + Phase 5 (Ineligible Member States, T015–T017)

**Scope of this run**: T009–T017 only. Phase 6 (account-area entries, T018) and Phases 7–9
(T019–T029) remain **NOT started**. No database work — no migration, no new table/function/query
surface. `organization_can_buy`/`organization_can_sell`/`is_authorized_member` untouched (confirmed:
no migration files created or modified this run).

### T009 — Acting-organization switcher (`components/dashboard/org-switcher.tsx`)

A compact `OrgSwitcher`, rendered in `AppShell`'s `identitySubtitle` slot so the acting organization
is visible on every `/dashboard` page, not only Settings. One organization → plain text, no selector
(never `organizations[0]` — found by id instead, and the zero-organization case returns `null` rather
than reading index 0 either). More than one → a real shadcn `Select` (`SelectValue` given an explicit
`(value) => label` render function, since Base UI's Select otherwise displays the raw value string,
not a human label — this was caught and fixed via the real browser pass, not merely inspected).

**Real production build failure hit and fixed**: the switcher initially imported `setActingOrganization`
directly from `lib/auth/eligibility.ts` — but that file's other exports transitively import
`lib/supabase/server.ts` (`next/headers`), which cannot be bundled into client code. `next build`
failed with exactly this trace. Fixed by having `dashboard/layout.tsx` (a Server Component) import
`setActingOrganization` itself and pass it down as a `switchOrganization` prop — the standard,
supported way a Client Component invokes a Server Action without importing its module graph. No
second acting-organization mechanism was created; `setActingOrganization` itself is byte-for-byte the
same function `OrganizationSelector` and `settings/acting-organization-switcher.tsx` already call.

**Live-verified** (real Chrome/CDP): the multi-org fixture, after resolving the forced
`OrganizationSelector` choice (a fresh sign-in with 2 memberships and no acting-org cookie yet lands
there first — expected, unchanged Feature 003 behaviour), shows the switcher with
`aria-label="Switch acting organization"` and the current organization's name. The single-org
buyer-only fixture shows no `[role="combobox"]` at all.

### T010 — Explicit acting-organization threading

Already true by construction since RUN A (`composeOverview`/`buildDashboardNavGroups` take
`organization` as an explicit parameter, never read ambiently). This run added:
- An interleaved two-organization test (`tests/dashboard/org-switcher.test.tsx`) — four calls
  alternating between two organizations, proving no cross-contamination (the strongest proof
  available for pure, synchronous, no-I/O functions; true OS-level thread concurrency does not apply
  here, and the directive's "concurrent requests" concern is about ambient/shared state, not
  literal parallelism, which these functions structurally cannot have).
- A grep-based regression (`globalThis`, top-level mutable `let`/`var`) across every `lib/dashboard`/
  `components/dashboard` file — clean.

### T011 — Live overview page (`src/app/dashboard/page.tsx`)

The final, fully-eligible branch now calls `composeOverview` and renders `OverviewCardSection` (per
area) + `ActionList` (needs-action), replacing `FoundationOverview`. Every guard branch above it
(unauthorized/unattached, not-yet-authorized-member via `KybStatusScreen`, agreement-not-accepted via
`AgreementList`) is completely untouched — reached and returned from exactly as before RUN B.
`tests/design/uif-h.test.tsx` was updated to reflect this (its old assertion that `/dashboard` and
`/dashboard-admin` both mount `FoundationOverview` is now stale for `/dashboard` — `/dashboard-admin`
is unchanged, Feature 010's future scope).

### T012 — Overview cards + formatting (`components/dashboard/overview-card.tsx`, `lib/dashboard/format.ts`)

`formatMoney(4.8, "USD", "kg")` → `"USD 4.80 / kg"`; `formatQuantity(320, "bags", 60, "kg")` →
`"320 bags · 60kg"`; `ReferenceCode` renders monospace tabular figures — all three proven by direct
test assertion, not merely inspected. Deliberately narrow (two functions, one component) — not a
financial formatting framework.

**Fixed the pre-existing "Account" fallback localization gap** the RUN A handoff flagged: the
account-menu display name now passes the raw, nullable `fullName`/`companyName` down and resolves the
"Account" fallback CLIENT-SIDE inside `DashboardAccountMenu` via `tApp.dashboardAccount.fallbackName`
— so it renders in the viewer's actual locale, an improvement over the narrower, still-unfixed
English-only pattern `components/public/site-header.tsx` uses (deliberately not touched — outside
Feature 004's path, Feature 002/003's scope).

### T013 — "Needs your action" (`components/dashboard/action-list.tsx`, `lib/dashboard/overview.tsx`)

`composeOverview` computes one real, specific, tested action item — "Accept the current membership
agreements" → `/dashboard/` — when `hasAcceptedCurrentAgreements` is false. **Honestly documented
architectural limitation**: on the LIVE page this can never actually render, because Feature 003's
existing agreement gate (T025, already verified/closed) intercepts that exact condition with a
full-page `AgreementList` BEFORE `composeOverview` is ever called. The equivalent KYB-remediation
condition is unreachable one guard earlier, for the same structural reason
(`!identity.isAuthorizedMember`). Restructuring either full-page gate into an inline item was judged
out of RUN B's scope — it would change already-verified Feature 003 UX/behaviour, not merely extend
Feature 004's own new surface. This is recorded in `lib/dashboard/overview.tsx`'s own header comment,
not hidden, and directly unit-tested (`tests/dashboard/registry.test.tsx`) so the logic is proven
correct even though it cannot currently surface live.

### T014 — Honest empty states

`dashboardOverview.{bought,owe,where,needsAction}.empty` (EN+AR) render only when an area is
genuinely empty, explaining what will appear there — never a fabricated `0`/`$0`. Verified by
rendering the composed cards and regex-scanning for currency/quantity patterns.

### T015 — Ineligible-member states — REUSED, NOT REBUILT

Feature 003's `KybStatusScreen` (T019–T021) already provides a distinct branch per
`kyb_applications.status`, including the implicit "no application" (PENDING_KYB) state, with the
approved vocabulary, a safe reason where available (REJECTED's `rejectionReason`, never a reviewer
identity), and no trading CTA anywhere. `tests/dashboard/states.test.tsx` proves this — including that
all four states produce genuinely distinct heading text — rather than building a second engine.

### T016 — Direct-access security

Features 005–009 have no real trading-module route yet — inventing one merely to "deny" it would
have been exactly the "fake production route to satisfy a test" the run directive forbids. Proven
instead with a controlled fixture module: nav visibility (`buildDashboardNavGroups`) and a route's own
authorization decision are computed independently from the same `organization.canSell` fact, and a
fixture "route guard" function correctly denies an ineligible organization regardless of whether its
nav entry was hidden. Reconfirmed (position-based source check) that `dashboard/layout.tsx` still
never reaches `<AppShell` for a not-yet-authorized organization. `lib/dashboard/modules.ts` itself
states the rule any real future module route (005–009/012) must follow: the registry must never
become a hidden authorization system.

### T017 — Zero-organization user

Already implemented by Feature 003 (`dashboard/layout.tsx`'s `identity.organization === null` branch
→ `OnboardingExperience`, never `AppShell`) — unchanged this run. Added a Feature-004-owned regression
test (`tests/dashboard/states.test.tsx`) confirming the property holds, alongside the pre-existing
Feature 003 coverage.

### Real browser pass — the RUN A gap is now closed

`tests/browser/feature004-runb.browser.mjs`, on the same CDP harness (isolated production server,
never the developer's own dev server). Verified: buyer-only fixture at EN light desktop, EN dark
desktop, AR light mobile (confirmed `dir="rtl"`), AR dark mobile — 0 axe violations in every pass, no
horizontal overflow, no selector shown for the single-membership fixture. Multi-org fixture: 0 axe
violations, and the switcher renders with the correct accessible name and current-organization text.
Pending-kyb fixture: 0 axe violations, and no dashboard shell chrome (no `[role="combobox"]`) leaks
through for the not-yet-authorized state. Zero console errors, zero page errors, across every pass.
SUSPENDED/REJECTED specifically were verified via component-level rendering of the real
`KybStatusScreen` with fixture data (`tests/dashboard/states.test.tsx`), not independently re-driven
through a live toggled-fixture browser session this run — the existing Feature 003 fixture-toggle
mechanism for those two statuses was not exercised again here to avoid mutating shared fixture state
without need, given the component-level evidence was already strong.

### Regression run this run

- Focused: all of `tests/dashboard/*` (5 files, 43 tests: 5 new/updated this run — `org-switcher`,
  `states`, plus updates to `registry`), `tests/design/uif-f.test.tsx`, `tests/design/uif-h.test.tsx`
  (1 assertion retargeted for the new live overview), and the full `tests/auth/*` suite (eligibility,
  acting-organization, isolation, MFA/session, admin-auth boundary) — all passing, no regressions.
- `npm run typecheck` — clean.
- `npm test` — **592/592 passing, 51 files** (up from RUN A's 572/49).
- `npm run build` — clean (after fixing the client/server boundary issue above).
- `npm run lint` — 272 problems, all under the historical `docs/claude-design/` baseline; zero new
  findings in Feature 004 code.
- `git diff --check` — clean.
- Mechanical greps (T010/T016/T027/T028-equivalent): `globalThis|module-scope let`,
  `cacheTag|unstable_cache|SERVICE_ROLE`, `buyer-dashboard|seller-dashboard`, and the RTL
  `text-left|text-right|[^-]pl-|[^-]pr-` scan across `src/app/dashboard`/`components/dashboard` all
  return nothing. `git diff --stat` against `src/app/dashboard-admin`/`src/app/admin` is empty — the
  Admin/Member boundary was not touched.

## Honest gaps (not blockers to closing T009–T017, but real and undone)

- The "needs your action" agreement item is real and tested but structurally unreachable on the live
  page (see T013 above) — this is a known, documented limitation, not a defect, but a future run
  should decide deliberately whether to restructure the full-page agreement gate into an inline
  experience, rather than this remaining accidental.
- SUSPENDED/REJECTED were not independently re-verified through a live, toggled-fixture browser
  session this run (component-level `KybStatusScreen` rendering was used instead — see above).
- Phase 6 (account-area entries, T018) and formal Phases 7–9 (T019–T029) remain entirely unstarted.
- `components/public/site-header.tsx`'s own "Account" fallback remains English-only/unlocalized —
  still out of Feature 004's path, not fixed this run either.

## RUN C (2026-09-12) — Phase 6 (Account Area Entry, T018) + Phase 7 (Automated Tests, T019–T022) + Phase 8 (Accessibility/RTL/No-JS, T023–T025)

**Scope of this run**: T018–T025 only. Phase 9 (final closure, T026–T029) is **NOT started** — this
run does not mark Feature 004 closed. No database work — no migration, no new table/function/query
surface. `organization_can_buy`/`organization_can_sell`/`is_authorized_member` untouched this run
(confirmed: no migration files created or modified). The applied MFA migration was not touched.

### T018 — Account-area navigation registration

The route tree was inspected first (`src/app/dashboard/**`) rather than assuming the four conceptual
destinations the task names each need their own route. Finding: only TWO real, reachable routes exist
for an already-authorized member — `/dashboard` (Overview) and `/dashboard/settings` (Profile +
organization contact + team + acting-org switcher, all on ONE page). `/dashboard/kyb/` redirects an
authorized member straight back to `/dashboard/` (its own existing guard); there is no standalone
"view your accepted agreements" page. So "Profile" and "Organization" truthfully collapse into the
already-registered Settings entry (now carrying a `description` — `settingsPage.description`, an
existing, already-reviewed copy key, not a new one) and "Agreements"/"KYB Status" get NO nav entry at
all — inventing either would have been exactly the "invent a route merely because the task names a
conceptual destination" the run directive forbids. This is a genuine, honestly-documented product gap
(`lib/dashboard/registry.tsx`'s own header comment records it) for a future run to decide on
deliberately, not something worked around here.

### T019 — Capability gating tests (`tests/dashboard/capability-gating.test.ts`)

A dedicated file proving: buyer-only renders no seller group; buyer+seller renders both, seller
additive; and — the strongest evidence in this run — REAL freshness, using the exact same
`setBuyerAndSellerCanSell` live-fixture toggle Feature 003's own `tests/auth/request-identity.test.ts`
already established for this exact fixture (canonical state recovered first, restored in a `finally`,
identical discipline). `organization_can_sell` is flipped false→true on the real `buyerAndSeller`
fixture through the SAME signed-in Supabase client, with no sign-out and no new session — the very
next `buildDashboardNavGroups` call reflects the change. Direct-access proof level stays at "controlled
fixture module + route-guard stand-in" — Features 005–009 still have no real route to deny, and no
fake one was invented to manufacture a stronger-looking proof.

### T020 — Registry tests (`tests/dashboard/registry.test.ts`)

Extended RUN A's 11 tests to 15: registered navigation renders in the correct group in deterministic
order; duplicate group keys across two modules merge into ONE header with both modules' entries
present in registration order (the chosen, now-documented contract — not silently dropped, not two
headers); the nav builder and composer both produce deep-equal output across repeated calls with
identical inputs (determinism); and a direct reconfirmation that the registry cannot execute a
capability declaration (no `eval`/`new Function` anywhere in the builder).

### T021 — State tests (`tests/dashboard/states.test.tsx`)

Extended RUN B's 10 tests to 13, adding the two states the run directive names explicitly that RUN B
had not yet covered: the "empty overview" state (an approved organization with zero registered
business-module contributions — the honest, everyday case today) and an explicit confirmation that an
ELIGIBLE organization's composed overview never contains PENDING/UNDER_REVIEW/SUSPENDED/REJECTED
vocabulary, plus a source-position check that `dashboard/page.tsx` only calls `composeOverview`
strictly after every ineligible-state guard has already returned.

### T022 — Tenant isolation / concurrency (`tests/dashboard/tenant-isolation.test.ts`)

The security-sensitive proof the run directive flags as NO-GO on failure. Signs in as the REAL
`multiOrg` fixture ONCE, fetches BOTH real organizations' `display_name`/`member_role`/
`organization_can_buy`/`organization_can_sell` via a single `Promise.all` (8 concurrent live Supabase
calls — the same `Promise.all`-of-independent-queries pattern `tests/auth/isolation.test.ts` already
established), builds two real `OrganizationMembership` objects from the results, then feeds them into
`composeOverview`/`buildDashboardNavGroups` genuinely INTERLEAVED via `Promise.all` (never
sequential-then-sequential) — asserting neither organization's result ever contains the other's
id/display name. Documented reasoning for why this is the correct, strongest available proof (not a
weaker substitute): these functions are pure, synchronous, and take their only organization input as
an explicit parameter with no shared state anywhere in their call graph — literal OS-thread
concurrency cannot apply to them at all, so the meaningful failure mode a test could actually catch is
accidental shared/ambient state, which real concurrently-fetched data run through an interleaved call
pattern directly exercises. The `globalThis`/module-scope-mutable grep remains as a second,
independent, corroborating check — not the sole proof, per the run directive's explicit instruction
not to settle for that alone.

### Org-switch-failure feedback audit — conclusion: no code change needed

Audited carefully, as directed. The only way `setActingOrganization` can fail to switch is an
organization id that is not in the caller's CURRENT, freshly-resolved membership list. Two ways this
can happen:
1. **Malicious/tampered input** — a raw client-supplied id for an organization the caller never
   belonged to. Already, correctly, silently refused (no cookie written), matching Feature 003's own
   documented, deliberate design for the other two call sites of this same function.
2. **A genuine, legitimate race** — a membership revoked between the switcher rendering and the click
   (e.g. an admin removes the member from that org a moment later). This is real but does not leave
   the user misled: the redirect lands them back on the same page, which still accurately shows their
   real, unchanged acting organization — nothing was silently "switched" to a wrong context, and
   nothing false is displayed.

Because the only failure mode is safely and silently refused, and the "genuine race" case still
resolves to an accurate, non-misleading state, this satisfies the run directive's own stated exception
("If the only invalid case is malicious/direct tampering and the server safely refuses it, do not
manufacture unnecessary UI complexity"). No Sonner wiring was added; `setActingOrganization`'s
always-redirects contract (shared by three call sites) was not changed. `dashboardAccount`'s existing
`actingOrganizationSwitchFailed` copy key remains reserved/unused, consistent with this conclusion —
not a defect, a deliberate non-change.

### T023 — Accessibility pass (real Chrome/CDP, `tests/browser/feature004-runc.browser.mjs`)

0 axe violations on `/dashboard/` and `/dashboard/settings/` (buyer-only fixture), re-confirmed after
this run's registry `description` addition. Landmarks: exactly one labelled `nav`, one `header`, one
`main`. Active nav state exposed via `aria-current="page"`. Keyboard: 25 sequential Tab presses land
on a real focusable element with a visible focus outline — no trap encountered. Mobile drawer (390px):
opens with focus genuinely moved inside `[role="dialog"]` (confirmed via `dialog.contains(document.
activeElement)`, not inferred), Escape closes it and focus verifiably returns to a labelled trigger,
and no horizontal overflow remains afterward.

### T024 — EN/AR/RTL/externalised copy

The exact grep (broadened to also include `ml-`/`mr-`) returns nothing across `src/app/dashboard`,
`components/dashboard`, `lib/dashboard`. **The "Account" fallback localization debt is now fully
eliminated from Feature 004's own surface** (RUN B already fixed the dashboard account-menu's
fallback). This run specifically audited the ONE remaining instance the RUN B handoff flagged —
`components/public/site-header.tsx` — and confirmed it is genuinely OUTSIDE Feature 004's surface:
`SiteHeader` renders only on the public marketing site via `PublicShell`, never inside `/dashboard/*`
(which uses `AppShell`/`Topbar` instead). Left deliberately untouched — Feature 002/003's ownership,
per the run directive's own conditional wording ("if it is in the Feature 004/member portal surface").

### T025 — No-JS / client-island audit

**Real no-JS browser request**, not source inference: signed in normally (with JS), then
re-requested `/dashboard/` with `Emulation.setScriptExecutionDisabled` genuinely set via CDP. Result:
a real `<nav>` and `<main>` present in the raw HTML, page body non-empty (342 characters of real
text), and the localized "Overview"/"نظرة عامة" label itself present in the unhydrated markup.
`grep -rln "use client" components/dashboard src/app/dashboard` lists exactly: `org-switcher.tsx` (the
interactive `Select`), `topbar.tsx` (dropdown/dialog state), `src/app/dashboard/error.tsx` (a required
Next.js convention — error boundaries must be Client Components, unrelated to this feature's own
choices), and the two pre-existing Feature 003 settings forms (`organization-contact-form.tsx`,
`profile-settings-form.tsx` — untouched this run, Feature 003's own scope). No Feature 004 component
was made client-side without a genuine interaction reason; `sidebar.tsx` (a pure function, not even a
component), `overview-card.tsx`, `action-list.tsx`, and `responsive/table-card-list.tsx` all remain
plain Server Components.

### Regression run this run

- Focused: `tests/dashboard/*` (7 files, 51 tests — 13 new/added this run across
  `capability-gating.test.ts` [new], `tenant-isolation.test.ts` [new], `registry.test.ts` [+4],
  `states.test.tsx` [+3]).
- `npm run typecheck` — clean.
- `npm test` — **605/605 passing, 53 files** (up from RUN B's 592/51).
- `npm run build` — clean.
- `npm run lint` — 272 problems, all under the historical `docs/claude-design/` baseline; zero new
  findings in Feature 004 code.
- `git diff --check` — clean.
- `git diff --stat` against `src/app/dashboard-admin`/`src/app/admin` — empty; the Admin/Member
  boundary was not touched.
- Mechanical greps (RTL, shared-cache/service-role, buyer/seller-dashboard, ambient state) — all
  return nothing, reconfirmed after this run's additions.

## Honest gaps (not blockers to closing T018–T025, but real and undone)

- The "needs your action" agreement item (RUN B) remains real, tested, but structurally unreachable on
  the live page — unchanged this run, a deliberate scope decision, not newly discovered.
- SUSPENDED/REJECTED remain verified via component-level `KybStatusScreen` rendering, not an
  independently re-driven live, toggled-fixture browser session (same conclusion as RUN B — the
  component-level evidence plus this run's real-browser pass on other fixtures was judged sufficient;
  toggling those specific shared fixtures again was not necessary to add further confidence).
- Only Phase 9 (T026–T029 — final verification/closure, roadmap finalization) remains before Feature
  004 can be formally declared closed.

## Exact next run

Phase 9 (T026 — run lint/typecheck/tests/build; T027 — confirm no `/buyer-dashboard`/`/seller-dashboard`
route anywhere; T028 — confirm no shared cache/service-role usage; T029 — final roadmap/documentation
closure) is the next and final scoped unit of work for Feature 004.
