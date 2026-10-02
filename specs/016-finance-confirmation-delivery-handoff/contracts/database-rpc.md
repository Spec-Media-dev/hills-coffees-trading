# Feature 016 — Database RPC Contract

**Authoritative baseline:** the checked-in migrations and `supabase/trading_schema.sql`; this contract does not create a schema authority of its own.

## 1. Primary RPC

```sql
public.finance_review_bank_transfer_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_decision text,
  p_notes text default null,
  p_request_id uuid default null
) returns jsonb
```

It is `SECURITY DEFINER`, with `search_path = pg_catalog, public, auth`. Revoke `PUBLIC`, `anon`, and `service_role`; grant only `authenticated`. The function requires a non-null `auth.uid()`, `not is_blocked_user()`, `mfa_satisfied()`, and `is_finance_operator() OR is_platform_admin()`.

`p_decision` is exactly `CONFIRMED` or `REJECTED`; rejection requires nonblank `p_notes`.

## 2. Real baseline entities and bindings

The implementation uses these current columns only:

| Entity | Required Feature 016 columns / relationship |
|---|---|
| `payment_proof_upload_intents` | `id`, `order_id`, `buyer_organization_id`, `bucket_id`, `object_path`, `status`, `finalized_proof_id`, `prepare_request_id`, `finalized_at`; the exact finalized row identifies the proof. There is no `upload_intents` table and no `payment_id` column here. |
| `payment_proofs` | `id`, `payment_id`, `file_asset_id`, `submitted_by`, `claimed_amount`, `claimed_currency`, `transfer_date`, `bank_reference`, `submitted_at`, `submission_kind`, `request_id`, `status`. It has **no `updated_at`** column. |
| `inventory_reservations` | `id`, `order_id`, `proforma_id`, `status`, `expires_at`, `confirmed_by`, `review_hold_at`, `release_reason`, `released_at`, `consumed_at`. |
| `inventory_reservation_items` | `reservation_id`, `offer_id`, `inventory_position_id`, `quantity_kg`. It has **no `order_item_id`** column. |
| `orders` | `id`, `buyer_organization_id`, `commerce_flow`, `status`, `current_proforma_id`, `destination_snapshot`, `created_by`, `paid_at`. |
| `payments` | `id`, `order_id`, `proforma_id`, `status`, `amount`, `expected_amount`, `confirmed_by`, `confirmed_at`, `rejected_by`, `rejected_at`, `rejected_reason`. |
| `proforma_invoices` | `id`, `order_id`, `status`, `destination_snapshot`, `buyer_total`, `currency`, `confirmed_at`, `confirmed_by`. |
| `proforma_invoice_items` | `id`, `proforma_id`, `order_item_id`, `offer_id`, `fulfillment_group_id`, `quantity_kg`, `seller_type_snapshot`. The unique `(proforma_id, offer_id)` snapshot key supplies the real bridge from `iri.offer_id` to `order_item_id`. |
| `proforma_fulfillment_groups` | `id`, `proforma_id`, `seller_organization_id`, `warehouse_id`, `delivery_method`, `shipping_amount`. |
| `inventory_positions` / `coffee_offers` | `inventory_positions.id`, `lot_id`, `owner_organization_id`, `warehouse_id`, `warehouse_location_id`, `available_quantity_kg`, `reserved_quantity_kg`; `coffee_offers.id`, `filled_quantity_kg`, `reserved_quantity_kg`, `quantity_kg`, `status`, `is_visible`. |
| `tax_invoices` | `order_id`, `proforma_id`, `invoice_number`, `status`, `issued_by`, `issued_at_ts`, `snapshot`; `tax_invoices_order_id_key` permits one invoice per order. |
| `inventory_ownership_events` | `lot_id`, `from_organization_id`, `to_organization_id`, `order_item_id`, `quantity_kg`, `event_type`, `created_by`, `correlation_id`, `reason`. |
| `order_shipments` / `shipment_items` | `order_shipments.id`, `order_id`, `status`, `shipment_kind`, `fulfillment_seller_organization_id`, `fulfillment_warehouse_id`, `proforma_fulfillment_group_id`, destination fields and `created_by`; `shipment_items.shipment_id`, `order_item_id`, `planned_quantity_kg`, `delivered_quantity_kg`, `reserved_quantity_kg`. |
| `warehouses` / `organization_members` / `notifications` | `warehouses.id`, `owner_organization_id`; `organization_members.organization_id`, `user_id`, `is_active`; notifications use `user_id`, `organization_id`, `notification_type`, `entity_type`, `entity_id`, `title`, `body`. These real columns define shipment-handoff recipients and per-recipient dedupe. |
| `payment_reviews` | `id`, `payment_id`, `reviewer_user_id`, `decision`, `reason`, `request_id`, `created_at`; `request_id` is unique. |

## 3. Replay-first ordering and integrity

