# Contract — Database functions (RPCs, triggers, workers)

Conventions for **every** function below unless stated:
- `SECURITY DEFINER`, `SET search_path TO 'pg_catalog','public','auth'`.
- `REVOKE ALL ... FROM public, anon`; EXECUTE granted exactly as listed.
- Errors are raised as stable snake_case codes, mapped to localized copy in `lib/commerce/errors.ts` /
  `lib/finance/errors.ts`. No raw SQL text reaches a client (the existing Feature 007 `error-mapping` discipline).
- Non-enumeration: a nonexistent id and an id owned by someone else raise the **same** code (`*_not_found`).
- `p_request_id uuid` = the idempotency key (R-25). Replaying it with the same actor/operation returns the stored result.
- Every mutating function sets `app.correlation_id` and `app.transition_reason`. The buyer/seller checks
  `organization_can_buy/sell`, `is_blocked_user()` and `mfa_satisfied()` are re-evaluated inside the function (SEC-001).
- Lock order is [data-model.md §8](../data-model.md#8-global-locking-order-every-feature-013-function-deadlock-free-by-construction).

## Member — cart and destinations (M4)

| Function | EXECUTE | Contract |
|---|---|---|
| `get_or_create_cart(p_org_id uuid) → uuid` | authenticated | Can-buy active member. Advisory lock per org. Returns the latest `BANK_TRANSFER_V1` `DRAFT` order, else creates one. |
| `add_cart_line(p_offer_id uuid, p_quantity_kg numeric, p_request_id uuid) → jsonb` | authenticated | Resolves the caller's cart. Inserts a line, or adds to an existing line's quantity (one line per offer). `validate_order_item_offer()` enforces eligibility (published, visible, not own listing, sellable ≥ qty) **without reserving** (FR-003). Returns `{order_id, line_id, quantity_kg}`. |
| `update_order_item_quantity(uuid, numeric)` | authenticated | **Existing** (Feature 007), reused unchanged. DRAFT only. |
| `remove_order_item(uuid)` | authenticated | **Existing**, reused unchanged. |
| `estimate_cart(p_order_id uuid, p_destination_id uuid default null, p_promo_code text default null) → jsonb` | authenticated | STABLE. Buyer member only. Calls `compute_order_quote` and returns **buyer-facing** fields only (no commission/seller net), flagged `is_estimate: true`. When no destination is supplied, shipping/VAT on shipping are `null` with reason `destination_required`. |
| `upsert_delivery_destination(p_id uuid, p_org_id uuid, p_fields jsonb, p_request_id uuid) → uuid` | authenticated | Can-buy member of `p_org_id`. Validates §2.3 fields. `p_id` null = create. |
| `retire_delivery_destination(p_id uuid, p_request_id uuid)` | authenticated | Soft retire. Never affects orders (snapshots). |

## Member — proforma, reservation, cancellation (M4)

### `compute_order_quote(p_order_id uuid, p_destination_id uuid, p_promo_code text) → record` — internal
No EXECUTE for any client role. Pure computation per [research.md R-5–R-8](../research.md), reading current listing,
tier, promotion, tax, shipping, commission and bank configuration.
- Commission tier per member seller comes from that seller's own quantity `Q_s` (FIN-013).
- Promotion funding follows scope: platform = Hills-funded, seller = seller-funded. Hills-funded discounts reduce only `hills_share`.
- Discounts are capped so neither seller net nor Hills share can go negative (FIN-011/012). The cap and funding source are returned per line.

Raises:
- `order_has_no_items`
- `listing_is_not_available` (per line)
- `destination_required`
- `tax_rule_missing`
- `shipping_rule_missing`
- `commission_rule_missing` (no tier covers a member seller's own `Q_s`)
- `negative_economics` (defence in depth; unreachable by construction)
- `bank_account_missing`
- `currency_not_supported`

### `issue_proforma(p_order_id uuid, p_destination_id uuid, p_promo_code text, p_request_id uuid) → jsonb`
EXECUTE authenticated.
1. Checks, all under the order lock:
   - `commerce_settings.bank_transfer_checkout_enabled`;
   - the caller is a buyer member, can-buy, MFA-satisfied;
   - the order is `BANK_TRANSFER_V1` in `DRAFT`, or `PROFORMA_ISSUED` whose open proforma's `valid_until <= clock_timestamp()` (replacement);
   - the destination belongs to the buyer org and is not retired;
   - no legacy buyer shipment plan exists.
2. Marks a prior open proforma `EXPIRED` if its deadline passed.
3. Calls `compute_order_quote`, then persists the new version: proforma header, items, line economics, fulfillment groups, seller settlements and bank instructions.
4. Updates `orders`: destination snapshot, `current_proforma_id`, `order_financials`; status → `PROFORMA_ISSUED`.
5. **No reservation, no offer/position change** (FR-015).
6. Emits `proforma.issued`.

Returns `{order_id, proforma_id, proforma_code, version, valid_until, buyer_total}`.
Errors: the quote errors, plus `checkout_disabled`, `order_not_found`, `order_not_editable`, `proforma_still_valid`, `destination_not_found`, `legacy_shipment_plan_present`.

### `confirm_proforma(p_proforma_id uuid, p_request_id uuid) → jsonb`
EXECUTE authenticated.
1. Locks order → proforma (`ISSUED`, `clock_timestamp() < valid_until`; otherwise `proforma_expired` and the proforma is marked `EXPIRED`).
2. **Opportunistic reclaim**: releases any logically expired `ACTIVE` reservations that hold quantity on the offers in this proforma (each under its own order lock taken with `SKIP LOCKED`; a skipped one is left for the sweeper).
3. Locks offers ascending, then positions ascending.
4. For **every** line: listing still `PUBLISHED`/`PARTIALLY_FILLED`, visible, the seller still can sell, and `quantity − filled − reserved ≥ line qty` and position `available − reserved ≥ line qty`. The first failure raises `listing_inventory_changed` / `seller_inventory_changed` and **the whole transaction rolls back** (FR-017, AC-002).
5. Increments position `reserved_quantity_kg`, then the offer mirror (`app.checkout_reservation` marker, as today); inserts the reservation (`ACTIVE`, `expires_at = clock_timestamp() + interval '20 minutes'`) and its items.
6. Payment row `PENDING` with `expected_amount = buyer_total`.
7. Proforma `CONFIRMED`; order → `HOLD`.
8. Emits `order.awaiting_transfer`.

The listing price is **not** re-read: the frozen proforma is binding (FIN-001). Only availability and eligibility are rechecked.
Returns `{order_id, reservation_id, expires_at, buyer_total, payment_reference}`.
Errors: `proforma_not_found`, `proforma_expired`, `proforma_not_confirmable`, `listing_inventory_changed`, `seller_inventory_changed`, `seller_not_authorized`.

### Cancellation and expiry

| Function | EXECUTE | Contract |
|---|---|---|
| `cancel_order(p_order_id uuid, p_reason text, p_request_id uuid) → jsonb` | authenticated | Buyer member. Allowed from `DRAFT`, `PROFORMA_ISSUED`, or `HOLD` with no proof row (otherwise `cancellation_not_allowed_after_proof`). Releases an `ACTIVE` reservation exactly once (`RELEASED`, reason `CANCELLED`). Proforma `CANCELLED`, payment `VOID`, order `CANCELLED`. Emits `order.cancelled`. |
| `expire_reservation(p_order_id uuid) → boolean` | authenticated, service_role | Supersedes `expire_order_hold` for `BANK_TRANSFER_V1` orders. The caller must be a buyer member or platform admin (non-enumerating). No-op unless the reservation is `ACTIVE ∧ expires_at <= clock_timestamp()`; then releases it exactly once and sets reservation `EXPIRED`, payment `EXPIRED`, proforma `EXPIRED`, order `EXPIRED`. Emits `order.expired`. |
| `sweep_expired_reservations(p_limit int default 100) → int` | service_role only (pg_cron job `f013_sweep_reservations`) | Iterates candidates by `expires_at`, locks each order with `SKIP LOCKED`, and applies the `expire_reservation` body. It also marks overdue `ISSUED` proformas `EXPIRED` and emits reminder events. Returns the count. Correctness never depends on it: every RPC re-evaluates deadlines from timestamps under lock. |

## Member — payment proof (M5)

### `submit_payment_proof(p_order_id uuid, p_object_path text, p_mime text, p_size bigint, p_claimed_amount numeric, p_claimed_currency text, p_transfer_date date, p_bank_reference text, p_request_id uuid) → jsonb`
New overload; the legacy 3-arg overload has EXECUTE revoked after cutover. EXECUTE authenticated.
1. Checks `proof_submission_enabled`; the caller is a buyer member, can-buy, MFA-satisfied.
2. Locks order (`HOLD`) → reservation.
3. Requires `status = 'ACTIVE' ∧ clock_timestamp() < expires_at`; otherwise raises `reservation_expired` and changes nothing.
4. Validates the path prefix `org/{buyer}/order/{order}/payment/{payment}/`, confirms the object exists in bucket `payment-proofs`, and cross-checks mime/size metadata (the `attach_kyb_document` pattern).
5. Inserts `file_assets` (private) + `payment_proofs` (`ON_TIME`, `SUBMITTED`, `submitted_at = clock_timestamp()`).
6. Reservation → `REVIEW_HOLD`; payment → `UNDER_REVIEW`; order → `PAYMENT_UNDER_REVIEW`.
7. Emits `payment.proof_submitted` (buyer) and `finance.review_pending` (finance).

A second on-time submission for the same payment raises `proof_already_submitted` (the idempotent replay with the same `p_request_id` returns the first result).
Errors: `order_not_found`, `order_not_payable`, `reservation_expired`, `cross_organization_object_path`, `storage_object_not_found`, `invalid_mime_type`, `object_too_large`, `mime_type_mismatch`, `proof_already_submitted`, `invalid_claimed_currency`.

### Other proof functions

| Function | EXECUTE | Contract |
|---|---|---|
| `report_late_transfer(p_order_id uuid, <same proof args>, p_request_id uuid) → jsonb` | authenticated | Buyer member; order `EXPIRED` (or `HOLD` past its deadline → first applies `expire_reservation`). Stores the proof as `LATE_REPORT`/`IN_RECONCILIATION` and opens a `LATE` reconciliation case. **Never re-reserves** (AC-009). Emits `finance.reconciliation_opened`. |
| `authorize_payment_proof_access(p_proof_id uuid) → jsonb` | authenticated | Returns `{bucket, object_path}` **only to the server** (the Server Action never forwards it). Buyer-org member or finance + MFA. Writes an audit row `payment_proof.accessed` without the path. Otherwise raises `proof_not_found`. |

## Finance (M5) — all require `is_finance_operator()` ∧ `mfa_satisfied()` (SEC-007); EXECUTE authenticated

| Function | Contract |
|---|---|
| `finance_confirm_payment(p_payment_id uuid, p_observed_amount numeric, p_observed_currency text, p_value_date date, p_bank_reference text, p_request_id uuid) → jsonb` | [research.md R-11/R-12](../research.md). Locks order → proforma → reservation → payment → offers → positions. Refuses with `confirmation_requires_reconciliation` (details: `amount_mismatch` / `currency_mismatch` / `late_proof` / `duplicate_bank_reference`) and changes nothing. On success, the settlement effects run exactly once. A replay returns the prior result; a concurrent loser sees the terminal state and raises `payment_already_decided`. |
| `finance_reject_payment(p_payment_id uuid, p_reason text, p_request_id uuid) → jsonb` | Payment `UNDER_REVIEW`; the reason is required. Releases the review hold exactly once. Payment `REJECTED`, proof `REJECTED`, proforma `VOID`, order `PAYMENT_REJECTED`. Emits `payment.rejected`. |
| `open_reconciliation_case(p_payment_id uuid, p_kind text, p_observed jsonb, p_note text, p_request_id uuid) → uuid` | Allowed from `UNDER_REVIEW` (the payment stays under review with the case linked; finance must still reject or confirm) and from terminal payments. No inventory effect. |
| `resolve_reconciliation_case(p_case_id uuid, p_status text, p_resolution_type text, p_note text, p_linked_order_id uuid, p_request_id uuid)` | `OPEN`/`IN_REVIEW` → `RESOLVED`/`CLOSED_NO_ACTION`. Appends a case event. |
| `record_manual_adjustment(p_kind text, p_order_id uuid, p_payment_id uuid, p_payout_id uuid, p_amount numeric, p_currency text, p_external_reference text, p_reason text, p_request_id uuid) → uuid` | Finance or platform admin + MFA. Append-only. Sets `orders.has_manual_adjustment`. No inventory, title or payout-status effect. |
| `record_seller_payout(p_payout_id uuid, p_amount numeric, p_currency text, p_reference text, p_paid_at timestamptz, p_request_id uuid) → jsonb` | Payout `PENDING_PAYOUT` ∧ order `COMPLETED` (otherwise `payout_not_eligible`). The amount must equal the frozen amount (`payout_amount_mismatch`). → `PAID` exactly once. Emits `payout.paid`. |
| `attach_final_invoice_file(p_invoice_id uuid, p_object_path text, p_mime text, p_size bigint, p_request_id uuid)` | Finance attaches a signed PDF to an issued invoice. Stored in the private, finance-write bucket `finance-documents` (created in M5 with the same helper pattern as `payment-proofs`). The buyer reads it through a server-minted signed URL after an `authorize_final_invoice_access()` check (buyer-org member or finance). |

## Admin (M1/M8) — platform admin + MFA unless noted; EXECUTE authenticated

| Function | Contract |
|---|---|
| `update_commerce_settings(p_validity_hours int, p_checkout_enabled bool, p_proof_enabled bool, p_request_id uuid)` | Audited. Never alters issued proformas. |
| `set_default_payment_account(p_account_id uuid, p_request_id uuid)` | Makes the active USD account the default (unique index). The Feature 010 payment-accounts UI calls it. |
| `admin_void_order(p_order_id uuid, p_reason text, p_request_id uuid)` | Non-terminal and not yet `PAID`. Releases an open reservation exactly once. |
| `admin_convert_legacy_draft(p_order_id uuid, p_request_id uuid)` (M4a) | `LEGACY` + `DRAFT` + no non-`CANCELLED` shipment → `commerce_flow = 'BANK_TRANSFER_V1'` (the only permitted flow change); audited; lines untouched. Any other state → `legacy_draft_not_convertible`. Used by the cutover drain (R-21, analysis H1). |
| `upsert_platform_promotion(p_id uuid, p_fields jsonb, p_targets jsonb, p_request_id uuid) → uuid` | Platform admin. Always Hills-funded (`funding_source` derived from scope). Rejects `value ≤ 0`, `PERCENT > 100`, invalid window (`promotion_config_invalid`). The response includes a notice that member-seller lines are capped at Hills' line commission. |
| `set_promotion_status(p_id uuid, p_status text, p_request_id uuid)` | Owner scope or platform admin. Status is intent only. Eligibility is derived at quote time from `status IN ('SCHEDULED','ACTIVE')` and the `starts_at`/`ends_at` window (analysis M1); no job flips statuses. |
| `upsert_campaign(...)` / `schedule_campaign(p_id, p_at)` / `cancel_campaign(p_id)` | Platform admin. Bilingual content required. |

## Seller (M8) — can-sell active member of the owning organization + MFA

| Function | Contract |
|---|---|
| `upsert_seller_promotion(p_id uuid, p_org_id uuid, p_fields jsonb, p_targets jsonb, p_request_id uuid) → uuid` | Seller-funded. Targets must be the caller org's own offers, or `all_seller_offers`; otherwise `promotion_target_not_owned` (FR-010).. Also rejects `value ≤ 0`, `PERCENT > 100`, invalid window, `AMOUNT_PER_KG` ≥ the lowest current price of any targeted offer, and Hills-owned targets (`promotion_config_invalid`, FIN-012). |
| `set_offer_price_tiers(p_offer_id uuid, p_tiers jsonb, p_request_id uuid)` | Own listing, in an editable state per the Feature 006 rules. Replaces the tier set atomically; affects future proformas only. |

## Marketplace (M8)

| Function | EXECUTE | Contract |
|---|---|---|
| `search_member_listings(p_filters jsonb, p_sort text, p_page int, p_page_size int) → setof record` | authenticated | STABLE. `is_authorized_member() ∧ mfa_satisfied()`; otherwise zero rows. Allowlisted projection ([research.md R-26](../research.md)). `p_page_size ≤ 50`. |

## Notifications (M7)

| Function | EXECUTE | Contract |
|---|---|---|
| `emit_notification_event(p_event_type text, p_aggregate_type text, p_aggregate_id uuid, p_dedupe_key text, p_audience jsonb, p_template_key text, p_params jsonb)` | none (internal) | `INSERT ... ON CONFLICT DO NOTHING`. Called only inside commerce functions (created in M2 so Phases 3–4 can emit). |
| `process_notification_events(p_limit int) → int` | service_role (pg_cron job `f013_process_outbox`) | Claims `PENDING` events with `SKIP LOCKED`, resolves recipients, inserts notifications/deliveries idempotently, and marks events `PROCESSED`. Failures back off `next_attempt_at`; `FAILED` after 8 attempts. |
| `dispatch_due_campaigns(p_limit int) → int` | service_role (pg_cron job `f013_dispatch_campaigns`) | `SCHEDULED ∧ scheduled_at <= now()` → `DISPATCHING` → one event per resolved recipient → `SENT`. |
| `claim_notification_deliveries(p_channel text, p_limit int) → setof notification_deliveries` / `complete_notification_delivery(p_id uuid, p_status text, p_provider_message_id text, p_error text)` | service_role | For future external adapters (server-side worker). Unused while no adapter is registered. |
| `mark_notifications_read(p_ids uuid[])` / `mark_all_notifications_read()` | authenticated | Own rows only. Sets `read_at` once. |
| `admin_process_outbox_now(p_limit int default 200) → int` / `admin_dispatch_due_campaigns_now(p_limit int default 20) → int` | authenticated | `is_platform_admin() ∧ mfa_satisfied()` checked inside; runs the same internal bodies as `process_notification_events` / `dispatch_due_campaigns`, with the same idempotency. The admin outbox/campaign "process now" diagnostic uses these, so admin code never needs a service-role client (analysis H2). |

## Triggers

| Trigger | On | Purpose |
|---|---|---|
| `validate_order_transition` (v2) | `orders` BEFORE UPDATE | Graph §7.1 for `BANK_TRANSFER_V1`; legacy graph for `LEGACY`; no more `assert_order_checkout_ready` on `HOLD` for v1 rows (fixes DB-OPEN-15 for them). |
| `protect_proforma_snapshot` | `proforma_invoices` BEFORE UPDATE/DELETE | Freezes money, party and snapshot columns. |
| `prevent_snapshot_mutation` | `proforma_invoice_items`, `proforma_line_economics`, `proforma_fulfillment_groups`, `proforma_seller_settlements`, `proforma_bank_instructions`, `manual_financial_adjustments`, `reconciliation_case_events` | Append-only. |
| `check_seller_settlement_totals` | `proforma_seller_settlements` (deferred constraint) | FIN-007 equality at commit. |
| `freeze_order_financials` | `order_financials` BEFORE UPDATE | Frozen outside `DRAFT`/`PROFORMA_ISSUED`. |
| `validate_promotion_scope` | `promotions`, `promotion_targets` | Seller scope and target ownership. |
| `sync_order_fulfillment` | `order_shipments` AFTER UPDATE OF `status` (FULFILLMENT kind) | Order progress, completion, payout eligibility, events. M5c also applies the same aggregation once to orders that already have FULFILLMENT shipments (analysis M5). |
| `enforce_new_order_flow` (M4a) | `orders` BEFORE INSERT | Forces `commerce_flow = 'BANK_TRANSFER_V1'` for every non-`service_role` insert (analysis H1). |
| `audit_*_redacted` | commerce tables | Purpose-built audit rows (old/new state, actor, reason, correlation; no bank values, no object paths, no proof bytes — AUD-001/AUD-006). |

## Retired after cutover (EXECUTE revoked from `authenticated`, bodies kept)
`checkout_order(uuid)`, `admin_review_payment(uuid, boolean, text)`, `submit_payment_proof(uuid, uuid, text)` (legacy
overload), `expire_order_hold(uuid)` (kept for LEGACY rows until they are terminal, then revoked). Phase 7 revokes
`ingest_stripe_event`, `record_stripe_payment_intent` and `record_payment_transfer` from every role.
