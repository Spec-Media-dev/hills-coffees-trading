// Feature 008 RUN E (Stripe provider decision) T012/T017 — the seller-transfer boundary. Deno/Supabase
// Edge Function. WRITTEN, NOT DEPLOYED THIS RUN (no live Stripe account/connected accounts exist yet —
// T007/T010 stay open). JWT verification stays ENABLED: invoked with a finance operator's own forwarded
// session; `record_payment_transfer()`'s own `is_finance_operator()` check is the real authorization
// boundary (belt-and-braces, not the only one).
//
// Called ONLY after `admin_review_payment()` has already settled the order (a `payouts` row must
// already exist) and finance has separately decided to release a specific seller's funds — "Approve
// Settlement" and "Release Seller Funds" are deliberately two different actions (this run's own product
// decision), never collapsed into one call.

// @ts-expect-error - "npm:" and "https://esm.sh" specifiers resolve in the Deno edge runtime, not in this repo's Node/tsc project.
import Stripe from "npm:stripe@18";
// @ts-expect-error - Deno edge runtime global, not part of this repo's Node type roots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ code: "method_not_allowed" }), { status: 405 });
  }
  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ code: "not_configured" }), { status: 503 });
  }
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ code: "forbidden" }), { status: 401 });
  }

  let payoutId: string | undefined;
  let destinationAccountId: string | undefined;
  try {
    const body = await req.json();
    payoutId = typeof body?.payoutId === "string" ? body.payoutId : undefined;
    destinationAccountId = typeof body?.destinationAccountId === "string" ? body.destinationAccountId : undefined;
  } catch {
    return new Response(JSON.stringify({ code: "validation_error" }), { status: 400 });
  }
  if (!payoutId || !destinationAccountId) {
    return new Response(JSON.stringify({ code: "validation_error" }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: payout } = await supabase.from("payouts").select("id, order_id, amount, currency").eq("id", payoutId).maybeSingle();
  if (!payout) {
    return new Response(JSON.stringify({ code: "payout_not_found" }), { status: 404 });
  }
  const { data: payment } = await supabase.from("payments").select("external_reference").eq("order_id", payout.order_id).maybeSingle();
  if (!payment?.external_reference) {
    return new Response(JSON.stringify({ code: "trusted_funding_required" }), { status: 409 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });
  const amountMinorUnits = Math.round(Number(payout.amount) * 100);
  const idempotencyKey = `transfer-${payoutId}`;

  let transfer;
  try {
    transfer = await stripe.transfers.create(
      { amount: amountMinorUnits, currency: String(payout.currency).toLowerCase(), destination: destinationAccountId, transfer_group: payout.order_id, source_transaction: payment.external_reference },
      { idempotencyKey },
    );
  } catch {
    return new Response(JSON.stringify({ code: "provider_error" }), { status: 502 });
  }

  const { error: recordError } = await supabase.rpc("record_payment_transfer", {
    p_payout_id: payoutId,
    p_provider_transfer_id: transfer.id,
    p_transfer_group: payout.order_id,
    p_idempotency_key: idempotencyKey,
  });
  if (recordError) {
    return new Response(JSON.stringify({ code: recordError.message ?? "finance_settlement_failed" }), { status: 400 });
  }

  return new Response(JSON.stringify({ transferId: transfer.id }), { status: 200, headers: { "content-type": "application/json" } });
});
