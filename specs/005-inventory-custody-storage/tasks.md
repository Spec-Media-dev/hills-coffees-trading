# Tasks: Inventory, Custody & Storage (005)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §7 (LOT-01..LOT-04, DEL-01).

**Status**: **RUN B (2026-09-12) COMPLETE — Phase 1 (T001–T006, RECONCILED) + Phase 2 (T007–T012) +
Phase 4 (T015), 13/25 tasks.** Phase 3 (T013–T014, custody trust/variance — depends on 010's
warehouse model, not yet built), Phase 5 (T016–T019, formal release-blocking isolation suite),
Phase 6 (T020–T021, formal a11y/RTL/mobile closure) and Phase 7 (T022–T025, final closure) remain
NOT STARTED. See [IMPLEMENTATION-HANDOFF.md](./IMPLEMENTATION-HANDOFF.md) for full evidence,
including the Phase 1 reconciliation (owned-quantity semantics, DB-OPEN-12) and RUN B's UI/module
registration decisions — read before starting Phase 3/5.
**Prerequisite**: 001, 003, 004 implemented. This feature ships **zero mutations**.

## Task format

```
- [ ] T0NN [P?] [PSn?] Description (file path)
  - Req: FR-xxx / SEC-xxx / SC-xxx | Depends: T0NN
  - Verify: concrete, checkable condition
  - Codex: GPT-5.6 Sol — Low|Medium|High · Claude: Sonnet|Opus — Low|Medium|High
  - Why: reason for the difficulty/model choice
```

---

## Phase 1 — Inventory domain read layer

