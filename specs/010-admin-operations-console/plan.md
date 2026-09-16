# Implementation Plan: Operations / Admin Console

**Feature**: `010-admin-operations-console` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)
**Status**: RUN B complete (2026-09-16) — Phases 3–4: T007/T008/T009/T011 implemented and live-verified; T010 implemented but blocked on the `organizations` compliance read/update policy gap; T012 blocked on Feature 012 (11 / 48). RUN A (2026-09-15): Phases 1–2 + T046. Phases 5–12 NOT started.

## Summary

Compose the available domain layers built by 003/005/006/008/009/012 into **role-separated
operational work areas** under `/dashboard-admin`, each independently authorized. The console owns no
transactional logic: settlement goes through 008's `decidePayment` **only after 008 builds it**,
fulfilment goes through 009's live warehouse layer, and dispute transitions go through 012 **only
after its domain layer exists**. Least privilege is the design centre — there is no universal admin
bypass.

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
| Compliance — KYB | `is_compliance_operator()` | `kyb_applications` ALL, `kyb_reviews` ALL, `organizations` UPDATE (**live finding, RUN B**: effectively unusable for a pure COMPLIANCE operator — no SELECT policy, so the UPDATE matches zero rows; a platform admin succeeds), `profiles` UPDATE |
| Compliance — listings | `is_compliance_operator()` | `coffee_offers` UPDATE, `listing_reviews` (via policy) |
| Compliance — disputes | `is_compliance_operator()` | `disputes` UPDATE |
| Warehouse | `is_warehouse_operator()` | Stored inventory/custody reads; `order_shipments` / `shipment_items` operational changes **only via 009's live warehouse layer**. Delivery reservations are DB-owned and live. |
| Finance | `is_finance_operator()` | Current 008 Phase-1 reads are provider-neutral only. `decidePayment`, review-queue reads, payout management and tax-invoice recording are not yet supplied; no direct `admin_review_payment()` call is permitted. |
| Catalogue | `is_platform_admin()` | `coffees`, `coffee_lots`, `origins`, `regions`, taxonomy, `warehouses`, media, price tables |
| Audit | `is_auditor()` | Console-only read composition once 012 supplies its audit/history layer; `audit_logs` remains unavailable to a pure AUDITOR (DB-OPEN-06) |
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
2. **The console never owns transactional logic.** It imports 009's warehouse operations and may
   import `decidePayment` only once 008 supplies it. A lint-style grep check in the closure phase
   proves no direct `admin_review_payment` call or raw shipment update exists here.
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
8. **Honest capability statements.** KYB-document access is live through 003's approved bucket, but
   non-KYB evidence bytes, DB-OPEN-06, DB-OPEN-09, OPS-01, the variance model, and the
   suspended-organization mid-operation policy remain explicit limits. DB-BLOCK-07 is resolved:
   warehouse views show stored reservation facts and delegate operations to 009.

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
├── areas.ts        # RUN A — the access matrix (area → required role), shell routes, visibility shaping
├── guards.ts       # RUN A — per-area server-side verification (live role-function calls)
├── read.ts         # RUN A — overview counts (role-shaped, RLS-readable tables only)
├── compliance.ts   # RUN B — KYB queue/detail, organizations, listing review DTOs (honest nulls for unreadable rows)
├── decisions.ts    # RUN B — KYB decisions, organization status, listing decisions (compare-and-set + review rows)
├── validation.ts   # RUN B — decision input contracts (DB vocabularies verbatim, reason rules)
└── catalogue.ts    # LATER — catalogue mutations + public cache revalidation

components/admin/   # RUN A — access-denied resolver, state card, role badges, topbar account menu,
                    #         area placeholder (planned/blocked), overview tiles, sign-out button;
                    #         LATER — queue tables, decision panels, read-only auditor variants

