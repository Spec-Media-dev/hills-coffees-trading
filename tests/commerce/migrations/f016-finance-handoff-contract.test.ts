import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T001 & T040: Feature 016 Database Contracts & Baseline Preservation Tests
 *
 * Verifies that Feature 016 preserves:
 * 1. The September 22 Feature 008 `admin_review_payment(uuid, boolean, text)` body, ACLs, and provider trusted_funding_required gate.
 * 2. Feature 014 `commerce_notify_order_status_change` order trigger lifecycle and recipient model.
 * 3. Feature 015 `validate_order_transition` order fence and internal transitions.
 * 4. Baseline inventory_positions logical uniqueness.
 * 5. Feature 016 forward migration, rollback, and postflight static contracts.
 */

const F008_PATH = resolve(process.cwd(), "supabase/migrations/20260922120000_feature_008_stripe_trusted_funding.sql");
const F014_PATH = resolve(process.cwd(), "supabase/migrations/20260929100000_feature_014_notifications_lifecycle.sql");
const F015_PATH = resolve(process.cwd(), "supabase/migrations/20260930110000_feature_015_fence_legacy_submit_payment_proof.sql");
const SCHEMA_PATH = resolve(process.cwd(), "supabase/trading_schema.sql");
const F016_MIGRATION_PATH = resolve(process.cwd(), "supabase/migrations/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.sql");
const F016_ROLLBACK_PATH = resolve(process.cwd(), "supabase/rollback/20261002100000_feature_016_finance_confirmation_and_delivery_handoff.rollback.sql");
const F016_POSTFLIGHT_PATH = resolve(process.cwd(), "supabase/maintenance/20261002_feature_016_review_postflight.sql");

describe("T001: Pre-implementation Database Baseline & Contract Captures", () => {
  describe("Feature 008 admin_review_payment baseline", () => {
    const f008Sql = readFileSync(F008_PATH, "utf8");

    it("captures exact function signature and security definer search path", () => {
      expect(f008Sql).toMatch(
        /create or replace function public\.admin_review_payment\(\s*p_payment_id uuid,\s*p_approved boolean,\s*p_reason text DEFAULT NULL::text\s*\)\s*returns void\s*language plpgsql\s*security definer\s*set search_path to 'pg_catalog', 'public', 'auth'/i
      );
    });

    it("captures finance operator authorization check", () => {
      expect(f008Sql).toContain("if not public.is_finance_operator() then");
      expect(f008Sql).toContain("raise exception 'forbidden';");
    });

    it("captures the provider trusted_funding_required gate", () => {
      expect(f008Sql).toContain("if v_payment.payment_method = 'PROVIDER' and v_payment.trusted_funding_confirmed_at is null then");
      expect(f008Sql).toContain("raise exception 'trusted_funding_required';");
    });

    it("captures exact function ACLs: revoked from public/anon, granted to authenticated", () => {
      expect(f008Sql).toMatch(/revoke all on function public\.admin_review_payment\(uuid, boolean, text\) from public;/i);
      expect(f008Sql).toMatch(/revoke all on function public\.admin_review_payment\(uuid, boolean, text\) from anon;/i);
      expect(f008Sql).toMatch(/grant execute on function public\.admin_review_payment\(uuid, boolean, text\) to authenticated;/i);
    });
  });

  describe("Feature 014 order notifications trigger baseline", () => {
    const f014Sql = readFileSync(F014_PATH, "utf8");

    it("captures commerce_notify_order_status_change signature and security properties", () => {
      expect(f014Sql).toMatch(
        /create or replace function public\.commerce_notify_order_status_change\(\)\s*returns trigger\s*language plpgsql\s*security definer\s*set search_path = pg_catalog, public/i
      );
    });

    it("captures trigger binding on public.orders after update of status", () => {
      expect(f014Sql).toMatch(
        /create trigger trg_notify_order_status_change\s*after update of status on public\.orders\s*for each row\s*execute function public\.commerce_notify_order_status_change\(\);/i
      );
    });

    it("captures trigger ACL revocation from public, anon, authenticated, service_role", () => {
      expect(f014Sql).toMatch(
        /revoke all on function public\.commerce_notify_order_status_change\(\) from public, anon, authenticated, service_role;/i
      );
    });

    it("captures BANK_TRANSFER_V1 status change gate and recipient model", () => {
      expect(f014Sql).toContain("if new.status is not distinct from old.status or new.commerce_flow is distinct from 'BANK_TRANSFER_V1' then");
      expect(f014Sql).toContain("new.created_by,");
      expect(f014Sql).toContain("new.buyer_organization_id,");
    });
  });

  describe("Feature 015 validate_order_transition baseline", () => {
    const f015Sql = readFileSync(F015_PATH, "utf8");

    it("captures validate_order_transition signature and security definer", () => {
      expect(f015Sql).toMatch(
        /create or replace function public\.validate_order_transition\(\)\s*returns trigger\s*language plpgsql security definer\s*set search_path = pg_catalog, public, auth/i
      );
    });

    it("confirms that BANK_TRANSFER_V1 allows transition from PAYMENT_PROOF_SUBMITTED to PAID and PAYMENT_REJECTED", () => {
      expect(f015Sql).toContain(
        "if old.status = 'PAYMENT_PROOF_SUBMITTED' and new.status not in ('PAYMENT_UNDER_REVIEW', 'PAID', 'PAYMENT_REJECTED', 'CANCELLED', 'VOID') then raise exception 'invalid_order_transition'; end if;"
      );
    });

    it("confirms internal transition protection is required for workflow state changes", () => {
      expect(f015Sql).toContain("if not public.is_internal_transition()");
    });

    it("captures ACL revocation from public and anon", () => {
      expect(f015Sql).toMatch(/revoke all on function public\.validate_order_transition\(\) from public, anon;/i);
    });
  });

  describe("Inventory positions baseline uniqueness", () => {
    const schemaSql = readFileSync(SCHEMA_PATH, "utf8");

    it("captures the baseline logical unique constraint on inventory_positions", () => {
      expect(schemaSql).toMatch(
        /unique\s*\(\s*lot_id\s*,\s*owner_organization_id\s*,\s*warehouse_id\s*,\s*warehouse_location_id\s*\)/i
      );
    });
  });
});

