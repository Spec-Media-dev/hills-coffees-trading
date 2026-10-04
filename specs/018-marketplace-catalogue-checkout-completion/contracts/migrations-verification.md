# Contract: Schema Capture, Migration and Verification

Planning only: no forward/rollback SQL is created, applied or executed here. Timestamp/file naming follows current repository conventions after design review and actual-schema capture. Never edit or replay historical migrations to obtain grants/definitions.

## Evidence and Capture Gate

Checked-in effective sources include latest Feature 013 quote/reservation/snapshots/cart, Feature 014 support/notifications, Feature 015 checkout/proof, Feature 016 Finance/handoff and Feature 017 retirement migrations. `supabase/trading_schema.sql` and `docs/database/database-schema-report.json` are historical baselines, not proof of current installed bodies. Some item/inventory/order validators are represented across baseline, superseding files and fingerprint checks; their complete installed body is mandatory evidence before implementation.

Capture with approved **read-only** catalog access, recording server version, project identity, migration history, function owner/language/volatility/signature/result type/SECURITY DEFINER/config/ACL/default privileges, complete function definitions, trigger bindings/enabled state, policy USING/WITH CHECK/roles/permissiveness, table/column grants, RLS/force-RLS flags, indexes/constraints and extensions. Do not include secrets or private row payloads. Check direct PostgreSQL and effective HTTP/Auth/REST/Storage target consistency before any future fixture network operation. Remote approval is not implied by planning.

### Required Function Inventory

Capture every overload of the following names using catalog identity arguments, not a guessed signature. Known signatures are shown where established. Record absence explicitly; an unexpected overload/default grant is a review finding.

| Group | Functions whose installed definitions/config/ACL must be captured |
| --- | --- |
| Checkout/cart/request | `checkout_bank_transfer_v1(uuid,uuid,uuid)`, `compute_order_quote(uuid,uuid,text)`, `estimate_cart(uuid,uuid,text)`, `commerce_request_begin(uuid,text,uuid)`, `commerce_request_complete(uuid,jsonb)`, `commerce_assert_buyer_member(uuid)`, `commerce_resolve_cart(uuid)`, `get_or_create_cart(uuid)`, `add_cart_line(uuid,uuid,numeric,uuid)`, `update_order_item_quantity`, `remove_order_item`, `admin_convert_legacy_draft`, `upsert_delivery_destination`, `retire_delivery_destination` |
| Order/item/reservation/inventory | `validate_order_item_offer`, `validate_order_transition`, `enforce_new_order_flow`, `validate_offer_transition`, `guard_offer_inventory_hold`, `record_listing_status_history`, `commerce_release_reservation(uuid)`, `expire_reservation(uuid)`, `sweep_expired_reservations(integer)`; all installed order/item/offer/position/reservation transition, stock, title, quantity and history trigger functions discovered from the table binding closure below |
| Quote/snapshot/bank | `protect_proforma_snapshot`, `prevent_snapshot_mutation`, `check_seller_settlement_totals`, `check_proforma_snapshot_totals`, `freeze_order_financials`, `guard_order_proforma_pointer`, `set_default_payment_account(uuid,uuid)`, `update_commerce_settings`; all calculator/commission/shipping/tax helpers actually called by the captured quote/kernel |
| Legacy fences | `issue_proforma(uuid,uuid,text,uuid)`, `confirm_proforma(uuid,uuid)`, `checkout_order`, `submit_payment_proof` |
| Finance/proof/handoff | `finance_review_bank_transfer_v1`, `finance_terminal_review_integrity(uuid,uuid,text)`, `finance_payment_proof_projection(uuid)`, `finance_payment_proof_asset_projection(uuid)`, `admin_review_payment`, `prepare_payment_proof_upload`, `finalize_payment_proof`, `payment_proof_storage_object_authorized`; all bound invoice/ownership/allocation/shipment integrity functions |
| Admin/media/translation | `attach_coffee_media(uuid,text,text,text,bigint)`, `remove_coffee_media(uuid)`, `set_catalogue_translation(text,uuid,text,text,text)`, `public_asset_object_authorized(text,text)`; all Coffee/offer translation/media/readiness/history/audit validators found in bindings |
| Help | `next_support_ticket_code()`, `validate_support_ticket()`, `validate_support_message()`, `create_member_support_ticket(text,text,text,uuid,uuid)`, `create_support_ticket(text,text,uuid,uuid)` if installed |
| Auth/audit/notification | `can_view_order(uuid)`, `is_org_member(uuid)`, `is_authorized_member()`, `is_platform_admin()`, `is_blocked_user()`, `organization_can_buy`, `organization_can_sell`, actual MFA, Compliance, Super Admin, Finance/internal-transition and organization-resolution helpers called by above functions/policies; `write_audit_log()`, `set_updated_at()`, `mark_notification_read(uuid)`, `mark_all_notifications_read()`, `get_unread_notification_count()`, `commerce_notify_order_status_change()`, `commerce_notify_shipment_status_change()` |
| Feature017-retired | Every overload/signature of `admin_review_payment`, `record_stripe_payment_intent`, `record_payment_transfer`, `ingest_stripe_event`; retain definitions and exact effective application-role denials |

