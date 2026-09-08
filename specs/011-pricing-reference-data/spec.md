# Feature Specification: Pricing & Reference Data

**Feature Directory**: `specs/011-pricing-reference-data`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surfaces**: Public Website (`/`, via 002) + Member Portal (price context) + Admin
(`/dashboard-admin`, via 010)
**Depends on**: 001; consumed by 002 (public presentation), 006/007 (commercial price context),
010 (administration)

## Purpose

Keep the platform's **four different price concepts** permanently distinct, and present external
market data honestly — with source, unit, currency, timestamp, delay and licence status — or not at
all.

| Price type | What it is | Executable? |
|---|---|---|
| **Reference benchmark** | External Arabica/Robusta/ICO indicator with source, delay, timestamp, unit, currency | **No** — information only |
| **Hills commercial quote** | A price Hills offers for a defined product/quantity/term | Only within its quote rules |
| **Member listing price** | A seller's ask on a specific eligible physical lot (`coffee_offers.price_per_kg`) | Only inside the authorized workflow |
| **Executed trade price** | What was actually agreed, snapshotted on the order (`order_items.unit_price_per_kg`, `order_financials`) | Historical fact |

These must never be conflated in data, UI, copy or code (SRS §9, Appendix D #8).

## Scope

### In scope

- The reference-price domain layer: sources, observations, differentials, freshness/staleness.
- The presentation contract 002 consumes for public reference pricing.
- Disclosure rules: source, delay type, unit, currency, observation timestamp, time zone, and the
  "reference information, not an offer" statement.
- Staleness and failure behaviour (last-success timestamp; never fabricate; never present stale as
  current).
- Licence gating: only sources with `licence_status = 'APPROVED'` and `is_active` may be displayed.
- Specialty price-basis presentation: benchmark + differentials (`price_differentials`) so a user can
  understand the basis.
- Admin surfaces (via 010) for managing sources, observations and differentials.
- The naming/typing conventions that keep the four price types separate across the codebase.

### Out of scope

- Actually licensing market data (a business/legal gate, SRS §18).
- Automated ingestion scheduling (no approved scheduler — see Open items).
- Currency conversion/FX (no approved storage — see Open items).
- Hills quote issuance workflow (not modelled in the approved schema — see Open items).
- Listing/order pricing mechanics — 006/007 own those; this feature only enforces the conceptual
  separation.

## Actors

| Actor | Interest |
|---|---|
| **Public visitor** | See honest benchmark context with full disclosure. |
| **Member** | Understand price basis without confusing reference data with an executable price. |
| **Administrator** | Manage sources, observations and differentials; control licence status. |
| **Legal/compliance** (indirect) | Depend on redistribution rights being respected. |

## Business journeys owned

Supports every journey by supplying price *context* without ever becoming the executable price. Owns
no transactional stage.

## Prioritized stories

### PS1 — The four price types are structurally distinct (P1)

Code, types and UI keep reference, quote, listing and executed prices separate and unmistakable.

**Why P1**: conflation is an explicit SRS prohibition with commercial and legal consequences.
**Independent test**: inspect the type system — a reference price value cannot be passed where an
executable price is expected, and every rendered price carries its type.

**Acceptance scenarios**

1. Given the price types, when used in code, then they are distinct types (not interchangeable
   numbers), so a reference value cannot be substituted for an executable one.
2. Given any price rendered anywhere, when displayed, then its type is unambiguous to the reader.
3. Given a reference price, when displayed, then it is never labelled or styled as an offer, quote or
   executable price.

### PS2 — Reference prices are displayed with full disclosure or not at all (P1)

Every displayed benchmark carries source, unit, currency, observation timestamp, time zone, delay
context and the reference-only statement.

**Why P1**: SRS AC-06 is release-blocking.
**Independent test**: render a benchmark for an approved-licence source and assert all disclosure
elements; remove any one and assert the component refuses to render a bare number.

**Acceptance scenarios**

1. Given a displayed benchmark, when rendered, then source, raw unit, raw currency, observation
   timestamp, time zone and delay type all appear.
2. Given missing disclosure data, when rendering is attempted, then the value is withheld rather than
   shown without context.
3. Given `delay_type`, when displayed, then it is labelled honestly (`REAL_TIME` only where the
   licence permits; otherwise `DELAYED`/`DAILY`/`MANUAL`).

### PS3 — Unlicensed or inactive sources are never displayed (P1)

Only sources that are `is_active` and `licence_status = 'APPROVED'` reach any surface.

**Why P1**: displaying unlicensed market data is a legal exposure.
**Independent test**: seed sources in each licence status and confirm only approved+active ones are
readable and rendered.

**Acceptance scenarios**

1. Given a source with `licence_status` of `PENDING`, `RESTRICTED` or `DISABLED`, when any surface
   requests it, then no observation from it is returned or displayed.
2. Given a licence status changing to `RESTRICTED`, when the change is made, then the public surface
   stops showing it after revalidation.

### PS4 — Stale and failed feeds are explicit (P1)

When data is stale or unavailable, the surface says so and shows last-success context.

**Why P1**: PX-05 forbids silently presenting cached data as current.
**Independent test**: mark an observation stale and confirm the UI shows stale status and the last
successful timestamp, with no current-looking value.

**Acceptance scenarios**

1. Given `is_stale = true`, when rendered, then stale status and the last successful observation
   timestamp are shown.
2. Given no observation at all, when rendered, then the absence is stated; no value is fabricated or
   interpolated.
3. Given a cached page, when the underlying data is stale, then the cache never causes stale data to
   be presented as current.

### PS5 — Specialty price basis is understandable (P2)

Where differentials exist, the user can see benchmark + origin/quality/certification/crop/commercial
differentials rather than a single opaque number.

**Why P2**: valuable for credibility; depends on differential data existing.
**Independent test**: with seeded differentials, confirm the basis breakdown renders with each
component's type, amount, currency and unit.

**Acceptance scenarios**

1. Given active differentials, when displayed, then each shows its type, amount, currency, unit and
   effective period.
2. Given the breakdown, when rendered, then it is clearly labelled as a basis explanation, not an
   executable quote.

### PS6 — Administrators manage price data safely (P2)

Admins manage sources, observations and differentials; changes revalidate public presentation.

**Why P2**: needed to operate the feature, delivered through 010.
**Independent test**: as an admin, create a source and observation and confirm public visibility
after revalidation; as a non-admin, confirm refusal.

**Acceptance scenarios**

1. Given an administrator, when they manage price data, then it succeeds and public caches are
   revalidated.
2. Given a non-admin, when they attempt price data mutation, then it is refused.

## Functional Requirements

- **FR-001**: The codebase MUST represent the four price types as distinct, non-interchangeable types
  and MUST NOT define a generic shared "price" value used across categories.
- **FR-002**: Reference prices MUST only be read from sources where `is_active = true` and
  `licence_status = 'APPROVED'`.
- **FR-003**: Every displayed reference price MUST include source, raw unit, raw currency,
  observation timestamp, time zone, delay type and a reference-only disclosure; the presentation
  component MUST refuse to render a value without them.
- **FR-004**: The system MUST label data `REAL_TIME` only where the source's approved licence permits
  redistribution as such; otherwise `DELAYED`, `DAILY` or `MANUAL`.
- **FR-005**: Stale (`is_stale`) or absent data MUST be presented as such with last-success context;
  the system MUST NOT fabricate, interpolate, or present cached values as current.
- **FR-006**: Raw source observations (`raw_value`, `raw_unit`, `raw_currency`) MUST be preserved
  unchanged; any conversion MUST be auditable — and **because no FX/conversion storage exists in the
  approved baseline, conversions MUST NOT be performed** until that gap is resolved (see Open items).
- **FR-007**: Reference-price reads MAY be cached publicly (they are public, slow-changing data) using
  the `reference-prices` tag, and MUST be revalidated when sources/observations change.
- **FR-008**: Cached reference data MUST NOT be able to present stale data as current — freshness
  metadata travels with the value through the cache.
- **FR-009**: Reference prices MUST NOT appear anywhere that implies executability (checkout, order,
  listing price fields).
- **FR-010**: Differential presentation MUST show type, amount, currency, unit and effective period,
  labelled as basis explanation.
- **FR-011**: Administrative mutations MUST be `is_platform_admin()`-gated and delivered through 010's
  console, revalidating public tags.
- **FR-012**: No price ingestion integration may be added without an approved licence and an approved
  scheduling mechanism (see Open items).
- **FR-013**: Copy externalised; layouts RTL-safe; numerals/currency LTR-readable inside RTL layouts
  per the design system.

## Security Requirements

- **SEC-001**: Only public-safe price data may reach public surfaces; member/order pricing MUST never
  be rendered through the reference-price components.
- **SEC-002**: No service-role usage; public reads use the anonymous client under RLS.
- **SEC-003**: Licence status MUST be enforced server-side at the read layer, never only in the UI.
- **SEC-004**: Any future ingestion credential MUST be server-only and never exposed to the browser.

## Edge Cases

- A source's licence is revoked while a page is cached → revalidation removes it; the read layer
  refuses it regardless.
- Observation exists but its source is inactive → not returned.
- Multiple observations for one symbol → the most recent valid one is used, with its own timestamp.
- Differentials expire (`effective_until` in the past) → excluded from the basis breakdown.
- A member sees both a reference benchmark and a listing price on one screen → each is labelled with
  its type; they are never summed or compared as equivalents.
- No approved sources exist at all → surfaces state that reference pricing is unavailable rather than
  rendering an empty widget.

## Success Criteria

- **SC-001**: Zero code paths allow a reference price value to be used as an executable price.
- **SC-002**: 100% of displayed reference prices carry all required disclosure elements (AC-06).
- **SC-003**: Zero observations from non-approved-licence or inactive sources are ever displayed.
- **SC-004**: Stale or missing data is labelled as such in 100% of observed cases; zero fabricated
  values.
- **SC-005**: No currency conversion is performed anywhere while FX storage is unavailable.
- **SC-006**: Public price caches revalidate on administrative change.

## Assumptions

- `price_sources`, `price_observations` and `price_differentials` are the approved data model.
- Observations are populated administratively until a licensed, scheduled ingestion path is approved.
- 002 renders the public presentation; 010 provides administration; this feature owns the semantics.

## Open items / blockers

- **Market-data licensing (SRS §18, §12)**: redistribution rights are a Sprint 0 legal/vendor
  decision. Until a source's licence is approved, nothing from it may be displayed. This is enforced
  by FR-002 but the underlying business approval is external.
- **DB-OPEN-08 — no FX/conversion storage (NEW)**: PX-03 requires conversions (cents/lb → USD/MT →
  USD/kg) to be auditable with FX source, timestamp and rounding rules, but the approved schema has
  no FX/rate table and `price_observations` stores only the raw observation. Therefore **conversions
  cannot be performed auditably today**. Resolving this requires an approved database change; until
  then only raw source values are displayed.
- **No approved ingestion scheduler**: same infrastructure question as 007's hold-expiry sweep.
  Manual/administrative observation entry is the implementable path today.
- **Hills commercial quote is not modelled**: the SRS defines a distinct "Hills quote" price type, but
  the approved schema has no quote entity (orders reference `coffee_offers` prices). The RFQ→quote
  workflow therefore has no data model — recorded here because this feature owns the price-type
  taxonomy. Requires a product/database decision before a quote workflow can exist.

## Dependencies

| Depends on | Why |
|---|---|
| 001 | Caching conventions, Supabase client, design tokens |
| 002 | Renders the public reference-price presentation this feature defines |
| 010 | Provides the administrative surfaces for sources/observations/differentials |
| 006/007 | Must keep listing and executed prices distinct from reference data |
