# Tasks: Member Dashboard (004)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), `docs/claude-design/` dashboard layout.

**Status**: all tasks unchecked — implementation NOT started.
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

- [ ] T001 Define the module registration contract in `lib/dashboard/modules.ts`
  (`DashboardModule`, `NavEntry`, `OverviewCard`, `ActionItem`, `requiredCapability`), with explicit
  documentation that declaration is presentational only and never grants access.
  - Req: FR-005, SEC-002 | Depends: —
  - Verify: types compile; the file's doc comment states the declaration-vs-enforcement split
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: this contract shapes how every later member feature plugs in — a poor abstraction here is expensive to unwind across 006–012.

- [ ] T002 Create the static registry `lib/dashboard/registry.ts` listing implemented modules only
  (initially: account/status entries from 003).
  - Req: FR-005, FR-006 | Depends: T001
  - Verify: an unregistered module contributes nothing to nav or overview
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small, explicit list file.

- [ ] T003 Implement `lib/dashboard/overview.ts` composing registered contributions into the four
  question areas (bought / owe / where / needs action), omitting absent modules entirely.
  - Req: FR-006, PS2 | Depends: T001, T002
  - Verify: with an empty registry the composer returns only the account area; no placeholder cards
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused composition logic with an explicit contract.

---

## Phase 2 — Shell layout

- [ ] T004 Extend `src/app/dashboard/layout.tsx` (from 001) into the real shell: fixed sidebar,
  sticky topbar, breadcrumbs, content region — preserving 001's server-side guard exactly as-is.
  - Req: FR-008, SEC-001 | Depends: T001
  - Verify: 001's guard behaviour is unchanged (an anonymous request still renders the unauthorized state before any module data is fetched)
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: edits the file that enforces the Member Portal security boundary — the guard must not be weakened while adding chrome.

- [ ] T005 [P] Build `components/dashboard/sidebar.tsx` rendering nav groups from the registry, with
  capability-declared entries filtered by the acting organization's resolved capability.
  - Req: FR-002, FR-005 | Depends: T001, T004
  - Verify: buyer-only fixture renders no seller group; buyer+seller renders both, buyer first
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the additive-capability rule is a Constitution-locked model that must be visibly correct.

- [ ] T006 [P] Build `components/dashboard/topbar.tsx` with acting-organization display, account menu,
  and the reserved (inert) notification entry pointing at 012/DB-BLOCK-04.
  - Req: FR-010, FR-016 | Depends: T004
  - Verify: the notification entry renders inert with no fabricated count or read behaviour
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: normal component work with one deliberate "do not fake it" constraint.

- [ ] T007 [P] Build the responsive behaviours: tablet sidebar → drawer, mobile tables → card lists
  (`components/dashboard/responsive/`).
  - Req: FR-008 | Depends: T004
  - Verify: at tablet width the sidebar collapses to a drawer; at mobile a sample table renders as cards; touch targets ≥ 44×44px
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: shared responsive primitives every later module inherits.

- [ ] T008 Add non-indexable metadata to all `/dashboard` routes (coordinating with 002's T027 so the
  rule exists exactly once).
  - Req: FR-013 | Depends: T004
  - Verify: `/dashboard` head contains non-indexable metadata; no duplicate conflicting declaration
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: small metadata change with one coordination point.

---

## Phase 3 — Acting organization

- [ ] T009 [PS4] Build `components/dashboard/org-switcher.tsx` consuming 003's acting-organization
  resolution; implicit when one membership, explicit selector when more.
  - Req: FR-010, PS4 | Depends: T006
  - Verify: single-membership fixture sees a display with no selector; two-membership fixture can switch and the portal reflects the new organization on the next request
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: acting-context errors cause a member to act for the wrong organization — a correctness/authorization hazard.

- [ ] T010 Pass the acting organization explicitly to every module render path (no ambient global).
  - Req: FR-010, SEC-003 | Depends: T009, T003
  - Verify: `grep -rn "globalThis\|module-scope let" lib/dashboard components/dashboard` shows no ambient acting-org state; two concurrent requests with different orgs do not interfere
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: ambient request state is a classic cross-tenant bleed vector in server-rendered apps.

---

## Phase 4 — Overview page

- [ ] T011 [PS2] Implement `src/app/dashboard/page.tsx` rendering the composed overview (four areas +
  account/status area).
  - Req: FR-006, PS2 | Depends: T003, T004
  - Verify: renders server-side with JavaScript disabled; absent modules produce no placeholder
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: composition page over an existing contract.

- [ ] T012 [P] [PS2] Build `components/dashboard/overview-card.tsx` and figure formatting helpers
  (unit + currency, tabular figures, monospace reference codes).
  - Req: FR-007, SC-004 | Depends: T004
  - Verify: `USD 4.80 / kg`, `320 bags · 60kg` and `HC-2026-0418` render per the design system
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: formatting rules are explicit in the design system; mostly mechanical.

