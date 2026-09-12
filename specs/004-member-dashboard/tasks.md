# Tasks: Member Dashboard (004)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), `docs/claude-design/` dashboard layout.

**Status**: **RUN A (2026-09-12) COMPLETE — Phase 1 (T001–T003) + Phase 2 (T004–T008).
RUN B (2026-09-12) COMPLETE — Phase 3 (T009–T010) + Phase 4 (T011–T014) + Phase 5 (T015–T017).
RUN C (2026-09-12) COMPLETE — Phase 6 (T018) + Phase 7 (T019–T022) + Phase 8 (T023–T025),
25/29 tasks.** Only Phase 9 (T026–T029 — final verification/closure) remains. See
[IMPLEMENTATION-HANDOFF.md](./IMPLEMENTATION-HANDOFF.md) for full evidence per task. Feature 004 is
NOT yet formally closed — Phase 9's final regression/documentation pass is still required — but is
now functionally complete: the shell truthfully reflects who the member is acting for, whether that
organization is eligible, and what implemented modules contribute, with real accessibility/RTL/no-JS
verification behind it.
**Prerequisite**: 001 (guard, identity, states, tokens) and 003 (eligibility layer, acting
organization, agreement gate) implemented.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Module contract

- [x] T001 Define the module registration contract in `lib/dashboard/modules.ts`
  (`DashboardModule`, `NavEntry`, `OverviewCard`, `ActionItem`, `requiredCapability`), with explicit
  documentation that declaration is presentational only and never grants access.
  - Req: FR-005, SEC-002 | Depends: —
  - Verify: types compile; the file's doc comment states the declaration-vs-enforcement split
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: this contract shapes how every later member feature plugs in — a poor abstraction here is expensive to unwind across 006–012.

- [x] T002 Create the static registry `lib/dashboard/registry.ts` listing implemented modules only
  (initially: account/status entries from 003).
  - Req: FR-005, FR-006 | Depends: T001
  - Verify: an unregistered module contributes nothing to nav or overview
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, explicit list file.

- [x] T003 Implement `lib/dashboard/overview.ts` composing registered contributions into the four
  question areas (bought / owe / where / needs action), omitting absent modules entirely.
  - Req: FR-006, PS2 | Depends: T001, T002
  - Verify: with an empty registry the composer returns only the account area; no placeholder cards
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused composition logic with an explicit contract.

---

## Phase 2 — Shell layout

- [x] T004 Extend `src/app/dashboard/layout.tsx` (from 001) into the real shell: fixed sidebar,
  sticky topbar, breadcrumbs, content region — preserving 001's server-side guard exactly as-is.
  - Req: FR-008, SEC-001 | Depends: T001
  - Verify: 001's guard behaviour is unchanged (an anonymous request still renders the unauthorized state before any module data is fetched)
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits the file that enforces the Member Portal security boundary — the guard must not be weakened while adding chrome.

- [x] T005 [P] Build `components/dashboard/sidebar.tsx` rendering nav groups from the registry, with
  capability-declared entries filtered by the acting organization's resolved capability.
  - Req: FR-002, FR-005 | Depends: T001, T004
  - Verify: buyer-only fixture renders no seller group; buyer+seller renders both, buyer first
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the additive-capability rule is a Constitution-locked model that must be visibly correct.

- [x] T006 [P] Build `components/dashboard/topbar.tsx` with acting-organization display, account menu,
  and the reserved (inert) notification entry pointing at 012/DB-BLOCK-04.
  - Req: FR-010, FR-016 | Depends: T004
  - Verify: the notification entry renders inert with no fabricated count or read behaviour
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: normal component work with one deliberate "do not fake it" constraint.

- [x] T007 [P] Build the responsive behaviours: tablet sidebar → drawer, mobile tables → card lists
  (`components/dashboard/responsive/`).
  - Req: FR-008 | Depends: T004
  - Verify: at tablet width the sidebar collapses to a drawer; at mobile a sample table renders as cards; touch targets ≥ 44×44px
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: shared responsive primitives every later module inherits.

