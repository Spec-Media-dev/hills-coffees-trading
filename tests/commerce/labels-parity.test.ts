import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ar } from "@/lib/app/copy/ar";
import { en } from "@/lib/app/copy/en";
import { COMMERCE_ERROR_CODES, mapCommerceError } from "@/lib/commerce/errors";
import {
  COMMERCE_LABEL_SETS,
  type CommerceLabelSet,
  commerceLabelDictionary,
  getCommerceLabel,
  getOrderStatusLabel,
  getPaymentStatusLabel,
  getPayoutStatusLabel,
  getProformaStatusLabel,
} from "@/lib/commerce/labels";

/**
 * Feature 013 (T064) — commerce labels and error copy.
 *
 * The canonical copy (`lib/app/copy/en.ts` / `ar.ts`) is the ONLY label source; `lib/commerce/labels.ts` is a literal-free
 * accessor over it and `lib/commerce/errors.ts` a literal-free mapper keyed by the contract error codes. These tests
 * catch the three T064 review defects: duplicate labels within one status set (D1), a second label dictionary that can
 * drift from what the UI renders (D2), and error codes that differ from `contracts/database-rpc.md` (D3).
 */

const SETS = Object.keys(COMMERCE_LABEL_SETS) as CommerceLabelSet[];
const sorted = (values: readonly string[]) => [...values].sort();
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("T064 — every commerce vocabulary has EN and AR labels in the canonical copy, exactly its allowlist", () => {
  it.each(SETS)("%s: the EN and AR copy dictionaries hold exactly the allowlist values, all non-empty", (set) => {
    const { values } = COMMERCE_LABEL_SETS[set];
    for (const locale of ["en", "ar"] as const) {
      const dictionary = commerceLabelDictionary(set, locale);
      expect(dictionary, `${set} (${locale}) is missing from the canonical copy`).toBeDefined();
      expect(sorted(Object.keys(dictionary!)), `${set} (${locale}) keys`).toEqual(sorted(values));
      for (const value of values) expect(dictionary![value]?.trim(), `${set}.${value} (${locale})`).toBeTruthy();
    }
  });

  it.each(SETS)("%s: no two statuses share a label in either language (D1)", (set) => {
    for (const locale of ["en", "ar"] as const) {
      const labels = Object.values(commerceLabelDictionary(set, locale)!);
      const duplicates = labels.filter((label, index) => labels.indexOf(label) !== index);
      expect(duplicates, `${set} (${locale}) duplicate labels`).toEqual([]);
    }
  });

  it("D1 regression: CANCELLED and VOID are distinct in Arabic (orders and proformas); VOID keeps its wording", () => {
    expect(getOrderStatusLabel("CANCELLED", "ar")).not.toBe(getOrderStatusLabel("VOID", "ar"));
    expect(getProformaStatusLabel("CANCELLED", "ar")).not.toBe(getProformaStatusLabel("VOID", "ar"));
    expect(getOrderStatusLabel("VOID", "ar")).toBe("ملغى");
    expect(getProformaStatusLabel("VOID", "ar")).toBe("ملغاة");
  });

  it("the accessors return exactly what the badges render (the canonical copy) — there is nothing to drift from (D2)", () => {
    for (const status of COMMERCE_LABEL_SETS.orderStatus.values) {
      expect(getOrderStatusLabel(status, "en")).toBe(en.orders.status[status]);
      expect(getOrderStatusLabel(status, "ar")).toBe((ar.orders?.status as Record<string, string>)[status]);
    }
    for (const status of COMMERCE_LABEL_SETS.paymentStatus.values) {
      expect(getPaymentStatusLabel(status, "en")).toBe(en.finance.payments.status[status]);
      expect(getPaymentStatusLabel(status, "ar")).toBe((ar.finance?.payments?.status as Record<string, string>)[status]);
    }
    for (const status of COMMERCE_LABEL_SETS.payoutStatus.values) expect(getPayoutStatusLabel(status, "ar")).toBe((ar.finance?.payouts?.status as Record<string, string>)[status]);
    for (const status of COMMERCE_LABEL_SETS.proformaStatus.values) expect(getProformaStatusLabel(status, "ar")).toBe((ar.finance?.proforma?.status as Record<string, string>)[status]);
    expect(getCommerceLabel("proformaSellerType", "MEMBER_SELLER", "en")).toBe(en.marketplace.card.sellerType.MEMBER_SELLER);
  });

  it("D2: lib/commerce/labels.ts and lib/commerce/errors.ts hold no label or message text of their own", () => {
    for (const file of ["lib/commerce/labels.ts", "lib/commerce/errors.ts"]) {
      const source = stripComments(readFileSync(file, "utf8"));
      expect(source, `${file}: Arabic text`).not.toMatch(/[؀-ۿ]/);
      expect(source, `${file}: a bilingual literal`).not.toMatch(/\ben\s*:\s*["'`]|\bar\s*:\s*["'`]/);
      expect(source, `${file}: a sentence literal`).not.toMatch(/["'`][A-Z][a-z]+ [a-z]+[^"'`]*["'`]/);
    }
    expect(Object.keys(COMMERCE_LABEL_SETS).length).toBeGreaterThanOrEqual(25);
  });

  it("the T063 seller-safe view copy is preserved in both languages", () => {
    const arSeller = (ar as typeof en).finance.payments.detail.sellerView;
    for (const key of ["breadcrumb", "description", "linesHeading", "amountsPending"] as const) {
      expect(en.finance.payments.detail.sellerView[key]).toBeTruthy();
      expect(arSeller[key]).toBeTruthy();
    }
    expect(arSeller.columns.gross).toBeTruthy();
  });
});

describe("T064 — commerce error codes are exactly the contract vocabulary (D3)", () => {
  // contracts/database-rpc.md: the compute_order_quote "Raises:" list + every RPC's "Errors:" line
  const contract = readFileSync("specs/013-bank-transfer-commerce-core/contracts/database-rpc.md", "utf8").replace(/\r/g, "");
  const raisesBlock = contract.slice(contract.indexOf("Raises:"), contract.indexOf("###", contract.indexOf("Raises:")));
  const errorLines = contract.split("\n").filter((line) => /^Errors:/.test(line));
  const CONTRACT_CODES = [...new Set([...raisesBlock, ...errorLines.join("\n")].join("").match(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)!.map((c) => c.replace(/`/g, "")))];

  it("the contract was read (Raises + 3 Errors lines) and yields 30 codes", () => {
    expect(errorLines).toHaveLength(3);
    expect(CONTRACT_CODES).toHaveLength(30);
  });

  it("COMMERCE_ERROR_CODES equals the contract codes — no alias, no invented code, none missing", () => {
    expect(new Set(COMMERCE_ERROR_CODES).size).toBe(COMMERCE_ERROR_CODES.length);
    expect(sorted(COMMERCE_ERROR_CODES)).toEqual(sorted(CONTRACT_CODES));
    for (const alias of ["bank_transfer_checkout_disabled", "inventory_reservation_expired", "unauthorized_seller", "cart_locked"]) {
      expect(COMMERCE_ERROR_CODES as readonly string[]).not.toContain(alias);
    }
  });

  it("the canonical copy has an EN and AR message for every contract code (plus generic), and no message leaks a code", () => {
    const arErrors = (ar.commerce?.errors ?? {}) as Record<string, string>;
    expect(sorted(Object.keys(en.commerce.errors))).toEqual(sorted([...COMMERCE_ERROR_CODES, "generic"]));
    expect(sorted(Object.keys(arErrors))).toEqual(sorted([...COMMERCE_ERROR_CODES, "generic"]));
    for (const key of [...COMMERCE_ERROR_CODES, "generic"] as const) {
      const english = (en.commerce.errors as Record<string, string>)[key]!;
      expect(english.trim(), key).toBeTruthy();
      expect(arErrors[key]?.trim(), `${key} (ar)`).toBeTruthy();
      expect(english).not.toMatch(/[a-z]+_[a-z_]+/);
      expect(arErrors[key]).not.toMatch(/[a-z]+_[a-z_]+/);
    }
  });

  it("maps contract codes (string or PostgreSQL error object) to the canonical EN/AR messages", () => {
    const disabled = mapCommerceError("checkout_disabled", "en");
    expect(disabled).toEqual({ code: "checkout_disabled", message: en.commerce.errors.checkout_disabled, safe: true });
    expect(mapCommerceError("checkout_disabled", "ar").message).toBe((ar.commerce?.errors as Record<string, string>).checkout_disabled);
    const expired = mapCommerceError({ message: "reservation_expired", details: "reservation 1b2c… expired at 10:20", code: "P0001" }, "en");
    expect(expired.code).toBe("reservation_expired");
    expect(expired.message).toBe(en.commerce.errors.reservation_expired);
    expect(expired.message).not.toContain("1b2c");
  });

  it("invented aliases and unknown errors map to the safe generic message without leaking raw SQL", () => {
    for (const raw of ["bank_transfer_checkout_disabled", "inventory_reservation_expired", "ERROR: 42P01: relation \"internal_secrets\" does not exist", null, 42]) {
      const mapped = mapCommerceError(raw, "en");
      expect(mapped.code, String(raw)).toBe("commerce_error");
      expect(mapped.message).toBe(en.commerce.errors.generic);
      expect(mapped.message).not.toMatch(/42P01|internal_secrets|checkout_disabled/);
    }
    expect(mapCommerceError("unknown", "ar").message).toBe((ar.commerce?.errors as Record<string, string>).generic);
  });
});