The binding/call closure is mandatory, not an optional exploratory list: derive and enumerate every additional function by exact `regprocedure` identity in the capture manifest before marking phase 1 complete. Inspect dynamic SQL/manual call references as well as catalog dependencies. This avoids pretending historical names constitute a complete installed inventory. Do not weaken existing guards because their live name differs.

### Required Policies, Triggers and Constraints

Capture **all** installed policies and triggers on these exact relations, including unexpected additions: `coffees`, Coffee translation/taxonomy relations, `coffee_media`, `file_assets`, `coffee_offers`, `listing_reviews`, lots, `inventory_positions`, `orders`, `order_items`, `delivery_destinations`, `commerce_request_log`, `inventory_reservations`, `inventory_reservation_items`, `proforma_invoices`, `proforma_invoice_items`, `proforma_line_economics`, `proforma_fulfillment_groups`, `proforma_seller_settlements`, `proforma_bank_instructions`, `order_financials`, `payment_accounts`, `payments`, `payment_proofs`, payment-review tables, `tax_invoices`, ownership-event tables, `storage_allocations`, `shipments`, `shipment_items`, `support_tickets`, `support_messages`, `notifications`, `notification_outbox`, organization memberships/organizations and `storage.objects`. Resolve exact deployed names for the descriptive historical tables during capture; missing/unmatched expected objects block implementation. Capture public/private views and their security mode, including `public_coffee_images` and seller projections.

Minimum named bindings to compare (plus complete relation inventory):

- `trg_orders_enforce_new_order_flow`; actual order/item/offer/position/reservation validators and history/audit bindings.
- `trg_proforma_invoices_protect_snapshot`, `trg_audit_proforma_invoices`, `trg_proforma_invoice_items_immutable`, `trg_proforma_line_economics_immutable`, `trg_proforma_fulfillment_groups_immutable`, `trg_proforma_seller_settlements_immutable`, `trg_proforma_bank_instructions_immutable`, `trg_audit_proforma_bank_instructions`, deferred totals bindings, `trg_order_financials_freeze`, `trg_orders_proforma_pointer_guard`.
- `trg_support_ticket_validate`, `trg_support_message_validate`, `trg_support_updated_at`, `trg_audit_tickets`; `tickets_insert_own`, `tickets_view_own_or_admin`, `tickets_admin_update`, `messages_ticket_access`, `messages_insert_access`.
- `trg_notify_order_status_change`, installed shipment notification binding; proof storage policies `payment_proof_storage_insert`/`payment_proof_storage_select`, `payment_proofs_read`, `catalog_admin_files`, `payment_proof_file_assets_read`; actual listing-media/public-assets policies.

