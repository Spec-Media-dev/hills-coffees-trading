import { createClient } from "@/lib/supabase/server";

import { mapCommerceError, type CommerceErrorCode } from "./errors";

export interface CheckoutResultData {
  orderId: string;
  orderCode: string;
  proformaId: string;
  proformaCode: string;
  paymentId: string;
  reservationId: string;
  expiresAt: string;
  buyerTotal: number;
  currency: string;
}

export type CheckoutResult =
  | { ok: true; data: CheckoutResultData }
  | { ok: false; code: CommerceErrorCode | "commerce_error" };

/**
 * Feature 015 T036 — DAL checkout caller with stable request-ID propagation.
 * Single entry point for invoking checkout_bank_transfer_v1.
 *
 * Feature 018: a fresh cart is refused here by the database (`checkout_requires_selected_line`); only a committed
 * historical order replays through this entry point. New purchases go through `checkoutSelectedLine`.
 */
export async function checkoutBankTransferOrder(
  orderId: string,
  destinationId: string,
  requestId: string
): Promise<CheckoutResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("checkout_bank_transfer_v1", {
    p_order_id: orderId,
    p_destination_id: destinationId,
    p_request_id: requestId,
  });

  if (error) {
    return { ok: false, code: mapCommerceError(error).code };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, code: "commerce_error" };
  }

  const raw = data as Record<string, unknown>;
  if (
    typeof raw.order_id !== "string" ||
    typeof raw.proforma_id !== "string" ||
    typeof raw.reservation_id !== "string" ||
    typeof raw.expires_at !== "string"
  ) {
    return { ok: false, code: "commerce_error" };
  }

  return {
    ok: true,
    data: {
      orderId: raw.order_id,
      orderCode: String(raw.order_code ?? ""),
      proformaId: raw.proforma_id,
      proformaCode: String(raw.proforma_code ?? ""),
      paymentId: String(raw.payment_id ?? ""),
      reservationId: raw.reservation_id,
      expiresAt: raw.expires_at,
      buyerTotal: Number(raw.buyer_total ?? 0),
      currency: String(raw.currency ?? "USD"),
    },
  };
}

// ---------------------------------------------------------------------------
// Feature 018 - selected-line checkout (one cart line -> one dedicated, checked-out child transaction)
// ---------------------------------------------------------------------------

/** Safe, classified outcomes (contracts/checkout.md). Never raw database text. */
export const SELECTED_CHECKOUT_ERROR_CODES = [
  "AUTH_REQUIRED", "MFA_REQUIRED", "ORG_REQUIRED", "BUYING_DENIED", "WRONG_SCOPE", "STALE_CART", "STALE_LINE",
  "PAYLOAD_CONFLICT", "ALREADY_CONSUMED", "OFFER_UNAVAILABLE", "INVALID_DESTINATION", "CONFIGURATION_UNAVAILABLE",
  "INTEGRITY_FAILURE", "OUTCOME_UNKNOWN", "READ_UNAVAILABLE",
] as const;
export type SelectedCheckoutErrorCode = (typeof SELECTED_CHECKOUT_ERROR_CODES)[number];

const TOKEN_CLASSES: ReadonlyArray<readonly [SelectedCheckoutErrorCode, readonly string[]]> = [
  ["MFA_REQUIRED", ["mfa_step_up_required"]],
  ["BUYING_DENIED", ["buyer_not_authorized", "forbidden"]],
  ["STALE_CART", ["cart_not_canonical"]],
  ["STALE_LINE", ["cart_line_not_found", "cart_line_changed", "order_item_not_found"]],
  ["PAYLOAD_CONFLICT", ["request_payload_conflict", "request_id_conflict"]],
  ["ALREADY_CONSUMED", ["cart_line_already_consumed"]],
  ["OFFER_UNAVAILABLE", ["listing_is_not_available", "requested_quantity_not_available", "inventory_quantity_not_available", "listing_inventory_changed", "seller_inventory_changed", "seller_not_authorized", "cannot_buy_own_listing"]],
  ["INVALID_DESTINATION", ["destination_required", "destination_not_found", "destination_invalid", "destination_tax_unsupported"]],
  ["CONFIGURATION_UNAVAILABLE", ["checkout_disabled", "bank_account_missing", "tax_rule_missing", "shipping_rule_missing", "commission_rule_missing", "currency_not_supported", "negative_economics", "promotion_not_supported"]],
  ["INTEGRITY_FAILURE", ["persisted_receipt_integrity_error", "selected_checkout_integrity_failure", "finalized_state_integrity_error", "checkout_requires_selected_line", "checkout_locks_not_staged"]],
  ["WRONG_SCOPE", ["invalid_checkout_input", "order_not_found", "order_not_editable", "order_has_no_items"]],
];

