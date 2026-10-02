# Feature 016 — Research & Architecture Decisions (Final Planning Correction Pass)

**Feature**: Feature 016 — Finance Confirmation & Delivery Handoff  
**Date**: 2026-10-01  
**Status**: Revised (All Codex Findings Addressed)  

---

## 1. Executive Context & Technology Baseline

* **Next.js**: `16.3.4` (App Router, breaking changes from Next.js 15 consult `node_modules/next/dist/docs/`)
* **React**: `19.2.8`
* **Zod**: `4.5.4`
* **PostgreSQL**: `15+` (Supabase managed; native `UNIQUE NULLS NOT DISTINCT` supported)
* **Target Project**: `mxejnutukgxyccnohglo`
* **Feature Approval Gate**: `F016_REMOTE_LIVE_DB_APPROVED=1` (strictly independent of Feature 015)

---

## 2. Decision 1: Single Unified Atomic Finance Review RPC

All manual bank-transfer reviews are processed through ONE authoritative database function:
`public.finance_review_bank_transfer_v1(p_order_id, p_payment_id, p_decision, p_notes, p_request_id)`
where `p_decision` is strictly `'CONFIRMED'` or `'REJECTED'`.

### Rationale
* Encapsulates the entire confirmation or terminal rejection lifecycle in a single atomic database transaction.
* Prevents divergent state logic, trigger skips, or code drift between separate confirm and reject endpoints.
* Guarantees deadlock-free execution via ascending UUID locking across all affected tables.

---

## 3. Decision 2: Inventory Conservation & Signed Equations (HIGH 1 / LOW)

### Signed Conservation Equations
For each reservation item with quantity $q$:
* **Seller Source Position**:
  $$\Delta \text{seller\_available} = -q$$
  $$\Delta \text{seller\_reserved} = -q$$
* **Buyer Destination Position**:
  $$\Delta \text{buyer\_available} = +q$$
  $$\Delta \text{buyer\_reserved} = 0$$
* **Platform Total On-Hand Balance Invariant**:
  $$\Delta \text{seller\_available} + \Delta \text{buyer\_available} = -q + q = 0$$
* **Magnitudes**:
  $$\text{seller available decrease magnitude} = q$$
  $$\text{buyer available increase magnitude} = q$$
  $$\text{consumed reservation quantity} = q$$
*(Signed deltas are never equated as both positive).*

### Source of Truth
Quantities and source positions MUST be read directly from `public.inventory_reservation_items` (`iri`), not from offer totals, order item lines, or client input.

---

## 4. Decision 3: Rejection Write Ordering

### Conflict with `validate_offer_transition`
In `validate_offer_transition`, releasing offer reserved counters before backing position counters causes trigger validation failure.

### Selected Release Sequence
While row-level locks are acquired in standard deadlock-free order (`coffee_offers` then `inventory_positions`), the release WRITES must execute in strict dependency order:
1. **Backing Position Release**: Decrement `inventory_positions.reserved_quantity_kg` by `iri.quantity_kg`.
2. **Listing Offer Release**: Decrement `coffee_offers.reserved_quantity_kg` by `iri.quantity_kg`.
3. **Quantities**: Sourced strictly from `inventory_reservation_items`.
4. **Assertions**: Assert `pos.reserved_quantity_kg >= iri.quantity_kg` and `offer.reserved_quantity_kg >= iri.quantity_kg`.

---

## 5. Decision 4: Null-Safe Buyer Position Identity & Concurrency Protocol (HIGH 4)

The source schema declares an **unnamed** ordinary unique constraint on `(lot_id, owner_organization_id, warehouse_id, warehouse_location_id)`. The migration must preflight duplicate logical keys, discover that actual constraint by catalog identity and ordered columns, remove it, and add named `uq_inventory_positions_null_safe UNIQUE NULLS NOT DISTINCT (...)`. Rollback drops only the named Feature 016 constraint and restores the ordinary baseline key; it never merges data.

### Target PostgreSQL Support & Migration Preflight
PostgreSQL 15+ natively supports `NULLS NOT DISTINCT` for unique constraints.
```sql
alter table public.inventory_positions
  add constraint uq_inventory_positions_null_safe
  unique nulls not distinct (lot_id, owner_organization_id, warehouse_id, warehouse_location_id);
```