Verify unique `(order_id,offer_id)` line merging, DRAFT permissibility/flow checks and absence/presence of one-DRAFT constraints, null-safe inventory-position uniqueness, default bank uniqueness, source snapshot immutability, Finance authoritative-review uniqueness and historical non-destructive FKs. Capture index expressions/predicates/null semantics, not just object names.

## Minimum Logical Forward Groups

| Group | Preflight | Forward behavior / permissions | Rollback and history | Read-only postflight |
| --- | --- | --- | --- | --- |
| M1 Featured/Arabic | Coffee status/translation/media structure, public DTO/view grants, proforma snapshot guards/types | Nullable Featured timestamp/index; two nullable AR item columns; no historical backfill. Existing catalogue permissions only; snapshot writes stay kernel-owned | Disable new reads/features safely; retain populated columns/values and snapshot guards. Do not restore a public wildcard DTO | Exact columns/defaults/index predicate/order; no rewritten historical snapshots; public allowlist and immutability bindings intact |
| M2 checkout | Complete lock graph, direct cart writers, request log/replay/constraints, F015/016/017 baseline and duplicates preflight | Payload-aware request binding, immutable receipt + ephemeral permits, selected quote, hardened V1 cart writes, staged private kernel and public fresh-child fence; Arabic insert activation. New entry RPCs authenticated only; private helpers/tables no API CRUD/execute; RLS enabled | Retain receipts/request payload/AR history, disable new fresh checkout if rollback UI unavailable, preserve safe legacy replay and fresh combined/source-cart denial. Never restore unrestricted pre-F018 kernel grants. Remove transient coordination only when no live operation/permit remains; no financial delete | Exact signatures/results/casts/SECDEF/path/ACLs; receipt uniqueness/FKs/immutability; zero durable permits; source/cart and kernel fences before replay/locks; F015 proof/017 denials retained |
| M3 Admin | Role/policy/provenance/media/audit guards and existing revision strategy | Controlled normalized idempotent saves/CAS/Featured/readiness/atomic publication and review activity. No stock insert or role expansion | Stop new orchestration safely; retain created records/intents/Featured selection/history. Do not permit raw old publication bypass of new readiness | Role/MFA split, request payload/revision guards, atomic publication/history, actual cache invalidation paths, no inventory-write authority |
| M4 Help | Feature014 refs/statuses/policies/triggers, message audit, notification recipients/types, actual order seller access | Category, cryptographic HC generation, append-only history, controlled idempotent operations, order-participant guard, exact status graph and safe transactional events | Preserve category/HC/history/messages and reference lookup; historical HLP resolve. Retain safe graph/auth/append-only guards even when new UI disabled; no reopening unsafe direct write path | Code uniqueness/format/generator, graph/collision/actor derivation, history ACL/immutability, current-org membership/staff authority, no body payload and commerce trigger regressions |

Groups may require multiple files for dependency ordering, but no historical file edit. M1 precedes M2 insertion logic, M2 request binding precedes M3/M4. Rollback is an explicitly documented safe downgrade retaining immutable schema/history and security fences, not a promise to erase all new columns or recreate the unsafe old binary behavior. Finalize paired forward/rollback definitions from captured effective bodies; never blindly restore the historical baseline.

## Hardening and Postflight Rules

