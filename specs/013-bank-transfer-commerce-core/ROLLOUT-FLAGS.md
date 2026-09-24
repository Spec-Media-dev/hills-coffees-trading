# Feature 013 — Rollout flags and kill switches (T013)

**Status**: DEFINED (Batch A, 2026-09-24). The flags live in the singleton `commerce_settings` row created by
migration M1 (data-model §1.1) and are edited only through `update_commerce_settings()` (M4a; platform admin + MFA,
audited). No flag exists in production until M1 is reviewed and applied. Nothing in Batch A reads or writes them.

| Flag | Type / default | Owner (who may flip) | Effect when ON | Effect when OFF | Audit |
|---|---|---|---|---|---|
| `bank_transfer_checkout_enabled` | bool, **false** | Platform admin + MFA, **only in T235** (production activation) after the business sign-offs | Any authorized buyer may issue a proforma | `issue_proforma()` refuses with `checkout_disabled`, except for `pilot_organization_ids` | Old/new value, actor, time, reason (`update_commerce_settings`) |
| `pilot_organization_ids` | uuid[], **empty** | Platform admin + MFA (OPERATOR in T103/T155) | Listed buyer organizations may issue proformas while the global flag is off (fixture/pilot proofs, Batches C–E) | — | Same |
| `proof_submission_enabled` | bool, **true** | Platform admin + MFA | Buyers may submit proof for an `ACTIVE` reservation | `submit_payment_proof()` refuses; reservations still expire normally from timestamps | Same |
| `proforma_validity_hours` | int 1–720, **24** | Platform admin + MFA | Frozen onto each proforma at issuance (`valid_until = issued_at + hours`) | — | Same; issued deadlines never change |

The 20-minute reservation window is a locked product rule, not a flag.

## Flip procedures
1. **Pilot proofs (Batches C–E)**: OPERATOR adds only the Feature 013 fixture buyer organizations (`13000000-…-000000000001/2`) to `pilot_organization_ids`. The global flag stays **false**.
2. **Production activation (T235 only)**: after T234 closure and the recorded finance/tax/legal, real-bank-data, warehouse-reconciliation and backup sign-offs:
   1. verify the F013 fixture configuration rows are inactive or archived (fake payment account, fixture shipping rule, fixture commission policy);
   2. verify a real default USD account, a real shipping rule and a real commission policy exist;
   3. set `bank_transfer_checkout_enabled = true`;
   4. clear `pilot_organization_ids`.
3. **Emergency stop**: set `bank_transfer_checkout_enabled = false` (and, if needed, `proof_submission_enabled = false`). No issued proforma, reservation or payment is altered. Open reservations still expire from their timestamps. Finance review, settlement and fulfillment of already-submitted payments continue.

## Rollback meaning (MIG-006)
Once real financial rows exist, rollback is **application disablement through these flags plus corrective forward
migrations**, never destructive restoration. `admin_void_order()` releases un-paid reservations exactly once; paid
orders continue through fulfillment and payout unchanged.

## Batch A production facts that shape activation (from PREFLIGHT-REPORT.md)
- No shipping rule, commission policy or payment account exists in production today. FR-042 therefore fails every checkout closed until real configuration is entered (T105 and the existing Feature 010 admin pages).
- The only tax rule is AE VAT 5 %, `MERCHANDISE_ONLY`, active.