- [ ] T013 [PS3] Build the "needs your action" area from 003's contributions (unaccepted agreement,
  expiring KYB document) with specific labels and direct hrefs.
  - Req: FR-011, PS3 | Depends: T003, T011
  - Verify: a seeded unaccepted agreement renders a named item linking to the acceptance step; no generic "action required" copy exists
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the design system's "name what is missing" rule requires content judgment, not just wiring.

- [ ] T014 [PS2] Implement honest empty states for each overview area (explains what would appear,
  never a zero-filled fake dashboard).
  - Req: FR-006, PS2 | Depends: T011
  - Verify: with no data, each area explains itself; no fabricated zero metrics are shown
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small, but the "no fake numbers" rule is an explicit design-system mandate.

---

## Phase 5 — Ineligible-member states

- [ ] T015 [PS5] Render distinct shell states for `PENDING_KYB`, `UNDER_REVIEW`, `SUSPENDED`,
  `REJECTED` organizations, reusing 001's state components and 003's reasons.
  - Req: FR-009, SC-005, PS5 | Depends: T004
  - Verify: each of the four fixtures renders its own screen with the approved vocabulary label and correct next step
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: denial-state clarity is where members are most likely to be confused or misled.

- [ ] T016 [PS5] Ensure no trading module is reachable for ineligible organizations — by navigation or
  direct URL.
  - Req: FR-003, SC-001, PS5 | Depends: T015, T005
  - Verify: with a suspended fixture, direct navigation to every registered module route is refused server-side
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the portal-level expression of the platform's non-negotiable authorization rule.

- [ ] T017 Route a zero-organization member to 003's onboarding state rather than rendering a shell.
  - Req: FR-009, Edge Cases | Depends: T004, T015
  - Verify: the no-organization fixture never sees an empty dashboard chrome
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: simple redirect/branch with a clear expected outcome.

---

## Phase 6 — Account area entry

- [ ] T018 [P] Add account-area navigation entries (profile, organization, agreements, KYB status)
  pointing at 003's screens; register them as this feature's initial registry entries.
  - Req: FR-005 | Depends: T002, T005
  - Verify: all four entries resolve to 003 routes; none duplicate 003's logic
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: straightforward registration and linking.

---

## Phase 7 — Automated tests

- [ ] T019 [P] Write `tests/dashboard/capability-gating.test.ts`: buyer-only sees no seller nav and is
  refused at a seller route; buyer+seller sees both; revocation reflected on the next request.
  - Req: FR-002, FR-003, SC-001, SC-002 | Depends: T005, T016
  - Verify: `npm test -- capability-gating` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the primary automated proof of the Buyer/Seller additive model and the nav-is-not-authorization rule.

- [ ] T020 [P] Write `tests/dashboard/registry.test.ts`: unregistered modules contribute nothing;
  registered entries appear in the right group/area.
  - Req: FR-005, FR-006 | Depends: T002, T003
  - Verify: `npm test -- registry` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: focused unit test over a small contract.

- [ ] T021 [P] Write `tests/dashboard/states.test.tsx`: the four ineligible states plus empty overview
  render correctly.
  - Req: SC-005, FR-009 | Depends: T014, T015
  - Verify: `npm test -- states` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Low
  - Why: render assertions over defined fixtures.

- [ ] T022 Write `tests/dashboard/tenant-isolation.test.ts`: concurrent requests for different acting
  organizations never observe each other's data.
  - Req: SEC-003, SEC-005, FR-010 | Depends: T010
  - Verify: `npm test -- tenant-isolation` passes under concurrent execution
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: concurrency-shaped cross-tenant test; failure modes here are subtle and severe.

---

## Phase 8 — Accessibility, RTL, no-JS

- [ ] T023 Accessibility pass: sidebar/topbar landmarks, keyboard traversal, focus visibility, drawer
  focus trapping, badge semantics (dot + label, never colour alone).
  - Req: FR-008, FR-009 | Depends: Phases 2–5
  - Verify: automated a11y check reports no critical violations; full keyboard traversal of nav and overview succeeds
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: navigation a11y (focus trapping, landmarks) needs judgment beyond automated rules.

- [ ] T024 RTL/logical-property and externalised-copy pass across the shell and overview.
  - Req: FR-014 | Depends: Phases 2–5
  - Verify: `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard components/dashboard` returns nothing; no inline hardcoded UI strings
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

- [ ] T025 Verify the shell and overview render fully with JavaScript disabled; audit `"use client"`
  usage.
  - Req: FR-015, SC-007 | Depends: Phases 2–5
  - Verify: with JS disabled, nav and overview content are present; `grep -rln "use client" components/dashboard` lists only genuinely interactive components
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: requires judgment about which islands truly need the client.

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
