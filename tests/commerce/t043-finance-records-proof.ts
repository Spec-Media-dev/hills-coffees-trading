/**
 * Feature 013 T043 (MP-6) — the M2c live proof as ONE PostgreSQL `DO` block, executed against the linked project by
 * `tests/commerce/finance-records.live.test.ts` (F013_LIVE=1) through `supabase db query --linked`.
 *
 * Same method as T037 (T035 F4, owner-approved one-transaction setup): reconciliation cases, events, adjustments and
 * Feature 013 invoices are append-only / never deletable, so a committed live fixture could never be cleaned up. The block
 * creates every fixture, runs each case in its own savepoint, and always ends in
 * `raise exception 'T043_RESULT:<base64 json>'`, so all rows (fixtures, audit rows) roll back atomically. Only sequence values
 * (order/proforma/invoice/case codes, audit identity) are consumed.
 *
 * Fixtures: the T037 balanced BANK_TRANSFER_V1 proforma (reserved ids 13000000-…-0000000003xx) plus T043 rows in the reserved
 * 13000000-…-0000000004xx range: a payment, a proof and a payout on the V1 order; a LEGACY order with its own payment (the
 * "other order"); file assets for invoices/proofs.
 */
import { T037, T037_EXISTING, sqlLiteral as q, t037Accepted as accepted, t037Check as check, t037Internal as internal, t037Refused as refused, t037Snapshot as snapshot } from "./t037-snapshot-proof";

export const T043 = {
  marker: "13000000-0000-4000-8000-0000000004ff",
  orderOther: "13000000-0000-4000-8000-000000000401",
  paymentV1: "13000000-0000-4000-8000-000000000411",
  paymentOther: "13000000-0000-4000-8000-000000000412",
  payoutV1: "13000000-0000-4000-8000-000000000413",
  proofV1: "13000000-0000-4000-8000-000000000414",
  fileProof: "13000000-0000-4000-8000-000000000421",
  fileInvoice: "13000000-0000-4000-8000-000000000422",
  fileInvoice2: "13000000-0000-4000-8000-000000000423",
  fileLegacy: "13000000-0000-4000-8000-000000000424",
  caseKept: "13000000-0000-4000-8000-000000000431",
  caseProbe: "13000000-0000-4000-8000-000000000432",
  adjustmentKept: "13000000-0000-4000-8000-000000000441",
  invoiceKept: "13000000-0000-4000-8000-000000000451",
  invoiceLegacy: "13000000-0000-4000-8000-000000000452",
  shipmentS: "13000000-0000-4000-8000-000000000461",
  shipmentH: "13000000-0000-4000-8000-000000000462",
  shipmentProbe: "13000000-0000-4000-8000-000000000463",
} as const;

const I = T037;
const E = T037_EXISTING;
const X = T043;

