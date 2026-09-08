# Tasks: Platform Foundation

**Input**: `specs/001-platform-foundation/spec.md`, `plan.md`, `research.md`, `data-model.md`,
`contracts/*.md`, `quickstart.md` — all read and reconciled against
`.specify/memory/constitution.md` (v2.0.0) and the approved database baseline
(`docs/database/database-schema-report.json`, generated 2026-09-07).

**Tests**: spec.md's own requirements (FR-029, FR-029a) mandate automated tests as part of the
foundation itself — this is not an optional add-on for this feature. Test tasks below are load-
bearing, not illustrative.

**Organization**: This feature's six "Platform Stories" (spec.md) are foundation/infrastructure
capabilities, not independent vertical business slices — several of them share the same
per-request identity resolver and Supabase client boundary, so fragmenting them into fully separate
story-first phases would split tightly-coupled security logic across phases. Per plan.md and the
task-generation brief's own instruction ("use the actual approved plan as authority; do not force
[story-first] phases if plan.md defines a more accurate dependency sequence"), tasks are organized
by the 11 infrastructure phases plan.md's Project Structure implies, with a `[USn]` label on every
task that implements or verifies a specific Platform Story, for traceability. Setup/foundational/
polish tasks carry no story label, matching normal Spec Kit convention.

**One reordering vs. the phase brief**: the shared `components/layout/state-screen.tsx` component
(originally sketched under "Phase 7 — Hills UI/state/RTL foundation") is moved earlier, into
Phase 4, because the Phase 4 route guards need a rendering target for "unauthorized" the moment
they're written — Phase 7 then only adds Hills token styling to a component that already exists.

**Story → number key**: US1 = Root & three-surface boundary · US2 = Server-resolved identity &
capability · US3 = Server Action contract proof · US4 = Cache proof · US5 = Hills design tokens &
RTL · US6 = Continuity documentation & verification.

## Format: `[ID] [P?] [Story?] Description`

```
- [ ] T0NN [P?] [USn?] Description (file path)
  - Requirements: FR-xxx / SC-xxx
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: one-line reason for the difficulty/model choice
```

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[USn]**: Which Platform Story this task implements or verifies
- **Codex** and **Claude** are two **independent** recommendations, not a primary and a fallback:
  each names the model and effort level appropriate for that ecosystem, so the task can be executed
  in either one without translation. They are deliberately asymmetric where the ecosystems differ in
  strength — a task may warrant Codex High and Claude Sonnet Medium, or Codex Medium and Claude Opus
  High. This matches the convention used by features 002–012.
- Every task lists exact file path(s), the spec requirements it satisfies, a concrete verification
  condition, both model recommendations, and a one-line reason.

---

## Phase 1: Setup (Tooling Foundation)

**Purpose**: Establish the test runner and environment-contract scaffolding every later phase needs.
No application/authorization code yet.

- [ ] T001 Run and record the pre-existing baseline: `npm run lint` and `npm run build` on the
  unmodified repository, before any Phase 1+ change.
  - Requirements: FR-030 (baseline for "these commands must actually work as documented")
  - Verify: both commands exit 0; if either fails today, record the failure as a pre-existing
    condition in the PR description (not something this feature silently papers over)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical command execution with a binary pass/fail signal.