describe("T040: Feature 016 Migration Static Contract Verification", () => {
  const f016Migration = readFileSync(F016_MIGRATION_PATH, "utf8");
  const f016Rollback = readFileSync(F016_ROLLBACK_PATH, "utf8");
  const f016Postflight = readFileSync(F016_POSTFLIGHT_PATH, "utf8");

  describe("Preflight & Null-Safe Uniqueness", () => {
    it("contains duplicate logical inventory position detection preflight", () => {
      expect(f016Migration).toContain("migration_aborted: duplicate logical inventory positions detected");
      expect(f016Migration).toContain("Manual reconciliation required:");
    });

    it("replaces ordinary constraint with named uq_inventory_positions_null_safe", () => {
      expect(f016Migration).toContain("uq_inventory_positions_null_safe");
      expect(f016Migration).toMatch(/unique nulls not distinct\s*\(\s*lot_id,\s*owner_organization_id,\s*warehouse_id,\s*warehouse_location_id\s*\)/i);
    });

    it("uses a valid derived-table ordering for distinct buyer logical keys", () => {
      expect(f016Migration).toMatch(/from\s*\(\s*select distinct ip\.lot_id, ip\.warehouse_id, ip\.warehouse_location_id/i);
      expect(f016Migration).toMatch(/order by buyer_keys\.lot_id, buyer_keys\.warehouse_id/i);
      expect(f016Migration).not.toMatch(/select distinct\s+ip\.lot_id,\s*ip\.warehouse_id,\s*ip\.warehouse_location_id[\s\S]{0,500}order by ip\.lot_id/i);
    });
  });

  describe("admin_review_payment preservation & pre-lock fence", () => {
    it("preserves admin_review_payment signature and includes read-only pre-lock V1 fence", () => {
      expect(f016Migration).toContain("endpoint_deprecated_use_finance_review_bank_transfer_v1");
      expect(f016Migration).toContain("select o.commerce_flow into v_commerce_flow");
    });

    it("preserves trusted_funding_required check for provider payments", () => {
      expect(f016Migration).toContain("if v_payment.payment_method = 'PROVIDER' and v_payment.trusted_funding_confirmed_at is null then");
      expect(f016Migration).toContain("raise exception 'trusted_funding_required';");
    });

    it("preserves exact admin_review_payment ACLs", () => {
      expect(f016Migration).toMatch(/grant execute on function public\.admin_review_payment\(uuid, boolean, text\) to authenticated;/i);
    });
  });

  describe("finance_review_bank_transfer_v1 RPC contract", () => {
    it("has exact function signature and security properties", () => {
      expect(f016Migration).toMatch(
        /create or replace function public\.finance_review_bank_transfer_v1\(\s*p_order_id uuid,\s*p_payment_id uuid,\s*p_decision text,\s*p_notes text default null,\s*p_request_id uuid default null\s*\)\s*returns jsonb\s*language plpgsql\s*security definer\s*set search_path = pg_catalog, public, auth/i
      );
    });

    it("enforces authentication, non-blocked status, MFA, and finance/admin roles", () => {
      expect(f016Migration).toContain("raise exception 'unauthenticated';");
      expect(f016Migration).toContain("raise exception 'mfa_required';");
      expect(f016Migration).toContain("if not (public.is_finance_operator() or public.is_platform_admin()) then");
    });

    it("locks orders before payments", () => {
      const orderLockIdx = f016Migration.indexOf("select * into v_order from public.orders where id = p_order_id for update;");
      const paymentLockIdx = f016Migration.indexOf("select * into v_payment from public.payments where id = p_payment_id for update;");
      expect(orderLockIdx).toBeGreaterThan(-1);
      expect(paymentLockIdx).toBeGreaterThan(-1);
      expect(orderLockIdx).toBeLessThan(paymentLockIdx);
    });

    it("sets app.internal_transition transaction-locally before business writes", () => {
      expect(f016Migration).toContain("perform set_config('app.internal_transition', 'true', true);");
    });

    it("binds exact finalized proof and requires CONFIRMED proforma", () => {
      expect(f016Migration).toContain("v_intent.finalized_proof_id");
      expect(f016Migration).toContain("if v_proforma.status <> 'CONFIRMED' then");
    });

    it("rejects NULL decisions and updates only exact proof status (no updated_at on payment_proofs)", () => {
      expect(f016Migration).toContain("if p_decision is null or p_decision not in ('CONFIRMED', 'REJECTED') then");
      expect(f016Migration).toMatch(/update public\.payment_proofs\s+set status = 'ACCEPTED'\s+where id = v_intent\.finalized_proof_id;/);
      const updates = f016Migration.match(/update public\.payment_proofs[\s\S]*?;/g) ?? [];
      expect(updates.length).toBeGreaterThan(0);
      for (const updateStmt of updates) {
        expect(updateStmt).not.toContain("updated_at");
      }
    });

    it("fails closed on duplicate or corrupt terminal review artifacts with exact replay validation", () => {
      expect(f016Migration).toContain("select count(*) into v_actual from public.payment_reviews where payment_id = p_payment_id;");
      expect(f016Migration).toContain("if v_actual <> 1 then return false; end if;");
      expect(f016Migration).toContain("ti.status = 'ISSUED'");
      expect(f016Migration).toContain("ti.snapshot->'destination_snapshot' = v_proforma.destination_snapshot");
      expect(f016Migration).toContain("e.event_type = case when pii.seller_type_snapshot");
      expect(f016Migration).toContain("add column warehouse_id uuid");
      expect(f016Migration).toContain("e.warehouse_location_id is not distinct from sp.warehouse_location_id");
      expect(f016Rollback).toContain("drop column if exists warehouse_location_id");
      expect(f016Migration).toContain("si.reserved_quantity_kg <> 0 or si.delivered_quantity_kg <> 0");
      expect(f016Migration).toContain("s.contact_phone = coalesce(v_proforma.destination_snapshot->>'contact_phone'");
    });

    it("sets SOLD_OUT for exact exhaustion, creates buyer storage allocations, and locks offers before positions", () => {
      expect(f016Migration).toContain("then 'SOLD_OUT'");
      expect(f016Migration).toContain("insert into public.storage_allocations");
      const offerLock = f016Migration.indexOf("Compatible global hierarchy with checkout: lock all offers first");
      const positionLock = f016Migration.indexOf("Collect all position IDs (source and existing buyer)");
      expect(offerLock).toBeGreaterThan(-1);
      expect(positionLock).toBeGreaterThan(offerLock);
    });

    it("casts every proof projection return expression to its declared RPC type", () => {
      expect(f016Migration).toContain("pp.status::text");
      expect(f016Migration).toContain("pp.claimed_amount::numeric");
      expect(f016Migration).toContain("pp.claimed_currency::text");
      expect(f016Migration).toContain("pp.transfer_date::date");
      expect(f016Migration).toContain("pp.bank_reference::text");
      expect(f016Migration).toContain("pp.submitted_at::timestamptz");
    });

    it("revokes execute from public, anon, service_role and grants to authenticated only", () => {
      expect(f016Migration).toMatch(/revoke all on function public\.finance_review_bank_transfer_v1\(uuid, uuid, text, text, uuid\) from public;/i);
      expect(f016Migration).toMatch(/revoke all on function public\.finance_review_bank_transfer_v1\(uuid, uuid, text, text, uuid\) from anon;/i);
      expect(f016Migration).toMatch(/revoke all on function public\.finance_review_bank_transfer_v1\(uuid, uuid, text, text, uuid\) from service_role;/i);
      expect(f016Migration).toMatch(/grant execute on function public\.finance_review_bank_transfer_v1\(uuid, uuid, text, text, uuid\) to authenticated;/i);
    });
  });

  describe("Notifications triggers & Rollback/Postflight symmetry", () => {
    it("extends order status notification trigger for PAYMENT_PROOF_SUBMITTED, PAID, PAYMENT_REJECTED", () => {
      expect(f016Migration).toContain("v_type := 'PAYMENT_PROOF_SUBMITTED';");
      expect(f016Migration).toContain("v_type := 'PAYMENT_CONFIRMED';");
      expect(f016Migration).toContain("v_type := 'PAYMENT_REJECTED';");
    });

    it("creates shipment notification trigger on public.order_shipments for FULFILLMENT DRAFT -> REQUESTED", () => {
      expect(f016Migration).toContain("create or replace function public.commerce_notify_shipment_status_change()");
      expect(f016Migration).toContain("trg_notify_shipment_status_change");
      expect(f016Migration).toContain("DELIVERY_HANDOFF_REQUESTED");
    });

    it("rollback removes Feature 016 objects and restores September 22 baseline", () => {
      expect(f016Rollback).toContain("drop function if exists public.finance_review_bank_transfer_v1");
      expect(f016Rollback).toContain("drop trigger if exists trg_notify_shipment_status_change on public.order_shipments;");
      expect(f016Rollback).not.toContain("endpoint_deprecated_use_finance_review_bank_transfer_v1");
      expect(f016Rollback).toContain("uq_inventory_positions_null_safe");
    });

    it("postflight checks all required objects, triggers, ACLs, and payout immutability", () => {
      expect(f016Postflight).toContain("finance_review_bank_transfer_v1");
      expect(f016Postflight).toContain("finance_payment_proof_projection(uuid)");
      expect(f016Postflight).toContain("finance_payment_proof_asset_projection(uuid)");
      expect(f016Postflight).toContain("admin_review_payment");
      expect(f016Postflight).toContain("admin_review_payment Feature 008 ACL contract drifted");
      expect(f016Postflight).toContain("v_fence_at := strpos");
      expect(f016Postflight).toContain("v_fence_at > v_first_lock_at");
      expect(f016Postflight).toContain("raise exception ''trusted_funding_required''");
      expect(f016Postflight).toContain("trg_notify_order_status_change");
      expect(f016Postflight).toContain("trg_notify_shipment_status_change");
      expect(f016Postflight).toContain("uq_inventory_positions_null_safe");
      expect(f016Postflight).toContain("public.payouts");
    });
  });
});