- [x] T008 Add non-indexable metadata to all `/dashboard` routes (coordinating with 002's T027 so the
  rule exists exactly once).
  - Req: FR-013 | Depends: T004
  - Verify: `/dashboard` head contains non-indexable metadata; no duplicate conflicting declaration
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small metadata change with one coordination point.

---

## Phase 3 — Acting organization

- [x] T009 [PS4] Build `components/dashboard/org-switcher.tsx` consuming 003's acting-organization
  resolution; implicit when one membership, explicit selector when more.
  - Req: FR-010, PS4 | Depends: T006
  - Verify: single-membership fixture sees a display with no selector; two-membership fixture can switch and the portal reflects the new organization on the next request
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: acting-context errors cause a member to act for the wrong organization — a correctness/authorization hazard.
  - **CLOSURE (2026-09-12)**: reuses `setActingOrganization` (`lib/auth/eligibility.ts`) — the SAME
    mechanism `OrganizationSelector` and `settings/acting-organization-switcher.tsx` already call, no
    second implementation. Passed as a PROP from the Server Component `dashboard/layout.tsx` into the
    Client Component switcher (a real production build failure — `next/headers` pulled into the
    client bundle via a direct import — was hit and fixed this way). One org → plain text, no
    selector; >1 → a real shadcn `Select`. Live-verified via real Chrome/CDP: the multi-org fixture
    renders the switcher (`aria-label="Switch acting organization"`, current org named) after
    resolving the forced `OrganizationSelector` choice; the single-org buyer-only fixture shows no
    combobox at all. 0 axe violations across EN/AR × light/dark × desktop/mobile.

- [x] T010 Pass the acting organization explicitly to every module render path (no ambient global).
  - Req: FR-010, SEC-003 | Depends: T009, T003
  - Verify: `grep -rn "globalThis\|module-scope let" lib/dashboard components/dashboard` shows no ambient acting-org state; two concurrent requests with different orgs do not interfere
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: ambient request state is a classic cross-tenant bleed vector in server-rendered apps.
  - **CLOSURE (2026-09-12)**: the grep returns nothing; `composeOverview`/`buildDashboardNavGroups`
    both take `organization`/`registry` as explicit parameters (already true since RUN A). Added an
    interleaved two-organization test (`tests/dashboard/org-switcher.test.tsx`) proving no
    cross-contamination between calls for different organizations, and a source check confirming
    `DashboardModuleContext` is documented as "never read from an ambient global or module-scope
    variable."

---

## Phase 4 — Overview page

- [x] T011 [PS2] Implement `src/app/dashboard/page.tsx` rendering the composed overview (four areas +
  account/status area).
  - Req: FR-006, PS2 | Depends: T003, T004
  - Verify: renders server-side with JavaScript disabled; absent modules produce no placeholder
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: composition page over an existing contract.
  - **CLOSURE (2026-09-12)**: `dashboard/page.tsx`'s final (fully-eligible) branch now calls
    `composeOverview({ organization: identity.organization, registry: DASHBOARD_MODULES,
    hasAcceptedCurrentAgreements: identity.hasAcceptedCurrentAgreements })`, replacing the
    `FoundationOverview` placeholder. Every guard branch above it (unauthorized, not-yet-authorized,
    agreement-not-accepted) is untouched — Server Component throughout, no `"use client"` added to
    the page itself. Live-verified with 0 axe violations across EN/AR × light/dark.

