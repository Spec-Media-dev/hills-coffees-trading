/**
 * Feature 013 Bank Transfer Commerce Core (T064) — commerce error mapping.
 *
 * The codes are EXACTLY the stable snake_case codes the Feature 013 commerce RPCs raise, as documented in
 * `specs/013-bank-transfer-commerce-core/contracts/database-rpc.md` (the `compute_order_quote` "Raises" list and each
 * RPC's "Errors" list) — no alias, no invented code. `tests/commerce/labels-parity.test.ts` re-reads that contract and
 * fails on any difference.
 *
 * Messages come ONLY from the canonical copy (`commerce.errors` in `lib/app/copy/en.ts` / `ar.ts`); this module holds no
 * message text. A code is recognized only as a whole token (so `bank_transfer_checkout_disabled` is NOT
 * `checkout_disabled`), and anything unrecognized maps to the safe generic message. Raw PostgreSQL text, constraint or
 * function names never reach the caller (SEC-004).
 */

import { ar } from "@/lib/app/copy/ar";
import { en } from "@/lib/app/copy/en";

import type { SupportedLocale } from "./labels";

export const COMMERCE_ERROR_CODES = [
  // compute_order_quote — "Raises" (also surfaced by issue_proforma as "the quote errors")
  "order_has_no_items",
  "listing_is_not_available",
  "destination_required",
  "destination_tax_unsupported",
  "tax_rule_missing",
  "shipping_rule_missing",
  "commission_rule_missing",
  "negative_economics",
  "bank_account_missing",
  "currency_not_supported",
  "promotion_not_supported",
  // issue_proforma
  "checkout_disabled",
  "order_not_found",
  "order_not_editable",
  "proforma_still_valid",
  "destination_not_found",
  "legacy_shipment_plan_present",
  // confirm_proforma
  "proforma_not_found",
  "proforma_expired",
  "proforma_not_confirmable",
  "listing_inventory_changed",
  "seller_inventory_changed",
  "seller_not_authorized",
  // submit_payment_proof (order_not_found is shared with issue_proforma)
  "order_not_payable",
  "reservation_expired",
  "cross_organization_object_path",
  "storage_object_not_found",
  "invalid_mime_type",
  "object_too_large",
  "mime_type_mismatch",
  "proof_already_submitted",
  "invalid_claimed_currency",
  // M4a cart and destination functions (listing_is_not_available and destination_not_found are shared above)
  "buyer_not_authorized",
  "mfa_step_up_required",
  "request_id_required",
  "request_id_conflict",
  "cannot_buy_own_listing",
  "requested_quantity_not_available",
  "inventory_quantity_not_available",
  "destination_invalid",
  // M4a admin functions (mfa_step_up_required, request_id_*, order_not_found are shared above)
  "forbidden",
  "invalid_validity_hours",
  "payment_account_not_found",
  "legacy_draft_not_convertible",
] as const;

export type CommerceErrorCode = (typeof COMMERCE_ERROR_CODES)[number];

/**
 * Canonical copy never repeats legacy order-database exception vocabulary. Keep Feature 013 contract codes at the
 * boundary and map the exact overlapping codes to neutral copy keys only after sanitization.
 */
const COMMERCE_ERROR_MESSAGE_KEYS = {
  order_has_no_items: "empty_order",
  listing_is_not_available: "listing_unavailable",
  order_not_found: "order_unavailable",
  listing_inventory_changed: "listing_availability_changed",
  seller_inventory_changed: "seller_availability_changed",
  seller_not_authorized: "seller_unavailable",
  reservation_expired: "hold_expired",
  buyer_not_authorized: "purchase_not_permitted",
  cannot_buy_own_listing: "own_listing_purchase_blocked",
  requested_quantity_not_available: "quantity_unavailable",
  inventory_quantity_not_available: "stock_unavailable",
  forbidden: "access_denied",
} as const satisfies Partial<Record<CommerceErrorCode, keyof typeof en.commerce.errors>>;
export type CommerceErrorMessageKey = Exclude<CommerceErrorCode, keyof typeof COMMERCE_ERROR_MESSAGE_KEYS> | (typeof COMMERCE_ERROR_MESSAGE_KEYS)[keyof typeof COMMERCE_ERROR_MESSAGE_KEYS];

/** Compile-time proof that the canonical English copy has a message for every sanitized contract code. */
const ENGLISH_MESSAGES: Readonly<Record<CommerceErrorMessageKey | "generic", string>> = en.commerce.errors;

/** Exported for Server Components that render a commerce error bilingually via `AppBilingual` (never through `mapCommerceError`'s single-locale string, which assumes a known request locale a Server Component does not have). */
export function commerceErrorMessageKey(code: CommerceErrorCode | "commerce_error" | null): CommerceErrorMessageKey | "generic" {
  if (code === null || code === "commerce_error") return "generic";
  return COMMERCE_ERROR_MESSAGE_KEYS[code as keyof typeof COMMERCE_ERROR_MESSAGE_KEYS] ?? code;
}

/** A contract code only when it appears as a whole snake_case token (never as part of a longer identifier). */
function extractErrorCode(raw: unknown): CommerceErrorCode | null {
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (raw && typeof raw === "object") {
    const error = raw as Record<string, unknown>;
    text = ["message", "details", "hint", "code"].map((key) => (typeof error[key] === "string" ? (error[key] as string) : "")).join(" ");
  }
  if (!text) return null;
  return COMMERCE_ERROR_CODES.find((code) => new RegExp(`(^|[^a-z0-9_])${code}([^a-z0-9_]|$)`).test(text)) ?? null;
}

export type SafeCommerceError = {
  readonly code: CommerceErrorCode | "commerce_error";
  readonly message: string;
  readonly safe: true;
};

/**
 * Maps any raw database/RPC error to a sanitized, localized error from the canonical copy. Unknown input — including
 * an invented alias of a real code — yields `commerce_error` with the generic message.
 */
export function mapCommerceError(rawError: unknown, locale: SupportedLocale = "en"): SafeCommerceError {
  const code = extractErrorCode(rawError);
  const key = commerceErrorMessageKey(code);
  const englishMessage = ENGLISH_MESSAGES[key];
  const arabicMessages = ar.commerce?.errors as Partial<Record<CommerceErrorMessageKey | "generic", string>> | undefined;
  const message = locale === "ar" ? arabicMessages?.[key] ?? englishMessage : englishMessage;
  return { code: code ?? "commerce_error", message, safe: true };
}
