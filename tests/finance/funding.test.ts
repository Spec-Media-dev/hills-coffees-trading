import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { requestFunding } from "@/lib/finance/funding";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 008 Phase 1 (T004) — proofs that the funding seam is deterministic, inert, and honest.
 */
describe("T004 — requestFunding is a deterministic, controlled unavailable outcome", () => {
  it("returns FINANCE_FUNDING_UNAVAILABLE for a well-formed identifier, every time", async () => {
    const input = { orderId: "00000000-0000-4000-8000-000000000000" };
    const first = await requestFunding(input);
    const second = await requestFunding(input);
    expect(first).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE });
    expect(second).toEqual({ ok: false, code: ACTION_FEEDBACK.FINANCE_FUNDING_UNAVAILABLE });
  });

  it("returns VALIDATION_ERROR for a malformed identifier, never FINANCE_FUNDING_UNAVAILABLE", async () => {
    const result = await requestFunding({ orderId: "not-a-uuid" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(ACTION_FEEDBACK.VALIDATION_ERROR);
  });

  it("ignores client-supplied amount/currency/status/provider fields — the outcome never changes based on them", async () => {
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

/** Strips comments so a doc comment legitimately NAMING a forbidden pattern to explain its deliberate
 * absence never trips a "must not contain X" check — same precedent as `tests/orders/read.test.ts`. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("T004 — source-level proof of zero provider/network/secret behavior", () => {
  const source = stripComments(readFileSync("lib/finance/funding.ts", "utf8"));

  it("performs no network call and imports no HTTP/SDK client", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/axios/i);
  });

  it("names no known payment provider", () => {
    const providerNames = ["stripe", "tazapay", "paytabs", "escrow.com", "checkout.com", "adyen", "braintree", "paypal"];
    const lowered = source.toLowerCase();
    for (const name of providerNames) expect(lowered).not.toContain(name);
  });

  it("reads no secret/credential environment variable", () => {
    expect(source).not.toMatch(/process\.env\.[A-Z0-9_]*(SECRET|KEY|TOKEN|CREDENTIAL)/);
    expect(source).not.toMatch(/NEXT_PUBLIC_|EXPO_PUBLIC_/);
  });

  it("never calls admin_review_payment, submit_payment_proof, or a Supabase RPC/table write", () => {
    expect(source).not.toMatch(/admin_review_payment/);
    expect(source).not.toMatch(/submit_payment_proof/);
    expect(source).not.toMatch(/\.rpc\(/);
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/createClient/);
  });

  it("never uses a shared cache directive", () => {
    expect(source).not.toMatch(/unstable_cache|"use cache"|cacheTag|cacheLife|updateTag/);
  });
});