### Final Owner Decision: Zero Auto-Merging of Existing Duplicates
Pre-existing duplicate positions MUST NOT be automatically merged, deleted, or repointed during migration. The migration preflight executes:
```sql
select lot_id, owner_organization_id, warehouse_id, warehouse_location_id, count(*) as duplicate_count
from public.inventory_positions
group by lot_id, owner_organization_id, warehouse_id, warehouse_location_id
having count(*) > 1;
```
**Stop Condition**: If `duplicate_count > 0`, the migration immediately aborts with an explicit diagnostic error requiring reviewed, manual reconciliation before re-attempting migration.

### Buyer/Source Deterministic Concurrency Locking Protocol
To eliminate concurrency races between simultaneous purchases into the same buyer position (including when `warehouse_location_id IS NULL`):
1. **Derive Source Positions**: Collect all `iri.inventory_position_id` from `inventory_reservation_items`.
2. **Derive Buyer Logical Destination Keys**: `(lot_id, buyer_org_id, warehouse_id, warehouse_location_id)` derived from source position and order.
3. **Acquire Transaction-Scoped Advisory Locks**: Sort distinct buyer logical keys deterministically by `(lot_id, buyer_org_id, warehouse_id, coalesce(warehouse_location_id, '00000000-0000-0000-0000-000000000000'::uuid))`. For each key, acquire `pg_advisory_xact_lock(hashtext(key_string)::bigint)`.
4. **Resolve Existing Buyer Rows**: Query `SELECT id FROM public.inventory_positions` matching each logical key.
5. **Lock ALL Positions Globally**: Lock all existing source position IDs AND existing buyer position IDs in a single global query:
   ```sql
   perform id from public.inventory_positions
   where id in (select unnest(v_all_position_ids))
   order by id asc
   for update;
   ```
6. **Perform Debits & Credits**:
   * Debit seller position: `available_quantity_kg -= qty`, `reserved_quantity_kg -= qty`.
   * For buyer position: Use `INSERT ... ON CONFLICT (lot_id, owner_organization_id, warehouse_id, warehouse_location_id) DO UPDATE SET available_quantity_kg = public.inventory_positions.available_quantity_kg + excluded.available_quantity_kg, updated_at = clock_timestamp()`.
   The `UNIQUE NULLS NOT DISTINCT` constraint guarantees that concurrent inserts into an absent position with `warehouse_location_id IS NULL` yield exactly one row credited exactly once.

---

## 6. Decision 5: Truthful Idempotency & Replay Verification (HIGH 3)

### Replay-first Request Deduplication
Lock and inspect order/payment association, the request-key row, and terminal order state **before** any `REVIEW_HOLD`/initial-state rejection. Then call `commerce_request_begin(p_request_id, 'finance_review_bank_transfer_v1', p_order_id)` to arbitrate the request key. A same-key replay requires exactly one review with `request_id = p_request_id` and matching `reviewer_user_id`, `payment_id`, and `decision`; missing or inconsistent data fails closed with `persisted_review_integrity_error`, never cached `v_replay` success.

### Terminal Integrity Verification
For a different request ID on a terminal order, the RPC does not look for or create a review keyed by the new request. It loads the original authoritative review for the terminal payment/decision and validates the complete persisted graph. CONFIRMED requires the exact finalized intent/proof (`ACCEPTED`), original review, `PAID` order, `CONFIRMED` payment, consumed reservation, authoritative confirmed proforma, one matching invoice, all reservation-line ownership events, and one FULFILLMENT shipment per authoritative group with group-correct items. REJECTED requires the exact proof (`REJECTED`), original review, rejected payment/order, reservation `RELEASED` with reason `REJECTED`, and zero Feature 016 invoice, ownership, and FULFILLMENT artifacts. Missing, duplicate, or contradictory evidence fails closed.

### Terminal Conflict Decision Matrix
* Same request + same payment + same decision: same-key replay after matching-key review validation.
* Same request + different payment, or same request + opposite decision: `request_id_conflict`, zero mutation.
* Different request + same terminal payment/decision: reconstruct the original verified terminal result, zero mutation and no second review.
* Different request + opposite decision: `decision_conflict` / `order_already_finalized`, zero mutation.

Fabricated success payloads are prohibited.

---

## 7. Decision 6: Legacy `admin_review_payment` Pre-Lock Fence (HIGH 5)

