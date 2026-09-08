# Research: Platform Foundation (001)

**Date**: 2026-09-08
**Input**: `specs/001-platform-foundation/spec.md` (all clarifications resolved), Constitution v2.0.0,
approved database baseline (`docs/database/database-schema-report.json`, generated
2026-09-07T19:03:53Z), Next.js 16.3.4 / React 19.2.8 docs bundled at
`node_modules/next/dist/docs/`, `@supabase/ssr@0.12.6` README.

Every decision below resolves a "how" left open by spec.md. None of them change spec.md's
requirements; they choose the concrete mechanism that satisfies each requirement.

---

## 1. Session verification: `getUser()`, not `getSession()`

**Decision**: Every server-side identity resolution calls `supabase.auth.getUser()` (which
round-trips to Supabase Auth to verify the JWT) — never `getSession()` (which only decodes the
local cookie without server verification) — for any check that gates access to protected content
or a Server Action.

**Rationale**: The installed `@supabase/ssr` README explicitly says to choose deliberately between
`getSession()`, `getUser()`, and `getClaims()`. `getSession()` trusts the cookie's claims without
revalidating against the Auth server, which is exactly the "stale client/session claim" Constitution
Principle VIII and spec FR-006 forbid trusting. `getUser()` (or `getClaims()`, which verifies the
JWT locally against Supabase's published keys and is cheaper) both give a server-verified identity.
This project uses `getUser()` for its explicitness and broad support in the installed SDK version;
`getClaims()` MAY replace it later as a performance optimization without changing this contract.

**Alternatives considered**: `getSession()` alone — rejected, it is optimistic-only and exactly the
kind of "session cached from sign-in time" behavior Platform Story 2 (AS4) forbids as the
authoritative check.

---

## 2. Next.js Proxy is optimistic-only; the Data Access Layer (DAL) is authoritative

**Decision**: An optional `src/proxy.ts` (Next 16's renamed `middleware.ts` — confirmed at
`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, which specifies the file lives
"in the project root, or inside `src` if applicable, so that it is located at the same level as
`pages` or `app`" — i.e. `src/proxy.ts`, **never** `src/app/proxy.ts`) may read the Supabase auth
cookie's mere presence/absence to redirect an obviously-anonymous visitor away from `/dashboard`
and `/dashboard-admin` before the page even renders, for a snappier UX. It MUST NOT query the
database or call `getUser()`. The authoritative check lives in a server-only **Data Access Layer**
(`lib/auth/dal.ts`), following the exact pattern Next's own authentication guide recommends
(`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Creating a Data Access Layer").

**Rationale**: Next's own docs state Proxy "should not be used as a full session management or
authorization solution" and that "the majority of security checks should be performed as close as
possible to your data source." This matches FR-007 exactly and gives a named, documented pattern
(the DAL) rather than an invented one.

**Alternatives considered**: Skipping Proxy entirely — acceptable and simpler, but the optimistic
redirect is cheap, real, and improves the "no flash of protected content" acceptance scenario (Story
1, AS2/AS3), so it is included as a thin, provably non-authoritative layer.

---

## 3. Request Identity resolution: a per-request DAL function over approved DB functions

**Decision**: `lib/auth/dal.ts` exports `getRequestIdentity()`, wrapped in React's `cache()` (per-request
memoization only, never cross-request), which:
1. Creates a request-scoped Supabase server client (see §4).
2. Calls `getUser()`. If no user, returns `{ kind: "anonymous" }`.
3. If a user exists, calls the approved, already-audited SECURITY DEFINER RPCs — `is_platform_admin()`,
   `is_super_admin()`, `is_compliance_operator()`, `is_warehouse_operator()`, `is_finance_operator()`,
   `is_auditor()` — to build an `operationalRoles: OperationalRole[]` list, and separately resolves the
   user's organization membership row(s) (`organization_members`, readable under its own `members_own_org`
   RLS policy) plus `organization_can_buy(orgId)` / `organization_can_sell(orgId)` for the active
   organization, normalizing the result into the `RequestIdentity` shape in data-model.md.
4. Returns a fresh result on every call within a request — it is never persisted beyond that
   request (no long-lived cache, no session-attached capability snapshot).

