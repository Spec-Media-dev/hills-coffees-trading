# Feature Specification: Platform Foundation

**Feature Branch**: `001-platform-foundation`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Create the first implementation feature specification for 001-platform-foundation — establish the reliable application foundation (locked root architecture, three-surface separation, server-first auth/authorization, Supabase integration, Next.js-native caching, validation, design-system, Server Action contract, error/state handling, environment configuration, security, testing, accessibility, and multi-agent continuity) on which all later Hills Coffee feature specs will be implemented, without implementing the complete business product."

## Repository Findings Surfaced During Inspection

These are material observations from inspecting the repository against the Constitution's source-of-truth order. They do not block this specification but MUST be tracked, since resolving them may affect later specs.

- **RESOLVED (was: path mismatch)**: at Specify time, the SRS lived at `docs/requirments/Hills-Coffee-SRS-v1.md` (missing "e") while the Constitution referenced `docs/requirements/...`. As of this Clarify pass, the file has been moved/corrected to `docs/requirements/Hills-Coffee-SRS-v1.md`, matching the Constitution and `docs/database/README.md`. No further action needed.
- **RESOLVED (was: design-guidance file empty)**: at Specify time, `docs/design-guidance/Hills-Coffee-Website-Recommendations.md` was 0 bytes. As of this Clarify pass, it contains real content (positioning, customer journey, section-by-section guidance, source-priority statement) and is internally consistent with the Constitution's source-of-truth order. No further action needed.
- **`docs/claude-design/readme.md` is empty**; the equivalent content lives in `docs/claude-design/SKILL.md` and the design tokens/guidelines/components under the same directory are intact and usable.
- **The approved database baseline (`database-schema-report.json`, generated 2026-09-07) currently defines zero Supabase Storage buckets** (`storage_buckets: []`). Controlled private-document access (KYB documents, payment proofs, invoices) therefore has no bucket to attach policies to yet. This foundation defines the *pattern* for controlled document access; provisioning actual buckets/policies is a database-baseline change and is out of scope here (see Constitution Principle III).
- **`docs/claude-design/readme.md`'s design-system description** ("four access states and no combined role: Guest, Buyer, Seller, Admin") reads as though Buyer and Seller are mutually exclusive roles. Per Constitution Principle VI and the SRS, Seller is an **additive capability** on top of Buyer (`can_buy=true, can_sell=true`), not a separate exclusive role, and one member portal serves both. Per the Constitution's source-priority order, the SRS/database model governs; the design system's phrasing does not create a second, conflicting authorization model — it describes the visual/copy states designers should account for, not the permission model.
- **Root files are confirmed untouched**: `src/app/page.tsx` and `src/app/layout.tsx` are still the unmodified `create-next-app` scaffold (default Geist fonts, "Create Next App" placeholder copy/links). This confirms they have not yet been branded, which this foundation feature does not change (see Constitution Principle IV — locked in place).
- **No test runner is installed or configured** (`package.json` has no test script, no Vitest/Jest/Playwright dependency). Type-checking (`tsc` via `next build`) and linting (`eslint`) are available today; automated test execution is not.
- **Next.js 16 renames `middleware.ts` to `proxy.ts`** and explicitly documents that this mechanism is for optimistic, request-shaping checks only — "it should not be used as a full session management or authorization solution." This is directly relevant to the authorization foundation below: request-boundary checks may use it for UX redirects, but authoritative authorization must happen in Server Components/Server Actions/Route Handlers on every request, backed by RLS.

## Clarifications

### Session 2026-09-07

- Q: The repo already has i18next/react-i18next installed and the approved design system requires bilingual English/Arabic, RTL-ready screens, but locale routing was not mentioned in this feature's scope — how should the foundation handle it? → A: Keep routes single-locale for now (no `/en`/`/ar` prefix or locale negotiation), but require all foundation layouts, typography, and components to be RTL-safe and translation-ready (logical CSS properties, no hardcoded LTR assumptions, externalized copy) from the start. No locale switcher ships in this feature.
- Q: Story 4/FR-015 require at least one real public read proven under Next.js-native caching, and the approved database has real public catalog tables (origins, coffees, coffee_types) — should the cache-proof page read from one of those real catalog tables, or use a deliberately non-catalog placeholder read? → A: Use a deliberately non-business placeholder read (e.g., a trivial "platform status"/foundation-health style value) — never `origins`/`coffees`/`coffee_types` — so the cache-proof page can't be mistaken for, or later reused as, the start of the actual public catalog feature (002-public-website).
- Q: Story 2's acceptance scenarios and FR-029's authorization-negative test rely on signing in as accounts with known organization/capability/role state — should 001 itself own a disposable seed/fixture mechanism for these test identities, or assume such accounts already exist? → A: 001 must include a documented, reproducible seed/fixture mechanism (script or documented steps) that creates and tears down its own isolated test organization(s) and user(s) with known capability/role values in the same Supabase project used for development, so any future agent can run the authorization tests from a clean environment.

