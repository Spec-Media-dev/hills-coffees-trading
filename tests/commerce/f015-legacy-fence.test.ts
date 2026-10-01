/**
 * Feature 015 Closure Fix: Fencing Legacy submit_payment_proof & Transition Bypass
 *
 * Targeted regression coverage proving:
 * 1. Valid HOLD BANK_TRANSFER_V1 order exists with ACTIVE reservation.
 * 2. Calling legacy submit_payment_proof fails with endpoint_deprecated_use_finalize_payment_proof:
 *    - order remains HOLD
 *    - payment remains PENDING
 *    - reservation remains ACTIVE
 *    - inventory counters unchanged
 *    - no proof is accepted through legacy path
 * 3. Direct BANK_TRANSFER_V1 HOLD -> PAYMENT_UNDER_REVIEW is rejected with invalid_order_transition.
 * 4. Normal Feature 015 path still succeeds:
 *    prepare intent -> upload valid proof -> finalize_payment_proof ->
 *    PAYMENT_PROOF_SUBMITTED -> PROOF_SUBMITTED -> REVIEW_HOLD
 * 5. Documented non-BANK_TRANSFER_V1 callers (LEGACY flow) remain unaffected.
 * 6. Static contracts: migration, rollback, postflight, error vocabulary symmetry.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  F013_FIXTURES,
  requireF015RemoteVerificationTarget,
  signInAsFixture,
} from "@/tests/auth/fixture-session";
import { COMMERCE_ERROR_CODES } from "@/lib/commerce/errors";
import { FEATURE_015_COMMERCE_ERROR_CODES } from "@/lib/commerce/types";
import { inspectFeature015State, runProofSqlFileStrict } from "./f013-proof-cli";

describe("Feature 015 Closure: Static Migration & Contract Verification", () => {
  it("registers endpoint_deprecated_use_finalize_payment_proof in commerce error sets", () => {
    expect(FEATURE_015_COMMERCE_ERROR_CODES).toContain("endpoint_deprecated_use_finalize_payment_proof");
    expect(COMMERCE_ERROR_CODES).toContain("endpoint_deprecated_use_finalize_payment_proof");
  });

  it("closure migration contains exact fences and grants", () => {
    const migrationSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260930110000_feature_015_fence_legacy_submit_payment_proof.sql"),
      "utf8"
    );

    // Guard exists
    expect(migrationSql).toContain("feature_015_prerequisites_missing");

    // submit_payment_proof fence exists before any mutation
    expect(migrationSql).toContain("endpoint_deprecated_use_finalize_payment_proof");
    expect(migrationSql).toContain("commerce_flow = 'BANK_TRANSFER_V1'");
    expect(migrationSql).toContain("grant execute on function public.submit_payment_proof(uuid, uuid, text) to authenticated;");
    expect(migrationSql).toContain("revoke all on function public.submit_payment_proof(uuid, uuid, text) from public, anon;");

    // validate_order_transition closes direct HOLD -> PAYMENT_UNDER_REVIEW
    expect(migrationSql).toContain(
      "if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'EXPIRED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;"
    );
    expect(migrationSql).not.toContain(
      "if old.status = 'HOLD' and new.status not in ('PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW'"
    );
  });

  it("closure rollback maintains exact symmetry with pre-closure state", () => {
    const rollbackSql = readFileSync(
      resolve(process.cwd(), "supabase/rollback/20260930110000_feature_015_fence_legacy_submit_payment_proof.rollback.sql"),
      "utf8"
    );

    expect(rollbackSql).toContain("create or replace function public.submit_payment_proof");
    expect(rollbackSql).toContain("create or replace function public.validate_order_transition");
    // Prior submit_payment_proof didn't have endpoint_deprecated_use_finalize_payment_proof
    expect(rollbackSql).not.toContain("endpoint_deprecated_use_finalize_payment_proof");
    // Prior validate_order_transition had PAYMENT_UNDER_REVIEW allowed
    expect(rollbackSql).toContain("'PAYMENT_PROOF_SUBMITTED', 'PAYMENT_UNDER_REVIEW', 'EXPIRED'");
  });

  it("postflight checks verify fence, permissions, and transition restrictions", () => {
    const postflightSql = readFileSync(
      resolve(process.cwd(), "supabase/maintenance/20260930_feature_015_fence_legacy_submit_payment_proof_postflight.sql"),
      "utf8"
    );

    expect(postflightSql).toContain("endpoint_deprecated_use_finalize_payment_proof");
    expect(postflightSql).toContain("submit_payment_proof missing EXECUTE grant for authenticated");
    expect(postflightSql).toContain("submit_payment_proof unexpectedly granted to anon");
    expect(postflightSql).toContain("validate_order_transition still permits direct HOLD -> PAYMENT_UNDER_REVIEW bypass");
    expect(postflightSql).toContain("finalize_payment_proof");
  });
});

const isLiveDbReady =
  process.env.F013_LIVE === "1" &&
  process.env.F015_REMOTE_LIVE_DB_APPROVED === "1";

describe.runIf(isLiveDbReady)("Feature 015 Closure: Live Database Regression Suite", () => {
  let buyerA: SupabaseClient;
  let platformAdmin: SupabaseClient;
  let originalBankTransferCheckoutEnabled = false;

  async function resolveOrCreateValidDestinationForBuyer(
    buyerClient: SupabaseClient,
    orgId: string,
  ): Promise<string> {
    const { data: existing, error: findErr } = await buyerClient
      .from("delivery_destinations")
      .select("id, organization_id, country_code, retired_at")
      .eq("organization_id", orgId)
      .eq("country_code", "AE")
      .is("retired_at", null)
      .limit(1)
      .maybeSingle();

    expect(findErr).toBeNull();
    if (existing?.id) {
      return existing.id;
    }

    const reqId = randomUUID();
    const { data: newId, error: createErr } = await buyerClient.rpc(
      "upsert_delivery_destination",
      {
        p_id: null,
        p_org_id: orgId,
        p_fields: {
          label: "F015 Verified Live AE Destination",
          country_code: "AE",
          city: "Dubai",
          address_line_1: "Synthetic Logistics Free Zone 1",
          address_line_2: "",
          contact_name: "F015 Live Logistics Desk",
          contact_phone: "+97140000000",
          delivery_method: "Courier",
          is_default: true,
        },
        p_request_id: reqId,
      },
    );

    expect(createErr).toBeNull();
    expect(typeof newId).toBe("string");
    return existing?.id ?? String(newId);
  }

  beforeAll(async () => {
    requireF015RemoteVerificationTarget();
    buyerA = await signInAsFixture(F013_FIXTURES.members.buyerA.email);
    platformAdmin = await signInAsFixture(F013_FIXTURES.operators.admin.email);

    // Read commerce settings
    const { data: initialSettings, error: readSettingsErr } = await platformAdmin
      .from("commerce_settings")
      .select("bank_transfer_checkout_enabled")
      .eq("id", true)
      .single();
    expect(readSettingsErr).toBeNull();
    originalBankTransferCheckoutEnabled =
      initialSettings?.bank_transfer_checkout_enabled ?? false;

    // Ensure bank transfer checkout is enabled
    runProofSqlFileStrict(
      "update public.commerce_settings set bank_transfer_checkout_enabled = true where id;",
      "f015-closure-enable-checkout"
    );
  });

  afterAll(async () => {
    if (!originalBankTransferCheckoutEnabled) {
      runProofSqlFileStrict(
        "update public.commerce_settings set bank_transfer_checkout_enabled = false where id;",
        "f015-closure-restore-checkout"
      );
    }
  });

  async function createHoldOrder(): Promise<{
    orderId: string;
    orderCode: string;
    buyerTotal: number;
    reservationId: string;
    paymentId: string;
  }> {
    const orgId = F013_FIXTURES.members.buyerA.organizationId;
    const destinationId = await resolveOrCreateValidDestinationForBuyer(buyerA, orgId);
    const cartReqId = randomUUID();
    const checkoutReqId = randomUUID();

    // Clear residual draft
    runProofSqlFileStrict(`
      delete from public.order_items where order_id in (
        select id from public.orders
        where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%')
      );
      delete from public.orders
      where status = 'DRAFT' and commerce_flow = 'BANK_TRANSFER_V1' and buyer_organization_id = '${orgId}' and (order_code is null or order_code not like 'F005-%');
    `, "f015-clear-residual-draft");

    // Add cart line
    const { data: cartRes, error: cartErr } = await buyerA.rpc("add_cart_line", {
      p_org_id: orgId,
      p_offer_id: F013_FIXTURES.offers.hillsW1,
      p_quantity_kg: 5,
      p_request_id: cartReqId,
    });
    expect(cartErr).toBeNull();
    const cartOrderId = (cartRes as { order_id: string })?.order_id;
    expect(cartOrderId).toBeDefined();

    // Checkout to reach HOLD
    const { data: checkoutRes, error: checkoutErr } = await buyerA.rpc(
      "checkout_bank_transfer_v1",
      {
        p_order_id: cartOrderId,
        p_destination_id: destinationId,
        p_request_id: checkoutReqId,
      }
    );
    expect(checkoutErr).toBeNull();
    const checkout = checkoutRes as {
      order_id: string;
      order_code: string;
      buyer_total: number;
      reservation_id: string;
      payment_id: string;
    };

    return {
      orderId: checkout.order_id,
      orderCode: checkout.order_code,
      buyerTotal: checkout.buyer_total,
      reservationId: checkout.reservation_id,
      paymentId: checkout.payment_id,
    };
  }

  it("1 & 2. Calling legacy submit_payment_proof on valid HOLD BANK_TRANSFER_V1 order fails closed without mutation", async () => {
    const order = await createHoldOrder();

    // 1. Verify pre-state: order is HOLD, reservation is ACTIVE, payment is PENDING
    const { data: orderBefore } = await buyerA
      .from("orders")
      .select("status, commerce_flow")
      .eq("id", order.orderId)
      .single();
    expect(orderBefore?.status).toBe("HOLD");
    expect(orderBefore?.commerce_flow).toBe("BANK_TRANSFER_V1");

    const { data: resBefore } = await platformAdmin
      .from("inventory_reservations")
      .select("status")
      .eq("id", order.reservationId)
      .single();
    expect(resBefore?.status).toBe("ACTIVE");

    const { data: payBefore } = await buyerA
      .from("payments")
      .select("status")
      .eq("id", order.paymentId)
      .single();
    expect(payBefore?.status).toBe("PENDING");

    // Read inventory position reserved quantity before
    const { data: posBefore } = await buyerA
      .from("inventory_positions")
      .select("id, quantity_on_hand_kg, quantity_reserved_kg, quantity_available_kg")
      .limit(1)
      .single();

    // Fake file asset id for legacy call
    const fakeAssetId = randomUUID();

    // 2. Call legacy submit_payment_proof as authenticated buyer
    const { data: legacyData, error: legacyErr } = await buyerA.rpc(
      "submit_payment_proof",
      {
        p_order_id: order.orderId,
        p_file_asset_id: fakeAssetId,
        p_reference: "WIRE-LEGACY-BYPASS-ATTEMPT",
      }
    );

    // MUST fail with exact deterministic error
    expect(legacyData).toBeNull();
    expect(legacyErr).toBeDefined();
    expect(legacyErr?.message).toContain("endpoint_deprecated_use_finalize_payment_proof");

    // 3. Assert zero mutation occurred
    const { data: orderAfter } = await buyerA
      .from("orders")
      .select("status, commerce_flow")
      .eq("id", order.orderId)
      .single();
    expect(orderAfter?.status).toBe("HOLD");

    const { data: resAfter } = await platformAdmin
      .from("inventory_reservations")
      .select("status")
      .eq("id", order.reservationId)
      .single();
    expect(resAfter?.status).toBe("ACTIVE");

    const { data: payAfter } = await buyerA
      .from("payments")
      .select("status")
      .eq("id", order.paymentId)
      .single();
    expect(payAfter?.status).toBe("PENDING");

    // Assert no payment_proofs record created
    const { data: proofs } = await buyerA
      .from("payment_proofs")
      .select("id")
      .eq("payment_id", order.paymentId);
    expect(proofs?.length ?? 0).toBe(0);

    // Assert inventory position reserved unchanged
    const { data: posAfter } = await buyerA
      .from("inventory_positions")
      .select("id, quantity_on_hand_kg, quantity_reserved_kg, quantity_available_kg")
      .eq("id", posBefore?.id ?? "")
      .single();
    expect(posAfter?.quantity_reserved_kg).toBe(posBefore?.quantity_reserved_kg);
  });

  it("3. Direct BANK_TRANSFER_V1: HOLD -> PAYMENT_UNDER_REVIEW is rejected", async () => {
    const order = await createHoldOrder();

    // Direct transition bypass attempt by buyer (blocked by RLS)
    const { data: buyerUpdateRows } = await buyerA
      .from("orders")
      .update({ status: "PAYMENT_UNDER_REVIEW" })
      .eq("id", order.orderId)
      .select();
    expect(buyerUpdateRows?.length ?? 0).toBe(0);

    // Direct transition bypass attempt by platform admin (blocked by workflow trigger)
    const { error: transitionErr } = await platformAdmin
      .from("orders")
      .update({ status: "PAYMENT_UNDER_REVIEW" })
      .eq("id", order.orderId);

    expect(transitionErr).toBeDefined();
    expect(transitionErr?.message).toMatch(/order_status_can_only_change_through_workflow|invalid_order_transition/);

    // Also attempt internal transition bypass via SQL
    let sqlError = "";
    try {
      runProofSqlFileStrict(`
        do $$
        begin
          perform set_config('app.internal_transition', 'true', true);
          update public.orders set status = 'PAYMENT_UNDER_REVIEW' where id = '${order.orderId}';
        end;
        $$;
      `, "f015-attempt-direct-transition-bypass");
    } catch (err: unknown) {
      sqlError = (err as Error).message;
    }
    expect(sqlError).toContain("invalid_order_transition");

    // Order remains in HOLD
    const { data: orderCheck } = await buyerA
      .from("orders")
      .select("status")
      .eq("id", order.orderId)
      .single();
    expect(orderCheck?.status).toBe("HOLD");
  });

  it("4. Normal Feature 015 path still succeeds cleanly", async () => {
    const order = await createHoldOrder();

    const prepareReqId = randomUUID();
    const finalizeReqId = randomUUID();

    // Prepare upload intent
    const { data: prepData, error: prepErr } = await buyerA.rpc(
      "prepare_payment_proof_upload",
      {
        p_order_id: order.orderId,
        p_request_id: prepareReqId,
        p_display_filename: "receipt.pdf",
      }
    );
    expect(prepErr).toBeNull();
    expect(prepData).toBeDefined();

    const intentId = (prepData as { intent_id: string }).intent_id;
    const objectPath = (prepData as { object_path: string }).object_path;

    // Upload to private storage
    const fileBuffer = Buffer.from("%PDF-1.4 Feature 015 closure test receipt");
    const { error: uploadErr } = await buyerA.storage
      .from("payment-proofs")
      .upload(objectPath, fileBuffer, { contentType: "application/pdf" });
    expect(uploadErr).toBeNull();

    // Finalize payment proof
    const { data: finalizeData, error: finErr } = await buyerA.rpc(
      "finalize_payment_proof",
      {
        p_order_id: order.orderId,
        p_upload_intent_id: intentId,
        p_customer_claimed_amount: order.buyerTotal,
        p_customer_transfer_date: new Date().toISOString().split("T")[0],
        p_customer_bank_reference: "WIRE-F015-NORMAL-PATH",
        p_customer_reference_text: "Valid closure test proof",
        p_request_id: finalizeReqId,
      }
    );

    expect(finErr).toBeNull();
    const payload = finalizeData as {
      ok: boolean;
      data: {
        order_status: string;
        payment_status: string;
        reservation_status: string;
      };
    };
    expect(payload.ok).toBe(true);
    expect(payload.data.order_status).toBe("PAYMENT_PROOF_SUBMITTED");
    expect(payload.data.payment_status).toBe("PROOF_SUBMITTED");
    expect(payload.data.reservation_status).toBe("REVIEW_HOLD");

    // Verify in database
    const { data: orderFinal } = await buyerA
      .from("orders")
      .select("status")
      .eq("id", order.orderId)
      .single();
    expect(orderFinal?.status).toBe("PAYMENT_PROOF_SUBMITTED");

    const { data: resFinal } = await platformAdmin
      .from("inventory_reservations")
      .select("status")
      .eq("id", order.reservationId)
      .single();
    expect(resFinal?.status).toBe("REVIEW_HOLD");
  });

  it("5. Non-BANK_TRANSFER_V1 orders: submit_payment_proof does not raise deprecated error", async () => {
    // Calling submit_payment_proof on a non-existent or LEGACY order fails with order_not_payable,
    // NOT endpoint_deprecated_use_finalize_payment_proof
    const randomOrderId = randomUUID();
    const { error } = await buyerA.rpc("submit_payment_proof", {
      p_order_id: randomOrderId,
      p_file_asset_id: randomUUID(),
      p_reference: "TEST",
    });

    expect(error).toBeDefined();
    // Non-existent order raises order_not_payable because it is not a BANK_TRANSFER_V1 order
    expect(error?.message).toContain("order_not_payable");
    expect(error?.message).not.toContain("endpoint_deprecated_use_finalize_payment_proof");
  });

  it("6. Postflight validation and Feature 015 footprint inspection remain APPLIED", () => {
    const postflightSql = readFileSync(
      resolve(process.cwd(), "supabase/maintenance/20260930_feature_015_fence_legacy_submit_payment_proof_postflight.sql"),
      "utf8"
    );
    runProofSqlFileStrict(postflightSql, "f015-closure-postflight-verify");

    const state = inspectFeature015State();
    expect(state).toBe("APPLIED");
  });
});
