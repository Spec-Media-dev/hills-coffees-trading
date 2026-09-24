---
description: "Implementation tasks for Feature 013 — Bank Transfer Commerce Core"
---

# Tasks: Bank Transfer Commerce Core (013)

**Input**:
- [spec.md](./spec.md) (clarified 2026-09-24; FIN-011/012/013)
- [plan.md](./plan.md)
- [research.md](./research.md) (C1–C16, R-1–R-28)
- [data-model.md](./data-model.md)
- [quickstart.md](./quickstart.md)
- [contracts/](./contracts/)

**Status**: NOT STARTED — 0 / 236 (234 original + T124a + T235 from the /speckit-analyze corrections of 2026-09-24). Planning artifacts only; nothing implemented, no migration created or applied.

**Tests**: REQUIRED. The spec's acceptance criteria, SC-002/SC-006 contention runs, and Constitution "Engineering Standards → Testing" demand them.
- Live database tests are gated by `F013_LIVE=1` and use only disposable `f013` fixtures.
- Vitest runs in batches (a full run OOMs on this machine).

## Format

`- [ ] T### [P?] [US#?] Objective — files`, followed by indented fields:
- **Depends**: tasks that must be complete first.
- **Files**: exact files or file groups.
- **Accept**: the observable completion condition.
- **Tests**: tests that must exist and pass.
- **Gate**: migration, live, operator or review gate, where relevant.