## User Scenarios & Testing *(mandatory)*

<!--
  This is a platform/engineering foundation feature, not an end-user business feature.
  "Users" below are the people who depend on the foundation being correct: a future
  coding agent extending the platform, and the end visitors/members/staff who experience
  its security and reliability guarantees even though no business screens exist yet.
  Each story is independently testable and independently valuable on its own.
-->

### Platform Story 1 - Locked Root & Three-Surface Boundary Holds Under Direct Access (Priority: P1)

A visitor, a signed-in member, and an operations staff member each try to reach content on
the Public Website, Member Portal, and Operations Console. Regardless of what any client-side
code shows or hides, each surface only serves the content that visitor is actually authorized
to see, and the existing homepage keeps working exactly as it does today.

**Why this priority**: This is the platform's core trust boundary (Constitution Principles IV,
V, VIII). If a visitor can reach member or admin content by direct navigation, or if the
locked root files are disturbed, every later feature inherits a broken foundation.

**Independent Test**: With no code editing beyond this feature's own changes, navigate directly
(including with JavaScript disabled) to `/`, `/dashboard`, and `/dashboard-admin` as an
anonymous visitor. `/` renders the existing homepage unchanged. `/dashboard` and
`/dashboard-admin` refuse to render any protected content and instead show a safe
unauthorized/sign-in state, enforced by the server, not hidden by client script.

**Acceptance Scenarios**:

1. **Given** an anonymous visitor with no session, **When** they request `/`, **Then** the
   existing homepage renders exactly as before this feature (same root `page.tsx`/`layout.tsx`,
   same route).
2. **Given** an anonymous visitor with no session, **When** they request `/dashboard` or any
   path under it, **Then** the server responds with a safe unauthorized/sign-in state before any
   protected data is fetched or rendered — never a flash of protected content.
3. **Given** an anonymous visitor with no session, **When** they request `/dashboard-admin` or
   any path under it, **Then** the server responds with a safe unauthorized state, independently
   of whether `/dashboard` authorization passed.
4. **Given** a signed-in member with no operational role, **When** they request
   `/dashboard-admin`, **Then** the server denies access — member authentication alone never
   grants operations-console access.
5. **Given** any of the three surfaces, **When** their route trees are inspected, **Then**
   `src/app/page.tsx`, `src/app/layout.tsx`, and `src/app/globals.css` remain at their current
   paths, unmoved and not wrapped in a new route group.

---

### Platform Story 2 - Server-Resolved Identity, Membership, and Capability (Priority: P1)

A signed-in user's authentication state, organization membership, Buyer/Seller capability, and
(for staff) operational role are correctly and safely resolved on the server for every request,
from the approved Supabase project — never assumed from client state.

**Why this priority**: Every later feature (marketplace, checkout, admin workflows) depends on
this resolution being correct and safe by default (Constitution Principles VI, VIII, IX). Without
it, later features would each reinvent authorization, inconsistently.

**Independent Test**: Using a seeded test account with a known organization and known
`can_buy`/`can_sell`/operational-role state in the approved Supabase project, sign in and confirm
that server-rendered navigation and a sample protected Server Action both reflect that account's
real capability — and that capability lost mid-session (e.g., an organization suspended between
requests) is re-checked on the very next request rather than cached from sign-in time.

> **Resolved 2026-09-07 (Clarify)**: this feature MUST own a documented, reproducible seed/fixture
> mechanism that creates (and can tear down) its own isolated test organization(s) and user(s)
> with known `can_buy`/`can_sell`/operational-role values in the same Supabase project used for
> development — this story does not depend on hand-provisioned, undocumented accounts. See FR-029a
> and Assumptions.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose organization has `can_sell = false`, **When** they view the
   Member Portal, **Then** no seller-only navigation, data, or action is reachable — including by
   directly invoking a seller-only Server Action.
