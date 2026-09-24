# Contract — RLS, grants and storage

Legend:
- **B** = active member of the order's buyer organization (`is_order_buyer_member(order_id)`: not blocked, membership active).
- **S** = active member of a seller organization owning the row's line or group (`is_order_line_seller` / group seller).
- **F** = `is_finance_operator()` (FINANCE, ADMIN, SUPER_ADMIN).
- **W** = `is_warehouse_operator()`.
- **A** = `is_auditor()`.
- **PA** = `is_platform_admin()`.

The existing restrictive `mfa_gate_*` pattern (Feature 003) is added as a RESTRICTIVE `SELECT` policy on every table
below that holds buyer, seller or finance data. An MFA-enrolled session that has not reached `aal2` reads nothing.

## 1. Table policies after migration M3 (replacements of C2)

| Table | SELECT | INSERT/UPDATE/DELETE (client) |
|---|---|---|
| `orders` | unchanged: `can_view_order(id)`. The header has no money; sellers keep status visibility for their own lines. | unchanged buyer DRAFT insert/update; status changes only via RPC/trigger |
| `order_items` | B (all lines) ∨ S (**own lines only**, `seller_organization_id` membership) ∨ F ∨ PA | unchanged (buyer DRAFT insert; update/remove via existing RPCs) |
| `order_financials` | B ∨ F ∨ A ∨ PA. **Sellers removed.** | none (RPC only) |
| `proforma_invoices` | B ∨ F ∨ PA. Sellers and auditors removed; auditors use `v_audit_proformas`. | none |
| `proforma_invoice_items` | B ∨ S (own lines) ∨ F ∨ PA | none |
| `proforma_line_economics` | S (own lines) ∨ F ∨ PA. **Buyers excluded** (commission-neutral buyer view, UX-003). | none |
| `proforma_fulfillment_groups` | B ∨ S (own group) ∨ F ∨ W ∨ PA | none |
| `proforma_seller_settlements` | S (own org) ∨ F ∨ PA | none |
| `proforma_bank_instructions` | B ∨ F. No PA or auditor bypass except through F (ADMIN is already F). | none |
| `payments` | B ∨ F ∨ PA; auditors via `v_audit_payments` | none |
| `payment_proofs` | B ∨ F. **Sellers, warehouse, auditors excluded** (RLS-004/006/007). | none (RPC) |
| `payment_reviews` | F. `payment_reviews_finance FOR ALL` → SELECT-only; writes via RPC. | none |
| `reconciliation_cases`, `reconciliation_case_events` | F ∨ PA; B may read cases linked to its own order (status/kind/resolution only via `v_buyer_reconciliation`). | none |
| `manual_financial_adjustments` | F ∨ PA ∨ A | none |
| `tax_invoices` | B ∨ F ∨ PA. `tax_invoice_finance FOR ALL` → SELECT; writes via RPC. | none |
| `payouts` | S (own org) ∨ F ∨ PA. `payouts_finance FOR ALL` → SELECT; writes via RPC (C6). | none |
| `inventory_reservations` | unchanged (PA only); members see reservation state through `orders.hold_expires_at` | none |
| `order_shipments` (FULFILLMENT) | B ∨ S (`fulfillment_seller_organization_id`) ∨ W ∨ F. LEGACY rows keep `shipments_view`. | W via existing warehouse policies; buyer insert/update policies dropped after cutover |
| `shipment_items` | follows its shipment | existing warehouse rules |
| `delivery_destinations` | members of the owning org ∨ PA | none (RPC) |
| `promotions`, `promotion_targets` | platform scope: authorized members see `ACTIVE` in-window platform promotions without code values; SELLER scope: own org ∨ PA. Code values are visible only to the creating scope and PA. | none (RPC) |
| `offer_price_tiers` | authorized members for published/visible offers (same predicate as `member_read_published_offers`) ∨ seller own ∨ PA. **Never anon** (RLS-001/002, AC-014). | none (RPC) |
| `notification_events` | none (F ∨ PA via the admin outbox view only) | none |
| `notifications` | own user ∨ PA (existing `notifications_own`) | none; read state via RPC |
| `notification_deliveries` | existing (own via notification ∨ PA) | none |
| `notification_campaigns`, `_recipients` | PA | none (RPC) |
| `commerce_settings` | PA ∨ F (read) | none (RPC) |
| `commerce_request_log` | none | none |

