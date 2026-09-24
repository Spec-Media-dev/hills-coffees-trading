# Feature 013 — Batch A preflight and reconciliation report

**Run**: 2026-09-24 · **Scope**: T001–T018 only · **Production changes**: none.
- No migration was created or applied.
- No row, RLS policy, grant, function or configuration was changed.
- Every production read below was SELECT-only, printing aggregates and masked values only.

---

## T001 — Linked project identity and migration head

| Check | Result |
|---|---|
| `supabase/.temp/linked-project.json` | ref `mxejnutukgxyccnohglo`, name `hillscoffees-trading` |
| `NEXT_PUBLIC_SUPABASE_URL` ref | `mxejnutukgxyccnohglo` — **matches** |
| `supabase migration list --linked` (CLI 2.117.0) | **Refused**: `LegacyDbConfigLoginRoleStatusError … 403: Your account does not have the necessary privileges to access this endpoint`. The CLI account lacks the login-role privilege; the migration table could not be read by the agent. |
| Local head | `20260924120000_tag_translations.sql` (18 forward migrations; no `feature_013` file exists) |
| Remote object evidence (read-only probes, service role, count only) | `payment_transfers` + `payments.trusted_funding_confirmed_at` present (008 M applied); `platform_settings` (1 row) + `coffee_offer_media` present (010 branding applied); `region_translations`/`processing_method_translations` present (catalogue translations applied); **`tag_translations` present (0 rows)** → `20260924120000` applied |
| Conclusion | Remote schema objects match the local head `20260924120000`; **no pending unapplied migration is indicated; no Feature 013 file exists**. The formal Local-vs-Remote listing remains an **OPERATOR** item: preflight §0 lists the top 10 rows of `supabase_migrations.schema_migrations`. |

## T002 — Tag translation (Feature 010 T056) truth
- **Evidence (read-only)**: `public.tag_translations` exists remotely (0 rows), so `20260924120000_tag_translations.sql` has been applied to production.
- **Operator postflight (2026-09-24, SQL editor, read-only; authoritative)**: `supabase/maintenance/20260924_tag_translations_postflight.sql` returned **13 checks, all `true`**:
  1. `tag_translations exists`
  2. `tag_translations RLS enabled`
  3. `anon may only SELECT tag_translations`
  4. `authenticated may only SELECT tag_translations`
  5. `public read policy present`
  6. `writer knows the tag kind`
  7. `writer still SECURITY DEFINER + pinned search_path`
  8. `writer still admin-gated`
  9. `anon cannot execute the writer`
  10. `PUBLIC cannot execute the writer`
  11. `PUBLIC holds no write privilege on tag_translations`
  12. `tag translation integrity: foreign key valid and no invalid rows`
  13. `existing translation branches remain valid`
- **Check-count reconciliation**: the repository postflight file contains exactly 13 checks, which matches the operator output. The "postflight 9 checks" wording in Feature 010 T056 was stale and has been corrected there.
- **Feature 010 T056 updated** (T056 block only): migration applied, postflight 13/13 recorded. T056 stays `[ ]` because its own remaining item, the **live EN/AR tag proof** (admin Arabic tag edit plus public Arabic tag render), has not been run. It belongs to Feature 010 / Phase 6 (T197) and is not a Batch A item.
- Nothing modified in production. **T002 is CLOSED.**

## T003 / T004 — Feature 008 / 010 / 012 reconciliation
- The roadmap 008 row now states "payment runtime superseded by Feature 013; the 10 open 008 tasks are NOT completed". No file under `specs/008-*` was modified (T015 guard).
- The roadmap 010 row records its blocked finance areas (payments/payouts/invoices) → Feature 013 Phase 4. The 012 row records DB-BLOCK-04 → Feature 013 Phase 5. A new 013 row was added.
- `DATABASE-CAPABILITY-MAP.md` §9 gains the DB-OPEN-C1, C2, C3/C4, C5/C7, C6/C9, C8 and C11–C14 rows (owner: Feature 013). DB-BLOCK-04 is annotated → Feature 013 Phase 5.

## T005 / T006 — Preflight script and operator run
- `supabase/maintenance/20260925_feature_013_preflight.sql` covers every R-21 item. It runs in a `READ ONLY` transaction ending in `ROLLBACK` and masks bank identifiers. It is pinned read-only by `tests/commerce/preflight-readonly.test.ts`.
- **OPERATOR (T006)**: open the Supabase SQL editor for project `hillscoffees-trading`, paste the file, run it, and paste every result grid under "Operator evidence" below. Catalog-level items the agent could not read are needed for the Batch B guards and rollbacks:
  - migration head;
  - function body fingerprints;
  - policy text;
  - triggers;
  - constraints;
  - `pg_extension`;
  - the live C1 check.

### Operator evidence (to be pasted by the operator)
> **T006 CLOSED (2026-09-24)**: §0–§10 received, verified and closed; all raw evidence files are present in `preflight-evidence/`.

**§0 — Identity and migration head (OPERATOR SQL, authoritative)**

Database `postgres`, captured at `2026-09-24 11:29:46.143415+00`. Top 10 of `supabase_migrations.schema_migrations`:

| version | name |
|---|---|
| 20260924120000 | tag_translations |
| 20260923120000 | catalogue_media_and_translations |
| 20260922130000 | feature_010_branding_avatar_listing_media |
| 20260922120000 | feature_008_stripe_trusted_funding |
| 20260921140000 | database_hygiene_m3_proforma_invoices_updated_at |
| 20260921120000 | feature_005_db_open_19_inventory_variance_hold |
| 20260920160000 | feature_011_db_block_10_price_policy_scope |
| 20260920140000 | database_hygiene_updated_at |
| 20260920120000 | feature_010_db_open_21_config_attribution |
| 20260919130000 | feature_010_db_open_22_compliance_organization_read |