To prevent AB-BA deadlocks between legacy `admin_review_payment` (locks `payments` then `orders`) and `finance_review_bank_transfer_v1` (locks `orders` then `payments`), Feature 016 starts from the latest effective September 22 Feature 008 body, not Feature 009. It inserts only this read-only pre-lock flow lookup before that body's existing workflow lock sequence:
```sql
select o.commerce_flow into v_commerce_flow
from public.payments p
join public.orders o on o.id = p.order_id
where p.id = p_payment_id;

if v_commerce_flow = 'BANK_TRANSFER_V1' then
  raise exception 'endpoint_deprecated_use_finance_review_bank_transfer_v1';
end if;
```
The fence performs zero mutation. Non-V1 behavior remains the complete September 22 body, including `trusted_funding_required` for approved `payment_method = 'PROVIDER'` rows lacking `trusted_funding_confirmed_at`, all provider/legacy protections, and the same ACLs. Rollback restores that exact September 22 definition.

---

## 8. Decision 7: Feature 009 FULFILLMENT Model & Destination Mapping (HIGH 1)

### Shipment Handoff Contract
For EACH proforma fulfillment group in `public.proforma_fulfillment_groups` for the settled `CONFIRMED` proforma:
1. Create exactly one `order_shipments` record in `status = 'DRAFT'`.
2. Insert line items into `public.shipment_items` including ONLY lines belonging to that fulfillment group:
   ```sql
   insert into public.shipment_items (
     shipment_id, order_item_id, planned_quantity_kg, delivered_quantity_kg, reserved_quantity_kg
   ) select v_shipment_id, oi.id, oi.quantity_kg, 0, 0
     from public.order_items oi
     join public.proforma_invoice_items pii on pii.order_item_id = oi.id
     where pii.proforma_id = v_proforma.id
       and pii.fulfillment_group_id = v_group.id;
   ```
   *(Lines belonging to other fulfillment groups MUST NOT be attached).*
3. Set `app.internal_transition = true` transaction-locally before the guarded FULFILLMENT shipment DRAFT insert, and retain it for the `REQUESTED` update, tax-invoice insert, and internal order/reservation transitions.

### Destination Snapshot & Address Mapping
The proforma `destination_snapshot` stores `address_lines` as a JSON array of strings (e.g. `["Suite 400", "Plot 12 Industrial Area"]`), NOT `address_line`.
* **Mapping**: `address_line := array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_proforma.destination_snapshot->'address_lines')), ', ')`.
* **Other Destination Fields**:
  * `country_code := v_proforma.destination_snapshot->>'country_code'`
  * `city := v_proforma.destination_snapshot->>'city'`
  * `contact_name := v_proforma.destination_snapshot->>'contact_name'`
  * `contact_phone := v_proforma.destination_snapshot->>'contact_phone'`

### Preserving Frozen Delivery Method
The delivery method MUST be preserved from the frozen fulfillment group:
* `delivery_method := v_group.delivery_method` (from `proforma_fulfillment_groups.delivery_method`).
* Do NOT hardcode `'Courier'` unless that is the literal value of `v_group.delivery_method`.

### Complete Required Shipment Fields
* `order_id`: UUID
* `shipment_kind`: `'FULFILLMENT'`
* `fulfillment_seller_organization_id`: `v_group.seller_organization_id`
* `fulfillment_warehouse_id`: `v_group.warehouse_id`
* `proforma_fulfillment_group_id`: `v_group.id`
* `created_by`: `auth.uid()`
* `country_code`: mapped from snapshot
* `city`: mapped from snapshot
* `address_line`: joined from `address_lines`
* `contact_name`: mapped from snapshot
* `contact_phone`: mapped from snapshot
* `delivery_method`: preserved from `v_group.delivery_method`
* `shipping_fee`: `v_group.shipping_amount`
* `currency`: `'USD'`

---

## 9. Decision 8: Privilege Matrix (HIGH 7)

For `public.finance_review_bank_transfer_v1`:
* `REVOKE EXECUTE ON FUNCTION public.finance_review_bank_transfer_v1 FROM PUBLIC, anon, service_role;`
* `GRANT EXECUTE ON FUNCTION public.finance_review_bank_transfer_v1 TO authenticated;`
* Internal security checks:
  * `auth.uid() IS NOT NULL`
  * `not public.is_blocked_user()`
  * `public.mfa_satisfied()`
  * `public.is_finance_operator() OR public.is_platform_admin()`