2. **Given** a signed-in user whose organization has `can_sell = true`, **When** they view the
   Member Portal, **Then** seller-capable navigation is present in addition to buyer navigation
   (additive, not a separate application).
3. **Given** a signed-in staff account with the `WAREHOUSE` operational role only, **When** they
   attempt an action gated to `FINANCE`, **Then** the server rejects it, even if the UI for that
   action were somehow reachable.
4. **Given** a signed-in user whose organization is suspended after sign-in, **When** they make
   their next request, **Then** the server re-evaluates organization status from Supabase and
   denies protected access — no stale, session-cached authorization is honored.
5. **Given** any server-side capability check, **When** it is exercised, **Then** it relies on
   the approved database's own authorization functions/RLS (e.g., organization/role checks such as
   those already defined in the approved schema) rather than a parallel, hand-rolled rule set.

---

### Platform Story 3 - Safe Server Action Pattern Proven End-to-End (Priority: P2)

A reusable, documented pattern for a safe Server Action exists and is proven by one real, working
mutation — not a hypothetical example — so later features can copy a working pattern instead of
inventing their own.

**Why this priority**: Constitution Principle XII and this feature's Server Action contract
(input F) exist specifically so every later mutation looks the same and is safe by construction.
Proving it with one real mutation (rather than describing it only in prose) is what makes it
usable by a future agent without guesswork.

**Independent Test**: Trigger the sample Server Action as an authenticated, authorized user and
confirm it succeeds and its effect is visible; trigger it unauthenticated and confirm it is
rejected before any data changes; trigger it with invalid input and confirm it is rejected with a
safe, non-leaking error; confirm no privileged secret ever appears in a returned error or a log
line.

**Acceptance Scenarios**:

1. **Given** an authenticated, authorized user, **When** they invoke the sample Server Action with
   valid input, **Then** it validates, authenticates, authorizes, performs the change through a
   controlled data-access call, and the change is observably reflected afterward.
2. **Given** the same Server Action, **When** invoked without a valid session, **Then** it is
   rejected before touching data, with a safe, generic error.
3. **Given** the same Server Action, **When** invoked with input that fails validation, **Then**
   it is rejected with a field-level error and no partial effect occurs.
4. **Given** any rejection path above, **When** the response and any server logs are inspected,
   **Then** no service-role credential, token, or internal exception detail is exposed.

---

### Platform Story 4 - Deliberate, Safe Next.js Caching for Public Reads (Priority: P2)

A public, read-only page demonstrably uses Next.js's own caching/revalidation instead of any
external cache, updates within a documented and bounded delay after its underlying data changes,
and no private or transactional data ever reaches a publicly shared cache entry.

**Why this priority**: Constitution Principle XI locks in "no external cache infrastructure" as
the MVP position; this story is what proves the Next.js-native approach actually works safely
before any later feature leans on it (Constitution Principle XI; input F).

**Independent Test**: Load a cached public page twice in quick succession and confirm the second
response is served from cache (observably, e.g., unchanged content despite an intervening data
edit); trigger the documented revalidation path; confirm the page reflects the change within the
stated bound. Separately, confirm that no route serving member- or admin-only data is ever put
behind the same public/shared cache mechanism.

> **Resolved 2026-09-07 (Clarify)**: the cached read this story proves MUST be a deliberately
> non-business placeholder value (e.g., a trivial "platform status"/foundation-health style read),
> never a real catalog table (`origins`, `coffees`, `coffee_types`, or similar). This keeps the
> proof from being mistaken for, or later reused as, the start of the actual public catalog
> feature (002-public-website) — see Assumptions.

**Acceptance Scenarios**:

1. **Given** a public catalog-style read is cached, **When** the underlying data changes and the
   documented revalidation path is triggered, **Then** the public page reflects the change within
   the documented bound, not indefinitely stale.
2. **Given** the same cached public read, **When** no revalidation has been triggered, **Then**
   repeated requests are served without re-querying the database on every single request.
3. **Given** any private or transactional route (session-scoped, org-scoped, or
   authorization-sensitive), **When** its caching behavior is inspected, **Then** it is never
   served from a cache shared across different users/sessions, and a transactional action (e.g., a
   checkout-style write) always performs a fresh authoritative database check regardless of any
   cached read shown beforehand.
4. **Given** Redis/Upstash or any other external cache dependency, **When** the foundation's
   configuration and dependencies are inspected, **Then** none is present.

---

### Platform Story 5 - Hills Design Tokens Applied, Not Default shadcn (Priority: P3)

