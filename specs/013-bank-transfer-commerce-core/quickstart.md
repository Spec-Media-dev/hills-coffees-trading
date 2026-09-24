# Quickstart — validating 013 Bank Transfer Commerce Core

This is a **validation guide**, not an implementation guide. Database changes are applied only by a human operator
after review (R-22). Every command below is read-only or test-only unless marked **OPERATOR**.

## 0. Prerequisites
- `.env.local` with the linked `hillscoffees-trading` project (`supabase/.temp/linked-project.json` ref must match `NEXT_PUBLIC_SUPABASE_URL`).
- Disposable fixtures via `scripts/seed-test-fixtures.ts` (buyer, member seller, second seller, Hills seller, finance, warehouse, auditor, admin). New `--prepare-f013-fixtures` / `--cleanup-f013-fixtures` flags use exact identities only.
- Vitest in batches (a full run OOMs on this machine). Browser proofs use `tests/browser/cdp-harness.mjs` against `npx next dev -p 3230`. Free the port first (see the memory note on orphaned servers).

## 1. Phase 1 — preflight and baseline (read-only)
1. `supabase migration list --linked`: record whether `20260924120000_tag_translations` is applied (C16).
2. Run `supabase/maintenance/<date>_feature_013_preflight.sql` in the SQL editor (read-only). Expected output:
   - legacy order/reservation/payment/payout/proforma counts;
   - Stripe-era row counts (`payment_events`, `payment_transfers`, `PROVIDER` payments, `trusted_funding_*`);
   - `admin_review_payment` contains `reserve_ready_deliveries_for_settlement`: **false** means C1 is confirmed;
   - `pg_cron` present (true/false). It is approved; if absent, the operator enables it before M7b;
   - `shipping_rules.delivery_method` distinct values;
   - active AE tax rule count; active USD payment accounts; commission coverage report.
3. Batched baseline: `npm run lint`, `npm run typecheck`, and every `tests/<dir>` batch. Expected: all green once the two pre-existing failures (C15) are fixed in Phase 1.

## 2. Phase 2 — database foundation
- **OPERATOR**: review, then `supabase db push --linked` for M1…M3, one migration at a time. After each: run its `_postflight.sql` (expect `ALL CHECKS PASSED`) and `F013_LIVE=1 npx vitest run tests/commerce/rls-*.test.ts tests/commerce/schema-*.test.ts`.
- Expected:
  - Anon-key probes return zero rows for every new table and view.
  - A seller session reads 0 rows from `payments`, `payment_proofs`, `order_financials`, `proforma_invoices` and `proforma_bank_instructions`.
  - Every existing suite (`tests/orders`, `tests/finance`, `tests/delivery`, `tests/listings`) stays green on `LEGACY` rows.

## 3. Phase 3 — cart → proforma → reservation (`F013_LIVE=1`)
| Scenario | Command | Expected |
|---|---|---|
| Cart never reserves | `tests/commerce/cart.live.test.ts` | Offer/position `reserved_quantity_kg` unchanged after add/update/remove; add replays with the same request id are idempotent |
| Destination ownership | `tests/commerce/destinations.live.test.ts` | Cross-org destination use → `destination_not_found`; retire keeps order snapshots |
| Issuance freezes, no reservation | `tests/commerce/proforma-issue.live.test.ts` | Snapshot rows exist; `valid_until = issued_at + 24 h`; changing settings/rules afterwards leaves the proforma byte-identical |
| Expired proforma | `tests/commerce/proforma-expiry.live.test.ts` | Confirm after the deadline → `proforma_expired`, zero reservation; replacement is version 2 with current prices |
| Atomic confirm | `tests/commerce/confirm-atomic.live.test.ts` | One unavailable line → zero reservations on every line |
| Concurrency ×100 | `tests/commerce/confirm-concurrency.live.test.ts` | Reserved sum never exceeds sellable; the loser gets `listing_inventory_changed` |
| Partial quantity | `tests/commerce/partial-quantity.live.test.ts` | Remainder stays `PUBLISHED`/`PARTIALLY_FILLED` and purchasable |
| Cancel | `tests/commerce/cancel.live.test.ts` | Releases exactly once; refused after proof |
| Pricing math | `tests/commerce/quote-math.live.test.ts` | Fixture matrix (tiers, promotions, multi-seller, Hills lines, VAT bases, shipping groups) reconciles to the cent |
| Per-seller commission tier | `tests/commerce/commission-tier.live.test.ts` | Seller A's tier depends only on A's quantity; adding seller B's lines never changes A's rate or payout |
| Promotion funding and caps | `tests/commerce/promotion-funding.live.test.ts` | Platform (Hills-funded) promo on a member line: seller net/payout identical to the no-promo case, Hills share reduced, capped at the line commission (`HILLS_COMMISSION` recorded). Seller promo reduces the seller basis. Hills-owned line: only Hills share reduced. No negative seller or Hills amount anywhere. Funding source and applied discount frozen |

