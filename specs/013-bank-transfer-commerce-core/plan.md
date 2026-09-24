# Implementation Plan: Bank Transfer Commerce Core

**Branch**: `013-bank-transfer-commerce-core` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/013-bank-transfer-commerce-core/spec.md` (approved; clarification session 2026-09-24)
**Companion artifacts**:
- [research.md](./research.md): repository contradictions C1–C16, decisions R-1–R-28, business questions (Q1–Q3 resolved 2026-09-24; Q4–Q6 open with defaults)
- [data-model.md](./data-model.md)
- [contracts/database-rpc.md](./contracts/database-rpc.md)
- [contracts/rls-storage.md](./contracts/rls-storage.md)
- [contracts/app-surfaces.md](./contracts/app-surfaces.md)
- [contracts/notification-provider.md](./contracts/notification-provider.md)
- [quickstart.md](./quickstart.md)

> **Planning only.** No code, migration, data change, commit or push is made by this plan. Stripe runtime is **not**
> removed by this plan; its removal is Phase 7 of implementation.

## Summary

Feature 013 completes private member commerce for physical green coffee on ordinary bank transfer. The lifecycle runs:
cart (draft order) → saved destination → immutable, versioned proforma (no reservation, 24 h configurable validity) →
explicit all-or-nothing confirmation (20-minute reservation of purchased quantity only) → private proof (timely proof
converts the reservation to a review hold) → finance confirmation of an exact on-time USD transfer (title transfer,
final invoice, seller liabilities, one fulfillment shipment per seller × warehouse) → completion (the only payout
eligibility trigger) → manual payout recording.

The approach **extends the audited database baseline instead of replacing it**. `orders`, `order_items`,
`inventory_reservations`, `proforma_invoices`, `payments`, `payment_proofs`, `payment_reviews`, `payouts`,
`tax_invoices`, `order_shipments`, the Feature 009 delivery-reservation machinery, the title-transfer loop, the Feature
010 configuration tables and admin shells, and the Feature 003 private-evidence pattern are all reused.

All money math moves into one database quote function with per-line/per-component rounding. Per the business decisions of
2026-09-24:
- the commission tier is chosen from each seller's own quantity;
- platform promotions are Hills-funded and seller promotions seller-funded, with funding and applied discount frozen per line;
- negative seller or Hills economics are rejected at configuration or capped at quote time;
- `pg_cron` drives sweeps, notifications and campaigns, while every deadline stays authoritative from timestamps. Checkout is split into
`issue_proforma` and `confirm_proforma`. Proof timeliness is decided under the same order-row lock that expiry uses.
Seller visibility of buyer payment data is removed (C2). Notifications become a transactional outbox with in-app
delivery and a provider boundary. Stripe runtime is retired late, while every historical Feature 008 migration and
evidence file stays untouched.

## Technical Context

**Language/Version**: TypeScript 5 (strict), SQL/PL/pgSQL (Supabase Postgres)
**Primary Dependencies**:
- Next.js 16.3.4 (App Router, Server Components, Server Actions; read `node_modules/next/dist/docs/` before code, per AGENTS.md)
- React 19.2.8
- `@supabase/ssr` 0.12 / `@supabase/supabase-js` 2.116
- Zod 4.5, React Hook Form 7.87
- Tailwind 4, shadcn/Base UI, lucide-react, motion, i18next (existing)
- **No new runtime dependency.** `stripe` and `@stripe/stripe-js` are **removed** in Phase 7.

**Storage**: Supabase Postgres (authoritative), Supabase Storage (new private buckets `payment-proofs`, `finance-documents`)
**Testing**:
- Vitest 3 (jsdom and node), run in batches.
- Live-gated suites (`F013_LIVE=1`) against disposable fixtures.
- CDP browser proofs (`tests/browser/cdp-harness.mjs`) and axe-core.
- Read-only SQL postflights.

**Target Platform**: Vercel-style Node runtime for Next.js; Supabase (Postgres 15+, Storage, Auth with TOTP MFA)
**Project Type**: Web application (single Next.js repository: `src/app`, `lib`, `components`, `supabase`, `tests`)
**Performance Goals**:
- Cart/checkout pages p95 < 1.5 s server render.
- Confirmation RPC p95 < 500 ms for ≤ 20 lines.
- Finance queue: first page < 1 s at 10k payments.
- Concurrency proof: 100 contention runs with zero oversell (SC-002).

**Constraints**:
- USD only. The 20-minute reservation is fixed. Proforma validity is admin-configured (default 24 h, frozen at issue).
- No Redis or external cache (Constitution XI). No new vendor. No service-role key in any browser/member path.
- Historical migrations are immutable.
- The Feature 010 static invariants: no policy/trigger changes on the six configuration tables; migration names must avoid `commission|payment_accounts|platform_admins|run_f|feature_010`.

**Scale/Scope**: B2B member base (hundreds of organizations, thousands of listings), about 30 new or changed screens, 9 forward migrations, about 40 SQL functions and triggers.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design (below). Result: PASS, with three items surfaced
as business questions per Principle XV (not violations).*

| Principle | How this plan complies | Status |
|---|---|---|
| I Identity/scope | No exchange/order-book semantics; private member commerce only; no leverage/derivatives | PASS |
| II Source priority | The SRS was checked. Its minimum order states (Quoted/Accepted/Payment Pending/Paid/Allocated/Fulfilled/Cancelled/Refunded/Disputed) map onto R-1 (Refunded = manual adjustment record); MKT-02/03/04 and TXN-01 are satisfied by R-2/R-9/R-12. Approved DB baseline read first; the spec wins over existing code (C1–C16 recorded, not silently patched) | PASS |
| III Database authority | Every schema change is a forward migration with guard, preflight, rollback, postflight and a security review. No renames of existing tables/values (R-1). No frontend replacement of DB workflows | PASS |
| IV Locked root | `src/app/page.tsx`, `layout.tsx` and `globals.css` untouched | PASS |
| V Surface separation | Buyer and seller in one `/dashboard`; finance/admin/warehouse in `/dashboard-admin`; nothing on the public site except the existing member-only boundary | PASS |
| VI Capability model | can-buy/can-sell re-checked inside every RPC; registration never authorizes trading | PASS |
| VII Public/private boundary | Anon gets nothing new (AC-014 probes); member listing prices and tiers stay member-only; reference vs member vs executed prices stay separate | PASS |
| VIII Server/DB authorization | All mutations via SECURITY DEFINER RPCs with internal role/state checks; RLS realigned (C2); UI gating is never authorization | PASS |
| IX Transactional authority | Pricing, reservation, settlement, title, invoice, payout and fulfillment are in Postgres; TypeScript only formats; no service role in app paths | PASS |
| X Inventory integrity | Existing position/offer reservation arithmetic, DB-OPEN-16 marker, title loop and 009 delivery reservation reused; oversell prevented by locks; partial fills preserved | PASS |
| XI Caching | Private routes are dynamic with no shared cache; no Redis; scheduling uses Supabase `pg_cron` (approved 2026-09-24; no new vendor), and correctness never depends on it | PASS |
| XII Rendering/Server Actions | Server Components by default; small client islands (forms, countdown, upload); Zod + RHF; typed feedback | PASS |
| XIII Design fidelity | Reuses Hills tokens, app shell, DataTable, StateScreen, media rules; no parallel design system | PASS |
| XIV Secrets/documents | Private buckets, server-minted 60 s signed URLs, redacted audit, no bank values or paths in logs/notifications | PASS |
| XV Spec-driven/ambiguity | The financially material questions were surfaced, not guessed. Q1–Q3 were answered by the business on 2026-09-24 and recorded in spec.md (Clarifications, FIN-011/012/013). Q4–Q6 keep spec-literal defaults | PASS |

**Post-design re-check (after data-model/contracts)**: still PASS. The design adds no public surface, no external
infrastructure, and no client-side money logic, and it changes no historical migration. The only elevated-privilege
additions are service-role-only worker functions (never reachable from browser code) and one gated
SECURITY DEFINER search projection (justified under Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/013-bank-transfer-commerce-core/
├── spec.md                  # approved specification (input)
├── plan.md                  # this file
├── research.md              # Phase 0: contradictions, decisions, questions
├── data-model.md            # Phase 1: tables, constraints, state machines, lock order
├── quickstart.md            # Phase 1: validation guide
├── contracts/
│   ├── database-rpc.md      # functions, triggers, workers
│   ├── rls-storage.md       # policies, grants, views, buckets
│   ├── app-surfaces.md      # routes, Server Actions, modules, components
│   └── notification-provider.md
├── checklists/requirements.md
└── tasks.md                 # created by /speckit-tasks (NOT by this command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/              # + 9 forward files 2026092510…–2026093010… (M1–M9; §4)
├── rollback/                # + matching *.rollback.sql per migration
└── maintenance/             # + feature_013 preflight + per-migration postflight (read-only)
lib/
├── commerce/                # NEW domain: cart, destinations, quote, proforma, reservation, payment-proof, types, validation, errors, labels, read
├── finance/                 # review, reconciliation, payouts, invoices, adjustments, read (changed); stripe/ funding settlement removed in Phase 7
├── notifications/           # read-state, templates, campaigns, providers/, worker (new); read, limitations (changed)
├── promotions/              # NEW: platform, seller, read
├── listings/                # + tiers.ts, search.ts; browse.ts unchanged for detail
├── orders/                  # legacy flow kept for LEGACY rows; checkout.ts/expiry.ts retired after drain
├── admin/                   # areas.ts (finance areas live, new areas), commerce-settings.ts, payment-accounts.ts (default flag)
└── app/copy/{en,ar}.ts      # all new member/admin copy (EN/AR parity)
src/app/dashboard/           # cart, destinations, checkout, orders/[id]/{proforma,payment,invoice}, promotions, notifications, sales, payouts, coffee
src/app/dashboard-admin/     # (finance) payments/[id], reconciliation, invoices/[id], payouts/[id], orders/[id]; (system) commerce-settings, campaigns, outbox; (catalogue) promotions
components/                  # commerce/, finance/ (new parts), notifications/, promotions/, listings/price-tier-editor, marketplace-filters
tests/commerce/              # NEW static + live suites; tests/browser/feature013-*.browser.mjs
scripts/seed-test-fixtures.ts  # + --prepare/--cleanup-f013-fixtures (exact identities)
```