At least one real, rendered UI surface in the foundation visibly uses the Hills Coffee token
system (color, type, spacing, radii) from `docs/claude-design/`, proving shadcn primitives have
been adapted to the brand rather than left in their default state, and that RTL/translation
readiness is real rather than assumed.

**Why this priority**: Constitution Principle XIII requires the Hills identity to drive shadcn
customization, not the reverse. Proving it once, correctly, gives later features a working
reference instead of a rule they have to interpret from scratch.

**Independent Test**: Render the sample surface and visually/structurally confirm it uses Hills
tokens (not default shadcn neutral palette/typography); confirm the same surface renders
correctly with `dir="rtl"` applied and with a longer (placeholder Arabic-length) string, without
layout breakage, using logical CSS properties rather than hardcoded left/right.

**Acceptance Scenarios**:

1. **Given** a shared `components/ui/` primitive is used anywhere in the foundation, **When** it
   is rendered, **Then** its visible styling comes from Hills design tokens, not shadcn's
   published defaults.
2. **Given** any foundation layout or component, **When** rendered with `dir="rtl"`, **Then** its
   layout mirrors correctly using logical properties (no visual breakage from hardcoded
   left/right).
3. **Given** any foundation-introduced domain component directory, **When** the repository is
   inspected, **Then** it exists only because a real component needed it — no empty placeholder
   domain folders were created speculatively.
4. **Given** `prefers-reduced-motion` is enabled, **When** any foundation-introduced animation
   runs, **Then** it collapses to effectively no motion.

---

### Platform Story 6 - A New Agent Can Verify and Extend the Foundation Unassisted (Priority: P3)

A coding agent with no access to this conversation can read repository artifacts alone, run a
documented set of verification commands, and learn the conventions needed to safely add one more
protected route or Server Action without inventing new patterns.

**Why this priority**: This is the Constitution's Multi-Agent Continuity requirement made
concrete (Principle XV; Multi-Agent Continuity & Handoff). A foundation nobody can safely extend
without tribal knowledge has failed its actual purpose.

**Independent Test**: Starting from a clean checkout and only the repository's own files (no
chat history), locate the documented conventions, run the documented verification commands
(lint, type-check, build, and whatever automated tests exist), and get a clear, truthful pass/fail
signal — with no test claimed to exist that does not actually exist.

**Acceptance Scenarios**:

1. **Given** only the repository's committed files, **When** a new agent looks for how to add a
   protected route or a safe Server Action, **Then** durable documentation (not chat history)
   explains the pattern, pointing at the real example from Platform Story 3.
2. **Given** the documented verification commands, **When** they are run in sequence, **Then**
   linting, type-checking, and production build each produce a clear pass/fail result.
3. **Given** the documentation describes an automated test suite, **When** the suite is run,
   **Then** it actually exists and executes — no test is described that isn't real.
4. **Given** the repository findings surfaced during this feature's inspection (path mismatch,
   empty design-guidance file), **When** a new agent reads the foundation's documentation,
   **Then** these known issues are recorded somewhere durable so the agent isn't surprised by
   them.

### Edge Cases

- What happens when a signed-in user's session cookie is valid but the underlying Supabase
  session has expired or been revoked? The server must treat this as unauthenticated, not throw
  an unhandled error.
- What happens when the application-layer check believes an action is authorized but the
  database's RLS policy independently rejects it? The rejection must surface as a safe "not
  authorized"/"not found" outcome, never a raw database error or stack trace.
- What happens when a required environment variable (Supabase URL, publishable key, service-role
  key, site URL) is missing at startup? The application must fail clearly and immediately in a
  way a developer can diagnose, never silently run with an undefined/broken client.
- What happens when a user attempts to invoke a Member Portal or Operations Console Server Action
  directly (bypassing the UI entirely, e.g., via a raw request) without a session? It must be
  rejected identically to the UI-guarded path — the UI is never the only enforcement point.
- What happens when an organization has `can_sell` revoked after being granted? On the very next
  request, seller-only navigation and actions must disappear/reject — not persist until the
  session ends.
- What happens when a public page's cache is served but the revalidation path is never triggered?
  The page must still eventually be safe to serve (bounded staleness, not permanently wrong data
  for reference-price-like content) per the documented cache policy, not an indefinite stale cache
  with no ceiling.