src/app/dashboard-admin/
├── layout.tsx                       # RUN A — shell atop 001's untouched guard
├── page.tsx                         # RUN A — real role-shaped overview
├── account/page.tsx                 # RUN A (T046) — operator self-account (Feature 003 authority only)
├── (compliance)/layout.tsx + kyb|organizations|listings|disputes/page.tsx   # RUN A guards + honest placeholders
├── (warehouse)/layout.tsx + shipments|inventory/page.tsx
├── (finance)/layout.tsx + payments|payouts|invoices/page.tsx
├── (catalogue)/layout.tsx + coffees|origins|regions|taxonomy|warehouses|media/page.tsx
├── (audit)/layout.tsx + audit/page.tsx
└── (system)/layout.tsx [is_platform_admin] + payment-accounts/page.tsx
    └── (super)/layout.tsx [is_super_admin] + roles|commission|tax|shipping/page.tsx

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
| **Evidence-byte capability** | KYB access is live; payment, delivery, dispute and public-media bytes have no approved seam | Use only 003's KYB seam; state the owning-feature limitation elsewhere |
| **DB-BLOCK-07 — resolved** | Delivery reservation and settlement gate are live through 009 | Render stored facts; delegate every shipment mutation to 009; no substitute arithmetic |
| **No variance/reconciliation entity** | AC-05 reconciliation screens may not be buildable | Confirm the model first; do not invent a status |
| **DB-OPEN-09 / no 012 domain layer** | No compliant dispute-freeze action or dispute domain seam | Block T012; do not build a parallel dispute engine |
| **Suspended organization mid-operation policy** | Existing shipments are visible but continuation/cancellation/escalation is undecided | Resolve policy before warehouse mutations are released |
| Role separation eroding over time | Least-privilege regression | Matrix declared once (`areas.ts`) and tested from the same source |
| Console becoming a second transactional engine | Integrity divergence | FR-004/FR-005 + delegation grep in closure |

## Run 0 dependency reconciliation and implementation grouping

| Dependency | Current verified contract | Effect on 010 |
|---|---|---|
| 005 | 19/25 complete: member inventory/custody reads, allocations and ownership facts exist; no variance/HOLD/QUARANTINE model exists | T019 may compose stored facts; T020 remains a capability-gap task, not a screen pretending to reconcile |
| 008 | 6/39 complete: provider-neutral finance DTOs/RLS reads and an unavailable funding seam exist; no `decidePayment`, review queue, payout management, invoice recording, provider or webhook path exists | Phase 5 is blocked; 010 neither calls `admin_review_payment` nor creates payment logic |
| 009 | 39/39 closed: named warehouse operations, delivered quantity, settlement-time delivery reservation, settlement gate, and `DISPUTED = FREEZE` are live | T016–T019 consume the layer; no raw shipment update or inventory arithmetic |
| 012 | 0/28: no dispute domain layer, audit/history layer, notification surface, or recovery workflow exists | T012 and the 012-backed audit work remain blocked; Phase 4's listing work is independent |

| Run | Phase(s), task IDs | Prerequisites | Known blockers | Can close now? | Claude | Codex | Preferred |
|---|---|---|---|---|---|---|---|
| A | 1–2: T001–T006 | 001, 002 shell/cache tags, 003 identity | None requiring a DB change | Yes | Opus — High | GPT-5.6 Sol — High | Codex |
| B | 3–4: T007–T012 | Run A; 003 KYB; 006 listing model | T012 needs 012; DB-OPEN-09 blocks freeze semantics | No — T007–T011 can close, T012 cannot | Opus — High | GPT-5.6 Sol — High | Codex |
| C | 5: T013–T015 | Run A; 008 finance layer | 008 lacks `decidePayment`, queue reads, payout management and invoice recording | No | Opus — High | GPT-5.6 Sol — High | Codex |
| D | 6: T016–T020 | Run A; 005 facts; 009 layer | Mid-operation suspension policy; no variance model | No — T019/T020 can proceed honestly; release of T017/T018 awaits policy | Opus — High | GPT-5.6 Sol — High | Codex |
| E | 7–8: T021–T026 | Run A; 002 tags | Media bytes unavailable beyond approved seams; 012 audit/history absent; DB-OPEN-06 | No — T021–T024 can proceed within limits | Opus — High | GPT-5.6 Sol — High | Codex |
| F | 9: T027–T029, T042–T045 | Run A; existing configuration tables | OPS-01; T044's financial-history integration evidence belongs to unfinished 008 | No | Opus — High | GPT-5.6 Sol — High | Codex |
| G | 10–11: T030–T037 | All implemented applicable areas | Inherits all blocked areas; test fixtures for FINANCE/AUDITOR/SUPER_ADMIN are incomplete | No | Opus — High | GPT-5.6 Sol — High | Codex |
| H | 12: T038–T041 | All 010 tasks and dependency evidence | Inherits all outstanding blockers and production gates | No | Opus — High | GPT-5.6 Sol — High | Codex |
