import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  F013_LIVE,
  FOUNDATION_FIXTURES,
  cleanupF013M1LiveOrders,
  createAnonymousFixtureClient,
  probeF013M1Schema,
  probeF013M1Transitions,
  setupF013M1LiveOrders,
  signInAsFixture,
} from "@/tests/auth/fixture-session";

/**
 * Feature 013 T025 (MP-6) — live proof of M1 `20260925100000_feature_013_commerce_state_vocabulary.sql` against the
 * linked project. Gated by F013_LIVE=1.
 *
 * Fixtures: disposable orders in the reserved 13000000-…-00000001xx range owned by the existing Foundation buyer-only
 * fixture, created and hard-deleted by the fixture script (privileged work never runs in this process). No global
 * commerce configuration is created (the full --prepare-f013-fixtures is deliberately not used).
 *
 * Limits of a live proof at M1: no BANK_TRANSFER_V1 RPC exists yet, and PostgREST cannot set the transaction-local
 * `app.internal_transition` flag, so internal v1 transitions cannot be driven from outside the database. They are proven
 * by T021 (static) and the supplementary PGlite run, and live by the M4a–M5c suites. Here: every non-internal path is
 * refused, the CHECK accepts the v1 values, LEGACY behaviour is unchanged, and offer codes, settings and grants are live.
 */
const WORKFLOW = "order_status_can_only_change_through_workflow";
const FLOW_IMMUTABLE = "order_commerce_flow_immutable";
const NOT_WRITABLE = "order_field_not_client_writable";
const MEMBER_ORDER = "13000000-0000-4000-8000-000000000104";