- What happens when a document/file-access pattern is exercised before any Supabase Storage
  bucket exists in the approved database baseline (today: zero buckets)? The foundation's access
  pattern must be defined so that adding a bucket later requires no architecture change — but this
  feature does not fabricate a working bucket.
- What happens when the `/dashboard-admin` operational-role check and the `/dashboard`
  membership check are both reachable from the same signed-in identity? They must be evaluated
  completely independently — passing one must never imply the other.
- What happens when RTL (`dir="rtl"`) is applied to a foundation layout without any Arabic
  content actually being supplied yet? Layout and spacing must still hold correctly using logical
  properties, even though no translated copy ships in this feature.
- What happens when `prefers-reduced-motion` is set and a foundation-introduced Motion/GSAP
  interaction would otherwise animate? The interaction must still complete correctly, just without
  motion.

## Requirements *(mandatory)*

### Functional Requirements

**Root architecture & surfaces**

- **FR-001**: The system MUST keep `src/app/page.tsx`, `src/app/layout.tsx`, and
  `src/app/globals.css` at their current paths and structural role (not relocated, not wrapped in
  a new route group, still the root for route `/`). This does not forbid narrow, unavoidable
  foundation-level edits to `layout.tsx` (e.g., adding a session/auth context provider, an
  `<html>` RTL-readiness attribute, or foundation metadata) — it forbids moving the files,
  changing what route they serve, or using this feature to implement the actual homepage content/
  visual design (that remains 002-public-website's scope).
- **FR-002**: The system MUST expose exactly three route-level application surfaces: the Public
  Website at `/`, the Member Portal rooted at `/dashboard`, and the Operations/Admin Console
  rooted at `/dashboard-admin`, each with its own layout and navigation shell.
- **FR-003**: The Member Portal MUST be a single application serving both Buyer and Seller
  organizations, where Seller-specific navigation/modules appear only additively when the signed-in
  organization's `can_sell` capability is approved — the system MUST NOT implement Buyer and
  Seller as separate applications.
- **FR-004**: The Operations/Admin Console MUST be a separate protected application area from the
  Member Portal, with its own layout, navigation, and authorization guards, structured to support
  role-sensitive navigation for `SUPER_ADMIN`, `ADMIN`, `COMPLIANCE`, `WAREHOUSE`, `FINANCE`, and
  `AUDITOR` without granting any of them access by default to another role's area.

**Server-side authentication & authorization**

- **FR-005**: The system MUST resolve, on the server and on every request, whether the requester
  is an anonymous visitor, an authenticated user, and — if authenticated — their organization
  membership, approved-member status, Buyer/Seller capability, and (for staff) operational role,
  sourced from the approved Supabase project.
- **FR-006**: The system MUST NOT treat any client-side state (hidden UI, disabled buttons, route
  visibility, React conditionals) as an authorization decision; every protected route and Server
  Action MUST independently re-verify authorization on the server for that specific request.
- **FR-007**: Where a request-boundary mechanism (Next.js Proxy) is used, it MUST be limited to
  optimistic, UX-only checks (e.g., redirecting an obviously-anonymous visitor away from a
  protected shell for a faster experience); it MUST NOT be relied upon as the authoritative
  authorization boundary — that responsibility stays in Server Components, Server Actions, and
  Route Handlers, backed by RLS.
- **FR-008**: Authorization decisions MUST rely on the approved database's own authorization
  surface (its RLS policies and authorization functions) rather than a duplicated, hand-rolled
  rule set maintained only in application code.
- **FR-009**: The system MUST NOT implement the full KYB review, onboarding, or membership
  approval business workflow in this feature; it MUST provide only the reusable session,
  membership, and capability-resolution foundation those later features will build on.
- **FR-010**: The system MUST provide a minimal, real sign-in/sign-out capability (not a full
  onboarding/registration/password-reset experience) sufficient to exercise and verify the
  anonymous-vs-authenticated boundary end-to-end.

**Server Action / mutation contract**

- **FR-011**: Every sensitive Server Action MUST, in order: validate input, authenticate the
  requester, authorize the requester (organization/role/capability/state as relevant), perform the
  change only through a controlled data-access call, handle expected failures safely, return a
  safe application-level error on failure, and trigger any relevant cache revalidation on success.
- **FR-012**: The system MUST include at least one real, working Server Action that demonstrates
  the full contract in FR-011 end-to-end, rather than describing the contract only in
  documentation. **Resolved 2026-09-07 (Clarify)**: the approved database already exposes a
  safe, self-scoped candidate for this proof — `update_my_profile` (updates only the caller's own
  `profiles` row: `full_name`, `phone`, `company_name`, `avatar_path`; rejects when unauthenticated
  or blocked). The sample Server Action MUST use this function (or an equally self-scoped,
  non-commercial approved function) and MUST NOT touch inventory, listings, orders, payments,
  settlement, or KYB state.
- **FR-013**: No Server Action or its error responses MUST ever expose a service-role credential,
  raw database error, or other internal implementation detail to the caller.

**Caching**

- **FR-014**: The system MUST NOT introduce Redis, Upstash, or any other external cache
  infrastructure; caching MUST rely solely on Next.js's own native caching and revalidation
  mechanisms layered on the approved Supabase/PostgreSQL baseline.
- **FR-015**: The system MUST demonstrate, with at least one real public read, safe use of
  Next.js-native caching with a documented, bounded revalidation path. **Resolved 2026-09-07
  (Clarify)**: this read MUST be a deliberately non-business placeholder value (e.g., a trivial
  "platform status"/foundation-health style read) — it MUST NOT read from a real catalog table
  (`origins`, `coffees`, `coffee_types`, or similar), so the proof cannot be mistaken for, or
  later reused as, the start of the actual public catalog feature (002-public-website).
- **FR-016**: The system MUST NOT place any private, member-specific, or transactional route or
  data behind a cache mechanism shared across different users or sessions.
- **FR-017**: Every transactional Server Action MUST perform a fresh, authoritative database
  check at execution time regardless of any cached read that may have been shown to the user
  beforehand.

**Validation**

- **FR-018**: The system MUST establish and demonstrate, with the sample Server Action from
  FR-012, the layered validation pattern: client-side validation (Zod + React Hook Form) for user
  experience, server-side validation (Zod) at the Server Action boundary as the enforced gate, and
  database constraints as the final backstop — with server/database validation never bypassable
  by omitting client-side validation.

**Design system & component organization**

- **FR-019**: Shared, generic UI primitives MUST remain under `components/ui/`; new domain-specific
  component directories MUST be introduced only when this feature actually adds a component that
  needs one, not created speculatively to match a proposed folder tree.
- **FR-020**: At least one real, rendered component in this feature MUST visibly use the Hills
  Coffee design tokens (`docs/claude-design/`) for color, type, spacing, and radii rather than
  shadcn's published default styling.
- **FR-021**: All foundation-introduced layouts and components MUST be built RTL-safe and
  translation-ready — using logical CSS properties instead of hardcoded left/right, and externalized
  copy instead of inline hardcoded strings — without shipping locale routing, a locale switcher, or
  any non-English copy in this feature.
- **FR-022**: Any animation introduced by this feature (Motion/GSAP/Lenis) MUST be purposeful,
  MUST respect `prefers-reduced-motion` by collapsing to no motion, and MUST NOT be used to build
  a cinematic sequence merely because the libraries are installed.

**Error, loading, and state handling**

- **FR-023**: The system MUST provide a common, reusable foundation for at least these
  application states: loading, empty, recoverable error, unexpected error, unauthorized,
  forbidden, and not-found — usable by all three surfaces.
- **FR-024**: Domain-specific states (e.g., suspended, rejected, reserved, expired, partial fill,
  settlement state) are explicitly out of scope for this feature but MUST be able to build on the
  common foundation from FR-023 without needing a parallel state-handling system.

**Environment & security**

- **FR-025**: The system MUST define and document a clear contract distinguishing browser-safe
  (`NEXT_PUBLIC_*`) environment variables from server-only secrets, matching the variables already
  present in this environment (Supabase URL, Supabase publishable key, Supabase service-role key,
  site URL), and MUST NOT introduce any Redis/Upstash environment variable.
- **FR-026**: The Supabase service-role key MUST never be referenced from any browser-executed
  code path. **Resolved 2026-09-07 (Clarify)**: this feature's own data access (session/sign-in/
  sign-out, capability/role resolution, and the FR-012 sample Server Action) MUST use the
  RLS-preserving, user-scoped Supabase client — none of the foundation's own functionality
  requires the service-role key. The service-role key remains configured (per FR-025) for future
  features that explicitly justify privileged, narrowly-scoped, server-only use; this feature does
  not establish a default service-role data-access path.
