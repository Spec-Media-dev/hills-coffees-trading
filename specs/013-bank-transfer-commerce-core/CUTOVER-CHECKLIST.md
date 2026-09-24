# Feature 013 — Production backup and cutover checklist (T014)

**Status**: PREPARED (Batch A, 2026-09-24). Each box is ticked only with recorded evidence (date, operator, output
reference). Linked project: `hillscoffees-trading` (ref `mxejnutukgxyccnohglo`).

## A. Before every production apply (MP-5), for each migration M1…M9
- [ ] Backup confirmed. Supabase PITR is enabled, or a fresh manual backup was taken; record the backup id/time.
- [ ] The MP-4 review verdict **GO** is recorded in tasks.md under the task (reviewer, date).
- [ ] The MP-3 dry-run shows exactly this one pending migration.
- [ ] Project identity re-verified (dashboard project name + ref).
- [ ] No other process (live test suites, other agents or sessions) is writing to production during the apply window. Batch A preflight observed external writes during the inventory window: new fixture drafts at 11:27–11:33 UTC on 2026-09-24, and two HOLD orders removed.
- [ ] Apply: `supabase db push --linked` (one migration only).
- [ ] Postflight run; output `ALL CHECKS PASSED` recorded.
- [ ] MP-6 live proof recorded.
- [ ] If the postflight fails: stop, run the paired rollback **only if no Feature 013 financial row exists yet**; otherwise disable via ROLLOUT-FLAGS and write a corrective forward migration.

## B. Migration apply order
M1 → M2a → M2b → M2c → M2d → M2e → M3 → M4a → M4b → M4c → M5a → M5b → M5c → (drain) → M6 → M7 → (pg_cron enabled) →
M7b → M8 → M9. No migration is applied out of order or in parallel.

## C. Legacy drain (T147, before M6)
Operator SQL (authoritative, 2026-09-24): **1,919 non-terminal legacy orders**: 1,819 DRAFT (1,174 with a shipment plan, 645 plan-free), 99 CONFIRMED, 1 PAID; no HOLD. Earlier agent snapshot: **1,909 non-terminal legacy orders, all belonging to three test-fixture
organizations** ("Foundation Test — Buyer And Seller": 1,758 DRAFT / 98 CONFIRMED / 2 HOLD / 1 PAID; "Foundation
Test — Buyer Only": 49 DRAFT; "Foundation Test — Blocked Member": 1 DRAFT). **No real-customer order exists.**
- [ ] Re-run the preflight at drain time (counts change as live suites run).
- [ ] `CONFIRMED` → `DRAFT` by an audited admin action (no reservation exists).
- [ ] Plan-free `DRAFT` → `admin_convert_legacy_draft` (M4a); `DRAFT` with a buyer shipment plan → `admin_void_order` (fixture organizations only; no buyer notice needed for fixtures, but the audit row is required).
- [ ] Any `HOLD` present at drain time → `expire_order_hold`. The two HOLD orders seen in the 11:00 UTC snapshot no longer exist per the operator SQL and a later read-only lookup.
- [ ] The `PAID` fixture order (`F006-FIX-SETTLED-B`) is recorded as retained fixture evidence. If it blocks M6's guard, it is completed through the legacy fulfillment path or explicitly listed for review. It is **never deleted**.
- [ ] The read-only count of non-terminal `LEGACY` orders is 0.
- [ ] Legacy live test suites set `commerce_flow = 'LEGACY'` explicitly (from M4a) and are retired or updated at M6.

## D. pg_cron (before M7b)
- [ ] OPERATOR enables the `pg_cron` extension (Supabase dashboard → Database → Extensions). Preflight §10 reports whether it is already present.
- [ ] After M7b: `cron.job` lists `f013_sweep_reservations`, `f013_process_outbox`, `f013_dispatch_campaigns`, `f013_purge_request_log`.

## E. Kill-switch sequence
- [ ] Global `bank_transfer_checkout_enabled` stays **false** through Batches B–I.
- [ ] Pilot proofs use `pilot_organization_ids` = Feature 013 fixture buyer organizations only.
- [ ] Emergency stop procedure rehearsed (flag off; verify `checkout_disabled`).

## F. Stripe decommission precondition (Phase 7)
- [ ] T157 cutover gate passed.
- [ ] Preflight: zero non-terminal `PROVIDER` payments. Batch A: **0 provider payments, 0 `payment_events`, 0 `payment_transfers`**.
- [ ] OPERATOR `supabase functions list` recorded before and after undeploy.
- [ ] OPERATOR secret names recorded (no values).

## G. Production activation (T235) sign-offs
- [ ] Finance/tax/legal: VAT basis (currently AE 5 % `MERCHANDISE_ONLY`), export treatment, final-invoice legal content and issuer.
- [ ] Real Hills USD receiving account entered and verified (Batch A: **no payment account exists**).
- [ ] Real shipping rule(s) (Batch A: **none**) and commission policy (Batch A: **none**) configured.
- [ ] F013 fixture configuration rows inactive or archived.
- [ ] Warehouse reconciliation complete.
- [ ] Backup/restore readiness confirmed.
- [ ] Business owner, finance and operator signatures recorded.

## Sign-off lines
| Role | Name | Date | Scope |
|---|---|---|---|
| Database/security reviewer | | | per migration (MP-4) |
| Finance owner | | | T080, T120, T155, T235 |
| Operator | | | MP-5 applies, drain, pg_cron, Stripe undeploy |