describe.skipIf(!F013_LIVE)("T025 — M1 live proof", () => {
  let setup: Record<string, unknown>;
  let buyer: SupabaseClient;
  let anonymous: SupabaseClient;

  beforeAll(async () => {
    setup = setupF013M1LiveOrders();
    buyer = await signInAsFixture(FOUNDATION_FIXTURES.buyerOnly.email);
    anonymous = createAnonymousFixtureClient();
  }, 120_000);

  afterAll(() => {
    // The single approved hard-delete exception (disposable pre-financial proof orders; see the fixture script).
    const cleanup = cleanupF013M1LiveOrders() as { deleted: number; remaining: Record<string, number> };
    expect(cleanup.deleted).toBeGreaterThan(0);
    expect(Object.keys(cleanup.remaining).sort()).toEqual([
      "inventory_reservations", "order_financials", "order_items", "order_shipments", "order_status_history", "orders",
      "payments", "payouts", "proforma_invoices", "support_tickets", "tax_invoices",
    ]);
    for (const [table, count] of Object.entries(cleanup.remaining)) expect(count, table).toBe(0);
  }, 120_000);

  it("setup created exactly the disposable M1 proof orders", () => {
    expect(setup).toEqual({ created: 6, memberOrderId: MEMBER_ORDER });
  });

  describe("production state after M1 (read-only)", () => {
    let state: Record<string, unknown>;
    beforeAll(() => {
      state = probeF013M1Schema();
    }, 120_000);

    it("every coffee offer has a unique, non-null LST offer_code", () => {
      expect(state.offers as number).toBeGreaterThan(0);
      expect(state.offerCodeNull).toBe(0);
      expect(state.offerCodeBadFormat).toBe(0);
      expect(state.offerCodeDistinct).toBe(state.offers);
    });

    it("every order outside this proof is LEGACY (commerce_flow default unchanged)", () => {
      expect(Object.keys(state.orderFlows as Record<string, number>)).toEqual(["LEGACY"]);
    });

    it("commerce_settings is the single safe-default row: checkout OFF, 24 h, proof ON, no pilots", () => {
      expect(state.settings).toEqual([expect.objectContaining({
        id: true, proforma_validity_hours: 24, bank_transfer_checkout_enabled: false, proof_submission_enabled: true, pilot_organization_ids: [],
      })]);
    });

    it("no proof lacks submitted_at, no account is flagged default, the idempotency log is empty", () => {
      expect(state.proofsWithoutSubmittedAt).toBe(0);
      expect(state.defaultAccounts).toBe(0);
      expect(state.requestLogRows).toBe(0);
    });
  });

  describe("transition graph through the service role (neither an internal transition nor a platform admin)", () => {
    let probe: Record<string, unknown>;
    beforeAll(() => {
      probe = probeF013M1Transitions();
    }, 120_000);

    it("LEGACY: the pre-M1 non-internal DRAFT → CONFIRMED rule still works", () => {
      expect(probe.legacyDraftToConfirmed).toBe("OK");
    });

    it("LEGACY: the M1 values are unreachable without the workflow", () => {
      expect(probe.legacyDraftToProformaIssued).toContain(WORKFLOW);
      expect(probe.legacyDraftToCancelled).toContain(WORKFLOW);
      expect(probe.legacyDisputedToPaymentRejected).toContain(WORKFLOW);
    });

    it("commerce_flow and the M1 order fields cannot be written from outside the workflow", () => {
      expect(probe.legacyFlowToV1).toContain(FLOW_IMMUTABLE);
      expect(probe.v1FlowToLegacy).toContain(FLOW_IMMUTABLE);
      expect(probe.legacyManualAdjustment).toContain(NOT_WRITABLE);
      expect(probe.v1CancelReason).toContain(NOT_WRITABLE);
    });

    it("BANK_TRANSFER_V1: every non-internal status change is refused, including the legacy-only CONFIRMED and PAID → VOID/DISPUTED", () => {
      for (const key of ["v1DraftToProformaIssued", "v1DraftToConfirmed", "v1DraftToCancelled", "v1PaidToVoid", "v1PaidToDisputed"]) {
        expect(probe[key], key).toContain(WORKFLOW);
      }
    });

    it("BANK_TRANSFER_V1: a non-status update is not blocked (no assert_order_checkout_ready for v1)", () => {
      expect(probe.v1UnrelatedColumnUpdate).toBe("OK");
    });

    it("the widened CHECKs accept the new values and still refuse unknown ones", () => {
      expect(probe.checkAcceptsV1ProformaIssued).toBe("OK");
      expect(probe.checkAcceptsV1Cancelled).toBe("OK");
      expect(probe.checkAcceptsV1PaymentRejected).toBe("OK");
      expect(probe.checkRefusesUnknownStatus).toContain("orders_status_check");
      expect(probe.checkRefusesUnknownFlow).toContain("orders_commerce_flow_check");
    });

    it("no refused write changed any row", () => {
      const rows = probe.finalRows as { id: string; status: string; commerce_flow: string; has_manual_adjustment: boolean; cancel_reason: string | null }[];
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
      expect(byId["13000000-0000-4000-8000-000000000101"]).toMatchObject({ status: "CONFIRMED", commerce_flow: "LEGACY" });
      expect(byId["13000000-0000-4000-8000-000000000102"]).toMatchObject({ status: "DRAFT", commerce_flow: "LEGACY", has_manual_adjustment: false });
      expect(byId["13000000-0000-4000-8000-000000000103"]).toMatchObject({ status: "DISPUTED", commerce_flow: "LEGACY" });
      expect(byId["13000000-0000-4000-8000-000000000111"]).toMatchObject({ status: "DRAFT", commerce_flow: "BANK_TRANSFER_V1", cancel_reason: null });
      expect(byId["13000000-0000-4000-8000-000000000112"]).toMatchObject({ status: "PAID", commerce_flow: "BANK_TRANSFER_V1" });
      expect(byId["13000000-0000-4000-8000-000000000119"]).toBeUndefined();
    });
  });

  describe("member and anonymous boundaries", () => {
    it("a buyer cannot change commerce_flow or has_manual_adjustment on its own DRAFT order", async () => {
      const flow = await buyer.from("orders").update({ commerce_flow: "BANK_TRANSFER_V1" }).eq("id", MEMBER_ORDER);
      expect(flow.error?.message).toContain(FLOW_IMMUTABLE);
      const adjustment = await buyer.from("orders").update({ has_manual_adjustment: true }).eq("id", MEMBER_ORDER);
      expect(adjustment.error?.message).toContain(NOT_WRITABLE);
    });

    it("the buyer's legacy DRAFT → CONFIRMED path is unchanged", async () => {
      const { data, error } = await buyer.from("orders").update({ status: "CONFIRMED" }).eq("id", MEMBER_ORDER).select("status, commerce_flow");
      expect(error).toBeNull();
      expect(data).toEqual([{ status: "CONFIRMED", commerce_flow: "LEGACY" }]);
    });

    it("a buyer sees no commerce_settings row and has no access to commerce_request_log", async () => {
      const settings = await buyer.from("commerce_settings").select("id");
      expect(settings.error).toBeNull();
      expect(settings.data).toEqual([]);
      const log = await buyer.from("commerce_request_log").select("request_id");
      expect(log.error).not.toBeNull();
    });

    it("anonymous has no access to commerce_settings or commerce_request_log", async () => {
      expect((await anonymous.from("commerce_settings").select("id")).error).not.toBeNull();
      expect((await anonymous.from("commerce_request_log").select("request_id")).error).not.toBeNull();
    });
  });
});
