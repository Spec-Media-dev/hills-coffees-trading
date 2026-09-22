import Stripe from "stripe";

import { isStripeConfigured } from "@/lib/finance/stripe/config";

/**
 * Feature 008 RUN E (Stripe provider decision) T012 — the server-only Stripe API boundary. Implements
 * exactly the "separate charges and transfers" shape `STRIPE-PREPARATION.md` §4 recommended and this
 * run's own product decision confirmed: one PaymentIntent on the platform account per order
 * (`transfer_group` = order id), and later, separate `Transfer`s referencing that same group via
 * `source_transaction` — never created in the same call as the charge (STRIPE-PREPARATION.md §4a step 4).
 *
 * NEVER imported by a `"use client"` file (`tests/finance/stripe-adapter.test.ts` source-greps this).
 * NEVER called with a client-supplied amount/currency — every caller re-derives both from the
 * database (`lib/finance/read.ts`) before reaching this module (FR-004/FR-005).
 *
 * No live credential exists yet (T010 stays open) — every function below fails honestly with
 * `{ ok: false, reason: "not_configured" }` rather than throwing or fabricating a Stripe object when
 * `STRIPE_SECRET_KEY` is absent. `stripeClient()` is the ONLY place that key is read.
 */

let cachedClient: Stripe | null = null;

function stripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  if (!cachedClient) {
    cachedClient = new Stripe(secretKey, { apiVersion: "2026-08-26.dahlia" });
  }
  return cachedClient;
}

export type CreatePaymentIntentInput = {
  orderId: string;
  /** Minor units (e.g. cents/fils) — the caller derives this from `payments.amount` × currency exponent, never from client input. */
  amountMinorUnits: number;
  currency: string;
};

export type StripeAdapterResult<T> = { ok: true; data: T } | { ok: false; reason: "not_configured" | "provider_error" };

/** Creates the ONE PaymentIntent for an order's whole cart (STRIPE-PREPARATION.md §4a step 2). Uses a
 * deterministic idempotency key (`pi-create-{orderId}`) so a retried request after a network failure
 * cannot create a second PaymentIntent for the same order — Stripe replays the first response verbatim
 * for any retry within 24 hours of the same key. */
export async function createOrderPaymentIntent(input: CreatePaymentIntentInput): Promise<StripeAdapterResult<{ paymentIntentId: string; clientSecret: string | null }>> {
  const stripe = stripeClient();
  if (!isStripeConfigured() || !stripe) return { ok: false, reason: "not_configured" };

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: input.amountMinorUnits,
        currency: input.currency.toLowerCase(),
        transfer_group: input.orderId,
        metadata: { hills_order_id: input.orderId },
      },
      { idempotencyKey: `pi-create-${input.orderId}` },
    );
    return { ok: true, data: { paymentIntentId: intent.id, clientSecret: intent.client_secret } };
  } catch {
    // Never logs the raw Stripe error (may echo request parameters); no fabricated success.
    return { ok: false, reason: "provider_error" };
  }
}

export type CreateTransferInput = {
  /** The order id, reused as Stripe's own `transfer_group` value (STRIPE-PREPARATION.md §4a). */
  transferGroup: string;
  /** The original charge's PaymentIntent/Charge id — links the Transfer to the money that actually funds it (`source_transaction`). */
  sourceTransactionId: string;
  /** The seller's connected-account id. ACCOUNT-VERIFICATION-REQUIRED (T007/T010) — no connected account exists yet; every real call fails honestly until one does. */
  destinationAccountId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
};

/** Creates ONE Transfer for a single (order, seller) payout — never the full line amount, always
 * `seller_net_amount` (STRIPE-PREPARATION.md §4a step 4). Only ever called AFTER `admin_review_payment()`
 * has already settled the order (the payout row this transfer provides evidence for cannot exist
 * before that). */
export async function createSellerTransfer(input: CreateTransferInput): Promise<StripeAdapterResult<{ transferId: string }>> {
  const stripe = stripeClient();
  if (!isStripeConfigured() || !stripe) return { ok: false, reason: "not_configured" };

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: input.amountMinorUnits,
        currency: input.currency.toLowerCase(),
        destination: input.destinationAccountId,
        transfer_group: input.transferGroup,
        source_transaction: input.sourceTransactionId,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    return { ok: true, data: { transferId: transfer.id } };
  } catch {
    return { ok: false, reason: "provider_error" };
  }
}
