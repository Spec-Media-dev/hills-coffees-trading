/**
 * Feature 008 RUN E (Stripe provider decision) T010/T012 — the ONLY place this codebase reads a Stripe
 * environment variable. Server-only (no `"use client"` file may import this module — enforced by
 * `tests/finance/stripe-config.test.ts`'s source grep, mirroring `lib/finance/funding.ts`'s own
 * established "never in a client bundle" discipline).
 *
 * No secret is ever exported by name or value from this module — only booleans and the one genuinely
 * client-safe value (`STRIPE_PUBLISHABLE_KEY`, per Stripe's own design and `STRIPE-PREPARATION.md` §12's
 * secret/environment contract). `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are read ONLY inside
 * `stripeClient()`/`verifyStripeWebhookSignature()` (this module and `webhook.ts`), never returned to a
 * caller, never logged.
 */

/** True only when a live (or Stripe test-mode) secret key is present. No credential is provisioned by
 * this run (T010 stays open) — this simply lets every other module answer "is Stripe configured?"
 * honestly instead of guessing from a try/catch around a real API call. */
export function isStripeConfigured(): boolean {
  return typeof process.env.STRIPE_SECRET_KEY === "string" && process.env.STRIPE_SECRET_KEY.length > 0;
}

/** True only when the webhook endpoint secret is present — the Edge Function's own gate, checked
 * independently of `isStripeConfigured()` since a platform could theoretically have one without the
 * other during setup. */
export function isStripeWebhookConfigured(): boolean {
  return typeof process.env.STRIPE_WEBHOOK_SECRET === "string" && process.env.STRIPE_WEBHOOK_SECRET.length > 0;
}

/** The ONE Stripe value this codebase treats as client-safe, by Stripe's own design (a publishable key
 * authorizes no server action). Never a substitute for the secret key; never used server-side to
 * authorize anything. Returns `null`, never an empty string, when unset. */
export function stripePublishableKey(): string | null {
  const value = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return typeof value === "string" && value.length > 0 ? value : null;
}