Every new table: `ENABLE` + `FORCE ROW LEVEL SECURITY`; `REVOKE ALL ON ... FROM public, anon, authenticated`;
`GRANT SELECT ... TO authenticated` only where a SELECT policy exists; **no** INSERT/UPDATE/DELETE grant to
`authenticated`. `service_role` keeps default privileges only where a worker needs them (outbox/deliveries); snapshot
and ledger tables revoke even `service_role` writes (the `payment_transfers` precedent).

## 2. Views for redacted readers

| View | Audience | Columns |
|---|---|---|
| `v_audit_payments` | A | payment id, order code, status, expected/observed amount, currency, confirmed/rejected at/by, bank reference **masked** (last 4) |
| `v_audit_proformas` | A | proforma code, version, status, totals, `bank_account_masked`, issued/confirmed/expired at |
| `v_buyer_reconciliation` | B | case code, kind, status, resolution_type, opened/resolved at (no finance notes) |
| `v_finance_review_queue` | F | order code, buyer display name, buyer total, currency, proof submitted at, reservation `expires_at`/`REVIEW_HOLD`, days in review, reconciliation flag |
| `v_seller_order_lines` | S | order code, status, own lines, own economics (from `proforma_line_economics`), own group shipment status, own payout status |

Views are `security_invoker = true` over tables whose policies already restrict rows. Each view also filters on its
audience predicate, so a wrong-role read returns zero rows (no error, no existence leak — SC-005).

## 3. Storage

| Bucket | Public | Limit / types | INSERT | SELECT | UPDATE/DELETE |
|---|---|---|---|---|---|
| `payment-proofs` (NEW, M5) | false | 10 MB; pdf/jpeg/png | `payment_proof_object_authorized(name, true)`: path `org/{org}/order/{order}/payment/{payment}/…`; caller B of that org, can-buy, MFA; order `HOLD` with an `ACTIVE`, unexpired reservation **or** order `EXPIRED` (late report) | `payment_proof_object_authorized(name, false)`: B of that org or F | none for anyone (retained evidence) |
| `finance-documents` (NEW, M5) | false | 20 MB; pdf | F + MFA, path `invoice/{invoice_id}/…` | F; buyers only via server-minted signed URL after `authorize_final_invoice_access()` | none |
| `kyb-evidence`, `listing-media`, `public-assets` | unchanged | | | | |

Signed URLs are minted **server-side only**, after the authorization RPC succeeds. TTL is 60 s. They are never cached,
logged or placed in HTML beyond the single response (SEC-005/SEC-006). Object paths never reach the browser.

## 4. Function grants summary
- `authenticated`: member RPCs, finance RPCs and admin/seller RPCs as listed in [database-rpc.md](./database-rpc.md). Each re-checks role internally.
- `service_role` only (pg_cron): `sweep_expired_reservations`, `process_notification_events`, `dispatch_due_campaigns`, `claim_notification_deliveries`, `complete_notification_delivery`.
- `authenticated` admin wrappers with internal `is_platform_admin() ∧ mfa_satisfied()`: `admin_process_outbox_now`, `admin_dispatch_due_campaigns_now`, `admin_convert_legacy_draft`. No application runtime module holds a service-role client (analysis H2/M6).
- Nobody: `compute_order_quote`, `emit_notification_event`, `apply_delivery_reservation`, `reserve_ready_deliveries_for_settlement` (unchanged: internal).
- `anon`: **nothing new**. AC-014 is proven by the anon-key probe suite (R-28).