Markers:
- **[P]**: parallel-safe (different files, no incomplete dependency, and **no shared migration, function or security boundary**).
- **[US#]**: user story from spec.md, used on Phase 3–7 tasks:
  - US1: buyer commit
  - US2: proof
  - US3: finance review
  - US4: fulfillment
  - US5: payouts
  - US6: admin rules and communications
  - US7: private marketplace
  - US8: Stripe retirement
- Phases 1, 2 and 8 are cross-cutting and carry no story label.
- **OPERATOR**: must be performed by a human with Supabase/hosting access. An agent prepares the command and verifies the result read-only.
- **GATE**: a stop point; work after it may not start until the named approval is recorded in this file.

MP-3 to MP-6 tasks operate on the migration, rollback and postflight files authored by their group's MP-1 task. Their
evidence (dry-run output, review verdict, apply and postflight output) is recorded under the task in this file.

A task is complete only when its **Accept** and **Tests** have actually been verified (Constitution XV).

## Migration protocol (applies to every migration group below)

Every Feature 013 database change is its **own forward migration** and goes through six tasks, in order, never in
parallel with another task on the same migration:

| Step | Task | Content |
|---|---|---|
| MP-1 | **Author** | `supabase/migrations/<version>_<name>.sql` with a `do $guard$` block that aborts on baseline drift or unmappable legacy rows (plan §4). Paired `supabase/rollback/<version>_<name>.rollback.sql` restoring exact previous text (from the preflight capture). Read-only `supabase/maintenance/<date>_<name>_postflight.sql`. Never edits any previously applied migration, rollback or postflight file. |
| MP-2 | **Static security tests** | `tests/commerce/migrations/<name>.test.ts` pins: guard present; RLS enabled + forced on new tables; no `anon` grant; no `authenticated` table write grant; every SECURITY DEFINER function has a pinned `search_path` and exact EXECUTE list; no policy/trigger change on the six Feature 010 configuration tables; file name free of `commission`/`payment_accounts`/`platform_admins`/`run_f`/`feature_010`; rollback/postflight paired; no DML against financial rows. |
| MP-3 | **Supabase dry-run** | `supabase db push --linked --dry-run` output recorded (read-only; lists exactly one pending migration), plus a local shadow apply via `supabase db reset` on a local stack when available. |
| MP-4 | **GATE — manual review** | A human database/security review of the migration, rollback and postflight. The verdict (GO/NO-GO, reviewer, date) is recorded in this file under the task. |
| MP-5 | **GATE — OPERATOR production apply** | `supabase db push --linked` for this migration only; then the postflight must report `ALL CHECKS PASSED`; output recorded (no secrets). Requires the MP-4 GO and the batch's backup confirmation (T014). |
| MP-6 | **Live proof** | The named `F013_LIVE=1` suites + the existing regression batches pass against the linked project; results recorded. |

Migration inventory: 18 forward migrations. Versions are placeholders and must be after `20260924120000`, strictly
ascending. This refines plan §4 by splitting M2, M4 and M5 into independently reviewable files; the content is unchanged.

| ID | Placeholder file | Phase | Content |
|---|---|---|---|
| M1 | `20260925100000_feature_013_commerce_state_vocabulary.sql` | 2 | Status vocabulary, `commerce_flow`, `commerce_settings`, `commerce_request_log`, reservation/payment/proof/payout/review columns, open-reservation index, `payment_accounts.is_default_for_currency`, `offer_code`, `validate_order_transition` v2 |
| M2a | `20260925103000_feature_013_delivery_destinations.sql` | 2 | `delivery_destinations`, order destination columns |
| M2b | `20260925106000_feature_013_proforma_versioning_snapshots.sql` | 2 | Proforma versioning + header totals; extended items; line economics; fulfillment groups; seller settlements; bank instructions; `order_financials` ext; immutability/freeze triggers |
| M2c | `20260925109000_feature_013_finance_fulfillment_records.sql` | 2 | `reconciliation_cases`(+events), `manual_financial_adjustments`, `tax_invoices` ext, `order_shipments` fulfillment columns |
| M2d | `20260925112000_feature_013_pricing_inputs.sql` | 2 | `offer_price_tiers`, `promotions`, `promotion_targets` (tables and constraints only) |
| M2e | `20260925115000_feature_013_notification_outbox.sql` | 2 | `notification_events` + internal `emit_notification_event` |
| M3 | `20260925120000_feature_013_rls_realignment.sql` | 2 | Seller-leak fix and all policy/view/MFA-gate changes |
| M4a | `20260926100000_feature_013_cart_destination_rpcs.sql` | 3 | Cart, destination, settings, default-account RPCs |
| M4b | `20260926103000_feature_013_quote_and_proforma_issuance.sql` | 3 | `compute_order_quote`, `estimate_cart`, `issue_proforma` |
| M4c | `20260926106000_feature_013_reservation_confirmation.sql` | 3 | `confirm_proforma`, `cancel_order`, `expire_reservation`, `sweep_expired_reservations`, `admin_void_order` |
| M5a | `20260927100000_feature_013_payment_proof_storage.sql` | 4 | Buckets, storage helpers/policies, proof RPCs |
| M5b | `20260927103000_feature_013_finance_review_settlement.sql` | 4 | Finance confirm/reject, reconciliation, adjustments, invoice RPCs |
| M5c | `20260927106000_feature_013_fulfillment_completion_payouts.sql` | 4 | `sync_order_fulfillment`, `record_seller_payout` |
| M6 | `20260927110000_feature_013_legacy_checkout_retirement.sql` | 4 | Cutover: revoke legacy functions, drop buyer shipment-plan policies |
| M7 | `20260928100000_feature_013_notification_delivery.sql` | 5 | Fan-out, read state, campaigns, delivery claim/complete |
| M7b | `20260928110000_feature_013_scheduler_jobs.sql` | 5 | `pg_cron` jobs |
| M8 | `20260929100000_feature_013_promotions_tiers_search.sql` | 6 | Promotion/tier RPCs, scope trigger, `search_member_listings` |
| M9 | `20260930100000_feature_013_stripe_runtime_restriction.sql` | 7 | Revoke Stripe functions, restrict provider tables |


---

## PHASE 1 — PRE-FLIGHT / RECONCILIATION  (BATCH A)

**Goal**: a truthful, recorded baseline. **No production mutation.**

- [X] T001 Verify linked project identity and migration head — `specs/013-bank-transfer-commerce-core/PREFLIGHT-REPORT.md`
  - Depends: —
  - **Batch A (2026-09-24)**: identity VERIFIED (ref `mxejnutukgxyccnohglo` = `hillscoffees-trading` = env URL). `supabase migration list --linked` REFUSED (CLI account 403 on login-role endpoint). Remote object probes show `20260924120000` applied and no pending file. **Operator §0 (11:29:46 UTC): remote head `20260924120000` = local head; the top-10 versions match the local files exactly; no pending or Feature 013 migration.** Accept satisfied.
  - Accept:
    - `supabase/.temp/linked-project.json` ref = `NEXT_PUBLIC_SUPABASE_URL` ref (`hillscoffees-trading`);
    - `supabase migration list --linked` output recorded (Local vs Remote);
    - latest remote version identified;
    - no pending unapplied Feature 013 file exists.
  - Tests: none (read-only evidence).
  - Gate: read-only CLI only.

- [X] T002 Reconcile Tag Translation (Feature 010 T056) completion truth — `PREFLIGHT-REPORT.md`, `specs/010-admin-operations-console/tasks.md` (T056 line only, evidence-based)
  - Depends: T001
  - **Batch A**: **CLOSED 2026-09-24.** `20260924120000_tag_translations` is applied. The operator ran `20260924_tag_translations_postflight.sql`: **13/13 true** (recorded in PREFLIGHT-REPORT.md §T002). Feature 010 T056 was updated with this evidence; it stays open only for its live EN/AR tag proof, which the Phase 6 gate T197 depends on.
  - Accept:
    - It is recorded whether `20260924120000_tag_translations` is applied.
    - If applied, the operator's postflight output is attached and T056 is updated with evidence.
    - If not applied, T056 stays open and the Phase 6 gate (T197) is marked as depending on it.
  - Tests: existing `tests/admin/pre-stripe-hardening.test.tsx` passes.

- [X] T003 [P] Reconcile Feature 008 task truth and record supersession — `docs/architecture/IMPLEMENTATION-ROADMAP.md`, `PREFLIGHT-REPORT.md`
  - Depends: T001
  - Accept:
    - The roadmap 008 row states "payment runtime superseded by 013; 008 tasks NOT completed".
    - No file under `specs/008-*` is modified.
  - Tests: T015 (historical-file guard) passes.

- [X] T004 [P] Reconcile Feature 010 finance-area and Feature 012 notification truth — `docs/architecture/DATABASE-CAPABILITY-MAP.md`, `docs/architecture/IMPLEMENTATION-ROADMAP.md`
  - Depends: T001
  - Accept:
    - C1–C14 are recorded as DB-OPEN entries (owner: 013).
    - The 010 `payments/payouts/invoices` areas are recorded as "blocked → 013 Phase 4".
    - DB-BLOCK-04 is recorded as "→ 013 Phase 5".
  - Tests: none.

- [X] T005 Author the read-only commerce preflight — `supabase/maintenance/20260925_feature_013_preflight.sql`, `tests/commerce/preflight-readonly.test.ts`
  - Depends: T001
  - Accept: the script reports every R-21 item:
    - legacy order/reservation/payment/payout/proforma/tax-invoice counts by status;
    - multiple DRAFTs per organization; legacy buyer shipment plans;
    - provider rows (`PROVIDER` payments, `trusted_funding_*`, `payment_events`, `payment_transfers`);
    - `shipping_rules.delivery_method` values; active AE tax rules; active USD payment accounts;
    - commission tier coverage;
    - `pg_extension` has `pg_cron`;
    - function `prosrc` fingerprints and policy definitions for every object M1–M9 will touch (the capture used by the rollbacks).
  - Tests: the static test proves the file contains no DML/DDL (`insert|update|delete|alter|create|drop|grant|revoke|truncate`) outside comments.

- [X] T006 OPERATOR — run the preflight on production and record the output — `PREFLIGHT-REPORT.md`
  - Depends: T005
  - **Batch A**: **CLOSED 2026-09-24.** The operator ran every section §0–§10. Evidence is recorded in PREFLIGHT-REPORT.md, and the raw files `preflight-evidence/section5…section10*.csv` are verified. Notable: remote head = local head; C1 and C2 confirmed live; no provider rows; `pg_cron` not enabled (planned at T164); 0 anon table grants; DB-OPEN-C15 (anon EXECUTE on 2 helpers) recorded.
  - Accept: the full output is attached (ids truncated where not needed; no secrets or bank identifiers).
  - Gate: OPERATOR, read-only SQL editor.

- [X] T007 Inspect active Stripe/provider transactions — `PREFLIGHT-REPORT.md` §Provider
  - Depends: T006
  - **Batch A**: data verdict done read-only — 0 `PROVIDER` payments, 0 trusted-funding markers, 0 `payment_events`, 0 `payment_transfers`. **CLOSED 2026-09-24.** OPERATOR evidence: `supabase functions list` 0 rows (no `stripe-*` deployed); `supabase secrets list` 0 rows; Vercel env names contain no `STRIPE_*`. Verdict: no non-terminal provider transaction, so no drain is required; no Stripe Edge Functions, secrets or env vars are deployed. The three Stripe **PostgreSQL** functions (`ingest_stripe_event`, `record_stripe_payment_intent`, `record_payment_transfer`) are **still live** (§5) and are revoked by M9 (T206–T211). `TEST_FIXTURE_PASSWORD` in Vercel is left unchanged; it is verified and removed before T235 if no required test workflow depends on it. Recorded in PREFLIGHT-REPORT.md §T007.
  - Accept:
    - count and state of `PROVIDER` payments, provider events and transfers;
    - OPERATOR `supabase functions list` (which `stripe-*` functions are deployed);
    - OPERATOR confirmation of which `STRIPE_*` secrets exist (names only);
    - a verdict: "no non-terminal provider transaction" or an explicit drain list.
  - Gate: OPERATOR, read-only.

- [X] T008 Verify the Feature 009 settlement-hook regression (C1) — `PREFLIGHT-REPORT.md`, `docs/architecture/DATABASE-CAPABILITY-MAP.md`, `tests/delivery/settlement-seam-characterization.test.ts`
  - Depends: T006
  - **Batch A**: repository evidence + characterization test (3/3) + DB-OPEN-C1 recorded; live function not patched. **Operator §6 (2026-09-24): live `has_009_settlement_hook = false`, `has_008_trusted_funding_guard = true` → C1 CONFIRMED LIVE.** Accept satisfied; fix owner T117. The full live definition export (`preflight-evidence/section6-admin-review-payment-definition.csv`) is pending as T006 evidence.
  - Accept:
    - Live `admin_review_payment` `prosrc` is checked for `reserve_ready_deliveries_for_settlement`.
    - Result recorded as DB-OPEN-C1 with the fix owner = T117 (`finance_confirm_payment`, M5b).
    - A static characterization test documents the current body state.
    - The live function is **not** patched in Phase 1.
  - Tests: characterization test passes (documents current truth).

- [X] T009 Identify old-flow orders that must finish before cutover — `PREFLIGHT-REPORT.md` §Legacy drain
  - Depends: T006
  - Accept:
    - Every non-terminal legacy order is listed (`CONFIRMED`, `HOLD`, `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_UNDER_REVIEW`, `PAID`-but-unfulfilled) with its drain action: finish under the legacy functions, expire via `expire_order_hold`, or return `CONFIRMED` → `DRAFT` by an audited admin action.
    - Legacy `DRAFT` orders are listed separately: those with no non-`CANCELLED` shipment → convert via `admin_convert_legacy_draft` (M4a); those with a buyer shipment plan → void via `admin_void_order` with buyer notice.
    - The drain list feeds T014 and the M2b/M6 guards.
  - Tests: none.

- [X] T010 Fix the stale structural test `finance-delegation` (C15) — `tests/admin/finance-delegation.test.tsx`
  - Depends: —
  - Accept: allowlists exactly `set_platform_logo` and `remove_platform_logo` for `src/app/dashboard-admin/(system)/branding/` files only (the same rule as `run-f-static`). Finance/settlement assertions are unchanged.
  - Tests: the file passes; `tests/admin` batch green.

- [X] T011 [P] Fix the stale `error-mapping` copy collision (C15) — `tests/orders/error-mapping.test.ts` and/or `lib/app/copy/en.ts` (rename the account email `forbidden` copy key only)
  - Depends: —
  - Accept: the copy audit passes without weakening the forbidden-vocabulary rule. `lib/app/copy/ar.ts` parity is kept.
  - Tests: `tests/orders` batch green; copy parity tests green.

- [X] T012 [P] Record the COMMISSION-OPEN-01 resolution — `docs/database/commission-capability.md`
  - Depends: —
  - Accept: §8 records "resolved by Feature 013: FR-042 fail-closed; tier basis = each seller's own qualifying quantity (FIN-013)" without editing the verified behaviour sections.
  - Tests: none.

- [X] T013 [P] Define feature flags and the checkout kill switch — `specs/013-bank-transfer-commerce-core/ROLLOUT-FLAGS.md`
  - Depends: —
  - Accept: documents the `commerce_settings` flags:
    - `bank_transfer_checkout_enabled` (default false);
    - `proof_submission_enabled` (default true);
    - `pilot_organization_ids` (default empty);
    - `proforma_validity_hours` (24).

    For each flag: owner, audit, flip procedure, and the rollback meaning (MIG-006). The global `bank_transfer_checkout_enabled` is flipped only in T235 (production activation); Batches C–I use `pilot_organization_ids` only.
  - Tests: none.

- [X] T014 [P] Production backup and cutover checklist — `specs/013-bank-transfer-commerce-core/CUTOVER-CHECKLIST.md`
  - Depends: T009
  - Accept:
    - PITR/backup confirmation before each MP-5;
    - migration apply order; `pg_cron` enablement step;
    - legacy drain procedure; kill-switch sequence;
    - the M6 precondition (zero non-terminal `LEGACY`);
    - the Stripe decommission precondition;
    - sign-off lines (database/security review, finance, operator).
  - Tests: none.

- [X] T015 [P] Historical Feature 008 artifact guard — `tests/database/historical-008-unchanged.test.ts`
  - Depends: —
  - Accept: SHA-256 pins for:
    - `supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql` and its rollback and postflight;
    - every file under `specs/008-payments-settlement-invoices-payouts/`;
    - every applied migration/rollback/postflight file present at T001.

    Any byte change fails.
  - Tests: passes on the current tree.

- [X] T016 [P] Author the Feature 013 fixture tooling (no execution) — `scripts/seed-test-fixtures.ts`, `tests/auth/fixture-session.ts`
  - Depends: —
  - Accept:
    - `--inspect-/--prepare-/--cleanup-f013-fixtures` for exact identities only: buyer A, buyer B, member sellers S1/S2, Hills seller, finance, warehouse, auditor, admin;
    - exact-name listings/lots across two warehouses, a default USD account, tax/shipping/commission fixtures;
    - cleanup uses exact ids only (no wildcard, no hard delete of financial rows).
    - Not run in Phase 1.
  - Tests: a static test asserts the cleanup targets exact identities only.

- [X] T017 Batched baseline run — `PREFLIGHT-REPORT.md` §Baseline
  - Depends: T010, T011, T015
  - **Batch A**: lint 0 errors, typecheck clean, static baseline 109 files passed + 1 skipped (1,521 tests, 0 failed). The 94 live-database test files were not run (they write fixture rows to production). **CLOSED 2026-09-24: WAIVED for Batch A only by owner decision.** The static suite is green, and production was observed changing during preflight. The waiver does **not** cover targeted live proofs required by later migrations (MP-6, e.g. T062) or the gates for Batches B–I.
  - Accept: `npm run lint`, `npm run typecheck` and every `tests/<dir>` batch are green and recorded (counts per batch).
  - Tests: all existing.

- [X] T018 **GATE — STOP/REVIEW BATCH A**
  - Depends: T001–T017
  - Accept: the reviewer confirms the preflight is complete; no provider or legacy blocker is unaddressed; the backup plan is accepted. Recorded here.
  - **Batch A result (2026-09-24): PASS.** T001–T017 complete; T017's live suites were WAIVED for Batch A only, by owner decision, and later targeted live proofs are not waived. The reviewer (owner) confirmed the preflight and instructed the gate to pass. No Stripe Edge Functions, secrets or env vars are deployed; the Stripe PostgreSQL functions are still live and are handled by Batch H (M9). Backup and cutover plan: `CUTOVER-CHECKLIST.md`. Final mechanical checks are recorded in PREFLIGHT-REPORT.md §T018. **STOP**: Batch B (T019+) was not started. No provider or real-customer legacy blocker exists (all 1,909 legacy orders are fixtures; 0 provider transactions).

---

## PHASE 2 — DATABASE / STATE / RLS FOUNDATION  (BATCH B)

**Goal**: all structures and the **seller data-leak fix**, with no behaviour change for existing flows. Every task
here is database/security work; UI that depends on it comes later.

- [ ] T019 Migration convention test for all Feature 013 migrations — `tests/commerce/migrations/conventions.test.ts`
  - Depends: T017
  - Accept: iterates every `*_feature_013_*.sql`: MP-2 generic rules, ascending versions after `20260924120000`, paired rollback/postflight. Passes vacuously now.
  - Tests: itself; `tests/database/migration-layout.test.ts` still green.

### M1 — state vocabulary (order/proforma/reservation/payment state expansion, proof metadata, payout accrual, offer reference, default account flag)
- [ ] T020 MP-1 Author M1 — `supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql`, matching rollback, postflight
  - Depends: T019, T006
  - Accept: implements data-model §1.1, §2.1 (`status`, `commerce_flow`, `cancel_*`, `has_manual_adjustment`), §2.4, §4.1, §5.1, §5.2, §5.3, §5.7, §1.2 column/index, and `offer_code` + sequence + backfill; `validate_order_transition` v2 (§7.1; the legacy graph stays unchanged for `LEGACY` rows). `commerce_flow` is added with default `'LEGACY'`, so all existing and new rows stay `LEGACY` until M4a and there is no behaviour change. Existing `payment_proofs.submitted_at` is backfilled from `created_at` before NOT NULL (L3). The guard aborts on fingerprint drift vs T006.
- [ ] T021 MP-2 Static tests for M1 — `tests/commerce/migrations/m1-state-vocabulary.test.ts`
  - Depends: T020
  - Accept: MP-2 rules + CHECK sets equal data-model; `offer_code` backfill present; the legacy transition graph is textually preserved; `REVIEW_HOLD` is in the open-reservation index.
- [ ] T022 MP-3 Dry-run M1
  - Depends: T021
- [ ] T023 MP-4 **GATE** manual review M1
  - Depends: T022
- [ ] T024 MP-5 **OPERATOR** apply M1 + postflight
  - Depends: T023, T014
- [ ] T025 MP-6 Live proof M1 — `tests/commerce/schema-m1.live.test.ts`
  - Depends: T024
  - Accept: existing `tests/orders`, `tests/finance`, `tests/delivery`, `tests/listings` batches green on `LEGACY` rows; the new values are accepted only via the v2 graph for `BANK_TRANSFER_V1` rows; `offer_code` not null for every offer.

### M2a — delivery destinations
- [ ] T026 MP-1 Author M2a — `supabase/migrations/20260925103000_feature_013_delivery_destinations.sql`, rollback, postflight
  - Depends: T025
  - Accept: data-model §2.3 + `orders.delivery_destination_id`/`destination_snapshot`; `delivery_method` CHECK equals the T006-recorded value set; default-per-org partial unique; RLS (owning org members ∨ PA read; no client writes).
- [ ] T027 MP-2 Static tests — `tests/commerce/migrations/m2a-destinations.test.ts`
  - Depends: T026
- [ ] T028 MP-3 Dry-run M2a
  - Depends: T027
- [ ] T029 MP-4 **GATE** review M2a
  - Depends: T028
- [ ] T030 MP-5 **OPERATOR** apply M2a + postflight
  - Depends: T029
- [ ] T031 MP-6 Live proof — `tests/commerce/rls-destinations.live.test.ts`
  - Depends: T030
  - Accept: another org's members, sellers of the buyer's orders and anon read 0 destination rows; direct INSERT/UPDATE by `authenticated` is refused.

### M2b — proforma versioning and frozen economics (per-seller economic snapshots, bank instruction snapshots, shipping group snapshots, seller commission assignment snapshot)
- [ ] T032 MP-1 Author M2b — `supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql`, rollback, postflight
  - Depends: T031
  - Accept:
    - Implements data-model §3.1–§3.7, including the funding/cap columns and CHECK identities (FIN-006/007/011/012).
    - The per-seller commission "assignment" is the snapshot of `commission_policy_id`, `commission_tier_id`, `commission_rate_snapshot` and `seller_qualifying_quantity_kg` per line and per seller settlement (FIN-013). **No seller-specific commission override table** is introduced (not in the approved plan).
    - `protect_proforma_snapshot`, `prevent_snapshot_mutation`, deferred `check_seller_settlement_totals`, `freeze_order_financials`; redacted audit functions (no bank values).
    - The guard aborts if any order has > 1 proforma or a non-terminal `LEGACY` order holds an `ISSUED` proforma not listed as drained in T009.
- [ ] T033 MP-2 Static tests — `tests/commerce/migrations/m2b-snapshots.test.ts`
  - Depends: T032
  - Accept: every CHECK identity is present; snapshot tables have no UPDATE/DELETE path; `proforma_bank_instructions` has no generic `write_audit_log` trigger.
- [ ] T034 MP-3 Dry-run M2b
  - Depends: T033
- [ ] T035 MP-4 **GATE** review M2b
  - Depends: T034
- [ ] T036 MP-5 **OPERATOR** apply M2b + postflight
  - Depends: T035
- [ ] T037 MP-6 Live proof — `tests/commerce/snapshot-immutability.live.test.ts`
  - Depends: T036
  - Accept:
    - service-role fixture inserts of balanced snapshot rows succeed;
    - unbalanced rows (FIN-007 mismatch, negative `seller_net`/`hills_share`, `hills_funded_discount > commission_on_gross`, seller funding on a Hills line) are rejected;
    - UPDATE/DELETE on snapshots is rejected;
    - legacy proforma reads still work.

### M2c — reconciliation, manual adjustments, final-invoice record, fulfillment columns
- [ ] T038 MP-1 Author M2c — `supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql`, rollback, postflight
  - Depends: T037
  - Accept: data-model §5.4, §5.5, §5.6, and the `order_shipments` fulfillment columns + unique group index (research R-13); append-only triggers; `tax_invoice_code_seq`.
- [ ] T039 MP-2 Static tests — `tests/commerce/migrations/m2c-finance-records.test.ts`
  - Depends: T038
- [ ] T040 MP-3 Dry-run M2c
  - Depends: T039
- [ ] T041 MP-4 **GATE** review M2c
  - Depends: T040
- [ ] T042 MP-5 **OPERATOR** apply M2c + postflight
  - Depends: T041
- [ ] T043 MP-6 Live proof — `tests/commerce/finance-records.live.test.ts`
  - Depends: T042
  - Accept: adjustments and case events are append-only; the unique fulfillment-group index rejects a duplicate group; legacy `tax_invoices` rows are intact; `tests/delivery` green.

### M2d — pricing inputs (promotion data model, offer quantity price tiers)
- [ ] T044 MP-1 Author M2d — `supabase/migrations/20260925112000_feature_013_pricing_inputs.sql`, rollback, postflight
  - Depends: T043
  - Accept: data-model §3.8 tables + CHECKs (types, `PERCENT ≤ 100`, window, scope↔seller, generated `funding_source`); RLS per rls-storage §1 (tiers never anon; promotion codes hidden); tables only, no RPCs.
- [ ] T045 MP-2 Static tests — `tests/commerce/migrations/m2d-pricing-inputs.test.ts`
  - Depends: T044
- [ ] T046 MP-3 Dry-run M2d
  - Depends: T045
- [ ] T047 MP-4 **GATE** review M2d
  - Depends: T046
- [ ] T048 MP-5 **OPERATOR** apply M2d + postflight
  - Depends: T047
- [ ] T049 MP-6 Live proof — `tests/commerce/pricing-inputs.live.test.ts`
  - Depends: T048
  - Accept: anon reads 0 tier/promotion rows; a `funding_source` mismatch cannot be written; invalid values are rejected by CHECKs.

### M2e — notification outbox table
- [ ] T050 MP-1 Author M2e — `supabase/migrations/20260925115000_feature_013_notification_outbox.sql`, rollback, postflight
  - Depends: T049
  - Accept: data-model §6.1; internal `emit_notification_event` (no client EXECUTE); `UNIQUE(event_type, aggregate_id, dedupe_key)`; no client read.
- [ ] T051 MP-2 Static tests — `tests/commerce/migrations/m2e-outbox.test.ts`
  - Depends: T050
- [ ] T052 MP-3 Dry-run M2e
  - Depends: T051
- [ ] T053 MP-4 **GATE** review M2e
  - Depends: T052
- [ ] T054 MP-5 **OPERATOR** apply M2e + postflight
  - Depends: T053
- [ ] T055 MP-6 Live proof — `tests/commerce/outbox-table.live.test.ts`
  - Depends: T054
  - Accept: a duplicate event insert is a no-op; `authenticated` cannot read or execute.

### M3 — RLS realignment: SECURITY-FIRST seller data-leak fix (C2)
- [ ] T056 Write the seller-isolation and role-matrix live tests BEFORE the migration — `tests/commerce/rls-seller-isolation.live.test.ts`, `tests/commerce/rls-role-matrix.live.test.ts`, `tests/commerce/rls-anon-probe.live.test.ts`
  - Depends: T055, T016
  - Accept: for a two-seller fixture order, a seller session must read **0 rows** of:
    - (a) the buyer's `payments`;
    - (b) `payment_proofs`, and 0 storage objects in `payment-proofs` (asserted once the bucket exists, T112);
    - (c) `order_financials` (full-order economics);
    - (d) other sellers' `order_items`/`proforma_invoice_items`/`proforma_line_economics`;
    - (e) other sellers' `payouts`/`proforma_seller_settlements`;
    - (f) `proforma_invoices` header;
    - (g) `delivery_destinations` of the buyer;
    - (h) `proforma_bank_instructions` and `payment_accounts`.

    Plus a full matrix for buyer / other buyer / seller / other seller / finance / warehouse / auditor / anon over every rls-storage §1 table and §2 view. Recorded as failing against the current policies (proving C2).

    Plus the **DB-OPEN-C15 anonymous boundary** (`rls-anon-probe.live.test.ts`): `anon` gets a permission error executing `mfa_satisfied()` and `kyb_storage_object_authorized(text, boolean)`, while `authenticated` and `service_role` still execute both. This is recorded as failing before M3.
  - Tests: the suites themselves.

- [ ] T057 MP-1 Author M3 — `supabase/migrations/20260925120000_feature_013_rls_realignment.sql`, rollback, postflight
  - Depends: T056
  - Accept: helper functions (`is_order_buyer_member`, `is_order_line_seller`, `order_seller_org_ids`, …); every policy replacement in rls-storage §1; restrictive MFA gates; views §2 (`security_invoker`); `payment_reviews_finance`/`payouts_finance`/`tax_invoice_finance` reduced to SELECT; `can_view_order()` unchanged. The rollback recreates the exact previous policy text from the T006 capture.
  - **DB-OPEN-C15 (owner-approved 2026-09-24)**: `revoke execute on function public.mfa_satisfied() from public, anon` and the same for `public.kyb_storage_object_authorized(text, boolean)`. EXECUTE for `authenticated` and `service_role` is kept, and the bodies, `SECURITY DEFINER` and `search_path` are unchanged. The rollback restores the §5 ACL. Before authoring, confirm that no `anon`-reachable `SECURITY INVOKER` function calls either helper; all calling policies are already `to authenticated`. The postflight asserts `has_function_privilege('anon', …, 'execute') = false` for both.
- [ ] T058 MP-2 Static tests — `tests/commerce/migrations/m3-rls.test.ts`
  - Depends: T057
  - Accept: every replaced policy name/expression is pinned; no policy references `can_view_order` on the finance tables; no config-table policy is touched; the C15 `revoke … from public, anon` statements for `mfa_satisfied()` and `kyb_storage_object_authorized(text, boolean)` are pinned, and no statement revokes them from `authenticated` or `service_role`.
- [ ] T059 MP-3 Dry-run M3
  - Depends: T058
- [ ] T060 MP-4 **GATE** dedicated security review of M3 (separate reviewer sign-off required)
  - Depends: T059
- [ ] T061 MP-5 **OPERATOR** apply M3 + postflight
  - Depends: T060
- [ ] T062 MP-6 Live proof M3 — T056 suites
  - Depends: T061
  - Accept: every T056 assertion passes; existing `tests/finance`, `tests/orders`, `tests/listings`, `tests/dashboard`, `tests/disputes`, `tests/admin` batches green.

- [ ] T063 Adapt existing member/admin reads to the realigned RLS — `lib/finance/read.ts`, `lib/listings/sales.ts`, `src/app/dashboard/sales/page.tsx`, `src/app/dashboard/payouts/page.tsx`, `src/app/dashboard/orders/[orderId]/page.tsx`
  - Depends: T062
  - Accept: the seller views read their own rows (via `v_seller_order_lines` where needed); no page errors on the removed seller access; buyers are unaffected.
  - Tests: existing page tests updated; `tests/commerce/seller-views.test.tsx` renders the seller view without buyer totals, proof or bank data.

- [ ] T064 Commerce vocabulary, labels and status badges (EN/AR) — `lib/commerce/{types,validation,labels,errors}.ts`, `lib/orders/validation.ts`, `lib/finance/{validation,types}.ts`, `components/orders/order-status-badge.tsx`, `components/finance/{payment,payout,proforma}-status-badge.tsx`, `lib/app/copy/{en,ar}.ts`
  - Depends: T025
  - Accept: typed allowlists equal the M1 CHECK sets; every status has EN and AR labels (LOC-002); raw values never render.
  - Tests: `tests/commerce/vocabulary.test.ts` (allowlist = CHECK), `tests/commerce/labels-parity.test.ts`.

- [ ] T065 **GATE — STOP/REVIEW BATCH B**
  - Depends: T019–T064
  - Accept: 7 migrations applied with postflights recorded; the seller-leak fix is proven live (T062); the regression batches are green; the kill switch is off (checkout disabled). Recorded here.

---

## PHASE 3 — CART / DESTINATION / PROFORMA / RESERVATION  (BATCH C)

**Goal**: US1 (buyer commits) + US7 add-to-cart entry. **PROFORMA ISSUANCE (M4b, T082–T090) and RESERVATION
CONFIRMATION (M4c, T091–T106) are separate migrations, services and UI.**

### M4a — cart and destination RPCs
- [ ] T066 [US1] MP-1 Author M4a — `supabase/migrations/20260926100000_feature_013_cart_destination_rpcs.sql`, rollback, postflight
  - Depends: T065
  - Accept: `get_or_create_cart` (advisory lock per org, `BANK_TRANSFER_V1` DRAFT reuse), `add_cart_line` (no reservation; merges per offer; request-log replay), `upsert_delivery_destination`, `retire_delivery_destination`, `update_commerce_settings` (validity hours, switches, pilot orgs; platform admin + MFA; audited), `set_default_payment_account`, `admin_convert_legacy_draft` (LEGACY DRAFT without shipment plan → `BANK_TRANSFER_V1`; audited), and the H1 flow switch: `orders.commerce_flow` default → `'BANK_TRANSFER_V1'` plus the BEFORE INSERT guard `enforce_new_order_flow` (non-service-role inserts forced to v1) — per contracts/database-rpc.md.
- [ ] T067 [US1] MP-2 Static tests — `tests/commerce/migrations/m4a-cart-rpcs.test.ts`
  - Depends: T066
- [ ] T068 [US1] MP-3 Dry-run M4a
  - Depends: T067
- [ ] T069 [US1] MP-4 **GATE** review M4a
  - Depends: T068
- [ ] T070 [US1] MP-5 **OPERATOR** apply M4a + postflight
  - Depends: T069
- [ ] T071 [US1] MP-6 Live proof — `tests/commerce/cart.live.test.ts`, `tests/commerce/destinations.live.test.ts`
  - Depends: T070, T016 (fixtures prepared by OPERATOR/agent with approval)
  - Accept:
    - add/update/remove never changes `inventory_positions.reserved_quantity_kg` or `coffee_offers.reserved_quantity_kg` (AC-001);
    - a replay with the same request id returns an identical result;
    - concurrent cart creation yields one cart;
    - a mixed-seller + mixed-warehouse cart holds lines from S1/S2/Hills across two warehouses;
    - a cross-org destination id → `destination_not_found`;
    - retiring a destination keeps prior snapshots;
    - H1: a member insert (including one requesting `LEGACY`) is stored as `BANK_TRANSFER_V1`; `admin_convert_legacy_draft` converts a plan-free legacy draft exactly once and refuses other states (`legacy_draft_not_convertible`); legacy live suites (`tests/orders`, `tests/finance`, `tests/delivery`) are updated to insert `commerce_flow = 'LEGACY'` via service role and stay green.

### Cart and destination application
- [ ] T072 [US1] Cart service and Server Actions (single caller) — `lib/commerce/cart.ts`, `src/app/dashboard/cart/actions.ts`
  - Depends: T071
  - Accept: `addToCart`, `updateCartLine`, `removeCartLine` (Zod → identity → one RPC → typed feedback; request id generated server-side once per intent).
  - Tests: `tests/commerce/cart-actions.test.ts` (validation, error mapping, single-caller grep).
- [ ] T073 [US7] Add-to-cart on the listing detail and cards — `components/commerce/add-to-cart-form.tsx`, `src/app/dashboard/coffee/[offerId]/page.tsx`, `components/listings/listing-card.tsx`
  - Depends: T072
  - Accept: quantity input, "not reserved — estimate" notice (UX-002), keyboard operable, disabled for own listing / ineligible; anon never reaches it (member route).
  - Tests: `tests/commerce/add-to-cart-form.test.tsx`.
- [ ] T074 [US1] Cart page with seller × warehouse grouping — `src/app/dashboard/cart/page.tsx`, `components/commerce/{cart-group,cart-line}.tsx`
  - Depends: T072
  - Accept: groups by seller and warehouse; estimated prices labelled; edit/remove via the existing RPCs; empty and ineligible-line states; no reservation claim anywhere.
  - Tests: `tests/commerce/cart-page.test.tsx`.
- [ ] T075 [P] [US1] Delivery destinations management — `lib/commerce/destinations.ts`, `src/app/dashboard/destinations/{page,actions}.ts(x)`, `components/commerce/destination-form.tsx`
  - Depends: T071
  - Accept: create/edit/default/retire; phone/country validation; only the buyer org's destinations are listed.
  - Tests: `tests/commerce/destinations-actions.test.ts`, `tests/commerce/destination-form.test.tsx`.
- [ ] T076 [US1] Member navigation entries — `lib/dashboard/registry.tsx`, `lib/app/copy/{en,ar}.ts`
  - Depends: T074, T075
  - Accept: Cart and Destinations appear only for can-buy organizations.
  - Tests: `tests/dashboard/registry.test.tsx` updated.

### M4b — PROFORMA ISSUANCE (quote, estimate, issue; no reservation)
- [ ] T077 [US1] MP-1 Author M4b — `supabase/migrations/20260926103000_feature_013_quote_and_proforma_issuance.sql`, rollback, postflight
  - Depends: T071
  - Accept:
    - `compute_order_quote` implements research R-5 exactly:
      - promotion eligibility derived from `status IN ('SCHEDULED','ACTIVE') ∧ starts_at <= clock_timestamp() < ends_at` (no status job; analysis M1);
      - tier; per-seller rate from `Q_s` (FIN-013);
      - candidate promotions with funding, caps and deterministic selection (FIN-003/011/012);
      - discount before VAT; line/component rounding; group shipping (R-8); AE VAT (R-7);
      - fail-closed errors (FR-042);
      - `negative_economics` guard.
    - `estimate_cart` returns buyer-facing fields only.
    - `issue_proforma`: checkout switch/pilot check; `DRAFT` or expired-replacement; version n+1; persists every snapshot table + `order_financials`; destination snapshot; bank snapshot from the default USD account; `valid_until = issued_at + proforma_validity_hours`; **no offer/position write**; emits `proforma.issued`.
- [ ] T078 [US1] MP-2 Static tests — `tests/commerce/migrations/m4b-issuance.test.ts`
  - Depends: T077
  - Accept: `issue_proforma` body contains no UPDATE of `coffee_offers`/`inventory_positions`/`inventory_reservations`; `compute_order_quote` has no client EXECUTE.
- [ ] T079 [US1] MP-3 Dry-run M4b
  - Depends: T078
- [ ] T080 [US1] MP-4 **GATE** review M4b (financial math review by finance owner + database reviewer)
  - Depends: T079
- [ ] T081 [US1] MP-5 **OPERATOR** apply M4b + postflight
  - Depends: T080
- [ ] T082 [US1] MP-6 Live proof: issuance — `tests/commerce/proforma-issue.live.test.ts`, `tests/commerce/quote-math.live.test.ts`, `tests/commerce/commission-tier.live.test.ts`
  - Depends: T081
  - Accept:
    - issuance changes no reserved quantity (AC-001);
    - the fixture matrix (tiers, multi-seller, Hills lines, both VAT bases, shipping groups, fallback shipping rule, no promotions yet) reconciles to the cent;
    - S1's tier depends only on S1's quantity;
    - editing tax/shipping/commission/bank/listing price after issue leaves every snapshot byte-identical (AC-007);
    - a validity setting change after issue does not move `valid_until`;
    - missing tax/shipping/commission/bank → the named error with nothing written.
- [ ] T083 [P] [US1] Live proof: promotion math inside the quote (pricing function only; promotion admin comes in Phase 6) — `tests/commerce/promotion-funding.live.test.ts`
  - Depends: T081
  - Accept: using service-role fixture promotions (M2d tables):
    - Hills-funded on a member line → `seller_net` equals the no-promotion case and `hills_share` is reduced, capped at the line commission (`HILLS_COMMISSION` recorded);
    - seller-funded → the basis is reduced;
    - Hills-owned line → only Hills reduced;
    - an explicit code wins; otherwise the greatest capped discount with a deterministic tie;
    - no stacking;
    - a code capped to 0 falls back to automatic;
    - eligibility window (M1): a `SCHEDULED` promotion applies from `starts_at` without any job; `PAUSED`/`DRAFT`/`ARCHIVED` and past-`ends_at` promotions never apply;
    - no negative amount anywhere;
    - funding source and raw/applied amounts frozen.

- [ ] T084 [US1] Quote/estimate service and checkout page (checkout eligibility) — `lib/commerce/quote.ts`, `src/app/dashboard/checkout/page.tsx`, `components/commerce/{estimate-summary,destination-picker,money,commerce-status-badge}.tsx`
  - Depends: T082, T075
  - Accept:
    - destination required (US1-AS2 blocks with a link); optional promo code;
    - full estimate: lines, discounts with funding label, group shipping, VAT, total;
    - checkout-disabled, ineligible-line and fail-closed states explained;
    - money in LTR spans;
    - no TypeScript arithmetic on money.
  - Tests: `tests/commerce/checkout-page.test.tsx`, `tests/commerce/no-ts-money-math.test.ts` (static: no `*`/`+` on price fields in `lib/commerce`/`components/commerce`).
- [ ] T085 [US1] Issue-proforma service and action — `lib/commerce/proforma.ts` (`issueProforma`), `src/app/dashboard/checkout/actions.ts`
  - Depends: T084
  - Accept: single caller of `issue_proforma`; redirects to the proforma page; error mapping.
  - Tests: `tests/commerce/issue-action.test.ts`.
- [ ] T086 [US1] Proforma detail UI (versioned, frozen, deadline) and replacement — `src/app/dashboard/orders/[orderId]/proforma/page.tsx`, `components/commerce/proforma-document.tsx`, `lib/commerce/read.ts`
  - Depends: T085
  - Accept:
    - shows code, version, frozen lines (incl. applied discount + Hills/seller offer label), groups, VAT, total, destination, validity countdown (from `valid_until`);
    - when expired: "Issue replacement with current terms" (calls `issue_proforma`) with a before/after notice;
    - labelled "Proforma — not a tax invoice" (FR-029);
    - never shows commission or seller net to the buyer.
  - Tests: `tests/commerce/proforma-page.test.tsx`.
- [ ] T087 [US1] Live proof: proforma versioning/replacement — `tests/commerce/proforma-expiry.live.test.ts`
  - Depends: T086, T081
  - Accept: once past the deadline, v1 is marked `EXPIRED`; v2 is issued at current prices; v1 is unchanged; issuing while v1 is valid → `proforma_still_valid`; concurrent double issue → one wins; adding, updating or removing a cart line after issuance is refused (`order_items_can_only_change_in_draft`, FR-004).

### M4c — RESERVATION CONFIRMATION (confirm, cancel, expire, sweep)
- [ ] T088 [US1] MP-1 Author M4c — `supabase/migrations/20260926106000_feature_013_reservation_confirmation.sql`, rollback, postflight
  - Depends: T087
  - Accept:
    - `confirm_proforma`: order → proforma lock; deadline via `clock_timestamp()`; opportunistic reclaim with `SKIP LOCKED`; offers ↑, then positions ↑; all-or-nothing; 20-min `ACTIVE` reservation; payment `PENDING` `expected_amount`; proforma `CONFIRMED`; order `HOLD`; event.
    - `cancel_order` (DRAFT/PROFORMA_ISSUED/HOLD-without-proof; exactly-once release).
    - `expire_reservation`; `sweep_expired_reservations` (service_role; also expires overdue `ISSUED` proformas; reminders).
    - `admin_void_order`.
    - Lock order per data-model §8.
- [ ] T089 [US1] MP-2 Static tests — `tests/commerce/migrations/m4c-reservation.test.ts`
  - Depends: T088
  - Accept: every deadline check uses `clock_timestamp()`; lock order pinned; `sweep_expired_reservations` EXECUTE = service_role only.
- [ ] T090 [US1] MP-3 Dry-run M4c
  - Depends: T089
- [ ] T091 [US1] MP-4 **GATE** review M4c (concurrency review)
  - Depends: T090
- [ ] T092 [US1] MP-5 **OPERATOR** apply M4c + postflight
  - Depends: T091
- [ ] T093 [US1] MP-6 Live proof: atomic confirmation — `tests/commerce/confirm-atomic.live.test.ts`
  - Depends: T092
  - Accept: one unavailable line → zero reservations on all lines; success reserves exactly the purchased quantities for 20 min (`expires_at − confirmed_at = 20 min`); an expired proforma → `proforma_expired`, nothing reserved (AC-002).
- [ ] T094 [US1] Live proof: reservation concurrency / no overselling — `tests/commerce/confirm-concurrency.live.test.ts`
  - Depends: T092
  - Accept: two buyers on the final quantity: exactly one succeeds; **100 contention runs** never exceed sellable (SC-002); position and offer mirrors are consistent after every run.
- [ ] T095 [P] [US1] Live proof: partial stock behaviour — `tests/commerce/partial-quantity.live.test.ts`
  - Depends: T092
  - Accept: the remainder stays `PUBLISHED`/visible/purchasable; another buyer can reserve the remainder (FR-018).
- [ ] T096 [P] [US1] Live proof: expiry without cron + stale reservation cleanup — `tests/commerce/expiry-no-cron.live.test.ts`
  - Depends: T092
  - Accept: with no scheduler, a past-deadline `ACTIVE` reservation:
    - is rendered expired by reads;
    - is reclaimed by another buyer's `confirm_proforma`;
    - is released exactly once by `sweep_expired_reservations` (called directly);
    - a second sweep is a no-op.
- [ ] T097 [P] [US1] Live proof: buyer cancellation before proof — `tests/commerce/cancel.live.test.ts`
  - Depends: T092
  - Accept: cancel from DRAFT/PROFORMA_ISSUED/HOLD releases exactly once; cancel racing confirm is serialized; after proof (tested again in T122) → refused.

- [ ] T098 [US1] Reservation service and confirmation action — `lib/commerce/reservation.ts`, `src/app/dashboard/orders/[orderId]/proforma/actions.ts`
  - Depends: T093
  - Accept: `confirmProforma` (explicit confirm dialog submit), `cancelOrder`, `ensureReservationFresh` (lazy `expire_reservation` on read); single-caller discipline.
  - Tests: `tests/commerce/reservation-actions.test.ts`.
- [ ] T099 [US1] Confirmation UI and 20-minute countdown — `components/commerce/{proforma-confirm-panel,reservation-countdown}.tsx` (reuse `components/orders/hold-countdown.tsx`), `src/app/dashboard/orders/[orderId]/proforma/page.tsx`
  - Depends: T098
  - Accept: the confirm dialog explains the 20-min reservation; the countdown is derived from server `expires_at` (never client-extended), accessible live region, reduced motion; the expired state offers the late path (Phase 4) or a new cart.
  - Tests: `tests/commerce/confirm-panel.test.tsx`, `tests/commerce/countdown.test.tsx`.
- [ ] T100 [US1] Flow-aware order list/detail/timeline + legacy route redirects — `lib/orders/read.ts`, `src/app/dashboard/orders/page.tsx`, `src/app/dashboard/orders/[orderId]/page.tsx`, `src/app/dashboard/orders/[orderId]/{checkout,shipment}/page.tsx`, `components/commerce/order-timeline.tsx`
  - Depends: T099
  - Accept: `BANK_TRANSFER_V1` orders show the new timeline (UX-001) and redirect away from the legacy checkout/shipment routes; `LEGACY` orders are unchanged; the legacy "start order" entry (`src/app/dashboard/orders/start-order-button.tsx`, `src/app/dashboard/orders/actions.ts`) now opens the active cart instead of creating a separate draft (H1).
  - Tests: `tests/orders/pages.test.tsx` updated; `tests/commerce/order-timeline.test.tsx`.
- [ ] T101 [US6] Commerce settings admin page — `lib/admin/commerce-settings.ts`, `src/app/dashboard-admin/(system)/commerce-settings/{page,actions}.ts(x)`, `lib/admin/areas.ts`
  - Depends: T071
  - Accept: validity hours (1–720), checkout switch, proof switch, pilot organizations; impact notices; platform admin + MFA; audited.
  - Tests: `tests/commerce/commerce-settings.test.tsx`, `tests/admin/access-matrix.test.tsx` updated.
- [ ] T102 [US1] Phase 3 EN/AR copy completion — `lib/app/copy/{en,ar}.ts`
  - Depends: T073–T101
  - Accept: every Phase 3 string exists in EN and AR.
  - Tests: `tests/commerce/copy-parity.test.ts`.
- [ ] T103 [US1] Phase 3 browser proof (pilot organization only) — `tests/browser/feature013-phase3.browser.mjs`
  - Depends: T102
  - Accept: marketplace → add to cart → destination → checkout → issue → confirm → countdown in EN light and AR dark at 1440 and 375; overflow 0; no reservation before confirm (checked via DB).
  - Gate: OPERATOR enables `pilot_organization_ids` for the fixture buyer only.

- [ ] T104 **GATE — STOP/REVIEW BATCH C**
  - Depends: T066–T103
  - Accept: AC-001/AC-002/SC-002 evidenced; issuance and confirmation proven independently; the global checkout switch is still **off**. Recorded here.

---

## PHASE 4 — BANK TRANSFER / PROOF / FINANCE / PAYOUT / FULFILLMENT  (BATCH D → BATCH E)

### Group A — BANK ACCOUNT CONFIG (US6, US2)  [Batch D]
- [ ] T105 [US6] Default USD bank account admin — `lib/admin/payment-accounts.ts`, `src/app/dashboard-admin/(system)/payment-accounts/**`
  - Depends: T104
  - Accept:
    - currency shown; IBAN/account masked in lists, full values only on detail for platform admins;
    - "Set as default for USD" via `set_default_payment_account`; active/inactive;
    - copy: changes affect only future proformas (FR-020).
  - Tests: `tests/admin/payment-accounts.test.tsx` updated (masking, default action, no hard delete).
- [ ] T106 [P] [US2] Buyer-safe bank-instructions projection — `lib/commerce/read.ts` (`getBankInstructions`), `components/commerce/bank-instructions.tsx`
  - Depends: T104
  - Accept:
    - reads `proforma_bank_instructions` only for the buyer's own confirmed order (RLS);
    - shows the exact amount and payment reference; copy buttons; LTR identifiers;
    - never reads `payment_accounts`.
  - Tests: `tests/commerce/bank-instructions.test.tsx`; live `tests/commerce/bank-snapshot.live.test.ts` (account edited/deactivated after issuance → the order still shows the frozen snapshot; seller/auditor/other buyer read 0 rows).

### M5a — PAYMENT PROOF storage and submission (US2)
- [ ] T107 [US2] MP-1 Author M5a — `supabase/migrations/20260927100000_feature_013_payment_proof_storage.sql`, rollback, postflight
  - Depends: T104
  - Accept:
    - private buckets `payment-proofs` (10 MB; pdf/jpeg/png) and `finance-documents` (20 MB; pdf);
    - storage helper + INSERT/SELECT policies (rls-storage §3); no UPDATE/DELETE;
    - `submit_payment_proof` new overload: order → reservation lock; `ACTIVE ∧ clock < expires_at`; path/object/metadata checks; one on-time submission; `REVIEW_HOLD`; payment `UNDER_REVIEW`; events;
    - `report_late_transfer` (reconciliation, no stock);
    - `authorize_payment_proof_access` (audited, no path in the audit).
- [ ] T108 [US2] MP-2 Static tests — `tests/commerce/migrations/m5a-proof-storage.test.ts`
  - Depends: T107
- [ ] T109 [US2] MP-3 Dry-run M5a
  - Depends: T108
- [ ] T110 [US2] MP-4 **GATE** review M5a (document-security review)
  - Depends: T109
- [ ] T111 [US2] MP-5 **OPERATOR** apply M5a + postflight
  - Depends: T110
- [ ] T112 [US2] MP-6 Live proof: private storage and ownership — `tests/commerce/proof-storage.live.test.ts`
  - Depends: T111
  - Accept:
    - path forgery (other org/order/payment prefix) is refused at upload and at submit;
    - wrong mime/oversize is refused;
    - seller/warehouse/auditor/other buyer/anon: 0 objects and 0 rows;
    - T056(b) storage assertion passes;
    - uploaded bytes without submission leave the reservation `ACTIVE`, and it expires normally.
- [ ] T113 [US2] Live proof: proof-before-expiry race — `tests/commerce/proof-race.live.test.ts`
  - Depends: T111
  - Accept: 100 barrier-synchronized runs at the deadline; each ends in exactly one of {`REVIEW_HOLD` + `UNDER_REVIEW`} or {`EXPIRED` + `reservation_expired`}.
- [ ] T114 [P] [US2] Live proof: review hold survives the deadline and cron — `tests/commerce/review-hold.live.test.ts`
  - Depends: T111
  - Accept: after timely proof, `sweep_expired_reservations` past the deadline leaves the hold intact (AC-003); a late report opens a `LATE` case and stock is untouched (AC-009).

- [ ] T115 [US2] Proof service and actions (signed upload, submit, late report, view) — `lib/commerce/payment-proof.ts`, `src/app/dashboard/orders/[orderId]/payment/actions.ts`
  - Depends: T112
  - Accept: `createProofUpload` builds a server-side path + signed upload token; `submitProof` is the only caller of `submit_payment_proof`; `viewProof` mints a 60 s signed URL server-side after `authorize_payment_proof_access`; no path in the client payload.
  - Tests: `tests/commerce/proof-actions.test.ts` (static: no object path in returned DTOs; single caller).
- [ ] T116 [US2] Payment page (bank instructions, countdown, proof form, states) — `src/app/dashboard/orders/[orderId]/payment/page.tsx`, `components/commerce/proof-upload-form.tsx`, `src/app/dashboard/payments/[orderId]/page.tsx` (redirect for v1 orders)
  - Depends: T115, T106, T099
  - Accept:
    - UX-004: countdown, exact amount, reference, requirements;
    - after submit: "under finance review — stock remains reserved";
    - expired: late-report path;
    - upload errors explained;
    - the Stripe collector is not rendered for v1 orders.
  - Tests: `tests/commerce/payment-page.test.tsx`, `tests/commerce/proof-form.test.tsx`.

### M5b — ADMIN FINANCE and PAYMENT CONFIRMATION (US3)
- [ ] T117 [US3] MP-1 Author M5b — `supabase/migrations/20260927103000_feature_013_finance_review_settlement.sql`, rollback, postflight
  - Depends: T112
  - Accept:
    - `finance_confirm_payment`: finance + MFA; lock order → proforma → reservation → payment → proof → offers → positions; exact amount = proforma `buyer_total`, USD, `submitted_at < expires_at`, unused normalized bank reference, else `confirmation_requires_reconciliation`.
    - Settlement effects exactly once: reservation `CONSUMED`; the title loop reused (ownership events, filled/`SOLD_OUT` only at zero); `reserve_ready_deliveries_for_settlement` (**fixes C1**); payouts `ACCRUED` from `proforma_seller_settlements.seller_net` for member sellers only; final invoice record (number, snapshot, no bank ids); FULFILLMENT shipments `DRAFT → REQUESTED` per seller × warehouse from the frozen destination/groups; payment `CONFIRMED`, proforma `PAID`, order `PAID`; events.
    - `finance_reject_payment` (reason; exactly-once release; `PAYMENT_REJECTED`).
    - `open_reconciliation_case`, `resolve_reconciliation_case`, `record_manual_adjustment`, `attach_final_invoice_file`, `authorize_final_invoice_access`.
    - Request-log idempotency.
- [ ] T118 [US3] MP-2 Static tests — `tests/commerce/migrations/m5b-settlement.test.ts`
  - Depends: T117
  - Accept: MFA check present in every finance RPC; the order lock precedes the payment lock; `reserve_ready_deliveries_for_settlement` is called; payouts are inserted only as `ACCRUED`; no RPC in this migration writes inventory for reconciliation/adjustment.
- [ ] T119 [US3] MP-3 Dry-run M5b
  - Depends: T118
- [ ] T120 [US3] MP-4 **GATE** review M5b (finance + database + security reviewers)
  - Depends: T119
- [ ] T121 [US3] MP-5 **OPERATOR** apply M5b + postflight
  - Depends: T120
- [ ] T122 [US3] MP-6 Live proof: exact/USD/timing/reference enforcement — `tests/commerce/finance-confirm.live.test.ts`
  - Depends: T121
  - Accept: amount ±0.01, non-USD, late proof and duplicate reference → `confirmation_requires_reconciliation` with nothing changed; cancel after proof refused (FR-028); a non-finance role or an MFA-pending finance session is refused.
- [ ] T123 [US3] Live proof: confirm/reject races and idempotency — `tests/commerce/finance-race.live.test.ts`
  - Depends: T121
  - Accept: concurrent confirm+reject → exactly one decision; double confirm → one set of effects (SC-006); a replay returns the stored result; after a rejection, `inventory_positions.reserved_quantity_kg` and `coffee_offers.reserved_quantity_kg` are restored by exactly the reserved amount, once (ST-008).
- [ ] T124 [P] [US3] Live proof: settlement effects exactly once — `tests/commerce/settlement-effects.live.test.ts`
  - Depends: T121
  - Accept:
    - ownership events once per line; offer filled; `SOLD_OUT` only at zero sellable (AC-005);
    - one invoice; payouts `ACCRUED` for S1/S2 = frozen `seller_net` (a Hills-funded promotion does not change them); **no payout for Hills lines** (AC-011);
    - exactly one FULFILLMENT shipment per seller × warehouse containing only its lines (AC-012);
    - the C1 seam proven for a READY delivery;
    - outbox events once.
- [ ] T125 [P] [US3] Live proof: reconciliation and adjustments never touch inventory — `tests/commerce/reconciliation.live.test.ts`
  - Depends: T121
  - Accept: open/resolve cases for LATE/PARTIAL/WRONG_CURRENCY/DUPLICATE; manual adjustment append-only; positions/offers/reservations unchanged (AC-009, FR-044).

- [ ] T124a [US3] Live proof: audit trail (AUD-001/002/003/005/006) — `tests/commerce/audit-trail.live.test.ts`
  - Depends: T121
  - Accept: for a fixture lifecycle up to settlement:
    - every material status change (order, proforma, reservation, payment, proof, case) has old state, new state, actor, time, reason and correlation id (AUD-001);
    - proforma issuance and buyer confirmation are distinct audited events (AUD-002);
    - proof submission, review hold, finance decisions, reconciliation decisions and manual adjustments are audited (AUD-003);
    - commerce-settings and default-bank-account changes are attributable (AUD-005);
    - no audit payload contains proof bytes/paths, full IBAN/account numbers or secrets (AUD-006).

    Completion/payout auditing (AUD-004) is asserted in T141; promotion auditing in T184.
  - Tests: the suite itself.
- [ ] T126 [US3] Finance domain services — `lib/finance/{review,reconciliation,adjustments,invoices}.ts`, `lib/finance/{read,types,errors}.ts`
  - Depends: T122
  - Accept: typed single-caller wrappers; `review.ts` replaces `settlement.ts` as the settlement caller (`settlement.ts` itself stays until Phase 7); error mapping with mismatch details.
  - Tests: `tests/finance/review.test.ts`, single-caller audit updated (`tests/finance/settlement*` expectations moved).
- [ ] T127 [US3] Finance admin areas live — `lib/admin/areas.ts`
  - Depends: T126
  - Accept: `payments`, `invoices` → live; `reconciliation`, `adjustments` added; `payouts` stays blocked until T145.
  - Tests: `tests/admin/access-matrix.test.tsx`, `tests/admin/finance-delegation.test.tsx` updated.
- [ ] T128 [US3] Payment review queue (search/filter/sort) — `src/app/dashboard-admin/(finance)/payments/page.tsx`, `components/finance/review-queue-table.tsx`
  - Depends: T127
  - Accept: `v_finance_review_queue`; search by order code/buyer/reference; filters for state/age/reconciliation; oldest first; keyboard-operable table (UX-007).
  - Tests: `tests/finance/review-queue.test.tsx`.
- [ ] T129 [US3] Review detail with proof preview and decision forms — `src/app/dashboard-admin/(finance)/payments/[paymentId]/{page,actions}.ts(x)`, `components/finance/{review-detail,confirm-payment-form,reject-payment-form}.tsx`
  - Depends: T128
  - Accept:
    - immutable proforma values beside the buyer's claims; proof preview via a server-minted URL; reservation state/deadline; review and audit history;
    - confirm requires observed amount/currency/date/reference + deliberate confirmation; reject requires a reason;
    - the mismatch field is highlighted;
    - MFA redirect;
    - SC-007 walkthrough < 3 min recorded.
  - Tests: `tests/finance/review-detail.test.tsx`, `tests/finance/decision-forms.test.tsx`.
- [ ] T130 [P] [US3] Reconciliation case pages — `src/app/dashboard-admin/(finance)/reconciliation/{page,[caseId]/page,actions}.tsx`, `components/finance/reconciliation-*.tsx`
  - Depends: T127
  - Accept: queue + detail + resolve/close with a note; no inventory action exists anywhere on the page.
  - Tests: `tests/finance/reconciliation-pages.test.tsx`.
- [ ] T131 [P] [US3] Order finance page: notes/audit, manual adjustment, admin void — `src/app/dashboard-admin/(finance)/orders/[orderId]/{page,actions}.tsx`
  - Depends: T127
  - Accept: finance/admin + MFA; adjustments append-only; void only pre-payment; audit history shown redacted.
  - Tests: `tests/finance/order-finance-page.test.tsx`.
- [ ] T132 [P] [US3] Final invoices: admin list/detail/attach + buyer invoice page — `src/app/dashboard-admin/(finance)/invoices/{page,[invoiceId]/page}.tsx`, `src/app/dashboard/orders/[orderId]/invoice/page.tsx`, `components/finance/invoice-document.tsx`
  - Depends: T127
  - Accept: the invoice exists only after `PAID`; printable; distinct from the proforma (FR-029/030); the buyer sees their own only; the attached PDF comes via a server-minted URL.
  - Tests: `tests/finance/invoice-pages.test.tsx`.
- [ ] T133 [US3] Phase 4 (Batch D) EN/AR copy — `lib/app/copy/{en,ar}.ts`
  - Depends: T105–T132
  - Tests: `tests/commerce/copy-parity.test.ts`.
- [ ] T134 **GATE — STOP/REVIEW BATCH D**
  - Depends: T105–T133, T124a
  - Accept: proof, finance and settlement proven live; seller/warehouse/auditor isolation re-run green (T056 suites); reviewer sign-off. Recorded here.

### M5c — ORDER COMPLETION and PAYOUTS (US4, US5)  [Batch E]
- [ ] T135 [US4] MP-1 Author M5c — `supabase/migrations/20260927106000_feature_013_fulfillment_completion_payouts.sql`, rollback, postflight
  - Depends: T134
  - Accept:
    - `sync_order_fulfillment` (AFTER UPDATE OF status on FULFILLMENT shipments; order lock):
      - `FULFILLMENT_IN_PROGRESS` / `PARTIALLY_DELIVERED` / `COMPLETED` aggregation;
      - completion only when every group is `DELIVERED` with delivered = planned;
      - `CANCELLED`/`FAILED` block completion;
      - on completion: `ACCRUED → PENDING_PAYOUT` with `eligible_at`; events.
    - `record_seller_payout`: finance + MFA; `PENDING_PAYOUT` ∧ order `COMPLETED`; amount = frozen; USD; reference; exactly once.
    - one-time guarded recompute (analysis M5): the same aggregation is applied to every existing order with FULFILLMENT shipments (pilot orders settled in Batch D), so groups delivered before M5c still complete their orders and release payouts exactly once; the postflight reports recomputed order ids.
- [ ] T136 [US4] MP-2 Static tests — `tests/commerce/migrations/m5c-completion.test.ts`
  - Depends: T135
- [ ] T137 [US4] MP-3 Dry-run M5c
  - Depends: T136
- [ ] T138 [US4] MP-4 **GATE** review M5c
  - Depends: T137
- [ ] T139 [US4] MP-5 **OPERATOR** apply M5c + postflight
  - Depends: T138
- [ ] T140 [US4] MP-6 Live proof: shipment aggregation and completion — `tests/commerce/completion.live.test.ts`
  - Depends: T139
  - Accept: a two-group order: partial delivery → `PARTIALLY_DELIVERED` without overstating; all delivered → `COMPLETED`; a cancelled group blocks completion; group shipments contain only their lines (AC-012, US4); an order whose groups were delivered before M5c was applied is `COMPLETED` by the one-time recompute, with payouts eligible exactly once.
- [ ] T141 [US5] Live proof: payout eligibility and recording — `tests/commerce/payouts.live.test.ts`
  - Depends: T140
  - Accept: `record_seller_payout` before completion → `payout_not_eligible` (AC-011); after completion it works once with an immutable operator/time/reference; an amount mismatch is refused; Hills lines have no payout; title transfer, reservation consumption/release, shipment creation, completion, payout eligibility and payout recording each appear exactly once in the audit trail with actor and correlation (AUD-004).
- [ ] T142 [US4] Live proof: warehouse sees fulfillment only — `tests/commerce/rls-warehouse.live.test.ts`
  - Depends: T141
  - Accept: warehouse reads FULFILLMENT shipments/groups/destination snapshot; 0 rows of payments/proofs/bank/economics (RLS-006).

- [ ] T143 [US4] Warehouse shipment views show fulfillment groups — `lib/delivery/read.ts`, `src/app/dashboard-admin/(warehouse)/shipments/**`
  - Depends: T140
  - Accept: group seller and warehouse, frozen destination; the existing Feature 009 actions are unchanged.
  - Tests: `tests/delivery/pages.test.tsx` updated.
- [ ] T144 [US4] Buyer order timeline per-group progress — `components/commerce/order-timeline.tsx`, `src/app/dashboard/orders/[orderId]/page.tsx`
  - Depends: T140
  - Accept: partial/complete/blocked states explained (UX-005).
  - Tests: `tests/commerce/order-timeline.test.tsx`.
- [ ] T145 [US5] Payout service and admin payout pages — `lib/finance/payouts.ts`, `src/app/dashboard-admin/(finance)/payouts/{page,[payoutId]/page,actions}.tsx`, `components/finance/payout-record-form.tsx`, `lib/admin/areas.ts` (payouts live)
  - Depends: T141
  - Accept: queue by status (`ACCRUED` = "awaiting completion — not payable"); record form (amount read-only, reference, paid date, evidence note); MFA; audit trail visible.
  - Tests: `tests/finance/payout-pages.test.tsx`.
- [ ] T146 [P] [US5] Seller payouts and sales economics — `src/app/dashboard/payouts/page.tsx`, `src/app/dashboard/sales/page.tsx`, `lib/finance/read.ts`
  - Depends: T141, T063
  - Accept: own lines only with the funding split (Hills promotion "does not reduce your payout"), tier/rate from own quantity, payout status and reference.
  - Tests: `tests/commerce/seller-views.test.tsx` extended; live `rls-seller-isolation` re-run green.

### M6 — cutover: retire legacy checkout (US1/US3)
- [ ] T147 [US3] OPERATOR — Drain legacy orders per T009 and record zero non-terminal `LEGACY` — `CUTOVER-CHECKLIST.md`
  - Depends: T145, T146
  - Accept: every legacy row from the T009 list (refreshed at drain time) is terminal. Plan-free `DRAFT`s are converted with `admin_convert_legacy_draft`; `DRAFT`s with a plan are voided with `admin_void_order` and the buyer notified; `CONFIRMED` → `DRAFT` → converted or voided; `HOLD`/`PAYMENT_*` are finished or expired under the legacy functions. A read-only count of non-terminal `LEGACY` orders = 0 is recorded.
  - Gate: OPERATOR, using the existing legacy functions and the M4a admin actions only.
- [ ] T148 [US3] MP-1 Author M6 — `supabase/migrations/20260927110000_feature_013_legacy_checkout_retirement.sql`, rollback, postflight
  - Depends: T147
  - Accept: revoke `authenticated` EXECUTE on `checkout_order`, `admin_review_payment`, the legacy `submit_payment_proof(uuid,uuid,text)` and `expire_order_hold`; drop `shipments_buyer_insert`/`shipments_buyer_draft_update`; the guard aborts if any non-terminal `LEGACY` order exists, `DRAFT` included. The M4a insert guard makes that set finite.
- [ ] T149 [US3] MP-2 Static tests — `tests/commerce/migrations/m6-cutover.test.ts`
  - Depends: T148
- [ ] T150 [US3] MP-3 Dry-run M6
  - Depends: T149
- [ ] T151 [US3] MP-4 **GATE** review M6
  - Depends: T150
- [ ] T152 [US3] MP-5 **OPERATOR** apply M6 + postflight
  - Depends: T151
- [ ] T153 [US3] MP-6 Live proof — `tests/commerce/cutover.live.test.ts`
  - Depends: T152
  - Accept: the legacy functions are not callable by members/finance; no app code path calls them (static grep); existing test suites updated to the retired state.
- [ ] T154 [US1] Retire legacy Feature 007 checkout/planner UI after cutover — `src/app/dashboard/orders/[orderId]/{checkout,shipment}/**`, `components/orders/{shipment-planner,checkout-confirm-button}.tsx`, `lib/orders/{checkout,expiry}.ts`
  - Depends: T153
  - Accept: removed or redirected; no import remains; historical specs untouched.
  - Tests: `tests/orders/*` updated to the retired state; build green.
- [ ] T155 [US3] End-to-end bank-transfer lifecycle browser proof (pilot organizations only) — `tests/browser/feature013-lifecycle.browser.mjs`, `CUTOVER-CHECKLIST.md`
  - Depends: T154
  - Accept: cart → proforma → confirm → proof → finance confirm → fulfillment → completion → payout, recorded in the browser (EN and AR) for `pilot_organization_ids` only. The global `bank_transfer_checkout_enabled` stays **false**; global enablement is production activation (T235, analysis M2).
  - Gate: finance sign-off of the pilot lifecycle.
- [ ] T156 [US4] Phase 4 (Batch E) EN/AR copy — `lib/app/copy/{en,ar}.ts`
  - Depends: T143–T155
  - Tests: copy parity.
- [ ] T157 **GATE — STOP/REVIEW BATCH E (CUTOVER GATE)**
  - Depends: T135–T156
  - Accept: AC-003/004/005/008/009/010/011/012 evidenced; M6 applied; the pilot lifecycle proven; zero non-terminal legacy/provider transactions; global checkout still off. **This gate is the precondition for Phase 7.** Recorded here.

---

## PHASE 5 — NOTIFICATIONS / OUTBOX / SCHEDULING  (BATCH F)

### M7 — notification delivery and campaigns (US6)
- [ ] T158 [US6] MP-1 Author M7 — `supabase/migrations/20260928100000_feature_013_notification_delivery.sql`, rollback, postflight
  - Depends: T157
  - Accept:
    - data-model §6.2–§6.4;
    - `process_notification_events` (SKIP LOCKED claim; audience resolution at processing; `UNIQUE(event_id,user_id)`; deliveries only for enabled channels; backoff; `FAILED` after 8);
    - `dispatch_due_campaigns`;
    - `claim_notification_deliveries` / `complete_notification_delivery`;
    - `mark_notifications_read`, `mark_all_notifications_read` (own only);
    - campaign RPCs (bilingual required);
    - admin wrappers `admin_process_outbox_now` / `admin_dispatch_due_campaigns_now` (EXECUTE `authenticated`; `is_platform_admin() ∧ mfa_satisfied()` inside; the same internal bodies and idempotency as the cron functions — analysis H2).
- [ ] T159 [US6] MP-2 Static tests — `tests/commerce/migrations/m7-notifications.test.ts`
  - Depends: T158
  - Accept: the cron worker functions have EXECUTE `service_role` only; both admin wrappers check `is_platform_admin()` and `mfa_satisfied()` before any work.
- [ ] T160 [US6] MP-3 Dry-run M7
  - Depends: T159
- [ ] T161 [US6] MP-4 **GATE** review M7
  - Depends: T160
- [ ] T162 [US6] MP-5 **OPERATOR** apply M7 + postflight
  - Depends: T161
- [ ] T163 [US6] MP-6 Live proof — `tests/commerce/outbox.live.test.ts`, `tests/commerce/campaigns.live.test.ts`
  - Depends: T162
  - Accept:
    - two concurrent processors → one notification per recipient per event;
    - a failure backs off and retries;
    - a campaign dispatched twice → one per recipient (AC-013);
    - with no provider → no delivery rows and commerce is unaffected (US6-AS4);
    - read state is own-only;
    - catalogue completeness (analysis M4): after a fixture lifecycle, every `event_type` in contracts/notification-provider.md §1 was emitted exactly once per aggregate by its transaction.

### M7b — pg_cron jobs (US6)
- [ ] T164 [US6] OPERATOR — Enable the `pg_cron` extension in the Supabase project and record it — `CUTOVER-CHECKLIST.md`
  - Depends: T163
  - Gate: OPERATOR.
- [ ] T165 [US6] MP-1 Author M7b — `supabase/migrations/20260928110000_feature_013_scheduler_jobs.sql`, rollback (`cron.unschedule`), postflight
  - Depends: T164
  - Accept: `f013_sweep_reservations`, `f013_process_outbox`, `f013_dispatch_campaigns` (every minute) and `f013_purge_request_log` (daily 23:00 UTC); the guard aborts if `pg_cron` is absent.
- [ ] T166 [US6] MP-2 Static tests — `tests/commerce/migrations/m7b-cron.test.ts`
  - Depends: T165
- [ ] T167 [US6] MP-3 Dry-run M7b
  - Depends: T166
- [ ] T168 [US6] MP-4 **GATE** review M7b
  - Depends: T167
- [ ] T169 [US6] MP-5 **OPERATOR** apply M7b + postflight
  - Depends: T168
- [ ] T170 [US6] MP-6 Live proof + cron-down drill — `tests/commerce/cron.live.test.ts`
  - Depends: T169
  - Accept:
    - jobs run and are idempotent under overlap;
    - drill: unschedule the sweeper, let a reservation pass its deadline → reads show expired, proof refused, a competing confirm reclaims, rescheduling releases exactly once;
    - `cron.job_run_details` is readable for the outbox page.

### Notification application
- [ ] T171 [US6] Provider boundary (no provider, no Firebase SDK/credentials) — `lib/notifications/providers/{types,registry,in-app}.ts`, `lib/notifications/worker.ts`
  - Depends: T163
  - Accept:
    - `NotificationChannelAdapter` interface per contracts/notification-provider.md;
    - the registry returns only configured adapters (empty in 013);
    - the worker is a pure function with an **injected** database client that claims/completes deliveries with backoff (analysis M6);
    - no runtime module under `src/` or `lib/` imports a service-role client; nothing invokes the worker in 013;
    - a `PUSH` adapter slot is documented as a future Firebase adapter;
    - **no Firebase dependency or env var added**.
  - Tests: `tests/notifications/provider-boundary.test.ts` (registry empty; no `firebase` import or package; the worker handles SKIPPED/FAILED with a mocked client; static: no `SUPABASE_SERVICE_ROLE` / service-role client in `lib/notifications/**`).
- [ ] T172 [US6] Templates and read state — `lib/notifications/{templates,read,read-state}.ts`, `lib/notifications/limitations.ts`
  - Depends: T163
  - Accept: EN/AR renderers per template key; a param allowlist enforced; the `NOTIFICATION_LIMITATIONS` flags flip with the DB capability evidence.
  - Tests: `tests/notifications/templates.test.ts` (no bank ids/paths/foreign economics), `tests/disputes/honest-limitations.test.ts` updated with evidence.
- [ ] T173 [US6] Notification centre (list, unread badge, mark read/all) — `src/app/dashboard/notifications/{page,actions}.tsx`, `components/notifications/{notification-list,mark-read-button}.tsx`
  - Depends: T172
  - Tests: `tests/notifications/notification-centre.test.tsx`.
- [ ] T174 [P] [US6] Notification preferences update — `src/app/dashboard/notifications/preferences/page.tsx`, `components/notifications/notification-preferences-form.tsx`, `lib/notifications/preferences.ts`
  - Depends: T172
  - Accept: in-app always on; external channels shown as unavailable until an adapter exists; `PUSH` listed as future.
  - Tests: existing preference tests updated.
- [ ] T175 [US6] Admin campaigns (drafts, audience rules, schedule, cancel) — `lib/notifications/campaigns.ts`, `src/app/dashboard-admin/(system)/campaigns/{page,new/page,[campaignId]/page,actions}.tsx`, `components/notifications/campaign-form.tsx`, `lib/admin/areas.ts`
  - Depends: T163
  - Accept: bilingual required; audience enum + selected users; `scheduled_at ≥ now + 5 min`; recipient count preview; platform admin + MFA.
  - Tests: `tests/notifications/campaign-form.test.tsx`, `tests/admin/access-matrix.test.tsx` updated.
- [ ] T176 [P] [US6] Admin outbox health + manual "process now" trigger — `src/app/dashboard-admin/(system)/outbox/{page,actions}.tsx`
  - Depends: T170
  - Accept: pending/failed counts, error codes (no params), last run per `f013_*` job; "process now" (platform admin + MFA) calls `admin_process_outbox_now` / `admin_dispatch_due_campaigns_now` with the user's own session — **no service-role client** (analysis H2).
  - Tests: `tests/notifications/outbox-page.test.tsx`; the existing Feature 010 "no service-role runtime in admin roots" static tests (`tests/admin/run-f-static.test.tsx`, `tests/admin/finance-delegation.test.tsx`) stay green.
- [ ] T177 [US6] Phase 5 EN/AR copy — `lib/app/copy/{en,ar}.ts`
  - Depends: T171–T176
  - Tests: copy parity.
- [ ] T178 **GATE — STOP/REVIEW BATCH F**
  - Depends: T158–T177
  - Accept: FR-036–FR-038, AC-013, cron-down drill evidenced. Recorded here.

---

## PHASE 6 — PROMOTIONS / CATALOGUE / MARKETPLACE COMPLETENESS  (BATCH G)

### M8 — promotion/tier RPCs and member search (US6, US7)
- [ ] T179 [US7] MP-1 Author M8 — `supabase/migrations/20260929100000_feature_013_promotions_tiers_search.sql`, rollback, postflight
  - Depends: T178
  - Accept:
    - `upsert_platform_promotion` (Hills-funded);
    - `upsert_seller_promotion` (seller-funded; own member offers only; rejects Hills-owned targets, `value ≤ 0`, `PERCENT > 100`, invalid window, `AMOUNT_PER_KG` ≥ the lowest targeted price → `promotion_config_invalid`);
    - `set_promotion_status`;
    - the `validate_promotion_scope` trigger;
    - `set_offer_price_tiers` (own listing, Feature 006 editable states);
    - `search_member_listings` (authorized member + MFA gate; allowlisted projection; filters/sorts; page ≤ 50).
- [ ] T180 [US7] MP-2 Static tests — `tests/commerce/migrations/m8-promotions-search.test.ts`
  - Depends: T179
  - Accept: the search projection column allowlist is pinned (no lot internals, no warehouse address beyond city/country); zero anon EXECUTE.
- [ ] T181 [US7] MP-3 Dry-run M8
  - Depends: T180
- [ ] T182 [US7] MP-4 **GATE** review M8
  - Depends: T181
- [ ] T183 [US7] MP-5 **OPERATOR** apply M8 + postflight
  - Depends: T182
- [ ] T184 [US6] MP-6 Live proof: promotion configuration and isolation — `tests/commerce/promotion-config.live.test.ts`
  - Depends: T183
  - Accept: a seller cannot target another seller's or a Hills offer (US6-AS2); invalid values are rejected; the funding source cannot be spoofed; the schedule window is honoured (a `SCHEDULED` promotion becomes eligible at `starts_at` with cron disabled; a paused one never applies); promotion create/update/status changes are audited with actor and correlation (AUD-005); T083 re-run green with promotions created through the RPCs.
- [ ] T185 [P] [US7] Live proof: price tiers — `tests/commerce/price-tiers.live.test.ts`
  - Depends: T183
  - Accept: tier boundaries are deterministic (at, below and above thresholds); the selected tier is snapshotted on the proforma line; a tier edit after issuance does not change the proforma.
- [ ] T186 [P] [US7] Live proof: RLS-safe search and no protected leakage — `tests/commerce/search.live.test.ts`
  - Depends: T183
  - Accept: each filter (origin, process, location, type, availability, certification, tag) and sort returns only authorized matching rows; anon/non-member/MFA-pending → 0 rows; a public HTML/RSC scan of `/coffee/*` shows no member price/tier/promotion (AC-014).

### Promotions application
- [ ] T187 [US6] Promotion services — `lib/promotions/{platform,seller,read}.ts`
  - Depends: T184
  - Tests: `tests/promotions/services.test.ts` (single caller, error mapping).
- [ ] T188 [US6] Platform promotions admin UI — `src/app/dashboard-admin/(catalogue)/promotions/{page,[promotionId]/page,actions}.tsx`, `components/promotions/*`, `lib/admin/areas.ts`
  - Depends: T187
  - Accept: percentage/fixed-per-kg; code; schedule; targets; the "capped at Hills' line commission on member listings" notice; read-only list of seller promotions (seller-funded).
  - Tests: `tests/promotions/admin-ui.test.tsx`.
- [ ] T189 [P] [US6] Seller promotions UI — `src/app/dashboard/promotions/{page,actions}.tsx`, `lib/dashboard/registry.tsx`
  - Depends: T187
  - Accept: can-sell only; own listings picker; validation messages; "seller-funded — reduces your net" disclosure.
  - Tests: `tests/promotions/seller-ui.test.tsx`.
- [ ] T190 [US6] Proforma, checkout and finance display of the applied promotion and funding — `components/commerce/{proforma-document,estimate-summary}.tsx`, `components/finance/review-detail.tsx`
  - Depends: T188
  - Accept: per line: promotion label, applied amount, capped indicator; the buyer sees the Hills/seller offer label only; finance sees the funding split.
  - Tests: `tests/commerce/promotion-display.test.tsx`.

### Pricing tiers application
- [ ] T191 [P] [US7] Seller price-tier editor — `lib/listings/tiers.ts`, `components/listings/price-tier-editor.tsx`, `src/app/dashboard/listings/[offerId]/{page,actions}.tsx`
  - Depends: T185
  - Accept: strictly increasing thresholds; editable only in the allowed listing states; the "affects future proformas only" notice.
  - Tests: `tests/listings/tier-editor.test.tsx`.

### Catalogue and marketplace
- [ ] T192 [US7] Marketplace search, filters and sorting — `lib/listings/search.ts`, `components/listings/marketplace-filters.tsx`, `src/app/dashboard/coffee/page.tsx`
  - Depends: T186
  - Accept: URL-state filters; the existing primary-image card rule is kept; empty/no-match states; paging.
  - Tests: `tests/listings/search-page.test.tsx`, `tests/public/media-display-rule.test.tsx` still green.
- [ ] T193 [P] [US7] Stable offer reference and tier hint on cards/detail/cart/proforma — `components/listings/listing-card.tsx`, `src/app/dashboard/coffee/[offerId]/page.tsx`, `components/commerce/{cart-line,proforma-document}.tsx`
  - Depends: T185
  - Accept: `offer_code` shown LTR; detail tier table; detail gallery rule unchanged.
  - Tests: `tests/listings/listing-card.test.tsx` updated.
- [ ] T194 [P] [US7] Coffee tags/certifications controls — `src/app/dashboard-admin/(catalogue)/taxonomy/**`, `src/app/dashboard-admin/(catalogue)/coffees/[coffeeId]/**`
  - Depends: T002
  - Accept: tag management (Arabic names via T056 once applied); certification names official, untranslated, LTR (LOC-004), managed per coffee; used by the search filters.
  - Tests: `tests/admin/pre-stripe-hardening.test.tsx` + `tests/admin/certifications.test.tsx`.
- [ ] T195 [US7] Arabic completeness audit for marketplace/cart/catalogue surfaces — `lib/app/copy/{en,ar}.ts`, catalogue translation fallbacks
  - Depends: T188–T194
  - Accept: every string has AR; an English fallback is marked `lang="en"`; no raw enum values.
  - Tests: copy parity + `tests/commerce/raw-values.test.tsx`.
- [ ] T196 [US7] Phase 6 browser proof — `tests/browser/feature013-phase6.browser.mjs`
  - Depends: T195
  - Accept: filters, promotions (admin/seller) and the tier editor in EN light and AR dark at 1440 and 375; overflow 0.
- [ ] T197 **GATE — STOP/REVIEW BATCH G**
  - Depends: T179–T196, T002 (T056 applied or explicitly deferred with reason)
  - Accept: FR-008/009/010/039/040/041, US7, FIN-011/012 evidenced. Recorded here.

---

## PHASE 7 — STRIPE RUNTIME DECOMMISSION  (BATCH H)

**Precondition**: T157 (cutover gate) passed **and** zero non-terminal provider transactions (T007 re-checked).

- [ ] T198 [US8] Re-inventory every Stripe runtime reference — `specs/013-bank-transfer-commerce-core/STRIPE-DECOMMISSION.md`
  - Depends: T157, T197
  - Accept: lists every runtime match (imports, deps, functions, env, UI, actions, tests) vs retained historical artifacts; CSS "stripe" pattern names excluded explicitly; re-runs the T007 provider check (OPERATOR).
- [ ] T199 [US8] Retire Stripe server actions and provider-specific finance code — `lib/finance/stripe/{adapter,config,webhook}.ts`, `lib/finance/funding.ts`, `lib/finance/settlement.ts`, Stripe branches in `lib/finance/errors.ts`, any Stripe Server Action under `src/app/dashboard/payments/**`
  - Depends: T198
  - Accept: files removed; `review.ts` is the sole settlement caller; no import remains.
  - Tests: typecheck/build green.
- [ ] T200 [US8] Remove Stripe UI — `components/finance/{stripe-payment-collector,funding-unavailable-notice}.tsx`, the `src/app/dashboard/payments/[orderId]/page.tsx` legacy branch
  - Depends: T199
  - Tests: `tests/finance/t022-payment-state.test.tsx` updated to the bank-transfer state.
- [ ] T201 [US8] Remove the Stripe npm dependencies — `package.json`, `package-lock.json`
  - Depends: T200
  - Accept: `stripe` and `@stripe/stripe-js` removed; `npm ci` clean; build green.
- [ ] T202 [US8] Replace provider-specific tests with absence tests — `tests/finance/{stripe-boundary-security,stripe-webhook,funding}.test.ts` → `tests/finance/stripe-absence.test.ts`
  - Depends: T201
  - Accept: the absence test fails on any `stripe` import/dependency, `STRIPE_` reference in `src|lib|components|supabase/functions|.env.example`, or `supabase/functions/stripe-*` directory.
- [ ] T203 [US8] OPERATOR — Undeploy the Stripe Edge Functions — `supabase functions delete stripe-create-payment-intent stripe-webhook stripe-release-transfer`
  - Depends: T202
  - Accept: `supabase functions list` shows none; output recorded.
  - Gate: OPERATOR.
- [ ] T204 [US8] Remove the Stripe Edge Function sources — `supabase/functions/stripe-create-payment-intent/`, `supabase/functions/stripe-webhook/`, `supabase/functions/stripe-release-transfer/`
  - Depends: T203
  - Accept: directories removed (git history retains them as evidence).
- [ ] T205 [US8] Remove the deployment secrets and env references — `.env.example`; OPERATOR hosting + Supabase function secrets
  - Depends: T204
  - Accept: no `STRIPE_*` in `.env.example`; OPERATOR confirms the secrets were deleted (names only recorded).
  - Gate: OPERATOR.

### M9 — revoke legacy provider DB functions (preserve rows)
- [ ] T206 [US8] MP-1 Author M9 — `supabase/migrations/20260930100000_feature_013_stripe_runtime_restriction.sql`, rollback, postflight
  - Depends: T205
  - Accept: revoke EXECUTE on `ingest_stripe_event`, `record_stripe_payment_intent`, `record_payment_transfer` from every role; `payment_events`/`payment_transfers` finance-SELECT only; **no row deleted, no column/table dropped**; retention comments; the guard aborts on a non-terminal `PROVIDER` payment.
- [ ] T207 [US8] MP-2 Static tests — `tests/commerce/migrations/m9-stripe-restriction.test.ts`
  - Depends: T206
  - Accept: no `drop`/`delete`/`truncate` statement.
- [ ] T208 [US8] MP-3 Dry-run M9
  - Depends: T207
- [ ] T209 [US8] MP-4 **GATE** review M9
  - Depends: T208
- [ ] T210 [US8] MP-5 **OPERATOR** apply M9 + postflight (row counts of provider tables unchanged)
  - Depends: T209
- [ ] T211 [US8] MP-6 Live proof — `tests/finance/provider-restriction.live.test.ts`
  - Depends: T210
  - Accept: the functions are not executable; historical rows are intact and finance-readable only.

- [ ] T212 [US8] Preserve historical evidence and mark superseded — `docs/architecture/IMPLEMENTATION-ROADMAP.md`, `specs/013-bank-transfer-commerce-core/STRIPE-DECOMMISSION.md`
  - Depends: T211
  - Accept: the roadmap and 013 record 008's payment runtime as superseded; **no file in `specs/008-*`, historical migrations, rollbacks or postflights changed** (T015 green).
- [ ] T213 [US8] Final repository-wide Stripe runtime scan — `STRIPE-DECOMMISSION.md` §Final scan
  - Depends: T212
  - Accept: `rg -n -i "stripe"` over the repository; every remaining match is classified as either a retained historical artifact (008 migration/rollback/postflight, specs/008, DB column names in historical SQL, the M9 comments) or a CSS pattern name. **Zero runtime Stripe dependency.** Plus `tests/finance/stripe-absence.test.ts` and T015 green (AC-017, SC-010, SC-011).
- [ ] T214 **GATE — STOP/REVIEW BATCH H**
  - Depends: T198–T213
  - Accept: reviewer confirms the scan and the OPERATOR evidence. Recorded here.

---

## PHASE 8 — FINAL LOCALIZATION / SECURITY / RESPONSIVE / ACCESSIBILITY / CLOSURE  (BATCH I)

Each browser task covers EN + AR, LTR + RTL, light + dark, at viewports 375 / 430 / 768 / 1024 / 1280 / 1440+ (mobile,
tablet, desktop). Each records overflow = 0, axe with no violations in changed regions, keyboard walk with visible
focus, contrast, and non-hover alternatives (RT-001–RT-005). They use `tests/browser/cdp-harness.mjs`.

- [ ] T215 [P] Browser matrix — member purchase flow (marketplace, cart, destinations, checkout, proforma, countdown) — `tests/browser/feature013-matrix-purchase.browser.mjs`
  - Depends: T214
- [ ] T216 [P] Browser matrix — payment page and proof upload (form errors, upload, expired, late report) — `tests/browser/feature013-matrix-payment.browser.mjs`
  - Depends: T214
- [ ] T217 [P] Browser matrix — admin finance (queue table, detail, confirm/reject forms, reconciliation, invoices, order finance) — `tests/browser/feature013-matrix-finance.browser.mjs`
  - Depends: T214
- [ ] T218 [P] Browser matrix — payouts (admin payouts, seller payouts/sales) and warehouse fulfillment views — `tests/browser/feature013-matrix-payouts.browser.mjs`
  - Depends: T214
- [ ] T219 [P] Browser matrix — notifications (centre, preferences, campaigns, outbox) — `tests/browser/feature013-matrix-notifications.browser.mjs`
  - Depends: T214
- [ ] T220 [P] Browser matrix — promotions (admin, seller) and tier editor; commerce settings; payment accounts — `tests/browser/feature013-matrix-admin-config.browser.mjs`
  - Depends: T214
- [ ] T221 Fix defects found by T215–T220 — the affected component/page files
  - Depends: T215–T220
  - Accept: every recorded defect fixed and re-verified in its matrix; no new horizontal overflow.
- [ ] T222 Localization parity and raw-value audit — `tests/commerce/localization-parity.test.ts`
  - Depends: T221
  - Accept: EN/AR key parity for all Feature 013 copy; no raw state value renders; LTR identifiers (money, IBAN, codes) inside RTL (LOC-001–005); a static check shows no member-facing refund/return action or route exists (FR-043).
- [ ] T223 Security negative suite — `tests/commerce/threat-model.live.test.ts`
  - Depends: T214
  - Accept: forged ids, cross-org access, stale states, replay/duplicate request ids, duplicate bank references, file-path manipulation, direct RPC invocation by wrong roles, MFA-pending sessions — all refused without existence leaks (SEC-010, SC-005).
- [ ] T224 [P] Secret scan — `tests/commerce/secret-scan.test.ts` + a repository scan record
  - Depends: T214
  - Accept: no keys/secrets/bank identifiers in source, fixtures, logs, notification params or audit payload samples (SEC-006, AUD-006).
- [ ] T225 RLS regression — re-run `tests/commerce/rls-*.live.test.ts`, `rls-warehouse`, `bank-snapshot`, `proof-storage`
  - Depends: T223
  - Accept: all green; results recorded.
- [ ] T226 [P] Public leakage regression — `tests/public/*` + `tests/commerce/rls-anon-probe.live.test.ts` + HTML/RSC scan of public routes
  - Depends: T214
  - Accept: zero member price/listing/tier/promotion/bank/proof/payout data publicly (AC-014).
- [ ] T227 Old-feature regression suites — batched `tests/{public,auth,dashboard,listings,orders,delivery,admin,disputes,inventory,pricing,audit,database,design,finance}`
  - Depends: T225, T226
  - Accept: Features 002/003/006/007/009/010/012 suites green (legacy-flow tests updated only where Feature 013 intentionally retired behaviour, each change listed).
- [ ] T228 Final gates — `npm test` (batched), `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`
  - Depends: T222, T224, T227
  - Accept: all green; counts recorded.
- [ ] T229 Real-browser QA sign-off of the complete lifecycle on production-like data (fixtures) — `CLOSURE-REPORT.md`
  - Depends: T228
  - Accept: SC-007 (< 3 min finance) and SC-008 (< 5 min buyer) usability timings recorded; the full lifecycle is replayed in EN/AR.
- [ ] T230 Acceptance evidence matrix — `specs/013-bank-transfer-commerce-core/CLOSURE-REPORT.md`
  - Depends: T229
  - Accept: AC-001…AC-018 and SC-001…SC-012 each mapped to task and evidence; production activation gates (finance/tax/legal, real bank data, warehouse reconciliation, backup) listed as **open** until signed.
- [ ] T231 Spec, task and roadmap reconciliation — `specs/013-bank-transfer-commerce-core/tasks.md`, `docs/architecture/IMPLEMENTATION-ROADMAP.md`, `docs/architecture/DATABASE-CAPABILITY-MAP.md`, `docs/database/commission-capability.md`
  - Depends: T230
  - Accept: task checkboxes reflect verified work only; the DB-OPEN entries closed by 013 are marked with evidence; `specs/008-*` untouched.
- [ ] T232 Post-closure fixture cleanup — `scripts/seed-test-fixtures.ts --cleanup-f013-fixtures`
  - Depends: T231
  - Accept: exact-identity cleanup; financial rows retained or quarantined per the no-hard-delete rules; result recorded.
  - Gate: OPERATOR approval for any production-project fixture removal.
- [ ] T233 Temporary artifact cleanup and final diff inspection — repository
  - Depends: T232
  - Accept: no scratch/debug files; no mojibake; `git status` lists only intended files; historical-file guard (T015) green.
- [ ] T234 **GATE — STOP/REVIEW BATCH I (feature closure)**
  - Depends: T215–T233
  - Accept: the reviewer signs the closure report. Production activation remains a separate business decision (T235).

- [ ] T235 OPERATOR — Production activation (business-gated; outside the implementation batches) — `CUTOVER-CHECKLIST.md`, `ROLLOUT-FLAGS.md`
  - Depends: T234
  - Accept: recorded sign-offs for:
    - finance/tax/legal: VAT basis, invoice legal content and issuer;
    - real bank-account data verified;
    - warehouse reconciliation;
    - backup/restore readiness.

    Then OPERATOR sets `bank_transfer_checkout_enabled = true` and clears `pilot_organization_ids`. The first real order is monitored end-to-end; the rollback lever (switch off) is documented (analysis M2, spec Assumptions).
  - Gate: business owner + finance + OPERATOR.

---

## Dependencies and critical path

```
Phase 1 (T001–T018) → GATE A
  → Phase 2 M1 → M2a → M2b → M2c → M2d → M2e → M3 (security-first; tests T056 first) → T063/T064 → GATE B
  → Phase 3 M4a (cart/destinations/settings/legacy-flow switch) → cart & destination app
            M4b (PROFORMA ISSUANCE) → quote/checkout/proforma UI
            M4c (RESERVATION CONFIRMATION) → reservation UI → pilot browser proof → GATE C
  → Phase 4 bank config + M5a (proof) → M5b (finance/settlement) → audit trail + finance UI → GATE D
           → M5c (completion/payouts + one-time recompute) → payout UI → legacy drain (T147) → M6 (cutover)
           → pilot lifecycle proof (T155) → GATE E (CUTOVER; global checkout still off)
  → Phase 5 M7 (+admin wrappers) → pg_cron (M7b) → notification UI → GATE F
  → Phase 6 M8 → promotions/tiers/search UI → GATE G
  → Phase 7 Stripe code/deps/functions/secrets → M9 → final scan → GATE H
  → Phase 8 matrices, security, regressions, final gates → GATE I
  → T235 production activation (business-gated)
```

Batches run strictly in order A → I. T198 (Phase 7) depends on the cutover gate T157 **and** on T197 (GATE G), so
Batches F and G are on the path to Phase 7 by design. The plan allows Phase 7 right after cutover; the tasks
deliberately serialize it after G so Stripe removal happens once, on the final code base (analysis L2).

**Critical path** (every hop is a declared dependency):
- T001 → T005 → T006 → T020–T025 (M1) → T026–T031 (M2a) → T032–T037 (M2b) → T038–T043 (M2c) → T044–T049 (M2d) → T050–T055 (M2e)
- → T056 → T057–T062 (M3) → T065 (GATE B)
- → T066–T071 (M4a) → T077–T082 (M4b) → T084 → T085 → T086 → T087 → T088–T093 (M4c) → T098 → T099 → T100 → T102 → T103 → T104 (GATE C)
- → T107–T112 (M5a) → T117–T122 (M5b) → T126 → T127 → T128 → T129 → T133 → T134 (GATE D)
- → T135–T140 (M5c) → T141 → T146 → T147 → T148–T153 (M6) → T154 → T155 → T156 → T157 (GATE E)
- → T158–T163 (M7) → T164 → T165–T170 (M7b) → T176 → T177 → T178 (GATE F)
- → T179–T184 (M8) → T187 → T188 → T190 → T195 → T196 → T197 (GATE G)
- → T198 → T199 → T200 → T201 → T202 → T203 → T204 → T205 → T206–T211 (M9) → T212 → T213 → T214 (GATE H)
- → T220 → T221 → T222 → T228 → T229 → T230 → T231 → T232 → T233 → T234 (GATE I) → T235

Off-path branches that must still finish before their gate:
- T145 (joins at T147);
- T171–T175 (join at T177);
- T215–T219, which run in parallel with T220 and join at T221.

Nothing in Phase 3+ UI starts before its RPC migration's MP-6 live proof.

## Parallel execution examples
- **Batch A**: T003, T004, T012, T013, T014, T015 and T016 in parallel after T001; T010 ∥ T011.
- **Batch C**:
  - after T092, the live suites T095, T096 and T097 run in parallel, but the 100-run contention suite T094 runs **alone** (L1);
  - T075 ∥ T072–T074 after T071;
  - T083 ∥ T082.
- **Batch D**:
  - T106 ∥ T105;
  - after T121 the race suite T123 runs alone, then T124 ∥ T125;
  - T124a after T121 (not in parallel with T123);
  - T130 ∥ T131 ∥ T132 after T127;
  - the proof race T113 runs alone before T114.
- **Batch E**: T140 → T141 → T142 run serially (shared completion fixtures); T145 ∥ T146, both before the drain T147.
- **Batch F**: T174 ∥ T173; T176 after T170.
- **Batch G**: T185 ∥ T186 after T183; T189, T191, T193 and T194 in parallel.
- **Batch I**: T215–T220, T224 and T226 in parallel.
- **Never parallel**:
  - any two tasks of the same migration group;
  - tasks sharing M3 policies, the settlement function (M5b) or `lib/app/copy/{en,ar}.ts` edits;
  - any 100-run contention/race live suite with another live suite.

## Implementation batches (one reviewed batch per agent run — do NOT implement Feature 013 in one run)

| Batch | Tasks | Scope | STOP / REVIEW gate |
|---|---|---|---|
| **A** | T001–T018 | Preflight only (no production mutation) | T018 |
| **B** | T019–T065 | First DB/security migration group: M1, M2a–M2e, **M3 seller-leak fix**, vocab | T065 |
| **C** | T066–T104 | Cart, destinations, legacy-flow switch (M4a), **proforma issuance (M4b)**, **reservation confirmation (M4c)**, pilot proof | T104 |
| **D** | T105–T134 (+T124a) | Bank config, proof (M5a), admin finance + settlement (M5b), audit trail, invoices | T134 |
| **E** | T135–T157 | Completion/payouts (M5c), legacy drain, cutover (M6), pilot lifecycle proof | T157 (**cutover gate**; global checkout off) |
| **F** | T158–T178 | Notifications (M7 + admin wrappers), pg_cron (M7b), notification UI | T178 |
| **G** | T179–T197 | Promotions, tiers, catalogue, marketplace (M8) | T197 |
| **H** | T198–T214 | Stripe decommission (M9) | T214 |
| **I** | T215–T234 | Final localization/security/responsive/accessibility/closure | T234 |
| — | T235 | Production activation (business-gated, OPERATOR) | sign-offs in T235 |

Large batches (B, C, D) may be further split at migration boundaries. Each MP-4/MP-5 gate is itself a stop point.

## Notes
- No task edits `specs/008-*` or any previously applied migration, rollback or postflight file (T015 enforces this).
- All production database actions are OPERATOR tasks with a recorded review GO; agents run dry-runs and read-only verification only.
- Product decisions are locked. Q4 (terminal `PAYMENT_REJECTED` + reorder), Q5 (no return-to-cart) and Q6 (deliver every line) use the spec-literal defaults recorded in research.md; changing them requires a spec amendment, not a task.