function rawText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    return ["message", "details", "hint"].map((key) => (typeof record[key] === "string" ? (record[key] as string) : "")).join(" ");
  }
  return "";
}

const SQLSTATE = /^[0-9A-Z]{5}$/;

/** A PostgreSQL error (SQLSTATE present) means the transaction rolled back; anything else is a transport failure. */
export function isDefiniteDatabaseFailure(raw: unknown): boolean {
  const code = raw && typeof raw === "object" ? (raw as { code?: unknown }).code : undefined;
  return typeof code === "string" && SQLSTATE.test(code);
}

/** Maps a database/RPC error to a classified code. `phase` decides what an unrecognized transport failure means. */
export function classifySelectedCheckoutError(raw: unknown, phase: "mutation" | "read" = "mutation"): SelectedCheckoutErrorCode {
  const text = rawText(raw);
  for (const [code, tokens] of TOKEN_CLASSES) {
    if (tokens.some((token) => new RegExp(`(^|[^a-z0-9_])${token}([^a-z0-9_]|$)`).test(text))) return code;
  }
  if (phase === "read") return "READ_UNAVAILABLE";
  // An unrecognized database error rolled the transaction back (definite); a missing SQLSTATE means we cannot know.
  return isDefiniteDatabaseFailure(raw) ? "INTEGRITY_FAILURE" : "OUTCOME_UNKNOWN";
}

export interface SelectedLineInput {
  organizationId: string;
  cartId: string;
  itemId: string;
  offerId: string;
  quantityKg: number;
  destinationId: string;
}
export interface SelectedCheckoutInput extends SelectedLineInput { requestId: string }

export interface SelectedCheckoutData {
  receiptId: string;
  orderId: string;
  orderCode: string;
  proformaId: string;
  proformaCode: string;
  paymentId: string;
  reservationId: string;
  expiresAt: string;
  buyerTotal: number;
  currency: string;
  sourceCartId: string;
  sourceItemId: string;
  committedAt: string;
  replayed: boolean;
}

/** `UNKNOWN` keeps the same root request so recovery can resolve it; it is never a reason to start another purchase. */
export type SelectedCheckoutOutcome =
  | { status: "COMMITTED"; data: SelectedCheckoutData }
  | { status: "FAILED"; code: SelectedCheckoutErrorCode }
  | { status: "UNKNOWN"; code: "OUTCOME_UNKNOWN" };

export type SelectedRecoveryOutcome =
  | { status: "COMMITTED"; data: SelectedCheckoutData }
  | { status: "NOT_COMMITTED"; sourceLinePresent: boolean }
  | { status: "FAILED"; code: SelectedCheckoutErrorCode }
  | { status: "UNKNOWN"; code: "OUTCOME_UNKNOWN" };

export interface LineEstimateData {
  isEstimate: true;
  reason: string | null;
  cartId: string;
  itemId: string;
  currency: string;
  merchandiseGross: number | null;
  merchandiseNet: number | null;
  shippingTotal: number | null;
  vatTotal: number | null;
  buyerTotal: number | null;
  groups: number;
  line: { offerCode: string; productName: string; quantityKg: number; unitPrice: number; net: number; vat: number | null } | null;
}
export type LineEstimateResult = { ok: true; data: LineEstimateData } | { ok: false; code: SelectedCheckoutErrorCode };

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null);

export function parseSelectedCheckoutData(raw: unknown): SelectedCheckoutData | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.receipt_id !== "string" || typeof value.child_order_id !== "string" || typeof value.proforma_id !== "string"
      || typeof value.reservation_id !== "string" || typeof value.expires_at !== "string"
      || typeof value.source_cart_id !== "string" || typeof value.source_item_id !== "string") return null;
  return {
    receiptId: value.receipt_id,
    orderId: value.child_order_id,
    orderCode: String(value.order_code ?? ""),
    proformaId: value.proforma_id,
    proformaCode: String(value.proforma_code ?? ""),
    paymentId: String(value.payment_id ?? ""),
    reservationId: value.reservation_id,
    expiresAt: value.expires_at,
    buyerTotal: Number(value.buyer_total ?? 0),
    currency: String(value.currency ?? "USD"),
    sourceCartId: value.source_cart_id,
    sourceItemId: value.source_item_id,
    committedAt: String(value.committed_at ?? ""),
    replayed: value.replayed === true,
  };
}