The RPC locks and inspects the request, terminal entities, and association chain **before** applying any initial-state-only rejection. It never selects only `REVIEW_HOLD` before deciding whether the call is a replay.

1. Validate actor and parameters; lock `orders` by `p_order_id`, then `payments` by `p_payment_id`. Require `payments.order_id = orders.id` and `orders.commerce_flow = 'BANK_TRANSFER_V1'`.
2. Inspect the request-key row (`payment_reviews.request_id = p_request_id`) and the order's persisted terminal state (`PAID` or `PAYMENT_REJECTED`) before initial-state checks. Call `commerce_request_begin(p_request_id, 'finance_review_bank_transfer_v1', p_order_id)` only after this identity inspection.
3. **Same request ID:** require one review whose `request_id`, `reviewer_user_id`, `payment_id`, and `decision` match the request/caller. Missing or contradictory review data raises `persisted_review_integrity_error`; a different payment or decision raises `request_id_conflict`.
4. **Different request ID on a terminal order:** do not require a review with the new `p_request_id` and do not insert one. Instead load the original authoritative persisted review for the terminal `payment_id` and terminal decision, validate its chain, and reconstruct it only when the requested decision is the same. The opposite decision raises `decision_conflict` / `order_already_finalized`.
5. Only when neither same-key replay nor terminal reconstruction applies may the initial mutation path require `PAYMENT_PROOF_SUBMITTED`, `PROOF_SUBMITTED`, and `REVIEW_HOLD`.

No branch may directly `return v_replay`. A replay response is returned only after the corresponding complete persisted-integrity validator has constructed it.

### CONFIRMED terminal validator

Require exactly one original authoritative review for `payments.id` with `decision = 'CONFIRMED'`; `orders.status = 'PAID'`;  `payments.status = 'CONFIRMED'`; one reservation for the order with `status = 'CONSUMED'`; the exact finalized intent and its `finalized_proof_id`; and that proof with `status = 'ACCEPTED'` and `payment_id = payments.id`. Require one `tax_invoices` row whose `order_id` and `proforma_id` equal the authoritative chain, ownership events for every reservation item, and exactly one FULFILLMENT shipment for every authoritative fulfillment group, with group-correct shipment items. Missing, duplicate, or contradictory entities raise `persisted_review_integrity_error`.

### REJECTED terminal validator

Require exactly one original authoritative review for `payments.id` with `decision = 'REJECTED'`; `orders.status = 'PAYMENT_REJECTED'`;  `payments.status = 'REJECTED'`; one reservation for the order with `status = 'RELEASED'` and `release_reason = 'REJECTED'`; the exact finalized intent and proof, where proof `status = 'REJECTED'` and belongs to the payment. Require zero Feature 016 tax invoices, zero Feature 016 `inventory_ownership_events` for the reservation lines/correlation, and zero Feature 016 FULFILLMENT handoff shipments. Any deviation fails closed.

## 4. Initial mutation path and authoritative snapshot

Only this path requires all of the following, locked in the documented global order:

* order `PAYMENT_PROOF_SUBMITTED`;
* payment `PROOF_SUBMITTED` belonging to that order;
* one reservation `REVIEW_HOLD` belonging to that order;
* one exact `payment_proof_upload_intents` row `FINALIZED` for the order with non-null `finalized_proof_id`;
* exact `payment_proofs.id = finalized_proof_id`, belonging to the payment, with `status = 'SUBMITTED'`;
* one authoritative proforma satisfying all four equalities:

```text
payments.proforma_id = orders.current_proforma_id
                    = inventory_reservations.proforma_id
                    = proforma_invoices.id
```

The proforma must belong to the order and have `status = 'CONFIRMED'`. The RPC fails before mutation if any pointer is null, missing, or divergent. It must not select a “latest proforma by order”.

The implementation may derive the order item for a reservation line only through the authoritative snapshot:

```sql
join public.proforma_invoice_items pii
  on pii.proforma_id = v_proforma.id
 and pii.offer_id = iri.offer_id
```

It uses `pii.order_item_id` for ownership events and `shipment_items`; it never references `inventory_reservation_items.order_item_id`.

## 5. Transaction-local transition context

Before the first guarded internal write, set this once in the RPC transaction:

```sql
perform set_config('app.internal_transition', 'true', true);
```

It must be set before the first Feature 016 business write and therefore precede all of these writes:

* inventory-position and offer conservation/release updates and ownership-event inserts;
* Feature 013 final tax-invoice insert (`trg_tax_invoices_protect` / `protect_tax_invoice`);
* FULFILLMENT shipment DRAFT insert (`trg_order_shipments_fulfillment_guard` / `guard_fulfillment_shipment_fields`);
* the guarded shipment `DRAFT → REQUESTED` update; and
* guarded internal order/proforma/reservation transitions.

The setting is transaction-local (`true`): rollback removes it and commit cannot leak it to another session. The function must not set it only after invoice or shipment insertion.

