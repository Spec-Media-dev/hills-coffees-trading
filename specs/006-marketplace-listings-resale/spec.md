# Feature Specification: Marketplace, Seller Listings & Resale

**Feature Directory**: `specs/006-marketplace-listings-resale`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surface**: Member Portal (`/dashboard/coffee`, `/dashboard/listings`, `/dashboard/sales`)
**Depends on**: 001, 003 (eligibility), 004 (module contract), 005 (inventory facts)

## Purpose

Operate the **private, permissioned** B2B marketplace: authorized members browse eligible listings
(Hills-sourced and member-resale), and seller-capable organizations list their own eligible,
Hills-origin, custody-held inventory for resale.

This is emphatically **not** a public exchange: no public order book, no anonymous matching, no
leverage, no futures, no short selling, no external stock (SRS MKT-06, Appendix D #1/#3).

## Scope

### In scope

- Private marketplace browse/search/filter for authorized members.
- Listing detail with the commercial and quality information the schema permits.
- Seller listing creation from eligible inventory (draft → review → published).
- Listing lifecycle presentation across all approved states.
- Seller eligibility enforcement (`organization_can_sell`, ownership, custody, unreserved quantity).
- Partial-fill and sold-out presentation as fills occur.
- Seller sales visibility (what sold, remaining quantity, fill history).
- Listing suspension effects (member-facing).
- Listing documents and sensory notes where permitted.

### Out of scope

- Compliance **review decisions** on listings (queue and decision UI) — 010.
- Order creation, checkout, reservation — 007 (via `checkout_order()`).
- Payment, settlement, title transfer, payouts — 008.
- Delivery — 009.
- Public exposure of any listing — forbidden entirely (SRS MKT-01, SEO-APP-02).
- Negotiated-offer/RFQ *within* the marketplace beyond what the approved schema supports — see Open
  items.

## Actors

| Actor | Interest |
|---|---|
| **Authorized buyer member** | Discover eligible listings and act on them within the approved workflow. |
| **Seller-capable member** | Turn owned, custody-held inventory into a live listing and track fills. |
| **Compliance operator** (adjacent) | Reviews/suspends listings in 010; this feature renders the outcome. |
| **Auditor** (adjacent) | Reads listings and status history as evidence. |

## Business journeys owned

Buyer flow: **Private Marketplace → select permitted listing** (hands to 007).
Seller flow: **eligible quantity → create resale listing → compliance review → publish →
partial-fill/sold-out updates** (fills produced by 007/008).

## Prioritized stories

### PS1 — Only authorized members see the marketplace (P1)

The marketplace and every listing are visible exclusively to active, authorized members.

**Why P1**: SRS AC-01 is release-blocking — unauthorized or suspended organizations must not view
private listings or execute any trade.
**Independent test**: attempt marketplace access as anonymous, as a signed-in member of a
`PENDING_KYB` org, and as a member of a `SUSPENDED` org — all refused server-side; an approved member
succeeds.

**Acceptance scenarios**

1. Given an anonymous visitor, when they request any marketplace route, then access is refused
   server-side and no listing data appears in the response.
2. Given a member of a non-approved or suspended organization, when they request the marketplace,
   then access is refused with the correct state screen.
3. Given an approved member, when they browse, then only listings with `is_visible = true` and status
   `PUBLISHED`/`PARTIALLY_FILLED` are returned.
4. Given any public route, when crawled or fetched, then zero listing data is reachable.

### PS2 — Browse and evaluate eligible listings (P1)

An authorized member searches/filters listings and opens a detail view with the commercial and
quality information needed to decide.

**Why P1**: the marketplace's core value.
**Independent test**: with seeded listings, confirm list/filter/detail render correct quantities,
price per kg with currency, and remaining availability.

**Acceptance scenarios**

1. Given published listings, when browsed, then each shows title, coffee/origin context, available
   quantity, price per kg with currency, and seller type (Hills or member) as permitted.
2. Given a `PARTIALLY_FILLED` listing, when displayed, then remaining quantity (listed − filled −
   reserved) is shown clearly and is the quantity a buyer may act on.
3. Given a `SOLD_OUT` or `SUSPENDED` listing, when reached directly, then it renders its state and
   offers no purchase action.
4. Given any listing figure, when a member acts on it, then the action re-validates authoritative
   availability in the database (advisory-UI rule).

### PS3 — Create a resale listing from eligible inventory (P1)

A seller-capable member selects owned, custody-held, unreserved quantity and creates a draft listing
that enters compliance review.

**Why P1**: the entire seller side depends on it.
**Independent test**: as a `can_sell = true` fixture with an eligible position, create a draft,
submit for review, and confirm status/history; as a `can_sell = false` fixture, confirm creation is
refused server-side.

**Acceptance scenarios**

1. Given `organization_can_sell()` is false, when the member attempts listing creation, then it is
   refused server-side regardless of UI state.
2. Given inventory not purchased through Hills (no `source_purchase_order_item_id`), when listing is
   attempted, then it is refused — MVP permits only Hills chain-of-custody stock (SRS §8.1).
3. Given quantity exceeding available (unreserved) quantity, when submitted, then it is refused with a
   specific message naming the available quantity.
4. Given a valid draft, when submitted for review, then status becomes `PENDING_REVIEW` and a status
   history row is recorded by the database.
5. Given inventory reserved for delivery, when listing is attempted against it, then it is refused
   (SRS DEL-01).

### PS4 — Listing lifecycle is honest end-to-end (P2)

Sellers and buyers see the true listing state at all times, using the approved vocabulary.

**Why P2**: needed for trust, but only after creation and browse exist.
**Independent test**: drive a seeded listing through each approved status and confirm both seller and
buyer views.

**Acceptance scenarios**

1. Given each of `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `PUBLISHED`, `PARTIALLY_FILLED`,
   `SUSPENDED`, `SOLD_OUT`, `ARCHIVED`, when viewed, then the exact approved label renders.
2. Given `REJECTED`, when the seller views it, then the compliance-recorded reason is shown with a
   route to remediate.
3. Given `SUSPENDED`, when any member views it, then no purchase action is offered and the state is
   explicit.
4. Given the `is_visible` invariant, when a listing is not `PUBLISHED`/`PARTIALLY_FILLED`, then it is
   never returned to a non-owning member.

### PS5 — Fills update the listing truthfully (P1)

As orders reserve and settle against a listing, remaining quantity, partial-fill state and sold-out
state reflect reality.

**Why P1**: double-selling protection is release-blocking (AC-02) and members must see the effect.
**Independent test**: reserve part of a listing via 007's checkout and confirm the listing shows the
reduced remaining quantity; settle it via 008 and confirm the filled quantity and state.

**Acceptance scenarios**

1. Given an active reservation against a listing, when displayed, then reserved quantity is excluded
   from what another buyer may act on.
2. Given a settled partial fill, when displayed, then `filled_quantity_kg` increases, remaining
   decreases, and the state becomes `PARTIALLY_FILLED`.
3. Given a listing fully filled, when displayed, then it becomes `SOLD_OUT` and offers no action.
4. Given a reservation that expires, when it releases, then the quantity returns to available exactly
   once.

### PS6 — Seller sees their sales (P2)

A seller-capable member sees their listings' commercial outcomes: what sold, to what extent, and
what remains.

**Why P2**: valuable but downstream of listing/fill mechanics.
**Independent test**: with seeded fills, confirm the sales view totals match the underlying order
items and ownership events.

**Acceptance scenarios**

1. Given fills against a seller's listings, when the sales view renders, then quantities and values
   reconcile to the underlying records with unit and currency.
2. Given a seller, when they view sales, then only their own organization's sales appear.

## Functional Requirements

- **FR-001**: Every marketplace route MUST verify `is_authorized_member()` (and organization status)
  server-side before returning any listing data; navigation visibility is never the gate.
- **FR-002**: Listing reads for buyers MUST return only rows the database's own policy permits
  (`is_visible = true`, status `PUBLISHED`/`PARTIALLY_FILLED`, not soft-deleted).
- **FR-003**: Listing data MUST NOT appear on any public route, in any public cache entry, in any
  sitemap, or in any structured data (SRS MKT-01, SEO-APP-01/02).
- **FR-004**: Marketplace reads MUST NOT be placed in a cache shared across organizations or users.
- **FR-005**: Listing creation MUST verify `organization_can_sell()` server-side.
- **FR-006**: Listing creation MUST verify, at publication time, that the quantity is owned by the
  seller, held in a Hills-approved warehouse, sourced from a Hills purchase
  (`source_purchase_order_item_id`), and free of reservations (SRS §8.1, MKT-02).
- **FR-007**: The application MUST NOT re-derive availability; eligible quantity comes from 005's
  read layer and the database's own columns.
- **FR-008**: Every listing state MUST render the approved vocabulary label; the application MUST NOT
  invent synonyms or intermediate states.
- **FR-009**: State transitions MUST be performed through permitted writes that the database's
  `validate_offer_transition` trigger accepts; the application MUST NOT attempt to bypass or
  pre-empt trigger logic.
- **FR-010**: Any quantity shown to a buyer MUST be advisory; the authoritative availability check
  happens in the database at execution time (007's `checkout_order()`).
- **FR-011**: Partial-fill and sold-out presentation MUST derive from `quantity_kg`,
  `reserved_quantity_kg` and `filled_quantity_kg` as stored — never from a UI-side tally.
- **FR-012**: A seller MUST only see and manage their own organization's listings; a buyer MUST never
  see another member's draft/rejected/suspended listing.
- **FR-013**: MVP trading mode MUST be fixed-price listing only, unless and until a negotiated-offer
  mechanism is confirmed as supported by the approved schema (see Open items). No order book, no
  anonymous matching, no leverage/futures/shorts, no external stock.
- **FR-014**: All marketplace/listing routes MUST live under `/dashboard`, register with 004's module
  contract, and be non-indexable.
- **FR-015**: Seller modules MUST appear only for `can_sell` organizations, additively (Constitution
  VI); no separate seller application.
- **FR-016**: All mutations MUST follow 001's Server Action contract and return safe errors.
- **FR-017**: All screens MUST provide loading, empty, error, unauthorized, suspended, reserved,
  partial-fill and sold-out states.
- **FR-018**: All copy externalised; layouts RTL-safe; tables collapse to cards at mobile.

## Security Requirements

- **SEC-001**: Marketplace access MUST be denied to anonymous users, non-members, non-approved
  organizations and suspended organizations — verified by negative tests (SRS AC-01).
- **SEC-002**: Cross-organization listing isolation MUST be enforced by RLS and verified by tests.
- **SEC-003**: No service-role usage anywhere in this feature.
- **SEC-004**: Seller-supplied listing text/documents MUST be treated as untrusted input and escaped
  everywhere they render, including in 010's review screens.
- **SEC-005**: A seller MUST NOT be able to list quantity they do not own or that is reserved, even by
  crafting a direct request that bypasses the UI.
- **SEC-006**: Listing detail MUST NOT expose another organization's private data (owner identity of
  other members' stock, exact warehouse location, private contract prices) beyond what the approved
  policy permits.

## Edge Cases

- A listing is suspended while a buyer is on its page → next request shows suspended; any action is
  refused server-side.
- A seller edits a listing's price while a buyer's checkout is in flight → the buyer's order carries
  its own snapshot (`unit_price_per_kg` on `order_items`); listing edits never retroactively change
  an order.
- Two buyers act on the same remaining quantity simultaneously → at most one reservation succeeds;
  the other receives an availability failure (enforced by `checkout_order()`, verified here).
- A reservation expires → quantity returns to available exactly once; the listing state reverts
  appropriately.
- A seller's organization is suspended while listings are live → listings must stop being actionable
  (compliance/010 action; this feature renders the effect).
- Inventory becomes reserved for delivery after listing → available quantity for the listing drops;
  execution re-check prevents overselling.
- A listing's underlying lot is unreadable due to DB-OPEN-05 → degrade honestly like 005.
- A member with `can_sell` revoked mid-session → listing management refuses on the next request.

## Success Criteria

- **SC-001**: Anonymous, non-member, non-approved and suspended users reach zero listing data in
  100% of attempts (AC-01).
- **SC-002**: A seller can never publish quantity they do not own, that is not Hills-sourced, or that
  is reserved — in 100% of attempts including direct action invocation.
- **SC-003**: Displayed remaining quantity always equals the database's stored quantities; zero
  UI-side tallies.
- **SC-004**: Two concurrent buyers can never act on more than the remaining quantity (proven jointly
  with 007's concurrency test) (AC-02).
- **SC-005**: Every listing state renders its approved vocabulary label.
- **SC-006**: Zero listing data appears in any public route, sitemap, structured data or shared cache.
- **SC-007**: A `can_sell = false` organization can never reach listing management.

## Assumptions

- Hills' own inventory appears as listings with the Hills seller type; member resale listings carry a
  member seller type — both flow through the same `coffee_offers` model.
- Compliance review of listings happens in 010; this feature creates and renders the states.
- Fill quantities are produced by 007 (reservation) and 008 (settlement); this feature never writes
  them.

## Open items / blockers

- **Negotiated offer / RFQ inside the marketplace**: SRS MKT-06 permits "fixed-price and/or
  negotiated offer / RFQ" for MVP, but the approved schema models listings with a single
  `price_per_kg` and no offer/counter-offer entity. **Fixed-price only is therefore the implementable
  MVP**; adding negotiation would require an approved database change. Recorded rather than assumed.
- **DB-OPEN-05** may limit lot detail on listing pages (same degradation approach as 005).
- Whether a suspended seller organization automatically suspends its live listings is a compliance
  workflow question owned by 010; this feature must not invent an automatic transition.

## Dependencies

| Depends on | Why |
|---|---|
| 001, 003, 004 | Guard, eligibility, module contract |
| 005 | Eligible-quantity facts for listing creation and availability display |
| 007 | Consumes listings for orders; produces reservations that change remaining quantity |
| 008 | Settlement produces fills, sold-out transitions and payouts |
| 010 | Compliance review/suspension decisions on listings |
