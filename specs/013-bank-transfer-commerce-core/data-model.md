# Data Model — 013 Bank Transfer Commerce Core

All money is `numeric(14,2)` USD, all quantities `numeric(14,3)` kg, all times `timestamptz` (UTC; displayed in
Asia/Dubai). "Existing" means present in the approved baseline or an applied migration; "new" means introduced by a
Feature 013 forward migration (migration ids refer to [plan.md §4](./plan.md#4-migration-sequence)). Every new table
has RLS **enabled and forced**, `REVOKE ALL` from `public`/`anon`, and only the grants listed in
[contracts/rls-storage.md](./contracts/rls-storage.md).

---

## 1. Configuration

### 1.1 `commerce_settings` — NEW (M1)
Singleton (`id boolean primary key default true check (id)`).

| Column | Type | Rule |
|---|---|---|
| `proforma_validity_hours` | int | NOT NULL default 24, CHECK 1–720. Read once by `issue_proforma()`; issued deadlines never change (clarification). |
| `bank_transfer_checkout_enabled` | bool | NOT NULL default false — kill switch (R-27). |
| `proof_submission_enabled` | bool | NOT NULL default true. |
| `pilot_organization_ids` | uuid[] | NOT NULL default `'{}'`. While `bank_transfer_checkout_enabled` is false, `issue_proforma()` still allows these buyer organizations (fixture/pilot proofs, Phase 3). This is an operational rollout control, not a product rule. |
| `updated_by` / `updated_at` | uuid / timestamptz | Set by `update_commerce_settings()`; audited. |

The 20-minute reservation is a locked product rule and is **not** a setting.

### 1.2 Existing configuration reused
Structure is unchanged; no policy/trigger changes, per the Feature 010 invariant.
- `tax_rules`: active AE rule (R-7).
- `shipping_rules`: country or NULL fallback, `delivery_method`, `flat_fee` (R-8).
- `commission_policies` + `commission_tiers` (R-6).
- `payment_accounts`: gains the column `is_default_for_currency bool NOT NULL default false`, plus the partial unique index `uq_payment_account_default_currency (currency) WHERE is_default_for_currency AND is_active`. `issue_proforma()` uses the default active USD account; if none exists → `bank_account_missing` (FR-042).

---

## 2. Cart and destinations

### 2.1 `orders` — EXISTING, extended (M1, M2)

| Column | Change |
|---|---|
| `status` | CHECK widened: + `PROFORMA_ISSUED`, `CANCELLED`, `PAYMENT_REJECTED` (legacy `CONFIRMED`, `PAYMENT_PROOF_SUBMITTED` kept for history). |
| `delivery_destination_id` | NEW uuid FK → `delivery_destinations(id)`. Set at issuance. |
| `destination_snapshot` | NEW jsonb. Frozen at issuance: `{label, country_code, city, address_lines[], contact_name, contact_phone, delivery_method}`. |
| `current_proforma_id` | NEW uuid FK → `proforma_invoices(id)`. The open proforma. |
| `cancelled_at` / `cancelled_by` / `cancel_reason` | NEW. |
| `has_manual_adjustment` | NEW bool default false (R-24). |
| `commerce_flow` | NEW text NOT NULL, CHECK `LEGACY` \| `BANK_TRANSFER_V1`. **M1** adds it with default `'LEGACY'`, so every existing row is `LEGACY` and Batch B changes no behaviour. **M4a** switches the column default to `'BANK_TRANSFER_V1'` and adds the BEFORE INSERT guard `enforce_new_order_flow`: any insert that is not `service_role` (test fixtures) is forced to `BANK_TRANSFER_V1`. After M4a no member path, including the legacy Feature 007 "start order" entry and direct API inserts, can create a `LEGACY` order. Only `admin_convert_legacy_draft()` may change the value, `LEGACY → BANK_TRANSFER_V1`, while the order is `DRAFT` and has no non-`CANCELLED` shipment (R-21). Legacy rows keep their functions until terminal. |

Cart = the organization's most recent `DRAFT` order with `commerce_flow = 'BANK_TRANSFER_V1'`. `get_or_create_cart()`
serializes creation per organization with `pg_advisory_xact_lock(hashtextextended(org_id::text, 13))`. There is no new
uniqueness constraint, so legacy drafts cannot break the migration.

### 2.2 `order_items` — EXISTING (unchanged columns)
`unit_price_per_kg` stays the **cart estimate** that `validate_order_item_offer()` rewrites on every insert/update. It is
never used for settlement after Feature 013 (R-4). `UNIQUE(order_id, offer_id)` makes each offer one cart line.

### 2.3 `delivery_destinations` — NEW (M2)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK organizations | NOT NULL |
| `label` | text | 1–80 chars |
| `country_code` | char(2) | NOT NULL, ISO-3166 alpha-2 upper |
| `city` | text | NOT NULL, 1–120 |
| `address_line_1` / `address_line_2` | text | line 1 NOT NULL 1–200 |
| `contact_name` / `contact_phone` | text | NOT NULL; phone E.164-shaped CHECK |
| `delivery_method` | text | NOT NULL; value set = the values used by `shipping_rules.delivery_method` (Phase 1 preflight lists them; CHECK added to match) |
| `is_default` | bool | partial unique `(organization_id) WHERE is_default AND retired_at IS NULL` |
| `retired_at` / `retired_by` | | retire = soft; never deleted |
| `created_by` / `created_at` / `updated_at` | | `set_updated_at` trigger |

Writes only through `upsert_delivery_destination()` and `retire_delivery_destination()` (buyer-org member with can-buy).
Orders reference a destination but read the **snapshot**, so later edits never change an order (FR-006, AC-007).

### 2.4 `commerce_request_log` — NEW (M1)
`request_id uuid PK`, `actor_user_id uuid NOT NULL`, `operation text NOT NULL`, `target_id uuid`, `response jsonb NOT
NULL`, `created_at`. No client grants. Index `(created_at)` for the 30-day purge (R-25).

---

## 3. Proforma and frozen economics

### 3.1 `proforma_invoices` — EXISTING, extended (M2)

| Column | Change / rule |
|---|---|
| `proforma_invoices_order_id_key` | **DROPPED**, replaced by `UNIQUE(order_id, version)` + partial unique `(order_id) WHERE status IN ('ISSUED','CONFIRMED','PAID')`. |
| `version` | NEW int NOT NULL default 1. |
| `supersedes_proforma_id` | NEW uuid FK self. |
| `status` | CHECK widened: `ISSUED`, `CONFIRMED`, `PAID`, `EXPIRED`, `SUPERSEDED`, `CANCELLED`, `VOID`. |
| `valid_until` | Reused as the **confirmation deadline** = `issued_at + validity`. NOT NULL for Feature 013 rows (CHECK on `commerce_flow` via the order is enforced in `issue_proforma()`; the column stays nullable for legacy rows). |
| `validity_hours_snapshot` | NEW int. |
| `currency` | NEW char(3) NOT NULL default 'USD', CHECK 'USD'. |
| `merchandise_gross`, `discount_total`, `merchandise_net`, `shipping_total`, `vat_total`, `buyer_total` | NEW numeric(14,2) NOT NULL; CHECK `buyer_total = merchandise_net + shipping_total + vat_total`; CHECK `merchandise_net = merchandise_gross − discount_total`. |
| `tax_rule_id`, `tax_rate_snapshot`, `tax_base_snapshot` | NEW. |
| `promotion_code_snapshot` | NEW text. The explicit code the buyer entered (may be NULL). |
| `buyer_snapshot` | NEW jsonb: legal/display name, tax number, country. |
| `destination_snapshot` | NEW jsonb: the same shape as on `orders`. |
| `bank_account_masked` | NEW jsonb: bank name, account name, last-4 of IBAN/account number, SWIFT. Safe for auditors. |
| `confirmed_at` / `confirmed_by` | NEW. |
| `expired_at`, `cancelled_at`, `voided_at` | NEW. |
| `issued_by` | NEW uuid. |
| `updated_at` | Existing (hygiene M3). |

Immutability trigger `protect_proforma_snapshot`: after insert, only the status/lifecycle columns (`status`,
`confirmed_*`, `expired_at`, `cancelled_at`, `voided_at`, `updated_at`) may change, and only along §7.2 transitions.
Every money, snapshot and party column is frozen (FIN-001, AC-007).

### 3.2 `proforma_invoice_items` — EXISTING, extended (M2), buyer-facing lines
Adds: `offer_id`, `offer_code_snapshot`, `seller_organization_id`, `seller_type_snapshot`, `warehouse_id`,
`fulfillment_group_id` FK, `quantity_kg` (NOT NULL for Feature 013 rows), `list_unit_price`, `price_tier_id`,
`unit_price`, `gross_amount`, `promotion_id`, `promotion_scope_snapshot` (`PLATFORM` | `SELLER`),
`promotion_funding_source` (`HILLS` | `SELLER`), `promotion_code_applied`, `promotion_rule_snapshot jsonb`,
`promotion_raw_amount`, `discount_amount` (applied), `discount_capped bool`, `discount_cap_reason` (`LINE_GROSS` |
`HILLS_COMMISSION`), `net_amount`, `vat_amount`, `line_total` (= net + vat), `product_name_snapshot`,
`origin_name_snapshot`, `lot_code_snapshot`.
`amount` (existing, NOT NULL) = `net_amount` for Feature 013 rows.
CHECKs:
- `discount_amount BETWEEN 0 AND gross_amount`; `discount_amount ≤ promotion_raw_amount`; `net_amount = gross_amount − discount_amount`; `line_total = net_amount + vat_amount`;
- `promotion_id IS NULL` ⇔ `discount_amount = 0` ⇔ `promotion_funding_source IS NULL`;
- `promotion_funding_source = 'HILLS'` ⇔ `promotion_scope_snapshot = 'PLATFORM'`;
- `seller_type_snapshot = 'HILLS'` ⇒ `promotion_funding_source IS DISTINCT FROM 'SELLER'`.

Immutable (trigger blocks UPDATE/DELETE). Buyers see the applied discount and whether it is a Hills or a seller offer; the
economic split lives in §3.3.

### 3.3 `proforma_line_economics` — NEW (M2), seller/finance-facing
`proforma_item_id` PK/FK, `proforma_id`, `seller_organization_id`, `seller_type_snapshot`, `commission_policy_id`,
`commission_tier_id`, `commission_rate_snapshot numeric(7,4)`, `seller_qualifying_quantity_kg` (= `Q_s`, FIN-013),
`gross_amount`, `seller_funded_discount`, `hills_funded_discount`, `commission_on_gross` (cap reference),
`commission_basis` (= gross − seller_funded_discount), `commission_amount`, `seller_net_amount`, `hills_share_amount`,
`buyer_net_amount`.

CHECKs (FIN-006/007/011/012):
- every amount ≥ 0;
- `seller_funded_discount = 0 OR hills_funded_discount = 0` (one promotion per line);
- `MEMBER_SELLER` lines:
  - `commission_basis = gross_amount − seller_funded_discount`;
  - `seller_net_amount + commission_amount = commission_basis`;
  - `hills_share_amount = commission_amount − hills_funded_discount`;
  - `hills_funded_discount ≤ commission_on_gross`;
  - `seller_net_amount + hills_share_amount = buyer_net_amount`;
- `HILLS` lines:
  - `seller_funded_discount = 0`, `commission_amount = 0`, `seller_net_amount = 0`;
  - `hills_share_amount = buyer_net_amount = gross_amount − hills_funded_discount`;
  - no tier fields.

Immutable.

### 3.4 `proforma_fulfillment_groups` — NEW (M2)
`id`, `proforma_id`, `seller_organization_id`, `warehouse_id`, `group_key text` (`seller:warehouse`),
`shipping_rule_id`, `delivery_method`, `shipping_amount`, `shipping_vat_amount`, `merchandise_net_amount`.
`UNIQUE(proforma_id, seller_organization_id, warehouse_id)`. Immutable.

### 3.5 `proforma_seller_settlements` — NEW (M2)
`proforma_id`, `seller_organization_id` (PK pair), `seller_type_snapshot`, `seller_qualifying_quantity_kg`,
`commission_tier_id`, `commission_rate_snapshot`, `gross_amount`, `seller_funded_discount`, `hills_funded_discount`,
`commission_basis`, `commission_amount`, `seller_net_amount`, `hills_share_amount`, `buyer_net_amount`. Each amount equals
the sum over that seller's `proforma_line_economics`. The rate and tier are the same on every line of the seller. A
deferred constraint trigger verifies the equalities at commit, plus `seller_net_amount ≥ 0` and
`hills_share_amount ≥ 0` (FIN-007, FIN-012). Immutable. The payout amount is `seller_net_amount`, so a Hills-funded
discount never changes it.

### 3.6 `proforma_bank_instructions` — NEW (M2), buyer + finance only
`proforma_id` PK/FK, `payment_account_id`, `account_name`, `bank_name`, `account_number`, `iban`, `swift_code`,
`currency`, `payment_reference` (= order code + proforma code; what the buyer must quote). Immutable. No generic audit
trigger (AUD-006). Access is logged through the `bank_instructions_viewed` outbox/audit entry, which carries no
identifiers.

### 3.7 `order_financials` — EXISTING, extended (M2)
Adds `proforma_id`, `discount_amount`, `seller_funded_discount`, `hills_funded_discount`, `hills_share_amount`. It is rewritten by `issue_proforma()` only while the order is
`DRAFT`/`PROFORMA_ISSUED`. Trigger `freeze_order_financials` refuses any change once the order leaves
`PROFORMA_ISSUED`. It stays the order-level summary for existing finance readers (finance/admin/auditor only after M3).

### 3.8 Pricing inputs — `offer_price_tiers`, `promotions`, `promotion_targets` — NEW (tables M2; RPCs M8)
Current rules are read by `compute_order_quote`; their outcome is frozen in §3.2/§3.3, so later edits never touch issued
proformas (FIN-001).

**`offer_price_tiers`**: `id`, `offer_id` FK, `min_quantity_kg numeric(14,3) > 0`, `price_per_kg numeric(14,2) ≥ 0`,
`currency` 'USD', `created_by`, `created_at`. `UNIQUE(offer_id, min_quantity_kg)`. The base price stays
`coffee_offers.price_per_kg`.

**`promotions`**

| Column | Rule |
|---|---|
| `id`, `promotion_code_ref` (`PRM-<7>`) | |
| `scope` | `PLATFORM` \| `SELLER` |
| `seller_organization_id` | NOT NULL iff `SELLER` |
| `funding_source` | `HILLS` \| `SELLER`; generated as `CASE scope WHEN 'PLATFORM' THEN 'HILLS' ELSE 'SELLER' END` (FIN-011) |
| `code` | nullable; `lower(code)` unique among non-archived rows; `[A-Z0-9-]{1,40}` |
| `discount_type` | `PERCENT` \| `AMOUNT_PER_KG` (v1 only) |
| `value` | numeric(14,4) `> 0`; CHECK `discount_type <> 'PERCENT' OR value <= 100` |
| `min_quantity_kg` | nullable, > 0 (per line) |
| `starts_at` / `ends_at` | CHECK `starts_at < ends_at` |
| `status` | `DRAFT`/`SCHEDULED`/`ACTIVE`/`PAUSED`/`ENDED`/`ARCHIVED`. **Effectiveness is derived, never cron-driven**: a promotion is eligible iff `status IN ('SCHEDULED','ACTIVE') AND starts_at <= clock_timestamp() < ends_at`. `DRAFT`, `PAUSED` and `ARCHIVED` are never eligible. `ENDED` is a display state; a promotion past `ends_at` is ineligible whatever its status. |
| `created_by`, `updated_by`, `created_at`, `updated_at` | audited |

**`promotion_targets`**: `promotion_id`, `target_kind` (`OFFER` \| `COFFEE` \| `ALL_SELLER_OFFERS` \| `ALL_OFFERS`
[platform only]), `offer_id`, `coffee_id`.

Configuration validation (FIN-012 "reject"), enforced by the `validate_promotion_scope` trigger and the upsert RPCs:
- A `SELLER` promotion may target only `MEMBER_SELLER` offers of its own organization; `COFFEE` targets resolve only to its own offers.
- `ALL_OFFERS` is platform-only.
- An `AMOUNT_PER_KG` seller promotion is refused when `value ≥` the lowest current base or tier price of any targeted offer.

Price-dependent excess is **capped** at quote time (research R-5 step 4), never stored as a negative outcome.

---

## 4. Reservation

### 4.1 `inventory_reservations` — EXISTING, extended (M1)

| Column | Change |
|---|---|
| `status` | CHECK widened: + `REVIEW_HOLD`. |
| `proforma_id` | NEW uuid FK. |
| `confirmed_by` | NEW uuid. |
| `review_hold_at` | NEW timestamptz. |
| `release_reason` | NEW text, CHECK `EXPIRED` \| `CANCELLED` \| `REJECTED` \| `ADMIN_VOID` \| `EXCEPTION`. |
| index | `uq_active_inventory_reservation_order` **replaced** by `uq_open_inventory_reservation_order (order_id) WHERE status IN ('ACTIVE','REVIEW_HOLD')`; NEW index `(expires_at) WHERE status = 'ACTIVE'` for the sweeper. |

`inventory_reservation_items` (existing, PK `(reservation_id, offer_id)`, `inventory_position_id`) is unchanged and is
written exactly as `checkout_order()` does today.

---

## 5. Payment, proof, review, reconciliation, invoice, payout

### 5.1 `payments` — EXISTING, extended (M1)
- `status` CHECK unchanged set (`PENDING`, `PROOF_SUBMITTED`, `UNDER_REVIEW`, `CONFIRMED`, `REJECTED`, `EXPIRED`,
  `VOID`). Feature 013 writes `PENDING → UNDER_REVIEW → CONFIRMED | REJECTED`, `PENDING → EXPIRED | VOID`.
- Adds:
  - `proforma_id`, `expected_amount` (= proforma buyer_total, frozen at confirmation);
  - `observed_amount`, `observed_currency`, `observed_value_date`, `observed_bank_reference`, `observed_bank_reference_normalized` (set only by finance confirmation);
  - `rejected_by`, `rejected_at`.
- Partial unique index `uq_confirmed_bank_reference (observed_bank_reference_normalized) WHERE status = 'CONFIRMED'` (duplicate transfer detection, R-11).
- `payment_method` stays `BANK_TRANSFER` for Feature 013. Stripe columns are retained, unused (R-20).

### 5.2 `payment_proofs` — EXISTING, extended (M1)
Adds:
- `claimed_amount numeric(14,2)`, `claimed_currency char(3)`, `transfer_date date`, `bank_reference text`;
- `submitted_at timestamptz NOT NULL default clock_timestamp()`. M1 backfills existing rows with `submitted_at = created_at` before adding NOT NULL, so historical proofs keep their true submission time (analysis L3);
- `submission_kind` (`ON_TIME` | `LATE_REPORT`);
- `request_id uuid UNIQUE`;
- `status` (`SUBMITTED` | `ACCEPTED` | `REJECTED` | `IN_RECONCILIATION`).

Partial unique `(payment_id) WHERE submission_kind = 'ON_TIME'`: exactly one authoritative on-time submission per payment.
`uq_payment_proof_file` is kept. Rows are immutable except `status`.

### 5.3 `payment_reviews` — EXISTING (reused)
One row per finance decision. `decision` CHECK widened: + `SENT_TO_RECONCILIATION`. Adds `request_id`.

### 5.4 `reconciliation_cases` — NEW (M2)
- Columns:
  - `id`, `case_code` (`REC-YYYYMMDD-<7>`);
  - `kind` (`LATE` | `PARTIAL` | `WRONG_CURRENCY` | `DUPLICATE` | `OTHER`);
  - `order_id`, `payment_id`, `proof_id`;
  - `observed_amount`, `observed_currency`, `observed_value_date`, `observed_bank_reference`;
  - `status` (`OPEN` | `IN_REVIEW` | `RESOLVED` | `CLOSED_NO_ACTION`);
  - `resolution_type` (`REFUNDED_EXTERNALLY` | `APPLIED_TO_NEW_ORDER` | `NO_FUNDS_RECEIVED` | `OTHER`), `resolution_note`, `linked_order_id`;
  - `opened_by`/`opened_at`, `resolved_by`/`resolved_at`.
- History goes to `reconciliation_case_events` (append-only).
- No column or function here touches inventory (AC-009).

### 5.5 `manual_financial_adjustments` — NEW (M2)
Append-only: `id`, `kind` (`REFUND_EXTERNAL` | `REVERSAL` | `CORRECTION`), `order_id`, `payment_id`, `payout_id`,
`amount`, `currency`, `external_reference`, `reason` (NOT NULL), `recorded_by`, `recorded_at`. A mutation-blocking
trigger enforces append-only (FIN-010, FR-044).

### 5.6 `tax_invoices` — EXISTING, extended (M2)
`file_asset_id`, `uploaded_by` → nullable. Adds `status` (`ISSUED` | `VOID`), `proforma_id`, `issued_by`,
`issued_at_ts timestamptz`, `snapshot jsonb` (no bank identifiers), and an `invoice_number` default from
`tax_invoice_code_seq`. `UNIQUE(order_id)` is kept (one final invoice per order).

### 5.7 `payouts` — EXISTING, extended (M1)
- `status` CHECK widened: + `ACCRUED`.
- Adds `proforma_id`, `eligible_at`, `recorded_amount`, `recorded_currency`, `request_id`.
- `UNIQUE(order_id, seller_organization_id)` is kept.
- CHECK: `status = 'PAID'` ⇒ `paid_by`, `paid_at`, `payment_reference` NOT NULL.

### 5.8 `payment_events`, `payment_transfers`, `payments.trusted_funding_*` — EXISTING, retained unchanged (Stripe era)
Made unused and access-restricted in Phase 7 (R-20). Never dropped by Feature 013.

---

## 6. Notifications

### 6.1 `notification_events` (outbox) — NEW (M2; consumers in M7)
- Columns:
  - `id`, `event_type`, `aggregate_type`, `aggregate_id`, `dedupe_key`;
  - `audience jsonb` (resolution rules, not user lists);
  - `template_key`, `params jsonb` (allowlisted keys only: order code, proforma code, status, deadline, amount only for the recipient's own economic view);
  - `status` (`PENDING` | `PROCESSING` | `PROCESSED` | `FAILED`), `attempts`, `next_attempt_at`, `claimed_at`, `claimed_by`, `processed_at`, `last_error` (sanitized), `created_at`.
- Constraints and indexes: `UNIQUE(event_type, aggregate_id, dedupe_key)`; index `(status, next_attempt_at)`.

### 6.2 `notifications` — EXISTING, extended (M7)
Adds `event_id` FK, `template_key`, `params jsonb`, `campaign_id`. `UNIQUE(event_id, user_id)`. The localized title/body
are rendered at read time from `template_key` + `params` in EN/AR (LOC-001). The existing `title`/`body` columns keep an
EN fallback. Read state is set only through RPCs.

### 6.3 `notification_deliveries` — EXISTING, extended (M7)
- `channel` CHECK widened: + `PUSH` (future Firebase).
- `status` CHECK widened: + `SKIPPED`.
- Adds `next_attempt_at`, `claimed_at`, `claimed_by`.
- `UNIQUE(notification_id, channel)`.

### 6.4 `notification_campaigns` / `notification_campaign_recipients` — NEW (M7)
- Campaign:
  - `id`, `title_en`, `title_ar`, `body_en`, `body_ar`;
  - `audience` (`APPROVED_BUYERS` | `APPROVED_SELLERS` | `ADMINISTRATORS` | `SELECTED_USERS`);
  - `channels text[]` (default `{IN_APP}`);
  - `status` (`DRAFT` | `SCHEDULED` | `DISPATCHING` | `SENT` | `CANCELLED` | `FAILED`), `scheduled_at`, `dispatched_at`, `recipient_count`;
  - `created_by`, `updated_by`, `cancelled_by`.
- Recipients: `(campaign_id, user_id)` PK for `SELECTED_USERS`.

### 6.5 Scheduled jobs (`pg_cron`, M7b — approved 2026-09-24) and the admin manual trigger
The admin "process now" diagnostic never uses the service role. It calls the M7 wrappers
`admin_process_outbox_now()` / `admin_dispatch_due_campaigns_now()` (EXECUTE `authenticated`; internally
`is_platform_admin() ∧ mfa_satisfied()`), which run the same internal bodies as the cron jobs (analysis H2).

Jobs are `f013_sweep_reservations`, `f013_process_outbox` and `f013_dispatch_campaigns` (every minute), plus
`f013_purge_request_log` (daily). Each calls one idempotent SECURITY DEFINER function that claims work with `SKIP LOCKED`.
Correctness never depends on them: deadlines are evaluated from `expires_at`/`valid_until` against `clock_timestamp()`
in every read, write and transaction check (research R-9).

`notification_preferences` (existing) is reused. `channel` CHECK widened: + `PUSH`.

---

## 7. State machines (authoritative transition tables — enforced in triggers/RPCs)

### 7.1 Order (`validate_order_transition` v2, M1)

| From | To | Only via | Guard |
|---|---|---|---|
| `DRAFT` | `PROFORMA_ISSUED` | `issue_proforma` | Checkout enabled; destination valid; items > 0; every line eligible; all rules present; no legacy shipment plan. |
| `DRAFT` | `CANCELLED` | `cancel_order` | Buyer. |
| `PROFORMA_ISSUED` | `PROFORMA_ISSUED` | `issue_proforma` (replacement) | Current proforma `EXPIRED` (or deadline passed → marked `EXPIRED` in the same transaction). |
| `PROFORMA_ISSUED` | `HOLD` | `confirm_proforma` | Proforma `ISSUED` ∧ `clock_timestamp() < valid_until` ∧ every line reservable. |
| `PROFORMA_ISSUED` | `CANCELLED` | `cancel_order` | — |
| `HOLD` | `PAYMENT_UNDER_REVIEW` | `submit_payment_proof` | Reservation `ACTIVE` ∧ before deadline. |
| `HOLD` | `EXPIRED` | `expire_reservation` / sweeper | Reservation `ACTIVE` ∧ deadline passed. |
| `HOLD` | `CANCELLED` | `cancel_order` | No proof submission exists. |
| `PAYMENT_UNDER_REVIEW` | `PAID` | `finance_confirm_payment` | R-11. |
| `PAYMENT_UNDER_REVIEW` | `PAYMENT_REJECTED` | `finance_reject_payment` | Reason required. |
| `PAID` | `FULFILLMENT_IN_PROGRESS` / `PARTIALLY_DELIVERED` / `COMPLETED` | `sync_order_fulfillment` | Aggregated from FULFILLMENT shipments. |
| `FULFILLMENT_IN_PROGRESS` | `PARTIALLY_DELIVERED` / `COMPLETED` | `sync_order_fulfillment` | — |
| `PARTIALLY_DELIVERED` | `COMPLETED` | `sync_order_fulfillment` | Every group delivered in full. |
| `PAID`…`PARTIALLY_DELIVERED` | `DISPUTED` | existing Feature 012 | Unchanged. |
| any non-terminal | `VOID` | `admin_void_order` (platform admin + MFA, reason) | Releases an open reservation exactly once; refused once `PAID` (post-payment uses manual adjustment). |

Terminal: `COMPLETED`, `EXPIRED`, `CANCELLED`, `PAYMENT_REJECTED`, `VOID`. Legacy rows (`commerce_flow = 'LEGACY'`)
keep the old graph until they are terminal. Every change is written to `order_status_history` with `reason` and actor
(existing trigger; `reason` is populated from the `app.transition_reason` GUC set by each RPC — AUD-001).

### 7.2 Proforma

```
ISSUED ──confirm──▶ CONFIRMED ──finance confirm──▶ PAID
  │                    ├──reservation expired──▶ EXPIRED
  │                    ├──buyer cancel─────────▶ CANCELLED
  │                    └──finance reject───────▶ VOID
  ├──deadline passed (lazy/sweeper/replacement)──▶ EXPIRED ──replacement issued──▶ (new version ISSUED; old stays EXPIRED)
  ├──buyer cancel──▶ CANCELLED
  └──admin void────▶ VOID
```
`SUPERSEDED` is reserved for an explicit admin re-issue of a still-valid proforma (admin exception only, audited).

### 7.3 Reservation

```
(created by confirm_proforma) ACTIVE ──proof on time──▶ REVIEW_HOLD ──finance confirm──▶ CONSUMED
        │                                      └──finance reject / admin void / exception──▶ RELEASED
        ├──deadline passed──▶ EXPIRED
        └──buyer cancel / admin void──▶ RELEASED
```
Every move out of `ACTIVE`/`REVIEW_HOLD` decrements `inventory_positions.reserved_quantity_kg` then the
`coffee_offers.reserved_quantity_kg` mirror, once (CONSUMED converts them into the title transfer instead).

### 7.4 Payment
`PENDING` → `UNDER_REVIEW` (on-time proof) → `CONFIRMED` | `REJECTED`; `PENDING` → `EXPIRED` (reservation expired) |
`VOID` (cancel/admin void). Late or mismatched transfers never change a terminal payment: they create a
`reconciliation_cases` row.

### 7.5 Payment proof
`SUBMITTED` → `ACCEPTED` (confirm) | `REJECTED` (reject) | `IN_RECONCILIATION` (case opened). `LATE_REPORT` proofs start
in `IN_RECONCILIATION`.

### 7.6 Reconciliation case
`OPEN` → `IN_REVIEW` → `RESOLVED` (resolution_type required) | `CLOSED_NO_ACTION`; `OPEN` → `CLOSED_NO_ACTION`. No
state has an inventory or title effect.

### 7.7 Fulfillment shipment (FULFILLMENT kind)
Created `DRAFT` → `REQUESTED` inside settlement, then the **existing** Feature 009 warehouse graph
(`CAPACITY_CONFIRMED`/`READY`/`RESERVED`/`PICKING`/`BOOKED`/`DISPATCHED`/`PARTIALLY_DELIVERED`/`DELIVERED`, `CANCELLED`/
`FAILED` under 009's recovery rule). Buyers cannot create or edit FULFILLMENT shipments.

### 7.8 Payout
`ACCRUED` (settlement) → `PENDING_PAYOUT` (order `COMPLETED`, `eligible_at` set) → `PROCESSING` (optional) → `PAID`
(`record_seller_payout`). `VOID` only by audited admin exception with a manual adjustment. Direct table writes are
revoked.

### 7.9 Notification campaign
`DRAFT` → `SCHEDULED` (`scheduled_at > now()`) → `DISPATCHING` (claimed) → `SENT`; `DRAFT`/`SCHEDULED` → `CANCELLED`;
`DISPATCHING` → `FAILED` (retryable by re-schedule). The outbox `dedupe_key = campaign_id` makes re-dispatch harmless.

---

## 8. Global locking order (every Feature 013 function; deadlock-free by construction)

1. `orders` row (`FOR UPDATE`). Finance functions resolve `order_id` from `payment_id` **without** a lock first, then
   lock the order. This reverses `admin_review_payment()`'s payment-then-order order, which is retired.
2. `proforma_invoices` row(s) of that order.
3. `inventory_reservations` row of that order.
4. `payments` row, then `payment_proofs` row.
5. `coffee_offers` rows **ascending by id**.
6. `inventory_positions` rows **ascending by id**.
7. Inserts: `inventory_ownership_events`, `storage_allocations`, `payouts`, `tax_invoices`, `order_shipments`/`shipment_items`, `notification_events`.

Sweeper/worker functions acquire (1) with `FOR UPDATE SKIP LOCKED`. Campaign and outbox workers lock only their own rows
with `SKIP LOCKED`. The per-organization cart-creation advisory lock is taken before (1) and only by
`get_or_create_cart()`.

---

## 9. Validation rules summary (database is authoritative; Zod mirrors shape only)

| Input | Rule |
|---|---|
| cart quantity | `> 0`, ≤ 3 decimals, ≤ current sellable (advisory at cart time; authoritative at confirmation) |
| destination | Fields per §2.3; country ISO-2; phone E.164 shape; must belong to the buyer org and not be retired |
| promo code | 1–40 chars `[A-Z0-9-]`, case-insensitive; unknown/ineligible codes are ignored with an explicit notice (never an error that reveals other sellers' promotions) |
| promotion config | `PERCENT` 0 < value ≤ 100; `AMOUNT_PER_KG` value > 0 and, for seller promotions, < lowest targeted price; window valid; targets owned (seller) — otherwise rejected (FIN-012) |
| proof | PDF/JPEG/PNG ≤ 10 MB; claimed amount ≥ 0 (2 dp); currency `USD`; transfer date ≤ today (Asia/Dubai); bank reference 1–80 printable |
| finance observed | amount (2 dp), currency, value date, bank reference required; reason required for reject/reconcile |
| payout record | amount = frozen amount, `USD`, reference 1–80, paid_at ≤ now |
| campaign | EN and AR title/body required (LOC-001); scheduled_at ≥ now + 5 min; audience valid |
| price tier | `min_quantity_kg > 0`, strictly increasing, price ≥ 0 |
