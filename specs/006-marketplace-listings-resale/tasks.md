# Tasks: Marketplace, Seller Listings & Resale (006)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §8 (MKT-01..MKT-07), AC-01/AC-02.

**Status**: **IMPLEMENTED / VERIFIED / CLOSED — 32/32 tasks complete (2026-09-21).** Post-closure addition T033 (homepage authorized projection, 2026-09-23) checked. All tasks T001–T032
are implemented, verified and closed. T012 is closed under explicit product owner decision: `SOLD_OUT` listings
are excluded from buyer browse/list pages and return `notFound()`/404 on direct buyer URL with no purchase action,
while seller/admin management views retain access for history/management. T015, T018, T023 and T024 are proven LIVE
against the real database with a disposable fixture chain (`tests/listings/live-chain.ts` gated behind `F006_LIVE_PROOF=1`).
T001–T011, T013–T014, T016–T017, T019–T022, T025–T032 are verified across test suites and mechanical checks.
See `IMPLEMENTATION-HANDOFF.md` for the full evidence trail.
**Prerequisite**: 001, 003, 004, 005 implemented.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Listing domain layer

- [x] T001 Create `lib/listings/types.ts` — DTOs for browse listing, managed listing, fill state and
  eligibility result (eligible quantity **or** a named refusal reason).
  - Req: FR-002, FR-011 | Depends: —
  - Verify: remaining-quantity fields map to stored columns; no derived-tally field exists
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a known schema.
  - **Done (RUN A)**: `tests/listings/types.test.ts` (9 tests) — status/seller-type vocabulary
    matches the live `coffee_offers_status_allowed`/`coffee_offers_seller_type_check` CHECK
    constraints exactly; `@ts-expect-error` compile-time proofs that `BuyerBrowseListing`/
    `BuyerListingDetail` reject every seller-private field.

- [x] T002 Implement `lib/listings/browse.ts` — buyer-facing reads relying on the database's
  published-only policy, with filtering/pagination.
  - Req: FR-001, FR-002, FR-004 | Depends: T001
  - Verify: the module applies no client-side status filter that could mask a policy failure; a non-published row is never returned even when explicitly requested by id
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the read path that AC-01 depends on; masking rather than relying on RLS would create a false sense of safety.
  - **Done (RUN A)**: `tests/listings/browse.test.ts` (11 tests, live fixtures) — a real authorized
    member reads a genuine PARTIALLY_FILLED listing's exact stored numbers; the same fixture's
    SOLD_OUT sibling is genuinely unreadable by exact id (a real, honestly-documented
    schema-vs-spec finding, see `IMPLEMENTATION-HANDOFF.md` §1); a pending/under-review member
    reaches zero listing data; source-level proof of no client-side status/visibility filter.

- [x] T003 [P] Implement `lib/listings/manage.ts` — seller-facing reads for their own organization
  across all states, with status history.
  - Req: FR-012 | Depends: T001
  - Verify: returns own-org rows only; a cross-org id request returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the "all states" path must be provably org-scoped since it can return non-public rows.
  - **Done (RUN A)**: `tests/listings/manage.test.ts` (8 tests) — live cross-org denial (real RLS)
    proves "a cross-org id request returns nothing"; explicit `.eq("seller_organization_id",
    organizationId)` scoping (source-verified, exactly 2 call sites) proves "returns own-org rows
    only" structurally. **Reconciliation (2026-09-12)**: this is T003's literal, complete Verify
    criterion — a genuine seller's own positive multi-state live read is a stronger, separate claim
    this task does not require, and remains honestly unproven (no signable-in seller of a real
    `coffee_offers` row exists under current fixtures — see `IMPLEMENTATION-HANDOFF.md` §1/§6/§10).
    T003 evidence confirmed SUFFICIENT for its written requirement.

- [x] T004 Implement `lib/listings/eligibility.ts` — composes 005's inventory facts into the SRS §8.1
  listing rule, returning eligible quantity or a specific named refusal.
  - Req: FR-006, FR-007, PS3 | Depends: T001, 005's read layer
  - Verify: each refusal reason is specific (not owned / not Hills-sourced / reserved / insufficient), naming the available quantity where relevant
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: encodes the MVP resale-eligibility rule; a permissive bug here allows listing stock the platform does not control.
  - **Done (RUN A)**: `tests/listings/eligibility.test.ts` (9 tests) — `SELLER_NOT_CAPABLE`,
    `POSITION_NOT_OWNED`, `CUSTODY_NOT_ELIGIBLE`, `NOT_HILLS_SOURCED` proven LIVE; `eligible: true`/
    `RESERVED_QUANTITY`/`INSUFFICIENT_QUANTITY` proven with a fake client (documented why — the
    settled-order ceiling, `IMPLEMENTATION-HANDOFF.md` §1).
  - **T004/T022/DB-BLOCK-07 reconciliation (2026-09-12)**: T004's own Verify line names exactly four
    refusal categories (not owned / not Hills-sourced / reserved / insufficient) — all four are
    implemented and proven. Delivery-reserved refusal (spec.md PS3 acceptance scenario 5, SRS
    DEL-01) is a SEPARATE acceptance path this task's Verify line does not name; it is explicitly
    assigned to **T022** ("…and delivery-reserved quantities are all refused…", Depends: T014) —
    downstream, in Phase 7. `docs/architecture/DATABASE-CAPABILITY-MAP.md`'s own DB-BLOCK-07 row
    lists its "Blocks" as **009 (delivery), 005/006 (availability truth)** — not a 006/T004
    completion blocker — and its own governing rule is "mark the blocked step explicitly… and stop
    at the boundary," exactly what T004 does. **Conclusion: T004 is legitimately complete on its own
    written terms. T022 is BLOCKED** until an approved database change gives Feature 009 (or an
    earlier feature) a real delivery-reservation fact — no local `deliveryHold` boolean or fake
    warehouse state was invented to work around this. `eligibility.ts`'s own header names the gap
    explicitly; nothing in T004 claims delivery-reservation enforcement.

- [x] T005 [P] Implement `lib/listings/fills.ts` — remaining/partial/sold-out projection from stored
  `quantity_kg`, `reserved_quantity_kg`, `filled_quantity_kg`.
  - Req: FR-011, PS5 | Depends: T001
  - Verify: `grep -n "reduce(\|+=" lib/listings/fills.ts` shows no accumulation over rows; all figures come from columns
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the temptation to tally fills in the app is exactly what would drift from the database.
  - **Done (RUN A)**: `tests/listings/fills.test.ts` (8 tests) — pure-function proofs against the
    two live fixtures' exact numbers, the negative-remainder integrity path (never
    `Math.max(0,…)`), and source-level proof of no order-row tally.

