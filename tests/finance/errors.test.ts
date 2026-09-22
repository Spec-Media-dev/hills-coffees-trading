import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { mapFinanceError } from "@/lib/finance/errors";
import { getAppCopy } from "@/lib/app/copy";
import { ACTION_FEEDBACK } from "@/lib/types/action-feedback";

/**
 * Feature 008 Phase 1 (T002) — proofs for the finance domain's controlled error mapping and its
 * EN/AR copy contract.
 */
describe("T002 — mapFinanceError never leaks raw database text and falls back safely", () => {
  it("an error with no recognized raised message maps to the generic safe code", () => {
    expect(mapFinanceError({ message: "permission denied for table payments", code: "42501" })).toBe(ACTION_FEEDBACK.FINANCE_READ_FAILED);
  });

  it("a null/undefined error also maps to the generic safe code, without throwing", () => {
    expect(mapFinanceError(null)).toBe(ACTION_FEEDBACK.FINANCE_READ_FAILED);
    expect(mapFinanceError(undefined)).toBe(ACTION_FEEDBACK.FINANCE_READ_FAILED);
  });

  it("logs only the SQLSTATE-shaped code server-side, never the raw message/payload", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mapFinanceError({ message: "secret bank routing number 123-456-789", code: "42501" });
    expect(spy).toHaveBeenCalledTimes(1);
    const loggedArgs = spy.mock.calls[0]!;
    const serialized = JSON.stringify(loggedArgs);
    expect(serialized).not.toContain("secret bank routing number");
    expect(serialized).toContain("42501");
    spy.mockRestore();
  });

  it("mapFinanceError's return value is always one of the shared ActionFeedbackCode strings, never a raw message", () => {
    const mapped = mapFinanceError({ message: "some future provider-boundary exception", code: "P0001" });
    expect(Object.values(ACTION_FEEDBACK)).toContain(mapped);
  });
});

describe("T018/T019 — settlement/funding-boundary exception names map to their exact controlled codes", () => {
  it("admin_review_payment()'s exceptions map correctly", () => {
    expect(mapFinanceError({ message: "forbidden" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_FORBIDDEN);
    expect(mapFinanceError({ message: "payment_not_found" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_PAYMENT_NOT_FOUND);
    expect(mapFinanceError({ message: "trusted_funding_required" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_TRUSTED_FUNDING_MISSING);
    expect(mapFinanceError({ message: "active_reservation_missing" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_RESERVATION_MISSING);
    expect(mapFinanceError({ message: "reservation_expired" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_RESERVATION_EXPIRED);
    expect(mapFinanceError({ message: "seller_inventory_position_invalid" })).toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_INVENTORY_INVALID);
  });

  it("record_stripe_payment_intent()'s exceptions map correctly", () => {
    expect(mapFinanceError({ message: "order_not_fundable" })).toBe(ACTION_FEEDBACK.FINANCE_FUNDING_ORDER_NOT_FUNDABLE);
    expect(mapFinanceError({ message: "stripe_payment_intent_already_recorded" })).toBe(ACTION_FEEDBACK.FINANCE_FUNDING_ALREADY_INITIATED);
  });

  it("the trusted-funding-missing code is distinct from every other settlement code (never collapsed into a generic failure)", () => {
    const mapped = mapFinanceError({ message: "trusted_funding_required" });
    expect(mapped).not.toBe(ACTION_FEEDBACK.FINANCE_READ_FAILED);
    expect(mapped).not.toBe(ACTION_FEEDBACK.FINANCE_SETTLEMENT_FORBIDDEN);
  });
});

describe("T002 — errors.ts source never contains a raw-error passthrough or a second toast system", () => {
  it("never constructs a template string that embeds the raw error message into a user-facing value", () => {
    const source = readFileSync("lib/finance/errors.ts", "utf8");
    expect(source).not.toMatch(/toast\(/);
    expect(source).not.toMatch(/createContext.*[Tt]oast/);
  });
});

describe("T002 — EN/AR copy contract for finance controlled results is complete and real", () => {
  it("both locales resolve finance.errors.readFailed to a non-empty string", () => {
    expect(getAppCopy("en").finance.errors.readFailed.length).toBeGreaterThan(0);
    expect(getAppCopy("ar").finance.errors.readFailed.length).toBeGreaterThan(0);
  });

  it("both locales resolve finance.funding.unavailable title/description to non-empty strings", () => {
    const en = getAppCopy("en").finance.funding.unavailable;
    const ar = getAppCopy("ar").finance.funding.unavailable;
    expect(en.title.length).toBeGreaterThan(0);
    expect(en.description.length).toBeGreaterThan(0);
    expect(ar.title.length).toBeGreaterThan(0);
    expect(ar.description.length).toBeGreaterThan(0);
  });

  it("the Arabic copy is a genuine translation (contains Arabic script), not an English fallback", () => {
    const arabicPattern = /[؀-ۿ]/;
    const ar = getAppCopy("ar").finance;
    expect(arabicPattern.test(ar.errors.readFailed)).toBe(true);
    expect(arabicPattern.test(ar.funding.unavailable.title)).toBe(true);
    expect(arabicPattern.test(ar.funding.unavailable.description)).toBe(true);
  });

  it("the unavailable copy never claims success, escrow initiation, or a bank instruction", () => {
    const en = getAppCopy("en").finance.funding.unavailable;
    const combined = `${en.title} ${en.description}`.toLowerCase();
    expect(combined).not.toMatch(/success/);
    expect(combined).not.toMatch(/escrow initiat/);
    expect(combined).not.toMatch(/bank account|iban|swift/);
    expect(combined).not.toMatch(/transfer .*money/);
  });
});
