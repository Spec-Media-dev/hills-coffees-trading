"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestIdentity } from "@/lib/auth/dal";
import { addCartLine, readCartSummary, removeCartLine as removeLine, updateCartLine as updateLine, type CartResult, type CartSummary } from "@/lib/commerce/cart";
import {
  checkoutSelectedLine, estimateSelectedLine, recoverSelectedLine, type LineEstimateResult, type SelectedCheckoutData, type SelectedCheckoutErrorCode,
} from "@/lib/commerce/checkout";

const uuid = z.string().uuid();
const quantity = z.coerce.number().finite().positive();
const AddInput = z.object({ offerId: uuid, quantityKg: quantity });
const EditInput = z.object({ orderId: uuid, lineId: uuid, quantityKg: quantity });
const RemoveInput = z.object({ orderId: uuid, lineId: uuid });

async function buyerOrganizationId(): Promise<string | null> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated" || !identity.isAuthorizedMember || identity.requiresMfaStepUp || !identity.organization?.canBuy) return null;
  return identity.organization.organizationId;
}

export async function addToCart(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = AddInput.safeParse({ offerId: formData.get("offerId"), quantityKg: formData.get("quantityKg") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await addCartLine(organizationId, input.data.offerId, input.data.quantityKg, crypto.randomUUID());
  if (!result.ok) return result;
  revalidatePath("/dashboard/cart");
  return { ok: true, data: undefined };
}

export async function updateCartLine(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = EditInput.safeParse({ orderId: formData.get("orderId"), lineId: formData.get("lineId"), quantityKg: formData.get("quantityKg") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await updateLine(organizationId, input.data.orderId, input.data.lineId, input.data.quantityKg);
  if (result.ok) revalidatePath("/dashboard/cart");
  return result;
}

export async function removeCartLine(_previous: CartResult | undefined, formData: FormData): Promise<CartResult> {
  const input = RemoveInput.safeParse({ orderId: formData.get("orderId"), lineId: formData.get("lineId") });
  if (!input.success) return { ok: false, code: "validation_error" };
  const organizationId = await buyerOrganizationId();
  if (!organizationId) return { ok: false, code: "buyer_not_authorized" };
  const result = await removeLine(organizationId, input.data.orderId, input.data.lineId);
  if (result.ok) revalidatePath("/dashboard/cart");
  return result;
}

// ---------------------------------------------------------------------------
// Feature 018 — selected-line checkout. One cart line is purchased as one dedicated transaction; there is no
// "checkout all". The server never trusts a client-supplied organization: authority is re-derived here and again by the
// database, and the line is bound by its exact offer and quantity so a changed cart can never buy a different amount.
// ---------------------------------------------------------------------------

const SelectedLineFields = z.object({ cartId: uuid, lineId: uuid, offerId: uuid, quantityKg: quantity, destinationId: uuid });
const CheckoutLineFields = SelectedLineFields.extend({ requestId: uuid });

type BuyerGuard = { ok: true; organizationId: string } | { ok: false; code: SelectedCheckoutErrorCode };

async function guardedBuyer(): Promise<BuyerGuard> {
  const identity = await getRequestIdentity();
  if (identity.kind !== "authenticated") return { ok: false, code: "AUTH_REQUIRED" };
  if (identity.requiresMfaStepUp) return { ok: false, code: "MFA_REQUIRED" };
  if (!identity.organization) return { ok: false, code: "ORG_REQUIRED" };
  if (!identity.isAuthorizedMember || !identity.organization.canBuy) return { ok: false, code: "BUYING_DENIED" };
  return { ok: true, organizationId: identity.organization.organizationId };
}

function rawLine(formData: FormData) {
  return {
    cartId: formData.get("cartId"), lineId: formData.get("lineId"), offerId: formData.get("offerId"),
    quantityKg: formData.get("quantityKg"), destinationId: formData.get("destinationId"),
  };
}
const selectedFields = (formData: FormData) => SelectedLineFields.safeParse(rawLine(formData));
const checkoutFields = (formData: FormData) => CheckoutLineFields.safeParse({ ...rawLine(formData), requestId: formData.get("requestId") });

function invalidate(): boolean {
  try {
    revalidatePath("/dashboard/cart");
    revalidatePath("/dashboard/orders");
    return true;
  } catch {
    return false;
  }
}

/** `requestId` is echoed on every non-success so the client keeps ONE intent: retry or recover with the same key. */
export type CheckoutCartLineResult =
  | { ok: true; committed: SelectedCheckoutData; summary: CartSummary; cacheInvalidated: boolean }
  | { ok: false; status: "FAILED" | "UNKNOWN"; code: SelectedCheckoutErrorCode; requestId: string | null };

/**
 * Purchases exactly the selected line. A committed result is final: a failed summary refresh or cache invalidation is
 * reported next to it and never turns it into a failure, and navigation is the caller's decision.
 */
export async function checkoutCartLine(_previous: CheckoutCartLineResult | undefined, formData: FormData): Promise<CheckoutCartLineResult> {
  const requestId = typeof formData.get("requestId") === "string" ? (formData.get("requestId") as string) : null;
  const input = checkoutFields(formData);
  if (!input.success) return { ok: false, status: "FAILED", code: "WRONG_SCOPE", requestId };
  const guard = await guardedBuyer();
  if (!guard.ok) return { ok: false, status: "FAILED", code: guard.code, requestId };

  const outcome = await checkoutSelectedLine({
    organizationId: guard.organizationId, cartId: input.data.cartId, itemId: input.data.lineId, offerId: input.data.offerId,
    quantityKg: input.data.quantityKg, destinationId: input.data.destinationId, requestId: input.data.requestId,
  });
  if (outcome.status !== "COMMITTED") return { ok: false, status: outcome.status, code: outcome.code, requestId: input.data.requestId };
  const cacheInvalidated = invalidate();
  return { ok: true, committed: outcome.data, summary: await readCartSummary(guard.organizationId), cacheInvalidated };
}

export type RecoverCartLineResult =
  | { ok: true; status: "COMMITTED"; committed: SelectedCheckoutData; summary: CartSummary; cacheInvalidated: boolean }
  | { ok: true; status: "NOT_COMMITTED"; sourceLinePresent: boolean }
  | { ok: false; status: "FAILED" | "UNKNOWN"; code: SelectedCheckoutErrorCode; requestId: string | null };

/** Resolves an unknown outcome from the immutable receipt; it can only report an existing purchase, never create one. */
export async function recoverCartLineCheckout(_previous: RecoverCartLineResult | undefined, formData: FormData): Promise<RecoverCartLineResult> {
  const requestId = typeof formData.get("requestId") === "string" ? (formData.get("requestId") as string) : null;
  const input = checkoutFields(formData);
  if (!input.success) return { ok: false, status: "FAILED", code: "WRONG_SCOPE", requestId };
  const guard = await guardedBuyer();
  if (!guard.ok) return { ok: false, status: "FAILED", code: guard.code, requestId };

  const outcome = await recoverSelectedLine({
    organizationId: guard.organizationId, cartId: input.data.cartId, itemId: input.data.lineId, offerId: input.data.offerId,
    quantityKg: input.data.quantityKg, destinationId: input.data.destinationId, requestId: input.data.requestId,
  });
  if (outcome.status === "NOT_COMMITTED") return { ok: true, status: "NOT_COMMITTED", sourceLinePresent: outcome.sourceLinePresent };
  if (outcome.status !== "COMMITTED") return { ok: false, status: outcome.status, code: outcome.code, requestId: input.data.requestId };
  const cacheInvalidated = invalidate();
  return { ok: true, status: "COMMITTED", committed: outcome.data, summary: await readCartSummary(guard.organizationId), cacheInvalidated };
}

/** Selected-line quote for the review step. Read-only; not a price lock and not a reservation. */
export async function estimateCartLine(_previous: LineEstimateResult | undefined, formData: FormData): Promise<LineEstimateResult> {
  const input = selectedFields(formData);
  if (!input.success) return { ok: false, code: "WRONG_SCOPE" };
  const guard = await guardedBuyer();
  if (!guard.ok) return { ok: false, code: guard.code };
  return estimateSelectedLine({
    organizationId: guard.organizationId, cartId: input.data.cartId, itemId: input.data.lineId, offerId: input.data.offerId,
    quantityKg: input.data.quantityKg, destinationId: input.data.destinationId,
  });
}
