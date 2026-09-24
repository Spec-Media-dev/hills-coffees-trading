# Research — 013 Bank Transfer Commerce Core

**Date**: 2026-09-24 · **Input**: [spec.md](./spec.md) (approved, clarified 2026-09-24) · **Mode**: planning only
**Method**: every finding below was read from the repository on 2026-09-24 — `docs/database/database-schema-report.json`
(frozen 2026-09-07 baseline), every later file in `supabase/migrations/`, `lib/`, `src/app/`, `components/`,
`supabase/functions/`, `tests/`, and specs 007/008/009/010/012. Live production was **not** queried; every statement
about the live database that depends on migration history is re-verified by the Phase 1 preflight (R-21) before any
Feature 013 database change.

---

## Part A — Repository findings that contradict the spec (must be resolved, not worked around)

| ID | Finding (evidence) | Spec rule affected | Resolution in this plan |
|---|---|---|---|
| **C1** | `20260922120000_feature_008_stripe_trusted_funding.sql` re-created `admin_review_payment()` from the **2026-09-07 baseline body** and so **dropped** the `perform public.reserve_ready_deliveries_for_settlement(...)` call added by the applied `20260914120000_feature_009_db_block_07.sql` (verified by diffing both bodies: the only differences are the new `trusted_funding_required` guard and the removed 009 hook). The 008 guard checked only exception names, not the 009 hook. | Feature 009 DEL-01 / settlement seam; ST-007 | Phase 1 preflight reads the live `prosrc` and records whether the hook is absent. Feature 013 supersedes `admin_review_payment()` with `finance_confirm_payment()`, which calls the 009 hook explicitly (R-12). Reported as a pre-existing regression; not silently patched in Phase 1. |
| **C2** | `can_view_order()` is true for any member of **any seller** on an order. `payments_view`, `payment_proofs_view`, `financials_view`, `proforma_view`, `proforma_items_view`, `order_items_view`, `tax_invoice_view` and `shipments_view` all use it. A seller can read the buyer's payment, proof metadata, whole-order financials (buyer total, commission), full proforma, other sellers' lines, and every shipment's delivery address. | RLS-003, RLS-004, AC-008, SC-005 | Phase 2 migration M3 replaces these policies with buyer/seller/finance-split policies (R-19). `can_view_order()` itself is left unchanged (other features depend on it). |
| **C3** | `admin_review_payment()` raises `reservation_expired` when `expires_at <= now()` **even when proof was submitted on time**. | ST-005, ST-006, AC-003, SC-003 | New `REVIEW_HOLD` reservation state has no timed expiry; the finance RPC checks proof timeliness instead of wall-clock expiry (R-9, R-11). |
| **C4** | On rejection, `admin_review_payment()` sets the order back to `HOLD` and **does not release** the reservation. | ST-008, US3-AS3 | Rejection releases the review hold exactly once and ends the order in `PAYMENT_REJECTED` (R-15). |
| **C5** | `checkout_order()` issues the proforma **and** reserves stock in one call, sets `proforma_invoices.valid_until = now() + 20 min`, and upserts the single proforma allowed by `proforma_invoices_order_id_key UNIQUE(order_id)`. | FR-014–FR-017, ST-002, AC-001, AC-002, clarification (24 h validity) | Split into `issue_proforma()` (no reservation) and `confirm_proforma()` (atomic reservation); proforma versioning replaces the unique key (R-2, R-3). `checkout_order()` is retired after cutover (R-20). |
| **C6** | Settlement inserts `payouts` directly as `PENDING_PAYOUT`, and `payouts_finance` grants finance `FOR ALL` table writes. | FR-033, FR-034, ST-010, AC-011 | New `ACCRUED` payout state set at confirmation; `PENDING_PAYOUT` only on order completion; payout writes go only through RPCs (R-14). |
| **C7** | `assert_order_checkout_ready()` requires a buyer-created `order_shipments` row already `READY` (warehouse-set) with matching planned quantities **before checkout**. A buyer-only flow therefore cannot check out (recorded in `lib/orders/checkout.ts`). | FR-006, FR-031, US1-AS2 | Checkout requires a saved delivery destination; fulfillment shipments are created by settlement, one per seller/warehouse group (R-13). |
| **C8** | Commission and VAT are computed once per order on the order total and rounded once. Commission tier is selected by **total order quantity**; the rate applies to all member lines. | FIN-004, FIN-006, FIN-007, FR-013, AC-006 | Line/component snapshot math in one database quote function (R-5–R-8); commission tier selected per seller from that seller's own quantity (decided 2026-09-24, FIN-013). |
| **C9** | No code path moves an order to `PARTIALLY_DELIVERED`/`COMPLETED`; `validate_shipment_transition()` never touches `orders`. | FR-032, ST-010, US4-AS3 | New fulfillment-aggregation trigger drives order progress and payout eligibility (R-13, R-14). |
| **C10** | Notifications cannot be created or marked read (DB-BLOCK-04: SELECT-only policy, no generator); no scheduler exists (Feature 007 lazy expiry only). | FR-036–FR-038, ST-004, SEC-008, AC-013 | Transactional outbox + read-state RPC; `pg_cron` (approved 2026-09-24) drives sweeps, outbox and campaigns, while expiry stays authoritative from timestamps without it (R-9, R-16). |
| **C11** | `tax_invoices.file_asset_id` is NOT NULL and `uploaded_by` NOT NULL — an invoice can only exist as an uploaded file. | FR-030 ("generated or recorded") | `file_asset_id` becomes nullable; the invoice record + frozen snapshot is created at confirmation; a finance-uploaded signed PDF may be attached later (R-23). |
| **C12** | `payment_proofs` has no amount/currency/transfer-date/bank-reference fields; `on conflict (payment_id, file_asset_id)` allows unlimited proofs. There is no private proof bucket (buckets: `kyb-evidence`, `public-assets`, `listing-media`). | FR-021, FR-022, SEC-005, AC-008 | New proof fields, one authoritative submission per payment, private `payment-proofs` bucket (R-10). |
| **C13** | `orders_status_check` has no issued-proforma, cancelled, or rejected value; `validate_order_transition()` sends `CONFIRMED → HOLD` only. `DB-OPEN-15`: a `HOLD` row cannot be updated at all because the trigger re-runs `assert_order_checkout_ready()`. | ST-001, FR-028 | New transition graph (R-1). |
| **C14** | `uq_active_inventory_reservation_order` enforces one `ACTIVE` reservation per order only. | ST-005/ST-006 | Replaced by a partial unique index covering `ACTIVE` and `REVIEW_HOLD` (R-9). |
| **C15** | Two batched-suite failures pre-date this feature: `tests/admin/finance-delegation.test.tsx` (branding `set_platform_logo` RPC not allowlisted) and `tests/orders/error-mapping.test.ts` (existing `forbidden:` key in `lib/app/copy/en.ts`). | SC-012 | Phase 1 fixes or records both before any Feature 013 test baseline is taken. |
| **C16** | `20260924120000_tag_translations.sql` (Feature 010 T056) is committed. Its application to production is **unconfirmed** (T056 still open). `COMMISSION-OPEN-01` (0 % commission when no tier matches) is open. | Phase 1 scope, FR-042 | Phase 1 reconciles T056 by `supabase migration list` (read-only). FR-042 ("refuse checkout when no valid … financial rule is available") is applied as **fail closed** when a member seller's own quantity has no covering tier. This resolves `COMMISSION-OPEN-01` through the spec and is recorded in `docs/database/commission-capability.md` during Phase 1. |

