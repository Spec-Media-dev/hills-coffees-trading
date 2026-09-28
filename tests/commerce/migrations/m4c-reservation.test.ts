import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Feature 013 — stock/inventory reservation (owner scope reduction, 2026-09-28: only the reservation step of the
 * originally-authored M4c survives; M5a bank-transfer proof, M5b finance settlement, Feature 009 delivery integration
 * and M9 Stripe retirement are out of current product scope). MP-2 static checks over the migration text.
 */
const migration = readFileSync("supabase/migrations/20260928120000_feature_013_stock_reservation.sql", "utf8");
const rollback = readFileSync("supabase/rollback/20260928120000_feature_013_stock_reservation.rollback.sql", "utf8");
const postflight = readFileSync("supabase/maintenance/20260928_feature_013_stock_reservation_postflight.sql", "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const end = migration.indexOf("\n$function$;", start);
  return migration.slice(start, end);
}

describe("Feature 013 stock reservation — MP-2 static checks", () => {
  it("every deadline check uses clock_timestamp(), never now()", () => {
    for (const name of ["confirm_proforma(p_proforma_id uuid, p_request_id uuid)", "commerce_release_reservation(uuid)"]) {
      const body = functionBody(name.split("(")[0]!);
      const deadlineLines = body.split("\n").filter((line) => /expires_at|valid_until/.test(line) && /clock_timestamp\(\)|now\(\)/.test(line));
      expect(deadlineLines.length).toBeGreaterThan(0);
      for (const line of deadlineLines) expect(line).not.toMatch(/\bnow\(\)/);
    }
  });

  it("confirm_proforma authorizes before commerce_request_begin (H1-consistent)", () => {
    const body = functionBody("confirm_proforma");
    expect(body.indexOf("commerce_assert_buyer_member")).toBeGreaterThan(-1);
    expect(body.indexOf("commerce_assert_buyer_member")).toBeLessThan(body.indexOf("commerce_request_begin"));
  });

  it("confirm_proforma locks offers ascending then positions ascending (data-model.md §8)", () => {
    const body = functionBody("confirm_proforma");
    const offerLockOrdinal = body.indexOf('order by pii.offer_id\n  loop\n    select * into v_offer from public.coffee_offers');
    const positionLockOrdinal = body.indexOf('select ip.id as position_id, sum(pii.quantity_kg) as total_quantity_kg');
    const orderedPositionLock = body.indexOf('order by ip.id\n  loop\n    select * into v_position from public.inventory_positions where id = v_item.position_id for update;');
    expect(offerLockOrdinal).toBeGreaterThan(-1);
    expect(positionLockOrdinal).toBeGreaterThan(-1);
    expect(orderedPositionLock).toBeGreaterThan(positionLockOrdinal);
    expect(offerLockOrdinal).toBeLessThan(positionLockOrdinal);
  });

  it("the release path decrements positions before offers (avoids the listing_exceeds_tradable_inventory guard)", () => {
    const body = functionBody("commerce_release_reservation");
    const positionWrite = body.indexOf("update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg -");
    const offerWrite = body.indexOf("update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg -");
    expect(positionWrite).toBeGreaterThan(-1);
    expect(offerWrite).toBeGreaterThan(-1);
    expect(positionWrite).toBeLessThan(offerWrite);
  });

  it("the increment path mirrors checkout_order(): position first, then offer under app.checkout_reservation", () => {
    const body = functionBody("confirm_proforma");
    const positionIncrement = body.indexOf("update public.inventory_positions set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg");
    const guc = body.indexOf("app.checkout_reservation");
    const offerIncrement = body.indexOf("update public.coffee_offers set reserved_quantity_kg = reserved_quantity_kg + v_item.quantity_kg");
    expect(positionIncrement).toBeGreaterThan(-1);
    expect(positionIncrement).toBeLessThan(guc);
    expect(guc).toBeLessThan(offerIncrement);
  });

  it("opportunistic reclaim uses SKIP LOCKED on the candidate order lock (research.md R-9)", () => {
    expect(functionBody("commerce_release_reservation")).toContain("for update skip locked");
  });

  it("all-or-nothing: the first unavailable line raises before any reservation row is written (FR-017)", () => {
    const body = functionBody("confirm_proforma");
    const firstCheckLoop = body.indexOf("raise exception 'listing_inventory_changed'");
    const reservationInsert = body.indexOf("insert into public.inventory_reservations");
    expect(firstCheckLoop).toBeGreaterThan(-1);
    expect(reservationInsert).toBeGreaterThan(-1);
    expect(firstCheckLoop).toBeLessThan(reservationInsert);
  });

  it("no M5a-only step survives the scope reduction: no payments row, no notification event", () => {
    for (const name of ["confirm_proforma", "expire_reservation", "commerce_release_reservation", "sweep_expired_reservations"]) {
      const body = functionBody(name);
      expect(body).not.toMatch(/\bpublic\.payments\b/);
      expect(body).not.toMatch(/emit_notification_event|notification_events/);
    }
  });

  it("sweep_expired_reservations EXECUTE is service_role only; commerce_release_reservation is owner-only (no API role)", () => {
    expect(migration).toContain("revoke all on function public.sweep_expired_reservations(int) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.sweep_expired_reservations(int) to service_role;");
    expect(migration).toContain("revoke all on function public.commerce_release_reservation(uuid) from public, anon, authenticated, service_role;");
    expect(migration).toContain("grant execute on function public.commerce_release_reservation(uuid) to postgres;");
  });

  it("confirm_proforma is EXECUTE authenticated only (no anon, no service_role)", () => {
    expect(migration).toContain("revoke all on function public.confirm_proforma(uuid, uuid) from public, anon, service_role;");
    expect(migration).toContain("grant execute on function public.confirm_proforma(uuid, uuid) to authenticated;");
  });

  it("the forward migration's preflight guard refuses if any of the four functions already exist, or checkout is on", () => {
    expect(migration).toContain("feature_013_reservation_objects_already_exist");
    expect(migration).toContain("feature_013_reservation_checkout_state_unexpected");
  });

  it("the rollback refuses while any reservation is ACTIVE", () => {
    expect(rollback).toContain("feature_013_reservation_rollback_requires_no_active_reservation");
    expect(rollback).toMatch(/drop function public\.sweep_expired_reservations\(int\);\s*\n\s*drop function public\.expire_reservation\(uuid\);\s*\n\s*drop function public\.confirm_proforma\(uuid, uuid\);\s*\n\s*drop function public\.commerce_release_reservation\(uuid\);/);
  });

  it("postflight covers existence, ACL narrowness, checkout-off, the M5a-step-dropped invariant, and lock order", () => {
    expect(postflight).toContain("reservation functions exist");
    expect(postflight).toContain("service_role only");
    expect(postflight).toContain("global checkout remains off");
    expect(postflight).toContain("M5a steps dropped");
    expect(postflight).toContain("§8");
  });

  it("cancel_order and admin_void_order are intentionally not authored in this reduced scope", () => {
    expect(migration).not.toMatch(/create (or replace )?function public\.(cancel_order|admin_void_order)\b/);
  });
});
