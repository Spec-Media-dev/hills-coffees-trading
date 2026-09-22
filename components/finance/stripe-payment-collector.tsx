"use client";

import { useEffect, useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AppBilingual } from "@/components/locale/app-bilingual";

/**
 * Feature 008 RUN E (Stripe provider decision) T014 — the member funding surface. Genuinely minimal:
 * Stripe's own Payment Element, mounted against the `client_secret` `lib/finance/funding.ts#
 * requestFunding` already obtained server-side (this component never creates a PaymentIntent itself,
 * never sees an amount/currency it could tamper with — it only COLLECTS a payment method and confirms
 * a charge Stripe's own client_secret already authorizes, exactly as `STRIPE-PREPARATION.md` §5
 * specifies).
 *
 * `publishableKey` is passed as a plain prop from the server page (`stripePublishableKey()`,
 * `lib/finance/stripe/config.ts`) — this file itself NEVER imports that config module (which also
 * touches `STRIPE_SECRET_KEY`) to keep the secret-touching module fully out of the client bundle graph;
 * `tests/finance/stripe-client-exposure.test.ts` source-greps this file for exactly that.
 *
 * `redirect: "if_required"` — no return-URL redirect for a payment method that does not need one (a
 * card, the common case); Stripe still redirects when a chosen method requires it (e.g. certain bank
 * redirects). Success/failure is reported inline via the existing single Sonner provider — no second
 * toast system (T026's own established rule).
 */
export function StripePaymentCollector({ clientSecret, publishableKey }: { clientSecret: string; publishableKey: string }) {
  const elementsRef = useRef<StripeElements | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStripe(publishableKey).then((stripe) => {
      if (cancelled || !stripe) return;
      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret });
      elementsRef.current = elements;
      const paymentElement = elements.create("payment");
      if (mountRef.current) paymentElement.mount(mountRef.current);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [clientSecret, publishableKey]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setSubmitting(true);
    const { error } = await stripe.confirmPayment({ elements, redirect: "if_required" });
    setSubmitting(false);

    if (error) {
      // Stripe's own client-side error message is already end-user-safe (card_error/validation_error
      // category text) — never a raw server exception, never logged with payment details.
      toast.error(error.message ?? "Payment could not be completed.");
      return;
    }

    toast.success("Payment submitted.");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-finance-notice="funding-collector">
      <div ref={mountRef} />
      <Button type="submit" disabled={!ready || submitting}>
        <AppBilingual pick={(c) => c.finance.funding.pay.submit} />
      </Button>
    </form>
  );
}
