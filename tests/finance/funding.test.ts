import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 008 Phase 1 (T004), extended RUN E (Stripe provider decision) T012/T014 — proofs that the
 * funding seam is still deterministic and honest, now that it can genuinely create a Stripe PaymentIntent
 * once configured. `STRIPE_SECRET_KEY` is never set in this test environment (no live credential exists
 * — T010 stays open), so every "unconfigured" assertion below exercises the REAL, unmocked code path —
 * not a stub standing in for one.
 */
describe("T004/T014 — requestFunding: unconfigured (today's real, live state)", () => {
  it("returns FINANCE_FUNDING_UNAVAILABLE for a well-formed identifier, every time", async () => {
    const { requestFunding } = await import("@/lib/finance/funding");
    const input = { orderId: "00000000-0000-4000-8000-000000000000" };
    const first = await requestFunding(input);
    const second = await requestFunding(input);
    expect(first).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE });
    expect(second).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE });
  });

  it("returns VALIDATION_ERROR for a malformed identifier, never FINANCE_FUNDING_UNAVAILABLE", async () => {
    const { requestFunding } = await import("@/lib/finance/funding");
    const result = await requestFunding({ orderId: "not-a-uuid" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
  });

  it("ignores client-supplied amount/currency/status/provider fields — the outcome never changes based on them", async () => {
    const { requestFunding } = await import("@/lib/finance/funding");
    const honest = await requestFunding({ orderId: "00000000-0000-4000-8000-000000000000" });
    const tampered = await requestFunding({
      orderId: "00000000-0000-4000-8000-000000000000",
      amount: 1,
      currency: "USD",
      status: "CONFIRMED",
      provider: "some-provider",
    });
    expect(tampered).toEqual(honest);
  });
});

const serverClientState = vi.hoisted(() => ({ invokeResult: null as { data: unknown; error: unknown } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    functions: { invoke: vi.fn(async () => serverClientState.invokeResult) },
  })),
}));

describe("T014 — requestFunding: Stripe configured (mocked Edge Function boundary, no live credential)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("never fabricates success: an Edge Function/network failure maps to FINANCE_FUNDING_CREATE_FAILED, not a fake client secret", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_unit_test_only");
    serverClientState.invokeResult = { data: null, error: { message: "not found" } };
    const { requestFunding } = await import("@/lib/finance/funding");
    const result = await requestFunding({ orderId: "00000000-0000-4000-8000-000000000000" });
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_CREATE_FAILED });
  });

  it("relays a genuine controlled refusal from the Edge Function via the shared FINANCE_ERROR_MAP", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_unit_test_only");
    serverClientState.invokeResult = { data: { clientSecret: null, code: "order_not_fundable" }, error: null };
    const { requestFunding } = await import("@/lib/finance/funding");
    const result = await requestFunding({ orderId: "00000000-0000-4000-8000-000000000000" });
    expect(result).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_ORDER_NOT_FUNDABLE });
  });

  it("returns the real client_secret on success — never a hardcoded/fabricated one", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_unit_test_only");
    serverClientState.invokeResult = { data: { clientSecret: "pi_fake_123_secret_abc" }, error: null };
    const { requestFunding } = await import("@/lib/finance/funding");
    const result = await requestFunding({ orderId: "00000000-0000-4000-8000-000000000000" });
    expect(result).toEqual({ ok: true, data: { clientSecret: "pi_fake_123_secret_abc" } });
  });
});

/** Strips comments so a doc comment legitimately NAMING a forbidden pattern to explain its deliberate
 * absence never trips a "must not contain X" check — same precedent as `tests/orders/read.test.ts`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T012/T014 — source-level proof of the funding seam's boundary discipline", () => {
  const source = stripComments(readFileSync("lib/finance/funding.ts", "utf8"));

  it("never reads a Stripe secret directly — only through lib/finance/stripe/config.ts's isStripeConfigured()", () => {
    expect(source).not.toMatch(/process\.env\.STRIPE_SECRET_KEY/);
    expect(source).not.toMatch(/process\.env\.STRIPE_WEBHOOK_SECRET/);
    expect(source).toMatch(/isStripeConfigured/);
  });

  it("never a NEXT_PUBLIC_/EXPO_PUBLIC_ credential", () => {
    expect(source).not.toMatch(/NEXT_PUBLIC_|EXPO_PUBLIC_/);
  });

  it("never calls admin_review_payment, submit_payment_proof, or the Stripe SDK directly — only the Edge Function boundary", () => {
    expect(source).not.toMatch(/admin_review_payment/);
    expect(source).not.toMatch(/submit_payment_proof/);
    expect(source).not.toMatch(/new Stripe\(/);
    expect(source).not.toMatch(/\.rpc\(/);
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("never uses a shared cache directive", () => {
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
  });
});