- **FR-027**: No password, access/refresh token, service-role key, or other sensitive value MUST
  ever appear in an application log line introduced by this feature.
- **FR-028**: The environment-variable contract MUST be structured so a future integration (e.g.,
  a payment provider) can be added by adding new variables, without restructuring existing
  application architecture.

**Testing & verification**

- **FR-029**: The system MUST establish a working, runnable automated test setup (previously
  absent from this repository) and MUST include at least one real authorization-negative test that
  proves an unauthenticated or unauthorized request is actually rejected by the server — not
  merely asserted in documentation. This proof MUST exercise the real protected server logic
  (route/Server Component/Server Action) directly; a full browser/E2E harness is not required to
  satisfy this requirement.
- **FR-029a**: The system MUST include a documented, reproducible seed/fixture mechanism (a script
  or documented steps) that creates — and can tear down — its own isolated test organization(s)
  and user(s) with known `can_buy`/`can_sell`/operational-role values in the same Supabase project
  used for development, so the authorization tests in FR-029 and the positive-authorization
  scenarios in Platform Story 2 are runnable from a clean environment by any future agent, without
  depending on hand-provisioned, undocumented accounts. **Resolved 2026-09-07 (Clarify)**.
- **FR-030**: The system MUST document the exact commands to run linting, type-checking, a
  production build, and the automated test suite, and these commands MUST actually work as
  documented.