- Every new SECDEF function has a reviewed owner, fixed `search_path` beginning `pg_catalog` with only trusted qualified schemas; no caller-controlled identifiers/path or trusted writable custom GUC. Schema-qualify writes and helpers. Revoke implicit PUBLIC execution and explicitly set anon/authenticated/service_role grants. Check default privileges too.
- Match declared PostgreSQL result types exactly, including numeric/uuid/jsonb/text and `char(3)` currency casts. DAL must propagate projection/RPC errors; no null-on-error read path.
- Enable table RLS and revoke direct application writes to receipts/permits/history/operation results. A service-role bypass of RLS is not a reason to keep dangerous table privileges. Recovery routines perform current authority checks before reading privileged rows.
- Use valid PostgreSQL catalogs: `pg_proc`/namespace identity args, `pg_get_functiondef`, `prosecdef`, `proconfig`, `aclexplode`/effective privilege checks; `pg_trigger` with `pg_get_triggerdef`, `pg_policy` with `pg_get_expr`, `pg_constraint` with `pg_get_constraintdef`, and `pg_index` with `pg_get_indexdef`. Account for installed server version before referencing version-specific fields. Inspect exact unique expressions/predicates/null semantics, not name alone. Compile/run postflight on isolated same-major PostgreSQL before approved remote use.
- Postflight is SELECT/read-only inspection; no repair DDL/DML hidden in it. Verify internal helper/table privilege denials by negative calls in isolated tests separately.
- Recheck Feature017 effective application-role denials for retired functions, retained `admin_review_payment` definition/BANK_TRANSFER_V1 fence and `trusted_funding_required`, and absence of deployed provider Edge functions/provider secrets. Secrets checks report names/presence only, never values. Preserve Feature015 legacy/proof/storage fences and Feature016 Finance terminal-integrity/projection/search_path/notification bindings.

## Compatibility Verification

Use a Feature018-specific wrapper selecting compatible Feature016 scenarios1–27 and adapting **fresh fixture creation** to selected-line checkout. Do not execute historical Scenario28 post-Feature017; do not execute Scenario29 unchanged. Replace old ACL expectations with Feature017/018-aware postflight assertions. Historical multi-group handoff/inventory/invoice/ownership/replay cases must still exercise already committed multi-line records; creating new combined checkout is not a compatibility requirement.

Verify Finance CONFIRM/REJECT, exact invoice/title/ownership/storage allocations, Feature009 FULFILLMENT groups/items, proof privacy/MFA, notification/audit and September22 legacy semantics under the existing V1 fence. Never replay historical migration/helpers that reopen retired grants. Test unrelated legacy suites only with their documented F013-local prerequisites; classify a failure as Feature018 regression only with verified causal evidence.

## Rollback/Reapply Failure Restoration

Every approved migration verification run uses mandatory recovery/finally after rollback succeeds. Any later test/cleanup/reapply/postflight failure must:

1. Inspect actual migration marker/schema/function/ACL state, not an in-memory success flag.
2. Conditionally reapply the necessary Feature018 groups in order using reviewed scripts; preserve Feature017 applied retirement and retained immutable data/security fences.
3. Run Feature018 and Feature017-aware postflight and active V1 health checks.
4. Prove final expected Feature018 APPLIED and Feature017 APPLIED/retired execution denied, active bank-transfer behavior healthy, no provider Edge/secrets.
5. Then report the original verification failure, with recovered safe state and cleanup/retained residue evidence. Do not erase the original failure merely because recovery succeeded.

If restoration fails, immediately stop dependent tests/mutations, report exact actual migration state, exposed function/table grants, failed recovery step and safe operator recovery instructions using the reviewed conditional reapply/postflight scripts. Never claim verification complete. Do not deploy an incompatible application while safe downgrade is active; forward recovery is the expected end state, not permissive restoration of combined/provider checkout.

## Fixture and Cleanup Safety

Future harness uses exact run manifest/provenance IDs and verified DB/HTTP/Auth/REST/Storage target identity before requests. Reject mixed F013-local/F018-approved-remote mode. Fixture sessions do not create a Supabase client before effective URL validation. Avoid exported environment/secret logs.

Before cleanup verify every candidate resource belongs to the manifest and correct target. Disposable Storage/temporary request/session resources can be removed only where no immutable reference requires retention; revoke/update fixture publication/state through guarded operations as appropriate. Retain receipts, proformas/payments/proofs/invoices/title/allocations/fulfillment/audit and any immutable request binding needed for recovery. Report retained residue honestly; never broad title/slug/prefix deletes, unpublish curated/demo records, or hide legitimate F013-looking member offers. Cleanup failure still enters final safe-state restoration/reporting.

