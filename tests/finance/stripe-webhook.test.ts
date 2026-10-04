import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listRuntimeFiles, stripComments } from "./runtime-absence-helpers";

/**
 * Feature 017: T006 — Retired Stripe Webhook Absence & Security Tests
 *
 * Replaces obsolete Feature 008 Stripe webhook verification tests.
 * Proves that:
 * 1. lib/finance/stripe/webhook.ts is completely removed.
 * 2. supabase/functions/stripe-webhook Edge Function source is completely removed.
 * 3. ingest_stripe_event has zero application callers in production runtime.
 * 4. No Stripe webhook listener or signature verifier exists.
 * 5. Does not require or import the Stripe npm package.
 */

describe("T006 — Stripe webhook runtime retirement contract", () => {
  it("lib/finance/stripe/webhook.ts is completely absent", () => {
    expect(existsSync("lib/finance/stripe/webhook.ts")).toBe(false);
  });

  it("supabase/functions/stripe-webhook directory is completely absent", () => {
    expect(existsSync("supabase/functions/stripe-webhook")).toBe(false);
  });

  it("ingest_stripe_event has zero callers in src/, lib/, and components/", () => {
    const runtimeFiles = listRuntimeFiles();
    const violations: { file: string; line: string }[] = [];

    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      const lines = source.split("\n");
      for (const line of lines) {
        if (/ingest_stripe_event/.test(line)) {
          violations.push({ file, line: line.trim() });
        }
      }
    }

    expect(violations, `ingest_stripe_event callers found: ${JSON.stringify(violations)}`).toEqual([]);
  });

  it("no webhook endpoint or verifier is exposed for Stripe events", () => {
    const runtimeFiles = listRuntimeFiles();
    const violations: string[] = [];

    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (/verifyStripeWebhookSignature|stripe\.webhooks\.constructEvent/.test(source)) {
        violations.push(file);
      }
    }

    expect(violations, `Stripe webhook verifiers found: ${violations.join(", ")}`).toEqual([]);
  });
});
