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

## Exact next run

Phase 3 (T009 — `components/dashboard/org-switcher.tsx` consuming 003's acting-organization
resolution; T010 — thread the acting organization explicitly through every module render path with no
ambient global) is the next scoped unit of work, followed by Phase 4 (wiring `composeOverview` into
`src/app/dashboard/page.tsx`, replacing `FoundationOverview`).
