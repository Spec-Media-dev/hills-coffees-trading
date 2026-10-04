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