## 6. Confirmation and rejection effects

Confirmation sets only the exact proof `status = 'ACCEPTED'` (no nonexistent proof timestamp), inserts the review, consumes the reservation, conserves positions using `inventory_reservation_items`, records one ownership event per reservation item using the joined `pii.order_item_id`, updates offers, issues the tax invoice, and creates one FULFILLMENT shipment per authoritative group. It then transitions payment to `CONFIRMED` and order to `PAID`.

Rejection sets only the exact proof `status = 'REJECTED'`, inserts the review, decrements backing `inventory_positions.reserved_quantity_kg` before `coffee_offers.reserved_quantity_kg`, sets reservation `RELEASED` with `release_reason = 'REJECTED'`, payment `REJECTED`, and order `PAYMENT_REJECTED`. It creates no invoice, ownership transfer, or FULFILLMENT shipment.

## 7. Notification ownership

Feature 016 extends `commerce_notify_order_status_change` / `trg_notify_order_status_change` so the DB owns `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`, and `PAYMENT_REJECTED`; server actions and review RPC bodies do not insert these notifications. It follows the Feature 014 recipient model: `orders.created_by` with `orders.buyer_organization_id`, not an invented organization-wide broadcast.

No shipment-status notifier exists in the current Feature 009/014 migrations. Feature 016 therefore creates `public.commerce_notify_shipment_status_change()` and `trg_notify_shipment_status_change` (`AFTER UPDATE OF status ON public.order_shipments FOR EACH ROW`). On exactly `DRAFT → REQUESTED` FULFILLMENT, it joins `warehouses.id = fulfillment_warehouse_id` to active `organization_members` of `warehouses.owner_organization_id` and writes `DELIVERY_HANDOFF_REQUESTED` to each such warehouse-team recipient. The `NOT EXISTS` dedupe predicate is per `(user_id, notification_type, entity_type = 'order_shipments', entity_id = shipment_id)`; the event identity is `shipment_id:REQUESTED`. The forward migration adds it; rollback drops the trigger and function; postflight pins binding, recipient join, and dedupe.

## 8. Migration, rollback, and postflight inventory

Feature 016 modifies or creates exactly:

| Object | Current pre-016 source / binding | Forward and rollback requirement |
|---|---|---|
| `finance_review_bank_transfer_v1(uuid,uuid,text,text,uuid)` | Absent | Create hardened function and exact authenticated-only ACL; rollback drops exact signature. |
| `admin_review_payment(uuid,boolean,text)` | Latest body: `20260922120000_feature_008_stripe_trusted_funding.sql`; `SECURITY DEFINER`, `search_path = pg_catalog, public, auth`, revoked `PUBLIC`/`anon`, authenticated EXECUTE only | Preserve the complete Feature 008 body and ACLs, including provider `trusted_funding_required`. Before its existing workflow locks, do a read-only payment/order flow lookup; `BANK_TRANSFER_V1` immediately raises the V1 fence with zero mutation. All non-V1 legacy/provider behavior is byte-for-byte equivalent. Rollback restores the exact September 22 definition and ACLs. |
| `commerce_notify_order_status_change()` / `trg_notify_order_status_change` | `20260929100000_feature_014_notifications_lifecycle.sql`; `AFTER UPDATE OF status` on `public.orders`; function has no API execute grants | Extend status vocabulary; rollback restores the Feature 014 body and same trigger binding. |
| `commerce_notify_shipment_status_change()` / `trg_notify_shipment_status_change` | Absent | Create/remove as described above; no duplicate writer. |
| `validate_order_transition()` | Latest body: `20260930110000_feature_015_fence_legacy_submit_payment_proof.sql`; it already permits BANK_TRANSFER_V1 `PAYMENT_PROOF_SUBMITTED → PAID` / `PAYMENT_REJECTED` under `app.internal_transition`; trigger remains bound to `public.orders` | **Not modified.** Postflight asserts the exact F015 body/binding and current grants (`authenticated`, `service_role`; revoked `PUBLIC`, `anon`) remain in place. |
| `inventory_positions` logical uniqueness | Current source declares unnamed `UNIQUE (lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` in `supabase/trading_schema.sql` | Preflight duplicate logical keys; discover/drop the existing unique constraint by its catalog identity and ordered columns, then create named `uq_inventory_positions_null_safe UNIQUE NULLS NOT DISTINCT (...)`. Rollback drops named F016 constraint and restores the baseline unique columns; no data merge. |

Postflight must assert every listed function signature, `SECURITY DEFINER` where required, exact search path, grants/revocations, order and shipment trigger bindings, Feature 015 legacy fences, Feature 009 shipment prerequisites (`trg_shipment_transition`, `trg_order_shipments_fulfillment_guard`, and current shipment guard functions), `uq_inventory_positions_null_safe`, and that payouts/payout-related objects are untouched.
