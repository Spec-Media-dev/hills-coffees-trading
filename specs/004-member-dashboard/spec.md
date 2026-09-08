# Feature Specification: Member Dashboard

**Feature Directory**: `specs/004-member-dashboard`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Member Portal (`/dashboard`)
**Depends on**: 001 (guard, identity, states), 003 (eligibility, agreements, organization context)

## Purpose

Provide the **one** member application that both Buyer and Seller organizations use. This feature
owns the portal shell — navigation, layout, overview, organization/member context — and the
extension points into which 005–009 and 012 plug their modules. Seller capability is **additive**
inside this same application (Constitution VI): there is no separate seller app, and
`/buyer-dashboard` / `/seller-dashboard` must never exist.

The overview answers the four questions the approved design system says a member dashboard must
answer, in the member's own words: *what did I buy, what do I owe, where is it, what does it need
from me.*

## Scope

### In scope

- `/dashboard` shell: sidebar, topbar, responsive collapse, breadcrumbs, state screens.
- Capability-driven navigation: buyer modules always, seller modules only with approved `can_sell`.
- Member overview page composed from module-contributed summaries.
- Organization/member context display and acting-organization switching (surface for 003's logic).
- Account area entry (profile, organization, agreements, KYB status — screens owned by 003).
- Extension contract that 005–009/012 implement to register navigation entries and overview cards.
- Empty/loading/error/unauthorized/suspended states for the shell itself.

### Out of scope

- Inventory, listings, orders, payments, delivery, disputes business logic and screens (005–009, 012).
- The compliance/admin console (010).
- Authentication, KYB, agreements themselves (003).
- Notification delivery mechanics (012) — this feature only reserves the entry point.

## Actors

| Actor | Interest |
|---|---|
| **Buyer-organization member** | See purchases, obligations, custody, and required actions in one place. |
| **Seller-capable organization member** | The same, plus listings/sales/payouts entries — additively. |
| **Member without approved capability** | Understand exactly why trading is unavailable and what to do. |

## Business journeys owned

Owns the Buyer-flow stage **Member Dashboard** (between KYB approval and the marketplace), and the
Seller-flow entry point into listing management. Owns no transactional stage itself.

## Prioritized stories

### PS1 — One portal shell that adapts to real capability (P1)

A signed-in member of an approved organization reaches `/dashboard` and sees navigation reflecting
exactly what their organization is authorized to do.

**Why P1**: every later member feature mounts inside this shell.
**Independent test**: sign in as a buyer-only fixture and a buyer+seller fixture and compare
navigation; confirm the seller entries appear only for the latter and that a direct URL to a seller
route is refused for the former.

**Acceptance scenarios**

1. Given a `can_sell = false` organization, when the member views `/dashboard`, then no seller
   navigation entry renders **and** direct navigation to a seller route is refused server-side.
2. Given a `can_sell = true` organization, when the member views `/dashboard`, then seller entries
   appear in addition to (never instead of) buyer entries.
3. Given any member, when they inspect the URL space, then only `/dashboard/...` exists — no
   `/buyer-dashboard` or `/seller-dashboard` route is reachable.
4. Given capability is revoked between requests, when the member navigates next, then the seller
   entries disappear without sign-out.

### PS2 — An overview that answers the four member questions (P1)

The member lands on a summary that states what they bought, what they owe, where their coffee is,
and what needs their action.

**Why P1**: it is the portal's reason to exist and the anchor for every module.
**Independent test**: render the overview with seeded data from whichever modules exist, and with
none, and confirm both are honest and useful.

**Acceptance scenarios**

1. Given modules with data, when the overview renders, then each of the four questions has a
   corresponding, accurate summary.
2. Given no data at all, when the overview renders, then each area shows an honest empty state that
   explains what would appear there — not a zero-filled fake dashboard.
3. Given a module not yet implemented, when the overview renders, then that area is simply absent —
   never a placeholder that implies data exists.
4. Given any summary figure, when displayed, then it carries unit and currency where applicable
   (`USD 4.80 / kg`, `320 bags · 60kg`).

### PS3 — Actions the member must take are surfaced (P1)

Items requiring member action — unaccepted agreement, expiring KYB document, payment proof needed,
delivery decision needed — appear prominently with a direct route to resolve them.

**Why P1**: the design system's core content rule is "name what is missing" with a direct CTA.
**Independent test**: seed each actionable condition and confirm it appears with a specific label
and a working direct action.

**Acceptance scenarios**

1. Given an outstanding required action, when the overview renders, then it names the specific item
   and links directly to the step that resolves it.
2. Given no outstanding actions, when the overview renders, then the action area is empty rather
   than showing invented busywork.

### PS4 — Organization context is explicit (P2)

The member always knows which organization they are acting for, and can switch when they belong to
more than one.

**Why P2**: required for correctness once multi-membership exists, but rare in early operation.
**Independent test**: sign in as the two-organization fixture and confirm the acting organization is
displayed and switchable, and that switching changes what the portal shows.

**Acceptance scenarios**

1. Given a member of one organization, when they use the portal, then the acting organization is
   displayed without requiring a choice.
2. Given a member of two organizations, when they switch, then all portal data reflects the newly
   selected organization on the next request.

### PS5 — Ineligible members get truth, not a broken portal (P1)

A signed-in member whose organization is pending, under review, suspended or rejected sees a clear
state screen with the reason and next step — never a half-rendered dashboard.

**Why P1**: this is the most common non-happy path in early operation.
**Independent test**: sign in with each non-approved fixture and confirm the correct state screen.

**Acceptance scenarios**

1. Given a `PENDING_KYB` or `UNDER_REVIEW` organization, when the member opens `/dashboard`, then a
   status screen renders with the current stage and expected next step.
2. Given a `SUSPENDED` organization, when the member opens `/dashboard`, then a suspension screen
   renders and no trading module is reachable, by navigation or direct URL.

## Functional Requirements

- **FR-001**: There MUST be exactly one member application rooted at `/dashboard`; the system MUST
  NOT create `/buyer-dashboard`, `/seller-dashboard`, or any parallel member application.
- **FR-002**: Seller-specific navigation and modules MUST be additive on top of buyer navigation and
  MUST render only when the acting organization's `organization_can_sell()` is true.
- **FR-003**: Navigation visibility MUST NOT be the authorization boundary — every seller/buyer route
  MUST independently verify capability server-side (Constitution VIII).
- **FR-004**: Capability MUST be resolved per request through 003's eligibility layer (which delegates
  to the approved database functions); it MUST NOT be cached across requests or embedded in a token.
