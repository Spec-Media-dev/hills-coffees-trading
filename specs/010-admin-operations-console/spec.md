# Feature Specification: Operations / Admin Console

**Feature Directory**: `specs/010-admin-operations-console`
**Created**: 2026-09-08
**Status**: Price-administration run (2026-09-21) — T049 added and complete (reference-price administration, Feature 011 FR-011); 37 / 49 (tasks.md status). RUN H complete (2026-09-17) — Phase 11 T036/T037 recorded (state coverage over every current surface with 14 dedicated tests; real Chrome + axe over 198 renders, 0 violations, physical-CSS grep clean); Phase 12 T038–T041 verification recorded (typecheck/build/diff-check exit 0, lint at the repo baseline, `npm test` 1666/1672 exit 0 after the Feature 009 stale `t013-live-proof` assertion was repaired (test-only fix, tasks.md T038 note)) / proofs recorded / roadmap+capability map reconciled but the four tasks stay open on their literal dependencies (`Depends: all` / T038); 32 / 48 (tasks.md status). RUN G complete (2026-09-17) — Phase 10 T030/T034/T035 recorded (six dedicated test files, 66 live/static tests); T031/T032 stay BLOCKED on Feature 008's decidePayment() and (for T032) Feature 012's absent dispute domain; T033 stays PARTIAL on the same open Phase 3–9 dependencies; 30 / 48. RUN F complete (2026-09-17) — Phase 9 T028/T042–T045 recorded, T027/T029 PARTIAL (UPDATE actor attribution not persisted by the approved schema — recorded DB gap, D2 ii); 27 / 48. RUN E complete (2026-09-16) — Phases 7–8 T021–T026 implemented and live/browser-verified (catalogue management with Feature 002 cache round trip proven against a running server; read-only Audit area with DB-OPEN-06 stated honestly); KYB reviewer coherence wired and live-proven (server-side approval-readiness gate, document outcomes through `create_kyb_review`, byte route) with the COMPLIANCE `file_assets` reviewability gap restated in tasks.md; 22 / 48. RUN D complete (2026-09-16): Phase 6. RUN C evaluated (2026-09-16) — Phase 5 T013/T014/T015 BLOCKED BY FEATURE 008 (fresh audit: no review-queue read, no `decidePayment`, no payout write, no invoice recording; only a structural delegation test was added — see tasks.md); still 11 / 48. RUN B complete (2026-09-16) — Phase 3 T007/T008/T009 + Phase 4 T011 implemented and live-verified with a disposable COMPLIANCE fixture; T010 implemented but blocked on the organizations policy gap (below); T012 blocked on Feature 012: 11 / 48 tasks. RUN A (2026-09-15) delivered Phases 1–2 + T046. Phase 5 blocked by 008; Phases 6–12 NOT started (see tasks.md status).
**Primary surface**: Operations Console (`/dashboard-admin`)
**Depends on**: 001 (independent admin guard), 003, 005, 006, 008, 009, 012 (domain layers)

## Purpose

Give Hills' operations teams the console they need to run the platform — **without** collapsing every
staff member into an unrestricted administrator. The console is a set of **role-separated work
areas** (Compliance, Warehouse, Finance, Catalogue, Trading, Audit, System), each gated
independently, exactly matching the operational role separation the approved database already
enforces (SRS §14, Constitution V).

This is a separate protected application from `/dashboard`. Member access never implies operations
access, and operations access never implies member trading capability.

## Scope

### In scope

- `/dashboard-admin` shell with role-aware navigation and independent authorization.
- **Compliance**: KYB review queue and decisions, organization status/suspension, document expiry
  visibility, listing review/suspension, dispute review.
- **Warehouse**: inventory positions and custody oversight, shipment queues and operational
  transitions, delivered-quantity recording, and honest variance/reconciliation capability-gap
  surfacing. Delivery-reservation facts are database-owned and must be consumed through 009's
  warehouse layer; this console never calculates or writes a reservation itself.
