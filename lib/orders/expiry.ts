import { z } from "zod";

import { getRequestIdentity } from "@/lib/auth/dal";
import { mapOrderError } from "@/lib/orders/errors";
import { getOrderById } from "@/lib/orders/read";
import type { OrderStatus, OrderSummary } from "@/lib/orders/validation";
import { createClient } from "@/lib/supabase/server";
import { ACTION_FEEDBACK, type ActionFeedbackResult } from "@/lib/types/action-feedback";

/**
 * Feature 007 RUN C (T012/T013/T014) — `ensureHoldFresh(orderId)`: the ONE and ONLY application
 * caller of the database's `expire_order_hold(p_order_id)` function (plan.md architecture
 * decision 4; T029's own closure check is `grep -rn "expire_order_hold" src lib` matching this
 * file alone, alongside `lib/orders/checkout.ts` for `checkout_order`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE DATABASE OWNS (read live, 2026-09-13) — reimplemented NOWHERE in this file
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `expire_order_hold(p_order_id)` locks the order's ACTIVE `inventory_reservations` row whose
 * `expires_at <= now()` (returning silently — a no-op — if there is none), then, per reservation
 * item: releases `inventory_positions.reserved_quantity_kg` FIRST, then the
 * `coffee_offers.reserved_quantity_kg` mirror (both `greatest(... - qty, 0)`, never negative),
 * marks the reservation `EXPIRED`, moves the `payments` row to `EXPIRED`, and — under its own
 * internal-transition attestation — moves the order from `HOLD`/`PAYMENT_PROOF_SUBMITTED`/
 * `PAYMENT_UNDER_REVIEW` to `EXPIRED`. It is idempotent by construction: a second call finds no
 * ACTIVE expired reservation and returns without touching anything. This file never updates a
 * reserved quantity, never releases a reservation, never writes an order status or a history row,
 * and never reads `inventory_reservations`/`inventory_reservation_items` (DB-OPEN-12; member RLS
 * forbids it anyway) — the ONLY hold truth it consults is `orders.status` + `orders.hold_expires_at`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * LAZY EXPIRY — THE HONEST OPERATIONAL LIMITATION (T014)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * NO scheduler is approved (spec Open Items): no cron, no pg_cron, no Edge Function, no worker,
 * no queue, no polling. A stale hold is therefore processed ONLY when an approved order read/action
 * touches it through this function (the order detail page, the orders list for its own page of
 * rows, and `requireFreshHold` before any downstream hand-off). An order nobody ever revisits may
 * keep an ACTIVE-but-past-expiry reservation — and its reserved quantity withheld from the
 * marketplace — until something touches it. This is stated here, in the handoff, and in the spec's
 * Open Items; it is NOT silently closed, and nothing in this codebase claims automatic global
 * expiry. The scheduler decision remains a Sprint-0 infrastructure question.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * DB-OPEN-15 (NEW, confirmed live this run): a `HOLD` order row cannot be UPDATEd at all
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `validate_order_transition` runs `assert_order_checkout_ready(new.id)` UNCONDITIONALLY whenever
 * `new.status = 'HOLD'` — including an UPDATE that changes some other column and leaves the status
 * as `HOLD`. That assertion requires the (old, stored) status to be `CONFIRMED`, so every such
 * UPDATE is refused (`order_must_be_confirmed_before_checkout`) — for a buyer AND for the service
 * role. Consequences recorded honestly: (a) `orders.hold_expires_at` can never be edited after
 * checkout, which is exactly why this file's staleness reference clock is a parameter with a
 * production default (see `ensureHoldFresh`'s signature) rather than a mutable database column the
 * tests could backdate; (b) any future feature wanting to write to a `HOLD` order must go through a
 * status change (`submit_payment_proof` does), never a same-status column update.
 */

const HOLD_BEARING_STATUSES = ["HOLD", "PAYMENT_PROOF_SUBMITTED", "PAYMENT_UNDER_REVIEW"] as const;

const OrderIdInput = z.uuid();

/** The controlled, truthful hold state `ensureHoldFresh` returns — never a client-supplied claim. */
export type HoldFreshness = {
  order: OrderSummary;
  /** `true` exactly when the order is in a hold-bearing status whose `hold_expires_at` is still in the future. */
  fresh: boolean;
  /** `true` exactly when `expire_order_hold()` was invoked on THIS call (the hold was stale). */
  expiredNow: boolean;
};