**Rationale**: This is exactly spec Key Entity "Organization Membership Context" / "Operational Role
Context" and FR-008 ("rely on the approved database's own authorization surface... rather than a
duplicated, hand-rolled rule set"). Every function used already exists in the audited baseline
(confirmed via `database-schema-report.json`: `is_org_member`, `organization_can_buy`,
`organization_can_sell`, `is_platform_admin`, `is_super_admin`, `is_compliance_operator`,
`is_warehouse_operator`, `is_finance_operator`, `is_auditor` are all `SECURITY DEFINER`, `STABLE`,
and scoped to `auth.uid()` — none require the service-role key, and all are callable by an
authenticated user via `supabase.rpc(...)`). This satisfies §5's instruction not to invent a
parallel authorization model.

**Freshness**: because `cache()` only memoizes within one render pass and a new request always
re-runs `getRequestIdentity()` from scratch, a suspended organization or revoked `can_sell` is
reflected on the very next request — satisfying Story 2 AS4 without inventing an invalidation
mechanism.

**Alternatives considered**: Storing capability flags in the Supabase Auth JWT's custom claims —
rejected for 001; it would require a database/Auth-hook change (out of scope, Constitution
Principle III) and would reintroduce exactly the staleness risk (claims only refresh when the
token refreshes) this feature is designed to avoid.

---

## 4. Supabase client boundaries: browser, server (request-scoped), no privileged client