Verification against the repository:
- **Remote head = local head = `20260924120000_tag_translations`.**
- The 10 listed versions match the 10 newest files in `supabase/migrations/` exactly, in the same order.
- No remote version is missing locally, and no local file is unapplied in this range.
- No Feature 013 migration exists remotely or locally.
- This confirms the T001 object-probe evidence and the Feature 008 Stripe migration's application (relevant to C1).
- The 8 older local files (`20260909000000` … `20260919120000`) fall outside the top-10 window. They predate these applied versions, and their objects are relied on by the applied chain.

**§4 — Hills receiving bank accounts (OPERATOR SQL, authoritative)**

`payment_accounts` rows: **0**. No bank account of any currency exists, active or inactive. This matches the agent's 11:00 UTC snapshot.

| column_name | data_type | is_nullable | column_default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| account_name | text | NO | null |
| bank_name | text | NO | null |
| account_number | text | YES | null |
| iban | text | YES | null |
| swift_code | text | YES | null |
| currency | character | NO | 'USD'::bpchar |
| is_active | boolean | NO | true |
| created_by | uuid | NO | null |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

Consequences for later batches:
- There is no `is_default_for_currency` column; it arrives with M1.
- There is no active USD account, so FR-042 fails every Feature 013 checkout closed (`bank_account_missing`) until a SUPER_ADMIN enters the real Hills account (T105, T235).
- The inventory in "Hills receiving bank-account inventory" below is confirmed.

**§5 — Function fingerprints (OPERATOR SQL, authoritative baseline for Feature 013 rollbacks)**

The operator confirmed **35 rows** were returned, each with arguments, `SECURITY DEFINER` state, `search_path` config, body MD5 and ACL.
- **Completeness**: the preflight §5 name list contains exactly 35 function names, so 35 rows means **every listed function exists, with exactly one overload each** (no unexpected overloads).
- **Present and fingerprinted**:
  - `checkout_order`, `expire_order_hold`, `submit_payment_proof`, `admin_review_payment`;
  - order visibility (`can_view_order`);
  - shipment functions (`validate_shipment_transition`, `validate_shipment_item`, `apply_delivery_reservation`, `reserve_ready_deliveries_for_settlement`, `sync_shipment_ready`);
  - audit (`write_audit_log`, `write_audit_log_payment_accounts`, `record_order_status_history`);
  - all authorization helpers.
- `admin_review_payment`: `SECURITY DEFINER`, EXECUTE for `authenticated`/`service_role`. This is the expected legacy posture (it checks `is_finance_operator()` internally). M6 revokes `authenticated` EXECUTE at cutover.
- **Stripe/provider-era functions still present**: `ingest_stripe_event`, `record_stripe_payment_intent`, `record_payment_transfer`. They are kept until M9 (Phase 7) revokes EXECUTE from every role; they are never dropped by Feature 013.
- `reserve_ready_deliveries_for_settlement` exists. Whether the live `admin_review_payment` body **calls** it is the §6 check (C1), still pending.

**Raw §5 baseline**: `preflight-evidence/section5-function-fingerprints.csv`: **COMPLETE and verified** (see "Evidence files"). It is the authoritative rollback and `do $guard$` fingerprint baseline for every Feature 013 migration.

**§6 — Live settlement-hook verification, C1 (OPERATOR SQL, authoritative)**

| proname | has_009_settlement_hook | has_008_trusted_funding_guard |
|---|---|---|
| admin_review_payment | **false** | **true** |

- The live `admin_review_payment` does **not** call `reserve_ready_deliveries_for_settlement` (the Feature 009 hook), and it **does** contain `trusted_funding_required` (the Feature 008 guard).
- The operator also returned the live `pg_get_functiondef` split into numbered lines. Lines 1–100 were pasted and match the body of `20260922120000_feature_008_stripe_trusted_funding.sql` statement for statement: signature/`SECURITY DEFINER`/`search_path`; `is_finance_operator()` check; payment then order `FOR UPDATE`; idempotent return; correlation id; `payment_reviews` insert; rejection branch → payment `REJECTED`, order back to `HOLD`.
- **C1 / DB-OPEN-C1 is CONFIRMED LIVE**: the applied Feature 008 migration dropped the Feature 009 settlement hook. The repository characterization (`tests/delivery/settlement-seam-characterization.test.ts`, 3/3) matches production.
- The fix owner is unchanged: **T117** (`finance_confirm_payment`, M5b). Production was **not** patched.
- Practical impact today: nil. No payment is under review and no proof exists (§2).
- **Raw §6 baseline**: `preflight-evidence/section6-admin-review-payment-definition.csv` is **COMPLETE and verified**: 438 lines, and its body MD5 equals the live §5 fingerprint (see "Evidence files"). **§6 is CLOSED.**

**Evidence files** (in `specs/013-bank-transfer-commerce-core/preflight-evidence/`; verified by the agent 2026-09-24; nothing modified in Batch A):