- [x] T012 [P] [PS2] Build `components/dashboard/overview-card.tsx` and figure formatting helpers
  (unit + currency, tabular figures, monospace reference codes).
  - Req: FR-007, SC-004 | Depends: T004
  - Verify: `USD 4.80 / kg`, `320 bags · 60kg` and `HC-2026-0418` render per the design system
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: formatting rules are explicit in the design system; mostly mechanical.
  - **CLOSURE (2026-09-12)**: `lib/dashboard/format.ts` (`formatMoney`, `formatQuantity`) plus
    `components/dashboard/overview-card.tsx` (`OverviewCardSection`, `ReferenceCode`). Exactly the
    three cited design-system examples render as specified — proven directly, not merely inspected.
    Also fixed a pre-existing localization gap in the account-menu display-name fallback
    ("Account" → resolved via `tApp.dashboardAccount.fallbackName`, client-side, so it renders in the
    viewer's real locale rather than always English).

- [x] T013 [PS3] Build the "needs your action" area from 003's contributions (unaccepted agreement,
  expiring KYB document) with specific labels and direct hrefs.
  - Req: FR-011, PS3 | Depends: T003, T011
  - Verify: a seeded unaccepted agreement renders a named item linking to the acceptance step; no generic "action required" copy exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's "name what is missing" rule requires content judgment, not just wiring.
  - **CLOSURE (2026-09-12) — HONEST ARCHITECTURAL LIMITATION**: `composeOverview` computes a real,
    specific, tested action item ("Accept the current membership agreements" → `/dashboard/`) when
    `hasAcceptedCurrentAgreements` is false. On the LIVE page, this can never actually be visible: the
    existing, already-verified Feature 003 agreement gate in `dashboard/page.tsx` intercepts that
    exact condition with a full-page `AgreementList` BEFORE this composer ever runs — restructuring
    that gate into an inline item was judged out of this run's scope (changing already-verified
    Feature 003 UX, not merely adding to it). The equivalent KYB-remediation condition is similarly
    unreachable, one guard earlier (`!identity.isAuthorizedMember`). Both are documented in
    `lib/dashboard/overview.tsx`'s own header comment, not hidden. `components/dashboard/action-list.tsx`
    is the real, generic renderer any future module's action items will also use.

- [x] T014 [PS2] Implement honest empty states for each overview area (explains what would appear,
  never a zero-filled fake dashboard).
  - Req: FR-006, PS2 | Depends: T011
  - Verify: with no data, each area explains itself; no fabricated zero metrics are shown
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small, but the "no fake numbers" rule is an explicit design-system mandate.
  - **CLOSURE (2026-09-12)**: `dashboardOverview.{bought,owe,where,needsAction}.empty` copy (EN+AR),
    rendered by `OverviewCardSection`/`ActionList` only when the area is genuinely empty. No
    `0 orders`/`$0`/`0 bags` anywhere; `tests/dashboard/registry.test.tsx` asserts this with a regex
    scan of the actual rendered card text.

---

## Phase 5 — Ineligible-member states