**Structure Decision**: the existing single Next.js application and the Supabase directory layout are kept. A new
`lib/commerce/` domain holds the member purchase journey. `lib/orders/` stays as the legacy Feature 007 flow for
`LEGACY` orders until they are drained, which avoids a risky in-place rewrite of tested modules.

---

## 1. Architecture summary

```
Marketplace (search_member_listings, gated projection)
   └─ Add to cart ─▶ add_cart_line ─▶ orders(DRAFT, BANK_TRANSFER_V1) + order_items   [no reservation]
Cart ─▶ estimate_cart (compute_order_quote, estimate only)
Checkout ─▶ issue_proforma ─▶ proforma v_n + frozen snapshots (items, line economics, groups, seller settlements,
                               bank instructions) + order_financials; order PROFORMA_ISSUED   [no reservation]
Proforma ─▶ confirm_proforma ─▶ atomic reservation (ACTIVE, 20 min) + payment PENDING; order HOLD
Payment page ─▶ private upload (bytes only) ─▶ submit_payment_proof (locked deadline check) ─▶ REVIEW_HOLD; order PAYMENT_UNDER_REVIEW
Finance ─▶ finance_confirm_payment (exact/on-time/USD/non-duplicate) ─▶ reservation CONSUMED, title transfer, invoice,
           payouts ACCRUED, FULFILLMENT shipments per seller×warehouse, order PAID
        └─ finance_reject_payment ─▶ hold RELEASED, order PAYMENT_REJECTED
        └─ reconciliation_cases / manual_financial_adjustments (no inventory effect)
Warehouse (Feature 009 unchanged) ─▶ sync_order_fulfillment ─▶ PARTIALLY_DELIVERED / COMPLETED ─▶ payouts PENDING_PAYOUT
Finance ─▶ record_seller_payout ─▶ PAID
Every step ─▶ notification_events (outbox) ─▶ process_notification_events ─▶ notifications (+ future channel deliveries)
Expiry ─▶ authoritative timestamps in every read/write/check + opportunistic reclaim (confirm) + pg_cron sweeper (approved)
```

Server boundary: each browser action goes through a Server Action (Zod → identity → one `lib/*` call → one RPC). Reads
go through RLS with the anon/authenticated key. Workers run inside Postgres (pg_cron) or server-side with service
role, never in the browser.

## 2. Reusable existing foundations

| Category | Items |
|---|---|
| **Reuse as-is** | `orders`/`order_items` + `validate_order_item_offer`; `update_order_item_quantity`/`remove_order_item` (Feature 007 RPCs); `inventory_positions`/`inventory_reservation_items`; offer reservation mirror + `app.checkout_reservation` marker (DB-OPEN-16); `inventory_ownership_events` (append-only) and `storage_allocations`; Feature 009 `validate_shipment_transition`, `apply_delivery_reservation`, `reserve_ready_deliveries_for_settlement`, custody arithmetic; `tax_rules`, `shipping_rules`, `commission_policies`/`commission_tiers` and their Feature 010 admin UIs; `payment_accounts` admin + redacted audit; `mfa_satisfied()`, role helpers (`is_finance_operator`, `is_warehouse_operator`, `is_auditor`, `is_platform_admin`, `organization_can_buy/sell`, `is_authorized_member`); `write_audit_log`, `order_status_history`; `order_code`/`proforma_code` sequences; `notification_preferences`; the Feature 003 private bucket helper pattern; `ListingCard`, `MediaGallery`, listing media rules; app shells, `DataTable`, `StateScreen`, status badges; `getBrowseListings` for detail reads; `lib/types/action-feedback`; `tests/browser/cdp-harness.mjs`; seed-fixture framework |
| **Modify** | `orders` (status set, destination/proforma/flow columns); `inventory_reservations` (`REVIEW_HOLD`, open-reservation index); `proforma_invoices` (+ versioning and totals, unique key replaced); `proforma_invoice_items` (+ buyer line fields); `order_financials` (+ proforma pointer, frozen); `payments` (+ expected/observed fields); `payment_proofs` (+ claim fields, authoritative submission); `payment_reviews` (+ reconcile decision); `payouts` (+ `ACCRUED`, eligibility); `tax_invoices` (nullable file, snapshot); `order_shipments` (+ fulfillment group columns); `notifications`/`notification_deliveries`/`notification_preferences` (event linkage, channels); `coffee_offers` (+ `offer_code`); `payment_accounts` (+ default flag column only); `validate_order_transition` (v2 graph); RLS policies on payments/proofs/financials/proformas/items/invoices/payouts/shipments (C2); `lib/admin/areas.ts`, `lib/dashboard/registry.tsx`, finance/order/notification pages, `lib/notifications/limitations.ts`; seed script |
| **New** | `commerce_settings`, `commerce_request_log`, `delivery_destinations`, `proforma_line_economics`, `proforma_fulfillment_groups`, `proforma_seller_settlements`, `proforma_bank_instructions`, `reconciliation_cases`(+events), `manual_financial_adjustments`, `promotions`/`promotion_targets`, `offer_price_tiers`, `notification_events`, `notification_campaigns`(+recipients); RPCs in [database-rpc.md](./contracts/database-rpc.md); buckets `payment-proofs`, `finance-documents`; `lib/commerce`, `lib/promotions`, notification providers/templates; the member and admin routes in [app-surfaces.md](./contracts/app-surfaces.md) |
| **Legacy runtime to remove later (Phase 7)** | `package.json` `stripe`, `@stripe/stripe-js`; `lib/finance/stripe/{adapter,config,webhook}.ts`; `lib/finance/funding.ts`; Stripe parts of `lib/finance/settlement.ts` and `lib/finance/errors.ts`; `components/finance/stripe-payment-collector.tsx`, `funding-unavailable-notice.tsx`; `src/app/dashboard/payments/[orderId]/page.tsx` (replaced in Phase 4); `supabase/functions/stripe-create-payment-intent`, `stripe-webhook`, `stripe-release-transfer`; Stripe env/secrets; `tests/finance/stripe-boundary-security.test.ts`, `stripe-webhook.test.ts`, `funding.test.ts` (converted to absence tests) |
| **Historical artifacts that must remain unchanged** | `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql`, its rollback and postflight; every other applied migration/rollback/postflight; `specs/008-*` (spec, plan, tasks, STRIPE-PREPARATION.md, handoff): supersession is recorded **only** in Feature 013 and the roadmap, and 008 tasks are not marked complete; DB objects `payment_events`, `payment_transfers`, `payments.trusted_funding_*`, `ingest_stripe_event`/`record_stripe_payment_intent`/`record_payment_transfer` (kept, EXECUTE revoked in M9) |

## 3. Required schema changes

Full definitions are in [data-model.md](./data-model.md). In summary:
- **Status vocabularies**:
  - orders + `PROFORMA_ISSUED`, `CANCELLED`, `PAYMENT_REJECTED`;
  - reservations + `REVIEW_HOLD`;
  - proformas + `CONFIRMED`, `EXPIRED`, `SUPERSEDED`, `CANCELLED`;
  - payouts + `ACCRUED`;
  - payment_reviews + `SENT_TO_RECONCILIATION`;
  - deliveries/preferences + `PUSH`/`SKIPPED`.

  Legacy values are kept.