| File | Status | Verification |
|---|---|---|
| `section5-function-fingerprints.csv` | **COMPLETE — accepted as the rollback and `do $guard$` baseline** | See the §5 verification list below. |
| `section6-admin-review-payment-definition.csv` | **COMPLETE — accepted (re-exported 2026-09-24)** | One CSV cell holding the full `pg_get_functiondef` output: 10,026 characters, 438 lines, from `CREATE OR REPLACE FUNCTION public.admin_review_payment(…)` to the closing `$function$`. Contains `trusted_funding_required`; does **not** contain `reserve_ready_deliveries_for_settlement` (C1). **Integrity proof**: the text between `AS $function$` and the final `$function$`, with CR removed (the preflight's `md5(replace(prosrc, chr(13), ''))` normalization), hashes to `c0ef5f06b8ee47788825480cf56cfc03`, **identical to the live §5 `body_md5`**. The file is the exact, complete live body and is the M5b/M6 rollback text. |
| `section7-policies.csv` | **COMPLETE — accepted as the RLS/policy rollback baseline** | See the §7 verification list below. |
| `section8-triggers.csv` | **COMPLETE — accepted as the trigger rollback baseline** | See the §8 verification list below. |
| `section9-constraints.csv` | **COMPLETE — accepted as the constraint rollback baseline** | 10 rows; see the §9 verification list below. The file starts with one empty line before the header (cosmetic; parsed around, file not edited). |
| `section9-indexes.csv` | **COMPLETE — accepted as the index rollback baseline** | 3 rows; see the §9 verification list below. |
| `section10-storage-buckets.csv` | **COMPLETE** | 3 buckets; see §10 |
| `section10-extensions.csv` | **COMPLETE** | `pgcrypto 1.3` only; see §10 |
| `section10-anon-grants.csv` | **COMPLETE (header only = 0 rows, as intended)** | The query returned 0 rows; see §10 |

**§5 verification list** (`section5-function-fingerprints.csv`):
- 35 data rows, 35 unique names = exactly the 35 names in preflight §5. None missing, none unexpected, one overload each.
- Every `body_md5` is a 32-hex value.
- `SECURITY DEFINER` is true for all rows except `next_order_code` and `next_proforma_code`, which are plain SQL sequence wrappers, as in the baseline schema report.
- **Four fingerprints match the post-migration fingerprints recorded in the repository**:
  - `checkout_order` `75e07c357ea33a980fd695a271d8e708`, `expire_order_hold` `e5b8f4ee0c35948c6e582f2a9d3c0288` and `validate_offer_transition` `e1924325c811819baef4c4a5ea0c04f0` (Feature 007 migration header);
  - `reserve_ready_deliveries_for_settlement` `12226e365e405185845fc4561b87db85` (Feature 009 migration header).

  This independently confirms the live database matches the applied migration chain.
- `admin_review_payment` `c0ef5f06b8ee47788825480cf56cfc03`, EXECUTE `postgres`/`authenticated`/`service_role` (no `anon`).
- **New finding (recorded; not fixed in Batch A)**: `mfa_satisfied()` and `kyb_storage_object_authorized(text, boolean)` carry **`anon=X`** (EXECUTE for `anon`) in production. The Feature 003 migrations ran `revoke all … from public` and granted only `authenticated` (+`service_role`). The `anon` grant most likely comes from Supabase's default function privileges, which `revoke … from public` does not remove.
  - Risk: low. Both functions return `false` when `auth.uid()` is null, and neither discloses data.
  - It is still drift between the repository and production.
  - **Consequence for Feature 013**: every Feature 013 migration must `revoke all … from public, anon` explicitly (already required by MP-2 / conventions test T019), and the M3 postflight must assert `anon` has no EXECUTE on any Feature 013 function.
  - **Owner decision (2026-09-24)**: resolve DB-OPEN-C15 inside the Batch B security migration **M3** (T056–T062), not by an ad-hoc production patch. See §DB-OPEN-C15 below.

**§7 — RLS policy baseline (OPERATOR SQL, authoritative; raw file `preflight-evidence/section7-policies.csv`)**

Verification (agent, 2026-09-24):
- **37 policy rows**, 0 duplicates. Columns: `tablename, policyname, permissive, roles, cmd, qual, with_check`.
- **All 19 requested tables** are present, and each has at least one policy: `orders`, `order_items`, `order_financials`, `proforma_invoices`, `proforma_invoice_items`, `payments`, `payment_proofs`, `payment_reviews`, `payouts`, `tax_invoices`, `order_shipments`, `shipment_items`, `inventory_reservations`, `notifications`, `notification_deliveries`, `notification_preferences`, `payment_accounts`, `payment_events`, `payment_transfers`.
- **Reconciliation with the 2026-09-07 schema-report baseline**:
  - every baseline policy on these tables is live (none missing);
  - the only live policies not in that baseline are `payment_transfers_view` and `payment_transfers_finance`, created by the applied Feature 008 migration, as expected;
  - no unexplained policy exists.
- **C2 (seller data leak) CONFIRMED LIVE**: `payments_view` = `is_platform_admin() OR can_view_order(order_id)`, `payment_proofs_view` → `can_view_order` via `payments`, `financials_view` = `can_view_order(order_id)`, `proforma_view` = `can_view_order(order_id)`. These are exactly the policies M3 (T056–T062) must replace.
- `payouts_finance` is `FOR ALL` using `is_finance_operator()` (C6 confirmed live; M3 reduces it to SELECT).
- This file is the exact text the M3 rollback (and M6's `shipments_buyer_*` rollback) must restore. Nothing modified in Batch A. **§7 is CLOSED.**

**§8 — Trigger baseline (OPERATOR SQL, authoritative; raw file `preflight-evidence/section8-triggers.csv`)**

Verification (agent, 2026-09-24):
- **26 trigger rows**, 0 duplicates, columns `table_name, tgname, function_name, tgenabled`. **All 26 are enabled** (`tgenabled = O`).
- All 10 requested tables have at least one trigger: `coffee_offers`, `inventory_positions`, `order_items`, `order_shipments`, `orders`, `payment_accounts`, `payments`, `payouts`, `proforma_invoices`, `shipment_items`.
- **Reconciliation with the 2026-09-07 baseline**: every baseline trigger on these tables is live. The 7 live-only triggers are each traced to an applied migration:

  | Table | Trigger | Function | Migration |
  |---|---|---|---|
  | `coffee_offers` | `trg_coffee_offers_inventory_hold_guard` | `guard_offer_inventory_hold` | `20260921120000_feature_005_db_open_19_inventory_variance_hold` |
  | `inventory_positions` | `trg_inventory_positions_hold_guard` | `guard_inventory_position_hold` | same |
  | `order_shipments` | `trg_order_shipments_inventory_hold_guard` | `guard_shipment_inventory_hold` | same |
  | `order_items` | `trg_order_items_updated_at` | `set_updated_at` | `20260920140000_database_hygiene_updated_at` |
  | `payment_accounts` | `trg_audit_payment_accounts` | `write_audit_log_payment_accounts` (redacted) | `20260920120000_feature_010_db_open_21_config_attribution` |
  | `payment_accounts` | `trg_payment_accounts_updated_at` | `set_updated_at` | same |
  | `proforma_invoices` | `trg_proforma_invoices_updated_at` | `set_updated_at` | `20260921140000_database_hygiene_m3_proforma_invoices_updated_at` |

  No unexplained trigger exists.
- **Planning note for later batches (no change now)**: the three Feature 005 **inventory variance-hold guards** (DB-OPEN-19) fire on `coffee_offers`, `inventory_positions` and `order_shipments`. They are not named in the Feature 013 plan.
  - `confirm_proforma` (M4c), settlement title transfer and fulfillment creation (M5b) and `sync_order_fulfillment` (M5c) write to exactly these tables.
  - Their authoring and live proofs must include a variance-held position/offer case. The expected outcome is that a held position blocks reservation/settlement the same way the guards block legacy writes, with no bypass.
  - The M1 `do $guard$` should also pin these three triggers as present and enabled.
- This file is the trigger baseline that M1 (orders transition v2), M2b (proforma immutability), M4a (`enforce_new_order_flow`) and M5c (`sync_order_fulfillment`) rollbacks restore against. Nothing modified in Batch A. **§8 is CLOSED.**

**§9 — Constraints and indexes (OPERATOR SQL, authoritative; raw files `preflight-evidence/section9-constraints.csv`, `section9-indexes.csv`)**

Verification (agent, 2026-09-24):
- **Constraints: 10 rows = exactly the 10 names requested by preflight §9**, none missing, none extra, no duplicates:
  - `orders_status_check`, `inventory_reservations_status_check`, `proforma_invoices_status_check`, `proforma_invoices_order_id_key`;
  - `payments_status_check`, `payouts_status_check`, `payment_reviews_decision_check`;
  - `notification_deliveries_channel_check`, `notification_deliveries_status_check`, `notification_preferences_channel_check`.
- **Indexes: 3 rows = exactly the 3 requested**: `uq_active_inventory_reservation_order`, `uq_payment_proof_file`, `payments_order_id_key`.
- **Reconciliation with the 2026-09-07 baseline**:
  - `proforma_invoices_order_id_key` = `UNIQUE (order_id)` is textually identical.
  - All three index definitions are textually identical.
  - The nine CHECK constraints differ from the baseline text **only in `pg_get_constraintdef` parenthesization** (`CHECK ((…))` vs `CHECK (…)`); their **allowed-value sets are identical**:

    | Constraint | Allowed values |
    |---|---|
    | orders | `DRAFT`, `CONFIRMED`, `HOLD`, `PAYMENT_PROOF_SUBMITTED`, `PAYMENT_UNDER_REVIEW`, `PAID`, `FULFILLMENT_IN_PROGRESS`, `PARTIALLY_DELIVERED`, `COMPLETED`, `EXPIRED`, `VOID`, `DISPUTED` |
    | reservations | `ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED` |
    | proformas | `ISSUED`, `PAID`, `VOID` |
    | payments | `PENDING`, `PROOF_SUBMITTED`, `UNDER_REVIEW`, `CONFIRMED`, `REJECTED`, `EXPIRED`, `VOID` |
    | payouts | `PENDING_PAYOUT`, `PROCESSING`, `PAID`, `VOID` |
    | reviews | `CONFIRMED`, `REJECTED` |
    | delivery channels | `IN_APP`, `EMAIL`, `SMS`, `WHATSAPP` |
    | delivery statuses | `PENDING`, `SENT`, `FAILED`, `DELIVERED` |
    | preference channels | `EMAIL`, `SMS`, `WHATSAPP` |

    No applied migration has changed any of them.
- These are exactly the objects Feature 013 widens or replaces:
  - M1 widens the order/reservation/payment-review/payout sets;
  - M1 swaps `uq_active_inventory_reservation_order` for the open-reservation index (C14);
  - M2b drops `proforma_invoices_order_id_key` and widens the proforma set (C5);
  - M7 widens the notification channel/status sets.

  Their rollbacks restore these exact definitions (the live `pg_get_constraintdef` text). Nothing modified in Batch A. **§9 is CLOSED.**

**§10 — Storage buckets, extensions, anonymous table grants (OPERATOR SQL, authoritative; raw files `preflight-evidence/section10-*.csv`)**

| Bucket | public | file_size_limit | allowed_mime_types | Matches its migration |
|---|---|---|---|---|
| `kyb-evidence` | false | 10485760 (10 MiB) | pdf, jpeg, png | `20260911010000_feature_003_kyb_foundation` — identical |
| `listing-media` | false | 8388608 (8 MiB) | jpeg, png, webp | `20260922130000_feature_010_branding_avatar_listing_media` — identical |
| `public-assets` | **true** | 5242880 (5 MiB) | jpeg, png, webp | same migration — identical |

- **Buckets**: no other bucket exists. In particular **`payment-proofs` and `finance-documents` do not exist yet**, which is correct: M5a creates them, and its guard aborts if either already exists with different settings.
- **Extensions**: `pgcrypto 1.3` only. **`pg_cron` and `pg_net` are NOT enabled.**
  - `pg_cron` was approved (clarification Q2) but must be enabled by an OPERATOR only at T164 (CUTOVER-CHECKLIST §D), before M7b.
  - It is **not** enabled now. Nothing in Batches B–E depends on it: correctness is timestamp-based and the sweeper is also invoked lazily.
  - `pg_net` is not required by Feature 013.
- **Anonymous table grants**: the query over `orders`, `payments`, `payment_proofs`, `payment_accounts`, `payouts` and `proforma_invoices` returned **0 rows** (the file contains the header only, by design). `anon` holds **no direct table privilege** on these finance/commerce tables. Together with §7 (no anon-visible policy on them), this confirms the anonymous boundary for AC-014 at baseline.
  - Contrast with DB-OPEN-C15: that drift is anon **EXECUTE on two helper functions**, not a table grant.
- Nothing modified in Batch A. **§10 is CLOSED.**

**T006 status: CLOSED** — every preflight section §0–§10 has operator evidence recorded, and every raw evidence file (§5 fingerprints, §6 full definition with body MD5 = live fingerprint, §7 policies, §8 triggers, §9 constraints and indexes, §10 buckets, extensions and anon grants) is present in `preflight-evidence/` and verified.

**§3 — Commercial configuration (OPERATOR SQL, authoritative)**

| country_code | tax_name | rate_percentage | taxable_base | is_active | effective_from | effective_until |
|---|---|---|---|---|---|---|
| AE | VAT | 5.0000 | MERCHANDISE_ONLY | true | 2026-09-07 13:19:14.34052+00 | NULL |

- Shipping rules: **no rows**.
- Known delivery methods (shipping rules ∪ shipments): `Courier` only.
- Commission policies/tiers: **no rows**.

Interpretation (operator):
- UAE VAT is configured at 5 %, active, on a merchandise-only basis.
- No shipping fee rule and no commission policy or tiers exist.
- `Courier` exists only as an operational delivery method on existing shipments.
- Feature 013 checkout must therefore stay **fail-closed** (FR-042) until the bank account, shipping rule and commission policy are entered.

This matches the agent's 11:00 UTC read-only snapshot exactly, so there is no discrepancy for §3.

Consequences for later batches (no change now):
- The M2a `delivery_destinations.delivery_method` CHECK set is taken from this evidence: `{Courier}`, unless the business adds methods before M2a is authored. The shipping rules created later must use the same vocabulary.
- R-7 applies the AE rule to every order with `MERCHANDISE_ONLY`, so shipping carries no VAT until finance changes the basis (T235 sign-off).
- R-6 / FR-042: with no commission policy, every member-seller line fails `commission_rule_missing`, and Hills-owned lines need no tier.
- Fixture configuration (T016) remains the only way to exercise pricing in Batches C–E while the global switch is off.

**§2 — Reservations, payments, proofs, payouts, proformas (OPERATOR SQL, authoritative)**

| Reservations: status | reservations | active_past_expiry |
|---|---|---|
| EXPIRED | 2 | 0 |

| Payments: status | payment_method | provider | payments | trusted_funding_set |
|---|---|---|---|---|
| EXPIRED | BANK_TRANSFER | ∅ | 2 | 0 |

| Table | count |
|---|---|
| payment_proofs | 0 |
| payment_reviews | 0 |
| payment_events | 0 |
| payment_transfers | 0 |
| tax_invoices | 0 |
| notifications | 1 |

- Payouts: no rows.
- Proformas: `ISSUED` 3.
- Orders with more than one proforma: 0.

Interpretation (operator):
- There are no active or past-expiry reservations.
- The two payment rows are expired `BANK_TRANSFER` rows with no provider and no trusted funding.
- There are no proofs, reviews, provider events, transfers, tax invoices or payouts; there are 3 issued proformas, none duplicated per order.

Reconciliation notes (agent read-only follow-up, 11:3x UTC):
- **Versus the 11:00 UTC agent snapshot**: payments 4 → 2 (the 2 `PENDING` rows left with the removed HOLD orders), proformas 4 → 3, notifications 0 → 1. This matches the external live-test activity recorded under §1.
- **Owners of the `ISSUED` proformas (M2b guard input)**:
  - `ORD-20260914-0001231` and `ORD-20260914-0001232`: status `EXPIRED`, issued 2026-09-14. Their proformas stayed `ISSUED` because the legacy `expire_order_hold()` does not change proforma status.
  - `ORD-20260924-0006201`: status **`HOLD`**, issued **11:38:34 UTC**, after the §2 capture. It was created by the ongoing external live-test activity and was not present in the operator grids.
- The single `notifications` row seen by the operator was **gone** at the follow-up read (0 rows), so it was a transient test row.
- **Consequence for Batch B**:
  - The M2b guard must treat `ISSUED` proformas on terminal `EXPIRED` legacy orders as mappable (no open reservation). A non-terminal legacy `HOLD` with an `ISSUED` proforma must be drained or expired first, as the guard already specifies.
  - Because live suites keep creating and removing rows, the guard inputs must be re-read immediately before each MP-5 apply, with no concurrent live-test activity (CUTOVER-CHECKLIST §A).

**§1 — Legacy orders (OPERATOR SQL, authoritative)**

| status | buyer_org | orders |
|---|---|---|
| DRAFT | Foundation Test — Blocked Member | 1 |
| CONFIRMED | Foundation Test — Buyer And Seller | 99 |
| DRAFT | Foundation Test — Buyer And Seller | 1,769 |
| EXPIRED | Foundation Test — Buyer And Seller | 2 |
| PAID | Foundation Test — Buyer And Seller | 1 |
| DRAFT | Foundation Test — Buyer Only | 49 |

| Organizations with > 1 DRAFT | draft_orders |
|---|---|
| Foundation Test — Buyer And Seller | 1,769 |
| Foundation Test — Buyer Only | 49 |

| drafts_with_shipment_plan | drafts_plan_free |
|---|---|
| 1,174 | 645 |

Total DRAFT = 1,819; non-terminal legacy orders = 1,919. **Still no real-customer order**: all rows belong to the three test-fixture organizations.

**Discrepancy vs the agent snapshot (recorded for traceability; the operator SQL above is authoritative).** The agent's SELECT-only snapshot at **11:00:57 UTC** reported:
- DRAFT 1,808 / CONFIRMED 98 / HOLD 2 / PAID 1 / EXPIRED 2;
- 1,164 drafts with a shipment plan;
- reservations ACTIVE 2 / EXPIRED 2.

A follow-up read-only lookup at **11:33:22 UTC** found:
- the two former HOLD orders (`ORD-20260924-0006142`, `ORD-20260924-0006143`) **no longer exist**, and their two `ACTIVE` reservations are gone (reservations now: `EXPIRED` 2 only);
- new DRAFT orders created at **11:27:23–11:27:46 UTC** and **11:32:59–11:33:07 UTC**, the last one 15 seconds before the lookup.

Cause: **an actor outside this Batch A session was writing to production during the preflight window**, most likely a live test run creating fixture drafts and cleaning up its own HOLD orders. Batch A is excluded by its timestamps:
- the agent's inventory ran at 11:00:57 UTC and the static test run ended at 11:22:41 UTC, before the new rows;
- the stopped live-runner attempt (11:15:59 UTC) was limited to batch-1 admin files, which do not create orders.

Consequences:
- The earlier "2 HOLD orders with stale reservations" drain item is **obsolete**: those rows are gone.
- The drain list must be refreshed at drain time (T147), as already planned.
- **Before Batch B MP-5 applies, confirm no other process runs live suites against production during an apply window** (CUTOVER-CHECKLIST §A).
- Nothing was cleaned up or mutated in response.

## Supplemental read-only inventory (agent, 2026-09-24; SELECT-only via the service role; aggregates only)

**Orders by status**: `DRAFT` 1,808 · `CONFIRMED` 98 · `HOLD` 2 · `PAID` 1 · `EXPIRED` 2 (1,909 non-terminal).

| Area | Findings |
|---|---|
| Drafts | 2 organizations have > 1 `DRAFT`; the maximum in one organization is 1,758. 1,164 `DRAFT` orders carry a non-`CANCELLED` shipment (legacy buyer shipment plan). |
| Shipments | `DRAFT` 943 · `REQUESTED` 219 · `CANCELLED` 43 · `FAILED` 2 · `READY` 2. The only delivery method in use is `Courier`. |
| Reservations | `ACTIVE` 2 (**both past `expires_at`**, still holding reserved quantity on 2 offers) · `EXPIRED` 2 |
| Payments | 4 rows, all `BANK_TRANSFER`, provider ∅: `PENDING` 2 · `EXPIRED` 2. No trusted-funding markers. |
| Other finance rows | `payment_proofs` 0 · `payment_reviews` 0 · `payouts` 0 · `tax_invoices` 0. Proformas: 4, all `ISSUED`; no order has more than one. |
| Notifications | `notifications` 0 · `notification_deliveries` 0 |
| Offers | `PUBLISHED` 6 · `PARTIALLY_FILLED` 1 · `SOLD_OUT` 1 · `PENDING_REVIEW` 1 |

## T007 — Stripe / provider transactions
| Item | Result |
|---|---|
| `PROVIDER` payments | **0** (all 4 payments are `BANK_TRANSFER`, provider NULL) |
| `payments.trusted_funding_*` set | **0** |
| `payment_events` | **0** rows |
| `payment_transfers` | **0** rows |
| Deployed Supabase Edge Functions | **0**: no Edge Function is deployed (OPERATOR, see below). The Edge Function sources `stripe-create-payment-intent`, `stripe-release-transfer` and `stripe-webhook` are in the repository but not deployed. |
| `STRIPE_*` secrets / environment variables | **None**: 0 Supabase function secrets; no `STRIPE_*` variable in Vercel (OPERATOR, names only, see below); none in `.env.local`. |
| Stripe-related **PostgreSQL functions** | **LIVE in production** (preflight §5, `section5-function-fingerprints.csv`), all `SECURITY DEFINER`:<br>• `ingest_stripe_event`: EXECUTE `postgres`, `service_role`<br>• `record_stripe_payment_intent`: EXECUTE `postgres`, **`authenticated`**, `service_role`<br>• `record_payment_transfer`: EXECUTE `postgres`, **`authenticated`**, `service_role`<br>They were not modified in Batch A. |
| Verdict | **No non-terminal provider transaction exists**, so no provider transaction drain is required. The Stripe application/Edge runtime and its secrets are not deployed. The Stripe **database** runtime (three PostgreSQL functions) is still live and is decommissioned in Batch H (M9). |

**T007 operator evidence (2026-09-24, authoritative; read-only listings, names only, no secret values copied)**
- Project: `mxejnutukgxyccnohglo` = `hillscoffees-trading`.
1. `npx supabase functions list --project-ref mxejnutukgxyccnohglo`: **0 rows**, so no Edge Functions are deployed.
2. `npx supabase secrets list --project-ref mxejnutukgxyccnohglo`: **0 rows**, so there are no function secrets.
3. `npx vercel env ls` (project `specmediadxb-droid/hills-coffees-trading`) lists these variable **names**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TEST_FIXTURE_PASSWORD`. **No `STRIPE_*` variable exists.**
- Repository hygiene: the Vercel CLI added `.env*` to `.gitignore`. The operator reverted it with `git restore .gitignore`, so `.gitignore` is not part of the Batch A diff.

**Consequences for Feature 013**
The findings fall into five separate layers:
1. **Supabase Edge Functions**: none deployed.
2. **Stripe deployment secrets and environment variables**: none deployed (Supabase or Vercel).
3. **Stripe-related PostgreSQL functions**: `ingest_stripe_event`, `record_stripe_payment_intent` and `record_payment_transfer` are **still live in production**. `record_stripe_payment_intent` and `record_payment_transfer` remain executable by `authenticated`.
4. **Provider transaction data**: none (0 `PROVIDER` payments, 0 `payment_events`, 0 `payment_transfers`). **No transaction drain is required.**
5. **Batch H is still required**:
   - The operator steps T203 (Edge Function undeploy) and T205 (secret deletion) are expected to find nothing. They still re-list and record the state at that time, because a deploy could happen in between.
   - **M9 (T206–T211) must still perform the planned database-runtime decommission**: revoke EXECUTE on the three Stripe PostgreSQL functions from every role and restrict `payment_events`/`payment_transfers` to finance SELECT. It deletes no rows and drops no table or column, and every historical Feature 008 migration, rollback and postflight file is preserved byte-for-byte (T015).
   - The repository code, npm dependency and tests are removed by T199–T204, and the final scan is T213.

**Deployment hygiene (owner decision 2026-09-24)**: `TEST_FIXTURE_PASSWORD` is present in the Vercel environment and is **left unchanged for now**. It is a test-harness variable, not an application runtime need. **Before final production activation (T235)**, the operator must check whether any required test workflow still depends on it and, if none does, remove it from the Vercel environment. The outcome is recorded at T235.
- Deployment configuration was not modified. **T007 is CLOSED.**

## T008 — Feature 009 settlement-hook regression (C1)
- **Repository evidence (conclusive for the applied migration chain)**: `20260914120000_feature_009_db_block_07.sql` defines `admin_review_payment` with `perform public.reserve_ready_deliveries_for_settlement(...)`. The later `20260922120000_feature_008_stripe_trusted_funding.sql` (applied, per T001 object evidence) re-creates it from the 2026-09-07 baseline **without** the hook; the only other difference is the added `trusted_funding_required` guard.
- `tests/delivery/settlement-seam-characterization.test.ts` pins this (3/3 pass).
- **Live confirmation**: preflight §6 `has_009_settlement_hook` (**OPERATOR**, T006). The expected value is `false`.
- Recorded as **DB-OPEN-C1**; fix owner **T117** (`finance_confirm_payment`, M5b). The live function was **not** patched.
- **Practical impact today**: nil. The hook only matters when a shipment is `READY` before settlement, and there are no payments under review and no proofs in production.

## T009 — Old-flow orders that must finish before cutover
**All 1,909 non-terminal legacy orders belong to three test-fixture organizations; no real-customer order exists.**

| Buyer organization (fixture) | DRAFT | CONFIRMED | HOLD | PAID |
|---|---|---|---|---|
| Foundation Test — Buyer And Seller | 1,758 | 98 | 2 | 1 (`F006-FIX-SETTLED-B`) |
| Foundation Test — Buyer Only | 49 | — | — | — |
| Foundation Test — Blocked Member | 1 | — | — | — |

Drain actions (T147, after M4a):
- plan-free `DRAFT` → `admin_convert_legacy_draft`;
- `DRAFT` with a shipment plan (1,164) → `admin_void_order`;
- `CONFIRMED` → `DRAFT` → convert or void;
- the 2 `HOLD` orders (`ORD-20260924-0006142/6143`, reservations past expiry) → `expire_order_hold` (releases the stale reserved quantity once);
- the `PAID` fixture order is retained evidence and is reviewed at drain time.

The draft backlog grows every time the legacy live suites run, so the list is refreshed at drain time. The drain list also feeds the M2b guard (legacy `ISSUED` proformas: 4) and the M6 guard.

## Hills receiving bank-account inventory (requested; input for T105/T106 — nothing modified)
| Item | Finding |
|---|---|
| Rows in `payment_accounts` | **0** — **no bank account of any currency exists, active or inactive** |
| Active USD accounts | **0** |
| Active/default account | **None**. The table has **no default flag** (`is_default_for_currency` arrives with M1). |
| Column structure (applied migrations) | `id`, `account_name`, `bank_name`, `account_number` (nullable), `iban` (nullable), `swift_code` (nullable), `currency` (CHECK `USD`), `is_active`, `created_by`, `created_at`, `updated_at` (DB-owned, DB-OPEN-21) |
| Access | RLS `payment_accounts_admin`: read `is_platform_admin()`, write `is_super_admin()`. FINANCE cannot read the table. There is no member/public path. |
| Audit | `trg_audit_payment_accounts` → `write_audit_log_payment_accounts()` (redacted: last-4 only). No hard delete; retirement is `is_active = false`. |
| Admin UI | `/dashboard-admin/payment-accounts` (list masked, new, `[accountId]` detail), `lib/admin/payment-accounts.ts` (single caller) |

Gaps to close later:
- **T105**: a default-for-USD selection (column in M1, RPC in M4a, UI action in T105).
- **Authority alignment for T066/T105**: the contract lets any platform admin run `set_default_payment_account`, but bank-detail writes today require `is_super_admin()`. T066 should require `is_super_admin()` + MFA to stay consistent. Recorded here; not changed in Batch A.
- **T106**: buyer instructions must come only from the frozen `proforma_bank_instructions` snapshot (M2b). Neither buyers nor finance read `payment_accounts` directly.
- **Data**: a real Hills USD receiving account must be entered by a SUPER_ADMIN before production activation (T235). Without one, FR-042 fails every checkout closed (`bank_account_missing`).
- **Not modelled today (not required by the spec)**: beneficiary/bank address, intermediary bank, display order among several active accounts. The payment reference is generated per order (M2b), not stored on the account.
- **Governance**: no maker-checker on bank-detail edits (existing, recorded OPS-01 gap); unchanged by Feature 013.

## Commerce configuration relevant to FR-042 (fail closed)
| Rule | Production state |
|---|---|
| Tax | 1 rule: AE, 5 %, `MERCHANDISE_ONLY`, active since 2026-09-07 |
| Shipping | **0 rules** → every Feature 013 quote would fail `shipping_rule_missing` until configured |
| Commission | **0 policies** → every member-seller line would fail `commission_rule_missing` until configured |
| Bank account | **0** → `bank_account_missing` |

Consequence for testing: the Feature 013 fixture tooling (T016) creates clearly-labelled fixture configuration, which is **global** in this project. It is safe only while the global checkout switch is off, and it is deactivated or archived by cleanup and checked again at T235.

## T010 / T011 — Stale structural tests fixed
- **T010**: `tests/admin/finance-delegation.test.tsx` now admits `set_platform_logo`/`remove_platform_logo` for `(system)/branding/` files only, and `attach_coffee_media`/`remove_coffee_media`/`set_catalogue_translation` for `lib/admin/catalogue.ts` only, all by exact name. The catalogue RPCs from the applied catalogue migrations were a second stale cause, found during the fix. Every finance/settlement assertion is unchanged. Result: 14/14.
- **T011**: the account email copy key `forbidden` → `notPermitted` (EN/AR, `change-email-form.tsx`, `account-media-boundary-security.test.ts`). The forbidden-vocabulary copy audit is **not** weakened. Results: `tests/orders/error-mapping.test.ts` and `tests/auth/account-media-boundary-security.test.ts` green.

## T017 — Batched baseline
See the "Baseline results" section below.

**Owner decision (2026-09-24): the 94 live production-writing test files are WAIVED for Batch A only.** Rationale, as given by the owner:
- The static suite is green: 1,521 passed, 0 failed.
- The live suites write fixture rows into production.
- Production was already observed changing during the preflight window (see the §1 count discrepancy).

**Scope of the waiver**: Batch A only. It does **not** waive any targeted live proof required by later tasks, including every MP-6 live proof after a Feature 013 migration (for example T062 for M3) and the Batch gates B–I. **T017 is CLOSED (waived).**

## Baseline results (T017)

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 1 pre-existing warning (`tests/listings/manage-page.test.tsx` unused import; file untouched) |
| `npm run typecheck` | clean |
| `git diff --check` | clean |
| **Static** Vitest files (no live-database dependency), 14 batches | **110 files: 109 passed, 1 skipped; 1,521 tests passed, 22 skipped, 0 failed** |
| **Live** Vitest files (94 files that sign in or use the service role against the linked production project) | **NOT RUN — WAIVED for Batch A by owner decision (2026-09-24).** They create fixture orders/reservations in production. The waiver does not cover targeted live proofs in later batches. |

The files touched in Batch A are all green:
- `tests/admin/finance-delegation.test.tsx`: 14/14
- `tests/orders/error-mapping.test.ts`: static part green
- `tests/auth/account-media-boundary-security.test.ts`: green
- `tests/database/historical-008-unchanged.test.ts`: 62/62
- `tests/commerce/preflight-readonly.test.ts`: 4/4
- `tests/commerce/f013-fixtures.test.ts`: 7/7
- `tests/delivery/settlement-seam-characterization.test.ts`: 3/3

### Execution note (transparency)
A first attempt used the historical batch runner, which includes live suites. It was **stopped within seconds**, while batch 1 (`tests/admin/access-matrix…`) was starting. Its log shows only the Vitest start banner and no completed test. Leftover Vitest workers were killed. The baseline was then re-run on static files only. No Batch A step intentionally wrote to production.

## T018 — Batch A gate: PASS (2026-09-24)
- T001–T017 are complete. T017's 94 live production-writing suites were WAIVED for Batch A only, by owner decision; later targeted live proofs are not waived.
- The reviewer (owner) confirmed the preflight and instructed the gate to pass.
- No provider or legacy blocker is unaddressed:
  - there are 0 provider transactions (no drain required) and no Stripe Edge Functions, secrets or environment variables are deployed;
  - the three Stripe PostgreSQL functions are still live, and their revocation is planned in Batch H (M9, T206–T211);
  - all legacy orders are fixtures, and the drain list is refreshed at T147.
- Backup and cutover plan: `CUTOVER-CHECKLIST.md`.

Final mechanical checks:

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 1 pre-existing warning (unused import in an untouched test file) |
| `npm run typecheck` | clean |
| `git diff --check` | clean (only Git's line-ending notices) |
| Feature 013 migration files in `supabase/migrations/` | **0** |
| Batch A targeted tests (historical-008 pins, preflight read-only, F013 fixtures, settlement seam, finance delegation, account-media boundary) | 6 files, **111/111 passed** |
| Static baseline (T017) | 1,521 passed, 0 failed |

Production was not modified. No migration was created or applied. Nothing was committed or pushed. **STOP: Batch B (T019+) was not started.**

## DB-OPEN-C15 — owner decision (2026-09-24)
- **Decision**: resolve it in Batch B, inside the security migration **M3** (`20260925120000_feature_013_rls_realignment.sql`, T057), under the full MP protocol. There will be no ad-hoc production patch, and nothing was changed in Batch A.
- **Required correction**: `revoke execute … from public, anon` on:
  - `public.mfa_satisfied()`;
  - `public.kyb_storage_object_authorized(text, boolean)`.
- **What must be preserved**:
  - The functions keep EXECUTE for `authenticated` and `service_role`.
  - Their bodies, `SECURITY DEFINER` and `search_path` are unchanged (the body fingerprints must equal preflight §5).
  - The rollback restores the §5 ACL exactly.
- **Safety check already done (repository, read-only)**: every policy that calls either helper is scoped `to authenticated`. That covers the 11 `mfa_gate_*` policies and `kyb_evidence_member_select`/`_insert`, so no anonymous policy evaluation depends on the anon grant.
- **Still to check in T057**: any `SECURITY INVOKER` function reachable by `anon` that calls either helper must be identified, because anon calls to it would start failing. It is re-checked against the live catalog in the M3 dry-run.
- **Regression tests**:
  - static: T058 pins the revoke/grant statements;
  - live: the T056 anon probe asserts `anon` gets a permission error on both functions, while `authenticated` and `service_role` still execute them;
  - the M3 postflight asserts the ACL.