- **Finance**: payment review queue, settlement decisions (via 008's layer), payouts, tax invoices,
  financial reconciliation views.
- **Catalogue**: coffees, lots, origins, regions, taxonomy, warehouses, media — the content the
  public site (002) renders — plus cache revalidation on change.
- **Reference-price administration (added 2026-09-21, T049)**: price sources (incl. licence
  status), append-only observations and differentials for Feature 011's public reference-price
  layer, platform ADMIN only; every successful change revalidates Feature 011's
  `reference-prices` tag through `revalidateReferencePrices()` (Feature 011 FR-011, SC-006).
- **Trading oversight**: listing states, order/trade monitor, settlement/title status visibility.
- **Audit**: read-oriented evidence views for auditors (subject to DB-OPEN-06).
- **System (SUPER_ADMIN)**: platform admin roles, commission tiers, tax rules, shipping rules,
  payment accounts.
- **Operator self-account (added RUN A, 2026-09-15)**: the signed-in operator's own profile,
  sign-in email (display), password (via the existing reset flow), two-factor status/enrolment and
  sign-out — composed ONLY from Feature 003's existing authority, because operators without a
  member organization have no other account surface. Email change and platform branding are
  recorded gaps (T047/T048), not simulated.

### Out of scope

- Member-facing surfaces (`/dashboard`) — 004–009.
- The transactional logic behind decisions — owned by 008/009's domain layers and the database.
- Any database schema change, including for capabilities the console appears to need.
- Screening providers, CRM, ERP/WMS integrations — not in the approved baseline.
- Public content authoring beyond what the approved catalogue tables represent.

## Actors

| Actor | Console areas |
|---|---|
| **COMPLIANCE** | KYB, organizations, listing review, disputes |
| **WAREHOUSE** | Inventory/custody, shipments, delivery recording, variances |
| **FINANCE** | Payments, settlement decisions, payouts, tax invoices |
| **AUDITOR** | Read-only evidence across permitted areas |
| **ADMIN** | The above plus catalogue and general administration (per the database's role hierarchy) |
| **SUPER_ADMIN** | Everything ADMIN can do, plus platform-admin management and system configuration |

## Business journeys owned

Owns the entire **Admin/Operations** journey: compliance review of membership and listings, warehouse
custody/fulfilment operations, finance payment/settlement/payout decisions, auditor evidence access,
and system administration. It is the counterpart to every member journey in 003–009 and 012.

## Prioritized stories

### PS1 — Role-separated access, enforced server-side (P1)

Each staff member reaches only the console areas their operational role permits.

**Why P1**: SRS §14 and Constitution V require least privilege; a universal admin role would violate
both.
**Independent test**: sign in as each of the six role fixtures and confirm the exact set of reachable
areas, including that a direct URL to a forbidden area is refused server-side.

**Acceptance scenarios**

1. Given a `WAREHOUSE`-only operator, when they request a Finance area route, then it is refused
   server-side, not merely hidden.
2. Given a `COMPLIANCE` operator, when they attempt a settlement decision, then it is refused by
   both the console guard and the database function.
3. Given an `AUDITOR`, when they attempt any mutation anywhere in the console, then it is refused.
4. Given a member with no operational role, when they request any `/dashboard-admin` route, then
   access is refused — even if their organization is fully approved for trading.
5. Given a `SUPER_ADMIN`, when they manage platform admins, then it succeeds; for any other role it
   is refused.

### PS2 — Compliance can review and decide KYB (P1)

A compliance operator works a queue of KYB applications, reviews evidence, and records decisions with
reasons.

**Why P1**: nothing trades until KYB decisions can be made.
**Independent test**: with seeded applications in each status, work the queue, record each decision
type, and confirm status and review history.

**Acceptance scenarios**

1. Given submitted applications, when the queue renders, then they appear with organization, status,
   submission time and outstanding items.
2. Given a decision (`APPROVED`, `REJECTED`, `RESUBMISSION_REQUIRED`, `SUSPENDED`), when recorded,
   then the application status changes accordingly and a `kyb_reviews` row captures reviewer, decision
   and reason.
3. Given an approval, when it completes, then the organization's trading capability follows the
   database's own rules — the console never sets capability directly by another route.
4. Given a decision without a reason where one is required, when attempted, then it is refused.
5. Given a suspension, when applied, then the member sees it on their next request (003/004).

### PS3 — Finance can review payments and settle (P1)

A finance operator sees payments awaiting review with their proof and decides.

**Why P1**: settlement is the commercial completion of every order.
**Independent test**: work a payment queue, approve one and reject another via 008's decision layer,
and confirm the full settlement effects and the rejection path.

**Acceptance scenarios**

1. Given payments in the review states, when the queue renders, then each shows order, amount,
   currency, proof reference and hold status.
2. Given approval, when 008 supplies its `decidePayment` layer, then that layer is called (never
   `admin_review_payment` directly from the console) and settlement completes exactly once. The
   current 008 Phase-1 foundation does **not** yet supply this action, so this scenario is blocked
   rather than implemented through a console substitute.
3. Given a payment whose reservation expired, when approval is attempted, then it fails with a clear
   explanation and no title moves.
4. Given rejection with a reason, when recorded, then the payment is `REJECTED` and the order returns
   to `HOLD`.

### PS4 — Warehouse can run fulfilment and custody (P1)

A warehouse operator progresses shipments, records deliveries, and oversees custody positions.

**Why P1**: physical operations must be executable or nothing ships.
**Independent test**: progress a shipment through the permitted operational states via 009's
warehouse layer and record a partial delivery. The live layer already enforces settlement-gated
progression and its database-owned delivery reservation; `DISPUTED` holds that reservation (FREEZE)
and `FAILED`/`DISPUTED` have no recovery transition until 012 owns one.

**Acceptance scenarios**

1. Given a requested shipment, when warehouse confirms capacity, reserves, picks and dispatches, then
   each transition succeeds through 009's guarded layer.
2. Given delivery recording, when performed, then delivered quantity is monotonic and warehouse-only.
3. Given custody oversight, when viewed, then positions and allocations render across organizations
   for warehouse operators only.
4. Given a forbidden transition, when attempted, then the database refuses and a safe error appears.

### PS5 — Compliance can review and control listings (P2)

Listings awaiting review are approved, rejected or suspended with reasons.

**Why P2**: needed before member resale goes live, but after KYB.
**Independent test**: review a `PENDING_REVIEW` listing, approve it, then suspend a live listing and
confirm both the member view and the status history.

**Acceptance scenarios**

1. Given a listing in `PENDING_REVIEW`, when a decision is recorded, then `listing_reviews` captures
   reviewer/decision/reason and the listing status changes accordingly.
2. Given a suspension, when applied, then the listing stops being actionable for members (006).
3. Given a non-compliance role, when a listing decision is attempted, then it is refused.

### PS6 — Catalogue management feeds the public site (P2)

Administrators manage coffees, origins, taxonomy, warehouses and media; changes revalidate the public
caches.

**Why P2**: the public site needs content, but the trading path is higher priority.
**Independent test**: publish a coffee and confirm it appears publicly after revalidation; unpublish
it and confirm it 404s.

**Acceptance scenarios**

1. Given a coffee moved to `PUBLISHED`, when saved, then 002's `catalog-coffees` cache tag is
   revalidated and the public page appears.
2. Given a coffee moved out of `PUBLISHED`, when saved, then the public route returns 404 after
   revalidation.
3. Given a non-admin role, when catalogue mutation is attempted, then it is refused (catalogue writes
   are `is_platform_admin()`).

### PS7 — Auditors get read-only evidence (P3)

An auditor reads the evidence they are entitled to, and can mutate nothing.

**Why P3**: important for governance, constrained by DB-OPEN-06.
**Independent test**: once 012 supplies its audit/history domain layer, as an auditor fixture,
confirm read access to permitted areas and refusal of every mutation. The console may compose that
layer read-only; it must not build a parallel audit domain.

**Acceptance scenarios**

1. Given an auditor, when they open permitted areas, then data renders read-only with no action
   affordances.
2. Given an auditor, when they attempt any mutation, then it is refused server-side.
3. Given audit-log access, when attempted, then behaviour matches the approved policy — and if the
   auditor cannot read `audit_logs` (DB-OPEN-06), the console states this honestly rather than
   appearing broken.

### PS8 — System configuration is SUPER_ADMIN-only (P3)

Platform admin roles, commission tiers, tax rules, shipping rules and payment accounts are managed
only by super administrators.

**Why P3**: needed before production, but configuration is stable.
**Independent test**: attempt each configuration area as ADMIN and as SUPER_ADMIN; only the latter
succeeds.

**Acceptance scenarios**

1. Given an `ADMIN` (not super), when they attempt to change commission tiers, tax rules, shipping
   rules or platform admins, then it is refused by the database.
2. Given a `SUPER_ADMIN`, when they make such a change, then it succeeds and is audited.
3. Given any bank/payment-account change, when made, then it is treated as a high-risk action and
   recorded (see Open items on dual control).
4. Given a `SUPER_ADMIN` managing commission, when they view the area, then they can see existing
   `commission_policies` (name, status, `effective_from`, `effective_until`) with each policy's
   `commission_tiers` (`min_quantity_kg`, `max_quantity_kg`, `percentage`), and may create/manage
   policies and add/edit tiers within the approved schema.
5. Given any commission policy or tier change, when it is saved, then the interface states
   explicitly that **changes apply to eligible future checkouts only**, and offers **no** action to
   recalculate or restate historical orders, commission amounts, seller net amounts or payouts.
6. Given a tier configuration that leaves a quantity gap or no covering band, when it is saved, then
   the interface surfaces the gap to the operator, because an uncovered quantity currently results
   in a 0% commission at checkout (`COMMISSION-OPEN-01`) rather than an error.

## Functional Requirements

- **FR-001**: `/dashboard-admin` MUST authorize independently of `/dashboard`; member capability MUST
  NOT grant console access, and console access MUST NOT grant member trading capability.
- **FR-002**: Every console area MUST verify its specific operational role server-side on every
  request (`is_compliance_operator`, `is_warehouse_operator`, `is_finance_operator`, `is_auditor`,
  `is_platform_admin`, `is_super_admin`); navigation visibility is never the gate.
- **FR-003**: The console MUST NOT introduce a universal "admin" capability that bypasses role
  separation; where the database's role hierarchy already grants ADMIN/SUPER_ADMIN broader rights,
  the console reflects that hierarchy rather than inventing a new one.
- **FR-004**: Settlement decisions, when 008 supplies `decidePayment`, MUST be executed through that
  layer; the console MUST NOT call `admin_review_payment` directly. Until then, no settlement
  decision control is offered.
- **FR-005**: Shipment operations MUST be executed through 009's warehouse layer; the console MUST NOT
  perform raw shipment updates.
- **FR-006**: KYB and listing decisions MUST record reviewer, decision and reason through the approved
  tables (`kyb_reviews`, `listing_reviews`). Dispute decisions are composed only through 012's domain
  layer once it exists; this console MUST NOT create a parallel dispute transition path.
- **FR-007**: Catalogue mutations MUST revalidate 002's public cache tags for the affected content.
- **FR-008**: The console MUST NOT hard-delete commercial, inventory, title, payment or audit records;
  only approved state transitions and retention/redaction paths may be offered (SRS OPS-02).
- **FR-009**: Auditor surfaces MUST be strictly read-only, with no mutation affordance rendered.
- **FR-010**: All console mutations MUST follow 001's Server Action contract with safe error mapping.
- **FR-011**: No console data MUST be placed in a cache shared beyond the operational role that may
  see it; operational data is never publicly cached.
- **FR-012**: `/dashboard-admin` routes MUST be non-indexable and excluded from public sitemaps.
- **FR-013**: The console MUST render the approved status vocabularies for every entity it displays.
- **FR-014**: Screens MUST provide loading, empty, error, unauthorized, forbidden and not-found
  states, plus domain states where relevant.
- **FR-015**: Copy externalised; layouts RTL-safe; responsive per the approved admin layout (dark
  sidebar, sticky topbar, KPI tiles, activity tables); money/quantity always with unit/currency.
- **FR-016**: The console MUST show only real data — never seeded, estimated or sample figures (the
  approved design system's explicit admin rule).
- **FR-017**: Where a capability the console appears to need is blocked by a recorded database
  blocker, the console MUST state it honestly rather than simulating the capability.
- **FR-018 (added 2026-09-21, T049)**: Reference-price mutations (sources, observations,
  differentials) MUST be `is_platform_admin()`-gated server-side, MUST store values, units and
  currencies exactly as entered (no conversion — DB-OPEN-08), MUST NOT edit or delete an existing
  observation, and MUST call Feature 011's `revalidateReferencePrices()` after every successful
  mutation and never after a refused or failed one.

## Security Requirements

- **SEC-001**: Role separation MUST be verified by negative tests for every area × every role
  combination that must be refused.
- **SEC-002**: No service-role usage anywhere in this feature; operational power comes from the
  operator's own role, enforced by RLS and functions.
- **SEC-003**: Privileged actions MUST be attributable: reviewer/actor identity recorded on every
  decision (SRS §13.5).
- **SEC-004**: Member private data (KYB documents, payment proof, dispute evidence) MUST be visible
  only to roles the approved policies permit, and access MUST be logged where the schema supports it.
- **SEC-005**: No console route or data may be reachable publicly or by a member without an
  operational role.
- **SEC-006**: All operator-entered reasons/notes MUST be treated as untrusted text wherever rendered.

## Edge Cases

- A staff user holds a role and is also a member of a trading organization → the two capabilities stay
  independent; acting context must be unambiguous.
- A role is revoked mid-session → the next request refuses the area.
- Two compliance operators decide the same KYB application concurrently → exactly one decision takes
  effect; the second sees the current state.
- Two finance operators approve the same payment concurrently → exactly one settlement (008's
  idempotency).
- A catalogue change is made while the public cache is warm → revalidation makes it visible;
  no stale content persists indefinitely.
- An auditor opens an area whose data they cannot read (DB-OPEN-06) → honest explanation, not an error.
- A warehouse operator attempts a commercial action (settlement) → refused by the function.
- An organization is suspended while it has an in-flight shipment → the current database safely
  preserves existing records, but the warehouse-action policy is not yet decided; the console must
  not silently choose continuation, cancellation, or release semantics.
- A queue is empty → honest empty state, never fabricated rows.

## Success Criteria

- **SC-001**: For every (area, role) pair that must be refused, access is refused server-side in 100%
  of attempts, including by direct URL and direct action invocation.
- **SC-002**: Zero console code paths call `admin_review_payment` or perform raw shipment updates
  directly; all go through 008/009's layers.
- **SC-003**: Every KYB, listing, payment and dispute decision records reviewer, decision and reason.
- **SC-004**: A member without an operational role can never reach any console route.
- **SC-005**: Catalogue publication/unpublication is reflected publicly after revalidation in 100% of
  cases.
- **SC-006**: The console offers zero hard-delete paths for commercial, inventory, title, payment or
  audit records.
- **SC-007**: Auditor surfaces expose zero mutation affordances and refuse all mutations.
- **SC-008**: No fabricated, sample or estimated figure appears anywhere in the console.

## Assumptions

- Operational roles are assigned in `platform_admins` by SUPER_ADMIN; this feature does not invent an
  alternative role source.
- The database's role hierarchy (ADMIN/SUPER_ADMIN implicitly satisfying the specific role checks) is
  the approved model and is reflected, not overridden.
- Domain logic lives in 003/005/006/008/009/012's layers; this feature composes them into role-shaped
  work areas.

## Open items / blockers

- **DB-OPEN-06 (affects PS7)**: `audit_logs` is readable only by `is_platform_admin()`, so the
  `AUDITOR` role cannot read the audit log the SRS says auditors need. Requires a decision: confirm
  the narrowing or correct the policy through the approved database-change process.
- **OPS-01 dual control**: the SRS requires configurable maker-checker for high-risk actions (member
  approval, bank-detail change, manual settlement, stock adjustment, title reversal, privileged
  access). The approved schema records a single reviewer per decision and has no maker-checker
  construct. Dual control therefore cannot be implemented today — record the decision rather than
  simulating it in application code.
- **DB-BLOCK-01 — SUPERSEDED for KYB, CURRENT elsewhere**: 003's private `kyb-evidence` bucket,
  `attach_kyb_document`, and Compliance read access are live, so KYB reviewers may use that approved
  seam. It does **not** supply payment-proof, delivery-proof, dispute-evidence, or public-media bytes;
  those remain owned by 008/009/012 or the media capability decision. The console must state the
  relevant limitation rather than treating all evidence as unavailable.
- **DB-BLOCK-07 — RESOLVED / CLOSED BY 009**: delivery reservation, settlement-time reservation, and
  settlement-gated warehouse progression are live. Warehouse screens must delegate to 009 and render
  stored reservation facts; they must not issue raw shipment updates or invent reservation arithmetic.
- **DB-OPEN-06 — CURRENT / OWNED ELSEWHERE**: an `AUDITOR` cannot read `audit_logs`; the audit area
  must explain this policy gap until the approved process changes it.
- **DB-OPEN-09 — CURRENT / OWNED BY 012 + approved DB process**: no compliance dispute-freeze path
  exists for orders or shipments. 010 must not simulate one.
- **OPS-01 dual control — CURRENT business/security decision**: no maker-checker representation exists
  in the approved schema. Record and surface the limitation; do not simulate it in application code.
- **Variance/reconciliation (LOT-04, AC-05) — CONFIRMED CAPABILITY GAP, RUN D 2026-09-16
  (DB-OPEN-19); RELEASE-BLOCKING**: re-verified against the live schema report (68 tables, 0 views,
  0 enums) and every applied migration (2026-09-09 → 2026-09-14): NO table, column, constraint or
  function represents variance, discrepancy, reconciliation, quarantine, warehouse hold, stock/cycle
  count, write-off or inventory adjustment. `storage_allocations.status` is exactly
  `STORED`/`RELEASED`/`DELIVERED`; `inventory_positions` carries only `available_quantity_kg` /
  `reserved_quantity_kg`; the only `HOLD` is `orders.status` (payment hold) and the only `FROZEN` is
  `disputes.status`; `inventory_ownership_events.event_type` lists `ADJUSTMENT` but the table has no
  INSERT policy for `is_warehouse_operator()` and is append-only — its only writer is
  `admin_review_payment`. T020 is therefore closed on its recorded-gap branch: the inventory area
  states the gap in-product (no form, button or input), no reconciliation screen exists, and AC-05
  remains release-blocking until the approved database-change process adds, at minimum, an
  append-only inventory adjustment/variance record (position, warehouse, counted vs. recorded
  quantity, reason, actor, correlation) with a warehouse-only decision path applied by the database.
- **Pure WAREHOUSE role has no read path to `orders` / `order_items` / `organizations` /
  `coffee_lots` — CONFIRMED, RUN D 2026-09-16 (DB-OPEN-20)**: `orders_view` and `order_items_view`
  are `can_view_order(...)` (platform admin, buyer member, seller-of-record — no warehouse branch);
  `organizations_member_select` is `is_org_member(id) OR is_platform_admin()`; `coffee_lots` has
  `catalog_admin_lots` (platform admin) and `member_read_trade_lots` (authorized member + the
  DB-OPEN-05 predicate). The warehouse console therefore shows shipment/lot/owner IDENTIFIERS with
  an in-product statement instead of order codes, item names, owner names and lot codes for that
  role (ADMIN/SUPER_ADMIN see them); Feature 009's reads already degrade to empty context the same
  way. Nothing is bypassed. Minimal option if wanted: a warehouse-operator SELECT branch on
  `orders`/`order_items` scoped to orders with a shipment, plus `organizations` display-name and
  `coffee_lots` reads for `is_warehouse_operator()` — a database decision, not this console's.
- **`inventory_warehouse_write` permits a raw warehouse UPDATE that no approved operation owns —
  RECORDED, RUN D**: RLS grants `is_warehouse_operator()` ALL on `inventory_positions` and
  `storage_allocations`, but no approved domain operation (Feature 005 is read-only; Feature 009
  moves quantities only inside its triggers) defines a warehouse adjustment. The console deliberately
  issues no such write (test-pinned); the permissive policy is noted for the DB-OPEN-19 decision.
- **Suspended-organization mid-operation policy — CURRENT / Feature 010 compliance ownership**:
  009 safely exposes existing shipments but deliberately does not decide whether warehouse work may
  continue, cancel, or require escalation after suspension. **RUN D (2026-09-16)**: still undecided.
  The live `validate_shipment_transition` consults no organization status, so the database neither
  blocks nor releases on suspension; the warehouse console therefore neither blocks nor auto-continues
  (an in-product note directs the operator to escalate to Compliance) and a pure WAREHOUSE role cannot
  even read the owner organization's status (DB-OPEN-20). No clause of T016–T020's literal Verify
  depends on this decision; it remains a business/compliance decision to record, not simulate.
- **Platform branding / settings (T047) — BLOCKED, NO AUTHORITATIVE MODEL (found RUN A,
  2026-09-15)**: no approved settings/branding table, config source or brand-asset bucket exists;
  logo, favicon and platform name are static build assets. Requires a human decision before any
  management screen is built; the console must not fake one.
- **Operator email change (T048) — BLOCKED, requires an approved auth-flow decision (RUN A)**:
  no approved path exists; the account page displays the current email and states the gap.
- **`organizations` has no SELECT path for COMPLIANCE — CONFIRMED LIVE, RUN B 2026-09-16; BLOCKS
  T010 and the organization-name column of T007 for that role; needs a database decision**: the
  live policy set grants `organizations` reads to `is_org_member(id)`/`is_platform_admin()` only,
  and because PostgreSQL applies SELECT policies to an UPDATE whose WHERE references existing
  columns, the existing `organizations_compliance_update` policy affects ZERO rows for a pure
  COMPLIANCE operator (affected-row count 0 on a no-op status write, versus 1 on
  `kyb_applications`). The same shape blocks `file_assets` (document file name/MIME/size/path — so
  KYB evidence bytes cannot be opened from the console by that role even though the storage policy
  itself would allow it) and `account_status_history`. The console states each gap in-product and
  never bypasses it. Minimal option: extend `organizations_member_select` USING with
  `OR is_compliance_operator()` (and, if wanted, a KYB-scoped `file_assets` read + an
  `account_status_history` read for compliance); security effect: COMPLIANCE reads all organization
  rows, consistent with the SRS compliance role; no new write authority.
- **"Trading oversight" scope has no owning task (found RUN A)**: the In-scope list names
  listing states / order-trade monitor / settlement-title visibility, but no T0NN task covers it.
  Flagged for RUN B planning rather than silently added to the matrix.

## Dependencies

| Depends on | Why |
|---|---|
| 001 | `/dashboard-admin` guard and identity/operational-role resolution |
| 003 | KYB/organization domain the compliance area acts on |
| 005 | Current inventory/custody read facts; cross-organization warehouse composition must preserve its approved RLS boundary |
| 006 | Listing domain for compliance review |
| 008 | Provider-neutral read foundation exists (6/39); `decidePayment`, payment-review queue, payout management and invoice recording do not yet exist |
| 009 | Closed warehouse shipment layer — the only fulfilment path; delivery reservation is live |
| 012 | Dispute domain and reusable audit/history/notification surfaces — not started, so dispute/audit composition remains blocked |
| 002 | Public cache tags revalidated by catalogue changes |