- **FR-005**: The shell MUST expose a documented **module registration contract** so 005–009/012 can
  contribute navigation entries and overview cards without editing the shell's internals.
- **FR-006**: The overview MUST compose only from registered module contributions; a module that does
  not exist MUST produce no placeholder.
- **FR-007**: All monetary and quantity values MUST render with unit and currency, using tabular
  figures, with reference codes in monospace, per the approved design system.
- **FR-008**: The shell MUST implement the approved dashboard layout (fixed sidebar, sticky topbar,
  tablet collapse to drawer, mobile card lists instead of heavy tables).
- **FR-009**: The shell MUST render the approved states — loading, empty, error, unauthorized,
  suspended, pending — reusing 001's state components.
- **FR-010**: The acting organization MUST be visible at all times and switchable when the member
  belongs to more than one; every module MUST receive it explicitly.
- **FR-011**: Outstanding member actions MUST be surfaced with the specific item named and a direct
  route to resolve it — never a generic "action required".
- **FR-012**: No private member data MUST be placed in a shared cache; portal reads are per-request or
  scoped to the acting organization with no cross-tenant key (Constitution XI).
- **FR-013**: All `/dashboard` routes MUST be excluded from search indexation.
- **FR-014**: All copy MUST be externalised and all layouts RTL-safe with logical CSS properties.
- **FR-015**: Client-side JavaScript MUST be limited to genuinely interactive elements; the shell and
  overview MUST render server-side by default.
- **FR-016**: The notification entry point MUST be reserved in the topbar but MUST NOT fabricate
  behaviour before 012 implements it.

## Security Requirements

- **SEC-001**: Every route under `/dashboard` inherits 001's guard and additionally verifies any
  capability it requires; no route relies on the shell having hidden a link.
- **SEC-002**: Module contributions MUST NOT be able to widen authorization — a registered module
  declares what it needs, and the shell/route verifies it server-side.
- **SEC-003**: No organization-scoped value may appear in a cache entry shared across organizations.
- **SEC-004**: No service-role usage anywhere in this feature.
- **SEC-005**: Overview summaries MUST NOT leak another organization's data through aggregate figures.

## Edge Cases

- Member belongs to zero organizations → 003's onboarding state, not a broken dashboard.
- Member's organization is approved but no agreements accepted → overview surfaces the agreement
  action and trading modules stay gated.
- Capability revoked mid-session → seller entries vanish on the next request; direct seller URL is
  refused.
- All modules unimplemented (early in the roadmap) → overview shows the account/status area only,
  honestly.
- Very large data volumes in a module summary → summaries must remain bounded queries, not full scans.
- Member on mobile → tables become card lists; the sidebar becomes a drawer; touch targets ≥ 44×44px.
- Two browser tabs with different acting organizations → each request carries its own acting
  organization; no cross-tab bleed.

## Success Criteria

- **SC-001**: A `can_sell = false` member can never reach a seller route, by navigation or direct URL,
  in 100% of attempts.
- **SC-002**: Capability changes are reflected within one request, with no sign-out required.
- **SC-003**: Zero routes exist outside `/dashboard` for member functionality.
- **SC-004**: Every overview figure displays unit/currency where applicable.
- **SC-005**: The portal renders correct, distinct states for pending, under-review, suspended and
  rejected organizations.
- **SC-006**: No shared cache entry contains organization-scoped data.
- **SC-007**: The shell and overview render fully with JavaScript disabled.

## Assumptions

- 003 provides the eligibility layer, acting-organization resolution and agreement gate; this feature
  consumes them rather than re-implementing.
- Module features (005–009, 012) will register into the contract this feature defines; until then the
  portal is intentionally sparse.
- The approved design system's dashboard layout (264px sidebar, sticky topbar, gold section labels,
  status badges with dot + label) is the visual target.

## Open items / blockers

- **DB-BLOCK-04** (from the capability map) affects FR-016: notifications have no member-facing
  "mark read" path. The topbar entry may be reserved, but no read-state behaviour can be built until
  that is resolved (owned by 012).
- Overview summary queries depend on modules that do not exist yet; their exact shape is finalised by
  each owning feature, not invented here.

## Dependencies

| Depends on | Why |
|---|---|
| 001-platform-foundation | `/dashboard` guard, identity, state components, tokens, i18n |
| 003-auth-membership-kyb | Eligibility layer, acting organization, agreement gate, account screens |
| 005–009, 012 | Register modules and overview contributions into this shell |
