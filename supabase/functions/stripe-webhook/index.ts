// Feature 008 RUN E (Stripe provider decision) T012/T013 — the event-ingestion boundary. Deno/Supabase
// Edge Function. WRITTEN, NOT DEPLOYED THIS RUN (no live Stripe account/webhook secret exists yet —
// T010 stays open). `supabase/config.toml` disables JWT verification for this function specifically:
// Stripe calls it directly with no Supabase session, authenticating instead via its own
// `Stripe-Signature` header, verified below.
//
// RESPONSIBILITIES (STRIPE-PREPARATION.md §8, now implemented rather than drafted):
//   - Verify the RAW body against `STRIPE_WEBHOOK_SECRET` before trusting anything in the payload.
//   - Deduplicate on `event.id` (never `created`) — delegated to `ingest_stripe_event()`'s own
//     `ON CONFLICT (provider, external_event_id) DO NOTHING`, so a retried/duplicate delivery is a safe
//     200 response, never a processing error.
//   - Never log the raw event payload (may carry buyer/seller PII and payment details).
//   - Never trust event ORDER — this handler reacts only to `payment_intent.succeeded` (the trusted-
//     funding signal Option A's gate reads) and `payment_intent.payment_failed` (a safe no-op: it never
//     creates a `trusted_funding_confirmed_at` value, so the payment simply never becomes
//     settlement-eligible — no new terminal status is invented, per the migration's own header).
//   - Always responds 200 to Stripe for anything it safely handled (including "already processed" and
//     "not a relevant event type") — a non-2xx response makes Stripe retry for up to 3 days, which is
//     correct ONLY for a genuine transient failure (e.g. the database call itself failing), never for
//     "I understood this and chose to ignore it".
//
// Uses `service_role` to call `ingest_stripe_event()` (that function's own EXECUTE grant is
// service_role-only, by design — see the migration's own comment on why: this is the ONE place a
// Stripe event, once cryptographically verified, is trusted without a per-user session).

// @ts-expect-error - "npm:" and "https://esm.sh" specifiers resolve in the Deno edge runtime, not in this repo's Node/tsc project.
import Stripe from "npm:stripe@18";
// @ts-expect-error - Deno edge runtime global, not part of this repo's Node type roots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Deno's runtime lacks Node's synchronous crypto the Stripe SDK's default verifier assumes — Stripe's
// own documented fix for Edge/Deno environments is an async SubtleCrypto-backed provider.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Honest, non-retryable failure: nothing is configured yet. Stripe is not sent a 2xx it would
    // otherwise interpret as "handled".
    return new Response("not configured", { status: 503 });
  }

  const signature = req.headers.get("Stripe-Signature");
  const rawBody = await req.text();

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    // constructEventAsync (not the sync constructEvent) is required with the SubtleCrypto provider.
    event = await Stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch {
    // Forged signature, tampered body, wrong secret, or a stale timestamp (replay protection). The raw
    // error is never logged (may echo header/body fragments).
    return new Response("invalid signature", { status: 400 });
  }

  const paymentIntent = event.data.object as { id?: string; metadata?: { hills_order_id?: string } };
  const orderId = paymentIntent.metadata?.hills_order_id;
  const relevant = event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed";

  if (!relevant || !orderId) {
    // Not an event this boundary acts on, or it carries no correlation back to an order (should not
    // happen for an event this platform itself created the PaymentIntent for) — acknowledged, not
    // treated as an error Stripe should retry.
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: payment, error: paymentLookupError } = await supabase.from("payments").select("id").eq("order_id", orderId).maybeSingle();
  if (paymentLookupError || !payment) {
    // A transient DB error is retried by Stripe (5xx); a genuinely missing payment is not (4xx) — never
    // fabricates funding for an order that does not exist.
    return new Response(paymentLookupError ? "lookup failed" : "order not found", { status: paymentLookupError ? 500 : 404 });
  }

  const { error: ingestError } = await supabase.rpc("ingest_stripe_event", {
    p_provider: "STRIPE",
    p_external_event_id: event.id,
    p_event_type: event.type,
    p_payment_id: payment.id,
    p_payload: null, // never persist the raw payload — payment_events.payload stays reserved for a future, explicitly-scoped need (Phase 1's own "never expose payment_events.payload" decision).
    p_funding_confirmed: event.type === "payment_intent.succeeded",
  });

  if (ingestError) {
    // A transient failure is retried by Stripe; the raw database error is never logged with payload.
    return new Response("ingest failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
