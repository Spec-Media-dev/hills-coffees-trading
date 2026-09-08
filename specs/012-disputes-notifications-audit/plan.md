# Implementation Plan: Disputes, Notifications & Audit

**Feature**: `012-disputes-notifications-audit` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Build the accountability layer: member dispute raising and tracking, a compliance dispute-review
domain layer for 010, read-only history/audit surfaces, and an honest notification surface. Three
recorded gaps (notifications cannot be created or marked read; dispute freeze has no automatic effect
and compliance cannot set an order to `DISPUTED`; evidence files cannot be stored) bound what ships —
each is stated in-product rather than simulated.

## Technical Context

**Data (member writes)**: `disputes` INSERT (`can_view_order`, own user, not blocked),
`dispute_evidence` INSERT, `notification_preferences` ALL (own user).
**Data (compliance writes)**: `disputes` UPDATE (`disputes_ops_update`).
**Data (reads)**: `disputes`, `dispute_evidence`, `notifications` (own), `notification_deliveries`,
`order_status_history`, `listing_status_history`, `account_status_history`,
`inventory_ownership_events`, `audit_logs` (admin only).
**Caching**: none (private data).
**Testing**: isolation, role restriction, immutability, honest-limitation assertions.

## Database capabilities consumed

| Need | Approved mechanism | Note |
|---|---|---|
| Raise dispute | `disputes` INSERT `disputes_create` | `opened_by_user_id = auth.uid()` AND `can_view_order` AND not blocked |
| Review/resolve | `disputes` UPDATE `disputes_ops_update` | `is_compliance_operator()` |
| Evidence | `dispute_evidence` INSERT/SELECT | participant or compliance/auditor |
| Notifications | `notifications` SELECT `notifications_own` only | **no INSERT/UPDATE policy, no generating trigger** |
| Preferences | `notification_preferences` ALL | own user |
| Histories | `order_status_history` (`can_view_order`), `listing_status_history` (owner/compliance/auditor), `account_status_history` (org member/admin), `inventory_ownership_events` (org party) | read-only |
| Audit log | `audit_logs` SELECT `is_platform_admin()` | auditor excluded (DB-OPEN-06) |

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; DB-BLOCK-04, DB-OPEN-09, DB-BLOCK-01, DB-OPEN-06 recorded |
| VIII Server/DB authorization | PASS | FR-001/FR-002, SEC-001/002 with negative tests |
| XI Caching | PASS | FR-013 — private data never cached |
| XIV Security | PASS | SEC-001..006 |
| Auditability (§46) | PASS | FR-003/FR-010/FR-011 — append-only, read-only, correlation IDs surfaced |
| OPS-02 no destructive deletion | PASS | FR-003, SC-003 |
| XV Ambiguity rule | PASS | Four gaps surfaced; none simulated |

## Architecture decisions

1. **Disputes are member-raised, compliance-resolved — nothing in between.** `lib/disputes/member.ts`
   (raise + evidence) and `lib/disputes/compliance.ts` (status/resolution, consumed by 010). No
   module can do both.
2. **No implied freeze.** Because the database performs no automatic freeze, the dispute UI describes
   what actually happens. If an operator freezes something, that is an explicit action on the
   affected record (and today, per DB-OPEN-09, that action may not even be available to compliance).
   The product text is written from the system's real behaviour.
3. **Notifications ship as an honest read surface.** The member notification page reads what exists
   and explains the limitation. No client-side "read" state, no local storage of read flags, no
   synthesised notifications from other tables — any of which would be a simulated capability.
4. **Histories are read-only components by construction** (same approach as 005's ledger): no
   disabled buttons, no edit affordance in the component set at all.
5. **Correlation IDs are first-class.** Every history and dispute surface renders correlation IDs
   monospaced so an operator can trace an incident across orders, payments, ownership events and
   audit entries.
6. **The audit surface degrades honestly.** For roles that cannot read `audit_logs`, the area explains
   the policy limitation instead of rendering an empty list that looks like "no activity".
7. **One escaping rule.** All user/operator free text (reasons, resolutions, notes) passes through the
   same escaping path used by 006's listing text, since it renders in both member and console
   surfaces.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── disputes/page.tsx + [disputeId]/page.tsx + actions.ts   # NEW — raise, track, add evidence
├── notifications/page.tsx                                   # NEW — honest read surface
├── notifications/preferences/page.tsx + actions.ts          # NEW — own-user preferences
└── (history surfaces are rendered inline by 005/006/007 using this feature's components)

lib/disputes/
├── member.ts       # NEW — raise + evidence (member-permitted only)
├── compliance.ts   # NEW — status/resolution (consumed by 010)
├── read.ts         # NEW — scoped dispute/evidence DTOs
└── errors.ts       # NEW — safe error mapping

lib/notifications/
├── read.ts         # NEW — own-user notification reads
├── preferences.ts  # NEW — own-user preference reads/writes
└── limitations.ts  # NEW — the documented DB-BLOCK-04 statement surfaced in-product

lib/audit/
├── history.ts      # NEW — order/listing/account status history + ownership events (scoped)
└── access.ts       # NEW — who may read what, incl. the DB-OPEN-06 explanation

components/disputes/ · components/audit/   # NEW — dispute timeline, evidence list,
                                            #       read-only history timeline, correlation ID chip

tests/disputes/ · tests/audit/              # NEW — isolation, role restriction, immutability
```

## Testing strategy

- **Isolation**: unrelated organizations cannot read or write disputes, evidence, notifications or
  histories.
- **Role restriction**: only compliance can change dispute status (member/warehouse/finance/auditor
  all refused).
- **Immutability**: no delete/edit path exists; database refuses attempted mutations of ownership
  events.
- **Honest limitations**: tests assert the *absence* of a simulated notification creation/read
  mechanism and the absence of any claim of automatic freeze.
- **History scoping**: each history type is visible exactly to the roles the policies permit.
- **Escaping**: injected markup in a reason/resolution renders inert in both member and console views.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-04** — notifications cannot be created or marked read | The notification centre is a read-only shell | Ship honestly; no simulation; escalate for an approved creation/read mechanism |
| **DB-OPEN-09** — dispute freeze has no effect; compliance cannot set an order `DISPUTED` | MKT-07 cannot be fully satisfied | Record; do not implement an application-side freeze or grant compliance a bypass |
| **DB-BLOCK-01** — evidence files | Evidence is text-only | Inert seam; honest statement |
| **DB-OPEN-06** — auditors cannot read `audit_logs` | Audit area is limited for auditors | Explain in-product; escalate |
| Free-text injection across two surfaces | XSS in the console | Single shared escaping path, tested from both sides |