* Fixed `search_path = pg_catalog, public, auth`.

---

## 10. Decision 9: Authoritative Entity & Proforma Binding (HIGH 2)

### Binding CONFIRMED Proforma
Feature 015 checkout transitions the authoritative proforma to `CONFIRMED`; Feature 016 must not require `ISSUED` or select “latest by order”. The real identity is `v_payment.proforma_id = v_order.current_proforma_id = v_reservation.proforma_id = v_proforma.id`; that proforma belongs to the order and is `CONFIRMED`. Every missing or divergent pointer fails before mutation. The initial-only `REVIEW_HOLD` check follows replay/terminal inspection.

### Exact Proof Mutation
The exact proof comes from `public.payment_proof_upload_intents.finalized_proof_id` for a `FINALIZED` intent of the order, and must belong to the payment. Only that row's real `status` column is updated:
```sql
update public.payment_proofs
set status = case when p_decision = 'CONFIRMED' then 'ACCEPTED' else 'REJECTED' end
where id = v_intent.finalized_proof_id;
```
`payment_proofs.updated_at` does not exist. Arbitrary or payment-wide proof updates are prohibited.

---

## 11. Decision 10: Notification Single-Owner Architecture (MEDIUM 1)

### Single Database Trigger Ownership
`PAYMENT_PROOF_SUBMITTED` notification is owned SOLELY by the database order-status trigger `trg_notify_order_status_change` on `public.orders`.
* `finalize_payment_proof` MUST NOT insert notifications directly.
* Notification occurs only AFTER successful, committed transition into `orders.status = 'PAYMENT_PROOF_SUBMITTED'`.

### Complete Event Matrix & Vocabulary
| Event Name | Recipient Audience | Triggering DB Event | Deduplication Identity |
| :--- | :--- | :--- | :--- |
| `PAYMENT_PROOF_SUBMITTED` | Finance & Platform Admin operators | `orders.status` → `PAYMENT_PROOF_SUBMITTED` | `order_id:PAYMENT_PROOF_SUBMITTED` |
| `PAYMENT_CONFIRMED` | Existing Feature 014 recipient: `orders.created_by` in `buyer_organization_id` | `orders.status` → `PAID` | `order_id:PAID` |
| `PAYMENT_REJECTED` | Existing Feature 014 recipient: `orders.created_by` in `buyer_organization_id` | `orders.status` → `PAYMENT_REJECTED` | `order_id:PAYMENT_REJECTED` |
| `DELIVERY_HANDOFF_REQUESTED` | Active `organization_members` of the fulfillment warehouse's owner organization | FULFILLMENT `order_shipments` `DRAFT` → `REQUESTED` | `shipment_id:REQUESTED`, per recipient |

The existing order-status trigger is the sole DB writer for `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_CONFIRMED`, and `PAYMENT_REJECTED`. No shipment notifier currently exists: Feature 016 creates `commerce_notify_shipment_status_change()` and `trg_notify_shipment_status_change` to own the delivery event. It joins `warehouses.owner_organization_id` to active `organization_members` and dedupes by `(user_id, notification_type, entity_type = 'order_shipments', entity_id = shipment_id)`. The migration creates them, rollback drops them, and postflight verifies binding, recipients, and dedupe. Server Actions do not write notifications.

---

## 12. Decision 11: Exact Pre-016 Rollback Baselines (MEDIUM 2)

### Pre-016 Baseline Inventory
1. **`admin_review_payment`**:
   * Latest pre-016 body defined in: `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql`.
   * Its provider approval gate raises `trusted_funding_required` when `payment_method = 'PROVIDER'` and `trusted_funding_confirmed_at` is null; Feature 016 preserves it unchanged.
   * Signature: `public.admin_review_payment(p_payment_id uuid, p_approved boolean, p_reason text DEFAULT NULL::text) RETURNS void`.
   * Security: `SECURITY DEFINER`, `search_path to 'pg_catalog', 'public', 'auth'`.
   * Grants: `revoke all from public, anon; grant execute to authenticated;`.
   * Rollback restores this exact body without the `BANK_TRANSFER_V1` fence.