None of C1–C16 changes a locked product rule. Each is a repository gap the spec requires closing.

---

## Part B — Decisions

### R-1 Order state vocabulary: reuse stored values, add three, keep legacy values for history
- **Decision**: Keep the stored values whose meaning already matches, and map spec names to them through localized labels (LOC-002):

  | Spec name | Stored value |
  |---|---|
  | Draft (cart) | `DRAFT` (existing) |
  | Proforma Issued | `PROFORMA_ISSUED` (**new**) |
  | Awaiting Bank Transfer | `HOLD` (existing; label only) |
  | Payment Under Review | `PAYMENT_UNDER_REVIEW` (existing) |
  | Paid | `PAID` (existing) |
  | Fulfillment | `FULFILLMENT_IN_PROGRESS` / `PARTIALLY_DELIVERED` (existing) |
  | Completed | `COMPLETED` (existing) |
  | Expired | `EXPIRED` (existing) |
  | Cancelled by buyer | `CANCELLED` (**new**) |
  | Payment rejected | `PAYMENT_REJECTED` (**new**) |
  | Void (admin) | `VOID` (existing) |
  | Disputed | `DISPUTED` (existing) |

  `CONFIRMED` and `PAYMENT_PROOF_SUBMITTED` stay in the CHECK constraint for historical rows but are unreachable from the new transition graph.
- **Rationale**: renaming stored values would rewrite `order_status_history`, break Features 004/007/009/010/012 readers and tests, and add migration risk for no business gain. The SRS §11.1 explicitly allows naming differences when meaning and transition controls are preserved.
- **Alternatives rejected**: rename `HOLD` → `AWAITING_BANK_TRANSFER` (history rewrite, breaks every reader); a separate "checkout state" column (two sources of truth).

### R-2 Split checkout into issuance and confirmation
- **Decision**: `issue_proforma(order_id, destination_id, promo_code, request_id)` freezes everything and reserves **nothing**. `confirm_proforma(proforma_id, request_id)` atomically reserves every line for 20 minutes or nothing. Both are SECURITY DEFINER with pinned `search_path`. Their bodies reuse `checkout_order()`'s proven lock order (offer → position) and the DB-OPEN-16 `app.checkout_reservation` marker. After cutover, `checkout_order()` has EXECUTE revoked from `authenticated` (R-20); it is not dropped.
- **Rationale**: FR-015/FR-016 and the clarification make issuance and reservation different moments with different validity windows.
- **Alternatives rejected**: add a flag to `checkout_order()` (one function with two contracts, same identity); an application-side two-step (violates Principle IX).

### R-3 Proforma versioning (replacement uses current terms)
- **Decision**:
  - Drop `proforma_invoices_order_id_key`.
  - Add `version int`, `supersedes_proforma_id`, and `UNIQUE(order_id, version)`.
  - Add a partial unique index allowing at most one **open** proforma per order (`status IN ('ISSUED','CONFIRMED','PAID')`).
  - Proforma status becomes `ISSUED → CONFIRMED → PAID`, plus terminal `EXPIRED`, `SUPERSEDED`, `CANCELLED`, `VOID`.
  - Issuing a replacement for an expired proforma marks the old one `EXPIRED` (if not already) and writes a new version from current terms in the same transaction.
  - `valid_until` is reused as the frozen confirmation deadline: `issued_at + commerce_settings.proforma_validity_hours`, read once at issuance.
- **Rationale**: ST-002 requires replacement with current terms; FIN-001 forbids mutating an issued proforma, so a new row is the only immutable option.
- **Alternatives rejected**: overwrite the single proforma (breaks FIN-001 and AC-007); a new order per replacement (loses cart identity and history).

### R-4 Where frozen economics live
- **Decision**: new immutable snapshot tables keyed by `proforma_id` (full columns in [data-model.md](./data-model.md) §3):
  - `proforma_invoice_items`: extended with buyer-facing line fields — list price, tier, promotion, discount, net, VAT, line total.
  - `proforma_line_economics`: seller-facing — commission basis, rate, commission, seller net, Hills share.
  - `proforma_fulfillment_groups`: shipping and shipping VAT per seller/warehouse group.
  - `proforma_seller_settlements`: per-seller totals.
  - `proforma_bank_instructions`: full bank snapshot, readable by the buyer and finance only.
  - The proforma header carries the buyer-level totals and the destination and party snapshots.

  `order_financials` stays as the order-level summary (it gains a `proforma_id` pointer), is rewritten only while the order is `PROFORMA_ISSUED`, and is frozen afterwards by a trigger. A trigger blocks every UPDATE/DELETE on snapshot rows (like `prevent_ownership_event_mutation`).
- **Rationale**:
  - Column-level separation is required: buyers must not receive commission (UX-003); sellers must not receive the buyer total, bank instructions or other sellers' lines (RLS-004).
  - RLS is row-level, so the separation must be table-level.
  - `order_items.unit_price_per_kg` is reset from the listing by `validate_order_item_offer()` on every insert/update, so it can only ever be the cart estimate, never the frozen price.
- **Alternatives rejected**:
  - JSONB blobs on the proforma: not RLS-splittable, and the numbers can't be reconciled in SQL.
  - Columns on `order_items`: the trigger overwrites price, and the rows are shared with sellers.

