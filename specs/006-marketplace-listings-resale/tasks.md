# Tasks: Marketplace, Seller Listings & Resale (006)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), `docs/architecture/DATABASE-CAPABILITY-MAP.md`,
`.specify/memory/constitution.md` (v2.0.0), SRS §8 (MKT-01..MKT-07), AC-01/AC-02.

**Status**: all tasks unchecked — implementation NOT started.
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

- [ ] T001 Create `lib/listings/types.ts` — DTOs for browse listing, managed listing, fill state and
  eligibility result (eligible quantity **or** a named refusal reason).
  - Req: FR-002, FR-011 | Depends: —
  - Verify: remaining-quantity fields map to stored columns; no derived-tally field exists
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical typing against a known schema.

- [ ] T002 Implement `lib/listings/browse.ts` — buyer-facing reads relying on the database's
  published-only policy, with filtering/pagination.
  - Req: FR-001, FR-002, FR-004 | Depends: T001
  - Verify: the module applies no client-side status filter that could mask a policy failure; a non-published row is never returned even when explicitly requested by id
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the read path that AC-01 depends on; masking rather than relying on RLS would create a false sense of safety.

- [ ] T003 [P] Implement `lib/listings/manage.ts` — seller-facing reads for their own organization
  across all states, with status history.
  - Req: FR-012 | Depends: T001
  - Verify: returns own-org rows only; a cross-org id request returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the "all states" path must be provably org-scoped since it can return non-public rows.

- [ ] T004 Implement `lib/listings/eligibility.ts` — composes 005's inventory facts into the SRS §8.1
  listing rule, returning eligible quantity or a specific named refusal.
  - Req: FR-006, FR-007, PS3 | Depends: T001, 005's read layer
  - Verify: each refusal reason is specific (not owned / not Hills-sourced / reserved / insufficient), naming the available quantity where relevant
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: encodes the MVP resale-eligibility rule; a permissive bug here allows listing stock the platform does not control.

- [ ] T005 [P] Implement `lib/listings/fills.ts` — remaining/partial/sold-out projection from stored
  `quantity_kg`, `reserved_quantity_kg`, `filled_quantity_kg`.
  - Req: FR-011, PS5 | Depends: T001
  - Verify: `grep -n "reduce(\|+=" lib/listings/fills.ts` shows no accumulation over rows; all figures come from columns
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the temptation to tally fills in the app is exactly what would drift from the database.

- [ ] T006 [P] Create `lib/listings/validation.ts` — Zod schemas for listing create/edit (title,
  quantity, price per kg, currency, warehouse/location, coffee/lot references).
  - Req: FR-016 | Depends: T001
  - Verify: schema rejects non-positive quantity/price and unknown currency
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical schema.

---

## Phase 2 — Marketplace access control

- [ ] T007 [PS1] Implement the marketplace route guard: every route under `/dashboard/coffee`
  verifies `is_authorized_member()` and organization status server-side before any data read.
  - Req: FR-001, SEC-001, SC-001 | Depends: T002
  - Verify: anonymous, pending-KYB and suspended fixtures each receive zero listing data; the check runs before the query, not after
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: this is the AC-01 release-blocking boundary for the private marketplace.