function rpcArguments(input: SelectedLineInput) {
  return {
    p_org_id: input.organizationId, p_cart_id: input.cartId, p_item_id: input.itemId, p_offer_id: input.offerId,
    p_quantity_kg: input.quantityKg, p_destination_id: input.destinationId,
  };
}

/** The only purchase-creating call. Same `requestId` + same line is an exact replay; changed fields conflict. */
export async function checkoutSelectedLine(input: SelectedCheckoutInput): Promise<SelectedCheckoutOutcome> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("checkout_cart_line_bank_transfer_v1", { ...rpcArguments(input), p_request_id: input.requestId });
    if (error) {
      const code = classifySelectedCheckoutError(error, "mutation");
      return code === "OUTCOME_UNKNOWN" ? { status: "UNKNOWN", code } : { status: "FAILED", code };
    }
    const parsed = parseSelectedCheckoutData(data);
    // A 2xx with an unreadable body: the transaction may have committed. Never report failure; recover by receipt.
    return parsed ? { status: "COMMITTED", data: parsed } : { status: "UNKNOWN", code: "OUTCOME_UNKNOWN" };
  } catch {
    return { status: "UNKNOWN", code: "OUTCOME_UNKNOWN" };
  }
}

/** Resolves an unknown outcome from the immutable receipt with fresh server-side authority. Never creates a purchase. */
export async function recoverSelectedLine(input: SelectedCheckoutInput): Promise<SelectedRecoveryOutcome> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("recover_cart_line_checkout", { p_request_id: input.requestId, ...rpcArguments(input) });
    if (error) {
      const code = classifySelectedCheckoutError(error, "mutation");
      return code === "OUTCOME_UNKNOWN" ? { status: "UNKNOWN", code } : { status: "FAILED", code };
    }
    const raw = (data ?? {}) as Record<string, unknown>;
    if (raw.status === "NOT_COMMITTED") return { status: "NOT_COMMITTED", sourceLinePresent: raw.source_line_present === true };
    const parsed = raw.status === "COMMITTED" ? parseSelectedCheckoutData(raw) : null;
    return parsed ? { status: "COMMITTED", data: parsed } : { status: "UNKNOWN", code: "OUTCOME_UNKNOWN" };
  } catch {
    return { status: "UNKNOWN", code: "OUTCOME_UNKNOWN" };
  }
}

/** Read-only selected-line quote: no reservation, no temporary order, not a price lock. */
export async function estimateSelectedLine(input: SelectedLineInput): Promise<LineEstimateResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("estimate_cart_line_bank_transfer_v1", rpcArguments(input));
    if (error) return { ok: false, code: classifySelectedCheckoutError(error, "read") };
    if (!data || typeof data !== "object") return { ok: false, code: "READ_UNAVAILABLE" };
    const raw = data as Record<string, unknown>;
    const lines = Array.isArray(raw.lines) ? (raw.lines as Array<Record<string, unknown>>) : [];
    const first = lines[0];
    return {
      ok: true,
      data: {
        isEstimate: true,
        reason: typeof raw.reason === "string" ? raw.reason : null,
        cartId: String(raw.cart_id ?? input.cartId),
        itemId: String(raw.item_id ?? input.itemId),
        currency: String(raw.currency ?? "USD"),
        merchandiseGross: numberOrNull(raw.merchandise_gross),
        merchandiseNet: numberOrNull(raw.merchandise_net),
        shippingTotal: numberOrNull(raw.shipping_total),
        vatTotal: numberOrNull(raw.vat_total),
        buyerTotal: numberOrNull(raw.buyer_total),
        groups: Array.isArray(raw.groups) ? raw.groups.length : 0,
        line: first ? {
          offerCode: String(first.offer_code ?? ""), productName: String(first.product_name ?? ""),
          quantityKg: Number(first.quantity_kg ?? 0), unitPrice: Number(first.unit_price ?? 0),
          net: Number(first.net ?? 0), vat: numberOrNull(first.vat),
        } : null,
      },
    };
  } catch {
    return { ok: false, code: "READ_UNAVAILABLE" };
  }
}
