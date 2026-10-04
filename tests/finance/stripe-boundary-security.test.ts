import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { listRuntimeFiles, stripComments } from "./runtime-absence-helpers";

/**
 * Feature 017: T006 — Retired Provider Boundary Security Tests
 *
 * Replaces obsolete Feature 008 boundary security proofs.
 * Proves that:
 * 1. Zero Stripe secrets exist in client or server runtime modules.
 * 2. Zero runtime files import the Stripe SDK.
 * 3. StripePaymentCollector and settlement.ts are completely removed.
 * 4. admin_review_payment, record_stripe_payment_intent, record_payment_transfer,
 *    and ingest_stripe_event have ZERO callers across src/, lib/, and components/.
 */

describe("T006 — No Stripe secret ever reaches runtime modules", () => {
  const runtimeFiles = listRuntimeFiles();

  it("no runtime file reads STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET", () => {
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not read STRIPE_SECRET_KEY`).not.toMatch(/STRIPE_SECRET_KEY/);
      expect(source, `${file} must not read STRIPE_WEBHOOK_SECRET`).not.toMatch(/STRIPE_WEBHOOK_SECRET/);
    }
  });

  it("the Stripe payment collector component is completely absent", () => {
    expect(existsSync("components/finance/stripe-payment-collector.tsx")).toBe(false);
  });
});

describe("T006 — No direct provider call exists in production runtime", () => {
  it("no runtime file imports the Stripe SDK directly", () => {
    const runtimeFiles = listRuntimeFiles();
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file} must not import the stripe SDK`).not.toMatch(
        /from\s+["'](stripe|@stripe\/stripe-js|@stripe\/react-stripe-js)["']/
      );
    }
  });

  it("lib/finance/stripe/ directory is completely absent", () => {
    expect(existsSync("lib/finance/stripe/config.ts")).toBe(false);
    expect(existsSync("lib/finance/stripe/adapter.ts")).toBe(false);
    expect(existsSync("lib/finance/stripe/webhook.ts")).toBe(false);
  });
});

describe("T006 — Retired database RPCs have zero application callers", () => {
  const runtimeFiles = listRuntimeFiles();

  it("admin_review_payment has zero callers in src/, lib/, and components/", () => {
    const callSites: string[] = [];
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("admin_review_payment")) {
        callSites.push(file);
      }
    }
    expect(callSites).toEqual([]);
  });

  it("lib/finance/settlement.ts is completely absent", () => {
    expect(existsSync("lib/finance/settlement.ts")).toBe(false);
  });

  it("record_stripe_payment_intent has zero callers in src/, lib/, and components/", () => {
    const callSites: string[] = [];
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("record_stripe_payment_intent")) {
        callSites.push(file);
      }
    }
    expect(callSites).toEqual([]);
  });

  it("record_payment_transfer has zero callers in src/, lib/, and components/", () => {
    const callSites: string[] = [];
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("record_payment_transfer")) {
        callSites.push(file);
      }
    }
    expect(callSites).toEqual([]);
  });

  it("ingest_stripe_event has zero callers in src/, lib/, and components/", () => {
    const callSites: string[] = [];
    for (const file of runtimeFiles) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (source.includes("ingest_stripe_event")) {
        callSites.push(file);
      }
    }
    expect(callSites).toEqual([]);
  });
});