**Continuity documentation**

- **FR-031**: The system MUST record, in durable repository documentation (not this conversation),
  any convention introduced by this feature that a future agent could not safely infer from code
  or configuration alone (e.g., how to add a protected route, how to write a safe Server Action,
  the environment-variable contract, the caching/revalidation policy).
- **FR-032**: The system MUST NOT duplicate documentation already owned by the Constitution or the
  authoritative `docs/` sources; it MUST reference them instead of restating them.
- **FR-033**: The repository findings surfaced during this feature's inspection (zero Storage
  buckets in the approved baseline; two previously-tracked findings — an SRS path mismatch and an
  empty design-guidance file — have since been resolved by the repository, see Repository
  Findings) MUST be recorded durably so a future agent is not surprised by the remaining ones.

### Key Entities *(foundation concepts, not new database tables)*

This feature does not change the approved database schema (Constitution Principle III). The
entities below are the *application-level concepts* the foundation must resolve and reuse
consistently; each maps to already-approved database state rather than inventing new storage.

- **Request Identity Context**: whether the current request is anonymous or authenticated;
  drives which of the three surfaces' guards apply. Resolved from Supabase Auth session state.
- **Organization Membership Context**: the authenticated user's organization, its approved-member
  status, and its `can_buy`/`can_sell` capability. Resolved from the approved `organizations` /
  `organization_members` data and the database's own capability-check functions.
- **Operational Role Context**: for staff accounts, which operational role(s) apply
  (`SUPER_ADMIN`, `ADMIN`, `COMPLIANCE`, `WAREHOUSE`, `FINANCE`, `AUDITOR`), used only to gate the
  Operations/Admin Console.
- **Cache Policy**: the documented mapping of which reads are safe to cache (public, non-private,
  slow-changing) versus never-cached (private, transactional), and the revalidation path for the
  former.
- **Server Action Contract**: the reusable, proven shape every sensitive mutation follows
  (validate → authenticate → authorize → controlled data access → safe failure → revalidate).
- **Environment Configuration Contract**: the documented set of browser-safe vs. server-only
  configuration values this foundation depends on, and the rule for adding more.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An anonymous visitor can never view Member Portal or Operations Console content,
  under direct navigation, with or without JavaScript enabled, in 100% of attempts.
- **SC-002**: A signed-in member without an approved Seller capability cannot reach any
  Seller-only navigation, view, or action, in 100% of attempts, including by bypassing the UI
  entirely.
- **SC-003**: A signed-in staff account can reach only the Operations/Admin Console areas that
  match its assigned operational role(s); no staff account reaches an unassigned area by default.
- **SC-004**: The existing public homepage remains reachable and visually/functionally unchanged
  from before this feature, verified by direct comparison of the route and root files.
- **SC-005**: A public, cached read reflects an underlying data change within the documented
  revalidation bound in every observed trial, and never serves stale reference data indefinitely.
- **SC-006**: Zero private or transactional data is ever observed in a cache entry reachable by a
  different user/session than the one that produced it.
- **SC-007**: A new contributor, using only committed repository documentation, can find and
  correctly follow the pattern for adding one new protected route and one new safe Server Action
  without asking a person, on the first attempt.
