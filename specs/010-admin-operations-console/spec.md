# Feature Specification: Operations / Admin Console

**Feature Directory**: `specs/010-admin-operations-console`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
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
  transitions, delivered-quantity recording, variance/reconciliation surfacing.
- **Finance**: payment review queue, settlement decisions (via 008's layer), payouts, tax invoices,
  financial reconciliation views.
- **Catalogue**: coffees, lots, origins, regions, taxonomy, warehouses, media — the content the
  public site (002) renders — plus cache revalidation on change.
- **Trading oversight**: listing states, order/trade monitor, settlement/title status visibility.
- **Audit**: read-oriented evidence views for auditors (subject to DB-OPEN-06).
- **System (SUPER_ADMIN)**: platform admin roles, commission tiers, tax rules, shipping rules,
  payment accounts.

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
2. Given approval, when recorded, then 008's `decidePayment` is called (never
   `admin_review_payment` directly from the console) and settlement completes exactly once.
3. Given a payment whose reservation expired, when approval is attempted, then it fails with a clear
   explanation and no title moves.
4. Given rejection with a reason, when recorded, then the payment is `REJECTED` and the order returns
   to `HOLD`.

### PS4 — Warehouse can run fulfilment and custody (P1)

A warehouse operator progresses shipments, records deliveries, and oversees custody positions.

**Why P1**: physical operations must be executable or nothing ships.
**Independent test**: progress a shipment through the permitted operational states via 009's
warehouse layer and record a partial delivery.

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
**Independent test**: as an auditor fixture, confirm read access to permitted areas and refusal of
every mutation.

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

## Functional Requirements

- **FR-001**: `/dashboard-admin` MUST authorize independently of `/dashboard`; member capability MUST
  NOT grant console access, and console access MUST NOT grant member trading capability.
- **FR-002**: Every console area MUST verify its specific operational role server-side on every
  request (`is_compliance_operator`, `is_warehouse_operator`, `is_finance_operator`, `is_auditor`,
  `is_platform_admin`, `is_super_admin`); navigation visibility is never the gate.
- **FR-003**: The console MUST NOT introduce a universal "admin" capability that bypasses role
  separation; where the database's role hierarchy already grants ADMIN/SUPER_ADMIN broader rights,
  the console reflects that hierarchy rather than inventing a new one.
- **FR-004**: Settlement decisions MUST be executed through 008's `decidePayment`; the console MUST
  NOT call `admin_review_payment` directly.
- **FR-005**: Shipment operations MUST be executed through 009's warehouse layer; the console MUST NOT
  perform raw shipment updates.
- **FR-006**: KYB, listing and dispute decisions MUST record reviewer, decision and reason through the
  approved tables (`kyb_reviews`, `listing_reviews`, `disputes`).
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
- **DB-BLOCK-01** (KYB documents, payment proof, dispute evidence) limits what reviewers can actually
  open; the console must state this honestly.
- **DB-BLOCK-07** (delivery does not reserve inventory) affects warehouse oversight accuracy.
- **Reconciliation/variance workflows** (SRS LOT-04, AC-05): the approved schema has no explicit
  variance/reconciliation entity. What warehouse operators can actually reconcile must be confirmed
  before building screens that imply capability the data model does not support.

## Dependencies

| Depends on | Why |
|---|---|
| 001 | `/dashboard-admin` guard and identity/operational-role resolution |
| 003 | KYB/organization domain the compliance area acts on |
| 005 | Inventory/custody read layer for warehouse oversight |
| 006 | Listing domain for compliance review |
| 008 | `decidePayment` — the only settlement path |
| 009 | Warehouse shipment layer — the only fulfilment path |
| 012 | Dispute domain and audit/notification surfaces |
| 002 | Public cache tags revalidated by catalogue changes |