export function buildT043ProofSql(): string {
  const orderInsert = (id: string, flow: string, marker: string) =>
    `insert into public.orders (id, buyer_organization_id, created_by, status, commerce_flow, correlation_id) values ('${id}', '${E.buyerOrg}', '${E.buyerUser}', 'DRAFT', '${flow}', '${marker}');`;
  const itemInsert = (id: string, order: string, offer: string, qty: number) =>
    `insert into public.order_items (id, order_id, offer_id, lot_id, seller_organization_id, quantity_kg, unit_price_per_kg, product_name_snapshot, lot_code_snapshot, seller_type_snapshot)
       select '${id}', '${order}', o.id, o.lot_id, o.seller_organization_id, ${qty}, o.price_per_kg, 'T043', 'T043', o.seller_type from public.coffee_offers o where o.id = '${offer}';`;
  const openCase = (id: string, over: { payment?: string; proof?: string | null; kind?: string } = {}) =>
    `insert into public.reconciliation_cases (id, kind, order_id, payment_id, proof_id, observed_amount, observed_currency, observed_value_date, observed_bank_reference, opened_by)
       values ('${id}', '${over.kind ?? "LATE"}', '${I.orderV1}', '${over.payment ?? X.paymentV1}', ${over.proof === undefined ? `'${X.proofV1}'` : over.proof === null ? "null" : `'${over.proof}'`}, 911.20, 'USD', '2026-09-25', 'T043-TRANSFER-REF', '${E.buyerUser}');`;
  const adjustment = (id: string, over: { payment?: string; payout?: string | null; amount?: string; reason?: string } = {}) =>
    `insert into public.manual_financial_adjustments (id, kind, order_id, payment_id, payout_id, amount, external_reference, reason, recorded_by)
       values ('${id}', 'REFUND_EXTERNAL', '${I.orderV1}', '${over.payment ?? X.paymentV1}', ${over.payout === null ? "null" : `'${over.payout ?? X.payoutV1}'`}, ${over.amount ?? "25.00"}, 'T043-BANK-REF', ${q(over.reason ?? "T043 external refund")}, '${E.buyerUser}');`;
  const SNAP = q(JSON.stringify({ totals: { buyer_total: 911.2, vat_total: 42.2 }, buyer: { legal_name: "T043 Buyer" }, destination: { city: "Dubai" } }));
  const invoice = (id: string, over: { order?: string; snapshot?: string } = {}) =>
    `insert into public.tax_invoices (id, order_id, proforma_id, issued_by, issued_at_ts, snapshot) values ('${id}', '${over.order ?? I.orderV1}', '${I.proforma}', '${E.buyerUser}', now(), ${over.snapshot ?? SNAP}::jsonb);`;
  const fulfillment = (id: string, seller: string, group: string, order: string = I.orderV1) =>
    `insert into public.order_shipments (id, order_id, delivery_method, country_code, address_line, contact_name, contact_phone, created_by, shipment_kind, fulfillment_seller_organization_id, fulfillment_warehouse_id, proforma_fulfillment_group_id)
       values ('${id}', '${order}', 'Courier', 'AE', 'From frozen snapshot', 'T043 Receiver', '+971500000043', '${E.buyerUser}', 'FULFILLMENT', '${seller}', '${E.warehouse}', '${group}');`;
  const asBuyer = `perform set_config('request.jwt.claims', ${q(JSON.stringify({ sub: E.buyerUser, role: "authenticated" }))}, true);`;
  const IDS43 = Object.values(X).map((id) => `'${id}'`).join(", ");

  return `do $t043$
declare
  r jsonb := '[]'::jsonb;
  v_detail text;
  v_constraint text;
  v_got text;
  v_legacy_invoices_before text := (select coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by id)), 'none') from public.tax_invoices t);
  v_shipments_before text := (select md5(string_agg(id::text || status || shipment_kind || coalesce(proforma_fulfillment_group_id::text, ''), '|' order by id)) from public.order_shipments);
  v_count bigint;
begin
  -- 0. Safety: production must be the post-M2c state this proof expects, with no T037/T043 row present.
  if to_regclass('public.reconciliation_cases') is null
     or exists (select 1 from public.orders where id in ('${I.orderV1}', '${X.orderOther}') or correlation_id in ('${I.marker}', '${X.marker}'))
     or exists (select 1 from public.reconciliation_cases) or exists (select 1 from public.manual_financial_adjustments)
     or exists (select 1 from public.tax_invoices where proforma_id is not null)
     or exists (select 1 from public.order_shipments where shipment_kind <> 'DELIVERY_REQUEST')
     or exists (select 1 from public.commerce_settings where bank_transfer_checkout_enabled) then
    raise exception 'T043_PRECONDITION_FAILED';
  end if;

  -- 1. Fixtures (all rolled back at the end): the T037 balanced V1 proforma, its payment/proof/payout, and another order.
  ${orderInsert(I.orderV1, "BANK_TRANSFER_V1", X.marker)}
  ${itemInsert(I.orderItem1, I.orderV1, E.offerLine1, 100)}
  ${itemInsert(I.orderItem2, I.orderV1, E.offerLine2, 20)}
  ${itemInsert(I.orderItem3, I.orderV1, E.offerLine3, 40)}
  ${internal(true)}
  set constraints all deferred;
  ${snapshot()}
  set constraints all immediate;
  ${internal(false)}
  ${orderInsert(X.orderOther, "LEGACY", X.marker)}
  insert into public.payments (id, order_id, amount) values ('${X.paymentV1}', '${I.orderV1}', 911.20), ('${X.paymentOther}', '${X.orderOther}', 10.00);
  insert into public.payouts (id, order_id, seller_organization_id, amount, status) values ('${X.payoutV1}', '${I.orderV1}', '${E.memberSellerOrg}', 630.50, 'ACCRUED');
  insert into public.file_assets (id, uploaded_by, bucket_name, object_path) values
    ('${X.fileProof}', '${E.buyerUser}', 't043-proof-fixture', 'proof/${X.fileProof}.pdf'),
    ('${X.fileInvoice}', '${E.buyerUser}', 't043-proof-fixture', 'invoice/${X.fileInvoice}.pdf'),
    ('${X.fileInvoice2}', '${E.buyerUser}', 't043-proof-fixture', 'invoice/${X.fileInvoice2}.pdf'),
    ('${X.fileLegacy}', '${E.buyerUser}', 't043-proof-fixture', 'invoice/${X.fileLegacy}.pdf');
  insert into public.payment_proofs (id, payment_id, file_asset_id, submitted_by) values ('${X.proofV1}', '${X.paymentV1}', '${X.fileProof}', '${E.buyerUser}');

  -- 2. Reconciliation cases: workflow-only, frozen identity, §7.6 lifecycle, never deleted; events append-only.
  ${refused("RECON: opening a case outside the workflow is refused", openCase(X.caseProbe), "reconciliation cases change only through the finance workflow", { immediate: false })}
  ${refused("RECON: a payment of another order is refused", openCase(X.caseProbe, { payment: X.paymentOther, proof: null }), "the payment does not belong to the order", { internal: true, immediate: false })}
  ${refused("RECON: a proof of another payment is refused", `insert into public.payment_proofs (id, payment_id, file_asset_id, submitted_by) values ('13000000-0000-4000-8000-000000000416', '${X.paymentOther}', '${X.fileProof}', '${E.buyerUser}'); ${openCase(X.caseProbe, { proof: "13000000-0000-4000-8000-000000000416" })}`, "the proof does not belong to the payment", { internal: true, immediate: false })}
  ${refused("RECON: OPEN → RESOLVED directly is not a §7.6 transition", `${openCase(X.caseProbe)} update public.reconciliation_cases set status = 'RESOLVED', resolution_type = 'OTHER', resolved_by = '${E.buyerUser}', resolved_at = now() where id = '${X.caseProbe}';`, "reconciliation_case_transition_invalid", { internal: true, immediate: false })}
  ${internal(true)}
  ${openCase(X.caseKept)}
  perform set_config('app.transition_reason', 'T043 reviewing the late transfer', true);
  update public.reconciliation_cases set status = 'IN_REVIEW' where id = '${X.caseKept}';
  update public.reconciliation_cases set status = 'RESOLVED', resolution_type = 'REFUNDED_EXTERNALLY', resolution_note = 'T043 refunded outside the platform', resolved_by = '${E.buyerUser}', resolved_at = now() where id = '${X.caseKept}';
  perform set_config('app.transition_reason', '', true);
  ${internal(false)}
  ${check("RECON: the case moved OPEN → IN_REVIEW → RESOLVED with a REC- code and exactly 3 history events (reason recorded)", `(select case_code ~ '^REC-[0-9]{8}-[0-9]{7}$' and status = 'RESOLVED' from public.reconciliation_cases where id = '${X.caseKept}') and (select count(*) = 3 and count(*) filter (where from_status = 'OPEN' and to_status = 'IN_REVIEW' and note = 'T043 reviewing the late transfer') = 1 from public.reconciliation_case_events where case_id = '${X.caseKept}')`, `(select string_agg(coalesce(from_status, '-') || '>' || to_status, ',' order by created_at) from public.reconciliation_case_events where case_id = '${X.caseKept}')`)}
  ${refused("RECON: a resolved case is final (no further change)", `update public.reconciliation_cases set resolution_note = 'changed later' where id = '${X.caseKept}';`, "a closed case is final", { internal: true, immediate: false })}
  ${refused("RECON: observed values are frozen", `${openCase(X.caseProbe)} update public.reconciliation_cases set observed_amount = 1 where id = '${X.caseProbe}';`, "identity and observed values are frozen", { internal: true, immediate: false })}
  ${refused("RECON: a status change outside the workflow is refused", `${internal(true)} ${openCase(X.caseProbe)} ${internal(false)} update public.reconciliation_cases set status = 'IN_REVIEW' where id = '${X.caseProbe}';`, "only through the finance workflow", { immediate: false })}
  ${refused("RECON: a case is never deleted", `delete from public.reconciliation_cases where id = '${X.caseKept}';`, "a reconciliation case is never deleted", { internal: true, immediate: false })}
  ${refused("RECON EVENTS: UPDATE is refused (append-only)", `update public.reconciliation_case_events set note = 'rewritten' where case_id = '${X.caseKept}';`, "snapshot_immutable", { internal: true, immediate: false })}
  ${refused("RECON EVENTS: DELETE is refused (append-only)", `delete from public.reconciliation_case_events where case_id = '${X.caseKept}';`, "snapshot_immutable", { internal: true, immediate: false })}

  -- 3. Manual financial adjustments: workflow-only, same-order references, append-only.
  ${refused("ADJUSTMENT: recording outside the workflow is refused", adjustment(X.adjustmentKept), "manual adjustments are recorded only through the finance workflow", { immediate: false })}
  ${refused("ADJUSTMENT: a payment of another order is refused", adjustment(X.adjustmentKept, { payment: X.paymentOther }), "the payment does not belong to the order", { internal: true, immediate: false })}
  ${refused("ADJUSTMENT: a payout of another order is refused", `insert into public.payouts (id, order_id, seller_organization_id, amount, status) values ('13000000-0000-4000-8000-000000000415', '${X.orderOther}', '${E.memberSellerOrg}', 1, 'ACCRUED'); ${adjustment(X.adjustmentKept, { payout: "13000000-0000-4000-8000-000000000415" })}`, "the payout does not belong to the order", { internal: true, immediate: false })}
  ${refused("ADJUSTMENT: a zero amount is refused", adjustment(X.adjustmentKept, { amount: "0" }), "manual_financial_adjustments_amount_check", { internal: true, immediate: false })}
  ${refused("ADJUSTMENT: a blank reason is refused", adjustment(X.adjustmentKept, { reason: "   " }), "manual_financial_adjustments_reason_check", { internal: true, immediate: false })}
  ${internal(true)}
  ${adjustment(X.adjustmentKept)}
  ${internal(false)}
  ${check("ADJUSTMENT: the workflow recorded one adjustment bound to the V1 order, its payment and payout", `(select count(*) = 1 from public.manual_financial_adjustments where id = '${X.adjustmentKept}' and order_id = '${I.orderV1}' and payment_id = '${X.paymentV1}' and payout_id = '${X.payoutV1}')`)}
  ${refused("ADJUSTMENT: UPDATE is refused (append-only)", `update public.manual_financial_adjustments set amount = 999 where id = '${X.adjustmentKept}';`, "snapshot_immutable", { internal: true, immediate: false })}
  ${refused("ADJUSTMENT: DELETE is refused (append-only)", `delete from public.manual_financial_adjustments where id = '${X.adjustmentKept}';`, "snapshot_immutable", { internal: true, immediate: false })}

  -- 4. Final invoices: LEGACY behaviour unchanged; Feature 013 invoices frozen except ISSUED → VOID and one file attachment.
  ${accepted("LEGACY INVOICE: an uploaded invoice (number + file + uploader) is inserted, edited and deleted outside the workflow as before", `insert into public.tax_invoices (id, order_id, invoice_number, file_asset_id, uploaded_by, issued_at) values ('${X.invoiceLegacy}', '${X.orderOther}', 'T043-LEGACY-1', '${X.fileLegacy}', '${E.buyerUser}', current_date); update public.tax_invoices set invoice_number = 'T043-LEGACY-1B' where id = '${X.invoiceLegacy}'; delete from public.tax_invoices where id = '${X.invoiceLegacy}';`)}
  ${refused("LEGACY INVOICE: a legacy invoice still requires its file and uploader", `insert into public.tax_invoices (order_id, invoice_number) values ('${X.orderOther}', 'T043-LEGACY-2');`, "tax_invoices_legacy_shape_check", { immediate: false })}
  ${refused("LEGACY INVOICE: a legacy invoice cannot acquire Feature 013 values", `insert into public.tax_invoices (id, order_id, invoice_number, file_asset_id, uploaded_by) values ('${X.invoiceLegacy}', '${X.orderOther}', 'T043-LEGACY-3', '${X.fileLegacy}', '${E.buyerUser}'); update public.tax_invoices set status = 'VOID' where id = '${X.invoiceLegacy}';`, "a LEGACY invoice cannot acquire Feature 013 values", { immediate: false })}
  ${refused("F013 INVOICE: issuing outside the workflow is refused", invoice(X.invoiceKept), "issued only by the settlement workflow", { immediate: false })}
  ${refused("F013 INVOICE: a snapshot carrying bank data (nested) is refused", invoice(X.invoiceKept, { snapshot: q(JSON.stringify({ totals: { buyer_total: 1 }, seller: { bank: { iban: "AE07T043" } } })) }), "tax_invoices_snapshot_no_bank_check", { internal: true, immediate: false })}
  ${refused("F013 INVOICE: a proforma of another order is refused", invoice(X.invoiceKept, { order: X.orderOther }), "tax_invoices_proforma_fkey", { internal: true, immediate: false })}
  ${internal(true)}
  ${invoice(X.invoiceKept)}
  ${internal(false)}
  ${check("F013 INVOICE: issued by the workflow as ISSUED with an INV- number and no file yet", `(select invoice_number ~ '^INV-[0-9]{8}-[0-9]{7}$' and status = 'ISSUED' and file_asset_id is null and proforma_id = '${I.proforma}' from public.tax_invoices where id = '${X.invoiceKept}')`, `(select invoice_number from public.tax_invoices where id = '${X.invoiceKept}')`)}
  ${refused("F013 INVOICE: a second invoice for the order is refused (UNIQUE(order_id))", invoice("13000000-0000-4000-8000-000000000453"), "tax_invoices_order_id_key", { internal: true, immediate: false })}
  ${refused("F013 INVOICE: the snapshot is frozen", `update public.tax_invoices set snapshot = '{}' where id = '${X.invoiceKept}';`, "a final invoice is frozen at issuance", { internal: true, immediate: false })}
  ${refused("F013 INVOICE: a change outside the workflow is refused", `update public.tax_invoices set status = 'VOID' where id = '${X.invoiceKept}';`, "final invoices change only through the finance workflow", { immediate: false })}
  ${refused("F013 INVOICE: never deleted", `delete from public.tax_invoices where id = '${X.invoiceKept}';`, "a final invoice is never deleted", { internal: true, immediate: false })}
  ${internal(true)}
  update public.tax_invoices set file_asset_id = '${X.fileInvoice}', uploaded_by = '${E.buyerUser}' where id = '${X.invoiceKept}';
  ${internal(false)}
  ${check("F013 INVOICE: the signed file was attached once by the workflow", `(select file_asset_id = '${X.fileInvoice}' and uploaded_by = '${E.buyerUser}' from public.tax_invoices where id = '${X.invoiceKept}')`)}
  ${refused("F013 INVOICE: the attached file cannot be replaced", `update public.tax_invoices set file_asset_id = '${X.fileInvoice2}' where id = '${X.invoiceKept}';`, "the signed file is attached once", { internal: true, immediate: false })}
  ${accepted("F013 INVOICE: ISSUED → VOID by the workflow is accepted", `update public.tax_invoices set status = 'VOID' where id = '${X.invoiceKept}';`, { internal: true })}
  ${refused("F013 INVOICE: VOID → ISSUED is refused", `update public.tax_invoices set status = 'VOID' where id = '${X.invoiceKept}'; update public.tax_invoices set status = 'ISSUED' where id = '${X.invoiceKept}';`, "tax_invoice_transition_invalid", { internal: true, immediate: false })}

  -- 5. Fulfillment shipments: workflow-only, one per group (unique index), frozen group match, kind immutable.
  ${refused("FULFILLMENT: creating a FULFILLMENT shipment outside the workflow is refused", fulfillment(X.shipmentProbe, E.memberSellerOrg, I.groupS), "FULFILLMENT shipments are created only by the settlement workflow", { immediate: false })}
  ${refused("FULFILLMENT: a buyer member cannot create one through its shipment insert policy", `${asBuyer} set local role authenticated; ${fulfillment(X.shipmentProbe, E.memberSellerOrg, I.groupS)}`, "FULFILLMENT shipments are created only by the settlement workflow", { immediate: false })}
  ${internal(true)}
  ${fulfillment(X.shipmentS, E.memberSellerOrg, I.groupS)}
  ${fulfillment(X.shipmentH, E.hillsOrg, I.groupH)}
  ${internal(false)}
  ${check("FULFILLMENT: the workflow created one DRAFT FULFILLMENT shipment per frozen group (2)", `(select count(*) = 2 and bool_and(status = 'DRAFT') from public.order_shipments where order_id = '${I.orderV1}' and shipment_kind = 'FULFILLMENT')`)}
  ${refused("FULFILLMENT: a duplicate shipment for the same order × seller × warehouse is refused by the unique index", fulfillment(X.shipmentProbe, E.memberSellerOrg, I.groupS), "uq_order_shipment_fulfillment_group", { internal: true, immediate: false })}
  ${refused("FULFILLMENT: a shipment that does not match its frozen group is refused", fulfillment(X.shipmentProbe, E.buyerOrg, I.groupS), "fulfillment_group_mismatch", { internal: true, immediate: false })}
  ${refused("FULFILLMENT: a group of another order's proforma is refused", fulfillment(X.shipmentProbe, E.memberSellerOrg, I.groupS, X.orderOther), "fulfillment_group_mismatch", { internal: true, immediate: false })}
  ${refused("FULFILLMENT: a shipment's kind and group never change", `update public.order_shipments set proforma_fulfillment_group_id = '${I.groupH}', fulfillment_seller_organization_id = '${E.hillsOrg}' where id = '${X.shipmentS}';`, "a shipment's kind and fulfillment group never change", { internal: true, immediate: false })}
  ${accepted("FULFILLMENT: DRAFT → REQUESTED through the unchanged Feature 009 machinery", `update public.order_shipments set status = 'REQUESTED' where id = '${X.shipmentS}';`, { internal: true })}
  ${accepted("LEGACY SHIPMENT: a buyer-planned DELIVERY_REQUEST insert (no internal flag) still works", `insert into public.order_shipments (id, order_id, delivery_method, country_code, address_line, contact_name, contact_phone, created_by) values ('${X.shipmentProbe}', '${X.orderOther}', 'Courier', 'AE', 'T043 address', 'T043', '+971500000043', '${E.buyerUser}');`)}

  -- 6. Grants: no client access to the new tables; service_role read-only.
  ${["reconciliation_cases", "reconciliation_case_events", "manual_financial_adjustments"].map((t) => `${refused(`GRANTS: authenticated cannot read ${t}`, `${asBuyer} set local role authenticated; perform 1 from public.${t};`, "permission denied", { immediate: false })}
  ${refused(`GRANTS: anon cannot read ${t}`, `set local role anon; perform 1 from public.${t};`, "permission denied", { immediate: false })}
  ${refused(`GRANTS: service_role cannot write ${t}`, `set local role service_role; insert into public.${t} default values;`, "permission denied", { immediate: false })}`).join("\n  ")}
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- 7. Pre-existing rows are intact: every LEGACY invoice and every existing shipment are byte-identical.
  ${check("LEGACY INVOICE: every pre-existing tax_invoices row is unchanged", `(select coalesce(md5(string_agg(to_jsonb(t)::text, '|' order by id)), 'none') from public.tax_invoices t where id not in (${IDS43})) = v_legacy_invoices_before`, "v_legacy_invoices_before")}
  ${check("LEGACY SHIPMENT: every pre-existing order_shipments row is unchanged (still DELIVERY_REQUEST)", `(select md5(string_agg(id::text || status || shipment_kind || coalesce(proforma_fulfillment_group_id::text, ''), '|' order by id)) from public.order_shipments where id not in (${IDS43})) = v_shipments_before`)}
  select count(*) into v_count from public.audit_logs where entity_type in ('reconciliation_cases', 'reconciliation_case_events', 'manual_financial_adjustments', 'tax_invoices');
  ${check("AUDIT: no generic audit row is written for the M2c tables (none carries a generic write_audit_log trigger)", "v_count = 0", "v_count")}

  -- 8. Always roll back: the result travels in the exception message.
  raise exception 'T043_RESULT:%', replace(encode(convert_to(r::text, 'UTF8'), 'base64'), chr(10), '');
end
$t043$;`;
}
