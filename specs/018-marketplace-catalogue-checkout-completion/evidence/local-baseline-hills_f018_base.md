# Feature 018 Schema Capture Evidence

- Captured: 2026-10-04T11:28:30.602Z
- Source: local docker supabase_db_hills-f013-local/hills_f018_base
- Command: `npx tsx scripts/f018-capture-schema.ts --local --database hills_f018_base`
- Target: n/a (local/reference)
- Server: PostgreSQL 17.6; database `hills_f018_base`; session user `postgres`
- Transaction read-only at capture: on
- Secret-pattern redactions applied: 0
- Mutation performed: none. Every section is a single SELECT inside BEGIN TRANSACTION READ ONLY ... ROLLBACK; no secret value or private row payload was read.

## Sections

| Section | Task | Status | Rows | SHA-256 of rows |
| --- | --- | --- | ---: | --- |
| meta | T003-T008 | captured | 1 | `d9721c3f7a8fe8f9` |
| migration_history | T003-T008 | unavailable (SQL_ERROR) | 0 | `-` |
| functions | T003-T008 | captured | 163 | `a2828858fc4f843e` |
| triggers | T004-T006 | captured | 120 | `49e700e27027d196` |
| policies | T005-T007 | captured | 184 | `b7a1d84eb12ec669` |
| relations | T005-T007 | captured | 108 | `62c91035da48f1f6` |
| constraints | T005 | captured | 637 | `8d591a5a6c763f9e` |
| indexes | T005 | captured | 204 | `3b704a2ee061f81b` |
| enums | T005 | captured | 0 | `4f53cda18c2baa0c` |
| default_privileges | T008 | captured | 9 | `36aa8dbb9524dd20` |
| storage_buckets | T007 | captured | 4 | `92faa3ea54c22299` |
| vault_secret_names | T008 | captured | 0 | `4f53cda18c2baa0c` |

## Drift and expectation findings

- informational `PUBLIC_EXECUTE_EXPOSURE` apply_kyb_review_item_decision(): SECURITY DEFINER function executable by PUBLIC
- informational `PUBLIC_EXECUTE_EXPOSURE` prevent_kyb_review_item_mutation(): SECURITY DEFINER function executable by PUBLIC
- informational `PUBLIC_EXECUTE_EXPOSURE` validate_inventory_location(): SECURITY DEFINER function executable by PUBLIC
- informational `PUBLIC_EXECUTE_EXPOSURE` validate_kyb_document_lineage(): SECURITY DEFINER function executable by PUBLIC
- informational `PUBLIC_EXECUTE_EXPOSURE` validate_review_item_document(): SECURITY DEFINER function executable by PUBLIC

Fail-closed verdict: no material drift against the manifest.

## Facts

- order_items_unique_order_offer: true
- orders_draft_unique_index: []
- payment_accounts_default_unique: ["uq_payment_account_default_currency"]
- inventory_positions_unique: ["inventory_positions_pkey nulls_not_distinct=false","uq_inventory_position_null_safe nulls_not_distinct=true","uq_inventory_positions_null_safe nulls_not_distinct=true"]
- proforma_immutability_triggers: ["order_financials:trg_order_financials_freeze","order_financials:trg_order_financials_snapshot_totals","proforma_bank_instructions:trg_audit_proforma_bank_instructions","proforma_bank_instructions:trg_proforma_bank_instructions_immutable","proforma_bank_instructions:trg_proforma_bank_instructions_snapshot_totals","proforma_fulfillment_groups:trg_proforma_fulfillment_groups_immutable","proforma_fulfillment_groups:trg_proforma_fulfillment_groups_snapshot_totals","proforma_invoice_items:trg_proforma_invoice_items_immutable","proforma_invoice_items:trg_proforma_invoice_items_snapshot_totals","proforma_invoices:trg_audit_proforma_invoices","proforma_invoices:trg_proforma_invoices_protect_snapshot","proforma_invoices:trg_proforma_invoices_snapshot_totals","proforma_invoices:trg_proforma_invoices_updated_at","proforma_line_economics:trg_proforma_line_economics_immutable","proforma_line_economics:trg_proforma_line_economics_settlement_totals","proforma_line_economics:trg_proforma_line_economics_snapshot_totals","proforma_seller_settlements:trg_proforma_seller_settlements_immutable","proforma_seller_settlements:trg_proforma_seller_settlements_snapshot_totals","proforma_seller_settlements:trg_proforma_seller_settlements_totals"]
- functions_total: 163
- manifest_functions_present: 69
- manifest_functions_total: 69
- closure_size: 100