## 4. Phase 4 — proof → finance → settlement → fulfillment → payout
| Scenario | Expected |
|---|---|
| Proof before deadline | Reservation `REVIEW_HOLD`; the sweeper after the deadline leaves it untouched (AC-003) |
| Proof vs expiry race (×100, barrier at deadline − ε) | Each run ends in exactly one of {`REVIEW_HOLD` + payment `UNDER_REVIEW`} or {`EXPIRED` + proof refused}; never both, never neither |
| Late report | Case `LATE` opened; stock untouched; order stays `EXPIRED` |
| Mismatch confirm (amount / currency / duplicate reference) | `confirmation_requires_reconciliation`; nothing changed |
| Confirm vs reject race | Exactly one decision persists; the other gets `payment_already_decided` |
| Confirm effects | Title transfer once; offer filled; one invoice; payouts `ACCRUED` only for member sellers; one FULFILLMENT shipment per seller × warehouse |
| Completion | All groups `DELIVERED` → order `COMPLETED`, payouts `PENDING_PAYOUT`; `record_seller_payout` works once and is refused before completion |
| Proof privacy | Seller/warehouse/auditor/other buyer/anon: no row, no storage object, no signed URL |

### Cutover drain (end of Phase 4)
- After M4a, a non-service-role order insert with `commerce_flow = 'LEGACY'` is stored as `BANK_TRANSFER_V1`.
- `admin_convert_legacy_draft` converts plan-free legacy drafts; drafts with a plan are voided.
- The M6 guard passes only at zero non-terminal `LEGACY` orders.
- The global checkout switch stays **off** (pilot only) until production activation (T235).

## 5. Phase 5 — notifications
- `process_notification_events` twice concurrently → one notification per recipient per event.
- The admin "process now" button (platform admin + MFA) processes the outbox and due campaigns through `admin_process_outbox_now`/`admin_dispatch_due_campaigns_now` with the same idempotency. There is no service-role client in admin code.
- Every catalogue event (contracts/notification-provider.md §1) appears exactly once per aggregate after a fixture lifecycle.
- A campaign scheduled 5 minutes ahead is dispatched once after the due time by the `f013_dispatch_campaigns` pg_cron job. The recipient count matches the audience; overlapping runs create no duplicates.
- **Cron-down drill**: `cron.unschedule` the sweeper in a disposable run, let a fixture reservation pass its deadline, then verify:
  - member/finance reads show it as expired;
  - proof submission is refused (`reservation_expired`);
  - another buyer's `confirm_proforma` reclaims the quantity;
  - rescheduling the job releases the remainder exactly once.
- No adapter configured → no delivery rows; commerce is unaffected.

## 6. Phase 6 — promotions, tiers, marketplace
- A seller promotion targeting another seller's offer → `promotion_target_not_owned`.
- An explicit code beats a larger automatic discount; without a code, the largest discount wins; ties are deterministic.
- Filters return only authorized matching rows; the anon probe of `search_member_listings` returns 0 rows.

## 7. Phase 7 — Stripe decommission audit
- `rg -n "stripe" src lib components supabase/functions package.json` → no runtime matches. CSS "stripe" pattern names are excluded by the test allowlist.
- `supabase functions list` (**OPERATOR**) → no `stripe-*` functions deployed. Hosting and Supabase secrets contain no `STRIPE_*`.
- `git diff <cutover-base> -- supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql supabase/rollback/20260922120000_* supabase/maintenance/20260922_*` → empty (SC-011).

## 8. Phase 8 — UI matrix and closure
- Browser proof matrix per changed route:
  - EN/AR × light/dark;
  - widths 375 / 430 / 768 / 1024 / 1280 / 1440;
  - overflow checker = 0;
  - axe: no violations in changed regions; keyboard walk of every action.
- Final gates: `npm run lint`, `npm run typecheck`, batched `npm test`, `npm run build`, `git diff --check`.
