// Feature 008 RUN E (Stripe provider decision) T012/T014 — the funding-creation boundary. Deno/Supabase
// Edge Function. WRITTEN, NOT DEPLOYED THIS RUN (no live Stripe account exists yet — T010 stays open).
// `supabase/config.toml` keeps JWT verification ENABLED for this function: it is invoked from
// `lib/finance/funding.ts#requestFunding` via `supabase.functions.invoke()`, which forwards the
// calling buyer's own session — the gateway rejects an unauthenticated call before this code even runs,
// and `auth.uid()` inside `record_stripe_payment_intent()` is genuinely the buyer, never a service-role
// bypass.
//
// RESPONSIBILITIES (STRIPE-PREPARATION.md §5, FR-004/FR-005):
//   - Accepts ONLY a minimal identifier (`orderId`) — never trusts a client-supplied amount, currency,
//     or provider reference.
//   - Re-reads the authoritative amount/currency from `payments`/`order_financials` under the caller's
//     OWN forwarded session (RLS-scoped — a cross-org orderId simply is not found, never a distinguishable
//     "exists but not yours" signal).
//   - Creates exactly ONE Stripe PaymentIntent per order (`transfer_group` = order id), with a
//     deterministic idempotency key so a retried request cannot create a second one.
//   - Persists the correlation via `record_stripe_payment_intent()` (buyer-org-member-only at the DB
//     layer too — belt-and-braces, not the only check).
//   - Returns ONLY `client_secret` to the caller — no other Stripe object field, no secret.

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

  let orderId: string | undefined;
  try {
    const body = await req.json();
    orderId = typeof body?.orderId === "string" ? body.orderId : undefined;
  } catch {
    return new Response(JSON.stringify({ code: "validation_error" }), { status: 400 });
  }
  if (!orderId) {
    return new Response(JSON.stringify({ code: "validation_error" }), { status: 400 });
  }

  // The caller's OWN forwarded JWT — never the service-role key — so every RLS policy this reads
  // through (payments_view/financials_view's can_view_order) applies exactly as it does for any other
  // authenticated caller.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });

  const { data: payment } = await supabase.from("payments").select("id, order_id, amount, currency, external_reference").eq("order_id", orderId).maybeSingle();
  if (!payment) {
    return new Response(JSON.stringify({ code: "payment_not_found" }), { status: 404 });
  }
  if (payment.external_reference) {
    // A PaymentIntent already exists for this order — the client should already hold its client_secret;
    // this boundary never creates a second one.
    return new Response(JSON.stringify({ code: "finance_funding_already_initiated" }), { status: 409 });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" });

  // amount is stored in major units (numeric); Stripe expects minor units. currency is a fixed-length
  // char column (e.g. "AED") — every currency this platform supports today has a 2-decimal minor unit.
  const amountMinorUnits = Math.round(Number(payment.amount) * 100);

  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      { amount: amountMinorUnits, currency: String(payment.currency).toLowerCase(), transfer_group: orderId, metadata: { hills_order_id: orderId } },
      { idempotencyKey: `pi-create-${orderId}` },
    );
  } catch {
    return new Response(JSON.stringify({ code: "provider_error" }), { status: 502 });
  }

  const { error: recordError } = await supabase.rpc("record_stripe_payment_intent", {
    p_order_id: orderId,
    p_payment_intent_id: intent.id,
    p_idempotency_key: `pi-create-${orderId}`,
  });
  if (recordError) {
    return new Response(JSON.stringify({ code: recordError.message ?? "finance_funding_create_failed" }), { status: 400 });
  }

  return new Response(JSON.stringify({ clientSecret: intent.client_secret }), { status: 200, headers: { "content-type": "application/json" } });
});