2. **`commerce_notify_order_status_change`**:
   * Defined in: `supabase/migrations/20260929100000_feature_014_notifications_lifecycle.sql` (lines 103-154).
   * Attached to: `trg_notify_order_status_change` on `public.orders AFTER UPDATE OF status FOR EACH ROW`.
   * Pre-016 events: `PROFORMA_ISSUED`, `HOLD`, `EXPIRED`.
   * Rollback restores this exact body without Feature 016 branches.
3. **`validate_order_transition`**:
   * Defined in: `supabase/migrations/20260930110000_feature_015_fence_legacy_submit_payment_proof.sql` (lines 74-154).
   * Baseline already permits `PAYMENT_PROOF_SUBMITTED` → `PAID` and `PAYMENT_REJECTED` under `is_internal_transition()`.
4. **`inventory_positions` logical uniqueness**:
   * Baseline is an unnamed ordinary unique constraint over `(lot_id, owner_organization_id, warehouse_id, warehouse_location_id)` in `supabase/trading_schema.sql`; its generated physical name is intentionally discovered from `pg_constraint` by the migration rather than guessed.
   * Feature 016 replaces it with named `uq_inventory_positions_null_safe`; rollback drops that named constraint and restores the ordinary baseline key without modifying duplicate data.
5. **Review RPC Cleanup**:
   * `DROP FUNCTION IF EXISTS public.finance_review_bank_transfer_v1(uuid, uuid, text, text, uuid);`.

---

## 13. Decision 12: Dedicated Feature 016 Live Test Harness (MEDIUM 3)

### Approved Environment Gate and Independent Harness
* Gate: `F016_REMOTE_LIVE_DB_APPROVED=1`, with target identity `mxejnutukgxyccnohglo` asserted before execution.
* Refactor `scripts/pg-simple-exec.mjs#execute` so its reusable direct PostgreSQL gate accepts the caller-selected single feature approval; the F016 caller requires F016 approval and does **not** require `F013_LIVE` or `F015_REMOTE_LIVE_DB_APPROVED`.
* Refactor `scripts/f013-local-target.ts#supabaseCli` to pass the selected feature gate rather than hard-coding Feature 013/015 assumptions; add a Feature 016 helper/caller used by `tests/finance/f016-live-db.test.ts`. Existing F013/F015 gates retain their own explicit behavior.
* Bounded SQL timeouts remain enforced (30 seconds per query/transaction in the F016 harness; the reusable executor retains its 180-second process cap). Credentials are environment-only and never printed in argv or logs.

### 29 Live Verification Scenarios
1. Confirm happy path
2. Reject happy path
3. Confirm vs Confirm race
4. Reject vs Reject race
5. Confirm vs Reject with overlapping transactions
6. Same-key replay returns identical payload
7. Same-key opposite decision conflict (`request_id_conflict`)
8. Different-key same terminal decision replay (idempotent read)
9. Different-key opposite terminal conflict (`decision_conflict`)
10. Full seller→buyer inventory conservation ($\Delta\text{seller} + \Delta\text{buyer} = 0$)
11. Simultaneous buyer-position creation with `warehouse_location_id IS NULL`
12. Multi-fulfillment-group shipment membership (`pii.fulfillment_group_id = v_group.id`)
13. No duplicate shipments per group
14. Tax invoice exact-once issuance
15. No tax invoice on reject
16. Title transfer ownership exact-once issuance
17. No ownership events on reject
18. Single `PAYMENT_PROOF_SUBMITTED` notification emitted on commit
19. `PAYMENT_CONFIRMED` and `PAYMENT_REJECTED` notifications emitted to buyer
20. `DELIVERY_HANDOFF_REQUESTED` notification emitted to warehouse
21. Injected failure during CONFIRM rolls entire transaction back
22. Injected failure during REJECT rolls entire transaction back
23. Symmetrical rollback script restores pre-016 state cleanly
24. Reapply migration cleanly passes postflight
25. Read-only postflight verification succeeds
26. Same `request_id` + different `payment_id`: `request_id_conflict`, zero mutation
27. Missing or corrupt `payment_reviews` row during same-key replay: `persisted_review_integrity_error` (or deterministic integrity failure), never raw cached success
28. Corrupt terminal CONFIRMED replay artifacts: individually probe missing/inconsistent tax invoice, ownership event(s), and FULFILLMENT shipment(s); each fails integrity and never returns truthful success
29. Fixture cleanup of test records