**Decision**: Two client constructors, both from `@supabase/ssr`:
- `lib/supabase/client.ts` — `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)`,
  used only from Client Components that need genuine interactive Supabase Auth UI (the sign-in
  form's client-side submission handling, if any is needed beyond a Server Action).
- `lib/supabase/server.ts` — `createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: {...} })`,
  constructed fresh per request from `next/headers`'s `cookies()`, used from every Server Component,
  Server Action, and Route Handler. This is the only client `lib/auth/dal.ts` and the sample Server
  Action use.
- **No `lib/supabase/admin.ts` (service-role client) is added to the application runtime.** Per the
  Clarify-resolved FR-026, none of this feature's functionality needs it — sign-in/out, identity
  resolution, and the `update_my_profile` proof are all achievable under the calling user's own
  RLS-scoped session. `SUPABASE_SERVICE_ROLE_KEY` stays defined in the environment contract (§14)
  for a future feature to justify explicitly; this feature does not construct a client from it.

**Rationale**: Matches spec FR-026 (service-role never in browser code) and the Clarify resolution
that no default service-role data-access path exists. Keeping exactly two client constructors, both
documented once, is the smallest pattern a future agent can copy without guessing which client a
new piece of code should use.

**Alternatives considered**: A single "universal" client factory that branches on server/browser —
rejected; `@supabase/ssr`'s own API already separates `createBrowserClient`/`createServerClient`
by design (different storage/cookie mechanics), and forcing them through one wrapper would obscure
that distinction for a future agent.

---

## 5. Cache-proof read: a computed, no-database foundation value (per Clarify)

**Decision**: The Story 4/FR-015 cache proof follows a **compute → cache → repeated read returns the
same value → explicit revalidation → recompute → next read returns a new value** cycle:

1. A server-side `computeFoundationStatus()` function produces a genuinely *computed*,
   foundation-only observable value on each invocation — a `computedAt` timestamp plus a generated
   revision token. It is **not** a module constant: two direct calls must return two different
   values, otherwise the proof would be vacuous.
2. That function is wrapped in a Next.js cache entry tagged `foundation-status` using
   **`unstable_cache` from `next/cache`**.

   **The cache API is pinned to `unstable_cache`; `"use cache"` / `cacheLife` / `cacheTag` are
   explicitly NOT selected for 001.** Those primitives require `cacheComponents: true` in
   `next.config.ts`, and Next 16's own upgrade guide
   (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`) states: *"Enabling
   `cacheComponents` is not a rename-only change: it can surface build errors for uncached data
   outside of `<Suspense>` and requires adopting the Cache Components model."* That is a repo-wide
   architectural adoption affecting every route in 001 and in 002–012; it is not part of the
   approved Foundation setup, and `next.config.ts` stays unchanged. If Cache Components is ever
   wanted, it must arrive through its own approved architecture decision, not as a side effect of a
   foundation cache proof.
3. It renders at `src/app/foundation-status/page.tsx` — a **normal, routable** App Router segment,
   deliberately unlinked from any product navigation. It is explicitly *not* an underscore-prefixed
   folder: Next.js treats `_foldername` as a private folder excluded from routing, so
   `src/app/_foundation/status/` would never have produced a reachable page.
4. Revalidation is triggered by an explicit, documented Server Action
   (`revalidateTag("foundation-status")` / `updateTag`) — not a timer — so the next read recomputes
   and renders a visibly different token/timestamp on demand, without wall-clock waiting.

**Rationale**: The Clarify decision requires a "deliberately non-business placeholder value... never
`origins`/`coffees`/`coffee_types`." A computed timestamp/token needs no database write and no new
table (explicitly required by the plan brief §8), while still exercising the real Next.js
cache/revalidate APIs end-to-end. Crucially, a *computed* value — unlike a hardcoded constant —
makes both halves of the proof observable: caching is proven because two rapid reads return the
same value, and revalidation is proven because the value visibly changes afterwards. A hardcoded
constant could never demonstrate the second half, since it would render identically whether or not
revalidation actually occurred.

**Alternatives considered**: Caching a real `origins` row — explicitly rejected by Clarify. A
timer-based TTL (e.g., `revalidate: 60`) alone — rejected as the sole mechanism because it makes
the "bounded" success criterion depend on wall-clock waiting in tests; an action-triggered
revalidation path is demonstrated instead, and a numeric `revalidate` TTL MAY additionally be set
as a ceiling without being the only proof.

---

## 6. Server Action contract proof: `update_my_profile`

**Decision**: `app/dashboard/settings/actions.ts` (or equivalent) exports `updateMyProfile(prevState, formData)`,
a Server Action that: validates `full_name`/`phone`/`company_name`/`avatar_path` with a Zod schema;
calls `getRequestIdentity()` and rejects with a safe generic error if anonymous; calls
`supabase.rpc('update_my_profile', { p_full_name, p_phone, p_company_name, p_avatar_path })` using
the request-scoped server client (never the browser client, never a privileged client); maps
Postgres/RPC errors to a safe `{ error: string }` shape (never the raw Postgres error); and calls
`revalidatePath`/`revalidateTag` for the user's own profile-display surface on success.

**Rationale**: `update_my_profile` (confirmed in the schema report) is `SECURITY DEFINER`, already
raises `forbidden` when `auth.uid()` is null or the caller is blocked, and touches only the caller's
own `profiles` row (`full_name`, `phone`, `company_name`, `avatar_path`) — no commercial, KYB,
inventory, or order data, matching the Clarify resolution on FR-012 exactly.

**Alternatives considered**: Writing a brand-new, foundation-only Postgres function — rejected;
Constitution Principle III forbids schema/function changes without an approved requirement, and
`update_my_profile` already satisfies every constraint.

---

## 7. Validation layering

**Decision**: `updateMyProfile`'s Zod schema is the single source of truth for field shape, imported
by both the client-side form (via `@hookform/resolvers/zod` + React Hook Form, for inline UX errors)
and the Server Action itself (the enforced gate). Postgres — via `update_my_profile`'s own
`auth.uid()`/blocked-user check and the `profiles` table's column types — is the final backstop.
No separate client-only validation schema is maintained.

**Rationale**: Satisfies FR-018 (layered validation, server never bypassable) with one schema file,
avoiding a duplicated or drifting pair of client/server schemas.

---

## 8. Test tooling: Vitest + React Testing Library, function-level Server Action/DAL tests

**Decision**: Add (dev dependencies only) `vitest`, `@vitejs/plugin-react`, `jsdom`,
`@testing-library/react`, `@testing-library/dom`, `vite-tsconfig-paths`. `package.json` gains:
`"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"` (project already
has `noEmit: true` in `tsconfig.json`), existing `"lint"` and `"build"` scripts are unchanged and
become part of the documented verification sequence.

The authorization-negative test and the `updateMyProfile` positive/negative tests are written as
**plain Vitest tests that import and call the exported async functions directly**
(`getRequestIdentity()`, `updateMyProfile()`) against the real, seeded Supabase project (§9) — they
do not render these through React Testing Library. FR-020's Hills-token component proof (a
synchronous, presentational component) IS rendered through `@testing-library/react`, where RTL is
actually useful.

**Rationale**: Next's own Vitest guide (`node_modules/next/dist/docs/.../testing/vitest.md`) is the
only first-party testing guide bundled with this Next.js version (no Jest guide ships), and it
explicitly documents this exact limitation: *"Since `async` Server Components are new to the React
ecosystem, Vitest currently does not support them... we recommend using E2E tests for `async`
components."* Rather than pulling in a full browser/E2E stack (which the Clarify decision already
ruled unnecessary — "integration-level... a browser/E2E harness is not required"), this project
tests the *exported server function* directly, which is plain async TypeScript and entirely
within Vitest's normal capability — sidestepping the RSC-rendering limitation instead of fighting it.

**Alternatives considered**: Playwright/E2E — rejected per Clarify (not required, adds a heavier
dependency and CI cost for what a function-level test already proves). Jest — rejected; not
Next 16's documented default, no material advantage here, and would be one more thing a future
agent has to learn was a deliberate choice rather than an accident.

---

## 9. Test identities: a documented, idempotent seed script against the same Supabase project

**Decision**: `scripts/seed-test-fixtures.ts` (run via `tsx` or `node --experimental-strip-types`,
whichever the chosen Node/TS toolchain supports without a new heavy dependency), documented in
`quickstart.md`, that:
- Creates (or reuses, idempotently, keyed by a fixed `+foundation-test` email convention) a small,
  fixed set of Supabase Auth users and matching `organizations`/`organization_members` /
  `platform_admins` rows representing: an anonymous case (no account needed), a Buyer-only org
  member (`can_sell=false`), a Buyer+Seller org member (`can_sell=true`), and a `WAREHOUSE`-only
  platform admin.
- Uses the Supabase **service-role key read only from a server-only, test-only script** (never from
  application runtime code) to create Auth users and seed rows — this is the one narrowly-scoped,
  explicitly justified, documented use of the service-role key in this feature, exactly as the
  Clarify/plan brief permits ("if creating Supabase Auth test users requires privileged test/setup
  credentials, keep that mechanism test/server-only").
- Prints the created test account identifiers/emails (never passwords in cleartext logs beyond
  what's needed to authenticate the test suite locally) and documents a corresponding teardown path
  (delete-by-tag / delete-by-email-prefix) so the fixtures are not permanent commercial-looking data.

**Rationale**: Satisfies FR-029a exactly. Keeps the security boundary explicit: application runtime
never touches service-role; only a standalone script does, and only for disposable test rows.

**Alternatives considered**: A Supabase local/branch database purely for tests — appealing in
principle, but the approved database baseline is validated against the one live, already-audited
Supabase project (see spec Assumptions), and standing up a second environment is infrastructure
this foundation feature does not own; deferred as a future improvement, not required to satisfy the
spec.

---

## 10. i18next: minimally configured, not wired to a switcher

**Decision**: `i18next`/`react-i18next` (already an approved dependency, currently unused —
confirmed zero references under `src/`, `components/`, `lib/`) is minimally initialized
(`lib/i18n/config.ts`) with a single `en` resource namespace and no `i18next-browser-languagedetector`
activation. Any literal UI copy this feature introduces (sign-in form labels, protected-route
placeholder copy, error/empty-state text) is written as translation keys resolved through this
config, not inline hardcoded strings — satisfying "externalized copy" from the Clarify decision —
but no Arabic resource file, locale route, or switcher UI is added.

**Rationale**: The dependency already exists and the approved design system mandates bilingual
copy platform-wide; wiring the mechanism now (with English-only content) means later features add
an `ar` resource file rather than retrofitting a translation system. This is the "minimally
preserve" option the plan brief asked to consider, chosen over "defer entirely" because the cost of
routing new copy through `t('key')` from day one is negligible and the cost of retrofitting it
later (across every later feature's copy) is not.

**Alternatives considered**: Leaving i18next completely uninitialized and writing plain hardcoded
English strings — rejected; would satisfy spec FR-021's "no locale routing" half but not its
"translation-ready... externalized copy" half, and risks a future agent concluding i18next is dead
weight and removing it, or duplicating a second solution.

---

## 11. RTL foundation: logical CSS properties + `dir` attribute proof, no routing

**Decision**: Foundation-introduced layouts use logical Tailwind utilities (`ps-*`/`pe-*`/`ms-*`/`me-*`,
`text-start`/`text-end`) instead of `pl-*`/`pr-*`/`text-left`/`text-right`. The FR-020 Hills-token
sample surface is the same surface exercised for SC-010 (rendered once with `dir="rtl"` and a
longer placeholder string, confirmed to hold layout). No `<html lang>` negotiation, no `/ar` route,
no switcher component.

**Rationale**: Directly implements the Clarify-resolved decision; reuses one real surface for two
proofs (FR-020 and SC-010) instead of building a second one.

---

## 12. Hills design tokens integration point: remap `globals.css` variable *values*, not structure

**Decision**: In `src/app/globals.css`, the `:root` and `.dark` blocks' variable **values** (not
variable **names** — `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--card`,
`--border`, `--ring`, etc. stay as-is, since every `components/ui/*` primitive already references
them via Tailwind's `@theme inline` mapping) are changed to reference the Hills Coffee palette from
`docs/claude-design/tokens/colors.css` (e.g., `--background` ← `--bg`/`--surface-page`, `--primary`
← `--primary` (`#173C32` forest), `--border` ← `--border` (`#D7C8AD`), `--ring`/focus ←
`--focus-ring`). The existing `.dark` class convention already wired by shadcn/Tailwind in this
repo is kept as the dark-mode trigger (rather than introducing Hills' `[data-theme="dark"]`
attribute convention as a second, competing mechanism) — the `.dark` block's values are set to the
Hills dark-theme values instead.

**Rationale**: This is the narrowest possible edit that makes FR-020 true for every existing
`components/ui/*` primitive at once (they already read these variable names), rather than
hand-patching individual components. It is exactly the kind of "design tokens" edit the plan brief
pre-approves for the otherwise-locked `globals.css` (§1). Fonts (Benito/Manrope from
`docs/claude-design/tokens/fonts.css`) are wired the same way the existing Geist fonts are (via
`next/font` where possible, or `@font-face` if local files are required) — this feature loads the
font files needed for the one proof surface; it does not attempt full typographic system rollout.

**Alternatives considered**: Adopting the Hills `[data-theme]` attribute convention wholesale and
switching `components.json`/Tailwind's dark-mode strategy to attribute-based — rejected as a larger,
riskier change to existing dark-mode wiring than this foundation feature needs; a future
design-system feature can revisit this if a real conflict surfaces.

---

## 13. Component organization: no new domain folders unless a component needs one

**Decision**: The FR-012 Server Action's minimal settings form and the FR-020 Hills-token proof
component are placed under the route that uses them (`app/dashboard/settings/`) using
`components/ui/*` primitives directly; no new `components/dashboard/` or `components/foundation/`
directory is created merely to have one. If a genuinely reusable, non-route-specific piece emerges
(e.g., a shared `AppShell` nav frame used by both `/dashboard` and `/dashboard-admin`), it lives in
`components/layout/` — the one new domain folder this feature actually needs, created only when
that shared component is written.

**Rationale**: Directly satisfies FR-019 ("introduced only when this feature actually adds a
component that needs one, not created speculatively").

---

## 14. Environment contract (no changes to existing variable names)

**Decision**: The environment contract documents exactly the four variables already present in
`.env.local` (browser-safe: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`NEXT_PUBLIC_SITE_URL`; server-only: `SUPABASE_SERVICE_ROLE_KEY`, used exclusively by
`scripts/seed-test-fixtures.ts`, never imported by any file under `src/app/`, `components/`, or
`lib/supabase/{client,server}.ts`). No Redis/Upstash variable is added. A checked-in
`.env.example` (placeholder values only, e.g., `your-project.supabase.co`) is added since none
currently exists, so a future agent has a documented template without needing to read `.env.local`.

**Rationale**: Satisfies FR-025/FR-028 and gives a concrete, checked-in artifact (`.env.example`)
future agents can diff their own `.env.local` against.

---

## 15. Error/loading/empty-state foundation: Next.js route-segment conventions

**Decision**: Use Next's native file conventions — `error.tsx` (recoverable/unexpected error
boundary), `loading.tsx` (loading state), and a shared `components/ui/` (or a single new
`components/layout/state-screen.tsx`, reusing the naming the design system's own component
inventory already anticipates as `StateScreen`) for unauthorized/forbidden/not-found/empty,
parameterized by a `kind` prop — applied at the `/dashboard` and `/dashboard-admin` route-group
roots. This is the one new shared component this feature is likely to need (see §13).

**Rationale**: Reuses Next's own segment-level conventions (no custom error-boundary machinery to
invent) plus one small shared component named consistently with the already-approved Hills design
system component inventory (`docs/claude-design/readme.md` lists `StateScreen` as exactly this:
"the guide lists Unauthorized / Suspended / Pending review as required states; this is their
shared full-page shell").

---

## Summary of dependencies to add (dev-only unless noted)

| Package | Scope | Reason |
|---|---|---|
| `vitest` | dev | Test runner (§8) |
| `@vitejs/plugin-react` | dev | Vitest React support (§8) |
| `jsdom` | dev | DOM environment for the one rendered-component test (§8) |
| `@testing-library/react` | dev | Render/query the FR-020 proof component (§8) |
| `@testing-library/dom` | dev | RTL peer dependency (§8) |
| `vite-tsconfig-paths` | dev | Resolve the existing `@/*` path alias inside Vitest (§8) |
| `tsx` (or equivalent) | dev | Run `scripts/seed-test-fixtures.ts` (§9), only if not already satisfiable by an existing script runner |

No production dependency is added. No Redis/Upstash/external cache package is added (Constitution
Principle XI; FR-014; SC-009).