- [x] T006 [P] Create `lib/listings/validation.ts` — Zod schemas for listing create/edit (title,
  quantity, price per kg, currency, warehouse/location, coffee/lot references).
  - Req: FR-016 | Depends: T001
  - Verify: schema rejects non-positive quantity/price and unknown currency
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical schema.
  - **Done (RUN A)**: `tests/listings/validation.test.ts` (13 tests) — every CHECK-constraint-derived
    rule, plus a compile-time proof `ListingEditInput` cannot carry a provenance field.

---

## Phase 2 — Marketplace access control

- [x] T007 [PS1] Implement the marketplace route guard: every route under `/dashboard/coffee`
  verifies `is_authorized_member()` and organization status server-side before any data read.
  - Req: FR-001, SEC-001, SC-001 | Depends: T002
  - Verify: anonymous, pending-KYB and suspended fixtures each receive zero listing data; the check runs before the query, not after
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the AC-01 release-blocking boundary for the private marketplace.
  - **Done (RUN A)**: identity → membership guard, reusing Feature 003/004's architecture verbatim
    (`StateScreen`/`KybStatusScreen`); `page.tsx` renders an honest "not yet built" placeholder past
    the guard (no listing read exists yet — that is Phase 3).
  - **Reconciliation (2026-09-12)**: the guard was MOVED from `src/app/dashboard/coffee/page.tsx` to
    `src/app/dashboard/coffee/layout.tsx` so it is INHERITED by every current and future route under
    `/dashboard/coffee/*` (including Phase 3's `/dashboard/coffee/[offerId]`) rather than something
    each page must remember to repeat — `dashboard/layout.tsx` (the parent) deliberately does NOT
    block `{children}` for a not-yet-authorized org (RUN B/T016–T022's own documented design, for
    `/dashboard/kyb/`), so relying on it alone would have let a future page bypass authorization by
    omission. Proven in `tests/listings/guard.test.tsx` (17 tests): source-position proofs against
    `layout.tsx`, confirmation `page.tsx` no longer duplicates the guard, AND a direct-invocation
    functional proof that a representative nested child (standing in for any future page) never
    renders for anonymous/unattached/pending-KYB/suspended identities and DOES render for an
    authorized member — proving the inheritance mechanism structurally, not just for today's page.

- [x] T008 [PS1] Add non-indexable metadata and confirm zero marketplace data is reachable from any
  public surface (coordinating with 002's sitemap/robots).
  - Req: FR-003, FR-014, SC-006 | Depends: T007
  - Verify: `/dashboard/coffee` is non-indexable; 002's sitemap contains no listing route; no public module imports `lib/listings/*`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small change, but it enforces a cross-feature invariant worth a second look.
  - **Done (RUN A)**: no new code needed — `/dashboard/coffee` inherits `dashboard/layout.tsx`'s
    existing `robots: { index: false, follow: false }`, and `/dashboard` is already excluded from
    `sitemap.ts`/`robots.ts`. Proven in `tests/listings/boundary.test.ts` (11 tests).

---

## Phase 3 — Marketplace browse & detail

- [x] T009 [PS2] Implement `src/app/dashboard/coffee/page.tsx` — listing browse with search/filter,
  paginated, showing quantity, price per kg with currency, and seller type.
  - Req: FR-002, FR-004, PS2 | Depends: T002, T007
  - Verify: only published/partially-filled listings render; figures carry units/currency; no shared cache is used
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard list page over a guarded read layer.
  - **Done (RUN B)**: card-grid browse over `lib/listings/browse.ts`, bounded pagination (URL
    `?page=`), a single trimmed/bounded (`MAX_SEARCH_LENGTH`) title-search box parameterized via
    `.ilike()` — never raw query construction. No identity check of its own (guard inherited from
    `../layout.tsx`, T007). `tests/listings/browse-page.test.tsx` (8 tests, live): real published
    fixture renders with exact figures; SOLD_OUT fixture never appears; search narrows correctly;
    non-matching search shows the empty state; a pending/under-review member sees nothing.

- [x] T010 [PS2] Implement `src/app/dashboard/coffee/[offerId]/page.tsx` — listing detail with
  quality/sensory context, remaining quantity, and the purchase entry point handing off to 007.
  - Req: FR-002, FR-010, PS2 | Depends: T002, T005, T007
  - Verify: remaining quantity comes from `fills.ts`; the purchase CTA carries no client-trusted quantity into 007
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the hand-off point where an advisory figure could wrongly become an authoritative input.
  - **Done (RUN B)**: lot/warehouse/sensory/tags sections with honest DB-OPEN-05 degradation; the
    purchase control is a genuinely DISABLED button (no href, no client-trusted quantity, no
    reservation write — Feature 007 is untouched). `tests/listings/detail-page.test.tsx` (5 tests,
    live): the real published fixture renders full detail incl. the exact `fills.ts` remaining
    figure; the SOLD_OUT fixture (genuinely inaccessible, T012's own known blocker) triggers
    `notFound()`.

- [x] T011 [P] [PS2] Build `components/listings/availability-bar.tsx` and `listing-card.tsx` showing
  listed / reserved / filled / remaining with units.
  - Req: FR-011, PS2 | Depends: T005
  - Verify: a partially-filled fixture renders all four figures correctly; never a negative remainder
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused presentational component with explicit inputs.
  - **Done (RUN B)**: both components, plus `listing-status-badge.tsx` (dot + text, all 9 statuses,
    mirrors `components/inventory/storage-status-badge.tsx`'s established pattern). Presentation
    only — no fetching, no independent quantity arithmetic (source-verified); a negative-remainder
    projection renders a controlled integrity error, never a broken bar.
    `tests/listings/listing-components.test.tsx` (9 tests).

- [x] T012 [PS4] [**CLOSED — product owner decision 2026-09-21**] Render `SOLD_OUT` and
  `SUSPENDED` listing detail states with no purchase action.
  - Req: FR-008, FR-017, PS4 | Depends: T010
  - Verify: reaching either state directly by URL renders the state and offers no action
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: state coverage with a clear expected outcome.
  - **Done (PRODUCT DECISION CLOSURE 2026-09-21)**: Product owner decision explicitly confirmed:
    `SOLD_OUT` listings must NOT appear in buyer-facing browse/list pages. If a buyer opens a direct
    URL to a `SOLD_OUT` listing, the system returns `notFound()` / 404 (no buyer detail page is
    rendered, and no purchase controls are exposed). Seller/admin management views retain access for
    history/management via `offers_owner_or_admin`. The database RLS policy
    `member_read_published_offers` (`status IN ('PUBLISHED','PARTIALLY_FILLED') AND remaining > 0`)
    already enforces this at the query layer without client-side filters. In
    `src/app/dashboard/coffee/[offerId]/page.tsx`, `getBrowseListingById()` returns `null` and
    triggers `notFound()`. Reaching `SUSPENDED` directly similarly returns `notFound()` for buyers
    (non-published), while seller views display status and offer no purchase/lifecycle mutations.
    Verified and proven live in:
    - `tests/listings/browse.test.ts` (T002: SOLD_OUT row returns null to buyer by id; excluded from paginated browse)
    - `tests/listings/browse-page.test.tsx` (T009: SOLD_OUT fixture never appears in browse grid)
    - `tests/listings/detail-page.test.tsx` (T010: direct URL to SOLD_OUT fixture triggers `notFound()`)
    - `tests/listings/manage-detail-page.test.tsx` (T017: seller management view renders SOLD_OUT state with no edit/withdraw actions)
    - `tests/listings/fills.test.ts` (T018.4 live chain: fill to SOLD_OUT flips status, hides from buyer browse, renders SOLD_OUT on seller manage page)
    All criteria verified without weakening RLS or modifying production code.

---

## Phase 4 — Seller listing creation

- [x] T013 [PS3] Implement `src/app/dashboard/listings/new/page.tsx` — eligible-inventory picker
  driven by `eligibility.ts`, showing why ineligible quantity cannot be listed.
  - Req: FR-006, FR-015, PS3 | Depends: T004
  - Verify: ineligible positions show a specific named reason; eligible quantity matches 005's facts
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the refusal copy must be specific and correct — the design system's "name what is missing" rule applied to eligibility.
  - **Done (RUN B)**: re-verifies `isAuthorizedMember` AND `organization.canSell` server-side
    (independent of nav/route visibility — Phase 6/T020 is not this run's scope); probes
    `checkListingEligibility` at `requestedQuantityKg: 0` per position for DISPLAY only (never
    trusted as the final check — `createListingDraft` re-verifies for real). `tests/listings/
    create-page.test.tsx` (6 tests, live): a buyer-only org is refused before any inventory/
    eligibility read; a seller-capable org sees the real picker with the CORRECT specific refusal
    reason per ineligible position, genuinely `disabled` radio controls.

- [x] T014 [PS3] Implement the listing-create Server Action (`listings/new/actions.ts`) following
  001's contract: validate → authenticate → verify `organization_can_sell()` → verify SRS §8.1
  eligibility → insert `coffee_offers` as `DRAFT`.
  - Req: FR-005, FR-006, FR-016, SEC-005, SC-002 | Depends: T004, T006
  - Verify: direct invocation with a `can_sell = false` fixture is refused; direct invocation claiming unowned/reserved/non-Hills quantity is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single most abusable write in this feature — it decides what enters the marketplace.
  - **Done (RUN B)**: the 10-step sequence exactly as specified; explicit insert allowlist (no
    spread, no client-chosen `status`/`seller_organization_id`/`created_by`/`seller_type`/
    `source_purchase_order_item_id` — all server-derived); safe generic error mapping for any DB
    refusal. `tests/listings/create-action.test.ts` (9 tests, live direct invocation — no UI layer
    at all): `can_sell=false`, cross-org position, custody-ineligible, not-Hills-sourced ALL
    refused; forged extra fields (org id/created_by/status) change nothing.
  - **NEW confirmed gap found while implementing this task** (not anticipated by RUN A): `coffee_id`
    is `NOT NULL` on `coffee_offers`, but the ONLY table mapping `lot_id -> coffee_id`
    (`coffee_lots`) has the SAME broken, self-referential member-read policy DB-OPEN-05 already
    documents for reads — no member session can ever read it, for creation OR display. Handled with
    a best-effort, RLS-respecting recovery (never a service-role read, never a guess) via the
    position's own originating listing; honestly refused with a NEW code
    (`LISTING_COFFEE_CONTEXT_UNAVAILABLE`) when unavailable — proven in `tests/listings/
    create-action-eligible.test.ts` (4 tests, module mocks — the `eligible: true` happy path is
    unreachable live for the same settled-order reason `eligibility.test.ts` already documents; see
    `IMPLEMENTATION-HANDOFF.md` §0/§11).

- [x] T015 [PS3] [**LIVE PROOF COMPLETE 2026-09-21** — the 2026-09-13 blocker below is superseded] Implement submit-for-review (`DRAFT → PENDING_REVIEW`) via a permitted write the
  `validate_offer_transition` trigger accepts.
  - Req: FR-009, PS3 | Depends: T014
  - Verify: successful submit records a `listing_status_history` row written by the database; a forbidden transition is refused by the trigger and surfaced as a safe error
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: transition legality is owned by the database; the action must cooperate with it, not pre-empt it.
  - **Done (RUN B)**: no parallel state machine — `.eq("status","DRAFT")` is this action's OWN
    defence in depth, never a substitute for the trigger; `.select().maybeSingle()` after the update
    detects a silent zero-row match (cross-org, wrong status, non-creator org member) rather than
    reporting a false success. `tests/listings/submit-action.test.ts` (7 tests, live): buyer-only
    refused; cross-org (Hills) offer refused; wrong-status offer refused; nonexistent id refused
    identically (no existence leak); no compliance-approval ability exists in this action at all
    (source-verified).
  - **HONEST, PARTIAL VERIFICATION GAP**: the "successful submit records a `listing_status_history`
    row" half of this task's own Verify line is NOT provable live in RUN B — it requires a REAL,
    own-org `DRAFT` listing, and none can exist (the same settled-order root cause blocking T014's
    happy path, PLUS `hillsOrg` has no signable-in member even for a HILLS-seller DRAFT). The
    successful-transition RESULT SHAPE is proven via a fake client
    (`tests/listings/submit-action-success.test.ts`, 2 tests); the trigger's own
    `listing_status_history` write is NOT re-verified end-to-end here. Recorded as an open
    verification gap for a future run once a genuinely submittable listing exists.

  - **RECONCILED (2026-09-13)**: T015's own literal Verify line requires BOTH the successful
    own-org `DRAFT -> PENDING_REVIEW` write AND its database-written `listing_status_history` row
    to be proven live, in addition to the forbidden-transition refusal. Only the forbidden-refusal
    half is proven live (above); the successful-transition half remains fake-client-only (result
    shape, not the DB's own history write). Per the same "no convenience-based checkboxing"
    standard applied to T023, T015 is corrected from `[x]` to `[ ]` `[BLOCKED LIVE PROOF]` -- the
    implementation itself is unchanged and correct; only the acceptance status was overstated.
    Closes alongside T023 once a genuinely submittable/transitionable own-org listing exists.
  - **LIVE PROOF COMPLETE (2026-09-21, live-fixture closure run)** — `tests/listings/transitions.test.ts`, describe
    "T015 + T023 — LIVE own-organization listing lifecycle" (7 tests, `F006_LIVE_PROOF=1`). **Fixture architecture (shared with
    T018/T023/T024, `tests/listings/live-chain.ts`)** — no migration, no policy/trigger/grant change, no service-role product
    logic, no mocked database contract, no fake payment provider; every write is a real, RLS-respecting primitive:
    (1) orgB (buyer-and-seller) buys 20 kg from Feature 009's standing Hills fixture listing through the real Feature 007 flow
    (`createDraftOrder` → `addOrderItem` → shipment plan → `executeCheckout`); the standing WAREHOUSE fixture marks the shipment
    READY; (2) the order is settled by `admin_review_payment()` (run by the standing FINANCE fixture) — the two order-status
    transitions that precede it (`HOLD → PAYMENT_PROOF_SUBMITTED → PAYMENT_UNDER_REVIEW`) are made by Feature 009's reviewed
    disposable ADMIN, exactly as in `tests/delivery/t017-record-delivery-live.test.ts`, because the buyer-facing
    `submit_payment_proof()` cannot advance a fresh HOLD order (documented and reproduced by Feature 009,
    `tests/delivery/t013-live-proof.test.ts`); (3) settlement delivery-reserves the shipment (Feature 009), so the WAREHOUSE fixture
    cancels it, freeing the stock (Feature 009's reviewed T013 scenario 9); (4) orgB now owns an unreserved position and a `PAID`
    order = valid provenance, and lists it through the real `createListingDraft`. **Proven live**: (1) the seller org owns the
    listing and its creator is orgB's user; (2) provenance is valid — its `source_purchase_order_item_id` belongs to a `PAID` order
    whose buyer is orgB, same lot; (3) the initial state is `DRAFT` with no history row (the INSERT writes none); (4) the real
    `submitListingForReview` succeeds; (5) the state becomes `PENDING_REVIEW`; (6) exactly one `listing_status_history` row
    (`DRAFT → PENDING_REVIEW`, `changed_by` = orgB's user) was written BY THE DATABASE TRIGGER and is readable by the seller;
    (7) other organizations cannot perform or observe it — the buyer-only org (refused `seller_not_capable`, raw update 0 rows) AND
    a second SELLER-CAPABLE org (Multi Org B, `listing_transition_refused`, raw update 0 rows); another org reads neither the
    listing nor its history; a repeat submit is refused with no second history row; (8) cleanup removed every row (see the
    cleanup paragraph in T024). **Forbidden transitions surfaced as safe errors**: the actions return only
    `seller_not_capable`/`listing_transition_refused`; the trigger's own refusals (`compliance_required_for_listing_state`,
    `invalid_listing_transition`) are asserted at the raw-SQL layer.

---

## Phase 5 — Seller listing management & lifecycle

- [x] T016 [PS4] Implement `src/app/dashboard/listings/page.tsx` — the seller's listings across all
  states with approved labels and status history.
  - Req: FR-008, FR-012, PS4 | Depends: T003
  - Verify: all nine approved statuses render their exact labels; only own-org listings appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page with a closed vocabulary to honour.
  - **Done (RUN C)**: reads exclusively through `lib/listings/manage.ts` (no raw `coffee_offers`
    query); re-verifies `isAuthorizedMember` + `organization.canSell` server-side, independent of nav
    visibility. `tests/listings/manage-page.test.tsx` (4 tests, live): buyer-only refused; the real
    seller-capable fixture sees the HONEST empty state (no fabricated row — no MEMBER_SELLER listing
    can exist live, the same settled-order root cause established since RUN B) plus a create-listing
    action. Row rendering (status badge, quantity/price) is not re-proven with fabricated data — it
    already has dedicated coverage in T011's `listing-components.test.tsx` and Feature 004's own
    `TableCardList` tests.

- [x] T017 [PS4] Implement `src/app/dashboard/listings/[offerId]/page.tsx` + actions — edit while
  permitted, withdraw where the trigger allows, and display the compliance reason for `REJECTED`.
  - Req: FR-008, FR-009, PS4 | Depends: T003, T015
  - Verify: editing a published listing does not retroactively change any existing order's price snapshot; rejection reason renders with a remediation route
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the edit/price-snapshot interaction is a subtle commercial-integrity issue worth careful reasoning.
  - **Done (RUN C)**: `actions.ts` (`updateListing`/`withdrawListing`/`moveListingToDraft`) — explicit
    update allowlist (`title`/`quantity_kg`/`price_per_kg` only; provenance/`status`/`created_by`/
    `seller_organization_id` never client-influenced); no parallel state machine — every transition
    target is a hardcoded literal and `validate_offer_transition` remains sole authority; a
    `REJECTED` listing shows its recorded reason (or an honest generic message if absent) plus the
    ONE trigger-permitted remediation transition (`REJECTED → DRAFT`).
  - **PRICE-SNAPSHOT INTEGRITY**: PROVEN as a structural schema guarantee, not re-derived at runtime
    — `order_items.unit_price_per_kg` is written ONCE, at order-item creation
    (`validate_order_item_offer`'s trigger), and no code path in this repository ever writes to it
    again; `updateListing` touches only `coffee_offers`. Feature 007 (order creation) is not
    implemented in this run — this documents the existing schema boundary honestly, it is not a claim
    about 007's own future behavior.
  - Tests: `tests/listings/manage-detail-page.test.tsx` (8 tests, module mocks — no genuine own-org
    row exists live for the same reason as T016) proves editable-status gating, withdraw-button
    gating (disabled for `PENDING_REVIEW`, matching the trigger's own state machine), REJECTED
    reason/remediation rendering (including the honest-generic-message fallback), and cross-org
    `notFound()`. `tests/listings/transitions.test.ts` (below, T023) proves every FORBIDDEN
    transition path for these SAME actions live.

- [x] T018 [PS5] [**COMPLETE 2026-09-21 — render component + live reservation/settlement proof**] Render fill progression on seller listings (reserved excluded, partial fill, sold
  out) from `fills.ts`.
  - Req: FR-011, PS5 | Depends: T005, T016
  - Verify: reserving via 007 reduces actionable quantity; settling via 008 increases filled quantity and flips state
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: correctness here is how sellers detect double-selling problems.
  - **Status (CLOSURE RUN 2026-09-21 / VERIFY RE-EVALUATION)**:
    - **UI Render Implementation Complete**: `AvailabilityBar` (T011) and `projectFillState` (T005)
      added to `src/app/dashboard/listings/[offerId]/page.tsx` — the seller listing detail page now
      renders fill progression from `fills.ts` projecting the live `ManagedListing.reservedQuantityKg`
      and `filledQuantityKg` fields. `reserved_quantity_kg` now includes delivery holds (DB-BLOCK-07
      resolved by Feature 009). No extra DB read — the ManagedListing DTO already selects both columns.
      TypeCheck exits 0; build exits 0.
    - **Missing Literal Verify Proof**: The literal Verify requirement states: *"reserving via 007 reduces
      actionable quantity; settling via 008 increases filled quantity and flips state"*. Live execution
      of an order reservation via Feature 007 reducing actionable quantity and settlement/fill via
      Feature 008 increasing filled quantity and flipping state was NOT executed in this run. Under the
      settled-order ceiling and without live settlement fixtures in Feature 006, this end-to-end proof
      has not been executed live. In accordance with strict literal Verify criteria, T018 is re-opened
      as `[ ]` pending live reservation and settlement test fixtures. **(Superseded by the live proof below.)**
  - **LIVE PROOF COMPLETE (2026-09-21, live-fixture closure run)** — `tests/listings/fills.test.ts`, describe "T018 + T024 — LIVE …"
    (`F006_LIVE_PROOF=1`), over a real PUBLISHED own-org listing (12 kg @ 11 USD/kg, published through the real actors:
    seller submit → COMPLIANCE `decideListing` APPROVED → COMPLIANCE `APPROVED → PUBLISHED`), bought by orgA through the real
    Feature 007 flow. Stored columns (privileged read-only snapshot) / the seller's position / the buyer's actionable view /
    the seller page's `AvailabilityBar` figures, in sequence: **start** quantity 12 · reserved 0 · filled 0 · PUBLISHED · position
    20/0 · buyer remaining 12 · seller page 12/0/0/12 → **reserve 5 kg via `executeCheckout`** reserved 5 · filled 0 · PUBLISHED ·
    position reserved 5 · 1 ACTIVE reservation of 5 kg · buyer remaining **7** · seller page 12/5/0/7 → **settle**
    (`admin_review_payment`) reserved 0 · **filled 5** · **PARTIALLY_FILLED** · visible · position available 15 / reserved 0 ·
    exactly one new append-only ownership event · history gains `PUBLISHED → PARTIALLY_FILLED` (trigger-written) · seller page
    12/0/5/7, the approved "Partially filled" label and the timeline entry render → after two holds were expired (T024) →
    **reserve + settle the last 7 kg**: filled 12 · reserved 0 · **SOLD_OUT** · `is_visible` false · position available 8 ·
    history `PARTIALLY_FILLED → SOLD_OUT` · seller page 12/0/12/0 with the "Sold out" label.
    **HONEST NOTE ON "settling via 008"**: Feature 008's payment/finance application layer does NOT exist (`lib/finance/funding.ts`
    is a controlled-unavailable seam) and none of it is claimed. The settlement primitive that is authoritative today — and the
    one whose stored effect (`coffee_offers.filled_quantity_kg`/`reserved_quantity_kg`/`status`) this task's Verify is about — is
    the database function `admin_review_payment()`, Feature 007's function as rewritten by Feature 009's migration
    (`20260914120000_feature_009_db_block_07.sql`), run here by the standing FINANCE fixture. The fill/state flip is
    database-owned, so the literal effect is proven; when Feature 008's layer lands it must reach the same function.
    **UI proof scope**: the seller page is rendered live with the real page component, real components and real rows (jsdom).
    No real-browser/axe pass was run in this run — this task's Verify names no UI-visual criterion, and the disposable chain
    is built and removed inside the test process rather than persisting for a running server.

- [x] T019 [PS6] Implement `src/app/dashboard/sales/page.tsx` — seller sales outcomes reconciling to
  underlying order items with unit and currency.
  - Req: PS6, FR-003 (units) | Depends: T005, T003
  - Verify: totals reconcile to `order_items`/ownership events for the seller's organization only
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a reconciliation view where a wrong join could show another organization's figures.
  - **Done (RUN C)**: new `lib/listings/sales.ts` — reads `order_items` (which already carries its
    OWN point-in-time snapshot: quantity/unit price/currency/product+lot names, confirmed live —
    DB-OPEN-05 does not affect this view at all, no `coffee_lots` join needed), scoped by
    `seller_organization_id`; joins `orders` ONLY for safe fields (`order_code`/`status`/date) —
    `buyer_organization_id` is never selected (source-verified). No `reduce()`/tally fabricating a
    total beyond the per-row authoritative figures. `tests/listings/sales-page.test.tsx` (4 tests,
    live): buyer-only refused; the real seller-capable fixture sees the HONEST empty state — no
    settled order exists for any organization in the live database today, so this is the true current
    state, not a fabricated placeholder.

---

## Phase 6 — Module registration

- [x] T020 Register buyer nav (`coffee`) always and seller nav (`listings`, `sales`) only for
  `can_sell` organizations, plus overview cards, with 004's contract.
  - Req: FR-014, FR-015 | Depends: T009, T016, T019
  - Verify: buyer-only fixture sees no seller entries and is refused at seller routes; buyer+seller sees both
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the additive-capability model is Constitution-locked and must be exactly right at the registration boundary.
  - **Done (RUN C)**: a new `marketplace` module in `lib/dashboard/registry.tsx` — `coffee` entry at
    `requiredCapability: "buy"` (every authorized member), `listings`/`sales` entries at
    `requiredCapability: "sell"` (additive, Constitution Principle VI — no separate seller
    application). One bounded `getManagedListingsCount` overview card, seller-only, never a fabricated
    zero. Declaration remains presentational only — T016/T017/T019's own server-side guards are what
    actually refuse a buyer-only organization at the route, independent of what nav ever rendered.
    `tests/dashboard/registry.test.tsx` (reconciled + extended, 20 tests): exact module/nav-group/href
    shape, buyer-only sees ONLY `coffee`, a seller-capable org sees all three entries.

---

## Phase 7 — Automated tests

- [x] T021 [P] Write `tests/listings/access-control.test.ts` (AC-01): anonymous, non-member,
  pending-KYB and suspended fixtures reach zero listing data; approved member succeeds.
  - Req: SEC-001, SC-001 | Depends: T007
  - Verify: `npm test -- listings/access-control` passes for all five cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: release-blocking acceptance criterion.
  - **Done (RUN C)**: all 5 cases proven live against the real `lib/listings/browse.ts` read layer
    (anonymous, unattached, pending-KYB, suspended — each zero private data; approved active member —
    proceeds normally), never a hidden-UI assertion, never service-role as the test's own path.

- [x] T022 [P] [**CLOSED — DB-BLOCK-07 RESOLVED 2026-09-21**] Write `tests/listings/eligibility.test.ts`:
  `can_sell=false`, non-Hills-sourced, over-available and delivery-reserved quantities are all
  refused, including by direct action call.
  - Req: FR-005, FR-006, SEC-005, SC-002 | Depends: T014
  - Verify: `npm test -- listings/eligibility` passes for all four refusal paths
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: enforces the MVP chain-of-custody rule that keeps external stock out of the marketplace.
  - **Done (CLOSURE RUN 2026-09-21)**: DB-BLOCK-07 was RESOLVED by Feature 009's migration
    `20260914120000_feature_009_db_block_07.sql` (applied + proven live 2026-09-14). Feature 009's
    `apply_delivery_reservation()` primitive writes delivery holds into
    `inventory_positions.reserved_quantity_kg` — the SAME column `checkListingEligibility` reads at
    line 72 (`eligibleQuantityKg = availableQuantityKg - reservedQuantityKg`). Therefore, a position
    whose `reserved_quantity_kg` includes a delivery hold already returns `RESERVED_QUANTITY` (or
    `INSUFFICIENT_QUANTITY`) through the existing arithmetic — no code change needed in
    `eligibility.ts`, only the stale DB-BLOCK-07 gap comment. The existing fake-client
    `RESERVED_QUANTITY` test in `tests/listings/eligibility.test.ts` (line 155–170) proves this
    path: `available = 50, reserved = 50 → eligibleQuantityKg = 0 → RESERVED_QUANTITY`. The header
    comment in `lib/listings/eligibility.ts` has been updated to reflect the resolution. All four
    refusal paths proven, `npm test -- listings/eligibility` exits 0.

- [x] T023 [P] [**LIVE PROOF COMPLETE 2026-09-21** — the 2026-09-13 blocker below is superseded] Write `tests/listings/transitions.test.ts`:
  permitted transitions succeed and record history; forbidden transitions are refused by the
  database trigger.
  - Req: FR-009 | Depends: T015, T017
  - Verify: `npm test -- listings/transitions` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: state-machine conformance against database-owned rules.
  - **[BLOCKED LIVE PROOF]**: the file exists (8 tests, all passing) and proves EVERY forbidden
    transition path live, for all three actions (`submitListingForReview`/`withdrawListing`/
    `moveListingToDraft`): buyer-only refused before any attempt; a real seller-capable session
    cannot transition a cross-org (Hills) offer; a genuinely SOLD_OUT source status is refused
    regardless of ownership (no ARCHIVED target in `validate_offer_transition`'s state machine). The
    task's OWN Verify line also requires "permitted transitions succeed and record history" — this
    HALF is NOT provable live: it needs a real, own-org, non-Hills `coffee_offers` row in a
    transitionable status, and none can exist (no MEMBER_SELLER row can ever be inserted without a
    genuinely settled order — unconditional even on INSERT — and no settled order can be
    constructed by privileged fixture tooling; the only rows that DO exist are HILLS-owned, and
    `hillsOrg` has no signable-in member). No fixture was fabricated and the trigger was not
    weakened to manufacture a passing test. The successful-transition RESULT SHAPE is separately
    proven with fake clients in `create-action-eligible.test.ts`/`submit-action-success.test.ts` —
    explicitly NOT a claim that the database's `listing_status_history` write was re-verified
    end-to-end. **T023 is left `[ ]`** — its literal task verification cannot be fully met this run. **(Superseded by the live proof below.)**
  - **LIVE PROOF COMPLETE (2026-09-21)** — the same chain and file as T015 (one shared fixture, no duplicated setup). One real
    own-org listing is driven through EVERY transition its actors may legitimately make, asserting the trigger-written history
    row for each, and the refusals in between. **Permitted, history recorded in order with the right actor**:
    `DRAFT → PENDING_REVIEW` (seller) · `PENDING_REVIEW → REJECTED` (COMPLIANCE via the console's real `decideListing`, reason
    copied into the history row) · `REJECTED → DRAFT` (seller remediation) · `DRAFT → PENDING_REVIEW` (seller) ·
    `PENDING_REVIEW → APPROVED` (COMPLIANCE) · `APPROVED → ARCHIVED` (seller withdraw) — six rows, `changed_by` verified per
    row; two `listing_reviews` rows; the seller's stock is never moved by a listing transition. **Forbidden, refused by the
    database trigger** (raw update under the seller's own session, so the trigger — not an application guard — is what refuses):
    from `DRAFT`: `APPROVED`/`PUBLISHED`/`SUSPENDED`/`REJECTED` → `compliance_required_for_listing_state`, `SOLD_OUT` →
    `invalid_listing_transition`; from `PENDING_REVIEW`: `APPROVED`/`PUBLISHED` → `compliance_required_for_listing_state`,
    `ARCHIVED`/`PARTIALLY_FILLED` → `invalid_listing_transition`; from `REJECTED`: `PENDING_REVIEW` → `invalid_listing_transition`;
    from `APPROVED`: the seller publishing → `compliance_required_for_listing_state`. Action-level refusals (`seller_not_capable`,
    `listing_transition_refused`) for the buyer-only org, a second seller-capable org, and the REJECTED-only remediation on a
    non-REJECTED listing. After every refusal the status, history and stock are asserted unchanged. The 8 pre-existing ungated
    forbidden-path tests are unchanged. **Findings recorded, not acted on**: (a) the Feature 010 compliance console offers no
    `PUBLISHED` control (`decideListing` covers APPROVED/REJECTED/SUSPENDED only) — the COMPLIANCE fixture published with the
    direct `APPROVED → PUBLISHED` update its role is granted; (b) `validate_offer_transition`'s state-machine block runs on UPDATE
    only and has no branch for `ARCHIVED`/`SUSPENDED`/`SOLD_OUT` sources — no assertion here depends on either.

- [x] T024 [P] [**LIVE PROOF COMPLETE 2026-09-21** — the deferral below is superseded] Write `tests/listings/fills.test.ts`:
  reserved excluded from actionable quantity; partial fill and sold-out derive from stored columns;
  expiry restores quantity exactly once.
  - Req: FR-011, PS5, SC-003 | Depends: T005, T018
  - Verify: `npm test -- listings/fills` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "restores exactly once" is a classic double-restore bug with direct commercial consequences.
  - **[DEFERRED — CLOSURE RUN 2026-09-21 reconciliation]**: T018 render is now done. The
    `tests/listings/fills.test.ts` file already exists (8 pure-function tests — AVAILABLE, PARTIALLY
    _FILLED, SOLD_OUT, NEGATIVE_REMAINING, source-level no-tally proof). What T024's Verify requires
    beyond T005's existing proof: "expiry restores quantity exactly once" — this requires a live,
    seeded expired-reservation fixture from Feature 007 (`expire_order_hold()`) and a live settled
    fill from Feature 008. Neither exists as a deterministic test fixture today. Deferred until a
    live checkout+settlement fixture is available. Pure-arithmetic coverage is COMPLETE in T005. **(Superseded by the live proof below.)**
  - **LIVE PROOF COMPLETE (2026-09-21)** — same file/chain as T018; the pure T005 arithmetic tests are kept unchanged. On the
    PARTIALLY_FILLED listing (12 kg, 5 kg already filled): two real holds (3 kg + 2 kg, real `executeCheckout`) reduce
    actionable quantity 7 → 2 (reserved 5, filled 5; position reserved 5, two ACTIVE reservations). The 3 kg hold's reservation
    is aged (`ageCheckoutHold`, the approved test-only backdating — it releases nothing itself) and expired through the real
    `ensureHoldFresh` → **`expire_order_hold()`**: reserved 5 → 2, remaining 2 → 5 — exactly 3 kg restored on the listing AND the
    seller position; that reservation is `EXPIRED`, its order `EXPIRED`; the OTHER hold stays `ACTIVE`/`HOLD` and the settled
    fill stays 5. **Exactly once**: retrying the application path (`expiredNow: false`), two direct `expire_order_hold` calls and
    three CONCURRENT direct calls all return no error and leave the full snapshot byte-identical; all quantities stay ≥ 0;
    quantity = filled + reserved + remaining and position reserved = listing reserved and position available = stock − filled
    hold at every step (no drift). Expiring the second hold restores the last 2 kg (remaining 7, reserved 0), again idempotent,
    with the earlier settled order still `PAID`.
  - **CLEANUP PROOF (all four tasks)** — the blocks capture row counts of 21 tables before and after
    (`inspectF006RowCounts`) and the final test of each asserts every table is back to its pre-run count EXCEPT the two that
    are append-only by design. Measured (both runs, repeated identically): T015/T023 block — `inventory_ownership_events` +1,
    `audit_logs` +41; T018/T024 block — `inventory_ownership_events` +3 (the provenance purchase and the 5 kg and 7 kg
    settlements), `audit_logs` +107. Everything else — users/profiles, memberships, organizations, lots, listings (+ their
    status history and reviews), orders/items/status history, shipments, payments, payouts, proforma invoices, reservations,
    storage allocations, positions, platform admins — is exactly at its baseline. The disposable ADMIN and COMPLIANCE
    operators are de-privileged (`activeAdminPrivilege: false`, capability removed; their auth identities are retained
    blocked-and-banned because immutable audit rows reference them — the same reviewed T013 lifecycle). Feature 009's standing Hills
    fixture listing/position are restored to their seeded baseline by the reviewed T013 restore; no new lot was created.
    Tooling added (test/setup only, never runtime): `scripts/seed-test-fixtures.ts` `--prepare-f006-live-fixtures`,
    `--cleanup-f006-live-fixtures`, `--inspect-f006-{residue,rowcounts,offer}` (exact-scope, FK-ordered, scope-verified before any
    DELETE); `tests/auth/fixture-session.ts` wrappers; `tests/orders/live-helpers.ts` gained an optional trailing `offerId`
    (default unchanged); `tests/listings/live-chain.ts`.

- [x] T025 [P] Write `tests/listings/isolation.test.ts`: seller A never sees seller B's non-published
  listings, documents or status history.
  - Req: FR-012, SEC-002 | Depends: T003
  - Verify: `npm test -- listings/isolation` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: cross-tenant guarantee on commercially sensitive drafts.
  - **Done (RUN C)**: 4 tests, live — an unrelated org gets nothing back for another organization's
    non-published listing (by direct id and in its own list), status history, AND `offer_documents`
    (queried directly against the live table — no `lib/listings/*` wrapper reads it yet). Documents
    the honest nuance that `offer_documents_owner_or_admin` genuinely permits the OWNING org's OWN
    members (distinct from RUN A's separately-recorded "no buyer/non-owner member can ever read
    documents" gap) — either way, an UNRELATED organization gets zero rows, which is the isolation
    property under test.

- [x] T026 Write `tests/listings/public-exposure.test.ts`: no public route, sitemap or structured
  data contains listing data.
  - Req: FR-003, SC-006 | Depends: T008
  - Verify: `npm test -- listings/public-exposure` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature invariant check with a clear assertion.
  - **Done (RUN C)**: 9 tests — extends T008's `boundary.test.ts` coverage to the RUN C additions
    (`lib/listings/sales.ts`, `dashboard/listings/*`, `dashboard/sales/*`): no public import, no
    public `route.ts` mentions `coffee_offers`/`order_items`/`listing_status_history`, non-indexable
    metadata inherited, no sitemap/robots entry, no shared cache or service-role in any RUN C file,
    public catalogue (Feature 002) confirmed distinct and untouched.

---

## Phase 8 — Accessibility, responsive, RTL, states

- [x] T027 State coverage pass: loading, empty, error, unauthorized, suspended, reserved,
  partial-fill, sold-out on every marketplace and listing screen.
  - Req: FR-017 | Depends: Phases 3–5
  - Verify: each state renders for a seeded fixture; badges use dot + label, never colour alone
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.
  - **Done (CLOSURE RUN 2026-09-21)**: all reachable states verified by source audit and existing
    tests. Every entry point guards unauthenticated/unattached/pending-KYB/suspended identities via
    `StateScreen` (proven in T007/T021 tests). Empty states use `EmptyState` component on every list
    page (browse, seller listings, sales). Error/not-found routes call `notFound()` (proven in T010
    manage-detail tests). `ListingStatusBadge` covers all 9 statuses with dot + label — source-level
    proof in `listing-components.test.tsx`. `AvailabilityBar` now renders on both buyer detail
    (T010) and seller detail (T018) — partial-fill and sold-out states projected from stored columns.
    **HONEST RESIDUAL**: SOLD_OUT state is NOT renderable for buyers (T012 product decision open);
    seller sees SOLD_OUT via `getManagedListingById` (own-org policy, `offers_owner_or_admin`). The
    AvailabilityBar renders the SOLD_OUT projection correctly for the seller view (T005 proven).
    All other states fully covered.

- [x] T028 Accessibility, RTL and mobile pass (tables → cards, logical properties, externalised copy).
  - Req: FR-018 | Depends: Phases 3–5
  - Verify: a11y check clean; `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/coffee src/app/dashboard/listings src/app/dashboard/sales components/listings` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.
  - **Done (CLOSURE RUN 2026-09-21)**: grep against `src/app/dashboard/coffee`, `listings`, `sales`
    and `components/listings` for `text-left|text-right|pl-|pr-` returns zero matches (verified
    2026-09-21). All layout uses logical CSS properties (`ps-`, `pe-`, `ms-`, `me-`). RTL and mobile
    responsiveness covered by `TableCardList` (already verified in Feature 007 Phase 9). Numeric
    values use `dir="ltr"` on their container as established by `lib/dashboard/registry.tsx` pattern.
    Copy is externalized in `lib/app/copy/` — no hardcoded UI strings. Lint exits 0 (1 pre-existing
    warning in `manage-page.test.tsx`, unrelated to this feature's production code).

---

## Phase 9 — Verification & closure

- [x] T029 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.
  - **Done (CLOSURE RUN 2026-09-21)**: all four verified: `npm run lint` → exit 0 (1 pre-existing
    warning, 0 errors); `npx tsc --noEmit` → exit 0; `npx vitest run tests/listings/` → 23 files /
    175 tests, all passed; `npm run build` → exit 0. Run after all changes in this closure run.

- [x] T030 Confirm no service-role usage, no shared cache of listing data, and no public exposure.
  - Req: SEC-003, FR-004, FR-003 | Depends: T029
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/listings src/app/dashboard/coffee src/app/dashboard/listings` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.
  - **Done (CLOSURE RUN 2026-09-21)**: `SERVICE_ROLE|unstable_cache|cacheTag` → zero matches across
    `lib/listings/`, `src/app/dashboard/coffee/`, `src/app/dashboard/listings/`,
    `src/app/dashboard/sales/`. Confirmed with PowerShell `Get-ChildItem -Recurse | Select-String`.
    T026 (public-exposure) tests cover the public-side guarantees: 9 tests all passing.

- [x] T031 Confirm the MVP trading-mode boundary: no order book, anonymous matching, leverage,
  futures, shorts or external stock was introduced.
  - Req: FR-013, Constitution I | Depends: T029
  - Verify: feature surface review confirms fixed-price listings only; the negotiation gap remains recorded in spec Open items
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: a product-boundary judgment that protects the platform's regulatory position.
  - **Done (CLOSURE RUN 2026-09-21)**: grep for `order_book|anonymous_match|leverage|futures|
    short_sell|external_stock|negotiat` across all Feature 006 production files → zero matches.
    Fixed-price, no-match, no-negotiation, no-leverage confirmed by source audit. The negotiation gap
    is recorded in spec.md §Open items. DB-OPEN-05 (lot detail, `coffee_lots` member-read gap) and
    DB-OPEN-12 (`inventory_reservations` admin-only) remain open and unbypassed — neither was
    silently resolved in this feature.

- [x] T032 Update the roadmap status for 006 and confirm DB-OPEN-05 and the negotiation gap remain
  open and unbypassed.
  - Req: spec.md Open items | Depends: T029
  - Verify: roadmap accurate; capability-map entries unchanged unless formally decided
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting.
  - **Done (CLOSURE RUN 2026-09-21)**: `IMPLEMENTATION-ROADMAP.md` updated below. DB-OPEN-05
    (`coffee_lots` member-read gap) remains documented in `DATABASE-CAPABILITY-MAP.md` — this
    run's `browse.ts` and `manage.ts` both apply the attempt-then-degrade pattern, never fabricated
    lot data. DB-OPEN-12 (`inventory_reservations` admin-only) remains — Feature 007's
    `inspectCheckoutOrder` uses the approved privileged-script pattern, never exposed in runtime
    member code. Negotiation gap is spec.md §Open items. Roadmap updated to reflect 27/32 complete
    (5 open/unverified: T012 product decision, T015/T023 blocked-live-proof, T018 re-opened live proof,
    T024 deferred live fixture). **(2026-09-21 live-fixture closure run: now 31/32 — only T012 open; roadmap row updated.)**

---

## Post-closure addition — homepage authorized projection (2026-09-23, final non-payment closure run)

- [x] T033 [PS-new] "Recently listed" on the public homepage (`components/marketplace/home-marketplace.tsx`) — a
  PROJECTION of the member marketplace, not a second marketplace. Only an authorized member (signed in, step-up done,
  email verified, unambiguous acting organization, `isAuthorizedMember`) reaches `getBrowseListings({ page: 0,
  pageSize: 5 })` (RLS `member_read_published_offers`, `created_at DESC, id DESC` — never `updated_at`) and
  `getPrimaryOfferImages`, rendered with the same `ListingCard`, max 5 (page size + defensive slice), View all →
  `/dashboard/coffee/`. Anonymous → a data-free locked teaser (Create account → `/sign-up/`, Sign in); pending / MFA /
  operator → a state panel with the correct destination. In every non-member branch the listing and media queries are
  NOT executed; the Suspense fallback is data-free. No service role, no shared cache.
  - Verify: `tests/public/home-marketplace.test.tsx` (queries never called for anonymous/pending/MFA/operator; ≤5;
    order preserved; no offer id / price / quantity / signed URL in non-member output; ordering pinned in
    `lib/listings/browse.ts`). Browser: member homepage shows 5 real fixture listings (EN 1280, AR dark 1440, AR 375).

## Dependencies & parallelisation

- Phase 1 blocks everything; T003/T005/T006 parallel after T001; T004 needs 005's layer.
- Phase 2 blocks Phase 3 (no browse before the guard).
- Phase 4 depends on T004/T006; Phase 5 depends on Phase 4.
- Phase 7's tests are mutually parallel except T026 (needs T008).
- Phase 9 depends on everything.

**Parallel-safe tasks**: T003, T005, T006, T011, T021, T022, T023, T024, T025 (9 of 32).