## Evidence Required to Close Implementation

Record actual local commands/results, scoped scenario list and executed/skipped counts, schema capture digest, migration/rollback/reapply/postflight outcomes, direct/effective HTTP project identity, exact cleanup manifest and final state. No planning document, mocked test, capability probe, gated skip or build result substitutes for real connect/invoke/persisted assert/cleanup integration evidence.

## T012 Reconciliation Record (2026-10-04) — signed off for Phase A

**Evidence**: `evidence/schema-capture.md|json` (T011, REMOTE READ-ONLY against `mxejnutukgxyccnohglo`, PostgreSQL 17.6, read-only transaction confirmed `on`, 12 sections, 163 public functions, 120 triggers, 194 policies, 108 relations, 637 constraints, 204 indexes, 34 applied migrations, zero Vault secrets) and `evidence/local-baseline-hills_f018_base.json` (the same SELECT-only capture over a repository-derived local PostgreSQL 17 database: production pre-M4a schema dump + every checked-in migration through Feature 017, built by `scripts/f018-local-db.ts`). Reconciled with `npx tsx scripts/f018-capture-schema.ts --reconcile`.

**Result**: zero material drift against the manifest (all 69 manifest functions and every named relation/trigger/policy present). Live vs repository-derived baseline: all 163 function definitions, all triggers, constraints, indexes, enums and every `orders`/`order_items`/`proforma_*`/`inventory_*`/`coffee_*`/`payment_*`/`support_*` relation (columns, defaults, RLS flags, ACLs, owners) are identical. The 14 residual differences are classified as non-material baseline artifacts:

| Difference | Classification |
| --- | --- |
| `handle_new_user()` definition | CRLF vs LF only (identical after normalising carriage returns); the local copy comes from the CRLF reviewed Feature 003 SQL |
| 10 `storage.objects` policies (`kyb_evidence_*`, `listing_media_*`, `public_assets_*`, `mfa_gate_kyb_evidence`) live-only | The local baseline starts from a public-schema dump; these policies come from earlier migrations (F003/F010). No Phase A object depends on them; Feature 015 proof policies are present on both sides |
| `notification_events` / `storage.buckets` / `storage.objects` ACL | Explicit owner (`postgres`) grants and entry ordering only; no application-role difference |

**Live facts that shape the design (all verified in the capture, not assumed)**

1. Unique `order_items (order_id, offer_id)` exists (merge-on-Add). **No** one-DRAFT-per-organisation index exists, so historical multiple V1 DRAFTs are possible and no index is introduced.
2. Null-safe inventory-position uniqueness exists twice (`uq_inventory_position_null_safe`, `uq_inventory_positions_null_safe`, both `NULLS NOT DISTINCT`), so at most one position backs any (lot, owner, warehouse, location) tuple; `uq_payment_account_default_currency` enforces one default per currency.
3. Direct writers: `authenticated` holds INSERT/UPDATE on `orders` and INSERT/UPDATE on `order_items` (RLS: own DRAFT insert; no buyer UPDATE/DELETE policy on items; buyer UPDATE of own DRAFT/CONFIRMED orders). `service_role` holds full table privileges. `commerce_request_log` has no application-role grant (reachable only through SECURITY DEFINER callers). `update_order_item_quantity`, `remove_order_item` and `validate_order_item_offer` are executable by `authenticated` and `service_role`. The legacy `lib/orders/drafts.ts` still inserts DRAFT orders and items directly (`createDraftOrder` / `addOrderItem`).
4. Retired Feature 017 functions (`record_stripe_payment_intent`, `record_payment_transfer`, `ingest_stripe_event`, `admin_review_payment`) are executable by no application role (`effective_execute` all false). No Vault secrets are present. Edge-function deployment cannot be read through SQL; it stays a T136 check and no Management API credential is used in Phase A.
5. `validate_support_message()` is executable by `service_role` live but not in the repository-derived baseline. Informational; recorded for the M4 preflight (Phase B), not changed in Phase A.
6. Five unrelated KYB/inventory SECURITY DEFINER functions are executable by PUBLIC (`apply_kyb_review_item_decision`, `prevent_kyb_review_item_mutation`, `validate_inventory_location`, `validate_kyb_document_lineage`, `validate_review_item_document`). Pre-existing, outside Feature 018; reported, not modified.
7. `notification_outbox` (historical name) is deployed as `notification_events` + `notification_deliveries`; the capture manifest names the deployed relations.
8. `coffees` is readable by `anon` for `PUBLISHED` rows through `public_read_coffees`; `featured_at` is therefore an intentionally public editorial timestamp, and the public DTO allowlist (not RLS) is the privacy boundary.