- **Flow flag**: `orders.commerce_flow` (`LEGACY` | `BANK_TRANSFER_V1`) lets old and new flows coexist safely during cutover.
- **Frozen economics**: proforma header totals and snapshots, extended items, line economics, fulfillment groups, seller settlements, bank instructions; all immutable by trigger.
- **Destinations**: `delivery_destinations` plus the order destination snapshot.
- **Finance records**:
  - payment expected/observed fields with a unique confirmed bank reference;
  - proof claim fields with one authoritative on-time submission;
  - reconciliation cases/events; manual adjustments (append-only);
  - `tax_invoices` with a nullable file, a snapshot and a number sequence;
  - `payouts` accrual/eligibility.
- **Fulfillment**: `order_shipments` gains `shipment_kind`, the group seller/warehouse columns and a unique group index.
- **Marketplace**: `offer_code` (+ backfill), `offer_price_tiers`, `promotions`/`promotion_targets`.
- **Notifications**: `notification_events` outbox, notification linkage and uniqueness, campaigns.
- **Operations**: `commerce_settings` (validity hours, kill switches), `commerce_request_log` (idempotency).
- **Indexes**:
  - open reservation per order (partial unique);
  - `(expires_at) WHERE status='ACTIVE'`;
  - `(status, next_attempt_at)` on the outbox and deliveries;
  - queue indexes: `payments(status, updated_at)`, `reconciliation_cases(status, opened_at)`, `payouts(status, eligible_at)`;
  - `delivery_destinations(organization_id) WHERE retired_at IS NULL`;
  - `offer_price_tiers(offer_id, min_quantity_kg)`;
  - `promotions(scope, status, starts_at, ends_at)` + `lower(code)` unique partial.
- **Backfill**:
  - `offer_code` for existing offers;
  - `commerce_flow = 'LEGACY'` for every existing order (column default);
  - `commerce_settings` singleton row;
  - no financial rows are rewritten.

## 4. Migration sequence

Version numbers are placeholders. At task time each must be later than `20260924120000` and strictly ascending. Each
migration comes with:
- (a) a `do $guard$` block that aborts on baseline drift or unmappable legacy rows (the 007/009 pattern);
- (b) `supabase/rollback/<same>.rollback.sql`;
- (c) a read-only `supabase/maintenance/<date>_<name>_postflight.sql`;
- (d) a human security review before apply.

No agent applies a migration without recorded approval (MIG-002).

| # | File (placeholder version) | Phase | Content | Guard aborts when | Rollback (before real financial rows) |
|---|---|---|---|---|---|
| M1 | `20260925100000_feature_013_commerce_state_vocabulary.sql` | 2 | status CHECK widening; `commerce_flow`; `commerce_settings`; `commerce_request_log`; reservation/proof/payment/payout/review columns; open-reservation index swap; `payment_accounts.is_default_for_currency` (column + index only); `offer_code` + sequence + backfill; `validate_order_transition` v2 (legacy graph preserved for `LEGACY` rows); `payment_proofs.submitted_at` backfilled from `created_at`; `commerce_flow` default stays `LEGACY` | function fingerprints of `validate_order_transition`/`admin_review_payment` differ from preflight capture; unknown status values present | restore previous CHECKs/indexes/function body; drop new columns/tables (empty) |
| M2 | `20260925110000_feature_013_snapshots_destinations_outbox.sql` | 2 | `delivery_destinations`; proforma versioning (drop `proforma_invoices_order_id_key`, add version indexes, totals, snapshot columns); snapshot tables; `order_financials` ext + freeze trigger; `tax_invoices` ext + sequence; `reconciliation_cases`/events; `manual_financial_adjustments`; `promotions`, `promotion_targets`, `offer_price_tiers` (tables only); `order_shipments` fulfillment columns + unique group index; `notification_events` + `emit_notification_event`; immutability and redacted-audit triggers | any non-terminal `LEGACY` order holds an `ISSUED` proforma (uniqueness change) and the operator has not drained it; duplicate `(order_id)` proforma rows | re-add unique key (safe only while every order has ≤ 1 proforma); drop new tables/columns |
| M3 | `20260925120000_feature_013_rls_realignment.sql` | 2 | helper functions; replace the policies listed in [rls-storage.md §1](./contracts/rls-storage.md); restrictive MFA gates; redacted views; revoke direct finance write policies (`payment_reviews_finance`, `payouts_finance`, `tax_invoice_finance` → SELECT) | expected existing policy names/expressions differ from preflight | recreate the exact previous policies (captured in the rollback file from the preflight output) |
| M4 | `20260926100000_feature_013_cart_proforma_reservation.sql` | 3 | `get_or_create_cart`, `add_cart_line`, destination RPCs, `compute_order_quote`, `estimate_cart`, `issue_proforma`, `confirm_proforma`, `cancel_order`, `expire_reservation`, `sweep_expired_reservations`, `update_commerce_settings`, `set_default_payment_account`, `admin_void_order`, `admin_convert_legacy_draft`; `commerce_flow` default → `BANK_TRANSFER_V1` + `enforce_new_order_flow` insert guard (H1) | helper signatures missing; `checkout_order` fingerprint differs (the lock pattern it mirrors) | drop new functions (checkout remains disabled by the kill switch default) |
| M5 | `20260927100000_feature_013_bank_transfer_settlement.sql` | 4 | buckets `payment-proofs`, `finance-documents` + storage policies + object helpers; `submit_payment_proof` (new overload), `report_late_transfer`, `authorize_payment_proof_access`, `finance_confirm_payment`, `finance_reject_payment`, reconciliation RPCs, `record_manual_adjustment`, `record_seller_payout`, invoice RPCs; `sync_order_fulfillment` trigger + one-time recompute of existing fulfillment orders (M5) | buckets already exist with different settings; 009 helper fingerprints differ | drop functions/trigger; buckets kept only if empty (else disable via kill switch — MIG-006) |
| M6 | `20260927110000_feature_013_legacy_checkout_retirement.sql` | 4 exit (cutover) | revoke EXECUTE from `authenticated` on `checkout_order`, `admin_review_payment`, legacy `submit_payment_proof` overload, and `expire_order_hold` once no non-terminal `LEGACY` order remains; drop buyer shipment-planning policies `shipments_buyer_insert`/`shipments_buyer_draft_update` | any non-terminal `LEGACY` order exists (MIG-004) | re-grant EXECUTE / recreate policies (exact text in rollback) |
| M7 | `20260928100000_feature_013_notification_delivery.sql` | 5 | notifications/deliveries/preferences extensions and uniques; campaigns + recipients; `process_notification_events`, `dispatch_due_campaigns`, delivery claim/complete, `mark_notifications_read(_all)`, campaign RPCs, admin wrappers `admin_process_outbox_now`/`admin_dispatch_due_campaigns_now` (H2) | duplicate notification rows would violate new uniques | drop new objects; widen-only CHECK changes reverted |
| M7b | `20260928110000_feature_013_scheduler_jobs.sql` (approved 2026-09-24) | 5 | `cron.schedule` for `f013_sweep_reservations`, `f013_process_outbox`, `f013_dispatch_campaigns` (every minute) and `f013_purge_request_log` (daily) | `pg_cron` extension absent | `cron.unschedule` |
| M8 | `20260929100000_feature_013_promotions_tiers_search.sql` | 6 | promotion/tier RPCs, `validate_promotion_scope`, `search_member_listings` | — | drop functions/trigger |
| M9 | `20260930100000_feature_013_stripe_runtime_restriction.sql` | 7 | revoke EXECUTE on `ingest_stripe_event`, `record_stripe_payment_intent`, `record_payment_transfer` from every role; restrict `payment_events`/`payment_transfers` to finance SELECT; comments recording retention | any `PROVIDER` payment is non-terminal | re-grant exact previous ACLs |

tasks.md splits M2 into M2a–M2e, M4 into M4a–M4c and M5 into M5a–M5c for independent review. The content is unchanged; the
tasks' migration inventory is authoritative for file names and order.

Preflight (Phase 1, read-only): `supabase/maintenance/<date>_feature_013_preflight.sql` implements R-21 and captures
function bodies and policy definitions so each rollback restores exact text.

Postflight per migration (read-only):
- structure, CHECK sets, index definitions;
- RLS enabled + forced; grants/ACL (no anon, no `authenticated` table writes);
- function `prosecdef`, `search_path` and EXECUTE lists;
- trigger bindings, bucket settings and storage policies;
- backfill completeness (`offer_code` not null), singleton row present;
- legacy row counts unchanged.

## 5. State machines