export type EnsureHoldFreshOptions = {
  /**
   * The reference instant for "is this hold stale?" — DEFAULTS TO THE SERVER CLOCK (`new Date()`).
   * Production callers never pass it. It exists as a deterministic TEST seam only, because
   * DB-OPEN-15 makes `orders.hold_expires_at` un-backdatable (the database itself decides the real
   * release — `expire_order_hold()` acts only when the RESERVATION's own `expires_at` has passed —
   * so a caller-supplied instant can never release anything early; it can at most trigger a no-op
   * RPC). Never derived from a browser countdown, a client "expired" flag, or a client timestamp.
   */
  now?: Date;
};

function isHoldBearing(status: OrderStatus): boolean {
  return (HOLD_BEARING_STATUSES as readonly string[]).includes(status);
}

function isStale(order: OrderSummary, now: Date): boolean {
  if (!isHoldBearing(order.status)) return false;
  if (order.holdExpiresAt === null) return false;
  return new Date(order.holdExpiresAt).getTime() <= now.getTime();
}

/**
 * T012 — the lazy-expiry entry point. Sequence (mirrors the run directive's own contract):
 *   1. validate `orderId` → 2. authenticate → 3. resolve the acting organization server-side →
 *   4. read the order through the ordinary member/RLS path, org-scoped →
 *   5. inspect `orders.status` + `orders.hold_expires_at` →
 *   6. not a stale hold → mutate NOTHING, return the truthful current state →
 *   7. stale hold → the ONE `rpc("expire_order_hold")` →
 *   8. separate authorized re-read (DB-OPEN-14 pattern) → 9. return the fresh controlled state.
 *
 * A cross-organization or nonexistent id refuses `ORDER_NOT_FOUND` at step 4 — the RPC is never
 * reached, so one organization can never trigger another's expiry through this path (the function
 * itself carries no caller check, which is exactly why this application boundary must, SEC-002).
 */
export async function ensureHoldFresh(orderId: string, options: EnsureHoldFreshOptions = {}): Promise<ActionFeedbackResult<HoldFreshness>> {
  if (!OrderIdInput.safeParse(orderId).success) {
    return { ok: false, code: ACTION_FEEDBACK.VALIDATION_ERROR };
  }

  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || identity.organization === null || !identity.isAuthorizedMember) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_ACCESSIBLE };
  }
  const organizationId = identity.organization.organizationId;

  const order = await getOrderById({ organizationId, orderId });
  if (!order) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  const now = options.now ?? new Date();
  if (!isStale(order, now)) {
    return { ok: true, data: { order, fresh: isHoldBearing(order.status), expiredNow: false } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("expire_order_hold", { p_order_id: orderId });
  if (error) {
    return { ok: false, code: mapOrderError(error) };
  }

  const refreshed = await getOrderById({ organizationId, orderId });
  if (!refreshed) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_NOT_FOUND };
  }

  return { ok: true, data: { order: refreshed, fresh: isHoldBearing(refreshed.status) && !isStale(refreshed, now), expiredNow: refreshed.status === "EXPIRED" } };
}

/**
 * T013 — the server-side PRE-PAYMENT BOUNDARY. Any downstream payment / payment-proof / escrow
 * hand-off MUST pass through this before acting: it runs lazy expiry first, then refuses unless
 * the order is in `HOLD` with an unexpired hold. Feature 007 implements NO payment, proof, provider
 * or escrow behaviour itself — **Feature 008's real payment/escrow Server Action MUST call
 * `requireFreshHold(orderId)` (or `ensureHoldFresh` + the same check) as its first step and refuse
 * on `ORDER_HOLD_EXPIRED`**; this file is the contract, not the implementation of that action.
 */
export async function requireFreshHold(orderId: string, options: EnsureHoldFreshOptions = {}): Promise<ActionFeedbackResult<OrderSummary>> {
  const freshness = await ensureHoldFresh(orderId, options);
  if (!freshness.ok) return freshness;

  const { order, fresh } = freshness.data;
  if (order.status !== "HOLD" || !fresh) {
    return { ok: false, code: ACTION_FEEDBACK.ORDER_HOLD_EXPIRED };
  }
  return { ok: true, data: order };
}

/**
 * T015 — picks, from an already-read page of orders, the rows whose stored `hold_expires_at` has
 * passed on the server clock. Pure selection only: it never mutates, never calls the RPC — the
 * caller passes each id through `ensureHoldFresh` and re-reads the page afterwards. Kept here (not
 * in a page component) so the staleness rule has exactly one definition and the server clock is
 * read outside React render.
 */
export function selectStaleHolds(rows: readonly OrderSummary[]): OrderSummary[] {
  const now = new Date();
  return rows.filter((order) => isStale(order, now));
}
