# Implementation Plan: Operations / Admin Console

**Feature**: `010-admin-operations-console` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: Planning prepared — implementation NOT started

## Summary

Compose the domain layers built by 003/005/006/008/009/012 into **role-separated operational work
areas** under `/dashboard-admin`, each independently authorized. The console owns no transactional
logic: settlement goes through 008's `decidePayment`, fulfilment through 009's warehouse layer, and
every decision is recorded through the approved review tables. Least privilege is the design centre —
there is no universal admin bypass.

## Technical Context

**Guard**: 001's `/dashboard-admin` layout guard (`operationalRoles` non-empty), extended per area with
the specific role check.
**Data**: composed from existing domain layers plus catalogue tables (`coffees`, `coffee_lots`,
`origins`, `regions`, taxonomy, `warehouses`, media) and configuration tables (`commission_policies`
/`commission_tiers`, `tax_rules`, `shipping_rules`, `payment_accounts`, `platform_admins`).
**Caching**: no shared caching of operational data; catalogue mutations *revalidate* 002's public tags.
**Testing**: an (area × role) access matrix is the centrepiece, plus decision-recording and
no-hard-delete verification.

## Database capabilities consumed

| Area | Role check | Approved write surface |
|---|---|---|
| Compliance — KYB | `is_compliance_operator()` | `kyb_applications` ALL, `kyb_reviews` ALL, `organizations` UPDATE, `profiles` UPDATE |
| Compliance — listings | `is_compliance_operator()` | `coffee_offers` UPDATE, `listing_reviews` (via policy) |
| Compliance — disputes | `is_compliance_operator()` | `disputes` UPDATE |
| Warehouse | `is_warehouse_operator()` | `inventory_positions` ALL, `storage_allocations` ALL, `order_shipments` ALL, `shipment_items` ALL — **via 009's layer** |
| Finance | `is_finance_operator()` | `admin_review_payment()` **via 008's layer**, `payouts` ALL, `tax_invoices` ALL |
| Catalogue | `is_platform_admin()` | `coffees`, `coffee_lots`, `origins`, `regions`, taxonomy, `warehouses`, media, price tables |
| Audit | `is_auditor()` | read-only (see DB-OPEN-06 for `audit_logs`) |
| System | `is_super_admin()` | `platform_admins`, **`commission_policies` + `commission_tiers`**, `tax_rules`, `shipping_rules`; `payment_accounts` is `is_platform_admin()` |

**Commission configuration (Phase 9, T042–T045)** — this console owns the **Admin management UI**
only. The commission capability itself is already implemented in the database; the behavioural
reference is
[`docs/database/commission-capability.md`](../../docs/database/commission-capability.md).

- Manages the **existing** `commission_policies` (`name`, `status` ∈ `DRAFT`/`ACTIVE`/`ARCHIVED`,
  `effective_from`, `effective_until`) and `commission_tiers` (`min_quantity_kg`,
  `max_quantity_kg`, `percentage`) tables. **No parallel commission tables, no schema change.**
- Both tables are `is_super_admin()`-only under RLS (`commission_admin`, `tiers_admin`, USING and
  WITH CHECK). The console verifies `is_super_admin()` **server-side as well**; the existing RLS is
  the backstop and must not be weakened to make a screen convenient.
- Tier semantics the UI must communicate: selection is by **total order quantity**, minimum
  inclusive, maximum exclusive, `NULL` maximum = open-ended top band; the chosen percentage applies
  to the whole applicable base (**not** progressive/marginal banding).
- **Historical immutability**: every change states "Changes apply to eligible future checkouts
  only", and the console exposes **no** action that recalculates or restates historical orders,
  commission amounts, seller net amounts or payouts.
- Tier **coverage gaps** are surfaced as an operational warning, because an uncovered quantity
  currently yields 0% commission at checkout (`COMMISSION-OPEN-01`). That fallback decision belongs
  to Business/Finance via Feature 008 and is **not** resolved by this console.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; five recorded blockers/open items respected |
| V Surface separation | PASS | FR-001 — `/dashboard-admin` authorizes independently of `/dashboard` |
| VIII Server/DB authorization | PASS | FR-002, SEC-001 — per-area role checks, matrix-tested |
| IX Postgres transactional authority | PASS | FR-004/FR-005 — settlement and fulfilment go through existing layers |
| XI Caching | PASS | FR-011; catalogue changes revalidate public tags only |
| XIII Design fidelity | PASS | FR-015/FR-016 — approved admin layout; no fabricated figures |
| XIV Security | PASS | SEC-001..006; attribution on every decision |
| OPS-02 no destructive deletion | PASS | FR-008, SC-006 |
| XV Ambiguity rule | PASS | Dual control, variance model, DB-OPEN-06 and blockers surfaced |

## Architecture decisions