### R-5 One database quote function, used for both estimate and issuance
- **Decision**: `compute_order_quote(order_id, destination_id, promo_code)` is an internal SECURITY DEFINER function that returns a composite result and writes nothing. It is not granted to clients. Two callers:
  1. `estimate_cart(order_id, destination_id, promo_code)`, a STABLE member-callable wrapper that returns a clearly labelled estimate (UX-002).
  2. `issue_proforma(...)`, which persists the result.

  TypeScript never computes a price, tax, discount, shipping, commission or total (SEC-003, Principle IX). The UI only formats values the database returns.
- **Algorithm (per line, then per group, then totals)**. Money is `numeric(14,2)`; each rounded value uses `round(x, 2)` (half away from zero). Every component is rounded before summing (FIN-004). Decisions of 2026-09-24 (FIN-011/012/013) are built in.
  1. `unit_price` = the eligible offer price tier for the line quantity (R-17), else `coffee_offers.price_per_kg`.
  2. `gross = round(qty × unit_price, 2)`.
  3. **Commission rate** (member-seller lines only), per R-6:
     - `Q_s` = the sum of `quantity_kg` over **that seller's** member-seller lines in the order (FIN-013);
     - `rate_s` = the tier covering `Q_s` in the active policy;
     - `commission_on_gross = round(gross × rate_s / 100, 2)`.
  4. **Candidate promotions** (FIN-003, FIN-011, FIN-012). A promotion is eligible for a line when it is active and in its window, targets the line's offer, and `qty ≥ min_quantity_kg` (when set). Funding follows scope: `PLATFORM` = **HILLS**, `SELLER` = **SELLER**.
     - Raw amount: `PERCENT` → `round(gross × value / 100, 2)`; `AMOUNT_PER_KG` → `round(qty × value, 2)`.
     - Cap (the funder can never go negative):

       | Line type | Funding | Cap |
       |---|---|---|
       | member line | SELLER | `gross` |
       | member line | HILLS | `min(gross, commission_on_gross)`; Hills can give away at most its own commission on that line |
       | Hills-owned line | HILLS | `gross` |
       | Hills-owned line | SELLER | not possible (R-18) |

     - `effective = min(raw, cap)`; `capped = (effective < raw)`, recorded with `cap_reason` (`LINE_GROSS` | `HILLS_COMMISSION`).
  5. **Selection**:
     - An explicit code wins if it is eligible for the line and `effective > 0`.
     - Otherwise the greatest `effective` wins; ties break on earlier `starts_at`, then smaller `id`.
     - If no candidate has `effective > 0`, no promotion applies.
     - Recorded: promotion id, scope, funding source, rule snapshot, raw amount, effective amount, cap flag and reason.
  6. `discount = effective`, split into `seller_funded_discount` (when SELLER-funded) or `hills_funded_discount` (when HILLS-funded); the other is 0.
  7. Buyer `net = gross − discount` (FIN-002: never below zero because `discount ≤ gross`).
  8. `line_vat = round(net × vat_rate / 100, 2)` (discount before tax).
  9. Seller and Hills economics:
     - **Member-seller line**:
       - `commission_basis = gross − seller_funded_discount` (FIN-006: a Hills-funded discount does not reduce the seller's basis);
       - `commission = round(commission_basis × rate_s / 100, 2)`;
       - `seller_net = commission_basis − commission`;
       - `hills_share = commission − hills_funded_discount`.

       Identity: `seller_net + hills_share = net`. Both are ≥ 0 by construction: the HILLS cap uses `commission_on_gross`, which equals `commission` whenever a Hills-funded discount applies (the basis is then `gross`), and `rate_s ≤ 100`.
     - **Hills-owned line**: `commission = 0`, `seller_net = 0`, `hills_share = net`, no payout (FIN-008).
  10. Per group (seller × warehouse): `shipping = round(rule.flat_fee, 2)`. `shipping_vat = round(shipping × vat_rate / 100, 2)` when `taxable_base = 'MERCHANDISE_AND_SHIPPING'`, else 0. Promotions never discount shipping.
  11. Totals:
      - Buyer total = Σ net + Σ shipping + Σ line_vat + Σ shipping_vat (FIN-009).
      - Per seller (FIN-007): Σ gross, Σ seller_funded_discount, Σ hills_funded_discount, Σ commission_basis, Σ commission, Σ seller_net, Σ hills_share, Σ net. These reconcile exactly because each is a sum of already-rounded parts.
      - Any negative `seller_net` or `hills_share` raises `negative_economics` and aborts. It is unreachable by construction; the guard is a defence in depth.
- **Rationale**: one authority for math (Principle IX); an identical estimate and issuance path prevents "stale checkout totals" drift; component rounding is what FIN-004 specifies; funding attribution and caps implement the 2026-09-24 decisions exactly.

### R-6 Commission policy application
- **Decision**:
  - Reuse `commission_policies`/`commission_tiers` unchanged. The Feature 010 static tests forbid policy/trigger changes on these tables.
  - Selection rule for the policy and its active window is unchanged.
  - **Tier quantity basis (decided 2026-09-24, FIN-013)**: each member seller's own qualifying quantity `Q_s` = Σ `quantity_kg` of that seller's member-seller lines in the order. Whole-order quantity across unrelated sellers is never used. Existing tier semantics are kept: minimum inclusive, maximum exclusive; latest `effective_from`, then highest matching `min_quantity_kg`.
  - The rate applies to the seller-funded-discounted merchandise basis only (FIN-006, R-5 step 9).
  - The snapshot records `commission_policy_id`, `commission_tier_id`, `rate_s` and `Q_s` per line and per seller settlement.
  - With no covering tier for a member seller's `Q_s`, issuance fails with `commission_rule_missing` (FR-042; resolves `COMMISSION-OPEN-01`, C16).
  - Hills-owned lines never need a tier.
- **Rationale**: FR-013, FIN-007 and FIN-013 are per seller; one seller's volume must not change another seller's commission.

### R-7 VAT
- **Decision**:
  - The active tax rule with `country_code = 'AE'` applies to every order (FR-012: "the active UAE tax rule"), whatever the destination country.
  - `taxable_base` values are unchanged (`MERCHANDISE_ONLY` | `MERCHANDISE_AND_SHIPPING`). Discount applies before tax (FIN-002).
  - No active AE rule → issuance fails `tax_rule_missing` (FR-042).
  - Snapshot fields: `tax_rule_id`, `rate`, `base`.
- **Legal gate (spec Assumptions, not a blocker)**: zero-rating of exports and VAT on Hills' commission are finance/legal approvals before production activation. The configured rule is the lever; no code change is needed to adopt their answer.

### R-8 Shipping per fulfillment group
- **Decision**:
  - A group is `(seller_organization_id, warehouse_id)` of the line's offer.
  - Rule = active `shipping_rules` row matching the destination `country_code` and the destination's `delivery_method`. An exact-country rule wins over a `country_code IS NULL` fallback. Ties go to the latest `effective_from`.
  - No matching rule → `shipping_rule_missing` (FR-042).
  - The fee is frozen per group (FIN-005). Seller promotions never discount shipping (spec Assumptions).

### R-9 Reservation, review hold, expiry and timeliness
- **Decision**:
  - Reservation statuses: `ACTIVE` (20 min, `expires_at = confirmed_at + interval '20 minutes'`; a locked product rule, not configurable), `REVIEW_HOLD` (no timed expiry), `CONSUMED`, `RELEASED`, `EXPIRED`.
  - `uq_active_inventory_reservation_order` is replaced by a unique index on `order_id WHERE status IN ('ACTIVE','REVIEW_HOLD')` (C14).
  - **Timeliness** (ST-005): `submit_payment_proof()` takes the order row lock, then the reservation row lock. It accepts only if the reservation is `ACTIVE` **and** `clock_timestamp() < expires_at` at that point. In the same transaction it flips the reservation to `REVIEW_HOLD` and records `submitted_at = clock_timestamp()`.
  - Every expiry path (`expire_reservation()`, the sweeper, and the opportunistic reclaim in `confirm_proforma()`) takes the **same** order lock first and requires `status = 'ACTIVE' AND expires_at <= clock_timestamp()`. Whichever transaction obtains the order lock first decides. The loser re-reads committed state and either no-ops (expiry sees `REVIEW_HOLD`) or refuses (`reservation_expired`).
  - Uploading bytes to Storage changes nothing (R-10).
- **Expiry is correct without a scheduler**:
  - Readers treat `ACTIVE ∧ expires_at ≤ now()` as expired.
  - `confirm_proforma()` first releases any logically expired `ACTIVE` reservation on the offers it is about to lock (inside the same locks), so stale holds never block a real buyer and never cause overselling.
  - A sweeper function `sweep_expired_reservations(limit)` releases the rest. `pg_cron` runs it every minute (approved 2026-09-24); order reads and writes also run it lazily (existing `ensureHoldFresh` pattern).
  - **Correctness never depends on cron** (decision 2026-09-24). Every read, write and transaction check derives expiry from the authoritative timestamps (`expires_at`, `valid_until`) against `clock_timestamp()`:
    - member and finance reads render an `ACTIVE` reservation past `expires_at` as expired and offer no payment action;
    - `submit_payment_proof`, `cancel_order`, `finance_confirm_payment` and `confirm_proforma` evaluate the deadline under lock;
    - availability is freed by the confirm-time reclaim even if cron is down;
    - a cron outage only delays the physical release of quantity that no transaction can use anyway.
- **Rationale**: the order lock is already the first lock in every existing commerce function, so it serializes proof and expiry without a new lock type. `clock_timestamp()` (not `now()`) keeps a long transaction from back-dating its check.
- **Known limit, documented**: the gap between the locked check and the commit is the commit latency (milliseconds). The spec's "commits before the deadline" is implemented as "passes the locked deadline check inside the committing transaction". No path can extend a deadline.

### R-10 Private payment-proof storage
- **Decision**:
  - New private bucket `payment-proofs`: 10 MB; `application/pdf`, `image/jpeg`, `image/png`.
  - Object path: `org/{buyer_org}/order/{order_id}/payment/{payment_id}/{uuid}.{ext}`.
  - Storage INSERT policy via a SECURITY DEFINER helper `payment_proof_object_authorized(name, for_write)`. It allows the upload only for an active member of the path's buyer organization that can buy, whose order is `HOLD` with an `ACTIVE`, unexpired reservation; `mfa_satisfied()` is also required.
  - SELECT: the same buyer organization or `is_finance_operator()`.
  - No UPDATE/DELETE policy for anyone; proofs are retained, like KYB evidence.
  - `submit_payment_proof()` re-validates the path prefix, confirms the object exists in `storage.objects`, and cross-checks MIME/size metadata (the Feature 003 `attach_kyb_document` pattern). Only then does it create the `file_assets` + `payment_proofs` rows.
  - Viewing: the server action calls `authorize_payment_proof_access(proof_id)`. This RPC checks buyer-org or finance authority and writes an access audit row without the object path; only then does the server mint a signed URL (TTL 60 s). The object path is never sent to the browser.
  - Auditors, sellers and warehouse users get no storage access (RLS-005/006/007).
- **Rationale**: mirrors the approved KYB design (review fixes #3/#4/#8), which already passed security review.

### R-11 Finance confirmation contract
- **Decision**: `finance_confirm_payment(payment_id, observed_amount, observed_currency, value_date, bank_reference, request_id)`.
  - Requires `is_finance_operator()` and `mfa_satisfied()` (SEC-007).
  - Locks order → proforma → reservation → payment.
  - Requires: payment `UNDER_REVIEW`; reservation `REVIEW_HOLD`; an authoritative proof whose `submitted_at < reservation.expires_at`; `observed_currency = 'USD' = proforma currency`; `observed_amount = proforma buyer_total` exactly.
  - `bank_reference` must not already be attached to another confirmed payment (partial unique index on normalized reference).
  - Any mismatch raises `confirmation_requires_reconciliation` and changes nothing; the operator then opens a reconciliation case (R-24).
  - Repeated call after success returns the prior result (idempotent); a concurrent reject/confirm is serialized by the order lock.
- **Rationale**: FR-026, FR-027, AC-009. Finance-observed bank values (not buyer claims) are the settlement evidence; buyer claims are displayed beside them.

### R-12 Settlement effects (single transaction, exactly once)
All of these happen in `finance_confirm_payment()` after the checks, in this order:
1. Consume the reservation.
2. Title transfer, reusing the existing `admin_review_payment()` loop verbatim in semantics:
   - seller position `available`/`reserved` decrement;
   - buyer position upsert;
   - append-only `inventory_ownership_events` (`SALE`/`RESALE`);
   - `coffee_offers` filled/reserved/status (`SOLD_OUT` only when no sellable quantity remains, ST-009);
   - buyer `storage_allocations`.
3. Call `reserve_ready_deliveries_for_settlement()` (restores the Feature 009 seam, C1).
4. Insert `payouts` rows as `ACCRUED` from `proforma_seller_settlements.seller_net` (member sellers only). This is the frozen snapshot, never recomputed.
5. Create the final invoice record (R-23).
6. Create fulfillment shipments (R-13).
7. Set payment `CONFIRMED`, proforma `PAID`, order `PAID`.
8. Emit outbox events (R-16).

Exactly-once is guaranteed by: payment/order state checks under lock; `UNIQUE(order_id, seller_organization_id)` on payouts; `UNIQUE(order_id)` on `tax_invoices`; a unique fulfillment-group key on shipments; and a unique `(event_type, aggregate_id, dedupe_key)` on outbox events.

### R-13 Fulfillment groups and order completion
- **Decision**:
  - `order_shipments` gains `shipment_kind` (`DELIVERY_REQUEST` legacy default | `FULFILLMENT`), `fulfillment_seller_organization_id`, `fulfillment_warehouse_id`, `proforma_fulfillment_group_id`. A unique index on `(order_id, fulfillment_seller_organization_id, fulfillment_warehouse_id) WHERE shipment_kind = 'FULFILLMENT'` guarantees one shipment per group (AC-012).
  - Settlement inserts each group as `DRAFT` (the trigger requires a DRAFT start), then moves it to `REQUESTED` under the internal-transition marker. Destination fields and `shipping_fee` come from the frozen snapshot; `shipment_items` carries only that group's lines.
  - Warehouse progression uses the unchanged Feature 009 machinery (`validate_shipment_transition`, `apply_delivery_reservation`, custody arithmetic).
  - M5c also runs, inside its guarded body, a **one-time recompute** of every `PAID`/`FULFILLMENT_IN_PROGRESS`/`PARTIALLY_DELIVERED` order that already has FULFILLMENT shipments (the pilot orders settled between M5b and M5c). This way a group delivered before the trigger existed still completes its order and releases payouts exactly once (analysis M5).
  - A new AFTER UPDATE trigger `sync_order_fulfillment` on `order_shipments` (FULFILLMENT kind only) recomputes the order:
    - any group moved past `REQUESTED` → `FULFILLMENT_IN_PROGRESS`;
    - any delivered quantity while others are open → `PARTIALLY_DELIVERED`;
    - every group `DELIVERED` with delivered = planned for every line → `COMPLETED`, which moves that order's `ACCRUED` payouts to `PENDING_PAYOUT` and emits events.
    - `CANCELLED`/`FAILED` groups block completion; they resolve only through the existing Feature 009 recovery rule or an audited admin exception.
  - Pre-checkout buyer shipment planning (Feature 007's `shipment-planner`) is retired for Feature 013 orders. `issue_proforma()` refuses an order that still carries a legacy buyer shipment plan (`legacy_shipment_plan_present`). The two buyer shipment policies are dropped after cutover (R-20).
- **Observation (Q6)**: the spec delivers every paid line to the destination. The repository also supports buyer-owned custody (store/resell). The plan implements the spec; whether a Feature 013 order may instead elect storage is surfaced, not assumed.

### R-14 Payouts
- **Decision**:
  - Payout statuses: `ACCRUED` (new, liability, not payable) → `PENDING_PAYOUT` (eligible, only via completion) → `PROCESSING` (optional) → `PAID`; `VOID` by audited admin exception only.
  - `record_seller_payout(payout_id, amount, currency, reference, paid_at, request_id)`:
    - finance + `mfa_satisfied()`;
    - requires `PENDING_PAYOUT` and a `COMPLETED` order;
    - amount must equal the frozen payout amount, USD only;
    - stores operator, time and reference immutably; exactly once.
  - `payouts_finance` (`FOR ALL`) is replaced by a finance SELECT policy; all writes go through RPCs (payouts is not one of the six Feature 010 configuration tables).
  - Hills-owned lines never create payouts (FIN-008).

### R-15 Buyer cancellation and finance rejection
- `cancel_order(order_id, reason, request_id)`:
  - Buyer (can-buy member) only.
  - Allowed from `DRAFT` (cart discarded → `CANCELLED`), `PROFORMA_ISSUED` (open proforma → `CANCELLED`) and `HOLD`, but only while no proof submission exists.
  - Releases an `ACTIVE` reservation exactly once, with the same lock order as confirmation. Payment → `VOID`.
  - Refused after proof (`cancellation_not_allowed_after_proof`) (FR-028).
- `finance_reject_payment(payment_id, reason, request_id)`:
  - Finance + MFA; a reason is required.
  - Releases the `REVIEW_HOLD` exactly once (`RELEASED`).
  - Payment `REJECTED`, proforma `VOID`, order `PAYMENT_REJECTED` (terminal).
  - Emits events. If funds were in fact received, finance opens a reconciliation case.
- **Q4** asks whether the buyer may retry on the same order after rejection. The plan's default is terminal, and the buyer starts a new cart via a "reorder" helper that copies lines into a new `DRAFT`.

### R-16 Notifications: transactional outbox, in-app first, provider-independent
- **Decision**: full data model in [data-model.md](./data-model.md) §6.
  - `notification_events` (outbox): `event_type`, `aggregate_type`, `aggregate_id`, `dedupe_key`, localized template key plus safe parameters (never amounts beyond the recipient's own visibility, never bank values or proof paths), `status`, `attempts`, `next_attempt_at`, `claimed_at`/`claimed_by`, `processed_at`. Written inside commerce transactions; `UNIQUE(event_type, aggregate_id, dedupe_key)` makes retries harmless.
  - Fan-out `process_notification_events(limit)` claims events with `FOR UPDATE SKIP LOCKED` (SEC-008) and resolves recipients from current membership/roles at processing time:
    - buyer-org members;
    - seller-org members, for seller-scoped events only;
    - finance/warehouse operators for queue events.

    It inserts `notifications` (`UNIQUE(event_id, user_id)`) and, for each **enabled** external channel, a `notification_deliveries` row (`UNIQUE(notification_id, channel)`).
  - In-app is always on. External channels are enabled only when an adapter is registered, so with no provider none are created (US6-AS4).
  - Read state: `mark_notifications_read(ids[])` and `mark_all_notifications_read()`, own-user only. This closes DB-BLOCK-04 with the smallest surface; no direct UPDATE policy.
  - Campaigns: `notification_campaigns` (`DRAFT → SCHEDULED → DISPATCHING → SENT` | `CANCELLED` | `FAILED`) with an audience enum (`APPROVED_BUYERS`, `APPROVED_SELLERS`, `ADMINISTRATORS`, `SELECTED_USERS`) plus `notification_campaign_recipients` for selected users. `dispatch_due_campaigns(limit)` claims due campaigns with SKIP LOCKED, materializes one outbox event per recipient (`dedupe_key = campaign_id`), then marks `SENT`. A second worker is a no-op (AC-013).
  - Provider boundary (TypeScript, server-only): `NotificationChannelAdapter { channel; send(delivery) → {status, providerMessageId?} }`. The registry holds only adapters whose env configuration is present; the Firebase adapter is future work (FR-038). A delivery worker claims `PENDING` deliveries with SKIP LOCKED, uses exponential backoff, and caps attempts (e.g. 8) before `FAILED`. **In Feature 013 the worker is a pure function taking an injected database client** (analysis M6):
    - no runtime module imports a service-role client;
    - no route or job invokes it (no provider exists);
    - it is unit-tested with mocks;
    - wiring it to a scheduler-invoked, server-only entry point is future provider work.

    No provider ships in Feature 013.
- **Scheduler (approved 2026-09-24)**: `pg_cron` inside the existing Supabase project, created by migration M7b. Jobs (each wraps one SECURITY DEFINER function):

  | Job | Schedule | Function |
  |---|---|---|
  | `f013_sweep_reservations` | every minute | `sweep_expired_reservations(500)`: also marks overdue `ISSUED` proformas `EXPIRED` and emits `proforma.expiring_soon` / `order.reservation_expiring` reminders |
  | `f013_process_outbox` | every minute | `process_notification_events(500)` |
  | `f013_dispatch_campaigns` | every minute | `dispatch_due_campaigns(20)` |
  | `f013_purge_request_log` | daily 03:00 Asia/Dubai (23:00 UTC) | delete `commerce_request_log` rows older than 30 days |

  - No new vendor and no service-role key over HTTP (Constitution XI).
  - Job functions are idempotent and claim work with `SKIP LOCKED`, so overlapping runs are harmless.
  - `cron.job_run_details` is surfaced read-only on `/dashboard-admin/outbox` (last run/status per job) for operational visibility.
  - **Correctness never depends on cron** (R-9): expiry is authoritative from timestamps; outbox events and due campaigns are also processed lazily when an admin opens the campaign/outbox screen ("process now" diagnostic, platform admin). That diagnostic calls the M7 wrappers `admin_process_outbox_now` / `admin_dispatch_due_campaigns_now` (EXECUTE `authenticated`, gated inside on platform admin + MFA), **never a service-role client**; the Feature 010 "no service-role runtime in admin roots" invariant is preserved (analysis H2). A cron outage delays delivery, never correctness or exactly-once guarantees.
  - The extension may need to be enabled in the Supabase dashboard. Phase 1 preflight reports `pg_extension`; M7b's guard aborts, changing nothing, if `pg_cron` is absent.

### R-17 Offer price tiers and offer reference
- **Decision**:
  - `offer_price_tiers(offer_id, min_quantity_kg, price_per_kg)` with `UNIQUE(offer_id, min_quantity_kg)`, `min_quantity_kg > 0`, `price_per_kg >= 0`, USD. Tier selection: the highest `min_quantity_kg ≤ qty`, else the base `price_per_kg` (deterministic, FR-008).
  - Written only through the seller's listing RPCs (own listing), and only while the listing is in an editable state per the existing Feature 006 listing rules. Tier changes affect only future proformas (FIN-001).
  - `coffee_offers.offer_code text UNIQUE` (`LST-<7 digits>`) from `offer_code_seq`; backfilled for existing rows in the Phase 2 migration (FR-041).

### R-18 Promotions
- **Decision**:
  - `promotions`:
    - `scope` `PLATFORM` | `SELLER`; `seller_organization_id` (required iff `SELLER`); optional `code` (case-insensitive unique among non-archived rows);
    - `discount_type` `PERCENT` | `AMOUNT_PER_KG` (the only v1 types, decided 2026-09-24); `value`; optional `min_quantity_kg`; `starts_at`/`ends_at`;
    - `funding_source` `HILLS` | `SELLER`: generated from scope (`PLATFORM` → `HILLS`, `SELLER` → `SELLER`) and CHECK-bound to it, so the funding cannot be mislabelled (FIN-011);
    - `status` `DRAFT`/`SCHEDULED`/`ACTIVE`/`PAUSED`/`ENDED`/`ARCHIVED`. **Eligibility is derived from timestamps** (analysis M1): `status IN ('SCHEDULED','ACTIVE') AND starts_at <= clock_timestamp() < ends_at`. No job has to flip `SCHEDULED → ACTIVE`, consistent with "correctness never depends on cron". `DRAFT`/`PAUSED`/`ARCHIVED` are never eligible; past `ends_at` is never eligible;
    - `created_by` / `updated_by`.
  - `promotion_targets(promotion_id, offer_id | coffee_id | all_seller_offers)`.
  - A trigger refuses a `SELLER` promotion whose targets include an offer or coffee scope with another seller's offer, or any `HILLS` (Hills-owned) offer (FR-010, US6-AS2). Hills-owned lines can only receive Hills-funded platform promotions.
  - Writes go through RPCs: `upsert_seller_promotion` (own org, can-sell member) and `upsert_platform_promotion` (platform admin); both audited.
  - At most one promotion per line (FIN-003); promotions never discount shipping.
- **Funding rule (decided 2026-09-24; FIN-011/FIN-012)**:
  - **Platform/admin promotions are Hills-funded.** On a member-seller line they reduce only `hills_share`. The seller's commission basis, commission and `seller_net` are computed as if the discount did not exist (R-5 step 9), so the seller's payout is untouched. On a Hills-owned line they reduce Hills' revenue.
  - **Seller promotions are seller-funded.** They reduce the seller's commission basis and therefore both the seller's net and (proportionally, through commission) Hills' commission on that line, exactly as FIN-006 prescribes.
  - **Snapshot**: every discounted line freezes `promotion_id`, scope, `funding_source`, rule snapshot, raw amount, applied amount, `seller_funded_discount`, `hills_funded_discount`, `discount_capped` and `cap_reason`. Per-seller settlements freeze both discount totals.
  - **No negative economics**, in two layers:
    - *Reject at configuration*. `upsert_*_promotion` refuses:
      - `value ≤ 0`, or `PERCENT` with `value > 100`;
      - `starts_at ≥ ends_at`;
      - an `AMOUNT_PER_KG` seller promotion whose value is ≥ the lowest current base or tier price of any targeted offer;
      - any seller promotion targeting offers it does not own, or Hills-owned offers.
    - *Cap at quote time* (deterministic, recorded). A seller-funded discount is capped at line `gross`. A Hills-funded discount on a member-seller line is capped at `min(gross, commission_on_gross)`, so `hills_share ≥ 0`; on a Hills-owned line it is capped at `gross`.
    - Selection compares **capped** amounts; an explicit code whose capped amount is 0 for a line does not apply to that line.
    - A defence-in-depth guard raises `negative_economics` if any line or seller total would still be negative.
  - **Admin UX consequence**: the platform-promotion editor states that on member-seller listings the discount is capped at Hills' commission for the line. The proforma, finance review and seller views show the funding source per discounted line.

### R-19 RLS realignment (C2)
- **New STABLE SECURITY DEFINER helpers**:
  - `is_order_buyer_member(order_id)`: active member of the buyer org, not blocked.
  - `is_order_line_seller(order_item_id)` and `order_seller_org_ids(order_id)`.
  - `can_read_finance()`: `is_finance_operator()`.
  - `can_read_finance_redacted()`: `is_finance_operator() OR is_auditor()`.
- **Replaced policies** (full list in [contracts/rls-storage.md](./contracts/rls-storage.md)):
  - `payments`, `payment_proofs`, `order_financials`, `proforma_invoices`: buyer member + finance (+ auditor through redacted views only).
  - `proforma_invoice_items`, `order_items`: buyer (all lines) + seller (own lines) + finance.
  - `order_shipments`/`shipment_items`: buyer + seller (own fulfillment group only) + warehouse + finance-read.
  - `tax_invoices`: buyer + finance.
  - `payouts`: seller own + finance.
- `can_view_order()` is unchanged, and so are all other features' policies.
- Auditors read `v_audit_payments`/`v_audit_proformas`: SECURITY INVOKER views over masked columns, with a SELECT grant to authenticated and a filter requiring `is_auditor()`. They never see storage objects or full bank identifiers (RLS-007).

### R-20 Retiring legacy checkout and Stripe runtime
- **Decision**:
  - **After cutover** (Phase 4 exit), a forward migration revokes EXECUTE on `checkout_order`, `admin_review_payment` and the legacy `submit_payment_proof(uuid, uuid, text)` overload from `authenticated`. Nothing is dropped.
  - The Feature 007 buyer shipment-planning policies are dropped.
  - **Phase 7**:
    - Revoke EXECUTE on `ingest_stripe_event`, `record_stripe_payment_intent` and `record_payment_transfer` from every role.
    - Restrict `payment_transfers`/`payment_events` to finance-read.
    - Keep `payments.trusted_funding_*`, `payment_events`, `payment_transfers` and every historical migration, rollback and postflight file byte-for-byte (MIG-001, MIG-005, SC-011).
    - Destructive contraction is deferred to a later retention-approved migration outside Feature 013.
- **Rationale**: MIG-005 ("first unused and access-restricted") and MIG-006 (no destructive rollback once financial rows exist).

### R-21 Preflight and cutover classification (MIG-003/MIG-004)
- **Decision**: a read-only `supabase/maintenance/<date>_feature_013_preflight.sql` reports counts and ids for:
  - orders by status: `CONFIRMED`, `HOLD`, `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_UNDER_REVIEW` and legacy shipment plans;
  - `ACTIVE` reservations, split into expired and unexpired;
  - payments by method/status, including any `PROVIDER` rows or `trusted_funding_*` set;
  - `payment_events`/`payment_transfers` rows;
  - payouts by status;
  - `tax_invoices`;
  - `proforma_invoices` by status;
  - orders with more than one `DRAFT` per organization;
  - live function fingerprints (C1) and `pg_extension` (pg_cron).

  Each Feature 013 migration's guard block **aborts** if any nonterminal legacy row exists that the migration cannot map (for example, a live `HOLD` order from the old flow when M2 changes proforma uniqueness). The operator then drains or expires those rows through existing functions first. Nothing is guessed, deleted or rewritten.
- Mapping when legacy rows are present and safe:
  - legacy `CONFIRMED` (pre-checkout) orders are returned to `DRAFT` by an audited admin action (no reservation exists);
  - legacy `DRAFT` orders (including those returned from `CONFIRMED`):
    - with no non-`CANCELLED` shipment: converted to `BANK_TRANSFER_V1` carts by `admin_convert_legacy_draft()` (M4a; platform admin + MFA; audited; lines and prices untouched, since a cart holds estimates only);
    - with a legacy buyer shipment plan: voided with `admin_void_order()` and the buyer notified. There is no reservation to release.
  - **No new legacy rows (analysis H1)**: after M4a the `commerce_flow` default is `BANK_TRANSFER_V1` and a BEFORE INSERT guard forces non-service-role inserts to it. The drain set is therefore finite and M6's zero-legacy guard is reachable. Legacy test fixtures set `commerce_flow = 'LEGACY'` explicitly (service role) until M6;
  - legacy `HOLD`/`PAYMENT_UNDER_REVIEW` orders finish under the legacy functions, which remain EXECUTE-able until those orders are terminal.

### R-22 Migration mechanics (repository conventions)
- One forward file per change set in `supabase/migrations/`, with versions after `20260924120000`. Each has a guard block (the 007/009 pattern), a paired `supabase/rollback/<same>.rollback.sql`, and a read-only `supabase/maintenance/<date>_<name>_postflight.sql`.
- File names use `feature_013_*` and must **not** contain `commission`, `payment_accounts`, `platform_admins`, `run_f` or `feature_010`, or `tests/admin/run-f-static.test.tsx` fails.
- No migration creates, drops or alters an RLS policy or trigger on the six configuration tables (`platform_admins`, `tax_rules`, `shipping_rules`, `commission_policies`, `commission_tiers`, `payment_accounts`). Adding a column is allowed: `payment_accounts.is_default_for_currency`.
- Snapshot and bank-snapshot tables are not attached to `write_audit_log()`, which would copy full rows. They get purpose-built redacting audit functions (the `write_audit_log_payment_accounts()` pattern, AUD-006).
- Apply path: the human-approved `supabase db push --linked` after preflight, never by an agent in this feature's planning or task runs unless the task explicitly carries the human approval.

### R-23 Final tax invoice
- **Decision**:
  - Reuse `tax_invoices`: `file_asset_id` and `uploaded_by` become nullable; add `status` (`ISSUED` | `VOID`), `proforma_id`, `issued_by`, `issued_at timestamptz`, `snapshot jsonb` (a frozen copy of the proforma header totals, destination and parties, no bank identifiers), and `invoice_number` from `tax_invoice_code_seq` (`INV-YYYYMMDD-<7 digits>`).
  - Created only inside `finance_confirm_payment()` (FR-029/FR-030). Rendered as a printable page from the snapshot; finance may attach a signed PDF later through `attach_final_invoice_file()`.
  - A proforma is never shown as an invoice: separate routes, labels and numbering (FR-029).
- **Legal gate**: invoice legal content and issuer for member-seller lines need finance/legal approval before production, as the spec's Assumptions already state. It does not block implementation.

### R-24 Reconciliation and manual adjustments
- **Decision**:
  - `reconciliation_cases`:
    - `kind`: `LATE` | `PARTIAL` | `WRONG_CURRENCY` | `DUPLICATE` | `OTHER`;
    - `order_id`, `payment_id`, optional `proof_id`;
    - observed amount/currency/date/reference;
    - `status`: `OPEN` → `IN_REVIEW` → `RESOLVED` | `CLOSED_NO_ACTION`;
    - `resolution_type`: `REFUNDED_EXTERNALLY` | `APPLIED_TO_NEW_ORDER` | `NO_FUNDS_RECEIVED` | `OTHER`;
    - resolution note; opened/resolved by/at.
  - Opened by finance, or by `report_late_transfer()` when a buyer reports a transfer after expiry (the proof is stored, the order stays `EXPIRED`, and **no stock is touched**, AC-009).
  - `manual_financial_adjustments`: append-only; finance/admin + MFA; `kind` `REFUND_EXTERNAL` | `REVERSAL` | `CORRECTION`; order/payment/payout references; amount, currency, external reference, reason, actor/time. No automated bank action and no inventory or title effect (FR-044). Orders gain a boolean `has_manual_adjustment` for UI surfacing; no status change (SRS "Refunded" is represented by the adjustment record).

### R-25 Idempotency
- **Decision**: a single `commerce_request_log(request_id uuid PK, actor_user_id, operation, target_id, response jsonb, created_at)`.
  - Every member/finance mutating RPC takes `p_request_id`. The Server Action generates it once per intent (`randomUUID()`, stored in the form as a hidden field so double submits reuse it).
  - The RPC inserts the log row first. On conflict with the same actor and operation it returns the stored response; otherwise it raises `request_id_conflict`.
  - State checks under lock remain the primary exactly-once guarantee; the log makes replays return identical results (SEC-004, SC-006).
  - The log is RLS-private (no client access) and purgeable after 30 days by a maintenance task.

### R-26 Marketplace search (FR-039) without widening RLS
- **Decision**:
  - `search_member_listings(filters jsonb, sort text, page int, page_size int)` is STABLE and SECURITY DEFINER.
  - Gate: `is_authorized_member()` ∧ `mfa_satisfied()`; otherwise it returns zero rows and no error detail.
  - It joins `coffee_offers` (published/partially filled, visible, not deleted, sellable > 0) → lots → coffees → origins/processing/types → warehouses (city/country only) → certifications and tags.
  - Returns an allowlisted projection: offer id/code, title, coffee name (EN/AR), origin, process, type, warehouse city/country, sellable kg, base price, tier count, certification names (official, LTR), primary media id.
  - Filters: origin, process, location, coffee type, availability band, certification, tag. Sorts: newest (`created_at DESC, id DESC`, as `getBrowseListings`), price asc/desc, quantity desc.
  - `lib/listings/browse.ts` keeps its RLS read for detail; the list page switches to the search RPC.
- **Rationale**: DB-OPEN-05 (members cannot read `coffee_lots`) makes an RLS view impossible without widening lot access. A gated projection RPC is the approved pattern (it is the same shape as the Feature 002 public DTO allowlists).

### R-27 Kill switch and phased enablement
- `commerce_settings` (singleton):
  - `proforma_validity_hours` (default 24, `CHECK 1..720`);
  - `bank_transfer_checkout_enabled` (default **false**);
  - `proof_submission_enabled` (default true);
  - `updated_by`/`updated_at`.
- Admin-editable (platform admin + MFA) through `update_commerce_settings()` and audited. `issue_proforma()` refuses when checkout is disabled (`checkout_disabled`). This is the MIG-006 "application disablement" lever used for rollback once real financial rows exist.

### R-28 Testing approach
- Static tests follow the repository's established pattern: single-caller audits, "no TypeScript money math", migration content pins and policy greps.
- Database behaviour is tested with live-gated suites (`F013_LIVE=1`, disposable fixtures through `scripts/seed-test-fixtures.ts`).
- Concurrency runs 100 contention iterations (SC-002).
- Browser proofs use `tests/browser/cdp-harness.mjs`; axe uses `node_modules/axe-core`.
- Vitest runs in batches (a full run OOMs on this machine).

---

## Part C — Business questions

### Resolved 2026-09-24 (recorded in spec.md Clarifications; FIN-011/012/013)

| ID | Decision | Where applied |
|---|---|---|
| **Q1** | Commission tier = each member seller's own qualifying quantity within the order; never whole-order quantity. | R-5 step 3, R-6; `compute_order_quote`; tests "per-seller tier isolation" |
| **Q2** | `pg_cron` approved for expiry sweeps, scheduled notifications and campaigns; correctness never depends solely on cron. | R-9, R-16; migration M7b (now standard); cron-down tests |
| **Q3** | v1 promotion types: `PERCENT`, `AMOUNT_PER_KG`. Platform promotions are Hills-funded and reduce only Hills' share; seller promotions are seller-funded and reduce that seller's economics. Funding and applied discount are snapshotted. Negative seller/Hills economics are prevented by configuration rejection plus a deterministic quote-time cap. | R-5 steps 4–9, R-18; data-model §3, §5; tests "promotion funding & caps" |

### Open, with safe spec-literal defaults (non-blocking)

| ID | Question | Why it is material | Plan default until answered | Blocks |
|---|---|---|---|---|
| **Q4** | After finance rejects proof, may the buyer retry on the **same** order, or must they start a new cart? | Order/reservation semantics | Terminal `PAYMENT_REJECTED` + "reorder" copy | Phase 4 UX copy only. |
| **Q5** | May a buyer return an **unconfirmed** issued proforma to cart for editing (voiding it), or only cancel? | Cart UX | Cancel or confirm only (FR-004 literal) | None. |
| **Q6** | Must every Feature 013 order deliver all lines (spec FR-031), or may a buyer elect storage in Hills custody for later resale (supported elsewhere in the repository)? | Product scope; completion and payout timing depend on delivery | Spec literal: deliver every line | None for Feature 013. A future feature can add a storage election. |

Legal/finance production gates already recorded in the spec's Assumptions (VAT basis and export treatment, invoice legal
content/issuer, real bank-account data, warehouse reconciliation) remain **production activation** gates, not
implementation blockers.
