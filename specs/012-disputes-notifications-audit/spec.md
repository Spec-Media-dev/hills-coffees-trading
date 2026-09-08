# Feature Specification: Disputes, Notifications & Audit

**Feature Directory**: `specs/012-disputes-notifications-audit`
**Created**: 2026-09-08
**Status**: Planning prepared — implementation NOT started
**Primary surfaces**: Member Portal (`/dashboard/disputes`, notifications) + Operations Console
(`/dashboard-admin`, via 010)
**Depends on**: 001, 003, 004, 007, 008, 009 (the records disputes attach to), 010 (operator surfaces)

## Purpose

Provide the platform's cross-domain accountability layer: **disputes** (raise, evidence, review,
resolve), **notifications** (tell people what needs their attention), and **audit/history
visibility** (correlation IDs, status histories, ownership events) — all preserving the approved
non-destructive, append-only model (SRS MKT-07, OPS-02, §13.5).

Nothing here rewrites history. Corrections are represented as new controlled events, never as edits
to past records.

## Scope

### In scope

- Member dispute raising against an order they may view, with reason.
- Dispute evidence attachment (subject to DB-BLOCK-01).
- Dispute status presentation across the approved vocabulary and its effect on related records.
- Compliance dispute review/resolution **domain layer** (consumed by 010).
- Member notification centre: reading notifications the member is entitled to see.
- Notification preferences (member-owned).
- Audit/history visibility: order status history, listing status history, account status history,
  ownership events, correlation IDs — each scoped to who may see it.
- Auditor evidence surfaces (via 010), subject to DB-OPEN-06.

### Out of scope

- Notification **delivery** channels (email/SMS/WhatsApp) — no approved provider integration.
- Dispute-driven automatic freezes that the database does not implement (see Open items).
- The compliance console screens themselves — 010.
- Any schema change to enable notifications or freezes.

## Actors

| Actor | Interest |
|---|---|
| **Member (buyer or seller)** | Raise a dispute, attach evidence, track it; see notifications and history. |
| **Compliance operator** | Review, freeze where possible, resolve with reason and evidence. |
| **Auditor** | Read evidence and history. |
| **Finance/Warehouse** (adjacent) | Affected by disputed orders/shipments. |

## Business journeys owned

Owns the **Dispute flow** stage of the Buyer journey and the audit-trail visibility that every
journey depends on. Supplies the notification surface all features contribute to.

## Prioritized stories

### PS1 — A participant can raise a dispute (P1)

A member who can view an order raises a dispute with a reason.

**Why P1**: it is the entry point to the entire accountability flow.
**Independent test**: as a member of the buying organization, raise a dispute and confirm the record;
as an unrelated organization, confirm refusal.

**Acceptance scenarios**

1. Given a member who can view the order, when they raise a dispute with a reason, then a `disputes`
   record is created with `opened_by_user_id = auth.uid()` and status `OPEN`.
2. Given a member who cannot view the order, when they attempt it, then it is refused by the database
   policy and surfaced as a safe error.
3. Given a blocked user, when they attempt it, then it is refused.
4. Given a dispute, when created, then a correlation ID links it to the affected order.

### PS2 — Evidence can be attached and reviewed (P2)

Participants and operators attach evidence to a dispute.

**Why P2**: essential to resolution quality, but constrained by document storage.
**Independent test**: attach an evidence record and confirm visibility rules; confirm no bytes are
stored while DB-BLOCK-01 stands.

**Acceptance scenarios**

1. Given a participant who can view the dispute's order, when they add evidence, then a
   `dispute_evidence` record is created with the uploader recorded.
2. Given an unrelated organization, when they attempt to view or add evidence, then it is refused.
3. Given DB-BLOCK-01, when a file is attached, then no bytes are stored anywhere and the limitation
   is explained.

### PS3 — Compliance reviews and resolves disputes (P1)

A compliance operator moves a dispute through the approved states and records resolution with reason.

**Why P1**: an unresolvable dispute is worse than none.
**Independent test**: as compliance, move a dispute through each approved status and record a
resolution; as any other role, confirm refusal.

**Acceptance scenarios**

1. Given a compliance operator, when they change dispute status (`OPEN`, `UNDER_REVIEW`, `FROZEN`,
   `RESOLVED`, `REJECTED`, `CLOSED`), then it succeeds and records who and why.
2. Given a non-compliance actor, when they attempt a status change, then it is refused.
3. Given resolution, when recorded, then reason/resolution text and `resolved_by`/`resolved_at` are
   stored, and no historical record is edited or deleted.

### PS4 — Disputed state is visible on the affected records (P2)

