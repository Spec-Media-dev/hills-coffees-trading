# Feature 016 — Developer & Verification Quickstart (Final Planning Correction Pass)

**Feature**: Feature 016 — Finance Confirmation & Delivery Handoff  
**Date**: 2026-10-01  
**Status**: Revised (All Codex Findings Addressed)  
**Environment**: Next.js 16.3.4, Zod 4.5.4, React 19.2.8, PostgreSQL 15+  
**Target Database**: `mxejnutukgxyccnohglo`  

---

## 1. Prerequisites & Dedicated Verification Harness (MEDIUM 3)

* Node.js v20+ with npm dependencies installed.
* Valid `.env.local` configured with Supabase connection strings:
  * `NEXT_PUBLIC_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  * `SUPABASE_SERVICE_ROLE_KEY`
  * `DATABASE_URL` (direct or pooled transaction connection)
* **Windows TLS Certificate**:
  When executing direct Node scripts to Supabase poolers on Windows:
  ```powershell
  $env:NODE_EXTRA_CA_CERTS = "supabase\.temp\supabase-root-ca.pem"
  ```
* **Dedicated Remote Verification Gate (MEDIUM 3)**:
  Set the dedicated Feature 016 gate environment variable before running live remote verification suites:
  ```powershell
  $env:F016_REMOTE_LIVE_DB_APPROVED = "1"
  ```
  *(The planned F016 caller supplies this to the refactored reusable executor. It requires neither `F013_LIVE` nor `F015_REMOTE_LIVE_DB_APPROVED`; do not set either to run F016. It asserts target project `mxejnutukgxyccnohglo`, enforces a 30s F016 SQL timeout and the executor's 180s process cap, and emits no secrets into argv/logs.)*

---

## 2. Test Execution Commands

### Unit, Contract & Schema Tests
Run vitest test suites covering Feature 016 Zod schemas, DAL, actions, and fences:
```bash
npx vitest run tests/finance/
npx vitest run tests/commerce/
```

### Live Database & Concurrency Verification
Execute integration tests verifying the atomic review RPC, replay integrity, inventory conservation, null-safe buyer position identity, and deadlock-free execution. In the same PowerShell session set only the Feature 016 gate plus the executor's connection variables (`PGHOST`, `PGUSER`, `SUPABASE_DB_PASSWORD`; the runner constructs its configured pooler connection):
```powershell
$env:F016_REMOTE_LIVE_DB_APPROVED = "1"
Remove-Item Env:F013_LIVE -ErrorAction SilentlyContinue
Remove-Item Env:F015_REMOTE_LIVE_DB_APPROVED -ErrorAction SilentlyContinue
npx vitest run tests/finance/f016-live-db.test.ts
```

### Migration Postflight Verification
Verify that the database migration and rollback scripts maintain complete schema integrity:
```powershell
$env:F016_REMOTE_LIVE_DB_APPROVED = "1"
node scripts/pg-simple-exec.mjs supabase/maintenance/20261002_feature_016_review_postflight.sql
```

---

## 3. Mandatory 29-Point Live Verification Checklist

1. [ ] **Confirm Happy Path**: Order in `PAYMENT_PROOF_SUBMITTED` transitions to `PAID`, payment to `CONFIRMED`, reservation to `CONSUMED`, exact finalized proof to `ACCEPTED`.
2. [ ] **Reject Happy Path**: Order transitions to `PAYMENT_REJECTED`, payment to `REJECTED`, reservation to `RELEASED`, exact finalized proof to `REJECTED`.
3. [ ] **Confirm vs Confirm Concurrency**: Concurrent confirmations on the same order result in exactly one commit and one idempotent return without double-crediting.
4. [ ] **Reject vs Reject Concurrency**: Concurrent rejections on the same order result in exactly one release and one idempotent return without double-releasing.
5. [ ] **Confirm vs Reject Overlap**: Concurrent conflicting decisions execute serially; the winner finalizes the order and the loser receives `order_already_finalized` / `decision_conflict`.
6. [ ] **Same-Key Same-Payment Same-Decision Replay**: Replaying the exact `request_id`, `payment_id`, and decision validates the matching persisted `payment_reviews` row and returns the identical reconstructed payload.
7. [ ] **Same-Key Same-Payment Opposite-Decision Conflict**: Replaying the same `request_id` and payment with an opposite decision throws `request_id_conflict` with zero mutation.
8. [ ] **Different-Key Same Terminal Decision Replay**: Submitting a new `request_id` on an already finalized order with the same payment/decision validates and reconstructs from the original persisted review without mutation and without inserting a second review.
9. [ ] **Different-Key Opposite Terminal Conflict**: Submitting a new `request_id` with an opposite terminal decision throws `decision_conflict` / `order_already_finalized` with zero mutation.
10. [ ] **Full Inventory Conservation (Signed Equations)**: For each item with quantity $q$: $\Delta\text{seller\_available} = -q, \Delta\text{seller\_reserved} = -q, \Delta\text{buyer\_available} = +q$. Total on-hand balance $\Delta\text{seller} + \Delta\text{buyer} = 0$.
11. [ ] **Simultaneous Buyer Position Creation (NULL Location)**: Concurrent purchases crediting a buyer position with `warehouse_location_id IS NULL` yield exactly ONE row via `UNIQUE NULLS NOT DISTINCT` with aggregated quantity.
12. [ ] **Multi-Fulfillment-Group Shipment Membership**: For orders spanning multiple fulfillment groups, each created `order_shipments` record attaches ONLY line items belonging to that group (`pii.fulfillment_group_id = v_group.id`).
13. [ ] **No Duplicate Shipments**: Verified via `uq_order_shipment_fulfillment_group` index; exactly one FULFILLMENT shipment created per group.
14. [ ] **Tax Invoice Exact-Once**: Invoice code issued sequentially (`INV-...`); frozen snapshot excludes bank details; exactly one row created per confirmed order.
15. [ ] **No Invoice on Reject**: Verified that zero `tax_invoices` records are inserted when payment is rejected.
16. [ ] **Ownership Exact-Once**: `inventory_ownership_events` records `SALE`/`RESALE` with reason `'SETTLEMENT_CONFIRMED'` for all consumed items on confirm.
17. [ ] **No Ownership on Reject**: Verified zero ownership transfer events created on reject.
18. [ ] **Pending-Review Notification (Single Owner)**: Emitted SOLELY by database trigger `trg_notify_order_status_change` upon committed transition into `PAYMENT_PROOF_SUBMITTED`.
19. [ ] **Confirmed/Rejected Buyer Notifications**: Emitted by database trigger to buyer organization upon `PAID` or `PAYMENT_REJECTED`.
20. [ ] **Warehouse Handoff Notification**: Feature 016's `trg_notify_shipment_status_change` (not a Server Action) emits one `DELIVERY_HANDOFF_REQUESTED` per active `organization_members` recipient of `warehouses.owner_organization_id` for a FULFILLMENT `DRAFT` → `REQUESTED`, with per-recipient dedupe.
21. [ ] **Injected Failure During CONFIRM**: Simulated failure during shipment or invoice insertion rolls back the entire transaction, leaving stock and order unchanged.
22. [ ] **Injected Failure During REJECT**: Simulated failure rolls back reservation release, keeping order in `PAYMENT_PROOF_SUBMITTED`.
23. [ ] **Symmetrical Rollback Verification**: Rollback restores the complete Feature 008 September 22 `admin_review_payment` body and ACLs, including `trusted_funding_required`, restores the Feature 014 order notifier, leaves the unmodified Feature 015 fence intact, removes the Feature 016 shipment notifier/RPC, and restores the ordinary inventory-position uniqueness after dropping `uq_inventory_positions_null_safe`.
24. [ ] **Reapply Migration**: Forward migration reapplies cleanly after rollback without schema or constraint conflicts.
25. [ ] **Postflight Verification**: Read-only postflight script validates all signatures, `SECURITY DEFINER`, grants, triggers, fences, and the preserved September 22 provider-funding gate.
26. [ ] **Same-Key Different-Payment Conflict**: Reusing the same `request_id` with a different `payment_id` returns `request_id_conflict` and performs zero mutation.
27. [ ] **Missing/Corrupt Same-Key Review**: Removing or corrupting the matching `payment_reviews` row yields `persisted_review_integrity_error` (or deterministic integrity failure), never raw cached success.
28. [ ] **Corrupt CONFIRMED Terminal Artifacts**: Individually remove or make inconsistent the tax invoice, ownership event(s), and FULFILLMENT shipment(s); every replay fails integrity and never returns truthful success.
29. [ ] **Fixture Cleanup**: All test orders, reservations, positions, and shipments are cleanly pruned from the remote database.