- [ ] T008 [PS1] Add non-indexable metadata and confirm zero marketplace data is reachable from any
  public surface (coordinating with 002's sitemap/robots).
  - Req: FR-003, FR-014, SC-006 | Depends: T007
  - Verify: `/dashboard/coffee` is non-indexable; 002's sitemap contains no listing route; no public module imports `lib/listings/*`
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Medium
  - Why: small change, but it enforces a cross-feature invariant worth a second look.

---

## Phase 3 — Marketplace browse & detail

- [ ] T009 [PS2] Implement `src/app/dashboard/coffee/page.tsx` — listing browse with search/filter,
  paginated, showing quantity, price per kg with currency, and seller type.
  - Req: FR-002, FR-004, PS2 | Depends: T002, T007
  - Verify: only published/partially-filled listings render; figures carry units/currency; no shared cache is used
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: standard list page over a guarded read layer.

- [ ] T010 [PS2] Implement `src/app/dashboard/coffee/[offerId]/page.tsx` — listing detail with
  quality/sensory context, remaining quantity, and the purchase entry point handing off to 007.
  - Req: FR-002, FR-010, PS2 | Depends: T002, T005, T007
  - Verify: remaining quantity comes from `fills.ts`; the purchase CTA carries no client-trusted quantity into 007
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: the hand-off point where an advisory figure could wrongly become an authoritative input.

- [ ] T011 [P] [PS2] Build `components/listings/availability-bar.tsx` and `listing-card.tsx` showing
  listed / reserved / filled / remaining with units.
  - Req: FR-011, PS2 | Depends: T005
  - Verify: a partially-filled fixture renders all four figures correctly; never a negative remainder
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: focused presentational component with explicit inputs.

- [ ] T012 [PS4] Render `SOLD_OUT` and `SUSPENDED` listing detail states with no purchase action.
  - Req: FR-008, FR-017, PS4 | Depends: T010
  - Verify: reaching either state directly by URL renders the state and offers no action
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: state coverage with a clear expected outcome.

---

## Phase 4 — Seller listing creation

- [ ] T013 [PS3] Implement `src/app/dashboard/listings/new/page.tsx` — eligible-inventory picker
  driven by `eligibility.ts`, showing why ineligible quantity cannot be listed.
  - Req: FR-006, FR-015, PS3 | Depends: T004
  - Verify: ineligible positions show a specific named reason; eligible quantity matches 005's facts
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: the refusal copy must be specific and correct — the design system's "name what is missing" rule applied to eligibility.

- [ ] T014 [PS3] Implement the listing-create Server Action (`listings/new/actions.ts`) following
  001's contract: validate → authenticate → verify `organization_can_sell()` → verify SRS §8.1
  eligibility → insert `coffee_offers` as `DRAFT`.
  - Req: FR-005, FR-006, FR-016, SEC-005, SC-002 | Depends: T004, T006
  - Verify: direct invocation with a `can_sell = false` fixture is refused; direct invocation claiming unowned/reserved/non-Hills quantity is refused
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: the single most abusable write in this feature — it decides what enters the marketplace.

- [ ] T015 [PS3] Implement submit-for-review (`DRAFT → PENDING_REVIEW`) via a permitted write the
  `validate_offer_transition` trigger accepts.
  - Req: FR-009, PS3 | Depends: T014
  - Verify: successful submit records a `listing_status_history` row written by the database; a forbidden transition is refused by the trigger and surfaced as a safe error
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: transition legality is owned by the database; the action must cooperate with it, not pre-empt it.

---

## Phase 5 — Seller listing management & lifecycle

- [ ] T016 [PS4] Implement `src/app/dashboard/listings/page.tsx` — the seller's listings across all
  states with approved labels and status history.
  - Req: FR-008, FR-012, PS4 | Depends: T003
  - Verify: all nine approved statuses render their exact labels; only own-org listings appear
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: list page with a closed vocabulary to honour.

- [ ] T017 [PS4] Implement `src/app/dashboard/listings/[offerId]/page.tsx` + actions — edit while
  permitted, withdraw where the trigger allows, and display the compliance reason for `REJECTED`.
  - Req: FR-008, FR-009, PS4 | Depends: T003, T015
  - Verify: editing a published listing does not retroactively change any existing order's price snapshot; rejection reason renders with a remediation route
  - Codex: GPT-5.6 Sol — High · Claude: Opus — Medium
  - Why: the edit/price-snapshot interaction is a subtle commercial-integrity issue worth careful reasoning.

- [ ] T018 [PS5] Render fill progression on seller listings (reserved excluded, partial fill, sold
  out) from `fills.ts`.
  - Req: FR-011, PS5 | Depends: T005, T016
  - Verify: reserving via 007 reduces actionable quantity; settling via 008 increases filled quantity and flips state
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: correctness here is how sellers detect double-selling problems.

- [ ] T019 [PS6] Implement `src/app/dashboard/sales/page.tsx` — seller sales outcomes reconciling to
  underlying order items with unit and currency.
  - Req: PS6, FR-003 (units) | Depends: T005, T003
  - Verify: totals reconcile to `order_items`/ownership events for the seller's organization only
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — High
  - Why: a reconciliation view where a wrong join could show another organization's figures.

---

## Phase 6 — Module registration

- [ ] T020 Register buyer nav (`coffee`) always and seller nav (`listings`, `sales`) only for
  `can_sell` organizations, plus overview cards, with 004's contract.
  - Req: FR-014, FR-015 | Depends: T009, T016, T019
  - Verify: buyer-only fixture sees no seller entries and is refused at seller routes; buyer+seller sees both
  - Codex: GPT-5.6 Sol — Medium · Claude: Opus — Medium
  - Why: the additive-capability model is Constitution-locked and must be exactly right at the registration boundary.

---

## Phase 7 — Automated tests

- [ ] T021 [P] Write `tests/listings/access-control.test.ts` (AC-01): anonymous, non-member,
  pending-KYB and suspended fixtures reach zero listing data; approved member succeeds.
  - Req: SEC-001, SC-001 | Depends: T007
  - Verify: `npm test -- listings/access-control` passes for all five cases
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: release-blocking acceptance criterion.

- [ ] T022 [P] Write `tests/listings/eligibility.test.ts`: `can_sell=false`, non-Hills-sourced,
  over-available and delivery-reserved quantities are all refused, including by direct action call.
  - Req: FR-005, FR-006, SEC-005, SC-002 | Depends: T014
  - Verify: `npm test -- listings/eligibility` passes for all four refusal paths
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: enforces the MVP chain-of-custody rule that keeps external stock out of the marketplace.

- [ ] T023 [P] Write `tests/listings/transitions.test.ts`: permitted transitions succeed and record
  history; forbidden transitions are refused by the database trigger.
  - Req: FR-009 | Depends: T015, T017
  - Verify: `npm test -- listings/transitions` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: state-machine conformance against database-owned rules.

- [ ] T024 [P] Write `tests/listings/fills.test.ts`: reserved excluded from actionable quantity;
  partial fill and sold-out derive from stored columns; expiry restores quantity exactly once.
  - Req: FR-011, PS5, SC-003 | Depends: T005, T018
  - Verify: `npm test -- listings/fills` passes
  - Codex: GPT-5.6 Sol — High · Claude: Opus — High
  - Why: "restores exactly once" is a classic double-restore bug with direct commercial consequences.

- [ ] T025 [P] Write `tests/listings/isolation.test.ts`: seller A never sees seller B's non-published
  listings, documents or status history.
  - Req: FR-012, SEC-002 | Depends: T003
  - Verify: `npm test -- listings/isolation` passes
  - Codex: GPT-5.6 Sol — High · Claude: Sonnet — High
  - Why: cross-tenant guarantee on commercially sensitive drafts.

- [ ] T026 Write `tests/listings/public-exposure.test.ts`: no public route, sitemap or structured
  data contains listing data.
  - Req: FR-003, SC-006 | Depends: T008
  - Verify: `npm test -- listings/public-exposure` passes
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: cross-feature invariant check with a clear assertion.

---

## Phase 8 — Accessibility, responsive, RTL, states

- [ ] T027 State coverage pass: loading, empty, error, unauthorized, suspended, reserved,
  partial-fill, sold-out on every marketplace and listing screen.
  - Req: FR-017 | Depends: Phases 3–5
  - Verify: each state renders for a seeded fixture; badges use dot + label, never colour alone
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: broad but well-specified.

- [ ] T028 Accessibility, RTL and mobile pass (tables → cards, logical properties, externalised copy).
  - Req: FR-018 | Depends: Phases 3–5
  - Verify: a11y check clean; `grep -rn "text-left\|text-right\|[^-]pl-\|[^-]pr-" src/app/dashboard/coffee src/app/dashboard/listings src/app/dashboard/sales components/listings` returns nothing
  - Codex: GPT-5.6 Sol — Medium · Claude: Sonnet — Medium
  - Why: mechanical but broad.

---

## Phase 9 — Verification & closure

- [ ] T029 Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Req: — | Depends: all
  - Verify: four exit-0 results
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical execution.

- [ ] T030 Confirm no service-role usage, no shared cache of listing data, and no public exposure.
  - Req: SEC-003, FR-004, FR-003 | Depends: T029
  - Verify: `grep -rn "SERVICE_ROLE\|cacheTag\|unstable_cache" lib/listings src/app/dashboard/coffee src/app/dashboard/listings` returns nothing
  - Codex: GPT-5.6 Sol — Low · Claude: Sonnet — Low
  - Why: mechanical constitutional checks.

- [ ] T031 Confirm the MVP trading-mode boundary: no order book, anonymous matching, leverage,
  futures, shorts or external stock was introduced.
  - Req: FR-013, Constitution I | Depends: T029
  - Verify: feature surface review confirms fixed-price listings only; the negotiation gap remains recorded in spec Open items
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: a product-boundary judgment that protects the platform's regulatory position.

- [ ] T032 Update the roadmap status for 006 and confirm DB-OPEN-05 and the negotiation gap remain
  open and unbypassed.
  - Req: spec.md Open items | Depends: T029
  - Verify: roadmap accurate; capability-map entries unchanged unless formally decided
  - Codex: GPT-5.6 Sol — Low · Claude: Opus — Medium
  - Why: honest continuity reporting.

---

## Dependencies & parallelisation

- Phase 1 blocks everything; T003/T005/T006 parallel after T001; T004 needs 005's layer.
- Phase 2 blocks Phase 3 (no browse before the guard).
- Phase 4 depends on T004/T006; Phase 5 depends on Phase 4.
- Phase 7's tests are mutually parallel except T026 (needs T008).
- Phase 9 depends on everything.

**Parallel-safe tasks**: T003, T005, T006, T011, T021, T022, T023, T024, T025 (9 of 32).