An order or shipment in a disputed state shows it, and the dispute is reachable from it.

**Why P2**: participants need to understand why something has stopped.
**Independent test**: with an order in `DISPUTED`, confirm the member and operator views show it and
link to the dispute.

**Acceptance scenarios**

1. Given an order with status `DISPUTED`, when viewed, then the state and a link to the dispute
   render for permitted viewers.
2. Given a shipment with status `DISPUTED`, when viewed, then the same applies.
3. Given the relationship between a dispute record and the order's status, when displayed, then the
   UI does not imply an automatic freeze that the system does not perform (see Open items).

### PS5 — Members see notifications they are entitled to (P2)

A member reads notifications addressed to them or their organization.

**Why P2**: important for action-surfacing, but constrained by the notification gaps.
**Independent test**: with seeded notifications, confirm the member sees only their own and that
another user's are unreachable.

> **Constrained by DB-BLOCK-04**: `notifications` has only a SELECT policy, no INSERT policy, no
> UPDATE policy and **no trigger anywhere creates notifications**. In the approved baseline,
> notifications can be neither created nor marked read.

**Acceptance scenarios**

1. Given notifications addressed to the member, when they open the notification surface, then only
   their own are listed.
2. Given another user's notifications, when requested, then nothing is returned.
3. Given DB-BLOCK-04, when the surface renders, then it honestly reflects that notifications cannot
   currently be generated or marked read — it must not simulate a working notification system.

### PS6 — Members can set notification preferences (P3)

A member manages their own notification preferences.

**Why P3**: low value while notifications cannot be generated, but the table is member-writable today.
**Independent test**: set preferences and confirm they persist and are scoped to the user.

**Acceptance scenarios**

1. Given a member, when they change preferences, then the change persists for their user only.
2. Given another user's preferences, when requested, then nothing is returned.

### PS7 — History and correlation are visible to the right people (P2)

Status histories, ownership events and correlation IDs are visible to those entitled, read-only.

**Why P2**: the audit story the platform's trust depends on.
**Independent test**: as member, compliance and auditor fixtures, confirm the correct history
visibility and the absence of any mutation affordance.

**Acceptance scenarios**

1. Given an order, when a permitted viewer opens its history, then transitions with actor, reason and
   timestamp render read-only.
2. Given a listing, when its owner or compliance views history, then transitions render; other members
   see nothing.
3. Given an organization, when its members or admins view account status history, then it renders.
4. Given any history surface, when rendered, then no edit or delete affordance exists.

## Functional Requirements

- **FR-001**: Dispute creation MUST require `can_view_order` and a non-blocked user, with
  `opened_by_user_id = auth.uid()`; the application MUST NOT bypass these policies.
- **FR-002**: Dispute status changes MUST be restricted to compliance operators and MUST record
  actor, reason and timestamp.
- **FR-003**: The application MUST NOT delete or edit any dispute, evidence, history or ownership
  record; corrections are new records only (SRS OPS-02, LOT-03).
- **FR-004**: Evidence records MUST be scoped to participants and permitted operators; cross-
  organization access MUST be impossible.
- **FR-005**: Evidence file handling MUST create private-classified `file_assets` metadata only; **no
  bytes may be stored while DB-BLOCK-01 stands**, and the limitation MUST be stated honestly.
- **FR-006**: Dispute status MUST render the approved vocabulary (`OPEN`, `UNDER_REVIEW`, `FROZEN`,
  `RESOLVED`, `REJECTED`, `CLOSED`).
- **FR-007**: The UI MUST NOT claim or imply that opening a dispute automatically freezes quantity,
  settlement or trading, because the approved baseline implements no such automatic effect (see Open
  items). Any actual freeze is an explicit operator action on the affected record.
- **FR-008**: Notification reads MUST be scoped to the recipient; the feature MUST NOT invent a
  creation or read-state mechanism while DB-BLOCK-04 stands, and MUST state the limitation.
- **FR-009**: Notification preferences MUST be readable and writable only by their owning user.
- **FR-010**: History surfaces (order, listing, account status; ownership events) MUST be read-only
  with no mutation affordance and MUST be scoped by the approved policies.
- **FR-011**: Correlation IDs MUST be displayed where present, monospaced, to support cross-record
  tracing.
- **FR-012**: The compliance dispute-review domain layer MUST be reusable by 010 without duplicating
  guards or error mapping, and MUST expose no bypass path.
- **FR-013**: No dispute, evidence, notification or audit data MUST be cached in a shared cache or
  exposed publicly.