- [x] T001 Create `lib/inventory/types.ts` — DTO types for positions, allocations, ownership events
  and availability breakdown (owned / reserved / available, with cause labels).
  - Req: FR-001, FR-002 | Depends: —
  - Verify: no DTO field is derived arithmetic; each maps to a database column
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a known schema.
  - **CLOSURE (2026-09-12)**: `inventory_positions` has ONLY TWO quantity columns
    (`available_quantity_kg`, `reserved_quantity_kg`) — confirmed exhaustively against the live
    `database-schema-report.json`; there is NO `owned_quantity_kg` column, and no view exists
    (`views: []`). No function returns a distinct "owned" figure either. Both raw columns are exposed
    verbatim, under names mirroring the database's own columns; no third "owned"/"truly free" figure
    is synthesized, and no arithmetic combines them. Full reasoning, with the corrected live-function
    evidence below, is in `lib/inventory/types.ts`'s own header comment.
  - **RECONCILIATION (2026-09-12)**: an earlier pass of this closure note cited the static
    `supabase/trading_schema.sql` file and concluded `reserved_quantity_kg` "is written by no
    function." **That was wrong and is retracted.** Re-tracing the LIVE function bodies
    (`docs/database/database-schema-report.json`'s `functions[].definition` — the canonical
    authority) proves `reserved_quantity_kg` IS actively written: `checkout_order` increments it when
    a reservation is created (after validating
    `(available_quantity_kg - reserved_quantity_kg) < quantity_kg` — the database's own proof that
    `available_quantity_kg` is the position's TOTAL/gross owned quantity), `expire_order_hold`
    decrements it on hold expiry, and `admin_review_payment` debits both columns together on the
    seller's position at settlement while crediting the buyer's `available_quantity_kg` on a
    new/existing position. "Every live position reads `reservedQuantityKg: 0` today" remains true only
    as a DATA fact (the table has zero rows before Features 007/008 create real orders) — it does NOT
    mean no function writes the column. No DTO/code change was required (the two raw columns were
    already exposed verbatim in RUN A); only this note and `lib/inventory/types.ts`'s header comment
    needed correcting to cite the verified live evidence instead of the stale static-file citations.

- [x] T002 Implement `lib/inventory/positions.ts` — paginated, org-scoped reads of
  `inventory_positions` joined to lot/coffee/warehouse context, degrading honestly when lot detail is
  unreadable (DB-OPEN-05).
  - Req: FR-001, FR-002, FR-011, SEC-001 | Depends: T001
  - Verify: quantities are passed through unmodified; with lot detail unreadable the function still returns position rows
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the pass-through-not-recompute discipline plus graceful degradation around a known policy defect needs careful judgment.
  - **CLOSURE (2026-09-12)**: DB-OPEN-05 reconfirmed LIVE and OPEN — `coffee_lots`'
    `member_read_trade_lots` policy predicate (`co.lot_id = co.id`, a self-comparison inside
    `coffee_offers`, never satisfying the actual lot being looked up) read directly from the live
    schema report; still recorded open in `docs/architecture/DATABASE-CAPABILITY-MAP.md`. Bounded via
    `.range()` (page size capped 1–100, default 25), deterministic `order by created_at desc, id
    desc`. Acting-organization scoping is explicit (`.eq("owner_organization_id", organizationId)`)
    on top of RLS, since `is_org_member()` alone would span every organization a multi-org caller
    belongs to. Warehouse context deliberately excludes `address` (not required by spec.md, kept
    conservative despite the column being publicly readable). Proven with a fake-client unit test
    (exact quantity/lot-null/lot-resolved/pagination assertions) and a live test against the real
    (currently empty) table (no error, honest empty page, cross-org id also empty).

- [x] T003 [P] Implement `lib/inventory/allocations.ts` — org-scoped `storage_allocations` reads with
  approved status labels and released-vs-allocated quantities.
  - Req: FR-001, FR-006 | Depends: T001
  - Verify: all three states render their exact approved labels; released quantity is distinct from allocated
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused read module over an explicit vocabulary.
  - **CLOSURE (2026-09-12)**: `status`'s CHECK constraint (`STORED`/`RELEASED`/`DELIVERED`) confirmed
    directly against the live schema report and passed through verbatim — no renaming, no invented
    fourth value. `quantityKg`/`releasedQuantityKg` proven independent with a genuine PARTIAL-release
    fixture (quantity 60, released 25) — not merely two fields that happen to be equal.

- [x] T004 [P] Implement `lib/inventory/ownership.ts` — chronological, read-only projection of
  `inventory_ownership_events` where the org is source or destination, with counterparty redaction
  where not permitted.
  - Req: FR-001, FR-005, SEC-005 | Depends: T001
  - Verify: events for both directions are returned; a counterparty the member may not see is redacted rather than omitted
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: redaction-vs-omission is a subtle privacy decision that affects what members can infer.
  - **CLOSURE (2026-09-12)**: RLS confirmed exactly as planned (`is_platform_admin() OR
    is_org_member(to_organization_id) OR is_org_member(from_organization_id)`). Redaction resolved
    correctly: `organizations`' own RLS (`organizations_member_select`) only ever lets a member read
    their OWN org's row, so a genuine counterparty's `display_name` is unreadable by direct query —
    proven with a fixture where the acting org's own name resolves but the counterparty's is
    `redacted: true` with `organizationId` still present (never dropped). No update/delete/reorder
    helper exists anywhere in this file — the module exports only reads.

- [x] T005 Implement `lib/inventory/availability.ts` — labels reserved quantity with its cause using
  only readable sources (`inventory_reservation_items` via `can_view_order`, `orders.hold_expires_at`);
  contains **no** arithmetic re-deriving availability.
  - Req: FR-002, FR-007, PS4 | Depends: T002
  - Verify: `grep -nE "[-+*/]\s*(available|reserved)_quantity" lib/inventory/availability.ts` returns nothing; reservation cause resolves without querying `inventory_reservations`
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is where a well-meaning agent would most likely reintroduce a client-side inventory calculation — exactly what LOT-02 forbids.
  - **CLOSURE (2026-09-12)**: the exact structural audit grep returns nothing. `inventory_reservations`
    is never queried through a privileged path — confirmed by source inspection (no `SERVICE_ROLE`
    anywhere in the file) — it IS read, but only through the caller's own ordinary session, exactly as
    documented in the file's own header.
  - **RECONCILIATION (2026-09-12) — CONFIRMED LIVE, TRACKED AS DB-OPEN-12**: the original closure note
    above (this same date) framed the RLS-chain concern as "theoretical, not live-provable." It has
    since been proven, empirically, live. Synthetic rows (a warehouse, coffee_lot, coffee_offer,
    inventory_position, order, inventory_reservation, inventory_reservation_item) were seeded through
    the approved service-role setup/teardown pattern (setup and teardown only — never as the reading
    identity), then read back through THREE real, non-privileged, authenticated fixture sessions
    (`signInWithPassword`): the order's buyer, the offer's seller, and an unrelated cross-org member.
    Result: the buyer correctly read the parent `orders` row (`hold_expires_at` visible — proving
    `can_view_order`/`orders_view` work exactly as designed) but got ZERO rows from
    `inventory_reservation_items` for the matching reservation and zero from `inventory_reservations`
    (expected, admin-only) — despite a service-role sanity read confirming the row genuinely existed.
    The seller and unrelated-org sessions got zero rows everywhere, as the negative control requires.
    All synthetic rows were deleted immediately after. **Conclusion: `inventory_reservation_items` is
    confirmed unreadable for every non-admin member today**, tracked as `DB-OPEN-12` in
    `docs/architecture/DATABASE-CAPABILITY-MAP.md` — a distinct capability gap from DB-OPEN-05, though
    structurally similar (a plain, non-`SECURITY DEFINER` subquery against an admin-only table). Per
    the approved degradation contract, this does NOT block T005: the authoritative `reservedQuantityKg`
    remains visible (read directly off `inventory_positions`, which members CAN read), and the
    reservation *cause* (order id/code/`hold_expires_at`) honestly and permanently degrades to
    `{ kind: "unknown" }` for every member today — never fabricated, never worked around with a
    privileged read. T005's task wording above ("labels reserved quantity with its cause using...
    `inventory_reservation_items` via `can_view_order`") is corrected by this note: the code still
    *attempts* that approved chain exactly as written (forward-compatible if the policy is ever fixed),
    but the cause it can actually deliver today is `unknown` in every real case, not merely a rare
    edge case. **T005 remains COMPLETE** against the corrected, honest contract (truthful degradation,
    not silent omission and not a fabricated cause) — it would NOT be complete against a stronger,
    uncorrected reading of the original wording that implied causes are usually resolvable today.

- [x] T006 Expose the eligibility inputs 006 needs (owned, unreserved, Hills-custody quantity per
  position/lot) without encoding 006's listing rules.
  - Req: FR-010 | Depends: T002, T005
  - Verify: the exported shape contains quantities and custody facts only — no `isEligibleToList` decision
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: drawing the boundary between "facts" and "rules" correctly keeps 006 from being duplicated here.
  - **CLOSURE (2026-09-12)**: `getInventoryEligibilityFacts` (`lib/inventory/availability.ts`) exports
    `positionId`/`lotId`/`ownerOrganizationId`/`warehouseId`/`availableQuantityKg`/`reservedQuantityKg`
    only. No `isEligibleToList`/`canList`/`listingAllowed`/`canResell` symbol is declared anywhere in
    `lib/inventory/*` (proven by test, checking actual declarations, not mere mentions in doc
    comments explaining the deliberate omission). A "Hills-approved custody" boolean was deliberately
    NOT included — the approved schema has no direct representation of it (only
    `warehouses.is_active`, a narrower fact); documented in `types.ts` rather than approximated via an
    assumed join.

---

## Phase 2 — Member inventory surfaces

- [x] T007 [PS1] Implement `src/app/dashboard/inventory/page.tsx` — positions list with owned,
  reserved and available quantities, warehouse and lot context, paginated.
  - Req: FR-001, FR-003, FR-012, FR-013 | Depends: T002, T005
  - Verify: every quantity renders with unit; zero positions renders the honest empty state
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard list page over the DTO layer.
  - **CLOSURE (2026-09-12, RUN B)**: Server Component, reads exclusively through
    `getInventoryPositions` (`lib/inventory/positions.ts`), bounded `?page=` pagination (25/page).
    Only two quantity labels are shown — "Owned quantity" and "Reserved quantity" — per the
    reconciled labeling decision (see T001's note): there is no third "available" figure to show, and
    none is fabricated. Lot/warehouse context degrades honestly (DB-OPEN-05) via the existing
    `lot: null`/`warehouse: null` states — never a fabricated value. Uses
    `components/dashboard/responsive/table-card-list.tsx` (Feature 004's shared primitive) — table on
    desktop, cards at mobile, zero new responsive logic.

- [x] T008 [PS1] Implement `src/app/dashboard/inventory/[positionId]/page.tsx` — position detail with
  the availability breakdown and reservation causes.
  - Req: FR-002, FR-007, PS4 | Depends: T005, T007
  - Verify: a position with an active reservation shows reserved excluded from available, with its cause
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the availability presentation is the member's mental model of the inventory invariant; must be unambiguous.
  - **CLOSURE (2026-09-12, RUN B)**: added `getInventoryPositionById` to `lib/inventory/positions.ts`
    — org-scoped exactly like the list, so a nonexistent id and a cross-org id return the identical
    `null`; the page calls `notFound()` for both with no branching that could leak which case
    occurred. `notFound()` resolves to `src/app/dashboard/not-found.tsx` (new — see below), staying
    inside the authenticated `AppShell`. Renders `AvailabilityBreakdown` (T009) for the resolved
    breakdown; DB-OPEN-05 lot-unavailable and DB-OPEN-12 reservation-cause-unknown states both render
    without crashing (proven by `tests/inventory/run-b-ui.test.tsx`).

- [x] T009 [P] [PS1] Build `components/inventory/availability-breakdown.tsx` (owned / reserved /
  available with cause labels and units).
  - Req: FR-003, PS4 | Depends: T001
  - Verify: renders all three figures with units and never shows a negative value
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused presentational component with clear rules.
  - **CLOSURE (2026-09-12, RUN B) — TASK WORDING CORRECTED**: renders exactly TWO figures ("owned" /
    "reserved"), not three — per the Phase 1 reconciliation, no authoritative "available to trade now"
    figure exists without `owned - reserved` arithmetic, which this component never performs (proven
    by structural test). A genuine negative value (which the DB's own CHECK constraints should make
    impossible) is never silently clamped via `Math.max(0, ...)` — it renders a controlled
    data-integrity `Alert` instead, exactly as the run directive requires. Reservation cause renders
    `{ kind: "unknown" }` as an honest "unavailable right now" message (DB-OPEN-12), never as "no
    reservation."

- [x] T010 [PS2] Implement `src/app/dashboard/storage/page.tsx` — custody allocations with approved
  state labels, linked to originating order items where permitted.
  - Req: FR-006, PS2 | Depends: T003
  - Verify: `STORED`/`RELEASED`/`DELIVERED` all render correctly; links resolve only where `can_view_order` permits
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: straightforward list over an explicit vocabulary.
  - **CLOSURE (2026-09-12, RUN B)**: `STORED`/`RELEASED`/`DELIVERED` render via the new
    `StorageStatusBadge` (dot + text, exact DB vocabulary, no fourth value). Allocated/released
    quantities are two independent columns, never one derived from the other.
  - **RECONCILIATION (2026-09-12) — ORDER LINK GAP CLOSED**: the original closure above shipped with
    no order reference at all, reasoning that `lib/inventory/allocations.ts` did not join
    `order_items`/`orders`. Re-audited: `storage_allocations.order_item_id` → `order_items.id`
    (`order_items_view`: `can_view_order(order_id)`) → `order_items.order_id` → `orders.id`
    (`orders_view`: `can_view_order(id)`) is a GENUINE, member-readable chain — unlike DB-OPEN-12's
    `inventory_reservation_items`, both policies call `can_view_order()` directly at the top level,
    with no nesting into an admin-only table. Empirically proven live (service-role setup/teardown
    only; real authenticated read as the allocation's owning-org buyer and as an unrelated cross-org
    member, synthetic rows deleted immediately after): the buyer read the full chain through to
    `orders.order_code`; the unrelated member got zero rows at every step. `getStorageAllocations`
    (`lib/inventory/allocations.ts`) now resolves this chain (`resolveOrderContext`, a new
    `StorageAllocationOrderContext` field on `StorageAllocation`) and the storage page renders the
    order CODE as plain reference text (never a hyperlink — no `/dashboard/orders/[id]` or equivalent
    destination exists yet in this codebase; linking to a nonexistent route would itself be the
    "guessed/fabricated relationship" the run directive forbids). `null`/"Order reference unavailable"
    renders when there is no order_item or the order genuinely is not readable — never a raw id, never
    a guess. Proven by 4 new tests in `tests/inventory/run-b-ui.test.tsx`.

- [x] T011 [PS3] Implement `src/app/dashboard/inventory/history/page.tsx` — the append-only ownership
  ledger view with type, quantity, timestamp, reason and correlation ID.
  - Req: FR-005, PS3, SEC-005 | Depends: T004
  - Verify: the page exposes no edit/delete/reorder control; reason text is escaped
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: an immutable-evidence surface where accidentally offering a mutation affordance would contradict LOT-03.
  - **CLOSURE (2026-09-12, RUN B)**: no top-level nav entry (discoverable from the inventory list
    page's header action, per the run directive); no edit/delete/reorder control anywhere on the page
    or in `LedgerTimeline` (proven by structural test — no `onClick`/`<button>`/`<Button>` in the
    timeline component). Reason/correlation text renders as plain React text (default escaping),
    never `dangerouslySetInnerHTML`.

- [x] T012 [P] Build `components/inventory/ledger-timeline.tsx` rendering events with monospace
  correlation IDs and closed-vocabulary event types.
  - Req: FR-003, FR-005 | Depends: T001
  - Verify: all five event types render their approved labels; correlation IDs are monospaced
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: presentational component with an explicit vocabulary.
  - **CLOSURE (2026-09-12, RUN B)**: all five `OwnershipEventType` values have a localized EN/AR
    label; correlation id rendered `font-mono`/`dir="ltr"`. Redacted counterparty renders the safe
    "Another organization" wording (never the real name, never dropped the event) — proven by test.

---

## Phase 3 — Custody trust & variance surfacing

- [ ] T013 [PS5] Confirm with 010's warehouse model how holds/variances/quarantine are represented in
  the approved schema; implement surfacing **only** for representations that actually exist.
  - Req: FR-009, PS5 | Depends: T002
  - Verify: no invented status field is introduced; if no representation exists, the finding is recorded in spec.md Open items rather than fabricated
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — High
  - Why: the honest answer may be "the schema does not represent this yet" — recognising that instead of inventing a field is the whole point.

- [ ] T014 [PS5] Where a hold/variance exists, block dependent member actions (listing, delivery
  request) with a clear server-side refusal and reason.
  - Req: FR-009, PS5 | Depends: T013
  - Verify: with an affected position seeded, the dependent action is refused server-side, not merely hidden
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: LOT-04 requires unsafe stock to stop trading; a UI-only block would violate it.

---

## Phase 4 — Module registration & overview contributions

- [x] T015 Register `inventory` and `storage` nav entries and the "what did I buy" / "where is it"
  overview cards with 004's module contract.
  - Req: FR-012 | Depends: T007, T010
  - Verify: entries appear for member organizations; bounded summary queries only (no full scans)
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: contract-conformant registration with a performance constraint.
  - **CLOSURE (2026-09-12, RUN B)**: `lib/dashboard/registry.tsx` gains a real "inventory" module
    (`requiredCapability: "buy"`) with `/dashboard/inventory` and `/dashboard/storage` nav entries —
    no history entry (discoverable from the inventory page).
  - **RECONCILIATION (2026-09-12) — OVERVIEW CARDS MOVED INTO THE MODULE CONTRACT**: the original
    closure composed the "what did I buy"/"where is it" summary cards directly in
    `src/app/dashboard/page.tsx`, reasoning that `composeOverview` was a pure synchronous function and
    forcing it async for one module was too large a change. Re-examined: that reasoning under-weighted
    the cost of establishing a SECOND, page-specific overview-integration path the very first time a
    real module existed — exactly what Feature 004's module contract was designed to prevent. Fixed
    with the smallest safe extension: `DashboardModule.overviewCards`/`actionItems`
    (`lib/dashboard/modules.ts`) may now return their result directly OR as a `Promise`, and
    `composeOverview` (`lib/dashboard/overview.tsx`) is `async`, resolving every granted module's
    contribution concurrently (`Promise.all`, preserving deterministic per-module order). A module
    function still receives ONLY `{ organization }` — no ambient state, no shared cache, no
    authorization change; declaration remains presentational only. The "inventory" module's
    `overviewCards` now performs the two bounded COUNT-only reads itself
    (`getInventoryPositionsCount`/`getStoredAllocationsCount`), directly through the module contract —
    `src/app/dashboard/page.tsx` is back to a plain `await composeOverview(...)` with no
    Feature-005-specific merge step. A zero count still contributes no card (never a fabricated zero).
    All 5 pre-existing Feature 004 test files were updated to `await composeOverview(...)` (a
    mechanical, required change now that the function returns a `Promise`) and — for the 3 that feed
    the REAL `DASHBOARD_MODULES` registry through it — to mock `@/lib/supabase/server` with the same
    fake-table technique `tests/inventory/*.test.ts` already established, since the real registry now
    contains a module that performs a real (mocked) database read; every original assertion/guarantee
    those tests proved is unchanged and still passes. 3 new tests prove the positive path: real
    non-zero counts surface through the contract, zero counts contribute nothing, and a `canBuy: false`
    organization gets no inventory overview contribution at all. `tests/dashboard/registry.test.tsx`
    and `tests/design/uif-f.test.tsx` were separately updated (unrelated to the async change) to
    reflect the genuinely-new "inventory"/"storage" routes (previously asserting no business module
    existed yet — now honestly outdated).

---

## Phase 5 — Automated tests

- [ ] T016 [P] Write `tests/inventory/isolation.test.ts`: org A cannot read org B's positions,
  allocations or ownership events.
  - Req: SEC-002, SC-002 | Depends: T002, T003, T004
  - Verify: `npm test -- inventory/isolation` passes; every cross-org read returns empty
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the release-blocking tenant-isolation guarantee for commercial data.

- [ ] T017 [P] Write `tests/inventory/quantity-fidelity.test.ts`: displayed quantities equal database
  columns exactly; no recomputation.
  - Req: FR-002, SC-001 | Depends: T002, T005
  - Verify: `npm test -- quantity-fidelity` passes; the test fails if arithmetic is introduced into the read layer
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: this test is the durable guard against re-deriving the inventory invariant.

- [ ] T018 [P] Write `tests/inventory/ledger-immutability.test.ts`: an attempted update/delete on
  `inventory_ownership_events` is refused by the database.
  - Req: FR-005, SC-003 | Depends: T004
  - Verify: `npm test -- ledger-immutability` passes with the database raising on mutation
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: proves the append-only guarantee at the real boundary rather than trusting the UI.

- [ ] T019 Write `tests/inventory/degradation.test.ts`: with lot detail unreadable (DB-OPEN-05
  condition), position pages still render with an explicit unavailability note.
  - Req: FR-011 | Depends: T002, T008
  - Verify: `npm test -- degradation` passes; no fabricated lot values appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused test of a documented degradation path.

---

## Phase 6 — Accessibility, responsive, RTL

- [ ] T020 Responsive pass: inventory/storage/ledger tables collapse to card lists at mobile using
  004's shared helper.
  - Req: FR-014 | Depends: Phase 2
  - Verify: at mobile width no horizontal table scroll is required; touch targets ≥ 44×44px
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: reuses an existing helper across several tables.

- [ ] T021 Accessibility + RTL pass: table semantics, status badges as dot + label, keyboard
  traversal, logical CSS properties, externalised copy.
  - Req: FR-003, FR-014 | Depends: Phase 2
  - Verify: automated a11y check clean; `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/inventory src/app/dashboard/storage components/inventory` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but mechanical.

---

## Phase 7 — Verification & closure

- [ ] T022 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T023 Confirm this feature ships zero mutations and no service-role usage.
  - Req: SEC-001, SEC-003 | Depends: T022
  - Verify: `grep -rn "\"use server\"\|SERVICE_ROLE" src/app/dashboard/inventory src/app/dashboard/storage lib/inventory` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical structural check of a deliberate read-only scope.

- [ ] T024 Confirm no inventory data is cached and none is reachable from a public route.
  - Req: FR-008, SEC-004, SC-005, SC-007 | Depends: T022
  - Verify: `grep -rn "cacheTag\|unstable_cache" lib/inventory src/app/dashboard/inventory src/app/dashboard/storage` returns nothing; no public page imports `lib/inventory/*`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical grep verification of two constitutional rules.

- [ ] T025 Update the roadmap and re-confirm DB-OPEN-05 status (still open unless formally resolved).
  - Req: spec.md Open items | Depends: T022
  - Verify: roadmap row accurate; capability-map entry unchanged unless a decision was recorded
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting on an unresolved database question.

---

## Dependencies & parallelisation

- Phase 1 blocks everything; T003/T004 are mutually parallel after T001; T005 needs T002.
- Phase 2 pages depend on their respective read modules; T009/T012 are parallel components.
- Phase 3 depends on a real answer from 010's model (T013 gates T014).
- Phase 5 tests are mutually parallel except T019 (needs T008).
- Phase 7 depends on everything.

**Parallel-safe tasks**: T003, T004, T009, T012, T016, T017, T018 (7 of 25).