- [ ] T002 Add Vitest test tooling as dev dependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`,
  `@testing-library/react`, `@testing-library/dom`, `vite-tsconfig-paths` in `package.json` /
  `package-lock.json` (research.md §8).
  - Requirements: FR-029, FR-030
  - Verify: `npm install` completes; `node -e "require('vitest')"` resolves; no production
    dependency section touched, only `devDependencies`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical dependency addition with an explicit, already-decided package list.

- [ ] T003 Create `vitest.config.mts` (jsdom environment, `@vitejs/plugin-react`,
  `vite-tsconfig-paths` for the existing `@/*` alias) and add `"test": "vitest run"`,
  `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"` scripts to `package.json` (depends on
  T002).
  - Requirements: FR-030
  - Verify: `npm run typecheck` and `npm test` both execute (even with zero test files present yet,
    `npm test` should run cleanly, not error on config)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical config file matching Next.js's own documented Vitest setup verbatim.

- [ ] T004 [P] Create `.env.example` at the repo root documenting the four existing environment
  variables — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_SITE_URL` (browser-safe), `SUPABASE_SERVICE_ROLE_KEY` (server-only, test-script-only
  — see Phase 8) — with placeholder values only, no real secrets (research.md §14).
  - Requirements: FR-025, FR-028
  - Verify: `git diff --stat` shows only placeholder strings (e.g., `your-project.supabase.co`);
    grep for the real `.env.local` values in `.env.example` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical documentation of an already-known, fixed variable list.

**Checkpoint**: tooling and environment contract exist; no application code yet.

---

## Phase 2: Foundational (Supabase Clients, Validation Schema, i18n)

**Purpose**: The shared, non-story-specific infrastructure every later phase depends on. Blocking —
no Phase 3+ task starts before this phase completes.

- [ ] T005 [P] Create `lib/supabase/client.ts` exporting a `createBrowserClient` wrapper
  (`@supabase/ssr`) using `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only
  (research.md §4).
  - Requirements: FR-025, FR-026
  - Verify: `grep -rn "SUPABASE_SERVICE_ROLE_KEY" lib/supabase/client.ts` returns nothing; file
    contains no `"use client"`-only leakage of server secrets
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Focused implementation against an explicit, already-decided client contract.

- [ ] T006 [P] Create `lib/supabase/server.ts` exporting a request-scoped `createServerClient`
  wrapper reading/writing cookies via `next/headers`'s `cookies()`, following the installed
  `@supabase/ssr` README's cookie-handling pattern (research.md §4).
  - Requirements: FR-025, FR-026
  - Verify: the exported factory is called fresh per request (no module-level singleton client
    instance); `grep -rn "SUPABASE_SERVICE_ROLE_KEY" lib/supabase/server.ts` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Requires correctly reasoning about per-request cookie/session plumbing from the SSR
    package's documented (but non-trivial) contract, not pure mechanical typing.

- [ ] T007 [P] Create `lib/validation/my-profile.ts` exporting the `MyProfileInput` Zod schema
  (`fullName`, `phone`, `companyName`, `avatarPath`, all optional, per data-model.md) used by both
  the client form and the Server Action.
  - Requirements: FR-018
  - Verify: schema field names/types match `update_my_profile`'s four parameters exactly
    (`p_full_name`, `p_phone`, `p_company_name`, `p_avatar_path`)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical schema matching an explicit, already-known DB function signature.

- [ ] T008 [P] Create `lib/i18n/config.ts` — minimal `i18next`/`react-i18next` initialization, a
  single `en` resource namespace, no `i18next-browser-languagedetector` activation, no switcher
  (research.md §10).
  - Requirements: FR-021
  - Verify: `grep -rn "languagedetector" lib/i18n/config.ts` (case-insensitive) returns nothing;
    only one locale resource object exists
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical library initialization with an explicit, narrow scope already decided.

- [ ] T009 Narrow, foundation-level edit to `src/app/layout.tsx`: wrap `{children}` with the i18n
  provider from T008. File stays at its current path and still serves route `/`; no homepage
  visual/content change (contracts/route-surface-contract.md's locked-file table; depends on T008).
  - Requirements: FR-001, FR-021
  - Verify: `git diff src/app/layout.tsx` shows only the added provider wrapper, no relocation, no
    change to `page.tsx`'s rendered content; `git status` confirms `layout.tsx` was modified, not
    moved/deleted
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Touches a Constitution-locked file; needs judgment to keep the edit narrow, but the
    allowed edit category is already explicit.

**Checkpoint**: Supabase client boundary, validation schema, and i18n foundation exist. Phase 3+ may
begin.

---

## Phase 3: Request Identity & Authorization (US2 core)

**Purpose**: The single, reusable, per-request authorization resolver every protected surface and
Server Action in this feature (and later features) will call. This is the platform's core trust
boundary (Constitution Principle VIII, NON-NEGOTIABLE).

- [ ] T010 [P] [US2] Define `RequestIdentity`, `OrganizationMembership`, `OperationalRole` types in
  `lib/auth/types.ts`, matching data-model.md exactly.
  - Requirements: FR-005, FR-008
  - Verify: `tsc --noEmit` passes; type shapes match data-model.md's `RequestIdentity` union
    (`kind: "anonymous"` vs `kind: "authenticated"`) field-for-field
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical typing task against an already-fully-specified contract.

- [ ] T011 [US2] Implement `getRequestIdentity()` in `lib/auth/dal.ts`: call `supabase.auth.getUser()`
  (never `getSession()`, research.md §1) via the T006 server client; if no user, return
  `{ kind: "anonymous" }`; if a user exists, call `is_org_member`/`organization_can_buy`/
  `organization_can_sell` for the user's active `organization_members` row and
  `is_platform_admin`/`is_super_admin`/`is_compliance_operator`/`is_warehouse_operator`/
  `is_finance_operator`/`is_auditor` to build `operationalRoles`; wrap the whole function in React's
  `cache()` (per-request memoization only — never cross-request) (depends on T006, T010).
  - Requirements: FR-005, FR-006, FR-008, FR-009, FR-010 (session-resolution half only — no sign-up/
    onboarding UI here)
  - Verify: function never imports `lib/supabase` anything other than the T006 request-scoped
    client; no call to `getSession()` anywhere in the file (`grep -n "getSession" lib/auth/dal.ts`
    returns nothing); a fresh call with no cookie returns `{ kind: "anonymous" }`
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: Security-critical cross-cutting authorization logic with a large downstream blast radius
    — every later feature's authorization ultimately traces back to this one function.

**Checkpoint**: identity/capability resolution exists and is independently unit-testable (Phase 9
adds the actual tests once fixtures exist in Phase 8). Phase 4+ may begin.

---

## Phase 4: Protected Route/Surface Shells (US1)

**Goal**: Prove the three-surface boundary holds under direct access, independently for
`/dashboard` and `/dashboard-admin`, with `src/app/page.tsx`/`layout.tsx`/`globals.css` untouched
beyond the Phase 2 provider edit.

**Independent Test**: Navigate directly (JS disabled) to `/`, `/dashboard`, `/dashboard-admin` as an
anonymous visitor per quickstart.md Story 1.

- [ ] T012 [P] [US1] Create `components/layout/state-screen.tsx` — a shared, `kind`-parameterized
  full-page shell for `unauthorized` / `forbidden` / `not-found` / `empty` (research.md §15; named
  `StateScreen` to match the already-approved Hills design system component inventory).
  - Requirements: FR-023, FR-024 (the `kind` parameter is the extension point later features'
    domain states — suspended, rejected, reserved, expired, partial fill, settlement — build on,
    so no parallel state-handling system is ever needed)
  - Verify: component renders distinct, correct copy/semantics for each `kind`; uses semantic
    landmarks (e.g., `<main>`, a heading) so it passes basic accessibility scanning; `kind` is an
    open, extensible union rather than a closed set that a later feature would have to fork
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Focused component with an explicit, already-decided set of states.

- [ ] T013 [P] [US1] Create `src/app/dashboard/layout.tsx`: call `getRequestIdentity()`; if not
  `kind: "authenticated"` or `organization` is `null`, render `StateScreen` with an
  unauthorized/no-organization state; otherwise render `{children}` inside a minimal Member Portal
  shell (no business nav yet beyond a placeholder) (depends on T011, T012).
  - Requirements: FR-002, FR-003, FR-006
  - Verify: a request with no session renders `StateScreen`, never `{children}`, before any
    protected data fetch; confirmed via T027's automated test once written
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: This is the actual enforcement point for the Member Portal's security boundary — a wiring
    mistake here directly defeats Constitution Principle VIII.

- [ ] T014 [P] [US1] Create `src/app/dashboard-admin/layout.tsx`: call `getRequestIdentity()`; if
  not `kind: "authenticated"` or `operationalRoles` is empty, render `StateScreen`
  (unauthorized); otherwise render `{children}` inside a minimal Operations Console shell. This
  check is completely independent of T013's — it never inspects `organization` (depends on T011,
  T012).
  - Requirements: FR-002, FR-004, FR-006
  - Verify: a signed-in member with an organization but no `platform_admins` row is denied here
    even though T013's guard would pass them; confirmed via T027
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: Same enforcement-point risk as T013, for the Operations Console; independence from T013
    is itself a security requirement (Edge Cases: admin access never implies member access).

- [ ] T015 [P] [US1] Add `src/app/dashboard/error.tsx` and `src/app/dashboard/loading.tsx` (Next.js
  native route-segment conventions; recoverable/unexpected error + loading, reusing `StateScreen`
  where sensible) (depends on T013).
  - Requirements: FR-023
  - Verify: throwing inside a `/dashboard` child route renders `error.tsx`, not an unhandled crash
    page
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical use of a documented Next.js file convention.

- [ ] T016 [P] [US1] Add `src/app/dashboard-admin/error.tsx` and
  `src/app/dashboard-admin/loading.tsx` (same pattern as T015) (depends on T014).
  - Requirements: FR-023
  - Verify: same as T015, scoped to `/dashboard-admin`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical use of a documented Next.js file convention.

- [ ] T017 [US1] Add optional `src/proxy.ts` (alongside `src/app/`, **not** inside it — Next 16
  resolves `proxy.ts` at the same level as `app/`): read only the Supabase auth cookie's
  presence/absence (no `getUser()`, no database call) to optimistically redirect an obviously-
  anonymous visitor away from `/dashboard`/`/dashboard-admin` toward a sign-in route
  (research.md §2; depends on T013, T014 existing so the matcher paths are meaningful).
  - Requirements: FR-007
  - Verify: the file exists at `src/proxy.ts` (not `src/app/proxy.ts`) and
    `grep -n "getUser\|\.rpc(\|createServerClient" src/proxy.ts` returns nothing —
    Proxy never touches the database or verifies the session, only checks cookie presence
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Easy to get wrong in the authoritative direction (Next's own docs warn against this);
    needs the contextual judgment to keep it strictly optimistic, not just mechanical code entry.

**Checkpoint**: Story 1 is structurally complete (automated proof lands in Phase 9 once fixtures
exist). `/`, `/dashboard`, `/dashboard-admin` each have an independent, server-side guard.

---

## Phase 5: Server Action Contract Proof (US3)

**Goal**: One real, working Server Action (`updateMyProfile`, backed by the approved
`update_my_profile` RPC) proving validate → authenticate → authorize → controlled data access →
safe error mapping → revalidate, end-to-end.

**Independent Test**: Sign in, submit a valid/invalid profile change, and attempt the action without
a session, per quickstart.md Story 3.

- [ ] T018 [US3] Implement `updateMyProfile` in `src/app/dashboard/settings/actions.ts` exactly per
  `contracts/server-action-contract.md`'s six steps: parse `MyProfileInput` (T007) → call
  `getRequestIdentity()` (T011), reject if not authenticated → (no extra authorization needed; every
  authenticated user may update their own profile) → call
  `supabase.rpc("update_my_profile", {...})` via the T006 request-scoped server client → map any
  RPC error to a safe generic `ServerActionResult` (data-model.md), never the raw Postgres message
  → `revalidatePath("/dashboard/settings")` on success (depends on T007, T011, T006).
  - Requirements: FR-011, FR-012, FR-013, FR-017, FR-018
  - Verify: calling the exported function directly with no session returns `{ ok: false, ... }`
    without any `supabase.rpc` call occurring (confirmed via T029); calling it with invalid input
    returns `fieldErrors` and no RPC call; no line in this file contains `error.message` returned
    verbatim to the caller
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: The contract is already fully specified (low ambiguity), but this is the reference
    implementation every later Server Action copies, so the auth-rejection and error-mapping paths
    must be exactly right.

- [ ] T019 [US3] Implement `src/app/dashboard/settings/page.tsx`: a minimal settings shell rendering
  a form (React Hook Form + `@hookform/resolvers/zod` against `MyProfileInput`) that calls
  `updateMyProfile` via `useActionState`, rendered inside the T013 dashboard layout (depends on
  T018, T007, T013).
  - Requirements: FR-018, spec §R (minimal shell only, not a full settings business screen)
  - Verify: submitting valid data updates the profile and the UI reflects the new value after
    revalidation; submitting an over-length field shows an inline field error without a page reload
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Focused UI wiring against an already-implemented, explicit Server Action and schema.

**Checkpoint**: Story 3 structurally complete; automated proof lands in Phase 9.

---

## Phase 6: Next.js Cache Proof (US4)

**Goal**: Prove Next.js-native caching/revalidation works safely, using a deliberately non-business
placeholder read — never a real catalog table (Clarify-resolved FR-015).

**Independent Test**: Load the cache-proof route twice, trigger revalidation, confirm the change
appears, per quickstart.md Story 4.

- [ ] T020 [P] Create `lib/foundation/status.ts`: a **computed** (not hardcoded) foundation-only
  observable value — a `computedAt` timestamp plus a generated revision token (e.g., a random or
  monotonic token produced at computation time) — wrapped in a Next.js-native cache entry tagged
  `foundation-status` using **`unstable_cache` from `next/cache`**. The value MUST be recomputed
  (producing a visibly different token/timestamp) when the tag is revalidated, and MUST NOT read any
  business/catalog table, create any database table, or use any external cache (research.md §5).
  - **Cache API is pinned**: use `unstable_cache` only. `"use cache"` / `cacheLife` / `cacheTag`
    MUST NOT be used in this feature — they require `cacheComponents: true` in `next.config.ts`,
    which per Next 16's own upgrade guide "is not a rename-only change: it can surface build errors
    for uncached data outside of `<Suspense>` and requires adopting the Cache Components model."
    That adoption is repo-wide, would affect every route in 001 and 002–012, and is **not** part of
    the approved Foundation setup. `next.config.ts` MUST remain unchanged by this task.
  - Requirements: FR-014, FR-015
  - Verify: calling the underlying compute function twice directly (bypassing the cache) yields two
    different values — proving the value is genuinely computed, not a constant;
    `grep -rn "origins\|coffees\|coffee_types" lib/foundation/status.ts` returns nothing;
    `grep -rni "redis\|upstash" lib/foundation/status.ts` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Focused implementation against an explicit cache contract, but the compute-vs-cache
    distinction must be exactly right for the proof to be honest.

- [ ] T021 [P] Create the route `src/app/foundation-status/page.tsx` rendering the T020 cached value
  (a normal, routable App Router segment — **not** an underscore-prefixed private folder, which
  Next.js excludes from routing). It is deliberately unlinked from any product navigation and is
  foundation-only reference infrastructure, not a product page (depends on T020).
  - Requirements: FR-015
  - Verify: `GET /foundation-status` returns 200 and renders the value; two rapid successive
    requests render the **same** token/timestamp (served from cache, not recomputed); the route
    appears in no navigation component (`grep -rn "foundation-status" src components --include=*.tsx`
    matches only this route's own files)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical route rendering a value already produced elsewhere.

- [ ] T022 [P] Add a documented revalidation Server Action in
  `src/app/foundation-status/actions.ts` calling **`revalidateTag("foundation-status")`** from
  `next/cache` so the next read recomputes T020's value (depends on T020). Use `revalidateTag`
  only — `updateTag` belongs to the Cache Components model excluded by T020.
  - Requirements: FR-015
  - Verify: record the token rendered at `/foundation-status`; invoke the action; reload — the
    rendered token/timestamp is **different** from the recorded one (recompute actually happened),
    deterministically and without any wall-clock wait
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Focused implementation against an explicit, already-decided revalidation contract.

- [ ] T023 Verify and add the row to `contracts/cache-policy-contract.md`'s table confirming no
  private/member/admin route in this feature shares the T020 cache mechanism (depends on T021,
  T022, T013, T014).
  - Requirements: FR-016, FR-017
  - Verify: `grep -rln "unstable_cache" src/app/dashboard src/app/dashboard-admin` returns nothing —
    no protected route uses the same caching primitive as the public proof; and
    `grep -rn "use cache\|cacheLife\|cacheComponents" src lib next.config.ts` returns nothing,
    confirming the Cache Components model was not adopted (see T020)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical grep-based structural verification with an unambiguous pass/fail signal.

**Checkpoint**: Story 4 complete and verified. No Redis/Upstash dependency exists anywhere (confirmed
again in Phase 11).

---

## Phase 7: Hills Design Tokens & RTL Foundation (US5)

**Goal**: At least one real, rendered surface visibly uses Hills Coffee tokens instead of default
shadcn styling, and holds up under `dir="rtl"` with a longer placeholder string.

**Independent Test**: Render the proof surface, confirm Hills colors/type, force `dir="rtl"` with a
long string, confirm no layout breakage, per quickstart.md Story 5.

- [ ] T024 Remap `src/app/globals.css`'s `:root` and `.dark` block **variable values** (not names,
  not structure) to the Hills Coffee palette from `docs/claude-design/tokens/colors.css`
  (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`, `--border`,
  `--ring`, etc. — every existing `components/ui/*` primitive already reads these names via
  Tailwind's `@theme inline` mapping) — keep the existing `.dark` class convention as the dark-mode
  trigger (research.md §12; contracts/route-surface-contract.md's locked-file table).
  - Requirements: FR-020
  - Verify: `git diff src/app/globals.css` shows only value changes inside the existing `:root`/
    `.dark` blocks, no renamed/removed variables, no structural rewrite; an existing
    `components/ui/button.tsx` render visibly changes color without any edit to `button.tsx` itself
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: Touches the one shared, Constitution-locked global stylesheet every component in the
    project depends on — an error here has repository-wide visual blast radius.

- [ ] T025 Wire the Hills fonts (Benito, Manrope from `docs/claude-design/tokens/fonts.css`/
  `uploads/`) for the one proof surface only, via `next/font/local` or scoped `@font-face` rules —
  not a full typographic system rollout (depends on T024).
  - Requirements: FR-020
  - Verify: the proof surface's computed `font-family` resolves to Benito/Manrope, not the existing
    Geist fonts; no other route's rendered font changes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Requires judgment to scope font-loading narrowly rather than a blanket project-wide swap.

- [ ] T026 [US5] On the `src/app/dashboard/settings/page.tsx` surface (T019), use existing
  `components/ui/*` primitives (e.g., `Button`, `Card`) styled by the T024 tokens, and use logical
  CSS utilities (`ps-*`/`pe-*`/`text-start`/`text-end`) instead of `pl-*`/`pr-*`/`text-left`/
  `text-right` throughout (depends on T024, T025, T019).
  - Requirements: FR-020, FR-021
  - Verify: `grep -n "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/settings/page.tsx`
    returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Requires correctly distinguishing logical-vs-physical CSS properties across a real page,
    not just following a fixed template.

- [ ] T027 [P] [US5] Add `tests/design/hills-tokens.test.tsx`: render the T026 surface with
  `@testing-library/react`, assert its computed styles reference Hills token values (not shadcn
  defaults); render it again with `dir="rtl"` and a long placeholder string, assert no overlap/
  clipping signal (e.g., scrollWidth vs clientWidth check); assert an animated element (if any)
  respects `prefers-reduced-motion` (depends on T026).
  - Requirements: FR-020, FR-021, FR-022, SC-010
  - Verify: `npm test -- hills-tokens` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Mechanical rendered-component test against an already-built, explicit surface — this is
    exactly the synchronous-component case Vitest/RTL handles natively (research.md §8).

**Checkpoint**: Story 5 complete and automatically verified.

---

## Phase 8: Test Identity / Fixture Infrastructure

**Purpose**: A disposable, reproducible seed mechanism so Phase 9's authorization tests don't depend
on hand-provisioned, undocumented accounts (Clarify-resolved FR-029a).

- [ ] T028 Implement `scripts/seed-test-fixtures.ts`: using `SUPABASE_SERVICE_ROLE_KEY` (read only
  in this script — never imported by anything under `src/app/`, `components/`, or `lib/`), create
  (idempotently, by fixed `+foundation-test` email convention) the `buyer-only`,
  `buyer-and-seller`, and `warehouse-admin` fixtures exactly as specified in
  `contracts/test-fixture-contract.md`; support a `--teardown` flag that deletes exactly those rows.
  - Requirements: FR-029a
  - Verify: `grep -rln "SUPABASE_SERVICE_ROLE_KEY" src components lib` returns nothing (the key is
    referenced only in `scripts/`); running the script twice creates no duplicate rows; running
    with `--teardown` removes exactly the three fixtures and nothing else
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: Privileged-credential handling with an explicit, non-negotiable security boundary
    (service-role must never leak into runtime application code) — worth the extra scrutiny even
    though the scripting itself is otherwise mechanical.

- [ ] T029 Add `"test:seed": "tsx scripts/seed-test-fixtures.ts"` and
  `"test:seed:teardown": "tsx scripts/seed-test-fixtures.ts --teardown"` to `package.json` (add
  `tsx` as a dev dependency if no existing script runner already satisfies this) (depends on T028).
  - Requirements: FR-029a
  - Verify: `npm run test:seed` executes T028 successfully; `npm run test:seed:teardown` executes
    the teardown path
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical package-script wiring.

**Checkpoint**: reproducible test identities exist. Phase 9's authorization tests can now run.

---

## Phase 9: Automated Testing & Authorization Verification (US2, US3)

**Purpose**: The real, automated proof that Stories 2 and 3's authorization/mutation behavior is
correct — not merely asserted in documentation (FR-029).

- [ ] T030 [P] [US2] Add `tests/auth/request-identity.test.ts` calling `getRequestIdentity()`
  directly (research.md §8 — no browser rendering) against the T028 fixtures: (a) no session →
  `{ kind: "anonymous" }`; (b) `buyer-only` → `organization.canSell === false`; (c)
  `buyer-and-seller` → `organization.canSell === true`; (d) `warehouse-admin` →
  `operationalRoles` contains `"WAREHOUSE"` but not `"FINANCE"`; (e) **capability freshness**:
  toggle a fixture organization's `can_sell` in the database between two separate calls to
  `getRequestIdentity()` for the same user and confirm the second call reflects the change (Story 2
  AS4) (depends on T011, T028).
  - Requirements: FR-005, FR-006, FR-008, FR-029; Platform Story 2 (all acceptance scenarios)
  - Verify: `npm test -- request-identity` passes, including the freshness case
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: This is the central automated proof of the platform's core authorization guarantee —
    including the no-stale-caching requirement that is easy to silently get wrong.

- [ ] T031 [P] [US3] Add `tests/auth/update-my-profile.test.ts` calling `updateMyProfile` directly:
  (a) no session → `{ ok: false, ... }`, no RPC invoked; (b) invalid input (e.g., over-length
  field) → `fieldErrors` present, no RPC invoked; (c) authenticated valid input (using a T028
  fixture) → `{ ok: true, ... }`, profile row updated (depends on T018, T028).
  - Requirements: FR-011, FR-012, FR-013, FR-018, FR-029; Platform Story 3 (all acceptance
    scenarios)
  - Verify: `npm test -- update-my-profile` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: Authorization-adjacent (must prove the auth-rejection path, not just the happy path)
    against an already-explicit contract.

- [ ] T032 Run the full suite and confirm no test file references a hand-provisioned, undocumented
  account (depends on T030, T031).
  - Requirements: FR-029, FR-029a
  - Verify: `npm test` passes end-to-end; `grep -rn "@" tests/ | grep -v "foundation-test"` (or
    equivalent) shows every test-account email uses the T028 documented fixture convention
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical suite execution and a grep-based structural check.

**Checkpoint**: Stories 2 and 3 are now automatically, truthfully verified — not just structurally
built.

---

## Phase 10: Documentation / Agent Handoff (US6)

**Goal**: A future agent with no chat history can locate the conventions this feature introduced
from repository artifacts alone (Constitution Multi-Agent Continuity & Handoff; spec FR-031–FR-033).

- [ ] T033 [P] [US6] Add a short, durable reference (e.g.,
  `specs/001-platform-foundation/AGENT-HANDOFF.md` or a new `docs/foundation/README.md` — choose
  the location that best fits existing `docs/` conventions) pointing to: the route-protection
  pattern (`contracts/route-surface-contract.md`), the Server Action pattern
  (`contracts/server-action-contract.md`), the Supabase client boundary (research.md §4), the cache
  policy (`contracts/cache-policy-contract.md`), the environment contract (`.env.example`,
  research.md §14), the test/fixture workflow (`contracts/test-fixture-contract.md`), the
  verification commands (Phase 11 below), **the database capability map and its recorded blockers
  (`docs/architecture/DATABASE-CAPABILITY-MAP.md`)**, and **the feature roadmap
  (`docs/architecture/IMPLEMENTATION-ROADMAP.md`)** — referencing these documents, not restating
  their content (FR-032). It must also contain the two walkthroughs T047 verifies.
  - Requirements: FR-031, FR-032, FR-033
  - Verify: the new file is under 2 pages and contains no restated Constitution/SRS text longer
    than one sentence per topic — every substantive rule is a link/reference, not a copy
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Requires editorial judgment about what a future agent actually needs discoverable vs. what
    would just duplicate an authoritative source.

- [ ] T034 [P] Add a short "Platform Foundation" pointer section to the repository's root
  `README.md` linking to `specs/001-platform-foundation/` and listing the four verification
  commands (`lint`, `typecheck`, `test`, `build`).
  - Requirements: FR-031
  - Verify: `README.md` contains a working relative link to `specs/001-platform-foundation/spec.md`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical documentation addition with an explicit, small scope.

**Checkpoint**: Story 6 complete — a new agent can now self-orient from repository artifacts alone.

---

## Phase 11: Full Verification / Closure

**Purpose**: The final, explicit sign-off pass. Every item here must be truthfully checked, not
assumed. This phase does **not** claim production trading readiness (Constitution §48) — it closes
out the platform foundation only.

- [ ] T035 Run `npm run lint` — zero errors.
  - Requirements: FR-030, SC-008
  - Verify: exit code 0
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical command execution.

- [ ] T036 Run `npm run typecheck` (`tsc --noEmit`) — zero errors.
  - Requirements: FR-030, SC-008
  - Verify: exit code 0
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical command execution.

- [ ] T037 Run `npm test` — all tests pass, including T030/T031's authorization tests.
  - Requirements: FR-029, FR-030, SC-008
  - Verify: exit code 0; test output shows the request-identity and update-my-profile suites ran
    (not skipped)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical command execution with an explicit expected test list.

- [ ] T038 Run `npm run build` — production build succeeds — then repeat the full verification
  sequence **from a clean checkout** to prove the documented commands work for someone who has
  never run this repo before.
  - Requirements: FR-030, SC-008
  - Verify: (a) `npm run build` exits 0 with no build warnings about the new routes/actions;
    (b) in a fresh clone (or after `git clean -xdf` on a scratch copy) with only `npm install` and
    a populated `.env.local`, all four commands — `npm run lint`, `npm run typecheck`, `npm test`,
    `npm run build` — exit 0, with zero failures caused by missing tooling or undocumented setup
    steps; (c) any step that turned out to be required but undocumented is added to quickstart.md
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: The clean-checkout run is what actually proves SC-008; running in an already-warm working
    tree can silently hide a missing dependency or setup step.

- [ ] T039 Manually verify anonymous-visitor blocking: direct navigation to `/dashboard` and
  `/dashboard-admin` with no session, JavaScript disabled, per quickstart.md Story 1.
  - Requirements: SC-001, SC-004
  - Verify: both routes render `StateScreen`/a sign-in redirect, never protected content; `/`
    renders unchanged
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Manual judgment call on "does this look like a safe denial," but low complexity.

- [ ] T040 Manually verify member/admin authorization-negative behavior and capability freshness
  end-to-end in a running `npm run dev` session (beyond T030's function-level test): sign in as
  each T028 fixture and confirm the correct nav/action visibility; toggle `can_sell` in the
  database and confirm the change without sign-out, per quickstart.md Story 2.
  - Requirements: SC-002, SC-003
  - Verify: observed behavior matches T030's automated assertions in a real browser session
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Judgment-based end-to-end confirmation that the automated test's assumptions hold in a
    real running app, not just in isolation.

- [ ] T041 Verify Server Action rejection paths manually (e.g., replaying the action request
  without cookies via browser dev tools or a direct `fetch`), per quickstart.md Story 3.
  - Requirements: FR-013
  - Verify: the replayed request is rejected with a safe error, no profile change occurs
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical manual replay against an already-tested contract.

- [ ] T042 Verify the cache proof manually: load `/foundation-status` twice, trigger the T022
  revalidation action, confirm the value changes, per quickstart.md Story 4.
  - Requirements: SC-005, SC-006
  - Verify: the second load before revalidation renders an identical token/timestamp; the load
    after revalidation renders a different one (proving recompute-on-revalidate, not a constant)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical manual check with a clear expected before/after signal.

- [ ] T043 Verify RTL and `prefers-reduced-motion` behavior on the T026 proof surface, per
  quickstart.md Story 5.
  - Requirements: SC-010
  - Verify: forcing `dir="rtl"` and a long placeholder string shows no layout breakage; enabling
    `prefers-reduced-motion` in the OS/browser removes any animation
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical manual check against an already-built, explicit surface.

- [ ] T044 Grep-verify zero Redis/Upstash references anywhere in the repository (dependencies,
  imports, environment variables, documentation added by this feature).
  - Requirements: FR-014, SC-009
  - Verify: `grep -rniE "redis|upstash" package.json src components lib scripts` (excluding
    `node_modules`, `docs/claude-design`, and this feature's own spec discussion of the prior
    constitution amendment) returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical grep-based structural check.

- [ ] T044a Log-safety and error-exposure audit: review every logging call and error path introduced
  by this feature and confirm no secret, credential, session material, or raw database error can
  reach application logs or a client response. This is an audit of existing code — do **not** add
  logging infrastructure, a logger library, or a redaction layer to satisfy it.
  - Requirements: FR-013, FR-026, FR-027, SEC/Constitution Principle XIV
  - Verify: (a) `grep -rnE "console\.(log|error|warn|info|debug)" src lib scripts` — review every
    hit and confirm each logs an identifier/message only, never a token, password, service-role key,
    KYB content, or a full error/exception object; (b) `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src lib
    components` returns nothing (the key exists only in `scripts/seed-test-fixtures.ts`, and that
    script must not print it); (c) trigger each `updateMyProfile` failure path (unauthenticated,
    invalid input, forced RPC error) and confirm the client receives only the mapped safe message —
    no Postgres text such as `forbidden`, no SQL, no stack trace; (d) confirm the seed script logs
    fixture emails/ids only, never passwords or the service-role key
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: Security-critical audit spanning every log and error path in the feature; a single leaked
    token or raw database error violates a Constitution MUST and is invisible in normal testing.

- [ ] T045 Verify locked root files remain at their original paths: `git log --follow` or `git
  status` confirms `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` were modified
  in-place (T009, T024 only), never moved, renamed, or wrapped in a new route group. Additionally
  confirm `components/ui/` is unmodified and no empty/speculative component directory was created.
  - Requirements: FR-001, FR-019
  - Verify: `git diff --summary` shows no rename/move entries for these three files;
    `git status --porcelain components/ui` is empty; `find components -type d -empty` returns
    nothing (every new component directory contains a real component)
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical structural git check covering both the root-file lock and the component
    organization rule.

- [ ] T046 Review the complete `git diff` for this feature against `main` for anything outside its
  declared scope (no database migration files, no marketplace/checkout/payment/KYB business
  screens, no `/buyer-dashboard`/`/seller-dashboard`).
  - Requirements: spec §R (Out of Scope)
  - Verify: `git diff --stat main...001-platform-foundation` contains only files listed in
    plan.md's Project Structure tree (plus this feature's own `specs/` artifacts)
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: Requires judgment to recognize scope creep, not just a mechanical file-count check.

- [ ] T047 Confirm T033/T034's documentation is both **discoverable** and **followable**: a
  contributor with no prior context can use it to add one protected route and one Server Action
  correctly on the first attempt.
  - Requirements: FR-031, FR-032, SC-007
  - Verify: (a) following only `README.md` → `specs/001-platform-foundation/` → the handoff doc, a
    reader reaches every contract referenced in Phase 10 within two clicks; (b) the handoff doc
    contains a concrete, ordered "add a protected route" walkthrough (create the segment → call
    `getRequestIdentity()` in its layout → render `StateScreen` on denial → verify with a negative
    test) referencing `contracts/route-surface-contract.md`; (c) it contains an equivalent "add a
    safe Server Action" walkthrough (validate → authenticate → authorize → controlled data access →
    safe error → revalidate) referencing `contracts/server-action-contract.md` and pointing at
    `updateMyProfile` as the working example; (d) it is non-duplicative — every rule already owned
    by the Constitution/SRS is referenced, not restated
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: SC-007's real criterion is followability, not just link reachability; judging whether a
    walkthrough is genuinely sufficient for a cold contributor requires reading it as one.

- [ ] T048 Final Constitution compliance re-check: re-walk plan.md's Constitution Check table
  (source priority, DB authority, locked root files, `/dashboard`/`/dashboard-admin` separation,
  Buyer/Seller additive model, server/DB-side authorization, Postgres transactional authority, no
  external cache, design-system fidelity, security/secrets handling, Spec Kit lifecycle,
  multi-agent continuity) against what was actually built, not what was planned.
  - Requirements: Constitution v2.0.0, all principles listed above
  - Verify: every row in plan.md's Constitution Check table still reads PASS against the final
    diff; any new PASS→FAIL is documented as a blocker, not silently accepted
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: A holistic, cross-cutting compliance judgment across the whole feature — appropriate for
    higher reasoning, but a confirmation pass rather than novel architecture, hence Medium not High.

- [ ] T049 Record closure explicitly: this completes 001-platform-foundation only. It does **not**
  authorize production trading (Constitution §48/Principle "Production Readiness") — legal, KYB
  policy, agreements, warehouse reconciliation, finance/tax, market-data licensing, security
  review, backup/restore validation, and end-to-end acceptance testing remain outstanding gates for
  the product as a whole.
  - Requirements: Constitution § Production Readiness (code completion never authorizes production trading)
  - Verify: the PR/handoff note for this feature contains this statement verbatim or equivalent
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: Mechanical, explicit documentation of an already-decided scope boundary.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately.
- **Phase 2 (Foundational)**: depends on Phase 1 (needs `package.json` scripts in place before
  anything is meaningfully testable) — BLOCKS Phases 3–9.
- **Phase 3 (Identity/Authorization)**: depends on Phase 2 (T006 server client, T010 types) —
  BLOCKS Phases 4, 5, 9.
- **Phase 4 (Route Shells, US1)**: depends on Phase 3 (T011).
- **Phase 5 (Server Action, US3)**: depends on Phase 2 (T007) and Phase 3 (T011); T019 also depends
  on Phase 4's T013 (dashboard layout must exist as the parent route).
- **Phase 6 (Cache Proof, US4)**: depends only on Phase 1/2 completing (no dependency on Phases
  3–5) — **may run in parallel with Phases 3–5 by a different agent/session**, since it touches
  entirely disjoint files (`lib/foundation/`, `src/app/foundation-status/`).
- **Phase 7 (Design Tokens, US5)**: depends on Phase 4 (T013) and Phase 5 (T019) for a surface to
  style (T026), but T024 (the `globals.css` remap) itself only depends on Phase 1.
- **Phase 8 (Fixtures)**: depends only on Phase 1 (needs `package.json` script wiring) — may run in
  parallel with Phases 3–7.
- **Phase 9 (Automated Tests, US2/US3)**: depends on Phase 3 (T011), Phase 5 (T018), and Phase 8
  (T028) — cannot start meaningfully before all three exist.
- **Phase 10 (Documentation, US6)**: depends on Phases 3–9 existing (there must be something to
  document/reference) — practically last before closure, though it could start once contracts/
  are known to be stable (they already are, from `/speckit-plan`).
- **Phase 11 (Closure)**: depends on everything above.

### Parallel Opportunities

- Phase 1: T004 in parallel with T001–T003 (distinct file).
- Phase 2: T005, T006, T007, T008 all in parallel (four independent new files); T009 depends on
  T008.
- Phase 3: T010 (types) has no in-phase dependency and could start as soon as Phase 2 begins; T011
  (the `getRequestIdentity()` implementation) depends on both T010 and T006, so it is sequential
  after them, not parallel.
- Phase 4: T012 in parallel with Phase 3 completing; T013 and T014 in parallel with each other
  (disjoint files, both only read from T011); T015 and T016 in parallel with each other.
- Phase 6: entirely parallelizable with Phases 3–5 by a separate agent, since T020/T021/T022/T023
  touch only `lib/foundation/` and `src/app/foundation-status/`.
- Phase 8: entirely parallelizable with Phases 3–7 by a separate agent (T028/T029 touch only
  `scripts/` and `package.json`'s script section — coordinate `package.json` edits with Phase 1/2 if
  running truly concurrently).
- Phase 9: T030 and T031 in parallel with each other (disjoint test files, both depend only on
  earlier, already-complete phases).
- Phase 10: T033 and T034 in parallel with each other (disjoint files).

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all four Phase 2 foundation tasks together — genuinely independent files:
Task: "Create lib/supabase/client.ts per research.md §4"
Task: "Create lib/supabase/server.ts per research.md §4"
Task: "Create lib/validation/my-profile.ts per data-model.md"
Task: "Create lib/i18n/config.ts per research.md §10"
```

## Parallel Example: Phase 4 (Route Shells)

```bash
# T013 and T014 write to disjoint route trees and both only *read* T011's output:
Task: "Create src/app/dashboard/layout.tsx authorization guard"
Task: "Create src/app/dashboard-admin/layout.tsx authorization guard"
```

---

## Implementation Strategy

### Minimum viable foundation (Phases 1–4)

Tooling → Supabase/i18n foundation → identity resolution → the three-surface security boundary.
This alone proves Constitution Principle VIII (server/database-side authorization) end-to-end and
is the single most load-bearing slice — **stop and validate here first** (T039's manual check)
before adding the Server Action, cache, and design-system proofs.

### Incremental delivery

1. Phases 1–4 → the security boundary exists and is manually verifiable.
2. Phase 5 → the Server Action contract is proven.
3. Phase 6 → the cache contract is proven (can be done in parallel with Phase 5 by a second agent).
4. Phase 7 → the design-system/RTL foundation is proven.
5. Phase 8 → test fixtures exist (can be done in parallel with Phases 4–7 by a second/third agent).
6. Phase 9 → everything above gets real automated authorization proof, not just structural
   existence.
7. Phase 10 → the whole foundation becomes discoverable to a future agent without this
   conversation.
8. Phase 11 → closure: every requirement in spec.md is checked against what was actually built.

### Multi-agent parallel strategy

With three agents available: Agent A takes Phases 1→2→3→4 (the security-critical spine, needs the
highest-effort model per the recommendations above); Agent B takes Phase 6 (cache proof) and then
Phase 8 (fixtures) once Phase 1 lands; Agent C takes Phase 7's `globals.css`/font work once Phase 1
lands (it only needs Phase 4/5's surface to exist before finishing T026, so it can prepare T024/T025
early). All three converge for Phase 9 (needs Phases 3, 5, and 8) and Phase 11 (needs everything).

---

## Requirement traceability

All **44** requirements (FR-001…FR-033 incl. FR-029a, and SC-001…SC-010) are cited by at least one
task. Two are covered by design rather than by dedicated work, and are traced explicitly so the
coverage is auditable rather than assumed:

| Requirement | Traced to | Why no separate task |
|---|---|---|
| **FR-024** (later domain states build on the FR-023 foundation) | T012 | It is a *property* of `StateScreen`'s open `kind` union, verified in T012's acceptance rather than as separate work. Later features (005–012) consume it; 001 only has to avoid closing the union. |
| **SC-009** (zero external cache references) | T044 | A pure verification criterion with no implementation counterpart — nothing is built to satisfy it; T044 proves the absence. |

Every other requirement maps to concrete implementation and/or verification work.

## Notes

- **Cache API is pinned**: this feature uses `unstable_cache` + `revalidateTag` from `next/cache`
  only. `"use cache"` / `cacheLife` / `cacheTag` / `updateTag` are excluded because they require
  `cacheComponents: true` in `next.config.ts` — a repo-wide Cache Components adoption that is not
  part of the approved Foundation setup and would affect 002–012 as well. `next.config.ts` is not
  modified by any task here. See research.md §5 and contracts/cache-policy-contract.md.
- No task in this file modifies the approved database schema, RLS, triggers, or functions, or
  creates a Storage bucket — every DB interaction is a call to an already-approved
  `SECURITY DEFINER` RPC. **No blocker of this kind was identified during task generation.**
- No task references the resolved Specify-phase findings (SRS path typo, empty design-guidance
  file) — both were already fixed in the repository before this feature reached Clarify, per
  spec.md's Repository Findings section.
- `[P]` markers are deliberately conservative: `src/app/layout.tsx`, `src/app/globals.css`,
  `package.json`, and `lib/auth/dal.ts` each have exactly one task that touches them, and that task
  is never marked `[P]` against another task touching the same file.