- **FR-014**: All member routes MUST live under `/dashboard`, register with 004's contract, and be
  non-indexable.
- **FR-015**: Screens MUST provide loading, empty, error, unauthorized, suspended and each dispute
  state; all copy externalised; layouts RTL-safe.
- **FR-016**: Where the auditor cannot read `audit_logs` (DB-OPEN-06), audit surfaces MUST explain the
  limitation rather than appearing broken or empty-by-accident.

## Security Requirements

- **SEC-001**: Cross-organization access to disputes, evidence, notifications and histories MUST be
  impossible — verified by negative tests.
- **SEC-002**: Only compliance operators may change dispute status; verified for member, warehouse,
  finance and auditor roles.
- **SEC-003**: No service-role usage anywhere in this feature.
- **SEC-004**: All member- and operator-entered text (reasons, resolutions, evidence notes) MUST be
  treated as untrusted and escaped wherever rendered, including in 010's console.
- **SEC-005**: Dispute and evidence content MUST never appear on any public surface.
- **SEC-006**: No sensitive dispute content may appear in logs or analytics.

## Edge Cases

- A dispute is raised on an order that later settles → the dispute persists independently; no history
  is rewritten.
- Two participants raise disputes on the same order → both records exist; operators triage.
- A dispute is `FROZEN` but the order is not `DISPUTED` → the UI must reflect the actual system state
  rather than implying a freeze that is not enforced (FR-007).
- A member leaves the organization mid-dispute → visibility follows current membership/policy.
- Evidence is added after resolution → permitted if policy allows; the record shows its timestamp.
- A member has no notifications → honest empty state that also explains the DB-BLOCK-04 limitation
  where relevant.
- An auditor opens a history surface they cannot read → explanation, not a silent empty list.

## Success Criteria

- **SC-001**: Cross-organization access to any dispute, evidence, notification or history record is
  impossible in 100% of attempts.
- **SC-002**: Only compliance operators can change dispute status, verified for all other roles.
- **SC-003**: Zero delete or edit paths exist for disputes, evidence, histories or ownership events.
- **SC-004**: Every dispute status renders its approved vocabulary label.
- **SC-005**: The product never claims an automatic dispute freeze that the system does not perform.
- **SC-006**: No notification creation or read-state mechanism is simulated while DB-BLOCK-04 stands.
- **SC-007**: No dispute/evidence/notification/audit data appears in a shared cache or on a public
  route.
- **SC-008**: Every history surface is read-only with zero mutation affordances.

## Assumptions

- The dispute record and the affected record's `DISPUTED` status are related but separate; changing an
  order's status is governed by that order's own policies.
- Audit logging is performed by the database's `write_audit_log` triggers on
  `coffee_offers`, `coffees`, `inventory_ownership_events`, `inventory_positions`, `kyb_applications`,
  `orders`, `organizations`, `payments`, `payouts` and `support_tickets`; this feature displays, never
  writes, audit records.
- Notification generation would be a database/backend concern; this feature does not invent one.

## Open items / blockers

- **DB-BLOCK-04 (expanded, blocks PS5)**: `notifications` has **only** a SELECT policy — no INSERT, no
  UPDATE — and **no trigger anywhere creates notifications**. Therefore notifications can currently be
  neither generated nor marked read. A notification system requires an approved database change
  (creation mechanism + read-state path). Until then the surface must be honest about the limitation.
- **DB-OPEN-09 — dispute freeze authority and effect (NEW)**: SRS MKT-07 says a dispute can freeze
  affected quantity, settlement and trading. In the approved baseline: (a) no trigger on `disputes`
  produces any effect; (b) the freeze would have to come from setting the affected order/shipment to
  `DISPUTED`; (c) `orders` UPDATE is restricted to the buyer (DRAFT/CONFIRMED only) or
  `is_platform_admin()` — so a **COMPLIANCE operator cannot set an order to `DISPUTED`**, even though
  compliance owns dispute resolution. This authority gap needs a product/database decision.
- **DB-BLOCK-01**: dispute evidence files cannot be stored.
- **DB-OPEN-06**: auditors cannot read `audit_logs`.
- **Notification delivery channels**: email/SMS/WhatsApp providers are not approved; no integration
  may be added (SRS §12 lists the approved-provider requirement).

## Dependencies

| Depends on | Why |
|---|---|
| 007, 008, 009 | The orders/payments/shipments disputes attach to and their `DISPUTED` states |
| 003 | Organization/account status history |
| 006 | Listing status history |
| 010 | Compliance review console built on this feature's layer; auditor surfaces |
| 004 | Notification entry point reserved in the topbar |
