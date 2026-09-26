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

- [X] T019 Migration convention test for all Feature 013 migrations — `tests/commerce/migrations/conventions.test.ts`
  - Depends: T017
  - Accept: iterates every `*_feature_013_*.sql`: MP-2 generic rules, ascending versions after `20260924120000`, paired rollback/postflight. Passes vacuously now.
  - Tests: itself; `tests/database/migration-layout.test.ts` still green.
  - **Batch B (2026-09-25)**: DONE. The rules live in `tests/commerce/migrations/sql-rules.ts` (shared with each migration's own test).
    - Checked for every Feature 013 migration: name + forbidden name fragments; versions after `20260924120000`, unique and ascending, and no pre-013 file after a Feature 013 file; paired rollback and read-only postflight (`<yyyymmdd>_<name>_postflight.sql`); one explicit transaction with the `do $guard$` first; new tables RLS enabled + forced and revoked from public/anon; no grant to anon; no table write grant to authenticated; SECURITY DEFINER functions with pinned `search_path` + explicit revoke/grant; no policy/trigger change on the six Feature 010 configuration tables; no top-level DML on financial tables except an exact per-file sanctioned backfill.
    - 10 mutation checks prove each rule bites. Passed vacuously before M1 existed (18/18), then with M1 present (18/18); `migration-layout.test.ts` 6/6.

### M1 — state vocabulary (order/proforma/reservation/payment state expansion, proof metadata, payout accrual, offer reference, default account flag)
- [X] T020 MP-1 Author M1 — `supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql`, matching rollback, postflight
  - Depends: T019, T006
  - Accept: implements data-model §1.1, §2.1 (`status`, `commerce_flow`, `cancel_*`, `has_manual_adjustment`), §2.4, §4.1, §5.1, §5.2, §5.3, §5.7, §1.2 column/index, and `offer_code` + sequence + backfill; `validate_order_transition` v2 (§7.1; the legacy graph stays unchanged for `LEGACY` rows). `commerce_flow` is added with default `'LEGACY'`, so all existing and new rows stay `LEGACY` until M4a and there is no behaviour change. Existing `payment_proofs.submitted_at` is backfilled from `created_at` before NOT NULL (L3). The guard aborts on fingerprint drift vs T006.
  - **Batch B (2026-09-25)**: AUTHORED, **NOT APPLIED**. Files:
    - `supabase/migrations/20260925100000_feature_013_commerce_state_vocabulary.sql`;
    - `supabase/rollback/20260925100000_feature_013_commerce_state_vocabulary.rollback.sql`;
    - `supabase/maintenance/20260925_feature_013_commerce_state_vocabulary_postflight.sql` (22 checks + an `ALL CHECKS PASSED` row).
  - Guard (T006 baseline): body fingerprints of `validate_order_transition` (`8cb85749…`), `admin_review_payment` (`c0ef5f06…`), `checkout_order` (`75e07c35…`) and `expire_order_hold` (`e5b8f4ee…`); the exact §9 text of the 5 CHECKs and `uq_active_inventory_reservation_order`; no `PAID` payout missing paid fields; no M1 object already present; the migration role bypasses RLS (needed by later SECURITY DEFINER functions reading FORCE-RLS tables).
  - Design decisions for the T023 reviewer (not dictated verbatim by the data-model):
    - `offer_code` is backfilled through a **volatile column default** (`next_offer_code()`, SECURITY DEFINER), not an UPDATE, so no offer trigger (audit, updated_at, status history, Feature 005 hold guard, `validate_offer_transition`) fires on the backfill. Codes follow physical row order.
    - `validate_order_transition` v2 also makes `commerce_flow` immutable except `LEGACY → BANK_TRANSFER_V1` on a DRAFT by an internal transition, and makes the M1 columns `cancelled_*`/`cancel_reason`/`has_manual_adjustment` writable only by internal transitions (buyers can UPDATE their own DRAFT/CONFIRMED orders under `orders_update_buyer_or_admin`).
    - LEGACY branch = the pre-M1 lines verbatim + one fence: `PROFORMA_ISSUED`/`CANCELLED`/`PAYMENT_REJECTED` are refused for LEGACY rows (legacy has no rule out of `DISPUTED`).
    - V1 branch: every move needs an internal transition, except the unchanged platform-admin path into `DISPUTED`; **`DISPUTED` has no exit** (§7.1 defines none) → fails closed; entering `HOLD` requires `hold_expires_at` to be supplied (confirm_proforma copies the reservation's `expires_at`); no `assert_order_checkout_ready()` for V1 (DB-OPEN-15).
    - Legacy proofs keep `submission_kind`/`status` NULL. `claimed_currency` is CHECKed to `USD`; `observed_currency` only to an ISO-shaped code (finance may record a non-USD observation).
    - Deferred (not in the T020 Accept): queue indexes `payments(status, updated_at)` / `payouts(status, eligible_at)` (with the queues, M5b/M5c) and `offer_code` immutability (M3/M8).
- [X] T021 MP-2 Static tests for M1 — `tests/commerce/migrations/m1-state-vocabulary.test.ts`
  - Depends: T020
  - Accept: MP-2 rules + CHECK sets equal data-model; `offer_code` backfill present; the legacy transition graph is textually preserved; `REVIEW_HOLD` is in the open-reservation index.
  - **Batch B (2026-09-25)**: 51/51 pass. Baselines are read from the T006 evidence CSVs, not memory.
    - Covers: guard = T006 fingerprints and §9 text; CHECK sets = T006 values + data-model additions; payments/proforma sets untouched; `commerce_flow` default `LEGACY`, no V1 default, no insert guard; checkout kill switch default off; exactly the 34 M1 columns, each dropped by the rollback; `REVIEW_HOLD` in `uq_open_inventory_reservation_order`; proof backfill before NOT NULL; `offer_code` volatile-default backfill with no `coffee_offers` UPDATE; payout PAID-fields CHECK; RLS forced + grants on both new tables; `next_offer_code()` grants; `validate_order_transition` EXECUTE = T006 ACL.
    - Legacy graph: every pre-M1 line appears, in order, inside the LEGACY branch, and the only addition is the new-value fence. V1 edges equal data-model §7.1 exactly. The rollback restores the function body with md5 = T006 `8cb857495ac7bd3333f0b81236ca2ee2` and each CHECK with exactly its T006 value set.
- [X] T022 MP-3 Dry-run M1
  - Depends: T021
  - **Batch B (2026-09-25): COMPLETE.**
    - The agent's CLI account was refused (`LegacyDbConfigLoginRoleStatusError … 403`, as in T001), so the OPERATOR ran it. **OPERATOR evidence (authoritative)**, `npx supabase db push --linked --dry-run`:
      ```
      Initialising login role...
      DRY RUN: migrations will *not* be pushed to the database.
      Connecting to remote database...
      Would push these migrations:
       • 20260925100000_feature_013_commerce_state_vocabulary.sql
      Finished supabase db push.
      ```
      Exactly one pending migration, as expected (remote head `20260924120000`).
    - Local shadow apply (`supabase db reset`): **not available** — Docker Desktop is not running and no local Postgres exists. Not attempted.
    - Supplementary execution check (not a substitute for the two items above): the migration, postflight and rollback were executed in an in-memory PGlite 0.5.8 database built from `supabase/trading_schema.sql` plus the fingerprinted functions; the fixture reproduced all four T006 fingerprints and all six §9 definitions. **99/99 checks passed** (`migration-evidence/m1-supplementary-pglite.log`; re-run for T023 with a full-catalog rollback-symmetry snapshot):
      - apply; second apply refused by the guard; postflight `ALL CHECKS PASSED`;
      - LEGACY graph probes (DRAFT→CONFIRMED by a client still allowed; new values refused; the `HOLD` row still runs `assert_order_checkout_ready`) and V1 graph probes (full normal path, terminal states, `PAID → VOID` refused, `DISPUTED` fails closed, `HOLD` window required);
      - flow and field protection; the unique open-reservation, on-time-proof, confirmed-bank-reference and default-account indexes; the payout CHECK; the `offer_code` backfill + default;
      - rollback refused while a V1 order exists, then rollback restores the validate_order_transition md5 and every CHECK/index **byte-identically**; re-apply after rollback passes the postflight.
    - Regression: `tests/commerce` plus every test file that reads `supabase/migrations/` → **32 files, 674/674 green**; `npm run typecheck` clean; eslint clean on the new files; `git diff --check` clean.
    - **Deviation (recorded)**: that regression batch was meant to be static but unintentionally included 4 LIVE suites (`tests/admin/organization-suspension`, `tests/auth/kyb-transitions`, `tests/auth/session`, `tests/disputes/transition-history`). They signed in to the linked project and prepared/cleaned their disposable fixtures there; all passed, and their own cleanup assertions held (suspended fixture restored, 0 tagged disputes left, operators de-privileged). Append-only history rows may have grown. M1 was **not** applied, and no Feature 013 object was written to production.
- [X] T023 MP-4 **GATE** manual review M1
  - Depends: T022
  - **VERDICT: GO / PASS** — reviewer: owner (repository owner), 2026-09-25. F1 is accepted and deferred to **M4a / T066** (`enforce_new_order_flow` must also force `has_manual_adjustment = false` and `cancel_*` NULL for non-`service_role` inserts). M1 is not expanded.
  - **Owner design decisions (2026-09-25; recorded, NOT a PASS verdict)**:
    1. `DISPUTED` BANK_TRANSFER_V1 orders keep **no exit** in M1. No transition outside the approved spec/data-model is invented; any dispute-resolution transition needs an explicit spec amendment.
    2. LEGACY fencing **APPROVED**: the LEGACY graph is preserved exactly, and the V1-only statuses are refused for LEGACY rows.
    3. New-field protection **APPROVED**: `commerce_flow`, the cancellation fields and `has_manual_adjustment` are never directly buyer-writable; they change only through the intended internal/database functions.
    4. HOLD expiry **APPROVED**: no silent 20-minute default for V1 `HOLD` in M1; `confirm_proforma` (M4c) must copy the reservation's actual `expires_at`.
    5. `offer_code` backfill **APPROVED**: stable and unique are required, creation-date order is not; the trigger-safe default-based backfill is accepted.
    6. RLS-bypass migration guard **APPROVED** (based on the successful linked dry-run); keep it.
    7. Deferred items **APPROVED**: the finance queue indexes stay in M5b/M5c and `offer_code` immutability stays in its planned later migration. M1 is not expanded.
  - **Review package (agent, 2026-09-25)** — verified:
    - **T006 fidelity**: the guard carries the exact §5 fingerprints and §9 texts, read from the evidence CSVs by T021; the PGlite fixture reproducing those values applies cleanly, and a second apply is refused by the guard.
    - **Rollback symmetry**: after the rollback, the full catalog of the 8 touched tables (columns, constraints, indexes, policies, triggers, table ACL/RLS), every public function body/flags/ACL and every public relation is **identical** to pre-M1 (PGlite snapshot); `validate_order_transition` md5 = T006; M1 re-applies afterwards. The rollback guard refuses once any M1 value is in use or M2a+ exists.
    - **History unchanged**: no tracked file under `supabase/` or `specs/008-*` differs from HEAD; `historical-008-unchanged` 62/62 pins; only 3 new, paired files.
    - **LEGACY behaviour**: every pre-M1 line is in the LEGACY branch in order (T021), and PGlite legacy probes pass. Every legacy SQL writer (`checkout_order`, legacy `submit_payment_proof`, `admin_review_payment` in 007/008/009, `expire_order_hold`) stays inside the legacy status sets:
      - reservation inserts use no `ON CONFLICT`, so the index swap is transparent;
      - payouts are inserted `PENDING_PAYOUT` and nothing sets `PAID`, so the new payout CHECK cannot bite a legacy path;
      - the legacy proof insert uses an explicit column list, so `submitted_at` gets its default;
      - no offer row is copied by SQL;
      - no app code parses order/payment/offer rows strictly.
    - **Scope**: only the T020 items + the approved protections, plus two small items inside the T020 tables: the `commerce_settings_staff_read` policy (contracts/rls-storage.md "PA ∨ F read") and a `set_updated_at` trigger on `commerce_settings` (updated_at hygiene rule).
  - **Findings for the reviewer**:
    - **F1 (low, integrity)**: the existing `orders_create_buyer` INSERT policy forces `status = 'DRAFT'` but not the M1 columns, so a buyer can INSERT a DRAFT with `commerce_flow = 'BANK_TRANSFER_V1'`, `has_manual_adjustment = true` or `cancel_*` set. The M1 trigger is BEFORE UPDATE only.
      - Impact with M1 alone: no money or inventory path. A V1 DRAFT cannot move: no V1 RPC exists, and legacy `checkout_order` is refused by the V1 graph. Postflight #4 would flag it, and the M1 rollback guard would refuse until the row is removed.
      - Proposed owner: **M4a `enforce_new_order_flow` (T066)** — extend it so non-`service_role` inserts also get `has_manual_adjustment = false` and `cancel_*` NULL. Alternative (needs approval; expands M1): a BEFORE INSERT guard in M1.
    - **F2 (low, pre-existing C6)**: the finance/admin direct-write policies (`payouts_finance`, `payment_reviews_finance` FOR ALL; `reservations_admin`; `payment_accounts_admin`) can write the new values/columns. Nothing consumes them before M4+. M3 reduces the finance policies to SELECT; the admin configuration policy stays (Feature 010 invariant).
    - **F3 (info)**: `next_offer_code()` is executable by `authenticated`, which is required because members insert offers directly; a caller can only consume sequence numbers (gaps), never duplicate a code.
    - **F4 (operational)**: M1 takes ACCESS EXCLUSIVE locks on the 8 tables (a full rewrite of `coffee_offers`; CHECK validation scans elsewhere). The tables are small, so this is expected to be sub-second, but concurrent writers block. The CUTOVER-CHECKLIST precondition "no other process writing to production" applies (an external fixture writer was seen in Batch A).
    - **F5 (rollback data loss, accepted by design)**: the rollback drops the `offer_code` values and the `commerce_settings` row, and needs `supabase migration repair --status reverted 20260925100000`.
    - **F6 (guard)**: if `db push` executes as a login role without BYPASSRLS, guard 0.5 aborts the whole migration with nothing applied. Report it; do not edit the guard.
  - **Agent recommendation: GO**, conditional on the reviewer accepting F1 with the M4a follow-up (or ordering the M1 insert guard) and on the T014 backup + quiet-window confirmation. Verdict, reviewer and date to be recorded here by the human reviewer.
- [X] T024 MP-5 **OPERATOR** apply M1 + postflight
  - Depends: T023, T014
  - **OPERATOR evidence (2026-09-25, authoritative)**: `npx supabase db push --linked` applied `20260925100000_feature_013_commerce_state_vocabulary.sql` to the linked production project. The postflight `supabase/maintenance/20260925_feature_013_commerce_state_vocabulary_postflight.sql` returned **23 rows, every `ok = true`**, and the last row was `999 | ALL CHECKS PASSED | true`.
- [X] T025 MP-6 Live proof M1 — `tests/commerce/schema-m1.live.test.ts`
  - Depends: T024
  - Accept: existing `tests/orders`, `tests/finance`, `tests/delivery`, `tests/listings` batches green on `LEGACY` rows; the new values are accepted only via the v2 graph for `BANK_TRANSFER_V1` rows; `offer_code` not null for every offer.
  - **Batch B (2026-09-25): COMPLETE.** The live proof and the regression passed; the T016 guardrail decision is resolved below. Owner-authorized run; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1` set.
    - `F013_LIVE=1 npx vitest run tests/commerce/schema-m1.live.test.ts` → **16/16 passed**. Privileged work runs only in the fixture script: `--f013-m1-live-setup`, `--f013-m1-live-probe`, `--f013-m1-live-cleanup`, `--f013-m1-schema-probe`. What it proved:
      - production state: 9 offers, all with a unique non-null `LST-` code; every other order `LEGACY`; `commerce_settings` at its safe defaults; 0 proofs without `submitted_at`; 0 default accounts; empty request log;
      - LEGACY: the non-internal DRAFT→CONFIRMED rule still works (service role and buyer), and the new values are unreachable without the workflow;
      - V1: every non-internal status change is refused (including CONFIRMED, PAID→VOID and PAID→DISPUTED without platform admin); a non-status update is not blocked (no `assert_order_checkout_ready`);
      - `commerce_flow`, `has_manual_adjustment` and `cancel_reason` are refused for the service role and for a buyer on its own DRAFT;
      - the CHECKs accept `PROFORMA_ISSUED`/`CANCELLED`/`PAYMENT_REJECTED` and refuse unknown status/flow values; refused writes changed no row;
      - a buyer sees no `commerce_settings` row and has no access to `commerce_request_log`; anon has no access to either.
    - **Live limit (documented in the suite)**: internal V1 transitions cannot be driven through PostgREST (no V1 RPC exists before M4a; `app.internal_transition` is transaction-local). They are proven by T021 and the PGlite run, and live from M4a–M5c.
    - Fixtures: **not** `--prepare-f013-fixtures`, which would create GLOBAL active configuration (an AE shipping rule, an ACTIVE commission policy + tiers, a default USD account) that legacy checkout reads. Instead: 9 disposable item-less orders with exact ids `13000000-0000-4000-8000-00000000010x/11x`, owned by the existing Foundation buyer-only fixture.
    - Regression (default gating, one file per run, `F013_LIVE=1`): `tests/delivery` (21), `tests/finance` (10), `tests/listings` (24), `tests/orders` (21) = **76 files: 809 passed, 1 failed, 39 skipped**. The skips are the suites' own opt-in gates, not set by design: `F006_LIVE_PROOF`, `F008_LIVE_PROOF`, `T017_LIVE_PROOF`, `T024_LIVE_PROOF`.
    - The 1 failure was a **false positive introduced by Batch A**, not M1: the `tests/orders/expiry.test.ts` T014 "no scheduler" audit matched the string literal `'pg_cron'` in the read-only `20260925_feature_013_preflight.sql` extension probe. Fix: the audit now masks SQL string literals, as it already stripped comments; a real `cron.schedule(...)` is still detected. After the fix: 15/15.
    - Cleanup verified independently: `{"remainingOrders":0,"remainingStatusHistory":0}`; the post-run state probe is unchanged (9 offers all coded; 2,004 orders all `LEGACY`). The legacy suites cleaned or retained their own fixtures by their existing conventions.
    - **T016 guardrail — RESOLVED (owner decision 2026-09-25: option (a), narrowly scoped)**:
      - One named hard-delete exception, `deleteF013M1ProofOrders()` in `scripts/seed-test-fixtures.ts`, for **disposable pre-financial proof fixtures only**. It deletes nothing (it throws) unless EVERY existing proof order:
        - has one of the 10 exact reserved ids `13000000-0000-4000-8000-0000000001xx` (read by exact list; no wildcard/pattern/range filter);
        - carries the proof marker `orders.correlation_id = 13000000-0000-4000-8000-0000000001ff`, stamped only by `--f013-m1-live-setup`/`--f013-m1-live-probe`;
        - is owned by the Foundation buyer-only fixture org;
        - has **0** rows in every table that references `orders(id)`: `order_items`, `payments` (so no proof/review), `inventory_reservations`, `proforma_invoices`, `order_financials` (no amount/economic snapshot), `order_shipments`, `payouts`, `tax_invoices`, `support_tickets`.
      - The single delete is `orders … .in("id", <checked rows>).eq("correlation_id", marker)`. Only the proof orders' own `order_status_history` cascades; audit rows remain.
      - `--f013-m1-live-verify` (read-only) reports per-table counts for the exact ids.
    - **Generic rule intact**: `tests/commerce/f013-fixtures.test.ts` still asserts no `.delete(` anywhere in the F013 cleanup region except that one function, and exactly one `.delete(` in the whole F013 block. The exception is pinned by `exceptionViolations()`: exact ids, marker, fixture org, every dependent table (the list must equal the schema's tables referencing `orders(id)`), refusal before the delete, one delete only. 10 mutation cases prove each condition bites. The only allowlist addition is the exact-id expression `F013_M1_ORDER_IDS[key]` (the probe's update helper); the "no wildcard/pattern/range filter" rule is unchanged.
    - **Post-cleanup verification (read-only, production)**: all 10 exact proof ids have 0 rows in `orders`, `order_status_history` and all 9 dependent tables.
    - Affected static suites after the change: `tests/commerce` (4 files) + `migration-layout` + `historical-008-unchanged` → **161 passed, 16 skipped** (the gated live suite), 0 failed; typecheck, eslint and `git diff --check` clean. No further live suite was run.
### M2a — delivery destinations
- [X] T026 MP-1 Author M2a — `supabase/migrations/20260925103000_feature_013_delivery_destinations.sql`, rollback, postflight
  - Depends: T025
  - Accept: data-model §2.3 + `orders.delivery_destination_id`/`destination_snapshot`; `delivery_method` CHECK equals the T006-recorded value set; default-per-org partial unique; RLS (owning org members ∨ PA read; no client writes).
  - **Batch B (2026-09-25)**: AUTHORED, **NOT APPLIED**. Files:
    - `supabase/migrations/20260925103000_feature_013_delivery_destinations.sql`;
    - `supabase/rollback/20260925103000_feature_013_delivery_destinations.rollback.sql`;
    - `supabase/maintenance/20260925_feature_013_delivery_destinations_postflight.sql` (16 checks + `ALL CHECKS PASSED`).
  - `delivery_destinations` has exactly the 16 §2.3 columns, and `delivery_method` CHECK = `{Courier}`: the T006 §3 value set, re-verified by a read-only probe on 2026-09-25 (shipping_rules 0 rows; order_shipments 1,273 × `Courier`). Other checks: ISO-2 upper country, E.164 phone, field lengths, the retired pair and retired-never-default CHECKs, the unique partial `uq_delivery_destination_default_per_org (organization_id) WHERE is_default AND retired_at IS NULL`, an active-org index and `set_updated_at`.
  - RLS enabled + forced; revoked from public/anon/authenticated; `authenticated` gets SELECT only; one policy `delivery_destinations_member_read` = `is_org_member(organization_id) OR is_platform_admin()`; no write policy or grant (writes via the M4a RPCs).
  - `orders.delivery_destination_id` (FK, no cascade → soft retire only) + `orders.destination_snapshot` (jsonb), with a pair CHECK, a snapshot shape CHECK (the 7 §2.1 keys; `address_lines` array) and a partial FK index.
  - Guard: M1 applied with the `validate_order_transition` v2 fingerprint `603d04c5…`; delivery methods in use ⊆ {Courier}; the kill switch still off; no M2a object present; required helpers; the migration role bypasses RLS.
  - Design decisions for T029:
    - **Destination-field protection**: `guard_order_destination_fields()` + `trg_orders_destination_fields_guard` (BEFORE INSERT OR UPDATE OF the two columns) refuses any non-internal write, so the existing buyer INSERT/UPDATE order policies cannot set them. This applies T023 decision 3 to the M2a columns; nothing else on `orders` is changed.
    - No audit trigger on `delivery_destinations`: generic `write_audit_log` would copy addresses/phones into `audit_logs`; the redacted commerce audit arrives with the M4a RPCs (AUD-006).
    - `current_proforma_id` is not in M2a: it references the versioned proforma, so it belongs to M2b.
- [X] T027 MP-2 Static tests — `tests/commerce/migrations/m2a-destinations.test.ts`
  - Depends: T026
  - **Batch B (2026-09-25)**: 16/16 pass; the T019 conventions test also covers M2a (18/18). Expected values are read from `data-model.md` §2.3 (the 16 columns) and the PREFLIGHT-REPORT T006 §3 line (`{Courier}`), and the M1 fingerprint is computed from the M1 file.
    - Covers: MP-2 rules and no top-level DML; column set; NOT NULL/format/length CHECKs; delivery_method = T006 set and the guard's in-use check; the default-per-org partial unique + retired rules; RLS forced; grants exactly `select → authenticated`; exactly one SELECT policy; the two orders columns + pair/shape checks; the guard trigger body; `validate_order_transition`/policies/`commerce_settings` untouched.
    - Rollback: drops exactly the 8 M2a objects and nothing of M1; it refuses on rows, destination-bearing orders or M2b+; the M1 rollback already refuses while M2a exists.
- [X] T028 MP-3 Dry-run M2a
  - Depends: T027
  - **Batch B (2026-09-25): COMPLETE.** OPERATOR evidence (authoritative): `npx supabase db push --linked --dry-run` passed and listed exactly one pending migration, `20260925103000_feature_013_delivery_destinations.sql`. The agent-side notes follow.
    - `npx supabase db push --linked --dry-run` (linked ref `mxejnutukgxyccnohglo` verified) was **refused** for the agent's CLI account: `DbConfigLoginRoleStatusError … 403` (as at T001/T022). **OPERATOR** must run it; expected: exactly one pending migration, `20260925103000_feature_013_delivery_destinations.sql` (remote head = `20260925100000`).
    - Local shadow apply (`supabase db reset`): **not available** — the Docker Desktop daemon is not running. Not attempted.
    - Supplementary execution check (not a substitute; `migration-evidence/m2a-supplementary-pglite.log`): in-memory PGlite, same T006-fingerprinted fixture as M1 plus Supabase-style default privileges and production's anon revocations. **63/63 passed**:
      - M1 applies and its postflight passes; the M2a guard refuses a non-Courier method in use and a kill switch that is on; M2a applies; a re-apply is refused; postflight `ALL CHECKS PASSED`;
      - CHECK probes: method, country, phone, label, default-per-org, retired default, retired pair;
      - orders fields: non-internal INSERT/UPDATE refused, internal allowed, pair/shape enforced, FK blocks deleting a referenced destination; LEGACY non-status updates and client DRAFT→CONFIRMED unaffected;
      - **RLS as the real roles**: org A member sees only A, org B member only B, a signed-in non-member (e.g. a seller of the buyer's order) 0 rows, platform admin both; authenticated INSERT/UPDATE/DELETE → permission denied; anon SELECT → permission denied; a buyer member setting destination fields on its own DRAFT order → `order_field_not_client_writable`;
      - rollback refused while a destination exists; then rollback restores the orders columns/constraints/indexes/policies/triggers, every public function and every relation **identically**; the M1 postflight passes again; M2a re-applies and passes its postflight.
    - Static: `tests/commerce` + `migration-layout` + `historical-008-unchanged` → 177 passed, 16 skipped (the gated live suite). Every other static test that reads `supabase/migrations/` (26 files, live-capable ones excluded) → 595 passed, 22 skipped, 0 failed. Typecheck and eslint clean. No live suite was run.
- [X] T029 MP-4 **GATE** review M2a
  - Depends: T028
  - **VERDICT: GO / PASS** — reviewer: owner, 2026-09-25. Agent review found no new blocker: re-checked after the decisions, the M2a files are unchanged, `tests/commerce/migrations` + `historical-008-unchanged` + `migration-layout` pass 153/153, and no tracked file under `supabase/` or `specs/008-*` differs from HEAD.
  - Owner decisions:
    - **D1 APPROVED**: keep `trg_orders_destination_fields_guard` (non-workflow callers cannot set `delivery_destination_id`/`destination_snapshot`).
    - **D2 APPROVED**: no generic audit trigger on `delivery_destinations` (it would copy address/phone PII); the redacted, audited workflow arrives in M4a.
    - **D3 APPROVED**: `current_proforma_id` stays deferred to M2b.
    - **R1 → required M3 condition** (recorded on T056/T057).
    - **R2 → required M4b condition** (recorded on T077).
    - **R3**: production apply requires a quiet write window.
    - **R4**: expected point-in-time M1 postflight behaviour (its "no M2a+ object" row reads false once M2a exists).
    - **R5**: rollback procedure accepted (rollback file, then `supabase migration repair --status reverted 20260925103000`).
- [X] T030 MP-5 **OPERATOR** apply M2a + postflight
  - Depends: T029
  - **OPERATOR evidence (2026-09-25, authoritative)**: `npx supabase db push --linked` applied `20260925103000_feature_013_delivery_destinations.sql` to the linked production project. The postflight `supabase/maintenance/20260925_feature_013_delivery_destinations_postflight.sql` returned **17 rows, every `ok = true`**, and the last row was `999 | ALL CHECKS PASSED | true`.
- [X] T031 MP-6 Live proof — `tests/commerce/rls-destinations.live.test.ts`
  - Depends: T030
  - Accept: another org's members, sellers of the buyer's orders and anon read 0 destination rows; direct INSERT/UPDATE by `authenticated` is refused.
  - **Batch B (2026-09-25): COMPLETE — owner decision (a), with ONE explicitly DEFERRED assertion (not a waiver; see the end of this entry).** Owner-authorized run; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1` set; no other live suite run.
    - `F013_LIVE=1 npx vitest run tests/commerce/rls-destinations.live.test.ts`:
      - **11/11 passed** (second run). The first run was 10/11: the fixture wrapper parsed the operator helper's JSON line instead of the setup result (harness fix: take the LAST JSON line). Its cleanup was verified complete before the re-run.
    - What it proved:
      - the owning org reads only its own rows;
      - a member of another organization (the seller-capable buyer-and-seller org) reads 0 of the owner's rows, only its own, and 0 by direct id;
      - anon → no table privilege, 0 rows;
      - the platform admin (exact F013 identity `admin+f013-test@example.com`, ADMIN) reads both;
      - authenticated INSERT, UPDATE (own and foreign row) and DELETE are refused, and the rows are unchanged;
      - a buyer cannot attach its own or a foreign destination to its own DRAFT order (`order_field_not_client_writable`);
      - LEGACY DRAFT → CONFIRMED is unchanged; the buyer still reads its orders, none with a destination.
    - Fixtures (minimum): 2 synthetic PII-free destinations, exact ids `13000000-0000-4000-8000-0000000002a1/2b1`, labelled `F013 T031 PROOF FIXTURE`, owned by the Foundation buyer-only and buyer-and-seller orgs; the F013 admin operator (existing disposable helper); the M1 proof orders (approved M1 exception) for the LEGACY checks. No listing, order item, configuration or financial row.
    - Cleanup (exact ids): a **second named exception**, `deleteF013T031ProofDestinations()`, pinned by the T016 guard like the M1 one:
      - exact ids, proof label, Foundation fixture orgs, no order reference, refusal first, a single delete;
      - 7 mutation cases; the block has exactly 2 deletes, one in each exception; the generic no-hard-delete rule is unchanged;
      - `tests/commerce/f013-fixtures.test.ts` 29/29.
    - Post-cleanup verification (read-only, production), unchanged after both runs:
      - T031: `{proofDestinations 0, allDestinations 0, ordersWithDestinationId 0, ordersWithDestinationSnapshot 0, destinationAuditRows 0, proofIdAuditRows 0, f013AdminPlatformPrivilege 0}`;
      - M1 proof ids: 0 rows in all 11 tables;
      - state: 9 offers all coded, 2,004 orders all `LEGACY`, checkout disabled.
    - **Owner decision (a), 2026-09-25 — DEFERRED, NOT WAIVED**: the exact "seller linked to the buyer's order" destination-isolation assertion moves to **T056/M3** (whose dedicated two-seller fixture order exists by design). Here it was proven only with a seller-capable member of another organization: no existing order links a test buyer to a member seller with a test login, and creating one would need an order_items cleanup exception, which was deliberately NOT created. The fixture no-hard-delete guard is unchanged.
### M2b — proforma versioning and frozen economics (per-seller economic snapshots, bank instruction snapshots, shipping group snapshots, seller commission assignment snapshot)
- [X] T032 MP-1 Author M2b — `supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql`, rollback, postflight
  - Depends: T031
  - Accept:
    - Implements data-model §3.1–§3.7, including the funding/cap columns and CHECK identities (FIN-006/007/011/012).
    - The per-seller commission "assignment" is the snapshot of `commission_policy_id`, `commission_tier_id`, `commission_rate_snapshot` and `seller_qualifying_quantity_kg` per line and per seller settlement (FIN-013). **No seller-specific commission override table** is introduced (not in the approved plan).
    - `protect_proforma_snapshot`, `prevent_snapshot_mutation`, deferred `check_seller_settlement_totals`, `freeze_order_financials`; redacted audit functions (no bank values).
    - The guard aborts if any order has > 1 proforma or a non-terminal `LEGACY` order holds an `ISSUED` proforma not listed as drained in T009.
  - **Batch B (2026-09-25)**: AUTHORED, **NOT APPLIED**. Files:
    - `supabase/migrations/20260925106000_feature_013_proforma_versioning_snapshots.sql`;
    - `supabase/rollback/20260925106000_feature_013_proforma_versioning_snapshots.rollback.sql`;
    - `supabase/maintenance/20260925_feature_013_proforma_versioning_snapshots_postflight.sql` (23 checks + `ALL CHECKS PASSED`).
  - **Owner decisions (2026-09-25, before authoring)**:
    - **D1 — checkout_order**: the live legacy `checkout_order` (T006 md5 `75e07c35…`) upserted with `on conflict (order_id)`, whose only arbiter was `proforma_invoices_order_id_key`. PGlite proves that dropping the key makes every legacy checkout fail. M2b therefore re-creates `checkout_order` with **one statement changed**: `UPDATE … WHERE order_id` then `INSERT` if not found, under the order `FOR UPDATE` lock it already takes. Every other byte equals T006 (new md5 `54810aad…`). The rollback restores the T006 body.
    - **D2 — header totals**: `NOT NULL DEFAULT 0`, as a LEGACY compatibility placeholder only. A BANK_TRANSFER_V1 header is never valid merely because it is zero:
      - an all-or-none snapshot marker (8 columns) plus a legacy-placeholder CHECK;
      - flow ↔ marker agreement on INSERT;
      - a deferred check that header totals = frozen lines + groups, and that the snapshot is complete.
      - Legacy-facing views/UI must show legacy header totals as N/A.
  - Guard:
    - M1 v2 fingerprint `603d04c5…` and M2a objects present;
    - `checkout_order` = T006 (with its flags/ACL) and `admin_review_payment` = T006;
    - T006 §9 text of `proforma_invoices_order_id_key` / `proforma_invoices_status_check`;
    - no order with > 1 proforma;
    - no non-terminal LEGACY order holding an ISSUED proforma, except the T009 drain-list codes `ORD-20260924-0006142/6143`;
    - no BANK_TRANSFER_V1 order outside DRAFT; kill switch off;
    - trigger baseline: `proforma_invoices` = only `trg_proforma_invoices_updated_at`; no user trigger on items/order_financials (T029 R2);
    - no M2b object present; `audit_logs` columns; RLS-bypassing role.
  - Design decisions for the T035 reviewer: see the T035 review package.
- [X] T033 MP-2 Static tests — `tests/commerce/migrations/m2b-snapshots.test.ts`
  - Depends: T032
  - Accept: every CHECK identity is present; snapshot tables have no UPDATE/DELETE path; `proforma_bank_instructions` has no generic `write_audit_log` trigger.
  - **Batch B (2026-09-25)**: **59/59 pass**; the T019 conventions test also covers M2b (18/18). Expected values are read from `data-model.md` §3.1–§3.7, the T006 CSVs (§5 fingerprints, §8 triggers, §9 constraints), the PREFLIGHT-REPORT T009 drain line, and the 007/M1 files.
    - Covers:
      - MP-2 rules;
      - exact column sets per §3.1–§3.7 (+ `commission_policy_id` on settlements per T032) and money/quantity/rate types;
      - the assignment snapshot per line and per settlement; no override/commission table;
      - every FIN-006/007/011/012 identity, the composite FKs, and the legacy-placeholder/marker discipline;
      - the deferred checks (and what they compare);
      - `protect_proforma_snapshot` (lifecycle allow-list, exactly the §7.2 edges, workflow-only, never deleted, legacy passthrough);
      - `prevent_snapshot_mutation` on 5 tables; `freeze_order_financials`; the pointer guard;
      - AUD-006/R2: no generic audit trigger, allow-list audits, last-4 only;
      - the guard inputs;
      - `checkout_order` = the T006 body with exactly the one statement replaced (FOR UPDATE lock precedes it; rollback = T006 md5);
      - the rollback drops exactly M2b and restores the T006 CHECK and `UNIQUE (order_id)`.
    - 10 mutation cases prove the M2b-specific rules bite.
- [X] T034 MP-3 Dry-run M2b
  - Depends: T033
  - **Batch B (2026-09-25): COMPLETE.**
    - `npx supabase db push --linked --dry-run` (linked ref `mxejnutukgxyccnohglo` verified) — **agent-run, read-only; the CLI account was accepted this time**:
      ```
      Initialising login role...
      DRY RUN: migrations will *not* be pushed to the database.
      Connecting to remote database...
      Would push these migrations:
       • 20260925106000_feature_013_proforma_versioning_snapshots.sql
      {"upToDate":false,"dryRun":true,"migrations":["20260925106000_feature_013_proforma_versioning_snapshots.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
      ```
      Exactly one pending migration (remote head `20260925103000`).
    - Local shadow apply (`supabase db reset`): **not available**; the Docker Desktop daemon is not running. Not attempted.
    - Supplementary execution check (not a substitute; `migration-evidence/m2b-supplementary-pglite.log`): in-memory PGlite, the M1/M2a fixture plus the production columns the legacy checkout needs. **150/150 passed**:
      - guard negatives:
        - refuses: 2 proformas per order; a non-drained HOLD+ISSUED legacy order; `checkout_order` drift; kill switch on; V1 order outside DRAFT; an extra (audit) trigger on `proforma_invoices`; status-CHECK drift;
        - maps: the T009-listed HOLD order and an EXPIRED+ISSUED legacy order;
      - apply; re-apply refused; postflight `ALL CHECKS PASSED`; legacy proforma rows byte-identical;
      - **LEGACY equivalence (the real legacy `checkout_order`, pre- vs post-M2b)**: first checkout, idempotent retry and re-checkout over an existing VOID proforma (the upsert's UPDATE path, same row reused) give identical results and identical proforma/items/financials/reservation/payment/offer/position rows. Also:
        - legacy `status → PAID`, the fixture-cleanup deletes and order_financials rewrites still work;
        - a legacy row cannot acquire Feature 013 values;
      - snapshot integrity:
        - a balanced 2-seller + Hills-line snapshot with a seller promotion and a capped Hills promotion commits;
        - refused: zero-placeholder header; no-line header; a 1-cent-off total; FIN-007 settlement mismatch; negative seller_net/hills_share; over-cap Hills discount; seller funding on a Hills line; platform-scope/seller-funding; Hills discount booked as seller-funded; FIN-013 Q_s from the whole order; tier mismatch; commission rounding; missing settlement/economics/bank; wrong payment reference; masked-bank mismatch or a full number in it; VAT; gross; partial marker; validity; F013 proforma on a LEGACY order; marker-less V1 proforma; pointer rules; order_financials mismatch/missing/non-workflow;
      - after a real commit:
        - every UPDATE/DELETE on the 6 snapshot tables and the header money/snapshot columns is refused; the V1 order cannot be deleted;
        - §7.2 edges only, workflow-only, stamps set once;
        - `uq_open_proforma_per_order` holds even with triggers bypassed;
        - replacement after expiry works; a replacement while v1 is ISSUED is refused;
        - order_financials frozen after PROFORMA_ISSUED and never deleted;
      - **AUD-006/R2**: the audit rows exist but contain no account number, IBAN, address, phone, buyer name/tax number or promotion code (last-4 only);
      - RLS as the real roles: buyer/anon SELECT denied; service_role read-only; buyer API writes change 0 rows; the legacy buyer read still works;
      - rollback refused while snapshots exist;
      - fresh DB: apply → legacy scenario → rollback → the catalogue is **identical** to pre-M2b (columns of the 4 touched tables, every constraint, index, policy, trigger, function body/flags/ACL, relation RLS/ACL); `checkout_order` md5 back to `75e07c35…`; M1/M2a postflights as before M2b; re-apply refused while the scenario's legacy HOLD orders hold ISSUED proformas, then accepted once terminal; postflight passes.
    - Regression (static only; live-capable files excluded per the fixture-session/`createClient(`/`*_LIVE` rule): every test file that reads the migration/rollback/maintenance SQL + `tests/commerce` + finance/orders validation → **32 files: 768 passed, 1 failed**.
      - The failure is **pre-existing and not M2b**: `tests/admin/run-f-static.test.tsx` "shipping_rules has no consumer in any migration" matches the read-only `select delivery_method … from public.shipping_rules` in the **applied M2a guard** (`20260925103000`, commit 3dc8757). No M2b file reads `shipping_rules`. M2a was not changed; owner decision needed (see the T035 package).
    - `npm run typecheck` clean; eslint clean on the new test; `git diff --check` clean. Only 4 new files; no tracked file under `supabase/` or `specs/008-*` changed. No live suite was run; production was not modified.
- [X] T035 MP-4 **GATE** review M2b
  - Depends: T034
  - **VERDICT: GO / PASS** — reviewer: owner, 2026-09-25.
  - Owner decisions:
    - (c) **APPROVED**: `order_financials.base_subtotal = merchandise_gross` (before discounts); M4b must follow it.
    - **F1 → hard M3 condition**: before M4b, M3 (T057) must remove seller access to the proforma header and line data (`proforma_view`/`proforma_items_view`), including `buyer_snapshot`/`destination_snapshot`/`bank_account_masked`, and add the rls-storage §1 policies for the 4 new tables. T056/T062 must prove it.
    - D1 **APPROVED**: keep the `checkout_order` compatibility patch.
    - D2 **APPROVED**: keep the LEGACY-only `NOT NULL DEFAULT 0` placeholder behaviour.
    - F9 **RESOLVED**: `tests/admin/run-f-static.test.tsx` now ignores only read-only `do $guard$` blocks. A guard that writes (DML/DDL/grant/revoke) or schedules (`cron.`) is still checked, and so is any consumer outside a guard (4 new assertions prove it). The M2a guard itself is unchanged.
      - Rerun: `run-f-static` 16/16. The affected static regression (the same 32 files as T034) → **769 passed, 0 failed**; typecheck, eslint and `git diff --check` clean.
  - Before T036:
    - the F7 read-only pre-check must return 0 rows;
    - T014 backup and quiet-window confirmation (R3);
    - expected postflight: **24 rows** (checks 1–23 + `999 | ALL CHECKS PASSED`), every `ok = true`.
  - **Review package (agent, 2026-09-25)** — verified:
    - **T006 fidelity**:
      - the guard carries the exact §5 fingerprints (`checkout_order`, `admin_review_payment`), the §9 texts of the two replaced constraints and the §8 trigger baseline (T033 reads them from the CSVs);
      - `checkout_order` differs from T006 by exactly one statement (T033 textual proof), and the real legacy checkout behaves identically (PGlite A/B).
    - **Rollback symmetry**: full-catalogue identical to pre-M2b after the rollback (PGlite C); `checkout_order` md5 = T006. The guard refuses once any snapshot row, Feature 013 proforma/line, new status, second version, order pointer or order_financials pointer exists, or M2c+ is applied. The M2a rollback already refuses while M2b exists.
    - **History unchanged**: no tracked file under `supabase/` or `specs/008-*` differs from HEAD; 4 new, paired files only; `historical-008-unchanged` and `migration-layout` pass.
    - **Design decisions (not dictated verbatim by the data-model)**:
      - (a) **Stricter than §3 (derived from R-5/R-3/§3.6)**:
        - `gross = round(qty × unit_price, 2)`; `unit_price = list_unit_price` unless a tier applies;
        - `commission_on_gross` and `commission` rounding identities;
        - `valid_until = issued_at + validity_hours_snapshot`;
        - status/lifecycle-stamp consistency;
        - masked bank = `****` + ≤ 4 chars, consistent with the instructions; `payment_reference` must quote the order and proforma codes;
        - line VAT = `round(net × rate, 2)`; shipping VAT per the tax base;
        - one line per offer per proforma.
      - (b) **Deferred `check_proforma_snapshot_totals`** (added to meet D2): at commit a V1 proforma needs:
        - ≥ 1 line, all Feature 013, each with economics;
        - ≥ 1 group, each with lines and group merchandise = its lines;
        - header = Σ lines/groups;
        - a settlement per seller of the lines;
        - bank instructions;
        - the order's `destination_snapshot` equal when the order points to it;
        - for the newest version, `order_financials` pointing to it with the mapping below.
      - (c) **order_financials mapping** that M4b must follow:
        - `base_subtotal = merchandise_gross`, `discount_amount = discount_total`;
        - shipping/VAT/buyer total = header;
        - commission/seller_net/hills_share/discount split = Σ settlements;
        - `total_quantity_kg = Σ lines`; tax snapshot = header.
        - Owner to confirm `base_subtotal` = gross (the alternative is net).
      - (d) `protect_proforma_snapshot` also runs **BEFORE INSERT** (contract said UPDATE/DELETE): LEGACY order ⇔ no marker; V1 inserts start ISSUED while the order is DRAFT/PROFORMA_ISSUED; version n supersedes the closed n−1 of the same order. Status changes require `app.internal_transition` (M4c/M5b must set it). `file_asset_id` is frozen on Feature 013 rows (a PDF cannot be attached after issuance).
      - (e) `freeze_order_financials` also covers **INSERT/DELETE** (a delete+insert would bypass an UPDATE-only freeze): V1 writes require the workflow, a proforma pointer and DRAFT/PROFORMA_ISSUED; V1 rows are never deleted; LEGACY rows unchanged, but can never point to a proforma.
      - (f) Immutability binds **Feature 013 rows only** on the existing tables (`proforma_invoices`, `proforma_invoice_items`): the legacy writers and the fixture cleanup (`seed-test-fixtures.ts` deletes legacy items/orders) keep working. The 4 new tables are fully append-only.
      - (g) **No foreign key into the Feature 010 configuration tables**: `tax_rule_id`, `commission_policy_id`/`commission_tier_id`, `shipping_rule_id` and `payment_account_id` are plain snapshot ids, so no RI trigger lands on those tables (Feature 010 invariant) and the RUN F fixture cleanup is not blocked. `price_tier_id`/`promotion_id` have no FK yet (their tables arrive in M2d; M2d may add them).
      - (h) **Composite same-row FKs**:
        - `orders(current_proforma_id, id)` and `order_financials(proforma_id, order_id)` → `proforma_invoices(id, order_id)`;
        - items → their group (same proforma, seller, warehouse);
        - economics → their line (same proforma, seller, type, gross, net).
      - (i) Hills lines/settlements: `commission_on_gross = commission_basis = 0` and no tier fields.
      - (j) Feature 013 lines and groups require `warehouse_id` (an offer without a warehouse cannot be issued).
      - (k) `promotion_code_applied` is a boolean ("the buyer's explicit code is this line's promotion").
      - (l) `buyer_snapshot` keys = `legal_name, display_name, tax_number, country_code`.
      - (m) New tables: RLS forced, **no policy and no client grant until M3**; `service_role` SELECT only (rls-storage "revoke even service_role writes").
      - (n) Redacted audits:
        - `write_audit_log_proforma_invoices` covers V1 rows only (legacy unchanged). Its allow-list has no buyer/destination/bank snapshot and no promotion code (a boolean only).
        - `write_audit_log_proforma_bank_instructions` records ids, currency and last-4 only.
    - **Findings / conditions for the reviewer**:
      - **F1 (M3 condition, C2)**: the existing `proforma_view`/`proforma_items_view` (`can_view_order`) still let a seller of the order read the header (now incl. `buyer_snapshot`/`destination_snapshot`/`bank_account_masked`) and every line's promotion fields. No V1 proforma can exist before M4b and M3 precedes M4b, so there is no exposure today. **M3 (T057) must replace those policies and add the rls-storage §1 policies for the 4 new tables before M4b.**
      - **F2 (T029 R2 status)**: M2b adds no generic audit path, and its own audits are proven redacted. M2b adds `orders.current_proforma_id` (a uuid, harmless) to `trg_audit_orders` payloads. **R2 itself stays open for M4b**: `trg_audit_orders → write_audit_log` would copy `orders.destination_snapshot` once M4b writes it.
      - **F3 (M4a follow-up)**: the M4a guard's "checkout_order fingerprint" must now pin the M2b body `54810aadbcb05915d49374d5ceae738e`, not T006.
      - **F4 (T037 planning)**:
        - The deferred completeness checks and the read-only `service_role` make PostgREST per-table fixture inserts impossible by design. T037 must build its snapshots in **one SQL transaction** (operator-run proof script, `SET CONSTRAINTS ALL IMMEDIATE`, ideally ending in ROLLBACK), or through the M4b RPC.
        - The T037 Accept item "`hills_funded_discount > commission_on_gross` rejected" surfaces as the Hills-share ≥ 0 CHECK: the explicit clause is implied by the other identities. T033 pins the clause statically.
      - **F5 (PostgREST)**: `orders.current_proforma_id` creates a second orders↔proforma_invoices relationship. Any future embed must name the FK (`proforma_invoices!proforma_invoices_order_id_fkey`). No current embed exists (grep).
      - **F6 (operational, R3)**: ACCESS EXCLUSIVE locks on `proforma_invoices`, `proforma_invoice_items`, `order_financials` and `orders`, plus SHARE ROW EXCLUSIVE on the FK targets (`coffee_offers`, `warehouses`, `organizations`, `profiles`). The tables are small and ADD COLUMN defaults are fast, but a quiet write window is required.
      - **F7 (apply-time guard)**: live suites create legacy HOLD orders with ISSUED proformas (e.g. `ORD-20260924-0006201` in Batch A). If any exist at T036, the guard refuses with nothing applied: drain them with `expire_order_hold` first. Read-only pre-check for the operator:
        `select o.order_code, o.status from orders o join proforma_invoices pi on pi.order_id = o.id where o.commerce_flow = 'LEGACY' and pi.status = 'ISSUED' and o.status not in ('COMPLETED','EXPIRED','VOID','CANCELLED','PAYMENT_REJECTED');` plus `select order_id from proforma_invoices group by 1 having count(*) > 1;`
      - **F8 (point-in-time postflights, R4)**: the M2a postflight row 16 reads false once M2b exists; the M2b postflight rows 5/11/18/19 read false once M4b writes V1 rows.
      - **F9 (pre-existing, not M2b)**: `tests/admin/run-f-static.test.tsx` fails on the applied M2a guard's read-only `shipping_rules` probe. Options: (a) scope that audit to exclude read-only `do $guard$` blocks (test change), or (b) accept and record. M2a is not edited.
      - **F10 (rollback data loss, by design)**: the rollback only runs while no Feature 013 row exists; it then drops only empty structures and placeholder columns. It needs `supabase migration repair --status reverted 20260925106000`.
      - **F11 (vocabulary)**: app constants (`PROFORMA_STATUSES` = 3 values) stay valid because legacy rows cannot hold the new statuses (placeholder CHECK); T064 aligns the vocabulary.
    - **Agent recommendation: GO**, conditional on:
      - acceptance of D1/D2 as implemented and design decisions (a)–(n), especially (c) `base_subtotal = gross`;
      - F1 recorded as a hard M3 condition;
      - F7's pre-check being empty at apply time, plus the T014 backup and quiet-window confirmation.
- [X] T036 MP-5 **OPERATOR** apply M2b + postflight
  - Depends: T035
  - **Pre-apply drain (2026-09-25)**: the F7 pre-check found 4 non-terminal LEGACY HOLD orders holding ISSUED proformas (`ORD-20260925-0006424/6425/6427/6429`).
    - Read-only inspection:
      - all four belong to the Foundation Buyer-And-Seller fixture org and were created by the 12:30 UTC legacy regression run;
      - each has one ACTIVE reservation past its expiry (together exactly the listing's and the position's 10 kg reserved);
      - each has a PENDING payment with no proofs, and no payouts or tax invoices.
    - The operator drained them with `public.expire_order_hold(uuid)` (no direct status update, no delete).
    - The pre-check then returned 0 rows, and the >1-proforma check returned 0.
  - **OPERATOR evidence (2026-09-25, authoritative)**: `npx supabase db push --linked` applied `20260925106000_feature_013_proforma_versioning_snapshots.sql`. The postflight (`npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_proforma_versioning_snapshots_postflight.sql`) returned **24 rows**: checks 1–23 all `ok = true`, and the last row was `999 | ALL CHECKS PASSED | true`.
  - Note: an earlier SQL-editor run reported `relation "a" does not exist`. The current file was re-run read-only by the agent against the linked project and passed 24/24; the error came from the text executed in the editor, not from the file or any M2b object.
- [X] T037 MP-6 Live proof — `tests/commerce/snapshot-immutability.live.test.ts`
  - Depends: T036
  - Accept:
    - service-role fixture inserts of balanced snapshot rows succeed;
    - unbalanced rows (FIN-007 mismatch, negative `seller_net`/`hills_share`, `hills_funded_discount > commission_on_gross`, seller funding on a Hills line) are rejected;
    - UPDATE/DELETE on snapshots is rejected;
    - legacy proforma reads still work.
  - **Batch B (2026-09-25): COMPLETE.** Owner-authorized; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1` set; no other live suite was run.
    - `F013_LIVE=1 npx vitest run tests/commerce/snapshot-immutability.live.test.ts` → **3/3 passed**. The proof block reported **59/59 cases ok**.
    - **Method (T035 F4, the approved one-transaction setup)**:
      - `tests/commerce/t037-snapshot-proof.ts` builds ONE `DO` block, executed by `supabase db query --linked` (role `postgres`).
      - Fixtures, every probe (each in its own savepoint), and the deferred checks forced with `SET CONSTRAINTS ALL IMMEDIATE` (the triggers COMMIT would run) all happen inside that block.
      - The block always ends in `raise exception 'T037_RESULT:<base64 json>'`, so everything it wrote rolls back atomically.
      - Deviation from the Accept wording: the inserts run as the table owner in one SQL transaction, not as `service_role`. By design `service_role` is read-only on the snapshot tables (proved below), and PostgREST per-table inserts cannot satisfy the deferred completeness checks.
      - A true COMMIT of a Feature 013 snapshot was not performed in production (it would leave undeletable rows); it was proved in PGlite (T034).
    - Fixtures:
      - reserved ids `13000000-0000-4000-8000-0000000003xx`: 1 BANK_TRANSFER_V1 DRAFT order and 2 LEGACY orders owned by the Foundation buyer-only org and user;
      - order items on published Feature 005 Hills listings LST-0000002/3/5; READY Courier shipment plans;
      - one pre-existing VOID legacy proforma (re-checkout path);
      - member-seller economics attributed in the snapshot to the Foundation buyer-and-seller org (no member-seller listing exists in production);
      - the real active AE VAT rule (`order_financials.tax_rule_id` keeps its pre-existing FK).
    - Proved live:
      - **LEGACY checkout unchanged** (the real `checkout_order`, as the buyer member):
        - order → HOLD with a 20-minute hold;
        - one ISSUED placeholder proforma whose `valid_until` = hold expiry, and one legacy line 2 kg × 5.00;
        - order_financials 10.00 + 12.50 + 0.50 = 23.00, no pointer;
        - ACTIVE 2 kg reservation, PENDING 23.00 payment, listing and position +2 kg;
        - idempotent retry returns the same proforma;
        - re-checkout over a VOID proforma reuses the same row (VOID → ISSUED);
        - legacy `status → PAID` still accepted; legacy rows cannot acquire Feature 013 values.
      - **Deferred totals**:
        - a zero-placeholder V1 header is accepted at INSERT and refused when the deferred checks run (`no lines`);
        - refused: zero header over real lines; 1-cent header; FIN-007 settlement mismatch; negative seller_net; negative hills_share; Hills discount above commission_on_gross; seller funding on a Hills line; Hills discount booked as seller-funded; FIN-013 Q_s from the whole order; missing bank instructions; a full account number in the masked copy; mismatched and missing order_financials; a V1 proforma on a LEGACY order; V1 order_financials outside the workflow.
      - **Frozen snapshot**:
        - header 900.00/56.00/844.00/25.00/42.20/911.20, validity 24 h;
        - 3 lines, 3 economics rows, 2 groups, 2 settlements (member: policy/tier 3 %/Q_s 120, seller net 630.50), 1 bank instruction;
        - order_financials pointing to the proforma (base 900.00 = gross, Hills share 213.50).
      - **Immutability**:
        - refused: UPDATE of header money/destination; UPDATE and DELETE on all 5 snapshot tables; DELETE of the proforma and of the V1 order; a later extra group;
        - status change outside the workflow refused; workflow ISSUED → CONFIRMED → PAID accepted; ISSUED → PAID refused;
        - replacement while v1 is ISSUED refused;
        - order_financials frozen after PROFORMA_ISSUED and never deleted; pointer outside the workflow refused;
        - `service_role` INSERT denied; `authenticated`/`anon` SELECT denied.
      - **AUD-006 / R2**: the redacted header and bank-instruction audit rows exist (last-4 only). No audit row written in the proof contains the raw account number, IBAN, address, phone, buyer tax number/legal name or promotion code. No generic `write_audit_log` trigger exists on any proforma table or order_financials. (R2 for `orders.destination_snapshot` remains an M4b condition; the proof order carried no destination.)
    - **Cleanup (independent read-only verification after the run)**: 0 T037 orders/proformas/lines/shipments; 0 snapshot rows; 0 Feature 013 proformas, lines, order_financials pointers or order pointers; 0 M2b/T037 audit rows; 0 non-terminal LEGACY HOLD+ISSUED orders; 0 ACTIVE reservations; LST-0000002 and its position reserved 0.000.
    - **Production state**: 2,004 orders (0 BANK_TRANSFER_V1), 10 proformas, checkout disabled — identical to before the proof. Only sequence values (order/proforma codes, audit identity) were consumed by the rolled-back transactions (3 proof executions during authoring and 1 suite run).
    - Static: typecheck and eslint clean; `tests/commerce` without the flag → 177 passed, 30 skipped (the 3 gated live suites).

### M2c — reconciliation, manual adjustments, final-invoice record, fulfillment columns
- [X] T038 MP-1 Author M2c — `supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql`, rollback, postflight
  - Depends: T037
  - Accept: data-model §5.4, §5.5, §5.6, and the `order_shipments` fulfillment columns + unique group index (research R-13); append-only triggers; `tax_invoice_code_seq`.
  - **Batch B (2026-09-25)**: AUTHORED, **NOT APPLIED**. Files:
    - `supabase/migrations/20260925109000_feature_013_finance_fulfillment_records.sql`;
    - `supabase/rollback/20260925109000_feature_013_finance_fulfillment_records.rollback.sql`;
    - `supabase/maintenance/20260925_feature_013_finance_fulfillment_records_postflight.sql` (19 checks + `ALL CHECKS PASSED` → **20 rows**).
  - Content:
    - `reconciliation_cases` (18 §5.4 columns; `REC-YYYYMMDD-<7>` codes; queue index `(status, opened_at)`) and `reconciliation_case_events` (append-only; one event on open and per status change);
    - `manual_financial_adjustments` (11 §5.5 columns; append-only);
    - `tax_invoices` §5.6 (file/uploader nullable; status/proforma_id/issued_by/issued_at_ts/snapshot; `INV-YYYYMMDD-<7>` from `tax_invoice_code_seq`; UNIQUE(order_id) kept);
    - `order_shipments` R-13 columns + `uq_order_shipment_fulfillment_group`.
  - Guard:
    - pins M1 (`603d04c5…`), M2b (`prevent_snapshot_mutation` `286e0209…`, `checkout_order` `54810aad…`) and Feature 009 (`validate_shipment_transition` `27148260…`, `sync_shipment_ready` `07166e5e…`);
    - pins the 4-trigger `order_shipments` baseline and the pre-013 `tax_invoices` shape (7 columns, file/uploader NOT NULL, UNIQUE(order_id), the `tax_invoice_finance`/`tax_invoice_view` pair, no trigger);
    - no M2c object present; kill switch off; RLS-bypassing role.
    - The guard **passed read-only against production** on 2026-09-25 (READ ONLY transaction, rolled back).
- [X] T039 MP-2 Static tests — `tests/commerce/migrations/m2c-finance-records.test.ts`
  - Depends: T038
  - **Batch B (2026-09-25)**: **40/40 pass**; the T019 conventions test also covers M2c (18/18). Expected values are read from data-model §5.4/§5.5/§5.6/§7.6, research R-13/R-23 and contracts/database-rpc.md.
    - Covers:
      - exact column and CHECK sets; the §7.6 lifecycle; workflow-only writes; frozen identity; payment/proof/payout-to-order binding;
      - AC-009 (no inventory reference); append-only events and adjustments via the reused M2b `prevent_snapshot_mutation`;
      - tax_invoices legacy/Feature 013 shapes, no-bank snapshot, ISSUED → VOID, one file attachment; the fulfillment guard and unique index;
      - the guard pins; grants; rollback exactness and refusal.
    - 10 mutation cases prove the M2c-specific rules bite.
  - **Two existing static guards had to learn about M2c** (both strengthened or narrowly scoped, not weakened):
    - `scripts/seed-test-fixtures.ts`: the T016 M1 proof-order delete exception now also requires 0 `reconciliation_cases` and 0 `manual_financial_adjustments` rows. Its pinned test (`tests/commerce/f013-fixtures.test.ts`) demands the dependent list equal every table referencing `orders(id)`. Before M2c is applied the extra check errors and nothing is deleted (fail closed).
    - `tests/admin/warehouse-operations.test.ts` (Feature 009 T020 "no inventory reconciliation model"): the M2c file is excluded **by exact name**, like the approved Feature 005 variance migration. A compensating assertion pins that it adds exactly the three financial tables, none with an inventory/custody column, and no variance/quarantine/stock-count vocabulary.
- [X] T040 MP-3 Dry-run M2c
  - Depends: T039
  - **Batch B (2026-09-25): COMPLETE.**
    - `npx supabase db push --linked --dry-run` (linked ref `mxejnutukgxyccnohglo` verified; agent-run, read-only):
      ```
      Initialising login role...
      DRY RUN: migrations will *not* be pushed to the database.
      Connecting to remote database...
      Would push these migrations:
       • 20260925109000_feature_013_finance_fulfillment_records.sql
      {"upToDate":false,"dryRun":true,"migrations":["20260925109000_feature_013_finance_fulfillment_records.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
      ```
      Exactly one pending migration (remote head `20260925106000`).
    - Local shadow apply (`supabase db reset`): **not available**; the Docker Desktop daemon is not running. Not attempted.
    - Supplementary check (`migration-evidence/m2c-supplementary-pglite.log`): PGlite, the M2b fixture made production-shaped for shipments/invoices (Feature 009/005 bodies with matching fingerprints, live status CHECK and policies). **108/108 passed**:
      - guard negatives (M2b drift, extra tax_invoices trigger, pre-relaxed tax_invoices, shipment trigger drift, kill switch, `checkout_order` drift); apply; re-apply refused; postflight all ok; M2b postflight: only its point-in-time row 23 false (R4); existing shipments byte-identical and `DELIVERY_REQUEST`;
      - LEGACY checkout/retry/re-checkout identical to pre-M2c; buyer DRAFT shipment insert and DRAFT → REQUESTED unchanged;
      - reconciliation:
        - workflow-only open, REC- code and OPENED event;
        - payment/proof bound to the order;
        - §7.6: OPEN → IN_REVIEW → RESOLVED and OPEN → CLOSED_NO_ACTION accepted; OPEN → RESOLVED refused; RESOLVED needs a type; closed cases final; observed values frozen; never deleted; linked order only for APPLIED_TO_NEW_ORDER;
        - events append-only, carrying the transition reason;
      - adjustments: workflow-only; payment bound to the order; amount > 0; reason required; append-only;
      - tax_invoices:
        - LEGACY uploads unchanged (still deletable; cannot acquire Feature 013 values);
        - a Feature 013 invoice only via the workflow, with an INV- number;
        - refused: bank data in the snapshot (also nested); a wrong-order proforma; a second invoice per order;
        - the file attaches once; ISSUED → VOID only; snapshot frozen; never deleted;
      - shipments:
        - FULFILLMENT only via the workflow (a buyer cannot, even through its insert policy);
        - one per group (unique index); must match its frozen group of the same order; kind never changes; the fields CHECK bites with triggers bypassed;
        - DRAFT → REQUESTED through the unchanged Feature 009 function;
      - RLS as the real roles: SELECT denied to authenticated/anon; service_role read-only;
      - rollback refused while a case exists; fresh DB: apply → rollback → catalogue **identical** (columns, constraints, indexes, policies, triggers, function bodies/flags/ACLs, relation RLS/ACLs); M2b postflight passes again; re-apply and postflight pass.
    - Regression (static only; live-capable files excluded by the fixture-session/`createClient(`/`*_LIVE` rule): the 32-file T034 batch + the M2c test → **33 files: 809 passed, 0 failed**. `npm run typecheck`, eslint (new test, the 2 changed files) and `git diff --check` clean. No live suite was run; production was not modified.
- [X] T041 MP-4 **GATE** review M2c
  - Depends: T040
  - **VERDICT: GO / PASS** — reviewer: owner, 2026-09-25. Design decisions (a)–(i) accepted.
  - Follow-up conditions (owner-recorded):
    - **F1**: the direct LEGACY finance write paths (`tax_invoice_finance FOR ALL`, and the other finance `FOR ALL` policies) must be closed by the planned security/workflow work (M3/M5b) **before activation**.
    - **F2**: deleting a FULFILLMENT shipment must be refused by the appropriate later migration/workflow (M3/M5c) **before activation**.
    - **F5**: T042 applied in a quiet window with no legacy live suite running.
    - **F3**: the M1 proof-order cleanup stays fail-closed until M2c is live.
    - **F4 APPROVED**: the warehouse-test exemption, because the compensating assertion limits it to exactly the approved M2c financial tables and forbids inventory/custody columns.
  - **Review package (agent, 2026-09-25)** — verified:
    - **Fidelity**:
      - column/CHECK sets are read from data-model §5.4/§5.5/§5.6 and research R-13/R-23 (T039);
      - the guard pins M1/M2b/Feature 009 by fingerprint and passed read-only on production;
      - M2b's `prevent_snapshot_mutation` is reused unchanged (not redefined), as contracts/database-rpc.md lists it for these two tables.
    - **Rollback symmetry**: full-catalogue identical after the rollback (PGlite C). It restores `tax_invoices.file_asset_id/uploaded_by` NOT NULL and drops the `invoice_number` default. The guard refuses while any case/event/adjustment, any Feature 013/VOID/file-less invoice or any FULFILLMENT shipment exists, or M2d+ is applied. The M2b rollback already refuses while M2c exists.
    - **History unchanged**: every applied migration and the Feature 008 files are untouched (`historical-008-unchanged`, `migration-layout` pass); 4 new files + 2 changed test/fixture files.
    - **Design decisions (not dictated verbatim by the data-model)**:
      - (a) **Lifecycle triggers** (§7 says "enforced in triggers/RPCs"):
        - `guard_reconciliation_case` implements §7.6 exactly. The contract text "OPEN/IN_REVIEW → RESOLVED" must be realized by M5b as OPEN → IN_REVIEW → RESOLVED in one transaction.
        - Cases, adjustments and Feature 013 invoices are written only under `app.internal_transition` (the M5b RPCs).
      - (b) **Auto-history**: `record_reconciliation_case_event` writes the events (no RPC can skip them); the note comes from `app.transition_reason`.
      - (c) **`reconciliation_case_events` columns** (§5.4 names the table, not its columns): `id, case_id, from_status, to_status, note, actor_user_id, created_at`.
      - (d) **Adjustments**: `order_id` NOT NULL; `amount > 0` (the kind carries the direction); `currency = 'USD'` (all money is USD); payment/payout must belong to the order.
      - (e) **`protect_tax_invoice`** (FIN-010 "final invoices remain non-destructive"; §5.6 names no trigger): Feature 013 invoices are frozen except ISSUED → VOID and a one-time file attachment, and are never deleted. LEGACY invoices keep full behaviour (0 exist in production).
      - (f) **Bank-free snapshot CHECK** (R-23), enforced at any depth with `jsonb_path_exists`.
      - (g) **Fulfillment guard**: FULFILLMENT values only under the internal flag, immutable afterwards, and matching a frozen `proforma_fulfillment_groups` row of a proforma of the same order. This closes the buyer insert-policy and warehouse `FOR ALL` paths for FULFILLMENT rows.
      - (h) **RLS**: the new tables have no policy until M3 (consistent with M2b; M3 adds F ∨ PA, auditors on adjustments, `v_buyer_reconciliation` and the MFA gates); `service_role` SELECT only.
      - (i) **Code generators** `next_tax_invoice_code`/`next_reconciliation_case_code` are non-definer and not client-executable. Legacy invoice inserts still supply their own number.
    - **Findings / conditions for the reviewer**:
      - **F1 (M3 condition)**: `tax_invoice_finance FOR ALL` (finance may still write LEGACY invoices directly) and `shipments_warehouse_manage FOR ALL` remain until M3 (plan: finance → SELECT). Feature 013 rows are already protected by the M2c triggers.
      - **F2 (M5c follow-up)**: a FULFILLMENT shipment can still be DELETEd by a warehouse operator through `shipments_warehouse_manage` (Feature 009 behaviour; M2c does not change DELETE). M5c/M3 should refuse deleting FULFILLMENT shipments.
      - **F3 (fixture cleanup)**: the M1 proof-order cleanup now checks the two M2c tables. Until T042 applies M2c in production it fails closed (errors, deletes nothing). Only the M1 live-proof tooling uses it.
      - **F4 (test scope)**: the Feature 009 warehouse test now exempts the M2c file by exact name with a compensating assertion. Owner to confirm this reading of that test's intent (inventory, not financial, reconciliation).
      - **F5 (operational, R3)**: `ALTER TABLE` takes ACCESS EXCLUSIVE locks on `order_shipments` (1,273 rows; constant-default ADD COLUMN, no rewrite; CHECK validation scan) and `tax_invoices` (0 rows), and SHARE ROW EXCLUSIVE on the new FK targets. A quiet write window is needed; no legacy live suite may run during the apply.
      - **F6 (point-in-time postflights, R4)**: the M2b postflight row 23 reads false once M2c exists (verified in PGlite); the M2c postflight rows 8/11/14 read false once M5b/M5c write records.
      - **F7 (no data loss)**: no backfill, no row rewritten; the rollback only runs while M2c holds no record.
    - **Agent recommendation: GO**, conditional on acceptance of (a)–(i), F1/F2 recorded as M3/M5c conditions, the F4 test-scope reading, and the T014 backup + quiet window.
    - T042 expected postflight: **20 rows** (checks 1–19 + `999 | ALL CHECKS PASSED`), every `ok = true`.
- [X] T042 MP-5 **OPERATOR** apply M2c + postflight
  - Depends: T041
  - **2026-09-25 — applied by the agent on the owner's explicit instruction** (owner: GO at T041; "Proceed with T042 ONLY"). Linked ref `mxejnutukgxyccnohglo` verified.
    - **Backup (CUTOVER-CHECKLIST §A)**:
      - PITR is disabled; the latest platform backup (daily physical, id `1776661458`, 2026-09-25 03:05:49 UTC) predates M2a/M2b, so a **fresh logical backup** was taken (owner option 1, Docker Desktop started by the owner).
      - Command: `supabase db dump --linked` (schema), `--data-only` (data), `--role-only` (roles), 2026-09-25 **19:12:27–19:14:45 UTC**.
      - Stored outside the repo in `C:\Users\Dell\hills-coffee-backups\2026-09-25-pre-m2c\`:
        - `schema.sql` 472,281 B, sha256 `93e92946…9def`;
        - `data.sql` 61,301,878 B, sha256 `85e9db69…77b4`;
        - `roles.sql` 370 B, sha256 `168a95a9…2308`;
        - `SHA256SUMS` alongside.
      - Content check: orders 2,004, order_shipments 1,273, proforma_invoices 10, payments 10, coffee_offers 9, audit_logs 52,437 rows (matching the live counts).
      - `pg_dump` hint (expected): a data-only restore needs `--disable-triggers` because of the M2b orders ↔ proforma_invoices FK cycle.
    - **Quiet window**:
      - confirmed by the owner (no live suite, agent or session writing);
      - read-only indicators at 19:09 UTC: 0 other active/non-idle client sessions; last write 18:13:50 UTC (the T036 drain); 0 audit rows in the previous 30 minutes.
    - **Dry-run (immediately before apply)**: `npx supabase db push --linked --dry-run` → exactly one pending migration, `20260925109000_feature_013_finance_fulfillment_records.sql`.
    - **Apply**: `npx supabase db push --linked` at 19:15:37–19:15:47 UTC → `Applying migration 20260925109000_feature_013_finance_fulfillment_records.sql...` / `Finished supabase db push.`; no error or notice. `supabase migration list --linked`: local = remote through `20260925109000`.
    - **Postflight** (`npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_finance_fulfillment_records_postflight.sql`): **20 rows**, checks 1–19 all `ok = true`, and the last row was `999 | ALL CHECKS PASSED | true`.
    - Expected point-in-time effect (R4): the M2b postflight row 23 ("no M2c+") now reads false.
- [X] T043 MP-6 Live proof — `tests/commerce/finance-records.live.test.ts`
  - Depends: T042
  - Accept: adjustments and case events are append-only; the unique fulfillment-group index rejects a duplicate group; legacy `tax_invoices` rows are intact; `tests/delivery` green.
  - **Batch B (2026-09-25): COMPLETE.** Owner-authorized; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1` set; no other live suite beyond the T043-required `tests/delivery`.
    - `F013_LIVE=1 npx vitest run tests/commerce/finance-records.live.test.ts` → **2/2 passed**. The proof block reported **55/55 cases ok** (also 55/55 on one direct authoring run).
    - **Method (the T037 one-transaction setup)**:
      - `tests/commerce/t043-finance-records-proof.ts` builds ONE `DO` block (reusing the T037 balanced snapshot and savepoint helpers, now exported from `t037-snapshot-proof.ts` without change), executed by `supabase db query --linked`.
      - It always ends in `raise exception 'T043_RESULT:<base64 json>'`, so every fixture, record and audit row rolls back.
      - Fixtures: the T037 V1 proforma (ids `…03xx`) plus T043 ids `…04xx` (a V1 payment/proof/payout, a LEGACY "other" order + payment, file assets).
    - Proved live:
      - **Reconciliation**:
        - workflow-only open; a payment of another order and a proof of another payment are refused;
        - OPEN → RESOLVED directly refused; OPEN → IN_REVIEW → RESOLVED produces a `REC-` code and exactly 3 events (reason recorded);
        - a resolved case is final; observed values frozen; a non-workflow status change refused; never deleted;
        - **events: UPDATE and DELETE refused**.
      - **Adjustments**: workflow-only; a payment and a payout of another order are refused (**same-order references**); zero amount and blank reason refused; **UPDATE and DELETE refused**.
      - **Invoices**:
        - LEGACY upload insert/edit/delete still works outside the workflow; a legacy invoice still needs file + uploader and cannot acquire Feature 013 values;
        - Feature 013: workflow-only, `INV-` number, nested bank data refused, a wrong-order proforma refused, a second invoice per order refused, snapshot frozen, non-workflow change refused, never deleted;
        - the file attaches once (replacement refused); ISSUED → VOID accepted; VOID → ISSUED refused.
      - **Fulfillment**:
        - refused outside the workflow and for a buyer member through its insert policy;
        - one DRAFT shipment per frozen group; a **duplicate group rejected by `uq_order_shipment_fulfillment_group`**; a mismatched group and another order's group refused; kind/group immutable;
        - DRAFT → REQUESTED through the unchanged Feature 009 function; a legacy DELIVERY_REQUEST insert unchanged.
      - **Grants**: authenticated/anon SELECT denied on the 3 tables; service_role INSERT denied.
      - **Legacy rows intact**: every pre-existing `tax_invoices` row (production: 0) and every pre-existing `order_shipments` row byte-identical. No generic audit row for the M2c tables.
    - **Cleanup / state**: a read-only state query before and after the suite (orders, the 3 M2c tables, invoices + fingerprint, shipments + fingerprint, proof payments/payouts/proofs/files, Feature 013 proformas, snapshot rows, proof audit rows, payments, kill switch) is **identical**. The proof created 0 persistent rows; only sequence values were consumed.
    - **Delivery regression** (`tests/delivery`, one file per run, default gating, `F013_LIVE=1`): **21 files: 210 passed, 6 skipped, 0 failed**. The skips are the suites' own opt-in gates (`T017_LIVE_PROOF`, `T024_LIVE_PROOF`).
      - As at T025, these legacy suites retained their own disposable fixtures by their existing conventions: +33 LEGACY DRAFT orders (+33 items), +31 DELIVERY_REQUEST shipments (18 DRAFT, 8 REQUESTED, 2 READY, 2 CANCELLED, 1 FAILED) and +226 audit rows, all for the Foundation Buyer-And-Seller fixture org, 19:23:37–19:26:26 UTC.
      - They created no payment, proforma, reservation, invoice, M2c record or FULFILLMENT shipment; there are 0 LEGACY HOLD+ISSUED orders and 0 ACTIVE reservations. They join the T147 drain backlog (DRAFTs with shipment plans → `admin_void_order`).
    - Static: typecheck and eslint clean; `tests/commerce` without the flag → 217 passed, 32 skipped (the 4 gated live suites).

### M2d — pricing inputs (promotion data model, offer quantity price tiers)
- [X] T044 MP-1 Author M2d — `supabase/migrations/20260925112000_feature_013_pricing_inputs.sql`, rollback, postflight
  - Depends: T043
  - Accept: data-model §3.8 tables + CHECKs (types, `PERCENT ≤ 100`, window, scope↔seller, generated `funding_source`); RLS per rls-storage §1 (tiers never anon; promotion codes hidden); tables only, no RPCs.
  - **Batch B (2026-09-26)**: AUTHORED, **NOT APPLIED**. Files:
    - `supabase/migrations/20260925112000_feature_013_pricing_inputs.sql`;
    - `supabase/rollback/20260925112000_feature_013_pricing_inputs.rollback.sql`;
    - `supabase/maintenance/20260925_feature_013_pricing_inputs_postflight.sql` (17 checks + `ALL CHECKS PASSED` → **18 rows**).
  - Content:
    - `offer_price_tiers` (7 §3.8 columns; threshold > 0, price ≥ 0, USD; UNIQUE(offer_id, min_quantity_kg));
    - `promotions`:
      - 16 §3.8 columns; scope/discount_type/status sets; value > 0; PERCENT ≤ 100; starts_at < ends_at; SELLER ⇔ seller org;
      - `funding_source` GENERATED ALWAYS from scope (FIN-011);
      - code `[A-Z0-9-]{1,40}` with `lower(code)` unique among non-archived rows; `PRM-<7>` references; eligibility index;
    - `promotion_targets` (§3.8 columns + surrogate id; 4 kinds; OFFER/COFFEE reference CHECK; `UNIQUE NULLS NOT DISTINCT`);
    - a redacted promotion audit (allow-list; the code only as `code_present`/`code_changed`).
  - **RLS (rls-storage §1)**:
    - `offer_price_tiers_read` = production's `coffee_offers.member_read_published_offers` predicate ∨ own seller org ∨ PA;
    - `promotions_read` = eligible (SCHEDULED/ACTIVE, in-window) PLATFORM for authorized members ∨ own SELLER org ∨ PA;
    - `promotion_targets_read` = the promotion is readable;
    - all policies are TO authenticated; anon has nothing; **`promotions.code` is granted to no client role** (column-level SELECT on every other column); no client or service_role write grant.
  - Guard:
    - pins M1 (`603d04c5…`) and M2b `prevent_snapshot_mutation` (`286e0209…`); requires M2a–M2c;
    - requires `member_read_published_offers` to have exactly the recorded text (the tier policy mirrors it);
    - no M2d object; kill switch off; RLS-bypassing role.
- [X] T045 MP-2 Static tests — `tests/commerce/migrations/m2d-pricing-inputs.test.ts`
  - Depends: T044
  - **Batch B (2026-09-26)**: **33/33 pass**; conventions (now also covering M2d) **20/20**. Expected values are read from data-model §3.8, contracts/rls-storage.md and the approved schema report (`member_read_published_offers`).
    - Covers: exact columns and CHECK sets; PERCENT ≤ 100; window; scope ↔ seller; generated funding; code format/uniqueness; derived eligibility; the RLS predicates; anon absence; code hiding; tables-only; redacted audit; guard; rollback exactness and refusal.
    - 10 mutation cases prove the M2d rules bite.
  - **Shared rule change**: `tests/commerce/migrations/sql-rules.ts` now accepts `grant select (<columns>) … to authenticated` (needed to hide `promotions.code`); every other privilege is still a violation. Two new conventions mutation cases prove column-level `update (…)` / `select (…), insert (…)` grants are still caught.
- [X] T046 MP-3 Dry-run M2d
  - Depends: T045
  - **Batch B (2026-09-26): COMPLETE.** OPERATOR evidence (authoritative): `npx supabase db push --linked --dry-run` connected to the linked remote database and listed exactly one pending migration, `20260925112000_feature_013_pricing_inputs.sql`; nothing was applied. (`supabase link --project-ref …` returns 403 for this CLI account, which lacks the project-management privilege, but the repo is already linked and `db push --linked --dry-run` works.) The agent-side notes follow.
    - `npx supabase db push --linked --dry-run` (linked ref `mxejnutukgxyccnohglo`) was **refused** for the agent's CLI account: `DbConfigLoginRoleStatusError … 403` (the account's elevated access used at T042 is no longer granted). **OPERATOR** must run it; expected: exactly one pending migration, `20260925112000_feature_013_pricing_inputs.sql` (remote head `20260925109000`). The same 403 blocked a read-only production query, so the guard inputs were taken from the approved schema report, not re-read live.
    - Local shadow apply (`supabase db reset`): **not available**; the Docker Desktop daemon is not running. Not attempted.
    - Supplementary check (`migration-evidence/m2d-supplementary-pglite.log`): PGlite, the production-shaped M2c fixture + production's `member_read_published_offers` (text reproduced exactly; the guard's comparison passes). **97/97 passed**:
      - guard negatives (member predicate drift, M2b drift, M2c missing, kill switch, existing object); apply; re-apply refused; postflight 18/18; M2c postflight: only its point-in-time row 19 false (R4); no pre-existing column/policy/function changed;
      - CHECKs: tier threshold/price/currency/duplicate; PERCENT 100 accepted and 101 refused; AMOUNT_PER_KG not bound by 100; value 0, unknown type/scope/status, equal and inverted windows refused; SELLER without a seller and PLATFORM with one refused; `funding_source` not writable and re-derived on a scope change; code format/length; live-code uniqueness with archived reuse; PRM- refs; target reference/kind/duplicate rules;
      - **RLS as the real roles**:
        - anon: permission denied on all 3 tables;
        - an authorized buyer reads only the published/visible listing's tier and only the eligible PLATFORM promotion (not draft/expired/future/another seller's);
        - the seller org reads its own tiers (incl. its draft listing's) and its own SELLER promotion; PA reads all; a signed-in non-member reads no tier;
        - `select code` and `select *` refused for buyer, owning seller and PA; non-code columns readable;
        - targets follow their promotion;
        - INSERT/UPDATE/DELETE refused for authenticated (even PA) on all 3 tables; service_role read-only;
      - audit: promotion audit rows carry no code value, and a code change is recorded as `code_changed = true` without the value;
      - rollback refused while rows exist; fresh DB: apply → rollback → catalogue **identical**; M2c postflight passes again; re-apply and postflight pass.
    - Regression (static only; live-capable files excluded): **34 files: 844 passed, 0 failed**. Typecheck, eslint and `git diff --check` clean. No live suite run; production not modified.
- [X] T047 MP-4 **GATE** review M2d
  - Depends: T046
  - **VERDICT: GO / PASS** — reviewer: owner, 2026-09-26. Design decisions (a)–(h) accepted.
  - Follow-up conditions:
    - **F2 → M8 condition**: M8 must enforce the cross-table promotion rules (SELLER targets only own MEMBER_SELLER listings; ALL_OFFERS platform-only; AMOUNT_PER_KG below the lowest targeted price) and provide the controlled promotion-code read path (creating scope and PA only).
    - **F3 → M3 condition**: M3 must add the required restrictive MFA gates on `offer_price_tiers`, `promotions` and `promotion_targets`.
  - **Review package (agent, 2026-09-26)** — verified; verdict, reviewer and date to be recorded here by the human reviewer.
    - **Fidelity**: columns and CHECK sets are read from data-model §3.8; the RLS follows rls-storage §1; the tier predicate equals the approved-report text of `member_read_published_offers`, and the guard refuses on drift. Tables only: the only functions are the `PRM-` generator and the redacted audit.
    - **Rollback symmetry**: full catalogue identical after the rollback (PGlite C). The guard refuses while any tier/promotion/target exists or M2e+ is applied. The M2c rollback already refuses while M2d exists. Promotion audit rows remain (append-only).
    - **History unchanged**: only 4 new files + 2 shared test files (`sql-rules.ts`, `conventions.test.ts`); every applied migration and the Feature 008 files are untouched.
    - **Design decisions (beyond the literal data-model)**:
      - (a) **Code hiding by column privilege**: `promotions.code` is granted to NO client role, including the creating seller and PA. rls-storage's "visible only to the creating scope and PA" is realized by the M8 RPCs (definer); until then no client reads codes. PostgREST clients must list columns (`select=*` is refused).
      - (b) **RLS policies are added in M2d** (T044 Accept "RLS per rls-storage §1"; unlike M2b/M2c, all predicates are expressible with existing helpers). M3 adds the restrictive MFA gates.
      - (c) **Tier predicate stated explicitly** (not delegated to `coffee_offers` RLS, which also admits compliance/auditors through `offers_compliance_read`).
      - (d) **Eligibility in the read policy** uses `now()` (the §3.8 predicate says `clock_timestamp()`; they are equal at statement granularity). ENDED rows past `ends_at` are hidden.
      - (e) **`promotion_targets` gains a surrogate `id`**; target uniqueness is `NULLS NOT DISTINCT` (PostgreSQL 15+; production is 17.6).
      - (f) **Redacted audit** for promotions (§3.8 "audited"), code as booleans only. Tiers and targets are not audited (the M8 RPCs audit their writes).
      - (g) **`service_role` SELECT only**, writes none (the snapshot/ledger precedent). T049 proves writes via the one-transaction method.
      - (h) **Cross-table promotion rules** (SELLER targets own MEMBER_SELLER listings only, ALL_OFFERS platform-only, AMOUNT_PER_KG below the lowest price) are **not** in M2d: they are `validate_promotion_scope` + upsert RPCs in M8 as planned. No write path exists before M8.
    - **Findings / conditions for the reviewer**:
      - **F1 (T048 prerequisite)**: the linked dry-run must be run by the OPERATOR (agent CLI 403), and the guard's recorded `member_read_published_offers` text is re-checked at apply (a mismatch aborts with nothing applied).
      - **F2 (M8 condition)**: `validate_promotion_scope` and the upsert RPCs must enforce the cross-table target rules and expose codes only to the creating scope/PA; before M8 no write or code-read path exists.
      - **F3 (M3 condition)**: add the restrictive MFA gates on the 3 tables.
      - **F4 (app)**: application reads of `promotions` must name columns (never `select=*`) and never request `code`.
      - **F5 (operational)**: M2d only creates new, empty tables. No lock on existing tables beyond the FK targets (`coffee_offers`, `coffees`, `organizations`, `profiles`: SHARE ROW EXCLUSIVE while the FKs are added). A quiet window is still recommended.
      - **F6 (no data loss)**: no backfill, no row rewritten; the rollback only runs while M2d holds no row.
    - **Agent recommendation: GO**, conditional on acceptance of (a)–(h), F2/F3 recorded as M8/M3 conditions, the OPERATOR dry-run showing exactly one pending migration, and the backup + quiet window at T048.
    - T048 expected postflight: **18 rows** (checks 1–17 + `999 | ALL CHECKS PASSED`), every `ok = true`.
    - **Final agent review (2026-09-26, after the OPERATOR dry-run)**:
      - F1's dry-run half is satisfied: exactly one pending migration.
      - The M2d files are unchanged since T045.
      - `tests/commerce/migrations` + `historical-008-unchanged` + `migration-layout` pass 287/287.
      - No applied migration/rollback/postflight or `specs/008-*` file differs from HEAD.
      - No blocker found. **Agent verdict: GO.** The owner's GO/NO-GO, with reviewer and date, is to be recorded here; T048 must not start before it.
- [X] T048 MP-5 **OPERATOR** apply M2d + postflight
  - Depends: T047
  - **OPERATOR evidence (2026-09-26, authoritative)**:
    - fresh backup completed (`schema.sql`, `data.sql`, `roles.sql`) with SHA-256 checksums recorded;
    - M2d `20260925112000_feature_013_pricing_inputs.sql` applied to production;
    - the postflight returned **18/18 `ok = true`**, ending `999 | ALL CHECKS PASSED | true`;
    - the final linked dry-run reports `Remote database is up to date.`;
    - `bank_transfer_checkout_enabled` remains off.
    - (The agent's CLI account was refused (403) for dump/query/push at the time, so the operator ran every step.)
- [X] T049 MP-6 Live proof — `tests/commerce/pricing-inputs.live.test.ts`
  - Depends: T048
  - Accept: anon reads 0 tier/promotion rows; a `funding_source` mismatch cannot be written; invalid values are rejected by CHECKs.
  - **Batch B (2026-09-26): COMPLETE.** Owner-authorized; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1` set; no other live suite run.
    - `F013_LIVE=1 npx vitest run tests/commerce/pricing-inputs.live.test.ts` → **3/3 passed**. The proof block reported **55/55 cases ok** (also 55/55 on one direct authoring run; a first authoring run was refused by the Feature 006 listing rule and fully rolled back).
    - **Method (the T037/T043 one-transaction setup)**: `tests/commerce/t049-pricing-inputs-proof.ts` builds ONE `DO` block ending in `raise exception 'T049_RESULT:<base64 json>'`, so every fixture row, audit row, the temporary platform-admin grant and the temporary Hills-org membership roll back.
      - Identities: the Foundation buyer-only user (authorized buyer) and buyer-and-seller user (seller org; made a temporary member of the Feature 005 Hills org and a temporary platform admin, each only inside its own savepoint).
      - Listings: the published LST-0000002 and the unpublished LST-0000007.
    - Proved live:
      - **anon**: `permission denied` on all 3 tables inside the database, and the **real anonymous REST path** (publishable key, read-only GET) is refused with **0 rows** for `offer_price_tiers`, `promotions` and `promotion_targets`;
      - **funding_source cannot be spoofed**: PLATFORM → HILLS and SELLER → SELLER; an explicit INSERT value is refused (`cannot insert a non-DEFAULT value … generated column`); an UPDATE is refused; a scope change re-derives it;
      - **CHECKs**:
        - refused: PERCENT 101, value 0 and negative, an unknown type/scope/status, equal and inverted windows, SELLER without a seller org, PLATFORM with one, lower-case and 41-character codes, a duplicate live code;
        - accepted: PERCENT 100, AMOUNT_PER_KG 150, archived code reuse; PRM- refs generated;
        - tiers: threshold 0, negative price, EUR and a duplicate threshold refused;
        - targets: reference, duplicate ALL_OFFERS and unknown kind refused;
      - **access**:
        - an authorized buyer reads only the published listing's tier, only the eligible (ACTIVE, in-window) PLATFORM promotion, and only its targets;
        - the seller org sees the eligible PLATFORM promotion + its own SELLER promotion and their targets; as a member of the listing's own org it also reads the unpublished listing's tier (without that membership, only the published one);
        - a platform admin sees every promotion, tier and target;
        - `select code` is refused for buyer, owning seller and admin, and `select *` is refused; the non-code columns stay readable;
        - INSERT on all 3 tables refused for authenticated; UPDATE/DELETE refused even for an admin; `service_role` INSERT refused;
      - **audit**: 6 promotion audit rows, none containing a code value; a code change is recorded as `code_changed = true` without the value.
    - **Cleanup / state**: a read-only state query before and after (tiers, promotions, targets, promotion audit rows, the temporary admin/membership rows, offers + fingerprint, memberships, platform_admins, kill switch) is **identical**; the proof created 0 persistent rows (tiers/promotions/targets still 0). Only sequence values were consumed.
    - Static: typecheck and eslint clean; `tests/commerce` without the flag → 252 passed, 35 skipped (the 5 gated live suites).

### M2e — notification outbox table
- [X] T050 MP-1 Author M2e — `supabase/migrations/20260925115000_feature_013_notification_outbox.sql`, rollback, postflight
  - Depends: T049
  - Accept: data-model §6.1; internal `emit_notification_event` (no client EXECUTE); `UNIQUE(event_type, aggregate_id, dedupe_key)`; no client read.
  - **Batch B (2026-09-26): AUTHORED, NOT APPLIED.** Files (md5 at T052):
    - migration `20260925115000_feature_013_notification_outbox.sql` (`b0960bf335ac00ca6294f11c3400d6e3`);
    - rollback `supabase/rollback/20260925115000_feature_013_notification_outbox.rollback.sql` (`7f206f01f1d0245735c191e93549f7c5`);
    - postflight `supabase/maintenance/20260925_feature_013_notification_outbox_postflight.sql` (`85e384d6ccf2ec2f9600ce27568699be`; 13 checks + `999`).
  - Content:
    - `notification_events`: the 16 §6.1 columns; `UNIQUE(event_type, aggregate_id, dedupe_key)`; index `(status, next_attempt_at)`; status CHECK = §6.1; event_type / template_key / aggregate_type CHECK-bound to the notification-provider §1 catalogue; `params` allow-listed (order/proforma/case/shipment code, status_key, deadline, amount, currency) and scalar-only; `audience` a JSON object (rules, not user lists); bounded `last_error`; claim-pair and lifecycle CHECKs; an immutability trigger (identity/content frozen; only the processing columns change).
    - RLS enabled + forced, no policy, revoked from public, anon, authenticated **and service_role**, no grant: no client role can read or write.
    - `emit_notification_event(...)`: `INSERT … ON CONFLICT (event_type, aggregate_id, dedupe_key) DO NOTHING`, returns the (existing) id; SECURITY INVOKER; EXECUTE revoked from public, anon, authenticated, service_role (owner only — the M4+ definer functions).
    - No delivery/claim/fan-out function, provider, pg_cron, view, UI, data or change to an existing object.
    - Guard: M1/M2b md5 pins; M2a–M2d present; no M2e object; kill switch off; RLS-bypassing role.
    - Rollback: drops exactly the table and the 2 functions; refuses while any event exists, another function/view references the outbox, or M3+ is applied.
- [X] T051 MP-2 Static tests — `tests/commerce/migrations/m2e-outbox.test.ts`
  - Depends: T050
  - **Batch B (2026-09-26)**: **30/30 pass**; conventions (auto-covers M2e) **20/20**. Expected values are read from data-model §6.1, notification-provider §1, database-rpc and rls-storage §1/§4. 11 mutation cases prove the M2e rules bite (client/service_role read grant, read policy, client EXECUTE, missing service_role revoke, SECURITY DEFINER emitter, no ON CONFLICT, no UNIQUE, bank key in the allow-list, consumer function, cron).
  - **Existing test adjusted (disclosed for T053)**: `tests/admin/warehouse-operations.test.ts` (Feature 009 T020 vocabulary scan) failed on the catalogue literals `'finance.reconciliation_opened'` / `'reconciliation_opened'` (financial, notification-provider §1). For that one file only, exactly those two literals are removed (and asserted to be exactly those two) before the unchanged checks run; a reconciliation table/column added in M2e would still be caught.
- [X] T052 MP-3 Dry-run M2e
  - Depends: T051
  - **Batch B (2026-09-26): COMPLETE.**
    - `npx supabase db push --linked --dry-run` (linked ref `mxejnutukgxyccnohglo`, run by the agent — CLI access works again): **exactly one pending migration, `20260925115000_feature_013_notification_outbox.sql`**; nothing applied.
    - Read-only guard-condition query on production: M1 and M2b pins true; M2a–M2d present; no M2e object; checkout off; `postgres` bypasses RLS; 0 existing functions reference the outbox; PostgreSQL 17.6.
    - Local shadow apply (`supabase db reset`): not available (Docker daemon not running); not attempted.
    - Supplementary check (`migration-evidence/m2e-supplementary-pglite.log`): PGlite, the production-shaped M2c/M2d fixture **with Supabase's default privileges** (new tables/functions auto-granted to anon/authenticated/service_role), so the explicit revokes are what is tested. **106/106 passed**:
      - guard negatives (M1/M2b drift, M2d missing, kill switch, existing object); apply; re-apply refused; postflight 13/13; M2d postflight: only its point-in-time row 17 false (R4); no pre-existing column/policy/function/relation/trigger/constraint/index changed;
      - emitter: a duplicate emit returns the existing id and does not overwrite params; a new dedupe_key or event_type is a new event; null params stored as `{}`; out-of-catalogue event/template/aggregate refused; bank, proof-path and note params refused; nested objects/arrays refused; array audience refused; blank dedupe_key and null aggregate refused; every allow-listed key accepted;
      - immutability: the processing columns change; the 8 identity/content columns are frozen; lifecycle/claim/attempts/status/last_error CHECKs bite;
      - **as the real roles**: anon, buyer, seller, PA and service_role: SELECT/COUNT/INSERT/UPDATE/DELETE all `permission denied`; EXECUTE on the emitter `permission denied`; the emitter ACL and the table ACL name no API role;
      - the intended path: an owner-run SECURITY DEFINER function called by an authenticated member emits (dedupe holds) and the event rolls back with its transaction;
      - rollback refused while events exist and while another function calls the emitter; the M2d rollback refuses while M2e exists; fresh DB: apply → rollback → catalogue **identical**; M2d postflight passes again; M2e postflight fails; second rollback refused; re-apply and postflight pass.
      - **Defect found and fixed here**: the scalar-only params CHECK used a lax JSONPath (`$.*`), which unwraps array values, so `{"order_code": ["a","b"]}` was accepted. It is now `strict $.*`; the static test pins it.
    - Regression (static only; live-capable files excluded): the 34-file batch + `m2e-outbox.test.ts` — **35 files, 874 passed, 0 failed** (re-run of the 10 affected files after the fix: 335/335). Typecheck, eslint and `git diff --check` clean. No live suite run; production not modified.
- [X] T053 MP-4 **GATE** review M2e
  - Depends: T052
  - **VERDICT: GO / PASS** — reviewer: owner, 2026-09-26. Design decisions (a)–(f) accepted.
  - Follow-up conditions:
    - **F1 → M7 condition**: the outbox worker and the admin outbox view must run with the intended owner privileges and respect the lifecycle/immutability rules.
    - **F2 → M4+ condition**: every emitting commerce function must call `emit_notification_event` inside its own (the same) transaction and use only the allowed params. Seller-facing events must not include buyer totals or sensitive finance data.
    - **F3 (accepted)**: the Feature 009 test adjustment is accepted exactly as implemented, for the M2e file only. The exemption must not be broadened.
  - **Review package (agent, 2026-09-26)**:
    - **Fidelity**: the columns, status set, UNIQUE and queue index are read from data-model §6.1; the catalogue CHECKs from notification-provider §1; the emitter signature and ON CONFLICT semantics from database-rpc; "SELECT none / writes none / EXECUTE nobody" from rls-storage §1/§4.
    - **Rollback symmetry**: full catalogue identical after the rollback (PGlite C). The guard refuses while any event exists, any function/view references the outbox, or M3+ is applied. The M2d rollback already refuses while M2e exists.
    - **History unchanged**: 5 new files + 1 adjusted test (`warehouse-operations.test.ts`, see T051); every applied migration and the Feature 008 files are untouched.
    - **Design decisions (beyond the literal data-model)**:
      - (a) **`service_role` gets nothing** on the outbox (unlike the M2b–M2d ledger tables' SELECT): "no client role may read". The M7 worker (`process_notification_events`) and the admin outbox view/`admin_process_outbox_now` reach it only through owner-run functions.
      - (b) **Emitter is SECURITY INVOKER with no EXECUTE for any API role**: only the owner (the M4+ definer commerce functions) can call it; a definer emitter would have been an extra privilege boundary to guard. The conventions' definer rules therefore do not apply to it.
      - (c) **Catalogue CHECKs** on event_type / template_key / aggregate_type (notification-provider §1). A new event later needs a migration (deliberate: the catalogue is a contract).
      - (d) **Params allow-list + strict scalar-only CHECK** enforces "never bank identifiers, proof paths, other parties' economics or free-text notes" at the database. The "amount only for the recipient's own view" rule stays with the emitting function (M4+) — the database cannot know the recipient.
      - (e) **Immutability trigger + lifecycle CHECKs** (PROCESSED ⇔ processed_at; PROCESSING needs a claim; claim pair). Not in §6.1; they constrain the M7 worker's writes only.
      - (f) **Emitter returns the event id** (the existing one on a duplicate); the contract states no return type.
    - **Findings / conditions for the reviewer**:
      - **F1 (M7 condition)**: `process_notification_events`, the claim/complete functions and the admin outbox view must run as the owner (definer) — no role holds a table privilege — and must honour the lifecycle CHECKs.
      - **F2 (M4+ condition)**: every emitting commerce function must call the emitter inside its own transaction and build params only from the allow-list, putting `amount` only in the recipient's own-view events (seller events: order code only, no totals).
      - **F3 (tests)**: the Feature 009 vocabulary-scan adjustment (T051) needs reviewer acceptance.
      - **F4 (operational)**: creates one new empty table and two functions; no lock on any existing table (no FK). Backup + quiet window as for M2d.
      - **F5 (no data loss)**: no backfill, no row rewritten; the rollback only runs while the outbox is empty.
      - **F6 (R4)**: after the apply, the M2d postflight row 17 (`notification_events is null`) reads false by design.
    - **Agent recommendation: GO**, conditional on acceptance of (a)–(f), F1/F2 recorded as M7/M4 conditions, F3 accepted, and the backup + quiet window at T054.
    - T054 expected postflight: **14 rows** (checks 1–13 + `999 | ALL CHECKS PASSED`), every `ok = true`.
- [X] T054 MP-5 **OPERATOR** apply M2e + postflight
  - Depends: T053
  - **2026-09-26 — applied by the agent on the owner's explicit instruction** (owner: GO at T053; "Proceed with T054 ONLY"). Linked ref `mxejnutukgxyccnohglo` verified.
    - **Backup (CUTOVER-CHECKLIST §A)**: fresh logical backup, `supabase db dump --linked` (schema), `--data-only`, `--role-only`, 2026-09-26 **05:59:22–06:01:39 UTC**, stored outside the repo in `C:\Users\Dell\hills-coffee-backups\2026-09-26-pre-m2e\`:
      - `schema.sql` 513,469 B, sha256 `becfd081…ea90`;
      - `data.sql` 61,432,134 B, sha256 `bd89aeb8…a04d`;
      - `roles.sql` 370 B, sha256 `168a95a9…2308`;
      - `SHA256SUMS` alongside.
      - Content check: orders 2,037, proforma_invoices 10, payments 10, coffee_offers 9, audit_logs 52,473 rows (equal to the live counts). Expected `pg_dump` hint: a data-only restore needs `--disable-triggers` (M2b FK cycle).
    - **Quiet window**: read-only indicators at 06:01:52 UTC: 0 other active client sessions; last audit write 2026-09-25 19:26:26 UTC; 0 audit rows in the previous 30 minutes. No live suite, agent or session was writing.
    - **Dry-run (immediately before apply, 06:02:18 UTC)**: exactly one pending migration, `20260925115000_feature_013_notification_outbox.sql`; the file md5 `b0960bf3…d6e3` equals the reviewed T052 version.
    - **Apply**: `npx supabase db push --linked` at 06:02:25–06:02:31 UTC → `Applying migration 20260925115000_feature_013_notification_outbox.sql...` / `Finished supabase db push.`; no error or notice. `supabase migration list --linked`: local = remote through `20260925115000`. A follow-up dry-run reports `Remote database is up to date.`
    - **Postflight** (`npx supabase db query --linked -f supabase/maintenance/20260925_feature_013_notification_outbox_postflight.sql`): **14 rows**, checks 1–13 all `ok = true`, and the last row was `999 | ALL CHECKS PASSED | true`.
    - Expected point-in-time effect (R4): the M2d postflight row 17 ("no M2e+") now reads false; it is the only failing M2d row.
    - `bank_transfer_checkout_enabled` remains **false**; order and audit counts unchanged by the apply.
- [X] T055 MP-6 Live proof — `tests/commerce/outbox-table.live.test.ts`
  - Depends: T054
  - Accept: a duplicate event insert is a no-op; `authenticated` cannot read or execute.
  - **Batch B (2026-09-26): COMPLETE.** Owner-authorized; linked ref `mxejnutukgxyccnohglo` verified; only `F013_LIVE=1 npx vitest run tests/commerce/outbox-table.live.test.ts` was run (no other live suite).
    - Result: **3/3 passed**. The proof block reported **63/63 cases ok**; the error-only case "INTERNAL: the definer call raised" did not occur.
    - **Method (the T037/T043/T049 one-transaction setup)**: `tests/commerce/t055-outbox-proof.ts` builds ONE `DO` block (session role `postgres` = the outbox owner) ending in `raise exception 'T055_RESULT:<base64 json>'`. Every event, the temporary definer function `__t055_commerce_step` and the temporary platform-admin grant roll back. Fixture aggregate ids are in the `13000000-…-0000000006xx` range.
    - Proved live:
      - **dedupe**: a second emit with the same (event_type, aggregate_id, dedupe_key) returns the same id; exactly one event; the stored params are not overwritten; the event is PENDING with 0 attempts; a new dedupe_key or event_type is a new event; a direct duplicate INSERT is refused by `notification_events_dedupe_key`;
      - **designed internal path**: an authenticated buyer calling an owner-run SECURITY DEFINER commerce function emits; the repeated call is deduplicated (one event); that buyer still cannot SELECT the event;
      - **no access for anon, buyer, seller, platform admin (temporary grant) or service_role**: SELECT, COUNT, INSERT, UPDATE and DELETE on `notification_events`, and a direct EXECUTE of `emit_notification_event`, are all `permission denied` (30 cases). The catalogue shows no table privilege and no EXECUTE for the three API roles; the emitter is SECURITY INVOKER; RLS forced, no policy;
      - **params and sensitive data**: iban, proof path, free-text note, `seller_payout`, a nested object, an array value, non-object params, an array audience, out-of-catalogue event/template/aggregate, blank dedupe_key and null aggregate are all refused, even on the owner path; params/audience are immutable once queued; the lifecycle and `last_error` CHECKs bite; no refused value reached the outbox;
      - **real anonymous REST path** (publishable key): GET `notification_events` refused with 0 rows; POST `rpc/emit_notification_event` refused (not by a CHECK). The probe used an out-of-catalogue event_type, so it could not have persisted a row even if it had been accepted.
    - **Cleanup / state**: a read-only state query before and after (outbox 0 events, audit_logs count + max id, platform_admins, the seller's admin rows, memberships, orders, notifications, public function count, no `__t055*` function, emitter body + ACL fingerprint, outbox ACL, kill switch) is **identical**. The proof created 0 persistent rows; checkout remains disabled.

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
  - **T029 condition R1 (owner-approved 2026-09-25)**: prove that a seller of the buyer's order (and any other seller) cannot obtain `orders.delivery_destination_id` or `orders.destination_snapshot` by any path: a direct `orders` select, embedded selects, views or RPCs.
  - **T031 deferred assertion (owner decision 2026-09-25, NOT a waiver)**: with an actual order-linked member-seller session (a seller with a line on the buyer's fixture order), prove that the seller reads **0** rows of that buyer's `delivery_destinations` and cannot obtain `delivery_destination_id` or `destination_snapshot` by any route (direct `orders` select, embedded selects, views, RPCs). T031 is closed on the condition that this assertion is proven here.

    Plus a full matrix for buyer / other buyer / seller / other seller / finance / warehouse / auditor / anon over every rls-storage §1 table and §2 view. Recorded as failing against the current policies (proving C2).

    Plus the **DB-OPEN-C15 anonymous boundary** (`rls-anon-probe.live.test.ts`): `anon` gets a permission error executing `mfa_satisfied()` and `kyb_storage_object_authorized(text, boolean)`, while `authenticated` and `service_role` still execute both. This is recorded as failing before M3.
  - Tests: the suites themselves.

- [ ] T057 MP-1 Author M3 — `supabase/migrations/20260925120000_feature_013_rls_realignment.sql`, rollback, postflight
  - Depends: T056
  - Accept: helper functions (`is_order_buyer_member`, `is_order_line_seller`, `order_seller_org_ids`, …); every policy replacement in rls-storage §1; restrictive MFA gates; views §2 (`security_invoker`); `payment_reviews_finance`/`payouts_finance`/`tax_invoice_finance` reduced to SELECT; `can_view_order()` unchanged. The rollback recreates the exact previous policy text from the T006 capture.
  - **T029 condition R1 (owner-approved 2026-09-25)**: do NOT rely on row-level RLS alone to hide columns. Seller-facing order access must go through a safe projection/view (or an equivalent boundary) that excludes the buyer destination PII (`delivery_destination_id`, `destination_snapshot`), and any direct seller path to the full `orders` row must be removed where required. The T056 suites must prove it.
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
  - **T023 condition (F1, owner-approved 2026-09-25)**: `enforce_new_order_flow` must also force `has_manual_adjustment = false` and `cancelled_at`/`cancelled_by`/`cancel_reason` = NULL for every non-`service_role` INSERT (the existing `orders_create_buyer` policy does not constrain the M1 columns). Static and live tests must prove it.
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
  - **T029 condition R2 (owner-approved 2026-09-25)**: before M4b writes `destination_snapshot`, verify that the existing orders audit path (`trg_audit_orders` → `write_audit_log`) cannot copy the raw destination address/phone into `audit_logs`; redesign or redact the audit path as needed before snapshot writes are enabled. Static and live tests must prove no destination PII reaches `audit_logs`.
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