- [x] T015 [PS5] Render distinct shell states for `PENDING_KYB`, `UNDER_REVIEW`, `SUSPENDED`,
  `REJECTED` organizations, reusing 001's state components and 003's reasons.
  - Req: FR-009, SC-005, PS5 | Depends: T004
  - Verify: each of the four fixtures renders its own screen with the approved vocabulary label and correct next step
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: denial-state clarity is where members are most likely to be confused or misled.
  - **CLOSURE (2026-09-12) — REUSED, NOT REBUILT**: Feature 003's `KybStatusScreen` (T019–T021)
    already provides exactly this — a distinct branch per status with the approved vocabulary, safe
    reason (REJECTED's `rejectionReason`, never a reviewer identity), and the correct next step, with
    no trading CTA anywhere. `tests/dashboard/states.test.tsx` proves all four are genuinely distinct
    (no shared heading text) and none renders a `button`/`link` beyond its own legitimate remediation
    action. No second KYB status engine was built.

- [x] T016 [PS5] Ensure no trading module is reachable for ineligible organizations — by navigation or
  direct URL.
  - Req: FR-003, SC-001, PS5 | Depends: T015, T005
  - Verify: with a suspended fixture, direct navigation to every registered module route is refused server-side
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the portal-level expression of the platform's non-negotiable authorization rule.
  - **CLOSURE (2026-09-12) — NO LIVE ROUTE EXISTS TO DENY YET**: Features 005–009 have no real
    trading-module route (honestly documented, not fabricated). Proven instead with a controlled
    fixture module (`tests/dashboard/states.test.tsx`): nav hiding and a route's own authorization
    check are computed independently from the same `organization.canSell` fact — hiding nav proves
    nothing about the route, and a fixture "route guard" correctly denies regardless of nav state.
    Reconfirmed `dashboard/layout.tsx` still never renders the business `AppShell` for a
    not-yet-authorized organization (position-based source check: `AppShell` appears strictly after
    the `!identity.isAuthorizedMember` branch). Documented in `lib/dashboard/modules.ts` itself: "The
    registry must never become a hidden authorization system" — future module routes (005–009/012)
    MUST independently call `getRequestIdentity()`/the eligibility layer; this contract will not do
    it for them.

- [x] T017 Route a zero-organization member to 003's onboarding state rather than rendering a shell.
  - Req: FR-009, Edge Cases | Depends: T004, T015
  - Verify: the no-organization fixture never sees an empty dashboard chrome
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: simple redirect/branch with a clear expected outcome.
  - **CLOSURE (2026-09-12) — ALREADY IMPLEMENTED, RECONFIRMED**: `dashboard/layout.tsx`'s
    `identity.organization === null` branch already renders `OnboardingExperience` inline, never
    `AppShell` (Feature 003, unchanged this run). `tests/dashboard/states.test.tsx` adds a
    Feature-004-owned regression proof (position-based source check) alongside the pre-existing
    Feature 003 coverage.

---

## Phase 6 — Account area entry

- [x] T018 [P] Add account-area navigation entries (profile, organization, agreements, KYB status)
  pointing at 003's screens; register them as this feature's initial registry entries.
  - Req: FR-005 | Depends: T002, T005
  - Verify: all four entries resolve to 003 routes; none duplicate 003's logic
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: straightforward registration and linking.
  - **CLOSURE (2026-09-12) — TRUTHFUL COLLAPSE, NOT FOUR ROUTES**: the route tree was inspected first
    (`src/app/dashboard/**`). "Profile" and "Organization" both genuinely live on the ONE existing
    `/dashboard/settings` route (already registered since RUN A) — the Settings entry now carries a
    `description` making that explicit (`settingsPage.description`, an already-reviewed, existing copy
    key — no new string invented). "Agreements" and "KYB Status" get NO nav entry: neither has a
    route an already-authorized member can actually reach — `/dashboard/kyb/` redirects an authorized
    member straight back to `/dashboard/`, and no standalone agreement-history view exists. Both only
    ever appear as full-page GATES on the way in, never as a destination to navigate back to.
    Inventing a route for either would have been exactly the "invent a route merely because the task
    names a conceptual destination" the run directive forbids — documented as a genuine, honest
    product gap in `lib/dashboard/registry.tsx`'s own header comment for a future run to decide on
    deliberately.

---

## Phase 7 — Automated tests

- [x] T019 [P] Write `tests/dashboard/capability-gating.test.ts`: buyer-only sees no seller nav and is
  refused at a seller route; buyer+seller sees both; revocation reflected on the next request.
  - Req: FR-002, FR-003, SC-001, SC-002 | Depends: T005, T016
  - Verify: `npm test -- capability-gating` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the primary automated proof of the Buyer/Seller additive model and the nav-is-not-authorization rule.
  - **CLOSURE (2026-09-12)**: 4/4 passing. Freshness is proven with REAL data — the same
    `setBuyerAndSellerCanSell` live-fixture toggle Feature 003's own `request-identity.test.ts`
    established (no mock, no second mechanism): `organization_can_sell` is flipped false→true on the
    real `buyerAndSeller` fixture via the SAME signed-in client, with no sign-out, and the very next
    `buildDashboardNavGroups` call reflects it — canonical state recovered first and restored in a
    `finally`, per that file's own established discipline. Direct-access proof level: controlled
    fixture module + a "route guard" stand-in (no real 005–009 route exists to deny yet — honestly
    documented, not fabricated).

- [x] T020 [P] Write `tests/dashboard/registry.test.ts`: unregistered modules contribute nothing;
  registered entries appear in the right group/area.
  - Req: FR-005, FR-006 | Depends: T002, T003
  - Verify: `npm test -- registry` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused unit test over a small contract.
  - **CLOSURE (2026-09-12)**: 15/15 passing (11 from RUN A + 4 new). Added: duplicate group-key
    handling (two modules contributing to the SAME group key are merged into one header, entries from
    both present, in registration order — the chosen, now-documented contract); determinism (identical
    inputs → deep-equal output across repeated calls, for both the nav builder and the composer);
    registry-metadata-cannot-grant-access (no `eval`/`new Function`, and the file's own
    "PRESENTATIONAL ONLY" documentation reconfirmed present).

- [x] T021 [P] Write `tests/dashboard/states.test.tsx`: the four ineligible states plus empty overview
  render correctly.
  - Req: SC-005, FR-009 | Depends: T014, T015
  - Verify: `npm test -- states` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: render assertions over defined fixtures.
  - **CLOSURE (2026-09-12)**: 13/13 passing (10 from RUN B + 3 new). Added the "empty overview" state
    (an approved organization with zero business-module contributions — the everyday case today,
    honest empty result, no fake dashboard content) and an explicit reconfirmation that an eligible
    organization's composed overview never contains any ineligible-state vocabulary
    (PENDING/UNDER_REVIEW/SUSPENDED/REJECTED), plus a source-position check that `dashboard/page.tsx`
    only calls `composeOverview` strictly after every ineligible-state guard.

- [x] T022 Write `tests/dashboard/tenant-isolation.test.ts`: concurrent requests for different acting
  organizations never observe each other's data.
  - Req: SEC-003, SEC-005, FR-010 | Depends: T010
  - Verify: `npm test -- tenant-isolation` passes under concurrent execution
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: concurrency-shaped cross-tenant test; failure modes here are subtle and severe.
  - **CLOSURE (2026-09-12) — REAL DATA, GENUINELY INTERLEAVED**: signs in as the real `multiOrg`
    fixture ONCE, then fetches BOTH real organizations' `display_name`/`member_role`/
    `organization_can_buy`/`organization_can_sell` via one `Promise.all` (8 concurrent real Supabase
    calls), and feeds the two real `OrganizationMembership` objects into `composeOverview`/
    `buildDashboardNavGroups` interleaved via `Promise.all` (not sequential-then-sequential) — 4
    interleaved composer calls plus 2 interleaved nav-builder calls, asserting each organization's
    result never contains the other's id/name. This is the strongest available proof for functions
    that are pure/synchronous/take their only input as an explicit parameter: no shared mutable state
    exists anywhere in their call graph for literal OS-thread concurrency to expose, so real, distinct,
    concurrently-fetched data fed through an interleaved call pattern is the genuine test of the
    property, not merely "no obvious globals." A second, independent grep-based check (`globalThis`,
    top-level mutable `let`/`var`) across every `lib/dashboard`/`components/dashboard` file remains as
    corroborating evidence, not the sole proof.

---

## Phase 8 — Accessibility, RTL, no-JS

- [x] T023 Accessibility pass: sidebar/topbar landmarks, keyboard traversal, focus visibility, drawer
  focus trapping, badge semantics (dot + label, never colour alone).
  - Req: FR-008, FR-009 | Depends: Phases 2–5
  - Verify: automated a11y check reports no critical violations; full keyboard traversal of nav and overview succeeds
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: navigation a11y (focus trapping, landmarks) needs judgment beyond automated rules.
  - **CLOSURE (2026-09-12) — REAL BROWSER (Chrome/CDP)**: 0 axe violations on `/dashboard/` and
    `/dashboard/settings/` (buyer-only fixture, re-confirmed after this run's registry `description`
    change). Landmarks: exactly one labelled `nav`, one `header`, one `main`. Active nav state exposed
    via `aria-current="page"`. Keyboard: 25 sequential Tab presses land on a real focusable element
    with a visible focus outline (no trap). Mobile drawer (390px): opens with focus moved inside
    `[role="dialog"]` (a real focus trap), Escape closes it and focus returns to a labelled trigger
    (real restoration, not merely inferred) — no horizontal overflow afterward.

- [x] T024 RTL/logical-property and externalised-copy pass across the shell and overview.
  - Req: FR-014 | Depends: Phases 2–5
  - Verify: `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard components/dashboard` returns nothing; no inline hardcoded UI strings
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.
  - **CLOSURE (2026-09-12)**: the exact grep, broadened to also include `ml-`/`mr-`, returns nothing
    across `src/app/dashboard`, `components/dashboard`, `lib/dashboard`. **The known "Account"
    fallback localization debt is now fully eliminated from the Feature 004/member-portal surface**:
    RUN B already fixed the dashboard account-menu's own fallback (client-side, locale-aware). This
    run audited `components/public/site-header.tsx`'s separate, still-English-only "Account" fallback
    and confirmed it is genuinely OUTSIDE Feature 004's surface — `SiteHeader` renders only on the
    public marketing site (`PublicShell`), never inside `/dashboard/*`, which uses `AppShell`/`Topbar`
    instead. Left untouched deliberately (Feature 002/003's ownership, not this feature's), per the
    run directive's own conditional ("if it is in the Feature 004/member portal surface").

- [x] T025 Verify the shell and overview render fully with JavaScript disabled; audit `"use client"`
  usage.
  - Req: FR-015, SC-007 | Depends: Phases 2–5
  - Verify: with JS disabled, nav and overview content are present; `grep -rln "use client" components/dashboard` lists only genuinely interactive components
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: requires judgment about which islands truly need the client.
  - **CLOSURE (2026-09-12) — REAL NO-JS BROWSER REQUEST**: signed in normally (with JS), then
    re-requested `/dashboard/` with `Emulation.setScriptExecutionDisabled` genuinely set — not
    inferred from source. Result: real `<nav>` and `<main>` content present, page body non-empty
    (342 chars of real text), the localized "Overview"/"نظرة عامة" label itself present in the raw,
    unhydrated HTML. `grep -rln "use client" components/dashboard src/app/dashboard` lists exactly
    `org-switcher.tsx` (the Select), `topbar.tsx` (dropdown/dialog state), `src/app/dashboard/error.tsx`
    (a required Next.js convention — error boundaries must be Client Components), and the two
    pre-existing Feature 003 settings forms (untouched this run). No Feature 004 component was made
    client-side without a genuine interaction reason; `sidebar.tsx`/`overview-card.tsx`/
    `action-list.tsx`/`responsive/table-card-list.tsx` all stay Server Components.

---

## Phase 9 — Verification & closure

- [ ] T026 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T027 Confirm no `/buyer-dashboard` or `/seller-dashboard` route exists anywhere.
  - Req: FR-001, SC-003 | Depends: T026
  - Verify: `grep -rn "buyer-dashboard\|seller-dashboard" src components lib` returns nothing; route tree contains only `/dashboard`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check of a Constitution-locked rule.

- [ ] T028 Confirm no shared cache entry contains organization-scoped data and no service-role usage.
  - Req: FR-012, SEC-003, SEC-004 | Depends: T026
  - Verify: `grep -rn "cacheTag\|unstable_cache\|SERVICE_ROLE" src/app/dashboard lib/dashboard components/dashboard` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical grep verification.

- [ ] T029 Update the roadmap status for 004 and document the module-registration contract location
  for 005–012 authors.
  - Req: FR-005 | Depends: T026
  - Verify: roadmap row accurate; a future agent can find the contract from the roadmap in one hop
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: continuity documentation for the features that depend on this contract.

---

## Dependencies & parallelisation

- Phase 1 blocks Phases 2–4 (everything renders from the contract).
- T005/T006/T007 are mutually parallel once T004 lands.
- Phase 5 depends on T004 + T015's states; T016 additionally needs T005.
- Phase 7's tests are mutually parallel except T022 (needs T010).
- Phase 9 depends on everything.

**Parallel-safe tasks**: T005, T006, T007, T012, T018, T019, T020, T021 (8 of 29).