1. **Area-based route groups, each with its own guard.** `/dashboard-admin/(compliance)`,
   `(warehouse)`, `(finance)`, `(catalogue)`, `(audit)`, `(system)`. Each group's layout performs its
   own role check; there is no shared "is staff" shortcut that would blur the separation.
2. **The console never owns transactional logic.** It imports `decidePayment` (008) and 009's
   warehouse operations. A lint-style grep check in the closure phase proves no direct
   `admin_review_payment` call or raw shipment update exists here.
3. **A single access matrix, expressed in code and in tests.** `lib/admin/areas.ts` declares each
   area's required role; the guard reads it, and the test suite iterates the same matrix so
   declaration and enforcement cannot drift.
4. **Decisions are recorded, not implied.** Every compliance/finance decision writes reviewer,
   decision and reason through the approved review table in the same action as the state change.
5. **Catalogue mutations revalidate public tags.** Each catalogue write calls `revalidateTag` for the
   corresponding 002 tag — the single place where the console touches the public surface.
6. **No hard deletes anywhere.** Destructive affordances are simply not built; state transitions and
   retention/redaction are the only paths offered.
7. **Auditor surfaces are a different component set.** Rather than conditionally disabling buttons,
   auditor views render read-only components — the affordance never exists to be re-enabled by a bug.
8. **Honest capability statements.** Where DB-BLOCK-01/07 or DB-OPEN-06 limit what an operator can
   actually do, the UI says so plainly instead of presenting a control that cannot work.

## Project structure (files this feature adds)

```text
src/app/dashboard-admin/
├── layout.tsx                        # EDITED — real console shell atop 001's guard
├── page.tsx                          # NEW — role-shaped operations overview (real data only)
├── (compliance)/kyb/…                # NEW — queue, application detail, decision actions
├── (compliance)/organizations/…      # NEW — status/suspension actions
├── (compliance)/listings/…           # NEW — listing review queue + decisions
├── (compliance)/disputes/…           # NEW — dispute review (with 012)
├── (warehouse)/inventory/…           # NEW — positions/custody oversight
├── (warehouse)/shipments/…           # NEW — queues + operational transitions (via 009)
├── (finance)/payments/…              # NEW — review queue + decisions (via 008)
├── (finance)/payouts/… + invoices/…  # NEW
├── (catalogue)/coffees|origins|taxonomy|warehouses/…   # NEW — content management + revalidation
├── (audit)/…                         # NEW — read-only evidence views
└── (system)/roles|fees|tax|shipping|payment-accounts/… # NEW — SUPER_ADMIN configuration

lib/admin/
├── areas.ts        # NEW — the access matrix (area → required role)
├── guards.ts       # NEW — per-area server-side verification helpers
├── catalogue.ts    # NEW — catalogue mutations + public cache revalidation
├── decisions.ts    # NEW — KYB/listing/dispute decision recording
└── read.ts         # NEW — operational read DTOs (queues, oversight)

components/admin/   # NEW — console shell, KPI tiles, queue tables, decision panels,
                    #       read-only auditor variants, activity/audit tables

tests/admin/        # NEW — access matrix, decision recording, no-hard-delete, revalidation
```

## Testing strategy (the access matrix is the centrepiece)

- **(Area × role) matrix**: for all six roles and every area, assert allowed areas render and
  forbidden areas are refused server-side (direct URL and direct action invocation).
- **Member-without-role**: every console route refused.
- **Delegation proof**: console contains zero direct `admin_review_payment` calls and zero raw
  shipment updates.
- **Decision recording**: each decision type writes reviewer/decision/reason and changes status once.
- **Concurrency**: two operators deciding the same KYB/payment → exactly one effect.
- **No hard delete**: no console path deletes commercial/inventory/title/payment/audit rows.
- **Catalogue revalidation**: publish/unpublish is reflected on the public site after revalidation.
- **Auditor read-only**: zero mutation affordances; all mutations refused.
- **No fabricated data**: overview figures derive from real queries; empty means empty.

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **OPS-01 dual control not modelled** | High-risk actions have single-operator approval | Record the decision; do not simulate maker-checker in app code |
| **DB-OPEN-06** | Auditors cannot read `audit_logs` | State honestly in the audit area; escalate the policy decision |
| **DB-BLOCK-01** | Reviewers cannot open KYB/proof/evidence documents | State honestly; no improvised file transport |
| **DB-BLOCK-07** | Warehouse oversight of "reserved for delivery" is inaccurate | State honestly; do not compute a substitute reservation |
| **No variance/reconciliation entity** | AC-05 reconciliation screens may not be buildable | Confirm the model first; do not invent a status |
| Role separation eroding over time | Least-privilege regression | Matrix declared once (`areas.ts`) and tested from the same source |
| Console becoming a second transactional engine | Integrity divergence | FR-004/FR-005 + delegation grep in closure |