### Signed-off lock graph (M2)

Selected checkout, in acquisition order: authority checks → `pg_advisory_xact_lock(hashtextextended(org::text, 13))` → canonical source order `FOR UPDATE` → selected source item `FOR UPDATE` → protected request claim (`f018_request_begin`) → expired-reservation discovery (no row locks) → candidate expired orders `FOR UPDATE SKIP LOCKED` ascending → their reservations `FOR UPDATE` → **union of the selected offer and released-reservation offers** `FOR UPDATE ORDER BY id` → **union of backing positions** `FOR UPDATE ORDER BY id` → release via `commerce_release_reservation` (its own order/reservation/offer/position locks are reentrant because already held) → new child order (no competing reader before commit) → child item insert (`validate_order_item_offer` re-locks the same offer/position: reentrant) → fenced `checkout_bank_transfer_v1` wrapper → `f018_checkout_kernel` (re-checks under the held locks; **no second reclamation scan**) → receipt → delete the selected source item.

Finance review (`order → payment → buyer advisory keys → offers asc → positions asc`) and expiry release (`order SKIP LOCKED → reservation → offers asc → positions asc`) acquire inventory locks in the same global ascending offer-then-position order and never wait on an order held by the staging step, so no new inversion is introduced. Add/update/remove take the organization advisory lock first, then the canonical order, then the item, and only then the trigger-locked offer/position, so a cart mutation can never wait on inventory while holding a lock a checkout needs.

### Signed-off object signatures