- **SC-008**: Running the documented verification commands (lint, type-check, build, test) from a
  clean checkout produces a truthful pass/fail result for each, with zero commands failing due to
  missing tooling.
- **SC-009**: Zero references to Redis, Upstash, or any other external cache/rate-limiting
  infrastructure exist in the foundation's dependencies or configuration.
- **SC-010**: A rendered foundation surface, when switched to `dir="rtl"` with placeholder
  longer-length text, shows zero layout breakage (no overlapping or clipped content) without any
  code change.

## Assumptions

- **Live Supabase project reuse**: this feature builds against the already-provisioned Supabase
  project referenced by the existing `.env.local` values (URL, publishable key, service-role key,
  site URL) rather than a newly created project, since the approved database baseline is already
  live against it (schema report generated 2026-09-07, audit PASS with 0 issues).
- **Minimal real sign-in is in scope; full onboarding is not**: per the feature input's own
  distinction between "authentication/authorization foundation" (in scope) and "full
  authentication/onboarding UX" and "full KYB process" (explicitly out of scope), this feature
  builds a minimal, real sign-in/sign-out mechanism sufficient to prove the authorization boundary,
  not a complete registration/password-reset/KYB experience.
- **Minimal protected route shells are in scope; full business screens are not**: per the feature
  input's instruction to "support later implementation of these surfaces without implementing all
  of their business screens now," this feature creates placeholder/"coming soon"-style protected
  pages under `/dashboard` and `/dashboard-admin` with working auth guards and navigation shells,
  not the actual business screens (marketplace, orders, KYB review, etc.) those routes will
  eventually hold.
- **i18n/RTL scope resolved via clarification**: per the 2026-09-07 clarification above, this
  feature ships single-locale (English) routing with RTL-safe, translation-ready layouts —
  no locale switcher, no locale-prefixed routes, and no Arabic copy in this feature.
- **Test framework choice is an implementation detail**: this specification requires a working,
  documented automated test setup (FR-029) but does not name a specific test runner — the choice
  belongs in `plan.md`, not this specification.
- **Storage buckets are not created by this feature**: since the approved database baseline
  currently defines zero Supabase Storage buckets, this feature defines the *pattern* for
  controlled private-document access but does not provision a working bucket; that is a database
  baseline change reserved for whichever feature first needs real document upload/download.
- **The SRS path mismatch and empty design-guidance file, tracked at Specify time, are now
  resolved**: both were fixed in the repository between the Specify and Clarify passes (see
  Repository Findings above) and required no action from this feature.
- **Rate limiting is deferred to specific later features**: per Constitution Principle XI and this
  feature's own scope (input section G), no rate-limiting infrastructure — global or
  endpoint-specific — is built in this foundation feature; it is introduced later, only where an
  actual abuse-prone endpoint (RFQ, contact form, etc.) is implemented.
- **Cache-proof uses placeholder data, not real catalog data** *(resolved via clarification)*:
  Platform Story 4 / FR-015's cached public read is a deliberately non-business placeholder (e.g.,
  a "platform status" style value), never `origins`/`coffees`/`coffee_types` or similar, so this
  feature cannot be mistaken for, or reused as, the start of 002-public-website's catalog.
- **This feature owns its own test seed/fixture mechanism** *(resolved via clarification)*:
  Platform Story 2 and FR-029/FR-029a's authorization tests depend on a documented, reproducible
  seed script/steps this feature creates — not on hand-provisioned, undocumented accounts assumed
  to already exist in the Supabase project.
- **The authorization-negative test proof is integration-level, not full browser/E2E**: FR-029 is
  satisfied by a test that exercises the real protected server logic (route/Server Component/
  Server Action) directly; a browser automation harness is not required for this feature.
- **The service-role key is configured but unused by this feature's own functionality**
  *(resolved via clarification)*: every piece of data access this feature introduces (sign-in/
  sign-out, capability/role resolution, the FR-012 sample mutation) goes through the RLS-preserving
  user-scoped Supabase client; the service-role key stays available in the environment contract
  (FR-025) for a future feature to justify, but this feature does not use it.
- **Locked root files may still receive narrow, unavoidable edits**: FR-001's "locked in place"
  constraint is about path, route, and structural role — not literal byte-for-byte content. Adding
  a session/auth provider, an RTL-readiness `<html>` attribute, or foundation metadata to
  `layout.tsx` is in scope; implementing the actual homepage visual/content design is not.
