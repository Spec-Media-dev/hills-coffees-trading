# Data Model: Production Closure & Stripe Runtime Retirement

Feature 017 introduces no table, column, policy, or business-state model. It changes active execution grants only and preserves historical data.

## Affected Existing Entities

| Entity | Feature 017 treatment | Invariant |
|---|---|---|
| `payments` | Preserve rows and provider-related columns. | No historical payment row is deleted, reconciled, or reclassified by retirement. |
| `payment_events` | Preserve rows and schema. | Historical provider-event evidence remains intact; no retired ingest operation is executable by an application role. |
| `payment_transfers` | Preserve rows and schema. | Historical transfer evidence remains intact; no retired transfer-recording operation is executable by an application role. |
| `proforma_invoices`, `tax_invoices`, `payouts` | Preserve. | Existing financial documents and accounting records are not changed. |
| `payment_proofs`, upload intents, private Storage | Preserve active behavior. | Feature 015 privacy and binding rules remain unchanged. |
| `inventory_reservations`, `inventory_positions`, ownership events, storage allocations | Preserve active behavior. | No retirement action changes quantities, reservation lifecycle, or title/ownership history. |
| `orders`, `order_shipments`, shipment items, destination snapshots | Preserve active behavior. | Feature 009/016 fulfillment and delivery handoff remain unchanged. |
| audit/history/notification records | Preserve. | Retirement does not delete or rewrite audit, status, or notification evidence. |

## Retained Database Function Definitions

These definitions remain in the database for historical compatibility but become operationally retired:

| Signature | Forward state | Required preserved property |
|---|---|---|
| `admin_review_payment(uuid,boolean,text)` | No EXECUTE for PUBLIC, anon, authenticated, or service_role. | Definition, owner, `SECURITY DEFINER`, and fixed search path remain. |
| `record_stripe_payment_intent(uuid,text,text)` | No EXECUTE for PUBLIC, anon, authenticated, or service_role. | Definition and owner remain. |
| `record_payment_transfer(uuid,text,text,text)` | No EXECUTE for PUBLIC, anon, authenticated, or service_role. | Definition and owner remain. |
| `ingest_stripe_event(text,text,text,uuid,jsonb,boolean)` | No EXECUTE for PUBLIC, anon, authenticated, or service_role. | Definition and owner remain. |

## Compatibility Function Set

The following are not retirement targets and must retain their established signatures, grants, authorization, and behavior:

- `checkout_bank_transfer_v1`
- `issue_proforma`
- `confirm_proforma`
- `prepare_payment_proof_upload`
- `finalize_payment_proof`
- `finance_review_bank_transfer_v1`
- `checkout_order` (legacy compatibility)
- `submit_payment_proof` (Feature 015-fenced legacy compatibility)

## State and Data Invariants

1. Provider/Stripe absence preflight is a gate, not a data migration: any provider/non-bank state, trusted-funding evidence, provider event/transfer, or reviewable legacy/provider state aborts retirement.
2. ACL retirement changes no payment, order, proof, inventory, fulfillment, notification, invoice, ownership, or historical record state.
3. Database rollback restores only the captured pre-Feature-017 execution grants; it does not restore product source, package dependencies, deployment secrets, or Edge deployment.
4. Existing RLS, SECURITY DEFINER, search-path, blocked-user, finance-role, MFA, and cross-tenant boundaries remain unchanged except for additional denial of retired execution.