| Group | Object | Kind / access |
| --- | --- | --- |
| M1 | `coffees.featured_at timestamptz NULL`; partial index `idx_coffees_featured_published (featured_at DESC, id DESC) WHERE status='PUBLISHED' AND featured_at IS NOT NULL` | Column/index; write authority stays `catalog_admin_coffees` (Platform Admin) |
| M1 | `proforma_invoice_items.product_name_ar_snapshot text NULL`, `origin_name_ar_snapshot text NULL`; `CHECK (seller_type_snapshot IS NOT NULL OR both Arabic snapshots IS NULL)` | Populated only by the kernel INSERT; existing `trg_proforma_invoice_items_immutable` already refuses UPDATE/DELETE of V1 rows; the CHECK stops legacy rows from carrying Arabic values |
| M2 | `commerce_request_log.bound_payload jsonb NULL CHECK (jsonb_typeof = 'object')` | Existing protected table; legacy rows unchanged |
| M2 | `f018_request_begin(uuid,text,uuid,jsonb) → jsonb`, `f018_request_complete(uuid,jsonb) → void` | Private (no application-role EXECUTE) |
| M2 | `f018_canonical_cart(uuid) → uuid` (read-only; latest V1 DRAFT including empty) | Private, STABLE |
| M2 | `f018_stage_checkout_locks(uuid) → jsonb` (discovery, union staging, release) | Private |
| M2 | `f018_compute_quote_core(uuid,uuid,text,uuid[]) → jsonb`; `compute_order_quote(uuid,uuid,text)` retained as a delegating wrapper with unchanged ACL | Private core; existing signature preserved |
| M2 | `f018_checkout_kernel(uuid,uuid,uuid) → jsonb` (Feature 015 body, staged locks, Arabic snapshots) | Private, owner-only |
| M2 | `checkout_bank_transfer_v1(uuid,uuid,uuid) → jsonb` (replaced: fresh-DRAFT permit fence, historical replay unchanged) | `authenticated` only, as today |
| M2 | `checkout_cart_line_bank_transfer_v1(uuid org, uuid cart, uuid item, uuid offer, numeric qty, uuid destination, uuid request) → jsonb`; `estimate_cart_line_bank_transfer_v1(uuid,uuid,uuid,uuid,numeric,uuid) → jsonb`; `recover_cart_line_checkout(uuid,uuid,uuid,uuid,uuid,numeric,uuid) → jsonb` | New, `authenticated` only (PUBLIC/anon/service_role revoked) |
| M2 | `add_cart_line(uuid,uuid,numeric,uuid)`, `update_order_item_quantity(uuid,numeric)`, `remove_order_item(uuid)` (replaced with canonical-cart guards; signatures and ACLs unchanged) | As today |
| M2 | `cart_line_checkout_receipts` (data-model contract), `f018_checkout_permits`; `trg_f018_receipt_immutable`, deferred `trg_f018_permit_not_surviving`, `trg_f018_order_item_canonical_cart` (BEFORE INSERT on `order_items` for V1 DRAFT orders; closes the direct-insert writer) | RLS enabled, no application-role privileges on either table |
| M2 | `f018_receipt_integrity(uuid) → boolean` | Private |
| M3 | `create_catalogue_coffee_intent`, `save_catalogue_step`, `create_backed_offer_intent`, `set_coffee_featured`, `publish_coffee_catalogue_only`, `publish_coffee_with_approved_offer`, `recover_catalogue_operation`; monotonic `revision` counters on `coffees` and `coffee_offers` (the existing `updated_at` is `now()`-based and not collision-safe) | Argument lists fixed at M3 authoring (T042) from the T039 preflight; `authenticated` only, with in-function Platform Admin/MFA and, for coordinated publication, offer-publication authority |
| M4 | Category column, HC generator, `support_ticket_status_history`, `create_help_ticket`, `reply_help_ticket`, `transition_help_ticket`, `recover_help_operation` | Phase B (T098+); this record only fixes names |

### Signed-off grants and rollback boundaries

- New public entry points: `REVOKE ALL FROM PUBLIC, anon, service_role`, `GRANT EXECUTE TO authenticated`. Private helpers and both new tables: no application-role privilege; RLS enabled on tables; SECURITY DEFINER bodies use `search_path = pg_catalog, public, auth` with schema-qualified writes.
- Replaced functions use `CREATE OR REPLACE`, which preserves their existing ACL; the postflight asserts the exact post-state ACL.
- **M1 rollback**: no column/index is dropped (populated values and snapshot protections are retained); no public wildcard is restored.
- **M2 rollback** (as implemented): drops only the two new checkout/estimate public RPCs and **retains** `recover_cart_line_checkout` (receipt recovery stays available to committed buyers), plus receipts, the permits table, request payloads, Arabic snapshots, the fenced `checkout_bank_transfer_v1` / `f018_checkout_kernel`, the quote core and the canonical-cart guards. Consequence: after rollback no fresh checkout can run (the fence denies any DRAFT without a permit) — safe, never combined checkout, never Feature 017 execution.
- **M3 rollback** (authored with T043): drops the new RPCs, retains created Coffee/offer/intents/revisions/history and keeps the raw publication bypass closed.
- Historical migrations are never edited. Rollback files live in `supabase/rollback/` following the repository convention (`<timestamp>_<name>.rollback.sql`), **not** in `supabase/migrations/` as the task paths literally read, because a `_rollback.sql` file in `supabase/migrations/` would be applied as an ordinary forward migration by `supabase db push`.
