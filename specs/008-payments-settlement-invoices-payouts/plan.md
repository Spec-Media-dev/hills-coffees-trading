# Implementation Plan: Payments, Settlement, Invoices & Payouts

**Feature**: `008-payments-settlement-invoices-payouts` | **Date**: 2026-09-08 |
**Spec**: [spec.md](./spec.md) | **Status**: Planning prepared — implementation NOT started

## Summary

Deliver the MVP finance path: payment instructions → proof submission → finance decision →
database-executed settlement and title transfer → outcome visibility for both parties, plus
invoices and payouts. The two database functions (`submit_payment_proof`, `admin_review_payment`)
own every commercial effect; this feature is a guarded, idempotent, well-mapped caller and a
faithful presenter. Title transfer exists in exactly one place, and it is not in this codebase.

## Technical Context

**Functions**: `submit_payment_proof(order_id, file_asset_id, reference)`,
`admin_review_payment(payment_id, approved, reason)` (FINANCE-only, atomic settlement).
**Reads**: `payments`, `payment_proofs`, `payment_reviews`, `payment_events`, `order_financials`,
`proforma_invoices` + items, `tax_invoices`, `payouts`, `payment_accounts` (admin-managed config).
**Direct writes**: none of consequence — everything commercial goes through the two functions.
**Caching**: none (Constitution XI).
**Testing**: role negatives, settlement effect verification, idempotency, expired-reservation
refusal, cross-organization isolation.

## Database capabilities consumed

| Need | Approved mechanism | Note |
|---|---|---|
| Submit proof | `submit_payment_proof()` | SECURITY DEFINER; creates `payment_proofs`, advances state |
| Settle / reject | `admin_review_payment()` | `is_finance_operator()` only; performs the entire settlement transaction |
| Amount due | `order_financials.buyer_total_amount` | snapshotted at checkout — never recomputed |
| Payment visibility | `payments` SELECT (`can_view_order` or finance/auditor) | |
| Proof visibility | `payment_proofs` SELECT (order-viewer or finance/auditor) | no member INSERT policy — the function handles it |
| Proforma / tax invoice | `proforma_invoices`, `proforma_invoice_items`, `tax_invoices` via `can_view_order` | tax invoice writes are finance-only |
| Payouts | `payouts` SELECT (own seller org or admin); ALL for finance | created by `admin_review_payment` |
| Bank details | `payment_accounts` (admin-only ALL) | read-only here; never member-writable |

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III Database authority | PASS | Zero schema change; DB-BLOCK-01, refunds and dual-control recorded |
| VIII Server/DB authorization | PASS | FR-003, SEC-001 — finance role enforced in app *and* function |
| IX Postgres transactional authority | PASS | FR-001/FR-002 — settlement is entirely database-owned |
| X Transactional integrity | PASS | FR-006 idempotence; SC-003/SC-004 tests |
| XI Caching / no external infra | PASS | FR-010; no gateway/webhook infrastructure (FR-011) |
| XII Server Action discipline | PASS | FR-012 safe error mapping |
| XIV Security & secrets | PASS | SEC-001..006; no member-facing bank-detail changes |
| XV Ambiguity rule | PASS | Refunds, dual control, payout evidence and DB-BLOCK-01 surfaced |

## Architecture decisions

1. **Two single-caller modules.** `lib/finance/proof.ts` is the only caller of
   `submit_payment_proof()`; `lib/finance/settlement.ts` is the only caller of
   `admin_review_payment()`. Both are greppable in one command — the structural guarantee that
   settlement has exactly one entry point.
2. **The decision layer is shared, the screens are not.** `lib/finance/settlement.ts` exposes
   `decidePayment({paymentId, approved, reason})` with guards, idempotency and error mapping. 010's
   Finance console renders the queue and calls this; no console screen calls the function directly.
3. **Idempotency by payment.** A decision is keyed on the payment's current state; a repeat decision
   on an already-`CONFIRMED` payment is a safe no-op rather than a second call, and the function's own
   guard is the backstop.
4. **Amounts are never computed.** Every figure displayed comes from `order_financials` or `payouts`.
   `grep` for arithmetic on money fields is part of the verification (SC-005).
5. **Bank details are configuration, not code.** Instructions render from `payment_accounts`; when
   none is active the UI says so explicitly rather than rendering an empty or invented block (FR-005).
6. **File handling stops at the seam.** Like 003, a single marked function would attach a
   `file_asset_id`; it is inert until a bucket is approved. Reference-text proof still flows.
7. **No gateway, no webhooks.** MVP is manual. If a provider is later approved, SRS API-02's
   requirements are pre-recorded in the spec so nobody implements a webhook without them.
8. **Settlement outcomes are read from the domain owners.** Custody/positions come from 005, listing
   fills from 006 — this feature does not duplicate those reads, it links to them.

## Project structure (files this feature adds)

```text
src/app/dashboard/
├── payments/page.tsx + [orderId]/page.tsx      # NEW — amount due, instructions, proof submission, status
├── payments/[orderId]/actions.ts                # NEW — proof submission action
├── documents/page.tsx                            # NEW — proformas + tax invoices for permitted orders
└── payouts/page.tsx                              # NEW — seller payout list (can_sell organizations)

lib/finance/
├── proof.ts          # NEW — only caller of submit_payment_proof()
├── settlement.ts     # NEW — only caller of admin_review_payment(); consumed by 010
├── read.ts           # NEW — payments/proofs/invoices/payouts DTOs, scoped
├── instructions.ts   # NEW — payment_accounts → instructions presentation
├── errors.ts         # NEW — finance function exception → safe error mapping
└── validation.ts     # NEW — Zod schemas (reference text, decision reason)

components/finance/   # NEW — amount-due panel, instructions block, proof form,
                      #       payment status timeline, payout list, invoice cards

tests/finance/        # NEW — role negatives, settlement effects, idempotency, isolation
```

## Testing strategy (release-blocking)

| Test | Proves |
|---|---|
| **Role negatives** — member/warehouse/compliance/auditor attempt a decision | SC-002, AC-03: only finance can settle |
| **Settlement effects** — approve once, inspect the database | Exactly one ownership event per item, custody created, listing filled, reservation `CONSUMED`, payment `CONFIRMED`, proforma `PAID`, order `PAID` |
| **Idempotency** — decide twice | SC-003: no duplicate settlement/ownership/payout |
| **Expired reservation** — approve after hold expiry | SC-004: refused, no title moves |
| **Pending payment** — assert no ownership event exists before approval | SC-004/AC-03 |
| **Isolation** — other organization's payment/payout/invoice | SC-006 |
| **Amount fidelity** — displayed vs `order_financials` | SC-005 |
| **Error mapping** — each raised exception | SC-007 |

## Risks & blockers

| Risk / blocker | Impact | Handling |
|---|---|---|
| **DB-BLOCK-01** | Payment proof files cannot be stored | Reference-text path only; single inert file seam; recorded in spec |
| **Refund/chargeback model undecided** | No refund workflow can be built | Recorded as a Sprint 0 finance/legal dependency |
| **Dual control (OPS-01) undecided** | 010's console design depends on it | Recorded; single-reviewer is what the schema supports today |
| Temptation to "confirm payment" in app code | Would break AC-03 catastrophically | Single-caller discipline + grep verification + tests |
| Recomputing totals for display | Divergence from snapshot | FR-004 + SC-005 test |
| Two operators deciding simultaneously | Duplicate settlement | Idempotency test + function's own guard |