The authoritative tables are in [data-model.md §7](./data-model.md#7-state-machines-authoritative-transition-tables--enforced-in-triggersrpcs).

| Object | Normal path | Other exits |
|---|---|---|
| Order | `DRAFT → PROFORMA_ISSUED → HOLD (awaiting transfer) → PAYMENT_UNDER_REVIEW → PAID → FULFILLMENT_IN_PROGRESS/PARTIALLY_DELIVERED → COMPLETED` | `CANCELLED` (before proof), `EXPIRED`, `PAYMENT_REJECTED`, `VOID` (admin, pre-payment), `DISPUTED` (existing) |
| Proforma | `ISSUED → CONFIRMED → PAID` | `EXPIRED` (replaced by version n+1), `CANCELLED`, `VOID`, `SUPERSEDED` (admin re-issue only) |
| Reservation | `ACTIVE (20 min) → REVIEW_HOLD → CONSUMED` | `EXPIRED`; `RELEASED` (cancel/reject/void) |
| Payment | `PENDING → UNDER_REVIEW → CONFIRMED` | `REJECTED`, `EXPIRED`, `VOID` |
| Proof | `SUBMITTED → ACCEPTED` | `REJECTED`; `IN_RECONCILIATION` (and `LATE_REPORT` starts there) |
| Reconciliation | `OPEN → IN_REVIEW → RESOLVED` | `CLOSED_NO_ACTION`; never touches inventory |
| Shipment (fulfillment) | `DRAFT → REQUESTED` (settlement), then the unchanged Feature 009 warehouse graph to `DELIVERED` | 009 `CANCELLED`/`FAILED` recovery rules |
| Payout | `ACCRUED → PENDING_PAYOUT (completion) → [PROCESSING] → PAID` | `VOID` (admin exception + manual adjustment) |
| Campaign | `DRAFT → SCHEDULED → DISPATCHING → SENT` | `CANCELLED`, `FAILED` |

## 6. Transaction and locking design

Global lock order: **order → proforma → reservation → payment → proof → offers (id ↑) → positions (id ↑) → inserts**
([data-model.md §8](./data-model.md#8-global-locking-order-every-feature-013-function-deadlock-free-by-construction)).
Every function below is **one database transaction**. Clocks use `clock_timestamp()` for deadlines.

| Operation | Boundary and locks | Exactly-once / race handling |
|---|---|---|
| **Issue proforma** | Lock order (DRAFT, or PROFORMA_ISSUED with an expired open proforma) → lock the open proforma if any. Read configuration without locks; quote values are snapshotted in the same transaction. **No offer/position locks** (no reservation) | Request-log replay; the partial unique "one open proforma per order" makes a concurrent double issue fail the second writer (`proforma_still_valid`) |
| **Confirm proforma / reserve** | Lock order → proforma (ISSUED ∧ not expired) → reclaim logically expired reservations on the same offers (their orders locked `SKIP LOCKED`) → offers ↑ → positions ↑ → reserve all lines or raise → insert reservation + items → payment `PENDING` → proforma `CONFIRMED` → order `HOLD` | Offer/position row locks serialize competing buyers (oversell impossible). `uq_open_inventory_reservation_order` prevents double reservation. Any line failure aborts the whole transaction (atomic all-or-nothing) |
| **Reservation expiry** | `expire_reservation`/sweeper: lock order (`SKIP LOCKED` in the sweeper) → reservation (`ACTIVE ∧ expires_at ≤ clock`) → offers ↑ → positions ↑ → release → statuses `EXPIRED` | The status predicate under lock makes a second run a no-op; `REVIEW_HOLD` is never expired |
| **Proof near expiry** | `submit_payment_proof`: lock order → reservation; accept iff `ACTIVE ∧ clock < expires_at`; flip to `REVIEW_HOLD` in the same transaction | Expiry and proof both need the order lock, so exactly one wins. The loser sees the committed state (proof → `reservation_expired`, shown with the late-report path; expiry → no-op). Byte uploads have no effect |
| **Finance confirm** | Resolve order id → lock order → proforma → reservation (`REVIEW_HOLD`) → payment (`UNDER_REVIEW`) → proof → offers ↑ → positions ↑ → title loop → 009 hook → payouts `ACCRUED` → invoice → fulfillment shipments → statuses → outbox | State checks + unique keys (payouts, invoice, group shipments, outbox, confirmed bank reference) → no duplicate effect; a replay returns the stored result |
| **Finance reject** | Lock order → proforma → reservation (`REVIEW_HOLD`) → payment (`UNDER_REVIEW`) → offers ↑ → positions ↑ → release → statuses | The same order lock as confirm, so confirm and reject cannot both succeed; the second gets `payment_already_decided` |
| **Buyer cancel** | Lock order → proforma → reservation (`ACTIVE`) → payment → (no proof exists) → offers ↑ → positions ↑ → release | Proof submission holds the same order lock; after a proof exists, cancel is refused |
| **Payout eligibility** | Inside `sync_order_fulfillment` (same transaction as the shipment status update): lock order → evaluate all FULFILLMENT groups → `COMPLETED` → `UPDATE payouts SET status='PENDING_PAYOUT', eligible_at=clock WHERE order_id=… AND status='ACCRUED'` | Guarded update is idempotent; completion is evaluated under the order lock |
| **Order completion** | As above; completion requires every FULFILLMENT group `DELIVERED` with delivered = planned per line | A CANCELLED/FAILED group blocks completion (no payout eligibility) until resolved by the 009 recovery rule or an audited exception |

### How each forbidden outcome is prevented

| Outcome | Prevention |
|---|---|
| Overselling | Locked availability check on offer **and** position per line in `confirm_proforma` (plus the existing CHECK `filled + reserved ≤ quantity` and the position reserved ≤ available constraint) |
| Double reservation | `uq_open_inventory_reservation_order` + order lock + `PROFORMA_ISSUED` precondition |
| Duplicate proformas | One-open-proforma partial unique + `UNIQUE(order_id, version)` + order lock |
| Duplicate proof submission | Partial unique `(payment_id) WHERE submission_kind='ON_TIME'` + `request_id UNIQUE` + state check |
| Expiry vs proof race | Shared order lock + `clock_timestamp()` predicates |
| Finance confirm vs reject race | Shared order lock + payment state check |
| Stale checkout totals | Money only from `compute_order_quote` at issuance; confirmation never re-prices; a UI estimate is labelled; a replacement is required after expiry |
| Cross-seller financial leakage | Table-level separation (line economics, seller settlements) + realigned RLS + seller views limited to own rows |
| Unauthorized proof access | Private bucket, authorization-checked server-minted 60 s URLs, no paths to the browser, access audited, no seller/warehouse/auditor storage grant |
| Replay / idempotency bugs | `commerce_request_log` + state checks + unique keys on every effect |

## 7. RLS, grants and storage design

See [contracts/rls-storage.md](./contracts/rls-storage.md). Key points:
- Buyer, seller and finance are separated per table.
- Sellers lose access to buyer payment, proof, financial and proforma header data (C2).
- Buyers never see commission.
- Auditors get only redacted views.
- Warehouse gets fulfillment data only.
- Restrictive MFA gates apply to every commerce table.
- Nothing new for anon.
- No client table writes; every write goes through an RPC.
- Private buckets have no update/delete policy.
- Signed URLs are minted server-side only.

## 8. Route and component plan

See [contracts/app-surfaces.md](./contracts/app-surfaces.md):
- **Member**: marketplace (filters, add to cart), cart, destinations, checkout, proforma, payment, order timeline, invoice, sales, payouts, promotions, notifications.
- **Admin**: payments review queue/detail, reconciliation, invoices, payouts, order finance, commerce settings, promotions, campaigns, outbox, plus existing tax/shipping/commission/payment-accounts pages.

Client islands are limited to forms, the countdown, the upload, filters, mark-read and confirm dialogs.

## 9. Admin plan

| Capability | Route | Role | Notes |
|---|---|---|---|
| Bank accounts / default USD account | `/dashboard-admin/payment-accounts` (existing) | platform admin | + `set_default_payment_account`; masked display; changes never alter issued proformas (FR-020) |
| VAT / shipping | `/tax`, `/shipping` (existing) | super admin | future-effective copy; shipping country/fallback precedence explained |
| Commission | `/commission` (existing) | super admin | coverage warning when member lines could hit `commission_rule_missing` |
| Commerce settings | `/commerce-settings` (new) | platform admin + MFA | validity hours, checkout/proof kill switches |
| Promotions | `/promotions` (new) | platform admin | platform promotions; read-only seller promotions |
| Payment review queue/detail | `/payments`, `/payments/[paymentId]` | finance + MFA | search/filter/sort; immutable values beside the proof; deliberate confirm/reject/reconcile (UX-006, SC-007 < 3 min) |
| Reconciliation cases | `/reconciliation`, `/[caseId]` | finance | no inventory actions available anywhere |
| Final invoices | `/invoices`, `/[invoiceId]` | finance | attach signed PDF; printable view; proformas are labelled "not an invoice" |
| Payout queue/detail | `/payouts`, `/[payoutId]` | finance + MFA | `ACCRUED` = not payable; record the external payment once |
| Order finance + adjustments + void | `/orders/[orderId]` | finance/admin + MFA | manual adjustments append-only; void pre-payment only |
| Notifications/campaigns | `/campaigns` (+new/detail), `/outbox` | platform admin | bilingual content required; schedule/cancel; outbox health |

## 10. Buyer plan
1. **Marketplace**: filter/sort, open a listing, see the tier table, add a quantity to the cart. The UI states that stock is not reserved.
2. **Cart**: grouped by seller × warehouse; estimated prices; edit/remove; continue to checkout.
3. **Destinations**: create/edit/default/retire; the checkout picker lists active destinations; with none, checkout is blocked with a link to add one (US1-AS2).
4. **Checkout**: destination, promo code and full estimate → **Issue proforma** (the confirm dialog explains the validity window).
5. **Proforma**:
   - frozen document with its version and code, deadline countdown, **Confirm & reserve (20 min)**, Cancel;
   - when expired, **Issue replacement** (current terms, with a diff notice).
6. **Payment**:
   - countdown, exact amount, payment reference, bank instructions with copy buttons, proof requirements, upload + submit;
   - after submission: "Under finance review — stock remains reserved";
   - if expired: explanation + **Report a late transfer**.
7. **Status and invoice**: order timeline, localized states, per-group fulfillment progress, invoice after `PAID`, notifications.
8. **Guidance**: explicit, non-deceptive copy for expired, cancelled, rejected, under-review, disputed, partial-fulfillment and retrying states (UX-005). Target: the full journey takes < 5 min, excluding banking (SC-008).

## 11. Seller plan
- **Sales**: own lines with gross, discount, commission, net and Hills share, plus own fulfillment-group status. There is never a buyer total, proof, bank data or another seller's rows (RLS-004).
- **Payouts**: own payouts with the `ACCRUED` → `PENDING_PAYOUT` → `PAID` explanation and the reference once paid.
- **Promotions**: create/schedule/pause seller-funded promotions on own listings; the database refuses other sellers' targets, Hills-owned targets and self-defeating values. Seller views show that platform (Hills-funded) promotions on their lines do not reduce their net or payout.
- **Listing detail**: price-tier editor where the Feature 006 listing state permits editing; tiers affect future proformas only.
- **Notifications**: seller-scoped events (order paid for own lines, fulfillment created/progressed, payout eligible/paid).

## 12. Notifications plan
See [contracts/notification-provider.md](./contracts/notification-provider.md).
- **Outbox**: every event is written in the committing commerce transaction and deduplicated.
- **Fan-out**: processed with `SKIP LOCKED` into in-app notifications (always on); external delivery rows are created only for enabled channels.
- **Read state**: own-user RPCs replace DB-BLOCK-04. `NOTIFICATION_LIMITATIONS` flips and its guard test is updated in the same change.
- **Campaigns**: bilingual; audience resolved at dispatch; scheduled dispatch is idempotent.
- **Provider interface**: server-only; registry empty in 013; the Firebase adapter (`PUSH`) comes in a future feature without commerce changes. The delivery worker is a pure function with an injected client, with no service-role import in runtime code and nothing that invokes it in 013 (M6).
- **Retries**: exponential backoff, capped attempts, sanitized error codes.
- **Scheduler**: `pg_cron` (approved) runs the sweeper, outbox and campaign jobs every minute. Correctness never depends on it: deadlines are evaluated from authoritative timestamps in every read, write and transaction check. Outbox and campaigns are also processed lazily from the admin outbox/campaign screens through the platform-admin + MFA wrappers `admin_process_outbox_now`/`admin_dispatch_due_campaigns_now` (never a service-role client, H2). A cron outage therefore delays delivery but never breaks exactly-once or expiry correctness.

## 13. Promotions, pricing, and catalogue/marketplace completeness
- **Pricing authority**: `compute_order_quote` (R-5). Steps: tier price → gross → per-seller commission rate from that seller's own quantity `Q_s` (FIN-013) → candidate promotions with funding and caps → one selected discount → buyer net → line VAT → economics → group shipping (+VAT if the basis includes shipping) → totals. Each component is rounded to 2 dp before summing.
- **Funding (FIN-011/012)**:
  - Seller promotion (seller-funded): `commission_basis = gross − discount`, so the seller's net and the commission both fall.
  - Platform promotion (Hills-funded): the seller's basis, commission and net are unchanged, and `hills_share = commission − discount`. The discount is capped at the line commission so Hills never goes negative.
  - Hills-owned line: `hills_share = net`.
  - Funding source, raw and applied discount, and the cap flag/reason are frozen per line; both discount totals are frozen per seller. Payout = frozen `seller_net`.
- **Promotions**:
  - v1 types: `PERCENT` and `AMOUNT_PER_KG` only;
  - platform (admin, Hills-funded) and seller (own member listings only, seller-funded);
  - invalid configurations are rejected at save; price-dependent excess is capped at quote time;
  - optional code; schedule window; at most one per line;
  - an explicit eligible code takes precedence, otherwise the greatest discount wins with tie-break (`starts_at`, `id`);
  - shipping is never discounted;
  - the result is frozen on the line with its rule snapshot.
- **Quantity tiers**: `offer_price_tiers`, deterministic highest-threshold selection, frozen on the line.
- **Offer references**: `offer_code` (`LST-…`) on cards, detail, cart, proforma, seller views and finance (FR-041).
- **Filters (FR-039)**: `search_member_listings` over origin, process, location (warehouse city/country), coffee type, availability band, certification and tag, with sorts newest/price/quantity.
- **Tags/certifications (FR-040)**:
  - Existing taxonomy admin plus Arabic tag names via `20260924120000_tag_translations.sql`, which must be applied (Feature 010 T056) before Phase 6 exit.
  - Certification names stay official, untranslated and LTR (LOC-004), managed per coffee in the existing coffee editor.
- **Arabic gaps**: Phase 6 audits marketplace/cart copy and catalogue translation fallbacks (English fallback marked `lang="en"`).
- **Media rules**: unchanged. The card shows one primary `coffee_offer_media` image; detail shows the full gallery. Listing media and catalogue media are never mixed.
- **Member-only price boundary**: tiers, promotions and search are gated to authorized members; anon probes are part of every phase's exit.

## 14. Stripe decommission plan (Phase 7, after cutover evidence)
1. **Gate**: Phase 4 cutover is complete; zero non-terminal `PROVIDER` payments (preflight); the bank-transfer lifecycle has passed live and browser proofs.
2. **Code**:
   - remove `stripe` and `@stripe/stripe-js` from `package.json` + lockfile;
   - delete `lib/finance/stripe/*`, `lib/finance/funding.ts`, the Stripe branches in `settlement.ts`/`errors.ts`, and `components/finance/stripe-payment-collector.tsx`/`funding-unavailable-notice.tsx`;
   - make sure no import remains, enforced by a static absence test.
3. **Edge Functions**: **OPERATOR** `supabase functions delete stripe-create-payment-intent stripe-webhook stripe-release-transfer`, then remove the three source directories. Git history keeps them as evidence.
4. **Secrets/env**: **OPERATOR** removes `STRIPE_*` from hosting and Supabase function secrets. `.env.example` drops the Stripe keys. A static test asserts no `STRIPE_` reference in `src/lib/components/supabase/functions`.
5. **Database (M9)**: revoke EXECUTE on the Stripe functions from every role; restrict provider tables to finance-read; keep every table, column and row.
6. **Preserve**: all historical migrations, rollbacks, postflights and `specs/008-*` byte-identical (verified by `git diff` over those paths = empty, SC-011). Feature 008's tasks stay open and are annotated as superseded **in the roadmap and Feature 013 only**.
7. **Later contraction**: dropping provider objects requires a separate retention-approved forward migration after live preflight, and is out of Feature 013 (MIG-005).

---

## Implementation phases

### Phase 1 — Spec and preflight reconciliation
- **Objective**: establish the truthful baseline before any database work. Classify live data, confirm C1/C16, and fix the pre-existing test failures (C15).
- **Prerequisites**: spec approved (done); linked project identity verified (`hillscoffees-trading`).
- **Migrations**: none. New read-only `supabase/maintenance/<date>_feature_013_preflight.sql`.
- **Files changed**:
  - `docs/architecture/IMPLEMENTATION-ROADMAP.md` (013 row; 008 marked "superseded by 013 for payment runtime — tasks not completed");
  - `docs/architecture/DATABASE-CAPABILITY-MAP.md` (C1–C14 as DB-OPEN entries);
  - `docs/database/commission-capability.md` (COMMISSION-OPEN-01 → resolved by FR-042 fail-closed; tier basis = each seller's own quantity, FIN-013);
  - `tests/admin/finance-delegation.test.tsx` (allowlist branding RPCs by exact name; payment boundary unaffected);
  - `lib/app/copy/en.ts` + `tests/orders/error-mapping.test.ts` (resolve the `forbidden` key collision).
- **New files**: preflight SQL; `specs/013-.../PREFLIGHT-REPORT.md` (results, no secrets).
- **RPCs**: none.
- **UI**: none.
- **Tests**: batched full suite green; a new static test pinning that historical 008 files are unchanged (hash list).
- **Live verification**: preflight output recorded, including the `admin_review_payment` hook check, legacy counts, `pg_cron`, delivery methods and configuration coverage.
- **Rollback**: none needed (read-only).
- **Exit**: preflight recorded; C15 fixed; Q1–Q3 decisions reflected in the spec (done 2026-09-24); Q4–Q6 defaults acknowledged; T056 apply status known; `pg_cron` availability known.
- **Later dependencies**: Phase 2 guards consume the preflight capture.

### Phase 2 — Database, state and RLS foundation
- **Objective**: vocabulary, snapshots, destinations, finance records, outbox table and RLS realignment, with **no behaviour change** for existing flows.
- **Prerequisites**: Phase 1 exit; human review of M1–M3.
- **Migrations**: M1, M2, M3 (+ rollback + postflight each).
- **Files changed**:
  - `lib/orders/validation.ts`, `lib/finance/validation.ts`/`types.ts` (vocabulary allowlists);
  - status badges and label maps;
  - `lib/app/copy/{en,ar}.ts` (labels);
  - `tests/finance/rls-policy.test.ts`, `tests/orders/*` (updated policy expectations);
  - `scripts/seed-test-fixtures.ts` (f013 fixtures).
- **New files**: `lib/commerce/{types,validation,labels,errors}.ts`; `tests/commerce/schema-*.test.ts`, `rls-*.test.ts`, `rls-anon-probe.test.ts`.
- **RPCs**: helper functions, `emit_notification_event` (internal).
- **UI**: status labels only.
- **Tests**:
  - migration content pins (names, guards, no config-table policy/trigger changes, no anon grants);
  - live RLS matrix for buyer / seller / other seller / finance / warehouse / auditor / anon on every changed table;
  - legacy suites still green.
- **Live verification**: postflight `ALL CHECKS PASSED` ×3; seller reads 0 rows of payments/proofs/financials/proformas.
- **Rollback**: rollback files (no Feature 013 financial rows exist yet).
- **Exit**: RLS matrix green; existing suites green; checkout kill switch default `false`.
- **Later dependencies**: Phases 3–6 write into these structures.

### Phase 3 — Cart, destination, checkout, proforma and reservation
- **Objective**: the member journey up to an active 20-minute reservation.
- **Prerequisites**: Phase 2 exit. Pricing decisions are fixed: per-seller commission tier (FIN-013), promotion funding and caps (FIN-011/012).
- **Migrations**: M4.
- **Files changed**:
  - `src/app/dashboard/coffee/[offerId]/page.tsx` (add to cart);
  - `src/app/dashboard/orders/[orderId]/page.tsx` (timeline for v1);
  - `src/app/dashboard/orders/page.tsx`;
  - `lib/dashboard/registry.tsx` (Cart, Destinations);
  - `lib/orders/read.ts` (flow-aware);
  - `components/orders/hold-countdown.tsx` (reuse);
  - `src/app/dashboard/orders/[orderId]/checkout` and `/shipment` (redirect v1 orders).
- **New files**:
  - `lib/commerce/{cart,destinations,quote,proforma,reservation,read}.ts`;
  - `src/app/dashboard/{cart,destinations,checkout}/**`, `src/app/dashboard/orders/[orderId]/proforma/**`;
  - `components/commerce/{add-to-cart-form,cart-group,cart-line,destination-form,destination-picker,estimate-summary,proforma-document,proforma-confirm-panel,reservation-countdown,money,commerce-status-badge,order-timeline}.tsx`;
  - `lib/admin/commerce-settings.ts` + `/dashboard-admin/commerce-settings`.
- **RPCs**: `get_or_create_cart`, `add_cart_line`, destination RPCs, `compute_order_quote`, `estimate_cart`, `issue_proforma`, `confirm_proforma`, `cancel_order`, `expire_reservation`, `sweep_expired_reservations`, `update_commerce_settings`, `set_default_payment_account`, `admin_void_order`.
- **UI**: the cart, destinations, checkout and proforma routes; commerce settings.
- **Tests**: cart idempotency and no-reservation; destination ownership; proforma immutability; 24 h configurable validity (setting change after issue does not move the deadline); expired replacement (v2 with current prices); atomic all-line confirmation; 20-minute window; two-buyer and 100-run concurrency; partial inventory remainder sellable; cancellation exactly-once; pricing math matrix; multi-seller groups; Hills-owned lines; static "no TS money math" and single-caller audits.
- **Live verification**: `quickstart.md` §3 on the linked project with fixtures, with the checkout switch enabled only for fixture organizations. Implementation: a switch-scoped allowlist `commerce_settings.pilot_organization_ids uuid[]` (added in M4 if the operator wants a pilot; otherwise the switch stays off until Phase 4).
- **Rollback**: kill switch off; M4 rollback (functions only) if no v1 orders exist; otherwise leave the functions and cancel open v1 orders via `admin_void_order`.
- **Exit**: all Phase 3 tests green; no reservation change from cart/issue in any path (AC-001); zero oversell in 100 runs (SC-002).
- **Later dependencies**: Phase 4 consumes reservations/payments; notification events emitted here are processed from Phase 5.

### Phase 4 — Bank transfer, proof, admin finance, payout and fulfillment
- **Objective**: from reservation to paid, fulfilled, completed and paid out; legacy cutover.
- **Prerequisites**: Phase 3 exit; Q4 answered (default applies otherwise); bucket review.
- **Migrations**: M5; then M6 after zero non-terminal `LEGACY` orders.
- **Files changed**:
  - `src/app/dashboard/payments/[orderId]/page.tsx` → redirect;
  - `src/app/dashboard/payments/page.tsx`, `/sales`, `/payouts` pages;
  - `lib/finance/read.ts`, `types.ts`, `errors.ts`;
  - `lib/admin/areas.ts` (finance areas live + reconciliation);
  - `src/app/dashboard-admin/(finance)/{payments,payouts,invoices}/page.tsx`;
  - `(warehouse)/shipments/**` (group display);
  - `lib/delivery/read.ts` (fulfillment kind);
  - `tests/finance/*` (settlement single-caller moves to `review.ts`), `tests/delivery/*` (fulfillment kind).
- **New files**:
  - `lib/commerce/payment-proof.ts`, `lib/finance/{review,reconciliation,payouts,invoices,adjustments}.ts`;
  - `src/app/dashboard/orders/[orderId]/{payment,invoice}/**`;
  - `src/app/dashboard-admin/(finance)/{payments/[paymentId],reconciliation/**,invoices/[invoiceId],payouts/[payoutId],orders/[orderId]}/**`;
  - `components/commerce/{bank-instructions,proof-upload-form}.tsx`;
  - `components/finance/{review-queue-table,review-detail,confirm-payment-form,reject-payment-form,reconciliation-*,payout-record-form,invoice-document}.tsx`.
- **RPCs**: proof, late report, proof access, finance confirm/reject, reconciliation, adjustments, payout record, invoice attach/access, `sync_order_fulfillment`.
- **UI**: payment/proof page, invoice page, finance console, seller sales/payouts.
- **Tests**:
  - proof-before-expiry race (100 runs); proof-after-expiry → reconciliation, no re-reserve;
  - exact amount/currency/duplicate enforcement; confirm/reject race;
  - settlement effects exactly once; title transfer once;
  - one shipment per seller × warehouse, containing only its own lines;
  - partial fulfillment reporting; completion → payout eligibility only;
  - payout record once and refused before completion; Hills lines create no payout;
  - private proof storage (path forgery, cross-org, seller/warehouse/auditor/anon denial); signed URL TTL and never-in-HTML;
  - finance MFA enforced; reconciliation has no inventory effect.
- **Live verification**: `quickstart.md` §4; SC-007 finance usability walk-through (< 3 min); the 009 settlement seam (C1) is proven restored for a READY delivery.
- **Rollback**: kill switches; M5 function rollback only before real payments exist; afterwards corrective forward migrations only (MIG-006); M6 rollback re-grants legacy functions.
- **Exit**: AC-003/004/005/008/009/010/011/012 green; cutover (M6) applied with zero legacy non-terminal orders; the bank-transfer lifecycle proven end-to-end in the browser for pilot organizations. The global checkout switch stays off until production activation (T235).
- **Later dependencies**: Phase 7 requires this exit.

### Phase 5 — Notifications and outbox
- **Objective**: transactional notifications, read state, campaigns, provider boundary.
- **Prerequisites**: Phase 4 exit (events already emitted); `pg_cron` enabled in the project (approved; M7b guard aborts otherwise).
- **Migrations**: M7 then M7b.
- **Files changed**:
  - `lib/notifications/{read,limitations,preferences}.ts`;
  - `src/app/dashboard/notifications/**`;
  - `components/notifications/*`;
  - `tests/disputes/honest-limitations.test.ts` (capability flags flip with evidence);
  - `lib/app/copy/{en,ar}.ts`.
- **New files**:
  - `lib/notifications/{read-state,templates,campaigns,worker}.ts`, `lib/notifications/providers/{types,registry,in-app}.ts`;
  - `src/app/dashboard-admin/(system)/{campaigns,outbox}/**`;
  - `components/notifications/{notification-list,mark-read-button,campaign-form}.tsx`.
- **RPCs**: fan-out, campaigns, read-state, delivery claim/complete.
- **UI**: notification centre with unread count, campaign admin, outbox health.
- **Tests**: outbox dedupe under concurrent processing; one notification per recipient/event; campaign scheduled once (AC-013); retries/backoff; no-provider path (US6-AS4); template param allowlist (no bank values, paths or others' economics); EN/AR rendering; read state is own-only.
- **Live verification**: `quickstart.md` §5.
- **Rollback**: M7 rollback before campaigns are sent; otherwise disable dispatch via `cron.unschedule` and keep the rows.
- **Exit**: FR-036–FR-038 and AC-013 green.
- **Later dependencies**: none blocking; Phase 6 events use the same outbox.

### Phase 6 — Promotions, catalogue and marketplace completeness
- **Objective**: promotions, tiers, offer references, filters, tag/certification completeness, Arabic gaps.
- **Prerequisites**: Phase 3 quote supports tiers, promotions, funding and caps (it does from day one); T056 migration applied (Feature 010).
- **Migrations**: M8.
- **Files changed**:
  - `src/app/dashboard/coffee/page.tsx` (search RPC + filters), `components/listings/listing-card.tsx` (offer code, tier hint);
  - `src/app/dashboard/listings/[offerId]/**` (tier editor);
  - `lib/admin/areas.ts` (promotions);
  - `src/app/dashboard-admin/(catalogue)/taxonomy/**`, `coffees/[coffeeId]/**` (certification presentation).
- **New files**: `lib/promotions/*`, `lib/listings/{tiers,search}.ts`, `src/app/dashboard/promotions/**`, `src/app/dashboard-admin/(catalogue)/promotions/**`, `components/promotions/*`, `components/listings/{price-tier-editor,marketplace-filters}.tsx`.
- **RPCs**: promotion/tier RPCs, `search_member_listings`.
- **UI**: filters, tier table, promotions (seller/admin).
- **Tests**: seller cannot target other sellers; code precedence; greatest discount; deterministic tie; no stacking; tier selection boundaries; filters return only authorized rows; anon probe of search/tiers/promotions returns 0 rows; listing/catalogue media separation intact.
- **Live verification**: `quickstart.md` §6.
- **Rollback**: M8 rollback (functions) and pause promotions; tier rows are kept.
- **Exit**: FR-008/009/010/039/040/041 and US7 green.
- **Later dependencies**: none.

### Phase 7 — Stripe runtime decommission
- **Objective**: no active Stripe dependency (§14).
- **Prerequisites**: Phase 4 exit; zero non-terminal provider rows; business sign-off.
- **Migrations**: M9.
- **Files changed/removed**: as listed in §2 (legacy runtime) plus `package.json`/lockfile, `.env.example`, and `lib/finance/settlement.ts`/`errors.ts` cleanup.
- **New files**: `tests/finance/stripe-absence.test.ts`, `tests/database/historical-008-unchanged.test.ts`.
- **RPCs**: none new; revocations only.
- **UI**: none (the payment page was already replaced in Phase 4).
- **Tests**: runtime absence (imports, deps, functions directory, env references); historical files unchanged; the full bank-transfer suite still green.
- **Live verification**: **OPERATOR** functions list/secret list audit (SC-010).
- **Rollback**: `git revert` of code removal (no data impact); M9 rollback re-grants ACLs.
- **Exit**: AC-017, SC-010, SC-011.
- **Later dependencies**: Phase 8 audits the final state.

### Phase 8 — Localization, security, responsive, accessibility and final closure
- **Objective**: prove the whole matrix and close the feature truthfully.
- **Prerequisites**: Phases 1–7 exit.
- **Migrations**: none expected; any defect fix is a new reviewed forward migration.
- **Files changed**: copy parity fixes, layout fixes, spec/tasks/roadmap reconciliation.
- **New files**: `tests/commerce/localization-parity.test.ts`, `tests/commerce/threat-model.test.ts` (static), `tests/browser/feature013-*.browser.mjs`, `specs/013-.../CLOSURE-REPORT.md`.
- **Tests**:
  - EN/AR dictionary parity and no raw state values rendered (LOC-001/002);
  - RTL/LTR identifiers (LOC-003);
  - light/dark;
  - 375/430/768/1024/1280/1440 overflow = 0;
  - axe (no violations in changed regions), keyboard walk, focus visibility, contrast;
  - negative security suite (forged ids, cross-org, stale states, replay, duplicate references, path manipulation, direct RPC invocation — SEC-010);
  - zero public price/listing/bank/proof leakage (anon probes + HTML/RSC scan);
  - Stripe runtime absence.
- **Live verification**: full browser matrix on the changed routes; final batched `npm test`, lint, typecheck, build, `git diff --check`.
- **Rollback**: n/a.
- **Exit**: AC-001…AC-018 and SC-001…SC-012 evidenced; production activation remains gated by finance/tax/legal approval, bank data, warehouse reconciliation and backup readiness (spec Assumptions).

## 15. Exact file-change map (summary; full per-phase detail above)

| Area | Changed | New | Removed (Phase 7) |
|---|---|---|---|
| Database | — (historical files untouched) | 9–10 migrations, matching rollbacks, 1 preflight + 9–10 postflights | none |
| `lib/` | `orders/{read,validation}.ts`, `finance/{read,types,validation,errors}.ts`, `notifications/{read,limitations,preferences}.ts`, `admin/{areas,payment-accounts}.ts`, `dashboard/registry.tsx`, `listings/browse.ts` (detail only), `app/copy/{en,ar}.ts` | `commerce/*` (11 files), `finance/{review,reconciliation,payouts,invoices,adjustments}.ts`, `notifications/{read-state,templates,campaigns,worker}.ts` + `providers/*`, `promotions/*`, `listings/{tiers,search}.ts`, `admin/commerce-settings.ts` | `finance/stripe/*`, `finance/funding.ts`, Stripe parts of `finance/settlement.ts` (file removed once `review.ts` replaces it) |
| `src/app/dashboard` | `coffee/**`, `orders/page.tsx`, `orders/[orderId]/page.tsx`, `orders/[orderId]/{checkout,shipment}` (v1 redirect), `payments/**` (redirect), `sales`, `payouts`, `notifications/**`, `listings/[offerId]/**` | `cart`, `destinations`, `checkout`, `orders/[orderId]/{proforma,payment,invoice}`, `promotions` | legacy checkout/shipment routes after legacy drain |
| `src/app/dashboard-admin` | `(finance)/{payments,payouts,invoices}/page.tsx`, `(system)/payment-accounts/**`, `(warehouse)/shipments/**`, `(catalogue)/{taxonomy,coffees}/**` | `(finance)/{payments/[paymentId],reconciliation/**,invoices/[invoiceId],payouts/[payoutId],orders/[orderId]}`, `(system)/{commerce-settings,campaigns/**,outbox}`, `(catalogue)/promotions/**` | — |
| `components/` | `orders/order-status-badge`, `finance/{payment,payout,proforma}-status-badge`, `listings/listing-card`, `notifications/*` | `commerce/*`, `finance/{review-*,confirm-payment-form,reject-payment-form,reconciliation-*,payout-record-form,invoice-document}`, `notifications/{notification-list,mark-read-button,campaign-form}`, `promotions/*`, `listings/{price-tier-editor,marketplace-filters}` | `finance/{stripe-payment-collector,funding-unavailable-notice}` |
| Edge Functions | — | — | `supabase/functions/stripe-*` (after **OPERATOR** undeploy) |
| Config | `.env.example`, `package.json`/lockfile (Phase 7) | — | Stripe deps and keys |
| Tests | `tests/orders/*`, `tests/finance/*`, `tests/delivery/*`, `tests/disputes/honest-limitations.test.ts`, `tests/admin/{finance-delegation,run-f-static,state-coverage}` as needed | `tests/commerce/**`, `tests/browser/feature013-*.browser.mjs`, absence/historical tests | `tests/finance/{stripe-boundary-security,stripe-webhook,funding}.test.ts` → replaced by absence tests |
| Docs/specs | roadmap, capability map, commission capability, 013 artifacts | preflight report, closure report | `specs/008-*` never edited |

## 16. Phase-by-phase test strategy

Every phase keeps the batched existing suites green. New tests live in `tests/commerce/` with live suites gated by
`F013_LIVE=1`.

| Required test | Phase | Kind |
|---|---|---|
| Cart mutation/idempotency; cart never reserves | 3 | live + static |
| Multi-seller orders (groups, splits, atomicity) | 3, 4 | live |
| Delivery destination ownership / snapshot | 3 | live |
| Proforma immutability (trigger + rule edits after issue) | 2, 3 | live |
| 24-hour configurable validity frozen at issue | 3 | live |
| Expired proforma replacement with current terms | 3 | live |
| Atomic all-line confirmation | 3 | live |
| 20-minute reservation | 3 | live |
| Two-buyer concurrency + 100-run contention | 3 | live |
| Partial inventory / remainder sellable / SOLD_OUT at zero | 3, 4 | live |
| Proof-before-expiry race (100 runs) | 4 | live |
| Proof-after-expiry → reconciliation, no re-reserve | 4 | live |
| Exact amount / currency / duplicate enforcement | 4 | live |
| Confirmation vs rejection races | 4 | live |
| VAT/shipping/discount/commission snapshot math (fixture matrix to the cent) | 3 | live |
| Per-seller commission tier isolation (seller B's lines never change seller A's rate/payout) | 3 | live |
| Promotion funding and caps (Hills-funded leaves seller net unchanged; seller-funded reduces the basis; caps recorded; no negative seller/Hills amount; config rejections) | 3, 6 | live |
| Cron-down drill (expiry authoritative from timestamps; reclaim; single release on reschedule) | 3, 5 | live |
| Seller/Hills split reconciliation | 3, 4 | live |
| Hills-owned lines: no commission/payout | 3, 4 | live |
| Payout eligibility only after completion | 4 | live |
| Private proof storage (path forgery, cross-org) | 4 | live |
| Signed URL security (server-only, TTL, never in HTML/RSC) | 4 | live + static |
| Buyer/seller/admin/warehouse/auditor RLS isolation | 2, 4, 8 | live |
| Promotions (scope, precedence, tie, no stacking) | 6 | live |
| Scheduled notifications exactly once | 5 | live |
| EN/AR parity, RTL/LTR, light/dark | 3–6, 8 | static + browser |
| Mobile/tablet/desktop matrix, overflow = 0 | 3–6, 8 | browser |
| Accessibility (axe, keyboard, focus, contrast) | 3–6, 8 | browser |
| Zero public price/listing/bank/proof leakage | every phase exit | live anon probe + HTML scan |
| Stripe runtime absence after cutover | 7, 8 | static |

## 17. Rollout and rollback strategy
- **Order of rollout** (corrected, analysis M2):
  - Phase 1 preflight.
  - M1–M3 (no behaviour change).
  - M4 with the global checkout switch **off**; M4a stops creation of new `LEGACY` orders.
  - Pilot-organization proofs.
  - M5, then finance dry-run on pilot orders.
  - Drain `LEGACY` orders (convert/void drafts, finish or expire the rest).
  - M6 cutover.
  - Lifecycle proof **with pilot organizations only**.
  - M7/M7b notifications.
  - M8 promotions/search.
  - M9 + Stripe code removal.
  - Phase 8 closure.
  - **Production activation** (T235): the global `bank_transfer_checkout_enabled = true`, only after the closure gate and the spec's finance/tax/legal, real bank data, warehouse reconciliation and backup sign-offs.

  The global switch is never flipped inside Batches C–I.
- **Rollback before real financial rows**: each migration's rollback file restores exact previous text and structure (captured by the preflight).
- **Rollback after real financial rows exist** (MIG-006): never destructive.
  - Turn off `bank_transfer_checkout_enabled` / `proof_submission_enabled`.
  - Void un-paid orders with `admin_void_order` (releases stock exactly once).
  - Record corrections as manual adjustments.
  - Fix defects with new forward migrations.
  - Paid orders continue through fulfillment and payouts unchanged.
- **Code rollback**: `git revert` of application changes is always safe because the database remains authoritative and backward-compatible (`LEGACY` flow retained until M6; M6 itself is reversible by re-grant).

## 18. Highest-risk areas
1. **RLS realignment (M3)**: removes seller access that existing pages or tests may rely on. Mitigation: the live policy matrix across every role before and after, the preflight-captured rollback, and a separate review of M3.
2. **Settlement function** (title transfer + invoice + payouts + shipments in one transaction). Mitigation: reuse the proven title loop verbatim; the unique keys on every effect; 100-run race tests; restoring the 009 seam (C1).
3. **Proof vs expiry race**. Mitigation: a single order lock, `clock_timestamp()` predicates, and a barrier-synchronized race test.
4. **Legacy coexistence and cutover** (`commerce_flow`, M2 unique change, M6). Mitigation: guard aborts on unmappable rows, the drain procedure, and reversible M6.
5. **Pricing math correctness** (per-seller tiers, funding attribution, caps). Mitigation: one DB function, a fixture matrix to the cent including funding and cap cases, CHECK constraints for every identity, deferred per-seller equality, and a `negative_economics` guard.
6. **Private document handling** (buckets, signed URLs). Mitigation: the proven KYB pattern, server-only paths, access audit, and negative tests.
7. **Scheduler dependence**. Mitigation: `pg_cron` is approved, but expiry is authoritative from timestamps everywhere, confirm reclaims stale holds, jobs are idempotent with `SKIP LOCKED`, and there is a lazy admin fallback plus a cron-down drill in the tests.
8. **Scope size**. Mitigation: phase gates with kill switches, so each phase ships dark until its exit is proven.

## 19. Unresolved implementation questions (surfaced, not guessed — details in [research.md Part C](./research.md))
Resolved 2026-09-24 (spec.md Clarifications; FIN-011/012/013):
- **Q1**: commission tier = each member seller's own qualifying quantity in the order.
- **Q2**: `pg_cron` approved; correctness never depends solely on cron.
- **Q3**: v1 types `PERCENT` and `AMOUNT_PER_KG`. Platform promotions are Hills-funded, seller promotions seller-funded. Funding is snapshotted. Negative seller/Hills economics are rejected or capped.

Still open, with non-blocking spec-literal defaults:
- **Q4**: retry on the same order after proof rejection (default terminal + reorder). Phase 4 copy only.
- **Q5**: return an unconfirmed proforma to cart (default: no, FR-004 literal). Non-blocking.
- **Q6**: storage election instead of delivery for Feature 013 orders (default: spec literal, deliver all). Non-blocking for Feature 013.

The repository contradictions C1–C16 are resolved inside this plan; none requires changing a locked product rule.

## 20. READY FOR /speckit-tasks: **YES**

Tasks can be generated now with no open financial decision. Q1–Q3 are resolved and built into R-5/R-6/R-9/R-16/R-18,
the data model and the contracts. Q4–Q6 have spec-literal defaults and gate nothing. The only external preconditions
are operator actions: human migration review/apply, enabling `pg_cron`, and the production activation gates in the
spec's Assumptions.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| `commerce_flow` flag with two coexisting order graphs | Live `LEGACY` orders may exist at cutover (MIG-003/004) | An in-place replacement would strand or silently rewrite legacy orders |
| Five snapshot tables instead of one JSON blob | Row-level RLS cannot hide columns; buyer, seller and finance audiences differ; sums must reconcile in SQL | JSONB can't be RLS-split and can't be constraint-checked |
| SECURITY DEFINER `search_member_listings` projection | Members cannot read `coffee_lots` (DB-OPEN-05) but filters need lot→coffee attributes | Widening lot RLS would expose private lot data to members |
| Service-role-only worker functions | Scheduled sweeps, outbox and campaigns run without a user | Running them as users is impossible for scheduled work; they are never reachable from browser code |
| `commerce_request_log` | Uniform replay-safe responses across about 20 RPCs (SEC-004) | Per-table idempotency columns everywhere duplicate logic and still miss read-your-own-result replays |