## Binding/call closure (100 functions)

`add_cart_line`, `admin_convert_legacy_draft`, `admin_review_payment`, `apply_delivery_reservation`, `assert_order_checkout_ready`, `attach_coffee_media`, `can_view_order`, `check_proforma_snapshot_totals`, `check_seller_settlement_totals`, `checkout_bank_transfer_v1`, `checkout_order`, `commerce_assert_buyer_member`, `commerce_notify_order_status_change`, `commerce_notify_shipment_status_change`, `commerce_release_reservation`, `commerce_request_begin`, `commerce_request_complete`, `commerce_resolve_cart`, `compute_order_quote`, `confirm_proforma`, `create_member_support_ticket`, `create_support_ticket`, `enforce_new_order_flow`, `estimate_cart`, `expire_reservation`, `finalize_payment_proof`, `finance_payment_proof_asset_projection`, `finance_payment_proof_projection`, `finance_review_bank_transfer_v1`, `finance_terminal_review_integrity`, `freeze_order_financials`, `get_or_create_cart`, `get_unread_notification_count`, `guard_fulfillment_shipment_fields`, `guard_inventory_position_hold`, `guard_offer_inventory_hold`, `guard_order_destination_fields`, `guard_order_proforma_pointer`, `guard_organization_compliance_update`, `guard_shipment_inventory_hold`, `ingest_stripe_event`, `is_authorized_member`, `is_blocked_user`, `is_compliance_operator`, `is_finance_operator`, `is_internal_transition`, `is_org_member`, `is_platform_admin`, `is_warehouse_operator`, `issue_proforma`, `mark_all_notifications_read`, `mark_notification_read`, `mfa_satisfied`, `next_support_ticket_code`, `next_tax_invoice_code`, `organization_can_buy`, `organization_can_sell`, `payment_proof_storage_object_authorized`, `prepare_payment_proof_upload`, `prevent_inventory_variance_mutation`, `prevent_ownership_event_mutation`, `prevent_snapshot_mutation`, `protect_notification_event`, `protect_proforma_snapshot`, `protect_tax_invoice`, `public_asset_object_authorized`, `record_account_status_history`, `record_inventory_variance`, `record_listing_status_history`, `record_order_status_history`, `record_payment_transfer`, `record_stripe_payment_intent`, `remove_coffee_media`, `remove_order_item`, `reserve_ready_deliveries_for_settlement`, `resolve_inventory_variance`, `retire_delivery_destination`, `set_catalogue_translation`, `set_default_payment_account`, `set_updated_at`, `submit_payment_proof`, `sweep_expired_reservations`, `sync_shipment_ready`, `update_commerce_settings`, `update_order_item_quantity`, `upsert_delivery_destination`, `validate_inventory_location`, `validate_offer_transition`, `validate_order_item_offer`, `validate_order_transition`, `validate_shipment_item`, `validate_shipment_transition`, `validate_support_message`, `validate_support_ticket`, `write_audit_log`, `write_audit_log_orders_redacted`, `write_audit_log_payment_accounts`, `write_audit_log_platform_admins`, `write_audit_log_proforma_bank_instructions`, `write_audit_log_proforma_invoices`

